#!/bin/bash
set -e

echo "==> Building HarnessKit..."
cargo tauri build

APP_PATH="target/release/bundle/macos/HarnessKit.app"

echo "==> Cleaning extended attributes..."
xattr -cr "$APP_PATH"

echo "==> Signing (ad-hoc)..."
codesign --force --deep --sign - "$APP_PATH"

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
DMG_PATH="target/release/bundle/dmg/HarnessKit_${VERSION}_aarch64.dmg"

echo "==> Done!"
echo "    .app: $APP_PATH"
echo "    .dmg: $DMG_PATH"
