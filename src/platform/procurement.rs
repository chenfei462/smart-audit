use super::v2::{
    normalize_jiangsu_region, normalize_public_value, ImportQualityReport, NormalizedRegion,
    PlatformTaskFinding, ProcurementAmountSemanticType, ProcurementStage, QualityCheck,
    QualitySeverity, SourceEvidence, ValueUnit,
};
use anyhow::{Context, Result};
use calamine::{open_workbook_auto, Reader};
use chrono::NaiveDate;
use regex::Regex;
use reqwest::Url;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementImportRecord {
    pub project_name: String,
    pub purchaser_name: String,
    pub announcement_type: String,
    #[serde(default)]
    pub procurement_stage: Option<ProcurementStage>,
    pub project_code: String,
    pub procurement_method: Option<String>,
    pub published_at: Option<String>,
    pub region: Option<String>,
    #[serde(default)]
    pub normalized_region: Option<NormalizedRegion>,
    pub budget_amount: Option<String>,
    pub award_amount: Option<String>,
    #[serde(default)]
    pub budget_amount_unit: Option<ValueUnit>,
    #[serde(default)]
    pub award_amount_unit: Option<ValueUnit>,
    #[serde(default)]
    pub normalized_budget_amount_yuan: Option<String>,
    #[serde(default)]
    pub normalized_award_amount_yuan: Option<String>,
    #[serde(default)]
    pub framework_agreement_flag: bool,
    #[serde(default)]
    pub amount_semantic_type: Option<ProcurementAmountSemanticType>,
    #[serde(default)]
    pub quote_amount: Option<String>,
    #[serde(default)]
    pub quote_amount_unit: Option<ValueUnit>,
    #[serde(default)]
    pub discount_rate: Option<String>,
    #[serde(default)]
    pub unit_price: Option<String>,
    #[serde(default)]
    pub total_award_amount: Option<String>,
    #[serde(default)]
    pub framework_limit_amount: Option<String>,
    #[serde(default)]
    pub framework_limit_unit: Option<ValueUnit>,
    #[serde(default)]
    pub framework_limit_condition: Option<String>,
    #[serde(default)]
    pub package_no: Option<String>,
    #[serde(default)]
    pub package_name: Option<String>,
    #[serde(default)]
    pub package_budget_amount: Option<String>,
    #[serde(default)]
    pub package_award_amount: Option<String>,
    #[serde(default)]
    pub declared_total_award_amount: Option<String>,
    #[serde(default)]
    pub declared_budget_amount: Option<String>,
    #[serde(default)]
    pub ceiling_amount: Option<String>,
    #[serde(default)]
    pub package_sum_amount: Option<String>,
    #[serde(default)]
    pub amount_consistency_status: Option<String>,
    #[serde(default)]
    pub amount_difference_yuan: Option<String>,
    #[serde(default)]
    pub amount_check_reason: Option<String>,
    #[serde(default)]
    pub acceptance_management_flag: Option<bool>,
    #[serde(default)]
    pub acceptance_plan: Option<String>,
    #[serde(default)]
    pub acceptance_opinion: Option<String>,
    #[serde(default)]
    pub acceptance_archive_status: Option<String>,
    #[serde(default)]
    pub acceptance_archive_locator: Option<String>,
    #[serde(default)]
    pub acceptance_issue_summary: Option<String>,
    #[serde(default)]
    pub service_period: Option<String>,
    #[serde(default)]
    pub maintenance_period: Option<String>,
    #[serde(default)]
    pub warranty_period: Option<String>,
    #[serde(default)]
    pub acceptance_standard: Option<String>,
    #[serde(default)]
    pub acceptance_result: Option<String>,
    #[serde(default)]
    pub acceptance_result_locator: Option<String>,
    #[serde(default)]
    pub service_period_source: Option<String>,
    #[serde(default)]
    pub warranty_maintenance_source: Option<String>,
    #[serde(default)]
    pub settlement_basis: Option<String>,
    #[serde(default)]
    pub payment_trigger: Option<String>,
    #[serde(default)]
    pub payment_deadline: Option<String>,
    #[serde(default)]
    pub payment_condition_source: Option<String>,
    #[serde(default)]
    pub contract_performance_period: Option<String>,
    #[serde(default)]
    pub government_purchase_service_flag: Option<bool>,
    #[serde(default)]
    pub joint_bid_allowed_flag: Option<bool>,
    #[serde(default)]
    pub sme_policy_requirement: Option<String>,
    #[serde(default)]
    pub credit_financing_policy_flag: Option<bool>,
    #[serde(default)]
    pub procurement_policy_note: Option<String>,
    #[serde(default)]
    pub procurement_exception_type: Option<String>,
    #[serde(default)]
    pub complaint_decision_no: Option<String>,
    #[serde(default)]
    pub complaint_issue_summary: Option<String>,
    #[serde(default)]
    pub complaint_handling_result: Option<String>,
    #[serde(default)]
    pub allegation_type: Option<String>,
    #[serde(default)]
    pub allegation_outcome: Option<String>,
    #[serde(default)]
    pub confirmed_fact_flag: Option<bool>,
    #[serde(default)]
    pub remedy_action: Option<String>,
    #[serde(default)]
    pub remedy_required_flag: Option<bool>,
    #[serde(default)]
    pub allegation_evidence_weight: Option<u8>,
    #[serde(default)]
    pub allegation_weight_reason: Option<String>,
    #[serde(default)]
    pub false_material_flag: Option<bool>,
    #[serde(default)]
    pub award_invalidated_flag: Option<bool>,
    #[serde(default)]
    pub rebid_required_flag: Option<bool>,
    #[serde(default)]
    pub correction_notice_flag: Option<bool>,
    #[serde(default)]
    pub supervision_penalty_subject: Option<String>,
    #[serde(default)]
    pub affected_package_no: Option<String>,
    #[serde(default)]
    pub penalty_decision_no: Option<String>,
    #[serde(default)]
    pub penalty_basis: Option<String>,
    #[serde(default)]
    pub penalty_basis_article: Option<String>,
    #[serde(default)]
    pub penalty_period: Option<String>,
    #[serde(default)]
    pub market_entry_restriction_scope: Option<String>,
    #[serde(default)]
    pub penalty_subject_type: Option<String>,
    #[serde(default)]
    pub penalty_subject_name: Option<String>,
    #[serde(default)]
    pub credit_repair_status: Option<String>,
    #[serde(default)]
    pub credit_repair_source_url: Option<String>,
    #[serde(default)]
    pub re_participation_review_flag: Option<bool>,
    #[serde(default)]
    pub exception_evidence_category: Option<String>,
    #[serde(default)]
    pub exception_evidence_weight: Option<u8>,
    #[serde(default)]
    pub exception_weight_reason: Option<String>,
    #[serde(default)]
    pub source_region_scope: Option<String>,
    #[serde(default)]
    pub source_province: Option<String>,
    #[serde(default)]
    pub source_city: Option<String>,
    #[serde(default)]
    pub source_region_code: Option<String>,
    #[serde(default)]
    pub publisher_level: Option<String>,
    #[serde(default)]
    pub central_unit_flag: Option<bool>,
    #[serde(default)]
    pub purchaser_region_code: Option<String>,
    #[serde(default)]
    pub procurement_channel: Option<String>,
    #[serde(default)]
    pub platform_order_no: Option<String>,
    #[serde(default)]
    pub item_name: Option<String>,
    #[serde(default)]
    pub item_quantity: Option<String>,
    #[serde(default)]
    pub item_unit: Option<String>,
    #[serde(default)]
    pub unit_price_amount: Option<String>,
    #[serde(default)]
    pub unit_price_unit: Option<ValueUnit>,
    #[serde(default)]
    pub order_total_amount: Option<String>,
    #[serde(default)]
    pub order_total_unit: Option<ValueUnit>,
    #[serde(default)]
    pub procurement_intention_flag: Option<bool>,
    #[serde(default)]
    pub intention_budget_amount: Option<String>,
    #[serde(default)]
    pub intention_expected_procurement_at: Option<String>,
    #[serde(default)]
    pub intention_followup_status: Option<String>,
    #[serde(default)]
    pub batch_month: Option<String>,
    #[serde(default)]
    pub batch_category: Option<String>,
    #[serde(default)]
    pub product_category: Option<String>,
    #[serde(default)]
    pub manufacturer: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub batch_lot_no: Option<String>,
    #[serde(default)]
    pub batch_total_amount: Option<String>,
    #[serde(default)]
    pub lot_award_amount: Option<String>,
    pub supplier_name: Option<String>,
    pub budget_project_id: Option<String>,
    pub contract_no: Option<String>,
    pub contract_published_at: Option<String>,
    pub acceptance_summary: Option<String>,
    pub acceptance_status: Option<String>,
    pub notice_url: Option<String>,
    pub indicator_document_no: Option<String>,
    pub project_catalog_id: Option<String>,
    pub function_classification_code: Option<String>,
    pub economic_classification_code: Option<String>,
    #[serde(default)]
    pub source_evidence: Option<SourceEvidence>,
    pub source_row: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementPreviewResult {
    pub title: String,
    pub primary_subject: String,
    pub records: Vec<ProcurementImportRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementBatchPayload {
    pub title: Option<String>,
    pub records: Vec<ProcurementImportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementFetchRequest {
    pub title: Option<String>,
    pub urls: Vec<String>,
}

pub fn preview_procurement_csv_bytes(
    _file_name: &str,
    bytes: &[u8],
    title: Option<&str>,
) -> Result<ProcurementPreviewResult> {
    let decoded = decode_text(bytes);
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(decoded.as_bytes());
    let headers = reader
        .headers()
        .context("failed to read procurement headers")?;
    let header_row = headers
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    let mut raw_records = Vec::new();
    for (index, row) in reader.records().enumerate() {
        let row = row.context("failed to read procurement row")?;
        let _ = index;
        rows.push(
            row.iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        );
    }

    raw_records.extend(records_from_grid(&header_row, &rows));
    Ok(validate_records(raw_records, title))
}

pub fn preview_procurement_excel_bytes(
    file_name: &str,
    bytes: &[u8],
    title: Option<&str>,
) -> Result<ProcurementPreviewResult> {
    let extension = if file_name.to_ascii_lowercase().ends_with(".xls") {
        ".xls"
    } else {
        ".xlsx"
    };
    let temp_path = std::env::temp_dir().join(format!(
        "auditlens_procurement_{}{}",
        uuid::Uuid::new_v4(),
        extension
    ));
    std::fs::write(&temp_path, bytes).context("failed to write temp procurement spreadsheet")?;
    let workbook_result = open_workbook_auto(&temp_path);
    let _ = std::fs::remove_file(&temp_path);
    let mut workbook = workbook_result.context("failed to open procurement spreadsheet")?;
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
    Ok(validate_records(records_from_grid(&headers, &body), title))
}

pub fn preview_procurement_batch(payload: ProcurementBatchPayload) -> ProcurementPreviewResult {
    validate_records(payload.records, payload.title.as_deref())
}

pub fn parse_procurement_notice_html(
    source_url: &str,
    html: &str,
) -> Option<ProcurementImportRecord> {
    let title = extract_tag_text(html, "h1")
        .or_else(|| extract_tag_text(html, "title"))
        .unwrap_or_default();
    let lines = html_to_lines(html);
    let project_name = extract_first_value(&lines, &["project name", "project_name"])
        .or_else(|| infer_project_name_from_title(&title))
        .unwrap_or_else(|| title.clone());
    let purchaser_name = extract_first_value(&lines, &["purchaser", "purchaser_name"])
        .unwrap_or_else(|| "unknown purchaser".to_string());
    let announcement_type = extract_first_value(&lines, &["announcement_type"])
        .or_else(|| infer_announcement_type(&title))
        .unwrap_or_else(|| "announcement".to_string());
    let project_code = extract_first_value(&lines, &["project_code", "project code"])
        .unwrap_or_else(|| stable_text_id(&project_name));

    if project_name.trim().is_empty()
        || purchaser_name.trim().is_empty()
        || project_code.trim().is_empty()
    {
        return None;
    }

    Some(ProcurementImportRecord {
        project_name,
        purchaser_name,
        announcement_type: announcement_type.clone(),
        procurement_stage: Some(infer_procurement_stage(&announcement_type)),
        project_code,
        procurement_method: extract_first_value(&lines, &["procurement_method", "method"]),
        published_at: extract_first_value(&lines, &["published_at", "date"])
            .and_then(|value| normalize_date(&value).ok().flatten()),
        region: extract_first_value(&lines, &["region", "area"]),
        normalized_region: None,
        budget_amount: extract_first_value(&lines, &["budget_amount", "budget"])
            .and_then(|value| normalize_amount(&value).ok().flatten()),
        award_amount: extract_first_value(&lines, &["award_amount", "award"])
            .and_then(|value| normalize_amount(&value).ok().flatten()),
        budget_amount_unit: None,
        award_amount_unit: None,
        normalized_budget_amount_yuan: None,
        normalized_award_amount_yuan: None,
        framework_agreement_flag: false,
        amount_semantic_type: None,
        quote_amount: None,
        quote_amount_unit: None,
        discount_rate: None,
        unit_price: None,
        total_award_amount: None,
        framework_limit_amount: None,
        framework_limit_unit: None,
        framework_limit_condition: None,
        package_no: None,
        package_name: None,
        package_budget_amount: None,
        package_award_amount: None,
        declared_total_award_amount: None,
        declared_budget_amount: None,
        ceiling_amount: None,
        package_sum_amount: None,
        amount_consistency_status: None,
        amount_difference_yuan: None,
        amount_check_reason: None,
        acceptance_management_flag: None,
        acceptance_plan: None,
        acceptance_opinion: None,
        acceptance_archive_status: None,
        acceptance_archive_locator: None,
        acceptance_issue_summary: None,
        service_period: None,
        maintenance_period: None,
        warranty_period: None,
        acceptance_standard: None,
        acceptance_result: None,
        acceptance_result_locator: None,
        service_period_source: None,
        warranty_maintenance_source: None,
        settlement_basis: None,
        payment_trigger: None,
        payment_deadline: None,
        payment_condition_source: None,
        contract_performance_period: None,
        government_purchase_service_flag: None,
        joint_bid_allowed_flag: None,
        sme_policy_requirement: None,
        credit_financing_policy_flag: None,
        procurement_policy_note: None,
        procurement_exception_type: None,
        complaint_decision_no: None,
        complaint_issue_summary: None,
        complaint_handling_result: None,
        allegation_type: None,
        allegation_outcome: None,
        confirmed_fact_flag: None,
        remedy_action: None,
        remedy_required_flag: None,
        allegation_evidence_weight: None,
        allegation_weight_reason: None,
        false_material_flag: None,
        award_invalidated_flag: None,
        rebid_required_flag: None,
        correction_notice_flag: None,
        supervision_penalty_subject: None,
        affected_package_no: None,
        penalty_decision_no: None,
        penalty_basis: None,
        penalty_basis_article: None,
        penalty_period: None,
        market_entry_restriction_scope: None,
        penalty_subject_type: None,
        penalty_subject_name: None,
        credit_repair_status: None,
        credit_repair_source_url: None,
        re_participation_review_flag: None,
        exception_evidence_category: None,
        exception_evidence_weight: None,
        exception_weight_reason: None,
        source_region_scope: None,
        source_province: None,
        source_city: None,
        source_region_code: None,
        publisher_level: None,
        central_unit_flag: None,
        purchaser_region_code: None,
        procurement_channel: None,
        platform_order_no: None,
        item_name: None,
        item_quantity: None,
        item_unit: None,
        unit_price_amount: None,
        unit_price_unit: None,
        order_total_amount: None,
        order_total_unit: None,
        procurement_intention_flag: None,
        intention_budget_amount: None,
        intention_expected_procurement_at: None,
        intention_followup_status: None,
        batch_month: None,
        batch_category: None,
        product_category: None,
        manufacturer: None,
        model: None,
        batch_lot_no: None,
        batch_total_amount: None,
        lot_award_amount: None,
        supplier_name: extract_first_value(&lines, &["supplier", "supplier_name"]),
        budget_project_id: None,
        contract_no: extract_first_value(&lines, &["contract_no", "contract number"]),
        contract_published_at: extract_first_value(&lines, &["contract_published_at"])
            .and_then(|value| normalize_date(&value).ok().flatten()),
        acceptance_summary: extract_first_value(&lines, &["acceptance_summary"]),
        acceptance_status: extract_first_value(&lines, &["acceptance_status"]),
        notice_url: Some(source_url.to_string()),
        indicator_document_no: None,
        project_catalog_id: None,
        function_classification_code: None,
        economic_classification_code: None,
        source_evidence: Some(SourceEvidence {
            title: Some(title),
            url: Some(source_url.to_string()),
            published_at: None,
            captured_at: None,
            row_number: Some(1),
            parser_version: Some("procurement-html-v1".to_string()),
            page_number: None,
            section_title: Some("procurement notice".to_string()),
            locator_hash: Some(stable_text_id(source_url)),
            raw_excerpt: Some(lines.first().cloned().unwrap_or_default()),
            table_title: None,
            table_row_index: None,
            table_column_name: None,
            paragraph_index: Some(1),
            pdf_table_id: None,
            legal_basis: None,
            legal_basis_article: None,
            decision_paragraph_index: None,
            affected_package_no: None,
            handling_result_locator_hash: None,
            penalty_basis: None,
            penalty_decision_paragraph_index: None,
            credit_record_locator_hash: None,
            market_restriction_locator_hash: None,
        }),
        source_row: 1,
    })
}

pub fn expand_notice_urls_from_list_page(base_url: &str, html: &str) -> Vec<String> {
    let href_pattern = Regex::new(r#"href\s*=\s*[\"']([^\"']+)[\"']"#).unwrap();
    let base = Url::parse(base_url).ok();
    let mut seen = HashSet::new();
    let mut urls = Vec::new();

    for captures in href_pattern.captures_iter(html) {
        let href = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        if !href.contains("/cggg/") || !href.ends_with(".htm") {
            continue;
        }
        let resolved = resolve_url(base.as_ref(), href);
        if seen.insert(resolved.clone()) {
            urls.push(resolved);
        }
    }

    urls
}

fn extract_tag_text(html: &str, tag: &str) -> Option<String> {
    let pattern = format!(r"(?is)<{tag}[^>]*>(.*?)</{tag}>");
    Regex::new(&pattern)
        .ok()?
        .captures(html)
        .and_then(|captures| captures.get(1))
        .map(|item| item.as_str().to_string())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn html_to_lines(html: &str) -> Vec<String> {
    let text = Regex::new(r"(?is)<[^>]+>")
        .map(|regex| {
            regex
                .replace_all(
                    html, "
",
                )
                .to_string()
        })
        .unwrap_or_else(|_| html.to_string());
    text.lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

fn extract_first_value(lines: &[String], keys: &[&str]) -> Option<String> {
    let normalized_keys = keys
        .iter()
        .map(|key| normalize_header(key))
        .collect::<Vec<_>>();
    for line in lines {
        let parts = line.split_once(':').or_else(|| line.split_once('：'));
        if let Some((left, right)) = parts {
            let left_key = normalize_header(left);
            if normalized_keys.iter().any(|key| left_key.contains(key)) {
                let value = right.trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn infer_project_name_from_title(title: &str) -> Option<String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn infer_announcement_type(title: &str) -> Option<String> {
    let title = title.to_ascii_lowercase();
    if title.contains("contract") || title.contains("合同") {
        Some("contract".to_string())
    } else if title.contains("acceptance") || title.contains("验收") {
        Some("acceptance".to_string())
    } else if title.contains("payment") || title.contains("支付") || title.contains("付款") {
        Some("payment".to_string())
    } else if title.contains("award") || title.contains("成交") || title.contains("中标") {
        Some("award".to_string())
    } else {
        Some("announcement".to_string())
    }
}

fn infer_procurement_stage(value: &str) -> ProcurementStage {
    let lower = value.to_ascii_lowercase();
    if lower.contains("pre_announcement")
        || lower.contains("pre-announcement")
        || lower.contains("intention")
        || value.contains("采购意向")
    {
        ProcurementStage::PreAnnouncement
    } else if lower.contains("contract") || value.contains("合同") {
        ProcurementStage::Contract
    } else if lower.contains("acceptance") || value.contains("验收") {
        ProcurementStage::Acceptance
    } else if lower.contains("payment") || value.contains("支付") || value.contains("付款") {
        ProcurementStage::Payment
    } else if lower.contains("award") || value.contains("成交") || value.contains("中标") {
        ProcurementStage::Award
    } else if lower.contains("announcement") || value.contains("公告") {
        ProcurementStage::Announcement
    } else {
        ProcurementStage::Unknown
    }
}

fn stable_text_id(value: &str) -> String {
    let mut hash: u64 = 14_695_981_039_346_656_037;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("h{:016x}", hash)
}

fn resolve_url(base: Option<&Url>, href: &str) -> String {
    if let Some(base) = base {
        if let Ok(url) = base.join(href) {
            return url.to_string();
        }
    }
    Url::parse(href)
        .map(|url| url.to_string())
        .unwrap_or_else(|_| href.to_string())
}

fn normalize_date(value: &str) -> Result<Option<String>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    for pattern in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"] {
        if let Ok(date) = NaiveDate::parse_from_str(trimmed, pattern) {
            return Ok(Some(date.format("%Y-%m-%d").to_string()));
        }
    }
    Ok(Some(trimmed.to_string()))
}

fn is_framework_quote_without_total(record: &ProcurementImportRecord) -> bool {
    record.framework_agreement_flag
        && !matches!(
            record.amount_semantic_type,
            Some(ProcurementAmountSemanticType::AwardTotal)
        )
        && record
            .total_award_amount
            .as_deref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(true)
}

fn is_non_total_amount_semantic(record: &ProcurementImportRecord) -> bool {
    matches!(
        record.amount_semantic_type,
        Some(
            ProcurementAmountSemanticType::DiscountRate
                | ProcurementAmountSemanticType::FrameworkQuote
                | ProcurementAmountSemanticType::FrameworkLimit
                | ProcurementAmountSemanticType::UnitPrice
                | ProcurementAmountSemanticType::ElectronicMarketplaceUnitPrice
                | ProcurementAmountSemanticType::CentralizedBatchTotal
        )
    ) && record
        .total_award_amount
        .as_deref()
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
}

pub fn evaluate_procurement_rules(records: &[ProcurementImportRecord]) -> Vec<PlatformTaskFinding> {
    let mut findings = Vec::new();
    for record in records {
        if has_procurement_exception_evidence(record) {
            let mut finding = build_finding(
                "PROC-COMPLAINT-EXCEPTION-001",
                "Procurement complaint and exception review",
                "procurement_rules",
                "Review",
                format!("project {} has public complaint or supervision exception evidence", record.project_name),
                "Public complaint, correction, rebid and supervision notices are review evidence only until downstream contract, acceptance, payment and internal voucher evidence is complete.",
                "Track correction, rebid, new award, contract, acceptance, payment and voucher evidence before any strong conclusion.",
                format!(
                    "project_code={} decision_no={} penalty_decision_no={} exception_type={} allegation_type={} allegation_outcome={} remedy_action={} confirmed_fact={} exception_weight={} allegation_weight={}",
                    record.project_code,
                    record.complaint_decision_no.as_deref().unwrap_or(""),
                    record.penalty_decision_no.as_deref().unwrap_or(""),
                    record.procurement_exception_type.as_deref().unwrap_or("unknown"),
                    record.allegation_type.as_deref().unwrap_or(""),
                    record.allegation_outcome.as_deref().unwrap_or(""),
                    record.remedy_action.as_deref().unwrap_or(""),
                    record
                        .confirmed_fact_flag
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .exception_evidence_weight
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    record
                        .allegation_evidence_weight
                        .map(|value| value.to_string())
                        .unwrap_or_default()
                ),
            );
            finding.severity_reason = Some(format!(
                "procurement-exception-public-evidence-review-only allegation_outcome={} confirmed_fact={} remedy_action={}",
                record.allegation_outcome.as_deref().unwrap_or("unknown"),
                record
                    .confirmed_fact_flag
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                record.remedy_action.as_deref().unwrap_or("unknown")
            ));
            finding.missing_evidence = vec![
                "penalty_followup".to_string(),
                "credit_restriction".to_string(),
                "credit_repair".to_string(),
                "re_participation".to_string(),
                "correction_notice".to_string(),
                "rebid_notice".to_string(),
                "new_award".to_string(),
                "contract".to_string(),
                "acceptance".to_string(),
                "payment".to_string(),
                "voucher".to_string(),
            ];
            finding.recommended_next_data = vec![
                "penalty_followup".to_string(),
                "credit_restriction_record".to_string(),
                "credit_repair_public_record".to_string(),
                "re_participation_procurement_record".to_string(),
                "correction_notice".to_string(),
                "rebid_notice".to_string(),
                "new_award_notice".to_string(),
                "procurement_contract".to_string(),
                "acceptance_result".to_string(),
                "payment_detail".to_string(),
                "voucher_attachment".to_string(),
            ];
            finding.finding_disposition = Some("review_recommended".to_string());
            findings.push(finding);
        }

        let has_budget_amount = amount_as_decimal(record.budget_amount.as_deref()).is_some();
        let has_budget_linkage = record
            .budget_project_id
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        if !has_budget_amount && !has_budget_linkage {
            let is_framework_quote = is_framework_quote_without_total(record);
            let mut finding = build_finding(
                "PROC-BUDGET-001",
                "Budget control evidence gap",
                "procurement_rules",
                if is_framework_quote { "Info" } else { "Medium" },
                format!("project {} is missing budget evidence", record.project_name),
                "Public procurement data can miss budget context; this is supplemental data advice.",
                "Supplement budget indicator, procurement plan, and announcement-stage budget amount.",
                format!("project_code={} stage={}", record.project_code, record.procurement_stage.unwrap_or_default().as_str()),
            );
            finding.severity_reason = Some(if is_framework_quote {
                "framework-quote-needs-budget-context".to_string()
            } else {
                "missing-budget-control-evidence".to_string()
            });
            finding.missing_evidence = vec!["budget_amount".to_string()];
            finding.recommended_next_data = vec![
                "department_budget_indicator".to_string(),
                "procurement_plan".to_string(),
                "announcement_budget_amount".to_string(),
            ];
            finding.finding_disposition = Some("supplemental_data_only".to_string());
            findings.push(finding);
        }

        if !is_non_total_amount_semantic(record) && !has_procurement_exception_evidence(record) {
            if let (Some(budget), Some(award)) = (
                amount_as_decimal(record.budget_amount.as_deref()),
                amount_as_decimal(record.award_amount.as_deref()),
            ) {
                if award > budget {
                    let mut finding = build_finding(
                        "PROC-STANDARD-001",
                        "Award amount exceeds budget",
                        "procurement_rules",
                        "High",
                        format!("project {} award exceeds budget", record.project_name),
                        "Award amount should not exceed budget control amount without approval evidence.",
                        "Review approval documents, contract amount, and payment evidence.",
                        format!("budget={} award={}", budget, award),
                    );
                    finding.finding_disposition = Some("risk_candidate".to_string());
                    findings.push(finding);
                }
            }
        }

        if let Some(chain_finding) = evaluate_procurement_chain(record) {
            findings.push(chain_finding);
        }
    }

    findings.extend(evaluate_amount_consistency(records));
    for group in detect_split_groups(records) {
        if group.score < 70 {
            continue;
        }
        let mut finding = build_finding(
            "PROC-SPLIT-001",
            "Possible split procurement",
            "procurement_rules",
            if group.score >= 85 { "High" } else { "Medium" },
            format!("{} has {} similar procurement records", group.purchaser_name, group.count),
            "Similar projects in a short window need manual review before any conclusion.",
            "Review demand aggregation, procurement plan, package design, and budget split rationale.",
            format!("project_codes={} score={}", group.project_codes, group.score),
        );
        finding.finding_disposition = Some("risk_candidate".to_string());
        findings.push(finding);
    }
    findings
}

fn evaluate_amount_consistency(records: &[ProcurementImportRecord]) -> Vec<PlatformTaskFinding> {
    let mut groups: HashMap<String, Vec<&ProcurementImportRecord>> = HashMap::new();
    for record in records {
        if record
            .package_no
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
        {
            continue;
        }
        groups
            .entry(amount_consistency_group_key(record))
            .or_default()
            .push(record);
    }

    let mut findings = Vec::new();
    for (_key, group) in groups {
        let package_sum = group
            .iter()
            .filter_map(|record| {
                amount_as_decimal(record.package_award_amount.as_deref())
                    .or_else(|| amount_as_decimal(record.award_amount.as_deref()))
            })
            .sum::<Decimal>();
        if package_sum.is_zero() {
            continue;
        }
        let declared_total = group
            .iter()
            .find_map(|record| amount_as_decimal(record.declared_total_award_amount.as_deref()));
        if let Some(total) = declared_total {
            if (package_sum - total).abs() > Decimal::ZERO {
                let first = group[0];
                let mut finding = build_finding(
                    "PROC-AMOUNT-CONSISTENCY-001",
                    "Package amount consistency review",
                    "procurement_rules",
                    "Info",
                    format!("project {} has package amount consistency difference", first.project_name),
                    "Public notices can mix package amount, total award, budget, and ceiling amount.",
                    "Supplement contract, acceptance, and payment public data before a strong conclusion.",
                    format!("project_code={} package_sum={} declared_total={}", first.project_code, package_sum.normalize(), total.normalize()),
                );
                finding.severity_reason =
                    Some("multi-package-amount-consistency-review".to_string());
                finding.finding_disposition = Some("review_recommended".to_string());
                finding.missing_evidence = vec![
                    "contract_notice".to_string(),
                    "acceptance_notice".to_string(),
                    "payment_publication".to_string(),
                ];
                finding.recommended_next_data = vec![
                    "contract_notice".to_string(),
                    "acceptance_notice".to_string(),
                    "payment_publication".to_string(),
                ];
                findings.push(finding);
            }
        }
    }
    findings
}

fn amount_consistency_group_key(record: &ProcurementImportRecord) -> String {
    let project_key = if record.project_code.trim().is_empty() {
        normalize_project_base(&record.project_name)
    } else {
        record.project_code.trim().to_string()
    };
    format!("{}|{}", record.purchaser_name.trim(), project_key)
}

fn evaluate_procurement_chain(record: &ProcurementImportRecord) -> Option<PlatformTaskFinding> {
    let stage = record
        .procurement_stage
        .unwrap_or_else(|| infer_procurement_stage(&record.announcement_type));
    if matches!(stage, ProcurementStage::Unknown) {
        return None;
    }

    if matches!(stage, ProcurementStage::PreAnnouncement) {
        let mut finding = build_finding(
            "PROC-PRE-ANNOUNCEMENT-001",
            "Procurement intention follow-up discovery",
            "procurement_rules",
            "Info",
            format!("project {} is a procurement intention and needs downstream discovery", record.project_name),
            "Procurement intention is planning-stage public information and is not a substantive violation conclusion.",
            "Search announcement, award, contract, acceptance, and payment public sources.",
            format!("project_code={} stage={}", record.project_code, stage.as_str()),
        );
        finding.severity_reason = Some("pre-announcement-discovery-only".to_string());
        finding.missing_evidence = vec![
            "announcement_notice".to_string(),
            "award_notice".to_string(),
            "contract_notice".to_string(),
            "acceptance_notice".to_string(),
            "payment_publication".to_string(),
        ];
        finding.recommended_next_data = finding.missing_evidence.clone();
        finding.finding_disposition = Some("supplemental_data_only".to_string());
        return Some(finding);
    }

    let mut missing_evidence = Vec::new();
    if matches!(
        stage,
        ProcurementStage::Announcement
            | ProcurementStage::Award
            | ProcurementStage::Contract
            | ProcurementStage::Payment
    ) && record
        .contract_no
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        missing_evidence.push("contract".to_string());
    }
    if matches!(
        stage,
        ProcurementStage::Announcement
            | ProcurementStage::Award
            | ProcurementStage::Contract
            | ProcurementStage::Acceptance
            | ProcurementStage::Payment
    ) && record
        .acceptance_summary
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        missing_evidence.push("acceptance".to_string());
    }
    if missing_evidence.is_empty() {
        return None;
    }

    let mut finding = build_finding(
        "PROC-CHAIN-001",
        "Public procurement chain evidence gap",
        "procurement_rules",
        if matches!(stage, ProcurementStage::Announcement) {
            "Info"
        } else {
            "Medium"
        },
        format!(
            "project {} is missing downstream evidence at {} stage",
            record.project_name,
            stage.label()
        ),
        "Public data gaps are interpreted as supplement advice, not substantive violations.",
        "Search contract, acceptance, and payment public sources before any strong conclusion.",
        format!(
            "project_code={} stage={} missing={:?}",
            record.project_code,
            stage.as_str(),
            missing_evidence
        ),
    );
    finding.severity_reason = Some("public-chain-supplemental-evidence-needed".to_string());
    finding.missing_evidence = missing_evidence;
    finding.recommended_next_data = vec![
        "contract_notice".to_string(),
        "acceptance_notice".to_string(),
        "payment_publication".to_string(),
    ];
    finding.finding_disposition = Some("supplemental_data_only".to_string());
    Some(finding)
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

fn records_from_grid(headers: &[String], rows: &[Vec<String>]) -> Vec<ProcurementImportRecord> {
    let header_map = build_header_map(headers.iter().map(|value| value.as_str()));
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let row_number = index + 2;
            let announcement_type = value_from_cells(row, &header_map, "announcement_type");
            let procurement_stage =
                optional_string(value_from_cells(row, &header_map, "procurement_stage"))
                    .as_deref()
                    .and_then(|value| ProcurementStage::from_str(value).ok())
                    .unwrap_or_else(|| infer_procurement_stage(&announcement_type));
            let region = optional_string(value_from_cells(row, &header_map, "region"));
            let notice_url = optional_string(value_from_cells(row, &header_map, "notice_url"));
            ProcurementImportRecord {
                project_name: value_from_cells(row, &header_map, "project_name"),
                purchaser_name: value_from_cells(row, &header_map, "purchaser_name"),
                announcement_type,
                procurement_stage: Some(procurement_stage),
                project_code: value_from_cells(row, &header_map, "project_code"),
                procurement_method: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "procurement_method",
                )),
                published_at: optional_string(value_from_cells(row, &header_map, "published_at")),
                region,
                normalized_region: None,
                budget_amount: optional_string(value_from_cells(row, &header_map, "budget_amount")),
                award_amount: optional_string(value_from_cells(row, &header_map, "award_amount")),
                budget_amount_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "budget_amount_unit",
                )),
                award_amount_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "award_amount_unit",
                )),
                normalized_budget_amount_yuan: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "normalized_budget_amount_yuan",
                )),
                normalized_award_amount_yuan: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "normalized_award_amount_yuan",
                )),
                framework_agreement_flag: optional_bool(value_from_cells(
                    row,
                    &header_map,
                    "framework_agreement_flag",
                )),
                amount_semantic_type: optional_amount_semantic_type(value_from_cells(
                    row,
                    &header_map,
                    "amount_semantic_type",
                )),
                quote_amount: optional_string(value_from_cells(row, &header_map, "quote_amount")),
                quote_amount_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "quote_amount_unit",
                )),
                discount_rate: optional_string(value_from_cells(row, &header_map, "discount_rate")),
                unit_price: optional_string(value_from_cells(row, &header_map, "unit_price")),
                total_award_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "total_award_amount",
                )),
                framework_limit_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "framework_limit_amount",
                )),
                framework_limit_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "framework_limit_unit",
                )),
                framework_limit_condition: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "framework_limit_condition",
                )),
                package_no: optional_string(value_from_cells(row, &header_map, "package_no")),
                package_name: optional_string(value_from_cells(row, &header_map, "package_name")),
                package_budget_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "package_budget_amount",
                )),
                package_award_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "package_award_amount",
                )),
                declared_total_award_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "declared_total_award_amount",
                )),
                declared_budget_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "declared_budget_amount",
                )),
                ceiling_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "ceiling_amount",
                )),
                package_sum_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "package_sum_amount",
                )),
                amount_consistency_status: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "amount_consistency_status",
                )),
                amount_difference_yuan: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "amount_difference_yuan",
                )),
                amount_check_reason: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "amount_check_reason",
                )),
                acceptance_management_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_management_flag",
                )),
                acceptance_plan: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_plan",
                )),
                acceptance_opinion: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_opinion",
                )),
                acceptance_archive_status: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_archive_status",
                )),
                acceptance_archive_locator: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_archive_locator",
                )),
                acceptance_issue_summary: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_issue_summary",
                )),
                service_period: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "service_period",
                )),
                maintenance_period: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "maintenance_period",
                )),
                warranty_period: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "warranty_period",
                )),
                acceptance_standard: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_standard",
                )),
                acceptance_result: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_result",
                )),
                acceptance_result_locator: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_result_locator",
                )),
                service_period_source: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "service_period_source",
                )),
                warranty_maintenance_source: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "warranty_maintenance_source",
                )),
                settlement_basis: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "settlement_basis",
                )),
                payment_trigger: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "payment_trigger",
                )),
                payment_deadline: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "payment_deadline",
                )),
                payment_condition_source: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "payment_condition_source",
                )),
                contract_performance_period: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "contract_performance_period",
                )),
                government_purchase_service_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "government_purchase_service_flag",
                )),
                joint_bid_allowed_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "joint_bid_allowed_flag",
                )),
                sme_policy_requirement: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "sme_policy_requirement",
                )),
                credit_financing_policy_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "credit_financing_policy_flag",
                )),
                procurement_policy_note: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "procurement_policy_note",
                )),
                procurement_exception_type: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "procurement_exception_type",
                )),
                complaint_decision_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "complaint_decision_no",
                )),
                complaint_issue_summary: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "complaint_issue_summary",
                )),
                complaint_handling_result: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "complaint_handling_result",
                )),
                allegation_type: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "allegation_type",
                )),
                allegation_outcome: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "allegation_outcome",
                )),
                confirmed_fact_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "confirmed_fact_flag",
                )),
                remedy_action: optional_string(value_from_cells(row, &header_map, "remedy_action")),
                remedy_required_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "remedy_required_flag",
                )),
                allegation_evidence_weight: optional_u8(value_from_cells(
                    row,
                    &header_map,
                    "allegation_evidence_weight",
                )),
                allegation_weight_reason: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "allegation_weight_reason",
                )),
                false_material_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "false_material_flag",
                )),
                award_invalidated_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "award_invalidated_flag",
                )),
                rebid_required_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "rebid_required_flag",
                )),
                correction_notice_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "correction_notice_flag",
                )),
                supervision_penalty_subject: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "supervision_penalty_subject",
                )),
                affected_package_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "affected_package_no",
                )),
                penalty_decision_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "penalty_decision_no",
                )),
                penalty_basis: optional_string(value_from_cells(row, &header_map, "penalty_basis")),
                penalty_basis_article: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "penalty_basis_article",
                )),
                penalty_period: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "penalty_period",
                )),
                market_entry_restriction_scope: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "market_entry_restriction_scope",
                )),
                penalty_subject_type: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "penalty_subject_type",
                )),
                penalty_subject_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "penalty_subject_name",
                )),
                credit_repair_status: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "credit_repair_status",
                )),
                credit_repair_source_url: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "credit_repair_source_url",
                )),
                re_participation_review_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "re_participation_review_flag",
                )),
                exception_evidence_category: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "exception_evidence_category",
                )),
                exception_evidence_weight: optional_u8(value_from_cells(
                    row,
                    &header_map,
                    "exception_evidence_weight",
                )),
                exception_weight_reason: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "exception_weight_reason",
                )),
                source_region_scope: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "source_region_scope",
                )),
                source_province: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "source_province",
                )),
                source_city: optional_string(value_from_cells(row, &header_map, "source_city")),
                source_region_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "source_region_code",
                )),
                publisher_level: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "publisher_level",
                )),
                central_unit_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "central_unit_flag",
                )),
                purchaser_region_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "purchaser_region_code",
                )),
                procurement_channel: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "procurement_channel",
                )),
                platform_order_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "platform_order_no",
                )),
                item_name: optional_string(value_from_cells(row, &header_map, "item_name")),
                item_quantity: optional_string(value_from_cells(row, &header_map, "item_quantity")),
                item_unit: optional_string(value_from_cells(row, &header_map, "item_unit")),
                unit_price_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "unit_price_amount",
                )),
                unit_price_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "unit_price_unit",
                )),
                order_total_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "order_total_amount",
                )),
                order_total_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "order_total_unit",
                )),
                procurement_intention_flag: optional_bool_option(value_from_cells(
                    row,
                    &header_map,
                    "procurement_intention_flag",
                )),
                intention_budget_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "intention_budget_amount",
                )),
                intention_expected_procurement_at: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "intention_expected_procurement_at",
                )),
                intention_followup_status: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "intention_followup_status",
                )),
                batch_month: optional_string(value_from_cells(row, &header_map, "batch_month")),
                batch_category: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "batch_category",
                )),
                product_category: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "product_category",
                )),
                manufacturer: optional_string(value_from_cells(row, &header_map, "manufacturer")),
                model: optional_string(value_from_cells(row, &header_map, "model")),
                batch_lot_no: optional_string(value_from_cells(row, &header_map, "batch_lot_no")),
                batch_total_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "batch_total_amount",
                )),
                lot_award_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "lot_award_amount",
                )),
                supplier_name: optional_string(value_from_cells(row, &header_map, "supplier_name")),
                budget_project_id: None,
                contract_no: optional_string(value_from_cells(row, &header_map, "contract_no")),
                contract_published_at: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "contract_published_at",
                )),
                acceptance_summary: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_summary",
                )),
                acceptance_status: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "acceptance_status",
                )),
                notice_url: notice_url.clone(),
                indicator_document_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "indicator_document_no",
                )),
                project_catalog_id: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "project_catalog_id",
                )),
                function_classification_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "function_classification_code",
                )),
                economic_classification_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "economic_classification_code",
                )),
                source_evidence: source_evidence_from_cells(row, &header_map, row_number).or_else(
                    || {
                        notice_url.map(|url| SourceEvidence {
                            title: None,
                            url: Some(url),
                            published_at: None,
                            captured_at: None,
                            row_number: Some(row_number),
                            parser_version: Some("procurement-csv-v1".to_string()),
                            page_number: None,
                            section_title: None,
                            locator_hash: None,
                            raw_excerpt: None,
                            table_title: None,
                            table_row_index: None,
                            table_column_name: None,
                            paragraph_index: None,
                            pdf_table_id: None,
                            legal_basis: None,
                            legal_basis_article: None,
                            decision_paragraph_index: None,
                            affected_package_no: None,
                            handling_result_locator_hash: None,
                            penalty_basis: None,
                            penalty_decision_paragraph_index: None,
                            credit_record_locator_hash: None,
                            market_restriction_locator_hash: None,
                        })
                    },
                ),
                source_row: row_number,
            }
        })
        .collect()
}

fn validate_records(
    raw_records: Vec<ProcurementImportRecord>,
    title: Option<&str>,
) -> ProcurementPreviewResult {
    let mut checks = Vec::new();
    let mut accepted = Vec::new();
    let mut seen_project_codes: HashSet<String> = HashSet::new();
    let mut rejected_rows: HashSet<usize> = HashSet::new();

    for mut record in raw_records {
        let mut row_has_error = false;
        let raw_award_amount = record.award_amount.clone();
        if matches!(
            record.procurement_stage,
            Some(ProcurementStage::PreAnnouncement)
        ) || record.procurement_intention_flag == Some(true)
        {
            record.procurement_stage = Some(ProcurementStage::PreAnnouncement);
            record.procurement_intention_flag = Some(true);
            if record.intention_budget_amount.is_none() {
                record.intention_budget_amount = record.budget_amount.clone();
            }
            record.normalized_award_amount_yuan = None;
        }
        for (field, label, value) in [
            ("project_name", "project_name", record.project_name.as_str()),
            (
                "purchaser_name",
                "purchaser_name",
                record.purchaser_name.as_str(),
            ),
            (
                "announcement_type",
                "announcement_type",
                record.announcement_type.as_str(),
            ),
            ("project_code", "project_code", record.project_code.as_str()),
        ] {
            if value.trim().is_empty() {
                row_has_error = true;
                checks.push(QualityCheck {
                    code: "missing_required_field".to_string(),
                    severity: QualitySeverity::Error,
                    message: format!("missing required field {}", label),
                    field: Some(field.to_string()),
                    row_number: Some(record.source_row),
                });
            }
        }

        if let Some(region) = record
            .region
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            record.normalized_region = Some(normalize_jiangsu_region(region));
        }

        if let Some(evidence) = record.source_evidence.as_ref() {
            let has_locator = evidence.page_number.is_some()
                || evidence
                    .section_title
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty())
                || evidence
                    .locator_hash
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty())
                || evidence
                    .raw_excerpt
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty());
            if evidence
                .url
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
                || !has_locator
            {
                checks.push(QualityCheck {
                    code: "missing_source_locator".to_string(),
                    severity: QualitySeverity::Warning,
                    message: "source evidence is missing URL or locator".to_string(),
                    field: Some("source_evidence".to_string()),
                    row_number: Some(record.source_row),
                });
            }
        } else {
            checks.push(QualityCheck {
                code: "missing_source_evidence".to_string(),
                severity: QualitySeverity::Warning,
                message: "source evidence is missing".to_string(),
                field: Some("source_evidence".to_string()),
                row_number: Some(record.source_row),
            });
        }

        if record
            .budget_amount
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
        {
            checks.push(QualityCheck {
                code: "missing_budget_amount".to_string(),
                severity: QualitySeverity::Warning,
                message: "budget amount is missing; result is supplemental data only".to_string(),
                field: Some("budget_amount".to_string()),
                row_number: Some(record.source_row),
            });
        }

        if let Some(value) = record.budget_amount.as_deref().and_then(|value| {
            normalize_public_value(
                value,
                record.budget_amount_unit.unwrap_or(ValueUnit::WanYuan),
            )
        }) {
            record.budget_amount_unit = Some(value.unit);
            record.normalized_budget_amount_yuan = Some(value.normalized_value);
        }

        if is_non_total_amount_semantic(&record) {
            record.normalized_award_amount_yuan = None;
        } else if let Some(value) = record.award_amount.as_deref().and_then(|value| {
            normalize_public_value(
                value,
                record.award_amount_unit.unwrap_or(ValueUnit::WanYuan),
            )
        }) {
            record.award_amount_unit = Some(value.unit);
            record.normalized_award_amount_yuan = Some(value.normalized_value);
        }

        apply_framework_amount_semantics(&mut record, raw_award_amount.as_deref(), &mut checks);

        if matches!(
            record.amount_semantic_type,
            Some(ProcurementAmountSemanticType::CentralizedBatchTotal)
        ) {
            record.normalized_award_amount_yuan = None;
            checks.push(QualityCheck {
                code: "centralized_batch_total_review".to_string(),
                severity: QualitySeverity::Info,
                message: "centralized batch total is for aggregate display and review, not single-project budget comparison".to_string(),
                field: Some("amount_semantic_type".to_string()),
                row_number: Some(record.source_row),
            });
        }

        if needs_unit_price_or_rate_review(&record, raw_award_amount.as_deref()) {
            checks.push(QualityCheck {
                code: "unit_price_or_rate_review".to_string(),
                severity: QualitySeverity::Info,
                message: "amount may be a unit price, rate, fee or extremely small value"
                    .to_string(),
                field: Some("award_amount".to_string()),
                row_number: Some(record.source_row),
            });
        }

        if has_payment_condition(&record)
            && record
                .payment_deadline
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            checks.push(QualityCheck {
                code: "missing_payment_deadline".to_string(),
                severity: QualitySeverity::Info,
                message: "payment condition exists but no explicit payment deadline was extracted"
                    .to_string(),
                field: Some("payment_deadline".to_string()),
                row_number: Some(record.source_row),
            });
        }

        apply_exception_evidence_defaults(&mut record);
        add_procurement_exception_quality_checks(&record, &mut checks);
        add_contract_policy_quality_checks(&record, &mut checks);

        if !record.project_code.trim().is_empty()
            && !seen_project_codes.insert(record.project_code.trim().to_string())
        {
            checks.push(QualityCheck {
                code: "duplicate_project_code".to_string(),
                severity: QualitySeverity::Warning,
                message: format!("duplicate project code {}", record.project_code),
                field: Some("project_code".to_string()),
                row_number: Some(record.source_row),
            });
        }

        if row_has_error {
            rejected_rows.insert(record.source_row);
        } else {
            accepted.push(record);
        }
    }

    let primary_subject = accepted
        .first()
        .map(|record| {
            if accepted.len() == 1 {
                record.project_name.clone()
            } else {
                format!(
                    "{} and {} procurement projects",
                    record.project_name,
                    accepted.len() - 1
                )
            }
        })
        .unwrap_or_else(|| "unknown purchaser".to_string());

    ProcurementPreviewResult {
        title: title.unwrap_or("Procurement import preview").to_string(),
        primary_subject,
        applicable_rule_sets: vec![
            "procurement_budget_rules".to_string(),
            "procurement_chain_rules".to_string(),
        ],
        quality_report: ImportQualityReport {
            total_rows: accepted.len() + rejected_rows.len(),
            accepted_rows: accepted.len(),
            rejected_rows: rejected_rows.len(),
            checks,
        },
        records: accepted,
    }
}

fn has_payment_condition(record: &ProcurementImportRecord) -> bool {
    [
        record.settlement_basis.as_deref(),
        record.payment_trigger.as_deref(),
        record.payment_deadline.as_deref(),
        record.payment_condition_source.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.trim().is_empty())
}

fn has_procurement_exception_evidence(record: &ProcurementImportRecord) -> bool {
    [
        record.procurement_exception_type.as_deref(),
        record.complaint_decision_no.as_deref(),
        record.complaint_issue_summary.as_deref(),
        record.complaint_handling_result.as_deref(),
        record.allegation_type.as_deref(),
        record.allegation_outcome.as_deref(),
        record.remedy_action.as_deref(),
        record.allegation_weight_reason.as_deref(),
        record.supervision_penalty_subject.as_deref(),
        record.affected_package_no.as_deref(),
        record.penalty_decision_no.as_deref(),
        record.penalty_basis.as_deref(),
        record.penalty_basis_article.as_deref(),
        record.penalty_period.as_deref(),
        record.market_entry_restriction_scope.as_deref(),
        record.penalty_subject_type.as_deref(),
        record.penalty_subject_name.as_deref(),
        record.credit_repair_status.as_deref(),
        record.credit_repair_source_url.as_deref(),
        record.exception_evidence_category.as_deref(),
        record.exception_weight_reason.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.trim().is_empty())
        || record.false_material_flag == Some(true)
        || record.award_invalidated_flag == Some(true)
        || record.rebid_required_flag == Some(true)
        || record.correction_notice_flag == Some(true)
        || record.confirmed_fact_flag == Some(true)
        || record.remedy_required_flag == Some(true)
        || record.allegation_evidence_weight.is_some()
        || record.re_participation_review_flag == Some(true)
        || record.exception_evidence_weight.is_some()
}

fn has_penalty_or_credit_evidence(record: &ProcurementImportRecord) -> bool {
    [
        record.penalty_decision_no.as_deref(),
        record.penalty_basis.as_deref(),
        record.penalty_basis_article.as_deref(),
        record.penalty_period.as_deref(),
        record.market_entry_restriction_scope.as_deref(),
        record.penalty_subject_type.as_deref(),
        record.penalty_subject_name.as_deref(),
        record.credit_repair_status.as_deref(),
        record.credit_repair_source_url.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.trim().is_empty())
        || matches!(
            record.procurement_exception_type.as_deref(),
            Some(
                "administrative_penalty"
                    | "supplier_credit_restriction"
                    | "credit_repair_followup"
                    | "re_participation_review"
            )
        )
}

fn apply_exception_evidence_defaults(record: &mut ProcurementImportRecord) {
    if !has_procurement_exception_evidence(record) {
        return;
    }
    let (category, weight, reason) = exception_evidence_profile(record);
    if record
        .exception_evidence_category
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
    {
        record.exception_evidence_category = Some(category.to_string());
    }
    if record.exception_evidence_weight.is_none() {
        record.exception_evidence_weight = Some(weight);
    }
    if record
        .exception_weight_reason
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
    {
        record.exception_weight_reason = Some(reason.to_string());
    }
    let (allegation_weight, allegation_reason) = allegation_evidence_profile(record);
    if record.allegation_evidence_weight.is_none() {
        record.allegation_evidence_weight = Some(allegation_weight);
    }
    if record
        .allegation_weight_reason
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
    {
        record.allegation_weight_reason = Some(allegation_reason.to_string());
    }
}

fn allegation_evidence_profile(record: &ProcurementImportRecord) -> (u8, &'static str) {
    let outcome = record
        .allegation_outcome
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if record.confirmed_fact_flag == Some(false)
        || matches!(
            outcome.as_str(),
            "rejected" | "insufficient_evidence" | "dismissed"
        )
    {
        return (
            25,
            "rejected or evidence-insufficient complaint allegation is review-only and not confirmed fact evidence",
        );
    }
    let allegation_type = record
        .allegation_type
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match allegation_type.as_str() {
        "false_material" => (
            70,
            "false material allegation has higher review weight but still requires remedy-chain evidence",
        ),
        "sme_declaration" => (
            60,
            "SME declaration allegation requires policy-material review and downstream remedy evidence",
        ),
        "bid_document_defect" | "qualification_issue" => (
            55,
            "bid document or qualification allegation has medium review weight",
        ),
        "evaluation_process" => (
            50,
            "evaluation process allegation requires manual review and downstream evidence",
        ),
        "procurement_document" => (
            40,
            "general procurement document allegation is supplemental review evidence",
        ),
        _ => (
            35,
            "complaint allegation remains review evidence until confirmed facts and remedy-chain records close",
        ),
    }
}

fn exception_evidence_profile(
    record: &ProcurementImportRecord,
) -> (&'static str, u8, &'static str) {
    let exception_type = record
        .procurement_exception_type
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let issue = record
        .complaint_issue_summary
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if exception_type == "administrative_penalty" || has_penalty_or_credit_evidence(record) {
        (
            "administrative_penalty",
            80,
            "administrative penalty public notice raises review priority but remains review-only until downstream evidence closes",
        )
    } else if exception_type == "malicious_collusion_review"
        || issue.contains("malicious collusion")
        || issue.contains("恶意串通")
    {
        (
            "malicious_collusion",
            75,
            "malicious collusion clue has higher evidence weight but still requires chain evidence",
        )
    } else if record.false_material_flag == Some(true)
        || exception_type == "false_material_review"
        || issue.contains("false material")
        || issue.contains("虚假材料")
    {
        (
            "false_material",
            70,
            "false material clue has higher review weight but is not a standalone audit conclusion",
        )
    } else if exception_type == "complaint_established" {
        (
            "complaint_established",
            65,
            "established complaint is review evidence and requires follow-up chain closure",
        )
    } else if exception_type == "complaint_partly_established" {
        (
            "complaint_partly_established",
            55,
            "partly established complaint has medium review weight",
        )
    } else if exception_type == "complaint_rejected" {
        (
            "complaint_rejected",
            25,
            "rejected complaint has low evidence weight and should not be treated as violation evidence",
        )
    } else {
        (
            "public_exception_review",
            35,
            "public exception clue is review evidence only until downstream records are complete",
        )
    }
}

fn has_service_acceptance_evidence(record: &ProcurementImportRecord) -> bool {
    [
        record.service_period.as_deref(),
        record.maintenance_period.as_deref(),
        record.warranty_period.as_deref(),
        record.acceptance_standard.as_deref(),
        record.acceptance_result.as_deref(),
        record.acceptance_result_locator.as_deref(),
        record.service_period_source.as_deref(),
        record.warranty_maintenance_source.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.trim().is_empty())
}

fn has_maintenance_or_warranty_evidence(record: &ProcurementImportRecord) -> bool {
    [
        record.maintenance_period.as_deref(),
        record.warranty_period.as_deref(),
        record.warranty_maintenance_source.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.trim().is_empty())
}

fn add_contract_policy_quality_checks(
    record: &ProcurementImportRecord,
    checks: &mut Vec<QualityCheck>,
) {
    let stage = record
        .procurement_stage
        .unwrap_or_else(|| infer_procurement_stage(&record.announcement_type));
    if matches!(stage, ProcurementStage::Contract)
        && record
            .contract_performance_period
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        checks.push(QualityCheck {
            code: "missing_contract_performance_period".to_string(),
            severity: QualitySeverity::Info,
            message: "contract stage record is missing contract performance period".to_string(),
            field: Some("contract_performance_period".to_string()),
            row_number: Some(record.source_row),
        });
    }

    if has_service_acceptance_evidence(record)
        || matches!(
            stage,
            ProcurementStage::Contract | ProcurementStage::Acceptance
        )
    {
        push_info_if_blank(
            checks,
            "missing_service_period",
            "service_period",
            "service or acceptance evidence is missing a distinct service period",
            record.service_period.as_deref(),
            record.source_row,
        );
        push_info_if_blank(
            checks,
            "missing_acceptance_standard",
            "acceptance_standard",
            "service or maintenance evidence is missing acceptance standard",
            record.acceptance_standard.as_deref(),
            record.source_row,
        );
        push_info_if_blank(
            checks,
            "missing_acceptance_result_locator",
            "acceptance_result_locator",
            "service or maintenance evidence is missing acceptance result locator",
            record.acceptance_result_locator.as_deref(),
            record.source_row,
        );
    }

    if has_maintenance_or_warranty_evidence(record) {
        checks.push(QualityCheck {
            code: "maintenance_or_warranty_review".to_string(),
            severity: QualitySeverity::Info,
            message: "maintenance or warranty evidence is preserved for supplemental review"
                .to_string(),
            field: Some("warranty_maintenance_source".to_string()),
            row_number: Some(record.source_row),
        });
    }

    if record.government_purchase_service_flag == Some(true) {
        checks.push(QualityCheck {
            code: "government_purchase_service_review".to_string(),
            severity: QualitySeverity::Info,
            message: "government purchase service policy terms require supplemental review"
                .to_string(),
            field: Some("government_purchase_service_flag".to_string()),
            row_number: Some(record.source_row),
        });
    }

    if record.joint_bid_allowed_flag == Some(true) {
        checks.push(QualityCheck {
            code: "joint_bid_review".to_string(),
            severity: QualitySeverity::Info,
            message: "joint bid clause is a policy term for review, not a violation conclusion"
                .to_string(),
            field: Some("joint_bid_allowed_flag".to_string()),
            row_number: Some(record.source_row),
        });
    }

    if has_procurement_policy_terms(record) {
        checks.push(QualityCheck {
            code: "policy_term_review".to_string(),
            severity: QualitySeverity::Info,
            message: "procurement policy terms are preserved for supplemental evidence review"
                .to_string(),
            field: Some("procurement_policy_note".to_string()),
            row_number: Some(record.source_row),
        });
    }

    if record.acceptance_management_flag == Some(true)
        || matches!(stage, ProcurementStage::Acceptance)
    {
        push_info_if_blank(
            checks,
            "missing_acceptance_plan",
            "acceptance_plan",
            "acceptance management record is missing acceptance plan",
            record.acceptance_plan.as_deref(),
            record.source_row,
        );
        push_info_if_blank(
            checks,
            "missing_acceptance_opinion",
            "acceptance_opinion",
            "acceptance management record is missing acceptance opinion",
            record.acceptance_opinion.as_deref(),
            record.source_row,
        );
        if record
            .acceptance_archive_status
            .as_deref()
            .is_none_or(|value| value.trim().is_empty())
            && record
                .acceptance_archive_locator
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
        {
            checks.push(QualityCheck {
                code: "missing_acceptance_archive".to_string(),
                severity: QualitySeverity::Info,
                message: "acceptance management record is missing archive status or locator"
                    .to_string(),
                field: Some("acceptance_archive_status".to_string()),
                row_number: Some(record.source_row),
            });
        }
    }

    if has_payment_condition(record) {
        push_info_if_blank(
            checks,
            "missing_payment_trigger",
            "payment_trigger",
            "payment condition exists but no explicit payment trigger was extracted",
            record.payment_trigger.as_deref(),
            record.source_row,
        );
    }
}

fn add_procurement_exception_quality_checks(
    record: &ProcurementImportRecord,
    checks: &mut Vec<QualityCheck>,
) {
    if !has_procurement_exception_evidence(record) {
        return;
    }

    checks.push(QualityCheck {
        code: "procurement_exception_review".to_string(),
        severity: QualitySeverity::Info,
        message: "procurement complaint or supervision exception evidence is review-only until downstream chain evidence is complete".to_string(),
        field: Some("procurement_exception_type".to_string()),
        row_number: Some(record.source_row),
    });

    push_info_if_blank(
        checks,
        "missing_complaint_decision_no",
        "complaint_decision_no",
        "procurement exception record is missing complaint or supervision decision number",
        record.complaint_decision_no.as_deref(),
        record.source_row,
    );
    push_info_if_blank(
        checks,
        "missing_complaint_handling_result",
        "complaint_handling_result",
        "procurement exception record is missing handling result text",
        record.complaint_handling_result.as_deref(),
        record.source_row,
    );
    push_info_if_blank(
        checks,
        "missing_allegation_outcome",
        "allegation_outcome",
        "complaint adjudication record is missing structured allegation outcome",
        record.allegation_outcome.as_deref(),
        record.source_row,
    );
    push_info_if_blank(
        checks,
        "missing_remedy_action",
        "remedy_action",
        "complaint adjudication record is missing structured remedy action",
        record.remedy_action.as_deref(),
        record.source_row,
    );

    if has_penalty_or_credit_evidence(record) {
        push_info_if_blank(
            checks,
            "missing_penalty_decision_no",
            "penalty_decision_no",
            "administrative penalty or credit constraint record is missing penalty decision number",
            record.penalty_decision_no.as_deref(),
            record.source_row,
        );
        push_info_if_blank(
            checks,
            "missing_penalty_basis",
            "penalty_basis",
            "administrative penalty or credit constraint record is missing penalty basis",
            record.penalty_basis.as_deref(),
            record.source_row,
        );
        push_info_if_blank(
            checks,
            "missing_market_restriction_scope",
            "market_entry_restriction_scope",
            "administrative penalty or credit constraint record is missing market restriction scope",
            record.market_entry_restriction_scope.as_deref(),
            record.source_row,
        );
        if record
            .credit_repair_status
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            push_info_if_blank(
                checks,
                "missing_credit_repair_source",
                "credit_repair_source_url",
                "credit repair status is present but no credit repair source URL was provided",
                record.credit_repair_source_url.as_deref(),
                record.source_row,
            );
        }
    }
}

fn push_info_if_blank(
    checks: &mut Vec<QualityCheck>,
    code: &str,
    field: &str,
    message: &str,
    value: Option<&str>,
    row_number: usize,
) {
    if value.is_none_or(|value| value.trim().is_empty()) {
        checks.push(QualityCheck {
            code: code.to_string(),
            severity: QualitySeverity::Info,
            message: message.to_string(),
            field: Some(field.to_string()),
            row_number: Some(row_number),
        });
    }
}

fn has_procurement_policy_terms(record: &ProcurementImportRecord) -> bool {
    record.credit_financing_policy_flag == Some(true)
        || record
            .sme_policy_requirement
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        || record
            .procurement_policy_note
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
}

fn build_header_map<'a, I>(headers: I) -> HashMap<String, usize>
where
    I: Iterator<Item = &'a str>,
{
    let mut map = HashMap::new();
    for (index, header) in headers.enumerate() {
        let normalized = normalize_header(header);
        if let Some(field) = canonical_field_key(&normalized) {
            map.insert(field.to_string(), index);
        }
    }
    map
}

fn canonical_field_key(normalized_header: &str) -> Option<&'static str> {
    for (field, aliases) in header_aliases() {
        if aliases.iter().any(|alias| *alias == normalized_header) {
            return Some(field);
        }
    }
    None
}

fn header_aliases() -> BTreeMap<&'static str, Vec<String>> {
    let mut aliases = BTreeMap::from([
        (
            "project_name",
            vec!["project_name", "project", "name"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "purchaser_name",
            vec!["purchaser_name", "purchaser", "buyer"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "announcement_type",
            vec!["announcement_type", "notice_type"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "project_code",
            vec!["project_code", "project_id", "code"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "procurement_method",
            vec!["procurement_method", "method"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "published_at",
            vec!["published_at", "publish_date", "date"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "region",
            vec!["region", "area"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "budget_amount",
            vec!["budget_amount", "budget"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "award_amount",
            vec!["award_amount", "award", "deal_amount"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "supplier_name",
            vec!["supplier_name", "supplier"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "contract_no",
            vec!["contract_no", "contract_number"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "contract_published_at",
            vec!["contract_published_at", "contract_date"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "acceptance_summary",
            vec!["acceptance_summary"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "acceptance_status",
            vec!["acceptance_status"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "notice_url",
            vec!["notice_url", "url"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "indicator_document_no",
            vec!["indicator_document_no"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "project_catalog_id",
            vec!["project_catalog_id"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "function_classification_code",
            vec!["function_classification_code"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
        (
            "economic_classification_code",
            vec!["economic_classification_code"]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        ),
    ]);
    for field in [
        "procurement_stage",
        "source_title",
        "source_url",
        "source_published_at",
        "source_captured_at",
        "parser_version",
        "source_page_number",
        "source_section_title",
        "source_locator_hash",
        "source_raw_excerpt",
        "source_table_title",
        "source_table_row_index",
        "source_table_column_name",
        "source_paragraph_index",
        "source_pdf_table_id",
        "source_legal_basis",
        "source_legal_basis_article",
        "source_decision_paragraph_index",
        "source_affected_package_no",
        "source_handling_result_locator_hash",
        "source_penalty_basis",
        "source_penalty_decision_paragraph_index",
        "source_credit_record_locator_hash",
        "source_market_restriction_locator_hash",
        "budget_amount_unit",
        "award_amount_unit",
        "normalized_budget_amount_yuan",
        "normalized_award_amount_yuan",
        "framework_agreement_flag",
        "amount_semantic_type",
        "quote_amount",
        "quote_amount_unit",
        "discount_rate",
        "unit_price",
        "total_award_amount",
        "framework_limit_amount",
        "framework_limit_unit",
        "framework_limit_condition",
        "package_no",
        "package_name",
        "package_budget_amount",
        "package_award_amount",
        "declared_total_award_amount",
        "declared_budget_amount",
        "ceiling_amount",
        "package_sum_amount",
        "amount_consistency_status",
        "amount_difference_yuan",
        "amount_check_reason",
        "acceptance_management_flag",
        "acceptance_plan",
        "acceptance_opinion",
        "acceptance_archive_status",
        "acceptance_archive_locator",
        "acceptance_issue_summary",
        "service_period",
        "maintenance_period",
        "warranty_period",
        "acceptance_standard",
        "acceptance_result",
        "acceptance_result_locator",
        "service_period_source",
        "warranty_maintenance_source",
        "settlement_basis",
        "payment_trigger",
        "payment_deadline",
        "payment_condition_source",
        "contract_performance_period",
        "government_purchase_service_flag",
        "joint_bid_allowed_flag",
        "sme_policy_requirement",
        "credit_financing_policy_flag",
        "procurement_policy_note",
        "procurement_exception_type",
        "complaint_decision_no",
        "complaint_issue_summary",
        "complaint_handling_result",
        "allegation_type",
        "allegation_outcome",
        "confirmed_fact_flag",
        "remedy_action",
        "remedy_required_flag",
        "allegation_evidence_weight",
        "allegation_weight_reason",
        "false_material_flag",
        "award_invalidated_flag",
        "rebid_required_flag",
        "correction_notice_flag",
        "supervision_penalty_subject",
        "affected_package_no",
        "penalty_decision_no",
        "penalty_basis",
        "penalty_basis_article",
        "penalty_period",
        "market_entry_restriction_scope",
        "penalty_subject_type",
        "penalty_subject_name",
        "credit_repair_status",
        "credit_repair_source_url",
        "re_participation_review_flag",
        "exception_evidence_category",
        "exception_evidence_weight",
        "exception_weight_reason",
        "source_region_scope",
        "source_province",
        "source_city",
        "source_region_code",
        "publisher_level",
        "central_unit_flag",
        "purchaser_region_code",
        "procurement_channel",
        "platform_order_no",
        "item_name",
        "item_quantity",
        "item_unit",
        "unit_price_amount",
        "unit_price_unit",
        "order_total_amount",
        "order_total_unit",
        "procurement_intention_flag",
        "intention_budget_amount",
        "intention_expected_procurement_at",
        "intention_followup_status",
        "batch_month",
        "batch_category",
        "product_category",
        "manufacturer",
        "model",
        "batch_lot_no",
        "batch_total_amount",
        "lot_award_amount",
    ] {
        aliases.insert(
            field,
            vec![field]
                .into_iter()
                .map(normalize_header_static)
                .collect(),
        );
    }
    aliases
}

fn normalize_header(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|character| {
            !character.is_whitespace()
                && !matches!(
                    character,
                    '(' | ')'
                        | '（'
                        | '）'
                        | ','
                        | '，'
                        | ':'
                        | '：'
                        | '/'
                        | '-'
                        | '_'
                        | ' '
                        | '、'
                        | '·'
                )
        })
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn normalize_header_static(value: &str) -> String {
    normalize_header(value)
}

fn value_from_cells(cells: &[String], header_map: &HashMap<String, usize>, field: &str) -> String {
    header_map
        .get(field)
        .and_then(|index| cells.get(*index))
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

fn source_evidence_from_cells(
    cells: &[String],
    header_map: &HashMap<String, usize>,
    row_number: usize,
) -> Option<SourceEvidence> {
    let evidence = SourceEvidence {
        title: optional_string(value_from_cells(cells, header_map, "source_title")),
        url: optional_string(value_from_cells(cells, header_map, "source_url")),
        published_at: optional_string(value_from_cells(cells, header_map, "source_published_at")),
        captured_at: optional_string(value_from_cells(cells, header_map, "source_captured_at")),
        row_number: Some(row_number),
        parser_version: optional_string(value_from_cells(cells, header_map, "parser_version")),
        page_number: optional_string(value_from_cells(cells, header_map, "source_page_number"))
            .and_then(|value| value.parse::<usize>().ok()),
        section_title: optional_string(value_from_cells(cells, header_map, "source_section_title")),
        locator_hash: optional_string(value_from_cells(cells, header_map, "source_locator_hash")),
        raw_excerpt: optional_string(value_from_cells(cells, header_map, "source_raw_excerpt")),
        table_title: optional_string(value_from_cells(cells, header_map, "source_table_title")),
        table_row_index: optional_string(value_from_cells(
            cells,
            header_map,
            "source_table_row_index",
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        table_column_name: optional_string(value_from_cells(
            cells,
            header_map,
            "source_table_column_name",
        )),
        paragraph_index: optional_string(value_from_cells(
            cells,
            header_map,
            "source_paragraph_index",
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        pdf_table_id: optional_string(value_from_cells(cells, header_map, "source_pdf_table_id")),
        legal_basis: optional_string(value_from_cells(cells, header_map, "source_legal_basis")),
        legal_basis_article: optional_string(value_from_cells(
            cells,
            header_map,
            "source_legal_basis_article",
        )),
        decision_paragraph_index: optional_string(value_from_cells(
            cells,
            header_map,
            "source_decision_paragraph_index",
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        affected_package_no: optional_string(value_from_cells(
            cells,
            header_map,
            "source_affected_package_no",
        ))
        .or_else(|| optional_string(value_from_cells(cells, header_map, "affected_package_no"))),
        handling_result_locator_hash: optional_string(value_from_cells(
            cells,
            header_map,
            "source_handling_result_locator_hash",
        )),
        penalty_basis: optional_string(value_from_cells(cells, header_map, "source_penalty_basis"))
            .or_else(|| optional_string(value_from_cells(cells, header_map, "penalty_basis"))),
        penalty_decision_paragraph_index: optional_string(value_from_cells(
            cells,
            header_map,
            "source_penalty_decision_paragraph_index",
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        credit_record_locator_hash: optional_string(value_from_cells(
            cells,
            header_map,
            "source_credit_record_locator_hash",
        )),
        market_restriction_locator_hash: optional_string(value_from_cells(
            cells,
            header_map,
            "source_market_restriction_locator_hash",
        )),
    };

    if evidence.title.is_some()
        || evidence.url.is_some()
        || evidence.published_at.is_some()
        || evidence.captured_at.is_some()
        || evidence.parser_version.is_some()
        || evidence.has_locator()
    {
        Some(evidence)
    } else {
        None
    }
}

fn optional_string(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value.trim().to_string())
    }
}

fn optional_unit(value: String) -> Option<ValueUnit> {
    if value.trim().is_empty() {
        None
    } else {
        ValueUnit::from_str(value.trim()).ok()
    }
}

fn optional_amount_semantic_type(value: String) -> Option<ProcurementAmountSemanticType> {
    if value.trim().is_empty() {
        None
    } else {
        ProcurementAmountSemanticType::from_str(value.trim()).ok()
    }
}

fn optional_bool(value: String) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "true" | "1" | "yes" | "y" | "framework" | "框架协议" | "入围"
    )
}

fn optional_bool_option(value: String) -> Option<bool> {
    if value.trim().is_empty() {
        None
    } else {
        Some(optional_bool(value))
    }
}

fn optional_u8(value: String) -> Option<u8> {
    if value.trim().is_empty() {
        None
    } else {
        value.trim().parse::<u8>().ok()
    }
}

#[allow(dead_code)]
fn normalize_optional_amount(
    value: Option<String>,
    row_number: usize,
    field_key: &str,
    field_label: &str,
    checks: &mut Vec<QualityCheck>,
    required: bool,
    row_has_error: &mut bool,
) -> Option<String> {
    match value {
        Some(value) => match normalize_amount(&value) {
            Ok(normalized) => normalized,
            Err(_) => {
                checks.push(QualityCheck {
                    code: format!("invalid_{}", field_key),
                    severity: QualitySeverity::Error,
                    message: format!("{} 金额格式无法识别", field_label),
                    field: Some(field_key.to_string()),
                    row_number: Some(row_number),
                });
                *row_has_error = true;
                None
            }
        },
        None if required => {
            checks.push(QualityCheck {
                code: format!("missing_{}", field_key),
                severity: QualitySeverity::Error,
                message: format!("缺少必填字段 {}", field_label),
                field: Some(field_key.to_string()),
                row_number: Some(row_number),
            });
            *row_has_error = true;
            None
        }
        None => None,
    }
}

#[allow(dead_code)]
fn normalize_optional_date(
    value: Option<String>,
    row_number: usize,
    field_key: &str,
    field_label: &str,
    checks: &mut Vec<QualityCheck>,
    required: bool,
    row_has_error: &mut bool,
) -> Option<String> {
    match value {
        Some(value) => match normalize_date(&value) {
            Ok(normalized) => normalized,
            Err(_) => {
                checks.push(QualityCheck {
                    code: format!("invalid_{}", field_key),
                    severity: QualitySeverity::Warning,
                    message: format!("{} 日期格式无法识别", field_label),
                    field: Some(field_key.to_string()),
                    row_number: Some(row_number),
                });
                if required {
                    *row_has_error = true;
                }
                None
            }
        },
        None if required => {
            checks.push(QualityCheck {
                code: format!("missing_{}", field_key),
                severity: QualitySeverity::Error,
                message: format!("缺少必填字段 {}", field_label),
                field: Some(field_key.to_string()),
                row_number: Some(row_number),
            });
            *row_has_error = true;
            None
        }
        None => None,
    }
}

fn normalize_amount(value: &str) -> Result<Option<String>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed
        .replace(',', "")
        .replace("yuan", "")
        .replace("CNY", "")
        .trim()
        .to_string();
    match Decimal::from_str(&normalized) {
        Ok(decimal) => Ok(Some(decimal.normalize().to_string())),
        Err(_) => normalize_public_value(trimmed, ValueUnit::WanYuan)
            .map(|value| Some(value.normalized_value))
            .context("invalid amount"),
    }
}

fn apply_framework_amount_semantics(
    record: &mut ProcurementImportRecord,
    raw_award_amount: Option<&str>,
    checks: &mut Vec<QualityCheck>,
) {
    let context = format!(
        "{} {} {} {}",
        record.project_name,
        record.announcement_type,
        record.procurement_method.clone().unwrap_or_default(),
        raw_award_amount.unwrap_or_default()
    )
    .to_ascii_lowercase();

    if matches!(
        record.amount_semantic_type,
        Some(ProcurementAmountSemanticType::DiscountRate)
    ) || raw_award_amount.unwrap_or_default().contains('%')
    {
        record.amount_semantic_type = Some(ProcurementAmountSemanticType::DiscountRate);
        if record.discount_rate.is_none() {
            record.discount_rate =
                raw_award_amount.map(|value| value.replace('%', "").trim().to_string());
        }
        record.normalized_award_amount_yuan = None;
    }

    if matches!(
        record.amount_semantic_type,
        Some(ProcurementAmountSemanticType::FrameworkLimit)
    ) || context.contains("limit")
        || raw_award_amount.unwrap_or_default().contains("??")
    {
        record.framework_agreement_flag = true;
        record.amount_semantic_type = Some(ProcurementAmountSemanticType::FrameworkLimit);
        if record.framework_limit_condition.is_none() {
            record.framework_limit_condition = Some("limit".to_string());
        }
        record.normalized_award_amount_yuan = None;
        checks.push(QualityCheck {
            code: "framework_limit_review".to_string(),
            severity: QualitySeverity::Warning,
            message: "framework limit is not total award amount".to_string(),
            field: Some("amount_semantic_type".to_string()),
            row_number: Some(record.source_row),
        });
    }

    if matches!(
        record.amount_semantic_type,
        Some(
            ProcurementAmountSemanticType::UnitPrice
                | ProcurementAmountSemanticType::ElectronicMarketplaceUnitPrice
        )
    ) {
        record.normalized_award_amount_yuan = None;
    }
}

fn needs_unit_price_or_rate_review(
    record: &ProcurementImportRecord,
    raw_award_amount: Option<&str>,
) -> bool {
    if matches!(
        record.amount_semantic_type,
        Some(
            ProcurementAmountSemanticType::UnitPrice
                | ProcurementAmountSemanticType::ElectronicMarketplaceUnitPrice
        )
    ) {
        return true;
    }
    if raw_award_amount.unwrap_or_default().contains('%') {
        return true;
    }
    record
        .normalized_award_amount_yuan
        .as_deref()
        .and_then(|value| Decimal::from_str(value).ok())
        .is_some_and(|value| value > Decimal::ZERO && value < Decimal::from(1000u32))
}

fn amount_as_decimal(value: Option<&str>) -> Option<Decimal> {
    value.and_then(|raw| Decimal::from_str(raw).ok())
}

fn build_finding(
    rule_code: &str,
    rule_name: &str,
    rule_category: &str,
    risk_level: &str,
    summary: String,
    rationale: &str,
    action: &str,
    evidence: String,
) -> PlatformTaskFinding {
    PlatformTaskFinding {
        id: format!("{}-{}", rule_code, uuid::Uuid::new_v4()),
        rule_code: rule_code.to_string(),
        rule_name: rule_name.to_string(),
        rule_category: rule_category.to_string(),
        risk_level: risk_level.to_string(),
        summary,
        audit_rationale: rationale.to_string(),
        recommended_action: action.to_string(),
        evidence_summary: evidence,
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

#[derive(Debug)]
struct SplitGroup {
    purchaser_name: String,
    #[allow(dead_code)]
    region: Option<String>,
    #[allow(dead_code)]
    total_budget: Decimal,
    project_codes: String,
    count: usize,
    score: u32,
}

fn detect_split_groups(records: &[ProcurementImportRecord]) -> Vec<SplitGroup> {
    let mut groups: HashMap<(String, Option<String>, String), Vec<&ProcurementImportRecord>> =
        HashMap::new();
    for record in records {
        if is_framework_quote_without_total(record) {
            continue;
        }
        if has_procurement_exception_evidence(record) {
            continue;
        }
        let key = (
            record.purchaser_name.clone(),
            record.region.clone(),
            normalize_project_base(&record.project_name),
        );
        groups.entry(key).or_default().push(record);
    }

    groups
        .into_iter()
        .filter_map(|((purchaser_name, region, _), group_records)| {
            if group_records.len() < 2 {
                return None;
            }
            let mut dates = group_records
                .iter()
                .filter_map(|record| {
                    record
                        .published_at
                        .as_deref()
                        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
                })
                .collect::<Vec<_>>();
            dates.sort();
            if let (Some(first), Some(last)) = (dates.first(), dates.last()) {
                if (*last - *first).num_days() > 30 {
                    return None;
                }
            }
            let total_budget: Decimal = group_records
                .iter()
                .filter_map(|record| amount_as_decimal(record.budget_amount.as_deref()))
                .sum();
            if total_budget < Decimal::from(300_000) {
                return None;
            }
            let score = score_split_group(&group_records);
            if score < 70 {
                return None;
            }
            Some(SplitGroup {
                purchaser_name,
                region,
                total_budget,
                project_codes: group_records
                    .iter()
                    .map(|record| record.project_code.clone())
                    .collect::<Vec<_>>()
                    .join(", "),
                count: group_records.len(),
                score,
            })
        })
        .collect()
}

fn score_split_group(records: &[&ProcurementImportRecord]) -> u32 {
    if records.len() < 2 {
        return 0;
    }
    let mut score = 25;
    if records
        .iter()
        .filter_map(|record| record.supplier_name.as_deref())
        .collect::<HashSet<_>>()
        .len()
        == 1
    {
        score += 25;
    }
    if records
        .iter()
        .filter_map(|record| record.procurement_method.as_deref())
        .collect::<HashSet<_>>()
        .len()
        == 1
    {
        score += 10;
    }
    let amounts = records
        .iter()
        .filter_map(|record| amount_as_decimal(record.budget_amount.as_deref()))
        .collect::<Vec<_>>();
    if amounts.len() >= 2 {
        let min = amounts.iter().min().copied().unwrap_or(Decimal::ZERO);
        let max = amounts.iter().max().copied().unwrap_or(Decimal::ZERO);
        if !max.is_zero() && min * Decimal::new(100, 0) / max >= Decimal::new(75, 0) {
            score += 20;
        }
    }
    let mut dates = records
        .iter()
        .filter_map(|record| {
            record
                .published_at
                .as_deref()
                .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
        })
        .collect::<Vec<_>>();
    dates.sort();
    if let (Some(first), Some(last)) = (dates.first(), dates.last()) {
        if (*last - *first).num_days() <= 30 {
            score += 20;
        }
    }
    score.min(100)
}

fn normalize_project_base(value: &str) -> String {
    let filtered: String = value
        .chars()
        .filter(|character| {
            character.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(character)
        })
        .collect();
    let filtered = filtered
        .replace("package", "")
        .replace("琛ュ厖", "")
        .replace("椤圭洰", "");
    filtered.chars().take(8).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_payment_condition_fields_and_flags_missing_deadline() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,project_code,budget_amount,award_amount,settlement_basis,payment_trigger,payment_deadline,payment_condition_source,notice_url\n",
            "Payment condition project,Test purchaser,contract,JS-PAY-001,100,96,actual settlement,accepted,30 days,contract body,https://example.gov.cn/pay-condition.html\n",
            "Payment condition without deadline,Test purchaser,contract,JS-PAY-002,100,95,actual settlement,service completed,,tender payment clause,https://example.gov.cn/pay-condition-missing.html\n",
        );

        let preview = preview_procurement_csv_bytes(
            "payment-condition.csv",
            csv.as_bytes(),
            Some("payment condition extraction"),
        )
        .unwrap();
        assert_eq!(preview.records.len(), 2);
        assert_eq!(
            preview.records[0].settlement_basis.as_deref(),
            Some("actual settlement")
        );
        assert_eq!(
            preview.records[0].payment_trigger.as_deref(),
            Some("accepted")
        );
        assert_eq!(
            preview.records[0].payment_deadline.as_deref(),
            Some("30 days")
        );
        assert_eq!(
            preview.records[0].payment_condition_source.as_deref(),
            Some("contract body")
        );
        assert!(preview
            .quality_report
            .checks
            .iter()
            .any(|check| check.code == "missing_payment_deadline" && check.row_number == Some(3)));
    }

    #[test]
    fn keeps_framework_non_total_amount_out_of_normalized_award() {
        let preview = preview_procurement_batch(ProcurementBatchPayload {
            title: Some("framework limit import".to_string()),
            records: vec![ProcurementImportRecord {
                project_name: "framework service limit".to_string(),
                purchaser_name: "test purchaser".to_string(),
                announcement_type: "award".to_string(),
                procurement_stage: Some(ProcurementStage::Award),
                project_code: "JS-FRAMEWORK-001".to_string(),
                procurement_method: Some("framework agreement".to_string()),
                published_at: Some("2025-05-16".to_string()),
                region: Some("Jiangsu".to_string()),
                normalized_region: None,
                budget_amount: None,
                award_amount: Some("50".to_string()),
                budget_amount_unit: None,
                award_amount_unit: Some(ValueUnit::WanYuan),
                normalized_budget_amount_yuan: None,
                normalized_award_amount_yuan: Some("500000".to_string()),
                framework_agreement_flag: true,
                amount_semantic_type: Some(ProcurementAmountSemanticType::FrameworkLimit),
                quote_amount: Some("50 below".to_string()),
                quote_amount_unit: Some(ValueUnit::WanYuan),
                discount_rate: None,
                unit_price: None,
                total_award_amount: None,
                framework_limit_amount: Some("50".to_string()),
                framework_limit_unit: Some(ValueUnit::WanYuan),
                framework_limit_condition: Some("below".to_string()),
                package_no: None,
                package_name: None,
                package_budget_amount: None,
                package_award_amount: None,
                declared_total_award_amount: None,
                declared_budget_amount: None,
                ceiling_amount: None,
                package_sum_amount: None,
                amount_consistency_status: None,
                amount_difference_yuan: None,
                amount_check_reason: None,
                acceptance_management_flag: None,
                acceptance_plan: None,
                acceptance_opinion: None,
                acceptance_archive_status: None,
                acceptance_archive_locator: None,
                acceptance_issue_summary: None,
                service_period: None,
                maintenance_period: None,
                warranty_period: None,
                acceptance_standard: None,
                acceptance_result: None,
                acceptance_result_locator: None,
                service_period_source: None,
                warranty_maintenance_source: None,
                settlement_basis: None,
                payment_trigger: None,
                payment_deadline: None,
                payment_condition_source: None,
                contract_performance_period: None,
                government_purchase_service_flag: None,
                joint_bid_allowed_flag: None,
                sme_policy_requirement: None,
                credit_financing_policy_flag: None,
                procurement_policy_note: None,
                procurement_exception_type: None,
                complaint_decision_no: None,
                complaint_issue_summary: None,
                complaint_handling_result: None,
                allegation_type: None,
                allegation_outcome: None,
                confirmed_fact_flag: None,
                remedy_action: None,
                remedy_required_flag: None,
                allegation_evidence_weight: None,
                allegation_weight_reason: None,
                false_material_flag: None,
                award_invalidated_flag: None,
                rebid_required_flag: None,
                correction_notice_flag: None,
                supervision_penalty_subject: None,
                affected_package_no: None,
                penalty_decision_no: None,
                penalty_basis: None,
                penalty_basis_article: None,
                penalty_period: None,
                market_entry_restriction_scope: None,
                penalty_subject_type: None,
                penalty_subject_name: None,
                credit_repair_status: None,
                credit_repair_source_url: None,
                re_participation_review_flag: None,
                exception_evidence_category: None,
                exception_evidence_weight: None,
                exception_weight_reason: None,
                source_region_scope: None,
                source_province: None,
                source_city: None,
                source_region_code: None,
                publisher_level: None,
                central_unit_flag: None,
                purchaser_region_code: None,
                procurement_channel: None,
                platform_order_no: None,
                item_name: None,
                item_quantity: None,
                item_unit: None,
                unit_price_amount: None,
                unit_price_unit: None,
                order_total_amount: None,
                order_total_unit: None,
                procurement_intention_flag: None,
                intention_budget_amount: None,
                intention_expected_procurement_at: None,
                intention_followup_status: None,
                batch_month: None,
                batch_category: None,
                product_category: None,
                manufacturer: None,
                model: None,
                batch_lot_no: None,
                batch_total_amount: None,
                lot_award_amount: None,
                supplier_name: None,
                budget_project_id: None,
                contract_no: None,
                contract_published_at: None,
                acceptance_summary: None,
                acceptance_status: None,
                notice_url: Some("https://example.gov.cn/framework-limit.html".to_string()),
                indicator_document_no: None,
                project_catalog_id: None,
                function_classification_code: None,
                economic_classification_code: None,
                source_evidence: None,
                source_row: 1,
            }],
        });
        assert_eq!(
            preview.records[0].amount_semantic_type,
            Some(ProcurementAmountSemanticType::FrameworkLimit)
        );
        assert!(preview.records[0].normalized_award_amount_yuan.is_none());
        assert!(preview
            .quality_report
            .checks
            .iter()
            .any(|check| check.code == "framework_limit_review"));
    }

    #[test]
    fn preserves_cross_region_and_electronic_marketplace_fields() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,project_code,procurement_method,region,award_amount,amount_semantic_type,normalized_award_amount_yuan,procurement_channel,platform_order_no,item_name,item_quantity,item_unit,unit_price_amount,unit_price_unit,order_total_amount,order_total_unit,source_region_scope,source_province,source_city,source_region_code,publisher_level,central_unit_flag,purchaser_region_code,notice_url\n",
            "Hubei tax switch,Hubei Tax Bureau,award,R9-HB-001,electronic marketplace,Hubei,0.68,electronic_marketplace_unit_price,6800,electronic_marketplace,ORDER-001,Switch,3,set,0.68,wan_yuan,2.04,wan_yuan,cross_province,Hubei,Wuhan,420000,province,false,420000,https://www.ccgp.gov.cn/hubei-switch.html\n",
            "Central display,Central University,award,R9-CENTRAL-001,electronic marketplace,Hubei,12.8,electronic_marketplace_order_total,128000,electronic_marketplace,ORDER-002,Display,1,set,12.8,wan_yuan,12.8,wan_yuan,central_unit,Hubei,Wuhan,000000,central,true,420100,https://www.ccgp.gov.cn/central-display.html\n",
        );

        let preview = preview_procurement_csv_bytes(
            "electronic-marketplace.csv",
            csv.as_bytes(),
            Some("electronic marketplace import"),
        )
        .unwrap();

        assert_eq!(preview.records.len(), 2);
        let unit_price = &preview.records[0];
        assert_eq!(
            unit_price.amount_semantic_type,
            Some(ProcurementAmountSemanticType::ElectronicMarketplaceUnitPrice)
        );
        assert_eq!(
            unit_price.procurement_channel.as_deref(),
            Some("electronic_marketplace")
        );
        assert_eq!(unit_price.platform_order_no.as_deref(), Some("ORDER-001"));
        assert_eq!(unit_price.item_quantity.as_deref(), Some("3"));
        assert_eq!(unit_price.unit_price_amount.as_deref(), Some("0.68"));
        assert_eq!(unit_price.order_total_amount.as_deref(), Some("2.04"));
        assert_eq!(
            unit_price.source_region_scope.as_deref(),
            Some("cross_province")
        );
        assert_eq!(unit_price.purchaser_region_code.as_deref(), Some("420000"));
        assert!(unit_price.normalized_award_amount_yuan.is_none());

        let order_total = &preview.records[1];
        assert_eq!(
            order_total.amount_semantic_type,
            Some(ProcurementAmountSemanticType::ElectronicMarketplaceOrderTotal)
        );
        assert_eq!(
            order_total.source_region_scope.as_deref(),
            Some("central_unit")
        );
        assert_eq!(order_total.central_unit_flag, Some(true));
        assert_eq!(
            order_total.normalized_award_amount_yuan.as_deref(),
            Some("128000")
        );
    }

    #[test]
    fn imports_round_eleven_pre_announcement_and_centralized_batch_semantics() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,budget_amount,award_amount,award_amount_unit,amount_semantic_type,normalized_award_amount_yuan,procurement_channel,procurement_intention_flag,intention_budget_amount,intention_expected_procurement_at,intention_followup_status,batch_month,batch_category,product_category,manufacturer,model,batch_lot_no,batch_total_amount,lot_award_amount,notice_url\n",
            "Network security intention,PBOC Credit Reference Center,procurement intention,intention,R11-INT-001,4900000,,,budget_amount,,regular_procurement,true,4900000,2026-06,queued_for_discovery,,,,,,,,,https://example.gov.cn/r11-intention.html\n",
            "Central desktop batch total,Central Government Procurement Center,award,award,R11-BATCH-TOTAL,32000000,144000,yuan,centralized_batch_total,144000,centralized_batch,false,,,review_recommended,2025-12,desktop,desktop computer,Central Maker,Model A,batch-202512-total,144000,,https://example.gov.cn/r11-batch-total.html\n",
            "Central desktop lot,Central Government Procurement Center,award,award,R11-BATCH-LOT,32000000,1700900,yuan,centralized_batch_lot_amount,1700900,centralized_batch,false,,,review_recommended,2025-12,desktop,desktop computer,Softcom,Model B,lot-1,144000,1700900,https://example.gov.cn/r11-batch-lot.html\n",
        );

        let preview = preview_procurement_csv_bytes(
            "round11-procurement.csv",
            csv.as_bytes(),
            Some("round11 procurement semantics"),
        )
        .unwrap();

        assert_eq!(preview.records.len(), 3);
        let intention = &preview.records[0];
        assert_eq!(
            intention.procurement_stage,
            Some(ProcurementStage::PreAnnouncement)
        );
        assert_eq!(intention.procurement_intention_flag, Some(true));
        assert_eq!(
            intention.intention_budget_amount.as_deref(),
            Some("4900000")
        );
        assert_eq!(
            intention.intention_expected_procurement_at.as_deref(),
            Some("2026-06")
        );
        assert_eq!(
            intention.intention_followup_status.as_deref(),
            Some("queued_for_discovery")
        );

        let batch_total = &preview.records[1];
        assert_eq!(
            batch_total.amount_semantic_type,
            Some(ProcurementAmountSemanticType::CentralizedBatchTotal)
        );
        assert_eq!(
            batch_total.procurement_channel.as_deref(),
            Some("centralized_batch")
        );
        assert_eq!(batch_total.batch_month.as_deref(), Some("2025-12"));
        assert_eq!(batch_total.batch_total_amount.as_deref(), Some("144000"));
        assert!(batch_total.normalized_award_amount_yuan.is_none());

        let lot = &preview.records[2];
        assert_eq!(
            lot.amount_semantic_type,
            Some(ProcurementAmountSemanticType::CentralizedBatchLotAmount)
        );
        assert_eq!(lot.lot_award_amount.as_deref(), Some("1700900"));
        assert_eq!(lot.normalized_award_amount_yuan.as_deref(), Some("1700900"));
    }

    #[test]
    fn preserves_round_thirteen_contract_and_policy_fields_with_review_hints() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,budget_amount,award_amount,contract_performance_period,government_purchase_service_flag,joint_bid_allowed_flag,sme_policy_requirement,credit_financing_policy_flag,procurement_policy_note,notice_url\n",
            "Government service project,Test purchaser,announcement,announcement,R13-POLICY-001,1000000,,2026 service year,true,true,SME policy disclosed,true,credit financing supported,https://example.gov.cn/r13-policy.html\n",
            "Contract missing period,Test purchaser,contract,contract,R13-POLICY-002,1000000,960000,,false,false,,,https://example.gov.cn/r13-contract.html\n",
        );

        let preview = preview_procurement_csv_bytes(
            "round13-policy.csv",
            csv.as_bytes(),
            Some("round13 policy"),
        )
        .expect("preview");

        let policy = &preview.records[0];
        assert_eq!(
            policy.contract_performance_period.as_deref(),
            Some("2026 service year")
        );
        assert_eq!(policy.government_purchase_service_flag, Some(true));
        assert_eq!(policy.joint_bid_allowed_flag, Some(true));
        assert_eq!(
            policy.sme_policy_requirement.as_deref(),
            Some("SME policy disclosed")
        );
        assert_eq!(policy.credit_financing_policy_flag, Some(true));
        assert_eq!(
            policy.procurement_policy_note.as_deref(),
            Some("credit financing supported")
        );

        let check_codes: Vec<&str> = preview
            .quality_report
            .checks
            .iter()
            .map(|check| check.code.as_str())
            .collect();
        assert!(check_codes.contains(&"government_purchase_service_review"));
        assert!(check_codes.contains(&"joint_bid_review"));
        assert!(check_codes.contains(&"policy_term_review"));
        assert!(check_codes.contains(&"missing_contract_performance_period"));
    }

    #[test]
    fn preserves_round_fifteen_acceptance_fields_and_review_hints() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,budget_amount,award_amount,acceptance_management_flag,acceptance_plan,acceptance_opinion,acceptance_archive_status,acceptance_archive_locator,acceptance_issue_summary,payment_trigger,payment_deadline,notice_url\n",
            "Acceptance complete,Test purchaser,acceptance,acceptance,R15-ACC-001,1000000,960000,true,plan disclosed,accepted opinion,archived,archive-hash,,accepted,30 days,https://example.gov.cn/r15-acceptance-ok.html\n",
            "Acceptance missing fields,Test purchaser,acceptance,acceptance,R15-ACC-002,1000000,950000,true,,,,,archive missing,accepted,,https://example.gov.cn/r15-acceptance-missing.html\n",
            "Payment trigger missing,Test purchaser,contract,contract,R15-PAY-001,1000000,940000,false,,,,,,,30 days,https://example.gov.cn/r15-payment-trigger-missing.html\n",
        );

        let preview = preview_procurement_csv_bytes(
            "round15-acceptance.csv",
            csv.as_bytes(),
            Some("round15 acceptance"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 3);
        let accepted = &preview.records[0];
        assert_eq!(accepted.acceptance_management_flag, Some(true));
        assert_eq!(accepted.acceptance_plan.as_deref(), Some("plan disclosed"));
        assert_eq!(
            accepted.acceptance_opinion.as_deref(),
            Some("accepted opinion")
        );
        assert_eq!(
            accepted.acceptance_archive_status.as_deref(),
            Some("archived")
        );
        assert_eq!(
            accepted.acceptance_archive_locator.as_deref(),
            Some("archive-hash")
        );

        let check_codes: Vec<&str> = preview
            .quality_report
            .checks
            .iter()
            .map(|check| check.code.as_str())
            .collect();
        assert!(check_codes.contains(&"missing_acceptance_plan"));
        assert!(check_codes.contains(&"missing_acceptance_opinion"));
        assert!(check_codes.contains(&"missing_acceptance_archive"));
        assert!(check_codes.contains(&"missing_payment_trigger"));
        assert!(check_codes.contains(&"missing_payment_deadline"));
        assert!(preview
            .quality_report
            .checks
            .iter()
            .filter(|check| check.code.starts_with("missing_acceptance")
                || check.code.starts_with("missing_payment"))
            .all(|check| matches!(check.severity, QualitySeverity::Info)));
    }

    #[test]
    fn preserves_round_seventeen_service_maintenance_and_acceptance_evidence_fields() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,budget_amount,award_amount,service_period,maintenance_period,warranty_period,acceptance_standard,acceptance_result,acceptance_result_locator,service_period_source,warranty_maintenance_source,settlement_basis,payment_trigger,payment_deadline,notice_url\n",
            "Service evidence complete,Test purchaser,contract,contract,R17-SVC-001,1000000,960000,12 months,3 months,1 year,deliverables accepted,accepted result,acceptance-locator-1,contract clause,warranty clause,settle by accepted output,after acceptance,30 days,https://example.gov.cn/r17-service-complete.html\n",
            "Service evidence missing,Test purchaser,contract,contract,R17-SVC-002,1000000,950000,,maintenance required,1 year,,,,warranty clause,settle by accepted output,after acceptance,,https://example.gov.cn/r17-service-missing.html\n"
        );

        let preview = preview_procurement_csv_bytes(
            "round17-service-evidence.csv",
            csv.as_bytes(),
            Some("round17 service evidence"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 2);
        let complete = &preview.records[0];
        assert_eq!(complete.service_period.as_deref(), Some("12 months"));
        assert_eq!(complete.maintenance_period.as_deref(), Some("3 months"));
        assert_eq!(complete.warranty_period.as_deref(), Some("1 year"));
        assert_eq!(
            complete.acceptance_standard.as_deref(),
            Some("deliverables accepted")
        );
        assert_eq!(
            complete.acceptance_result.as_deref(),
            Some("accepted result")
        );
        assert_eq!(
            complete.acceptance_result_locator.as_deref(),
            Some("acceptance-locator-1")
        );
        assert_eq!(
            complete.service_period_source.as_deref(),
            Some("contract clause")
        );
        assert_eq!(
            complete.warranty_maintenance_source.as_deref(),
            Some("warranty clause")
        );
        assert_eq!(
            complete.payment_trigger.as_deref(),
            Some("after acceptance")
        );
        assert_eq!(complete.payment_deadline.as_deref(), Some("30 days"));

        let checks = preview
            .quality_report
            .checks
            .iter()
            .map(|check| (&check.code, check.row_number, &check.severity))
            .collect::<Vec<_>>();
        assert!(checks.iter().any(|(code, row, severity)| {
            code.as_str() == "missing_service_period"
                && *row == Some(3)
                && matches!(severity, QualitySeverity::Info)
        }));
        assert!(checks.iter().any(|(code, row, severity)| {
            code.as_str() == "missing_acceptance_standard"
                && *row == Some(3)
                && matches!(severity, QualitySeverity::Info)
        }));
        assert!(checks.iter().any(|(code, row, severity)| {
            code.as_str() == "missing_acceptance_result_locator"
                && *row == Some(3)
                && matches!(severity, QualitySeverity::Info)
        }));
        assert!(checks.iter().any(|(code, row, severity)| {
            code.as_str() == "maintenance_or_warranty_review"
                && *row == Some(3)
                && matches!(severity, QualitySeverity::Info)
        }));
    }

    #[test]
    fn preserves_round_nineteen_procurement_exception_fields_and_review_only_rule() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,package_no,budget_amount,award_amount,procurement_exception_type,complaint_decision_no,complaint_issue_summary,complaint_handling_result,false_material_flag,award_invalidated_flag,rebid_required_flag,correction_notice_flag,supervision_penalty_subject,affected_package_no,source_title,source_url,source_legal_basis,source_legal_basis_article,source_decision_paragraph_index,source_handling_result_locator_hash\n",
            "Complaint exception,Test purchaser,complaint notice,award,R19-EX-001,02,1000000,980000,complaint_partly_established,MOF-R19-0001,false material allegation,partly established,true,true,true,true,Agency A,02,Complaint decision,https://example.gov.cn/r19-complaint.html,Government Procurement Law,Article 94,6,handle-hash-1\n"
        );

        let preview = preview_procurement_csv_bytes(
            "round19-procurement-exception.csv",
            csv.as_bytes(),
            Some("round19 procurement exception"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 1);
        let record = &preview.records[0];
        assert_eq!(
            record.procurement_exception_type.as_deref(),
            Some("complaint_partly_established")
        );
        assert_eq!(
            record.complaint_decision_no.as_deref(),
            Some("MOF-R19-0001")
        );
        assert_eq!(
            record.complaint_issue_summary.as_deref(),
            Some("false material allegation")
        );
        assert_eq!(
            record.complaint_handling_result.as_deref(),
            Some("partly established")
        );
        assert_eq!(record.false_material_flag, Some(true));
        assert_eq!(record.award_invalidated_flag, Some(true));
        assert_eq!(record.rebid_required_flag, Some(true));
        assert_eq!(record.correction_notice_flag, Some(true));
        assert_eq!(
            record.supervision_penalty_subject.as_deref(),
            Some("Agency A")
        );
        assert_eq!(record.affected_package_no.as_deref(), Some("02"));

        let evidence = record.source_evidence.as_ref().expect("source evidence");
        assert_eq!(
            evidence.legal_basis.as_deref(),
            Some("Government Procurement Law")
        );
        assert_eq!(evidence.legal_basis_article.as_deref(), Some("Article 94"));
        assert_eq!(evidence.decision_paragraph_index, Some(6));
        assert_eq!(evidence.affected_package_no.as_deref(), Some("02"));
        assert_eq!(
            evidence.handling_result_locator_hash.as_deref(),
            Some("handle-hash-1")
        );

        assert!(preview.quality_report.checks.iter().any(|check| {
            check.code == "procurement_exception_review"
                && matches!(check.severity, QualitySeverity::Info)
        }));

        let findings = evaluate_procurement_rules(&preview.records);
        let exception = findings
            .iter()
            .find(|finding| finding.rule_code == "PROC-COMPLAINT-EXCEPTION-001")
            .expect("exception finding");
        assert_eq!(
            exception.finding_disposition.as_deref(),
            Some("review_recommended")
        );
        assert_ne!(
            exception.finding_disposition.as_deref(),
            Some("risk_candidate")
        );
    }

    #[test]
    fn preserves_round_twenty_one_penalty_credit_fields_and_evidence_weights() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,package_no,budget_amount,award_amount,procurement_exception_type,complaint_decision_no,complaint_issue_summary,complaint_handling_result,false_material_flag,penalty_decision_no,penalty_basis,penalty_basis_article,penalty_period,market_entry_restriction_scope,penalty_subject_type,penalty_subject_name,credit_repair_status,credit_repair_source_url,re_participation_review_flag,source_title,source_url,source_penalty_basis,source_penalty_decision_paragraph_index,source_credit_record_locator_hash,source_market_restriction_locator_hash\n",
            "Administrative penalty,Central purchaser,penalty notice,award,R21-PEN-001,01,1000000,980000,administrative_penalty,,administrative penalty notice,market entry restriction,false,MOF-R21-0001,Government Procurement Law,Article 77,2026-02-04 to 2027-02-03,government procurement market,supplier,Penalty Supplier,pending,,true,Penalty decision,https://example.gov.cn/r21-penalty.html,Government Procurement Law,8,credit-hash-1,market-hash-1\n",
            "Malicious collusion,Central purchaser,supervision notice,award,R21-PEN-002,02,1000000,970000,malicious_collusion_review,,malicious collusion review,review only,false,,,,,,,,,,false,Collusion review,https://example.gov.cn/r21-collusion.html,Government Procurement Law,9,credit-hash-2,market-hash-2\n",
            "Rejected complaint,Central purchaser,complaint notice,award,R21-PEN-003,03,1000000,960000,complaint_rejected,MOF-R21-0003,complaint rejected,rejected,false,,,,,,,,,,false,Rejected complaint,https://example.gov.cn/r21-rejected.html,Government Procurement Law,10,credit-hash-3,market-hash-3\n"
        );

        let preview = preview_procurement_csv_bytes(
            "round21-penalty-credit.csv",
            csv.as_bytes(),
            Some("round21 penalty credit"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 3);
        let penalty = &preview.records[0];
        assert_eq!(
            penalty.procurement_exception_type.as_deref(),
            Some("administrative_penalty")
        );
        assert_eq!(penalty.penalty_decision_no.as_deref(), Some("MOF-R21-0001"));
        assert_eq!(
            penalty.penalty_basis.as_deref(),
            Some("Government Procurement Law")
        );
        assert_eq!(penalty.penalty_basis_article.as_deref(), Some("Article 77"));
        assert_eq!(
            penalty.penalty_period.as_deref(),
            Some("2026-02-04 to 2027-02-03")
        );
        assert_eq!(
            penalty.market_entry_restriction_scope.as_deref(),
            Some("government procurement market")
        );
        assert_eq!(penalty.penalty_subject_type.as_deref(), Some("supplier"));
        assert_eq!(
            penalty.penalty_subject_name.as_deref(),
            Some("Penalty Supplier")
        );
        assert_eq!(penalty.credit_repair_status.as_deref(), Some("pending"));
        assert_eq!(penalty.re_participation_review_flag, Some(true));
        assert_eq!(
            penalty.exception_evidence_category.as_deref(),
            Some("administrative_penalty")
        );
        assert_eq!(penalty.exception_evidence_weight, Some(80));
        assert!(penalty
            .exception_weight_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("administrative penalty")));

        let collusion = &preview.records[1];
        assert_eq!(
            collusion.exception_evidence_category.as_deref(),
            Some("malicious_collusion")
        );
        assert_eq!(collusion.exception_evidence_weight, Some(75));

        let rejected = &preview.records[2];
        assert_eq!(
            rejected.exception_evidence_category.as_deref(),
            Some("complaint_rejected")
        );
        assert_eq!(rejected.exception_evidence_weight, Some(25));

        let evidence = penalty.source_evidence.as_ref().expect("source evidence");
        assert_eq!(
            evidence.penalty_basis.as_deref(),
            Some("Government Procurement Law")
        );
        assert_eq!(evidence.penalty_decision_paragraph_index, Some(8));
        assert_eq!(
            evidence.credit_record_locator_hash.as_deref(),
            Some("credit-hash-1")
        );
        assert_eq!(
            evidence.market_restriction_locator_hash.as_deref(),
            Some("market-hash-1")
        );
        assert!(evidence.has_locator());

        assert!(preview.quality_report.checks.iter().any(|check| {
            check.code == "missing_credit_repair_source"
                && check.row_number == Some(2)
                && matches!(check.severity, QualitySeverity::Info)
        }));

        let findings = evaluate_procurement_rules(&preview.records);
        let exception_findings = findings
            .iter()
            .filter(|finding| finding.rule_code == "PROC-COMPLAINT-EXCEPTION-001")
            .collect::<Vec<_>>();
        assert_eq!(exception_findings.len(), 3);
        assert!(exception_findings
            .iter()
            .all(|finding| finding.finding_disposition.as_deref() == Some("review_recommended")));
        assert!(exception_findings
            .iter()
            .all(|finding| finding.finding_disposition.as_deref() != Some("risk_candidate")));
    }

    #[test]
    fn preserves_round_twenty_three_complaint_adjudication_fields_and_review_only_rule() {
        let csv = concat!(
            "project_name,purchaser_name,announcement_type,procurement_stage,project_code,package_no,budget_amount,award_amount,procurement_exception_type,complaint_decision_no,allegation_type,allegation_outcome,confirmed_fact_flag,remedy_action,remedy_required_flag,complaint_issue_summary,complaint_handling_result,affected_package_no,source_title,source_url\n",
            "Established false material,Central purchaser,complaint decision,award,R23-COMP-001,01,1000000,980000,complaint_established,MOF-R23-0001,false_material,established,true,award_invalidated,true,false material allegation,established and award invalidated,01,Complaint decision,https://example.gov.cn/r23-established.html\n",
            "Rejected SME declaration,Central purchaser,complaint decision,award,R23-COMP-002,02,1000000,970000,complaint_rejected,MOF-R23-0002,sme_declaration,rejected,false,no_remedy_required,false,SME declaration allegation,rejected for insufficient proof,02,Complaint decision,https://example.gov.cn/r23-rejected.html\n"
        );

        let preview = preview_procurement_csv_bytes(
            "round23-complaint-adjudication.csv",
            csv.as_bytes(),
            Some("round23 complaint adjudication"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 2);
        let established = &preview.records[0];
        assert_eq!(
            established.allegation_type.as_deref(),
            Some("false_material")
        );
        assert_eq!(
            established.allegation_outcome.as_deref(),
            Some("established")
        );
        assert_eq!(established.confirmed_fact_flag, Some(true));
        assert_eq!(
            established.remedy_action.as_deref(),
            Some("award_invalidated")
        );
        assert_eq!(established.remedy_required_flag, Some(true));
        assert_eq!(established.allegation_evidence_weight, Some(70));
        assert!(established
            .allegation_weight_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("false material")));

        let rejected = &preview.records[1];
        assert_eq!(rejected.allegation_type.as_deref(), Some("sme_declaration"));
        assert_eq!(rejected.allegation_outcome.as_deref(), Some("rejected"));
        assert_eq!(rejected.confirmed_fact_flag, Some(false));
        assert_eq!(
            rejected.remedy_action.as_deref(),
            Some("no_remedy_required")
        );
        assert_eq!(rejected.allegation_evidence_weight, Some(25));

        let findings = evaluate_procurement_rules(&preview.records);
        let exception_findings = findings
            .iter()
            .filter(|finding| finding.rule_code == "PROC-COMPLAINT-EXCEPTION-001")
            .collect::<Vec<_>>();
        assert_eq!(exception_findings.len(), 2);
        assert!(exception_findings.iter().all(|finding| {
            finding.finding_disposition.as_deref() == Some("review_recommended")
                || finding.finding_disposition.as_deref() == Some("supplemental_data_only")
        }));
        assert!(exception_findings
            .iter()
            .all(|finding| finding.finding_disposition.as_deref() != Some("risk_candidate")));
        assert!(exception_findings.iter().any(|finding| finding
            .severity_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("allegation_outcome=rejected"))));
    }
}
