use anyhow::{Context, Result};
use std::path::Path;

pub fn deploy_skill(source_path: &Path, target_skill_dir: &Path) -> Result<String> {
    std::fs::create_dir_all(target_skill_dir)?;
    if source_path.is_dir() {
        let dir_name = source_path.file_name().context("Invalid source path")?.to_string_lossy().to_string();
        let dest = target_skill_dir.join(&dir_name);
        copy_dir_recursive(source_path, &dest)?;
        Ok(dir_name)
    } else {
        let file_name = source_path.file_name().context("Invalid source path")?.to_string_lossy().to_string();
        let dest = target_skill_dir.join(&file_name);
        std::fs::copy(source_path, &dest)?;
        Ok(file_name)
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            if entry.file_name() == ".git" { continue; }
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_deploy_skill_directory() {
        let src_dir = TempDir::new().unwrap();
        let skill_dir = src_dir.path().join("my-skill");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "# My Skill").unwrap();
        std::fs::write(skill_dir.join("helper.py"), "print('hello')").unwrap();

        let target_dir = TempDir::new().unwrap();
        let name = deploy_skill(&skill_dir, target_dir.path()).unwrap();
        assert_eq!(name, "my-skill");
        assert!(target_dir.path().join("my-skill").join("SKILL.md").exists());
        assert!(target_dir.path().join("my-skill").join("helper.py").exists());
    }

    #[test]
    fn test_deploy_skill_file() {
        let src_dir = TempDir::new().unwrap();
        let skill_file = src_dir.path().join("solo-skill.md");
        std::fs::write(&skill_file, "# Solo Skill").unwrap();

        let target_dir = TempDir::new().unwrap();
        let name = deploy_skill(&skill_file, target_dir.path()).unwrap();
        assert_eq!(name, "solo-skill.md");
        assert!(target_dir.path().join("solo-skill.md").exists());
    }

    #[test]
    fn test_deploy_skill_skips_git_dir() {
        let src_dir = TempDir::new().unwrap();
        let skill_dir = src_dir.path().join("git-skill");
        std::fs::create_dir_all(skill_dir.join(".git")).unwrap();
        std::fs::write(skill_dir.join(".git").join("HEAD"), "ref: refs/heads/main").unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "# Git Skill").unwrap();

        let target_dir = TempDir::new().unwrap();
        deploy_skill(&skill_dir, target_dir.path()).unwrap();
        assert!(target_dir.path().join("git-skill").join("SKILL.md").exists());
        assert!(!target_dir.path().join("git-skill").join(".git").exists());
    }
}
