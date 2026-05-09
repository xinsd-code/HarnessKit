# Asset Logical Grouping Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix duplicate logical assets and incomplete Agent install state in both `Extensions` and `Local Hub` for `skill`, `mcp`, and `plugin` assets.

**Architecture:** Add one shared logical asset identity helper, then make `Extensions` grouping and `Local Hub` display/matching consume that identity. Keep list surfaces global-only, keep detail `Install to Agent` global-only, and keep Project state isolated to `ProjectInstallPanel`. Do not change backend APIs or persistence.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Testing Library, existing `Extension`, `GroupedExtension`, `buildGroups`, `buildInstallState`, `HubTable`, `HubDetail`, `ExtensionTable`, `ExtensionDetail`

---

## File Structure

- Modify: `src/lib/types.ts`
  - Owns logical asset identity helpers that can be shared by stores and components.
- Modify: `src/stores/extension-helpers.ts`
  - Owns `Extensions` installed-instance grouping.
- Modify: `src/stores/__tests__/extension-helpers.test.ts`
  - Covers loose grouping for `skill`, `mcp`, `plugin` and strict grouping for `hook`, `cli`.
- Modify: `src/components/local-hub/hub-table.tsx`
  - Uses grouped hub rows and logical matching against installed instances for list Agent icons.
- Modify: `src/components/local-hub/hub-detail.tsx`
  - Uses logical matching against installed instances for detail `Install to Agent` and Project panel state.
- Modify: `src/pages/local-hub.tsx`
  - Groups Local Hub data before rendering the table and preserves selection by representative hub id.
- Modify: `src/components/local-hub/__tests__/hub-table.test.tsx`
  - Covers Local Hub list dedupe and global-only Agent icons.
- Create: `src/pages/__tests__/local-hub-page.test.tsx`
  - Covers Local Hub page-level row dedupe before rendering `HubTable`.
- Modify: `src/components/local-hub/__tests__/hub-detail.test.tsx`
  - Covers Local Hub detail global `Install to Agent` state.
- Modify: `src/components/extensions/__tests__/extension-table.test.tsx`
  - Covers Extensions list using complete grouped instances and global-only highlight.
- Modify: `src/components/extensions/__tests__/extension-install-flow.test.tsx`
  - Covers Extensions detail global state and Project-only separation.

---

### Task 1: Add Shared Logical Asset Identity

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/extension-helpers.ts`
- Modify: `src/stores/__tests__/extension-helpers.test.ts`

- [ ] **Step 1: Write failing tests for loose grouping**

Add these tests inside `describe("buildGroups", ...)` in `src/stores/__tests__/extension-helpers.test.ts`:

```ts
it("merges same-name skills across different source metadata", () => {
  const global = {
    ...baseExt,
    id: "global",
    name: "frontend-design",
    kind: "skill" as const,
    source: {
      origin: "git" as const,
      url: "https://github.com/acme/frontend-design.git",
      version: null,
      commit_hash: null,
    },
    pack: "acme/frontend-design",
    scope: { type: "global" as const },
  };
  const project = {
    ...baseExt,
    id: "project",
    name: "frontend-design",
    kind: "skill" as const,
    source: { origin: "agent" as const, url: null, version: null, commit_hash: null },
    pack: null,
    scope: alphaScope,
  };

  const groups = buildGroups([global, project]);

  expect(groups).toHaveLength(1);
  expect(groups[0].instances.map((instance) => instance.id).sort()).toEqual([
    "global",
    "project",
  ]);
});

it.each(["mcp", "plugin"] as const)(
  "merges same-name %s rows across different source metadata",
  (kind) => {
    const a = {
      ...baseExt,
      id: `${kind}-a`,
      kind,
      name: "asset-one",
      source: {
        origin: "git" as const,
        url: "https://github.com/acme/asset-one.git",
        version: null,
        commit_hash: null,
      },
      pack: "acme/asset-one",
    };
    const b = {
      ...baseExt,
      id: `${kind}-b`,
      kind,
      name: "asset-one",
      source: { origin: "agent" as const, url: null, version: null, commit_hash: null },
      pack: null,
      scope: alphaScope,
    };

    const groups = buildGroups([a, b]);

    expect(groups).toHaveLength(1);
    expect(groups[0].instances).toHaveLength(2);
  },
);
```

Add strict grouping tests in the same `describe` block:

```ts
it("keeps same-name cli rows separated by current strict identity", () => {
  const a = {
    ...baseExt,
    id: "cli-a",
    kind: "cli" as const,
    name: "tool",
    source: {
      origin: "git" as const,
      url: "https://github.com/acme/tool-a.git",
      version: null,
      commit_hash: null,
    },
  };
  const b = {
    ...baseExt,
    id: "cli-b",
    kind: "cli" as const,
    name: "tool",
    source: {
      origin: "git" as const,
      url: "https://github.com/acme/tool-b.git",
      version: null,
      commit_hash: null,
    },
  };

  expect(buildGroups([a, b])).toHaveLength(2);
});

it("keeps same-command hook rows on current hook grouping behavior", () => {
  const a = {
    ...baseExt,
    id: "hook-a",
    kind: "hook" as const,
    name: "PreToolUse:*:/usr/bin/afplay /tmp/a.aiff",
  };
  const b = {
    ...baseExt,
    id: "hook-b",
    kind: "hook" as const,
    name: "PostToolUse:*:/usr/bin/afplay /tmp/a.aiff",
  };

  expect(buildGroups([a, b])).toHaveLength(1);
});
```

- [ ] **Step 2: Run the focused helper tests**

Run: `npm test -- src/stores/__tests__/extension-helpers.test.ts`

Expected: FAIL on the loose `skill` / `mcp` / `plugin` grouping tests because current grouping can split same-name assets by source/developer metadata.

- [ ] **Step 3: Add logical identity helpers**

In `src/lib/types.ts`, change `logicalExtensionName` to accept only the fields it reads:

```ts
export function logicalExtensionName(ext: Pick<Extension, "kind" | "name">): string {
  if (ext.kind === "hook") {
    const parts = ext.name.split(":");
    if (parts.length >= 3) return parts.slice(2).join(":");
  }
  return ext.name;
}
```

Then add `usesLooseLogicalAssetIdentity` and `logicalAssetKey` after `logicalExtensionName`:

```ts
export function usesLooseLogicalAssetIdentity(ext: Pick<Extension, "kind">): boolean {
  return ext.kind === "skill" || ext.kind === "mcp" || ext.kind === "plugin";
}

export function logicalAssetKey(ext: Pick<Extension, "kind" | "name">): string {
  return `${ext.kind}\0${logicalExtensionName(ext)}`;
}
```

- [ ] **Step 4: Use loose identity in `buildGroups`**

In `src/stores/extension-helpers.ts`, import the new helpers:

```ts
import {
  deriveExtensionUrl,
  extensionGroupKey,
  logicalAssetKey,
  logicalExtensionName,
  sortAgentNames,
  usesLooseLogicalAssetIdentity,
} from "@/lib/types";
```

In `buildGroups`, replace the per-extension key selection inside the `for (const ext of uniqueExtensions)` loop with:

```ts
let key = usesLooseLogicalAssetIdentity(ext)
  ? logicalAssetKey(ext)
  : extensionGroupKey(ext);
if (!usesLooseLogicalAssetIdentity(ext) && deriveExtensionUrl(ext) == null) {
  const sk = `${ext.kind}\0${logicalExtensionName(ext)}`;
  const siblings = urlSiblings.get(sk);
  if (siblings?.size === 1) {
    key = siblings.values().next().value as string;
  } else {
    key = `${ext.kind}\0${logicalExtensionName(ext)}\0(sourceless)`;
  }
}
```

Keep the rest of `buildGroupedExtension` unchanged so merged groups still aggregate instances, agents, permissions, tags, enabled state, timestamps, and trust score.

- [ ] **Step 5: Run helper tests again**

Run: `npm test -- src/stores/__tests__/extension-helpers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit shared identity change**

```bash
git add src/lib/types.ts src/stores/extension-helpers.ts src/stores/__tests__/extension-helpers.test.ts
git commit -m "fix: group logical extension assets"
```

---

### Task 2: Apply Logical Grouping to Local Hub Lists

**Files:**
- Modify: `src/pages/local-hub.tsx`
- Modify: `src/components/local-hub/hub-table.tsx`
- Modify: `src/components/local-hub/__tests__/hub-table.test.tsx`
- Create: `src/pages/__tests__/local-hub-page.test.tsx`

- [ ] **Step 1: Write failing Local Hub list tests**

In `src/components/local-hub/__tests__/hub-table.test.tsx`, add a second detected agent and a global installed instance that differs from the hub row's source metadata:

```ts
stores.agentState.agents = [
  { name: "claude", detected: true, extension_count: 1, path: "", enabled: true },
  { name: "codex", detected: true, extension_count: 1, path: "", enabled: true },
];
stores.agentState.agentOrder = ["claude", "codex"];
stores.extensionState.extensions = [
  {
    ...stores.extensionState.extensions[0],
    id: "global-agent-browser",
    name: "agent-browser",
    source: { origin: "agent", url: null, version: null, commit_hash: null },
    pack: null,
    agents: ["codex"],
    scope: { type: "global" },
  },
];
```

Add this test:

```tsx
it("matches Local Hub installs by logical identity for global Agent icons", () => {
  render(
    <HubTable
      data={[
        {
          id: "hub-agent-browser",
          kind: "skill",
          name: "agent-browser",
          description: "desc",
          source: {
            origin: "git",
            url: "https://github.com/vercel-labs/agent-browser.git",
            version: null,
            commit_hash: null,
          },
          agents: [],
          tags: [],
          pack: "vercel-labs/agent-browser",
          permissions: [],
          enabled: true,
          trust_score: null,
          installed_at: "2026-05-09T00:00:00.000Z",
          updated_at: "2026-05-09T00:00:00.000Z",
          source_path: null,
          cli_parent_id: null,
          cli_meta: null,
          install_meta: null,
          scope: { type: "global" },
        },
      ]}
    />,
  );

  const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
  expect(items.map((item) => [item.name, item.installed])).toEqual([
    ["claude", false],
    ["codex", true],
  ]);
});
```

Create `src/pages/__tests__/local-hub-page.test.tsx` and mock `HubTable` to capture `data`. Add:

```tsx
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocalHubPage from "@/pages/local-hub";
import type { Extension } from "@/lib/types";

const capturedHubTableData: Extension[][] = [];

function makeHubExtension(overrides: Partial<Extension>): Extension {
  return {
    id: "hub-ext",
    kind: "skill",
    name: "frontend-design",
    description: "desc",
    source: {
      origin: "git",
      url: "https://github.com/acme/frontend-design.git",
      version: null,
      commit_hash: null,
    },
    agents: [],
    tags: [],
    pack: "acme/frontend-design",
    permissions: [],
    enabled: true,
    trust_score: null,
    installed_at: "2026-05-09T00:00:00.000Z",
    updated_at: "2026-05-09T00:00:00.000Z",
    source_path: null,
    cli_parent_id: null,
    cli_meta: null,
    install_meta: null,
    scope: { type: "global" },
    ...overrides,
  };
}

const stores = vi.hoisted(() => ({
  hubState: {
    loading: false,
    fetch: vi.fn(),
    selectedId: null as string | null,
    setSelectedId: vi.fn(),
    importToHub: vi.fn(),
    extensions: [] as Extension[],
    kindFilter: null,
    searchQuery: "",
  },
  agentState: {
    fetch: vi.fn(),
    agents: [],
  },
  extensionState: {
    checkUpdates: vi.fn(),
    checkingUpdates: false,
    fetch: vi.fn(),
    extensions: [],
    updateStatuses: new Map(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/components/local-hub/hub-detail", () => ({ HubDetail: () => null }));
vi.mock("@/components/local-hub/hub-filters", () => ({ HubFilters: () => null }));
vi.mock("@/components/local-hub/sync-dialog", () => ({ SyncDialog: () => null }));
vi.mock("@/components/local-hub/hub-table", () => ({
  HubTable: (props: { data: Extension[] }) => {
    capturedHubTableData.push(props.data);
    return null;
  },
}));
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (selector: (state: typeof stores.agentState) => unknown) =>
    selector(stores.agentState),
}));
vi.mock("@/stores/extension-store", () => ({
  useExtensionStore: (selector: (state: typeof stores.extensionState) => unknown) =>
    selector(stores.extensionState),
}));
vi.mock("@/stores/hub-store", () => ({
  useHubStore: (selector: (state: typeof stores.hubState) => unknown) =>
    selector(stores.hubState),
}));
vi.mock("@/stores/toast-store", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("LocalHubPage asset grouping", () => {
  beforeEach(() => {
    capturedHubTableData.length = 0;
    stores.hubState.extensions = [];
    stores.hubState.selectedId = null;
  });

  it("deduplicates Local Hub skill rows by logical identity before rendering the table", () => {
    stores.hubState.extensions = [
      makeHubExtension({ id: "hub-a", name: "frontend-design", pack: "acme/frontend-design" }),
      makeHubExtension({
        id: "hub-b",
        name: "frontend-design",
        source: { origin: "agent", url: null, version: null, commit_hash: null },
        pack: null,
      }),
    ];

    render(<LocalHubPage />);

    expect(capturedHubTableData.at(-1)?.map((item) => item.name)).toEqual([
      "frontend-design",
    ]);
  });
});
```

- [ ] **Step 2: Run Local Hub list tests**

Run: `npm test -- src/components/local-hub/__tests__/hub-table.test.tsx src/pages/__tests__/local-hub-page.test.tsx`

Expected: FAIL because `HubTable` currently matches installed instances by strict `kind + name`, and `LocalHubPage` passes raw hub rows without grouping.

- [ ] **Step 3: Group Local Hub rows in the page**

In `src/pages/local-hub.tsx`, import `buildGroups`:

```ts
import { buildGroups } from "@/stores/extension-helpers";
```

Change the `data` memo so it filters first, then groups, then maps each group back to a representative `Extension` with complete merged metadata:

```ts
const data = useMemo(() => {
  const filtered = extensions.filter((ext) => {
    if (kindFilter && ext.kind !== kindFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        ext.name.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return buildGroups(filtered).map((group) => ({
    ...group.instances[0],
    id: group.instances[0].id,
    name: group.name,
    kind: group.kind,
    description: group.description,
    source: group.source,
    agents: group.agents,
    tags: group.tags,
    pack: group.pack,
    permissions: group.permissions,
    enabled: group.enabled,
    trust_score: group.trust_score,
    installed_at: group.installed_at,
    updated_at: group.updated_at,
  }));
}, [extensions, kindFilter, searchQuery]);
```

- [ ] **Step 4: Match installed instances by logical identity in `HubTable`**

In `src/components/local-hub/hub-table.tsx`, import the helper:

```ts
import { logicalAssetKey, usesLooseLogicalAssetIdentity } from "@/lib/types";
```

Add a small local matcher above `AgentInstallCell`:

```ts
function sameHubAsset(a: Extension, b: Extension): boolean {
  if (usesLooseLogicalAssetIdentity(a) && usesLooseLogicalAssetIdentity(b)) {
    return logicalAssetKey(a) === logicalAssetKey(b);
  }
  return a.kind === b.kind && a.name === b.name;
}
```

Replace both strict installed matching expressions:

```ts
const matchingInstances = installedExtensions.filter((instance) =>
  sameHubAsset(ext, instance),
);
```

and:

```ts
const installedMatches = installedExtensions.filter((instance) =>
  sameHubAsset(ext, instance),
);
```

- [ ] **Step 5: Run Local Hub list tests again**

Run: `npm test -- src/components/local-hub/__tests__/hub-table.test.tsx src/pages/__tests__/local-hub-page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Local Hub list change**

```bash
git add src/pages/local-hub.tsx src/components/local-hub/hub-table.tsx src/components/local-hub/__tests__/hub-table.test.tsx src/pages/__tests__/local-hub-page.test.tsx
git commit -m "fix: dedupe local hub asset rows"
```

---

### Task 3: Fix Local Hub Detail Global and Project State

**Files:**
- Modify: `src/components/local-hub/hub-detail.tsx`
- Modify: `src/components/local-hub/__tests__/hub-detail.test.tsx`

- [ ] **Step 1: Write failing detail test for global `Install to Agent`**

In `src/components/local-hub/__tests__/hub-detail.test.tsx`, change the `AgentInstallIconRow` mock to capture items:

```ts
const capturedAgentItems: Array<Array<{ name: string; installed: boolean; disabled?: boolean }>> = [];

vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: {
    items: Array<{ name: string; installed: boolean; disabled?: boolean }>;
  }) => {
    capturedAgentItems.push(props.items);
    return null;
  },
}));
```

Add a global installed instance with source metadata that differs from the hub row:

```ts
stores.extensionState.extensions = [
  {
    ...stores.hubState.extensions[0],
    id: "installed-frontend-design",
    source: { origin: "agent", url: null, version: null, commit_hash: null },
    pack: null,
    scope: { type: "global" },
    agents: ["claude"],
  },
];
```

Add the test:

```tsx
it("highlights globally installed Agents in Local Hub detail by logical identity", async () => {
  render(<HubDetail />);

  await waitFor(() => {
    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "claude",
      installed: true,
      disabled: undefined,
    });
  });
});
```

- [ ] **Step 2: Run Local Hub detail tests**

Run: `npm test -- src/components/local-hub/__tests__/hub-detail.test.tsx`

Expected: FAIL because `HubDetail` currently builds `matchingKindInstances` with strict `kind + name` matching.

- [ ] **Step 3: Use logical identity matching in `HubDetail`**

In `src/components/local-hub/hub-detail.tsx`, import the helper:

```ts
import { logicalAssetKey, usesLooseLogicalAssetIdentity } from "@/lib/types";
```

Add this helper near `scopeMatches`:

```ts
function sameHubAsset(a: Extension, b: Extension): boolean {
  if (usesLooseLogicalAssetIdentity(a) && usesLooseLogicalAssetIdentity(b)) {
    return logicalAssetKey(a) === logicalAssetKey(b);
  }
  return a.kind === b.kind && a.name === b.name;
}
```

Replace `matchingKindInstances`:

```ts
const matchingKindInstances = installedExtensions.filter((instance) =>
  sameHubAsset(ext, instance),
);
```

Keep `globalAgentItems` installed calculation as:

```ts
const installed = installState.globalInstalled || justInstalled.has(key);
```

Keep `projectAgentItems` installed calculation as:

```ts
const installed =
  installState.projectInstalled || justInstalled.has(key);
```

- [ ] **Step 4: Run Local Hub detail tests again**

Run: `npm test -- src/components/local-hub/__tests__/hub-detail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Local Hub detail change**

```bash
git add src/components/local-hub/hub-detail.tsx src/components/local-hub/__tests__/hub-detail.test.tsx
git commit -m "fix: show local hub detail install state"
```

---

### Task 4: Lock Extensions List and Detail State

**Files:**
- Modify: `src/components/extensions/__tests__/extension-table.test.tsx`
- Modify: `src/components/extensions/__tests__/extension-install-flow.test.tsx`
- Modify: `src/components/extensions/extension-table.tsx`
- Modify: `src/components/extensions/extension-detail.tsx`

- [ ] **Step 1: Add Extensions table regression test**

In `src/components/extensions/__tests__/extension-table.test.tsx`, add a second instance to `group.instances`: one project-only for `claude`, one global for `codex`. Then set `mocks.agentStoreState.agents` to include both agents.

Keep the current `buildInstallState` mock and assert `ExtensionTable` passes the complete `group.instances` to `buildInstallState`:

```ts
expect(mocks.buildInstallState).toHaveBeenCalledWith(
  expect.objectContaining({
    agentName: "claude",
    instances: group.instances,
    surface: "extension-list",
  }),
);
```

Also assert the rendered icon uses `globalInstalled`, not `installed`:

```ts
mocks.buildInstallState
  .mockReturnValueOnce({
    installed: true,
    globalInstalled: false,
    projectInstalled: true,
    globalInstances: [],
    projectInstances: [group.instances[0]],
    listAction: "open-detail",
  })
  .mockReturnValueOnce({
    installed: true,
    globalInstalled: true,
    projectInstalled: false,
    globalInstances: [group.instances[1]],
    projectInstances: [],
    listAction: "uninstall",
  });

expect(items.map((item) => [item.name, item.installed])).toEqual([
  ["claude", false],
  ["codex", true],
]);
```

- [ ] **Step 2: Add Extensions detail regression test**

In `src/components/extensions/__tests__/extension-install-flow.test.tsx`, capture `AgentInstallIconRow` props and make the selected group contain:

```ts
instances: [
  makeExtension({
    id: "project-frontend-design",
    name: "frontend-design",
    agents: ["claude"],
    scope: { type: "project", name: "alpha", path: "/projects/alpha" },
  }),
  makeExtension({
    id: "global-frontend-design",
    name: "frontend-design",
    agents: ["codex"],
    scope: { type: "global" },
  }),
]
```

Assert global `Install to Agent` highlights only `codex`:

```ts
expect(capturedAgentItems.at(-1)?.map((item) => [item.name, item.installed])).toEqual([
  ["claude", false],
  ["codex", true],
]);
```

- [ ] **Step 3: Run Extensions focused tests**

Run: `npm test -- src/components/extensions/__tests__/extension-table.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx`

Expected: FAIL if the current code passes incomplete instances or uses project-only state for global icons.

- [ ] **Step 4: Apply minimal Extensions fixes**

In `src/components/extensions/extension-table.tsx`, ensure table cells call:

```ts
const state = buildInstallState({
  agentName,
  instances: ext.instances,
  surface: "extension-list",
});
```

In `src/components/extensions/extension-detail.tsx`, ensure global `Install to Agent` uses:

```ts
const isInstalled = installState.globalInstalled;
```

and Project panel items use:

```ts
const isInstalled = installState.projectInstalled;
```

for `projectAgentItems`.

- [ ] **Step 5: Run Extensions focused tests again**

Run: `npm test -- src/components/extensions/__tests__/extension-table.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Extensions state lock**

```bash
git add src/components/extensions/extension-table.tsx src/components/extensions/extension-detail.tsx src/components/extensions/__tests__/extension-table.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx
git commit -m "test: lock extension asset install state"
```

---

### Task 5: Full Verification and Desktop Build

**Files:**
- No source edits expected.

- [ ] **Step 1: Run full frontend test suite**

Run: `npm test`

Expected: PASS. Existing suite should report all test files passing.

- [ ] **Step 2: Run production web build**

Run: `npm run build`

Expected: PASS. Vite may warn about chunks larger than 500 kB; that warning is acceptable for this task.

- [ ] **Step 3: Run Tauri desktop build**

Run from repo root: `npm run tauri:build`

Expected: PASS and produce:

```text
target/release/bundle/macos/HarnessKit.app
target/release/bundle/dmg/HarnessKit_1.3.1_aarch64.dmg
```

If Vite or Tauri fails with a filesystem permission error under `node_modules/.vite-temp`, rerun the same command with escalated permissions and do not change source code for that failure.

- [ ] **Step 4: Commit any test-only follow-up if required**

If verification required only test fixture adjustments, commit them:

```bash
git add src/**/*.test.ts src/**/*.test.tsx
git commit -m "test: cover asset grouping regressions"
```

If there are no changes after verification, skip this commit.

---

## Self-Review Checklist

- Spec goal 1 is covered by Task 1 and Task 2.
- Spec goal 2 is covered by Task 2 and Task 4.
- Spec goal 3 is covered by Task 3 and Task 4.
- Spec goal 4 is covered by Task 3 and Task 4.
- Spec goal 5 is covered by Task 1 strict `hook` and `cli` tests.
- Backend non-goals are preserved because all changes are frontend TypeScript and tests.
- Install/uninstall API behavior is preserved because all install calls keep existing `installFromHub`, `installToAgent`, `installToProject`, and `deleteExtension` paths.
