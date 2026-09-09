#!/usr/bin/env bash
# Build the Android app. Usage: build.sh [debug|release]
set -euo pipefail
MODE="${1:-debug}"
cd "$(dirname "$0")/../../src-tauri"

if [ -z "${ANDROID_HOME:-}" ]; then echo "Set ANDROID_HOME (Android SDK root)"; exit 1; fi
rustup target add aarch64-linux-android 2>/dev/null || true

if [ ! -d gen/android ]; then
  echo "Android project not initialized — run platform/android/scripts/init.sh first"
  exit 1
fi

( cd ../frontend && [ -d node_modules ] || npm install --no-audit --no-fund )
CLI=../frontend/node_modules/.bin/tauri
[ -x "$CLI" ] || (cd ../frontend && npm i -D @tauri-apps/cli@^2 >/dev/null)

if [ "$MODE" = "release" ]; then
  "$CLI" android build --release
else
  "$CLI" android build --debug
fi

echo "APK: src-tauri/gen/android/app/build/outputs/apk/$MODE/app-$MODE.apk"
