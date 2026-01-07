# Unified Dockerfile for Musable (Backend + Frontend)
FROM node:18-alpine

# Install runtime and build dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    tzdata \
    python3 \
    make \
    g++

# Create app user early
RUN addgroup -g 1001 -S nodejs && \
    adduser -S musable -u 1001

# Set working directory
WORKDIR /app

# Create necessary directories with correct permissions BEFORE copying files
RUN mkdir -p /app/backend/data/uploads/profile-pictures \
    /app/backend/data/uploads/artwork \
    /app/backend/data/uploads/artists \
    /app/backend/data/logs \
    /app/backend/data/yt-downloads \
    /music && \
    chown -R musable:nodejs /app /music

# Copy package files first (for better caching)
COPY --chown=musable:nodejs package*.json ./
COPY --chown=musable:nodejs backend/package*.json ./backend/
COPY --chown=musable:nodejs frontend/package*.json ./frontend/

# Copy scripts folder (needed for install:plugins)
COPY --chown=musable:nodejs scripts/ ./scripts/

# Switch to non-root user BEFORE installing packages
USER musable

# Install all dependencies (root, backend, frontend)
RUN npm run install:all && npm cache clean --force

# Copy rest of the application
COPY --chown=musable:nodejs . .

# Copy and make entrypoint executable
COPY --chown=musable:nodejs docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Environment variable to force rebuild (can be set in docker-compose or Unraid)
ENV FORCE_REBUILD=false

# Expose ports (3001 for backend)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Use entrypoint script for smart rebuild detection
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Start the application in production mode (entrypoint handles build checks)
CMD ["node", "dist/app.js"]