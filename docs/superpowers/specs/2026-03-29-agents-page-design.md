# Agents Page — Design Spec

## Overview

Add an **Agents** page to HarnessKit that provides a per-agent unified view of all configuration files — Rules, Memory, Settings, Ignore — alongside an extension summary. The current Extensions page manages extensions by type; the Agents page complements it by managing configuration by agent.

**Core principle:** Read-only overview + open in external editor. HarnessKit shows the full picture; users edit in their preferred tools.

---

## Navigation

Agents is a **top-level sidebar entry**, positioned between Overview and Extensions:

```
Overview
Agents      ← new
Extensions
Audit
Marketplace
Settings
```

---

## Page Layout: Master-Detail

**Left panel** — Agent list (fixed width ~200px):
- All 6 agents listed (Claude, Cursor, Codex, Gemini, Copilot, Antigravity)
- Each entry shows: agent icon, name, total config item count
- Undetected agents shown dimmed with "Not detected" label
- Clicking an agent loads its detail in the right panel
- Default selection: first detected agent

**Right panel** — Agent detail (scrollable):
- **Header**: Agent name, vendor, detection status, version (if available)
- **Scope badges**: "Global" and project name badges in the header, showing which scopes have config files
- **Config sections**: Ordered list of config categories, each containing file entries
- **Extensions summary**: At the bottom, a compact summary card with counts and a "View in Extensions →" link

---

## Config Categories

A unified classification with 5 categories. Each agent maps its files into this skeleton. Categories with no files for a given agent are simply not rendered.

### 1. Rules

Instructions and coding conventions that guide the agent's behavior.

| Agent | Global | Project |
|-------|--------|---------|
| Claude | `~/.claude/CLAUDE.md` | `CLAUDE.md`, `.claude/CLAUDE.md` |
| Cursor | — | `.cursorrules`, `.cursor/rules/*.mdc` |
| Codex | `~/.codex/instructions.md` | `AGENTS.md` |
| Gemini | — | `GEMINI.md` |
| Copilot | — | `.github/copilot-instructions.md`, `.github/copilot/*.md` |
| Antigravity | — | `.antigravity/rules/*.md` |

### 2. Memory

Persistent context and knowledge the agent retains across sessions.

| Agent | Files |
|-------|-------|
| Claude | `~/.claude/projects/<project-hash>/memory/*.md` with `MEMORY.md` index |
| Cursor | `.cursor/notepads/*.md` |
| Others | Not supported — category hidden for that agent |

### 3. Settings

Configuration files controlling agent behavior, model selection, permissions, etc.

| Agent | Global | Project |
|-------|--------|---------|
| Claude | `~/.claude/settings.json` | `.claude/settings.json`, `.claude/settings.local.json` |
| Cursor | `~/.cursor/settings.json` | `.cursor/settings.json` |
| Codex | `~/.codex/config.yaml` | — |
| Copilot | — | `.vscode/settings.json` (github.copilot.* keys) |
| Gemini | — | — |
| Antigravity | — | — |

### 4. Ignore

Files that tell the agent what to exclude from context.

| Agent | File |
|-------|------|
| Claude | `.claudeignore` |
| Cursor | `.cursorignore` |
| Copilot | `.copilotignore` |
| Codex | — |
| Gemini | — |
| Antigravity | — |

### 5. Extensions (summary only)

Not a full listing — just a count summary card:
- Shows: `N Skills · N MCP · N Plugins · N Hooks`
- Click action: Navigate to `/extensions` with `?agent=<name>` filter pre-applied

---

## File Entry Behavior

Each config file is rendered as a list row within its category section.

**Collapsed state** (default):
- File name (e.g. `CLAUDE.md`)
- Scope label: "Global · ~/.claude/" or "Project · /myapp/"
- File size
- Expand chevron (▶)

**Expanded state** (on click):
- Content preview: first ~30 lines of the file, rendered in a monospace `<pre>` block with syntax appropriate styling
- Action buttons:
  - **Open in Editor** — calls Tauri `shell.open()` to open the file with the system default application
  - **Copy Path** — copies the absolute file path to clipboard
- If the file does not exist on disk (e.g. deleted since last scan), show a dimmed "File not found" state

---

## Data Model

### New struct: `AgentConfigFile`

```rust
pub struct AgentConfigFile {
    pub path: PathBuf,           // Absolute path on disk
    pub agent: String,           // Agent name (e.g. "claude")
    pub category: ConfigCategory,
    pub scope: ConfigScope,
    pub file_name: String,       // Display name (e.g. "CLAUDE.md")
    pub size_bytes: u64,
    pub modified_at: Option<DateTime<Utc>>,
}

pub enum ConfigCategory {
    Rules,
    Memory,
    Settings,
    Ignore,
}

pub enum ConfigScope {
    Global,
    Project { name: String, path: PathBuf },
}
```

This struct is **not persisted to SQLite**. Config files are discovered fresh on each scan (they change frequently and are the source of truth on disk). No ID generation needed.

### Frontend type

```typescript
interface AgentConfigFile {
  path: string
  agent: string
  category: "rules" | "memory" | "settings" | "ignore"
  scope: { type: "global" } | { type: "project"; name: string; path: string }
  fileName: string
  sizeBytes: number
  modifiedAt: string | null
}

interface AgentDetail {
  name: string
  detected: boolean
  configFiles: AgentConfigFile[]
  extensionCounts: {
    skill: number
    mcp: number
    plugin: number
    hook: number
  }
}
```

---

## AgentAdapter Trait Extension

Add new methods to the `AgentAdapter` trait with default implementations returning empty vecs (backward compatible). Methods are split into **global** (absolute paths) and **project** (relative patterns to check within a project root):

```rust
pub trait AgentAdapter: Send + Sync {
    // ... existing methods ...

    // -- Global config files (absolute paths) --

    /// Global rule/instruction files (e.g. ~/.claude/CLAUDE.md)
    fn global_rules_files(&self) -> Vec<PathBuf> { vec![] }

    /// Global memory files (e.g. ~/.claude/projects/*/memory/*.md)
    fn global_memory_files(&self) -> Vec<PathBuf> { vec![] }

    /// Global settings files (e.g. ~/.claude/settings.json)
    fn global_settings_files(&self) -> Vec<PathBuf> { vec![] }

    // -- Project config file patterns (relative to project root) --

    /// Relative paths/globs for rules within a project (e.g. "CLAUDE.md", ".cursor/rules/*.mdc")
    fn project_rules_patterns(&self) -> Vec<String> { vec![] }

    /// Relative paths/globs for memory within a project (e.g. "memory-bank/*.md")
    fn project_memory_patterns(&self) -> Vec<String> { vec![] }

    /// Relative paths/globs for settings within a project (e.g. ".claude/settings.json")
    fn project_settings_patterns(&self) -> Vec<String> { vec![] }

    /// Relative paths/globs for ignore files within a project (e.g. ".claudeignore")
    fn project_ignore_patterns(&self) -> Vec<String> { vec![] }
}
```

The scanner calls global methods directly for absolute paths, then iterates over registered projects and resolves each project pattern against the project root to find project-scoped files.

---

## Scanner Addition

New function in `scanner.rs`:

```rust
pub fn scan_agent_configs(
    adapter: &dyn AgentAdapter,
    projects: &[ProjectPath],
) -> Vec<AgentConfigFile>
```

Logic:
1. Call `adapter.global_rules_files()`, `global_memory_files()`, `global_settings_files()` — stat each path, build `AgentConfigFile` with `ConfigScope::Global`
2. For each registered project, resolve `adapter.project_rules_patterns()`, `project_memory_patterns()`, `project_settings_patterns()`, `project_ignore_patterns()` against the project root — glob-expand patterns (e.g. `.cursor/rules/*.mdc`), stat each match
3. Skip paths that don't exist on disk
4. Build `AgentConfigFile` with appropriate `ConfigScope::Project { name, path }`

---

## Tauri Commands

```rust
#[tauri::command]
fn list_agent_configs(agent: Option<String>) -> Result<Vec<AgentDetail>, String>
```

- If `agent` is None, returns all agents
- Each `AgentDetail` includes the agent's config files and extension counts
- Extension counts come from existing `list_extensions` with agent filter

```rust
#[tauri::command]
fn read_config_file_preview(path: String, max_lines: usize) -> Result<String, String>
```

- Reads first N lines of a config file for the preview
- Validates the path belongs to a known agent config directory (security: prevent arbitrary file reads)

```rust
#[tauri::command]
fn open_in_editor(path: String) -> Result<(), String>
```

- Uses `tauri::api::shell::open()` or `opener` crate to open file with system default app
- Validates the path before opening

---

## Frontend Components

### New files:

```
src/pages/agents.tsx              — Page component with master-detail layout
src/components/agents/
  agent-list.tsx                  — Left panel agent list
  agent-detail.tsx                — Right panel detail view
  config-section.tsx              — Collapsible section for a config category
  config-file-entry.tsx           — Individual file row with expand/collapse
  config-file-preview.tsx         — Expanded content preview with action buttons
  extensions-summary-card.tsx     — Compact extensions count card with link
```

### New store:

```
src/stores/agent-config-store.ts
```

Zustand store managing:
- `agentDetails: AgentDetail[]` — all agents with their configs
- `selectedAgent: string | null` — currently selected agent name
- `expandedFiles: Set<string>` — paths of currently expanded file entries
- `fetchAgentConfigs()` — calls `list_agent_configs` Tauri command
- `fetchFilePreview(path)` — calls `read_config_file_preview`, caches result
- `openInEditor(path)` — calls `open_in_editor` Tauri command
- `copyPath(path)` — copies to clipboard via `navigator.clipboard`

### Routing:

Add `/agents` route in `App.tsx`, positioned between Overview and Extensions routes.

---

## Interaction Details

1. **Initial load**: When user navigates to `/agents`, `fetchAgentConfigs()` is called. First detected agent is auto-selected.

2. **Agent switching**: Clicking a different agent in the left list updates `selectedAgent`. Config files are already loaded (all agents fetched at once). No additional API call needed.

3. **File expand/collapse**: Click a file row to toggle expansion. On first expand, `fetchFilePreview(path)` is called to load content. Result is cached in the store — subsequent toggles use cache.

4. **Open in Editor**: Calls Tauri command which delegates to OS `open` / `xdg-open` / `start` depending on platform. For `.md` files this typically opens the user's default markdown editor; for `.json` files, their default JSON editor.

5. **Copy Path**: Uses `navigator.clipboard.writeText()`. Shows a brief toast notification on success.

6. **Extensions link**: Clicking "View in Extensions →" navigates to `/extensions?agent=<name>`. The existing extension store already supports agent filtering.

7. **Rescan**: Config files are re-scanned when the Agents page is focused (same pattern as existing extension scan on window focus in `App.tsx`).

---

## Scope & Non-Goals

**In scope:**
- Read-only display of all agent config files
- File content preview
- Open in system default editor
- Copy file path
- Extensions count summary with link

**Not in scope (future):**
- In-app editing of config files
- Cross-agent config sync or migration
- Config file diffing between agents
- Config file creation (e.g. "create .claudeignore for this project")
- Config file templates or presets
- Audit of config files (separate from extension audit)
