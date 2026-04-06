#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.1.0"
  exit 1
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g. 1.2.3)"
  exit 1
fi

echo "==> Bumping version to ${VERSION}..."

# 1. Cargo.toml (workspace)
sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" "$ROOT/Cargo.toml"
echo "    Updated Cargo.toml (workspace)"

# 2. package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "$ROOT/package.json"
echo "    Updated package.json"

# 3. tauri.conf.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "$ROOT/crates/hk-desktop/tauri.conf.json"
echo "    Updated tauri.conf.json"

echo "==> All files updated to v${VERSION}"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m \"bump: v${VERSION}\""
echo "  git tag v${VERSION}"
echo "  git push && git push --tags"
