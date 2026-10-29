#!/bin/bash
set -euo pipefail
MODE="${1:-debug}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[1/4] Building original frontend"
cd frontend
npm install --silent
npx vite build
cd "$ROOT"

echo "[2/4] Preparing original private data"
rm -rf www meowprinter
cp -r frontend/dist www
cp -r backend/src/meowprinter meowprinter
cp -r frontend/public/locales meowprinter/locales 2>/dev/null || true

echo "[3/4] Checking original Android Java sources"
for f in \
  android_java_src/com/github/hbldh/bleak/PythonScanCallback.java \
  android_java_src/com/github/hbldh/bleak/PythonBluetoothGattCallback.java \
  android_java_src/org/kivy/android/PythonActivity.java; do
  [ -f "$f" ] || { echo "Missing original source: $f" >&2; exit 1; }
done

echo "[4/4] Building and verifying APK in Docker"
mkdir -p "$HOME/.buildozer"
docker run --rm -it \
  --network host \
  --entrypoint /bin/bash \
  -e HOME=/home/user \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -v "$ROOT:/home/user/hostcwd" \
  -v "$HOME/.buildozer:/home/user/.buildozer" \
  kivy/buildozer:latest \
  /home/user/hostcwd/build-helper.sh "$MODE"
