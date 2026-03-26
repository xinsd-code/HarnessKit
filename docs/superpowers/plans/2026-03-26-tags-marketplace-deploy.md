# Tags, Marketplace & Cross-Agent Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add categories (predefined) and tags (free-form) for extensions, skills.sh marketplace search/install, and one-click cross-agent skill deployment.

**Architecture:** Categories are a new `category` column in SQLite (single-select from a predefined list). Tags use the existing `tags_json` column (free-form, multi-select). Marketplace calls the public `skills.sh/api/search` endpoint from Rust (via `reqwest`), fetches raw SKILL.md from GitHub, and installs via shallow clone. Cross-agent deploy copies a skill's directory from one agent's skill dir to another's, then re-scans.

**Tech Stack:** Rust (reqwest for HTTP), Tauri commands, React + Zustand, Tailwind v4

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `crates/hk-core/Cargo.toml` | Add `reqwest` dependency |
| Modify | `crates/hk-core/src/store.rs` | `update_tags()`, `get_all_tags()`, `update_category()`, DB migration for category column |
| Create | `crates/hk-core/src/marketplace.rs` | skills.sh API client |
| Modify | `crates/hk-core/src/lib.rs` | Export marketplace module |
| Create | `crates/hk-core/src/deployer.rs` | Cross-agent skill copy logic |
| Modify | `crates/hk-desktop/src/commands.rs` | New Tauri commands: `update_tags`, `get_all_tags`, `search_marketplace`, `install_from_marketplace`, `deploy_to_agent` |
| Modify | `crates/hk-desktop/src/main.rs` | Register new commands |
| Modify | `crates/hk-desktop/Cargo.toml` | Add `tokio` features for async |
| Modify | `src/lib/types.ts` | `MarketplaceSkill` type |
| Modify | `src/lib/invoke.ts` | New API calls |
| Modify | `src/stores/extension-store.ts` | Tag actions, tag filter |
| Create | `src/stores/marketplace-store.ts` | Marketplace search state |
| Modify | `src/components/extensions/extension-filters.tsx` | Tag filter pills |
| Modify | `src/components/extensions/extension-detail.tsx` | Tag editor, agent deploy buttons |
| Modify | `src/components/extensions/extension-table.tsx` | Tag column |
| Create | `src/pages/marketplace.tsx` | Marketplace search page |
| Modify | `src/components/layout/sidebar.tsx` | Marketplace nav link |
| Modify | `src/App.tsx` | Marketplace route |

---

## Feature 1: Tags & Categories

### Task 1: Backend — Category field + Store methods

**Files:**
- Modify: `crates/hk-core/src/models.rs`
- Modify: `crates/hk-core/src/store.rs`
- Modify: `crates/hk-core/src/scanner.rs`

- [ ] **Step 1: Add category field to Extension model**

In `crates/hk-core/src/models.rs`, add after `tags`:

```rust
pub category: Option<String>,
```

- [ ] **Step 2: Add DB migration for category column**

In `crates/hk-core/src/store.rs`, add after the existing `CREATE INDEX` statements in `migrate()`:

```rust
ALTER TABLE extensions ADD COLUMN category TEXT;
```

Wrap it so it doesn't fail if column already exists:

```rust
let _ = self.conn.execute("ALTER TABLE extensions ADD COLUMN category TEXT", []);
```

- [ ] **Step 3: Update insert_extension to include category**

In `store.rs`, update the INSERT statement to include `category`:

```rust
"INSERT OR REPLACE INTO extensions (id, kind, name, description, source_json, agents_json, tags_json, permissions_json, enabled, trust_score, installed_at, updated_at, category)
 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
```

Add `ext.category` as the 13th param.

- [ ] **Step 4: Update row_to_extension to read category**

Add to `row_to_extension`:

```rust
category: row.get::<_, Option<String>>(12).ok().flatten(),
```

Update the SELECT statements in `get_extension` and `list_extensions` to include `category` in the column list.

- [ ] **Step 5: Add update_tags, get_all_tags, update_category methods**

In `store.rs`, add after `update_trust_score`:

```rust
pub fn update_tags(&self, id: &str, tags: &[String]) -> Result<()> {
    self.conn.execute(
        "UPDATE extensions SET tags_json = ?1 WHERE id = ?2",
        params![serde_json::to_string(tags)?, id],
    )?;
    Ok(())
}

pub fn get_all_tags(&self) -> Result<Vec<String>> {
    let mut stmt = self.conn.prepare("SELECT DISTINCT tags_json FROM extensions WHERE tags_json != '[]'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut all_tags = std::collections::BTreeSet::new();
    for row in rows {
        let json: String = row?;
        if let Ok(tags) = serde_json::from_str::<Vec<String>>(&json) {
            for tag in tags {
                all_tags.insert(tag);
            }
        }
    }
    Ok(all_tags.into_iter().collect())
}

pub fn update_category(&self, id: &str, category: Option<&str>) -> Result<()> {
    self.conn.execute(
        "UPDATE extensions SET category = ?1 WHERE id = ?2",
        params![category, id],
    )?;
    Ok(())
}
```

- [ ] **Step 6: Add auto-categorization logic to scanner**

In `crates/hk-core/src/scanner.rs`, add a function that infers category from name + content:

```rust
fn infer_category(name: &str, content: &str) -> Option<String> {
    let text = format!("{} {}", name, content).to_lowercase();
    // Order matters — more specific patterns first
    let rules: &[(&str, &[&str])] = &[
        ("Testing", &["test", "spec", "assert", "mock", "fixture", "coverage", "jest", "pytest", "vitest", "cypress"]),
        ("Security", &["security", "auth", "permission", "encrypt", "credential", "vulnerability", "audit", "pentest"]),
        ("DevOps", &["docker", "kubernetes", "k8s", "ci/cd", "deploy", "terraform", "ansible", "nginx", "aws", "gcp", "azure", "infra"]),
        ("Data", &["database", "sql", "csv", "json", "data", "analytics", "pandas", "spark", "etl", "migration"]),
        ("Design", &["css", "tailwind", "ui", "ux", "design", "figma", "layout", "responsive", "animation", "svg"]),
        ("Finance", &["finance", "payment", "stripe", "invoice", "accounting", "tax", "budget", "trading"]),
        ("Education", &["learn", "tutorial", "teach", "course", "quiz", "flashcard", "study", "education"]),
        ("Writing", &["write", "blog", "article", "documentation", "markdown", "content", "copywriting", "grammar", "proofread"]),
        ("Research", &["research", "paper", "arxiv", "citation", "literature", "survey", "experiment"]),
        ("Productivity", &["todo", "task", "calendar", "schedule", "workflow", "automate", "organize", "template"]),
        ("Coding", &["code", "programming", "refactor", "debug", "lint", "compile", "build", "api", "frontend", "backend", "react", "rust", "python", "typescript", "javascript"]),
    ];
    for (category, keywords) in rules {
        let matches = keywords.iter().filter(|kw| text.contains(**kw)).count();
        if matches >= 2 {
            return Some(category.to_string());
        }
    }
    None
}
```

Update `scan_skill_dir` to use it — set `category: infer_category(&name, &content),` instead of `None`.

For `scan_mcp_servers` and `scan_hooks`, set `category: None,` since they don't have content to analyze.

- [ ] **Step 7: Add tests for infer_category**

In the `#[cfg(test)]` block of `scanner.rs`, add:

```rust
#[test]
fn test_infer_category_coding() {
    assert_eq!(infer_category("react-helper", "Generate React components with TypeScript"), Some("Coding".into()));
}

#[test]
fn test_infer_category_testing() {
    assert_eq!(infer_category("test-generator", "Create test specs with mock data"), Some("Testing".into()));
}

#[test]
fn test_infer_category_finance() {
    assert_eq!(infer_category("invoice-tool", "Generate payment invoices for Stripe"), Some("Finance".into()));
}

#[test]
fn test_infer_category_none() {
    assert_eq!(infer_category("my-skill", "A simple helper"), None);
}
```

- [ ] **Step 8: Update sample_extension in store tests**

Add `category: None,` to the `sample_extension()` helper in store tests.

- [ ] **Step 9: Add tests for store**

```rust
#[test]
fn test_update_and_get_tags() {
    let (store, _dir) = test_store();
    let ext = sample_extension();
    store.insert_extension(&ext).unwrap();

    store.update_tags(&ext.id, &["coding".into(), "frontend".into()]).unwrap();
    let fetched = store.get_extension(&ext.id).unwrap().unwrap();
    assert_eq!(fetched.tags, vec!["coding", "frontend"]);

    let all_tags = store.get_all_tags().unwrap();
    assert!(all_tags.contains(&"coding".to_string()));
    assert!(all_tags.contains(&"frontend".to_string()));
}

#[test]
fn test_update_category() {
    let (store, _dir) = test_store();
    let ext = sample_extension();
    store.insert_extension(&ext).unwrap();

    store.update_category(&ext.id, Some("education")).unwrap();
    let fetched = store.get_extension(&ext.id).unwrap().unwrap();
    assert_eq!(fetched.category, Some("education".to_string()));

    store.update_category(&ext.id, None).unwrap();
    let fetched = store.get_extension(&ext.id).unwrap().unwrap();
    assert_eq!(fetched.category, None);
}
```

- [ ] **Step 10: Run tests**

Run: `cargo test -p hk-core`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add crates/hk-core/src/models.rs crates/hk-core/src/store.rs crates/hk-core/src/scanner.rs
git commit -m "feat: add category field and tag/category store methods"
```

---

### Task 2: Backend — Tauri commands for tags

**Files:**
- Modify: `crates/hk-desktop/src/commands.rs`
- Modify: `crates/hk-desktop/src/main.rs`

- [ ] **Step 1: Add tag and category commands**

In `crates/hk-desktop/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn update_tags(state: State<AppState>, id: String, tags: Vec<String>) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    store.update_tags(&id, &tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_tags(state: State<AppState>) -> Result<Vec<String>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    store.get_all_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_category(state: State<AppState>, id: String, category: Option<String>) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    store.update_category(&id, category.as_deref()).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register commands in main.rs**

In `crates/hk-desktop/src/main.rs`, add to the `invoke_handler` list:

```rust
commands::update_tags,
commands::get_all_tags,
commands::update_category,
```

- [ ] **Step 3: Build and verify**

Run: `cargo build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add crates/hk-desktop/src/commands.rs crates/hk-desktop/src/main.rs
git commit -m "feat: add update_tags and get_all_tags Tauri commands"
```

---

### Task 3: Frontend — API calls and store for tags

**Files:**
- Modify: `src/lib/invoke.ts`
- Modify: `src/stores/extension-store.ts`

- [ ] **Step 1: Add category to Extension type**

In `src/lib/types.ts`, add to the `Extension` interface:

```typescript
category: string | null;
```

- [ ] **Step 2: Add API calls in invoke.ts**

Add to the `api` object in `src/lib/invoke.ts`:

```typescript
updateTags(id: string, tags: string[]): Promise<void> {
  return invoke("update_tags", { id, tags });
},

getAllTags(): Promise<string[]> {
  return invoke("get_all_tags");
},

updateCategory(id: string, category: string | null): Promise<void> {
  return invoke("update_category", { id, category });
},
```

- [ ] **Step 3: Add tag and category state to extension store**

In `src/stores/extension-store.ts`, add to the interface:

```typescript
allTags: string[];
tagFilter: string | null;
categoryFilter: string | null;
setTagFilter: (tag: string | null) => void;
setCategoryFilter: (category: string | null) => void;
fetchTags: () => Promise<void>;
updateTags: (id: string, tags: string[]) => Promise<void>;
updateCategory: (id: string, category: string | null) => Promise<void>;
```

Add to the store implementation:

```typescript
allTags: [],
tagFilter: null,
categoryFilter: null,
setTagFilter(tag) { set({ tagFilter: tag }); },
setCategoryFilter(category) { set({ categoryFilter: category }); },
async fetchTags() {
  const allTags = await api.getAllTags();
  set({ allTags });
},
async updateTags(id, tags) {
  await api.updateTags(id, tags);
  set((s) => ({
    extensions: s.extensions.map((e) => e.id === id ? { ...e, tags } : e),
  }));
  get().fetchTags();
},
async updateCategory(id, category) {
  await api.updateCategory(id, category);
  set((s) => ({
    extensions: s.extensions.map((e) => e.id === id ? { ...e, category } : e),
  }));
},
```

- [ ] **Step 4: Update filtered() to include tag and category filtering**

Update the `filtered()` method:

```typescript
filtered() {
  const { extensions, searchQuery, tagFilter, categoryFilter } = get();
  let result = extensions;
  if (categoryFilter) {
    result = result.filter((e) => e.category === categoryFilter);
  }
  if (tagFilter) {
    result = result.filter((e) => e.tags.includes(tagFilter));
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.agents.some((a) => a.toLowerCase().includes(q)) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  return result;
},
```

- [ ] **Step 4: Call fetchTags in fetch()**

Update the `fetch()` method to also load tags:

```typescript
async fetch() {
  set({ loading: true });
  const extensions = await api.listExtensions(
    get().kindFilter ?? undefined,
    get().agentFilter ?? undefined,
  );
  set({ extensions, loading: false });
  get().fetchTags();
},
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoke.ts src/stores/extension-store.ts
git commit -m "feat: add tag state management and API calls"
```

---

### Task 4: Frontend — Category and tag filters in extension filters

**Files:**
- Modify: `src/components/extensions/extension-filters.tsx`

- [ ] **Step 1: Add category dropdown and tag filter row**

Replace the entire `ExtensionFilters` component with:

```tsx
import type { ExtensionKind } from "@/lib/types";
import { useExtensionStore } from "@/stores/extension-store";
import { Search, X } from "lucide-react";
import { clsx } from "clsx";

const TAG_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
];

export function tagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

export const CATEGORIES = [
  "Coding", "Testing", "DevOps", "Data", "Design",
  "Writing", "Education", "Finance", "Security",
  "Productivity", "Research", "Other",
] as const;

const kinds: (ExtensionKind | null)[] = [null, "skill", "mcp", "plugin", "hook"];

export function ExtensionFilters() {
  const { kindFilter, setKindFilter, searchQuery, setSearchQuery, allTags, tagFilter, setTagFilter, categoryFilter, setCategoryFilter } = useExtensionStore();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search extensions..."
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
          />
        </div>
        <select
          value={categoryFilter ?? ""}
          onChange={(e) => setCategoryFilter(e.target.value || null)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:focus:border-zinc-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          {kinds.map((kind) => (
            <button
              key={kind ?? "all"}
              onClick={() => setKindFilter(kind)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                kindFilter === kind
                  ? "bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              {kind ?? "All"}
            </button>
          ))}
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag, i) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={clsx(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                tagFilter === tag
                  ? tagColor(i) + " ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 dark:ring-offset-zinc-950"
                  : tagColor(i) + " opacity-70 hover:opacity-100"
              )}
            >
              {tag}
              {tagFilter === tag && <X size={10} className="ml-1 inline" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/extensions/extension-filters.tsx
git commit -m "feat: add tag filter pills to extension filters"
```

---

### Task 5: Frontend — Category selector and tag editor in detail panel

**Files:**
- Modify: `src/components/extensions/extension-detail.tsx`

- [ ] **Step 1: Add category and tag editor sections**

In `src/components/extensions/extension-detail.tsx`, add the following imports at the top:

```typescript
import { tagColor, CATEGORIES } from "@/components/extensions/extension-filters";
```

Add state for tag input after the existing state declarations:

```typescript
const [tagInput, setTagInput] = useState("");
const { allTags, updateTags, updateCategory } = useExtensionStore();
```

Add a category + tags section between the Metadata section and the Update status section (after the closing `</div>` of the metadata block):

```tsx
{/* Category */}
<div className="mt-4">
  <h4 className="mb-2 text-xs font-medium text-zinc-500">Category</h4>
  <select
    value={ext.category ?? ""}
    onChange={(e) => updateCategory(ext.id, e.target.value || null)}
    className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:focus:border-zinc-500"
  >
    <option value="">No category</option>
    {CATEGORIES.map((cat) => (
      <option key={cat} value={cat}>{cat}</option>
    ))}
  </select>
</div>

{/* Tags */}
<div className="mt-4">
  <h4 className="mb-2 text-xs font-medium text-zinc-500">Tags</h4>
  <div className="flex flex-wrap gap-1.5">
    {ext.tags.map((tag) => {
      const idx = allTags.indexOf(tag);
      return (
        <span key={tag} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tagColor(idx >= 0 ? idx : 0)}`}>
          {tag}
          <button onClick={() => updateTags(ext.id, ext.tags.filter((t) => t !== tag))} className="hover:opacity-70">
            <X size={10} />
          </button>
        </span>
      );
    })}
  </div>
  <div className="mt-2 flex gap-1.5">
    <input
      type="text"
      value={tagInput}
      onChange={(e) => setTagInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && tagInput.trim()) {
          const tag = tagInput.trim().toLowerCase();
          if (!ext.tags.includes(tag)) {
            updateTags(ext.id, [...ext.tags, tag]);
          }
          setTagInput("");
        }
      }}
      list="tag-suggestions"
      placeholder="Add tag..."
      className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
    />
    <datalist id="tag-suggestions">
      {allTags.filter((t) => !ext.tags.includes(t)).map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  </div>
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/extensions/extension-detail.tsx
git commit -m "feat: add tag editor to extension detail panel"
```

---

## Feature 2: Marketplace (skills.sh)

### Task 6: Backend — Marketplace API client

**Files:**
- Modify: `crates/hk-core/Cargo.toml`
- Create: `crates/hk-core/src/marketplace.rs`
- Modify: `crates/hk-core/src/lib.rs`

- [ ] **Step 1: Add reqwest dependency**

In `crates/hk-core/Cargo.toml`, add to `[dependencies]`:

```toml
reqwest = { version = "0.12", features = ["json", "blocking"] }
```

- [ ] **Step 2: Create marketplace.rs**

Create `crates/hk-core/src/marketplace.rs`:

```rust
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const SKILLS_API_BASE: &str = "https://skills.sh/api";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceSkill {
    pub id: String,
    #[serde(rename = "skillId")]
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    pub source: String,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    skills: Vec<MarketplaceSkill>,
}

/// Search skills.sh marketplace. Query must be at least 2 characters.
pub fn search(query: &str, limit: usize) -> Result<Vec<MarketplaceSkill>> {
    if query.len() < 2 {
        return Ok(vec![]);
    }
    let url = format!("{SKILLS_API_BASE}/search?q={}&limit={}", urlencoded(query), limit);
    let resp: SearchResponse = reqwest::blocking::get(&url)
        .context("Failed to reach skills.sh")?
        .json()
        .context("Failed to parse skills.sh response")?;
    Ok(resp.skills)
}

/// Fetch the raw SKILL.md content from a GitHub-hosted skill.
/// source = "owner/repo", skill_id = "skill-name"
pub fn fetch_skill_content(source: &str, skill_id: &str) -> Result<String> {
    // Try common paths used by skills.sh repos
    let paths = [
        format!("skills/{skill_id}/SKILL.md"),
        format!("{skill_id}/SKILL.md"),
        "SKILL.md".to_string(),
    ];
    for path in &paths {
        let url = format!("https://raw.githubusercontent.com/{source}/main/{path}");
        let resp = reqwest::blocking::get(&url).context("Failed to fetch from GitHub")?;
        if resp.status().is_success() {
            return resp.text().context("Failed to read response body");
        }
    }
    anyhow::bail!("Could not find SKILL.md for {source}/{skill_id}")
}

/// Build the git clone URL for a GitHub-sourced skill
pub fn git_url_for_source(source: &str) -> String {
    format!("https://github.com/{source}.git")
}

fn urlencoded(s: &str) -> String {
    s.replace(' ', "+")
        .replace('&', "%26")
        .replace('?', "%3F")
        .replace('#', "%23")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_urlencoded() {
        assert_eq!(urlencoded("hello world"), "hello+world");
        assert_eq!(urlencoded("a&b"), "a%26b");
    }

    #[test]
    fn test_short_query_returns_empty() {
        let result = search("a", 10).unwrap();
        assert!(result.is_empty());
    }
}
```

- [ ] **Step 3: Export marketplace module in lib.rs**

In `crates/hk-core/src/lib.rs`, add:

```rust
pub mod marketplace;
```

- [ ] **Step 4: Build**

Run: `cargo build -p hk-core`
Expected: Compiles (reqwest downloads and builds)

- [ ] **Step 5: Commit**

```bash
git add crates/hk-core/Cargo.toml crates/hk-core/src/marketplace.rs crates/hk-core/src/lib.rs
git commit -m "feat: add skills.sh marketplace API client"
```

---

### Task 7: Backend — Marketplace Tauri commands

**Files:**
- Modify: `crates/hk-desktop/src/commands.rs`
- Modify: `crates/hk-desktop/src/main.rs`

- [ ] **Step 1: Add marketplace commands**

In `crates/hk-desktop/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn search_marketplace(query: String, limit: Option<usize>) -> Result<Vec<hk_core::marketplace::MarketplaceSkill>, String> {
    hk_core::marketplace::search(&query, limit.unwrap_or(30))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fetch_skill_preview(source: String, skill_id: String) -> Result<String, String> {
    hk_core::marketplace::fetch_skill_content(&source, &skill_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn install_from_marketplace(state: State<AppState>, source: String, skill_id: String) -> Result<String, String> {
    let adapters = adapter::all_adapters();
    let target_dir = adapters
        .iter()
        .filter(|a| a.detect())
        .flat_map(|a| a.skill_dirs())
        .next()
        .ok_or_else(|| "No agent skill directory found".to_string())?;

    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let git_url = hk_core::marketplace::git_url_for_source(&source);
    let name = manager::install_from_git(&git_url, &target_dir).map_err(|e| e.to_string())?;

    // Re-scan to pick up the new extension
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let extensions = scanner::scan_all(&adapters);
    for ext in &extensions {
        let _ = store.insert_extension(ext);
    }

    Ok(name)
}
```

- [ ] **Step 2: Register commands in main.rs**

Add to the `invoke_handler` list in `crates/hk-desktop/src/main.rs`:

```rust
commands::search_marketplace,
commands::fetch_skill_preview,
commands::install_from_marketplace,
commands::update_tags,
commands::get_all_tags,
```

- [ ] **Step 3: Build**

Run: `cargo build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add crates/hk-desktop/src/commands.rs crates/hk-desktop/src/main.rs
git commit -m "feat: add marketplace Tauri commands"
```

---

### Task 8: Frontend — Types and API for marketplace

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/invoke.ts`
- Create: `src/stores/marketplace-store.ts`

- [ ] **Step 1: Add MarketplaceSkill type**

In `src/lib/types.ts`, add:

```typescript
export interface MarketplaceSkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}
```

- [ ] **Step 2: Add API calls**

In `src/lib/invoke.ts`, add to the `api` object:

```typescript
searchMarketplace(query: string, limit?: number): Promise<MarketplaceSkill[]> {
  return invoke("search_marketplace", { query, limit });
},

fetchSkillPreview(source: string, skillId: string): Promise<string> {
  return invoke("fetch_skill_preview", { source, skillId });
},

installFromMarketplace(source: string, skillId: string): Promise<string> {
  return invoke("install_from_marketplace", { source, skillId });
},
```

- [ ] **Step 3: Create marketplace store**

Create `src/stores/marketplace-store.ts`:

```typescript
import { create } from "zustand";
import type { MarketplaceSkill } from "@/lib/types";
import { api } from "@/lib/invoke";

interface MarketplaceState {
  query: string;
  results: MarketplaceSkill[];
  loading: boolean;
  previewSkill: MarketplaceSkill | null;
  previewContent: string | null;
  previewLoading: boolean;
  installing: string | null;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  preview: (skill: MarketplaceSkill) => Promise<void>;
  closePreview: () => void;
  install: (skill: MarketplaceSkill) => Promise<string>;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  query: "",
  results: [],
  loading: false,
  previewSkill: null,
  previewContent: null,
  previewLoading: false,
  installing: null,
  setQuery(query) { set({ query }); },
  async search() {
    const { query } = get();
    if (query.length < 2) { set({ results: [] }); return; }
    set({ loading: true });
    const results = await api.searchMarketplace(query);
    set({ results, loading: false });
  },
  async preview(skill) {
    set({ previewSkill: skill, previewContent: null, previewLoading: true });
    try {
      const content = await api.fetchSkillPreview(skill.source, skill.skillId);
      set({ previewContent: content, previewLoading: false });
    } catch {
      set({ previewContent: "Could not load preview.", previewLoading: false });
    }
  },
  closePreview() { set({ previewSkill: null, previewContent: null }); },
  async install(skill) {
    set({ installing: skill.id });
    try {
      const name = await api.installFromMarketplace(skill.source, skill.skillId);
      set({ installing: null });
      return name;
    } catch (e) {
      set({ installing: null });
      throw e;
    }
  },
}));
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/invoke.ts src/stores/marketplace-store.ts
git commit -m "feat: add marketplace types, API, and store"
```

---

### Task 9: Frontend — Marketplace page

**Files:**
- Create: `src/pages/marketplace.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create marketplace page**

Create `src/pages/marketplace.tsx`:

```tsx
import { useState } from "react";
import { useMarketplaceStore } from "@/stores/marketplace-store";
import { Search, Download, Eye, X, Loader2 } from "lucide-react";

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function MarketplacePage() {
  const {
    query, setQuery, results, loading, search,
    previewSkill, previewContent, previewLoading, preview, closePreview,
    installing, install,
  } = useMarketplaceStore();
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSearch = () => { setError(null); search(); };
  const handleInstall = async (skill: typeof results[0]) => {
    setError(null);
    try {
      await install(skill);
      setInstalled((prev) => new Set(prev).add(skill.id));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-4 min-w-0">
        <h2 className="text-xl font-semibold">Marketplace</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Search and install skills from <span className="font-medium text-zinc-700 dark:text-zinc-300">skills.sh</span>
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search skills (e.g. react, testing, python)..."
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || query.length < 2}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Search"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {results.length === 0 && !loading && query.length >= 2 && (
          <p className="py-8 text-center text-sm text-zinc-500">No results found.</p>
        )}

        <div className="grid gap-3">
          {results.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{skill.name}</span>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    {formatInstalls(skill.installs)} installs
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{skill.source}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => preview(skill)}
                  className="rounded-lg bg-zinc-200 p-2 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                  title="Preview"
                >
                  <Eye size={14} />
                </button>
                {installed.has(skill.id) ? (
                  <span className="rounded-lg bg-green-100 px-3 py-2 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Installed
                  </span>
                ) : (
                  <button
                    onClick={() => handleInstall(skill)}
                    disabled={installing === skill.id}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {installing === skill.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    Install
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Panel */}
      {previewSkill && (
        <div className="w-96 shrink-0 sticky top-0 self-start max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">{previewSkill.name}</h3>
              <p className="mt-1 text-xs text-zinc-500">{previewSkill.source}</p>
            </div>
            <button onClick={closePreview} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800">
            {previewLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-zinc-400" /></div>
            ) : (
              <pre className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400 max-h-[60vh] overflow-y-auto">{previewContent}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add marketplace link to sidebar**

In `src/components/layout/sidebar.tsx`, add the Marketplace nav item. Import `Store` (or `ShoppingBag`) from lucide-react and add after the Extensions link:

```tsx
{ to: "/marketplace", icon: ShoppingBag, label: "Marketplace" },
```

- [ ] **Step 3: Add route in App.tsx**

In `src/App.tsx`, import and add the route:

```tsx
import MarketplacePage from "./pages/marketplace";
```

Add the route after the extensions route:

```tsx
<Route path="marketplace" element={<MarketplacePage />} />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/marketplace.tsx src/components/layout/sidebar.tsx src/App.tsx
git commit -m "feat: add marketplace page with search and preview"
```

---

## Feature 3: Cross-Agent Skill Deployment

### Task 10: Backend — Deploy skill to another agent

**Files:**
- Create: `crates/hk-core/src/deployer.rs`
- Modify: `crates/hk-core/src/lib.rs`
- Modify: `crates/hk-desktop/src/commands.rs`
- Modify: `crates/hk-desktop/src/main.rs`

- [ ] **Step 1: Create deployer.rs**

Create `crates/hk-core/src/deployer.rs`:

```rust
use anyhow::{Context, Result};
use std::path::Path;

/// Copy a skill directory (or single .md file) from source to target agent's skill dir.
/// Returns the name of the deployed skill.
pub fn deploy_skill(source_path: &Path, target_skill_dir: &Path) -> Result<String> {
    std::fs::create_dir_all(target_skill_dir)?;

    if source_path.is_dir() {
        let dir_name = source_path.file_name()
            .context("Invalid source path")?
            .to_string_lossy()
            .to_string();
        let dest = target_skill_dir.join(&dir_name);
        copy_dir_recursive(source_path, &dest)?;
        Ok(dir_name)
    } else {
        // Single .md file
        let file_name = source_path.file_name()
            .context("Invalid source path")?
            .to_string_lossy()
            .to_string();
        let dest = target_skill_dir.join(&file_name);
        std::fs::copy(source_path, &dest)?;
        Ok(file_name)
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            if entry.file_name() == ".git" { continue; }
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_deploy_skill_directory() {
        let src_dir = TempDir::new().unwrap();
        let skill_dir = src_dir.path().join("my-skill");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "# My Skill").unwrap();

        let target = TempDir::new().unwrap();
        let name = deploy_skill(&skill_dir, target.path()).unwrap();
        assert_eq!(name, "my-skill");
        assert!(target.path().join("my-skill/SKILL.md").exists());
    }

    #[test]
    fn test_deploy_skill_single_file() {
        let src_dir = TempDir::new().unwrap();
        let skill_file = src_dir.path().join("coding.md");
        std::fs::write(&skill_file, "# Coding skill").unwrap();

        let target = TempDir::new().unwrap();
        let name = deploy_skill(&skill_file, target.path()).unwrap();
        assert_eq!(name, "coding.md");
        assert!(target.path().join("coding.md").exists());
    }
}
```

- [ ] **Step 2: Export deployer module in lib.rs**

In `crates/hk-core/src/lib.rs`, add:

```rust
pub mod deployer;
```

- [ ] **Step 3: Run deployer tests**

Run: `cargo test -p hk-core deployer`
Expected: 2 tests PASS

- [ ] **Step 4: Add deploy_to_agent Tauri command**

In `crates/hk-desktop/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn deploy_to_agent(state: State<AppState>, id: String, target_agent: String) -> Result<String, String> {
    // Find the source skill path
    let ext = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store.get_extension(&id).map_err(|e| e.to_string())?
            .ok_or_else(|| "Extension not found".to_string())?
    };

    if ext.kind != ExtensionKind::Skill {
        return Err("Only skills can be deployed to other agents".into());
    }

    let adapters = adapter::all_adapters();

    // Find the source skill path from the original agent
    let mut source_path = None;
    for a in &adapters {
        if !ext.agents.contains(&a.name().to_string()) { continue; }
        for skill_dir in a.skill_dirs() {
            let Ok(entries) = std::fs::read_dir(&skill_dir) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                let skill_file = if path.is_dir() {
                    path.join("SKILL.md")
                } else if path.extension().is_some_and(|e| e == "md") {
                    path.clone()
                } else { continue };
                if !skill_file.exists() { continue; }
                let name = scanner::parse_skill_name(&skill_file).unwrap_or_else(||
                    path.file_stem().unwrap_or_default().to_string_lossy().to_string()
                );
                if stable_id(&name, "skill", a.name()) == id {
                    source_path = Some(path.clone());
                    break;
                }
            }
        }
    }

    let source_path = source_path.ok_or_else(|| "Source skill not found on disk".to_string())?;

    // Find target agent's skill directory
    let target_adapter = adapters.iter()
        .find(|a| a.name() == target_agent)
        .ok_or_else(|| format!("Unknown agent: {target_agent}"))?;
    let target_dir = target_adapter.skill_dirs()
        .first()
        .cloned()
        .ok_or_else(|| format!("No skill directory for {target_agent}"))?;

    let name = hk_core::deployer::deploy_skill(&source_path, &target_dir)
        .map_err(|e| e.to_string())?;

    // Re-scan to pick up the new extension
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let extensions = scanner::scan_all(&adapters);
    for ext in &extensions {
        let _ = store.insert_extension(ext);
    }

    Ok(name)
}
```

- [ ] **Step 5: Register deploy_to_agent in main.rs**

Add to the `invoke_handler` list in `crates/hk-desktop/src/main.rs`:

```rust
commands::deploy_to_agent,
```

- [ ] **Step 6: Build and run tests**

Run: `cargo build && cargo test`
Expected: Build succeeds, all tests pass

- [ ] **Step 7: Commit**

```bash
git add crates/hk-core/src/deployer.rs crates/hk-core/src/lib.rs crates/hk-desktop/src/commands.rs crates/hk-desktop/src/main.rs
git commit -m "feat: add cross-agent skill deployment"
```

---

### Task 11: Frontend — Deploy UI in detail panel

**Files:**
- Modify: `src/lib/invoke.ts`
- Modify: `src/stores/extension-store.ts`
- Modify: `src/components/extensions/extension-detail.tsx`

- [ ] **Step 1: Add API call**

In `src/lib/invoke.ts`, add to the `api` object:

```typescript
deployToAgent(id: string, targetAgent: string): Promise<string> {
  return invoke("deploy_to_agent", { id, targetAgent });
},
```

- [ ] **Step 2: Add deploy action to extension store**

In `src/stores/extension-store.ts`, add to the interface:

```typescript
deployToAgent: (id: string, targetAgent: string) => Promise<void>;
```

Add to the store implementation:

```typescript
async deployToAgent(id, targetAgent) {
  await api.deployToAgent(id, targetAgent);
  get().fetch();
},
```

- [ ] **Step 3: Add agent deployment section to detail panel**

In `src/components/extensions/extension-detail.tsx`, add the agent store import:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Add state for deploying after existing state:

```typescript
const { agents } = useAgentStore();
const { deployToAgent } = useExtensionStore();
const [deploying, setDeploying] = useState<string | null>(null);
```

Add the deploy section after the tags section (for skills only):

```tsx
{/* Deploy to other agents */}
{ext.kind === "skill" && (() => {
  const detectedAgents = agents.filter((a) => a.detected);
  const otherAgents = detectedAgents.filter((a) => !ext.agents.includes(a.name));
  if (otherAgents.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-medium text-zinc-500">Deploy to Agent</h4>
      <div className="flex flex-wrap gap-1.5">
        {otherAgents.map((agent) => (
          <button
            key={agent.name}
            disabled={deploying === agent.name}
            onClick={async () => {
              setDeploying(agent.name);
              try {
                await deployToAgent(ext.id, agent.name);
              } finally {
                setDeploying(null);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
          >
            {deploying === agent.name ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            {agent.name}
          </button>
        ))}
      </div>
    </div>
  );
})()}
```

Add `Loader2` and `Download` to the lucide imports at the top of the file:

```typescript
import { X, File, Globe, Terminal, Database, Key, Calendar, GitBranch, ArrowDownCircle, CheckCircle, FolderOpen, Download, Loader2 } from "lucide-react";
```

- [ ] **Step 4: Load agents on page mount**

In `src/pages/extensions.tsx`, add the agent store fetch:

```typescript
import { useAgentStore } from "@/stores/agent-store";
```

Inside the component, add:

```typescript
const { fetch: fetchAgents } = useAgentStore();
useEffect(() => { fetchAgents(); }, [fetchAgents]);
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Build everything**

Run: `cargo build && npx tsc --noEmit`
Expected: Both pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/invoke.ts src/stores/extension-store.ts src/components/extensions/extension-detail.tsx src/pages/extensions.tsx
git commit -m "feat: add cross-agent deploy UI in extension detail panel"
```

---

## Final Verification

### Task 12: Full build and test

- [ ] **Step 1: Run all Rust tests**

Run: `cargo test`
Expected: All tests pass (47+)

- [ ] **Step 2: TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify in dev mode**

Run: `cargo tauri dev`
Expected:
- Extensions page shows tag filter pills when tags exist
- Detail panel has tag editor with autocomplete
- Marketplace page has search, preview panel, and install buttons
- Detail panel shows "Deploy to Agent" buttons for skills in single agents
