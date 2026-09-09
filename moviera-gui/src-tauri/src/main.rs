// MOVIE-RAJA GUI — Tauri 2 desktop shell (Linux/Windows/macOS).
//
// Responsibilities (kept intentionally thin):
//   1. Start the `moviera-adapter` binary (the MovieBox-TUI core HTTP adapter)
//      as a local child process on 127.0.0.1:8787, if it is not already up.
//   2. Expose `adapter_url` so the shared React UI talks to the real backend.
//   3. `play_external`: launch the resolved stream in the local player using
//      MovieBox-TUI's own player command builder (mpv/VLC/... with auth headers).
//   4. `open_downloads_dir`: open the MovieBox-TUI download directory.
//
// All provider/search/metadata logic stays in the MovieBox-TUI backend.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use moviebox_tui::player;

const ADAPTER_HOST: &str = "127.0.0.1";
const ADAPTER_PORT: u16 = 8787;

/// Keeps the spawned adapter child alive for the lifetime of the app.
static CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

fn adapter_base_url() -> String {
    let port = std::env::var("MOVIERA_ADAPTER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(ADAPTER_PORT);
    format!("http://{ADAPTER_HOST}:{port}")
}

fn current_port() -> u16 {
    std::env::var("MOVIERA_ADAPTER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(ADAPTER_PORT)
}

fn port_is_open(port: u16) -> bool {
    let addr = format!("{ADAPTER_HOST}:{port}");
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

fn wait_for_adapter(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if port_is_open(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    port_is_open(port)
}

fn find_adapter_binary() -> Option<PathBuf> {
    // 1. explicit override
    if let Ok(p) = std::env::var("MOVIERA_ADAPTER_BIN") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    // 2. next to the app binary (pkg.tar.zst layout, or co-located builds)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["moviera-adapter", "moviera-adapter.exe"] {
                let p = dir.join(name);
                if p.exists() {
                    return Some(p);
                }
            }
            // 2b. Tauri bundled resources (bin layout varies between AppImage/deb):
            //     AppImage:  <image>/moviera           + <image>/resources/moviera-adapter
            //     AppImage:  <image>/usr/bin/moviera   + <image>/resources/moviera-adapter
            //     .deb:      /usr/bin/moviera          + /usr/share/com.moviera.gui/resources/
            for p in [
                dir.join("resources/moviera-adapter"),
                dir.join("../resources/moviera-adapter"),
                dir.join("../../resources/moviera-adapter"),
                dir.join("../share/com.moviera.gui/resources/moviera-adapter"),
            ] {
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    // 3. dev fallbacks: workspace target dirs
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(workspace) = manifest.parent() {
        for p in [
            workspace.join("target/release/moviera-adapter"),
            workspace.join("target/debug/moviera-adapter"),
            workspace.join("gui-adapter/target/release/moviera-adapter"),
            workspace.join("gui-adapter/target/debug/moviera-adapter"),
        ] {
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

/// Idempotent: spawns the adapter once, waits for it to come up.
fn ensure_adapter_ready() {
    static STARTED: OnceLock<()> = OnceLock::new();
    let _ = STARTED.get_or_init(|| {
        let port = current_port();
        if !wait_for_adapter(port, Duration::from_millis(300)) {
            match find_adapter_binary() {
                Some(bin) => match std::process::Command::new(&bin)
                    .env("MOVIERA_ADAPTER_HOST", ADAPTER_HOST)
                    .env("MOVIERA_ADAPTER_PORT", port.to_string())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        eprintln!("moviera: spawned adapter {}", bin.display());
                        // keep the child handle so the process lives with us
                        *CHILD.lock().unwrap() = Some(child);
                    }
                    Err(e) => eprintln!("moviera: failed to spawn adapter: {e}"),
                },
                None => eprintln!(
                    "moviera: adapter binary not found. Build it with: \
                     cargo build --release -p moviera-adapter (or set MOVIERA_ADAPTER_BIN)"
                ),
            }
        }
        wait_for_adapter(port, Duration::from_secs(25));
    });
}

#[tauri::command]
fn adapter_url() -> Result<String, String> {
    ensure_adapter_ready();
    Ok(adapter_base_url())
}

#[tauri::command]
fn play_external(
    url: String,
    headers: Vec<(String, String)>,
    subtitle: Option<String>,
) -> Result<String, String> {
    let detected = player::detect();
    let kind = detected
        .first()
        .copied()
        .unwrap_or(player::PlayerKind::Mpv);
    let mut cmd = player::command(kind, &url, subtitle.as_deref(), &headers, None, None, None);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    cmd.spawn()
        .map(|_| kind.label().to_string())
        .map_err(|e| format!("could not launch {}: {e}", kind.label()))
}

#[tauri::command]
fn open_downloads_dir() -> Result<String, String> {
    let cfg = moviebox_tui::config::load();
    let dir = moviebox_tui::service::resolve_download_dir(cfg.download_dir.as_deref().map(Path::new));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    let _ = std::process::Command::new(opener).arg(&dir).spawn();
    Ok(dir.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            adapter_url,
            play_external,
            open_downloads_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running MOVIE-RAJA GUI");
}
