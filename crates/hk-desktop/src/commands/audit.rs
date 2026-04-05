use super::AppState;
use hk_core::{HkError, models::*, service};
use tauri::State;

#[tauri::command]
pub fn list_audit_results(state: State<AppState>) -> Result<Vec<AuditResult>, HkError> {
    let store = state.store.lock();
    store.list_latest_audit_results()
}

#[tauri::command]
pub fn run_audit(state: State<AppState>) -> Result<Vec<AuditResult>, HkError> {
    let store = state.store.lock();
    service::run_full_audit(&store, &state.adapters)
}
