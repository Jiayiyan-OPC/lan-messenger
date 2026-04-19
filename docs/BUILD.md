# Cross-Platform Build Guide

## Prerequisites

### All Platforms
- Node.js >= 18
- Rust >= 1.77
- npm >= 9

### Linux (Ubuntu/Debian)
```bash
sudo apt install -y build-essential libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### macOS
```bash
xcode-select --install
```

### Windows
- Visual Studio Build Tools 2022 (with C++ workload)
- WebView2 (usually pre-installed on Windows 10/11)

## Build Commands

### Quick build (current platform)
```bash
./scripts/build.sh
```

### Target-specific builds
```bash
./scripts/build.sh linux        # x86_64-unknown-linux-gnu
./scripts/build.sh macos-x64   # x86_64-apple-darwin
./scripts/build.sh macos-arm64 # aarch64-apple-darwin
./scripts/build.sh windows     # x86_64-pc-windows-msvc
```

## Output Artifacts

| Platform | Format | Location |
|---|---|---|
| Linux | .deb, .AppImage | `frontend/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/` |
| macOS | .dmg, .app | `frontend/src-tauri/target/*/release/bundle/macos/` |
| Windows | .msi, .exe | `frontend/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/` |

## CI/CD

For automated builds, use the workflow templates in `.github/workflows/`:
- `build.yml` — Triggered on PR/push, runs tests + builds on all platforms
- `release.yml` — Triggered on tag push (`v*`), creates GitHub Release with artifacts

> **Note:** The GitHub token needs `workflow` scope to push workflow files.
> Ask admin to add these files or use the GitHub web UI.

## Troubleshooting

### Linux: "webkit2gtk-4.1 not found"
```bash
sudo apt install libwebkit2gtk-4.1-dev
```

### macOS: "xcrun error"
```bash
xcode-select --install
```

### Windows: "link.exe not found"
Install Visual Studio Build Tools with "Desktop development with C++" workload.
