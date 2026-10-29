# MeowPrinter X5h minimal + verified build patch

Apply these files to the ORIGINAL MeowPrinter repository. The application
change is only the X5h-DBA2 model registry entry. Frontend and Android Java
files are not modified.

The build is two-stage. It generates the p4a project, overlays the original
Bleak callbacks and original file-picker PythonActivity, compiles Gradle
without invoking Buildozer again, then rejects the APK unless all required
symbols occur in the final DEX. The disposable first-pass APK is deleted.

Commands:

    unzip -o MeowPrinter-X5h-v10-build-patch.zip -d /path/to/original/MeowPrinter
    cd /path/to/original/MeowPrinter
    ./apply-x5h-patch.sh
    ./clean-rebuild-android.sh |& tee build-v10.log

Install only if the log contains all three VERIFIED lines. The only APK left
in bin/ is named `*-verified.apk`.
