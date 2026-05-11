pub mod agents;
pub mod audit;
pub mod extensions;
mod helpers;
pub mod hub;
pub mod install;
pub mod marketplace;
pub mod projects;
pub mod settings;

// Re-export shared types that appear in Tauri command signatures.
// The Tauri proc macro requires these types to be publicly reachable.
#[allow(unused_imports)]
pub use helpers::{FileEntry, list_dir_entries};

// Re-export all commands at top level so main.rs doesn't need to change
pub use agents::*;
pub use audit::*;
pub use extensions::*;
pub use hub::*;
pub use install::*;
pub use marketplace::*;
pub use projects::*;
pub use settings::*;

use hk_core::adapter;
use hk_core::store::Store;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

pub struct PendingClone {
    pub _temp_dir: tempfile::TempDir,
    pub clone_dir: std::path::PathBuf,
    pub url: String,
    pub created_at: std::time::Instant,
}

pub struct AppState {
    pub store: Arc<Mutex<Store>>,
    pub adapters: Arc<Vec<Box<dyn adapter::AgentAdapter>>>,
    pub pending_clones: Arc<Mutex<HashMap<String, PendingClone>>>,
}

impl AppState {
    /// Build the full runtime adapter list including preset agents from the DB.
    pub fn runtime_adapters(&self) -> Vec<Box<dyn adapter::AgentAdapter>> {
        let settings = self
            .store
            .lock()
            .list_agent_settings()
            .unwrap_or_default();
        adapter::runtime_adapters_for_settings(&settings)
    }
}
