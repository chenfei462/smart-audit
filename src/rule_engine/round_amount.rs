use super::{build_fiscal_finding, AuditRule, ROUND_AMOUNT_METADATA};
use crate::models::{AuditFinding, Transaction};
use anyhow::Result;
use rust_decimal::Decimal;
use std::collections::HashMap;

pub struct RoundAmountCheck {
    count_threshold: usize,
}

impl RoundAmountCheck {
    pub fn new(count_threshold: usize) -> Self {
        Self { count_threshold }
    }
}

impl Default for RoundAmountCheck {
    fn default() -> Self {
        Self { count_threshold: 5 }
    }
}

impl AuditRule for RoundAmountCheck {
    fn name(&self) -> &str {
        ROUND_AMOUNT_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "识别整数金额的集中支付行为"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut findings = Vec::new();
        let mut round_counts: HashMap<String, Vec<usize>> = HashMap::new();

        for txn in transactions {
            let amount = txn.max_amount();
            if amount.is_zero() {
                continue;
            }
            if amount.fract() == Decimal::ZERO && amount >= Decimal::from(100) {
                round_counts
                    .entry(amount.to_string())
                    .or_default()
                    .push(txn.row_index);
            }
        }

        for (amount, rows) in round_counts {
            if rows.len() >= self.count_threshold {
                let evidence = format!(
                    "整数金额{}共出现{}次，超过阈值{}次，存在集中支付或模板化录入迹象。",
                    amount,
                    rows.len(),
                    self.count_threshold
                );
                findings.push(build_fiscal_finding(ROUND_AMOUNT_METADATA, evidence, rows));
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

    #[test]
    fn test_round_amount_warning() {
        let checker = RoundAmountCheck::new(2);
        let txns: Vec<Transaction> = (0..3)
            .map(|index| Transaction {
                row_index: index + 1,
                date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
                voucher_id: format!("V{:03}", index),
                account_code: "6602".to_string(),
                account_name: "财政专项支出".to_string(),
                description: "测试".to_string(),
                debit: dec!(5000),
                credit: dec!(0),
            })
            .collect();

        let findings = checker.check(&txns).unwrap();
        assert_eq!(findings[0].rule_code, "FISCAL-DUP-002");
    }
}
