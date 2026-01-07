import Database from '../config/database';

export interface Artist {
  id: number;
  name: string;
  image_path?: string;
  created_at: string;
  updated_at: string;
}

export interface ArtistWithStats extends Artist {
  song_count: number;
  album_count: number;
}

export class ArtistModel {
  private db = Database;

  async findByName(name: string): Promise<Artist | null> {
    return await this.db.get<Artist>(
      'SELECT * FROM artists WHERE name = ?',
      [name]
    );
  }

  async findById(id: number): Promise<Artist | null> {
    return await this.db.get<Artist>(
      'SELECT * FROM artists WHERE id = ?',
      [id]
    );
  }

  async create(name: string): Promise<Artist> {
    const result = await this.db.run(
      'INSERT INTO artists (name) VALUES (?)',
      [name]
    );

    const artist = await this.findById(result.lastID!);
    if (!artist) {
      throw new Error('Failed to create artist');
    }

    return artist;
  }

  async findOrCreate(name: string): Promise<Artist> {
    // First, try to find case-insensitively
    let artist = await this.db.get<Artist>(
      'SELECT * FROM artists WHERE LOWER(name) = LOWER(?)',
      [name]
    );

    // If not found, try to insert
    if (!artist) {
      const result = await this.db.run(
        'INSERT INTO artists (name) VALUES (?)',
        [name]
      );

      // Fetch the newly created artist
      artist = await this.findById(result.lastID!);
    }

    if (!artist) {
      throw new Error('Failed to find or create artist');
    }

    return artist;
  }

  async getAllWithStats(): Promise<ArtistWithStats[]> {
    return await this.db.query<ArtistWithStats>(
      `SELECT
        a.*,
        COUNT(DISTINCT s.id) as song_count,
        COUNT(DISTINCT al.id) as album_count
       FROM artists a
       LEFT JOIN song_artists sa ON a.id = sa.artist_id
       LEFT JOIN songs s ON sa.song_id = s.id
       LEFT JOIN albums al ON s.album_id = al.id
       GROUP BY a.id
       ORDER BY a.name`
    );
  }

  async search(query: string, limit: number = 20): Promise<ArtistWithStats[]> {
    const searchTerm = `%${query}%`;
    return await this.db.query<ArtistWithStats>(
      `SELECT
        a.*,
        COUNT(DISTINCT s.id) as song_count,
        COUNT(DISTINCT al.id) as album_count
       FROM artists a
       LEFT JOIN song_artists sa ON a.id = sa.artist_id
       LEFT JOIN songs s ON sa.song_id = s.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE a.name LIKE ?
       GROUP BY a.id
       ORDER BY a.name
       LIMIT ?`,
      [searchTerm, limit]
    );
  }

  async update(id: number, data: { name?: string; image_path?: string }): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(data.image_path);
    }

    if (updates.length === 0) {
      return;
    }

    values.push(id);
    await this.db.run(
      `UPDATE artists SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async getAllArtists(): Promise<Artist[]> {
    return await this.db.query<Artist>(
      'SELECT * FROM artists ORDER BY name'
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.run('DELETE FROM artists WHERE id = ?', [id]);
  }

  async getArtistCount(): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM artists'
    );
    return result!.count;
  }

  async getStarred(userId: number): Promise<Artist[]> {
    return await this.db.query<Artist>(
      `SELECT DISTINCT a.*
       FROM artists a
       INNER JOIN song_artists sa ON a.id = sa.artist_id
       INNER JOIN songs s ON sa.song_id = s.id
       INNER JOIN favorites f ON s.id = f.song_id
       WHERE f.user_id = ?
       ORDER BY a.name`,
      [userId]
    );
  }

  async getArtistsWithoutSongs(): Promise<Artist[]> {
    return await this.db.query<Artist>(
      `SELECT a.*
       FROM artists a
       LEFT JOIN song_artists sa ON a.id = sa.artist_id
       WHERE sa.artist_id IS NULL
       ORDER BY a.name`
    );
  }
}

export default new ArtistModel();