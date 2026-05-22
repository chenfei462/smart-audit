use super::{
    build_fiscal_finding, AuditRule, FREQUENT_LEDGER_METADATA, PERIOD_END_METADATA,
    ROUND_TRIP_METADATA,
};
use crate::models::{AuditFinding, Transaction};
use anyhow::Result;
use chrono::Datelike;
use std::collections::HashMap;

pub struct RelatedPartyCheck {
    min_round_trip_count: usize,
    period_end_days: u32,
    period_end_ratio: f64,
}

impl RelatedPartyCheck {
    pub fn new() -> Self {
        Self {
            min_round_trip_count: 3,
            period_end_days: 5,
            period_end_ratio: 0.3,
        }
    }
}

impl Default for RelatedPartyCheck {
    fn default() -> Self {
        Self::new()
    }
}

impl AuditRule for RelatedPartyCheck {
    fn name(&self) -> &str {
        ROUND_TRIP_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "识别资金回流、期末集中支付和高频往来科目组合"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut findings = Vec::new();
        self.check_round_trip(transactions, &mut findings);
        self.check_period_end(transactions, &mut findings);
        self.check_frequent_pairs(transactions, &mut findings);
        Ok(findings)
    }
}

impl RelatedPartyCheck {
    fn check_round_trip(&self, transactions: &[Transaction], findings: &mut Vec<AuditFinding>) {
        let mut groups: HashMap<(String, String), Vec<usize>> = HashMap::new();
        for txn in transactions {
            let amount = txn.max_amount();
            if amount.is_zero() {
                continue;
            }
            groups
                .entry((txn.date.to_string(), amount.to_string()))
                .or_default()
                .push(txn.row_index);
        }

        for ((date, amount), rows) in groups {
            if rows.len() >= self.min_round_trip_count {
                let evidence = format!(
                    "{}当日金额{}出现{}次，存在同日同额资金回流或循环支付嫌疑。",
                    date,
                    amount,
                    rows.len()
                );
                findings.push(build_fiscal_finding(ROUND_TRIP_METADATA, evidence, rows));
            }
        }
    }

    fn check_period_end(&self, transactions: &[Transaction], findings: &mut Vec<AuditFinding>) {
        use rust_decimal::prelude::ToPrimitive;

        let total_amount: f64 = transactions
            .iter()
            .map(|txn| txn.max_amount().to_f64().unwrap_or(0.0))
            .sum();
        if total_amount == 0.0 {
            return;
        }

        let period_end_rows: Vec<usize> = transactions
            .iter()
            .filter(|txn| {
                let day = txn.date.day();
                let last_day = last_day_of_month(txn.date.year(), txn.date.month());
                day > last_day.saturating_sub(self.period_end_days)
            })
            .map(|txn| txn.row_index)
            .collect();

        let period_end_amount: f64 = transactions
            .iter()
            .filter(|txn| period_end_rows.contains(&txn.row_index))
            .map(|txn| txn.max_amount().to_f64().unwrap_or(0.0))
            .sum();
        let ratio = period_end_amount / total_amount;

        if ratio > self.period_end_ratio {
            let evidence = format!(
                "月末{}天内交易金额占比{:.1}%，超过阈值{:.1}%，存在期末集中支付风险。",
                self.period_end_days,
                ratio * 100.0,
                self.period_end_ratio * 100.0
            );
            findings.push(build_fiscal_finding(
                PERIOD_END_METADATA,
                evidence,
                period_end_rows,
            ));
        }
    }

    fn check_frequent_pairs(&self, transactions: &[Transaction], findings: &mut Vec<AuditFinding>) {
        let mut voucher_groups: HashMap<&str, Vec<&Transaction>> = HashMap::new();
        for txn in transactions {
            voucher_groups.entry(&txn.voucher_id).or_default().push(txn);
        }

        let mut pair_counts: HashMap<(String, String), usize> = HashMap::new();
        for txns in voucher_groups.values() {
            let debits: Vec<&str> = txns
                .iter()
                .filter(|txn| txn.is_debit())
                .map(|txn| txn.account_code.as_str())
                .collect();
            let credits: Vec<&str> = txns
                .iter()
                .filter(|txn| txn.is_credit())
                .map(|txn| txn.account_code.as_str())
                .collect();

            for debit in &debits {
                for credit in &credits {
                    if debit != credit {
                        *pair_counts
                            .entry((debit.to_string(), credit.to_string()))
                            .or_insert(0) += 1;
                    }
                }
            }
        }

        for ((debit_acc, credit_acc), count) in pair_counts {
            if count >= 5 {
                let evidence = format!(
                    "科目{}到{}组合出现{}次，需关注往来挂账或固定模式下的异常资金流转。",
                    debit_acc, credit_acc, count
                );
                findings.push(build_fiscal_finding(
                    FREQUENT_LEDGER_METADATA,
                    evidence,
                    Vec::new(),
                ));
            }
        }
    }
}

fn last_day_of_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    #[test]
    fn test_last_day_of_month() {
        assert_eq!(last_day_of_month(2024, 2), 29);
        assert_eq!(last_day_of_month(2023, 2), 28);
    }

    #[test]
    fn test_round_trip_detection() {
        let checker = RelatedPartyCheck {
            min_round_trip_count: 2,
            ..Default::default()
        };
        let txns: Vec<Transaction> = (0..3)
            .map(|index| Transaction {
                row_index: index + 1,
                date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
                voucher_id: format!("V{:03}", index + 1),
                account_code: "6602".to_string(),
                account_name: "财政专项支出".to_string(),
                description: "测试".to_string(),
                debit: dec!(5000),
                credit: dec!(0),
            })
            .collect();
        let findings = checker.check(&txns).unwrap();
        assert!(findings
            .iter()
            .any(|finding| finding.rule_code == "FISCAL-FLOW-004"));
    }
}
