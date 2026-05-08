use axum::extract::State;
use axum::Json;
use hk_core::{models::*, scanner, service};
use serde::Deserialize;

use crate::router::{blocking, ApiError};
use crate::state::WebState;

type Result<T> = std::result::Result<Json<T>, ApiError>;

#[derive(Deserialize)]
pub struct ExtensionIdParams {
    pub extension_id: String,
}

#[derive(Deserialize)]
pub struct ImportToHubParams {
    pub source_path: String,
    pub kind: String,
}

#[derive(Deserialize)]
pub struct InstallFromHubParams {
    pub extension_id: String,
    pub target_agent: String,
    pub scope: ConfigScope,
    pub force: bool,
}

#[derive(Deserialize)]
pub struct CheckHubConflictParams {
    pub extension_id: String,
    pub target_agent: String,
}

#[derive(Deserialize)]
pub struct SyncExtensionsParams {
    pub extension_ids: Vec<String>,
}

pub async fn list_hub_extensions() -> Result<Vec<Extension>> {
    blocking(service::list_hub_extensions).await
}

pub async fn backup_to_hub(
    State(state): State<WebState>,
    Json(params): Json<ExtensionIdParams>,
) -> Result<()> {
    blocking(move || {
        let projects: Vec<(String, String)> = {
            let store_guard = state.store.lock();
            store_guard
                .list_projects()
                .unwrap_or_default()
                .into_iter()
                .map(|p| (p.name, p.path))
                .collect()
        };
        service::backup_to_hub(&state.store, &state.adapters, &projects, &params.extension_id)
    })
    .await
}

pub async fn install_from_hub(
    State(state): State<WebState>,
    Json(params): Json<InstallFromHubParams>,
) -> Result<Vec<Extension>> {
    blocking(move || {
        service::install_from_hub(
            &state.store,
            &state.adapters,
            &params.extension_id,
            &params.target_agent,
            &params.scope,
            params.force,
        )
    })
    .await
}

pub async fn delete_from_hub(
    Json(params): Json<ExtensionIdParams>,
) -> Result<()> {
    blocking(move || service::delete_from_hub(&params.extension_id)).await
}

pub async fn import_to_hub(
    Json(params): Json<ImportToHubParams>,
) -> Result<Extension> {
    blocking(move || {
        let kind = params
            .kind
            .parse::<ExtensionKind>()
            .map_err(|e| hk_core::HkError::Validation(e.to_string()))?;
        let path = std::path::Path::new(&params.source_path);
        service::import_to_hub(path, kind)
    })
    .await
}

pub async fn check_hub_install_conflict(
    State(state): State<WebState>,
    Json(params): Json<CheckHubConflictParams>,
) -> Result<Option<Extension>> {
    blocking(move || {
        Ok(service::check_hub_install_conflict(
            &state.store,
            &params.extension_id,
            &params.target_agent,
        ))
    })
    .await
}

pub async fn get_hub_path() -> Result<String> {
    blocking(|| Ok(scanner::get_hub_path().to_string_lossy().to_string())).await
}

pub async fn get_hub_extension_content(
    Json(params): Json<ExtensionIdParams>,
) -> Result<service::ExtensionContent> {
    blocking(move || {
        let hub_extensions = scanner::scan_local_hub();
        let hub_ext = hub_extensions
            .iter()
            .find(|e| e.id == params.extension_id)
            .ok_or_else(|| hk_core::HkError::NotFound("Extension not found in Local Hub".into()))?;

        let hub_path = scanner::get_hub_path();
        let source_path = match hub_ext.kind {
            ExtensionKind::Skill => hub_path.join("skills").join(&hub_ext.name),
            ExtensionKind::Mcp => hub_path.join("mcp").join(&hub_ext.name),
            ExtensionKind::Plugin => hub_path.join("plugins").join(&hub_ext.name),
            ExtensionKind::Cli => hub_path.join("clis").join(&hub_ext.name),
            ExtensionKind::Hook => {
                return Err(hk_core::HkError::Validation(
                    "Hooks are not supported in Hub".into(),
                ));
            }
        };

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
    })
    .await
}

pub async fn preview_sync_to_hub(
    State(state): State<WebState>,
) -> Result<service::SyncPreview> {
    blocking(move || {
        let projects: Vec<(String, String)> = {
            let store_guard = state.store.lock();
            store_guard
                .list_projects()
                .unwrap_or_default()
                .into_iter()
                .map(|p| (p.name, p.path))
                .collect()
        };
        service::preview_sync_to_hub(&state.store, &state.adapters, &projects)
    })
    .await
}

pub async fn sync_extensions_to_hub(
    State(state): State<WebState>,
    Json(params): Json<SyncExtensionsParams>,
) -> Result<Vec<String>> {
    blocking(move || {
        let projects: Vec<(String, String)> = {
            let store_guard = state.store.lock();
            store_guard
                .list_projects()
                .unwrap_or_default()
                .into_iter()
                .map(|p| (p.name, p.path))
                .collect()
        };
        service::sync_extensions_to_hub(
            &state.store,
            &state.adapters,
            &projects,
            &params.extension_ids,
        )
    })
    .await
}
