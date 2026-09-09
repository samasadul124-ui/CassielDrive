#!/usr/bin/env bash
# One-time Android scaffolding for the Tauri app (run on a machine with JDK 17 + Android SDK).
set -euo pipefail
cd "$(dirname "$0")/../../src-tauri"

if ! command -v node >/dev/null; then echo "Node.js is required"; exit 1; fi
if ! command -v java >/dev/null; then echo "JDK 17 is required (java not found)"; exit 1; fi
if [ -z "${ANDROID_HOME:-}" ]; then echo "Set ANDROID_HOME (Android SDK root)"; exit 1; fi

if [ ! -d gen/android ]; then
  (cd ../frontend && npm i -D @tauri-apps/cli@^2 >/dev/null)
  ../frontend/node_modules/.bin/tauri android init
  echo "Android project generated in src-tauri/gen/android"
else
  echo "gen/android already exists — skipping init"
fi
echo "Next: platform/android/scripts/build.sh [debug|release]"
