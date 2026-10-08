#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -z "${ANDROID_HOME:-}" ] && [ -d .sdk/platforms/android-36 ]; then
    export ANDROID_HOME="$PWD/.sdk"
fi
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK with API 36}"
: "${VITE_API_BASE:?Set VITE_API_BASE to your backend URL (HTTPS for release)}"
if [ -z "${WEATHER_JAVA_HOME:-}" ]; then
    for candidate in "$PWD"/.sdk/java/*/Contents/Home; do
        if [ -x "$candidate/bin/java" ]; then WEATHER_JAVA_HOME="$candidate"; break; fi
    done
fi
npm run build
CAPACITOR_CLI_DISABLE_UPDATE_CHECK=1 npx cap sync android
cd android
if [ -n "${WEATHER_JAVA_HOME:-}" ]; then
    JAVA_HOME="$WEATHER_JAVA_HOME" ./gradlew assembleDebug --console=plain
else
    ./gradlew assembleDebug --console=plain
fi
