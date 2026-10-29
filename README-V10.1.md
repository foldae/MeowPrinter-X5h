# v10.1 build-script correction

The v10 helper used `set -o pipefail` together with `yes | buildozer`. After a
successful first-pass build, `yes` receives SIGPIPE and returns status 141,
causing the helper to exit before copying the Java sources and before the
verified Gradle rebuild. v10.1 invokes Buildozer directly; Android licenses are
already persisted in the mounted SDK cache.

Apply this archive over the v10 project, then run:

    rm -rf bin
    ./build-android.sh debug 2>&1 | tee build-v10.1.log

Do not install unless the log ends with all three VERIFIED lines and the APK
name ends in `-verified.apk`.
