#!/usr/bin/env bash
set -euo pipefail

# Reproducible mobile solver assets: WASM glue + bundled star catalog.
# Optionally rebuilds the Android arm64-v8a .so when native sources are stale.
#
# Run manually:  scripts/prebuild-mobile-solver.sh [--force] [--with-android] [--skip-android]
# Or via npm:    cd mobile && npm run prepare-solver-assets
#
# Prerequisites:
#   - rustup + wasm32-unknown-unknown target
#   - wasm-bindgen-cli (cargo install wasm-bindgen-cli)
#   - data/processed/default.adb (python scripts/build_adb.py)
#   - Android NDK (only when rebuilding the .so; see scripts/build-android-native.sh)
#
# Generated outputs (gitignored; required before Expo/TS builds):
#   mobile/app/wasm/ad_astra_solver_wasm.{js,d.ts}
#   mobile/app/wasm/ad_astra_solver_wasm_bg.wasm
#   mobile/assets/default.adb
#   mobile/modules/.../jniLibs/arm64-v8a/libad_astra_solver_ffi.so (when native rebuild runs)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_CRATE="$ROOT/native/ad_astra_solver_wasm"
WASM_OUT="$ROOT/mobile/app/wasm"
WASM_BIN="$WASM_OUT/ad_astra_solver_wasm_bg.wasm"
ADB_SRC="$ROOT/data/processed/default.adb"
ADB_DST="$ROOT/mobile/assets/default.adb"
ANDROID_SO="$ROOT/mobile/modules/ad-astra-solver-native/android/src/main/jniLibs/arm64-v8a/libad_astra_solver_ffi.so"
BUILD_ANDROID_SCRIPT="$ROOT/scripts/build-android-native.sh"

FORCE=0
WITH_ANDROID=auto
SKIP_ANDROID=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      ;;
    --with-android)
      WITH_ANDROID=always
      ;;
    --skip-android)
      SKIP_ANDROID=1
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      echo "usage: scripts/prebuild-mobile-solver.sh [--force] [--with-android] [--skip-android]" >&2
      exit 1
      ;;
  esac
  shift
done

file_mtime() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f '%m' "$1"
  else
    stat -c '%Y' "$1"
  fi
}

setup_rust_toolchain() {
  if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
  fi

  local cargo_bin=""
  if command -v cargo &>/dev/null; then
    cargo_bin="$(command -v cargo)"
  fi

  if [[ -z "$cargo_bin" && -x "$HOME/.cargo/bin/cargo" ]]; then
    export PATH="$HOME/.cargo/bin:$PATH"
    cargo_bin="$HOME/.cargo/bin/cargo"
  fi

  if [[ -z "$cargo_bin" ]]; then
    echo "error: cargo not found." >&2
    echo "Install rustup: https://rustup.rs" >&2
    echo "Then: rustup target add wasm32-unknown-unknown" >&2
    exit 1
  fi

  # Homebrew cargo often lacks the wasm32 target installed under rustup.
  if [[ "$cargo_bin" == *"/opt/homebrew/"* || "$cargo_bin" == *"/usr/local/"* ]]; then
    if [[ -x "$HOME/.cargo/bin/cargo" ]]; then
      echo "note: bare 'cargo' points to Homebrew; using rustup at ~/.cargo/bin/cargo" >&2
      export PATH="$HOME/.cargo/bin:$PATH"
      cargo_bin="$HOME/.cargo/bin/cargo"
    else
      echo "error: 'cargo' resolves to Homebrew ($cargo_bin), not rustup." >&2
      echo "Install rustup and add the wasm32 target:" >&2
      echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" >&2
      echo "  rustup target add wasm32-unknown-unknown" >&2
      exit 1
    fi
  fi

  if ! "$cargo_bin" --version &>/dev/null; then
    echo "error: cargo at $cargo_bin failed to run." >&2
    exit 1
  fi

  if ! rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
    echo "error: wasm32-unknown-unknown target is not installed for the active rustup toolchain." >&2
    echo "Run: rustup target add wasm32-unknown-unknown" >&2
    exit 1
  fi
}

collect_wasm_inputs() {
  find "$ROOT/native/ad_astra_solver" "$ROOT/native/ad_astra_solver_wasm" \
    \( -name '*.rs' -o -name 'Cargo.toml' -o -name 'Cargo.lock' \) -type f
  if command -v wasm-bindgen &>/dev/null; then
    command -v wasm-bindgen
  fi
}

collect_android_inputs() {
  find "$ROOT/native/ad_astra_solver" "$ROOT/native/ad_astra_solver_ffi" \
    \( -name '*.rs' -o -name 'Cargo.toml' -o -name 'Cargo.lock' \) -type f
}

artifact_is_stale() {
  local artifact="$1"
  local newest_input=0
  local input
  while IFS= read -r input; do
    [[ -n "$input" ]] || continue
    local input_mtime
    input_mtime="$(file_mtime "$input")"
    if [[ "$input_mtime" -gt "$newest_input" ]]; then
      newest_input="$input_mtime"
    fi
  done
  [[ "$newest_input" -gt "$(file_mtime "$artifact")" ]]
}

needs_wasm_build() {
  if [[ "$FORCE" -eq 1 ]]; then
    return 0
  fi
  if [[ ! -f "$WASM_BIN" || ! -f "$WASM_OUT/ad_astra_solver_wasm.js" ]]; then
    return 0
  fi
  artifact_is_stale "$WASM_BIN" < <(collect_wasm_inputs)
}

needs_android_build() {
  if [[ "$FORCE" -eq 1 ]]; then
    return 0
  fi
  if [[ ! -f "$ANDROID_SO" ]]; then
    return 0
  fi
  artifact_is_stale "$ANDROID_SO" < <(collect_android_inputs)
}

android_toolchain_available() {
  if [[ -n "${ANDROID_NDK_HOME:-}" && -d "$ANDROID_NDK_HOME" ]]; then
    return 0
  fi
  local sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  if [[ -d "$sdk/ndk" ]]; then
    return 0
  fi
  return 1
}

build_wasm() {
  if ! needs_wasm_build; then
    echo "WASM artifacts up to date; skipping cargo build."
    return
  fi

  setup_rust_toolchain

  if ! command -v wasm-bindgen &>/dev/null; then
    echo "error: wasm-bindgen not found on PATH." >&2
    echo "Install with: cargo install wasm-bindgen-cli" >&2
    exit 1
  fi

  echo "Building ad_astra_solver_wasm (wasm32-unknown-unknown release)..."
  if ! (cd "$WASM_CRATE" && cargo build --release --target wasm32-unknown-unknown); then
    echo "error: cargo build failed for $WASM_CRATE" >&2
    echo "Ensure rustup stable is active and wasm32-unknown-unknown is installed." >&2
    exit 1
  fi

  local wasm_artifact="$WASM_CRATE/target/wasm32-unknown-unknown/release/ad_astra_solver_wasm.wasm"
  if [[ ! -f "$wasm_artifact" ]]; then
    echo "error: expected WASM artifact missing after build: $wasm_artifact" >&2
    exit 1
  fi

  mkdir -p "$WASM_OUT"
  if ! wasm-bindgen \
    "$wasm_artifact" \
    --out-dir "$WASM_OUT" \
    --target web; then
    echo "error: wasm-bindgen failed. Reinstall with: cargo install wasm-bindgen-cli" >&2
    exit 1
  fi
  echo "WASM glue written to mobile/app/wasm/"
}

copy_adb() {
  if [[ ! -f "$ADB_SRC" ]]; then
    echo "error: catalog source not found: $ADB_SRC" >&2
    echo "Build the catalog with: python scripts/build_adb.py" >&2
    exit 1
  fi

  if [[ "$FORCE" -eq 0 && -f "$ADB_DST" ]]; then
    local src_mtime dst_mtime
    src_mtime="$(file_mtime "$ADB_SRC")"
    dst_mtime="$(file_mtime "$ADB_DST")"
    if [[ "$src_mtime" -le "$dst_mtime" ]]; then
      echo "Bundled catalog up to date; skipping copy."
      return
    fi
  fi

  mkdir -p "$(dirname "$ADB_DST")"
  cp -f "$ADB_SRC" "$ADB_DST"
  echo "Copied default.adb → mobile/assets/default.adb ($(du -h "$ADB_DST" | cut -f1))"
}

build_android_if_needed() {
  if [[ "$SKIP_ANDROID" -eq 1 ]]; then
    return
  fi

  local should_build=0
  case "$WITH_ANDROID" in
    always)
      should_build=1
      ;;
    auto)
      if needs_android_build; then
        should_build=1
      fi
      ;;
    *)
      echo "error: internal error: unknown WITH_ANDROID=$WITH_ANDROID" >&2
      exit 1
      ;;
  esac

  if [[ "$should_build" -eq 0 ]]; then
    echo "Android .so up to date; skipping native build."
    return
  fi

  if ! android_toolchain_available; then
    echo "warning: native solver sources are stale but Android NDK is not configured." >&2
    echo "  Set ANDROID_HOME / ANDROID_NDK_HOME, or run: scripts/build-android-native.sh" >&2
    echo "  Continuing without rebuilding libad_astra_solver_ffi.so." >&2
    return
  fi

  if [[ ! -f "$BUILD_ANDROID_SCRIPT" ]]; then
    echo "error: Android build script not found: $BUILD_ANDROID_SCRIPT" >&2
    exit 1
  fi

  echo "Native sources changed; rebuilding Android arm64-v8a .so..."
  if ! (cd "$ROOT" && bash "$BUILD_ANDROID_SCRIPT"); then
    echo "error: Android native build failed (see output above)." >&2
    exit 1
  fi
}

build_wasm
copy_adb
build_android_if_needed

# Sanity check required imports resolve.
for required in \
  "$WASM_OUT/ad_astra_solver_wasm.js" \
  "$WASM_BIN" \
  "$ADB_DST"; do
  if [[ ! -f "$required" ]]; then
    echo "error: expected artifact missing: $required" >&2
    exit 1
  fi
done

echo "Mobile solver assets ready."
