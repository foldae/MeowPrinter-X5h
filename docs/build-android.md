# Android APK Build Guide

This guide explains how to build the MeowPrinter Android APK from source.
The build uses **Docker** and **Buildozer** so you don't need Android Studio,
and the entire toolchain is self-contained inside the container.

---

## Prerequisites

### Docker Desktop

Download and install from [docker.com](https://www.docker.com/products/docker-desktop/).
Make sure the Docker daemon is running before building.

### Node.js 18+

The build script compiles the frontend before packaging.
Download from [nodejs.org](https://nodejs.org/).

That's it. Everything else (Android SDK, NDK, Python for Android) is downloaded
automatically on the first build.

---

## Building

Open PowerShell in the `MeowPrinter/` folder and run:

```powershell
.\build-android.ps1
```

What the script does:
1. Runs `npm run build` inside `frontend/` to compile the web UI
2. Copies `frontend/dist/` → `www/` (served by the on-device HTTP server)
3. Copies `backend/src/meowprinter/` → `meowprinter/` (Python source for the APK)
4. Launches the `kivy/buildozer` Docker container, which:
   - Downloads Android SDK + NDK on first run (~1 GB, cached afterwards)
   - Compiles Python 3 and all dependencies for ARM64
   - Patches the bleak BLE Java classes into the Gradle project
   - Patches `PythonActivity.java` for WebView file picker support
   - Runs Gradle to produce the APK
5. Copies the finished APK to `bin/`

**First build:** 30–90 minutes (downloads ~3 GB of SDK/NDK/Python packages).
**Subsequent builds:** 3–10 minutes (SDK and compiled packages are cached in
`~/.buildozer/`).

The APK lands at:
```
bin\meowprinter-1.0.0-arm64-v8a-debug.apk
```

---

## Build a release APK

```powershell
.\build-android.ps1 release
```

Note: release APKs must be signed before installing. Debug APKs can be
sideloaded directly.

---

## Installing on your phone

Enable **Developer Options** and **USB Debugging**, then:

```bash
adb install bin\meowprinter-1.0.0-arm64-v8a-debug.apk
```

Or copy the APK to the phone and open it with a file manager.

---

## Architecture

```
build-android.ps1  (Windows host)
  └─ docker run kivy/buildozer
       └─ build-helper.sh  (inside container)
            ├─ sdkmanager: install platforms;android-33
            ├─ patch_java(): copy bleak + PythonActivity Java files into dist
            └─ buildozer android debug
                 └─ python-for-android (p4a)
                      ├─ compile Python 3 + deps for arm64-v8a
                      ├─ bundle meowprinter/ + www/ as private data
                      └─ Gradle → APK
```

On Android, the app starts a lightweight HTTP server (`server_lite.py`) on
`localhost:8095` using Python's stdlib `http.server` (no FastAPI/uvicorn).
The WebView bootstrap connects to it and loads the same frontend.

---

## Known issues and fixes already applied

These problems were encountered during development and are already fixed in
the repository. You should not hit them, but they are documented here in case
something similar appears.

### 1. `bleak` Java classes missing at runtime

**Symptom:** `JVM exception: Didn't find class "com.github.hbldh.bleak.PythonScanCallback"`
**Cause:** `bleak` ships two Java helper classes
(`PythonScanCallback.java` and `PythonBluetoothGattCallback.java`) that must
be compiled into the APK. Buildozer does not do this automatically.
**Fix:** `build-helper.sh` copies both files from `android_java_src/` into
the Gradle dist before compiling. The Java source files are committed in
`android_java_src/com/github/hbldh/bleak/`.

### 2. File picker not working in WebView

**Symptom:** Tapping "Open image" or "Open badge" on Android did nothing.
**Cause:** The default p4a WebView bootstrap does not implement
`WebChromeClient.onShowFileChooser()`, so `<input type="file">` silently fails.
**Fix:** A patched `PythonActivity.java` (in `android_java_src/org/kivy/android/`)
adds a `WebChromeClient` with `onShowFileChooser` and `onActivityResult` support.
`build-helper.sh` patches it in every build.

### 3. `warn_on_root = 1` causes build to hang

**Symptom:** Build waits for input forever inside Docker (no TTY).
**Cause:** Buildozer prompts interactively when running as root.
**Fix:** `buildozer.spec` has `warn_on_root = 0`.

### 4. `orientation = user` is invalid

**Symptom:** Buildozer error about unknown orientation value.
**Fix:** Changed to `orientation = portrait` in `buildozer.spec`.

### 5. Android SDK platform not installed by default

**Symptom:** Gradle fails with "Failed to find target android-33".
**Cause:** The `kivy/buildozer` Docker image only has the SDK command-line tools,
not the actual platform packages.
**Fix:** `build-helper.sh` runs `sdkmanager "platforms;android-33" "build-tools;33.0.0"` before Buildozer starts.

### 6. Cache stored in `/root/.buildozer` instead of `/home/user/.buildozer`

**Cause:** The build runs as root inside Docker (needed to fix other permission
issues). Buildozer therefore writes its cache to `/root/` not `/home/user/`.
**Fix:** `build-android.ps1` mounts `~/.buildozer` on the host to
`/root/.buildozer` in the container, so the cache persists correctly.

---

## Possible issues you may still encounter

### BLE permissions denied on Android 12+

Android 12 added new `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` permissions that
require runtime approval. The app requests them on first launch. If you dismiss
the dialog, go to **Settings → Apps → MeowPrinter → Permissions** and enable
Nearby devices.

### Samsung / One UI icon shows white background

Samsung's launcher applies its own adaptive icon shape and may ignore the
`android.adaptive_icon_background` setting. This is a Samsung-specific
behaviour with no reliable fix from the app side. The icon functions correctly;
only the appearance is affected.

### App settings reset to defaults after update

The app stores settings in internal storage. Uninstalling or doing a data clear
before installing the new APK resets everything to defaults (including
`scan_time = 12 s`). This is expected.

### First scan takes longer than expected

The default scan time is 12 seconds. Some printers (especially PD01) can take
8–10 seconds to appear. If your printer is not found, try scanning again or
move it closer to the phone.

### `docker: Error response from daemon: ...`

Make sure Docker Desktop is running. On Windows, Docker Desktop must be started
manually after reboot (it does not always auto-start).

### Build fails with `Could not find or load main class`

This can happen if the `.buildozer/` cache is corrupted. Delete
`~/.buildozer/android/` and rebuild. The first build will re-download the SDK.

---

## Updating the app

After changing Python backend code or frontend source:

```powershell
.\build-android.ps1
```

The build script always rebuilds the frontend and re-copies the Python source,
so your changes are included. Only the final Gradle step is incremental
(re-runs only if source changed).

---

## Linux / macOS build

A `build-android.sh` script is provided for non-Windows hosts:

```bash
chmod +x build-android.sh
./build-android.sh
```

It performs the same steps as the PowerShell script.
