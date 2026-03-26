use hk_core::{adapter, auditor::Auditor, models::*, scanner, store::Store};
use std::sync::Mutex;
use tauri::State;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub struct AppState {
    pub store: Mutex<Store>,
}

#[tauri::command]
pub fn list_extensions(
    state: State<AppState>,
    kind: Option<String>,
    agent: Option<String>,
) -> Result<Vec<Extension>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let kind_filter = kind.as_deref().and_then(|k| k.parse().ok());
    store.list_extensions(kind_filter, agent.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_agents() -> Vec<AgentInfo> {
    let adapters = adapter::all_adapters();
    adapters.iter().map(|a| AgentInfo {
        name: a.name().to_string(),
        detected: a.detect(),
        extension_count: 0,
    }).collect()
}

#[tauri::command]
pub fn get_dashboard_stats(state: State<AppState>) -> Result<DashboardStats, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let all = store.list_extensions(None, None).map_err(|e| e.to_string())?;
    Ok(DashboardStats {
        total_extensions: all.len(),
        skill_count: all.iter().filter(|e| e.kind == ExtensionKind::Skill).count(),
        mcp_count: all.iter().filter(|e| e.kind == ExtensionKind::Mcp).count(),
        plugin_count: all.iter().filter(|e| e.kind == ExtensionKind::Plugin).count(),
        hook_count: all.iter().filter(|e| e.kind == ExtensionKind::Hook).count(),
        critical_issues: 0,
        high_issues: 0,
        medium_issues: 0,
        low_issues: 0,
        updates_available: 0,
    })
}

#[tauri::command]
pub fn toggle_extension(state: State<AppState>, id: String, enabled: bool) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    store.set_enabled(&id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_audit(state: State<AppState>) -> Result<Vec<AuditResult>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let extensions = store.list_extensions(None, None).map_err(|e| e.to_string())?;
    let auditor = Auditor::new();
    let mut results = Vec::new();
    for ext in &extensions {
        let input = hk_core::auditor::AuditInput {
            extension_id: ext.id.clone(),
            kind: ext.kind,
            name: ext.name.clone(),
            content: String::new(),
            source: ext.source.clone(),
            file_path: ext.name.clone(),
            mcp_command: None,
            mcp_args: vec![],
            mcp_env: Default::default(),
            installed_at: ext.installed_at,
            updated_at: ext.updated_at,
        };
        let result = auditor.audit(&input);
        let _ = store.insert_audit_result(&result);
        results.push(result);
    }
    Ok(results)
}

#[tauri::command]
pub fn delete_extension(state: State<AppState>, id: String) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    store.delete_extension(&id).map_err(|e| e.to_string())
}

fn stable_id(name: &str, kind: &str, agent: &str) -> String {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    kind.hash(&mut hasher);
    agent.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[tauri::command]
pub fn get_extension_content(state: State<AppState>, id: String) -> Result<String, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let ext = store.get_extension(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Extension not found".to_string())?;

    match ext.kind {
        ExtensionKind::Skill => {
            // Find the skill file by scanning adapter directories
            let adapters = adapter::all_adapters();
            for adapter in &adapters {
                if !ext.agents.contains(&adapter.name().to_string()) { continue; }
                for skill_dir in adapter.skill_dirs() {
                    let Ok(entries) = std::fs::read_dir(&skill_dir) else { continue };
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let skill_file = if path.is_dir() {
                            path.join("SKILL.md")
                        } else if path.extension().is_some_and(|e| e == "md") {
                            path.clone()
                        } else { continue };
                        if !skill_file.exists() { continue; }
                        // Check if this skill matches by comparing stable IDs
                        let name = scanner::parse_skill_name(&skill_file).unwrap_or_else(||
                            path.file_stem().unwrap_or_default().to_string_lossy().to_string()
                        );
                        if stable_id(&name, "skill", adapter.name()) == id {
                            return std::fs::read_to_string(&skill_file).map_err(|e| e.to_string());
                        }
                    }
                }
            }
            Err("Skill file not found".into())
        }
        ExtensionKind::Mcp => Ok(format!("MCP Server: {}\nCommand: {}", ext.name, ext.description)),
        ExtensionKind::Hook => Ok(format!("Hook: {}\nCommand: {}", ext.name, ext.description)),
        ExtensionKind::Plugin => Ok(format!("Plugin: {}\nDescription: {}", ext.name, ext.description)),
    }
}

#[tauri::command]
pub fn scan_and_sync(state: State<AppState>) -> Result<usize, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let adapters = adapter::all_adapters();
    let extensions = scanner::scan_all(&adapters);
    let count = extensions.len();
    // Upsert: stable IDs + INSERT OR REPLACE ensures no duplicates
    for ext in &extensions {
        let _ = store.insert_extension(ext);
    }
    Ok(count)
}
