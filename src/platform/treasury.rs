use super::v2::{
    AccountClassificationRecord, ContractLinkageSummary, FundingSourceRecord, ImportQualityReport,
    PlatformTaskFinding, ProcurementContractRecord, QualityCheck, QualitySeverity,
    SourceDocumentRecord, SupplierRecord, TreasuryDatasetKind, TreasuryPaymentTaskDetail,
    TreasuryPaymentVoucherRecord,
};
use anyhow::{Context, Result};
use calamine::{open_workbook_auto, Reader};
use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TreasuryPaymentImportRecord {
    pub budget_unit_name: Option<String>,
    pub budget_project_name: Option<String>,
    pub budget_project_id: Option<String>,
    pub procurement_project_id: Option<String>,
    pub supplier_name: Option<String>,
    pub funding_source_name: Option<String>,
    pub function_classification_code: Option<String>,
    pub economic_classification_code: Option<String>,
    pub indicator_document_no: Option<String>,
    pub project_catalog_id: Option<String>,
    pub contract_no: Option<String>,
    pub payment_order_no: String,
    pub treasury_voucher_no: Option<String>,
    pub amount: String,
    pub paid_at: String,
    pub counterparty: String,
    pub source_row: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TreasuryBatchPayload {
    pub title: Option<String>,
    pub dataset_kind: TreasuryDatasetKind,
    pub records: Vec<TreasuryPaymentImportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TreasuryPreviewResult {
    pub title: String,
    pub primary_subject: String,
    pub dataset_kind: TreasuryDatasetKind,
    pub records: Vec<TreasuryPaymentImportRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
}

pub fn preview_treasury_csv_bytes(
    _file_name: &str,
    bytes: &[u8],
    dataset_kind: TreasuryDatasetKind,
    title: Option<&str>,
) -> Result<TreasuryPreviewResult> {
    let decoded = decode_text(bytes);
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(decoded.as_bytes());
    let headers = reader
        .headers()
        .context("failed to read treasury headers")?;
    let header_row = headers
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.context("failed to read treasury row")?;
        rows.push(
            row.iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        );
    }
    Ok(validate_records(
        records_from_grid(&header_row, &rows),
        dataset_kind,
        title,
    ))
}

pub fn preview_treasury_excel_bytes(
    file_name: &str,
    bytes: &[u8],
    dataset_kind: TreasuryDatasetKind,
    title: Option<&str>,
) -> Result<TreasuryPreviewResult> {
    let extension = if file_name.to_ascii_lowercase().ends_with(".xls") {
        ".xls"
    } else {
        ".xlsx"
    };
    let temp_path = std::env::temp_dir().join(format!(
        "auditlens_treasury_{}{}",
        uuid::Uuid::new_v4(),
        extension
    ));
    std::fs::write(&temp_path, bytes).context("failed to write temp treasury spreadsheet")?;
    let workbook_result = open_workbook_auto(&temp_path);
    let _ = std::fs::remove_file(&temp_path);
    let mut workbook = workbook_result.context("failed to open treasury spreadsheet")?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .context("spreadsheet has no sheets")?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .context("failed to read first worksheet")?;

    let mut rows = range.rows();
    let headers = rows
        .next()
        .context("spreadsheet must include a header row")?
        .iter()
        .map(|cell| cell.to_string())
        .collect::<Vec<_>>();
    let body = rows
        .map(|row| row.iter().map(|cell| cell.to_string()).collect::<Vec<_>>())
        .collect::<Vec<_>>();

    Ok(validate_records(
        records_from_grid(&headers, &body),
        dataset_kind,
        title,
    ))
}

pub fn preview_treasury_batch(payload: TreasuryBatchPayload) -> TreasuryPreviewResult {
    validate_records(
        payload.records,
        payload.dataset_kind,
        payload.title.as_deref(),
    )
}

pub fn evaluate_payment_rules(records: &[TreasuryPaymentImportRecord]) -> Vec<PlatformTaskFinding> {
    let mut findings = Vec::new();

    for record in records {
        if record
            .budget_project_id
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
            && record
                .indicator_document_no
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
            && record
                .project_catalog_id
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            findings.push(build_finding(
                "PAY-BUDGET-001",
                "无预算项目支付",
                "支付规则",
                "High",
                format!(
                    "支付单 {} 缺少预算项目、指标文号或项目库 ID",
                    record.payment_order_no
                ),
                "国库支付应能追溯到预算项目或预算指标。",
                "补录预算项目、指标文号或项目库 ID，并核对预算来源。",
                format!(
                    "合同 {:?} / 收款单位 {}",
                    record.contract_no, record.counterparty
                ),
            ));
        }
    }

    let mut grouped = HashMap::<String, Vec<&TreasuryPaymentImportRecord>>::new();
    for record in records {
        grouped
            .entry(record.counterparty.clone())
            .or_default()
            .push(record);
    }
    for (counterparty, group) in grouped {
        if group.len() >= 3 {
            findings.push(build_finding(
                "PAY-VENDOR-001",
                "同供应商短期密集支付",
                "支付规则",
                "Medium",
                format!(
                    "收款单位 {} 在导入样本中出现 {} 笔支付",
                    counterparty,
                    group.len()
                ),
                "同供应商短期内多笔支付需要核对付款节奏与合同进度。",
                "复核付款计划、合同条款和支付依据。",
                format!(
                    "支付单号 {}",
                    group
                        .iter()
                        .map(|item| item.payment_order_no.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ));
        }
    }

    findings
}

pub fn build_treasury_task_detail(
    preview: &TreasuryPreviewResult,
    vouchers: Vec<TreasuryPaymentVoucherRecord>,
    contracts: Vec<ProcurementContractRecord>,
    suppliers: Vec<SupplierRecord>,
    funding_sources: Vec<FundingSourceRecord>,
    account_classifications: Vec<AccountClassificationRecord>,
    source_documents: Vec<SourceDocumentRecord>,
    contract_linkage_summary: ContractLinkageSummary,
    payment_linkage_summary: super::v2::PaymentLinkageSummary,
    ledger_linkage_summary: super::v2::LedgerLinkageSummary,
) -> TreasuryPaymentTaskDetail {
    TreasuryPaymentTaskDetail {
        dataset_kind: preview.dataset_kind,
        vouchers,
        contracts,
        suppliers,
        funding_sources,
        account_classifications,
        source_documents,
        quality_report: preview.quality_report.clone(),
        applicable_rule_sets: preview.applicable_rule_sets.clone(),
        contract_linkage_summary,
        payment_linkage_summary,
        ledger_linkage_summary,
    }
}

fn decode_text(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => {
            let (decoded, _, _) = encoding_rs::GBK.decode(bytes);
            decoded.into_owned()
        }
    }
}

fn header_aliases() -> HashMap<&'static str, Vec<&'static str>> {
    HashMap::from([
        ("budget_unit_name", vec!["预算单位", "单位名称", "部门名称"]),
        ("budget_project_name", vec!["预算项目", "项目名称"]),
        ("budget_project_id", vec!["预算项目ID", "budget_project_id"]),
        ("supplier_name", vec!["供应商名称", "收款单位", "收款人"]),
        ("funding_source_name", vec!["资金来源"]),
        (
            "function_classification_code",
            vec!["功能分类编码", "功能科目编码"],
        ),
        (
            "economic_classification_code",
            vec!["经济分类编码", "经济科目编码"],
        ),
        ("indicator_document_no", vec!["指标文号"]),
        ("project_catalog_id", vec!["项目库ID", "项目库编号"]),
        ("contract_no", vec!["合同编号", "合同号"]),
        (
            "payment_order_no",
            vec!["支付单号", "支付凭证号", "支付流水号"],
        ),
        ("treasury_voucher_no", vec!["国库凭证号", "电子支付凭证号"]),
        ("amount", vec!["支付金额", "金额"]),
        ("paid_at", vec!["支付日期", "付款日期"]),
        ("counterparty", vec!["收款单位", "收款人", "对方单位"]),
    ])
}

fn records_from_grid(headers: &[String], rows: &[Vec<String>]) -> Vec<TreasuryPaymentImportRecord> {
    let aliases = header_aliases();
    let mut indexes = HashMap::<String, usize>::new();
    for (index, header) in headers.iter().enumerate() {
        let normalized = normalize_key(header);
        indexes.insert(normalized, index);
    }

    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let source_row = index + 2;
            TreasuryPaymentImportRecord {
                budget_unit_name: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "budget_unit_name",
                )),
                budget_project_name: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "budget_project_name",
                )),
                budget_project_id: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "budget_project_id",
                )),
                procurement_project_id: None,
                supplier_name: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "supplier_name",
                )),
                funding_source_name: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "funding_source_name",
                )),
                function_classification_code: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "function_classification_code",
                )),
                economic_classification_code: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "economic_classification_code",
                )),
                indicator_document_no: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "indicator_document_no",
                )),
                project_catalog_id: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "project_catalog_id",
                )),
                contract_no: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "contract_no",
                )),
                payment_order_no: value_from_cells(row, &indexes, &aliases, "payment_order_no"),
                treasury_voucher_no: optional_string(value_from_cells(
                    row,
                    &indexes,
                    &aliases,
                    "treasury_voucher_no",
                )),
                amount: value_from_cells(row, &indexes, &aliases, "amount"),
                paid_at: value_from_cells(row, &indexes, &aliases, "paid_at"),
                counterparty: value_from_cells(row, &indexes, &aliases, "counterparty"),
                source_row,
            }
        })
        .collect()
}

fn validate_records(
    records: Vec<TreasuryPaymentImportRecord>,
    dataset_kind: TreasuryDatasetKind,
    title: Option<&str>,
) -> TreasuryPreviewResult {
    let mut accepted = Vec::new();
    let mut checks = Vec::new();
    let mut seen = HashSet::<String>::new();

    for record in records {
        let duplicate_key = format!(
            "{}|{}|{}",
            record.payment_order_no,
            record.treasury_voucher_no.clone().unwrap_or_default(),
            record.amount
        );
        if record.payment_order_no.trim().is_empty() {
            checks.push(error_check(
                "treasury_missing_payment_order",
                "payment_order_no",
                record.source_row,
                "缺少支付单号",
            ));
            continue;
        }
        if record.amount.trim().is_empty() {
            checks.push(error_check(
                "treasury_missing_amount",
                "amount",
                record.source_row,
                "缺少支付金额",
            ));
            continue;
        }
        if Decimal::from_str(record.amount.trim()).is_err() {
            checks.push(error_check(
                "treasury_invalid_amount",
                "amount",
                record.source_row,
                "支付金额格式不正确",
            ));
            continue;
        }
        if normalize_date(&record.paid_at).is_none() {
            checks.push(error_check(
                "treasury_invalid_date",
                "paid_at",
                record.source_row,
                "支付日期格式不正确",
            ));
            continue;
        }
        if !seen.insert(duplicate_key) {
            checks.push(warn_check(
                "treasury_duplicate_row",
                "payment_order_no",
                record.source_row,
                "检测到重复支付行",
            ));
        }
        accepted.push(record);
    }

    let primary_subject = accepted
        .first()
        .map(|item| item.counterparty.clone())
        .unwrap_or_else(|| "国库支付".to_string());
    let title = title
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| match dataset_kind {
            TreasuryDatasetKind::TreasuryPaymentDetail => "国库支付导入".to_string(),
            TreasuryDatasetKind::ElectronicPaymentVoucher => "电子支付凭证导入".to_string(),
        });

    TreasuryPreviewResult {
        title,
        primary_subject,
        dataset_kind,
        records: accepted.clone(),
        quality_report: ImportQualityReport {
            total_rows: accepted.len()
                + checks
                    .iter()
                    .filter(|item| item.severity == QualitySeverity::Error)
                    .count(),
            accepted_rows: accepted.len(),
            rejected_rows: checks
                .iter()
                .filter(|item| item.severity == QualitySeverity::Error)
                .count(),
            checks,
        },
        applicable_rule_sets: vec!["payment_rules".to_string(), "chain_rules".to_string()],
    }
}

fn value_from_cells(
    row: &[String],
    indexes: &HashMap<String, usize>,
    aliases: &HashMap<&'static str, Vec<&'static str>>,
    key: &str,
) -> String {
    for alias in aliases.get(key).into_iter().flatten() {
        if let Some(index) = indexes.get(&normalize_key(alias)) {
            if let Some(value) = row.get(*index) {
                return value.trim().to_string();
            }
        }
    }
    String::new()
}

fn normalize_key(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(' ', "")
        .replace('_', "")
}

fn optional_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_date(value: &str) -> Option<String> {
    let trimmed = value.trim().replace('/', "-").replace('.', "-");
    for format in ["%Y-%m-%d", "%Y-%m", "%Y%m%d"] {
        if let Ok(date) = NaiveDate::parse_from_str(&trimmed, format) {
            return Some(date.format("%Y-%m-%d").to_string());
        }
    }
    if trimmed.len() == 7 {
        return Some(format!("{}-01", trimmed));
    }
    None
}

fn error_check(code: &str, field: &str, row_number: usize, message: &str) -> QualityCheck {
    QualityCheck {
        code: code.to_string(),
        severity: QualitySeverity::Error,
        message: message.to_string(),
        field: Some(field.to_string()),
        row_number: Some(row_number),
    }
}

fn warn_check(code: &str, field: &str, row_number: usize, message: &str) -> QualityCheck {
    QualityCheck {
        code: code.to_string(),
        severity: QualitySeverity::Warning,
        message: message.to_string(),
        field: Some(field.to_string()),
        row_number: Some(row_number),
    }
}

fn build_finding(
    rule_code: &str,
    rule_name: &str,
    rule_category: &str,
    risk_level: &str,
    summary: String,
    audit_rationale: &str,
    recommended_action: &str,
    evidence_summary: String,
) -> PlatformTaskFinding {
    PlatformTaskFinding {
        id: uuid::Uuid::new_v4().to_string(),
        rule_code: rule_code.to_string(),
        rule_name: rule_name.to_string(),
        rule_category: rule_category.to_string(),
        risk_level: risk_level.to_string(),
        summary,
        audit_rationale: audit_rationale.to_string(),
        recommended_action: recommended_action.to_string(),
        evidence_summary,
        severity_reason: None,
        missing_evidence: Vec::new(),
        recommended_next_data: Vec::new(),
        finding_disposition: None,
        finding_status: "open".to_string(),
        assignee: None,
        disposition_note: None,
        disposition_priority: None,
        disposition_outcome: None,
        remediation_due_at: None,
        reminder_flag: false,
        disposed_at: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_treasury_batch_and_hits_budget_rule() {
        let preview = preview_treasury_batch(TreasuryBatchPayload {
            title: Some("支付导入".to_string()),
            dataset_kind: TreasuryDatasetKind::TreasuryPaymentDetail,
            records: vec![TreasuryPaymentImportRecord {
                budget_unit_name: Some("某财政局".to_string()),
                budget_project_name: Some("项目 A".to_string()),
                budget_project_id: None,
                procurement_project_id: None,
                supplier_name: Some("供应商 A".to_string()),
                funding_source_name: None,
                function_classification_code: None,
                economic_classification_code: None,
                indicator_document_no: None,
                project_catalog_id: None,
                contract_no: Some("HT-001".to_string()),
                payment_order_no: "PAY-001".to_string(),
                treasury_voucher_no: None,
                amount: "100".to_string(),
                paid_at: "2026-04-20".to_string(),
                counterparty: "供应商 A".to_string(),
                source_row: 1,
            }],
        });

        let findings = evaluate_payment_rules(&preview.records);
        assert_eq!(preview.records.len(), 1);
        assert!(findings
            .iter()
            .any(|item| item.rule_code == "PAY-BUDGET-001"));
    }
}
