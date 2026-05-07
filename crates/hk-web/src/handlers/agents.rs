use axum::extract::State;
use axum::Json;
use hk_core::adapter;
use hk_core::models::{AgentDetail, AgentInfo, ExtensionCounts, ExtensionKind, AgentConfigFile, ConfigCategory, ConfigScope};
use hk_core::scanner;
use serde::Deserialize;

use crate::router::{blocking, ApiError};
use crate::state::WebState;

type Result<T> = std::result::Result<Json<T>, ApiError>;

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
                file_name: p.file_name()
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

/// Resolve `~` and validate custom config paths (mirrors desktop logic).
fn resolve_and_validate_config_path(
    path: &str,
    store: &hk_core::store::Store,
) -> std::result::Result<String, hk_core::HkError> {
    let resolved = if path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&path[2..]).to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    };
    if resolved.contains("..") {
        return Err(hk_core::HkError::PathNotAllowed(
            "Config paths cannot contain '..' components".into(),
        ));
    }
    let resolved_path = std::path::Path::new(&resolved);
    if !super::is_path_allowed(resolved_path, store) {
        return Err(hk_core::HkError::PathNotAllowed(
            "Custom config paths must be within your home directory or a registered project".into(),
        ));
    }
    let home = dirs::home_dir().unwrap_or_default();
    if resolved_path == home {
        return Err(hk_core::HkError::Validation(
            "Cannot use home directory itself as a config path".into(),
        ));
    }
    Ok(resolved)
}

pub async fn list_agents(
    State(state): State<WebState>,
) -> Result<Vec<AgentInfo>> {
    blocking(move || {
        let store = state.store.lock();
        let settings = store.list_agent_settings().unwrap_or_default();
        let runtime_adapters = adapter::runtime_adapters_for_settings(&settings);
        let db_order = store.get_agent_order().unwrap_or_default();
        let order_map: std::collections::HashMap<String, i32> = db_order.into_iter().collect();
        let setting_map: std::collections::HashMap<String, (Option<String>, bool, Option<String>)> =
            settings
                .iter()
                .map(|(name, path, enabled, _, icon_path)| {
                    (name.clone(), (path.clone(), *enabled, icon_path.clone()))
                })
                .collect();
        let builtin_names: std::collections::HashSet<String> =
            state.adapters.iter().map(|a| a.name().to_string()).collect();
        let mut result = Vec::new();
        for a in state.adapters.iter() {
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
            let detected = adapter_detected
                || (!path.is_empty() && std::path::Path::new(&path).exists());
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
        result.sort_by_key(|a| *order_map.get(&a.name).unwrap_or(&999));
        Ok(result)
    }).await
}

#[derive(Deserialize)]
pub struct SetAgentEnabledParams {
    pub name: String,
    pub enabled: bool,
}

pub async fn set_agent_enabled(
    State(state): State<WebState>,
    Json(params): Json<SetAgentEnabledParams>,
) -> Result<()> {
    blocking(move || {
        let store = state.store.lock();
        store.set_agent_enabled(&params.name, params.enabled)?;
        Ok(())
    }).await
}

#[derive(Deserialize)]
pub struct UpdateAgentOrderParams {
    pub names: Vec<String>,
}

pub async fn update_agent_order(
    State(state): State<WebState>,
    Json(params): Json<UpdateAgentOrderParams>,
) -> Result<()> {
    blocking(move || {
        let store = state.store.lock();
        let mut valid_names: std::collections::HashSet<String> =
            state.adapters.iter().map(|a| a.name().to_string()).collect();
        for (name, _, _, _, _) in store.list_agent_settings().unwrap_or_default() {
            valid_names.insert(name);
        }
        if params.names.iter().any(|n| !valid_names.contains(n)) {
            return Err(hk_core::HkError::Validation(
                "Invalid agent name in order list".into(),
            ));
        }
        store.set_agent_order(&params.names)?;
        Ok(())
    }).await
}

#[derive(Deserialize)]
pub struct UpdateAgentPathParams {
    pub name: String,
    pub path: Option<String>,
}

pub async fn update_agent_path(
    State(state): State<WebState>,
    Json(params): Json<UpdateAgentPathParams>,
) -> Result<()> {
    blocking(move || {
        let store = state.store.lock();
        store.set_agent_path(&params.name, params.path.as_deref())?;
        Ok(())
    }).await
}

#[derive(Deserialize)]
pub struct CreateAgentParams {
    pub name: String,
    pub path: String,
    pub icon_path: Option<String>,
}

pub async fn create_agent(
    State(state): State<WebState>,
    Json(params): Json<CreateAgentParams>,
) -> Result<()> {
    blocking(move || {
        if state.adapters.iter().any(|a| a.name() == params.name) {
            return Err(hk_core::HkError::Conflict("Agent already exists".into()));
        }
        let store = state.store.lock();
        if store
            .list_agent_settings()
            .unwrap_or_default()
            .iter()
            .any(|(existing_name, _, _, _, _)| existing_name == &params.name)
        {
            return Err(hk_core::HkError::Conflict("Agent already exists".into()));
        }
        store.create_agent(&params.name, &params.path, params.icon_path.as_deref())?;
        Ok(())
    }).await
}

#[derive(Deserialize)]
pub struct RemoveAgentParams {
    pub name: String,
}

pub async fn remove_agent(
    State(state): State<WebState>,
    Json(params): Json<RemoveAgentParams>,
) -> Result<()> {
    blocking(move || {
        if state.adapters.iter().any(|a| a.name() == params.name) {
            return Err(hk_core::HkError::Validation(
                "Builtin agents cannot be removed".into(),
            ));
        }
        let store = state.store.lock();
        store.remove_agent(&params.name)?;
        Ok(())
    }).await
}

#[derive(Deserialize)]
pub struct SetAgentIconPathParams {
    pub name: String,
    pub icon_path: Option<String>,
}

pub async fn set_agent_icon_path(
    State(state): State<WebState>,
    Json(params): Json<SetAgentIconPathParams>,
) -> Result<()> {
    blocking(move || {
        let store = state.store.lock();
        store.set_agent_icon_path(&params.name, params.icon_path.as_deref())?;
        Ok(())
    }).await
}

pub async fn list_agent_configs(
    State(state): State<WebState>,
) -> Result<Vec<AgentDetail>> {
    blocking(move || {
        let store = state.store.lock();
        let projects = store.list_project_tuples();
        let settings = store.list_agent_settings().unwrap_or_default();
        let runtime_adapters = adapter::runtime_adapters_for_settings(&settings);
        let builtin_names: std::collections::HashSet<String> =
            state.adapters.iter().map(|a| a.name().to_string()).collect();

        let mut results = Vec::new();
        for a in &runtime_adapters {
            let detected_by_runtime = a.detect();
            let mut config_files = scanner::scan_agent_configs(a.as_ref(), &projects);

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
                        file_name: p.file_name()
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

            let extensions = store.list_extensions(None, Some(a.name())).unwrap_or_default();
            let extension_counts = ExtensionCounts {
                skill: extensions.iter().filter(|e| e.kind == ExtensionKind::Skill).count(),
                mcp: extensions.iter().filter(|e| e.kind == ExtensionKind::Mcp).count(),
                plugin: extensions.iter().filter(|e| e.kind == ExtensionKind::Plugin).count(),
                hook: extensions.iter().filter(|e| e.kind == ExtensionKind::Hook).count(),
                cli: extensions.iter().filter(|e| e.kind == ExtensionKind::Cli).count(),
            };
            let detected = detected_by_runtime || config_files.iter().any(|file| file.exists);

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
            let extensions = store.list_extensions(None, Some(&name)).unwrap_or_default();
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
    }).await
}

#[derive(Deserialize)]
pub struct AddCustomConfigPathParams {
    pub agent: String,
    pub path: String,
    pub label: String,
    pub category: String,
    pub target_scope: ConfigScope,
}

pub async fn add_custom_config_path(
    State(state): State<WebState>,
    Json(params): Json<AddCustomConfigPathParams>,
) -> Result<i64> {
    blocking(move || {
        let store = state.store.lock();
        let resolved = resolve_and_validate_config_path(&params.path, &store)?;
        let scope_json = serde_json::to_string(&params.target_scope).ok();
        store.add_custom_config_path(
            &params.agent,
            &resolved,
            &params.label,
            &params.category,
            scope_json.as_deref(),
        )
    }).await
}

#[derive(Deserialize)]
pub struct UpdateCustomConfigPathParams {
    pub id: i64,
    pub path: String,
    pub label: String,
    pub category: String,
}

pub async fn update_custom_config_path(
    State(state): State<WebState>,
    Json(params): Json<UpdateCustomConfigPathParams>,
) -> Result<()> {
    blocking(move || {
        let store = state.store.lock();
        let resolved = resolve_and_validate_config_path(&params.path, &store)?;
        store.update_custom_config_path(params.id, &resolved, &params.label, &params.category)?;
        Ok(())
    }).await
}

#[derive(Deserialize)]
pub struct RemoveCustomConfigPathParams {
    pub id: i64,
}

pub async fn remove_custom_config_path(
    State(state): State<WebState>,
    Json(params): Json<RemoveCustomConfigPathParams>,
) -> Result<()> {
    blocking(move || {
        let store = state.store.lock();
        store.remove_custom_config_path(params.id)?;
        Ok(())
    }).await
}
