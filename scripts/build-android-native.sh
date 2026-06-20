#!/usr/bin/env bash
set -euo pipefail

# Build the Rust FFI library for Android arm64-v8a.

source "$HOME/.cargo/env"

export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"

OUTPUT_DIR="$(pwd)/mobile/modules/ad-astra-solver-native/android/src/main/jniLibs"

cd native/ad_astra_solver_ffi

echo "Building ad_astra_solver_ffi for arm64-v8a..."
cargo ndk \
  -t arm64-v8a \
  -o "$OUTPUT_DIR" \
  build --release

echo "Done. Output:"
ls -lh "$OUTPUT_DIR/arm64-v8a/libad_astra_solver_ffi.so" 2>/dev/null || echo "Build may have failed"
