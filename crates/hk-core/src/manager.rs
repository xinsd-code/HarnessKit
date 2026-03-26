use anyhow::{Context, Result};
use crate::models::{Source, SourceOrigin, UpdateStatus};
use crate::store::Store;
use std::path::Path;
use std::process::Command;

pub struct Manager {
    pub store: Store,
}

impl Manager {
    pub fn new(store: Store) -> Self {
        Self { store }
    }

    pub fn toggle(&self, id: &str, enabled: bool) -> Result<()> {
        self.store.set_enabled(id, enabled)
    }

    pub fn uninstall(&self, id: &str) -> Result<()> {
        self.store.delete_extension(id)
    }

    pub fn update_tags(&self, _id: &str, _tags: Vec<String>) -> Result<()> {
        // v1: tags stored in extension_tags_json, update via store
        // Implementation: read extension, modify tags, write back
        Ok(())
    }
}

/// Check if a git-sourced extension has an update available
pub fn check_update(source: &Source) -> UpdateStatus {
    if source.origin != SourceOrigin::Git {
        return UpdateStatus::Error { message: "Not a git-sourced extension".into() };
    }
    let url = match &source.url {
        Some(u) => u,
        None => return UpdateStatus::Error { message: "No remote URL".into() },
    };
    let local_hash = match &source.commit_hash {
        Some(h) => h,
        None => return UpdateStatus::Error { message: "No local commit hash".into() },
    };

    match get_remote_head(url) {
        Ok(remote_hash) => {
            if remote_hash.starts_with(local_hash) || local_hash.starts_with(&remote_hash) {
                UpdateStatus::UpToDate
            } else {
                UpdateStatus::UpdateAvailable { remote_hash }
            }
        }
        Err(e) => UpdateStatus::Error { message: e.to_string() },
    }
}

fn get_remote_head(url: &str) -> Result<String> {
    let output = Command::new("git")
        .args(["ls-remote", "--heads", url])
        .output()
        .context("Failed to run git ls-remote")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("git ls-remote failed: {}", stderr.trim());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // First line typically has the main/master branch hash
    // Format: "<hash>\trefs/heads/<branch>"
    // Prefer main, then master, then first entry
    let lines: Vec<&str> = stdout.lines().collect();
    for suffix in &["refs/heads/main", "refs/heads/master"] {
        if let Some(line) = lines.iter().find(|l| l.ends_with(suffix)) {
            if let Some(hash) = line.split_whitespace().next() {
                return Ok(hash.to_string());
            }
        }
    }
    // Fallback to first entry
    if let Some(first) = lines.first() {
        if let Some(hash) = first.split_whitespace().next() {
            return Ok(hash.to_string());
        }
    }
    anyhow::bail!("No refs found for remote")
}

/// Install a skill from a git URL by cloning and copying to the skills directory
pub fn install_from_git(url: &str, target_dir: &Path) -> Result<String> {
    let temp = tempfile::tempdir().context("Failed to create temp directory")?;
    let clone_dir = temp.path().join("repo");

    let output = Command::new("git")
        .args(["clone", "--depth", "1", url, &clone_dir.to_string_lossy()])
        .output()
        .context("Failed to run git clone")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("git clone failed: {}", stderr.trim());
    }

    // Look for a SKILL.md in the root or immediate subdirectories
    let skill_name = if clone_dir.join("SKILL.md").exists() {
        // The repo itself is a skill
        let name = crate::scanner::parse_skill_name(&clone_dir.join("SKILL.md"))
            .unwrap_or_else(|| repo_name_from_url(url));
        let dest = target_dir.join(&name);
        copy_dir_contents(&clone_dir, &dest)?;
        name
    } else {
        // Search for SKILL.md in subdirectories
        let mut found_name = None;
        if let Ok(entries) = std::fs::read_dir(&clone_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() && p.join("SKILL.md").exists() {
                    let name = crate::scanner::parse_skill_name(&p.join("SKILL.md"))
                        .unwrap_or_else(|| p.file_name().unwrap_or_default().to_string_lossy().to_string());
                    let dest = target_dir.join(&name);
                    copy_dir_contents(&p, &dest)?;
                    found_name = Some(name);
                    break;
                }
            }
        }
        found_name.ok_or_else(|| anyhow::anyhow!("No SKILL.md found in repository"))?
    };

    Ok(skill_name)
}

fn repo_name_from_url(url: &str) -> String {
    url.rsplit('/')
        .next()
        .unwrap_or("unknown")
        .strip_suffix(".git")
        .unwrap_or(url.rsplit('/').next().unwrap_or("unknown"))
        .to_string()
}

fn copy_dir_contents(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            if entry.file_name() == ".git" { continue; }
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;
    use tempfile::TempDir;

    #[test]
    fn test_toggle_extension() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let store = crate::store::Store::open(&db_path).unwrap();
        let ext = Extension {
            id: uuid::Uuid::new_v4().to_string(),
            kind: ExtensionKind::Skill,
            name: "test".into(),
            description: "".into(),
            source: Source { origin: SourceOrigin::Local, url: None, version: None, commit_hash: None },
            agents: vec!["claude".into()],
            tags: vec![],
            category: None,
            permissions: vec![],
            enabled: true,
            trust_score: None,
            installed_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        store.insert_extension(&ext).unwrap();

        let manager = Manager::new(store);
        manager.toggle(&ext.id, false).unwrap();
        let fetched = manager.store.get_extension(&ext.id).unwrap().unwrap();
        assert!(!fetched.enabled);
    }

    #[test]
    fn test_uninstall_extension() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let store = crate::store::Store::open(&db_path).unwrap();
        let ext = Extension {
            id: uuid::Uuid::new_v4().to_string(),
            kind: ExtensionKind::Skill,
            name: "to-delete".into(),
            description: "".into(),
            source: Source { origin: SourceOrigin::Local, url: None, version: None, commit_hash: None },
            agents: vec!["claude".into()],
            tags: vec![],
            category: None,
            permissions: vec![],
            enabled: true,
            trust_score: None,
            installed_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        store.insert_extension(&ext).unwrap();

        let manager = Manager::new(store);
        manager.uninstall(&ext.id).unwrap();
        assert!(manager.store.get_extension(&ext.id).unwrap().is_none());
    }
}
