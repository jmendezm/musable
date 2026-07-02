export interface SongArtist {
  id: number;
  name: string;
}

export function artistsSubquery(songIdExpr: string): string {
  return `(
    SELECT json_group_array(json_object('id', t.id, 'name', t.name))
    FROM (
      SELECT ar.id, ar.name
      FROM song_artists sa
      JOIN artists ar ON sa.artist_id = ar.id
      WHERE sa.song_id = ${songIdExpr}
      ORDER BY sa.position
    ) t
  )`;
}

export function parseArtistsJson(json: string | null | undefined): SongArtist[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function withArtists<T extends { artists_json?: string | null }>(
  row: T
): Omit<T, 'artists_json'> & { artists: SongArtist[] } {
  const { artists_json, ...rest } = row;
  return { ...rest, artists: parseArtistsJson(artists_json) };
}

export function withArtistsList<T extends { artists_json?: string | null }>(
  rows: T[]
): (Omit<T, 'artists_json'> & { artists: SongArtist[] })[] {
  return rows.map(withArtists);
}
