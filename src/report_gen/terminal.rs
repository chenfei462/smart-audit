use super::ReportOutput;
use crate::models::AuditReport;
use anyhow::Result;
use colored::*;

pub struct TerminalReporter;

impl ReportOutput for TerminalReporter {
    fn print_report(&self, report: &AuditReport) -> Result<()> {
        println!();
        println!(
            "{}",
            "=============================================="
                .blue()
                .bold()
        );
        println!("{}", "AuditLens 财政监督审计报告".blue().bold());
        println!(
            "{}",
            "=============================================="
                .blue()
                .bold()
        );
        println!();

        println!("{}", "【项目概况】".cyan().bold());
        println!("  审计时间：{}", report.audit_time);
        println!("  交易总数：{}", report.total_transactions);
        println!("  借方总额：{}", report.total_debit);
        println!("  贷方总额：{}", report.total_credit);
        println!();

        println!("{}", "【风险结论摘要】".cyan().bold());
        println!("  总体风险等级：{}", report.highest_risk_level());
        println!("  高风险金额：{}", report.summary_metrics.high_risk_amount);
        println!(
            "  异常交易笔数：{}",
            report.summary_metrics.anomalous_transaction_count
        );
        if !report.summary_metrics.remediation_priorities.is_empty() {
            println!(
                "  整改优先级：{}",
                report.summary_metrics.remediation_priorities.join(" / ")
            );
        }
        println!();

        if report.findings.is_empty() {
            println!(
                "{}",
                "  未发现异常，当前样本未触发重点财政监督规则。"
                    .green()
                    .bold()
            );
            println!();
            return Ok(());
        }

        println!("{}", "【重点问题明细】".cyan().bold());
        for (index, finding) in report.findings.iter().enumerate() {
            let severity_tag = match finding.severity {
                crate::models::Severity::Error => "[错误]".red().bold(),
                crate::models::Severity::Warning => "[警告]".yellow().bold(),
                crate::models::Severity::Info => "[信息]".green().bold(),
            };
            println!(
                "  {} #{} {} / {}",
                severity_tag,
                index + 1,
                finding.rule_name,
                finding.risk_level
            );
            println!(
                "  分类：{}  编码：{}",
                finding.rule_category, finding.rule_code
            );
            println!("  证据：{}", finding.evidence_summary);
            println!("  依据：{}", finding.audit_rationale);
            println!("  建议：{}", finding.recommended_action);
            if !finding.related_rows.is_empty() {
                let rows: Vec<String> = finding
                    .related_rows
                    .iter()
                    .map(|row| row.to_string())
                    .collect();
                println!("  涉及行：{}", rows.join(", "));
            }
            println!("{}", "  ----------------------------------------".dimmed());
        }
        println!();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuditFinding, AuditReport, FindingMetadata, FindingRiskLevel, Severity};
    use rust_decimal_macros::dec;

    #[test]
    fn test_terminal_report_empty() {
        let report = AuditReport::new(0, dec!(0), dec!(0));
        let reporter = TerminalReporter;
        assert!(reporter.print_report(&report).is_ok());
    }

    #[test]
    fn test_terminal_report_with_findings() {
        let mut report = AuditReport::new(10, dec!(5000), dec!(5000));
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
            "测试警告",
            vec![1, 2],
        ));
        let reporter = TerminalReporter;
        assert!(reporter.print_report(&report).is_ok());
    }
}
