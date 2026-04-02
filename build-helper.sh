#!/bin/bash
# build-helper.sh — runs inside the kivy/buildozer Docker container.
#
# What it does:
#   1. Installs platforms;android-33 via sdkmanager (skipped if already installed)
#   2. Patches extra Java source files into the dist before Gradle compiles:
#        - com/github/hbldh/bleak/PythonScanCallback.java  (BLE support)
#        - org/kivy/android/PythonActivity.java             (file picker support)
#   3. Runs buildozer. If the first attempt fails (e.g. SDK not yet downloaded),
#      it installs the SDK platform and retries once.

SDK=/root/.buildozer/android/platform/android-sdk
MGR=$SDK/tools/bin/sdkmanager
DIST_JAVA=/home/user/hostcwd/.buildozer/android/platform/build-arm64-v8a/dists/meowprinter/src/main/java
JAVA_SRC=/home/user/hostcwd/android_java_src
MODE=${1:-debug}

cd /home/user/hostcwd

# ── Helper: install Android SDK platform 33 ──────────────────────────────────
install_platform() {
    if [ -f "$MGR" ]; then
        echo "=== Installing Android SDK platform 33 ==="
        yes | "$MGR" --sdk_root="$SDK" "platforms;android-33" "build-tools;33.0.0" 2>&1 \
            | grep -v "^\[=" | grep -v "^$" | tail -10
        echo "=== Platform 33 ready ==="
        return 0
    fi
    return 1
}

# ── Helper: patch Java files into the dist ───────────────────────────────────
patch_java() {
    if [ -d "$DIST_JAVA" ] && [ -d "$JAVA_SRC" ]; then
        echo "=== Patching Java source files into dist ==="

        # bleak BLE helpers (scan + GATT callbacks)
        mkdir -p "$DIST_JAVA/com/github/hbldh/bleak"
        cp "$JAVA_SRC/com/github/hbldh/bleak/"*.java \
           "$DIST_JAVA/com/github/hbldh/bleak/"

        # PythonActivity with WebChromeClient file-picker support
        cp "$JAVA_SRC/org/kivy/android/PythonActivity.java" \
           "$DIST_JAVA/org/kivy/android/"

        echo "=== Java patching done ==="
    fi
}

# ── Step 1: pre-install platform if SDK already in cache ─────────────────────
install_platform

# ── Step 2: patch Java (in case dist already exists from a prior build) ──────
patch_java

# ── Step 3: run buildozer ─────────────────────────────────────────────────────
if yes | buildozer android "$MODE"; then
    exit 0
fi

# ── Step 4: if it failed, SDK may have just been downloaded — install + retry ─
echo ""
echo "=== First attempt failed. Installing SDK platform and retrying... ==="
echo ""
if install_platform; then
    patch_java   # dist may now exist after the failed first run
    yes | buildozer android "$MODE"
else
    echo "=== BUILD FAILED: SDK not available ==="
    exit 1
fi
