use axum::extract::State;
use axum::Json;
use hk_core::models::Extension;
use hk_core::{deployer, manager, marketplace, sanitize, scanner};
use serde::Deserialize;

use crate::router::ApiError;
use crate::state::WebState;

type Result<T> = std::result::Result<Json<T>, ApiError>;

#[derive(Deserialize)]
pub struct InstallFromGitParams {
    pub url: String,
    pub target_agent: Option<String>,
    pub skill_id: Option<String>,
}

pub async fn install_from_git(
    State(state): State<WebState>,
    Json(params): Json<InstallFromGitParams>,
) -> Result<manager::InstallResult> {
    sanitize::validate_git_url(&params.url)
        .map_err(|e| ApiError::from(hk_core::HkError::Validation(e.to_string())))?;

    let target_agent = params.target_agent.unwrap_or_else(|| {
        state.adapters
            .iter()
            .find(|a| a.detect())
            .map(|a| a.name().to_string())
            .unwrap_or_else(|| "claude".to_string())
    });

    let target_dir = state.adapters
        .iter()
        .find(|a| a.name() == target_agent)
        .map(|a| a.skill_dirs().into_iter().next().unwrap_or_default())
        .unwrap_or_default();

    let result = tokio::task::spawn_blocking(move || {
        manager::install_from_git_with_id(
            &params.url,
            &target_dir,
            params.skill_id.as_deref(),
        )
    })
    .await
    .map_err(|e| ApiError::from(hk_core::HkError::Internal(e.to_string())))??;

    let scanned = scanner::scan_all(&state.adapters);
    let store = state.store.lock();
    store.sync_extensions(&scanned)?;

    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct InstallFromMarketplaceParams {
    pub source: String,
    pub skill_id: String,
    pub target_agent: Option<String>,
}

pub async fn install_from_marketplace(
    State(state): State<WebState>,
    Json(params): Json<InstallFromMarketplaceParams>,
) -> Result<manager::InstallResult> {
    let url = marketplace::git_url_for_source(&params.source);
    let adapters = state.adapters.clone();

    let target_agent = params.target_agent.unwrap_or_else(|| {
        adapters
            .iter()
            .find(|a| a.detect())
            .map(|a| a.name().to_string())
            .unwrap_or_else(|| "claude".to_string())
    });

    let target_dir = adapters
        .iter()
        .find(|a| a.name() == target_agent)
        .map(|a| a.skill_dirs().into_iter().next().unwrap_or_default())
        .unwrap_or_default();

    let skill_id = params.skill_id.clone();
    let result = tokio::task::spawn_blocking(move || {
        manager::install_from_git_with_id(&url, &target_dir, Some(&skill_id))
    })
    .await
    .map_err(|e| ApiError::from(hk_core::HkError::Internal(e.to_string())))??;

    let scanned = scanner::scan_all(&state.adapters);
    let store_guard = state.store.lock();
    store_guard.sync_extensions(&scanned)?;

    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct InstallFromLocalParams {
    pub path: String,
    pub target_agents: Vec<String>,
}

pub async fn install_from_local(
    State(state): State<WebState>,
    Json(params): Json<InstallFromLocalParams>,
) -> Result<manager::InstallResult> {
    let source_path = std::path::PathBuf::from(&params.path);

    let first_agent = params.target_agents.first().cloned().unwrap_or_else(|| {
        state.adapters.iter().find(|a| a.detect())
            .map(|a| a.name().to_string())
            .unwrap_or_else(|| "claude".to_string())
    });

    let target_dir = state.adapters.iter()
        .find(|a| a.name() == first_agent)
        .map(|a| a.skill_dirs().into_iter().next().unwrap_or_default())
        .unwrap_or_default();

    let deployed_name = deployer::deploy_skill(&source_path, &target_dir)?;

    let scanned = scanner::scan_all(&state.adapters);
    let store = state.store.lock();
    store.sync_extensions(&scanned)?;

    Ok(Json(manager::InstallResult {
        name: deployed_name,
        was_update: false,
        revision: None,
        skipped: false,
    }))
}

#[derive(Deserialize)]
pub struct InstallToAgentParams {
    pub extension_id: String,
    pub target_agent: String,
}

pub async fn install_to_agent(
    State(state): State<WebState>,
    Json(params): Json<InstallToAgentParams>,
) -> Result<String> {
    let (ext_name, ext_kind_str) = {
        let store = state.store.lock();
        let ext = store.get_extension(&params.extension_id)?
            .ok_or_else(|| hk_core::HkError::NotFound("Extension not found".into()))?;

        let adapter = state.adapters.iter()
            .find(|a| a.name() == params.target_agent)
            .ok_or_else(|| hk_core::HkError::NotFound(
                format!("Agent '{}' not found", params.target_agent),
            ))?;

        match ext.kind {
            hk_core::models::ExtensionKind::Skill => {
                let source = std::path::PathBuf::from(
                    ext.source_path.as_deref().unwrap_or_default(),
                );
                let target_dir = adapter.skill_dirs().into_iter().next().unwrap_or_default();
                deployer::deploy_skill(&source, &target_dir)?;
            }
            _ => {
                return Err(ApiError::from(hk_core::HkError::Validation(
                    "Only skill deployment to other agents is supported in web mode".into(),
                )));
            }
        };

        (ext.name.clone(), ext.kind.as_str().to_string())
    };

    let scanned = scanner::scan_all(&state.adapters);
    let store = state.store.lock();
    store.sync_extensions(&scanned)?;

    let new_id = scanner::stable_id_for(&ext_name, &ext_kind_str, &params.target_agent);
    Ok(Json(new_id))
}

#[derive(Deserialize)]
pub struct UpdateExtensionParams {
    pub id: String,
}

pub async fn update_extension(
    State(state): State<WebState>,
    Json(params): Json<UpdateExtensionParams>,
) -> Result<manager::InstallResult> {
    let (url_owned, target_dir, skill_id) = {
        let store = state.store.lock();
        let ext = store.get_extension(&params.id)?
            .ok_or_else(|| hk_core::HkError::NotFound("Extension not found".into()))?;
        let meta = ext.install_meta.as_ref()
            .ok_or_else(|| hk_core::HkError::Validation("No install metadata".into()))?;
        let url = meta.url.as_deref()
            .or(meta.url_resolved.as_deref())
            .ok_or_else(|| hk_core::HkError::Validation("No source URL".into()))?
            .to_string();
        let target_dir = ext.source_path.as_ref()
            .and_then(|p| std::path::Path::new(p).parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_default();
        let skill_id = meta.subpath.clone();
        (url, target_dir, skill_id)
    };

    let result = tokio::task::spawn_blocking(move || {
        manager::install_from_git_with_id(&url_owned, &target_dir, skill_id.as_deref())
    })
    .await
    .map_err(|e| ApiError::from(hk_core::HkError::Internal(e.to_string())))??;

    let scanned = scanner::scan_all(&state.adapters);
    let store = state.store.lock();
    store.sync_extensions(&scanned)?;

    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct GetCliWithChildrenParams {
    pub cli_id: String,
}

pub async fn get_cli_with_children(
    State(state): State<WebState>,
    Json(params): Json<GetCliWithChildrenParams>,
) -> Result<(Extension, Vec<Extension>)> {
    let store = state.store.lock();
    let cli = store.get_extension(&params.cli_id)?
        .ok_or_else(|| hk_core::HkError::NotFound("CLI extension not found".into()))?;
    let children = store.get_child_skills(&params.cli_id)?;
    Ok(Json((cli, children)))
}

pub async fn check_updates(
    State(state): State<WebState>,
) -> Result<hk_core::models::CheckUpdatesResult> {
    let store = state.store.clone();

    let result = tokio::task::spawn_blocking(move || {
        let store = store.lock();
        let exts = store.list_extensions(None, None)?;
        let mut statuses = Vec::new();
        let mut cache = std::collections::HashMap::new();

        for ext in &exts {
            if let Some(meta) = &ext.install_meta {
                let status = manager::check_update_with_cache(meta, &mut cache);
                statuses.push((ext.id.clone(), status));
            }
        }

        Ok::<_, hk_core::HkError>(hk_core::models::CheckUpdatesResult {
            statuses,
            new_skills: Vec::new(),
        })
    })
    .await
    .map_err(|e| ApiError::from(hk_core::HkError::Internal(e.to_string())))??;

    Ok(Json(result))
}

pub async fn get_cached_update_statuses(
    State(state): State<WebState>,
) -> Result<Vec<(String, hk_core::models::UpdateStatus)>> {
    let store = state.store.lock();
    let exts = store.list_extensions(None, None)?;
    let mut statuses = Vec::new();
    for ext in &exts {
        if let Some(meta) = &ext.install_meta {
            let status = manager::check_update(meta);
            statuses.push((ext.id.clone(), status));
        }
    }
    Ok(Json(statuses))
}

#[derive(Deserialize)]
pub struct GetSkillLocationsParams {
    pub name: String,
}

pub async fn get_skill_locations(
    State(state): State<WebState>,
    Json(params): Json<GetSkillLocationsParams>,
) -> Result<Vec<(String, String, Option<String>)>> {
    let locations = scanner::skill_locations(&params.name, &state.adapters);
    let result: Vec<(String, String, Option<String>)> = locations
        .into_iter()
        .map(|(agent, path)| {
            let symlink = std::fs::read_link(&path)
                .ok()
                .map(|t| t.to_string_lossy().to_string());
            (agent, path.to_string_lossy().to_string(), symlink)
        })
        .collect();
    Ok(Json(result))
}
