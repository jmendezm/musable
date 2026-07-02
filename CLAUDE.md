# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Musable is a self-hosted personal music library with a Spotify-like web UI. It's a monorepo with an Express/TypeScript backend and a React/TypeScript frontend, backed by SQLite. Key differentiators from a plain music player: real-time synchronized "listening rooms" (Socket.IO), a filesystem library scanner with live file watching, and optional YouTube/YouTube Music integration for discovering and downloading missing songs.

## Commands

Run from the repo root unless noted. The root `package.json` orchestrates both apps; `backend/` and `frontend/` also have their own scripts.

```bash
npm run install:all     # install root, backend, and frontend deps
npm run dev              # run backend (ts-node-dev) and frontend (CRA) concurrently
npm run build             # build frontend, copy its build output into backend/public, then build backend
npm start                 # start built backend (serves API + built frontend from backend/public)
npm run clean              # remove all node_modules/build/dist output
```

Backend only (`cd backend`):
```bash
npm run dev              # ts-node-dev with hot reload, port 3001
npm run build              # tsc compile to dist/, copies src/models/schemas into dist/
npm test                    # jest
npm run test:watch          # jest --watch
npx jest path/to/file.test.ts   # run a single test file (no test files exist yet — add alongside source)
npm run lint / lint:fix     # eslint on src/**/*.ts
npm run db:init             # initialize SQLite schema (run against dist/, so build first)
npm run db:seed             # seed sample data
```

Frontend only (`cd frontend`, Create React App):
```bash
npm start                    # dev server, port 3000, proxies /api to localhost:3001
npm run build                 # production build to frontend/build
npm test                      # react-scripts test (CRA/Jest)
npm run lint / lint:fix       # eslint on src, .ts/.tsx
```

There is no Playwright test suite present yet, despite `@playwright/test` being a frontend devDependency.

### Docker

The `Dockerfile` builds frontend and backend in separate stages and produces a single unified image (backend serves the built frontend as static files from `backend/public`). Use `docker-compose up -d` with `.env.docker` (copy from `.env.docker.example`) for the standard deployment path — see README for volume/env details (`MUSIC_PATH` read-only library, `MUSIC_UPLOAD_PATH` for adding new files at runtime).

## Architecture

### Two independent apps, one deployable unit

- `backend/` — Express + TypeScript API server, port 3001 by default.
- `frontend/` — React 18 + TypeScript CRA app, port 3000 in dev.
- In production/Docker, the frontend is built and copied into `backend/public`; `backend/src/app.ts` serves it as static files and falls back to `index.html` for any non-`/api`, non-`/health`, non-`/uploads` route (SPA routing). In dev, CRA's `proxy` field forwards `/api` to `http://localhost:3001`.
- The frontend does NOT use CRA's proxy for its "real" base URL — it loads runtime config from `public/config.json` (or `config.dev.json` on localhost:3000) via `frontend/src/config/config.ts`, giving `BASE_URL`/`API_BASE_URL`/`WEBSOCKET_URL`. Changing API/WS endpoints for a deployment means editing that JSON file, not env vars or rebuilding.

### Backend layout

Standard layered structure: `routes/` → `controllers/` → `models/` (+ `services/` for cross-cutting logic like the library scanner, room sync, and YouTube integration).

- **Config**: `src/config/config.ts` reads all runtime settings from `process.env` (see `.env.example`) with defaults — JWT/session secrets, library paths, supported audio formats, YouTube toggles, admin bootstrap credentials, CORS origin.
- **Database**: `src/config/database.ts` is a singleton wrapping `sqlite3` with promisified `query`/`get`/`run`/`transaction` helpers. Schema lives in `src/models/schemas/database.sql` (tables: users, invites, artists, albums, songs, playlists, playlist_songs, favorites, album_follows, playlist_follows, listen_history, scan_history, sessions, settings, library_paths, share_tokens, listening_rooms, room_participants, room_queue, room_messages). `npm run db:init` applies it; `WAL` mode and foreign keys are enabled on connect.
- **Models**: each is a class with instance methods hitting the `Database` singleton directly with raw SQL, exported as a ready-made singleton instance (e.g. `export default new SongModel()`, `new UserModel()`). Import and call directly — there's no repository/DI layer.
- **Auth**: JWT-based (`src/middleware/auth.ts`), token in `Authorization: Bearer <token>`. `authenticateToken` (required), `optionalAuth`, and `requireAdmin` middlewares populate `req.user`. Sessions (`express-session` + `connect-sqlite3`) are also wired up in `app.ts` but auth is primarily JWT-driven. Registration is invite-only (`invites` table).
- **Streaming**: `src/routes/stream.ts` serves audio with HTTP Range support (206 partial content) directly from disk via `fs.createReadStream`.
- **Library scanning**: `src/services/libraryScanner.ts` walks configured `LIBRARY_PATHS`, extracts metadata via `music-metadata`, extracts/generates artwork via `sharp`, and uses `chokidar` to watch for filesystem changes and auto-update the library.
- **Real-time rooms**: `src/services/roomService.ts` owns a `socket.io` `Server` instance (constructed once in `app.ts` and passed into `createRoomRoutes(io)` for `src/routes/rooms.ts`, and into `RoomService`). It tracks in-memory `RoomState` per room (current song/position/playing flag) alongside the `listening_rooms`/`room_participants`/`room_queue` DB tables, authenticates sockets via JWT in a socket middleware, and broadcasts playback sync events (`play`/`pause`/`seek`/`song_change`) plus chat/queue updates to room members. `roomService.startPeriodicSync()` runs continuously once the server starts.
- **YouTube integration**: `src/services/youtubeService.ts` and `ytMusicService.ts` (routes `youtube.ts`/`ytMusic.ts`) search for missing songs/artwork and download via `yt-dlp`/`ytdl-core`; gated by `YOUTUBE_ENABLED`/`YOUTUBE_API_KEY`.
- **Uploads**: served from `config.uploadPath` (`music/`, `artwork/`, `profile-pictures/` subfolders), created on boot if missing, with manual CORS headers applied in `app.ts` since they're served cross-origin from the API in dev.

### Frontend layout

- **Routing**: `src/App.tsx` defines all routes with React Router v6. `/share/:token` is public; `/login`/`/register/:token?` redirect away if already authenticated; everything else is wrapped in `ProtectedRoute` + `MainLayout`, with `/admin/*` requiring `ProtectedRoute requireAdmin`.
- **State**: Zustand stores in `src/stores/` — `authStore` (JWT/profile), `playerStore` (Howler.js playback engine, queue, shuffle/repeat, Media Session API integration for OS-level media controls), `roomStore` (listening room state), `followedAlbumsStore`/`followedPlaylistsStore`. Stores call `services/api.ts` (Axios) directly rather than going through components.
- **Audio playback**: `playerStore.ts` wraps `Howler.js`; room-aware behavior (e.g. next-track logic when in a synced room) is factored into `src/utils/roomPlayback.ts` rather than living in the store itself.
- **Realtime**: `src/services/roomService.ts` (frontend) manages the `socket.io-client` connection using `WEBSOCKET_URL` from runtime config; `roomStore` and `RoomView`/`Rooms` pages consume it.
- **Config loading is async and must complete before API/WS calls**: `loadConfig()` fetches the runtime JSON config; `getConfig()`/`getApiBaseUrl()`/`getWebSocketUrl()` throw if called before it resolves.

### Path aliases

Backend `tsconfig.json` defines `@/*`, `@/models/*`, `@/controllers/*`, `@/routes/*`, `@/services/*`, `@/middleware/*`, `@/utils/*`, `@/config/*` — but existing source uses relative imports (`../models/...`) rather than aliases; check before introducing alias-based imports to a file that doesn't already use them.

## Reference docs

- `README.md` — features, install/Docker/production deployment steps, environment variable reference.
- `API_ENDPOINTS.md` — full REST API surface.
- `SCREENSHOTS.md` — UI screenshots.
