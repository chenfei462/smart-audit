use super::{build_fiscal_finding, AuditRule, DUPLICATE_METADATA};
use crate::models::{AuditFinding, DuplicateConfig, Transaction};
use anyhow::Result;
use std::collections::HashMap;

pub struct DuplicateCheck {
    time_window_days: i64,
}

impl DuplicateCheck {
    pub fn from_config(config: &DuplicateConfig) -> Self {
        Self {
            time_window_days: config.time_window_days.unwrap_or(1),
        }
    }

    pub fn new(time_window_days: i64) -> Self {
        Self { time_window_days }
    }
}

#[derive(Hash, Eq, PartialEq)]
struct TxnKey {
    account_code: String,
    debit: String,
    credit: String,
}

impl AuditRule for DuplicateCheck {
    fn name(&self) -> &str {
        DUPLICATE_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "识别同金额、同科目、近时点的疑似重复支付"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut findings = Vec::new();
        let mut groups: HashMap<TxnKey, Vec<&Transaction>> = HashMap::new();
        for txn in transactions {
            let key = TxnKey {
                account_code: txn.account_code.clone(),
                debit: txn.debit.to_string(),
                credit: txn.credit.to_string(),
            };
            groups.entry(key).or_default().push(txn);
        }

        for group in groups.values() {
            if group.len() < 2 {
                continue;
            }
            let mut sorted = group.clone();
            sorted.sort_by_key(|txn| txn.date);
            for index in 1..sorted.len() {
                let days_diff = (sorted[index].date - sorted[index - 1].date).num_days();
                if days_diff <= self.time_window_days {
                    let related_rows = vec![sorted[index - 1].row_index, sorted[index].row_index];
                    let evidence = format!(
                        "第{}行与第{}行在{}天内出现相同科目{}、相同金额（借{} / 贷{}），疑似重复支付。",
                        sorted[index - 1].row_index,
                        sorted[index].row_index,
                        days_diff,
                        sorted[index].account_code,
                        sorted[index].debit,
                        sorted[index].credit
                    );
                    findings.push(build_fiscal_finding(
                        DUPLICATE_METADATA,
                        evidence,
                        related_rows,
                    ));
                }
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

    fn make_txn(
        row: usize,
        date: &str,
        account: &str,
        debit: rust_decimal::Decimal,
    ) -> Transaction {
        Transaction {
            row_index: row,
            date: NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap(),
            voucher_id: format!("V{:03}", row),
            account_code: account.to_string(),
            account_name: "财政专项支出".to_string(),
            description: "测试".to_string(),
            debit,
            credit: rust_decimal::Decimal::ZERO,
        }
    }

    #[test]
    fn test_no_duplicates() {
        let checker = DuplicateCheck::new(1);
        let txns = vec![
            make_txn(1, "2024-01-01", "6602", dec!(1000)),
            make_txn(2, "2024-01-15", "6602", dec!(1000)),
        ];
        let findings = checker.check(&txns).unwrap();
        assert!(findings.is_empty());
    }

    #[test]
    fn test_duplicate_detected() {
        let checker = DuplicateCheck::new(1);
        let txns = vec![
            make_txn(1, "2024-01-01", "6602", dec!(1000)),
            make_txn(2, "2024-01-01", "6602", dec!(1000)),
        ];
        let findings = checker.check(&txns).unwrap();
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].rule_code, "FISCAL-DUP-001");
    }
}
