# HarnessKit Design Spec

> Unified local management dashboard for AI agent extensions (Skills, MCP Servers, Plugins, Hooks) with security auditing and permission visibility.

## 1. Overview

### What is HarnessKit?

HarnessKit is a cross-platform desktop application + CLI tool that gives developers a single interface to manage all extensions installed across their AI coding agents. It covers four extension types — Skills, MCP Servers, Plugins, and Hooks — with built-in security auditing and permission visibility.

### Problem

- Developers use multiple AI agents (Claude Code, Cursor, Codex, etc.) simultaneously
- Each agent stores extensions in different locations with different formats
- No unified view of what's installed, where, and whether it's safe
- 36% of public skills have security flaws (Snyk ToxicSkills, Feb 2026); 27% contain command execution patterns (Mobb.ai audit)
- No local tool exists that manages Skills + MCP + Plugins + Hooks together

### Target User (v1)

Individual developers running multiple AI agents on their local machine.

### Name

- Product: **HarnessKit**
- CLI command: **`hk`**
- Rationale: "Harness" is the runtime framework that loads extensions; "Kit" is the toolkit to manage what goes into it. Covers all extension types without bias toward any one.

## 2. Architecture

### Monorepo Structure

```
harnesskit/
├── crates/
│   ├── hk-core/        # Rust core library: scanning, parsing, auditing
│   ├── hk-cli/         # CLI binary, depends on hk-core
│   └── hk-desktop/     # Tauri app, depends on hk-core
├── src/                # React frontend (Tauri webview)
├── Cargo.toml          # Rust workspace
└── package.json        # Frontend dependencies
```

### Component Diagram

```
┌─────────────────────────────────────────────────┐
│                  HarnessKit                      │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │              hk-core (Rust)                │   │
│  │                                           │   │
│  │  Scanner ─── Scans 6 agents' local dirs   │   │
│  │     ├── SkillScanner                      │   │
│  │     ├── McpScanner                        │   │
│  │     ├── PluginScanner                     │   │
│  │     └── HookScanner                       │   │
│  │                                           │   │
│  │  Auditor ─── 12 security audit rules      │   │
│  │     ├── PatternMatcher (regex)            │   │
│  │     └── TrustScorer (0-100)               │   │
│  │                                           │   │
│  │  Manager ─── Install/uninstall/sync       │   │
│  │     ├── GitInstaller                      │   │
│  │     ├── RegistryClient (skills.sh)        │   │
│  │     └── AgentSyncer                       │   │
│  │                                           │   │
│  │  Store ─── Local metadata storage         │   │
│  │     └── ~/.harnesskit/metadata.db (SQLite)│   │
│  └───────────────────────────────────────────┘   │
│          ▲                    ▲                   │
│          │                    │                   │
│  ┌───────┴──────┐   ┌────────┴──────────┐        │
│  │  hk-cli      │   │  hk-desktop       │        │
│  │  `hk` command│   │  Tauri + React    │        │
│  └──────────────┘   └───────────────────┘        │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Scanner** defines a trait per extension type; agent-specific directory differences are abstracted away inside each scanner implementation. Upper layers consume a unified interface.
- **Store** uses SQLite for metadata (install time, source URL, Trust Score, audit results). It does not copy extension files — only stores pointers.
- **Auditor** is purely functional: input = extension content, output = audit findings + Trust Score. Easy to test.
- **All data is local.** No server deployment. Only outbound network requests for git clone / registry fetch / update checks.
- **File watching** via `notify` crate for real-time refresh in desktop app.

### Local Storage

```
~/.harnesskit/
├── metadata.db          # SQLite — metadata, audit results, install records
├── config.toml          # User config (agent paths, audit rule toggles, etc.)
└── cache/               # Git clone cache, registry index cache
```

### Network Requests (read-only, outbound only)

| Scenario | Target | Description |
|----------|--------|-------------|
| Install from registry | skills.sh / GitHub API | Fetch skill files (same as git clone) |
| Check updates | Same | Compare remote version, uploads nothing |

Offline mode: everything except install and update-check works without internet.

## 3. Agent Adapter Layer

### v1 Supported Agents (6)

| Agent | Skills Dir | MCP Config | Hooks/Plugins |
|-------|-----------|------------|---------------|
| Claude Code | `~/.claude/skills/`, `.claude/skills/` | `~/.claude/settings.json`, `.claude/settings.json` | `~/.claude/settings.json` (hooks field) |
| Cursor | `~/.cursor/skills/`, `.cursor/skills/` | `~/.cursor/mcp.json` | `~/.cursor/hooks.json` |
| Codex | `~/.codex/skills/`, `.codex/skills/` | `~/.codex/config.json` (mcpServers field) | `~/.codex/config.json` (hooks field) |
| Gemini | `~/.gemini/skills/`, `.gemini/skills/` | `~/.gemini/settings.json` | `~/.gemini/settings.json` |
| Antigravity | `~/.antigravity/skills/`, `.antigravity/skills/` | `~/.antigravity/settings.json` | `~/.antigravity/settings.json` |
| Copilot | `~/.github-copilot/skills/`, `.github-copilot/skills/` | `~/.github-copilot/mcp.json` | `~/.github-copilot/hooks.json` |

Note: Paths are based on current public documentation and need verification during implementation.

### Adapter Trait

```rust
trait AgentAdapter {
    fn name(&self) -> &str;
    fn detect(&self) -> bool;           // Is this agent installed?
    fn skill_dirs(&self) -> Vec<PathBuf>;
    fn mcp_config_path(&self) -> PathBuf;
    fn hook_config_path(&self) -> PathBuf;
    fn plugin_dirs(&self) -> Vec<PathBuf>;
    fn read_mcp_servers(&self) -> Vec<McpServer>;
    fn read_hooks(&self) -> Vec<Hook>;
    fn write_mcp_servers(&self, servers: &[McpServer]) -> Result<()>;
    fn write_hooks(&self, hooks: &[Hook]) -> Result<()>;
}
```

- Each agent implements one `AgentAdapter`
- `detect()` checks if the agent's directory exists
- Adding a new agent (e.g., OpenClaw) = adding one new adapter, no changes to upper layers

## 4. Data Model

### Core Types

```rust
struct Extension {
    id: String,                  // uuid
    kind: ExtensionKind,         // Skill | Mcp | Plugin | Hook
    name: String,
    description: String,
    source: Source,
    agents: Vec<AgentRef>,       // Deployed to which agents
    tags: Vec<String>,           // User-defined tags
    permissions: Vec<Permission>,
    enabled: bool,
    trust_score: Option<u8>,     // 0-100, filled after audit
    installed_at: DateTime,
    updated_at: DateTime,
}

enum ExtensionKind { Skill, Mcp, Plugin, Hook }

struct Source {
    origin: SourceOrigin,        // Git | Registry | Local
    url: Option<String>,
    version: Option<String>,
    commit_hash: Option<String>,
}

enum Permission {
    FileSystem { paths: Vec<String> },
    Network { domains: Vec<String> },
    Shell { commands: Vec<String> },
    Database { engines: Vec<String> },
    Env { keys: Vec<String> },
}

struct AuditResult {
    extension_id: String,
    findings: Vec<AuditFinding>,
    trust_score: u8,
    audited_at: DateTime,
}

struct AuditFinding {
    rule: AuditRule,
    severity: Severity,          // Critical | High | Medium | Low
    message: String,
    location: String,            // file:line
}

enum Severity { Critical, High, Medium, Low }
```

### SQLite Tables

| Table | Purpose |
|-------|---------|
| `extensions` | Core info + install time + enabled state |
| `extension_agents` | Many-to-many: extension ↔ agent |
| `extension_tags` | Many-to-many: extension ↔ tag |
| `extension_permissions` | One-to-many: extension → permissions |
| `audit_results` | Per-audit summary (score + timestamp) |
| `audit_findings` | Individual findings per audit |

### Key Points

- `Extension` is the unified model for all four types; `kind` field differentiates them
- `Permission` is auto-inferred by parsing MCP config command/args and skill content — no manual input needed
- Audit results stored separately to support history and comparison

## 5. Security Audit Engine

### Design Principle

Pure input/output — reads extension content, outputs findings. Never modifies files.

### 12 Audit Rules

| # | Rule | Detection Method | Applies To | Severity |
|---|------|-----------------|------------|----------|
| 1 | Prompt injection | Regex: `ignore previous`, `system prompt`, hidden unicode chars | Skill | Critical |
| 2 | Remote code execution | Regex: `curl\|sh`, `wget\|bash`, `base64 -d\|`, `eval(` | Skill, Hook | Critical |
| 3 | Credential theft/exfiltration | Regex: read `~/.ssh`, `.env`, `credentials` + outbound action combo | Skill, Hook | Critical |
| 4 | Plaintext secrets | Regex: high-entropy strings in env values, known prefixes (`sk-`, `ghp_`, `AKIA`) | MCP, Hook | Critical |
| 5 | Safety bypass | Regex: `--yes`, `--no-verify`, `--force`, `allowedTools: *` | Skill, Hook | Critical |
| 6 | Dangerous shell commands | Regex: `rm -rf`, `chmod 777`, `sudo`, `mkfs` | Hook | High |
| 7 | Overly broad permissions | Analyze MCP command + args, flag full filesystem/network access | MCP | High |
| 8 | Untrusted source | Check git remote: unknown org, no stars, account age < 30 days | All | Medium |
| 9 | Supply chain risk | Check npm/pip packages referenced by MCP command against `npm audit` / `pip audit` | MCP | Medium |
| 10 | Outdated | `installed_at` or `updated_at` > 90 days ago | All | Low |
| 11 | Unknown source | `source.origin == Local` with no git tracking | All | Low |
| 12 | Duplicate/conflict | Compare names, descriptions, content similarity | All | Low |

References:
- Snyk ToxicSkills (Feb 2026): 36% of 3,984 skills have security flaws, 13.4% critical
- Mobb.ai audit (Mar 2026): 140,963 findings across 22,511 skills; 27% contain command execution, 15% contain consent bypass
- OWASP Agentic Top 10 (2026): ASI02 Tool Misuse, ASI03 Privilege Abuse, ASI04 Supply Chain Compromise

### Trust Score Calculation

```
base_score = 100

Deductions:
  Critical finding  × -25  (floor at 0)
  High finding      × -15
  Medium finding    × -8
  Low finding       × -3

trust_score = max(0, base_score - total_deductions)
```

### Score Tiers

| Tier | Range | Display |
|------|-------|---------|
| Safe | 80-100 | 🟢 |
| Low Risk | 60-79 | 🟡 |
| High Risk | 40-59 | 🟠 |
| Critical | 0-39 | 🔴 |

### Audit Triggers

- Automatically on install
- Manual: `hk audit` or desktop app "re-audit" button
- Automatically after extension update

### Extensibility

```rust
trait AuditRule {
    fn id(&self) -> &str;
    fn severity(&self) -> Severity;
    fn check(&self, content: &ExtensionContent) -> Vec<AuditFinding>;
}
```

New rules = new struct implementing this trait. No changes to existing code.

## 6. Desktop Application UI

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  HarnessKit                                   ─  □  ×       │
├────────┬─────────────────────────────────────────────────────┤
│        │                                                     │
│  Nav   │  [Main Content Area]                                │
│        │                                                     │
│ Overview│                                                    │
│ Extend. │                                                    │
│ Audit  │                                                     │
│ Agents │                                                     │
│ Settings│                                                    │
│        │                                                     │
├────────┴─────────────────────────────────────────────────────┤
```

### Pages

**1. Overview (Dashboard)**
- Top: 4 stat cards (Skills/MCP/Plugins/Hooks counts) + security issues count
- Middle: Recent install/update timeline
- Bottom: Trust Score distribution chart

**2. Extensions**
- Filter bar: by kind (Skill/MCP/Plugin/Hook), by agent, by tag, by Trust Score tier
- Sort: install time / name / Trust Score
- List items: name, kind badge, agent icons, permission tags (file/network/shell/database), Trust Score color block, enable toggle
- Actions: install, uninstall, enable/disable, sync to other agents, edit tags

**3. Security Audit**
- Global audit overview: distribution chart, Critical/High count trend
- Per-extension expandable: findings list with severity, description, location (file:line)
- One-click audit / re-audit button

**4. Agents**
- Left: detected agent list with extension counts
- Right: selected agent's extensions with same filter/sort capability
- Sync action: multi-select → "sync to other agent"

**5. Settings**
- Agent path configuration (auto-detect + manual override)
- Audit rule toggles
- Update check frequency
- Theme (light / dark, dark default)

### UI Style

shadcn/ui dark theme as default. Clean, minimal design language similar to Linear / Raycast.

## 7. CLI Design

### Command: `hk`

| Command | Description | Example |
|---------|-------------|---------|
| `hk list` | List all extensions | `hk list --kind mcp --agent claude` |
| `hk list agents` | List detected agents | `hk list agents` |
| `hk info <name>` | Extension details | `hk info github-mcp` |
| `hk install <source>` | Install from git/registry | `hk install skills.sh/eslint` |
| `hk uninstall <name>` | Uninstall (move to trash) | `hk uninstall sketchy-hook` |
| `hk enable <name>` | Enable | `hk enable my-skill` |
| `hk disable <name>` | Disable | `hk disable my-skill` |
| `hk sync <name>` | Sync to other agents | `hk sync eslint --to cursor,codex` |
| `hk audit` | Full audit | `hk audit --kind skill --severity critical` |
| `hk audit <name>` | Audit single extension | `hk audit github-mcp` |
| `hk update` | Check & update all | `hk update --dry-run` |
| `hk update <name>` | Update single | `hk update eslint-skill` |
| `hk search <query>` | Search registry | `hk search "eslint"` |
| `hk status` | Status overview | Shows counts, issues, pending updates |

### Output Examples

```
$ hk status

  HarnessKit v0.1.0

  Extensions    67 total (42 skills · 8 mcp · 5 plugins · 12 hooks)
  Agents        5 detected (claude · cursor · codex · gemini · copilot)
  Security      3 critical · 5 high · 12 medium · 8 low
  Updates       4 available

$ hk list --kind mcp

  Name              Agent       Permissions        Score  Status
  ──────────────────────────────────────────────────────────────
  github-mcp        claude      🌐 🗂              72 🟡  enabled
  postgres-mcp      claude      🗄                 85 🟢  enabled
  filesystem-mcp    cursor      🗂                 91 🟢  enabled
  slack-mcp         codex       🌐                 45 🟠  disabled

$ hk audit github-mcp

  github-mcp  Trust Score: 72 🟡

  🟡 HIGH   Broad network access — no domain restriction
             └─ mcp config: args["--host", "*"]
  🟢 LOW    No git source tracking
             └─ source: local
```

## 8. Technical Implementation

### Tauri IPC

Frontend communicates with Rust backend via Tauri `invoke`, not HTTP:

| Tauri Command | Function |
|---------------|----------|
| `list_extensions` | List extensions with filters |
| `get_extension` | Single extension details |
| `install_extension` | Install |
| `uninstall_extension` | Uninstall |
| `toggle_extension` | Enable/disable |
| `sync_extension` | Cross-agent sync |
| `run_audit` | Execute audit |
| `get_audit_results` | Get audit results |
| `list_agents` | Get detected agent list |
| `check_updates` | Check for updates |
| `get_dashboard_stats` | Dashboard statistics |

### Frontend State Management

Zustand (lightweight, appropriate for this scale):

| Store | Responsibility |
|-------|---------------|
| `ExtensionStore` | Extension list, filter state, sort |
| `AuditStore` | Audit results, score distribution |
| `AgentStore` | Agent list, detection state |
| `UIStore` | Theme, sidebar state |

### Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Core logic | Rust |
| Desktop shell | Tauri 2 |
| Frontend framework | React 19 + TypeScript |
| UI components | shadcn/ui + Radix |
| Data tables | TanStack Table |
| Charts | Recharts |
| State management | Zustand |
| Local database | SQLite (via rusqlite) |
| File watching | notify crate |
| CLI output | clap (args) + comfy-table (tables) |

## 9. Scope

### v1

- Rust monorepo (hk-core + hk-cli + hk-desktop)
- 6 agent adapters (Claude Code, Cursor, Codex, Gemini, Antigravity, Copilot)
- 4 extension types (Skills, MCP, Plugins, Hooks)
- 12 security audit rules + Trust Score (0-100)
- Permission tags display (file / network / shell / database / env)
- CLI `hk` with 14 commands
- Desktop app with 5 pages (Overview, Extensions, Audit, Agents, Settings)
- Dark theme default (shadcn/ui, Linear/Raycast style)
- Fully local, no server required

### v2 (Future)

- Scenario switching (one-click extension profile swap)
- Permission relationship graph (React Flow node diagrams)
- OpenClaw adapter (complex multi-agent support)
- Team sharing / config sync
