#!/bin/bash
# MeowPrinter — Android APK build script (Linux/Mac/CI)
# Prerequisites: Docker
#
# Usage:
#   ./build-android.sh          # Build debug APK
#   ./build-android.sh release  # Build release APK

set -e

MODE="${1:-debug}"

echo ""
echo "=== MeowPrinter Android Build ==="
echo ""

# 1. Build frontend
echo "[1/4] Building frontend..."
cd frontend && npm install --silent && npx vite build && cd ..
echo "  Frontend built."

# 2. Copy frontend dist into www/
echo "[2/4] Preparing www/ for APK..."
rm -rf www
cp -r frontend/dist www
echo "  www/ ready."

# 3. Copy backend source to root
echo "[3/4] Preparing Python source..."
rm -rf meowprinter
cp -r backend/src/meowprinter meowprinter
cp -r frontend/public/locales meowprinter/locales 2>/dev/null || true
echo "  Python source ready."

# 4. Run Buildozer in Docker
echo "[4/4] Building APK with Docker..."
echo "  Mode: $MODE"
echo ""

mkdir -p "$HOME/.buildozer"

docker run --rm \
    -v "$PWD:/home/user/hostcwd" \
    -v "$HOME/.buildozer:/home/user/.buildozer" \
    kivy/buildozer:latest \
    android "$MODE"

echo ""
echo "=== BUILD COMPLETE ==="
echo "APK location:"
find bin -name "*.apk" 2>/dev/null
echo ""
