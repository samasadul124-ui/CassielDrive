# MOVIE-RAJA GUI — Android build

Shared architecture: the **same React UI + TypeScript API layer** runs in a
Tauri 2 Android WebView. The MovieBox-TUI Rust backend is compiled for
`aarch64-linux-android` and exposed through the same `moviera-adapter` HTTP
API (bound to the device loopback). No second application is created.

## Playback differences (important)

MovieBox-TUI supports Android playback via its `AndroidIntent` player kind
(via `termux-open`/`am` on Termux) — do **not** assume desktop mpv behavior.
In the GUI:

- **Android WebView (default)**: the backend resolves the stream exactly as on
  Linux; the GUI plays it inline via the WebView `<video>` element when the
  stream allows embedding. Streams requiring auth headers are surfaced with a
  clear message (they cannot be embedded in a WebView).
- **Termux route (optional)**: if you run the adapter under Termux with the
  MovieBox-TUI Android player configuration, `auto_launch` uses the
  `AndroidIntent` player kind from the same `moviebox_tui::player` code.

## Prerequisites (local machine)

- JDK 17
- Android SDK (Android Studio): `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"`
- `ANDROID_HOME` exported, licenses accepted
- Rust + Android targets: `rustup target add aarch64-linux-android`
- Node.js >= 20

## Build (debug)

```bash
cd moviera-gui/frontend && npm install
cd ../src-tauri
npm i -D @tauri-apps/cli@^2 --prefix ../frontend
../frontend/node_modules/.bin/tauri android init      # first time only
../frontend/node_modules/.bin/tauri android build --debug
# APK: src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk
```

Or scripted:

```bash
moviera-gui/platform/android/scripts/init.sh    # one-time scaffolding
moviera-gui/platform/android/scripts/build.sh debug
```

## Notes

- `tauri android init` generates `src-tauri/gen/android` — commit it if you
  want reproducible Android builds (it is Tauri-generated, like Xcode projects).
- Release builds need an Android keystore (`tauri android build --release`
  prompts / uses `TAURI_ANDROID_SIGNING_KEYSTORE`).
- If a step is not feasible in your environment (e.g. Colab without an SDK),
  `build_colab.py --steps android` reports exactly what remains.
