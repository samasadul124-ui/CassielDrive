# MOVIE-RAJA GUI — Linux (Tauri) build

Production Linux desktop app: **Rust (Tauri 2) shell + shared React frontend +
moviera-adapter + MovieBox-TUI core**.

## Prerequisites

```bash
# Ubuntu/Debian
sudo apt install build-essential curl wget git pkg-config libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  libjavascriptcoregtk-4.1-dev librsvg2-dev
# Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Node.js >= 20
node -v
```

Player: install **mpv** (recommended; VLC works too) — the adapter/shell
detects local players via the MovieBox-TUI player detection.

## Build

```bash
cd moviera-gui

# 1. frontend bundle
cd frontend && npm install && npm run build

# 2. adapter (MovieBox-TUI core HTTP API)
cd ../gui-adapter && cargo build --release

# 3. Tauri app (AppImage + .deb)
cd ../frontend && npm i --no-save @tauri-apps/cli@^2
cd ../src-tauri
MOVIERA_ADAPTER_BIN=$PWD/../gui-adapter/target/release/moviera-adapter \
  ../frontend/node_modules/.bin/tauri build --bundles appimage,deb
```

Simpler: use the repository root helper —

```bash
python build_colab.py --steps deps,rust,node,frontend-deps,frontend-build,adapter,linux,collect
```

Artifacts land in `src-tauri/target/release/bundle/` (and are copied to `dist/`).
The `collect` step always produces **`dist/pkg.tar.zst`** — a self-contained
Linux package (`bin/moviera` + `bin/moviera-adapter` + `bin/run.sh` +
`web/` fallback UI + licenses). Unpack with `tar --zstd -xf pkg.tar.zst`.

## Dev loop (hot reload)

```bash
# terminal 1 — adapter
cd moviera-gui/gui-adapter && cargo run
# terminal 2 — web UI (Vite proxies /api → 127.0.0.1:8787)
cd moviera-gui/frontend && npm install && npm run dev
# open http://localhost:1420
```

Or run the desktop shell in dev (adapter auto-spawned):

```bash
cd moviera-gui/frontend && npm i --no-save @tauri-apps/cli@^2
cd ../src-tauri && ../frontend/node_modules/.bin/tauri dev
```

## Notes

- The Tauri shell auto-starts `moviera-adapter` (looked up via
  `MOVIERA_ADAPTER_BIN`, next to the executable, or the workspace `target/`
  dirs) and waits for `127.0.0.1:8787`.
- All backend state (config, addons, TV playlist, downloads) lives in the
  standard MovieBox-TUI locations, shared with the TUI.
