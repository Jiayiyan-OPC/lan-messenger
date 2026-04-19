#!/bin/bash
# Cross-platform build script for LAN Messenger
# Usage: ./scripts/build.sh [target]
# Targets: linux, macos-x64, macos-arm64, windows

set -e

cd "$(dirname "$0")/../frontend"

echo "=== Installing frontend dependencies ==="
npm ci

echo "=== Building frontend ==="
npm run build

echo "=== Running tests ==="
npm run test

TARGET=${1:-""}

case "$TARGET" in
  linux)
    echo "=== Building for Linux (x86_64) ==="
    npx @tauri-apps/cli build --target x86_64-unknown-linux-gnu
    ;;
  macos-x64)
    echo "=== Building for macOS (x86_64) ==="
    npx @tauri-apps/cli build --target x86_64-apple-darwin
    ;;
  macos-arm64)
    echo "=== Building for macOS (aarch64) ==="
    npx @tauri-apps/cli build --target aarch64-apple-darwin
    ;;
  windows)
    echo "=== Building for Windows (x86_64) ==="
    npx @tauri-apps/cli build --target x86_64-pc-windows-msvc
    ;;
  *)
    echo "=== Building for current platform ==="
    npx @tauri-apps/cli build
    ;;
esac

echo "=== Build complete ==="
echo "Artifacts: frontend/src-tauri/target/*/release/bundle/"
