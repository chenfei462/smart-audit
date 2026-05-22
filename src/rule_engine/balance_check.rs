use super::{build_fiscal_finding, AuditRule, BALANCE_METADATA};
use crate::models::{AuditFinding, BalanceCheckConfig, Transaction};
use anyhow::Result;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::HashMap;
use std::str::FromStr;

pub struct BalanceCheck {
    tolerance: Decimal,
}

impl BalanceCheck {
    pub fn from_config(config: &BalanceCheckConfig) -> Self {
        let tolerance = config
            .tolerance
            .as_deref()
            .and_then(|value| Decimal::from_str(value).ok())
            .unwrap_or(dec!(0.01));
        Self { tolerance }
    }

    pub fn new() -> Self {
        Self {
            tolerance: dec!(0.01),
        }
    }
}

impl Default for BalanceCheck {
    fn default() -> Self {
        Self::new()
    }
}

impl AuditRule for BalanceCheck {
    fn name(&self) -> &str {
        BALANCE_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "校验财政凭证借贷两端是否勾稽一致"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut findings = Vec::new();
        let mut voucher_groups: HashMap<&str, Vec<&Transaction>> = HashMap::new();
        for txn in transactions {
            voucher_groups.entry(&txn.voucher_id).or_default().push(txn);
        }

        for (voucher_id, txns) in voucher_groups {
            let total_debit: Decimal = txns.iter().map(|txn| txn.debit).sum();
            let total_credit: Decimal = txns.iter().map(|txn| txn.credit).sum();
            let diff = (total_debit - total_credit).abs();
            if diff > self.tolerance {
                let related_rows: Vec<usize> = txns.iter().map(|txn| txn.row_index).collect();
                let evidence = format!(
                    "凭证{}借方合计{}、贷方合计{}，差额{}，超出容差{}。",
                    voucher_id, total_debit, total_credit, diff, self.tolerance
                );
                findings.push(build_fiscal_finding(
                    BALANCE_METADATA,
                    evidence,
                    related_rows,
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

    fn make_txn(row: usize, voucher: &str, debit: Decimal, credit: Decimal) -> Transaction {
        Transaction {
            row_index: row,
            date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            voucher_id: voucher.to_string(),
            account_code: "1001".to_string(),
            account_name: "库存现金".to_string(),
            description: "测试".to_string(),
            debit,
            credit,
        }
    }

    #[test]
    fn test_balanced_voucher() {
        let checker = BalanceCheck::new();
        let txns = vec![
            make_txn(1, "V001", dec!(1000), dec!(0)),
            make_txn(2, "V001", dec!(0), dec!(1000)),
        ];
        let findings = checker.check(&txns).unwrap();
        assert!(findings.is_empty());
    }

    #[test]
    fn test_unbalanced_voucher() {
        let checker = BalanceCheck::new();
        let txns = vec![
            make_txn(1, "V001", dec!(1000), dec!(0)),
            make_txn(2, "V001", dec!(0), dec!(500)),
        ];
        let findings = checker.check(&txns).unwrap();
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].rule_code, "FISCAL-BUDGET-001");
    }
}
