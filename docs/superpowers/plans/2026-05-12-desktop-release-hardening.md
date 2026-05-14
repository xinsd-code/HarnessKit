# Desktop Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop release workflow produce correctly labeled macOS unsigned test packages and Windows installer-first release assets, while leaving a clean path for future signing secrets.

**Architecture:** Split Tauri desktop packaging into a shared base config plus platform overlays, then refactor `.github/workflows/release.yml` so macOS chooses signed vs unsigned mode based on secret completeness and Windows publishes validated installer artifacts with unambiguous names. Keep CLI uploads separate and explicitly labeled as CLI assets.

**Tech Stack:** GitHub Actions YAML, Tauri 2, Rust, npm/Vite, PowerShell, shell scripting

---

## File Map

- `crates/hk-desktop/tauri.conf.json`
  - Keep only cross-platform desktop defaults and shared bundle settings.
- `crates/hk-desktop/tauri.macos.conf.json`
  - New macOS-only overlay for vibrancy, transparency, and titlebar settings that require `macOSPrivateApi`.
- `crates/hk-desktop/tauri.windows.conf.json`
  - New Windows-only overlay with conservative window settings for installer builds.
- `.github/workflows/release.yml`
  - Split macOS signed/unsigned behavior, normalize asset names, validate Windows installer artifacts, and fix CLI asset naming.

### Task 1: Split shared vs platform-specific Tauri packaging config

**Files:**
- Modify: `crates/hk-desktop/tauri.conf.json:11-55`
- Create: `crates/hk-desktop/tauri.macos.conf.json`
- Create: `crates/hk-desktop/tauri.windows.conf.json`

- [ ] **Step 1: Replace the shared `app.windows[0]` block in `crates/hk-desktop/tauri.conf.json` with platform-neutral defaults**

Replace lines 11-39 with:

```json
  "app": {
    "windows": [
      {
        "title": "HarnessKit",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "decorations": true
      }
    ],
    "security": {
      "csp": "default-src 'self' ipc: asset: https://ipc.localhost; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' asset: https://ipc.localhost data: https://raw.githubusercontent.com https://api.smithery.ai; connect-src ipc: https://ipc.localhost https://skills.sh https://api.smithery.ai https://raw.githubusercontent.com https://api.github.com https://add-skill.vercel.sh; font-src 'self' https://fonts.gstatic.com data:"
    }
  },
```

- [ ] **Step 2: Create `crates/hk-desktop/tauri.macos.conf.json`**

```json
{
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "title": "HarnessKit",
        "hiddenTitle": true,
        "titleBarStyle": "Overlay",
        "trafficLightPosition": {
          "x": 24,
          "y": 18
        },
        "transparent": true,
        "windowEffects": {
          "effects": ["sidebar"],
          "state": "followsWindowActiveState"
        }
      }
    ]
  }
}
```

- [ ] **Step 3: Create `crates/hk-desktop/tauri.windows.conf.json`**

```json
{
  "app": {
    "windows": [
      {
        "title": "HarnessKit",
        "transparent": false
      }
    ]
  }
}
```

- [ ] **Step 4: Validate all Tauri config JSON files parse**

Run:

```bash
node -e 'for (const f of ["crates/hk-desktop/tauri.conf.json","crates/hk-desktop/tauri.macos.conf.json","crates/hk-desktop/tauri.windows.conf.json"]) { JSON.parse(require("fs").readFileSync(f, "utf8")); console.log("ok", f); }'
```

Expected:

```text
ok crates/hk-desktop/tauri.conf.json
ok crates/hk-desktop/tauri.macos.conf.json
ok crates/hk-desktop/tauri.windows.conf.json
```

- [ ] **Step 5: Commit**

```bash
git add crates/hk-desktop/tauri.conf.json crates/hk-desktop/tauri.macos.conf.json crates/hk-desktop/tauri.windows.conf.json
git commit -m "build: split tauri desktop config by platform"
```

### Task 2: Refactor macOS release job into signed and unsigned modes

**Files:**
- Modify: `.github/workflows/release.yml:63-146`

- [ ] **Step 1: Add a signing-mode detector at the top of the macOS job**

Insert after the `Install frontend dependencies` step:

```yaml
      - name: Determine macOS signing mode
        id: macos_signing
        shell: bash
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          if [ -n "$APPLE_CERTIFICATE" ] && [ -n "$APPLE_CERTIFICATE_PASSWORD" ] && [ -n "$APPLE_SIGNING_IDENTITY" ] && [ -n "$APPLE_ID" ] && [ -n "$APPLE_PASSWORD" ] && [ -n "$APPLE_TEAM_ID" ]; then
            echo "mode=signed" >> "$GITHUB_OUTPUT"
          else
            echo "mode=unsigned" >> "$GITHUB_OUTPUT"
          fi
```

- [ ] **Step 2: Guard the Apple certificate import so it only runs in signed mode**

Change the existing import step header to:

```yaml
      - name: Import Apple certificate
        if: steps.macos_signing.outputs.mode == 'signed'
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
```

Keep the existing `security import` body unchanged.

- [ ] **Step 3: Replace the single `Build desktop app` step with signed-path `tauri-action` and unsigned-path manual packaging**

Replace lines 118-134 with:

```yaml
      - name: Build signed desktop app
        if: steps.macos_signing.outputs.mode == 'signed'
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          releaseId: ${{ needs.create-release.outputs.release_id }}
          releaseBody: ${{ needs.create-release.outputs.changelog }}
          tauriScript: cargo tauri
          args: --target ${{ matrix.target }} --config crates/hk-desktop/tauri.macos.conf.json

      - name: Build unsigned desktop app
        if: steps.macos_signing.outputs.mode == 'unsigned'
        shell: bash
        run: |
          npm run build
          cargo tauri build --target "${{ matrix.target }}" --config crates/hk-desktop/tauri.macos.conf.json --bundles dmg

      - name: Upload unsigned macOS desktop asset
        if: steps.macos_signing.outputs.mode == 'unsigned'
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          DMG_PATH=$(find "target/${{ matrix.target }}/release/bundle/dmg" -maxdepth 1 -name '*.dmg' | head -n 1)
          test -n "$DMG_PATH"
          DEST="HarnessKit-macos-${{ matrix.arch }}-unsigned.dmg"
          cp "$DMG_PATH" "$DEST"
          gh release upload "${{ github.ref_name }}" "$DEST" --clobber
```

- [ ] **Step 4: Rename the macOS CLI asset so it cannot be mistaken for the desktop app**

Replace lines 141-146 with:

```yaml
      - name: Upload CLI to release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cp "target/${{ matrix.target }}/release/hk" "hk-cli-macos-${{ matrix.arch }}"
          gh release upload "${{ github.ref_name }}" "hk-cli-macos-${{ matrix.arch }}" --clobber
```

- [ ] **Step 5: Validate workflow YAML and the macOS job command strings**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow ok"'
rg -n "Determine macOS signing mode|Build signed desktop app|Build unsigned desktop app|HarnessKit-macos-\\$\\{\\{ matrix\\.arch \\}\\}-unsigned\\.dmg|hk-cli-macos-" .github/workflows/release.yml
```

Expected:

```text
workflow ok
```

And `rg` should print all five patterns from the macOS job.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "build: split macos release into signed and unsigned modes"
```

### Task 3: Publish validated Windows installer assets and relabel the CLI

**Files:**
- Modify: `.github/workflows/release.yml:148-186`
- Modify: `.github/workflows/release.yml:228-260`

- [ ] **Step 1: Replace the Windows desktop build with an explicit installer build using the Windows overlay config**

Replace lines 178-186 with:

```yaml
      - name: Build Windows desktop installers
        shell: bash
        run: |
          npm run build
          cargo tauri build --target x86_64-pc-windows-msvc --config crates/hk-desktop/tauri.windows.conf.json --bundles nsis,msi
```

- [ ] **Step 2: Add a PowerShell validation-and-upload step for NSIS and MSI artifacts**

Insert immediately after the new build step:

```yaml
      - name: Validate and upload Windows desktop assets
        shell: pwsh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          $bundleRoot = "target/x86_64-pc-windows-msvc/release/bundle"
          $nsis = Get-ChildItem "$bundleRoot/nsis/*.exe" | Select-Object -First 1
          $msi = Get-ChildItem "$bundleRoot/msi/*.msi" | Select-Object -First 1
          if (-not $nsis) { throw "Missing NSIS installer output" }
          if (-not $msi) { throw "Missing MSI output" }
          Copy-Item $nsis.FullName "HarnessKit-windows-x64-installer.exe"
          Copy-Item $msi.FullName "HarnessKit-windows-x64.msi"
          gh release upload "${{ github.ref_name }}" "HarnessKit-windows-x64-installer.exe" --clobber
          gh release upload "${{ github.ref_name }}" "HarnessKit-windows-x64.msi" --clobber
```

- [ ] **Step 3: Rename the Windows CLI upload artifact**

Replace lines 255-260 with:

```yaml
      - name: Upload CLI to release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        shell: bash
        run: |
          cp target/release/hk.exe hk-cli-windows-x64.exe
          gh release upload "${{ github.ref_name }}" hk-cli-windows-x64.exe --clobber
```

- [ ] **Step 4: Validate workflow YAML and confirm the new Windows asset names are present**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow ok"'
rg -n "Build Windows desktop installers|Validate and upload Windows desktop assets|HarnessKit-windows-x64-installer\\.exe|HarnessKit-windows-x64\\.msi|hk-cli-windows-x64\\.exe" .github/workflows/release.yml
```

Expected:

```text
workflow ok
```

And `rg` should print all five patterns from the Windows jobs.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "build: validate windows desktop release assets"
```

### Task 4: Normalize release copy and run final verification

**Files:**
- Modify: `.github/workflows/release.yml:25-61`
- Modify: `.github/workflows/release.yml:221-226`

- [ ] **Step 1: Append a distribution guide to the generated release body**

Replace lines 41-48 with:

```yaml
          if [ -z "$BODY" ]; then
            BODY="Bug fixes and improvements."
          fi
          BODY="$BODY

          ## Downloads
          - **Windows desktop:** Use \`HarnessKit-windows-x64-installer.exe\` first. \`HarnessKit-windows-x64.msi\` is the alternate enterprise-friendly package.
          - **macOS desktop:** Files ending in \`-unsigned.dmg\` are unsigned internal testing builds until Apple signing secrets are configured.
          - **CLI assets:** Files beginning with \`hk-cli-\` are command-line binaries, not desktop applications."
          {
            echo "body<<CHANGELOG_EOF"
            echo "$BODY"
            echo "CHANGELOG_EOF"
          } >> "$GITHUB_OUTPUT"
```

- [ ] **Step 2: Rename the Linux CLI asset to match the explicit CLI naming scheme**

Replace lines 221-226 with:

```yaml
      - name: Upload CLI to release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cp target/x86_64-unknown-linux-musl/release/hk hk-cli-linux-x64
          gh release upload "${{ github.ref_name }}" hk-cli-linux-x64 --clobber
```

- [ ] **Step 3: Run final local verification for workflow syntax, desktop config syntax, and the desktop crate build**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow ok"'
node -e 'for (const f of ["crates/hk-desktop/tauri.conf.json","crates/hk-desktop/tauri.macos.conf.json","crates/hk-desktop/tauri.windows.conf.json"]) { JSON.parse(require("fs").readFileSync(f, "utf8")); console.log("ok", f); }'
npm run build
cargo check -p hk-desktop
```

Expected:

```text
workflow ok
ok crates/hk-desktop/tauri.conf.json
ok crates/hk-desktop/tauri.macos.conf.json
ok crates/hk-desktop/tauri.windows.conf.json
```

Then `npm run build` and `cargo check -p hk-desktop` should both exit `0`.

- [ ] **Step 4: Review the final diff before commit**

Run:

```bash
git diff --name-only -- .github/workflows/release.yml crates/hk-desktop/tauri.conf.json crates/hk-desktop/tauri.macos.conf.json crates/hk-desktop/tauri.windows.conf.json
```

Expected:

```text
.github/workflows/release.yml
crates/hk-desktop/tauri.conf.json
crates/hk-desktop/tauri.macos.conf.json
crates/hk-desktop/tauri.windows.conf.json
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml crates/hk-desktop/tauri.conf.json crates/hk-desktop/tauri.macos.conf.json crates/hk-desktop/tauri.windows.conf.json
git commit -m "build: harden desktop release packaging"
```
