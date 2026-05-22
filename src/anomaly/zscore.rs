use crate::models::{AnomalyConfig, AuditFinding, FindingRiskLevel, Transaction};
use crate::rule_engine::{build_fiscal_finding, ZSCORE_METADATA};
use anyhow::Result;
use rayon::prelude::*;
use rust_decimal::prelude::ToPrimitive;
use std::collections::HashMap;

pub struct ZScoreDetector {
    threshold: f64,
    group_by_account: bool,
}

impl ZScoreDetector {
    pub fn from_config(config: &AnomalyConfig) -> Self {
        Self {
            threshold: config.zscore_threshold.unwrap_or(3.0),
            group_by_account: config.group_by_account.unwrap_or(true),
        }
    }

    pub fn new(threshold: f64, group_by_account: bool) -> Self {
        Self {
            threshold,
            group_by_account,
        }
    }

    pub fn detect(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        if self.group_by_account {
            self.detect_by_group(transactions)
        } else {
            self.detect_global(transactions)
        }
    }

    fn detect_global(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let amounts: Vec<f64> = transactions
            .iter()
            .map(|txn| txn.net_amount().abs().to_f64().unwrap_or(0.0))
            .collect();
        let (mean, std_dev) = compute_stats(&amounts);
        if std_dev == 0.0 {
            return Ok(Vec::new());
        }

        Ok(transactions
            .par_iter()
            .enumerate()
            .filter_map(|(index, txn)| {
                let amount = amounts[index];
                let zscore = (amount - mean) / std_dev;
                if zscore.abs() >= self.threshold {
                    let mut finding = build_fiscal_finding(
                        ZSCORE_METADATA,
                        format!(
                            "第{}行金额{}偏离整体均值，z-score 为{:.2}，均值{:.2}，标准差{:.2}，凭证号{}。",
                            txn.row_index,
                            txn.max_amount(),
                            zscore,
                            mean,
                            std_dev,
                            txn.voucher_id
                        ),
                        vec![txn.row_index],
                    );
                    if zscore.abs() >= self.threshold * 1.5 {
                        finding.risk_level = FindingRiskLevel::High;
                    }
                    Some(finding)
                } else {
                    None
                }
            })
            .collect())
    }

    fn detect_by_group(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut groups: HashMap<&str, Vec<&Transaction>> = HashMap::new();
        for txn in transactions {
            groups.entry(&txn.account_code).or_default().push(txn);
        }

        let mut findings = Vec::new();
        for (account_code, group) in groups {
            if group.len() < 3 {
                continue;
            }
            let amounts: Vec<f64> = group
                .iter()
                .map(|txn| txn.net_amount().abs().to_f64().unwrap_or(0.0))
                .collect();
            let (mean, std_dev) = compute_stats(&amounts);
            if std_dev == 0.0 {
                continue;
            }

            for (index, txn) in group.iter().enumerate() {
                let zscore = (amounts[index] - mean) / std_dev;
                if zscore.abs() >= self.threshold {
                    let mut finding = build_fiscal_finding(
                        ZSCORE_METADATA,
                        format!(
                            "第{}行科目{}（{}）金额{}偏离本科目均值，z-score 为{:.2}，凭证号{}。",
                            txn.row_index,
                            account_code,
                            txn.account_name,
                            txn.max_amount(),
                            zscore,
                            txn.voucher_id
                        ),
                        vec![txn.row_index],
                    );
                    if zscore.abs() >= self.threshold * 1.5 {
                        finding.risk_level = FindingRiskLevel::High;
                    }
                    findings.push(finding);
                }
            }
        }

        Ok(findings)
    }
}

fn compute_stats(values: &[f64]) -> (f64, f64) {
    if values.is_empty() {
        return (0.0, 0.0);
    }

    let len = values.len() as f64;
    let mean = values.iter().sum::<f64>() / len;
    let variance = values
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / len;
    (mean, variance.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    fn make_txn(row: usize, account: &str, debit: rust_decimal::Decimal) -> Transaction {
        Transaction {
            row_index: row,
            date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            voucher_id: format!("V{:03}", row),
            account_code: account.to_string(),
            account_name: "测试科目".to_string(),
            description: "测试".to_string(),
            debit,
            credit: rust_decimal::Decimal::ZERO,
        }
    }

    #[test]
    fn test_compute_stats() {
        let values = vec![10.0, 20.0, 30.0];
        let (mean, std_dev) = compute_stats(&values);
        assert!((mean - 20.0).abs() < 0.001);
        assert!((std_dev - 8.165).abs() < 0.01);
    }

    #[test]
    fn test_detect_outlier() {
        let detector = ZScoreDetector::new(2.0, false);
        let txns = vec![
            make_txn(1, "1001", dec!(100)),
            make_txn(2, "1001", dec!(105)),
            make_txn(3, "1001", dec!(98)),
            make_txn(4, "1001", dec!(102)),
            make_txn(5, "1001", dec!(101)),
            make_txn(6, "1001", dec!(20000)),
        ];
        let findings = detector.detect(&txns).unwrap();
        assert!(findings
            .iter()
            .any(|finding| finding.related_rows.contains(&6)));
    }
}
