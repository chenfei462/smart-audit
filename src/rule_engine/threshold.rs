use super::{build_fiscal_finding, AuditRule, THRESHOLD_METADATA};
use crate::models::{AuditFinding, ThresholdConfig, Transaction};
use anyhow::Result;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::str::FromStr;

pub struct ThresholdCheck {
    threshold: Decimal,
}

impl ThresholdCheck {
    pub fn from_config(config: &ThresholdConfig) -> Self {
        let threshold = config
            .amount_threshold
            .as_deref()
            .and_then(|value| Decimal::from_str(value).ok())
            .unwrap_or(dec!(50000));
        Self { threshold }
    }

    pub fn new(threshold: Decimal) -> Self {
        Self { threshold }
    }
}

impl AuditRule for ThresholdCheck {
    fn name(&self) -> &str {
        THRESHOLD_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "识别超阈值的财政资金支出"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut findings = Vec::new();
        for txn in transactions {
            let max_amount = txn.max_amount();
            if max_amount > self.threshold {
                let evidence = format!(
                    "第{}行专项支出金额{}超过阈值{}，凭证号{}，科目{} {}，摘要{}。",
                    txn.row_index,
                    max_amount,
                    self.threshold,
                    txn.voucher_id,
                    txn.account_code,
                    txn.account_name,
                    txn.description
                );
                findings.push(build_fiscal_finding(
                    THRESHOLD_METADATA,
                    evidence,
                    vec![txn.row_index],
                ));
            }
        }
        Ok(findings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    fn make_txn(row: usize, debit: Decimal, credit: Decimal) -> Transaction {
        Transaction {
            row_index: row,
            date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            voucher_id: "V001".to_string(),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "专项资金拨付".to_string(),
            debit,
            credit,
        }
    }

    #[test]
    fn test_below_threshold() {
        let checker = ThresholdCheck::new(dec!(50000));
        let txns = vec![make_txn(1, dec!(10000), dec!(0))];
        let findings = checker.check(&txns).unwrap();
        assert!(findings.is_empty());
    }

    #[test]
    fn test_above_threshold() {
        let checker = ThresholdCheck::new(dec!(50000));
        let txns = vec![make_txn(1, dec!(100000), dec!(0))];
        let findings = checker.check(&txns).unwrap();
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].rule_code, "FISCAL-FLOW-001");
    }
}
