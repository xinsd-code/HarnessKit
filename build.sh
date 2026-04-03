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

echo "==> Re-creating DMG..."
DMG_DIR="target/release/bundle/dmg"
DMG_PATH="$DMG_DIR/HarnessKit_${VERSION}_aarch64.dmg"
rm -f "$DMG_PATH"
hdiutil create -volname "HarnessKit" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"

echo "==> Done!"
echo "    .app: $APP_PATH"
echo "    .dmg: $DMG_PATH"
