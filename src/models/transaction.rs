use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub row_index: usize,
    pub date: NaiveDate,
    pub voucher_id: String,
    pub account_code: String,
    pub account_name: String,
    pub description: String,
    pub debit: Decimal,
    pub credit: Decimal,
}

impl Transaction {
    pub fn net_amount(&self) -> Decimal {
        self.debit - self.credit
    }

    pub fn is_debit(&self) -> bool {
        self.debit > Decimal::ZERO
    }

    pub fn is_credit(&self) -> bool {
        self.credit > Decimal::ZERO
    }

    pub fn max_amount(&self) -> Decimal {
        self.debit.max(self.credit)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Info,
    Warning,
    Error,
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Severity::Info => write!(f, "信息"),
            Severity::Warning => write!(f, "警告"),
            Severity::Error => write!(f, "错误"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum FindingRiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl FindingRiskLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            FindingRiskLevel::Low => "Low",
            FindingRiskLevel::Medium => "Medium",
            FindingRiskLevel::High => "High",
            FindingRiskLevel::Critical => "Critical",
        }
    }
}

impl std::fmt::Display for FindingRiskLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Copy)]
pub struct LegalBasisMetadata {
    pub regulation_name: &'static str,
    pub article_no: &'static str,
    pub legal_reasoning: &'static str,
    pub scope: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegalBasis {
    pub regulation_name: String,
    pub article_no: String,
    pub legal_reasoning: String,
    pub scope: String,
}

impl From<LegalBasisMetadata> for LegalBasis {
    fn from(value: LegalBasisMetadata) -> Self {
        Self {
            regulation_name: value.regulation_name.to_string(),
            article_no: value.article_no.to_string(),
            legal_reasoning: value.legal_reasoning.to_string(),
            scope: value.scope.to_string(),
        }
    }
}

pub const DEFAULT_LEGAL_BASIS: LegalBasisMetadata = LegalBasisMetadata {
    regulation_name: "客户批准法规映射表",
    article_no: "待映射",
    legal_reasoning: "该规则用于辅助识别审计疑点，正式处置前应按客户批准的法规映射表复核。",
    scope: "内部测试或尚未完成法规映射的规则",
};

#[derive(Debug, Clone, Copy)]
pub struct FindingMetadata {
    pub rule_code: &'static str,
    pub rule_name: &'static str,
    pub rule_category: &'static str,
    pub risk_level: FindingRiskLevel,
    pub severity: Severity,
    pub legal_basis: LegalBasisMetadata,
    pub audit_rationale: &'static str,
    pub recommended_action: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditFinding {
    pub rule_code: String,
    pub rule_name: String,
    pub rule_category: String,
    pub risk_level: FindingRiskLevel,
    pub severity: Severity,
    pub message: String,
    pub legal_basis: LegalBasis,
    pub audit_rationale: String,
    pub evidence_summary: String,
    pub recommended_action: String,
    pub related_rows: Vec<usize>,
}

impl AuditFinding {
    pub fn from_metadata(
        metadata: FindingMetadata,
        evidence_summary: impl Into<String>,
        related_rows: Vec<usize>,
    ) -> Self {
        let evidence_summary = evidence_summary.into();
        Self {
            rule_code: metadata.rule_code.to_string(),
            rule_name: metadata.rule_name.to_string(),
            rule_category: metadata.rule_category.to_string(),
            risk_level: metadata.risk_level,
            severity: metadata.severity,
            message: evidence_summary.clone(),
            legal_basis: metadata.legal_basis.into(),
            audit_rationale: metadata.audit_rationale.to_string(),
            evidence_summary,
            recommended_action: metadata.recommended_action.to_string(),
            related_rows,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryMetric {
    pub category: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSummaryMetrics {
    pub high_risk_amount: String,
    pub anomalous_transaction_count: usize,
    pub key_category_distribution: Vec<CategoryMetric>,
    pub remediation_priorities: Vec<String>,
}

impl Default for ReportSummaryMetrics {
    fn default() -> Self {
        Self {
            high_risk_amount: Decimal::ZERO.to_string(),
            anomalous_transaction_count: 0,
            key_category_distribution: Vec::new(),
            remediation_priorities: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReport {
    pub findings: Vec<AuditFinding>,
    pub total_transactions: usize,
    pub total_debit: Decimal,
    pub total_credit: Decimal,
    pub audit_time: String,
    pub summary_metrics: ReportSummaryMetrics,
}

impl AuditReport {
    pub fn new(total_transactions: usize, total_debit: Decimal, total_credit: Decimal) -> Self {
        Self {
            findings: Vec::new(),
            total_transactions,
            total_debit,
            total_credit,
            audit_time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            summary_metrics: ReportSummaryMetrics::default(),
        }
    }

    pub fn add_finding(&mut self, finding: AuditFinding) {
        self.findings.push(finding);
    }

    pub fn merge(&mut self, other: AuditReport) {
        self.findings.extend(other.findings);
        self.summary_metrics = other.summary_metrics;
    }

    pub fn count_by_severity(&self, severity: Severity) -> usize {
        self.findings
            .iter()
            .filter(|finding| finding.severity == severity)
            .count()
    }

    pub fn error_count(&self) -> usize {
        self.count_by_severity(Severity::Error)
    }

    pub fn warning_count(&self) -> usize {
        self.count_by_severity(Severity::Warning)
    }

    pub fn info_count(&self) -> usize {
        self.count_by_severity(Severity::Info)
    }

    pub fn highest_risk_level(&self) -> FindingRiskLevel {
        self.findings
            .iter()
            .map(|finding| finding.risk_level)
            .max()
            .unwrap_or(FindingRiskLevel::Low)
    }

    pub fn refresh_summary_metrics(&mut self, transactions: &[Transaction]) {
        let row_to_amount: HashMap<usize, Decimal> = transactions
            .iter()
            .map(|txn| (txn.row_index, txn.max_amount()))
            .collect();

        let mut anomalous_rows = HashSet::new();
        let mut high_risk_rows = HashSet::new();
        let mut category_counts: HashMap<String, usize> = HashMap::new();
        let mut category_priority_scores: HashMap<String, usize> = HashMap::new();

        for finding in &self.findings {
            *category_counts
                .entry(finding.rule_category.clone())
                .or_insert(0) += 1;

            let score = match finding.risk_level {
                FindingRiskLevel::Critical => 4,
                FindingRiskLevel::High => 3,
                FindingRiskLevel::Medium => 2,
                FindingRiskLevel::Low => 1,
            };
            *category_priority_scores
                .entry(finding.rule_category.clone())
                .or_insert(0) += score;

            for row in &finding.related_rows {
                anomalous_rows.insert(*row);
                if finding.risk_level >= FindingRiskLevel::High {
                    high_risk_rows.insert(*row);
                }
            }
        }

        let high_risk_amount: Decimal = high_risk_rows
            .iter()
            .filter_map(|row| row_to_amount.get(row).copied())
            .sum();

        let mut key_category_distribution: Vec<CategoryMetric> = category_counts
            .into_iter()
            .map(|(category, count)| CategoryMetric { category, count })
            .collect();
        key_category_distribution.sort_by(|left, right| right.count.cmp(&left.count));

        let mut remediation_priorities: Vec<(String, usize)> =
            category_priority_scores.into_iter().collect();
        remediation_priorities.sort_by(|left, right| right.1.cmp(&left.1));

        self.summary_metrics = ReportSummaryMetrics {
            high_risk_amount: high_risk_amount.to_string(),
            anomalous_transaction_count: anomalous_rows.len(),
            key_category_distribution,
            remediation_priorities: remediation_priorities
                .into_iter()
                .take(3)
                .map(|(category, _)| format!("优先核查{}", category))
                .collect(),
        };
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuditConfig {
    pub general: Option<GeneralConfig>,
    pub rules: Option<RulesConfig>,
    pub anomaly: Option<AnomalyConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeneralConfig {
    pub decimal_places: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RulesConfig {
    pub balance_check: Option<BalanceCheckConfig>,
    pub threshold: Option<ThresholdConfig>,
    pub duplicate: Option<DuplicateConfig>,
    pub date_continuity: Option<DateContinuityConfig>,
    pub account_compliance: Option<AccountComplianceConfig>,
    pub round_amount: Option<RoundAmountConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BalanceCheckConfig {
    pub enabled: bool,
    pub tolerance: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ThresholdConfig {
    pub enabled: bool,
    pub amount_threshold: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DuplicateConfig {
    pub enabled: bool,
    pub time_window_days: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DateContinuityConfig {
    pub enabled: bool,
    pub max_gap_days: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AccountComplianceConfig {
    pub enabled: bool,
    pub valid_accounts: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RoundAmountConfig {
    pub enabled: bool,
    pub count_threshold: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnomalyConfig {
    pub enabled: bool,
    pub zscore_threshold: Option<f64>,
    pub group_by_account: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_transaction_net_amount() {
        let txn = Transaction {
            row_index: 1,
            date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            voucher_id: "V001".to_string(),
            account_code: "1001".to_string(),
            account_name: "库存现金".to_string(),
            description: "测试交易".to_string(),
            debit: dec!(1000.00),
            credit: dec!(0.00),
        };
        assert_eq!(txn.net_amount(), dec!(1000.00));
        assert!(txn.is_debit());
        assert!(!txn.is_credit());
    }

    #[test]
    fn test_audit_report_counts() {
        let mut report = AuditReport::new(10, dec!(5000.00), dec!(5000.00));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-001",
                rule_name: "测试规则",
                rule_category: "资金流向异常",
                risk_level: FindingRiskLevel::High,
                severity: Severity::Error,
                legal_basis: DEFAULT_LEGAL_BASIS,
                audit_rationale: "测试依据",
                recommended_action: "测试建议",
            },
            "错误",
            vec![1],
        ));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-002",
                rule_name: "测试规则",
                rule_category: "支付时点异常",
                risk_level: FindingRiskLevel::Medium,
                severity: Severity::Warning,
                legal_basis: DEFAULT_LEGAL_BASIS,
                audit_rationale: "测试依据",
                recommended_action: "测试建议",
            },
            "警告",
            vec![2],
        ));
        assert_eq!(report.error_count(), 1);
        assert_eq!(report.warning_count(), 1);
        assert_eq!(report.info_count(), 0);
        assert_eq!(report.highest_risk_level(), FindingRiskLevel::High);
    }
}
