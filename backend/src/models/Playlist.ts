import Database from '../config/database';

export interface Playlist {
  id: number;
  name: string;
  description?: string;
  user_id: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaylistWithDetails extends Playlist {
  username: string;
  song_count: number;
  total_duration: number;
}

export interface PlaylistSong {
  id: number;
  playlist_id: number;
  song_id: number;
  position: number;
  added_at: string;
  title: string;
  artist_name: string;
  album_title?: string;
  duration?: number;
  artwork_path?: string;
}

export interface CreatePlaylistData {
  name: string;
  description?: string;
  user_id: number;
  is_public?: boolean;
}

export class PlaylistModel {
  private db = Database;

  async create(playlistData: CreatePlaylistData): Promise<Playlist> {
    const result = await this.db.run(
      'INSERT INTO playlists (name, description, user_id, is_public) VALUES (?, ?, ?, ?)',
      [playlistData.name, playlistData.description || null, playlistData.user_id, playlistData.is_public || false]
    );

    const playlist = await this.findById(result.lastID!);
    if (!playlist) {
      throw new Error('Failed to create playlist');
    }

    return playlist;
  }

  async findById(id: number): Promise<Playlist | null> {
    return await this.db.get<Playlist>(
      'SELECT * FROM playlists WHERE id = ?',
      [id]
    );
  }

  async findWithDetails(id: number): Promise<PlaylistWithDetails | null> {
    return await this.db.get<PlaylistWithDetails>(
      `SELECT 
        p.*,
        u.username,
        COUNT(ps.song_id) as song_count,
        COALESCE(SUM(s.duration), 0) as total_duration
       FROM playlists p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       LEFT JOIN songs s ON ps.song_id = s.id
       WHERE p.id = ?
       GROUP BY p.id`,
      [id]
    );
  }

  async getUserPlaylists(userId: number): Promise<PlaylistWithDetails[]> {
    return await this.db.query<PlaylistWithDetails>(
      `SELECT
        p.*,
        u.username,
        COUNT(ps.song_id) as song_count,
        COALESCE(SUM(s.duration), 0) as total_duration
       FROM playlists p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       LEFT JOIN songs s ON ps.song_id = s.id
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [userId]
    );
  }

  // Alias for OpenSubsonic API compatibility
  async getByUser(userId: number): Promise<PlaylistWithDetails[]> {
    return this.getUserPlaylists(userId);
  }

  async getPublicPlaylists(): Promise<PlaylistWithDetails[]> {
    return await this.db.query<PlaylistWithDetails>(
      `SELECT
        p.*,
        u.username,
        COUNT(ps.song_id) as song_count,
        COALESCE(SUM(s.duration), 0) as total_duration
       FROM playlists p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       LEFT JOIN songs s ON ps.song_id = s.id
       WHERE p.is_public = 1
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    );
  }

  async getUserPublicPlaylists(userId: number): Promise<PlaylistWithDetails[]> {
    return await this.db.query<PlaylistWithDetails>(
      `SELECT
        p.*,
        u.username,
        COUNT(ps.song_id) as song_count,
        COALESCE(SUM(s.duration), 0) as total_duration
       FROM playlists p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       LEFT JOIN songs s ON ps.song_id = s.id
       WHERE p.user_id = ? AND p.is_public = 1
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [userId]
    );
  }

  async getAllPlaylists(): Promise<PlaylistWithDetails[]> {
    return await this.db.query<PlaylistWithDetails>(
      `SELECT 
        p.*,
        u.username,
        COUNT(ps.song_id) as song_count,
        COALESCE(SUM(s.duration), 0) as total_duration
       FROM playlists p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       LEFT JOIN songs s ON ps.song_id = s.id
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    );
  }

  async update(id: number, updates: Partial<CreatePlaylistData>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await this.db.run(
      `UPDATE playlists SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.run('DELETE FROM playlists WHERE id = ?', [id]);
  }

  async addSong(playlistId: number, songId: number): Promise<void> {
    // Get the file_hash for this song
    const song = await this.db.get<{ file_hash?: string }>(
      'SELECT file_hash FROM songs WHERE id = ?',
      [songId]
    );

    const maxPosition = await this.db.get<{ max_pos: number }>(
      'SELECT MAX(position) as max_pos FROM playlist_songs WHERE playlist_id = ?',
      [playlistId]
    );

    const position = (maxPosition?.max_pos || 0) + 1;

    await this.db.run(
      'INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, file_hash, position) VALUES (?, ?, ?, ?)',
      [playlistId, songId, song?.file_hash || null, position]
    );

    await this.db.run(
      'UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [playlistId]
    );
  }

  async removeSong(playlistId: number, songId: number): Promise<void> {
    await this.db.run(
      'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
      [playlistId, songId]
    );

    await this.reorderSongs(playlistId);

    await this.db.run(
      'UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [playlistId]
    );
  }

  async reorderSongs(playlistId: number, songIds?: number[]): Promise<void> {
    if (songIds) {
      for (let i = 0; i < songIds.length; i++) {
        await this.db.run(
          'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?',
          [i + 1, playlistId, songIds[i]]
        );
      }
    } else {
      const songs = await this.db.query<{ song_id: number }>(
        'SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position',
        [playlistId]
      );

      for (let i = 0; i < songs.length; i++) {
        await this.db.run(
          'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?',
          [i + 1, playlistId, songs[i].song_id]
        );
      }
    }

    await this.db.run(
      'UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [playlistId]
    );
  }

  async getPlaylistSongs(playlistId: number): Promise<PlaylistSong[]> {
    return await this.db.query<PlaylistSong>(
      `SELECT
        ps.*,
        s.title,
        GROUP_CONCAT(a.name, ', ') as artist_name,
        al.title as album_title,
        s.duration,
        al.artwork_path
       FROM playlist_songs ps
       JOIN songs s ON ps.song_id = s.id
       JOIN song_artists sa ON s.id = sa.song_id
       JOIN artists a ON sa.artist_id = a.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE ps.playlist_id = ?
       GROUP BY ps.id, s.title, al.title, s.duration, al.artwork_path
       ORDER BY ps.position`,
      [playlistId]
    );
  }

  async searchPlaylists(query: string, userId?: number): Promise<PlaylistWithDetails[]> {
    // Improved fuzzy search with word splitting
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);

    if (terms.length === 0) return [];

    const nameConditions = terms.map(() => 'p.name LIKE ?').join(' AND ');
    const descConditions = terms.map(() => 'p.description LIKE ?').join(' AND ');
    const params = terms.flatMap(t => [`%${t}%`, `%${t}%`]);

    if (userId) {
      return await this.db.query<PlaylistWithDetails>(
        `SELECT
          p.*,
          u.username,
          COUNT(ps.song_id) as song_count,
          COALESCE(SUM(s.duration), 0) as total_duration
         FROM playlists p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
         LEFT JOIN songs s ON ps.song_id = s.id
         WHERE (${nameConditions} OR ${descConditions})
           AND (p.is_public = 1 OR p.user_id = ?)
         GROUP BY p.id
         ORDER BY
           CASE WHEN LOWER(p.name) LIKE LOWER(?) THEN 0 ELSE 1 END,
           p.updated_at DESC`,
        [...params, userId, `%${terms[0]}%`]
      );
    } else {
      return await this.db.query<PlaylistWithDetails>(
        `SELECT
          p.*,
          u.username,
          COUNT(ps.song_id) as song_count,
          COALESCE(SUM(s.duration), 0) as total_duration
         FROM playlists p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
         LEFT JOIN songs s ON ps.song_id = s.id
         WHERE (${nameConditions} OR ${descConditions}) AND p.is_public = 1
         GROUP BY p.id
         ORDER BY
           CASE WHEN LOWER(p.name) LIKE LOWER(?) THEN 0 ELSE 1 END,
           p.updated_at DESC`,
        params.concat(`%${terms[0]}%`)
      );
    }
  }

  async canUserAccessPlaylist(playlistId: number, userId?: number): Promise<boolean> {
    const playlist = await this.findById(playlistId);
    if (!playlist) return false;

    return playlist.is_public || (userId && playlist.user_id === userId);
  }

  async canUserModifyPlaylist(playlistId: number, userId: number, isAdmin: boolean = false): Promise<boolean> {
    if (isAdmin) return true;

    const playlist = await this.findById(playlistId);
    if (!playlist) return false;

    return playlist.user_id === userId;
  }

  // Update playlist songs to use new song_id based on file_hash
  // This is called when a file is moved/renamed and gets a new song_id
  async updateSongByFileHash(fileHash: string, newSongId: number): Promise<void> {
    await this.db.run(
      'UPDATE playlist_songs SET song_id = ? WHERE file_hash = ?',
      [newSongId, fileHash]
    );
  }

  // Get all playlists that reference a specific file_hash
  async getPlaylistsByFileHash(fileHash: string): Promise<Array<{ playlist_id: number; position: number }>> {
    return await this.db.query(
      'SELECT playlist_id, position FROM playlist_songs WHERE file_hash = ?',
      [fileHash]
    );
  }
}

export default new PlaylistModel();