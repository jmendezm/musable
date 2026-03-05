import Database from '../config/database';

/**
 * Deduplicate artists and albums by merging duplicates into a single entry.
 * This should be run after the unique indexes have been added to the database.
 *
 * Usage: npx ts-node src/utils/deduplicateArtists.ts
 */

interface Artist {
  id: number;
  name: string;
}

interface Album {
  id: number;
  title: string;
}

async function deduplicateArtists() {
  // Get all artists, grouped by lowercase name
  const artists = await Database.query<Artist>('SELECT id, name FROM artists ORDER BY name');

  // Group artists by lowercase name
  const artistGroups = new Map<string, Artist[]>();
  for (const artist of artists) {
    const lowerName = artist.name.toLowerCase();
    if (!artistGroups.has(lowerName)) {
      artistGroups.set(lowerName, []);
    }
    artistGroups.get(lowerName)!.push(artist);
  }

  // Find and merge duplicates
  let artistsMerged = 0;
  for (const [lowerName, duplicates] of artistGroups.entries()) {
    if (duplicates.length > 1) {
      const keepArtist = duplicates[0];
      const toMerge = duplicates.slice(1);

      for (const artist of toMerge) {
        // Update song_artists junction table to point to the kept artist
        await Database.run(
          'UPDATE song_artists SET artist_id = ? WHERE artist_id = ?',
          [keepArtist.id, artist.id]
        );

        // Delete the duplicate artist
        await Database.run(
          'DELETE FROM artists WHERE id = ?',
          [artist.id]
        );

        artistsMerged++;
      }
    }
  }

  return artistsMerged;
}

async function deduplicateAlbums() {
  // Get all albums, grouped by lowercase title
  const albums = await Database.query<Album>('SELECT id, title FROM albums ORDER BY title');

  // Group albums by lowercase title
  const albumGroups = new Map<string, Album[]>();
  for (const album of albums) {
    const lowerTitle = album.title.toLowerCase();
    if (!albumGroups.has(lowerTitle)) {
      albumGroups.set(lowerTitle, []);
    }
    albumGroups.get(lowerTitle)!.push(album);
  }

  // Find and merge duplicates
  let albumsMerged = 0;
  for (const [lowerTitle, duplicates] of albumGroups.entries()) {
    if (duplicates.length > 1) {
      const keepAlbum = duplicates[0];
      const toMerge = duplicates.slice(1);

      for (const album of toMerge) {
        // Update songs to point to the kept album
        await Database.run(
          'UPDATE songs SET album_id = ? WHERE album_id = ?',
          [keepAlbum.id, album.id]
        );

        // Delete the duplicate album
        await Database.run(
          'DELETE FROM albums WHERE id = ?',
          [album.id]
        );

        albumsMerged++;
      }
    }
  }

  return albumsMerged;
}

async function main() {
  try {
    const artistsMerged = await deduplicateArtists();
    const albumsMerged = await deduplicateAlbums();

    if (artistsMerged > 0 || albumsMerged > 0) {
      console.log(`Deduplication complete: ${artistsMerged} artists merged, ${albumsMerged} albums merged`);
    } else {
      console.log('No duplicates found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during deduplication:', error);
    process.exit(1);
  }
}

main();
