import Database from '../config/database';
import { prepareSearchTerms, createSearchParams, isYearTerm } from '../utils/search';

export interface Album {
  id: number;
  title: string;
  release_year?: number;
  artwork_path?: string;
  created_at: string;
  updated_at: string;
}

export interface AlbumWithDetails extends Album {
  artists: { id: number; name: string }[];
  artist_name?: string;
  song_count: number;
  total_duration: number;
}

export interface CreateAlbumData {
  title: string;
  release_year?: number;
  artwork_path?: string;
}

export class AlbumModel {
  private db = Database;

  async findById(id: number): Promise<Album | null> {
    return await this.db.get<Album>(
      'SELECT * FROM albums WHERE id = ?',
      [id]
    );
  }

  async findByTitle(title: string): Promise<Album | null> {
    return await this.db.get<Album>(
      'SELECT * FROM albums WHERE title = ?',
      [title]
    );
  }

  async create(albumData: CreateAlbumData): Promise<Album> {
    const result = await this.db.run(
      'INSERT INTO albums (title, release_year, artwork_path) VALUES (?, ?, ?)',
      [albumData.title, albumData.release_year || null, albumData.artwork_path || null]
    );

    const album = await this.findById(result.lastID!);
    if (!album) {
      throw new Error('Failed to create album');
    }

    return album;
  }

  async findOrCreate(title: string, releaseYear?: number): Promise<Album> {
    // Try to insert first (atomic operation with UNIQUE constraint)
    await this.db.run(
      'INSERT OR IGNORE INTO albums (title, release_year) VALUES (?, ?)',
      [title, releaseYear || null]
    );

    // Now fetch the album (it either existed or was just created)
    const album = await this.findByTitle(title);
    if (!album) {
      throw new Error('Failed to find or create album');
    }

    return album;
  }

  // Get artists for an album (derived from songs)
  async getArtists(albumId: number): Promise<{ id: number; name: string }[]> {
    return await this.db.query<{ id: number; name: string }>(
      `SELECT DISTINCT a.id, a.name
       FROM artists a
       JOIN song_artists sa ON a.id = sa.artist_id
       JOIN songs s ON sa.song_id = s.id
       WHERE s.album_id = ?
       ORDER BY a.name`,
      [albumId]
    );
  }

  async findWithDetails(id: number): Promise<AlbumWithDetails | null> {
    const album = await this.findById(id);
    if (!album) return null;

    const artists = await this.getArtists(id);
    const songStats = await this.db.get<{ song_count: number; total_duration: number }>(
      `SELECT
        COUNT(s.id) as song_count,
        COALESCE(SUM(s.duration), 0) as total_duration
       FROM songs s
       WHERE s.album_id = ?`,
      [id]
    );

    // Create artist_name string from artists array
    const artist_name = artists.map(a => a.name).join(', ');

    return {
      ...album,
      artists,
      artist_name,
      song_count: songStats?.song_count || 0,
      total_duration: songStats?.total_duration || 0
    };
  }

  async getAllWithDetails(): Promise<AlbumWithDetails[]> {
    const albums = await this.db.query<Album>(
      'SELECT * FROM albums ORDER BY title'
    );

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getAlbumsByArtist(artistId: number): Promise<AlbumWithDetails[]> {
    const albums = await this.db.query<Album>(
      `SELECT DISTINCT al.*
       FROM albums al
       JOIN songs s ON al.id = s.album_id
       JOIN song_artists sa ON s.id = sa.song_id
       WHERE sa.artist_id = ?
       ORDER BY al.release_year DESC, al.title`,
      [artistId]
    );

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async search(query: string, limit: number = 20): Promise<AlbumWithDetails[]> {
    // Fuzzy search with character normalization
    const terms = prepareSearchTerms(query);

    if (terms.length === 0) return [];

    // Search conditions
    const searchConditions = terms.map(() =>
      `(LOWER(al.title) LIKE LOWER(?) OR
        LOWER(a.name) LIKE LOWER(?) OR
        al.release_year = ?)`
    ).join(' AND ');

    // Build params for each term
    const params: (string | number)[] = [];
    for (const term of terms) {
      const { searchTerm } = createSearchParams(term);
      const yearNum = parseInt(term);
      params.push(
        searchTerm,  // title
        searchTerm,  // artist
        isYearTerm(term) ? yearNum : -1  // year
      );
    }

    const sql = `SELECT DISTINCT al.*
       FROM albums al
       LEFT JOIN songs s ON al.id = s.album_id
       LEFT JOIN song_artists sa ON s.id = sa.song_id
       LEFT JOIN artists a ON sa.artist_id = a.id
       WHERE ${searchConditions}
       ORDER BY al.title
       LIMIT ?`;

    const allParams = [...params, limit];

    const albums = await this.db.query<Album>(sql, allParams);

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async updateArtwork(id: number, artworkPath: string): Promise<void> {
    await this.db.run(
      'UPDATE albums SET artwork_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [artworkPath, id]
    );
  }

  async update(id: number, updates: Partial<CreateAlbumData>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await this.db.run(
      `UPDATE albums SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.run('DELETE FROM albums WHERE id = ?', [id]);
  }

  async getAlbumCount(): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM albums'
    );
    return result!.count;
  }

  async getRecentAlbums(limit: number = 20): Promise<AlbumWithDetails[]> {
    const albums = await this.db.query<Album>(
      'SELECT * FROM albums ORDER BY created_at DESC LIMIT ?',
      [limit]
    );

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  // OpenSubsonic API support methods

  async getAll(limit: number = 10, offset: number = 0): Promise<AlbumWithDetails[]> {
    const albums = await this.db.query<Album>(
      'SELECT * FROM albums ORDER BY title LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getRandom(limit: number = 10): Promise<AlbumWithDetails[]> {
    const albums = await this.db.query<Album>(
      'SELECT * FROM albums ORDER BY RANDOM() LIMIT ?',
      [limit]
    );

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getNewest(limit: number = 10, offset: number = 0): Promise<AlbumWithDetails[]> {
    const albums = await this.db.query<Album>(
      'SELECT * FROM albums ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getMostPlayed(limit: number = 10, offset: number = 0): Promise<AlbumWithDetails[]> {
    // Get albums with play counts
    const albums = await this.db.query<Album & { play_count: number }>(
      `SELECT
        al.*,
        COALESCE(SUM(lh.played_at), 0) as play_count
       FROM albums al
       LEFT JOIN songs s ON al.id = s.album_id
       LEFT JOIN listen_history lh ON s.id = lh.song_id
       GROUP BY al.id
       ORDER BY play_count DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Fetch full details for each album
    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }

  async getStarred(userId: number): Promise<AlbumWithDetails[]> {
    // Get albums that have starred songs
    const albums = await this.db.query<Album>(
      `SELECT DISTINCT al.*
       FROM albums al
       LEFT JOIN songs s ON al.id = s.album_id
       LEFT JOIN song_artists sa ON s.id = sa.song_id
       LEFT JOIN artists a ON sa.artist_id = a.id
       INNER JOIN favorites f ON s.id = f.song_id
       WHERE f.user_id = ?
       ORDER BY al.title`,
      [userId]
    );

    // Fetch full details for each album
    const result: AlbumWithDetails[] = [];
    for (const album of albums) {
      const details = await this.findWithDetails(album.id);
      if (details) {
        result.push(details);
      }
    }

    return result;
  }
}

export default new AlbumModel();
