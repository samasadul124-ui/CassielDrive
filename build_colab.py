#!/usr/bin/env python3
"""
build_colab.py — Google Colab / Linux build helper for the MOVIE-RAJA GUI.

Produces (in ./dist):
  * pkg.tar.zst              — Linux desktop package (Tauri app + MovieBox-TUI
                                adapter + launcher + fallback web UI)
  * moviera-android-*.apk    — Android APK (debug by default; release if
                                keystore env vars are provided)
  * linux-*/                 — AppImage / .deb bundles when produced
  * ARTIFACTS.txt            — manifest of everything collected

Pipeline (best effort, each step reports OK/FAIL independently):
  1.  deps          apt: build tools, webkit2gtk-4.1 (Tauri), zstd, JDK 17 (Android)
  2.  rust          rustup stable if missing
  3.  node          Node.js 22 / npm if missing
  4.  update-repos  keep vendored pins (frontend is project code — never auto-updated;
                    backend refresh only with MOVIERA_UPDATE_BACKEND=1, PAT-authenticated)
  5.  frontend-deps npm install
  6.  frontend-build vite production bundle
  7.  adapter       cargo build --release (MovieBox-TUI core HTTP adapter)
  8.  linux         Tauri build (AppImage/.deb + binary)
  9.  android       Android SDK/NDK setup + tauri android build (Colab-feasible)
  10. collect       package pkg.tar.zst + copy APK/bundles into dist/

USAGE (Colab cell or terminal):
    !python build_colab.py                          # everything, best effort
    !python build_colab.py --steps deps,rust,node,frontend,adapter
    !python build_colab.py --android-release        # signed release APK (needs keystore)
    !python build_colab.py --help

Colab tip: long steps exceed the default 10-minute cell timeout — run in
background and tail (see build_colab.ipynb):
    !nohup python build_colab.py > build.log 2>&1 &
    !tail -f build.log | grep -m1 'BUILD SUMMARY'

GITHUB PAT (plain text, per project requirement):
    Put your GitHub Personal Access Token as plain text in .github_pat.txt
    (repository root). Example file content:

        YOUR_GITHUB_PAT_HERE

    The helper reads that file directly. The token is used only to
    authenticate git operations against GitHub (updating the vendored
    upstream repos). If the file is missing, those steps are skipped with a
    clear report and the rest of the build continues.
"""

import argparse
import io
import os
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
GUI_ROOT = REPO_ROOT / "moviera-gui"
DIST = REPO_ROOT / "dist"
PAT_FILE = REPO_ROOT / ".github_pat.txt"
ANDROID_HOME = Path(os.environ.get("ANDROID_HOME", "/opt/android-sdk"))
CMDLINE_TOOLS_URL = (
    "https://dl.google.com/android/repository/"
    "commandlinetools-linux-11076708_latest.zip"
)

STEPS = [
    "deps",
    "rust",
    "node",
    "update-repos",
    "frontend-deps",
    "frontend-build",
    "adapter",
    "linux",
    "android",
    "collect",
]

RESULTS = {}
ARGS = None


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def banner(msg: str) -> None:
    print("\n" + "=" * 72, flush=True)
    print(f"## {msg}", flush=True)
    print("=" * 72, flush=True)


def step(name: str) -> None:
    banner(f"STEP: {name}")


def sh(cmd, cwd=None, pat: str | None = None, timeout: int = 3600,
       env_extra: dict | None = None, hide: bool = False) -> subprocess.CompletedProcess:
    """Run a shell command with live output (unless hide=True)."""
    env = os.environ.copy()
    env.setdefault("CARGO_TERM_COLOR", "never")
    env.setdefault("DEBIAN_FRONTEND", "noninteractive")
    if env_extra:
        env.update(env_extra)
    full = cmd if isinstance(cmd, str) else " ".join(cmd)
    if pat:
        if full.lstrip().startswith("git "):
            full = full.replace(
                "git ", f'git -c http.extraheader="Authorization: Bearer {pat}" ', 1
            )
    if not hide:
        print(f"$ {full.replace(pat, '***') if pat else full}", flush=True)
    return subprocess.run(
        full, shell=True, cwd=str(cwd) if cwd else None,
        env=env, timeout=timeout, check=False,
    )


def sh_capture(cmd: str, cwd=None) -> str:
    """Run quietly and return combined output (for version checks)."""
    try:
        r = subprocess.run(cmd, shell=True, cwd=str(cwd) if cwd else None,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True, timeout=120)
        return (r.stdout or "").strip()
    except Exception:
        return ""


def ok(rc: int) -> bool:
    return rc == 0


def record(name: str, success: bool, detail: str = "") -> None:
    RESULTS[name] = {"ok": success, "detail": detail}
    mark = "OK  " if success else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""), flush=True)


def read_pat() -> str | None:
    """Read the GitHub PAT directly from the plain-text file .github_pat.txt."""
    if PAT_FILE.exists():
        token = PAT_FILE.read_text(encoding="utf-8").strip()
        if token:
            print(f"GitHub PAT loaded from {PAT_FILE.name} ({len(token)} chars)", flush=True)
            return token
        print(f"WARNING: {PAT_FILE.name} exists but is empty — paste your GitHub PAT as plain text.", flush=True)
        return None
    print(
        f"{PAT_FILE.name} not found — create this file and paste your GitHub PAT as plain text.",
        flush=True,
    )
    return None


def has(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def cargo_env() -> dict:
    return {"PATH": f"{os.path.expanduser('~')}/.cargo/bin:" + os.environ.get("PATH", "")}


def free_gb(path: str = "/") -> float:
    try:
        st = os.statvfs(path)
        return (st.f_bavail * st.f_frsize) / (1024 ** 3)
    except OSError:
        return -1.0


def ensure_rust_path() -> str:
    """Source-line for cargo on PATH (used inside shell commands)."""
    return f". $HOME/.cargo/env 2>/dev/null || true"


# ---------------------------------------------------------------------------
# steps
# ---------------------------------------------------------------------------

def step_deps() -> bool:
    step("install system dependencies (apt)")
    pkgs = [
        "build-essential", "curl", "wget", "git", "pkg-config", "rsync", "unzip",
        "zstd",
        # Tauri Linux (webkit) build dependencies
        "libssl-dev", "libgtk-3-dev", "libwebkit2gtk-4.1-dev",
        "libayatana-appindicator3-dev", "librsvg2-dev", "libjavascriptcoregtk-4.1-dev",
        # Android toolchain (JDK 17 for Gradle/AGP)
        "openjdk-17-jdk-headless",
    ]
    sudo = "" if os.geteuid() == 0 else "sudo "
    r = sh(f"{sudo}apt-get update -y", timeout=900)
    if not ok(r.returncode):
        record("deps", False, "apt-get update failed")
        return False
    r = sh(f"{sudo}apt-get install -y " + " ".join(pkgs), timeout=1800)
    success = ok(r.returncode)
    record("deps", success, "build/webkit/zstd/JDK packages" if success else "apt install failed")
    return success


def step_rust() -> bool:
    step("install Rust toolchain (rustup) if missing")
    if has("cargo"):
        record("rust", True, sh_capture("cargo --version"))
        return True
    r = sh(
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh && "
        "sh /tmp/rustup.sh -y --profile minimal --default-toolchain stable",
        timeout=1200,
    )
    if not ok(r.returncode):
        record("rust", False, "rustup install failed")
        return False
    record("rust", ok(sh_capture(f"{ensure_rust_path()} && cargo --version")),
           sh_capture(f"{ensure_rust_path()} && cargo --version"))
    return has("cargo")


def step_node() -> bool:
    step("install Node.js / npm if missing")
    if has("node") and has("npm"):
        record("node", True, sh_capture("node -v && npm -v").replace("\n", " "))
        return True
    sudo = "" if os.geteuid() == 0 else "sudo "
    r = sh(
        f"{sudo}curl -fsSL https://deb.nodesource.com/setup_22.x | {sudo}bash - && "
        f"{sudo}apt-get install -y nodejs",
        timeout=1200,
    )
    success = ok(r.returncode) and has("node")
    record("node", success)
    return success


def step_update_repos(pat: str | None) -> bool:
    step("update vendored upstream repositories (MovieBox-TUI backend)")
    # IMPORTANT: moviera-gui/frontend is PROJECT code — the MOVIE-RAJA UI rewired
    # to the real MovieBox-TUI API (src/api/*, RemoteImage, BackendState, ...).
    # It is NEVER auto-replaced by the stock upstream frontend (that would put the
    # mock-data UI into the build). Only the pure-upstream backend is eligible,
    # and only when explicitly requested via MOVIERA_UPDATE_BACKEND=1.
    if not os.environ.get("MOVIERA_UPDATE_BACKEND"):
        record("update-repos", True,
               "vendored pins kept — frontend is project code (never auto-updated); "
               "set MOVIERA_UPDATE_BACKEND=1 to refresh the backend from upstream")
        return True
    if not pat:
        record("update-repos", True, "skipped — no GitHub PAT (vendored copies stay as-is)")
        return True
    url = "https://github.com/mesamirh/MovieBox-Tui"
    dest = GUI_ROOT / "backend" / "moviebox-tui"
    tmp = Path("/tmp/mb-update-MovieBox-Tui")
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    r = sh(f"git clone --depth 1 {url} {tmp}", pat=pat, timeout=900)
    if not ok(r.returncode):
        print("  clone failed — keeping vendored copy", flush=True)
        shutil.rmtree(tmp, ignore_errors=True)
        record("update-repos", False, "clone failed — vendored backend kept")
        return False
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(tmp, dest)
    (dest / "UPSTREAM.md").write_text(
        f"UPSTREAM: {url}\n"
        f"(refreshed {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())})\n")
    print(f"  updated {dest}", flush=True)
    shutil.rmtree(tmp, ignore_errors=True)
    record("update-repos", True, "backend refreshed from upstream")
    return True


def step_frontend_deps() -> bool:
    step("install frontend dependencies (npm)")
    r = sh("npm install --no-audit --no-fund", cwd=GUI_ROOT / "frontend", timeout=1800)
    success = ok(r.returncode)
    record("frontend-deps", success)
    return success


def step_frontend_build() -> bool:
    step("build frontend production bundle (vite)")
    r = sh("npm run build", cwd=GUI_ROOT / "frontend", timeout=900)
    success = ok(r.returncode)
    record("frontend-build", success, "frontend/dist/index.html" if success else "vite build failed")
    return success


def tauri_cli() -> str | None:
    """Install the Tauri CLI (npm, --no-save) and return its path, or None."""
    cli = GUI_ROOT / "frontend" / "node_modules" / ".bin" / "tauri"
    if not cli.exists():
        r = sh(
            "npm install --no-audit --no-fund --no-save @tauri-apps/cli@^2",
            cwd=GUI_ROOT / "frontend", timeout=900,
        )
        if not ok(r.returncode) or not cli.exists():
            return None
    return str(cli)


def step_adapter() -> bool:
    step("build moviera-adapter (Rust, MovieBox-TUI core) — release")
    r = sh(
        f"{ensure_rust_path()} && cargo build --release",
        cwd=GUI_ROOT / "gui-adapter",
        timeout=5400,
        env_extra=cargo_env(),
    )
    success = ok(r.returncode)
    record("adapter", success, "target/release/moviera-adapter" if success else "cargo build failed")
    return success


def step_linux() -> bool:
    step("build Tauri Linux desktop app (AppImage/.deb + binary)")
    cli = tauri_cli()
    if not cli:
        record("linux", False, "@tauri-apps/cli install failed")
        return False
    # The Tauri bundle embeds the adapter as a resource (bin/moviera-adapter),
    # so the release adapter binary must exist and be staged into src-tauri/bin/.
    adapter_bin = GUI_ROOT / "gui-adapter" / "target" / "release" / "moviera-adapter"
    if not adapter_bin.exists():
        record("linux", False,
               "adapter binary not found — run the 'adapter' step before 'linux'")
        return False
    bin_stage = GUI_ROOT / "src-tauri" / "bin"
    bin_stage.mkdir(exist_ok=True)
    shutil.copy2(adapter_bin, bin_stage / "moviera-adapter")
    os.chmod(bin_stage / "moviera-adapter", 0o755)
    r = sh(
        f"{ensure_rust_path()} && {cli} build --bundles appimage,deb",
        cwd=GUI_ROOT / "src-tauri",
        env_extra={
            **cargo_env(),
            "MOVIERA_ADAPTER_BIN": str(GUI_ROOT / "gui-adapter" / "target" / "release" / "moviera-adapter"),
        },
        timeout=10800,
    )
    success = ok(r.returncode)
    record("linux", success,
           "src-tauri/target/release/{moviera,bundle/*}" if success else "tauri build failed (see log)")
    return success


# ---------------------------------------------------------------------------
# Android
# ---------------------------------------------------------------------------

def android_env() -> dict:
    jvm = "/usr/lib/jvm/java-17-openjdk-amd64"
    return {
        "ANDROID_HOME": str(ANDROID_HOME),
        "ANDROID_SDK_ROOT": str(ANDROID_HOME),
        "JAVA_HOME": jvm,
        "PATH": f"{jvm}/bin:{ANDROID_HOME}/cmdline-tools/latest/bin:{os.path.expanduser('~')}/.cargo/bin:"
                + os.environ.get("PATH", ""),
        "GRADLE_OPTS": os.environ.get("GRADLE_OPTS", "-Xmx3072m"),
        "CARGO_TERM_COLOR": "never",
    }


def install_android_sdk() -> bool:
    """Download the Android command-line tools + SDK packages (Colab-feasible)."""
    if has("java"):
        print("  JDK:", sh_capture("java -version 2>&1 | head -1"), flush=True)
    else:
        sudo = "" if os.geteuid() == 0 else "sudo "
        r = sh(f"{sudo}apt-get install -y openjdk-17-jdk-headless", timeout=1200)
        if not ok(r.returncode):
            return False

    tools_dir = ANDROID_HOME / "cmdline-tools" / "latest"
    if not (tools_dir / "bin" / "sdkmanager").exists():
        r = sh(f"mkdir -p {ANDROID_HOME}/cmdline-tools && cd /tmp && "
               f"wget -q {CMDLINE_TOOLS_URL} -O cmdtools.zip && "
               f"unzip -q cmdtools.zip -d {ANDROID_HOME}/cmdline-tools && "
               f"mv {ANDROID_HOME}/cmdline-tools/cmdline-tools {tools_dir}", timeout=900)
        if not ok(r.returncode):
            return False

    env = android_env()
    sh("yes | sdkmanager --licenses > /tmp/sdk-licenses.log 2>&1 || true",
       timeout=600, env_extra=env, hide=True)
    pkgs = ["platform-tools", "platforms;android-34", "build-tools;34.0.0"]
    r = sh("sdkmanager " + " ".join(f'"{p}"' for p in pkgs), timeout=3600, env_extra=env)
    return ok(r.returncode)


def read_ndk_version() -> str:
    """ndkVersion declared by the generated Tauri Android project."""
    gradle = GUI_ROOT / "src-tauri" / "gen" / "android" / "app" / "build.gradle"
    if gradle.exists():
        import re
        m = re.search(r'ndkVersion\s+"([^"]+)"', gradle.read_text())
        if m:
            return m.group(1)
    return "26.1.10909125"


def step_android() -> bool:
    step("build Android APK (Tauri Android — best effort in Colab)")
    if 0 < free_gb("/") < 8:
        print(f"  WARNING: only {free_gb('/'): .1f} GB free — the Android toolchain "
              f"(SDK+NDK+Gradle+Rust target) needs ~6-8 GB. Continuing anyway.", flush=True)

    if not install_android_sdk():
        record("android", False, "Android SDK setup failed — see platform/android/README.md")
        return False

    ndk = read_ndk_version()
    r = sh(f'sdkmanager "ndk;{ndk}"', timeout=3600, env_extra=android_env())
    if not ok(r.returncode):
        r = sh('sdkmanager "ndk;25.2.9519653"', timeout=3600, env_extra=android_env())
        if not ok(r.returncode):
            record("android", False, "NDK install failed")
            return False

    r = sh(f"{ensure_rust_path()} && rustup target add aarch64-linux-android",
           timeout=600, env_extra=cargo_env())
    if not ok(r.returncode):
        record("android", False, "failed to add aarch64-linux-android target")
        return False

    cli = tauri_cli()
    if not cli:
        record("android", False, "@tauri-apps/cli install failed")
        return False

    gen = GUI_ROOT / "src-tauri" / "gen" / "android"
    if not gen.exists():
        r = sh(f"{ensure_rust_path()} && {cli} android init",
               cwd=GUI_ROOT / "src-tauri", timeout=1800,
               env_extra={**android_env(), **cargo_env()})
        if not ok(r.returncode) or not gen.exists():
            record("android", False, "tauri android init failed")
            return False

    release = bool(getattr(ARGS, "android_release", False))
    mode = "release" if release else "debug"
    if release and not os.environ.get("TAURI_ANDROID_SIGNING_KEYSTORE"):
        print("  --android-release given but TAURI_ANDROID_SIGNING_KEYSTORE is not set.\n"
              "  Falling back to a debug APK (installable, debug-signed).", flush=True)
        release = False
        mode = "debug"

    r = sh(
        f"{ensure_rust_path()} && {cli} android build" + (" --release" if release else " --debug"),
        cwd=GUI_ROOT / "src-tauri",
        timeout=10800,
        env_extra={**android_env(), **cargo_env()},
    )
    if not ok(r.returncode):
        record("android", False, f"tauri android build --{mode} failed (see log)")
        return False

    apk_src = (GUI_ROOT / "src-tauri" / "gen" / "android" / "app" / "build" / "outputs"
               / "apk" / mode / f"app-{mode}.apk")
    if not apk_src.exists():
        found = sorted((GUI_ROOT / "src-tauri" / "gen" / "android").rglob("*.apk"))
        if not found:
            record("android", False, "build reported OK but no APK found")
            return False
        apk_src = found[-1]
    DIST.mkdir(exist_ok=True)
    shutil.copy2(apk_src, DIST / f"moviera-android-{mode}.apk")
    record("android", True, f"dist/moviera-android-{mode}.apk")
    return True


# ---------------------------------------------------------------------------
# packaging / collect
# ---------------------------------------------------------------------------

def zst_tar(stage_dir: Path, top_name: str, out_path: Path) -> bool:
    """Create a .tar.zst of stage_dir/top_name (shell zstd, else python zstandard)."""
    out_path.parent.mkdir(exist_ok=True)
    r = sh(f"tar -C {stage_dir} -cf - {top_name} | zstd -q -T0 -o {out_path}", hide=True)
    if ok(r.returncode) and out_path.exists() and out_path.stat().st_size > 0:
        return True
    try:
        import zstandard  # type: ignore
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as tf:
            tf.add(str(stage_dir / top_name), arcname=top_name)
        out_path.write_bytes(zstandard.ZstdCompressor().compress(buf.getvalue()))
        return True
    except Exception as e:
        print(f"  zstd fallback failed: {e}", flush=True)
        return False


def package_linux() -> list:
    """Stage the Linux desktop app and produce dist/pkg.tar.zst."""
    produced = []
    stage = DIST / "linux-pkg-stage"
    app_dir = stage / "moviera-gui-linux"
    if stage.exists():
        shutil.rmtree(stage, ignore_errors=True)
    bin_dir = app_dir / "bin"
    web_dir = app_dir / "web"
    bin_dir.mkdir(parents=True)
    web_dir.mkdir(parents=True)

    app_bin = GUI_ROOT / "src-tauri" / "target" / "release" / "moviera"
    adapter_bin = GUI_ROOT / "gui-adapter" / "target" / "release" / "moviera-adapter"
    frontend_dist = GUI_ROOT / "frontend" / "dist"

    included_app = app_bin.exists()
    included_adapter = adapter_bin.exists()
    if included_app:
        shutil.copy2(app_bin, bin_dir / "moviera")
        os.chmod(bin_dir / "moviera", 0o755)
    if included_adapter:
        shutil.copy2(adapter_bin, bin_dir / "moviera-adapter")
        os.chmod(bin_dir / "moviera-adapter", 0o755)
    if frontend_dist.exists():
        for f in frontend_dist.iterdir():
            if f.is_file():
                shutil.copy2(f, web_dir / f.name)

    (bin_dir / "run.sh").write_text(
        "#!/usr/bin/env bash\n"
        "# MOVIE-RAJA GUI launcher — starts the MovieBox-TUI adapter, then the app.\n"
        "set -euo pipefail\n"
        "HERE=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"\n"
        "export MOVIERA_ADAPTER_BIN=\"$HERE/moviera-adapter\"\n"
        "export MOVIERA_ADAPTER_PORT=\"${MOVIERA_ADAPTER_PORT:-8787}\"\n"
        "if [ -x \"$HERE/moviera-adapter\" ]; then\n"
        "  if ! (exec 3<>/dev/tcp/127.0.0.1/\"$MOVIERA_ADAPTER_PORT\") 2>/dev/null; then\n"
        "    \"$HERE/moviera-adapter\" &\n"
        "    for i in $(seq 1 60); do\n"
        "      if (exec 3<>/dev/tcp/127.0.0.1/\"$MOVIERA_ADAPTER_PORT\") 2>/dev/null; then break; fi\n"
        "      sleep 0.5\n"
        "    done\n"
        "  fi\n"
        "else\n"
        "  echo \"warning: moviera-adapter not found next to the app\" >&2\n"
        "fi\n"
        "if [ ! -x \"$HERE/moviera\" ]; then\n"
        "  echo \"the Tauri app binary (bin/moviera) is missing in this package — see the build log.\\n\"\n"
        "  echo \"Browser fallback: cd web && python3 -m http.server 8080\"\n"
        "  exit 1\n"
        "fi\n"
        "exec \"$HERE/moviera\"\n",
        encoding="utf-8",
    )
    os.chmod(bin_dir / "run.sh", 0o755)

    notes = [
        "MOVIE-RAJA GUI — Linux package (built with build_colab.py)",
        "",
        "Contents:",
        "  bin/moviera            Tauri 2 desktop app (embedded React UI)"
        + ("" if included_app else "   [NOT BUILT — see build log]"),
        "  bin/moviera-adapter    MovieBox-TUI core HTTP adapter"
        + ("" if included_adapter else "   [NOT BUILT — see build log]"),
        "  bin/run.sh             launcher (starts adapter + app)",
        "  web/                   fallback web UI (serve this dir to use a browser)",
        "",
        "Run:  ./bin/run.sh",
        "Browser fallback:  cd web && python3 -m http.server 8080",
        "  (with the adapter running on 127.0.0.1:8787)",
        "",
        "System requirements of bin/moviera: libwebkit2gtk-4.1, libgtk-3, libayatana-appindicator3",
        "Player: install mpv (or VLC) for native playback.",
        "Licensing: GUI is a client for MovieBox-TUI (MIT OR Apache-2.0). It hosts no media.",
    ]
    (app_dir / "README.txt").write_text("\n".join(notes) + "\n", encoding="utf-8")
    license_src = GUI_ROOT / "backend" / "moviebox-tui" / "LICENSE-MIT"
    if license_src.exists():
        shutil.copy2(license_src, app_dir / "LICENSE-MIT")
        ap = GUI_ROOT / "backend" / "moviebox-tui" / "LICENSE-APACHE"
        if ap.exists():
            shutil.copy2(ap, app_dir / "LICENSE-APACHE")

    pkg = DIST / "pkg.tar.zst"
    if pkg.exists():
        pkg.unlink()
    if zst_tar(stage, "moviera-gui-linux", pkg):
        produced.append("dist/pkg.tar.zst")
        print(f"  packaged {pkg} ({pkg.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)
    else:
        print("  ERROR: could not create pkg.tar.zst "
              "(install the 'zstd' package or 'pip install zstandard')", flush=True)
    return produced


def step_collect() -> bool:
    step("package pkg.tar.zst + collect artifacts into dist/")
    DIST.mkdir(exist_ok=True)
    produced = []

    produced += package_linux()

    for f in sorted(DIST.glob("moviera-android-*.apk")):
        produced.append(f"dist/{f.name}")

    bundle = GUI_ROOT / "src-tauri" / "target" / "release" / "bundle"
    if bundle.exists():
        for artifact in bundle.iterdir():
            if not (DIST / f"linux-{artifact.name}").exists():
                shutil.copytree(artifact, DIST / f"linux-{artifact.name}", dirs_exist_ok=True)
                produced.append(f"dist/linux-{artifact.name}/")

    adapter_bin = GUI_ROOT / "gui-adapter" / "target" / "release" / "moviera-adapter"
    if adapter_bin.exists() and not (DIST / "moviera-adapter").exists():
        shutil.copy2(adapter_bin, DIST / "moviera-adapter")
        produced.append("dist/moviera-adapter")

    web_dist = GUI_ROOT / "frontend" / "dist"
    if web_dist.exists() and not (DIST / "web").exists():
        shutil.copytree(web_dist, DIST / "web", dirs_exist_ok=True)
        produced.append("dist/web/")

    (DIST / "ARTIFACTS.txt").write_text("\n".join(dict.fromkeys(produced)) + "\n",
                                        encoding="utf-8")
    record("collect", True, ", ".join(dict.fromkeys(produced)) if produced else "nothing to collect")
    return True


ALL_STEPS = {
    "deps": step_deps,
    "rust": step_rust,
    "node": step_node,
    "update-repos": None,
    "frontend-deps": step_frontend_deps,
    "frontend-build": step_frontend_build,
    "adapter": step_adapter,
    "linux": step_linux,
    "android": step_android,
    "collect": step_collect,
}


def main() -> int:
    global ARGS
    parser = argparse.ArgumentParser(description="MOVIE-RAJA GUI build helper (Colab/Linux)")
    parser.add_argument("--steps", default="all",
                        help="comma-separated subset of: " + ",".join(STEPS))
    parser.add_argument("--require-pat", action="store_true",
                        help="abort if .github_pat.txt is missing/empty")
    parser.add_argument("--android-release", action="store_true",
                        help="build a signed release APK (requires TAURI_ANDROID_SIGNING_KEYSTORE "
                             "and friends; otherwise falls back to debug)")
    args = parser.parse_args()
    ARGS = args

    banner("MOVIE-RAJA GUI — build helper")
    t0 = time.time()
    pat = read_pat()
    if args.require_pat and not pat:
        print("Aborting: --require-pat was given but no PAT was found.", flush=True)
        return 1

    wanted = STEPS if args.steps == "all" else [s.strip() for s in args.steps.split(",") if s.strip()]
    for name in wanted:
        if name not in ALL_STEPS:
            print(f"unknown step: {name}", flush=True)
            continue
        if name == "update-repos":
            step_update_repos(pat)
        else:
            fn = ALL_STEPS[name]
            try:
                fn()
            except subprocess.TimeoutExpired:
                record(name, False, "timeout")
            except Exception as e:  # keep going with best-effort steps
                record(name, False, f"exception: {e}")

    banner("BUILD SUMMARY")
    for name in STEPS:
        res = RESULTS.get(name)
        if res is None:
            continue
        mark = "OK  " if res["ok"] else "FAIL"
        print(f"[{mark}] {name}: {res['detail'] or '-'}", flush=True)
    print(f"\ntotal time: {time.time() - t0:.0f}s", flush=True)
    print("artifacts: dist/ (see dist/ARTIFACTS.txt)", flush=True)
    print("Linux package: dist/pkg.tar.zst | Android APK: dist/moviera-android-*.apk", flush=True)

    core_failed = any(
        not RESULTS.get(s, {}).get("ok", False)
        for s in ["frontend-build", "adapter"]
        if s in RESULTS
    )
    return 1 if core_failed else 0


if __name__ == "__main__":
    sys.exit(main())
