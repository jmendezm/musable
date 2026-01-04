import Database from '../config/database';

export interface Song {
  id: number;
  title: string;
  album_id?: number;
  file_path: string;
  file_size?: number;
  duration?: number;
  track_number?: number;
  genre?: string;
  year?: number;
  bitrate?: number;
  sample_rate?: number;
  source: 'local' | 'youtube' | 'youtube-music';
  youtube_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SongWithDetails extends Song {
  artists: { id: number; name: string }[];
  artist_name?: string;
  album_title?: string;
  artwork_path?: string;
}

export interface CreateSongData {
  title: string;
  album_id?: number;
  file_path: string;
  file_size?: number;
  duration?: number;
  track_number?: number;
  genre?: string;
  year?: number;
  bitrate?: number;
  sample_rate?: number;
  source?: 'local' | 'youtube' | 'youtube-music';
  youtube_id?: string;
}

export class SongModel {
  private db = Database;

  async create(songData: CreateSongData): Promise<Song> {
    const result = await this.db.run(
      `INSERT INTO songs (
        title, album_id, file_path, file_size, duration,
        track_number, genre, year, bitrate, sample_rate, source, youtube_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        songData.title,
        songData.album_id || null,
        songData.file_path,
        songData.file_size || null,
        songData.duration || null,
        songData.track_number || null,
        songData.genre || null,
        songData.year || null,
        songData.bitrate || null,
        songData.sample_rate || null,
        songData.source || 'local',
        songData.youtube_id || null
      ]
    );

    const song = await this.findById(result.lastID!);
    if (!song) {
      throw new Error('Failed to create song');
    }

    return song;
  }

  async findById(id: number): Promise<Song | null> {
    return await this.db.get<Song>(
      'SELECT * FROM songs WHERE id = ?',
      [id]
    );
  }

  async findByPath(filePath: string): Promise<Song | null> {
    return await this.db.get<Song>(
      'SELECT * FROM songs WHERE file_path = ?',
      [filePath]
    );
  }

  async findByYoutubeId(youtubeId: string): Promise<Song | null> {
    return await this.db.get<Song>(
      'SELECT * FROM songs WHERE youtube_id = ?',
      [youtubeId]
    );
  }

  // Artist management for songs
  async addArtist(songId: number, artistId: number): Promise<void> {
    await this.db.run(
      'INSERT OR IGNORE INTO song_artists (song_id, artist_id) VALUES (?, ?)',
      [songId, artistId]
    );
  }

  async removeArtist(songId: number, artistId: number): Promise<void> {
    await this.db.run(
      'DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?',
      [songId, artistId]
    );
  }

  async setArtists(songId: number, artistIds: number[]): Promise<void> {
    // Remove all existing artists
    await this.db.run(
      'DELETE FROM song_artists WHERE song_id = ?',
      [songId]
    );

    // Add new artists
    for (const artistId of artistIds) {
      await this.addArtist(songId, artistId);
    }
  }

  async getArtists(songId: number): Promise<{ id: number; name: string }[]> {
    return await this.db.query<{ id: number; name: string }>(
      `SELECT a.id, a.name
       FROM artists a
       JOIN song_artists sa ON a.id = sa.artist_id
       WHERE sa.song_id = ?
       ORDER BY a.name`,
      [songId]
    );
  }

  async findWithDetails(id: number): Promise<SongWithDetails | null> {
    const song = await this.findById(id);
    if (!song) return null;

    const artists = await this.getArtists(id);
    const album = await this.db.get<{ title: string; artwork_path: string }>(
      'SELECT title, artwork_path FROM albums WHERE id = ?',
      [song.album_id || 0]
    );

    // Create artist_name string from artists array
    const artist_name = artists.map(a => a.name).join(', ');

    return {
      ...song,
      artists,
      artist_name,
      album_title: album?.title,
      artwork_path: album?.artwork_path
    };
  }

  async getAllWithDetails(): Promise<SongWithDetails[]> {
    const songs = await this.db.query<Song>(
      `SELECT s.*
       FROM songs s
       ORDER BY s.title`
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async searchSongs(query: string): Promise<SongWithDetails[]> {
    const searchTerm = `%${query}%`;
    const songs = await this.db.query<Song>(
      `SELECT DISTINCT s.*
       FROM songs s
       LEFT JOIN song_artists sa ON s.id = sa.song_id
       LEFT JOIN artists a ON sa.artist_id = a.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE s.title LIKE ?
          OR a.name LIKE ?
          OR al.title LIKE ?
          OR s.genre LIKE ?
       ORDER BY s.title`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  // Search method for OpenSubsonic API with limit
  async search(query: string, limit: number = 20): Promise<Song[]> {
    const searchTerm = `%${query}%`;
    return await this.db.query<Song>(
      `SELECT DISTINCT s.*
       FROM songs s
       LEFT JOIN song_artists sa ON s.id = sa.song_id
       LEFT JOIN artists a ON sa.artist_id = a.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE s.title LIKE ?
          OR a.name LIKE ?
          OR al.title LIKE ?
          OR s.genre LIKE ?
       ORDER BY s.title
       LIMIT ?`,
      [searchTerm, searchTerm, searchTerm, searchTerm, limit]
    );
  }

  async getSongsByArtist(artistId: number): Promise<SongWithDetails[]> {
    const songs = await this.db.query<Song>(
      `SELECT DISTINCT s.*
       FROM songs s
       JOIN song_artists sa ON s.id = sa.song_id
       WHERE sa.artist_id = ?
       ORDER BY s.title`,
      [artistId]
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getSongsByAlbum(albumId: number): Promise<SongWithDetails[]> {
    const songs = await this.db.query<Song>(
      `SELECT *
       FROM songs
       WHERE album_id = ?
       ORDER BY track_number, title`,
      [albumId]
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async updateSong(id: number, updates: Partial<CreateSongData>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await this.db.run(
      `UPDATE songs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async update(id: number, updates: Partial<CreateSongData>): Promise<Song> {
    await this.updateSong(id, updates);
    const song = await this.findById(id);
    if (!song) {
      throw new Error('Failed to update song');
    }
    return song;
  }

  async deleteSong(id: number): Promise<void> {
    await this.db.run('DELETE FROM songs WHERE id = ?', [id]);
  }

  async deleteAllSongs(): Promise<number> {
    const result = await this.db.run('DELETE FROM songs');
    return result.changes;
  }

  async getSongCount(): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM songs'
    );
    return result!.count;
  }

  async getTotalDuration(): Promise<number> {
    const result = await this.db.get<{ total: number }>(
      'SELECT SUM(duration) as total FROM songs WHERE duration IS NOT NULL'
    );
    return result!.total || 0;
  }

  async getGenres(): Promise<string[]> {
    const result = await this.db.query<{ genre: string }>(
      'SELECT DISTINCT genre FROM songs WHERE genre IS NOT NULL ORDER BY genre'
    );
    return result.map(r => r.genre);
  }

  // Alias for OpenSubsonic API compatibility
  async getAllGenres(): Promise<string[]> {
    return this.getGenres();
  }

  async getGenreStats(genre: string): Promise<{ songCount: number; albumCount: number }> {
    const result = await this.db.get<{ songCount: number; albumCount: number }>(
      `SELECT
        COUNT(DISTINCT s.id) as songCount,
        COUNT(DISTINCT s.album_id) as albumCount
       FROM songs s
       WHERE s.genre = ?`,
      [genre]
    );
    return result || { songCount: 0, albumCount: 0 };
  }

  async getStarred(userId: number): Promise<SongWithDetails[]> {
    const songs = await this.db.query<Song>(
      `SELECT DISTINCT s.*
       FROM songs s
       INNER JOIN favorites f ON s.id = f.song_id
       WHERE f.user_id = ?
       ORDER BY s.title`,
      [userId]
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getSongsByGenre(genre: string): Promise<SongWithDetails[]> {
    const songs = await this.db.query<Song>(
      `SELECT *
       FROM songs
       WHERE genre = ?
       ORDER BY title`,
      [genre]
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getRandomSongs(limit: number = 50): Promise<SongWithDetails[]> {
    const songs = await this.db.query<Song>(
      `SELECT *
       FROM songs
       ORDER BY RANDOM()
       LIMIT ?`,
      [limit]
    );

    const result: SongWithDetails[] = [];
    for (const song of songs) {
      const details = await this.findWithDetails(song.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }
}

export default new SongModel();
