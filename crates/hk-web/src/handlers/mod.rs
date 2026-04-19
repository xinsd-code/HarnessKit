pub mod agents;
pub mod audit;
pub mod extensions;
pub mod install;
pub mod marketplace;
pub mod projects;
pub mod settings;

use hk_core::store::Store;
use std::path::Path;

/// Check if a canonical path is within the home directory or any registered project path.
pub(crate) fn is_path_allowed(canonical: &Path, store: &Store) -> bool {
    if let Some(home) = dirs::home_dir() {
        if canonical.starts_with(&home) {
            return true;
        }
    }
    if let Ok(projects) = store.list_projects() {
        for p in &projects {
            let proj_path = Path::new(&p.path);
            if canonical.starts_with(proj_path) {
                return true;
            }
        }
    }
    false
}
