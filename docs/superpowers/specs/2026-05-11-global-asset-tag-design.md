# Global Asset Tag in Extension List

**Date:** 2026-05-11
**Status:** Approved

## Summary

When viewing extensions in a project scope with an agent filter active, also display that agent's globally-scoped assets alongside project-scoped ones. Global assets get a "Global" badge and are sorted after project assets.

## Changes

### 1. Data Layer — `src/stores/extension-helpers.ts`

Modify `getCachedFiltered` scope filter (lines 331-341):

- When `scope.type === "project"` AND `agentFilter` is set: include groups that have either a project instance in the target project, OR a global instance belonging to the filtered agent.
- Sort groups so those with at least one project instance come first; pure-global groups come after.
- When `scope.type === "project"` but no agent filter is set, or scope is `"global"`: existing behavior unchanged.

### 2. UI — New `GlobalBadge` component

New file: `src/components/shared/global-badge.tsx`

A small pill badge styled similarly to `KindBadge`, using blue tones:
- Text: "Global"
- Style: `inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200`

### 3. UI — `ExtensionTable` Name column

In `src/components/extensions/extension-table.tsx`, add the `GlobalBadge` next to the display name (after the update indicator dot) when any instance in the group has `scope.type === "global"`.

### 4. Page Layer — `src/pages/extensions.tsx`

Remove the `useLayoutEffect` that forces scope to `"all"` (lines 53-65). Change `filtered(true)` to `filtered()` (defaults to `ignoreScope=false`) so the scope filter takes effect.

## Behavior Matrix

| Scope | Agent Filter | Behavior |
|---|---|---|
| `global` | any | Existing: show only global assets |
| `all` | any | Existing: show all assets |
| `project` | none | Existing: show only project assets |
| `project` | set | **New**: project assets first, then global assets for that agent, with Global badge |

## Files Touched

- `src/stores/extension-helpers.ts` — scope filter logic + sorting
- `src/components/shared/global-badge.tsx` — new badge component
- `src/components/extensions/extension-table.tsx` — render GlobalBadge in Name column
- `src/pages/extensions.tsx` — remove forced scope override, use `filtered()` without ignoreScope
