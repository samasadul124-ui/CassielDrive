#!/usr/bin/env bash
# Launch the built Cassiel Drive Linux bundle with sane fallbacks.
#
#  --software   force software rendering (fixes crashes on flaky GL drivers)
#  --x11        force the X11 GDK backend (fixes some Wayland segfaults)
#  --debug      run the debug bundle instead of the release one
set -euo pipefail

cd "$(dirname "$0")/.."
MODE="release"
ARGS=()

for arg in "$@"; do
  case "$arg" in
    --software) export LIBGL_ALWAYS_SOFTWARE=1; export FLUTTER_RENDERER=software ;;
    --x11)      export GDK_BACKEND=x11 ;;
    --debug)    MODE="debug" ;;
    *)          ARGS+=("$arg") ;;
  esac
done

BIN="build/linux/x64/$MODE/bundle/cassiel_drive"
if [[ ! -x "$BIN" ]]; then
  echo "✗ $BIN not found — run ./scripts/setup_linux.sh first."
  exit 1
fi

# Start a keyring session if one is not already running, so flutter_secure_storage
# can actually encrypt tokens. Harmless if it fails: the app falls back to local
# storage instead of crashing.
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  echo "! No D-Bus session bus; secrets will be stored locally (unencrypted)."
elif ! gdbus call --session --dest org.freedesktop.secrets \
        --object-path /org/freedesktop/secrets \
        --method org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1; then
  if command -v gnome-keyring-daemon >/dev/null 2>&1; then
    echo "▶ Starting gnome-keyring-daemon…"
    eval "$(gnome-keyring-daemon --start --components=secrets 2>/dev/null)" || true
    export GNOME_KEYRING_CONTROL GNOME_KEYRING_PID SSH_AUTH_SOCK
  else
    echo "! No Secret Service provider running; secrets will be stored locally."
  fi
fi

exec "./$BIN" "${ARGS[@]}"
