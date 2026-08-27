#!/usr/bin/env bash
# Cassiel Drive — one-shot Linux setup & build.
#
# Handles the three things that break a fresh `flutter build linux --release`:
#   1. the linux/ platform folder is not committed  -> runs `flutter create`
#   2. flutter_secure_storage_linux ships a json.hpp that fails with
#      -Werror=deprecated-literal-operator on clang >= 19  -> relaxes the flags
#   3. reminds you about the gnome-keyring / libsecret runtime requirement
#
# Usage:  ./scripts/setup_linux.sh [--debug]
set -euo pipefail

BUILD_MODE="release"
[[ "${1:-}" == "--debug" ]] && BUILD_MODE="debug"

cd "$(dirname "$0")/.."
ROOT="$PWD"

command -v flutter >/dev/null 2>&1 || {
  echo "✗ flutter not found in PATH. Install Flutter first: https://docs.flutter.dev/get-started/install/linux"
  exit 1
}

echo "▶ Flutter: $(flutter --version | head -n1)"

# ── 1. Make sure the Linux desktop scaffolding exists ────────────────────────
if [[ ! -d "$ROOT/linux" ]]; then
  echo "▶ Generating Linux platform files…"
  flutter create --platforms=linux .
fi

# ── 2. Relax the C++ warnings-as-errors for bundled plugin sources ───────────
# clang 19/20 turned `operator "" _json` into an error; the vendored nlohmann
# json.hpp inside flutter_secure_storage_linux still uses the old syntax.
CMAKE_TOP="$ROOT/linux/CMakeLists.txt"
MARKER="# cassiel: relax plugin warnings"
if [[ -f "$CMAKE_TOP" ]] && ! grep -q "$MARKER" "$CMAKE_TOP"; then
  echo "▶ Patching linux/CMakeLists.txt to disable -Werror for third-party plugin code…"
  cat >> "$CMAKE_TOP" <<'EOF'

# cassiel: relax plugin warnings
# Some bundled plugin sources (flutter_secure_storage_linux/json.hpp) still use
# the pre-C++23 literal-operator spelling, which clang >= 19 rejects under
# -Werror. Downgrade those to warnings so the build succeeds everywhere.
add_compile_options(-Wno-error)
include(CheckCXXCompilerFlag)
check_cxx_compiler_flag(-Wno-deprecated-literal-operator HAS_NO_DEPRECATED_LITERAL_OPERATOR)
if(HAS_NO_DEPRECATED_LITERAL_OPERATOR)
  add_compile_options(-Wno-deprecated-literal-operator)
endif()
EOF
fi

# Belt and braces: the same relaxation via the environment, for the case where
# CMake re-generates the file from the template.
export CXXFLAGS="${CXXFLAGS:-} -Wno-error -Wno-deprecated-literal-operator -Wno-error=deprecated-literal-operator"
export CFLAGS="${CFLAGS:-} -Wno-error"

# ── 3. Dependencies + build ──────────────────────────────────────────────────
echo "▶ Fetching packages…"
flutter pub get

echo "▶ Building Linux $BUILD_MODE bundle…"
flutter build linux "--$BUILD_MODE"

BIN="$ROOT/build/linux/x64/$BUILD_MODE/bundle/cassiel_drive"
echo
echo "✓ Built $BIN"
echo

# ── 4. Runtime prerequisites ─────────────────────────────────────────────────
if ! pkg-config --exists libsecret-1 2>/dev/null; then
  cat <<'EOF'
! libsecret was not detected. Cassiel Drive still runs (it falls back to local
  storage) but your tokens will not be encrypted by the OS keyring. Install it:
    Arch/EndeavourOS : sudo pacman -S libsecret gnome-keyring
    Debian/Ubuntu    : sudo apt install libsecret-1-0 gnome-keyring
EOF
fi

cat <<EOF
Run it with:
    ./scripts/run_linux.sh
(or directly: $BIN)
EOF
