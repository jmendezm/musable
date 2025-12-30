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

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S musable -u 1001

# Set working directory
WORKDIR /app

# Copy entire project
COPY . .

# Install all dependencies (root, backend, frontend)
RUN npm run install:all && npm cache clean --force

# Create necessary directories with correct permissions
RUN mkdir -p /app/uploads /app/yt-downloads /app/data /music && \
    chown -R musable:nodejs /app /music

# Switch to non-root user
USER musable

# Expose ports (3001 for backend, 3000 for frontend dev server)
EXPOSE 3001 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the application in development mode
CMD ["npm", "run", "dev"]
