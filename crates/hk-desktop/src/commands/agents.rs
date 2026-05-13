use super::AppState;
use hk_core::adapter;
use hk_core::{HkError, models::*, scanner};
use tauri::State;

fn custom_config_files_for_agent(
    store: &hk_core::store::Store,
    agent_name: &str,
) -> Vec<AgentConfigFile> {
    let mut config_files = Vec::new();
    if let Ok(custom_paths) = store.list_custom_config_paths(agent_name) {
        for (id, path, label, category_str, scope_json) in custom_paths {
            let category = match category_str.as_str() {
                "rules" => ConfigCategory::Rules,
                "memory" => ConfigCategory::Memory,
                "workflow" => ConfigCategory::Workflow,
                "ignore" => ConfigCategory::Ignore,
                _ => ConfigCategory::Settings,
            };
            let scope = scope_json
                .as_deref()
                .and_then(|s| serde_json::from_str::<ConfigScope>(s).ok())
                .unwrap_or(ConfigScope::Global);
            let p = std::path::Path::new(&path);
            let (size_bytes, modified_at, is_dir, exists) = if let Ok(meta) = std::fs::metadata(p) {
                let modified = meta.modified().ok().map(|t| {
                    let d = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                    chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                        .unwrap_or_default()
                });
                (meta.len(), modified, meta.is_dir(), true)
            } else {
                (0, None, false, false)
            };
            config_files.push(AgentConfigFile {
                path: path.clone(),
                agent: agent_name.to_string(),
                category,
                scope,
                file_name: p
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.clone()),
                size_bytes,
                modified_at,
                is_dir,
                exists,
                custom_id: Some(id),
                custom_label: Some(label),
            });
        }
    }
    config_files
}

#[tauri::command]
pub fn list_agents(state: State<AppState>) -> Result<Vec<AgentInfo>, HkError> {
    let adapters = &*state.adapters;
    let store = state.store.lock();
    let settings = store.list_agent_settings().unwrap_or_default();
    let runtime_adapters = adapter::runtime_adapters_for_settings(&settings);

    // Build agent order map from DB (or fall back to adapter iteration order)
    let db_order = store.get_agent_order().unwrap_or_default();
    let order_map: std::collections::HashMap<String, i32> = db_order.into_iter().collect();
    let setting_map: std::collections::HashMap<String, (Option<String>, bool, Option<String>)> =
        settings
            .iter()
            .map(|(name, path, enabled, _, icon_path)| {
                (
                    name.clone(),
                    (path.clone(), *enabled, icon_path.clone()),
                )
            })
            .collect();
    let builtin_names: std::collections::HashSet<String> =
        adapters.iter().map(|a| a.name().to_string()).collect();

    let mut result = Vec::new();
    for a in adapters {
        let (custom_path, enabled, icon_path) =
            store.get_agent_setting(a.name()).unwrap_or((None, true, None));
        let path = custom_path.unwrap_or_else(|| a.base_dir().to_string_lossy().to_string());
        result.push(AgentInfo {
            name: a.name().to_string(),
            detected: a.detect(),
            extension_count: 0,
            path,
            enabled,
            icon_path,
            builtin: true,
            has_custom_path: setting_map
                .get(a.name())
                .and_then(|(custom_path, _, _)| custom_path.as_ref())
                .is_some(),
        });
    }

    for (name, custom_path, enabled, _, icon_path) in settings {
        if builtin_names.contains(&name) {
            continue;
        }
        let adapter_detected = runtime_adapters
            .iter()
            .find(|adapter| adapter.name() == name)
            .map(|adapter| adapter.detect())
            .unwrap_or(false);
        let path = custom_path.unwrap_or_else(|| {
            runtime_adapters
                .iter()
                .find(|adapter| adapter.name() == name)
                .map(|adapter| adapter.base_dir().to_string_lossy().to_string())
                .unwrap_or_default()
        });
        let detected = adapter_detected || (!path.is_empty() && std::path::Path::new(&path).exists());
        result.push(AgentInfo {
            name,
            detected,
            extension_count: 0,
            path,
            enabled,
            icon_path,
            builtin: false,
            has_custom_path: true,
        });
    }

    // Sort by user-defined order; agents without sort_order go to end (index 999)
    result.sort_by_key(|a| *order_map.get(&a.name).unwrap_or(&999));
    Ok(result)
}

#[tauri::command]
pub fn update_agent_path(
    state: State<AppState>,
    name: String,
    path: Option<String>,
) -> Result<(), HkError> {
    let store = state.store.lock();
    store.set_agent_path(&name, path.as_deref())
}

#[tauri::command]
pub fn set_agent_enabled(
    state: State<AppState>,
    name: String,
    enabled: bool,
) -> Result<(), HkError> {
    let store = state.store.lock();
    store.set_agent_enabled(&name, enabled)
}

#[tauri::command]
pub fn update_agent_order(state: State<AppState>, names: Vec<String>) -> Result<(), HkError> {
    let adapters = &*state.adapters;
    let store = state.store.lock();
    let mut valid_names: std::collections::HashSet<String> =
        adapters.iter().map(|a| a.name().to_string()).collect();
    for (name, _, _, _, _) in store.list_agent_settings().unwrap_or_default() {
        valid_names.insert(name);
    }
    if names.iter().any(|n| !valid_names.contains(n)) {
        return Err(HkError::Validation(
            "Invalid agent name in order list".into(),
        ));
    }
    store.set_agent_order(&names)
}

#[tauri::command]
pub fn create_agent(
    state: State<AppState>,
    name: String,
    path: String,
    icon_path: Option<String>,
) -> Result<(), HkError> {
    let adapters = &*state.adapters;
    if adapters.iter().any(|a| a.name() == name) {
        return Err(HkError::Conflict("Agent already exists".into()));
    }
    let store = state.store.lock();
    if store
        .list_agent_settings()
        .unwrap_or_default()
        .iter()
        .any(|(existing_name, _, _, _, _)| existing_name == &name)
    {
        return Err(HkError::Conflict("Agent already exists".into()));
    }
    store.create_agent(&name, &path, icon_path.as_deref())
}

#[tauri::command]
pub fn remove_agent(state: State<AppState>, name: String) -> Result<(), HkError> {
    let adapters = &*state.adapters;
    if adapters.iter().any(|a| a.name() == name) {
        return Err(HkError::Validation(
            "Builtin agents cannot be removed".into(),
        ));
    }
    let store = state.store.lock();
    store.remove_agent(&name)
}

#[tauri::command]
pub fn set_agent_icon_path(
    state: State<AppState>,
    name: String,
    icon_path: Option<String>,
) -> Result<(), HkError> {
    let store = state.store.lock();
    store.set_agent_icon_path(&name, icon_path.as_deref())
}

#[tauri::command]
pub fn list_agent_configs(state: State<AppState>) -> Result<Vec<AgentDetail>, HkError> {
    let store = state.store.lock();

    let projects = store.list_project_tuples();
    let settings = store.list_agent_settings().unwrap_or_default();
    let runtime_adapters = adapter::runtime_adapters_for_settings(&settings);
    let builtin_names: std::collections::HashSet<String> =
        state.adapters.iter().map(|a| a.name().to_string()).collect();

    let mut results = Vec::new();
    for a in &runtime_adapters {
        let detected = a.detect();
        let mut config_files = if detected {
            scanner::scan_agent_configs(a.as_ref(), &projects)
        } else {
            vec![]
        };

        // Merge user-defined custom config paths (skip if path already found by auto-scan)
        let existing_paths: std::collections::HashSet<String> = config_files
            .iter()
            .filter_map(|f| std::path::Path::new(&f.path).canonicalize().ok())
            .map(|p| super::normalize(&p).to_string_lossy().to_string())
            .collect();
        if let Ok(custom_paths) = store.list_custom_config_paths(a.name()) {
            for (id, path, label, category_str, scope_json) in custom_paths {
                let canonical = std::path::Path::new(&path)
                    .canonicalize()
                    .map(|p| super::normalize(&p).to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.clone());
                if existing_paths.contains(&canonical) {
                    continue;
                }
                let category = match category_str.as_str() {
                    "rules" => ConfigCategory::Rules,
                    "memory" => ConfigCategory::Memory,
                    "workflow" => ConfigCategory::Workflow,
                    "ignore" => ConfigCategory::Ignore,
                    _ => ConfigCategory::Settings,
                };
                let scope = scope_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<ConfigScope>(s).ok())
                    .unwrap_or(ConfigScope::Global);
                let p = std::path::Path::new(&path);
                let (size_bytes, modified_at, is_dir, exists) =
                    if let Ok(meta) = std::fs::metadata(p) {
                        let modified = meta.modified().ok().map(|t| {
                            let d = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                            chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                                .unwrap_or_default()
                        });
                        (meta.len(), modified, meta.is_dir(), true)
                    } else {
                        (0, None, false, false)
                    };
                config_files.push(AgentConfigFile {
                    path: path.clone(),
                    agent: a.name().to_string(),
                    category,
                    scope,
                    file_name: p
                        .file_name()
                        .map(|f| f.to_string_lossy().to_string())
                        .unwrap_or_else(|| path.clone()),
                    size_bytes,
                    modified_at,
                    is_dir,
                    exists,
                    custom_id: Some(id),
                    custom_label: Some(label),
                });
            }
        }

        let extensions = store
            .list_extensions(None, Some(a.name()))
            .unwrap_or_default();
        let all = extensions.iter();
        let extension_counts = ExtensionCounts {
            skill: all
                .clone()
                .filter(|e| e.kind == ExtensionKind::Skill)
                .count(),
            mcp: all
                .clone()
                .filter(|e| e.kind == ExtensionKind::Mcp)
                .count(),
            plugin: all
                .clone()
                .filter(|e| e.kind == ExtensionKind::Plugin)
                .count(),
            hook: all
                .clone()
                .filter(|e| e.kind == ExtensionKind::Hook)
                .count(),
            cli: all.filter(|e| e.kind == ExtensionKind::Cli).count(),
        };

        results.push(AgentDetail {
            name: a.name().to_string(),
            detected,
            config_files,
            extension_counts,
        });
    }

    for (name, custom_path, _, _, _) in settings {
        if builtin_names.contains(&name) || runtime_adapters.iter().any(|a| a.name() == name) {
            continue;
        }

        let config_files = custom_config_files_for_agent(&store, &name);
        let detected = custom_path
            .as_deref()
            .map(std::path::Path::new)
            .map(|p| p.exists())
            .unwrap_or(false)
            || config_files.iter().any(|file| file.exists);
        let extensions = store
            .list_extensions(None, Some(&name))
            .unwrap_or_default();
        let extension_counts = ExtensionCounts {
            skill: extensions.iter().filter(|e| e.kind == ExtensionKind::Skill).count(),
            mcp: extensions.iter().filter(|e| e.kind == ExtensionKind::Mcp).count(),
            plugin: extensions.iter().filter(|e| e.kind == ExtensionKind::Plugin).count(),
            hook: extensions.iter().filter(|e| e.kind == ExtensionKind::Hook).count(),
            cli: extensions.iter().filter(|e| e.kind == ExtensionKind::Cli).count(),
        };

        results.push(AgentDetail {
            name,
            detected,
            config_files,
            extension_counts,
        });
    }

    Ok(results)
}
