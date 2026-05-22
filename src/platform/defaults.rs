use crate::models::{AuditReport, Transaction};
use chrono::{Local, NaiveDate};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::BTreeMap;

use super::{DataSourceTemplate, DaySummary, ReportTemplate, ScenarioPreset};

pub fn summarize_by_date(transactions: &[Transaction]) -> Vec<DaySummary> {
    let mut map: BTreeMap<String, (Decimal, Decimal, usize)> = BTreeMap::new();
    for txn in transactions {
        let key = txn.date.to_string();
        let entry = map.entry(key).or_insert((Decimal::ZERO, Decimal::ZERO, 0));
        entry.0 += txn.debit;
        entry.1 += txn.credit;
        entry.2 += 1;
    }

    map.into_iter()
        .map(|(date, (debit, credit, count))| DaySummary {
            date,
            total_debit: debit.to_string(),
            total_credit: credit.to_string(),
            count,
        })
        .collect()
}

pub fn build_demo_transactions() -> Vec<Transaction> {
    vec![
        Transaction {
            row_index: 1,
            date: NaiveDate::from_ymd_opt(2025, 12, 28).unwrap(),
            voucher_id: "FY-001".to_string(),
            account_code: "1002".to_string(),
            account_name: "银行存款".to_string(),
            description: "专项资金拨付".to_string(),
            debit: dec!(0),
            credit: dec!(210000.00),
        },
        Transaction {
            row_index: 2,
            date: NaiveDate::from_ymd_opt(2025, 12, 28).unwrap(),
            voucher_id: "FY-001".to_string(),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "专项资金拨付".to_string(),
            debit: dec!(200000.00),
            credit: dec!(0),
        },
        Transaction {
            row_index: 3,
            date: NaiveDate::from_ymd_opt(2025, 12, 29).unwrap(),
            voucher_id: "FY-002".to_string(),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "专项资金集中支付".to_string(),
            debit: dec!(120000.00),
            credit: dec!(0),
        },
        Transaction {
            row_index: 4,
            date: NaiveDate::from_ymd_opt(2025, 12, 29).unwrap(),
            voucher_id: "FY-002".to_string(),
            account_code: "1002".to_string(),
            account_name: "银行存款".to_string(),
            description: "专项资金集中支付".to_string(),
            debit: dec!(0),
            credit: dec!(120000.00),
        },
        Transaction {
            row_index: 5,
            date: NaiveDate::from_ymd_opt(2025, 12, 30).unwrap(),
            voucher_id: "FY-003".to_string(),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "年末突击列支".to_string(),
            debit: dec!(100000.00),
            credit: dec!(0),
        },
        Transaction {
            row_index: 6,
            date: NaiveDate::from_ymd_opt(2025, 12, 30).unwrap(),
            voucher_id: "FY-003".to_string(),
            account_code: "1002".to_string(),
            account_name: "银行存款".to_string(),
            description: "年末突击列支".to_string(),
            debit: dec!(0),
            credit: dec!(100000.00),
        },
        Transaction {
            row_index: 7,
            date: NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            voucher_id: "FY-004".to_string(),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "年末专项资金追加支付".to_string(),
            debit: dec!(100000.00),
            credit: dec!(0),
        },
        Transaction {
            row_index: 8,
            date: NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            voucher_id: "FY-004".to_string(),
            account_code: "1002".to_string(),
            account_name: "银行存款".to_string(),
            description: "年末专项资金追加支付".to_string(),
            debit: dec!(0),
            credit: dec!(100000.00),
        },
        Transaction {
            row_index: 9,
            date: NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            voucher_id: "FY-005".to_string(),
            account_code: "6602".to_string(),
            account_name: "财政专项支出".to_string(),
            description: "专项资金重复支付疑点".to_string(),
            debit: dec!(100000.00),
            credit: dec!(0),
        },
        Transaction {
            row_index: 10,
            date: NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            voucher_id: "FY-005".to_string(),
            account_code: "1002".to_string(),
            account_name: "银行存款".to_string(),
            description: "专项资金重复支付疑点".to_string(),
            debit: dec!(0),
            credit: dec!(100000.00),
        },
    ]
}

pub fn default_scenarios() -> Vec<ScenarioPreset> {
    vec![
        ScenarioPreset {
            id: "fiscal-supervision".to_string(),
            name: "财政监督".to_string(),
            description: "围绕预算执行、专项资金、集中支付和年末突击列支开展财政监督核查。"
                .to_string(),
            focus: "重点关注大额专项支出、重复支付、年末集中支付和账务勾稽异常。".to_string(),
            report_template_id: "gov-standard".to_string(),
        },
        ScenarioPreset {
            id: "state-owned-capital".to_string(),
            name: "国资监管".to_string(),
            description: "作为次级样板保留，用于展示资本安全和关联交易核查能力。".to_string(),
            focus: "侧重资本流向和国资风险，不作为当前默认演示入口。".to_string(),
            report_template_id: "state-capital".to_string(),
        },
        ScenarioPreset {
            id: "procurement-expense".to_string(),
            name: "采购审计".to_string(),
            description: "作为次级样板保留，用于展示重复支付和拆分采购等问题识别能力。".to_string(),
            focus: "侧重采购与费用合规，不作为当前默认演示入口。".to_string(),
            report_template_id: "procurement".to_string(),
        },
    ]
}

pub fn default_report_templates() -> Vec<ReportTemplate> {
    vec![
        ReportTemplate {
            id: "gov-standard".to_string(),
            name: "财政监督标准报告".to_string(),
            institution_name: "AuditLens 财政监督工作台".to_string(),
            cover_title: "财政监督审计报告".to_string(),
            watermark: "CONFIDENTIAL".to_string(),
            classification: "财政监督内部使用".to_string(),
            active: true,
        },
        ReportTemplate {
            id: "state-capital".to_string(),
            name: "国资监管报告".to_string(),
            institution_name: "AuditLens 国资监管样板".to_string(),
            cover_title: "国资风险核查报告".to_string(),
            watermark: "SENSITIVE".to_string(),
            classification: "国资监管内部使用".to_string(),
            active: true,
        },
        ReportTemplate {
            id: "procurement".to_string(),
            name: "采购审计报告".to_string(),
            institution_name: "AuditLens 采购审计样板".to_string(),
            cover_title: "采购合规核查报告".to_string(),
            watermark: "CONFIDENTIAL".to_string(),
            classification: "采购审计内部使用".to_string(),
            active: true,
        },
    ]
}

pub fn default_data_sources() -> Vec<DataSourceTemplate> {
    vec![
        DataSourceTemplate {
            id: "mysql-transactions".to_string(),
            name: "MySQL Transactions".to_string(),
            description: "Whitelisted query for standard transaction ledger import.".to_string(),
            db_type: "mysql".to_string(),
            query: "SELECT date, voucher_id, account_code, account_name, description, debit, credit FROM {table} ORDER BY date".to_string(),
            allowed_tables: vec!["transactions".to_string(), "ledger_entries".to_string()],
            active: true,
        },
        DataSourceTemplate {
            id: "postgres-transactions".to_string(),
            name: "PostgreSQL Transactions".to_string(),
            description: "Whitelisted query for standard transaction ledger import.".to_string(),
            db_type: "postgres".to_string(),
            query: "SELECT date, voucher_id, account_code, account_name, description, debit, credit FROM {table} ORDER BY date".to_string(),
            allowed_tables: vec!["transactions".to_string(), "ledger_entries".to_string()],
            active: true,
        },
    ]
}

pub fn risk_level(report: &AuditReport) -> String {
    report.highest_risk_level().to_string()
}

pub fn now_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
