use super::ReportExport;
use crate::models::AuditReport;
use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

pub struct JsonExporter;

impl ReportExport for JsonExporter {
    fn export(&self, report: &AuditReport, path: &Path) -> Result<()> {
        let json = serde_json::to_string_pretty(report).context("序列化审计报告为 JSON 失败")?;
        fs::write(path, &json)
            .with_context(|| format!("写入 JSON 文件失败: {}", path.display()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuditFinding, AuditReport, FindingMetadata, FindingRiskLevel, Severity};
    use rust_decimal_macros::dec;
    use tempfile::NamedTempFile;

    #[test]
    fn test_json_export() {
        let mut report = AuditReport::new(5, dec!(10000), dec!(10000));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-001",
                rule_name: "测试规则",
                rule_category: "资金流向异常",
                risk_level: FindingRiskLevel::Medium,
                severity: Severity::Warning,
                legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                audit_rationale: "测试依据",
                recommended_action: "测试建议",
            },
            "测试消息",
            vec![1],
        ));

        let file = NamedTempFile::new().unwrap();
        let exporter = JsonExporter;
        assert!(exporter.export(&report, file.path()).is_ok());

        let content = fs::read_to_string(file.path()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["total_transactions"], 5);
        assert_eq!(parsed["findings"][0]["rule_code"], "TEST-001");
    }
}
