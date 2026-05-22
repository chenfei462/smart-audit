use super::AuditRule;
use crate::models::{AuditFinding, Transaction};
use anyhow::Result;

pub struct RuleExecutor {
    rules: Vec<Box<dyn AuditRule>>,
}

impl RuleExecutor {
    pub fn new(rules: Vec<Box<dyn AuditRule>>) -> Self {
        Self { rules }
    }

    pub fn rule_count(&self) -> usize {
        self.rules.len()
    }

    pub fn execute_all(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut all_findings = Vec::new();
        for rule in &self.rules {
            match rule.check(transactions) {
                Ok(findings) => all_findings.extend(findings),
                Err(error) => eprintln!("规则'{}'执行失败: {}", rule.name(), error),
            }
        }
        Ok(all_findings)
    }

    pub fn rule_names(&self) -> Vec<&str> {
        self.rules.iter().map(|rule| rule.name()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuditFinding, FindingMetadata, FindingRiskLevel, Severity, Transaction};
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    struct TestRule;

    impl AuditRule for TestRule {
        fn name(&self) -> &str {
            "测试规则"
        }

        fn description(&self) -> &str {
            "测试规则"
        }

        fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
            let findings: Vec<_> = transactions
                .iter()
                .filter(|txn| txn.debit > dec!(0))
                .map(|txn| {
                    AuditFinding::from_metadata(
                        FindingMetadata {
                            rule_code: "TEST-001",
                            rule_name: "测试规则",
                            rule_category: "资金流向异常",
                            risk_level: FindingRiskLevel::Low,
                            severity: Severity::Info,
                            legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                            audit_rationale: "测试依据",
                            recommended_action: "测试建议",
                        },
                        format!("借方交易: {}", txn.debit),
                        vec![txn.row_index],
                    )
                })
                .collect();
            Ok(findings)
        }
    }

    #[test]
    fn test_rule_executor() {
        let rules: Vec<Box<dyn AuditRule>> = vec![Box::new(TestRule)];
        let executor = RuleExecutor::new(rules);
        let txns = vec![Transaction {
            row_index: 1,
            date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            voucher_id: "V001".to_string(),
            account_code: "1001".to_string(),
            account_name: "库存现金".to_string(),
            description: "test".to_string(),
            debit: dec!(100),
            credit: dec!(0),
        }];

        let findings = executor.execute_all(&txns).unwrap();
        assert_eq!(findings.len(), 1);
        assert_eq!(executor.rule_count(), 1);
    }
}
