# Musable

A self-hosted personal music library with Spotify-like design and features. Stream your music collection anywhere with a beautiful, responsive web interface.

**Have questions or suggestions?** Join our Discord community: https://discord.gg/A4ymNnQkP2

**Want to see it in action?** Check out the [Screenshots](SCREENSHOTS.md)

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Docker Deployment](#docker-deployment)
- [Configuration](#configuration)
- [Plugins](#plugins)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Support](#support)

## Features

### Music Library Management
- **Smart Library Scanner**: Automatically scan and organize your music files
- **Metadata Extraction**: Extract artist, album, title, duration, and album artwork
- **File Format Support**: MP3, FLAC, WAV, M4A, AAC, OGG
- **Real-time File Watching**: Auto-detect new files and changes

### Spotify-like Interface
- **Dark Theme**: Beautiful, modern dark interface
- **Responsive Design**: Works on all devices
- **Grid & List Views**: Multiple ways to browse your collection

### Advanced Audio Player
- **High-Quality Streaming**: Range request support for smooth playback
- **Queue Management**: Add, reorder, and manage your playback queue
- **Playback Modes**: Shuffle, repeat, and volume control
- **Equalizer**: Built-in equalizer with presets
- **Keyboard Shortcuts**: Control playback with your keyboard

### Real-time Music Rooms
- **Listening Rooms**: Create/join rooms with friends
- **Synchronized Playback**: Everyone hears the same music at the same time
- **Host Controls**: Host controls what plays for everyone

### User Management
- **Invite-only Registration**: Admin-controlled user creation
- **Role-based Access**: Admin and regular user roles
- **User Profiles**: Personal settings and preferences

### Admin Panel
- **User Management**: Create invites and manage users
- **Library Management**: Scan library and manage songs
- **Analytics Dashboard**: Server stats and listening trends
- **Metadata Editor**: Edit song metadata and album artwork

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Your music library

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/musable/musable
cd musable
```

2. **Install all dependencies**
```bash
npm run install:all
```

3. **Start Musable**
```bash
npm run dev
```

4. **Access Musable**
- Open http://localhost:3000 in your browser
- The first user created automatically becomes admin (admin@admin.com / admin123)
- Add your music library paths in the admin panel
- Start a library scan and enjoy your music!

That's it! Musable will automatically create the database on first run.

## Docker Deployment (Recommended)

The easiest way to run Musable is with Docker Compose.

**Prerequisites:**
- Docker and Docker Compose installed
- Your music library folder

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/musable/musable
cd musable
```

2. **Configure environment**<br>
Edit `docker-compose.yml` and update the environment variables section

3. **Start Musable**
```bash
docker compose up -d
```

4. **Access Musable**
- Open http://localhost:3000 in your browser
- Login with your configured credentials

### Updating Musable

When a new version is released, update with these commands:
```bash
docker compose down    # Stop the container
docker compose pull     # Pull the latest image
docker compose up -d    # Restart with the new version
```

### Useful Commands

```bash
docker compose logs -f      # View logs in real-time
docker compose down         # Stop Musable
docker compose restart      # Restart Musable
docker compose exec musable sh  # Access container shell
```

### Data Persistence

Your data is stored in Docker volumes:
- `musable_data` - Database and application data
- `musable_uploads` - User uploaded files and artwork

The volumes persist even when you stop or update the container.

## Configuration

### Environment Variables

Musable uses environment variables for configuration. Copy `.env.example` to `.env` in the root directory.

**All available environment variables:**

**Server Configuration:**
- `PORT` - Frontend port (default: 3000)
- `BACKEND_PORT` - Backend port (default: 3001)
- `NODE_ENV` - Environment mode (development/production)
- `DATABASE_PATH` - SQLite database file path (default: ./musable.db)

**Frontend Configuration (Create React App - must use REACT_APP_ prefix):**
- `REACT_APP_BASE_URL` - Frontend base URL (default: http://127.0.0.1:3000)
- `REACT_APP_API_BASE_URL` - Backend API URL (default: http://127.0.0.1:3001/api)
- `REACT_APP_WEBSOCKET_URL` - WebSocket URL for real-time features (default: ws://127.0.0.1:3001)

**Security (CHANGE IN PRODUCTION!):**
- `JWT_SECRET` - Secret for JWT token signing
- `JWT_EXPIRES_IN` - JWT token expiration (default: 7d)
- `SESSION_SECRET` - Secret for session management

**Audio Configuration:**
- `SUPPORTED_FORMATS` - JSON array of audio formats (default: ["mp3","flac","wav","m4a","aac","ogg"])

**Initial Admin User:**
- `ADMIN_EMAIL` - Email for initial admin account (default: admin@admin.com)
- `ADMIN_PASSWORD` - Password for initial admin account (default: admin123)

**CORS & Rate Limiting:**
- `CORS_ORIGIN` - Allowed CORS origin (default: http://127.0.0.1:3000)
- `RATE_LIMIT_WINDOW_MS` - Rate limit time window (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 10000)

**Logging:**
- `LOG_LEVEL` - Logging level (default: info)

### Library Setup

1. Go to Admin Panel → Library Management
2. Add your music folder paths
3. Click "Start Library Scan"
4. Your music will be organized automatically from metadata

**Recommended folder structure:** `Artist/Album/Track.mp3`

## Plugins

Musable supports a plugin system to extend functionality.

**Official Plugins Repository:** https://git.breadjs.nl/musable/musable-plugins

Available plugins include:
- **YouTube Integration**: Add music from YouTube
- **OpenSubsonic API**: Subsonic-compatible API for third-party clients
- And more coming soon...

To install plugins:
1. Navigate to the `plugins/` directory
2. Clone or add plugins as subdirectories
3. Run `npm run build:plugins` from the root directory
4. Restart Musable

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration (invite required)
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/password` - Change password

### Library
- `GET /api/library/songs` - Get songs with filtering
- `GET /api/library/artists` - Get artists
- `GET /api/library/albums` - Get albums
- `POST /api/library/scan` - Start library scan (admin)

### Playlists
- `GET /api/playlists` - Get playlists
- `POST /api/playlists` - Create playlist
- `PUT /api/playlists/:id` - Update playlist
- `DELETE /api/playlists/:id` - Delete playlist

### Music Rooms
- `GET /api/rooms/public` - Get public rooms
- `POST /api/rooms` - Create room
- `POST /api/rooms/join` - Join room
- `POST /api/rooms/:id/queue` - Add to queue
- `DELETE /api/rooms/:id/queue/:queueId` - Remove from queue

### Favorites & Following
- `GET /api/favorites` - Get favorite songs
- `POST /api/favorites/:songId` - Add to favorites
- `DELETE /api/favorites/:songId` - Remove from favorites
- `POST /api/albums/:id/follow` - Follow album
- `POST /api/playlists/:id/follow` - Follow playlist

### Sharing
- `POST /api/share/songs/:songId` - Create share link
- `GET /api/share/:token` - Access shared song

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - User management
- `POST /api/admin/invites` - Create invites
- `GET /api/admin/history` - Listening history

## Development

```bash
npm run dev          # Start both backend and frontend in dev mode
npm run build        # Build for production
npm run clean        # Clean all build artifacts
```

**Backend only:**
```bash
cd backend
npm run dev          # Start with hot reload
npm run test         # Run tests
```

**Frontend only:**
```bash
cd frontend
npm start            # Start dev server
npm run build        # Build for production
```

## Production Deployment

1. **Configure production environment**
```bash
cd backend
cp .env.example .env.production
# Edit with production settings
```

2. **Build applications**
```bash
npm run build
```

3. **Start production server**
```bash
cd backend
NODE_ENV=production npm start
```

4. **Configure reverse proxy** (nginx example)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Support

- **Issues**: Report bugs and feature requests via GitHub Issues
- **Plugins**: https://git.breadjs.nl/musable/musable-plugins
- **Community**: Join our Discord for support and discussions

## Donations

If you find Musable useful and would like to support its development, you can donate using the following cryptocurrency addresses:

- **Bitcoin (BTC)**: `bc1pxg5t5vh4nskpm4wncwund7x4ekxw2gzyecuxqc5k5pf9ssz5eg2sp30854`
- **Ethereum (ETH)**: `0x3fF92905E8b973bCE6b951F9C5DDb0fD3E2ea256`
- **USDT (TRC20)**: `TWXPW4gRLdhZhJca2aHDBV9D989DRKFLoY`
- **USDT (ERC20)**: `0x3fF92905E8b973bCE6b951F9C5DDb0fD3E2ea256`
- **USDT (BEP20)**: `0x3fF92905E8b973bCE6b951F9C5DDb0fD3E2ea256`
- **Litecoin (LTC)**: `ltc1qr57r6e9437l69gtu885nzzrlhc4hfp9z8edml8`

Your support is greatly appreciated!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
