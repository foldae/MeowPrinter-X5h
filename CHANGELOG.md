# Changelog

## 1.1.0-x5h.1

### Added

- Added verified X5h-DBA2 support.
- Added direct reconnection to the last associated printer.
- Added printer connection status to the application header.
- Added a first-run printer setup dialog.
- Added a hamburger navigation drawer.
- Added an advanced text editor with font, size, alignment, wrapping, and LTR/RTL controls.
- Added light, dark, and system theme modes.
- Added a native Android system-theme bridge.
- Added final APK verification for the required Android Java bridge classes.
- Added a distinct MeowPrinter X5h application icon.

### Changed

- Moved printer scanning and connection controls from Print to Settings.
- Changed the default BLE scan duration to five seconds.
- Improved the mobile header and active navigation state.
- Kept the original preview visible while print controls scroll independently.
- Reduced vertical padding and line spacing for text printing.
- Improved Android keyboard handling in the text editor.
- Reworked the Android build workflow to preserve the original Java bridge.
- Updated application branding and About information for the foldae-maintained fork.

### Fixed

- Fixed missing `PythonScanCallback` in Android builds.
- Fixed missing `PythonBluetoothGattCallback` in Android builds.
- Fixed Android image-file selection.
- Fixed root-owned Docker artifacts blocking later builds.
- Fixed the printer setup dialog remaining open after connection.
- Fixed formatted text not appearing correctly in the editor preview.
- Fixed excessive blank paper around short text jobs.
- Fixed the system theme not following Android night mode.
- Fixed content being covered when the mobile header height changes.
- Fixed the active hamburger-menu section being visually indistinguishable.

### Removed

- Removed obsolete and duplicated interface controls.
- Removed the legacy dark-theme checkbox.
