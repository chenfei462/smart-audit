use super::v2::{
    AccountClassificationRecord, FundingSourceRecord, ImportQualityReport, LedgerEntryRecord,
    LedgerLinkageSummary, PaymentLinkageSummary, PlatformTaskFinding, QualityCheck,
    QualitySeverity, SourceDocumentRecord, SupplierRecord, VoucherDatasetKind,
    VoucherLedgerTaskDetail,
};
use anyhow::{Context, Result};
use calamine::{open_workbook_auto, Reader};
use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VoucherImportRecord {
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
    pub payment_order_no: Option<String>,
    pub treasury_voucher_no: Option<String>,
    pub voucher_no: String,
    pub account_code: String,
    pub account_name: String,
    pub debit_amount: String,
    pub credit_amount: String,
    pub booked_at: String,
    pub source_row: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VoucherBatchPayload {
    pub title: Option<String>,
    pub dataset_kind: VoucherDatasetKind,
    pub records: Vec<VoucherImportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VoucherPreviewResult {
    pub title: String,
    pub primary_subject: String,
    pub dataset_kind: VoucherDatasetKind,
    pub records: Vec<VoucherImportRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
}

pub fn preview_voucher_csv_bytes(
    _file_name: &str,
    bytes: &[u8],
    dataset_kind: VoucherDatasetKind,
    title: Option<&str>,
) -> Result<VoucherPreviewResult> {
    let decoded = decode_text(bytes);
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(decoded.as_bytes());
    let headers = reader.headers().context("failed to read voucher headers")?;
    let header_row = headers
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.context("failed to read voucher row")?;
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

pub fn preview_voucher_excel_bytes(
    file_name: &str,
    bytes: &[u8],
    dataset_kind: VoucherDatasetKind,
    title: Option<&str>,
) -> Result<VoucherPreviewResult> {
    let extension = if file_name.to_ascii_lowercase().ends_with(".xls") {
        ".xls"
    } else {
        ".xlsx"
    };
    let temp_path = std::env::temp_dir().join(format!(
        "auditlens_voucher_{}{}",
        uuid::Uuid::new_v4(),
        extension
    ));
    std::fs::write(&temp_path, bytes).context("failed to write temp voucher spreadsheet")?;
    let workbook_result = open_workbook_auto(&temp_path);
    let _ = std::fs::remove_file(&temp_path);
    let mut workbook = workbook_result.context("failed to open voucher spreadsheet")?;
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

pub fn preview_voucher_batch(payload: VoucherBatchPayload) -> VoucherPreviewResult {
    validate_records(
        payload.records,
        payload.dataset_kind,
        payload.title.as_deref(),
    )
}

pub fn evaluate_voucher_rules(records: &[VoucherImportRecord]) -> Vec<PlatformTaskFinding> {
    let mut findings = Vec::new();
    let mut grouped = HashMap::<String, (Decimal, Decimal)>::new();
    let mut duplicates = HashSet::<String>::new();

    for record in records {
        let debit = parse_decimal(&record.debit_amount).unwrap_or(Decimal::ZERO);
        let credit = parse_decimal(&record.credit_amount).unwrap_or(Decimal::ZERO);
        let entry = grouped
            .entry(record.voucher_no.clone())
            .or_insert((Decimal::ZERO, Decimal::ZERO));
        entry.0 += debit;
        entry.1 += credit;

        let key = format!(
            "{}|{}|{}|{}|{}",
            record.voucher_no,
            record.account_code,
            record.debit_amount,
            record.credit_amount,
            record.booked_at
        );
        if !duplicates.insert(key) {
            findings.push(build_finding(
                "LEDGER-DUP-001",
                "重复记账 / 重复支付入账",
                "凭证规则",
                "Medium",
                format!("凭证 {} 存在重复分录", record.voucher_no),
                "相同凭证号、科目和金额重复出现，需要核对是否重复入账。",
                "核对凭证附件、记账凭证和支付回单。",
                format!("科目 {} / 日期 {}", record.account_code, record.booked_at),
            ));
        }

        if record.function_classification_code.is_some()
            ^ record.economic_classification_code.is_some()
        {
            findings.push(build_finding(
                "LEDGER-CLASS-001",
                "功能分类 / 经济分类偏离",
                "凭证规则",
                "Medium",
                format!("凭证 {} 的分类字段不完整", record.voucher_no),
                "会计联查需要同时具备功能分类和经济分类，缺一会影响预算勾稽。",
                "补录或校正功能分类、经济分类字段。",
                format!(
                    "功能分类 {:?} / 经济分类 {:?}",
                    record.function_classification_code, record.economic_classification_code
                ),
            ));
        }
    }

    for (voucher_no, (debit, credit)) in grouped {
        if debit != credit {
            findings.push(build_finding(
                "LEDGER-BALANCE-001",
                "借贷不平",
                "凭证规则",
                "High",
                format!(
                    "凭证 {} 借方 {} 与贷方 {} 不一致",
                    voucher_no, debit, credit
                ),
                "凭证明细借贷不平意味着入账链条存在异常。",
                "核对会计凭证、附件和总账导出结果。",
                format!("凭证号 {}", voucher_no),
            ));
        }
    }

    findings
}

pub fn build_voucher_task_detail(
    preview: &VoucherPreviewResult,
    entries: Vec<LedgerEntryRecord>,
    suppliers: Vec<SupplierRecord>,
    funding_sources: Vec<FundingSourceRecord>,
    account_classifications: Vec<AccountClassificationRecord>,
    source_documents: Vec<SourceDocumentRecord>,
    payment_linkage_summary: PaymentLinkageSummary,
    ledger_linkage_summary: LedgerLinkageSummary,
) -> VoucherLedgerTaskDetail {
    VoucherLedgerTaskDetail {
        dataset_kind: preview.dataset_kind,
        entries,
        suppliers,
        funding_sources,
        account_classifications,
        source_documents,
        quality_report: preview.quality_report.clone(),
        applicable_rule_sets: preview.applicable_rule_sets.clone(),
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
        ("supplier_name", vec!["供应商名称", "对方单位"]),
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
        ("payment_order_no", vec!["支付单号", "支付凭证号"]),
        ("treasury_voucher_no", vec!["国库凭证号", "电子支付凭证号"]),
        ("voucher_no", vec!["凭证号", "记账凭证号"]),
        ("account_code", vec!["科目编码", "会计科目编码"]),
        ("account_name", vec!["科目名称", "会计科目名称"]),
        ("debit_amount", vec!["借方金额", "借方"]),
        ("credit_amount", vec!["贷方金额", "贷方"]),
        ("booked_at", vec!["记账日期", "入账日期"]),
    ])
}

fn records_from_grid(headers: &[String], rows: &[Vec<String>]) -> Vec<VoucherImportRecord> {
    let aliases = header_aliases();
    let mut indexes = HashMap::<String, usize>::new();
    for (index, header) in headers.iter().enumerate() {
        indexes.insert(normalize_key(header), index);
    }

    rows.iter()
        .enumerate()
        .map(|(index, row)| VoucherImportRecord {
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
            contract_no: optional_string(value_from_cells(row, &indexes, &aliases, "contract_no")),
            payment_order_no: optional_string(value_from_cells(
                row,
                &indexes,
                &aliases,
                "payment_order_no",
            )),
            treasury_voucher_no: optional_string(value_from_cells(
                row,
                &indexes,
                &aliases,
                "treasury_voucher_no",
            )),
            voucher_no: value_from_cells(row, &indexes, &aliases, "voucher_no"),
            account_code: value_from_cells(row, &indexes, &aliases, "account_code"),
            account_name: value_from_cells(row, &indexes, &aliases, "account_name"),
            debit_amount: value_from_cells(row, &indexes, &aliases, "debit_amount"),
            credit_amount: value_from_cells(row, &indexes, &aliases, "credit_amount"),
            booked_at: value_from_cells(row, &indexes, &aliases, "booked_at"),
            source_row: index + 2,
        })
        .collect()
}

fn validate_records(
    records: Vec<VoucherImportRecord>,
    dataset_kind: VoucherDatasetKind,
    title: Option<&str>,
) -> VoucherPreviewResult {
    let mut accepted = Vec::new();
    let mut checks = Vec::new();

    for record in records {
        if record.voucher_no.trim().is_empty() {
            checks.push(error_check(
                "voucher_missing_voucher_no",
                "voucher_no",
                record.source_row,
                "缺少凭证号",
            ));
            continue;
        }
        if record.account_code.trim().is_empty() {
            checks.push(error_check(
                "voucher_missing_account_code",
                "account_code",
                record.source_row,
                "缺少科目编码",
            ));
            continue;
        }
        if parse_decimal(&record.debit_amount).is_none()
            || parse_decimal(&record.credit_amount).is_none()
        {
            checks.push(error_check(
                "voucher_invalid_amount",
                "debit_amount",
                record.source_row,
                "借贷金额格式不正确",
            ));
            continue;
        }
        if normalize_date(&record.booked_at).is_none() {
            checks.push(error_check(
                "voucher_invalid_date",
                "booked_at",
                record.source_row,
                "记账日期格式不正确",
            ));
            continue;
        }
        accepted.push(record);
    }

    let primary_subject = accepted
        .first()
        .map(|item| item.voucher_no.clone())
        .unwrap_or_else(|| "会计凭证".to_string());
    let title = title
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| match dataset_kind {
            VoucherDatasetKind::VoucherEntryDetail => "凭证明细导入".to_string(),
            VoucherDatasetKind::GeneralLedgerExport => "总账导出导入".to_string(),
        });

    VoucherPreviewResult {
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
        applicable_rule_sets: vec!["voucher_rules".to_string(), "chain_rules".to_string()],
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

fn parse_decimal(value: &str) -> Option<Decimal> {
    Decimal::from_str(value.trim()).ok()
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
    fn previews_voucher_batch_and_hits_balance_rule() {
        let preview = preview_voucher_batch(VoucherBatchPayload {
            title: Some("凭证导入".to_string()),
            dataset_kind: VoucherDatasetKind::VoucherEntryDetail,
            records: vec![VoucherImportRecord {
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
                payment_order_no: Some("PAY-001".to_string()),
                treasury_voucher_no: Some("TV-001".to_string()),
                voucher_no: "记-001".to_string(),
                account_code: "500101".to_string(),
                account_name: "业务活动费用".to_string(),
                debit_amount: "100".to_string(),
                credit_amount: "90".to_string(),
                booked_at: "2026-04-21".to_string(),
                source_row: 1,
            }],
        });

        let findings = evaluate_voucher_rules(&preview.records);
        assert_eq!(preview.records.len(), 1);
        assert!(findings
            .iter()
            .any(|item| item.rule_code == "LEDGER-BALANCE-001"));
    }
}
