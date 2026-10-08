#!/bin/sh
# Signed release bundle (AAB) for Google Play. Signing: docs/RELEASE.md.
set -eu
cd "$(dirname "$0")/.."
if [ -z "${ANDROID_HOME:-}" ] && [ -d .sdk/platforms/android-36 ]; then
    export ANDROID_HOME="$PWD/.sdk"
fi
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK with API 36}"
: "${VITE_API_BASE:?Set VITE_API_BASE to the HTTPS backend URL}"
case "$VITE_API_BASE" in https://*) ;; *) echo "Release builds need an HTTPS VITE_API_BASE" >&2; exit 1;; esac
SIGNING="${KAIRO_SIGNING_PROPERTIES:-$HOME/.kairo/upload-keystore.properties}"
if [ ! -f "$SIGNING" ] && [ "${KAIRO_ALLOW_UNSIGNED:-}" != 1 ]; then
    echo "No signing properties at $SIGNING (see docs/RELEASE.md)" >&2; exit 1
fi
if [ -z "${WEATHER_JAVA_HOME:-}" ]; then
    for candidate in "$PWD"/.sdk/java/*/Contents/Home; do
        if [ -x "$candidate/bin/java" ]; then WEATHER_JAVA_HOME="$candidate"; break; fi
    done
fi
npm run build
CAPACITOR_CLI_DISABLE_UPDATE_CHECK=1 npx cap sync android
cd android
if [ -n "${WEATHER_JAVA_HOME:-}" ]; then export JAVA_HOME="$WEATHER_JAVA_HOME"; fi
./gradlew bundleRelease --console=plain
cd ..
VERSION=$(sed -n 's/^ *versionName "\(.*\)"/\1/p' android/app/build.gradle)
CODE=$(sed -n 's/^ *versionCode \([0-9]*\)/\1/p' android/app/build.gradle)
mkdir -p output
OUT="output/kairo-$VERSION-$CODE.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT"
echo "Release bundle: $OUT"
