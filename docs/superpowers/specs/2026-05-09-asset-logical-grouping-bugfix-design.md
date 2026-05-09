# Asset Logical Grouping Bugfix Design

## Context

The desktop app currently has three related bugs in `Extensions` and `Local Hub`:

1. The Agent column for skill, MCP, and plugin assets can miss installed agents, such as the `agent-browser` skill.
2. The detail panel `Install to Agent` area can render all agents as disabled or uninstalled even when the asset is globally installed, such as `frontend-design`.
3. Asset lists can show duplicate rows for the same logical asset, such as duplicate `frontend-design` skills.

These symptoms share one cause: list/detail UI paths do not always use the same complete logical asset instance set. Some code matches assets by strict source metadata, while other code matches only by kind and name. When source, pack, or scope metadata differs across scans, the UI splits one logical asset into multiple groups and then computes agent install state from an incomplete subset.

## Goals

1. `Extensions` and `Local Hub` list pages must show each logical `skill`, `mcp`, and `plugin` asset once.
2. `Extensions` and `Local Hub` list page Agent columns must show only global Agent install state.
3. `Extensions` and `Local Hub` detail panels must show global Agent install state in `Install to Agent`.
4. `Extensions` and `Local Hub` detail panels must show Project install state only in the Project area.
5. Existing `hook` and `cli` grouping behavior must remain unchanged.

## Non-Goals

1. Do not change backend scan or storage behavior.
2. Do not change install, uninstall, backup, import, or sync APIs.
3. Do not merge hooks by loose name because hook identity includes command semantics.
4. Do not merge CLI rows by loose name because CLI rows can represent bundles with child assets.
5. Do not change visual styling beyond state correctness.

## Asset Identity

For frontend grouping in `Extensions` and `Local Hub`:

- `skill`, `mcp`, and `plugin` use logical asset identity: `kind + logicalExtensionName`.
- `hook` and `cli` keep the existing `extensionGroupKey` behavior.
- The merged group retains all physical instances so detail panels can still show paths, scopes, source metadata, permissions, and project usage.

`logicalExtensionName` keeps current hook-specific normalization, but the new loose grouping rule only applies to `skill`, `mcp`, and `plugin`.

## Extensions Behavior

The `Extensions` grouped data helper becomes the source of truth for logical asset groups:

- `buildGroups` deduplicates repeated extension rows by id.
- It groups `skill`, `mcp`, and `plugin` by `kind + logicalExtensionName`.
- It groups `hook` and `cli` with current strict keys.
- It aggregates agents, tags, permissions, trust score, enabled state, timestamps, and all instances from the merged rows.

The `Extensions` table Agent column uses each merged group's complete `instances`, but the visible installed state is global-only:

- global instance for the Agent exists: icon is installed/highlighted.
- project-only instance exists: icon is not highlighted; click opens detail if needed.
- no instance exists: icon is installable.

The `Extensions` detail panel `Install to Agent` uses the same merged `instances`, but only global instances determine highlight and remove behavior. Project installs are shown only in `ProjectInstallPanel`.

## Local Hub Behavior

`Local Hub` continues reading hub assets from `.harnesskit`, but its UI must use the same logical grouping semantics for display:

- list rows for `skill`, `mcp`, and `plugin` are deduplicated by `kind + logicalExtensionName`.
- `hook` and `cli` rows keep current identity behavior.
- each hub row can match installed extension instances through the same logical identity, not strict `kind + name` only.

The `Local Hub` list Agent column shows only global Agent install state:

- installed global instance for the Agent: icon is highlighted.
- only project instance for the Agent: icon is not highlighted; click opens detail.
- no matching instance: icon installs to global.

The `Local Hub` detail panel `Install to Agent` also uses global-only state:

- globally installed Agents are highlighted and removable.
- Agents without global installs are clickable for global install.
- Project install state is shown only in `ProjectInstallPanel`.

## Data Flow

1. Backend APIs return raw hub assets and installed extension instances.
2. Shared frontend helpers derive logical asset keys and grouped rows.
3. `Extensions` consumes grouped installed extension rows directly.
4. `Local Hub` groups hub rows for display and matches installed instances by the same logical identity.
5. `buildInstallState` receives the complete matching instance set and computes state by surface:
   - list surfaces: global-only installed state.
   - detail surface: separate global and project state, with the caller choosing which one to render.

## Error Handling

This change does not introduce new backend failure modes. Existing install/uninstall errors continue to use current toast behavior.

If a hub row cannot find a source instance for install, the existing install path should surface the same error handling already used today. The grouping change should not hide or synthesize install sources.

## Testing

Add or update focused tests:

1. `buildGroups` merges same-name `skill`, `mcp`, and `plugin` rows across different source, pack, and scope metadata.
2. `buildGroups` does not apply loose merging to `hook` and `cli`.
3. `Extensions` table Agent column uses complete merged instances and highlights only global installs.
4. `Local Hub` table Agent column matches installed instances by logical identity and highlights only global installs.
5. `Extensions` detail `Install to Agent` highlights global installs and leaves project-only state to the Project panel.
6. `Local Hub` detail `Install to Agent` highlights global installs and does not render all agents disabled for assets such as `frontend-design`.
7. Duplicate `frontend-design` rows are removed from `Extensions` and `Local Hub` list data.

## Acceptance Criteria

1. `Extensions` shows one row for `frontend-design` in the skill list.
2. `Local Hub` shows one row for the same logical `skill`, `mcp`, or `plugin` asset.
3. `agent-browser` skill Agent icons show all globally installed Agents in both relevant list/detail surfaces.
4. `frontend-design` in `Local Hub` detail shows globally installed Agents as highlighted in `Install to Agent`.
5. `Extensions` and `Local Hub` list Agent columns do not highlight project-only installs.
6. `Extensions` and `Local Hub` detail Project areas still show selected Project install state.
7. Existing `hook` and `cli` grouping behavior is unchanged.
