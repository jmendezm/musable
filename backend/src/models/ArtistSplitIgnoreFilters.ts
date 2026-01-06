import Database from '../config/database';

export interface ArtistSplitIgnoreFilter {
  id?: number;
  pattern: string;
  created_by: number;
  created_at?: string;
  updated_at?: string;
}

class ArtistSplitIgnoreFiltersModel {
  private db = Database;

  async getAll(): Promise<ArtistSplitIgnoreFilter[]> {
    const filters = await this.db.query<ArtistSplitIgnoreFilter>(`
      SELECT * FROM artist_split_ignore_filters
      ORDER BY pattern ASC
    `);
    return filters || [];
  }

  async getById(id: number): Promise<ArtistSplitIgnoreFilter | null> {
    const filter = await this.db.get<ArtistSplitIgnoreFilter>(
      'SELECT * FROM artist_split_ignore_filters WHERE id = ?',
      [id]
    );
    return filter || null;
  }

  async create(pattern: string, createdBy: number): Promise<ArtistSplitIgnoreFilter> {
    const result = await this.db.run(
      `INSERT INTO artist_split_ignore_filters (pattern, created_by, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`,
      [pattern, createdBy]
    );

    const newFilter = await this.db.get<ArtistSplitIgnoreFilter>(
      'SELECT * FROM artist_split_ignore_filters WHERE id = ?',
      [result.lastID]
    );

    if (!newFilter) {
      throw new Error('Failed to create ignore filter');
    }

    return newFilter;
  }

  async update(id: number, pattern: string): Promise<ArtistSplitIgnoreFilter> {
    await this.db.run(
      `UPDATE artist_split_ignore_filters
       SET pattern = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [pattern, id]
    );

    const updatedFilter = await this.db.get<ArtistSplitIgnoreFilter>(
      'SELECT * FROM artist_split_ignore_filters WHERE id = ?',
      [id]
    );

    if (!updatedFilter) {
      throw new Error('Ignore filter not found');
    }

    return updatedFilter;
  }

  async delete(id: number): Promise<void> {
    const result = await this.db.run(
      'DELETE FROM artist_split_ignore_filters WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      throw new Error('Ignore filter not found');
    }
  }

  async getByPattern(pattern: string): Promise<ArtistSplitIgnoreFilter | null> {
    const filter = await this.db.get<ArtistSplitIgnoreFilter>(
      'SELECT * FROM artist_split_ignore_filters WHERE pattern = ?',
      [pattern]
    );
    return filter || null;
  }
}

const artistSplitIgnoreFiltersInstance = new ArtistSplitIgnoreFiltersModel();

export default artistSplitIgnoreFiltersInstance;
