import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';

import config from './config/config';
import { initializeDatabase } from './utils/initDb';
import { seedDatabase } from './utils/seedDb';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { RoomService } from './services/roomService';
import { PlaybackTracker } from './services/playbackTracker';
import morganMiddleware from './utils/morgan';

import authRoutes from './routes/auth';
import libraryRoutes from './routes/library';
import playlistRoutes from './routes/playlists';
import historyRoutes from './routes/history';
import adminRoutes from './routes/admin';
import streamRoutes from './routes/stream';
import favoritesRoutes from './routes/favorites';
import shareRoutes from './routes/share';
import createRoomRoutes from './routes/rooms';
import pluginsRoutes from './routes/plugins';
import updatesRoutes from './routes/updates';
import systemRoutes from './routes/system';

// Models
import SongModel from './models/Song';
import ArtistModel from './models/Artist';
import AlbumModel from './models/Album';
import UserModel from './models/User';
import PlaylistModel from './models/Playlist';
import PluginModel from './models/Plugin';
import SettingsModel from './models/Settings';
import ListenHistoryModel from './models/ListenHistory';

// Plugin system (optional)
let PluginManager: any = null;
export let pluginManager: any = null;
try {
  PluginManager = require('../../plugins/core/dist/PluginManager').default;
} catch (error) {
  logger.info('Plugin system not available - plugins folder not found');
}

const app = express();
const server = createServer(app);

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
    credentials: false
  }
});

// Make io accessible from Express app (for plugin management)
app.set('io', io);

const SQLiteStore = require('connect-sqlite3')(session);

// Create profile pictures directory for user uploads
const profilePicturesDir = path.join(process.cwd(), 'uploads', 'profile-pictures');
if (!fs.existsSync(profilePicturesDir)) {
  fs.mkdirSync(profilePicturesDir, { recursive: true });
}

// Create artwork directory for album covers
const artworkDir = path.join(process.cwd(), 'uploads', 'artwork');
if (!fs.existsSync(artworkDir)) {
  fs.mkdirSync(artworkDir, { recursive: true });
}

// Serve profile pictures with CORS
app.use('/uploads/profile-pictures', express.static(path.join(process.cwd(), 'uploads', 'profile-pictures'), {
  setHeaders: (res, filePath, stat) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

// Serve album artwork with CORS
app.use('/uploads/artwork', express.static(path.join(process.cwd(), 'uploads', 'artwork'), {
  setHeaders: (res, filePath, stat) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

// Serve artist images with CORS
app.use('/uploads/artists', express.static(path.join(process.cwd(), 'uploads', 'artists'), {
  setHeaders: (res, filePath, stat) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false, // Disable CORP to allow cross-origin static files
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "http://localhost:3001"],
      mediaSrc: ["'self'", "blob:", "http://localhost:3001"],
      connectSrc: ["'self'", "http://localhost:3001"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));

// Manual CORS headers for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Keep the cors middleware as backup
app.use(cors({
  origin: '*',
  credentials: false,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(morganMiddleware);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.dirname(config.databasePath)
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Rate limiting removed for development


app.use('/api/auth', authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/rooms', createRoomRoutes(io));
app.use('/api/plugins', pluginsRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/system', systemRoutes);

// Serve plugin assets (icons, etc.) statically
const pluginsDir = path.join(__dirname, '../../plugins');
app.use('/plugins/assets', express.static(pluginsDir, {
  setHeaders: (res, filePath) => {
    // Set CORS headers for plugin assets
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
}));

// Initialize plugin system
const models = {
  Song: SongModel,
  Artist: ArtistModel,
  Album: AlbumModel,
  User: UserModel,
  Playlist: PlaylistModel,
  Plugin: PluginModel,
  Settings: SettingsModel,
  ListenHistory: ListenHistoryModel
};

// Initialize plugin manager if available
if (PluginManager) {
  try {
    pluginManager = new PluginManager(models, config);
    pluginManager.setExpressApp(app); // Set Express app reference for dynamic route mounting
    logger.info('Plugin manager initialized');
  } catch (error) {
    logger.error('Failed to initialize plugin manager:', error);
    pluginManager = null;
  }
}

// Track if plugins have finished loading
let pluginsLoaded = false;

// Register general health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Register plugin health endpoint (must be before server starts)
app.get('/api/plugins/:pluginId/health', async (req, res) => {
  const { pluginId } = req.params;

  // If plugin system is not available, return 503
  if (!pluginManager) {
    return res.status(503).json({
      success: false,
      error: 'Plugin system not available'
    });
  }

  logger.info(`[Health Check] Checking plugin: ${pluginId}, pluginsLoaded: ${pluginsLoaded}`);

  // If plugins haven't loaded yet, return starting status
  if (!pluginsLoaded) {
    logger.info(`[Health Check] Plugins still loading, returning 'starting' status`);
    return res.json({
      success: true,
      data: {
        status: 'healthy',
        message: 'Plugin is starting',
        metadata: { starting: true }
      }
    });
  }

  try {
    const health = await pluginManager.getPluginHealth(pluginId);

    if (!health) {
      logger.warn(`[Health Check] Plugin not found: ${pluginId}`);
      return res.status(404).json({
        success: false,
        error: 'Plugin not found'
      });
    }

    logger.info(`[Health Check] Plugin ${pluginId} is ${health.status}`);
    return res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error(`[Health Check] Error checking plugin health:`, error);
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Serve frontend static files in production (Docker)
const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));

  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req, res, next) => {
    // Skip API routes, health check, profile pictures, artwork, and OpenSubsonic API
    if (req.path.startsWith('/api') || req.path === '/health' ||
        req.path.startsWith('/uploads/profile-pictures') ||
        req.path.startsWith('/uploads/artwork') ||
        req.path.startsWith('/rest')) {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  // Development mode - show API info
  app.get('/', (req, res) => {
    res.json({
      message: 'Musable API Server',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        auth: '/api/auth',
        library: '/api/library',
        playlists: '/api/playlists',
        history: '/api/history',
        admin: '/api/admin',
        favorites: '/api/favorites'
      }
    });
  });
}

app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    await initializeDatabase();
    await seedDatabase();

    // Initialize room service
    const roomService = new RoomService(io);
    roomService.startPeriodicSync();

    // Initialize playback tracker
    const playbackTracker = new PlaybackTracker(io);
    logger.info('Playback tracker initialized');

    // Start server FIRST so it can accept connections
    server.listen(config.port, '0.0.0.0', () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
      logger.info(`WebSocket server enabled`);
    });

    // Load plugins AFTER server is listening (if plugin manager is available)
    if (pluginManager) {
      try {
        logger.info('Loading plugins...');
        await pluginManager.loadPlugins(pluginsDir);

        // Mark plugins as loaded
        pluginsLoaded = true;
        logger.info('Plugins loaded, health endpoint now active');

        // Start enabled plugins (routes are now mounted dynamically by PluginManager)
        await pluginManager.startPlugins(io);

        // Plugin info endpoint
        app.get('/api/plugins', (req, res) => {
          const plugins = pluginManager.getPlugins();
          res.json({
            success: true,
            data: plugins
          });
        });

        logger.info(`Plugins loaded: ${pluginManager.getPlugins().length}`);
      } catch (error) {
        logger.error('Failed to load plugins:', error);
        logger.info('Continuing without plugins...');
      }
    } else {
      logger.info('Plugin system not available - running without plugins');
      // Add plugin info endpoint that returns empty list
      app.get('/api/plugins', (req, res) => {
        res.json({
          success: true,
          data: [],
          message: 'Plugin system not available'
        });
      });
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

export default app;