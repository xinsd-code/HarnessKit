# Global Asset Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** When viewing extensions in a project scope with an agent filter, also show that agent's globally-scoped assets, tagged with a "Global" badge and sorted after project assets.

**Architecture:** Modify the scope filter in `getCachedFiltered` to include global instances when scope=project+agent is set, sort project-first, add a lightweight `GlobalBadge` component using the existing `--tag-global` design token, and wire it into the ExtensionTable Name column. Remove the forced `scope=all` override on the Extensions page so the scope filter takes effect.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Zustand

---

### Task 1: Add GlobalBadge component

**Files:**
- Create: `src/components/shared/global-badge.tsx`

- [x] **Step 1: Create the GlobalBadge component**

```tsx
import type { Extension } from "@/lib/types";

export function GlobalBadge() {
  return (
    <span
      title="Installed globally — available to this agent across all projects"
      className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-tag-global/10 text-tag-global ring-1 ring-inset ring-tag-global/25 shrink-0 inline-flex items-center"
    >
      Global
    </span>
  );
}

/** True when any instance in the group is globally scoped. */
export function hasGlobalInstance(instances: Extension[]): boolean {
  return instances.some((i) => i.scope.type === "global");
}
```

- [x] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/components/shared/global-badge.tsx`
Expected: no errors

- [x] **Step 3: Commit**

```bash
git add src/components/shared/global-badge.tsx
git commit -m "feat: add GlobalBadge component for globally-scoped extensions"
```

---

### Task 2: Modify scope filter to include global instances for project+agent

**Files:**
- Modify: `src/stores/extension-helpers.ts:331-341`

- [x] **Step 1: Replace the scope filter block in `getCachedFiltered`**

Replace lines 331-341:
```ts
if (!ignoreScope && scope.type !== "all") {
    // Match if any instance is in the requested scope.
    const targetKey = scope.type === "global" ? "global" : scope.path;
    result = result.filter((g) =>
      g.instances.some((i) => {
        const instKey = i.scope.type === "global" ? "global" : i.scope.path;
        return instKey === targetKey;
      }),
    );
  }
```

With:
```ts
if (!ignoreScope && scope.type !== "all") {
    const targetKey = scope.type === "global" ? "global" : scope.path;
    if (scope.type === "project" && agentFilter) {
      // Project + agent filter: include project instances AND global instances
      // belonging to the filtered agent.
      result = result.filter((g) =>
        g.instances.some((i) => {
          const instKey =
            i.scope.type === "global" ? "global" : i.scope.path;
          return (
            instKey === targetKey ||
            (i.scope.type === "global" && i.agents.includes(agentFilter))
          );
        }),
      );
      // Sort: groups with at least one project instance first
      result = [...result].sort((a, b) => {
        const aProj = a.instances.some(
          (i) =>
            i.scope.type === "project" && i.scope.path === targetKey,
        );
        const bProj = b.instances.some(
          (i) =>
            i.scope.type === "project" && i.scope.path === targetKey,
        );
        if (aProj && !bProj) return -1;
        if (!aProj && bProj) return 1;
        return 0;
      });
    } else {
      result = result.filter((g) =>
        g.instances.some((i) => {
          const instKey =
            i.scope.type === "global" ? "global" : i.scope.path;
          return instKey === targetKey;
        }),
      );
    }
  }
```

- [x] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [x] **Step 3: Commit**

```bash
git add src/stores/extension-helpers.ts
git commit -m "feat: include global instances in scope filter when project+agent is set"
```

---

### Task 3: Show GlobalBadge in ExtensionTable Name column

**Files:**
- Modify: `src/components/extensions/extension-table.tsx:1,252-281`

- [x] **Step 1: Add import for GlobalBadge**

Add after line 13 (`import { KindBadge } from ...`):
```tsx
import { GlobalBadge, hasGlobalInstance } from "@/components/shared/global-badge";
```

- [x] **Step 2: Add GlobalBadge next to display name**

In the Name column cell (lines 271-281), add the GlobalBadge after `{displayName}`:

Replace lines 271-281:
```tsx
          return (
            <span className="flex items-center gap-2 font-medium">
              {hasUpdate && (
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                  title="Update available"
                />
              )}
              <span>{displayName}</span>
            </span>
          );
```

With:
```tsx
          return (
            <span className="flex items-center gap-2 font-medium">
              {hasUpdate && (
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                  title="Update available"
                />
              )}
              <span>{displayName}</span>
              {hasGlobalInstance(ext.instances) && <GlobalBadge />}
            </span>
          );
```

- [x] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [x] **Step 4: Commit**

```bash
git add src/components/extensions/extension-table.tsx
git commit -m "feat: show GlobalBadge in extension table for globally-scoped assets"
```

---

### Task 4: Remove forced scope=all override on Extensions page

**Files:**
- Modify: `src/pages/extensions.tsx:53-65,138`

- [x] **Step 1: Remove the scope-override effect**

Delete lines 53-65 (the `useLayoutEffect` that forces scope to `"all"`):
```tsx
  // Extensions should always show the full all-scopes list, regardless of the
  // current sidebar/project selection. Keep the global scope pinned to `all`
  // while this page is mounted so the store-level filters stay in sync.
  useLayoutEffect(() => {
    if (scope.type !== "all") {
      previousProjectScopeRef.current =
        scope.type === "project" ? scope : previousProjectScopeRef.current;
      if (scope.type === "project") {
        setSelectedProjectScope(scope);
      }
      setScope({ type: "all" });
    }
  }, [scope.type, setScope]);
```

- [x] **Step 2: Change filtered() to respect scope**

On line 138, change:
```tsx
const data = useExtensionStore((s) => s.filtered(true));
```
To:
```tsx
const data = useExtensionStore((s) => s.filtered());
```

- [x] **Step 3: Remove unused imports**

Line 1: Remove `useLayoutEffect` from the React import since it was only used by the removed effect. Change:
```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
```
To:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

- [x] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [x] **Step 5: Commit**

```bash
git add src/pages/extensions.tsx
git commit -m "feat: respect scope filter on Extensions page instead of forcing all"
```

---

### Task 5: Manual verification

- [x] **Step 1: Build the project**

Run: `npm run build`
Expected: build succeeds

- [x] **Step 2: Start the dev server and verify manually**

Run: `npm run dev`

Test scenarios:
1. Set scope to a project, filter by an agent → project assets appear first, global assets for that agent appear after with "Global" badge
2. Set scope to global → only global assets shown (existing behavior preserved)
3. Set scope to all → all assets shown (existing behavior preserved)
4. No agent filter + project scope → only project assets shown (existing behavior preserved)
