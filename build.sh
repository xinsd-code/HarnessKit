#!/bin/bash
set -e

export MACOSX_DEPLOYMENT_TARGET=12.0

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Apple credentials (set in ~/.zshrc or .env):
#   APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD
for var in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_TEAM_ID APPLE_PASSWORD; do
  if [ -z "${!var}" ]; then
    echo "Error: $var not set. Add it to ~/.zshrc or .env"
    exit 1
  fi
done

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')

echo "==> Building HarnessKit v${VERSION} (macOS ${MACOSX_DEPLOYMENT_TARGET}+)..."

# Build for Apple Silicon (Tauri auto-signs with Developer ID from tauri.conf.json)
echo "==> [1/2] Building for Apple Silicon (aarch64)..."
cargo tauri build --target aarch64-apple-darwin

# Build for Intel
echo "==> [2/2] Building for Intel (x86_64)..."
cargo tauri build --target x86_64-apple-darwin

# Paths
ARM_APP="target/aarch64-apple-darwin/release/bundle/macos/HarnessKit.app"
ARM_DMG="target/aarch64-apple-darwin/release/bundle/dmg/HarnessKit_${VERSION}_aarch64.dmg"
X64_APP="target/x86_64-apple-darwin/release/bundle/macos/HarnessKit.app"
X64_DMG="target/x86_64-apple-darwin/release/bundle/dmg/HarnessKit_${VERSION}_x64.dmg"

# Notarize Apple Silicon
echo "==> Notarizing Apple Silicon..."
xcrun notarytool submit "$ARM_DMG" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_PASSWORD" \
  --wait
xcrun stapler staple "$ARM_DMG"

# Notarize Intel
echo "==> Notarizing Intel..."
xcrun notarytool submit "$X64_DMG" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_PASSWORD" \
  --wait
xcrun stapler staple "$X64_DMG"

# Build CLI for both architectures
echo "==> Building CLI (aarch64)..."
cargo build --release --target aarch64-apple-darwin -p hk-cli

echo "==> Building CLI (x86_64)..."
cargo build --release --target x86_64-apple-darwin -p hk-cli

echo ""
echo "==> Done! (signed + notarized)"
echo "    Apple Silicon: $ARM_DMG"
echo "    Intel:         $X64_DMG"
echo "    CLI (arm64):   target/aarch64-apple-darwin/release/hk"
echo "    CLI (x64):     target/x86_64-apple-darwin/release/hk"
