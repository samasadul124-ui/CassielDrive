# MOVIE-RAJA → MovieBox-TUI GUI — Integration Guide

A real, programmatic GUI for the existing **MovieBox-TUI** Rust backend, built
on top of the existing **MOVIE-RAJA** React/TypeScript frontend.

**MOVIE-RAJA UI → frontend API/service layer → moviera-adapter (local HTTP) →
MovieBox-TUI Rust core (`moviebox_tui` crate) → providers / metadata / streams /
downloads / Live TV / addons**

> The GUI is a **client/frontend around MovieBox-TUI**. It does not host media.
> All provider logic, metadata, stream resolution, downloading and player
> launching is performed by the existing MovieBox-TUI implementation. Upstream
> licensing (MIT OR Apache-2.0) and disclaimers of MovieBox-TUI apply.

---

## 1. Repository layout

```
movie_raja/
├── .github_pat.txt          # ← your GitHub PAT, plain text (gitignored)
├── build_colab.py           # Colab/Linux build helper (reads .github_pat.txt)
├── README-GUI.md            # this file
└── moviera-gui/
    ├── frontend/            # MOVIE-RAJA React UI (Vite + Tailwind + Framer Motion)
    │   └── src/
    │       ├── api/         # NEW: typed service layer (client, types, hooks, platform)
    │       ├── components/  # existing UI, rewired to real backend data
    │       └── data/        # mockData.ts kept only as reference (unused in production)
    ├── backend/
    │   └── moviebox-tui/    # MovieBox-TUI Rust core (vendored, upstream intact)
    ├── gui-adapter/         # NEW: thin Rust HTTP adapter over moviebox_tui (no fork)
    ├── src-tauri/           # NEW: Tauri 2 desktop shell (Linux/Win/macOS)
    └── platform/
        ├── linux/           # Linux build docs
        └── android/         # Android build docs + scripts
```

## 2. What is MovieBox-TUI functionality vs GUI functionality

| Capability | Provided by | GUI's role |
| --- | --- | --- |
| Catalog/homepage rows, search, details, seasons/episodes | MovieBox-TUI providers (MovieBox, 4KHDHub, BDIX CircleFTP/DhakaFlix, Addons) | display real data, never invents it |
| Poster/backdrop artwork URLs | MovieBox-TUI provider responses | render remote images (`RemoteImage`), local fallbacks only |
| Stream/release resolution (quality, mirrors, auth headers) | MovieBox-TUI (`get_resources` + `ReleaseProvider` impls) | consumes the resolved source |
| Player launch (mpv/VLC/IINA/Android intent, header-aware) | `moviebox_tui::player` (same code as the TUI) | desktop: Tauri command/adapter spawns it; web: inline `<video>` or local command |
| Subtitles (external caption resolution) | MovieBox-TUI (`get_ext_captions`) | list + pass-through |
| Downloads (segmented, resume, cancel, speed) | `moviebox_tui::download` engine | start/cancel, poll real progress |
| Live TV (M3U/JSON playlist parsing, tv config file) | `moviebox_tui` tv module (`M3UParser`, `config::tv_path`) | load playlist, show channels, play `stream_url` |
| Addons (manifest install, enable/disable, catalog, search) | `moviebox_tui` addons module + `config::load_addons` | install/manage UI, browse real catalogs |
| Settings (default player, download dir, provider, toggles) | `moviebox_tui::config` (shared config file with the TUI) | real get/put, no fake state |
| Netflix-style layout, modals, search UX, animations | MOVIE-RAJA frontend | preserved design |

## 3. Backend adapter API contract (moviera-adapter)

Local HTTP/JSON, bound to `127.0.0.1:8787` (override: `MOVIERA_ADAPTER_HOST`,
`MOVIERA_ADAPTER_PORT`). Implemented in `moviera-gui/gui-adapter` — every
handler delegates to `moviebox_tui`; nothing is reimplemented.

| Endpoint | Method | Purpose | Request / Response |
| --- | --- | --- | --- |
| `/api/health` | GET | adapter + backend status, detected players | → `{ok, backend, players[], active_providers[]}` |
| `/api/home?tab=&page=` | GET | backend homepage rows (tab id e.g. `latest`, `trending`, `popular`) | → `{tab, page, items: CatalogItem[], metrics}` |
| `/api/search?q=&provider=&page=` | GET | search one provider or `all` (fan-out over enabled providers) | → `{provider, items: CatalogItem[], failures[]}` |
| `/api/details/{provider}/{id}?subtitles=&resource_id=` | GET | full metadata (MediaDetails) + optional real subtitles | → `{details: MediaDetails, subtitles[]}` |
| `/api/streams/{provider}/{id}?season=&episode=&resolution=` | GET | playable releases (movies: `season=0&episode=0`) | → `{releases: Release[]}` |
| `/api/play` | POST | resolve the real stream; optional `auto_launch` (spawns local player via `moviebox_tui::player`) | `{provider?, id, season?, episode?, resolution?, player?, auto_launch?}` → `{source: {url, headers[], quality, …}, releases[], launched, player}` |
| `/api/subtitles/{provider}/{id}?resource_id=` | GET | external caption options | → `{subtitles: [{name,url}]}` |
| `/api/downloads` | GET | real task registry | → `{downloads: DownloadTask[]}` (state: downloading/completed/failed/canceled, downloaded, total, bps) |
| `/api/downloads/start` | POST | start a real download via the MovieBox-TUI engine (resume + cancel supported) | body like `/api/play` → `{id, destination}` |
| `/api/downloads/cancel?id=` | POST | cancel a task | → `{id, canceled}` |
| `/api/tv/channels` | GET | channels from the MovieBox-TUI tv config file | → `{channels: LiveChannel[], loaded, file}` |
| `/api/tv/load` | POST | download+parse M3U/JSON playlist into the MovieBox-TUI tv config (shared with the TUI) | `{url}` → `{channels, count}` |
| `/api/addons` | GET | installed addons (`config::load_addons`) | → `{addons: InstalledAddon[]}` |
| `/api/addons/install` | POST | validate manifest via `AddonClient`, register addon | `{url, enabled?}` → `{addons}` |
| `/api/addons/remove?url=` | POST | unregister | → `{removed, addons}` |
| `/api/addons/set-enabled?url=&enabled=` | POST | enable/disable | → `{addons}` |
| `/api/addons/manifest?url=` | GET | raw manifest (catalog/type discovery for the UI) | → manifest JSON |
| `/api/addons/catalog?manifest=&type=&catalog=` | GET | addon catalog (real items) | → `{items: CatalogItem[]}` |
| `/api/addons/search?manifest=&type=&catalog=&q=` | GET | addon search | → `{items: MetaItem[]}` |
| `/api/settings` | GET | MovieBox-TUI `Config` + detected players + resolved download dir + per-provider capabilities | → `{config, players[], download_dir, capabilities}` |
| `/api/settings` | PUT | partial update, persisted with `config::save` (same file the TUI uses) | body: any of `default_player, download_dir, active_provider, streaming_enabled, tv_enabled, addons_enabled, bdix_enabled, auto_update, active_mode, active_theme` → `{config}` |

Key backend types (serialized as-is by the adapter; mirrored in
`frontend/src/api/types.ts`): `CatalogItem`, `MediaDetails`, `Season`,
`Episode`, `Release`, `SourceMirror`, `SubtitleOption`, `Channel` (Live TV),
`InstalledAddon`, `Config`.

## 4. Dynamic image pipeline

```
MovieBox-TUI provider  →  poster/backdrop URL in CatalogItem/MediaDetails
  →  adapter JSON  →  frontend Title.heroImage
  →  Hero / ContentCard / DetailModal via <RemoteImage>
  →  real remote image (lazy, no-referrer)
  →  on missing URL or load failure: local gradient + icon fallback
```

Local images remain only for the app logo/UI placeholders. The old bundled
JPGs are no longer used as movie artwork.

## 5. Frontend service layer

```
UI components  →  src/api/hooks (useAsync: loading/error/retry)
              →  src/api/client.ts (typed, single fetch path, timeouts)
              →  platform.ts (Tauri / web / Android detection)
              →  adapter HTTP (Tauri: 127.0.0.1:8787 spawned by the shell;
                  web dev: Vite proxy /api → 127.0.0.1:8787)
```

Components consume typed `Title` / `MediaDetails` / `DownloadTask` /
`LiveChannel` / `InstalledAddon` models and know nothing about MovieBox-TUI
internals. Backend-unreachable/offline states are shown explicitly — no fake
content is ever rendered.

## 6. Development setup

```bash
cd moviera-gui/gui-adapter
cargo run                       # adapter on http://127.0.0.1:8787

cd moviera-gui/frontend
npm install
npm run dev                     # http://localhost:1420  (proxies /api)
```

Desktop dev (adapter auto-spawned by the shell):

```bash
cd moviera-gui/frontend && npm i -D --no-save @tauri-apps/cli@^2
cd ../src-tauri && ../frontend/node_modules/.bin/tauri dev
```

## 7. Linux production build (Tauri 2)

See [`platform/linux/README.md`](moviera-gui/platform/linux/README.md).
Summary: system deps (webkit2gtk-4.1, gtk3) → `cargo build --release`
(adapter) → `npm run build` (frontend) → `tauri build --bundles appimage,deb`.
The Tauri shell auto-starts the adapter and shares MovieBox-TUI's config,
downloads, TV and addon state. Player: mpv (or VLC) installed on the machine.

## 8. Android build (shared architecture)

See [`platform/android/README.md`](moviera-gui/platform/android/README.md).
Same React UI + TS API layer in a Tauri 2 Android WebView; the adapter is the
same Rust binary. Playback differences vs desktop are documented there
(WebView inline playback by default; MovieBox-TUI's `AndroidIntent` player for
the Termux route — desktop mpv assumptions do not apply).

## 9. Google Colab build — get `pkg.tar.zst` + APK directly

Open **`build_colab.ipynb`** (repository root) in Google Colab and run the
cells: it clones the repo, writes your PAT to `.github_pat.txt` (plain text,
§10), runs the whole build in the background (immune to Colab's 10-minute
cell timeout — a watch cell re-runs if it times out), and then downloads the
artifacts with one cell:

| Downloaded file | What it is |
| --- | --- |
| `dist/pkg.tar.zst` | **Linux package**: `bin/moviera` (Tauri app, embedded React UI) + `bin/moviera-adapter` (MovieBox-TUI core) + `bin/run.sh` launcher + `web/` fallback UI + licenses. Unpack: `tar --zstd -xf pkg.tar.zst && ./moviera-gui-linux/bin/run.sh` |
| `dist/moviera-android-debug.apk` | **Android APK** (installable, debug-signed). Install with `adb install` |
| `dist/linux-AppImage/`, `dist/linux-deb/` | AppImage / .deb bundles when produced |

Equivalently in a plain cell:

```python
!git clone --depth 1 https://github.com/rajaisinlove-a11y/movie_raja && cd movie_raja
!echo "YOUR_GITHUB_PAT_HERE" > .github_pat.txt   # plain text PAT (see §10)
!nohup python build_colab.py > build.log 2>&1 &
!tail -f build.log | grep -m1 'BUILD SUMMARY'; tail -n 80 build.log
!from google.colab import files; files.download('dist/pkg.tar.zst'); files.download('dist/moviera-android-debug.apk')
```

`build_colab.py` pipeline: system deps (incl. webkit2gtk-4.1, zstd, JDK 17)
→ rustup → Node → vendored pins (frontend is project code, never auto-updated) → `npm install` →
frontend build → adapter release build → Tauri Linux build → **Android SDK +
NDK setup and `tauri android build` (debug APK)** → packages `dist/pkg.tar.zst`
and copies the APK into `dist/`. Each step reports OK/FAIL independently
(`dist/ARTIFACTS.txt` lists what was produced).

Notes:
- The Android step needs ~8 GB free disk on the VM (SDK+NDK+Gradle+Rust
  target); the helper warns and continues. If it fails, re-run just
  `--steps android` after freeing space.
- A **signed release APK** is optional: export
  `TAURI_ANDROID_SIGNING_KEYSTORE` / `..._KEYSTORE_PASSWORD` /
  `..._KEY_ALIAS` / `..._KEY_ALIAS_PASSWORD` in a cell, then
  `!python build_colab.py --steps android --android-release`.

## 10. GitHub PAT — plain text configuration

The build/setup code reads the token directly from a plain-text file. No other
format, no environment variable export, no credential manager.

1. Open `.github_pat.txt` (repository root — create it if missing).
2. Paste the GitHub PAT as plain text:

   ```
   YOUR_GITHUB_PAT_HERE
   ```

3. Save the file.
4. Run the build/setup process (`python build_colab.py` or the steps you need).

`build_colab.py` uses the token for git operations against GitHub (updating
the vendored upstream repositories). The file is listed in `.gitignore` so
your actual token is never committed. If the file is missing, the helper
reports:

```
.github_pat.txt not found — create this file and paste your GitHub PAT as plain text.
```

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| "MovieBox backend is not reachable" in the web UI | start the adapter: `cargo run` in `moviera-gui/gui-adapter` (or the desktop app, which auto-starts it) |
| Home/search empty but no error | the provider tab returned nothing — try another tab; check provider health from the MovieBox-TUI itself |
| Play works in adapter but browser shows black screen | the stream needs auth headers / can't be embedded — use the desktop app (auto-launch) or the mpv command the modal offers |
| `mpv: not found` on Linux | `sudo apt install mpv` (VLC works as alternative) |
| Tauri build fails with webkit errors | install `libwebkit2gtk-4.1-dev` + `libgtk-3-dev` + `libayatana-appindicator3-dev` |
| Android build: `JAVA_HOME`/SDK errors | JDK 17 + `ANDROID_HOME` set, licenses accepted (see platform/android/README.md) |
| Downloads resume from scratch after restart | check `download_dir` in Settings matches where the `.part` files live |

## 12. Legal / technical position

- MOVIE-RAJA GUI is a client for MovieBox-TUI; it hosts no media.
- Upstream MovieBox-TUI is MIT OR Apache-2.0 — attribution and disclaimers are
  preserved (see `moviera-gui/backend/moviebox-tui/` and its README).
- MOVIE-RAJA frontend is used as its upstream project provides it
  (`frontend/UPSTREAM.md`).
