# CLI Extension Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CLI as a fifth ExtensionKind in HarnessKit so that agent-oriented CLI tools (wecom-cli, lark-cli, dws, meitu, officecli) are discovered, audited, and managed as first-class extensions with hard-linked child skills.

**Architecture:** CLI extensions represent installed binaries on the user's PATH. They are discovered via two paths: reverse-lookup from SKILL.md `requires.bins` frontmatter, and a hardcoded KNOWN_CLIS registry. Each CLI is a parent entity whose child skills are linked via `cli_parent_id`. Cascade enable/disable/delete propagates from CLI to all children.

**Tech Stack:** Rust (hk-core, hk-desktop), TypeScript/React (frontend), SQLite (store), Tauri 2 (IPC)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `crates/hk-core/src/models.rs` | Add `Cli` to `ExtensionKind`, add `CliMeta`, extend `Extension` + `DashboardStats` + `ExtensionCounts` |
| Modify | `crates/hk-core/src/store.rs` | Schema migration, upsert/query changes, new CLI helper methods |
| Modify | `crates/hk-core/src/scanner.rs` | KNOWN_CLIS registry, `scan_cli_binaries()`, frontmatter `requires.bins` parsing, `scan_all()` integration |
| Modify | `crates/hk-core/src/auditor/mod.rs` | Extend `AuditInput` with CLI fields |
| Modify | `crates/hk-core/src/auditor/rules.rs` | 5 new CLI audit rules |
| Modify | `crates/hk-desktop/src/commands.rs` | CLI toggle cascade, `get_cli_with_children`, `list_cli_marketplace`, `install_cli` commands |
| Modify | `crates/hk-desktop/src/main.rs` | Register new commands |
| Modify | `crates/hk-core/src/marketplace.rs` | `CliRegistryEntry`, `CLI_REGISTRY`, `list_cli_registry()` |
| Modify | `src/lib/types.ts` | TS mirror of Rust model changes |
| Modify | `src/lib/invoke.ts` | New Tauri invoke wrappers |
| Modify | `src/stores/extension-store.ts` | `childSkillsOf()`, CLI in grouping logic |
| Modify | `src/stores/marketplace-store.ts` | CLI tab support |
| Modify | `src/components/shared/kind-badge.tsx` | CLI badge entry |
| Modify | `src/index.css` | `--kind-cli` color variable |
| Modify | `src/pages/extensions.tsx` | CLI detail view with child skills |
| Modify | `src/pages/marketplace.tsx` | CLI Tools tab |
| Modify | `src/pages/overview.tsx` | CLI stat card |

---

### Task 1: Rust Data Model — ExtensionKind::Cli + CliMeta

**Files:**
- Modify: `crates/hk-core/src/models.rs`

- [ ] **Step 1: Add `Cli` variant to `ExtensionKind` enum**

In `crates/hk-core/src/models.rs`, add `Cli` after `Hook` at line 32:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExtensionKind {
    Skill,
    Mcp,
    Plugin,
    Hook,
    Cli,
}
```

- [ ] **Step 2: Update `as_str()` and `FromStr` impls**

Add `Cli` arm to both impls:

```rust
impl ExtensionKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Skill => "skill",
            Self::Mcp => "mcp",
            Self::Plugin => "plugin",
            Self::Hook => "hook",
            Self::Cli => "cli",
        }
    }
}

impl FromStr for ExtensionKind {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "skill" => Ok(Self::Skill),
            "mcp" => Ok(Self::Mcp),
            "plugin" => Ok(Self::Plugin),
            "hook" => Ok(Self::Hook),
            "cli" => Ok(Self::Cli),
            _ => Err(anyhow::anyhow!("unknown extension kind: {s}")),
        }
    }
}
```

- [ ] **Step 3: Add `CliMeta` struct**

Insert after the `Permission` impl block (after line 111):

```rust
// --- CLI Metadata ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliMeta {
    pub binary_name: String,
    pub binary_path: Option<String>,
    pub install_method: Option<String>,
    pub credentials_path: Option<String>,
    pub version: Option<String>,
    pub api_domains: Vec<String>,
}
```

- [ ] **Step 4: Add `cli_parent_id` and `cli_meta` to `Extension` struct**

Add two fields at the end of the Extension struct (before the closing brace at line 24):

```rust
pub struct Extension {
    pub id: String,
    pub kind: ExtensionKind,
    pub name: String,
    pub description: String,
    pub source: Source,
    pub agents: Vec<String>,
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub permissions: Vec<Permission>,
    pub enabled: bool,
    pub trust_score: Option<u8>,
    pub installed_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub source_path: Option<String>,
    pub cli_parent_id: Option<String>,
    pub cli_meta: Option<CliMeta>,
}
```

- [ ] **Step 5: Add `cli_count` to `DashboardStats` and `ExtensionCounts`**

```rust
pub struct DashboardStats {
    pub total_extensions: usize,
    pub skill_count: usize,
    pub mcp_count: usize,
    pub plugin_count: usize,
    pub hook_count: usize,
    pub cli_count: usize,
    pub critical_issues: usize,
    pub high_issues: usize,
    pub medium_issues: usize,
    pub low_issues: usize,
    pub updates_available: usize,
}

pub struct ExtensionCounts {
    pub skill: usize,
    pub mcp: usize,
    pub plugin: usize,
    pub hook: usize,
    pub cli: usize,
}
```

- [ ] **Step 6: Update tests**

Add to the existing test module:

```rust
#[test]
fn test_extension_kind_cli() {
    assert_eq!(ExtensionKind::Cli.as_str(), "cli");
    assert_eq!("cli".parse::<ExtensionKind>().unwrap(), ExtensionKind::Cli);
}

#[test]
fn test_cli_meta_serde() {
    let meta = CliMeta {
        binary_name: "wecom-cli".into(),
        binary_path: Some("/usr/local/bin/wecom-cli".into()),
        install_method: Some("npm".into()),
        credentials_path: Some("~/.config/wecom/bot.enc".into()),
        version: Some("1.2.3".into()),
        api_domains: vec!["qyapi.weixin.qq.com".into()],
    };
    let json = serde_json::to_string(&meta).unwrap();
    let round_trip: CliMeta = serde_json::from_str(&json).unwrap();
    assert_eq!(round_trip.binary_name, "wecom-cli");
    assert_eq!(round_trip.api_domains.len(), 1);
}
```

- [ ] **Step 7: Run tests**

Run: `cargo test -p hk-core -- models`
Expected: All tests pass including the two new ones.

- [ ] **Step 8: Commit**

```bash
git add crates/hk-core/src/models.rs
git commit -m "feat: add Cli variant to ExtensionKind + CliMeta struct"
```

---

### Task 2: Store — Schema Migration + CLI Columns

**Files:**
- Modify: `crates/hk-core/src/store.rs`

- [ ] **Step 1: Add migration for `cli_parent_id` and `cli_meta_json` columns**

In the `migrate()` method, after the existing migration for `source_path` (line 65), add:

```rust
// Migration: add cli_parent_id for linking child skills to parent CLI
let _ = self.conn.execute("ALTER TABLE extensions ADD COLUMN cli_parent_id TEXT", []);
// Migration: add cli_meta_json for CLI-specific metadata
let _ = self.conn.execute("ALTER TABLE extensions ADD COLUMN cli_meta_json TEXT", []);
```

- [ ] **Step 2: Update `insert_extension` to write new columns**

Change the INSERT statement (line 150) to include the two new columns:

```rust
pub fn insert_extension(&self, ext: &Extension) -> Result<()> {
    self.conn.execute(
        "INSERT INTO extensions (id, kind, name, description, source_json, agents_json, tags_json, permissions_json, enabled, trust_score, installed_at, updated_at, category, last_used_at, source_path, cli_parent_id, cli_meta_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           name = excluded.name,
           description = excluded.description,
           source_json = excluded.source_json,
           agents_json = excluded.agents_json,
           permissions_json = excluded.permissions_json,
           updated_at = excluded.updated_at,
           category = extensions.category,
           last_used_at = COALESCE(extensions.last_used_at, excluded.last_used_at),
           source_path = excluded.source_path,
           cli_parent_id = excluded.cli_parent_id,
           cli_meta_json = excluded.cli_meta_json",
        params![
            ext.id,
            ext.kind.as_str(),
            ext.name,
            ext.description,
            serde_json::to_string(&ext.source)?,
            serde_json::to_string(&ext.agents)?,
            serde_json::to_string(&ext.tags)?,
            serde_json::to_string(&ext.permissions)?,
            ext.enabled as i32,
            ext.trust_score.map(|s| s as i32),
            ext.installed_at.to_rfc3339(),
            ext.updated_at.to_rfc3339(),
            ext.category,
            ext.last_used_at.map(|dt| dt.to_rfc3339()),
            ext.source_path,
            ext.cli_parent_id,
            ext.cli_meta.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default()),
        ],
    )?;
    Ok(())
}
```

- [ ] **Step 3: Update `sync_extensions` to include new columns**

Same change to the INSERT in `sync_extensions` (line 313). Add `cli_parent_id` and `cli_meta_json` as parameters ?16 and ?17, matching the same pattern as `insert_extension`.

- [ ] **Step 4: Update `row_to_extension` to read new columns**

Update the SELECT queries in `get_extension` (line 186) and `list_extensions` (line 199) to include the two new columns. Then update `row_to_extension` (line 466):

```rust
fn row_to_extension(&self, row: &rusqlite::Row) -> Result<Extension> {
    let kind_str: String = row.get(1)?;
    let source_json: String = row.get(4)?;
    let agents_json: String = row.get(5)?;
    let tags_json: String = row.get(6)?;
    let permissions_json: String = row.get(7)?;
    let installed_at_str: String = row.get(10)?;
    let updated_at_str: String = row.get(11)?;
    let last_used_at_str: Option<String> = row.get::<_, Option<String>>(13).ok().flatten();
    let cli_meta_json: Option<String> = row.get::<_, Option<String>>(16).ok().flatten();

    Ok(Extension {
        id: row.get(0)?,
        kind: kind_str.parse()?,
        name: row.get(2)?,
        description: row.get(3)?,
        source: serde_json::from_str(&source_json)?,
        agents: serde_json::from_str(&agents_json)?,
        tags: serde_json::from_str(&tags_json)?,
        category: row.get::<_, Option<String>>(12).ok().flatten(),
        permissions: serde_json::from_str(&permissions_json)?,
        enabled: row.get::<_, i32>(8)? != 0,
        trust_score: row.get::<_, Option<i32>>(9)?.map(|s| s as u8),
        installed_at: DateTime::parse_from_rfc3339(&installed_at_str)?
            .with_timezone(&Utc),
        updated_at: DateTime::parse_from_rfc3339(&updated_at_str)?
            .with_timezone(&Utc),
        last_used_at: last_used_at_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
        source_path: row.get::<_, Option<String>>(14).ok().flatten(),
        cli_parent_id: row.get::<_, Option<String>>(15).ok().flatten(),
        cli_meta: cli_meta_json.and_then(|j| serde_json::from_str(&j).ok()),
    })
}
```

The SELECT column list becomes (add to all 3 places: `get_extension`, `list_extensions`, `sync_extensions` stale check is fine as-is since it only reads id+enabled):

```sql
SELECT id, kind, name, description, source_json, agents_json, tags_json, permissions_json, enabled, trust_score, installed_at, updated_at, category, last_used_at, source_path, cli_parent_id, cli_meta_json FROM extensions
```

- [ ] **Step 5: Add CLI helper methods**

Add after `find_siblings_by_source_path` (line 299):

```rust
/// Get all child skills linked to a CLI extension
pub fn get_child_skills(&self, cli_id: &str) -> Result<Vec<Extension>> {
    let mut stmt = self.conn.prepare(
        "SELECT id, kind, name, description, source_json, agents_json, tags_json, permissions_json, enabled, trust_score, installed_at, updated_at, category, last_used_at, source_path, cli_parent_id, cli_meta_json
         FROM extensions WHERE cli_parent_id = ?1 ORDER BY name"
    )?;
    let rows = stmt.query_map(params![cli_id], |row| Ok(self.row_to_extension(row)))?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row??);
    }
    Ok(results)
}

/// Link child skills to a CLI parent
pub fn link_skills_to_cli(&self, cli_id: &str, skill_ids: &[String]) -> Result<()> {
    for skill_id in skill_ids {
        self.conn.execute(
            "UPDATE extensions SET cli_parent_id = ?1 WHERE id = ?2",
            params![cli_id, skill_id],
        )?;
    }
    Ok(())
}

/// Unlink all children from a CLI (set cli_parent_id to NULL)
pub fn unlink_cli_children(&self, cli_id: &str) -> Result<()> {
    self.conn.execute(
        "UPDATE extensions SET cli_parent_id = NULL WHERE cli_parent_id = ?1",
        params![cli_id],
    )?;
    Ok(())
}
```

- [ ] **Step 6: Update `sample_extension` in tests**

Add the two new fields to the test helper (line 510):

```rust
fn sample_extension() -> Extension {
    Extension {
        // ... existing fields ...
        source_path: None,
        cli_parent_id: None,
        cli_meta: None,
    }
}
```

- [ ] **Step 7: Add CLI store tests**

```rust
#[test]
fn test_cli_extension_roundtrip() {
    let (store, _dir) = test_store();
    let mut ext = sample_extension();
    ext.id = "cli-test-001".into();
    ext.kind = ExtensionKind::Cli;
    ext.name = "wecom-cli".into();
    ext.cli_meta = Some(CliMeta {
        binary_name: "wecom-cli".into(),
        binary_path: Some("/usr/local/bin/wecom-cli".into()),
        install_method: Some("npm".into()),
        credentials_path: Some("~/.config/wecom/bot.enc".into()),
        version: Some("1.2.3".into()),
        api_domains: vec!["qyapi.weixin.qq.com".into()],
    });
    store.insert_extension(&ext).unwrap();
    let fetched = store.get_extension("cli-test-001").unwrap().unwrap();
    assert_eq!(fetched.kind, ExtensionKind::Cli);
    let meta = fetched.cli_meta.unwrap();
    assert_eq!(meta.binary_name, "wecom-cli");
    assert_eq!(meta.version, Some("1.2.3".into()));
}

#[test]
fn test_cli_parent_child_link() {
    let (store, _dir) = test_store();

    // Create CLI parent
    let mut cli = sample_extension();
    cli.id = "cli-parent".into();
    cli.kind = ExtensionKind::Cli;
    cli.name = "wecom-cli".into();
    store.insert_extension(&cli).unwrap();

    // Create child skills
    let mut s1 = sample_extension();
    s1.id = "skill-child-1".into();
    s1.name = "wecomcli-send-message".into();
    s1.cli_parent_id = Some("cli-parent".into());
    store.insert_extension(&s1).unwrap();

    let mut s2 = sample_extension();
    s2.id = "skill-child-2".into();
    s2.name = "wecomcli-lookup-contact".into();
    s2.cli_parent_id = Some("cli-parent".into());
    store.insert_extension(&s2).unwrap();

    // Query children
    let children = store.get_child_skills("cli-parent").unwrap();
    assert_eq!(children.len(), 2);

    // Unlink
    store.unlink_cli_children("cli-parent").unwrap();
    let children = store.get_child_skills("cli-parent").unwrap();
    assert_eq!(children.len(), 0);
}
```

- [ ] **Step 8: Run tests**

Run: `cargo test -p hk-core -- store`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add crates/hk-core/src/store.rs
git commit -m "feat: add CLI columns to store schema + parent-child query methods"
```

---

### Task 3: Scanner — CLI Discovery

**Files:**
- Modify: `crates/hk-core/src/scanner.rs`

- [ ] **Step 1: Add KNOWN_CLIS registry**

Add after the `use` block (after line 7):

```rust
/// Metadata for known agent-oriented CLI tools.
/// These are CLIs whose vendors have shipped official Agent Skills integration.
struct KnownCli {
    binary_name: &'static str,
    display_name: &'static str,
    api_domains: &'static [&'static str],
    credentials_path: Option<&'static str>,
}

static KNOWN_CLIS: &[KnownCli] = &[
    KnownCli {
        binary_name: "wecom-cli",
        display_name: "WeChat Work CLI",
        api_domains: &["qyapi.weixin.qq.com"],
        credentials_path: Some("~/.config/wecom/bot.enc"),
    },
    KnownCli {
        binary_name: "lark-cli",
        display_name: "Lark / Feishu CLI",
        api_domains: &["open.feishu.cn", "open.larksuite.com"],
        credentials_path: Some("~/.config/lark/credentials"),
    },
    KnownCli {
        binary_name: "dws",
        display_name: "DingTalk Workspace CLI",
        api_domains: &["api.dingtalk.com"],
        credentials_path: Some("~/.config/dws/auth.json"),
    },
    KnownCli {
        binary_name: "meitu",
        display_name: "Meitu CLI",
        api_domains: &["openapi.mtlab.meitu.com"],
        credentials_path: Some("~/.meitu/credentials.json"),
    },
    KnownCli {
        binary_name: "officecli",
        display_name: "OfficeCLI",
        api_domains: &[],
        credentials_path: None,
    },
];
```

- [ ] **Step 2: Add `cli_stable_id` function**

Add after `project_stable_id` (line 280):

```rust
/// Generate a deterministic ID for CLI extensions.
/// CLIs are global (not agent-scoped), so the key is just "cli::{binary_name}".
fn cli_stable_id(binary_name: &str) -> String {
    let key = format!("cli::{}", binary_name);
    format!("{:016x}", fnv1a(key.as_bytes()))
}
```

- [ ] **Step 3: Enhance `parse_skill_frontmatter` to return `requires_bins`**

Change the return type and add parsing for `requires.bins`. Rename the function's return to a tuple of 3:

```rust
/// Parse SKILL.md frontmatter. Returns (name, description, requires_bins).
pub fn parse_skill_frontmatter(content: &str) -> Option<(String, String, Vec<String>)> {
    if !content.starts_with("---") { return None; }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let frontmatter = &rest[..end];
    let mut name = None;
    let mut description = None;
    let mut requires_bins: Vec<String> = Vec::new();
    let mut in_bins_block = false;
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("name:") {
            name = Some(val.trim().to_string());
            in_bins_block = false;
        } else if let Some(val) = trimmed.strip_prefix("description:") {
            description = Some(val.trim().to_string());
            in_bins_block = false;
        } else if trimmed == "bins:" {
            in_bins_block = true;
        } else if in_bins_block && trimmed.starts_with("- ") {
            let bin = trimmed.strip_prefix("- ").unwrap().trim().trim_matches('"').to_string();
            if !bin.is_empty() { requires_bins.push(bin); }
        } else if in_bins_block && !trimmed.starts_with('-') && !trimmed.is_empty() {
            in_bins_block = false;
        }
        // Also handle inline YAML array: bins: ["wecom-cli", "lark-cli"]
        if let Some(val) = trimmed.strip_prefix("bins:") {
            let val = val.trim();
            if val.starts_with('[') && val.ends_with(']') {
                let inner = &val[1..val.len()-1];
                for item in inner.split(',') {
                    let bin = item.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !bin.is_empty() { requires_bins.push(bin); }
                }
                in_bins_block = false;
            }
        }
    }
    Some((name?, description.unwrap_or_default(), requires_bins))
}
```

- [ ] **Step 4: Update all call sites of `parse_skill_frontmatter`**

In `scan_skill_dir` (line 57), update the destructuring:

```rust
let (name, description, _requires_bins) = parse_skill_frontmatter(&content)
    .unwrap_or_else(|| {
        let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        (name, String::new(), vec![])
    });
```

In `parse_skill_name` (line 662):

```rust
pub fn parse_skill_name(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_skill_frontmatter(&content).map(|(name, _, _)| name)
}
```

Also update any other call sites found by the compiler.

- [ ] **Step 5: Add `scan_cli_binaries` function**

Add after `scan_all`:

```rust
/// Scan for agent-oriented CLI tools.
/// Phase 1: reverse-discover from SKILL.md requires.bins fields.
/// Phase 2: check KNOWN_CLIS registry.
/// Returns (cli_extensions, child_links) where child_links maps cli_id -> Vec<skill_id>.
pub fn scan_cli_binaries(scanned_skills: &[Extension]) -> (Vec<Extension>, HashMap<String, Vec<String>>) {
    let mut candidate_bins: HashSet<String> = HashSet::new();
    let mut bin_to_skill_ids: HashMap<String, Vec<String>> = HashMap::new();

    // Phase 1: extract requires.bins from scanned skills
    for ext in scanned_skills {
        if ext.kind != ExtensionKind::Skill { continue; }
        let Some(ref sp) = ext.source_path else { continue; };
        let content = match std::fs::read_to_string(sp) {
            Ok(c) => c,
            Err(_) => {
                // Try the non-disabled path
                let alt = sp.replace("SKILL.md.disabled", "SKILL.md");
                std::fs::read_to_string(&alt).unwrap_or_default()
            }
        };
        if let Some((_, _, bins)) = parse_skill_frontmatter(&content) {
            for bin in &bins {
                candidate_bins.insert(bin.clone());
                bin_to_skill_ids.entry(bin.clone()).or_default().push(ext.id.clone());
            }
        }
    }

    // Phase 2: add KNOWN_CLIS to candidates
    for known in KNOWN_CLIS {
        candidate_bins.insert(known.binary_name.to_string());
    }

    let mut clis = Vec::new();
    let mut child_links: HashMap<String, Vec<String>> = HashMap::new();
    let now = Utc::now();

    for bin_name in &candidate_bins {
        // Resolve binary on PATH
        let binary_path = which_binary(bin_name);
        let version = binary_path.as_ref().and_then(|_| get_binary_version(bin_name));
        let install_method = binary_path.as_ref().and_then(|p| detect_install_method(p));

        // Merge with KNOWN_CLIS metadata
        let known = KNOWN_CLIS.iter().find(|k| k.binary_name == bin_name.as_str());
        let display_name = known.map(|k| k.display_name.to_string())
            .unwrap_or_else(|| bin_name.clone());
        let api_domains: Vec<String> = known
            .map(|k| k.api_domains.iter().map(|d| d.to_string()).collect())
            .unwrap_or_default();
        let credentials_path = known.and_then(|k| k.credentials_path.map(|p| p.to_string()));

        // Auto-derive permissions from CliMeta
        let mut permissions = Vec::new();
        if !api_domains.is_empty() {
            permissions.push(Permission::Network { domains: api_domains.clone() });
        }
        if let Some(ref cred) = credentials_path {
            permissions.push(Permission::FileSystem { paths: vec![cred.clone()] });
        }
        if binary_path.is_some() {
            permissions.push(Permission::Shell { commands: vec![bin_name.clone()] });
        }

        let cli_id = cli_stable_id(bin_name);

        let ext = Extension {
            id: cli_id.clone(),
            kind: ExtensionKind::Cli,
            name: display_name,
            description: format!("Agent-oriented CLI: {}", bin_name),
            source: Source {
                origin: if binary_path.is_some() { SourceOrigin::Local } else { SourceOrigin::Registry },
                url: None,
                version: version.clone(),
                commit_hash: None,
            },
            agents: vec![], // CLIs are global, not agent-scoped
            tags: vec![],
            category: Some("cli".into()),
            permissions,
            enabled: binary_path.is_some(),
            trust_score: None,
            installed_at: now,
            updated_at: now,
            last_used_at: None,
            source_path: binary_path.clone(),
            cli_parent_id: None,
            cli_meta: Some(CliMeta {
                binary_name: bin_name.clone(),
                binary_path,
                install_method,
                credentials_path,
                version,
                api_domains,
            }),
        };
        clis.push(ext);

        // Collect child links
        if let Some(skill_ids) = bin_to_skill_ids.get(bin_name.as_str()) {
            child_links.insert(cli_id, skill_ids.clone());
        }
    }

    (clis, child_links)
}

fn which_binary(name: &str) -> Option<String> {
    std::process::Command::new("which")
        .arg(name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn get_binary_version(name: &str) -> Option<String> {
    std::process::Command::new(name)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
            // Extract version number pattern (e.g., "1.2.3" from "wecom-cli v1.2.3")
            static VERSION_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\d+\.\d+[\.\d]*").unwrap());
            VERSION_RE.find(&out).map(|m| m.as_str().to_string()).unwrap_or(out)
        })
}

fn detect_install_method(path: &str) -> Option<String> {
    if path.contains(".npm") || path.contains("node_modules") || path.contains("/npm/") {
        Some("npm".into())
    } else if path.contains(".cargo") {
        Some("cargo".into())
    } else if path.contains("pip") || path.contains("python") || path.contains(".local/bin") {
        Some("pip".into())
    } else if path.contains("homebrew") || path.contains("Cellar") {
        Some("brew".into())
    } else {
        None
    }
}
```

- [ ] **Step 6: Update `scan_all` to include CLI scanning**

Replace the existing `scan_all` function (lines 262-274):

```rust
/// Scan all extensions from all detected agents
pub fn scan_all(adapters: &[Box<dyn AgentAdapter>]) -> Vec<Extension> {
    let mut all = Vec::new();
    for adapter in adapters {
        if !adapter.detect() { continue; }
        for skill_dir in adapter.skill_dirs() {
            all.extend(scan_skill_dir(&skill_dir, adapter.name()));
        }
        all.extend(scan_mcp_servers(adapter.as_ref()));
        all.extend(scan_hooks(adapter.as_ref()));
        all.extend(scan_plugins(adapter.as_ref()));
    }

    // Scan CLI binaries (global, not per-adapter)
    let (clis, child_links) = scan_cli_binaries(&all);

    // Back-fill cli_parent_id on child skills
    for ext in &mut all {
        for (cli_id, skill_ids) in &child_links {
            if skill_ids.contains(&ext.id) {
                ext.cli_parent_id = Some(cli_id.clone());
            }
        }
    }

    all.extend(clis);
    all
}
```

- [ ] **Step 7: Add `use std::collections::HashMap`**

Make sure `HashMap` is imported at the top of scanner.rs (it already imports `HashSet`; add `HashMap`):

```rust
use std::collections::{HashMap, HashSet};
```

- [ ] **Step 8: Run tests**

Run: `cargo test -p hk-core`
Expected: All tests pass. Compiler may flag the changed `parse_skill_frontmatter` signature — fix any remaining call sites.

- [ ] **Step 9: Commit**

```bash
git add crates/hk-core/src/scanner.rs
git commit -m "feat: add CLI binary scanner with KNOWN_CLIS registry + requires.bins parsing"
```

---

### Task 4: Auditor — CLI-Specific Audit Rules

**Files:**
- Modify: `crates/hk-core/src/auditor/mod.rs`
- Modify: `crates/hk-core/src/auditor/rules.rs`

- [ ] **Step 1: Extend AuditInput**

In `mod.rs`, add CLI fields to `AuditInput` (after line 19):

```rust
pub struct AuditInput {
    pub extension_id: String,
    pub kind: crate::models::ExtensionKind,
    pub name: String,
    pub content: String,
    pub source: crate::models::Source,
    pub file_path: String,
    pub mcp_command: Option<String>,
    pub mcp_args: Vec<String>,
    pub mcp_env: std::collections::HashMap<String, String>,
    pub installed_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
    pub permissions: Vec<crate::models::Permission>,
    // CLI-specific fields
    pub cli_meta: Option<crate::models::CliMeta>,
    pub child_permissions: Vec<crate::models::Permission>,
}
```

- [ ] **Step 2: Update all AuditInput construction sites**

In `commands.rs`, wherever `AuditInput` is constructed (the `run_audit` command), add the new fields with defaults:

```rust
cli_meta: ext.cli_meta.clone(),
child_permissions: vec![], // populated for CLI kind below
```

For CLI extensions, after constructing the input, populate `child_permissions` by collecting all child skills' permissions from the store.

- [ ] **Step 3: Add 5 CLI audit rules to rules.rs**

Add after the existing `PermissionCombinationRisk` rule (end of file). Import `CliMeta` at the top:

```rust
use crate::models::{AuditFinding, CliMeta, ExtensionKind, Permission, Severity, SourceOrigin};
```

Register in `all_rules()`:

```rust
pub fn all_rules() -> Vec<Box<dyn AuditRule>> {
    vec![
        // ... existing 13 rules ...
        Box::new(CliCredentialStorage),
        Box::new(CliNetworkAccess),
        Box::new(CliBinarySource),
        Box::new(CliPermissionScope),
        Box::new(CliAggregateRisk),
    ]
}
```

Rule implementations:

```rust
// --- Rule 14: CLI Credential Storage ---
pub struct CliCredentialStorage;

impl AuditRule for CliCredentialStorage {
    fn id(&self) -> &str { "cli-credential-storage" }
    fn severity(&self) -> Severity { Severity::High }
    fn check(&self, input: &AuditInput) -> Vec<AuditFinding> {
        let mut findings = Vec::new();
        let Some(ref meta) = input.cli_meta else { return findings };
        if input.kind != ExtensionKind::Cli { return findings; }

        if let Some(ref cred_path) = meta.credentials_path {
            let expanded = cred_path.replace("~", &dirs::home_dir().unwrap_or_default().to_string_lossy());
            let path = std::path::Path::new(&expanded);
            if path.exists() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(metadata) = path.metadata() {
                        let mode = metadata.permissions().mode() & 0o777;
                        if mode & 0o044 != 0 {
                            findings.push(AuditFinding {
                                rule_id: self.id().into(),
                                severity: self.severity(),
                                message: format!("Credential file {} has overly permissive mode {:o} (should be 600)", cred_path, mode),
                                location: cred_path.clone(),
                            });
                        }
                    }
                }
            }
        } else if !meta.api_domains.is_empty() {
            // CLI connects to APIs but we don't know where creds are stored
            findings.push(AuditFinding {
                rule_id: self.id().into(),
                severity: Severity::Medium,
                message: format!("CLI '{}' connects to external APIs but credential storage location is unknown", meta.binary_name),
                location: meta.binary_name.clone(),
            });
        }
        findings
    }
}

// --- Rule 15: CLI Network Access ---
pub struct CliNetworkAccess;

impl AuditRule for CliNetworkAccess {
    fn id(&self) -> &str { "cli-network-access" }
    fn severity(&self) -> Severity { Severity::Medium }
    fn check(&self, input: &AuditInput) -> Vec<AuditFinding> {
        let mut findings = Vec::new();
        let Some(ref meta) = input.cli_meta else { return findings };
        if input.kind != ExtensionKind::Cli { return findings; }

        if meta.api_domains.len() > 3 {
            findings.push(AuditFinding {
                rule_id: self.id().into(),
                severity: self.severity(),
                message: format!("CLI '{}' connects to {} external domains — broad network surface", meta.binary_name, meta.api_domains.len()),
                location: meta.binary_name.clone(),
            });
        }
        findings
    }
}

// --- Rule 16: CLI Binary Source ---
pub struct CliBinarySource;

impl AuditRule for CliBinarySource {
    fn id(&self) -> &str { "cli-binary-source" }
    fn severity(&self) -> Severity { Severity::High }
    fn check(&self, input: &AuditInput) -> Vec<AuditFinding> {
        let mut findings = Vec::new();
        let Some(ref meta) = input.cli_meta else { return findings };
        if input.kind != ExtensionKind::Cli { return findings; }

        match meta.install_method.as_deref() {
            Some("npm") | Some("pip") | Some("brew") | Some("cargo") => {}
            Some("curl") => {
                findings.push(AuditFinding {
                    rule_id: self.id().into(),
                    severity: self.severity(),
                    message: format!("CLI '{}' was installed via curl (direct binary download) — higher risk than package manager", meta.binary_name),
                    location: meta.binary_path.clone().unwrap_or_default(),
                });
            }
            None => {
                if meta.binary_path.is_some() {
                    findings.push(AuditFinding {
                        rule_id: self.id().into(),
                        severity: Severity::Medium,
                        message: format!("CLI '{}' has unknown installation source", meta.binary_name),
                        location: meta.binary_path.clone().unwrap_or_default(),
                    });
                }
            }
            _ => {}
        }
        findings
    }
}

// --- Rule 17: CLI Permission Scope ---
pub struct CliPermissionScope;

impl AuditRule for CliPermissionScope {
    fn id(&self) -> &str { "cli-permission-scope" }
    fn severity(&self) -> Severity { Severity::Medium }
    fn check(&self, input: &AuditInput) -> Vec<AuditFinding> {
        let mut findings = Vec::new();
        if input.kind != ExtensionKind::Cli { return findings; }
        let cli_name = input.cli_meta.as_ref().map(|m| m.binary_name.as_str()).unwrap_or(&input.name);

        // Count distinct permission types from child skills
        let mut perm_types = std::collections::HashSet::new();
        for perm in &input.child_permissions {
            perm_types.insert(perm.label());
        }
        if perm_types.len() > 3 {
            findings.push(AuditFinding {
                rule_id: self.id().into(),
                severity: self.severity(),
                message: format!("CLI '{}' child skills span {} permission types — broad capability surface", cli_name, perm_types.len()),
                location: cli_name.to_string(),
            });
        }
        findings
    }
}

// --- Rule 18: CLI Aggregate Risk ---
pub struct CliAggregateRisk;

impl AuditRule for CliAggregateRisk {
    fn id(&self) -> &str { "cli-aggregate-risk" }
    fn severity(&self) -> Severity { Severity::Medium }
    fn check(&self, input: &AuditInput) -> Vec<AuditFinding> {
        let mut findings = Vec::new();
        if input.kind != ExtensionKind::Cli { return findings; }
        let cli_name = input.cli_meta.as_ref().map(|m| m.binary_name.as_str()).unwrap_or(&input.name);

        let has_network = input.child_permissions.iter().any(|p| matches!(p, Permission::Network { .. }));
        let has_filesystem = input.child_permissions.iter().any(|p| matches!(p, Permission::FileSystem { .. }));
        let has_shell = input.child_permissions.iter().any(|p| matches!(p, Permission::Shell { .. }));

        if has_network && has_filesystem && has_shell {
            findings.push(AuditFinding {
                rule_id: self.id().into(),
                severity: Severity::High,
                message: format!("CLI '{}' child skills combine network + filesystem + shell permissions — potential data exfiltration vector", cli_name),
                location: cli_name.to_string(),
            });
        }
        findings
    }
}
```

- [ ] **Step 4: Update auditor test**

In `mod.rs` tests, update the rule count assertion:

```rust
#[test]
fn test_auditor_runs_all_enabled_rules() {
    let auditor = Auditor::new();
    assert_eq!(auditor.rules.len(), 18); // was 13, now 18
}
```

- [ ] **Step 5: Run tests**

Run: `cargo test -p hk-core -- auditor`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add crates/hk-core/src/auditor/
git commit -m "feat: add 5 CLI-specific audit rules (credentials, network, source, scope, aggregate)"
```

---

### Task 5: Marketplace — CLI Registry

**Files:**
- Modify: `crates/hk-core/src/marketplace.rs`

- [ ] **Step 1: Add `CliRegistryEntry` and static registry**

Add at the end of marketplace.rs:

```rust
// --- CLI Marketplace Registry ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliRegistryEntry {
    pub binary_name: String,
    pub display_name: String,
    pub description: String,
    pub install_command: String,
    pub skills_repo: String,
    pub skills_install_command: Option<String>,
    pub icon_url: Option<String>,
    pub categories: Vec<String>,
    pub verified: bool,
    pub api_domains: Vec<String>,
    pub credentials_path: Option<String>,
}

static CLI_REGISTRY: LazyLock<Vec<CliRegistryEntry>> = LazyLock::new(|| vec![
    CliRegistryEntry {
        binary_name: "wecom-cli".into(),
        display_name: "WeChat Work CLI".into(),
        description: "Enterprise WeChat agent CLI — contacts, messages, docs, calendar, meetings, todos".into(),
        install_command: "npm install -g @wecom/cli".into(),
        skills_repo: "WecomTeam/wecom-cli".into(),
        skills_install_command: None,
        icon_url: None,
        categories: vec!["collaboration".into(), "messaging".into()],
        verified: true,
        api_domains: vec!["qyapi.weixin.qq.com".into()],
        credentials_path: Some("~/.config/wecom/bot.enc".into()),
    },
    CliRegistryEntry {
        binary_name: "lark-cli".into(),
        display_name: "Lark / Feishu CLI".into(),
        description: "Lark/Feishu agent CLI — 200+ commands across calendar, docs, sheets, contacts, meetings".into(),
        install_command: "npm install -g @larksuite/cli".into(),
        skills_repo: "larksuite/cli".into(),
        skills_install_command: None,
        icon_url: None,
        categories: vec!["collaboration".into(), "productivity".into()],
        verified: true,
        api_domains: vec!["open.feishu.cn".into(), "open.larksuite.com".into()],
        credentials_path: Some("~/.config/lark/credentials".into()),
    },
    CliRegistryEntry {
        binary_name: "dws".into(),
        display_name: "DingTalk Workspace CLI".into(),
        description: "DingTalk agent CLI — 12 products, 104 tools for enterprise collaboration".into(),
        install_command: "curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh".into(),
        skills_repo: "DingTalk-Real-AI/dingtalk-workspace-cli".into(),
        skills_install_command: Some("curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install-skills.sh | sh".into()),
        icon_url: None,
        categories: vec!["collaboration".into(), "messaging".into()],
        verified: true,
        api_domains: vec!["api.dingtalk.com".into()],
        credentials_path: Some("~/.config/dws/auth.json".into()),
    },
    CliRegistryEntry {
        binary_name: "meitu".into(),
        display_name: "Meitu CLI".into(),
        description: "Meitu AI image/video processing — face beautify, background removal, poster generation".into(),
        install_command: "npm install -g meitu-cli".into(),
        skills_repo: "meitu/meitu-skills".into(),
        skills_install_command: None,
        icon_url: None,
        categories: vec!["image".into(), "ai".into()],
        verified: true,
        api_domains: vec!["openapi.mtlab.meitu.com".into()],
        credentials_path: Some("~/.meitu/credentials.json".into()),
    },
    CliRegistryEntry {
        binary_name: "officecli".into(),
        display_name: "OfficeCLI".into(),
        description: "Office document CLI — read/write Word, Excel, PowerPoint. Zero dependencies.".into(),
        install_command: "curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash".into(),
        skills_repo: "iOfficeAI/OfficeCLI".into(),
        skills_install_command: None,
        icon_url: None,
        categories: vec!["office".into(), "documents".into()],
        verified: true,
        api_domains: vec![],
        credentials_path: None,
    },
]);

/// List all CLI entries for the marketplace
pub fn list_cli_registry() -> Vec<MarketplaceItem> {
    CLI_REGISTRY.iter().map(|entry| MarketplaceItem {
        id: format!("cli:{}", entry.binary_name),
        name: entry.display_name.clone(),
        description: entry.description.clone(),
        source: entry.skills_repo.clone(),
        skill_id: String::new(),
        kind: "cli".into(),
        installs: 0,
        icon_url: entry.icon_url.clone(),
        verified: entry.verified,
        categories: entry.categories.clone(),
    }).collect()
}

/// Get a CLI registry entry by binary name
pub fn get_cli_registry_entry(binary_name: &str) -> Option<&CliRegistryEntry> {
    CLI_REGISTRY.iter().find(|e| e.binary_name == binary_name)
}
```

- [ ] **Step 2: Update MarketplaceItem kind field**

In types.ts, the `MarketplaceItem.kind` is typed as `"skill" | "mcp"`. We need to add `"cli"`. (This will be done in Task 8.)

For the Rust side, MarketplaceItem's `kind` field is already a `String`, so no change needed.

- [ ] **Step 3: Add `use std::sync::LazyLock`**

Make sure `LazyLock` is imported in marketplace.rs. Check if it's already imported; if not, add:

```rust
use std::sync::LazyLock;
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p hk-core`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/hk-core/src/marketplace.rs
git commit -m "feat: add CLI marketplace registry with 5 curated entries"
```

---

### Task 6: Tauri Commands — CLI IPC

**Files:**
- Modify: `crates/hk-desktop/src/commands.rs`
- Modify: `crates/hk-desktop/src/main.rs`

- [ ] **Step 1: Add CLI arm to `toggle_extension`**

In `commands.rs`, update the match in `toggle_extension` (line 127):

```rust
match ext.kind {
    ExtensionKind::Skill => {
        toggle_skill_file(&ext, enabled).map_err(|e| e.to_string())?;
        let sibling_ids = store.find_siblings_by_source_path(&id).map_err(|e| e.to_string())?;
        for sib_id in &sibling_ids {
            store.set_enabled(sib_id, enabled).map_err(|e| e.to_string())?;
        }
    }
    ExtensionKind::Mcp => {
        toggle_mcp_config(&ext, enabled, &store).map_err(|e| e.to_string())?;
        store.set_enabled(&id, enabled).map_err(|e| e.to_string())?;
    }
    ExtensionKind::Hook => {
        toggle_hook_config(&ext, enabled, &store).map_err(|e| e.to_string())?;
        store.set_enabled(&id, enabled).map_err(|e| e.to_string())?;
    }
    ExtensionKind::Plugin => {
        toggle_plugin_config(&ext, enabled, &store).map_err(|e| e.to_string())?;
        store.set_enabled(&id, enabled).map_err(|e| e.to_string())?;
    }
    ExtensionKind::Cli => {
        // Cascade to all child skills
        let children = store.get_child_skills(&id).map_err(|e| e.to_string())?;
        for child in &children {
            toggle_skill_file(child, enabled).map_err(|e| e.to_string())?;
            let sibling_ids = store.find_siblings_by_source_path(&child.id).map_err(|e| e.to_string())?;
            for sib_id in &sibling_ids {
                store.set_enabled(sib_id, enabled).map_err(|e| e.to_string())?;
            }
        }
        store.set_enabled(&id, enabled).map_err(|e| e.to_string())?;
    }
}
```

- [ ] **Step 2: Update `get_dashboard_stats`**

Add `cli_count` to the return (after line 111):

```rust
Ok(DashboardStats {
    total_extensions: all.len(),
    skill_count: all.iter().filter(|e| e.kind == ExtensionKind::Skill).count(),
    mcp_count: all.iter().filter(|e| e.kind == ExtensionKind::Mcp).count(),
    plugin_count: all.iter().filter(|e| e.kind == ExtensionKind::Plugin).count(),
    hook_count: all.iter().filter(|e| e.kind == ExtensionKind::Hook).count(),
    cli_count: all.iter().filter(|e| e.kind == ExtensionKind::Cli).count(),
    critical_issues,
    high_issues,
    medium_issues,
    low_issues,
    updates_available: 0,
})
```

- [ ] **Step 3: Add new commands**

Add at the end of `commands.rs`:

```rust
#[tauri::command]
pub fn get_cli_with_children(
    state: State<AppState>,
    cli_id: String,
) -> Result<(Extension, Vec<Extension>), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let cli = store.get_extension(&cli_id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("CLI not found: {}", cli_id))?;
    let children = store.get_child_skills(&cli_id).map_err(|e| e.to_string())?;
    Ok((cli, children))
}

#[tauri::command]
pub fn list_cli_marketplace() -> Result<Vec<MarketplaceItem>, String> {
    Ok(hk_core::marketplace::list_cli_registry())
}

#[tauri::command]
pub fn install_cli(
    state: State<AppState>,
    install_command: String,
    skills_repo: String,
    skills_install_command: Option<String>,
    target_agents: Vec<String>,
) -> Result<(), String> {
    // Step 1: Execute the install command
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&install_command)
        .output()
        .map_err(|e| format!("Failed to run install command: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "CLI install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Step 2: Install skills
    let skills_cmd = skills_install_command.unwrap_or_else(|| {
        format!("npx -y skills add {} -y -g", skills_repo)
    });
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&skills_cmd)
        .output()
        .map_err(|e| format!("Failed to install skills: {}", e))?;

    if !output.status.success() {
        // CLI installed but skills failed — warn, don't fail completely
        eprintln!("Warning: CLI installed but skills install had issues: {}",
            String::from_utf8_lossy(&output.stderr));
    }

    // Step 3: Trigger re-scan
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let adapters = adapter::all_adapters();
    let exts = scanner::scan_all(&adapters);
    store.sync_extensions(&exts).map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 4: Add `use` import for `MarketplaceItem`**

At top of `commands.rs`, add to the import:

```rust
use hk_core::{adapter, auditor::{self, Auditor}, deployer, manager, marketplace, models::*, scanner, store::Store};
```

(Add `marketplace` to the existing use statement.)

- [ ] **Step 5: Register new commands in `main.rs`**

Add to the `invoke_handler` list (before the closing `]`):

```rust
commands::get_cli_with_children,
commands::list_cli_marketplace,
commands::install_cli,
```

- [ ] **Step 6: Build check**

Run: `cargo build -p hk-desktop`
Expected: Compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add crates/hk-desktop/src/commands.rs crates/hk-desktop/src/main.rs
git commit -m "feat: add CLI Tauri commands (toggle cascade, marketplace, install)"
```

---

### Task 7: TypeScript Types + Invoke Wrappers

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/invoke.ts`

- [ ] **Step 1: Update `ExtensionKind` type**

In `types.ts` line 1:

```typescript
export type ExtensionKind = "skill" | "mcp" | "plugin" | "hook" | "cli";
```

- [ ] **Step 2: Add `CliMeta` interface**

After `Permission` type (line 35):

```typescript
export interface CliMeta {
  binary_name: string;
  binary_path: string | null;
  install_method: string | null;
  credentials_path: string | null;
  version: string | null;
  api_domains: string[];
}
```

- [ ] **Step 3: Add fields to `Extension` interface**

Add after `last_used_at` in the Extension interface (line 20):

```typescript
export interface Extension {
  id: string;
  kind: ExtensionKind;
  name: string;
  description: string;
  source: Source;
  agents: string[];
  tags: string[];
  category: string | null;
  permissions: Permission[];
  enabled: boolean;
  trust_score: number | null;
  installed_at: string;
  updated_at: string;
  last_used_at: string | null;
  cli_parent_id: string | null;
  cli_meta: CliMeta | null;
}
```

- [ ] **Step 4: Update `DashboardStats`**

Add `cli_count` (after `hook_count`):

```typescript
export interface DashboardStats {
  total_extensions: number;
  skill_count: number;
  mcp_count: number;
  plugin_count: number;
  hook_count: number;
  cli_count: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
  updates_available: number;
}
```

- [ ] **Step 5: Update `MarketplaceItem.kind`**

```typescript
export interface MarketplaceItem {
  // ... existing fields ...
  kind: "skill" | "mcp" | "cli";
  // ...
}
```

- [ ] **Step 6: Add invoke wrappers**

In `invoke.ts`, add after the last method (before the closing `}`):

```typescript
  getCliWithChildren(cliId: string): Promise<[Extension, Extension[]]> {
    return invoke("get_cli_with_children", { cliId });
  },

  listCliMarketplace(): Promise<MarketplaceItem[]> {
    return invoke("list_cli_marketplace");
  },

  installCli(installCommand: string, skillsRepo: string, skillsInstallCommand: string | null, targetAgents: string[]): Promise<void> {
    return invoke("install_cli", { installCommand, skillsRepo, skillsInstallCommand, targetAgents });
  },
```

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: TypeScript compiles (may have errors in pages/stores that reference the old types — these are fixed in subsequent tasks).

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/invoke.ts
git commit -m "feat: add CLI types and invoke wrappers to frontend"
```

---

### Task 8: Frontend — KindBadge + CSS

**Files:**
- Modify: `src/components/shared/kind-badge.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add `--kind-cli` CSS variable**

In `index.css`, add after `--kind-hook` (line 69):

```css
--kind-cli: oklch(0.58 0.14 45);
```

And in the `.dark` block, add after the dark kind-hook override (find the dark kind variables section):

```css
--kind-cli: oklch(0.65 0.14 45);
```

And in the `.claude` theme block if it exists, add the same.

- [ ] **Step 2: Add CLI to KindBadge maps**

```typescript
const kindStyles: Record<ExtensionKind, string> = {
  skill: "bg-kind-skill/15 text-kind-skill ring-kind-skill/25",
  mcp: "bg-kind-mcp/15 text-kind-mcp ring-kind-mcp/25",
  plugin: "bg-kind-plugin/15 text-kind-plugin ring-kind-plugin/25",
  hook: "bg-kind-hook/15 text-kind-hook ring-kind-hook/25",
  cli: "bg-kind-cli/15 text-kind-cli ring-kind-cli/25",
};

const kindLabel: Record<ExtensionKind, string> = {
  skill: "skill",
  mcp: "MCP",
  plugin: "plugin",
  hook: "hook",
  cli: "CLI",
};

const kindTitle: Record<ExtensionKind, string> = {
  skill: "Reusable prompt instructions for AI agents",
  mcp: "Model Context Protocol server — extends agent capabilities",
  plugin: "Agent-specific plugin extension",
  hook: "Shell command triggered by agent events",
  cli: "Agent-oriented CLI tool — binary + skills bundle",
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/kind-badge.tsx src/index.css
git commit -m "feat: add CLI kind badge (orange) and CSS variable"
```

---

### Task 9: Frontend Stores — Extension + Marketplace

**Files:**
- Modify: `src/stores/extension-store.ts`
- Modify: `src/stores/marketplace-store.ts`

- [ ] **Step 1: Add `childSkillsOf` to extension store**

In `extension-store.ts`, add a new derived getter after the `filtered` getter:

```typescript
childSkillsOf: (cliId: string) => {
  return get().extensions.filter(e => e.cli_parent_id === cliId);
},
```

- [ ] **Step 2: Ensure CLI extensions skip cross-agent grouping**

In `buildGroups` function, CLI extensions should not be grouped (they are global, have no agents). They create a 1:1 group. Verify the existing `extensionGroupKey` function handles this correctly — since CLIs have `agents: []`, the key will be unique. If not, add a guard:

In the `buildGroups` function, before the grouping map logic, check:

```typescript
// CLI extensions are always standalone groups (global, not agent-scoped)
if (ext.kind === "cli") {
  // Use the extension id as group key to prevent merging
  const key = ext.id;
  // ... create GroupedExtension with instances: [ext]
}
```

- [ ] **Step 3: Add CLI tab support to marketplace store**

In `marketplace-store.ts`, find where `tab` is defined (likely as `"skill" | "mcp"`). Add `"cli"`:

```typescript
tab: "skill" | "mcp" | "cli";
```

In the `setTab` method, when tab is `"cli"`, call `loadTrending`:

```typescript
setTab: (tab) => {
  set({ tab });
  get().loadTrending();
},
```

In `loadTrending`, add a branch for `"cli"`:

```typescript
if (tab === "cli") {
  const items = await api.listCliMarketplace();
  set({ items, loading: false, trendingLoadedAt: { ...get().trendingLoadedAt, cli: now } });
  return;
}
```

In `search`, for `"cli"` tab, filter locally since CLI registry is small:

```typescript
if (tab === "cli") {
  const all = await api.listCliMarketplace();
  const q = query.toLowerCase();
  const items = all.filter(i => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  set({ items, loading: false });
  return;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/extension-store.ts src/stores/marketplace-store.ts
git commit -m "feat: add CLI support to extension and marketplace stores"
```

---

### Task 10: Frontend Pages — Extensions Detail + Marketplace Tab + Overview

**Files:**
- Modify: `src/pages/extensions.tsx`
- Modify: `src/pages/marketplace.tsx`
- Modify: `src/pages/overview.tsx`

- [ ] **Step 1: Add CLI kind filter option to Extensions page**

In `extensions.tsx`, find the kind filter buttons/dropdown. Add `"cli"` to the list of options. This is typically a set of buttons or a select. Add:

```tsx
{ value: "cli", label: "CLI" }
```

alongside the existing skill/mcp/plugin/hook filter options.

- [ ] **Step 2: Add CLI detail view in Extensions page**

When a CLI extension is selected, the detail panel should show CLI-specific metadata. In the detail panel section of `extensions.tsx`, add a conditional block:

```tsx
{selected?.kind === "cli" && selected?.cli_meta && (
  <div className="space-y-3 text-sm">
    <h4 className="font-medium text-foreground">CLI Details</h4>
    <div className="grid grid-cols-2 gap-2 text-muted-foreground">
      <span>Binary:</span>
      <span className="font-mono">{selected.cli_meta.binary_name}</span>
      {selected.cli_meta.version && <>
        <span>Version:</span>
        <span>{selected.cli_meta.version}</span>
      </>}
      {selected.cli_meta.install_method && <>
        <span>Installed via:</span>
        <span>{selected.cli_meta.install_method}</span>
      </>}
      {selected.cli_meta.binary_path && <>
        <span>Path:</span>
        <span className="font-mono text-xs truncate">{selected.cli_meta.binary_path}</span>
      </>}
      {selected.cli_meta.credentials_path && <>
        <span>Credentials:</span>
        <span className="font-mono text-xs truncate">{selected.cli_meta.credentials_path}</span>
      </>}
    </div>
    {selected.cli_meta.api_domains.length > 0 && (
      <div>
        <span className="text-muted-foreground">API Domains:</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.cli_meta.api_domains.map(d => (
            <span key={d} className="text-xs px-2 py-0.5 bg-muted rounded-full">{d}</span>
          ))}
        </div>
      </div>
    )}
  </div>
)}
```

For child skills, use the store's `childSkillsOf`:

```tsx
{selected?.kind === "cli" && (() => {
  const children = useExtensionStore.getState().childSkillsOf(selected.id);
  return children.length > 0 ? (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-foreground mb-2">
        Associated Skills ({children.length})
      </h4>
      <div className="space-y-1">
        {children.map(child => (
          <div key={child.id} className="flex items-center justify-between text-sm py-1">
            <span>{child.name}</span>
            <span className={child.enabled ? "text-green-500" : "text-muted-foreground"}>
              {child.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;
})()}
```

- [ ] **Step 3: Add CLI Tools tab to Marketplace page**

In `marketplace.tsx`, find the tab buttons (skill / MCP). Add a third tab:

```tsx
<button
  onClick={() => setTab("cli")}
  className={clsx("...", tab === "cli" && "...")}
>
  CLI Tools
</button>
```

- [ ] **Step 4: Add CLI install dialog to Marketplace**

When a CLI item is selected in marketplace, the install dialog should show the install command and ask for confirmation:

```tsx
{selectedItem?.kind === "cli" && (
  <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      This will run the following command to install the CLI:
    </p>
    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto font-mono">
      {/* Look up install_command from CLI registry — passed via marketplace item or fetched */}
      {selectedItem.source}
    </pre>
    <button
      onClick={() => {
        // installCommand is passed via the marketplace store's selectedItem context
        // or fetched from the CLI registry. For now, use the source as identifier.
        api.installCli(installCommand, selectedItem.source, null, targetAgents);
      }}
      className="..."
    >
      Install CLI
    </button>
  </div>
)}
```

The exact implementation depends on the existing install dialog pattern. Follow the same structure used for skill/MCP installation.

- [ ] **Step 5: Add CLI stat to Overview page**

In `overview.tsx`, find where stat chips are rendered (the stats section around line 202-238). Add a CLI stat chip:

```tsx
<StatChip
  label="CLIs"
  value={stats.cli_count}
  icon={Terminal}  // or appropriate Lucide icon
  color="kind-cli"
/>
```

Make sure to import the icon at the top.

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: Clean compile, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/extensions.tsx src/pages/marketplace.tsx src/pages/overview.tsx
git commit -m "feat: add CLI to extensions detail, marketplace tab, and overview stats"
```

---

### Task 11: Integration Test — Full Cycle Verification

- [ ] **Step 1: Run full Rust test suite**

Run: `cargo test --workspace`
Expected: All tests pass across hk-core, hk-cli, hk-desktop.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`
Expected: Clean TypeScript build.

- [ ] **Step 3: Manual smoke test**

Run: `cargo tauri dev`
Verify:
1. Overview page shows CLI count stat (0 if no CLIs installed)
2. Extensions page has "CLI" kind filter option
3. Marketplace page has "CLI Tools" tab showing 5 curated entries
4. If any KNOWN_CLI is installed on PATH, it appears in the extensions list with orange CLI badge

- [ ] **Step 4: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes for CLI extension type"
```
