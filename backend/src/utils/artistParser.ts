export function parseArtistNames(rawArtist: string | undefined, separator: string): string[] {
  if (!rawArtist || !rawArtist.trim()) {
    return ['Unknown Artist'];
  }

  const parts = separator
    ? rawArtist.split(separator)
    : [rawArtist];

  const names = parts
    .map(part => part.trim())
    .filter(part => part.length > 0);

  const uniqueNames = Array.from(new Set(names));

  return uniqueNames.length > 0 ? uniqueNames : ['Unknown Artist'];
}
