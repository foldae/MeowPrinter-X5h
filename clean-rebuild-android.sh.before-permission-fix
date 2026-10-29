#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
rm -rf .buildozer/android/platform/build-arm64-v8a/dists/meowprinter
rm -rf .buildozer/android/app
rm -rf bin
exec ./build-android.sh debug
