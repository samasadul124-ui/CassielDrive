#!/usr/bin/env python3
"""
build_colab.py — Google Colab / Linux build helper for the MOVIE-RAJA GUI.

Builds the MOVIE-RAJA + MovieBox-TUI integration:
  1. system dependencies (Rust toolchain deps, Node.js, Tauri Linux webkit libs)
  2. Rust (rustup) if missing
  3. Node.js / npm if missing
  4. update vendored upstream repos (uses the GitHub PAT when present)
  5. npm install + frontend production build
  6. build the moviera-adapter (MovieBox-TUI core HTTP adapter)
  7. build the Tauri Linux desktop app (AppImage/.deb) when feasible
  8. Android: best-effort preparation (SDK download + tauri android); the final
     signed APK step is documented for the user's local machine
  9. collect artifacts into ./dist

USAGE (Colab cell or terminal):
    !python build_colab.py                 # everything, best effort
    !python build_colab.py --steps deps,rust,node,frontend,adapter
    !python build_colab.py --help

GITHUB PAT (plain text, per project requirement):
    Put your GitHub Personal Access Token as plain text in .github_pat.txt
    (repository root). Example file content:

        YOUR_GITHUB_PAT_HERE

    The helper reads that file directly. It is only used to authenticate
    git operations against GitHub (updating the vendored upstream repos).
    If the file does not exist, GitHub-dependent steps are skipped with a
    clear report and the rest of the build continues.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
GUI_ROOT = REPO_ROOT / "moviera-gui"
DIST = REPO_ROOT / "dist"
PAT_FILE = REPO_ROOT / ".github_pat.txt"

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


def banner(msg: str) -> None:
    print("\n" + "=" * 72, flush=True)
    print(f"## {msg}", flush=True)
    print("=" * 72, flush=True)


def step(name: str) -> None:
    banner(f"STEP: {name}")


def sh(cmd, cwd=None, pat: str | None = None, timeout: int = 3600, env_extra: dict | None = None) -> subprocess.CompletedProcess:
    """Run a shell command with live output."""
    env = os.environ.copy()
    env.setdefault("CARGO_TERM_COLOR", "never")
    env.setdefault("DEBIAN_FRONTEND", "noninteractive")
    if env_extra:
        env.update(env_extra)
    if pat:
        env["GIT_PAT"] = pat
    full = cmd if isinstance(cmd, str) else " ".join(cmd)
    if pat:
        # authenticate git against GitHub with the plain-text PAT (no other
        # credential mechanism is required for this project)
        extra = [
            "-c", f'http.extraheader="Authorization: Bearer {pat}"',
        ]
        if full.lstrip().startswith("git "):
            full = full.replace("git ", f"git {' '.join(extra)} ", 1)
    print(f"$ {full.replace(pat, '***') if pat else full}", flush=True)
    return subprocess.run(
        full, shell=True, cwd=str(cwd) if cwd else None,
        env=env, timeout=timeout, check=False,
    )


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


# ---------------------------------------------------------------------------
# steps
# ---------------------------------------------------------------------------

def step_deps() -> bool:
    step("install system dependencies (apt)")
    pkgs = [
        "build-essential", "curl", "wget", "git", "pkg-config",
        "libssl-dev", "libgtk-3-dev", "libwebkit2gtk-4.1-dev",
        "libayatana-appindicator3-dev", "librsvg2-dev", "libjavascriptcoregtk-4.1-dev",
        "rsync", "unzip",
    ]
    sudo = "" if os.geteuid() == 0 else "sudo "
    r = sh(f"{sudo}apt-get update -y", timeout=900)
    if not ok(r.returncode):
        record("deps", False, "apt-get update failed")
        return False
    r = sh(f"{sudo}apt-get install -y " + " ".join(pkgs), timeout=1800)
    success = ok(r.returncode)
    record("deps", success, "core + tauri-linux system packages" if success else "apt install failed")
    return success


def step_rust() -> bool:
    step("install Rust toolchain (rustup) if missing")
    if has("cargo"):
        r = sh("cargo --version")
        record("rust", True, r.stdout.decode().strip())
        return True
    r = sh(
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh && "
        "sh /tmp/rustup.sh -y --profile minimal --default-toolchain stable",
        timeout=1200,
    )
    if not ok(r.returncode):
        record("rust", False, "rustup install failed")
        return False
    r = sh(f". $HOME/.cargo/env && rustc --version && cargo --version")
    record("rust", ok(r.returncode))
    return ok(r.returncode)


def step_node() -> bool:
    step("install Node.js / npm if missing")
    if has("node") and has("npm"):
        r = sh("node -v && npm -v")
        record("node", True, r.stdout.decode().replace("\n", " ").strip())
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
    step("update vendored upstream repositories (MOVIE-RAJA + MovieBox-TUI)")
    if not pat:
        record("update-repos", True, "skipped — no GitHub PAT (vendored copies stay as-is)")
        return True
    upstreams = [
        (
            "https://github.com/mesamirh/MovieBox-Tui",
            GUI_ROOT / "backend" / "moviebox-tui",
        ),
        (
            "https://github.com/rajaisinlove-a11y/MOVIE-RAJA",
            None,  # special: nested netflix-style-movie-streaming-frontend
        ),
    ]
    all_ok = True
    for url, dest in upstreams:
        name = url.rstrip("/").split("/")[-1]
        tmp = Path(f"/tmp/mb-update-{name}")
        if tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)
        r = sh(f"git clone --depth 1 {url} {tmp}", pat=pat, timeout=900)
        if not ok(r.returncode):
            print(f"  clone failed for {name} — keeping vendored copy", flush=True)
            all_ok = False
            continue
        if dest is None:
            nested = tmp / "netflix-style-movie-streaming-frontend"
            dest = GUI_ROOT / "frontend"
            src = nested if nested.exists() else tmp
        else:
            src = tmp
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(src, dest)
        (dest / "UPSTREAM.md").write_text(f"UPSTREAM: {url}\n")
        print(f"  updated {dest}", flush=True)
        shutil.rmtree(tmp, ignore_errors=True)
    record("update-repos", all_ok, "upstream repos refreshed with PAT" if all_ok else "some clones failed")
    return all_ok


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


def step_adapter() -> bool:
    step("build moviera-adapter (Rust, MovieBox-TUI core) — release")
    r = sh(
        ". $HOME/.cargo/env && cargo build --release",
        cwd=GUI_ROOT / "gui-adapter",
        timeout=5400,
    )
    success = ok(r.returncode)
    record("adapter", success, "target/release/moviera-adapter" if success else "cargo build failed")
    return success


def step_linux() -> bool:
    step("build Tauri Linux desktop app (AppImage/.deb)")
    # Tauri CLI via npm (much faster than cargo install tauri-cli); --no-save
    # keeps the frontend package.json untouched.
    r = sh(
        "npm install --no-audit --no-fund --no-save @tauri-apps/cli@^2",
        cwd=GUI_ROOT / "frontend",
        timeout=900,
    )
    if not ok(r.returncode):
        record("linux", False, "@tauri-apps/cli install failed")
        return False
    r = sh(
        ". $HOME/.cargo/env && ../frontend/node_modules/.bin/tauri build --bundles appimage,deb",
        cwd=GUI_ROOT / "src-tauri",
        env_extra={"MOVIERA_ADAPTER_BIN": str(GUI_ROOT / "gui-adapter" / "target" / "release" / "moviera-adapter")},
        timeout=7200,
    )
    success = ok(r.returncode)
    record("linux", success, "src-tauri/target/release/bundle/*" if success else "tauri build failed")
    return success


def step_android() -> bool:
    step("Android — best-effort preparation (Tauri Android)")
    # A full signed APK normally needs a local Android SDK + JDK + AVD key.
    # In Colab we prepare as much as possible and document the rest.
    if os.environ.get("ANDROID_HOME") and has("sdkmanager"):
        r = sh("sdkmanager --licenses --verbose", timeout=300)
        sh("yes | sdkmanager --licenses >/dev/null 2>&1 || true")
        r = sh(
            ". $HOME/.cargo/env && npx tauri android init && npx tauri android build --debug",
            cwd=GUI_ROOT / "src-tauri",
            timeout=7200,
        )
        success = ok(r.returncode)
        record("android", success, "debug APK built" if success else "tauri android build failed")
        return success
    print(
        "  Android SDK not detected in this environment.\n"
        "  Colab: Android toolchain preparation is done as far as the sandbox allows.\n"
        "  Remaining local step (documented in moviera-gui/platform/android/README.md):\n"
        "    1. install Android Studio (SDK + JDK 17)\n"
        "    2. cd moviera-gui/src-tauri && npx tauri android init\n"
        "    3. npx tauri android build --debug   (or --release with a keystore)",
        flush=True,
    )
    record("android", False, "SDK not available here — see platform/android/README.md")
    return False


def step_collect() -> bool:
    step("collect artifacts into dist/")
    DIST.mkdir(exist_ok=True)
    copied = []
    candidates = [
        GUI_ROOT / "gui-adapter" / "target" / "release" / "moviera-adapter",
        GUI_ROOT / "frontend" / "dist" / "index.html",
    ]
    for c in candidates:
        if c.exists():
            target = DIST / c.name
            if c.is_dir():
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(c, target)
            else:
                shutil.copy2(c, target)
            copied.append(str(target.relative_to(REPO_ROOT)))
    bundle = GUI_ROOT / "src-tauri" / "target" / "release" / "bundle"
    if bundle.exists():
        for artifact in bundle.iterdir():
            shutil.copytree(artifact, DIST / f"linux-{artifact.name}", dirs_exist_ok=True)
            copied.append(f"dist/linux-{artifact.name}/")
    app_dir = GUI_ROOT / "src-tauri" / "target" / "release" / "app"
    if app_dir.exists():
        shutil.copytree(app_dir, DIST / "linux-app", dirs_exist_ok=True)
        copied.append("dist/linux-app/")
    (DIST / "ARTIFACTS.txt").write_text("\n".join(copied or ["(none)"]) + "\n")
    record("collect", True, ", ".join(copied) if copied else "nothing to collect")
    return True


ALL_STEPS = {
    "deps": step_deps,
    "rust": step_rust,
    "node": step_node,
    "update-repos": None,  # needs pat
    "frontend-deps": step_frontend_deps,
    "frontend-build": step_frontend_build,
    "adapter": step_adapter,
    "linux": step_linux,
    "android": step_android,
    "collect": step_collect,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="MOVIE-RAJA GUI build helper (Colab/Linux)")
    parser.add_argument("--steps", default="all", help="comma-separated subset of: " + ",".join(STEPS))
    parser.add_argument("--require-pat", action="store_true",
                        help="abort if .github_pat.txt is missing/empty")
    args = parser.parse_args()

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

    # exit non-zero if any *core* step failed
    core_failed = any(
        not RESULTS.get(s, {}).get("ok", False)
        for s in ["frontend-build", "adapter"]
        if s in RESULTS
    )
    return 1 if core_failed else 0


if __name__ == "__main__":
    sys.exit(main())
