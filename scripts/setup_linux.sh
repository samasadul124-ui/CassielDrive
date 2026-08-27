#!/usr/bin/env bash
# Cassiel Drive — Linux build helper.
#
# The linux/ desktop folder is committed to the repo (with the -Werror
# relaxation that third-party plugin sources need), so this script is mostly a
# convenience wrapper:
#
#   ./scripts/setup_linux.sh            # release build
#   ./scripts/setup_linux.sh --debug    # debug build
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

BUILD_MODE="release"
[[ "${1:-}" == "--debug" ]] && BUILD_MODE="debug"

command -v flutter >/dev/null 2>&1 || {
  echo "✗ flutter not found in PATH."
  echo "  Arch/EndeavourOS: yay -S flutter-bin   |   others: https://docs.flutter.dev/get-started/install/linux"
  exit 1
}

echo "▶ $(flutter --version | head -n1)"

# Toolchain check — these are what `flutter build linux` needs.
missing=()
for tool in clang cmake ninja pkg-config; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
done
pkg-config --exists gtk+-3.0 2>/dev/null || missing+=("gtk3")
if ((${#missing[@]})); then
  echo "✗ Missing build dependencies: ${missing[*]}"
  echo "  Arch/EndeavourOS : sudo pacman -S clang cmake ninja pkgconf gtk3"
  echo "  Debian/Ubuntu    : sudo apt install clang cmake ninja-build pkg-config libgtk-3-dev"
  exit 1
fi

flutter config --enable-linux-desktop >/dev/null

# The committed linux/ folder should always be here; regenerate only if someone
# deleted it.
if [[ ! -f "$ROOT/linux/CMakeLists.txt" ]]; then
  echo "▶ linux/ folder missing — regenerating…"
  flutter create --platforms=linux .
fi

echo "▶ Fetching packages…"
flutter pub get

echo "▶ Building Linux $BUILD_MODE bundle…"
flutter build linux "--$BUILD_MODE"

BIN="$ROOT/build/linux/x64/$BUILD_MODE/bundle/cassiel_drive"
echo
echo "✓ Built $BIN"

if ! pkg-config --exists libsecret-1 2>/dev/null; then
  cat <<'EOF'

! libsecret was not found. The app still runs — it falls back to local storage —
  but tokens will not be encrypted by the OS keyring. To enable it:
    Arch/EndeavourOS : sudo pacman -S libsecret gnome-keyring
    Debian/Ubuntu    : sudo apt install libsecret-1-0 gnome-keyring
EOF
fi

echo
echo "Run it with:  ./scripts/run_linux.sh      (add --x11 or --software if the window crashes)"
