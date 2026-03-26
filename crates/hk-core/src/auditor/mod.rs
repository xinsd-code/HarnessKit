pub mod rules;

use crate::models::{AuditFinding, AuditResult, Severity};
use chrono::Utc;

/// Content to audit — the raw text + metadata
pub struct AuditInput {
    pub extension_id: String,
    pub kind: crate::models::ExtensionKind,
    pub name: String,
    pub content: String,
    pub source: crate::models::Source,
    pub file_path: String,
    pub mcp_command: Option<String>,
    pub mcp_args: Vec<String>,
    pub mcp_env: std::collections::HashMap<String, String>,
    pub installed_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

pub trait AuditRule: Send + Sync {
    fn id(&self) -> &str;
    fn severity(&self) -> Severity;
    fn check(&self, input: &AuditInput) -> Vec<AuditFinding>;
}

pub struct Auditor {
    pub rules: Vec<Box<dyn AuditRule>>,
}

impl Auditor {
    pub fn new() -> Self {
        Self {
            rules: rules::all_rules(),
        }
    }

    pub fn audit(&self, input: &AuditInput) -> AuditResult {
        let mut findings = Vec::new();
        for rule in &self.rules {
            findings.extend(rule.check(input));
        }
        let trust_score = compute_trust_score(&findings);
        AuditResult {
            extension_id: input.extension_id.clone(),
            findings,
            trust_score,
            audited_at: Utc::now(),
        }
    }
}

pub fn compute_trust_score(findings: &[AuditFinding]) -> u8 {
    let deduction: u32 = findings.iter().map(|f| f.severity.deduction() as u32).sum();
    100u8.saturating_sub(deduction.min(100) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    #[test]
    fn test_compute_trust_score_no_findings() {
        assert_eq!(compute_trust_score(&[]), 100);
    }

    #[test]
    fn test_compute_trust_score_one_critical() {
        let findings = vec![AuditFinding {
            rule_id: "test".into(),
            severity: Severity::Critical,
            message: "bad".into(),
            location: "file:1".into(),
        }];
        assert_eq!(compute_trust_score(&findings), 75);
    }

    #[test]
    fn test_compute_trust_score_floors_at_zero() {
        let findings: Vec<AuditFinding> = (0..5)
            .map(|i| AuditFinding {
                rule_id: format!("test-{i}"),
                severity: Severity::Critical,
                message: "bad".into(),
                location: "file:1".into(),
            })
            .collect();
        assert_eq!(compute_trust_score(&findings), 0);
    }

    #[test]
    fn test_compute_trust_score_mixed() {
        let findings = vec![
            AuditFinding { rule_id: "a".into(), severity: Severity::Critical, message: "".into(), location: "".into() },
            AuditFinding { rule_id: "b".into(), severity: Severity::Low, message: "".into(), location: "".into() },
        ];
        // 100 - 25 - 3 = 72
        assert_eq!(compute_trust_score(&findings), 72);
    }

    #[test]
    fn test_auditor_runs_all_enabled_rules() {
        let auditor = Auditor::new();
        assert_eq!(auditor.rules.len(), 12);
    }
}
