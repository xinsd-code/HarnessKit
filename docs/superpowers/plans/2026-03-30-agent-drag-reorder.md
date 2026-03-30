# Agent Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-reorder to the Agents page left panel with persistence in SQLite, applying the custom order globally across all UI surfaces.

**Architecture:** Add `sort_order` column to `agent_settings` table. Backend returns agents sorted by `sort_order`. Frontend `sortAgents()` reads order from agent store instead of hardcoded constant. Agents page uses `@dnd-kit/sortable` for drag interaction.

**Tech Stack:** Rust (hk-core store), Tauri commands, React 19, Zustand, `@dnd-kit/core` + `@dnd-kit/sortable`, `lucide-react` (GripVertical icon)

---

## File Structure

### Rust

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `crates/hk-core/src/store.rs` | Add `sort_order` column migration, `get_agent_order`, `set_agent_order` methods |
| Modify | `crates/hk-desktop/src/commands.rs` | Sort `list_agents` by `sort_order`, add `update_agent_order` command |
| Modify | `crates/hk-desktop/src/main.rs` | Register `update_agent_order` command |

### Frontend

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/types.ts` | Change `sortAgents()` to accept custom order parameter |
| Modify | `src/lib/invoke.ts` | Add `updateAgentOrder` API wrapper |
| Modify | `src/stores/agent-store.ts` | Add `reorderAgents` action, expose order for global use |
| Modify | `src/components/agents/agent-list.tsx` | Replace static list with dnd-kit sortable list + drag handles |
| Modify | `src/pages/overview.tsx` | Pass agent order from store to `sortAgents` |
| Modify | `src/pages/marketplace.tsx` | Pass agent order from store to `sortAgents` |
| Modify | `src/components/extensions/extension-filters.tsx` | Pass agent order from store to `sortAgents` |
| Modify | `src/components/extensions/extension-detail.tsx` | Pass agent order from store to `sortAgents` |
| Modify | `src/components/extensions/install-dialog.tsx` | Pass agent order from store to `sortAgents` |
| Modify | `src/stores/agent-config-store.ts` | Sort agentDetails by agent store order |

---

## Task 1: Backend — Schema + Store Methods

**Files:**
- Modify: `crates/hk-core/src/store.rs:70-77` (migration block), add methods after line 115

- [ ] **Step 1: Add sort_order column migration**

In `crates/hk-core/src/store.rs`, add after the existing `agent_settings` CREATE TABLE (after line 77):

```rust
        // Migration: add sort_order to agent_settings
        let _ = self.conn.execute("ALTER TABLE agent_settings ADD COLUMN sort_order INTEGER", []);
```

- [ ] **Step 2: Add `get_agent_order` method**

Add after `set_agent_enabled` method (after line 115) in `crates/hk-core/src/store.rs`:

```rust
    /// Returns agent names in user-defined order. Agents without a sort_order
    /// are appended at the end in their default order.
    pub fn get_agent_order(&self) -> Result<Vec<(String, i32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT name, sort_order FROM agent_settings WHERE sort_order IS NOT NULL ORDER BY sort_order"
        )?;
        let rows: Vec<(String, i32)> = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
        })?.filter_map(|r| r.ok()).collect();
        Ok(rows)
    }

    /// Persist a custom agent order. `names` is the full ordered list of agent names.
    pub fn set_agent_order(&self, names: &[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, name) in names.iter().enumerate() {
            tx.execute(
                "INSERT INTO agent_settings (name, custom_path, enabled, sort_order)
                 VALUES (?1, NULL, 1, ?2)
                 ON CONFLICT(name) DO UPDATE SET sort_order = excluded.sort_order",
                params![name, i as i32],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
```

- [ ] **Step 3: Add test**

Add in the `#[cfg(test)] mod tests` block of `crates/hk-core/src/store.rs`:

```rust
    #[test]
    fn test_agent_order_roundtrip() {
        let (store, _dir) = test_store();
        // Initially empty
        assert!(store.get_agent_order().unwrap().is_empty());

        let order = vec!["cursor".into(), "claude".into(), "codex".into()];
        store.set_agent_order(&order).unwrap();

        let saved = store.get_agent_order().unwrap();
        assert_eq!(saved.len(), 3);
        assert_eq!(saved[0], ("cursor".into(), 0));
        assert_eq!(saved[1], ("claude".into(), 1));
        assert_eq!(saved[2], ("codex".into(), 2));

        // Update order
        let new_order = vec!["codex".into(), "cursor".into(), "claude".into()];
        store.set_agent_order(&new_order).unwrap();
        let saved = store.get_agent_order().unwrap();
        assert_eq!(saved[0].0, "codex");
        assert_eq!(saved[1].0, "cursor");
        assert_eq!(saved[2].0, "claude");
    }
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/zoe/Documents/code/harnesskit && cargo test -p hk-core test_agent_order_roundtrip 2>&1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/zoe/Documents/code/harnesskit
git add crates/hk-core/src/store.rs
git commit -m "feat(store): add sort_order column and agent order methods"
```

---

## Task 2: Backend — Tauri Commands

**Files:**
- Modify: `crates/hk-desktop/src/commands.rs:22-38` (list_agents), add new command
- Modify: `crates/hk-desktop/src/main.rs` (register command)

- [ ] **Step 1: Sort list_agents by sort_order**

In `crates/hk-desktop/src/commands.rs`, replace the `list_agents` function (lines 22-38):

```rust
#[tauri::command]
pub fn list_agents(state: State<AppState>) -> Result<Vec<AgentInfo>, String> {
    let adapters = adapter::all_adapters();
    let store = state.store.lock().map_err(|e| e.to_string())?;

    // Build agent order map from DB (or fall back to adapter iteration order)
    let db_order = store.get_agent_order().unwrap_or_default();
    let order_map: std::collections::HashMap<String, i32> = db_order.into_iter().collect();

    let mut result = Vec::new();
    for a in &adapters {
        let (custom_path, enabled) = store.get_agent_setting(a.name()).unwrap_or((None, true));
        let path = custom_path.unwrap_or_else(|| a.base_dir().to_string_lossy().to_string());
        result.push(AgentInfo {
            name: a.name().to_string(),
            detected: a.detect(),
            extension_count: 0,
            path,
            enabled,
        });
    }

    // Sort by user-defined order; agents without sort_order go to end (index 999)
    result.sort_by_key(|a| *order_map.get(&a.name).unwrap_or(&999));
    Ok(result)
}
```

- [ ] **Step 2: Add update_agent_order command**

Add to `crates/hk-desktop/src/commands.rs`:

```rust
#[tauri::command]
pub fn update_agent_order(state: State<AppState>, names: Vec<String>) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    store.set_agent_order(&names).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Register in main.rs**

Add `commands::update_agent_order,` to the `invoke_handler` list in `crates/hk-desktop/src/main.rs`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/zoe/Documents/code/harnesskit && cargo build -p hk-desktop 2>&1`
Expected: Compiles with no errors

- [ ] **Step 5: Commit**

```bash
cd /Users/zoe/Documents/code/harnesskit
git add crates/hk-desktop/src/commands.rs crates/hk-desktop/src/main.rs
git commit -m "feat(desktop): sort list_agents by custom order, add update_agent_order command"
```

---

## Task 3: Frontend — Types, API, Store

**Files:**
- Modify: `src/lib/types.ts:139-144` (sortAgents)
- Modify: `src/lib/invoke.ts` (add API wrapper)
- Modify: `src/stores/agent-store.ts` (add reorderAgents, expose order)

- [ ] **Step 1: Change sortAgents to accept custom order**

In `src/lib/types.ts`, replace the `sortAgents` function and keep `AGENT_ORDER` as the default fallback:

```typescript
/** Sort an array of agents (or agent-like objects with a `name` field) by a given order. */
export function sortAgents<T extends { name: string }>(agents: T[], order: readonly string[] = AGENT_ORDER): T[] {
  const idx = new Map<string, number>(order.map((n, i) => [n, i]));
  return [...agents].sort((a, b) => (idx.get(a.name) ?? 99) - (idx.get(b.name) ?? 99));
}
```

Also update `sortAgentNames` (line 62-65) the same way:

```typescript
export function sortAgentNames(names: string[], order: readonly string[] = AGENT_ORDER): string[] {
  const idx = new Map<string, number>(order.map((n, i) => [n, i]));
  return [...names].sort((a, b) => (idx.get(a) ?? 99) - (idx.get(b) ?? 99));
}
```

- [ ] **Step 2: Add API wrapper**

Add before the closing `};` in `src/lib/invoke.ts`:

```typescript
  updateAgentOrder(names: string[]): Promise<void> {
    return invoke("update_agent_order", { names });
  },
```

- [ ] **Step 3: Add reorderAgents and agentOrder to agent-store**

Replace `src/stores/agent-store.ts`:

```typescript
import { create } from "zustand";
import { agentDisplayName, AGENT_ORDER, type AgentInfo } from "@/lib/types";
import { api } from "@/lib/invoke";
import { toast } from "@/stores/toast-store";

interface AgentState {
  agents: AgentInfo[];
  loading: boolean;
  /** Current agent order — derived from backend-returned agents array. */
  agentOrder: readonly string[];
  fetch: () => Promise<void>;
  updatePath: (name: string, path: string) => Promise<void>;
  setEnabled: (name: string, enabled: boolean) => Promise<void>;
  reorderAgents: (orderedNames: string[]) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  agentOrder: AGENT_ORDER,
  async fetch() {
    set({ loading: true });
    try {
      const agents = await api.listAgents();
      // Backend returns agents already sorted by sort_order
      set({
        agents,
        agentOrder: agents.map((a) => a.name),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
  async updatePath(name: string, path: string) {
    try {
      await api.updateAgentPath(name, path);
      set({
        agents: get().agents.map((a) =>
          a.name === name ? { ...a, path } : a
        ),
      });
      toast.success(`${agentDisplayName(name)} path updated`);
    } catch {
      toast.error(`Failed to update ${agentDisplayName(name)} path`);
    }
  },
  async setEnabled(name: string, enabled: boolean) {
    try {
      await api.setAgentEnabled(name, enabled);
      set({
        agents: get().agents.map((a) =>
          a.name === name ? { ...a, enabled } : a
        ),
      });
      toast.success(`${agentDisplayName(name)} ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error(`Failed to update ${agentDisplayName(name)}`);
    }
  },
  async reorderAgents(orderedNames: string[]) {
    // Optimistic update
    const agents = get().agents;
    const byName = new Map(agents.map((a) => [a.name, a]));
    const reordered = orderedNames.map((n) => byName.get(n)).filter(Boolean) as AgentInfo[];
    set({ agents: reordered, agentOrder: orderedNames });
    try {
      await api.updateAgentOrder(orderedNames);
    } catch {
      toast.error("Failed to save agent order");
      // Revert on failure
      get().fetch();
    }
  },
}));
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/zoe/Documents/code/harnesskit && npx tsc --noEmit 2>&1`
Expected: Errors in files that call `sortAgents` without the new optional param — these should still work since the param is optional with a default. If there are errors, they indicate something else.

- [ ] **Step 5: Commit**

```bash
cd /Users/zoe/Documents/code/harnesskit
git add src/lib/types.ts src/lib/invoke.ts src/stores/agent-store.ts
git commit -m "feat: add reorderAgents to store, make sortAgents accept custom order"
```

---

## Task 4: Install dnd-kit + Rewrite agent-list with Drag

**Files:**
- Modify: `package.json` (add dependencies)
- Modify: `src/components/agents/agent-list.tsx` (full rewrite)

- [ ] **Step 1: Install dnd-kit**

Run: `cd /Users/zoe/Documents/code/harnesskit && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers`

- [ ] **Step 2: Rewrite agent-list.tsx**

Replace `src/components/agents/agent-list.tsx`:

```tsx
import { useCallback } from "react";
import { clsx } from "clsx";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { agentDisplayName } from "@/lib/types";
import type { AgentDetail } from "@/lib/types";
import { useAgentConfigStore } from "@/stores/agent-config-store";
import { useAgentStore } from "@/stores/agent-store";

function SortableAgentItem({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentDetail;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const itemCount = agent.config_files.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex items-center rounded-lg transition-colors",
        isDragging && "opacity-50 z-10",
        isSelected
          ? "bg-accent text-accent-foreground"
          : agent.detected
            ? "text-foreground/80 hover:bg-accent/50"
            : "text-muted-foreground/50"
      )}
    >
      <div
        className="flex items-center justify-center w-6 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </div>
      <button
        onClick={onSelect}
        disabled={!agent.detected}
        className="flex flex-col items-start flex-1 py-2.5 pr-3 text-left"
      >
        <span className="text-[13px] font-medium">{agentDisplayName(agent.name)}</span>
        <span className="text-[10px] text-muted-foreground">
          {agent.detected ? `${itemCount} items` : "Not detected"}
        </span>
      </button>
    </div>
  );
}

export function AgentList() {
  const agentDetails = useAgentConfigStore((s) => s.agentDetails);
  const selectedAgent = useAgentConfigStore((s) => s.selectedAgent);
  const selectAgent = useAgentConfigStore((s) => s.selectAgent);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const reorderAgents = useAgentStore((s) => s.reorderAgents);

  // Sort agentDetails by the current agent order
  const sorted = [...agentDetails].sort((a, b) => {
    const ai = agentOrder.indexOf(a.name);
    const bi = agentOrder.indexOf(b.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sorted.findIndex((a) => a.name === active.id);
      const newIndex = sorted.findIndex((a) => a.name === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = sorted.map((a) => a.name);
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id as string);
      reorderAgents(newOrder);
    },
    [sorted, reorderAgents],
  );

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Agents
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((a) => a.name)}
          strategy={verticalListSortingStrategy}
        >
          {sorted.map((agent) => (
            <SortableAgentItem
              key={agent.name}
              agent={agent}
              isSelected={agent.name === selectedAgent}
              onSelect={() => selectAgent(agent.name)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zoe/Documents/code/harnesskit && npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/zoe/Documents/code/harnesskit
git add package.json package-lock.json src/components/agents/agent-list.tsx
git commit -m "feat(agents): add drag-to-reorder with dnd-kit and grip handle"
```

---

## Task 5: Global Sort — Update All Callers

**Files:**
- Modify: `src/pages/overview.tsx`
- Modify: `src/pages/marketplace.tsx`
- Modify: `src/components/extensions/extension-filters.tsx`
- Modify: `src/components/extensions/extension-detail.tsx`
- Modify: `src/components/extensions/install-dialog.tsx`
- Modify: `src/stores/agent-config-store.ts`
- Modify: `src/pages/settings.tsx`

Every caller of `sortAgents()` needs to pass `agentOrder` from the agent store. For `sortAgentNames()` callers, same pattern.

- [ ] **Step 1: Update overview.tsx**

In `src/pages/overview.tsx`, add import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component, add:

```typescript
const agentOrder = useAgentStore((s) => s.agentOrder);
```

Change `sortAgents(...)` calls to `sortAgents(..., agentOrder)`.

- [ ] **Step 2: Update marketplace.tsx**

In `src/pages/marketplace.tsx`, add import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component, add:

```typescript
const agentOrder = useAgentStore((s) => s.agentOrder);
```

Change `sortAgents(agents.filter(...))` to `sortAgents(agents.filter(...), agentOrder)`.

- [ ] **Step 3: Update extension-filters.tsx**

In `src/components/extensions/extension-filters.tsx`, add import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component, add:

```typescript
const agentOrder = useAgentStore((s) => s.agentOrder);
```

Change `sortAgents(agents.filter(...))` to `sortAgents(agents.filter(...), agentOrder)`.

- [ ] **Step 4: Update extension-detail.tsx**

In `src/components/extensions/extension-detail.tsx`, add import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component (or relevant sub-component), add:

```typescript
const agentOrder = useAgentStore((s) => s.agentOrder);
```

Change `sortAgents(agents.filter(...))` to `sortAgents(agents.filter(...), agentOrder)`.

- [ ] **Step 5: Update install-dialog.tsx**

In `src/components/extensions/install-dialog.tsx`, add import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component, add:

```typescript
const agentOrder = useAgentStore((s) => s.agentOrder);
```

Change `sortAgents(agents.filter(...))` to `sortAgents(agents.filter(...), agentOrder)`.

- [ ] **Step 6: Update agent-config-store.ts**

In `src/stores/agent-config-store.ts`, the `fetch()` method should sort `agentDetails` by the agent store's order. Import and use the agent store:

At the top of `src/stores/agent-config-store.ts`, add:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

In the `fetch()` method, after receiving `agentDetails`, sort them:

```typescript
async fetch() {
    set({ loading: true });
    try {
      const agentDetails = await api.listAgentConfigs();
      // Sort by agent store order
      const order = useAgentStore.getState().agentOrder;
      const idx = new Map(order.map((n, i) => [n, i]));
      agentDetails.sort((a, b) => (idx.get(a.name) ?? 99) - (idx.get(b.name) ?? 99));

      const current = get().selectedAgent;
      const firstDetected = agentDetails.find((a) => a.detected)?.name ?? null;
      set({
        agentDetails,
        selectedAgent: current && agentDetails.some((a) => a.name === current) ? current : firstDetected,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
```

- [ ] **Step 7: Update settings.tsx**

In `src/pages/settings.tsx`, the agent paths section uses `AGENT_ORDER` directly (line 86: `const agentNames = AGENT_ORDER`). Change to use agent store:

Add import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component, replace `const agentNames = AGENT_ORDER;` with:

```typescript
const agentOrder = useAgentStore((s) => s.agentOrder);
const agentNames = agentOrder;
```

- [ ] **Step 8: Verify TypeScript compiles and app builds**

Run: `cd /Users/zoe/Documents/code/harnesskit && npx tsc --noEmit 2>&1 && npm run build 2>&1 | tail -5`
Expected: No errors, build succeeds

- [ ] **Step 9: Commit**

```bash
cd /Users/zoe/Documents/code/harnesskit
git add src/pages/overview.tsx src/pages/marketplace.tsx src/pages/settings.tsx \
  src/components/extensions/extension-filters.tsx src/components/extensions/extension-detail.tsx \
  src/components/extensions/install-dialog.tsx src/stores/agent-config-store.ts
git commit -m "feat: all UI surfaces respect custom agent order from store"
```

---

## Task 6: Full Build Verification

- [ ] **Step 1: Run all Rust tests**

Run: `cd /Users/zoe/Documents/code/harnesskit && cargo test --workspace 2>&1`
Expected: All tests pass

- [ ] **Step 2: Full build**

Run: `cd /Users/zoe/Documents/code/harnesskit && cargo build --workspace 2>&1 && npm run build 2>&1 | tail -5`
Expected: Both pass
