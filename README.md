# MeowPrinter X5h

MeowPrinter X5h is a modified fork of [MeowPrinter](https://github.com/elyez-dev/MeowPrinter), originally created by **elyez-dev**.

This fork is developed and maintained by **[foldae](https://github.com/foldae)**. It adds verified support for the **X5h-DBA2** thermal printer, Android build fixes, automatic printer reconnection, an improved mobile interface, and advanced text-printing controls.

The project remains licensed under **GPL-3.0-or-later**.

## Highlights

### Verified X5h-DBA2 support

- BLE discovery and connection
- Direct reconnection to the last associated printer
- 384 px print width
- Verified text and image printing
- Five-second default scan duration
- Printer connection state in the application header

### Android reliability

- Preserved `PythonScanCallback`
- Preserved `PythonBluetoothGattCallback`
- Preserved the custom `PythonActivity` file picker
- Verified Java bridge classes in the final APK
- Docker and Buildozer workflow with ownership recovery
- APK output marked as verified only after DEX checks pass

### Interface improvements

- Printer setup and connection controls moved to Settings
- First-run printer setup dialog
- Automatic dialog dismissal after a successful connection
- Hamburger navigation for Print, Settings, and About
- Clearly visible active navigation state
- Light, dark, and system theme modes
- Native Android system-theme integration
- Persistent, readable print preview while adjusting content

### Text printing

- Sans Serif, Serif, and Monospace fonts
- Font size from 12 to 96 px
- Left, center, and right alignment
- LTR and RTL direction
- Optional word wrapping
- Android keyboard-aware editor layout
- Reduced vertical whitespace and paper use

## Supported device

The fork has been tested with:

- **Model:** X5h-DBA2
- **Print width:** 384 px
- **Architecture:** Android arm64-v8a

Other compatible printer revisions may work, but have not been verified by the maintainer.

## Build

The Android build uses Docker, Buildozer, and python-for-android.

For normal TypeScript and CSS changes, use:

```bash
./build-android.sh debug
```

Do not run a clean Android rebuild for ordinary frontend changes. A clean rebuild recreates the Python build environment and is only appropriate when native dependencies or the Android toolchain change.

A successful verified build ends with:

```text
VERIFIED: PythonScanCallback present
VERIFIED: PythonBluetoothGattCallback present
VERIFIED: original PythonActivity file picker present
```

Install only the APK whose filename ends in `-verified.apk`.

## Known limitations

- Interactive image cropping with draggable handles is not implemented yet.
- Automatic reconnection requires Bluetooth to be enabled and Android Nearby Devices permission to have been granted.
- Thermal energy and quality may require adjustment across printer hardware revisions.
- Hardware support is verified specifically on X5h-DBA2.

## Credits

MeowPrinter X5h is based on [MeowPrinter](https://github.com/elyez-dev/MeowPrinter), originally created by **elyez-dev**.

X5h-DBA2 compatibility, Android build corrections, interface changes, and text-printing improvements are developed and maintained by **foldae**.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
