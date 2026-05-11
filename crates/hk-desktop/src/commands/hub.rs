use super::AppState;
use hk_core::{models::*, scanner, service};
use tauri::State;

/// List all extensions in the Local Hub
#[tauri::command]
pub fn list_hub_extensions() -> Result<Vec<Extension>, String> {
    service::list_hub_extensions().map_err(|e| e.to_string())
}

/// Backup an extension to the Local Hub
#[tauri::command]
pub async fn backup_to_hub(
    state: State<'_, AppState>,
    extension_id: String,
) -> Result<(), String> {
    let store = state.store.clone();
    let adapters = state.runtime_adapters();
    // Get projects from store
    let projects: Vec<(String, String)> = {
        let store_guard = store.lock();
        store_guard
            .list_projects()
            .unwrap_or_default()
            .into_iter()
            .map(|p| (p.name, p.path))
            .collect()
    };
    tauri::async_runtime::spawn_blocking(move || {
        service::backup_to_hub(&store, &adapters, &projects, &extension_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Install an extension from Local Hub to an agent
#[tauri::command]
pub async fn install_from_hub(
    state: State<'_, AppState>,
    extension_id: String,
    target_agent: String,
    scope: ConfigScope,
    force: bool,
) -> Result<Vec<Extension>, String> {
    let store = state.store.clone();
    let adapters = state.runtime_adapters();
    tauri::async_runtime::spawn_blocking(move || {
        service::install_from_hub(&store, &adapters, &extension_id, &target_agent, &scope, force)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Delete an extension from the Local Hub
#[tauri::command]
pub fn delete_from_hub(extension_id: String) -> Result<(), String> {
    service::delete_from_hub(&extension_id).map_err(|e| e.to_string())
}

/// Import an extension from a local path to the Local Hub
#[tauri::command]
pub fn import_to_hub(
    source_path: String,
    kind: String,
) -> Result<Extension, String> {
    let kind = kind.parse::<ExtensionKind>().map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&source_path);
    service::import_to_hub(path, kind).map_err(|e| e.to_string())
}

/// Check if installing from hub would conflict with existing extension
#[tauri::command]
pub fn check_hub_install_conflict(
    state: State<AppState>,
    extension_id: String,
    target_agent: String,
    scope: ConfigScope,
) -> Option<Extension> {
    service::check_hub_install_conflict(
        &state.store,
        &extension_id,
        &target_agent,
        &scope,
    )
}

/// Get the Local Hub directory path
#[tauri::command]
pub fn get_hub_path() -> String {
    scanner::get_hub_path().to_string_lossy().to_string()
}

/// Get extension content from Local Hub
#[tauri::command]
pub fn get_hub_extension_content(extension_id: String) -> Result<service::ExtensionContent, String> {
    let hub_extensions = scanner::scan_local_hub();
    let hub_ext = hub_extensions
        .iter()
        .find(|e| e.id == extension_id)
        .ok_or_else(|| "Extension not found in Local Hub".to_string())?;

    let hub_path = scanner::get_hub_path();
    let source_path = match hub_ext.kind {
        ExtensionKind::Skill => hub_path.join("skills").join(&hub_ext.name),
        ExtensionKind::Mcp => hub_path.join("mcp").join(&hub_ext.name),
        ExtensionKind::Plugin => hub_path.join("plugins").join(&hub_ext.name),
        ExtensionKind::Cli => hub_path.join("clis").join(&hub_ext.name),
        ExtensionKind::Hook => return Err("Hooks are not supported in Hub".to_string()),
    };

    // Read skill content if available
    let skill_file = source_path.join("SKILL.md");
    let content = if skill_file.exists() {
        std::fs::read_to_string(&skill_file).unwrap_or_default()
    } else {
        String::new()
    };

    Ok(service::ExtensionContent {
        content,
        path: Some(source_path.to_string_lossy().to_string()),
        symlink_target: None,
    })
}

/// Preview sync from all agents/projects to Local Hub
/// Returns (new extensions, conflicts with existing hub extensions)
#[tauri::command]
pub fn preview_sync_to_hub(state: State<AppState>) -> Result<service::SyncPreview, String> {
    let projects: Vec<(String, String)> = {
        let store_guard = state.store.lock();
        store_guard
            .list_projects()
            .unwrap_or_default()
            .into_iter()
            .map(|p| (p.name, p.path))
            .collect()
    };
    let adapters = state.runtime_adapters();
    service::preview_sync_to_hub(&state.store, &adapters, &projects).map_err(|e| e.to_string())
}

/// Sync specific extensions to Hub (after user confirms conflicts)
#[tauri::command]
pub async fn sync_extensions_to_hub(
    state: State<'_, AppState>,
    extension_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let store = state.store.clone();
    let adapters = state.runtime_adapters();
    // Get projects from store
    let projects: Vec<(String, String)> = {
        let store_guard = store.lock();
        store_guard
            .list_projects()
            .unwrap_or_default()
            .into_iter()
            .map(|p| (p.name, p.path))
            .collect()
    };
    tauri::async_runtime::spawn_blocking(move || {
        service::sync_extensions_to_hub(&store, &adapters, &projects, &extension_ids)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
