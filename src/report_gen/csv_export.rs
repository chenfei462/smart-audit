use super::ReportExport;
use crate::models::AuditReport;
use anyhow::{Context, Result};
use std::path::Path;

pub struct CsvExporter;

impl ReportExport for CsvExporter {
    fn export(&self, report: &AuditReport, path: &Path) -> Result<()> {
        let mut writer = csv::Writer::from_path(path)
            .with_context(|| format!("创建 CSV 文件失败: {}", path.display()))?;

        writer.write_record([
            "序号",
            "风险等级",
            "问题名称",
            "问题分类",
            "规则编码",
            "证据摘要",
            "审计依据",
            "整改建议",
            "涉及行",
        ])?;

        for (index, finding) in report.findings.iter().enumerate() {
            let rows: Vec<String> = finding
                .related_rows
                .iter()
                .map(|row| row.to_string())
                .collect();
            writer.write_record([
                (index + 1).to_string(),
                finding.risk_level.to_string(),
                finding.rule_name.clone(),
                finding.rule_category.clone(),
                finding.rule_code.clone(),
                finding.evidence_summary.clone(),
                finding.audit_rationale.clone(),
                finding.recommended_action.clone(),
                rows.join(";"),
            ])?;
        }

        writer.flush()?;
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
    fn test_csv_export() {
        let mut report = AuditReport::new(5, dec!(10000), dec!(10000));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-001",
                rule_name: "测试规则",
                rule_category: "资金流向异常",
                risk_level: FindingRiskLevel::High,
                severity: Severity::Error,
                legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                audit_rationale: "测试依据",
                recommended_action: "测试建议",
            },
            "错误描述",
            vec![1, 3],
        ));

        let file = NamedTempFile::with_suffix(".csv").unwrap();
        let exporter = CsvExporter;
        assert!(exporter.export(&report, file.path()).is_ok());

        let content = std::fs::read_to_string(file.path()).unwrap();
        assert!(content.contains("TEST-001"));
        assert!(content.contains("1;3"));
    }
}
