use super::{build_fiscal_finding, AuditRule, BENFORD_ALERT_METADATA, BENFORD_SUMMARY_METADATA};
use crate::models::{AuditFinding, FindingRiskLevel, Severity, Transaction};
use anyhow::Result;
use rust_decimal::prelude::ToPrimitive;

pub struct BenfordCheck {
    max_deviation: f64,
}

impl BenfordCheck {
    pub fn new(max_deviation: f64) -> Self {
        Self { max_deviation }
    }
}

impl Default for BenfordCheck {
    fn default() -> Self {
        Self { max_deviation: 5.0 }
    }
}

fn benford_expected() -> [f64; 9] {
    [
        0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046,
    ]
}

fn first_digit(amount: f64) -> Option<usize> {
    let abs = amount.abs();
    if abs < 1.0 {
        return None;
    }
    let text = format!("{:.0}", abs);
    let digit = text.chars().next()?.to_digit(10)? as usize;
    if (1..=9).contains(&digit) {
        Some(digit)
    } else {
        None
    }
}

impl AuditRule for BenfordCheck {
    fn name(&self) -> &str {
        BENFORD_ALERT_METADATA.rule_name
    }

    fn description(&self) -> &str {
        "识别金额首位分布偏离自然分布的异常现象"
    }

    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>> {
        let mut counts = [0usize; 9];
        let mut total = 0usize;

        for txn in transactions {
            if let Some(digit) = first_digit(txn.max_amount().to_f64().unwrap_or(0.0)) {
                counts[digit - 1] += 1;
                total += 1;
            }
        }

        if total < 50 {
            return Ok(vec![build_fiscal_finding(
                BENFORD_SUMMARY_METADATA,
                format!(
                    "有效交易仅{}笔，Benford 分布只作为辅助观察，不单独形成异常结论。",
                    total
                ),
                Vec::new(),
            )]);
        }

        let expected = benford_expected();
        let mut findings = Vec::new();
        let mut summary_lines = Vec::new();

        for index in 0..9 {
            let actual_pct = counts[index] as f64 / total as f64 * 100.0;
            let expected_pct = expected[index] * 100.0;
            let deviation = (actual_pct - expected_pct).abs();
            summary_lines.push(format!(
                "首位{}：实际{:.1}% / 理论{:.1}% / 偏差{:.1}%",
                index + 1,
                actual_pct,
                expected_pct,
                deviation
            ));
            if deviation > self.max_deviation {
                let mut finding = build_fiscal_finding(
                    BENFORD_ALERT_METADATA,
                    format!(
                        "首位数字{}的出现频率为{:.1}%，理论值为{:.1}%，偏差{:.1}%超过阈值{:.1}%。",
                        index + 1,
                        actual_pct,
                        expected_pct,
                        deviation,
                        self.max_deviation
                    ),
                    Vec::new(),
                );
                if deviation > self.max_deviation * 2.0 {
                    finding.severity = Severity::Error;
                    finding.risk_level = FindingRiskLevel::High;
                }
                findings.push(finding);
            }
        }

        findings.push(build_fiscal_finding(
            BENFORD_SUMMARY_METADATA,
            format!(
                "Benford 分布概览（共{}笔）：{}",
                total,
                summary_lines.join("；")
            ),
            Vec::new(),
        ));
        Ok(findings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_digit() {
        assert_eq!(first_digit(1234.0), Some(1));
        assert_eq!(first_digit(567.89), Some(5));
        assert_eq!(first_digit(0.5), None);
    }

    #[test]
    fn test_benford_expected_sums_to_one() {
        let sum: f64 = benford_expected().iter().sum();
        assert!((sum - 1.0).abs() < 0.01);
    }
}
