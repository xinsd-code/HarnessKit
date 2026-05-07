use super::{AgentAdapter, McpServerEntry, PluginEntry};
use std::path::{Path, PathBuf};

fn read_json(path: &Path) -> Option<serde_json::Value> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn read_mcp_servers_mcpservers(path: &Path) -> Vec<McpServerEntry> {
    let Some(json) = read_json(path) else {
        return vec![];
    };
    let Some(servers) = json.get("mcpServers").and_then(|v| v.as_object()) else {
        return vec![];
    };

    servers
        .iter()
        .map(|(name, val)| McpServerEntry {
            name: name.clone(),
            command: val
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            args: val
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(ToString::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            env: val
                .get("env")
                .and_then(|v| v.as_object())
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect()
}

fn plugin_entries_from_dir(dir: &Path) -> Vec<PluginEntry> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };

    entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| PluginEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            source: "local".to_string(),
            enabled: true,
            path: Some(entry.path()),
            uri: None,
            installed_at: None,
            updated_at: None,
        })
        .collect()
}

pub struct OpenClawAdapter {
    home: PathBuf,
}

impl Default for OpenClawAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenClawAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for OpenClawAdapter {
    fn name(&self) -> &str {
        "openclaw"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".openclaw")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".openclaw/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

pub struct CodeBuddyAdapter {
    home: PathBuf,
}

impl Default for CodeBuddyAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl CodeBuddyAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for CodeBuddyAdapter {
    fn name(&self) -> &str {
        "codebuddy"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".codebuddy")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".codebuddy/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

pub struct OpenCodeAdapter {
    home: PathBuf,
}

impl Default for OpenCodeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenCodeAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for OpenCodeAdapter {
    fn name(&self) -> &str {
        "opencode"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".config").join("opencode")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".opencode/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("opencode.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("opencode.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("plugins")]
    }
    fn global_rules_files(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("AGENTS.md")]
    }
    fn global_settings_files(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("opencode.json")]
    }
    fn project_rules_patterns(&self) -> Vec<String> {
        vec!["AGENTS.md".into(), ".opencode/AGENTS.md".into()]
    }
    fn project_settings_patterns(&self) -> Vec<String> {
        vec![".opencode/opencode.json".into()]
    }
    fn project_plugin_dirs(&self) -> Vec<String> {
        vec![".opencode/plugins".into()]
    }
    fn project_mcp_config_relpath(&self) -> Option<String> {
        Some(".opencode/opencode.json".into())
    }
    fn read_mcp_servers(&self) -> Vec<McpServerEntry> {
        read_mcp_servers_mcpservers(&self.mcp_config_path())
    }
    fn read_mcp_servers_from(&self, path: &Path) -> Vec<McpServerEntry> {
        read_mcp_servers_mcpservers(path)
    }
    fn read_plugins(&self) -> Vec<PluginEntry> {
        plugin_entries_from_dir(&self.base_dir().join("plugins"))
    }
}

pub struct KimiCodeCliAdapter {
    home: PathBuf,
}

impl Default for KimiCodeCliAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl KimiCodeCliAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }

    fn fallback_base_dir(&self) -> PathBuf {
        self.home.join(".agents")
    }
}

impl AgentAdapter for KimiCodeCliAdapter {
    fn name(&self) -> &str {
        "kimi-code-cli"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".config").join("agents")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists() || self.fallback_base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills"), self.fallback_base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".agents/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
    fn global_rules_files(&self) -> Vec<PathBuf> {
        vec![
            self.base_dir().join("AGENTS.md"),
            self.fallback_base_dir().join("AGENTS.md"),
        ]
    }
    fn project_rules_patterns(&self) -> Vec<String> {
        vec!["AGENTS.md".into(), ".agents/AGENTS.md".into()]
    }
}

pub struct KiloCodeAdapter {
    home: PathBuf,
}

impl Default for KiloCodeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl KiloCodeAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for KiloCodeAdapter {
    fn name(&self) -> &str {
        "kilo-code"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".kilocode")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".kilocode/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

pub struct KiroCliAdapter {
    home: PathBuf,
}

impl Default for KiroCliAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl KiroCliAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for KiroCliAdapter {
    fn name(&self) -> &str {
        "kiro-cli"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".kiro")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".kiro/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("settings.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("powers")]
    }
    fn project_rules_patterns(&self) -> Vec<String> {
        vec![
            ".kiro/steering/*.md".into(),
            ".kiro/specs/*/requirements.md".into(),
            ".kiro/specs/*/design.md".into(),
            ".kiro/specs/*/tasks.md".into(),
        ]
    }
    fn project_plugin_dirs(&self) -> Vec<String> {
        vec![".kiro/powers".into()]
    }
    fn read_plugins(&self) -> Vec<PluginEntry> {
        plugin_entries_from_dir(&self.base_dir().join("powers"))
    }
}

pub struct TraeAdapter {
    home: PathBuf,
}

impl Default for TraeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl TraeAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for TraeAdapter {
    fn name(&self) -> &str {
        "trae"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".trae")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".trae/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("plugins")]
    }
    fn project_plugin_dirs(&self) -> Vec<String> {
        vec![".trae/plugins".into()]
    }
    fn read_plugins(&self) -> Vec<PluginEntry> {
        plugin_entries_from_dir(&self.base_dir().join("plugins"))
    }
}

pub struct TraeCnAdapter {
    home: PathBuf,
}

impl Default for TraeCnAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl TraeCnAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for TraeCnAdapter {
    fn name(&self) -> &str {
        "trae-cn"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".trae-cn")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".trae-cn/skills".into(), ".trae/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

pub struct QoderAdapter {
    home: PathBuf,
}

impl Default for QoderAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl QoderAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for QoderAdapter {
    fn name(&self) -> &str {
        "qoder"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".qoder")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".qoder/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("plugins")]
    }
    fn project_settings_patterns(&self) -> Vec<String> {
        vec![".qoder/mcp.json".into()]
    }
    fn project_plugin_dirs(&self) -> Vec<String> {
        vec![".qoder/plugins".into()]
    }
    fn project_mcp_config_relpath(&self) -> Option<String> {
        Some(".qoder/mcp.json".into())
    }
    fn read_mcp_servers(&self) -> Vec<McpServerEntry> {
        read_mcp_servers_mcpservers(&self.mcp_config_path())
    }
    fn read_mcp_servers_from(&self, path: &Path) -> Vec<McpServerEntry> {
        read_mcp_servers_mcpservers(path)
    }
    fn read_plugins(&self) -> Vec<PluginEntry> {
        plugin_entries_from_dir(&self.base_dir().join("plugins"))
    }
}

pub struct QwenCodeAdapter {
    home: PathBuf,
}

impl Default for QwenCodeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl QwenCodeAdapter {
    pub fn new() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_default(),
        }
    }
}

impl AgentAdapter for QwenCodeAdapter {
    fn name(&self) -> &str {
        "qwen-code"
    }
    fn base_dir(&self) -> PathBuf {
        self.home.join(".qwen")
    }
    fn detect(&self) -> bool {
        self.base_dir().exists()
    }
    fn skill_dirs(&self) -> Vec<PathBuf> {
        vec![self.base_dir().join("skills")]
    }
    fn project_skill_dirs(&self) -> Vec<String> {
        vec![".qwen/skills".into()]
    }
    fn mcp_config_path(&self) -> PathBuf {
        self.base_dir().join("mcp.json")
    }
    fn hook_config_path(&self) -> PathBuf {
        self.base_dir().join("hooks.json")
    }
    fn plugin_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
    fn project_settings_patterns(&self) -> Vec<String> {
        vec![".qwen/mcp.json".into()]
    }
    fn project_mcp_config_relpath(&self) -> Option<String> {
        Some(".qwen/mcp.json".into())
    }
    fn read_mcp_servers(&self) -> Vec<McpServerEntry> {
        read_mcp_servers_mcpservers(&self.mcp_config_path())
    }
    fn read_mcp_servers_from(&self, path: &Path) -> Vec<McpServerEntry> {
        read_mcp_servers_mcpservers(path)
    }
}
