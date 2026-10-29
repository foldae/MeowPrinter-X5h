#!/bin/bash
set -euo pipefail
MODE="${1:-debug}"
ROOT=/home/user/hostcwd
HOST_UID="${HOST_UID:-1000}"
HOST_GID="${HOST_GID:-1000}"
restore_host_ownership() {
  chown -R "$HOST_UID:$HOST_GID" "$ROOT/.buildozer" "$ROOT/bin" 2>/dev/null || true
}
trap restore_host_ownership EXIT
DIST="$ROOT/.buildozer/android/platform/build-arm64-v8a/dists/meowprinter"
JAVA="$DIST/src/main/java"
SRC="$ROOT/android_java_src"

cd "$ROOT"

P4A="$ROOT/.buildozer/android/platform/python-for-android"
if [ -d "$P4A" ]; then
  git config --global --add safe.directory "$P4A"
  if ! git -C "$P4A" config --get remote.origin.url >/dev/null 2>&1; then
    git -C "$P4A" remote remove origin 2>/dev/null || true
    git -C "$P4A" remote add origin https://github.com/kivy/python-for-android.git
  fi
fi

# Generate the p4a distribution and all Gradle files. Its APK is disposable.
buildozer android "$MODE"

# Never allow the disposable first-pass APK to be mistaken for the verified APK.
rm -rf "$ROOT/bin"
mkdir -p "$ROOT/bin"

[ -x "$DIST/gradlew" ] || { echo 'Generated Gradle project not found' >&2; exit 1; }

# Overlay the ORIGINAL project Java bridge after p4a generation.
mkdir -p "$JAVA/com/github/hbldh/bleak" "$JAVA/org/kivy/android"
install -m 0644 "$SRC/com/github/hbldh/bleak/PythonScanCallback.java" "$JAVA/com/github/hbldh/bleak/PythonScanCallback.java"
install -m 0644 "$SRC/com/github/hbldh/bleak/PythonBluetoothGattCallback.java" "$JAVA/com/github/hbldh/bleak/PythonBluetoothGattCallback.java"
install -m 0644 "$SRC/org/kivy/android/PythonActivity.java" "$JAVA/org/kivy/android/PythonActivity.java"

# Verify the file picker remains in the original activity source.
grep -q 'onShowFileChooser' "$JAVA/org/kivy/android/PythonActivity.java"
grep -q 'onActivityResult' "$JAVA/org/kivy/android/PythonActivity.java"

# Compile the patched Gradle project directly. Buildozer is NOT called again.
cd "$DIST"
rm -rf build .gradle
if [ "$MODE" = release ]; then
  ./gradlew --no-daemon clean assembleRelease
  CANDIDATE=$(find build/outputs/apk -type f -name '*release*.apk' | head -n 1)
else
  ./gradlew --no-daemon clean assembleDebug
  CANDIDATE=$(find build/outputs/apk -type f -name '*debug*.apk' | head -n 1)
fi
[ -n "$CANDIDATE" ] || { echo 'Gradle produced no APK' >&2; exit 1; }

# Verify the candidate itself BEFORE making it available in bin/.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q "$CANDIDATE" 'classes*.dex' -d "$TMP"
find "$TMP" -type f -name 'classes*.dex' -exec strings {} + > "$TMP/dex.txt"
for symbol in PythonScanCallback PythonBluetoothGattCallback PythonActivity onShowFileChooser; do
  grep -q "$symbol" "$TMP/dex.txt" || { echo "APK verification failed: missing $symbol" >&2; exit 1; }
done

FINAL="$ROOT/bin/meowprinter-1.0.0-arm64-v8a-${MODE}-verified.apk"
cp -f "$CANDIDATE" "$FINAL"

echo 'VERIFIED: PythonScanCallback present'
echo 'VERIFIED: PythonBluetoothGattCallback present'
echo 'VERIFIED: original PythonActivity file picker present'
echo "VERIFIED APK: $FINAL"
