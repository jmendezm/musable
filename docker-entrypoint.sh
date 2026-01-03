#!/bin/sh
set -e

echo "🔍 Checking if rebuild is needed..."

# Force rebuild if environment variable is set
if [ "$FORCE_REBUILD" = "true" ]; then
    echo "🔄 FORCE_REBUILD is set to true. Rebuilding everything..."
    rm -f /app/.build_stamp
fi

# Check if this is the first run (no build stamp)
if [ ! -f /app/.build_stamp ]; then
    echo "🚀 First run or build stamp missing. Installing dependencies and building..."
    npm run install:all
    npm run build
    touch /app/.build_stamp
    echo "✅ Build complete!"
else
    # Check if backend source is newer than build stamp
    if find /app/backend/src -type f -newer /app/.build_stamp 2>/dev/null | grep -q .; then
        echo "📝 Backend source changes detected. Rebuilding..."
        npm run build
        touch /app/.build_stamp
        echo "✅ Backend rebuild complete!"
    fi

    # Check if frontend source is newer than build stamp
    if find /app/frontend/src -type f -newer /app/.build_stamp 2>/dev/null | grep -q .; then
        echo "🎨 Frontend source changes detected. Rebuilding..."
        cd /app/frontend && npm run build && cd /app
        touch /app/.build_stamp
        echo "✅ Frontend rebuild complete!"
    fi

    # Check if package.json files changed
    if [ /app/package.json -nt /app/.build_stamp ] 2>/dev/null || \
       [ /app/backend/package.json -nt /app/.build_stamp ] 2>/dev/null || \
       [ /app/frontend/package.json -nt /app/.build_stamp ] 2>/dev/null ]; then
        echo "📦 Package changes detected. Reinstalling dependencies..."
        npm run install:all
        touch /app/.build_stamp
        echo "✅ Dependencies reinstalled!"
    fi

    echo "✅ All checks passed. No rebuild needed."
fi

echo "Initializing database..."
if ! npm run db:init; then
  echo "WARNING: Database initialization encountered errors, but continuing..."
fi

echo "Running database migrations..."
# The init script also runs ALTER TABLE statements for migrations
# These will be skipped if columns already exist

echo "Starting Musable server..."
exec npm start
