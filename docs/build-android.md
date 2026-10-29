# Android build guide

This guide describes the verified Linux/Docker build workflow for MeowPrinter X5h.

## Requirements

- Docker
- Git
- Node.js 18 or newer
- npm
- A network connection for the first build

## Normal build

For TypeScript, CSS, documentation, branding, and ordinary Python source changes, run:

```bash
./build-android.sh debug
```

Do not run a clean Android rebuild for ordinary frontend changes. The normal build preserves the working Android distribution and avoids recreating the Python build environment.

The script automatically:

1. builds the Preact frontend;
2. copies frontend and backend sources into the Android private data;
3. recreates the pinned `python-for-android` checkout if it is absent;
4. builds the initial python-for-android distribution;
5. overlays the required Bleak callbacks and customized `PythonActivity`;
6. runs Gradle directly;
7. checks the final DEX;
8. copies only the verified APK to `bin/`.

## Required verification output

A successful build must include:

```text
VERIFIED: PythonScanCallback present
VERIFIED: PythonBluetoothGattCallback present
VERIFIED: original PythonActivity file picker present
```

Install only an APK whose filename ends in `-verified.apk`.

## Pinned python-for-android source

`build-android.sh` automatically checks out this pinned commit into the ignored `p4a-fixed/` directory:

```text
d2ee8c54d9d42375a95f18159e950a119671cf63
```

The directory is intentionally not committed. A clean clone recreates it automatically.

## Python 3.14 pip compatibility

The verified toolchain must not upgrade pip inside the temporary python-for-android virtual environment. If a checkout reintroduces:

```text
pip install -U pip
```

and fails with `BuildDependencyInstallError`, restore the pinned python-for-android commit above. Do not delete the Android SDK or NDK.

## Docker file ownership

The build passes the host UID and GID into the container and returns ownership of `.buildozer/` and `bin/` when the build exits. If old artifacts are still owned by root, repair them once:

```bash
sudo chown -R "$(id -u):$(id -g)" .buildozer bin
```

## Installing the APK

```bash
APK=$(find bin -maxdepth 1 -type f -name '*-verified.apk' | head -n 1)
adb uninstall io.github.meowprinter.meowprinter || true
adb install "$APK"
```

## Release checklist

- Build ends with all three `VERIFIED` lines.
- X5h-DBA2 scanning and connection work.
- Automatic reconnection works.
- Android image selection works.
- Text and image printing work.
- Light, dark, and system themes work.
- The release APK SHA-256 checksum is generated.
