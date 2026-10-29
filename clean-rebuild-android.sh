#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-debug}"
mkdir -p "$HOME/.buildozer"

# Delete root-owned project artifacts from inside Docker.
docker run --rm \
  --entrypoint /bin/bash \
  -e HOME=/home/user \
  -v "$ROOT:/home/user/hostcwd" \
  kivy/buildozer:latest \
  -lc 'rm -rf \
    /home/user/hostcwd/.buildozer/android/platform/build-arm64-v8a/dists/meowprinter \
    /home/user/hostcwd/.buildozer/android/app \
    /home/user/hostcwd/bin'

exec "$ROOT/build-android.sh" "$MODE"
