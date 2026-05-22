use crate::platform::{
    normalize_jiangsu_region, normalize_public_value, BudgetBreakdownItem, BudgetDatasetKind,
    BudgetLinkageSummary, BudgetSummaryRowRecord, BudgetSummaryTaskDetail, BudgetTrendPoint,
    BudgetVarianceHighlight, ImportQualityReport, NormalizedRegion, PlatformTaskFinding,
    QualityCheck, QualitySeverity, SourceEvidence, ValueUnit,
};
use anyhow::{Context, Result};
use calamine::{open_workbook_auto, Reader};
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetSummaryImportRecord {
    pub period: String,
    pub region: Option<String>,
    pub budget_scope: String,
    pub direction: String,
    pub budget_unit_name: Option<String>,
    pub budget_unit_code: Option<String>,
    pub budget_project_name: Option<String>,
    pub project_catalog_id: Option<String>,
    pub indicator_document_no: Option<String>,
    pub funding_source_name: Option<String>,
    pub function_classification_code: Option<String>,
    pub function_classification_name: Option<String>,
    pub economic_classification_code: Option<String>,
    pub economic_classification_name: Option<String>,
    pub summary_item: Option<String>,
    pub budget_amount: Option<String>,
    pub actual_amount: String,
    pub previous_period_amount: Option<String>,
    #[serde(default)]
    pub budget_value_unit: Option<ValueUnit>,
    #[serde(default)]
    pub actual_value_unit: Option<ValueUnit>,
    #[serde(default)]
    pub previous_period_value_unit: Option<ValueUnit>,
    #[serde(default)]
    pub normalized_actual_value: Option<String>,
    pub yoy_rate: Option<String>,
    #[serde(default)]
    pub policy_document_no: Option<String>,
    #[serde(default)]
    pub budget_subject_code: Option<String>,
    #[serde(default)]
    pub fund_destination: Option<String>,
    #[serde(default)]
    pub prohibited_use_summary: Option<String>,
    #[serde(default)]
    pub performance_report_due_at: Option<String>,
    #[serde(default)]
    pub required_budget_indicator_data: Option<String>,
    #[serde(default)]
    pub required_performance_target_data: Option<String>,
    #[serde(default)]
    pub required_project_performance_target_data: Option<String>,
    #[serde(default)]
    pub required_quarterly_performance_monitoring_data: Option<String>,
    #[serde(default)]
    pub required_payment_progress_data: Option<String>,
    #[serde(default)]
    pub required_voucher_attachment_data: Option<String>,
    #[serde(default)]
    pub required_payment_data: Option<String>,
    #[serde(default)]
    pub required_voucher_data: Option<String>,
    #[serde(default)]
    pub policy_supplemental_checklist_type: Option<String>,
    #[serde(default)]
    pub policy_topic: Option<String>,
    #[serde(default)]
    pub required_source_documents: Option<String>,
    #[serde(default)]
    pub next_data_priority: Option<String>,
    #[serde(default)]
    pub fund_usage_restriction_level: Option<String>,
    #[serde(default)]
    pub performance_evidence_required: Option<bool>,
    #[serde(default)]
    pub department_final_account_table_type: Option<String>,
    #[serde(default)]
    pub subject_code: Option<String>,
    #[serde(default)]
    pub subject_name: Option<String>,
    #[serde(default)]
    pub amount_column_name: Option<String>,
    #[serde(default)]
    pub performance_indicator_name: Option<String>,
    #[serde(default)]
    pub performance_indicator_value: Option<String>,
    #[serde(default)]
    pub performance_indicator_unit: Option<String>,
    #[serde(default)]
    pub fiscal_level: Option<String>,
    #[serde(default)]
    pub fiscal_section: Option<String>,
    #[serde(default)]
    pub budget_subject_category: Option<String>,
    #[serde(default)]
    pub opening_budget_amount: Option<String>,
    #[serde(default)]
    pub completion_rate: Option<String>,
    #[serde(default)]
    pub available_financial_capacity: Option<String>,
    #[serde(default)]
    pub fiscal_special_account_amount: Option<String>,
    #[serde(default)]
    pub livelihood_special_item: Option<String>,
    #[serde(default)]
    pub caliber_note: Option<String>,
    #[serde(default)]
    pub normalized_region: Option<NormalizedRegion>,
    #[serde(default)]
    pub source_evidence: Option<SourceEvidence>,
    pub source_row: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetBatchPayload {
    pub title: Option<String>,
    pub dataset_kind: BudgetDatasetKind,
    pub records: Vec<BudgetSummaryImportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetPreviewResult {
    pub title: String,
    pub primary_subject: String,
    pub dataset_kind: BudgetDatasetKind,
    pub records: Vec<BudgetSummaryImportRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
    pub trend_points: Vec<BudgetTrendPoint>,
    pub classification_breakdown: Vec<BudgetBreakdownItem>,
    pub variance_highlights: Vec<BudgetVarianceHighlight>,
    pub linkage_summary: BudgetLinkageSummary,
}

pub fn preview_budget_csv_bytes(
    _file_name: &str,
    bytes: &[u8],
    dataset_kind: BudgetDatasetKind,
    title: Option<&str>,
) -> Result<BudgetPreviewResult> {
    let decoded = decode_text(bytes);
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(decoded.as_bytes());
    let headers = reader.headers().context("failed to read budget headers")?;
    let header_row = headers.iter().map(str::to_string).collect::<Vec<_>>();
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.context("failed to read budget row")?;
        rows.push(row.iter().map(str::to_string).collect::<Vec<_>>());
    }
    Ok(validate_records(
        records_from_grid(dataset_kind, &header_row, &rows),
        dataset_kind,
        title,
    ))
}

pub fn preview_budget_excel_bytes(
    file_name: &str,
    bytes: &[u8],
    dataset_kind: BudgetDatasetKind,
    title: Option<&str>,
) -> Result<BudgetPreviewResult> {
    let extension = if file_name.to_ascii_lowercase().ends_with(".xls") {
        ".xls"
    } else {
        ".xlsx"
    };
    let temp_path = std::env::temp_dir().join(format!(
        "auditlens_budget_{}{}",
        uuid::Uuid::new_v4(),
        extension
    ));
    std::fs::write(&temp_path, bytes).context("failed to write temp budget spreadsheet")?;
    let workbook_result = open_workbook_auto(&temp_path);
    let _ = std::fs::remove_file(&temp_path);
    let mut workbook = workbook_result.context("failed to open budget spreadsheet")?;
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
        records_from_grid(dataset_kind, &headers, &body),
        dataset_kind,
        title,
    ))
}

pub fn preview_budget_batch(payload: BudgetBatchPayload) -> BudgetPreviewResult {
    validate_records(
        payload.records,
        payload.dataset_kind,
        payload.title.as_deref(),
    )
}

pub fn evaluate_budget_rules(records: &[BudgetSummaryImportRecord]) -> Vec<PlatformTaskFinding> {
    let mut findings = Vec::new();

    for record in records {
        if let (Some(budget), Some(actual)) = (
            amount_as_decimal(record.budget_amount.as_deref()),
            amount_as_decimal(Some(record.actual_amount.as_str())),
        ) {
            if actual > budget {
                findings.push(build_finding(
                    "BUDGET-LIMIT-001",
                    "Budget limit exceeded",
                    "budget_rules",
                    "High",
                    format!(
                        "Item {} actual {} exceeds budget {}",
                        budget_subject(record),
                        actual,
                        budget
                    ),
                    "Actual spending exceeds the budget control amount.",
                    "Review indicators, adjustments, approvals and execution evidence.",
                    format!(
                        "period={} scope={} direction={}",
                        record.period, record.budget_scope, record.direction
                    ),
                ));
            }

            if !budget.is_zero() {
                let execution_rate = actual * Decimal::new(100, 0) / budget;
                if execution_rate < Decimal::new(20, 0) || execution_rate > Decimal::new(95, 0) {
                    findings.push(build_finding(
                        "BUDGET-EXEC-001",
                        "Budget execution rate anomaly",
                        "budget_rules",
                        if execution_rate > Decimal::new(95, 0) {
                            "Medium"
                        } else {
                            "High"
                        },
                        format!(
                            "Item {} execution rate is {}%",
                            budget_subject(record),
                            execution_rate.round_dp(2).normalize()
                        ),
                        "Very low or high execution rates need review.",
                        "Review budget schedule, execution progress and concentrated spending.",
                        format!("budget={} actual={}", budget, actual),
                    ));
                }
            }
        }
    }

    let mut grouped: HashMap<(String, String), Vec<&BudgetSummaryImportRecord>> = HashMap::new();
    for record in records {
        grouped
            .entry((record.budget_scope.clone(), record.direction.clone()))
            .or_default()
            .push(record);
    }
    for group in grouped.values() {
        if group.len() < 3 {
            continue;
        }
        let mut sorted_amounts = group
            .iter()
            .filter_map(|record| amount_as_decimal(Some(record.actual_amount.as_str())))
            .collect::<Vec<_>>();
        if sorted_amounts.len() < 3 {
            continue;
        }
        sorted_amounts.sort();
        let median = sorted_amounts[sorted_amounts.len() / 2];
        let mut counts: HashMap<(Option<String>, Option<String>), usize> = HashMap::new();
        for record in group {
            let key = (
                record.function_classification_code.clone(),
                record.economic_classification_code.clone(),
            );
            *counts.entry(key).or_insert(0) += 1;
        }
        for record in group {
            let key = (
                record.function_classification_code.clone(),
                record.economic_classification_code.clone(),
            );
            let actual = amount_as_decimal(Some(record.actual_amount.as_str()));
            if counts.get(&key).copied().unwrap_or_default() == 1
                && actual.is_some_and(|value| value >= median)
            {
                findings.push(build_finding(
                    "BUDGET-CLASS-001",
                    "Classification outlier",
                    "budget_rules",
                    "Medium",
                    format!(
                        "Item {} has an uncommon classification combination",
                        budget_subject(record)
                    ),
                    "Uncommon classifications should be checked against budget attribution.",
                    "Review function classification, economic classification and attribution.",
                    format!(
                        "function={:?} economic={:?}",
                        record.function_classification_code, record.economic_classification_code
                    ),
                ));
            }
        }
    }

    for record in records
        .iter()
        .filter(|record| is_public_data_record(record))
    {
        if let Some(rate) = record
            .yoy_rate
            .as_deref()
            .and_then(|value| Decimal::from_str(value).ok())
        {
            if rate.abs() >= Decimal::new(10, 0) {
                let mut finding = build_finding(
                    "BUDGET-PUBLIC-TREND-001",
                    "Public fiscal/statistical indicator anomaly",
                    "public_fiscal_light_rules",
                    if rate.abs() >= Decimal::new(40, 0) {
                        "High"
                    } else {
                        "Medium"
                    },
                    format!(
                        "{} changed {}% year over year",
                        budget_subject(record),
                        rate.normalize()
                    ),
                    "Public data findings are PoC signals only.",
                    "Supplement internal budget, final account, contract and payment evidence.",
                    format!(
                        "region={:?} period={} source={:?}",
                        record.region,
                        record.period,
                        record
                            .source_evidence
                            .as_ref()
                            .and_then(|item| item.url.clone())
                    ),
                );
                finding.severity_reason = Some("public-data-lightweight-rule".to_string());
                finding.finding_disposition = Some("review_recommended".to_string());
                finding.recommended_next_data = vec![
                    "department_budget_indicator".to_string(),
                    "final_account_detail".to_string(),
                    "procurement_contract".to_string(),
                    "treasury_payment".to_string(),
                ];
                findings.push(finding);
            }
        }
    }

    findings
}

pub fn build_budget_task_detail(
    preview: &BudgetPreviewResult,
    rows_preview: Vec<BudgetSummaryRowRecord>,
    linkage_summary: BudgetLinkageSummary,
) -> BudgetSummaryTaskDetail {
    BudgetSummaryTaskDetail {
        dataset_kind: preview.dataset_kind,
        rows_preview,
        quality_report: preview.quality_report.clone(),
        applicable_rule_sets: preview.applicable_rule_sets.clone(),
        trend_points: preview.trend_points.clone(),
        classification_breakdown: preview.classification_breakdown.clone(),
        variance_highlights: preview.variance_highlights.clone(),
        linkage_summary,
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

fn records_from_grid(
    dataset_kind: BudgetDatasetKind,
    headers: &[String],
    rows: &[Vec<String>],
) -> Vec<BudgetSummaryImportRecord> {
    let header_map = build_header_map(dataset_kind, headers.iter().map(|value| value.as_str()));
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let row_number = index + 2;
            let mut budget_scope = value_from_cells(row, &header_map, "budget_scope");
            if budget_scope.trim().is_empty() {
                budget_scope = match dataset_kind {
                    BudgetDatasetKind::DepartmentExecutionDetail => String::new(),
                    BudgetDatasetKind::PublicFiscalSummary => "public_fiscal_summary".to_string(),
                    BudgetDatasetKind::PublicStatisticalIndicator => {
                        "public_statistical_indicator".to_string()
                    }
                    BudgetDatasetKind::InvestmentReviewSummary => {
                        "investment_review_summary".to_string()
                    }
                    BudgetDatasetKind::TownshipFiscalExecutionSummary => {
                        "township_fiscal_execution_summary".to_string()
                    }
                };
            }
            let mut direction = value_from_cells(row, &header_map, "direction");
            if direction.trim().is_empty() {
                direction = match dataset_kind {
                    BudgetDatasetKind::DepartmentExecutionDetail => String::new(),
                    BudgetDatasetKind::PublicFiscalSummary => "public_fiscal".to_string(),
                    BudgetDatasetKind::PublicStatisticalIndicator => {
                        "statistical_indicator".to_string()
                    }
                    BudgetDatasetKind::InvestmentReviewSummary => "investment_review".to_string(),
                    BudgetDatasetKind::TownshipFiscalExecutionSummary => {
                        "township_fiscal".to_string()
                    }
                };
            }

            BudgetSummaryImportRecord {
                period: value_from_cells(row, &header_map, "period"),
                region: optional_string(value_from_cells(row, &header_map, "region")),
                budget_scope,
                direction,
                budget_unit_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "budget_unit_name",
                )),
                budget_unit_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "budget_unit_code",
                )),
                budget_project_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "budget_project_name",
                )),
                project_catalog_id: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "project_catalog_id",
                )),
                indicator_document_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "indicator_document_no",
                )),
                funding_source_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "funding_source_name",
                )),
                function_classification_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "function_classification_code",
                )),
                function_classification_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "function_classification_name",
                )),
                economic_classification_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "economic_classification_code",
                )),
                economic_classification_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "economic_classification_name",
                )),
                summary_item: optional_string(value_from_cells(row, &header_map, "summary_item")),
                budget_amount: optional_string(value_from_cells(row, &header_map, "budget_amount")),
                actual_amount: value_from_cells(row, &header_map, "actual_amount"),
                previous_period_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "previous_period_amount",
                )),
                budget_value_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "budget_value_unit",
                )),
                actual_value_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "actual_value_unit",
                )),
                previous_period_value_unit: optional_unit(value_from_cells(
                    row,
                    &header_map,
                    "previous_period_value_unit",
                )),
                normalized_actual_value: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "normalized_actual_value",
                )),
                yoy_rate: optional_string(value_from_cells(row, &header_map, "yoy_rate")),
                policy_document_no: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "policy_document_no",
                )),
                budget_subject_code: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "budget_subject_code",
                )),
                fund_destination: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "fund_destination",
                )),
                prohibited_use_summary: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "prohibited_use_summary",
                )),
                performance_report_due_at: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "performance_report_due_at",
                )),
                required_budget_indicator_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_budget_indicator_data",
                )),
                required_performance_target_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_performance_target_data",
                )),
                required_project_performance_target_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_project_performance_target_data",
                )),
                required_quarterly_performance_monitoring_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_quarterly_performance_monitoring_data",
                )),
                required_payment_progress_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_payment_progress_data",
                )),
                required_voucher_attachment_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_voucher_attachment_data",
                )),
                required_payment_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_payment_data",
                )),
                required_voucher_data: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_voucher_data",
                )),
                policy_supplemental_checklist_type: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "policy_supplemental_checklist_type",
                )),
                policy_topic: optional_string(value_from_cells(row, &header_map, "policy_topic")),
                required_source_documents: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "required_source_documents",
                )),
                next_data_priority: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "next_data_priority",
                )),
                fund_usage_restriction_level: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "fund_usage_restriction_level",
                )),
                performance_evidence_required: optional_bool(value_from_cells(
                    row,
                    &header_map,
                    "performance_evidence_required",
                )),
                department_final_account_table_type: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "department_final_account_table_type",
                )),
                subject_code: optional_string(value_from_cells(row, &header_map, "subject_code")),
                subject_name: optional_string(value_from_cells(row, &header_map, "subject_name")),
                amount_column_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "amount_column_name",
                )),
                performance_indicator_name: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "performance_indicator_name",
                )),
                performance_indicator_value: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "performance_indicator_value",
                )),
                performance_indicator_unit: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "performance_indicator_unit",
                )),
                fiscal_level: optional_string(value_from_cells(row, &header_map, "fiscal_level")),
                fiscal_section: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "fiscal_section",
                )),
                budget_subject_category: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "budget_subject_category",
                )),
                opening_budget_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "opening_budget_amount",
                )),
                completion_rate: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "completion_rate",
                )),
                available_financial_capacity: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "available_financial_capacity",
                )),
                fiscal_special_account_amount: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "fiscal_special_account_amount",
                )),
                livelihood_special_item: optional_string(value_from_cells(
                    row,
                    &header_map,
                    "livelihood_special_item",
                )),
                caliber_note: optional_string(value_from_cells(row, &header_map, "caliber_note")),
                normalized_region: None,
                source_evidence: source_evidence_from_cells(row, &header_map, row_number),
                source_row: row_number,
            }
        })
        .collect()
}

fn validate_records(
    raw_records: Vec<BudgetSummaryImportRecord>,
    dataset_kind: BudgetDatasetKind,
    title: Option<&str>,
) -> BudgetPreviewResult {
    let mut checks = Vec::new();
    let mut accepted = Vec::new();

    for mut record in raw_records {
        let mut row_has_error = false;
        for (field_key, field_label, value) in required_fields(dataset_kind, &record) {
            if value.unwrap_or_default().trim().is_empty() {
                row_has_error = true;
                checks.push(QualityCheck {
                    code: format!("missing_{}", field_key),
                    severity: QualitySeverity::Error,
                    message: format!("missing required field {}", field_label),
                    field: Some(field_key.to_string()),
                    row_number: Some(record.source_row),
                });
            }
        }

        record.normalized_region = record
            .region
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(normalize_jiangsu_region);
        if let Some(evidence) = record.source_evidence.as_mut() {
            if evidence.row_number.is_none() {
                evidence.row_number = Some(record.source_row);
            }
        }
        if !matches!(dataset_kind, BudgetDatasetKind::DepartmentExecutionDetail)
            && !record
                .source_evidence
                .as_ref()
                .is_some_and(SourceEvidence::has_traceable_source)
        {
            checks.push(QualityCheck {
                code: "missing_source_evidence".to_string(),
                severity: QualitySeverity::Warning,
                message: "public data source evidence is missing".to_string(),
                field: Some("source_evidence".to_string()),
                row_number: Some(record.source_row),
            });
        }
        if !matches!(dataset_kind, BudgetDatasetKind::DepartmentExecutionDetail)
            && record
                .source_evidence
                .as_ref()
                .is_some_and(SourceEvidence::has_traceable_source)
            && !record
                .source_evidence
                .as_ref()
                .is_some_and(SourceEvidence::has_locator)
        {
            checks.push(QualityCheck {
                code: "missing_source_locator".to_string(),
                severity: QualitySeverity::Warning,
                message: "public data source locator is missing".to_string(),
                field: Some("source_evidence".to_string()),
                row_number: Some(record.source_row),
            });
        }
        if matches!(dataset_kind, BudgetDatasetKind::DepartmentExecutionDetail)
            && record
                .budget_unit_code
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            checks.push(QualityCheck {
                code: "missing_budget_unit_code".to_string(),
                severity: QualitySeverity::Warning,
                message: "budget unit code is missing".to_string(),
                field: Some("budget_unit_code".to_string()),
                row_number: Some(record.source_row),
            });
        }

        record.period = match normalize_period(&record.period) {
            Ok(value) => value,
            Err(_) => {
                row_has_error = true;
                checks.push(QualityCheck {
                    code: "invalid_period".to_string(),
                    severity: QualitySeverity::Error,
                    message: "invalid period".to_string(),
                    field: Some("period".to_string()),
                    row_number: Some(record.source_row),
                });
                record.period
            }
        };

        let raw_budget_amount = record.budget_amount.clone();
        let raw_actual_amount = record.actual_amount.clone();
        let raw_previous_period_amount = record.previous_period_amount.clone();

        record.budget_amount = normalize_optional_amount(
            record.budget_amount.take(),
            record.source_row,
            "budget_amount",
            &mut checks,
            false,
            &mut row_has_error,
        );
        record.actual_amount = match normalize_amount(&record.actual_amount) {
            Ok(Some(value)) => value,
            _ => {
                row_has_error = true;
                checks.push(QualityCheck {
                    code: "invalid_actual_amount".to_string(),
                    severity: QualitySeverity::Error,
                    message: "invalid actual amount".to_string(),
                    field: Some("actual_amount".to_string()),
                    row_number: Some(record.source_row),
                });
                record.actual_amount
            }
        };
        record.previous_period_amount = normalize_optional_amount(
            record.previous_period_amount.take(),
            record.source_row,
            "previous_period_amount",
            &mut checks,
            false,
            &mut row_has_error,
        );
        record.opening_budget_amount = normalize_optional_amount(
            record.opening_budget_amount.take(),
            record.source_row,
            "opening_budget_amount",
            &mut checks,
            false,
            &mut row_has_error,
        );
        record.available_financial_capacity = normalize_optional_amount(
            record.available_financial_capacity.take(),
            record.source_row,
            "available_financial_capacity",
            &mut checks,
            false,
            &mut row_has_error,
        );
        record.fiscal_special_account_amount = normalize_optional_amount(
            record.fiscal_special_account_amount.take(),
            record.source_row,
            "fiscal_special_account_amount",
            &mut checks,
            false,
            &mut row_has_error,
        );

        if let Some(value) = normalize_public_value(
            raw_budget_amount
                .as_deref()
                .or(record.budget_amount.as_deref())
                .unwrap_or_default(),
            ValueUnit::Unknown,
        ) {
            if record.budget_value_unit.is_none() {
                record.budget_value_unit = Some(value.unit);
            }
        }
        if let Some(value) = normalize_public_value(&raw_actual_amount, ValueUnit::Unknown) {
            if record.actual_value_unit.is_none() {
                record.actual_value_unit = Some(value.unit);
            }
            if record.normalized_actual_value.is_none() {
                record.normalized_actual_value = Some(value.normalized_value);
            }
        }
        if let Some(value) = normalize_public_value(
            raw_previous_period_amount
                .as_deref()
                .or(record.previous_period_amount.as_deref())
                .unwrap_or_default(),
            ValueUnit::Unknown,
        ) {
            if record.previous_period_value_unit.is_none() {
                record.previous_period_value_unit = Some(value.unit);
            }
        }

        record.yoy_rate = normalize_optional_rate(
            record.yoy_rate.take(),
            record.source_row,
            &mut checks,
            &mut row_has_error,
        );
        record.completion_rate = normalize_optional_rate(
            record.completion_rate.take(),
            record.source_row,
            &mut checks,
            &mut row_has_error,
        );

        if !row_has_error {
            accepted.push(record);
        }
    }

    let mut duplicate_keys = HashMap::<String, Vec<usize>>::new();
    for record in &accepted {
        duplicate_keys
            .entry(record_key(dataset_kind, record))
            .or_default()
            .push(record.source_row);
    }
    for (key, rows) in duplicate_keys {
        if rows.len() > 1 {
            checks.push(QualityCheck {
                code: "duplicate_budget_row".to_string(),
                severity: QualitySeverity::Warning,
                message: format!("duplicate budget row key {}", key),
                field: None,
                row_number: rows.first().copied(),
            });
        }
    }

    let title = title
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| match dataset_kind {
            BudgetDatasetKind::DepartmentExecutionDetail => "budget execution import".to_string(),
            BudgetDatasetKind::PublicFiscalSummary => "public fiscal summary import".to_string(),
            BudgetDatasetKind::PublicStatisticalIndicator => {
                "public statistical indicator import".to_string()
            }
            BudgetDatasetKind::InvestmentReviewSummary => "investment review import".to_string(),
            BudgetDatasetKind::TownshipFiscalExecutionSummary => {
                "township fiscal execution import".to_string()
            }
        });
    let primary_subject = match dataset_kind {
        BudgetDatasetKind::DepartmentExecutionDetail => accepted
            .first()
            .and_then(|record| record.budget_unit_name.clone())
            .unwrap_or_else(|| "unknown budget unit".to_string()),
        _ => accepted
            .first()
            .and_then(|record| record.region.clone())
            .unwrap_or_else(|| "unknown region".to_string()),
    };
    let rejected_rows = checks
        .iter()
        .filter(|check| check.severity == QualitySeverity::Error)
        .filter_map(|check| check.row_number)
        .collect::<HashSet<_>>()
        .len();

    BudgetPreviewResult {
        title,
        primary_subject,
        dataset_kind,
        records: accepted.clone(),
        quality_report: ImportQualityReport {
            total_rows: accepted.len() + rejected_rows,
            accepted_rows: accepted.len(),
            rejected_rows,
            checks,
        },
        applicable_rule_sets: if is_public_dataset(dataset_kind) {
            vec![
                "budget_rules".to_string(),
                "public_fiscal_light_rules".to_string(),
            ]
        } else {
            vec!["budget_rules".to_string()]
        },
        trend_points: build_trend_points(&accepted),
        classification_breakdown: build_breakdown(dataset_kind, &accepted),
        variance_highlights: build_variance_highlights(&accepted),
        linkage_summary: BudgetLinkageSummary::default(),
    }
}

fn required_fields<'a>(
    dataset_kind: BudgetDatasetKind,
    record: &'a BudgetSummaryImportRecord,
) -> Vec<(&'static str, &'static str, Option<&'a str>)> {
    match dataset_kind {
        BudgetDatasetKind::DepartmentExecutionDetail => vec![
            ("period", "period", Some(record.period.as_str())),
            (
                "budget_scope",
                "budget_scope",
                Some(record.budget_scope.as_str()),
            ),
            ("direction", "direction", Some(record.direction.as_str())),
            (
                "budget_unit_name",
                "budget_unit_name",
                record.budget_unit_name.as_deref(),
            ),
            (
                "actual_amount",
                "actual_amount",
                Some(record.actual_amount.as_str()),
            ),
        ],
        _ => vec![
            ("period", "period", Some(record.period.as_str())),
            ("region", "region", record.region.as_deref()),
            (
                "budget_scope",
                "budget_scope",
                Some(record.budget_scope.as_str()),
            ),
            ("direction", "direction", Some(record.direction.as_str())),
            (
                "summary_item",
                "summary_item",
                record.summary_item.as_deref(),
            ),
            (
                "actual_amount",
                "actual_amount",
                Some(record.actual_amount.as_str()),
            ),
        ],
    }
}

fn build_header_map<'a, I>(dataset_kind: BudgetDatasetKind, headers: I) -> HashMap<String, usize>
where
    I: Iterator<Item = &'a str>,
{
    let aliases = header_aliases(dataset_kind);
    let mut map = HashMap::new();
    for (index, header) in headers.enumerate() {
        let normalized = normalize_header(header);
        for (field, values) in &aliases {
            if values.iter().any(|alias| alias == &normalized) {
                map.insert(field.to_string(), index);
                break;
            }
        }
    }
    map
}

fn header_aliases(dataset_kind: BudgetDatasetKind) -> BTreeMap<&'static str, Vec<String>> {
    let mut map = BTreeMap::from([
        (
            "period",
            aliases(&["period", "year", "month", "time_period"]),
        ),
        ("region", aliases(&["region", "area"])),
        ("budget_scope", aliases(&["budget_scope", "scope"])),
        ("direction", aliases(&["direction", "type"])),
        (
            "summary_item",
            aliases(&["summary_item", "indicator", "item"]),
        ),
        ("budget_amount", aliases(&["budget_amount", "budget_value"])),
        (
            "actual_amount",
            aliases(&["actual_amount", "amount", "value"]),
        ),
        (
            "previous_period_amount",
            aliases(&["previous_period_amount", "previous_amount"]),
        ),
        ("budget_value_unit", aliases(&["budget_value_unit"])),
        (
            "actual_value_unit",
            aliases(&["actual_value_unit", "value_unit"]),
        ),
        (
            "previous_period_value_unit",
            aliases(&["previous_period_value_unit"]),
        ),
        (
            "normalized_actual_value",
            aliases(&["normalized_actual_value"]),
        ),
        ("yoy_rate", aliases(&["yoy_rate"])),
        ("source_title", aliases(&["source_title", "title"])),
        ("source_url", aliases(&["source_url", "url"])),
        (
            "source_published_at",
            aliases(&["source_published_at", "published_at"]),
        ),
        (
            "source_captured_at",
            aliases(&["source_captured_at", "captured_at"]),
        ),
        ("parser_version", aliases(&["parser_version"])),
        (
            "source_page_number",
            aliases(&["source_page_number", "page_number"]),
        ),
        (
            "source_section_title",
            aliases(&["source_section_title", "section_title"]),
        ),
        (
            "source_locator_hash",
            aliases(&["source_locator_hash", "locator_hash"]),
        ),
        (
            "source_raw_excerpt",
            aliases(&["source_raw_excerpt", "raw_excerpt"]),
        ),
        (
            "source_table_title",
            aliases(&["source_table_title", "table_title"]),
        ),
        (
            "source_table_row_index",
            aliases(&["source_table_row_index", "table_row_index"]),
        ),
        (
            "source_table_column_name",
            aliases(&["source_table_column_name", "table_column_name"]),
        ),
        (
            "source_paragraph_index",
            aliases(&["source_paragraph_index", "paragraph_index"]),
        ),
        (
            "source_pdf_table_id",
            aliases(&["source_pdf_table_id", "pdf_table_id"]),
        ),
        ("policy_document_no", aliases(&["policy_document_no"])),
        ("budget_subject_code", aliases(&["budget_subject_code"])),
        ("fund_destination", aliases(&["fund_destination"])),
        (
            "prohibited_use_summary",
            aliases(&["prohibited_use_summary"]),
        ),
        (
            "performance_report_due_at",
            aliases(&["performance_report_due_at"]),
        ),
        (
            "required_budget_indicator_data",
            aliases(&["required_budget_indicator_data"]),
        ),
        (
            "required_performance_target_data",
            aliases(&["required_performance_target_data"]),
        ),
        (
            "required_project_performance_target_data",
            aliases(&["required_project_performance_target_data"]),
        ),
        (
            "required_quarterly_performance_monitoring_data",
            aliases(&["required_quarterly_performance_monitoring_data"]),
        ),
        (
            "required_payment_progress_data",
            aliases(&["required_payment_progress_data"]),
        ),
        (
            "required_voucher_attachment_data",
            aliases(&["required_voucher_attachment_data"]),
        ),
        ("required_payment_data", aliases(&["required_payment_data"])),
        ("required_voucher_data", aliases(&["required_voucher_data"])),
        (
            "policy_supplemental_checklist_type",
            aliases(&["policy_supplemental_checklist_type"]),
        ),
        ("policy_topic", aliases(&["policy_topic"])),
        (
            "required_source_documents",
            aliases(&["required_source_documents"]),
        ),
        ("next_data_priority", aliases(&["next_data_priority"])),
        (
            "fund_usage_restriction_level",
            aliases(&["fund_usage_restriction_level"]),
        ),
        (
            "performance_evidence_required",
            aliases(&["performance_evidence_required"]),
        ),
        (
            "department_final_account_table_type",
            aliases(&["department_final_account_table_type"]),
        ),
        ("subject_code", aliases(&["subject_code"])),
        ("subject_name", aliases(&["subject_name"])),
        ("amount_column_name", aliases(&["amount_column_name"])),
        (
            "performance_indicator_name",
            aliases(&["performance_indicator_name"]),
        ),
        (
            "performance_indicator_value",
            aliases(&["performance_indicator_value"]),
        ),
        (
            "performance_indicator_unit",
            aliases(&["performance_indicator_unit"]),
        ),
        ("fiscal_level", aliases(&["fiscal_level"])),
        ("fiscal_section", aliases(&["fiscal_section"])),
        (
            "budget_subject_category",
            aliases(&["budget_subject_category"]),
        ),
        ("opening_budget_amount", aliases(&["opening_budget_amount"])),
        ("completion_rate", aliases(&["completion_rate"])),
        (
            "available_financial_capacity",
            aliases(&["available_financial_capacity"]),
        ),
        (
            "fiscal_special_account_amount",
            aliases(&["fiscal_special_account_amount"]),
        ),
        (
            "livelihood_special_item",
            aliases(&["livelihood_special_item"]),
        ),
        ("caliber_note", aliases(&["caliber_note"])),
    ]);

    if matches!(dataset_kind, BudgetDatasetKind::DepartmentExecutionDetail) {
        map.insert("budget_unit_name", aliases(&["budget_unit_name"]));
        map.insert("budget_unit_code", aliases(&["budget_unit_code"]));
        map.insert("budget_project_name", aliases(&["budget_project_name"]));
        map.insert("project_catalog_id", aliases(&["project_catalog_id"]));
        map.insert("indicator_document_no", aliases(&["indicator_document_no"]));
        map.insert("funding_source_name", aliases(&["funding_source_name"]));
        map.insert(
            "function_classification_code",
            aliases(&["function_classification_code"]),
        );
        map.insert(
            "function_classification_name",
            aliases(&["function_classification_name"]),
        );
        map.insert(
            "economic_classification_code",
            aliases(&["economic_classification_code"]),
        );
        map.insert(
            "economic_classification_name",
            aliases(&["economic_classification_name"]),
        );
    }
    map
}

fn aliases(values: &[&str]) -> Vec<String> {
    values.iter().copied().map(normalize_header).collect()
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
        )),
        handling_result_locator_hash: optional_string(value_from_cells(
            cells,
            header_map,
            "source_handling_result_locator_hash",
        )),
        penalty_basis: optional_string(value_from_cells(cells, header_map, "source_penalty_basis")),
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

fn optional_bool(value: String) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" => None,
        "true" | "1" | "yes" | "y" => Some(true),
        "false" | "0" | "no" | "n" => Some(false),
        _ => None,
    }
}

fn normalize_optional_amount(
    value: Option<String>,
    row_number: usize,
    field_key: &str,
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
                    message: format!("invalid amount {}", field_key),
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
                message: format!("missing required field {}", field_key),
                field: Some(field_key.to_string()),
                row_number: Some(row_number),
            });
            *row_has_error = true;
            None
        }
        None => None,
    }
}

fn normalize_optional_rate(
    value: Option<String>,
    row_number: usize,
    checks: &mut Vec<QualityCheck>,
    row_has_error: &mut bool,
) -> Option<String> {
    match value {
        Some(value) => match normalize_rate(&value) {
            Ok(normalized) => normalized,
            Err(_) => {
                checks.push(QualityCheck {
                    code: "invalid_rate".to_string(),
                    severity: QualitySeverity::Error,
                    message: "invalid rate".to_string(),
                    field: Some("rate".to_string()),
                    row_number: Some(row_number),
                });
                *row_has_error = true;
                None
            }
        },
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

fn normalize_rate(value: &str) -> Result<Option<String>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.replace('%', "").trim().to_string();
    Decimal::from_str(&normalized)
        .map(|decimal| Some(decimal.normalize().to_string()))
        .context("invalid rate")
}

fn normalize_period(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("empty period");
    }
    if let Ok(date) = NaiveDate::parse_from_str(&format!("{}-01", trimmed), "%Y-%m-%d") {
        return Ok(format!("{:04}-{:02}", date.year(), date.month()));
    }
    if let Ok(date) = NaiveDate::parse_from_str(&format!("{}-01-01", trimmed), "%Y-%m-%d") {
        return Ok(format!("{:04}-{:02}", date.year(), date.month()));
    }
    for format in ["%Y/%m/%d", "%Y.%m.%d", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S"] {
        if let Ok(date) = NaiveDate::parse_from_str(trimmed, format) {
            return Ok(format!("{:04}-{:02}", date.year(), date.month()));
        }
    }
    anyhow::bail!("invalid period")
}

fn record_key(dataset_kind: BudgetDatasetKind, record: &BudgetSummaryImportRecord) -> String {
    match dataset_kind {
        BudgetDatasetKind::DepartmentExecutionDetail => format!(
            "{}|{}|{}|{}|{}",
            record.period,
            record.budget_scope,
            record.direction,
            record.budget_unit_name.clone().unwrap_or_default(),
            record
                .indicator_document_no
                .clone()
                .or_else(|| record.project_catalog_id.clone())
                .or_else(|| record.budget_project_name.clone())
                .unwrap_or_default()
        ),
        _ => format!(
            "{}|{}|{}|{}|{}",
            record.period,
            record.region.clone().unwrap_or_default(),
            record.budget_scope,
            record.direction,
            record.summary_item.clone().unwrap_or_default()
        ),
    }
}

fn build_trend_points(records: &[BudgetSummaryImportRecord]) -> Vec<BudgetTrendPoint> {
    let mut grouped: BTreeMap<(String, String, String), (Option<Decimal>, Decimal)> =
        BTreeMap::new();
    for record in records {
        let key = (
            record.period.clone(),
            record.budget_scope.clone(),
            record.direction.clone(),
        );
        let entry = grouped.entry(key).or_insert((None, Decimal::ZERO));
        if let Some(value) = amount_as_decimal(record.budget_amount.as_deref()) {
            entry.0 = Some(entry.0.unwrap_or(Decimal::ZERO) + value);
        }
        if let Some(value) = amount_as_decimal(Some(record.actual_amount.as_str())) {
            entry.1 += value;
        }
    }
    grouped
        .into_iter()
        .map(
            |((period, budget_scope, direction), (budget_amount, actual_amount))| {
                BudgetTrendPoint {
                    period,
                    budget_scope,
                    direction,
                    budget_amount: budget_amount.map(|value| value.normalize().to_string()),
                    actual_amount: actual_amount.normalize().to_string(),
                }
            },
        )
        .collect()
}

fn build_breakdown(
    dataset_kind: BudgetDatasetKind,
    records: &[BudgetSummaryImportRecord],
) -> Vec<BudgetBreakdownItem> {
    let mut grouped: HashMap<(String, String, String), Decimal> = HashMap::new();
    for record in records {
        let (dimension, key, label) = match dataset_kind {
            BudgetDatasetKind::DepartmentExecutionDetail => (
                "function_classification".to_string(),
                record
                    .function_classification_code
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
                record
                    .function_classification_name
                    .clone()
                    .or_else(|| record.function_classification_code.clone())
                    .unwrap_or_else(|| "unclassified".to_string()),
            ),
            _ => (
                "summary_item".to_string(),
                record
                    .summary_item
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
                record
                    .summary_item
                    .clone()
                    .unwrap_or_else(|| "unclassified".to_string()),
            ),
        };
        let actual =
            amount_as_decimal(Some(record.actual_amount.as_str())).unwrap_or(Decimal::ZERO);
        *grouped
            .entry((dimension, key, label))
            .or_insert(Decimal::ZERO) += actual;
    }
    grouped
        .into_iter()
        .map(|((dimension, key, label), amount)| BudgetBreakdownItem {
            dimension,
            key,
            label,
            amount: amount.normalize().to_string(),
        })
        .collect()
}

fn build_variance_highlights(
    records: &[BudgetSummaryImportRecord],
) -> Vec<BudgetVarianceHighlight> {
    let mut items = Vec::new();
    for record in records {
        if let (Some(budget), Some(actual)) = (
            amount_as_decimal(record.budget_amount.as_deref()),
            amount_as_decimal(Some(record.actual_amount.as_str())),
        ) {
            if actual > budget {
                items.push(BudgetVarianceHighlight {
                    rule_code: "BUDGET-EXEC-001".to_string(),
                    label: "over budget".to_string(),
                    subject: budget_subject(record),
                    metric_value: (actual - budget).normalize().to_string(),
                    risk_level: if actual > budget * Decimal::new(12, 1) {
                        "High".to_string()
                    } else if actual > budget {
                        "Medium".to_string()
                    } else {
                        "Low".to_string()
                    },
                });
            }
        }
        if let Some(rate) = record
            .yoy_rate
            .as_deref()
            .and_then(|value| Decimal::from_str(value).ok())
        {
            if rate.abs() >= Decimal::new(10, 0) {
                items.push(BudgetVarianceHighlight {
                    rule_code: "BUDGET-TREND-001".to_string(),
                    label: "year over year change".to_string(),
                    subject: budget_subject(record),
                    metric_value: format!("{}%", rate.normalize()),
                    risk_level: if rate.abs() >= Decimal::new(40, 0) {
                        "Medium".to_string()
                    } else {
                        "Low".to_string()
                    },
                });
            }
        }
    }
    items
}

fn budget_subject(record: &BudgetSummaryImportRecord) -> String {
    record
        .budget_project_name
        .clone()
        .or_else(|| record.summary_item.clone())
        .unwrap_or_else(|| "budget record".to_string())
}

fn is_public_data_record(record: &BudgetSummaryImportRecord) -> bool {
    record.budget_unit_name.is_none() && record.summary_item.is_some() && record.region.is_some()
}

fn is_public_dataset(dataset_kind: BudgetDatasetKind) -> bool {
    !matches!(dataset_kind, BudgetDatasetKind::DepartmentExecutionDetail)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn public_record(
        summary_item: &str,
        actual_amount: &str,
        yoy_rate: Option<&str>,
    ) -> BudgetSummaryImportRecord {
        BudgetSummaryImportRecord {
            period: "2026-03".to_string(),
            region: Some("姹熻嫃鐪佸崡閫氬競".to_string()),
            budget_scope: "public_fiscal_summary".to_string(),
            direction: "revenue".to_string(),
            budget_unit_name: None,
            budget_unit_code: None,
            budget_project_name: None,
            project_catalog_id: None,
            indicator_document_no: None,
            funding_source_name: None,
            function_classification_code: None,
            function_classification_name: None,
            economic_classification_code: None,
            economic_classification_name: None,
            summary_item: Some(summary_item.to_string()),
            budget_amount: Some("1000".to_string()),
            actual_amount: actual_amount.to_string(),
            previous_period_amount: Some("800".to_string()),
            budget_value_unit: None,
            actual_value_unit: None,
            previous_period_value_unit: None,
            normalized_actual_value: None,
            yoy_rate: yoy_rate.map(str::to_string),
            policy_document_no: None,
            budget_subject_code: None,
            fund_destination: None,
            prohibited_use_summary: None,
            performance_report_due_at: None,
            required_budget_indicator_data: None,
            required_performance_target_data: None,
            required_project_performance_target_data: None,
            required_quarterly_performance_monitoring_data: None,
            required_payment_progress_data: None,
            required_voucher_attachment_data: None,
            required_payment_data: None,
            required_voucher_data: None,
            policy_supplemental_checklist_type: None,
            policy_topic: None,
            required_source_documents: None,
            next_data_priority: None,
            fund_usage_restriction_level: None,
            performance_evidence_required: None,
            department_final_account_table_type: None,
            subject_code: None,
            subject_name: None,
            amount_column_name: None,
            performance_indicator_name: None,
            performance_indicator_value: None,
            performance_indicator_unit: None,
            fiscal_level: None,
            fiscal_section: None,
            budget_subject_category: None,
            opening_budget_amount: None,
            completion_rate: None,
            available_financial_capacity: None,
            fiscal_special_account_amount: None,
            livelihood_special_item: None,
            caliber_note: None,
            normalized_region: None,
            source_evidence: None,
            source_row: 1,
        }
    }

    #[test]
    fn maps_department_execution_headers_and_reports_quality() {
        let csv = "\
period,budget_unit_name,budget_unit_code,budget_scope,direction,budget_project_name,project_catalog_id,indicator_document_no,funding_source_name,function_classification_code,function_classification_name,economic_classification_code,economic_classification_name,budget_amount,actual_amount\n\
2026-03,Finance Bureau,440100001,general,expense,Project A,CAT-001,DOC-001,general,2019999,fiscal,30201,office,1000000,1200000\n\
2026-03,Finance Bureau,,general,expense,,,,,,,,,500000,100000\n";

        let preview = preview_budget_csv_bytes(
            "budget.csv",
            csv.as_bytes(),
            BudgetDatasetKind::DepartmentExecutionDetail,
            Some("department budget execution"),
        )
        .unwrap();

        assert_eq!(
            preview.dataset_kind,
            BudgetDatasetKind::DepartmentExecutionDetail
        );
        assert_eq!(preview.records.len(), 2);
        assert_eq!(
            preview.records[0].indicator_document_no.as_deref(),
            Some("DOC-001")
        );
        assert!(preview
            .quality_report
            .checks
            .iter()
            .any(|check| check.code == "missing_budget_unit_code" && check.row_number == Some(3)));
    }

    #[test]
    fn normalizes_public_fiscal_summary_batch_and_builds_highlights() {
        let preview = preview_budget_batch(BudgetBatchPayload {
            title: Some("public fiscal summary".to_string()),
            dataset_kind: BudgetDatasetKind::PublicFiscalSummary,
            records: vec![
                public_record("tax revenue", "1200000", Some("50")),
                public_record("education expense", "760000", None),
            ],
        });

        assert_eq!(preview.title, "public fiscal summary");
        assert_eq!(preview.quality_report.total_rows, 2);
        assert!(!preview.variance_highlights.is_empty());
    }

    #[test]
    fn imports_public_statistical_indicators_with_source_and_region_traceability() {
        let csv = concat!(
            "period,region,summary_item,actual_amount,previous_period_amount,yoy_rate,source_title,source_url,source_published_at,source_captured_at,parser_version\n",
            "2025-12,海安市,GDP,15800000,14800000,6.7,Haian report,https://example.gov.cn/haian.html,2026-03-31,2026-04-26T10:00:00+08:00,jiangsu-public-v1\n",
            "2025-12,江阴市,general public budget revenue,3200000,2800000,14.3,,,,,\n"
        );

        let preview = preview_budget_csv_bytes(
            "jiangsu-indicators.csv",
            csv.as_bytes(),
            BudgetDatasetKind::PublicStatisticalIndicator,
            Some("jiangsu indicators"),
        )
        .unwrap();

        assert_eq!(preview.records.len(), 2);
        assert_eq!(
            preview.records[0]
                .source_evidence
                .as_ref()
                .and_then(|item| item.url.as_deref()),
            Some("https://example.gov.cn/haian.html")
        );
        assert!(preview.quality_report.checks.iter().any(|check| {
            check.code == "missing_source_evidence" && check.severity == QualitySeverity::Warning
        }));

        let findings = evaluate_budget_rules(&preview.records);
        let trend = findings
            .iter()
            .find(|finding| finding.rule_code == "BUDGET-PUBLIC-TREND-001")
            .expect("large public-data trend changes should create lightweight findings");
        assert_eq!(
            trend.severity_reason.as_deref(),
            Some("public-data-lightweight-rule")
        );
        assert!(trend
            .recommended_next_data
            .contains(&"department_budget_indicator".to_string()));
    }

    #[test]
    fn preserves_special_fund_policy_fields_for_public_fiscal_summary() {
        let csv = concat!(
            "period,region,budget_scope,direction,summary_item,actual_amount,policy_document_no,budget_subject_code,fund_destination,prohibited_use_summary,performance_report_due_at,required_payment_data,required_voucher_data,fund_usage_restriction_level,performance_evidence_required,source_title,source_url\n",
            "2025-03,Taizhou,special_fund,expense,agricultural special fund,1593.78,TZ-2025-22,213,agriculture,no over-scope use,2026-01-15,payment detail,voucher abstract,strict,true,Taizhou notice,https://example.gov.cn/taizhou-special-fund.html\n"
        );

        let preview = preview_budget_csv_bytes(
            "taizhou-special-fund.csv",
            csv.as_bytes(),
            BudgetDatasetKind::PublicFiscalSummary,
            Some("special fund structuring"),
        )
        .unwrap();

        assert_eq!(preview.records.len(), 1);
        let record = preview.records.first().unwrap();
        assert_eq!(record.policy_document_no.as_deref(), Some("TZ-2025-22"));
        assert_eq!(record.budget_subject_code.as_deref(), Some("213"));
        assert_eq!(record.fund_destination.as_deref(), Some("agriculture"));
        assert_eq!(
            record.performance_report_due_at.as_deref(),
            Some("2026-01-15")
        );
        assert_eq!(
            record.required_payment_data.as_deref(),
            Some("payment detail")
        );
        assert_eq!(
            record.required_voucher_data.as_deref(),
            Some("voucher abstract")
        );
        assert_eq!(
            record.fund_usage_restriction_level.as_deref(),
            Some("strict")
        );
        assert_eq!(record.performance_evidence_required, Some(true));
    }

    #[test]
    fn preserves_policy_supplemental_data_fields_for_public_fiscal_summary() {
        let csv = concat!(
            "period,region,budget_scope,direction,summary_item,actual_amount,required_budget_indicator_data,required_performance_target_data,required_payment_data,required_voucher_data,source_title,source_url\n",
            "2025-08,Jiangsu,policy,reference,zero based budget policy,1,department budget indicator,performance target table,treasury payment detail,voucher abstract,Jiangsu policy,https://example.gov.cn/jiangsu-policy.html\n"
        );

        let preview = preview_budget_csv_bytes(
            "round11-policy.csv",
            csv.as_bytes(),
            BudgetDatasetKind::PublicFiscalSummary,
            Some("round11 fiscal policy supplemental data"),
        )
        .unwrap();

        assert_eq!(preview.records.len(), 1);
        let record = preview.records.first().unwrap();
        assert_eq!(
            record.required_budget_indicator_data.as_deref(),
            Some("department budget indicator")
        );
        assert_eq!(
            record.required_performance_target_data.as_deref(),
            Some("performance target table")
        );
        assert_eq!(
            record.required_payment_data.as_deref(),
            Some("treasury payment detail")
        );
        assert_eq!(
            record.required_voucher_data.as_deref(),
            Some("voucher abstract")
        );
    }

    #[test]
    fn preserves_round_seventeen_fiscal_performance_supplemental_checklist_fields() {
        let csv = concat!(
            "period,region,budget_scope,direction,summary_item,actual_amount,required_budget_indicator_data,required_project_performance_target_data,required_quarterly_performance_monitoring_data,required_payment_progress_data,required_voucher_attachment_data,source_title,source_url\n",
            "2026-01,Jiangsu,policy,reference,performance management policy,1,budget indicator,project performance target,quarterly monitoring,payment progress,voucher attachment,Jiangsu performance policy,https://example.gov.cn/r17-performance.html\n"
        );

        let preview = preview_budget_csv_bytes(
            "round17-performance-checklist.csv",
            csv.as_bytes(),
            BudgetDatasetKind::PublicFiscalSummary,
            Some("round17 fiscal performance supplemental checklist"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 1);
        let record = preview.records.first().unwrap();
        assert_eq!(
            record.required_budget_indicator_data.as_deref(),
            Some("budget indicator")
        );
        assert_eq!(
            record.required_project_performance_target_data.as_deref(),
            Some("project performance target")
        );
        assert_eq!(
            record
                .required_quarterly_performance_monitoring_data
                .as_deref(),
            Some("quarterly monitoring")
        );
        assert_eq!(
            record.required_payment_progress_data.as_deref(),
            Some("payment progress")
        );
        assert_eq!(
            record.required_voucher_attachment_data.as_deref(),
            Some("voucher attachment")
        );
        assert!(preview
            .quality_report
            .checks
            .iter()
            .all(|check| check.code != "substantive_violation"));
    }

    #[test]
    fn imports_township_fiscal_execution_summary_fields() {
        let csv = concat!(
            "period,region,budget_scope,direction,summary_item,actual_amount,fiscal_level,fiscal_section,budget_subject_category,opening_budget_amount,completion_rate,available_financial_capacity,fiscal_special_account_amount,livelihood_special_item,caliber_note,source_title,source_url,source_table_title,source_table_row_index,source_table_column_name,source_paragraph_index,source_pdf_table_id\n",
            "2025-12,Rugao Banjing Town,township fiscal execution,revenue,general public budget revenue,3200,township,revenue,general public budget,3000,106.7%,5100,120,livelihood special,restored caliber,Banjing 2025 fiscal report,https://example.gov.cn/township-fiscal.html,revenue completion table,4,actual revenue,8,township-table-1\n"
        );

        let preview = preview_budget_csv_bytes(
            "township-fiscal.csv",
            csv.as_bytes(),
            BudgetDatasetKind::TownshipFiscalExecutionSummary,
            Some("township fiscal execution"),
        )
        .unwrap();

        assert_eq!(
            preview.dataset_kind,
            BudgetDatasetKind::TownshipFiscalExecutionSummary
        );
        assert_eq!(preview.records.len(), 1);
        assert!(preview
            .applicable_rule_sets
            .contains(&"public_fiscal_light_rules".to_string()));
        let record = preview.records.first().unwrap();
        assert_eq!(record.fiscal_level.as_deref(), Some("township"));
        assert_eq!(record.fiscal_section.as_deref(), Some("revenue"));
        assert_eq!(record.completion_rate.as_deref(), Some("106.7"));
        assert_eq!(record.available_financial_capacity.as_deref(), Some("5100"));
        assert_eq!(
            record
                .source_evidence
                .as_ref()
                .and_then(|source| source.table_title.as_deref()),
            Some("revenue completion table")
        );
        assert_eq!(
            record
                .source_evidence
                .as_ref()
                .and_then(|source| source.pdf_table_id.as_deref()),
            Some("township-table-1")
        );
    }

    #[test]
    fn preserves_department_final_account_pdf_fields() {
        let csv = concat!(
            "period,region,budget_scope,direction,summary_item,actual_amount,department_final_account_table_type,subject_code,subject_name,amount_column_name,performance_indicator_name,performance_indicator_value,performance_indicator_unit,source_title,source_url,source_page_number,source_table_title,source_table_row_index,source_table_column_name,source_locator_hash\n",
            "2024-12,Jiangsu,department final account,expense,general public service,1200.50,final_income_expense,201,General public service,amount,,,,'2024 final account',https://example.gov.cn/final-account.pdf,7,Income and expense final account,3,amount,loc-final-1\n",
            "2024-12,Jiangsu,department final account,performance,coverage,95,performance_self_evaluation,,,indicator value,Public service coverage,95,percent,'2024 final account',https://example.gov.cn/final-account.pdf,12,Project performance self-evaluation,2,indicator value,loc-final-2\n",
        );

        let preview = preview_budget_csv_bytes(
            "department-final-account.csv",
            csv.as_bytes(),
            BudgetDatasetKind::PublicFiscalSummary,
            Some("department final account"),
        )
        .unwrap();

        assert_eq!(preview.records.len(), 2);
        assert_eq!(
            preview.records[0]
                .department_final_account_table_type
                .as_deref(),
            Some("final_income_expense")
        );
        assert_eq!(preview.records[0].subject_code.as_deref(), Some("201"));
        assert_eq!(
            preview.records[0].subject_name.as_deref(),
            Some("General public service")
        );
        assert_eq!(
            preview.records[0].amount_column_name.as_deref(),
            Some("amount")
        );
        assert_eq!(
            preview.records[1].performance_indicator_name.as_deref(),
            Some("Public service coverage")
        );
        assert_eq!(
            preview.records[1].performance_indicator_value.as_deref(),
            Some("95")
        );
        assert_eq!(
            preview.records[1].performance_indicator_unit.as_deref(),
            Some("percent")
        );
        assert_eq!(
            preview.records[1]
                .source_evidence
                .as_ref()
                .and_then(|source| source.locator_hash.as_deref()),
            Some("loc-final-2")
        );
    }

    #[test]
    fn evaluates_budget_rules_for_limit_execution_and_classification() {
        let findings = evaluate_budget_rules(&[
            BudgetSummaryImportRecord {
                function_classification_code: Some("2019999".to_string()),
                economic_classification_code: Some("30201".to_string()),
                budget_project_name: Some("Project A".to_string()),
                actual_amount: "1200000".to_string(),
                ..public_record("project-a", "1200000", None)
            },
            BudgetSummaryImportRecord {
                function_classification_code: Some("2019999".to_string()),
                economic_classification_code: Some("30201".to_string()),
                budget_project_name: Some("Project B".to_string()),
                actual_amount: "100000".to_string(),
                ..public_record("project-b", "100000", None)
            },
            BudgetSummaryImportRecord {
                function_classification_code: Some("2299999".to_string()),
                economic_classification_code: Some("31099".to_string()),
                budget_project_name: Some("Project C".to_string()),
                actual_amount: "980000".to_string(),
                ..public_record("project-c", "980000", None)
            },
        ]);

        assert!(findings
            .iter()
            .any(|finding| finding.rule_code == "BUDGET-LIMIT-001"));
        assert!(findings
            .iter()
            .any(|finding| finding.rule_code == "BUDGET-EXEC-001"));
        assert!(findings
            .iter()
            .any(|finding| finding.rule_code == "BUDGET-CLASS-001"));
    }

    #[test]
    fn preserves_round_fifteen_policy_supplemental_checklist_metadata() {
        let csv = concat!(
            "period,region,budget_scope,direction,summary_item,actual_amount,policy_supplemental_checklist_type,policy_topic,required_source_documents,next_data_priority,required_budget_indicator_data,required_performance_target_data,required_payment_data,required_voucher_data,source_title,source_url\n",
            "2025-01,Jiangsu,policy,reference,transfer payment monitoring,1,transfer_payment_monitoring,transfer payment dynamic monitoring,transfer payment indicator; allocation document,P0,budget indicator,performance target,payment detail,voucher abstract,Jiangsu transfer payment monitoring,https://example.gov.cn/r15-transfer-payment.html\n",
            "2025-02,Rugao,policy,reference,township budget performance,1,township_budget_performance,township performance result application,township budget report; performance self evaluation,P1,township budget indicator,township performance target,treasury payment detail,voucher abstract,Rugao township budget performance,https://example.gov.cn/r15-township-performance.html\n",
        );

        let preview = preview_budget_csv_bytes(
            "round15-policy.csv",
            csv.as_bytes(),
            BudgetDatasetKind::PublicFiscalSummary,
            Some("round15 policy checklist"),
        )
        .expect("preview");

        assert_eq!(preview.records.len(), 2);
        let transfer = &preview.records[0];
        assert_eq!(
            transfer.policy_supplemental_checklist_type.as_deref(),
            Some("transfer_payment_monitoring")
        );
        assert_eq!(
            transfer.policy_topic.as_deref(),
            Some("transfer payment dynamic monitoring")
        );
        assert_eq!(
            transfer.required_source_documents.as_deref(),
            Some("transfer payment indicator; allocation document")
        );
        assert_eq!(transfer.next_data_priority.as_deref(), Some("P0"));
        assert!(preview.records.iter().all(|record| {
            record.required_budget_indicator_data.is_some()
                && record.required_performance_target_data.is_some()
                && record.required_payment_data.is_some()
                && record.required_voucher_data.is_some()
        }));
    }
}
