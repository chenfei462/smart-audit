use super::{build_fiscal_finding, AuditRule, DATE_GAP_METADATA, DATE_REVERSAL_METADATA};
use crate::models::{AuditFinding, Transaction};
use anyhow::Result;

pub struct DateContinuityCheck {
    max_gap_days: i64,
}

impl DateContinuityCheck {
    pub fn new(max_gap_days: i64) -> Self {
        Self { max_gap_days }
    }
}

impl Default for DateContinuityCheck {
    fn default() -> Self {
        Self { max_gap_days: 7 }
    }
}

impl AuditRule for DateContinuityCheck {
    fn name(&self) -> &str {
        DATE_GAP_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "识别支付日期倒挂与异常间断"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut findings = Vec::new();
        if transactions.len() < 2 {
            return Ok(findings);
        }

        for index in 1..transactions.len() {
            if transactions[index].date < transactions[index - 1].date {
                let evidence = format!(
                    "第{}行日期{}早于第{}行日期{}，存在支付时序倒挂。",
                    transactions[index].row_index,
                    transactions[index].date,
                    transactions[index - 1].row_index,
                    transactions[index - 1].date
                );
                findings.push(build_fiscal_finding(
                    DATE_REVERSAL_METADATA,
                    evidence,
                    vec![
                        transactions[index - 1].row_index,
                        transactions[index].row_index,
                    ],
                ));
            }
        }

        let mut sorted: Vec<&Transaction> = transactions.iter().collect();
        sorted.sort_by_key(|txn| txn.date);
        for index in 1..sorted.len() {
            let gap = (sorted[index].date - sorted[index - 1].date).num_days();
            if gap > self.max_gap_days {
                let evidence = format!(
                    "{}到{}之间间隔{}天，超过阈值{}天，存在支付时点异常间断。",
                    sorted[index - 1].date,
                    sorted[index].date,
                    gap,
                    self.max_gap_days
                );
                findings.push(build_fiscal_finding(
                    DATE_GAP_METADATA,
                    evidence,
                    vec![sorted[index - 1].row_index, sorted[index].row_index],
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

    fn make_txn(row: usize, date: &str) -> Transaction {
        Transaction {
            row_index: row,
            date: NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap(),
            voucher_id: format!("V{:03}", row),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "测试".to_string(),
            debit: dec!(100),
            credit: dec!(0),
        }
    }

    #[test]
    fn test_date_gap() {
        let checker = DateContinuityCheck::new(7);
        let txns = vec![make_txn(1, "2024-01-01"), make_txn(2, "2024-01-20")];
        let findings = checker.check(&txns).unwrap();
        assert_eq!(findings[0].rule_code, "FISCAL-TIME-002");
    }

    #[test]
    fn test_no_gap() {
        let checker = DateContinuityCheck::new(7);
        let txns = vec![make_txn(1, "2024-01-01"), make_txn(2, "2024-01-05")];
        let findings = checker.check(&txns).unwrap();
        assert!(findings.is_empty());
    }
}
