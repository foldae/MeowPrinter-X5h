# X5h-DBA2 support

## Verified hardware

- Model name: `X5h-DBA2`
- Print width: 384 px
- Transport: Bluetooth Low Energy
- Tested Android architecture: arm64-v8a

## Verified functions

- BLE discovery
- Manual connection
- Direct reconnection to the saved device address
- Text printing
- Image selection through the Android system picker
- Image printing
- Brightness, processing mode, rotation, and flip controls
- Thermal strength and quality controls
- Advanced text formatting

## Android bridge requirements

The APK must contain:

- `com.github.hbldh.bleak.PythonScanCallback`
- `com.github.hbldh.bleak.PythonBluetoothGattCallback`
- the customized `org.kivy.android.PythonActivity`
- `onShowFileChooser`
- `onActivityResult`

The build workflow verifies these components before copying the final APK to `bin/`.

## Release verification

- [ ] `PythonScanCallback` is present in the final DEX
- [ ] `PythonBluetoothGattCallback` is present in the final DEX
- [ ] Android file selection opens successfully
- [ ] X5h-DBA2 appears after scanning
- [ ] Manual connection succeeds
- [ ] Automatic reconnection succeeds
- [ ] Text printing succeeds
- [ ] Image printing succeeds
- [ ] Advanced text formatting prints correctly
- [ ] Light theme works
- [ ] Dark theme works
- [ ] System theme follows Android night mode
- [ ] Final APK filename ends in `-verified.apk`
- [ ] SHA-256 checksum is generated for the release APK

## Known limitations

- Interactive image cropping with draggable handles is planned but not implemented.
- Automatic reconnection requires Bluetooth to be enabled and the required Android permission to have been granted.
- Hardware revisions other than X5h-DBA2 are not covered by the current verification checklist.
