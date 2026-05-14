# Windows Extension Scan Parity Design

## Problem

On the Windows desktop app, HarnessKit can see agent configuration files in
native Windows paths such as `C:\Users\<user>\.claude\CLAUDE.md` and
`C:\Users\<user>\project\.claude\settings.local.json`, but the five extension
asset classes remain empty:

- skills
- MCP servers
- plugins
- CLIs
- hooks

The same project and global agent surfaces work on macOS. The fix should
therefore be scoped to Windows native path handling and extension scan parity,
not a broad scanner rewrite.

## Goals

- Restore Windows desktop discovery for global agent extensions and
  project-scoped extensions.
- Keep macOS and Linux behavior unchanged unless a platform-neutral bug is
  proven and covered by tests.
- Ensure Agents page counts, Global/Project agent views, and Extensions overview
  all recover through real `Extension` rows in the store.
- Preserve existing extension behaviors such as details, enable/disable,
  delete, audit, and CLI parent linking.

## Non-Goals

- Do not infer extension counts in the frontend from visible config files.
- Do not recursively search broad Windows locations such as the entire user
  profile.
- Do not add WSL path bridging. The target scenario is native Windows paths
  under `C:\Users\<user>\...`.
- Do not change macOS release behavior or macOS adapter paths.

## Recommended Approach

Implement a Windows-scoped scan parity fix in the Rust backend.

The backend should keep `scanner::scan_all()` as the single source of truth for
extension assets. On Windows, extension scanning must use path semantics that
match the config-file scanner closely enough that a visible global/project agent
directory can also produce its real extension assets.

If the bug is caused by Windows-only path normalization, candidate path
resolution, or scope-key mismatch, use `#[cfg(target_os = "windows")]` or a
small Windows helper. If a small platform-neutral helper is unavoidable, it must
be behavior-preserving for macOS/Linux and locked by tests.

## Data Flow

The existing flow should remain:

1. `scan_and_sync()` reads registered projects and agent settings.
2. It builds runtime adapters with `runtime_adapters_for_settings()`.
3. `scanner::scan_all()` scans detected adapters.
4. Global skills, MCP servers, hooks, and plugins are scanned first.
5. Project skills, MCP servers, hooks, and plugins are scanned for each known
   project via `scan_project_extensions()`.
6. CLI discovery runs after all global/project assets are collected and backfills
   `cli_parent_id` on matching skills or MCP servers.
7. The store sync persists real `Extension` rows.
8. Agents, project/global agent details, and Extensions overview derive their
   counts from the store.

## Design Constraints

- Windows path display strings should consistently strip extended path prefixes
  such as `\\?\` before they are used in UI-facing paths or scope strings.
- Project scope IDs must not split the same Windows project into duplicate
  logical scopes because of display-path differences.
- Global/project same-named skills remain independent.
- Missing directories continue to produce empty results rather than failing the
  full scan.
- Invalid JSON/TOML in one config file should not block unrelated agents or
  projects from scanning.
- Frontend stores and pages should not need a fallback path.

## Test Design

Add focused Rust tests around scanner behavior. The tests should model Windows
native paths and the observed mismatch: config files are visible, while extension
assets would previously be empty.

Minimum coverage:

- A Windows-style global Codex or Claude home fixture can produce skills, MCP,
  hooks, plugins, and CLI child links where applicable.
- A Windows-style registered project fixture can produce project-scoped skills,
  MCP servers, hooks, and plugins from the adapter-declared project paths.
- Scope IDs and `source_path` strings are stable after stripping Windows
  extended path prefixes.
- Existing non-Windows scanner behavior remains unchanged by any shared helper.

Suggested commands during implementation:

```bash
cargo test -p hk-core scanner
cargo check -p hk-desktop
```

If the implementation only changes `hk-core`, `cargo check -p hk-desktop` is
still useful because the desktop command layer is the affected product surface.

## Acceptance Criteria

- On Windows native paths under `C:\Users\<user>\...`, `scan_and_sync()` produces
  non-zero extension rows when skills, MCP servers, plugins, hooks, or known CLIs
  exist.
- Agents page extension counts are derived from real extension rows.
- Project agent, global agent, and Extensions overview show the same five asset
  classes that macOS already shows.
- macOS behavior is not intentionally changed.
