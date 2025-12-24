import express, { Router } from 'express';
import { Server } from 'socket.io';
import { Plugin, PluginHealth } from '../../../core/types';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import * as musicMetadata from 'music-metadata';

const execAsync = promisify(exec);

// Simple logger for plugin
const logger = {
  info: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] [YouTubePlugin] ${msg}`, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] [YouTubePlugin] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] [YouTubePlugin] ${msg}`, ...args);
  }
};

// Types
export interface SearchImage {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  source: string;
  width?: number;
  height?: number;
  videoId?: string;
  channelTitle?: string;
}

interface YouTubeSearchResult {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails: {
      default: { url: string; width: number; height: number };
      medium: { url: string; width: number; height: number };
      high: { url: string; width: number; height: number };
      standard?: { url: string; width: number; height: number };
      maxres?: { url: string; width: number; height: number };
    };
    channelTitle: string;
    publishedAt: string;
  };
}

export interface YTMusicSearchResult {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  thumbnail: string;
  isAvailableLocally: boolean;
  source: 'youtube-music';
}

export interface DownloadProgress {
  id: string;
  status: 'downloading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

// Services
class YouTubeService {
  private youtubeApiKey: string;

  constructor(youtubeApiKey: string) {
    this.youtubeApiKey = youtubeApiKey;
  }

  async searchImages(query: string, limit = 20): Promise<SearchImage[]> {
    const results: SearchImage[] = [];

    try {
      logger.info(`🔍 YouTube Service: Searching for "${query}" (limit: ${limit})`);

      const youtubeResults = await this.searchYouTube(query, Math.ceil(limit * 0.8));
      results.push(...youtubeResults);

      if (results.length < limit) {
        const alternativeQueries = [
          `${query} official music video`,
          `${query} official audio`,
          `${query} album`,
          `${query} cover`
        ];

        for (const altQuery of alternativeQueries) {
          if (results.length >= limit) break;

          try {
            const altResults = await this.searchYouTube(altQuery, 5);
            const uniqueResults = altResults.filter(newResult =>
              !results.some(existingResult => existingResult.videoId === newResult.videoId)
            );
            results.push(...uniqueResults);
          } catch (error) {
            logger.warn(`Alternative YouTube search failed for: ${altQuery}`, error);
          }
        }
      }

      if (results.length === 0) {
        logger.warn('No YouTube results found, using fallback');
        return this.getFallbackImages(query, limit);
      }

      logger.info(`🎵 YouTube Service: Found ${results.length} results for "${query}"`);
      return results.slice(0, limit);
    } catch (error) {
      logger.error('Error searching images:', error);
      return this.getFallbackImages(query, limit);
    }
  }

  private async searchYouTube(query: string, limit: number): Promise<SearchImage[]> {
    try {
      if (this.youtubeApiKey && this.youtubeApiKey.trim() !== '') {
        logger.info('Using YouTube Data API v3 for search');

        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            key: this.youtubeApiKey,
            q: query,
            part: 'snippet',
            type: 'video',
            maxResults: limit,
            videoCategoryId: '10',
            order: 'relevance'
          }
        });

        if (response.data.items && response.data.items.length > 0) {
          return response.data.items.map((item: YouTubeSearchResult) => this.mapYouTubeResult(item));
        }
      } else {
        logger.warn('YouTube API key not found. Using demo thumbnails.');
      }

      return this.getMockYouTubeResults(query, limit);
    } catch (error) {
      logger.error('YouTube search failed:', error);
      return this.getMockYouTubeResults(query, limit);
    }
  }

  private mapYouTubeResult(item: YouTubeSearchResult): SearchImage {
    const thumbnails = item.snippet.thumbnails;

    const getBestThumbnail = () => {
      if (thumbnails.maxres) return thumbnails.maxres;
      if (thumbnails.standard) return thumbnails.standard;
      if (thumbnails.high) return thumbnails.high;
      if (thumbnails.medium) return thumbnails.medium;
      return thumbnails.default;
    };

    const bestThumbnail = getBestThumbnail();

    return {
      id: `youtube-${item.id.videoId}`,
      url: bestThumbnail.url,
      thumbnail: thumbnails.medium?.url || thumbnails.default.url,
      title: this.cleanTitle(item.snippet.title),
      source: 'YouTube',
      width: bestThumbnail.width,
      height: bestThumbnail.height,
      videoId: item.id.videoId,
      channelTitle: item.snippet.channelTitle
    };
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\(Official.*?\)/gi, '')
      .replace(/\[Official.*?\]/gi, '')
      .replace(/- Official.*$/gi, '')
      .replace(/Official.*$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getMockYouTubeResults(query: string, limit: number): SearchImage[] {
    const mockResults: SearchImage[] = [];
    const mockVideoIds = [
      'dQw4w9WgXcQ', '9bZkp7q19f0', 'fJ9rUzIMcZQ', 'tbU3zdAgiX8', 'hTWKbfoikeg',
      'YQHsXMglC9A', 'djV11Xbc914', 'L_jWHffIx5E', 'SlPhMPnQ58k', 'tgbNymZ7vqY'
    ];

    for (let i = 0; i < limit && i < mockVideoIds.length; i++) {
      const videoId = mockVideoIds[i] || `mock${i}`;
      mockResults.push({
        id: `youtube-${videoId}`,
        url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        title: `${query} - Music Video ${i + 1}`,
        source: 'YouTube',
        width: 1280,
        height: 720,
        videoId: videoId,
        channelTitle: `${query} - Artist Channel`
      });
    }

    return mockResults;
  }

  private getFallbackImages(query: string, limit: number): SearchImage[] {
    const fallbackImages: SearchImage[] = [];

    for (let i = 1; i <= limit; i++) {
      fallbackImages.push({
        id: `fallback-${query}-${i}`,
        url: `https://via.placeholder.com/500x500/1f2937/82aaf2?text=${encodeURIComponent(query)}`,
        thumbnail: `https://via.placeholder.com/200x200/1f2937/82aaf2?text=${encodeURIComponent(query)}`,
        title: `${query} - Album Cover ${i}`,
        source: 'Fallback',
        width: 500,
        height: 500
      });
    }

    return fallbackImages;
  }

  async searchAlbumArtwork(artist: string, album: string): Promise<SearchImage[]> {
    const queries = [
      `${artist} ${album}`,
      `${artist} ${album} official music video`,
      `${artist} ${album} official audio`,
      `${artist} ${album} full album`,
      `${album} ${artist}`,
      `${artist} ${album} playlist`,
      `${artist} music`
    ];

    const allResults: SearchImage[] = [];

    for (const query of queries) {
      try {
        const results = await this.searchImages(query, 5);
        allResults.push(...results);

        if (allResults.length >= 20) break;
      } catch (error) {
        logger.error(`Failed to search for: ${query}`, error);
      }
    }

    const uniqueResults = allResults.filter((image, index, arr) =>
      arr.findIndex(img =>
        (img.videoId && image.videoId && img.videoId === image.videoId) ||
        (!img.videoId && img.url === image.url)
      ) === index
    );

    return uniqueResults.slice(0, 20);
  }

  getHighQualityThumbnail(videoId: string, quality: 'maxres' | 'standard' | 'high' | 'medium' = 'maxres'): string {
    const thumbnailUrls = {
      maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      standard: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
      high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    };

    return thumbnailUrls[quality];
  }
}

class YTMusicService {
  private downloadProgress: Map<string, DownloadProgress> = new Map();
  private downloadsDir: string;
  private models: any;

  constructor(models: any) {
    this.downloadsDir = path.join(process.cwd(), 'yt-downloads');
    this.models = models;
    this.ensureDownloadDir();
  }

  private async ensureDownloadDir() {
    try {
      await fs.access(this.downloadsDir);
    } catch {
      await fs.mkdir(this.downloadsDir, { recursive: true });
    }
  }

  async initialize() {
    console.log('YTMusic service initialized (using yt-dlp) // v3: real-time progress tracking');
  }

  async searchMusic(query: string): Promise<YTMusicSearchResult[]> {
    try {
      console.log(`🎵 YTMusic: Searching for "${query}" using yt-dlp...`);

      const searchQuery = `ytsearch15:${query}`;
      const command = `yt-dlp "${searchQuery}" --flat-playlist -j --skip-download --no-warnings --quiet --no-progress`;

      const { stdout } = await execAsync(command);

      const lines = stdout.trim().split('\n').filter(line => line.trim());
      console.log(`🎵 YTMusic: Found ${lines.length} raw results from yt-dlp`);

      const ytMusicResults: YTMusicSearchResult[] = [];

      for (const line of lines) {
        try {
          const result = JSON.parse(line);

          const existingSong = await this.models.Song.findByYoutubeId(result.id);
          const isAvailable = !!existingSong;

          if (!isAvailable) {
            const artistName = result.uploader || result.channel || 'Unknown Artist';
            const title = result.title;

            if (title.toLowerCase().trim() === artistName.toLowerCase().trim()) {
              console.log(`🎵 YTMusic: Skipped "${title}" - title matches artist name (likely channel page)`);
              continue;
            }

            const durationSeconds = result.duration;
            const formattedDuration = (durationSeconds && durationSeconds > 0)
              ? this.formatDuration(Math.floor(durationSeconds))
              : undefined;

            ytMusicResults.push({
              id: result.id,
              title: result.title,
              artist: artistName,
              album: undefined,
              duration: formattedDuration,
              thumbnail: result.thumbnails?.[0]?.url || '',
              isAvailableLocally: false,
              source: 'youtube-music'
            });
            console.log(`🎵 YTMusic: Added "${result.title}" by "${artistName}" to results`);
          } else {
            console.log(`🎵 YTMusic: Skipped "${result.title}" - already downloaded (youtube_id: ${result.id})`);
          }
        } catch (parseError) {
          console.error('Error parsing yt-dlp result line:', parseError);
        }
      }

      console.log(`🎵 YTMusic: Returning ${ytMusicResults.length} unique results`);
      return ytMusicResults;
    } catch (error) {
      console.error('YTMusic search error:', error);
      return [];
    }
  }

  async downloadSong(videoId: string): Promise<string> {
    const downloadId = `${videoId}-${Date.now()}`;

    this.downloadProgress.set(downloadId, {
      id: downloadId,
      status: 'downloading',
      progress: 0
    });

    this.performDownload(videoId, downloadId).catch(error => {
      console.error('Background download error:', error);
      this.downloadProgress.set(downloadId, {
        id: downloadId,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Download failed'
      });
    });

    return downloadId;
  }

  private async performDownload(videoId: string, downloadId: string): Promise<void> {
    try {
      console.log(`🎵 YTMusic: Starting download for video ID: ${videoId}`);

      const infoCommand = `yt-dlp "https://www.youtube.com/watch?v=${videoId}" -j --no-warnings --quiet`;
      const { stdout: infoJson } = await execAsync(infoCommand);
      const songInfo = JSON.parse(infoJson);

      console.log(`🎵 YTMusic: Got song info:`, {
        title: songInfo.title,
        uploader: songInfo.uploader,
        duration: songInfo.duration
      });

      let cleanTitle = songInfo.title || `video-${videoId}`;

      cleanTitle = cleanTitle
        .replace(/\s*\(Official\s+Music\s+Video\)/gi, '')
        .replace(/\s*\[Official\s+Music\s+Video\]/gi, '')
        .replace(/\s*\(Official\s+Audio\)/gi, '')
        .replace(/\s*\[Official\s+Audio\]/gi, '')
        .replace(/\s*\(Official\s+Video\)/gi, '')
        .replace(/\s*\[Official\s+Video\]/gi, '')
        .replace(/\s*\(Lyric\s+Video\)/gi, '')
        .replace(/\s*\[Lyric\s+Video\]/gi, '')
        .replace(/\s*\(Lyrics\)/gi, '')
        .replace(/\s*\[Lyrics\]/gi, '');

      let extractedArtistName = '';
      if (songInfo.artist && typeof songInfo.artist === 'string') {
        extractedArtistName = songInfo.artist;
      } else if (songInfo.uploader && typeof songInfo.uploader === 'string') {
        extractedArtistName = songInfo.uploader;
      } else if (songInfo.channel && typeof songInfo.channel === 'string') {
        extractedArtistName = songInfo.channel;
      }

      if (extractedArtistName && cleanTitle.toLowerCase().startsWith(extractedArtistName.toLowerCase() + ' - ')) {
        cleanTitle = cleanTitle.substring(extractedArtistName.length + 3);
      }

      cleanTitle = cleanTitle.trim();

      const outputTemplate = path.join(this.downloadsDir, `${videoId}.%(ext)s`);

      this.downloadProgress.set(downloadId, {
        id: downloadId,
        status: 'downloading',
        progress: 0
      });

      console.log(`🎵 YTMusic: Starting download with real-time progress tracking...`);

      await new Promise<void>((resolve, reject) => {
        const ytdlpProcess = spawn('yt-dlp', [
          `https://www.youtube.com/watch?v=${videoId}`,
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--embed-thumbnail',
          '--embed-metadata',
          '--add-metadata',
          '-o', outputTemplate,
          '--newline',
          '--progress',
          '--no-warnings'
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let lastProgress = 0;

        const parseOutput = (output: string) => {
          const downloadMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
          if (downloadMatch) {
            const progress = Math.floor(parseFloat(downloadMatch[1]));
            if (progress > lastProgress) {
              lastProgress = progress;
              const cappedProgress = Math.min(progress, 95);
              console.log(`📊 Progress update: ${progress}% -> setting to ${cappedProgress}% for downloadId: ${downloadId}`);
              this.downloadProgress.set(downloadId, {
                id: downloadId,
                status: 'downloading',
                progress: cappedProgress
              });
              console.log(`📊 Progress stored in map:`, this.downloadProgress.get(downloadId));
            }
          }

          if (output.includes('[ExtractAudio]') || output.includes('[EmbedThumbnail]') || output.includes('[Metadata]')) {
            console.log(`🔧 Post-processing detected, setting progress to 96%`);
            this.downloadProgress.set(downloadId, {
              id: downloadId,
              status: 'processing',
              progress: 96
            });
          }
        };

        ytdlpProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log(`📥 yt-dlp stdout: ${output.trim()}`);
          parseOutput(output);
        });

        ytdlpProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.log(`📥 yt-dlp stderr: ${output.trim()}`);
          parseOutput(output);
        });

        ytdlpProcess.on('close', async (code) => {
          if (code === 0) {
            console.log(`🎵 YTMusic: Download completed successfully`);

            this.downloadProgress.set(downloadId, {
              id: downloadId,
              status: 'processing',
              progress: 98
            });

            resolve();
          } else {
            const finalPath = path.join(this.downloadsDir, `${videoId}.mp3`);
            try {
              const stats = await fs.stat(finalPath);
              if (stats.size > 0) {
                console.log(`🎵 YTMusic: File exists with size ${stats.size} bytes despite exit code ${code}, continuing...`);
                this.downloadProgress.set(downloadId, {
                  id: downloadId,
                  status: 'processing',
                  progress: 98
                });
                resolve();
              } else {
                reject(new Error(`Download failed with exit code ${code}`));
              }
            } catch {
              reject(new Error(`Download failed with exit code ${code}`));
            }
          }
        });

        ytdlpProcess.on('error', (error) => {
          console.error(`🎵 YTMusic: Process error:`, error);
          reject(error);
        });
      });

      const finalPath = path.join(this.downloadsDir, `${videoId}.mp3`);
      console.log(`🎵 YTMusic: Download completed, file at: ${finalPath}`);

      await this.addDownloadedSongToDatabase(songInfo, finalPath, cleanTitle);

      this.downloadProgress.set(downloadId, {
        id: downloadId,
        status: 'completed',
        progress: 100
      });
    } catch (error) {
      console.error('Download error:', error);
      this.downloadProgress.set(downloadId, {
        id: downloadId,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Download failed'
      });
      throw error;
    }
  }

  private async addDownloadedSongToDatabase(songInfo: any, filePath: string, cleanTitle: string) {
    try {
      let artworkPath: string | null = null;
      try {
        const metadata = await musicMetadata.parseFile(filePath);
        const picture = metadata.common.picture?.[0];

        if (picture) {
          const uploadsDir = path.join(process.cwd(), 'uploads', 'artwork');
          await fs.mkdir(uploadsDir, { recursive: true });

          const artworkFilename = `yt_${songInfo.id}.jpg`;
          artworkPath = path.join(uploadsDir, artworkFilename);

          await sharp(picture.data)
            .resize(500, 500, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toFile(artworkPath);

          artworkPath = `uploads/artwork/${artworkFilename}`;
          console.log(`🎨 Extracted artwork: ${artworkPath}`);
        }
      } catch (artworkError) {
        console.error('Error extracting artwork:', artworkError);
      }

      let artistName = 'Unknown Artist';
      if (songInfo.artist && typeof songInfo.artist === 'string') {
        artistName = songInfo.artist;
      } else if (songInfo.uploader && typeof songInfo.uploader === 'string') {
        artistName = songInfo.uploader;
      } else if (songInfo.channel && typeof songInfo.channel === 'string') {
        artistName = songInfo.channel;
      } else if (songInfo.uploader_id && typeof songInfo.uploader_id === 'string') {
        artistName = songInfo.uploader_id;
      }

      let artist = await this.models.Artist.findByName(artistName);
      if (!artist) {
        artist = await this.models.Artist.create(artistName);
      }

      let album = null;
      const albumTitle = songInfo.album || cleanTitle;

      if (albumTitle) {
        album = await this.models.Album.findByTitleAndArtist(albumTitle, artist.id);
        if (!album) {
          const albumData = {
            title: albumTitle,
            artist_id: artist.id,
            release_year: songInfo.release_year || null,
            artwork_path: artworkPath
          };
          album = await this.models.Album.create(albumData);
          console.log(`✅ Created album "${albumTitle}" with artwork for YouTube song`);
        } else if (artworkPath && !album.artwork_path) {
          await this.models.Album.update(album.id, { artwork_path: artworkPath });
          console.log(`✅ Updated album "${albumTitle}" with artwork`);
        }
      }

      const songData = {
        title: cleanTitle,
        artist_id: artist.id,
        album_id: album ? album.id : null,
        duration: songInfo.duration ? Math.floor(songInfo.duration) : null,
        file_path: filePath,
        genre: songInfo.genre || null,
        year: songInfo.release_year || songInfo.release_date?.substring(0, 4) || null,
        track_number: songInfo.track_number || null,
        source: 'youtube-music' as const,
        youtube_id: songInfo.id
      };

      await this.models.Song.create(songData);
      console.log(`✅ Added downloaded song to database: "${cleanTitle}" by "${artist.name}" (YouTube ID: ${songInfo.id})`);
    } catch (error) {
      console.error('Error adding song to database:', error);
    }
  }

  getDownloadProgress(downloadId: string): DownloadProgress | null {
    const progress = this.downloadProgress.get(downloadId) || null;
    return progress;
  }

  getAllActiveDownloads(): DownloadProgress[] {
    return Array.from(this.downloadProgress.values()).filter(
      progress => progress.status === 'downloading' || progress.status === 'processing'
    );
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Main Plugin Class
class YouTubePlugin implements Plugin {
  id = 'youtube';
  name = 'YouTube Plugin';
  version = '1.0.0';
  description = 'YouTube and YouTube Music integration for searching and downloading music';
  author = 'Musable Team';

  private youtubeService!: YouTubeService;
  private ytMusicService!: YTMusicService;
  private context!: any;

  async initialize(): Promise<void> {
    logger.info('📦 Initializing YouTube Plugin...');

    const youtubeApiKey = this.context.config.youtubeApiKey || '';

    this.youtubeService = new YouTubeService(youtubeApiKey);
    this.ytMusicService = new YTMusicService(this.context.models);

    await this.ytMusicService.initialize();

    logger.info('✅ YouTube Plugin initialized');
  }

  async start(): Promise<void> {
    logger.info('▶️  Starting YouTube Plugin...');
    logger.info('✅ YouTube Plugin started');
  }

  async stop(): Promise<void> {
    logger.info('⏸️  Stopping YouTube Plugin...');
    logger.info('✅ YouTube Plugin stopped');
  }

  getRoutes(): Router {
    const router = express.Router();

    // YouTube Image Search Routes
    router.get('/images/search', async (req: any, res) => {
      try {
        const { q: query, limit = 20 } = req.query;

        if (!query || typeof query !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Query parameter "q" is required'
          });
          return;
        }

        const limitNumber = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);

        logger.info(`🔍 YouTube search requested: "${query}" (limit: ${limitNumber}) by user ${req.user?.id}`);

        const results = await this.youtubeService.searchImages(query, limitNumber);

        res.json({
          success: true,
          data: results,
          count: results.length,
          query: query,
          limit: limitNumber
        });
        return;

      } catch (error) {
        logger.error('YouTube search error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search for images'
        });
        return;
      }
    });

    router.get('/images/album-artwork', async (req: any, res) => {
      try {
        const { artist, album } = req.query;

        if (!artist || !album || typeof artist !== 'string' || typeof album !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Both "artist" and "album" query parameters are required'
          });
          return;
        }

        logger.info(`🎨 Album artwork search requested: "${artist}" - "${album}" by user ${req.user?.id}`);

        const results = await this.youtubeService.searchAlbumArtwork(artist, album);

        res.json({
          success: true,
          data: results,
          count: results.length,
          artist: artist,
          album: album
        });
        return;

      } catch (error) {
        logger.error('Album artwork search error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search for album artwork'
        });
        return;
      }
    });

    router.get('/images/thumbnail/:videoId', (req: any, res) => {
      try {
        const { videoId } = req.params;
        const { quality = 'maxres' } = req.query;

        if (!videoId) {
          res.status(400).json({
            success: false,
            error: 'Video ID is required'
          });
          return;
        }

        const validQualities = ['maxres', 'standard', 'high', 'medium'];
        const requestedQuality = validQualities.includes(quality as string)
          ? (quality as 'maxres' | 'standard' | 'high' | 'medium')
          : 'maxres';

        const thumbnailUrl = this.youtubeService.getHighQualityThumbnail(videoId, requestedQuality);

        res.json({
          success: true,
          data: {
            videoId: videoId,
            quality: requestedQuality,
            url: thumbnailUrl
          }
        });
        return;

      } catch (error) {
        logger.error('Thumbnail URL generation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate thumbnail URL'
        });
        return;
      }
    });

    // YouTube Music Routes
    router.get('/music/search', async (req: any, res) => {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Query parameter is required'
        });
      }

      const results = await this.ytMusicService.searchMusic(query);

      res.json({
        success: true,
        data: {
          results,
          source: 'youtube-music'
        }
      });
    });

    router.post('/music/download/:videoId', async (req: any, res) => {
      const { videoId } = req.params;

      try {
        const downloadId = await this.ytMusicService.downloadSong(videoId);

        res.json({
          success: true,
          data: {
            downloadId,
            message: 'Download started'
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to start download'
        });
      }
    });

    router.get('/music/download/:downloadId/progress', async (req: any, res) => {
      const { downloadId } = req.params;

      const progress = this.ytMusicService.getDownloadProgress(downloadId);

      if (!progress) {
        return res.status(404).json({
          success: false,
          error: 'Download not found'
        });
      }

      res.json({
        success: true,
        data: progress
      });
    });

    router.get('/music/downloads', async (req: any, res) => {
      const downloads = this.ytMusicService.getAllActiveDownloads();

      res.json({
        success: true,
        data: downloads
      });
    });

    return router;
  }

  setupWebSocket(io: Server): void {
    logger.info('🔌 Setting up WebSocket for YouTube Plugin');
    // WebSocket setup for real-time download progress could be added here
  }

  async healthCheck(): Promise<PluginHealth> {
    return {
      status: 'healthy',
      message: 'YouTube plugin is running'
    };
  }

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up YouTube Plugin...');
    logger.info('✅ YouTube Plugin cleaned up');
  }

  setContext(context: any): void {
    this.context = context;
  }
}

// Create and export plugin instance
const plugin = new YouTubePlugin();

// Export as default and as named export for plugin loading
export default plugin;
export { plugin as YouTubePlugin };
