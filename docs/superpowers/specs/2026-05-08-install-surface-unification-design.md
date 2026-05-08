# Install Surface Unification Design

Date: 2026-05-08

## Background

HarnessKit currently exposes install state and install actions in two separate surfaces:

- `Extensions`
- `Local Hub`

Both surfaces render:

- an agent column in the list
- `Install to Agent` in detail
- `Install to Project` in detail

Those three interaction zones have drifted apart. The same asset can appear installed in one surface and uninstalled in another, the default project selection differs by page and by asset kind, and delete/install semantics are not consistently scoped. The user requirement is to make `Local Hub` and `Extensions` fully consistent, while fixing the existing MCP project-selection bug in `Extensions` and preventing recurrence through shared state and shared UI.

## Goals

1. Make `Local Hub` and `Extensions` share one install-state model.
2. Make `Local Hub` list/detail behavior match `Extensions` after `Extensions` is corrected.
3. Fix `Install to Project` default-selection behavior for MCP and align it across supported asset kinds.
4. Keep scope semantics explicit:
   - list agent cell operates on global only
   - `Install to Agent` operates on global only
   - `Install to Project` operates on the currently selected project only
5. Extract reusable UI and reusable methods so future fixes apply everywhere.
6. Add regression coverage so previously seen bugs do not reappear.

## Non-Goals

1. No redesign of page layout or visual style.
2. No change to Local Hub storage format or hub sync semantics.
3. No new scope type beyond existing `global` and `project`.
4. No support expansion beyond current agent capabilities.

## Unified Behavior Rules

### 1. Agent Column

The list agent column answers a display question:

- does this asset currently exist for this agent in the relevant visible scope?

Rules:

- In `Extensions`, visibility follows current page scope.
- In `Local Hub`, the row is a hub asset rather than an installed instance, so the column shows aggregated status:
  - highlight if any install exists for that agent
  - if only project installs exist, the tooltip must say the asset is installed in a project and the click opens detail instead of deleting
  - if a global install exists, the click removes the global install
  - if no install exists, the click installs globally

### 2. Install to Agent

`Install to Agent` always refers to global scope only.

Rules:

- highlighted if a global install exists for that agent
- clicking a highlighted icon removes the global install only
- clicking an unhighlighted icon installs the asset globally for that agent
- project installs must not affect the highlighted state here

### 3. Install to Project

`Install to Project` always refers to the currently selected project only.

Rules:

- highlighted if a project-scoped install exists for the selected project and agent
- clicking a highlighted icon removes the install from the selected project only
- clicking an unhighlighted icon installs into the selected project only
- global installs must not affect the highlighted state here

### 4. Default Project Selection

Project selection follows one shared rule:

1. if the current page context already has a project scope, use it first
2. otherwise, if the asset already exists in one or more projects, select the first installed project
3. otherwise, keep the selection empty

This rule applies consistently to all project-capable kinds:

- `skill`
- `mcp`
- `cli`

### 5. Supported Action Matrix

- `skill`: supports global and project install surfaces
- `mcp`: supports global and project install surfaces
- `cli`: supports global and project install surfaces, but actual install orchestration may map to child assets
- `plugin`: supports global install surface only
- `hook`: supports global install surface only

## Architecture

### Shared State Layer

Introduce a shared install-state helper layer under the existing front-end shared logic area.

Core helpers:

1. `resolveProjectSelection(...)`
   - inputs:
     - current page scope
     - asset instances
     - project list
     - CLI child instances when relevant
   - outputs:
     - selected project scope or null
     - available project options
     - selection source: `context | installed | empty`

2. `buildInstallState(...)`
   - inputs:
     - grouped extension or hub asset identity
     - installed extensions
     - target agent
     - selected project scope
     - page mode: `extensions | local-hub`
   - outputs:
     - `hasGlobalInstall`
     - `hasProjectInstall`
     - `hasAnyInstall`
     - `canInstallGlobal`
     - `canInstallProject`
     - `listAction`
     - `globalAction`
     - `projectAction`
     - tooltip text

3. `getInstallSourceInstance(...)`
   - inputs:
     - asset group
     - target scope
     - asset kind
   - outputs:
     - source instance to copy from
     - explicit failure reason when unavailable

These helpers must become the only place where install-state decisions are derived. Page components may not open-code install-state checks after this refactor.

### Shared UI Layer

Introduce reusable UI components for the icon rows and project panel.

1. `AgentInstallIconRow`
   - renders agent icons from precomputed state
   - supports modes:
     - `list`
     - `global-detail`
     - `project-detail`
   - consumes only precomputed view-model items and callbacks

2. `ProjectInstallPanel`
   - renders:
     - title
     - target project selector
     - project-scoped agent icon row
     - empty and unsupported states
   - reused by `Extensions` and `Local Hub`

3. `useInstallActionController`
   - shared action wiring for:
     - global install
     - global delete
     - project install
     - project delete
     - optimistic pending state
     - refetch/rescan
     - conflict handling
     - toast messages

The data source may differ:

- `Extensions` acts on installed instances
- `Local Hub` acts on hub assets plus hub install endpoints

But the view model and UI must remain shared.

## Page-Level Integration

### Extensions

`Extensions` becomes the corrected baseline surface.

Required changes:

1. Replace page-local project defaulting logic with `resolveProjectSelection(...)`.
2. Replace page-local icon-state logic with `buildInstallState(...)`.
3. Route list/detail interactions through shared action/controller helpers.
4. Ensure MCP uses the same project-selection and project-action flow as skill and CLI.

### Local Hub

`Local Hub` reuses the same display and interaction model but keeps hub-specific install endpoints.

Required changes:

1. Fetch installed extensions on page entry so hub rows can compute aggregated state.
2. Replace page-local install-state logic with `buildInstallState(...)`.
3. Reuse shared detail project-selection logic through `resolveProjectSelection(...)`.
4. Reuse shared icon-row and project-panel UI.

## Asset-Specific Notes

### Skill

Must support full global and project flows with aligned state in:

- `Extensions` list
- `Extensions` detail
- `Local Hub` list
- `Local Hub` detail

### MCP

Must support:

- corrected default project selection
- correct project-scope highlight
- project-scope install/remove limited to selected project

This is a priority regression target because `Extensions` already exhibits incorrect project selection for MCP.

### CLI

CLI remains a parent surface with child-asset orchestration. Shared state must still expose a single coherent install view to the user.

Rules:

- project selection must still follow the shared rule
- install/remove must preserve current CLI child orchestration
- CLI parent and child states must not drift apart visually

### Plugin and Hook

Both remain global-only install surfaces.

Rules:

- no project install section
- shared icon row still used for global state
- capability limits remain enforced

## Testing Strategy

### Unit Tests

Add tests for the shared state helpers covering:

1. default project selection
   - context scope wins
   - installed project fallback
   - empty fallback

2. install-state derivation
   - global only
   - project only
   - global plus project
   - unsupported action cases

3. list-action semantics
   - install global when absent
   - remove global when global exists
   - open detail when only project exists in Local Hub

### Component Tests

Add focused render/interaction tests for:

1. `AgentInstallIconRow`
2. `ProjectInstallPanel`

At minimum, verify:

- correct highlight state
- correct disabled state
- correct callbacks per action mode

### Browser Regression

Manual browser verification must cover both surfaces:

1. `Extensions`
2. `Local Hub`

For each of:

- `skill`
- `mcp`
- `cli`
- `plugin`
- `hook`

At minimum, verify:

- list agent state
- detail `Install to Agent`
- detail `Install to Project` where supported
- default project selection where supported

## Implementation Sequence

1. Extract shared state helpers.
2. Extract shared icon-row and project-panel UI.
3. Switch `Extensions` to the shared model and fix MCP project selection there.
4. Switch `Local Hub` to the same shared model.
5. Add regression tests.
6. Run build and browser verification across supported asset kinds.

## Risks

1. CLI child orchestration may have edge cases if state aggregation and install actions are refactored independently.
2. Existing optimistic state in `Local Hub` and `Extensions` may diverge if not routed through one shared controller.
3. Project selection may appear to “jump” if the shared defaulting logic does not clearly prioritize context over installed fallback.

## Mitigations

1. Keep CLI-specific orchestration inside the shared action/controller rather than scattering exceptions into pages.
2. Make the shared state helpers pure and test them directly.
3. Preserve explicit scope semantics:
   - list global only
   - `Install to Agent` global only
   - `Install to Project` selected project only

## Acceptance Criteria

The work is complete when:

1. `Extensions` and `Local Hub` show the same install status for the same asset/agent/scope combination.
2. MCP uses the same project-selection rule as skill and CLI.
3. A project-only install no longer appears as “fully uninstalled” in `Local Hub`.
4. No page open-codes its own install-state derivation outside the shared helper layer.
5. Reusable install UI is shared instead of duplicated.
6. Tests cover the shared rules that previously regressed.
