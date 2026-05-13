pub mod antigravity;
pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod gemini;
pub mod hook_events;
pub mod preset;
pub mod windsurf;

use crate::models::ConfigScope;
use std::path::PathBuf;

/// Represents an MCP server entry parsed from an agent's config
#[derive(Debug, Clone)]
pub struct McpServerEntry {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: std::collections::HashMap<String, String>,
}

/// Represents a hook entry parsed from an agent's config
#[derive(Debug, Clone)]
pub struct HookEntry {
    pub event: String,
    pub matcher: Option<String>,
    pub command: String,
}

/// Represents a plugin entry parsed from an agent's config
#[derive(Debug, Clone)]
pub struct PluginEntry {
    pub name: String,
    pub source: String,
    pub enabled: bool,
    pub path: Option<std::path::PathBuf>,
    /// Agent-specific URI for the plugin (e.g. VS Code pluginUri "file:///...").
    /// Used by toggle to identify the plugin in the agent's state store.
    pub uri: Option<String>,
    /// Precise install timestamp (e.g. from a registry file). Overrides file-system heuristic.
    pub installed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Precise last-updated timestamp. Overrides file-system heuristic.
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Format used by an agent for hook configuration files.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum HookFormat {
    /// Claude, Codex, Gemini: {"hooks": {"Event": [{"matcher": "...", "hooks": ["cmd"]}]}}
    ClaudeLike,
    /// Cursor: {"version": 1, "hooks": {"event": [{"command": "cmd"}]}}
    Cursor,
    /// Copilot: {"version": 1, "hooks": {"event": [{"type": "command", "bash": "cmd"}]}}
    Copilot,
    /// Windsurf: {"hooks": {"event": [{"command": "cmd"}]}}
    Windsurf,
    /// Agent does not support hooks
    None,
}

/// Format used by an agent for MCP server configuration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum McpFormat {
    /// JSON with "mcpServers" top-level key (Claude, Gemini, Cursor, Antigravity)
    McpServers,
    /// JSON with "servers" top-level key (Copilot / VS Code)
    Servers,
    /// TOML with [mcp_servers.<name>] sections (Codex)
    Toml,
}

pub trait AgentAdapter: Send + Sync {
    fn name(&self) -> &str;
    fn base_dir(&self) -> PathBuf;
    fn detect(&self) -> bool;
    fn skill_dirs(&self) -> Vec<PathBuf>;
    fn mcp_config_path(&self) -> PathBuf;
    fn hook_config_path(&self) -> PathBuf;
    fn plugin_dirs(&self) -> Vec<PathBuf>;
    /// Path to the config file where plugin enable/disable state is stored.
    /// Defaults to the same file as hook_config_path (settings.json for most agents).
    fn plugin_config_path(&self) -> PathBuf {
        self.hook_config_path()
    }
    fn read_mcp_servers(&self) -> Vec<McpServerEntry> {
        vec![]
    }
    fn read_hooks(&self) -> Vec<HookEntry> {
        vec![]
    }
    /// Parse MCP servers from a specific config file (e.g. a project's `.mcp.json`).
    /// Default returns empty — only adapters that support project-level MCP override.
    fn read_mcp_servers_from(&self, _path: &std::path::Path) -> Vec<McpServerEntry> {
        vec![]
    }
    /// Parse hooks from a specific config file (e.g. a project's `.claude/settings.json`).
    /// Default returns empty — only adapters that support project-level hooks override.
    fn read_hooks_from(&self, _path: &std::path::Path) -> Vec<HookEntry> {
        vec![]
    }
    fn read_plugins(&self) -> Vec<PluginEntry> {
        vec![]
    }
    /// VS Code user data directory for agents that store state in state.vscdb.
    /// Only Copilot overrides this; others return None.
    fn vscode_user_dir(&self) -> Option<PathBuf> {
        None
    }
    fn hook_format(&self) -> HookFormat {
        HookFormat::ClaudeLike
    }
    fn mcp_format(&self) -> McpFormat {
        McpFormat::McpServers
    }

    /// True if HarnessKit should resolve bare commands to absolute paths and
    /// inject `PATH` into the MCP env block when deploying servers to this
    /// agent. Required for agents that don't reliably inherit shell `$PATH`
    /// when launching MCP server subprocesses (e.g. Antigravity, Windsurf
    /// launched from a GUI without sourcing interactive shell rc files).
    /// Default false — only override for agents with confirmed reports.
    fn needs_path_injection(&self) -> bool {
        false
    }

    /// Translate a hook event name from any agent's convention to this agent's convention.
    /// Returns None if the event has no equivalent in this agent.
    /// Mappings are centralized in `hook_events.rs`.
    fn translate_hook_event(&self, event: &str) -> Option<String> {
        Some(event.to_string()) // Default: pass-through (overridden by each adapter)
    }

    // --- Config file discovery (for Agents page) ---

    /// Global rule/instruction files (absolute paths, e.g. ~/.claude/CLAUDE.md)
    fn global_rules_files(&self) -> Vec<PathBuf> {
        vec![]
    }

    /// Global memory files (absolute paths)
    fn global_memory_files(&self) -> Vec<PathBuf> {
        vec![]
    }

    /// Global settings files (absolute paths, e.g. ~/.claude/settings.json)
    fn global_settings_files(&self) -> Vec<PathBuf> {
        vec![]
    }

    /// Relative paths/globs for rules within a project dir (e.g. "CLAUDE.md")
    fn project_rules_patterns(&self) -> Vec<String> {
        vec![]
    }

    /// Relative paths/globs for memory within a project dir
    fn project_memory_patterns(&self) -> Vec<String> {
        vec![]
    }

    /// Relative paths/globs for settings within a project dir
    fn project_settings_patterns(&self) -> Vec<String> {
        vec![]
    }

    /// Relative paths/globs for ignore files within a project dir
    fn project_ignore_patterns(&self) -> Vec<String> {
        vec![]
    }

    /// Global workflow/command files (absolute paths). Workflows are user-invocable
    /// reusable step sequences (e.g. Windsurf `/<name>` slash commands), distinct
    /// from settings (mcp/hooks) and rules (passive context).
    fn global_workflow_files(&self) -> Vec<PathBuf> {
        vec![]
    }

    /// Relative paths/globs for workflow/command files within a project dir.
    fn project_workflow_patterns(&self) -> Vec<String> {
        vec![]
    }

    // --- Project-level extension scanning ---
    // These describe where this agent looks for project-scoped extensions.
    // Default empty/None means the agent has no project-level support and the
    // scanner skips it.

    /// Relative dir patterns within a project that contain skill subdirectories
    /// (e.g. `.claude/skills` for Claude — each subdirectory inside is one skill).
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![]
    }

    /// Relative path of the project-level MCP config file (e.g. `.mcp.json`).
    fn project_mcp_config_relpath(&self) -> Option<String> {
        None
    }

    /// Relative path of the project-level hook config file
    /// (e.g. `.claude/settings.json` for Claude).
    fn project_hook_config_relpath(&self) -> Option<String> {
        None
    }

    /// Relative dir patterns within a project that contain plugins.
    fn project_plugin_dirs(&self) -> Vec<String> {
        vec![]
    }

    /// Resolve the MCP config file for a given scope.
    /// - `Global` → adapter's user-scope path (`mcp_config_path()`).
    /// - `Project` → `<project>/<project_mcp_config_relpath()>`, or `None`
    ///   if the adapter has no project-level MCP support.
    fn mcp_config_path_for(&self, scope: &ConfigScope) -> Option<PathBuf> {
        match scope {
            ConfigScope::Global => Some(self.mcp_config_path()),
            ConfigScope::Project { path, .. } => self
                .project_mcp_config_relpath()
                .map(|rel| std::path::Path::new(path).join(rel)),
        }
    }

    /// Resolve the hook config file for a given scope. Mirrors
    /// `mcp_config_path_for`.
    fn hook_config_path_for(&self, scope: &ConfigScope) -> Option<PathBuf> {
        match scope {
            ConfigScope::Global => Some(self.hook_config_path()),
            ConfigScope::Project { path, .. } => self
                .project_hook_config_relpath()
                .map(|rel| std::path::Path::new(path).join(rel)),
        }
    }

    /// Resolve the skill directory for a given scope.
    /// - `Global` → first entry of `skill_dirs()` (today's behavior).
    /// - `Project` → `<project>/<project_skill_dirs()[0]>`, or `None` if
    ///   the adapter has no project-level skill support.
    fn skill_dir_for(&self, scope: &ConfigScope) -> Option<std::path::PathBuf> {
        match scope {
            ConfigScope::Global => self.skill_dirs().into_iter().next(),
            ConfigScope::Project { path, .. } => self
                .project_skill_dirs()
                .into_iter()
                .next()
                .map(|rel| std::path::Path::new(path).join(rel)),
        }
    }
}

/// Returns all agent adapters in canonical display order.
/// Must match AGENT_ORDER in src/lib/types.ts.
pub fn all_adapters() -> Vec<Box<dyn AgentAdapter>> {
    vec![
        Box::new(claude::ClaudeAdapter::new()),
        Box::new(codex::CodexAdapter::new()),
        Box::new(gemini::GeminiAdapter::new()),
        Box::new(cursor::CursorAdapter::new()),
        Box::new(antigravity::AntigravityAdapter::new()),
    ]
}

/// Instantiate a supported non-builtin adapter by its persisted agent name.
/// These adapters are used for preset agents added from Settings, without
/// promoting them into the default built-in agent list.
pub fn adapter_for_name(name: &str) -> Option<Box<dyn AgentAdapter>> {
    match name {
        "copilot" => Some(Box::new(copilot::CopilotAdapter::new())),
        "windsurf" => Some(Box::new(windsurf::WindsurfAdapter::new())),
        "openclaw" => Some(Box::new(preset::OpenClawAdapter::new())),
        "codebuddy" => Some(Box::new(preset::CodeBuddyAdapter::new())),
        "opencode" => Some(Box::new(preset::OpenCodeAdapter::new())),
        "kimi-code-cli" => Some(Box::new(preset::KimiCodeCliAdapter::new())),
        "kilo-code" => Some(Box::new(preset::KiloCodeAdapter::new())),
        "kiro-cli" => Some(Box::new(preset::KiroCliAdapter::new())),
        "trae" => Some(Box::new(preset::TraeAdapter::new())),
        "trae-cn" => Some(Box::new(preset::TraeCnAdapter::new())),
        "qoder" => Some(Box::new(preset::QoderAdapter::new())),
        "qwen-code" => Some(Box::new(preset::QwenCodeAdapter::new())),
        _ => None,
    }
}

/// Runtime adapters = built-in adapters + supported preset agents that the
/// user has explicitly added in Settings.
#[cfg(target_os = "windows")]
fn home_from_custom_base(custom_path: &str, expected_dir_name: &str) -> Option<PathBuf> {
    let base = PathBuf::from(custom_path);
    if base
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(expected_dir_name))
    {
        return base.parent().map(PathBuf::from);
    }
    None
}

#[cfg(target_os = "windows")]
fn builtin_adapter_with_windows_custom_path(
    name: &str,
    custom_path: Option<&str>,
) -> Option<Box<dyn AgentAdapter>> {
    let path = custom_path?;
    match name {
        "claude" => home_from_custom_base(path, ".claude")
            .map(|home| Box::new(claude::ClaudeAdapter::with_home(home)) as Box<dyn AgentAdapter>),
        "codex" => home_from_custom_base(path, ".codex")
            .map(|home| Box::new(codex::CodexAdapter::with_home(home)) as Box<dyn AgentAdapter>),
        "gemini" => home_from_custom_base(path, ".gemini")
            .map(|home| Box::new(gemini::GeminiAdapter::with_home(home)) as Box<dyn AgentAdapter>),
        "cursor" => home_from_custom_base(path, ".cursor")
            .map(|home| Box::new(cursor::CursorAdapter::with_home(home)) as Box<dyn AgentAdapter>),
        "antigravity" => home_from_custom_base(path, ".antigravity").map(|home| {
            Box::new(antigravity::AntigravityAdapter::with_home(home)) as Box<dyn AgentAdapter>
        }),
        _ => None,
    }
}

pub fn runtime_adapters_for_settings(
    settings: &[(String, Option<String>, bool, Option<i32>, Option<String>)],
) -> Vec<Box<dyn AgentAdapter>> {
    let mut adapters = all_adapters();
    let builtin_names: std::collections::HashSet<String> =
        adapters.iter().map(|a| a.name().to_string()).collect();

    #[cfg(target_os = "windows")]
    {
        for (name, custom_path, _, _, _) in settings {
            let Some(custom_adapter) =
                builtin_adapter_with_windows_custom_path(name, custom_path.as_deref())
            else {
                continue;
            };
            if let Some(slot) = adapters.iter_mut().find(|adapter| adapter.name() == name) {
                *slot = custom_adapter;
            }
        }
    }

    for (name, _, _, _, _) in settings {
        if builtin_names.contains(name) {
            continue;
        }
        if adapters.iter().any(|adapter| adapter.name() == name) {
            continue;
        }
        if let Some(adapter) = adapter_for_name(name) {
            adapters.push(adapter);
        }
    }

    adapters
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_adapters_returns_five() {
        let adapters = all_adapters();
        assert_eq!(adapters.len(), 5);
        let names: Vec<&str> = adapters.iter().map(|a| a.name()).collect();
        assert!(names.contains(&"claude"));
        assert!(names.contains(&"cursor"));
        assert!(names.contains(&"codex"));
        assert!(names.contains(&"gemini"));
        assert!(names.contains(&"antigravity"));
    }

    #[test]
    fn test_needs_path_injection_invariants() {
        // GUI agents that don't reliably inherit shell $PATH — confirmed by
        // user reports (Antigravity) and community (Windsurf on Linux/Windows).
        // Pinned here so a regression that flips either back to false fails
        // the test instead of silently breaking MCP launches.
        let adapters = all_adapters();
        let by_name: std::collections::HashMap<_, _> =
            adapters.iter().map(|a| (a.name().to_string(), a)).collect();
        assert!(by_name["antigravity"].needs_path_injection());

        // Everyone else inherits PATH correctly (CLI agents launched from a
        // shell, or VSCode-fork IDEs with working resolveShellEnv on most
        // setups). Adding an agent here without a confirmed PATH bug would
        // unnecessarily rewrite users' mcp_config.json with absolute paths,
        // hurting cross-machine portability.
        for name in ["claude", "codex", "gemini", "cursor"] {
            assert!(
                !by_name[name].needs_path_injection(),
                "{name} should not need path injection"
            );
        }
    }

    #[test]
    fn test_default_config_methods_return_empty() {
        let adapters = all_adapters();
        for a in &adapters {
            let _ = a.global_rules_files();
            let _ = a.global_memory_files();
            let _ = a.global_settings_files();
            let _ = a.project_rules_patterns();
            let _ = a.project_memory_patterns();
            let _ = a.project_settings_patterns();
            let _ = a.project_ignore_patterns();
            let _ = a.global_workflow_files();
            let _ = a.project_workflow_patterns();
        }
    }

    #[test]
    fn test_skill_dir_for_global_matches_skill_dirs_first() {
        let adapters = all_adapters();
        for a in &adapters {
            let global = ConfigScope::Global;
            let computed = a.skill_dir_for(&global);
            let expected = a.skill_dirs().into_iter().next();
            assert_eq!(
                computed,
                expected,
                "{} skill_dir_for(Global) should match skill_dirs()[0]",
                a.name()
            );
        }
    }

    #[test]
    fn test_skill_dir_for_project_joins_path_with_project_skill_dirs_first() {
        let adapters = all_adapters();
        let scope = ConfigScope::Project {
            name: "demo".into(),
            path: "/tmp/demo".into(),
        };
        for adapter in &adapters {
            let computed = adapter.skill_dir_for(&scope);
            let rel = adapter.project_skill_dirs().into_iter().next();
            match (&computed, &rel) {
                (Some(p), Some(r)) => {
                    assert_eq!(p, &std::path::Path::new("/tmp/demo").join(r));
                }
                (None, None) => {} // adapter has no project skill support
                _ => panic!(
                    "{}: mismatched some/none: computed={computed:?} vs project_skill_dirs first={rel:?}",
                    adapter.name()
                ),
            }
        }
    }

    #[test]
    fn test_every_adapter_declares_project_skill_dir() {
        // Universal Agent Skills standard (Dec 2025) — every adapter must declare a
        // project skill directory. If a future adapter genuinely has no project
        // skill concept, drop it from this assertion explicitly.
        let adapters = all_adapters();
        for a in &adapters {
            assert!(
                !a.project_skill_dirs().is_empty(),
                "{} must declare project_skill_dirs (Universal Agent Skills standard)",
                a.name()
            );
        }
    }

    #[test]
    fn test_project_skill_dir_paths_match_upstream_conventions() {
        // Verify each adapter's first-party documented path. Update when adapter
        // upstream conventions change.
        let adapters = all_adapters();
        let expected: std::collections::HashMap<&str, &str> = [
            ("claude", ".claude/skills"),
            ("codex", ".codex/skills"), // Native Codex convention; .agents/skills is also scanned
            ("cursor", ".cursor/skills"),
            ("gemini", ".gemini/skills"),
            ("antigravity", ".agent/skills"), // Singular — Antigravity convention
        ]
        .into_iter()
        .collect();
        for a in &adapters {
            let actual = a.project_skill_dirs().into_iter().next().unwrap();
            let want = expected.get(a.name()).expect("adapter not in expected map");
            assert_eq!(&actual, want, "{} project skill path mismatch", a.name());
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn runtime_adapters_for_settings_honors_windows_builtin_custom_paths() {
        let settings = vec![
            (
                "claude".to_string(),
                Some(r"C:\Users\zoe\.claude".to_string()),
                true,
                None,
                None,
            ),
            (
                "codex".to_string(),
                Some(r"C:\Users\zoe\.codex".to_string()),
                true,
                None,
                None,
            ),
        ];

        let adapters = runtime_adapters_for_settings(&settings);
        let by_name: std::collections::HashMap<_, _> =
            adapters.iter().map(|a| (a.name().to_string(), a)).collect();

        assert_eq!(
            by_name["claude"].base_dir(),
            std::path::PathBuf::from(r"C:\Users\zoe\.claude")
        );
        assert_eq!(
            by_name["codex"].base_dir(),
            std::path::PathBuf::from(r"C:\Users\zoe\.codex")
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn runtime_adapters_for_settings_ignores_builtin_custom_paths_off_windows() {
        let settings = vec![(
            "claude".to_string(),
            Some("/tmp/not-the-real-home/.claude".to_string()),
            true,
            None,
            None,
        )];
        let adapters = runtime_adapters_for_settings(&settings);
        let claude = adapters
            .iter()
            .find(|a| a.name() == "claude")
            .expect("claude adapter should exist");

        assert_ne!(
            claude.base_dir(),
            std::path::PathBuf::from("/tmp/not-the-real-home/.claude"),
            "non-Windows behavior should keep using default adapter paths"
        );
    }
}
