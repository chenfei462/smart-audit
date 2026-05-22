use super::v2::{AuditEvidenceLevel, SourceEvidence, ValueUnit};
use super::v2::{ImportQualityReport, QualityCheck, QualitySeverity};
use anyhow::{Context, Result};
use calamine::{open_workbook_auto, Reader};
use chrono::{Duration, NaiveDate};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaseSeedTemplateKind {
    InvestmentReview,
    PenaltyLedger,
    SpecialInspection,
}

impl Default for CaseSeedTemplateKind {
    fn default() -> Self {
        Self::InvestmentReview
    }
}

impl CaseSeedTemplateKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InvestmentReview => "investment_review",
            Self::PenaltyLedger => "penalty_ledger",
            Self::SpecialInspection => "special_inspection",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::InvestmentReview => "投资评审",
            Self::PenaltyLedger => "处罚台账",
            Self::SpecialInspection => "专项检查",
        }
    }
}

impl FromStr for CaseSeedTemplateKind {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "investment_review" => Ok(Self::InvestmentReview),
            "penalty_ledger" => Ok(Self::PenaltyLedger),
            "special_inspection" => Ok(Self::SpecialInspection),
            _ => Err(format!("unsupported case seed template kind: {}", value)),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaseSeedAssignmentField {
    SourceDepartment,
    RectificationUnitName,
}

impl CaseSeedAssignmentField {
    fn value_from_record<'a>(&self, record: &'a CaseSeedImportRecord) -> Option<&'a str> {
        match self {
            Self::SourceDepartment => record.source_department.as_deref(),
            Self::RectificationUnitName => record.rectification_unit_name.as_deref(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedAssignmentRule {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub priority: Option<u32>,
    #[serde(default)]
    pub label: Option<String>,
    pub match_field: CaseSeedAssignmentField,
    pub match_value: String,
    pub assignee: String,
    #[serde(default)]
    pub target_department: Option<String>,
    #[serde(default)]
    pub rule_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedMappingOverride {
    pub field_key: String,
    pub source_header: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedAssignmentMatch {
    pub source_row: usize,
    pub project_name: String,
    pub assignee: String,
    pub target_department: Option<String>,
    pub match_field: String,
    pub match_value: String,
    pub priority: u32,
    pub rule_index: usize,
    pub rule_id: Option<String>,
    pub rule_label: Option<String>,
    pub rule_source: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedTemplateConfig {
    pub template_kind: CaseSeedTemplateKind,
    #[serde(default)]
    pub mapping_overrides: Vec<CaseSeedMappingOverride>,
    #[serde(default)]
    pub assignment_rules: Vec<CaseSeedAssignmentRule>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedImportRecord {
    pub issue_source: String,
    pub period: Option<String>,
    pub sequence: Option<String>,
    pub project_name: String,
    pub construction_unit: String,
    pub consulting_unit: Option<String>,
    pub review_type: Option<String>,
    pub project_category: Option<String>,
    pub submitted_amount: Option<String>,
    pub approved_amount: Option<String>,
    pub reduction_amount: Option<String>,
    pub lead_reviewer: Option<String>,
    pub accepted_at: Option<String>,
    pub completed_at: Option<String>,
    pub document_no: Option<String>,
    pub recommended_case_type: Option<String>,
    pub recommended_priority: Option<String>,
    pub recommended_issue: String,
    pub source_department: Option<String>,
    pub target_department: Option<String>,
    pub rectification_unit_name: Option<String>,
    pub assignee: Option<String>,
    pub sla_due_at: Option<String>,
    #[serde(default)]
    pub issue_amount: Option<String>,
    #[serde(default)]
    pub issue_amount_unit: Option<ValueUnit>,
    #[serde(default)]
    pub responsible_subject: Option<String>,
    #[serde(default)]
    pub issue_category: Option<String>,
    #[serde(default)]
    pub required_next_data: Vec<String>,
    #[serde(default)]
    pub rectification_status: Option<String>,
    #[serde(default)]
    pub audit_evidence_level: Option<AuditEvidenceLevel>,
    #[serde(default)]
    pub audit_document_type: Option<String>,
    #[serde(default)]
    pub conclusion_strength: Option<String>,
    #[serde(default)]
    pub requires_manual_verification: Option<bool>,
    #[serde(default)]
    pub audit_evidence_weight: Option<u8>,
    #[serde(default)]
    pub audit_pdf_locator_quality: Option<String>,
    #[serde(default)]
    pub evidence_locator_quality: Option<String>,
    #[serde(default)]
    pub source_evidence: Option<SourceEvidence>,
    pub source_row: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedBatchPayload {
    pub title: Option<String>,
    #[serde(default)]
    pub template_kind: Option<CaseSeedTemplateKind>,
    #[serde(default)]
    pub mapping_overrides: Vec<CaseSeedMappingOverride>,
    #[serde(default)]
    pub assignment_rules: Vec<CaseSeedAssignmentRule>,
    pub records: Vec<CaseSeedImportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct CaseSeedPreviewOptions {
    #[serde(default)]
    pub template_kind: CaseSeedTemplateKind,
    #[serde(default)]
    pub mapping_overrides: Vec<CaseSeedMappingOverride>,
    #[serde(default)]
    pub assignment_rules: Vec<CaseSeedAssignmentRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedFieldMapping {
    pub field_key: String,
    pub field_label: String,
    pub required: bool,
    pub matched: bool,
    pub matched_header: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSeedPreviewResult {
    pub title: String,
    pub primary_subject: String,
    pub template_kind: String,
    pub records: Vec<CaseSeedImportRecord>,
    pub field_mappings: Vec<CaseSeedFieldMapping>,
    pub available_headers: Vec<String>,
    pub unmapped_headers: Vec<String>,
    pub assignment_hits: usize,
    pub assignment_matches: Vec<CaseSeedAssignmentMatch>,
    pub quality_report: ImportQualityReport,
}

pub fn preview_case_seed_batch(payload: CaseSeedBatchPayload) -> CaseSeedPreviewResult {
    validate_records(
        payload.records,
        payload.title.as_deref(),
        CaseSeedPreviewOptions {
            template_kind: payload.template_kind.unwrap_or_default(),
            mapping_overrides: payload.mapping_overrides,
            assignment_rules: payload.assignment_rules,
        },
        Vec::new(),
        Vec::new(),
        None,
    )
}

pub fn preview_case_seed_csv_bytes(
    _file_name: &str,
    bytes: &[u8],
    title: Option<&str>,
) -> Result<CaseSeedPreviewResult> {
    preview_case_seed_csv_bytes_with_options(
        _file_name,
        bytes,
        title,
        CaseSeedPreviewOptions::default(),
    )
}

pub fn preview_case_seed_csv_bytes_with_options(
    _file_name: &str,
    bytes: &[u8],
    title: Option<&str>,
    options: CaseSeedPreviewOptions,
) -> Result<CaseSeedPreviewResult> {
    let decoded = decode_text(bytes);
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(decoded.as_bytes());
    let headers = reader
        .headers()
        .context("failed to read case seed headers")?;
    let header_row = headers
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.context("failed to read case seed row")?;
        rows.push(
            row.iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        );
    }
    let template = template_definition(options.template_kind);
    let extraction = extract_from_grid(&template, &header_row, &rows, &options.mapping_overrides);
    Ok(validate_records(
        extraction.records,
        title,
        options,
        extraction.field_mappings,
        extraction.available_headers,
        Some(extraction.unmapped_headers),
    ))
}

pub fn preview_case_seed_excel_bytes(
    file_name: &str,
    bytes: &[u8],
    title: Option<&str>,
) -> Result<CaseSeedPreviewResult> {
    preview_case_seed_excel_bytes_with_options(
        file_name,
        bytes,
        title,
        CaseSeedPreviewOptions::default(),
    )
}

pub fn preview_case_seed_excel_bytes_with_options(
    file_name: &str,
    bytes: &[u8],
    title: Option<&str>,
    options: CaseSeedPreviewOptions,
) -> Result<CaseSeedPreviewResult> {
    let extension = if file_name.to_ascii_lowercase().ends_with(".xls") {
        ".xls"
    } else {
        ".xlsx"
    };
    let temp_path = std::env::temp_dir().join(format!(
        "auditlens_case_seed_{}{}",
        uuid::Uuid::new_v4(),
        extension
    ));
    std::fs::write(&temp_path, bytes).context("failed to write temp case seed spreadsheet")?;
    let workbook_result = open_workbook_auto(&temp_path);
    let _ = std::fs::remove_file(&temp_path);
    let mut workbook = workbook_result.context("failed to open case seed spreadsheet")?;
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

    let template = template_definition(options.template_kind);
    let extraction = extract_from_grid(&template, &headers, &body, &options.mapping_overrides);
    Ok(validate_records(
        extraction.records,
        title,
        options,
        extraction.field_mappings,
        extraction.available_headers,
        Some(extraction.unmapped_headers),
    ))
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

#[derive(Clone)]
struct CaseSeedFieldDefinition {
    key: &'static str,
    label: &'static str,
    required: bool,
    aliases: Vec<&'static str>,
}

struct CaseSeedGridExtraction {
    records: Vec<CaseSeedImportRecord>,
    field_mappings: Vec<CaseSeedFieldMapping>,
    available_headers: Vec<String>,
    unmapped_headers: Vec<String>,
}

fn extract_from_grid(
    template: &[CaseSeedFieldDefinition],
    headers: &[String],
    rows: &[Vec<String>],
    mapping_overrides: &[CaseSeedMappingOverride],
) -> CaseSeedGridExtraction {
    let mut indexes = HashMap::<String, usize>::new();
    for (index, header) in headers.iter().enumerate() {
        indexes.insert(normalize_key(header), index);
    }

    let mut override_map = HashMap::<String, usize>::new();
    for override_item in mapping_overrides {
        if let Some(index) = indexes
            .get(&normalize_key(&override_item.source_header))
            .copied()
        {
            override_map.insert(override_item.field_key.clone(), index);
        }
    }

    let mut consumed_headers = HashSet::<usize>::new();
    let mut matched_indexes = HashMap::<&'static str, usize>::new();
    let field_mappings = template
        .iter()
        .map(|definition| {
            let matched = override_map.get(definition.key).copied().or_else(|| {
                definition
                    .aliases
                    .iter()
                    .find_map(|alias| indexes.get(&normalize_key(alias)).copied())
            });
            if let Some(index) = matched {
                consumed_headers.insert(index);
                matched_indexes.insert(definition.key, index);
            }
            CaseSeedFieldMapping {
                field_key: definition.key.to_string(),
                field_label: definition.label.to_string(),
                required: definition.required,
                matched: matched.is_some(),
                matched_header: matched.and_then(|index| headers.get(index).cloned()),
            }
        })
        .collect::<Vec<_>>();

    let unmapped_headers = headers
        .iter()
        .enumerate()
        .filter(|(index, _)| !consumed_headers.contains(index))
        .map(|(_, header)| header.clone())
        .collect::<Vec<_>>();

    let records = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let source_row = index + 2;
            CaseSeedImportRecord {
                issue_source: value_from_cells(row, &matched_indexes, "issue_source"),
                period: optional_string(value_from_cells(row, &matched_indexes, "period")),
                sequence: optional_string(value_from_cells(row, &matched_indexes, "sequence")),
                project_name: value_from_cells(row, &matched_indexes, "project_name"),
                construction_unit: value_from_cells(row, &matched_indexes, "construction_unit"),
                consulting_unit: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "consulting_unit",
                )),
                review_type: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "review_type",
                )),
                project_category: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "project_category",
                )),
                submitted_amount: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "submitted_amount",
                )),
                approved_amount: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "approved_amount",
                )),
                reduction_amount: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "reduction_amount",
                )),
                lead_reviewer: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "lead_reviewer",
                )),
                accepted_at: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "accepted_at",
                )),
                completed_at: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "completed_at",
                )),
                document_no: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "document_no",
                )),
                recommended_case_type: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "recommended_case_type",
                )),
                recommended_priority: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "recommended_priority",
                )),
                recommended_issue: value_from_cells(row, &matched_indexes, "recommended_issue"),
                source_department: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "source_department",
                )),
                target_department: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "target_department",
                )),
                rectification_unit_name: optional_string(value_from_cells(
                    row,
                    &matched_indexes,
                    "rectification_unit_name",
                )),
                assignee: optional_string(value_from_cells(row, &matched_indexes, "assignee")),
                sla_due_at: optional_string(value_from_cells(row, &matched_indexes, "sla_due_at")),
                issue_amount: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["问题金额", "issue_amount"],
                )),
                issue_amount_unit: optional_unit(value_from_aliases(
                    row,
                    &indexes,
                    &["问题金额单位", "issue_amount_unit"],
                )),
                responsible_subject: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["责任主体", "responsible_subject"],
                )),
                issue_category: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["问题类型", "issue_category"],
                )),
                required_next_data: split_required_next_data(&value_from_aliases(
                    row,
                    &indexes,
                    &["补数清单", "required_next_data"],
                )),
                rectification_status: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["整改状态", "rectification_status"],
                )),
                audit_evidence_level: optional_audit_evidence_level(value_from_aliases(
                    row,
                    &indexes,
                    &["审计证据等级", "audit_evidence_level"],
                )),
                audit_evidence_weight: optional_u8(value_from_aliases(
                    row,
                    &indexes,
                    &["审计证据权重", "audit_evidence_weight"],
                )),
                audit_document_type: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["审计文档类型", "audit_document_type"],
                )),
                conclusion_strength: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["结论强度", "conclusion_strength"],
                )),
                requires_manual_verification: optional_bool(value_from_aliases(
                    row,
                    &indexes,
                    &["需要人工复核", "requires_manual_verification"],
                )),
                audit_pdf_locator_quality: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["audit_pdf_locator_quality"],
                )),
                evidence_locator_quality: optional_string(value_from_aliases(
                    row,
                    &indexes,
                    &["evidence_locator_quality"],
                )),
                source_evidence: source_evidence_from_row(row, &indexes, source_row),
                source_row,
            }
        })
        .collect::<Vec<_>>();

    CaseSeedGridExtraction {
        records,
        field_mappings,
        available_headers: headers.to_vec(),
        unmapped_headers,
    }
}

fn validate_records(
    records: Vec<CaseSeedImportRecord>,
    title: Option<&str>,
    options: CaseSeedPreviewOptions,
    field_mappings: Vec<CaseSeedFieldMapping>,
    available_headers: Vec<String>,
    unmapped_headers: Option<Vec<String>>,
) -> CaseSeedPreviewResult {
    let mut accepted = Vec::new();
    let mut checks = Vec::new();
    let mut seen = HashSet::<String>::new();
    let mut assignment_hits = 0_usize;
    let mut assignment_matches = Vec::new();

    for mut record in records {
        let mut row_has_error = false;

        apply_template_defaults(&options.template_kind, &mut record);
        if let Some(evidence) = record.source_evidence.as_mut() {
            if evidence.row_number.is_none() {
                evidence.row_number = Some(record.source_row);
            }
        }
        if !record
            .source_evidence
            .as_ref()
            .is_some_and(SourceEvidence::has_traceable_source)
        {
            checks.push(QualityCheck {
                code: "missing_source_evidence".to_string(),
                severity: QualitySeverity::Warning,
                message: "案件种子缺少可回溯来源标题或链接".to_string(),
                field: Some("source_evidence".to_string()),
                row_number: Some(record.source_row),
            });
        }
        if record
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
                message: "案件种子来源缺少页码、段落或摘录定位".to_string(),
                field: Some("source_evidence".to_string()),
                row_number: Some(record.source_row),
            });
        }
        apply_audit_evidence_defaults(&mut record);

        for (field_key, field_label, value) in [
            ("issue_source", "issue_source", record.issue_source.trim()),
            ("project_name", "project_name", record.project_name.trim()),
            (
                "construction_unit",
                "construction_unit",
                record.construction_unit.trim(),
            ),
            (
                "recommended_issue",
                "recommended_issue",
                record.recommended_issue.trim(),
            ),
        ] {
            if value.is_empty() {
                row_has_error = true;
                checks.push(error_check(
                    &format!("case_seed_missing_{}", field_key),
                    field_key,
                    record.source_row,
                    &format!("missing required field {}", field_label),
                ));
            }
        }

        record.accepted_at = normalize_optional_date(
            record.accepted_at.take(),
            "accepted_at",
            record.source_row,
            false,
            &mut checks,
            &mut row_has_error,
        );
        record.completed_at = normalize_optional_date(
            record.completed_at.take(),
            "completed_at",
            record.source_row,
            false,
            &mut checks,
            &mut row_has_error,
        );
        record.sla_due_at = normalize_optional_date(
            record.sla_due_at.take(),
            "sla_due_at",
            record.source_row,
            false,
            &mut checks,
            &mut row_has_error,
        );
        record.submitted_amount = normalize_optional_amount(
            record.submitted_amount.take(),
            "submitted_amount",
            record.source_row,
            &mut checks,
            &mut row_has_error,
        );
        record.approved_amount = normalize_optional_amount(
            record.approved_amount.take(),
            "approved_amount",
            record.source_row,
            &mut checks,
            &mut row_has_error,
        );
        record.reduction_amount = normalize_optional_amount(
            record.reduction_amount.take(),
            "reduction_amount",
            record.source_row,
            &mut checks,
            &mut row_has_error,
        );

        record.recommended_priority = normalize_priority(
            record.recommended_priority.take(),
            record.source_row,
            &mut checks,
        );

        let duplicate_key = format!(
            "{}|{}|{}|{}",
            record.issue_source,
            record.period.clone().unwrap_or_default(),
            record.sequence.clone().unwrap_or_default(),
            record.document_no.clone().unwrap_or_default()
        );
        if !duplicate_key.trim_matches('|').is_empty() && !seen.insert(duplicate_key) {
            checks.push(warn_check(
                "case_seed_duplicate_row",
                "document_no",
                record.source_row,
                "duplicate supervision ledger row detected",
            ));
        }

        if record.assignee.is_none() {
            if let Some(matched) = resolve_assignment(&record, &options.assignment_rules) {
                record.assignee = Some(matched.assignee.clone());
                if record.target_department.is_none() {
                    record.target_department = matched.target_department.clone();
                }
                assignment_hits += 1;
                assignment_matches.push(matched);
            }
        }

        if !row_has_error {
            accepted.push(record);
        }
    }

    let title = title
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| match accepted.first() {
            Some(first) if accepted.len() == 1 => {
                format!("case seed import - {}", first.project_name)
            }
            Some(first) => format!(
                "case seed import - {} and {} more",
                first.project_name,
                accepted.len() - 1
            ),
            None => "case seed import".to_string(),
        });
    let primary_subject = accepted
        .first()
        .map(|record| record.construction_unit.clone())
        .unwrap_or_else(|| "supervision ledger".to_string());

    CaseSeedPreviewResult {
        title,
        primary_subject,
        template_kind: options.template_kind.as_str().to_string(),
        records: accepted.clone(),
        field_mappings,
        available_headers,
        unmapped_headers: unmapped_headers.unwrap_or_default(),
        assignment_hits,
        assignment_matches,
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
    }
}

fn apply_audit_evidence_defaults(record: &mut CaseSeedImportRecord) {
    let evidence_text = format!(
        "{} {} {} {} {} {}",
        record.issue_source,
        record.project_name,
        record.document_no.clone().unwrap_or_default(),
        record.recommended_issue,
        record
            .source_evidence
            .as_ref()
            .and_then(|source| source.title.clone())
            .unwrap_or_default(),
        record
            .source_evidence
            .as_ref()
            .and_then(|source| source.section_title.clone())
            .unwrap_or_default()
    );
    let level = record
        .audit_evidence_level
        .unwrap_or_else(|| infer_audit_evidence_level(&evidence_text));
    record.audit_evidence_level = Some(level);
    if record.audit_document_type.is_none() {
        record.audit_document_type = Some(
            match level {
                AuditEvidenceLevel::FormalAuditReport => "budget_execution_audit_report",
                AuditEvidenceLevel::RectificationProgress => "rectification_progress",
                AuditEvidenceLevel::SpecialAuditSurvey => "special_audit_survey",
                AuditEvidenceLevel::AuditProjectPlan => "audit_project_plan",
                AuditEvidenceLevel::AuditResultFeedback => "audit_result_feedback",
                AuditEvidenceLevel::AuditWorkUpdate => "audit_work_update",
                AuditEvidenceLevel::MethodologyOrExperience => "methodology_or_experience",
                AuditEvidenceLevel::WorkMethodReference => "work_method_reference",
                AuditEvidenceLevel::Unknown => "unknown",
            }
            .to_string(),
        );
    }
    if record.conclusion_strength.is_none() {
        record.conclusion_strength = Some(
            match level {
                AuditEvidenceLevel::FormalAuditReport => "medium",
                AuditEvidenceLevel::RectificationProgress => "review_recommended",
                AuditEvidenceLevel::SpecialAuditSurvey => "review_recommended",
                AuditEvidenceLevel::AuditProjectPlan => "knowledge_reference",
                AuditEvidenceLevel::AuditResultFeedback => "review_recommended",
                AuditEvidenceLevel::AuditWorkUpdate
                | AuditEvidenceLevel::MethodologyOrExperience
                | AuditEvidenceLevel::WorkMethodReference => "supplemental_data_only",
                AuditEvidenceLevel::Unknown => "manual_review_required",
            }
            .to_string(),
        );
    }
    if record.audit_evidence_weight.is_none() {
        record.audit_evidence_weight = Some(level.evidence_weight());
    }
    if record.requires_manual_verification.is_none() {
        record.requires_manual_verification = Some(true);
    }
    if matches!(
        level,
        AuditEvidenceLevel::AuditWorkUpdate
            | AuditEvidenceLevel::AuditProjectPlan
            | AuditEvidenceLevel::MethodologyOrExperience
            | AuditEvidenceLevel::WorkMethodReference
    ) {
        record.recommended_priority = Some("P3".to_string());
        if !record
            .required_next_data
            .iter()
            .any(|item| item == "正式审计报告")
        {
            record.required_next_data.push("正式审计报告".to_string());
        }
    }
}

fn infer_audit_evidence_level(value: &str) -> AuditEvidenceLevel {
    if contains_any(value, &["专项审计调查", "special_audit_survey"]) {
        AuditEvidenceLevel::SpecialAuditSurvey
    } else if contains_any(
        value,
        &["audit_project_plan", "project plan", "project planning"],
    ) {
        AuditEvidenceLevel::AuditProjectPlan
    } else if contains_any(
        value,
        &[
            "结果集中反馈",
            "结果反馈",
            "反馈会",
            "audit_result_feedback",
        ],
    ) {
        AuditEvidenceLevel::AuditResultFeedback
    } else if contains_any(value, &["整改", "rectification"]) {
        AuditEvidenceLevel::RectificationProgress
    } else if contains_any(value, &["人大常委会", "工作报告", "审计报告", "formal"]) {
        AuditEvidenceLevel::FormalAuditReport
    } else if contains_any(
        value,
        &[
            "经验",
            "方法",
            "做法",
            "methodology",
            "work_method_reference",
        ],
    ) {
        AuditEvidenceLevel::MethodologyOrExperience
    } else if contains_any(value, &["动态", "念好", "三个关注", "助力"]) {
        AuditEvidenceLevel::AuditWorkUpdate
    } else {
        AuditEvidenceLevel::Unknown
    }
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn field_definition(
    key: &'static str,
    label: &'static str,
    required: bool,
    aliases: &[&'static str],
) -> CaseSeedFieldDefinition {
    CaseSeedFieldDefinition {
        key,
        label,
        required,
        aliases: aliases.to_vec(),
    }
}

fn template_definition(template_kind: CaseSeedTemplateKind) -> Vec<CaseSeedFieldDefinition> {
    match template_kind {
        CaseSeedTemplateKind::InvestmentReview => vec![
            field_definition(
                "issue_source",
                "问题来源",
                true,
                &["issue_source", "source", "问题来源"],
            ),
            field_definition("period", "期间", false, &["period", "week", "期间"]),
            field_definition(
                "sequence",
                "序号",
                false,
                &["sequence", "seq", "serial_no", "序号"],
            ),
            field_definition(
                "project_name",
                "项目名称",
                true,
                &["project_name", "project", "项目名称"],
            ),
            field_definition(
                "construction_unit",
                "建设单位",
                true,
                &[
                    "construction_unit",
                    "rectification_unit",
                    "建设单位",
                    "整改单位",
                ],
            ),
            field_definition(
                "consulting_unit",
                "咨询单位",
                false,
                &["consulting_unit", "consultant", "咨询单位", "编制单位"],
            ),
            field_definition(
                "review_type",
                "评审类型",
                false,
                &["review_type", "review content", "评审内容"],
            ),
            field_definition(
                "project_category",
                "项目类别",
                false,
                &["project_category", "category", "项目类别"],
            ),
            field_definition(
                "submitted_amount",
                "送审金额",
                false,
                &["submitted_amount", "submitted", "送审金额", "送审价"],
            ),
            field_definition(
                "approved_amount",
                "审定金额",
                false,
                &["approved_amount", "approved", "审定金额", "审定价"],
            ),
            field_definition(
                "reduction_amount",
                "审减额",
                false,
                &["reduction_amount", "reduction", "核减额", "审减额"],
            ),
            field_definition(
                "lead_reviewer",
                "主审人",
                false,
                &["lead_reviewer", "reviewer", "主审人"],
            ),
            field_definition(
                "accepted_at",
                "受理日期",
                false,
                &["accepted_at", "accepted date", "受理时间"],
            ),
            field_definition(
                "completed_at",
                "完成日期",
                false,
                &["completed_at", "completed date", "完成时间"],
            ),
            field_definition(
                "document_no",
                "文号",
                false,
                &["document_no", "document number", "发文号"],
            ),
            field_definition(
                "recommended_case_type",
                "案件类型",
                false,
                &["recommended_case_type", "case_type", "建议案件类型"],
            ),
            field_definition(
                "recommended_priority",
                "优先级",
                false,
                &["recommended_priority", "priority", "建议优先级"],
            ),
            field_definition(
                "recommended_issue",
                "问题描述",
                true,
                &["recommended_issue", "issue", "建议问题", "问题描述"],
            ),
            field_definition(
                "source_department",
                "来源部门",
                false,
                &["source_department", "来源处室", "发起部门"],
            ),
            field_definition(
                "target_department",
                "承办部门",
                false,
                &["target_department", "目标部门", "承办部门"],
            ),
            field_definition(
                "rectification_unit_name",
                "整改单位",
                false,
                &["rectification_unit_name", "整改单位名称", "整改单位"],
            ),
            field_definition(
                "assignee",
                "责任人",
                false,
                &["assignee", "责任人", "处理人"],
            ),
            field_definition(
                "sla_due_at",
                "截止时间",
                false,
                &["sla_due_at", "整改截止时间", "截止时间"],
            ),
        ],
        CaseSeedTemplateKind::PenaltyLedger => vec![
            field_definition(
                "issue_source",
                "问题来源",
                false,
                &["issue_source", "问题来源"],
            ),
            field_definition(
                "period",
                "期间",
                false,
                &["period", "期间", "处罚日期", "处罚月份", "penalty_period"],
            ),
            field_definition("sequence", "序号", false, &["sequence", "序号"]),
            field_definition(
                "project_name",
                "处罚对象",
                true,
                &["project_name", "处罚对象", "被处罚单位", "penalty_subject"],
            ),
            field_definition(
                "construction_unit",
                "整改单位",
                true,
                &[
                    "construction_unit",
                    "整改单位",
                    "处罚对象",
                    "被处罚单位",
                    "penalty_subject",
                ],
            ),
            field_definition(
                "consulting_unit",
                "执法机构",
                false,
                &["consulting_unit", "执法机构", "enforcement_agency"],
            ),
            field_definition(
                "review_type",
                "处罚类型",
                false,
                &["review_type", "处罚类型", "处罚类别", "penalty_type"],
            ),
            field_definition(
                "project_category",
                "监管领域",
                false,
                &["project_category", "监管领域", "regulatory_domain"],
            ),
            field_definition(
                "submitted_amount",
                "涉案金额",
                false,
                &["submitted_amount", "涉案金额", "case_amount"],
            ),
            field_definition(
                "approved_amount",
                "处罚金额",
                false,
                &["approved_amount", "处罚金额", "罚没金额", "penalty_amount"],
            ),
            field_definition(
                "reduction_amount",
                "罚没金额",
                false,
                &["reduction_amount", "罚没金额", "confiscated_amount"],
            ),
            field_definition(
                "lead_reviewer",
                "承办人",
                false,
                &["lead_reviewer", "承办人", "经办人", "handling_officer"],
            ),
            field_definition(
                "accepted_at",
                "立案日期",
                false,
                &["accepted_at", "立案日期", "发现日期", "opened_at"],
            ),
            field_definition(
                "completed_at",
                "处罚决定日期",
                false,
                &["completed_at", "处罚决定日期", "decided_at"],
            ),
            field_definition(
                "document_no",
                "处罚决定书号",
                false,
                &["document_no", "处罚决定书号", "penalty_notice_no"],
            ),
            field_definition(
                "recommended_case_type",
                "案件类型",
                false,
                &["recommended_case_type", "案件类型"],
            ),
            field_definition(
                "recommended_priority",
                "优先级",
                false,
                &["recommended_priority", "优先级", "风险等级"],
            ),
            field_definition(
                "recommended_issue",
                "处罚事由",
                true,
                &[
                    "recommended_issue",
                    "处罚事由",
                    "违法事实",
                    "问题描述",
                    "penalty_reason",
                ],
            ),
            field_definition(
                "source_department",
                "承办处室",
                false,
                &[
                    "source_department",
                    "承办处室",
                    "处罚部门",
                    "handling_department",
                ],
            ),
            field_definition(
                "target_department",
                "承办部门",
                false,
                &["target_department", "承办部门"],
            ),
            field_definition(
                "rectification_unit_name",
                "整改单位",
                false,
                &[
                    "rectification_unit_name",
                    "整改单位",
                    "处罚对象",
                    "被处罚单位",
                    "rectification_unit",
                ],
            ),
            field_definition(
                "assignee",
                "责任人",
                false,
                &["assignee", "责任人", "处理人", "owner"],
            ),
            field_definition(
                "sla_due_at",
                "截止时间",
                false,
                &["sla_due_at", "整改截止时间", "截止时间", "due_at"],
            ),
        ],
        CaseSeedTemplateKind::SpecialInspection => vec![
            field_definition(
                "issue_source",
                "问题来源",
                false,
                &["issue_source", "问题来源"],
            ),
            field_definition("period", "检查期次", false, &["period", "检查期次", "期间"]),
            field_definition("sequence", "序号", false, &["sequence", "序号"]),
            field_definition(
                "project_name",
                "问题名称",
                true,
                &[
                    "project_name",
                    "问题名称",
                    "检查事项",
                    "问题项目",
                    "项目名称",
                ],
            ),
            field_definition(
                "construction_unit",
                "责任单位",
                true,
                &["construction_unit", "责任单位", "被检查单位"],
            ),
            field_definition(
                "consulting_unit",
                "检查组",
                false,
                &["consulting_unit", "检查组"],
            ),
            field_definition(
                "review_type",
                "检查类型",
                false,
                &["review_type", "检查类型"],
            ),
            field_definition(
                "project_category",
                "检查领域",
                false,
                &["project_category", "检查领域"],
            ),
            field_definition(
                "submitted_amount",
                "涉及金额",
                false,
                &["submitted_amount", "涉及金额"],
            ),
            field_definition(
                "approved_amount",
                "核定金额",
                false,
                &["approved_amount", "核定金额"],
            ),
            field_definition(
                "reduction_amount",
                "整改金额",
                false,
                &["reduction_amount", "整改金额"],
            ),
            field_definition(
                "lead_reviewer",
                "检查组长",
                false,
                &["lead_reviewer", "检查组长", "主审人"],
            ),
            field_definition(
                "accepted_at",
                "发现日期",
                false,
                &["accepted_at", "发现日期", "检查日期"],
            ),
            field_definition(
                "completed_at",
                "整改完成日期",
                false,
                &["completed_at", "整改完成日期"],
            ),
            field_definition(
                "document_no",
                "问题编号",
                false,
                &["document_no", "问题编号", "督办单号"],
            ),
            field_definition(
                "recommended_case_type",
                "案件类型",
                false,
                &["recommended_case_type", "案件类型"],
            ),
            field_definition(
                "recommended_priority",
                "优先级",
                false,
                &["recommended_priority", "优先级", "风险等级"],
            ),
            field_definition(
                "recommended_issue",
                "问题描述",
                true,
                &["recommended_issue", "问题描述", "整改要求"],
            ),
            field_definition(
                "source_department",
                "检查处室",
                false,
                &["source_department", "检查处室"],
            ),
            field_definition(
                "target_department",
                "承办部门",
                false,
                &["target_department", "承办部门"],
            ),
            field_definition(
                "rectification_unit_name",
                "整改单位",
                false,
                &["rectification_unit_name", "整改单位", "责任单位"],
            ),
            field_definition(
                "assignee",
                "责任人",
                false,
                &["assignee", "责任人", "处理人"],
            ),
            field_definition(
                "sla_due_at",
                "截止时间",
                false,
                &["sla_due_at", "整改截止时间", "截止时间"],
            ),
        ],
    }
}

fn apply_template_defaults(
    template_kind: &CaseSeedTemplateKind,
    record: &mut CaseSeedImportRecord,
) {
    if record.issue_source.trim().is_empty() {
        record.issue_source = match template_kind {
            CaseSeedTemplateKind::InvestmentReview => "official_weekly_review".to_string(),
            CaseSeedTemplateKind::PenaltyLedger => "official_penalty_ledger".to_string(),
            CaseSeedTemplateKind::SpecialInspection => "special_inspection".to_string(),
        };
    }
    if record.recommended_case_type.is_none() {
        record.recommended_case_type = Some(
            match template_kind {
                CaseSeedTemplateKind::InvestmentReview => "review_reduction_followup",
                CaseSeedTemplateKind::PenaltyLedger => "penalty_followup",
                CaseSeedTemplateKind::SpecialInspection => "special_inspection_followup",
            }
            .to_string(),
        );
    }
    if record.rectification_unit_name.is_none() && !record.construction_unit.trim().is_empty() {
        record.rectification_unit_name = Some(record.construction_unit.clone());
    }
    if record.target_department.is_none() && !record.construction_unit.trim().is_empty() {
        record.target_department = Some(record.construction_unit.clone());
    }
}

fn resolve_assignment(
    record: &CaseSeedImportRecord,
    rules: &[CaseSeedAssignmentRule],
) -> Option<CaseSeedAssignmentMatch> {
    let mut indexed = rules.iter().enumerate().collect::<Vec<_>>();
    indexed.sort_by_key(|(index, rule)| {
        (
            assignment_rule_source_rank(rule.rule_source.as_deref()),
            rule.priority.unwrap_or((*index as u32) + 1000),
            *index,
        )
    });
    indexed.into_iter().find_map(|(index, rule)| {
        let actual = rule
            .match_field
            .value_from_record(record)?
            .trim()
            .to_string();
        let expected = rule.match_value.trim().to_string();
        if actual.eq_ignore_ascii_case(&expected) || actual == expected {
            Some(CaseSeedAssignmentMatch {
                source_row: record.source_row,
                project_name: record.project_name.clone(),
                assignee: rule.assignee.trim().to_string(),
                target_department: rule.target_department.clone(),
                match_field: match rule.match_field {
                    CaseSeedAssignmentField::SourceDepartment => "source_department".to_string(),
                    CaseSeedAssignmentField::RectificationUnitName => {
                        "rectification_unit_name".to_string()
                    }
                },
                match_value: expected.clone(),
                priority: rule.priority.unwrap_or((index as u32) + 1000),
                rule_index: index,
                rule_id: rule.id.clone(),
                rule_label: rule.label.clone(),
                rule_source: rule.rule_source.clone(),
                reason: format!(
                    "matched {} = {} -> {}",
                    match rule.match_field {
                        CaseSeedAssignmentField::SourceDepartment => "source_department",
                        CaseSeedAssignmentField::RectificationUnitName => "rectification_unit_name",
                    },
                    actual,
                    rule.assignee.trim()
                ),
            })
        } else {
            None
        }
    })
}

fn assignment_rule_source_rank(value: Option<&str>) -> u32 {
    match value.unwrap_or("profile") {
        "profile" => 0,
        "private_dictionary" => 1,
        "shared_dictionary" => 2,
        _ => 3,
    }
}

fn value_from_cells(row: &[String], indexes: &HashMap<&'static str, usize>, key: &str) -> String {
    if let Some(index) = indexes.get(key) {
        if let Some(value) = row.get(*index) {
            return value.trim().to_string();
        }
    }
    String::new()
}

fn source_evidence_from_row(
    row: &[String],
    indexes: &HashMap<String, usize>,
    row_number: usize,
) -> Option<SourceEvidence> {
    let evidence = SourceEvidence {
        title: optional_string(value_from_aliases(
            row,
            indexes,
            &["来源标题", "来源名称", "网页标题", "source_title"],
        )),
        url: optional_string(value_from_aliases(
            row,
            indexes,
            &["来源链接", "来源URL", "source_url"],
        )),
        published_at: optional_string(value_from_aliases(
            row,
            indexes,
            &["发布日期", "来源发布日期", "published_at"],
        )),
        captured_at: optional_string(value_from_aliases(
            row,
            indexes,
            &["采集时间", "抓取时间", "captured_at"],
        )),
        row_number: Some(row_number),
        parser_version: optional_string(value_from_aliases(
            row,
            indexes,
            &["解析器版本", "解析版本", "parser_version"],
        )),
        page_number: optional_string(value_from_aliases(
            row,
            indexes,
            &["页码", "PDF页码", "source_page_number", "page_number"],
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        section_title: optional_string(value_from_aliases(
            row,
            indexes,
            &[
                "段落标题",
                "章节标题",
                "source_section_title",
                "section_title",
            ],
        )),
        locator_hash: optional_string(value_from_aliases(
            row,
            indexes,
            &["定位哈希", "source_locator_hash", "locator_hash"],
        )),
        raw_excerpt: optional_string(value_from_aliases(
            row,
            indexes,
            &["原文摘录", "source_raw_excerpt", "raw_excerpt"],
        )),
        table_title: None,
        table_row_index: None,
        table_column_name: None,
        paragraph_index: None,
        pdf_table_id: None,
        legal_basis: optional_string(value_from_aliases(
            row,
            indexes,
            &["法律依据", "source_legal_basis", "legal_basis"],
        )),
        legal_basis_article: optional_string(value_from_aliases(
            row,
            indexes,
            &[
                "法律条款",
                "source_legal_basis_article",
                "legal_basis_article",
            ],
        )),
        decision_paragraph_index: optional_string(value_from_aliases(
            row,
            indexes,
            &["决定书段落", "source_decision_paragraph_index"],
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        affected_package_no: optional_string(value_from_aliases(
            row,
            indexes,
            &[
                "影响包号",
                "source_affected_package_no",
                "affected_package_no",
            ],
        )),
        handling_result_locator_hash: optional_string(value_from_aliases(
            row,
            indexes,
            &["处理结果定位", "source_handling_result_locator_hash"],
        )),
        penalty_basis: optional_string(value_from_aliases(
            row,
            indexes,
            &["source_penalty_basis", "penalty_basis"],
        )),
        penalty_decision_paragraph_index: optional_string(value_from_aliases(
            row,
            indexes,
            &["source_penalty_decision_paragraph_index"],
        ))
        .and_then(|value| value.parse::<usize>().ok()),
        credit_record_locator_hash: optional_string(value_from_aliases(
            row,
            indexes,
            &["source_credit_record_locator_hash"],
        )),
        market_restriction_locator_hash: optional_string(value_from_aliases(
            row,
            indexes,
            &["source_market_restriction_locator_hash"],
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

fn value_from_aliases(
    row: &[String],
    indexes: &HashMap<String, usize>,
    aliases: &[&str],
) -> String {
    for alias in aliases {
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
        .replace('-', "")
        .replace('/', "")
}

fn optional_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn optional_unit(value: String) -> Option<ValueUnit> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        ValueUnit::from_str(trimmed).ok()
    }
}

fn optional_audit_evidence_level(value: String) -> Option<AuditEvidenceLevel> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        AuditEvidenceLevel::from_str(trimmed).ok()
    }
}

fn optional_u8(value: String) -> Option<u8> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        trimmed.parse::<u8>().ok()
    }
}

fn optional_bool(value: String) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" => None,
        "true" | "1" | "yes" | "y" | "是" => Some(true),
        "false" | "0" | "no" | "n" | "否" => Some(false),
        _ => None,
    }
}

fn split_required_next_data(value: &str) -> Vec<String> {
    value
        .split(|character| matches!(character, ';' | '；' | ',' | '，' | '、'))
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn normalize_optional_date(
    value: Option<String>,
    field: &str,
    row_number: usize,
    required: bool,
    checks: &mut Vec<QualityCheck>,
    row_has_error: &mut bool,
) -> Option<String> {
    let Some(value) = value else {
        if required {
            *row_has_error = true;
            checks.push(error_check(
                &format!("case_seed_missing_{}", field),
                field,
                row_number,
                &format!("missing required date {}", field),
            ));
        }
        return None;
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    match normalize_date(trimmed) {
        Some(date) => Some(date),
        None => {
            *row_has_error = true;
            checks.push(error_check(
                &format!("case_seed_invalid_{}", field),
                field,
                row_number,
                &format!("invalid date format for {}", field),
            ));
            None
        }
    }
}

fn normalize_optional_amount(
    value: Option<String>,
    field: &str,
    row_number: usize,
    checks: &mut Vec<QualityCheck>,
    row_has_error: &mut bool,
) -> Option<String> {
    let Some(value) = value else {
        return None;
    };
    let trimmed = value.trim().replace(',', "");
    if trimmed.is_empty() {
        return None;
    }
    match Decimal::from_str(&trimmed) {
        Ok(_) => Some(trimmed),
        Err(_) => {
            *row_has_error = true;
            checks.push(error_check(
                &format!("case_seed_invalid_{}", field),
                field,
                row_number,
                &format!("invalid amount format for {}", field),
            ));
            None
        }
    }
}

fn normalize_priority(
    value: Option<String>,
    row_number: usize,
    checks: &mut Vec<QualityCheck>,
) -> Option<String> {
    let Some(value) = value else {
        return None;
    };
    let normalized = value.trim().to_uppercase();
    match normalized.as_str() {
        "P1" | "P2" | "P3" | "P4" => Some(normalized),
        _ => {
            checks.push(warn_check(
                "case_seed_invalid_priority",
                "recommended_priority",
                row_number,
                "unsupported priority, fallback to P3 during import",
            ));
            None
        }
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

pub fn infer_case_seed_due_at(record: &CaseSeedImportRecord) -> Option<String> {
    if let Some(value) = record.sla_due_at.clone() {
        return Some(value);
    }
    record
        .accepted_at
        .as_deref()
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
        .map(|date| (date + Duration::days(15)).format("%Y-%m-%d").to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_case_seed_csv() {
        let csv = concat!(
            "issue_source,period,sequence,project_name,construction_unit,review_type,submitted_amount,approved_amount,reduction_amount,accepted_at,document_no,recommended_priority,recommended_issue\n",
            "official_weekly_review,2025-W34,1,Bridge Project,Haian Housing Bureau,budget,301.56,291.85,9.71,2025-08-11,DOC-001,P2,Reduction should be explained\n"
        );
        let preview =
            preview_case_seed_csv_bytes("seed.csv", csv.as_bytes(), Some("seed import")).unwrap();
        assert_eq!(preview.records.len(), 1);
        assert_eq!(preview.quality_report.accepted_rows, 1);
        assert_eq!(preview.records[0].construction_unit, "Haian Housing Bureau");
        assert_eq!(preview.records[0].reduction_amount.as_deref(), Some("9.71"));
    }

    #[test]
    fn previews_penalty_template_mapping_and_assignment_rule() {
        let csv = concat!(
            "penalty_subject,penalty_notice_no,penalty_reason,penalty_amount,handling_department,rectification_unit,opened_at\n",
            "Haian Unit,PEN-001,procurement violation,12.50,inspection.office,Haian Unit,2025-09-01\n"
        );
        let preview = preview_case_seed_csv_bytes_with_options(
            "penalty.csv",
            csv.as_bytes(),
            Some("penalty import"),
            CaseSeedPreviewOptions {
                template_kind: CaseSeedTemplateKind::PenaltyLedger,
                mapping_overrides: Vec::new(),
                assignment_rules: vec![CaseSeedAssignmentRule {
                    id: None,
                    priority: None,
                    label: None,
                    match_field: CaseSeedAssignmentField::SourceDepartment,
                    match_value: "inspection.office".to_string(),
                    assignee: "auditor.penalty".to_string(),
                    target_department: None,
                    rule_source: None,
                }],
            },
        )
        .unwrap();
        assert_eq!(preview.records.len(), 1);
        assert_eq!(preview.records[0].project_name, "Haian Unit");
        assert_eq!(preview.records[0].document_no.as_deref(), Some("PEN-001"));
        assert_eq!(
            preview.records[0].assignee.as_deref(),
            Some("auditor.penalty")
        );
        assert_eq!(
            preview.records[0].recommended_case_type.as_deref(),
            Some("penalty_followup")
        );
        assert!(preview
            .field_mappings
            .iter()
            .any(|item| item.field_key == "document_no" && item.matched));
        assert_eq!(preview.assignment_hits, 1);
        assert_eq!(preview.assignment_matches.len(), 1);
        assert_eq!(preview.assignment_matches[0].assignee, "auditor.penalty");
    }

    #[test]
    fn applies_mapping_override_before_validation() {
        let csv = concat!(
            "项目,责任单位,问题说明,发现日期\n",
            "Bridge Project,Haian Housing Bureau,Reduction should be explained,2025-08-11\n"
        );
        let preview = preview_case_seed_csv_bytes_with_options(
            "manual-map.csv",
            csv.as_bytes(),
            Some("manual mapping"),
            CaseSeedPreviewOptions {
                template_kind: CaseSeedTemplateKind::SpecialInspection,
                mapping_overrides: vec![
                    CaseSeedMappingOverride {
                        field_key: "project_name".to_string(),
                        source_header: "项目".to_string(),
                    },
                    CaseSeedMappingOverride {
                        field_key: "construction_unit".to_string(),
                        source_header: "责任单位".to_string(),
                    },
                    CaseSeedMappingOverride {
                        field_key: "recommended_issue".to_string(),
                        source_header: "问题说明".to_string(),
                    },
                    CaseSeedMappingOverride {
                        field_key: "accepted_at".to_string(),
                        source_header: "发现日期".to_string(),
                    },
                ],
                assignment_rules: Vec::new(),
            },
        )
        .unwrap();
        assert_eq!(preview.quality_report.accepted_rows, 1);
        assert_eq!(preview.records[0].project_name, "Bridge Project");
        assert_eq!(
            preview
                .field_mappings
                .iter()
                .find(|item| item.field_key == "project_name")
                .and_then(|item| item.matched_header.as_deref()),
            Some("项目")
        );
    }

    #[test]
    fn uses_rule_priority_and_exposes_match_reason() {
        let csv = concat!(
            "问题名称,责任单位,检查处室,问题描述,发现日期\n",
            "专项检查问题,Haian Education Bureau,监督检查科,专项检查要求整改,2025-09-01\n"
        );
        let preview = preview_case_seed_csv_bytes_with_options(
            "priority.csv",
            csv.as_bytes(),
            Some("priority rules"),
            CaseSeedPreviewOptions {
                template_kind: CaseSeedTemplateKind::SpecialInspection,
                mapping_overrides: Vec::new(),
                assignment_rules: vec![
                    CaseSeedAssignmentRule {
                        id: None,
                        priority: Some(20),
                        label: Some("部门兜底".to_string()),
                        match_field: CaseSeedAssignmentField::SourceDepartment,
                        match_value: "监督检查科".to_string(),
                        assignee: "auditor.department".to_string(),
                        target_department: None,
                        rule_source: None,
                    },
                    CaseSeedAssignmentRule {
                        id: None,
                        priority: Some(10),
                        label: Some("单位优先".to_string()),
                        match_field: CaseSeedAssignmentField::RectificationUnitName,
                        match_value: "Haian Education Bureau".to_string(),
                        assignee: "auditor.rectification".to_string(),
                        target_department: None,
                        rule_source: None,
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(preview.assignment_hits, 1);
        assert_eq!(
            preview.records[0].assignee.as_deref(),
            Some("auditor.rectification")
        );
        assert_eq!(preview.assignment_matches[0].priority, 10);
        assert_eq!(
            preview.assignment_matches[0].rule_label.as_deref(),
            Some("单位优先")
        );
        assert!(preview.assignment_matches[0]
            .reason
            .contains("rectification_unit_name"));
    }

    #[test]
    fn fills_rectification_unit_before_assignment_for_investment_review() {
        let csv = concat!(
            "period,sequence,project_name,construction_unit,accepted_at,recommended_issue\n",
            "2025-W34,1,Bridge Project,Haian Housing Bureau,2025-08-11,Reduction should be explained\n"
        );
        let preview = preview_case_seed_csv_bytes_with_options(
            "investment.csv",
            csv.as_bytes(),
            Some("investment import"),
            CaseSeedPreviewOptions {
                template_kind: CaseSeedTemplateKind::InvestmentReview,
                mapping_overrides: Vec::new(),
                assignment_rules: vec![CaseSeedAssignmentRule {
                    id: None,
                    priority: None,
                    label: None,
                    match_field: CaseSeedAssignmentField::RectificationUnitName,
                    match_value: "Haian Housing Bureau".to_string(),
                    assignee: "auditor.haian".to_string(),
                    target_department: None,
                    rule_source: None,
                }],
            },
        )
        .unwrap();
        assert_eq!(
            preview.records[0].rectification_unit_name.as_deref(),
            Some("Haian Housing Bureau")
        );
        assert_eq!(
            preview.records[0].target_department.as_deref(),
            Some("Haian Housing Bureau")
        );
        assert_eq!(
            preview.records[0].assignee.as_deref(),
            Some("auditor.haian")
        );
        assert_eq!(preview.assignment_hits, 1);
    }

    #[test]
    fn previews_case_seed_source_evidence_without_blocking_import() {
        let csv = concat!(
            "问题来源,项目名称,责任单位,问题描述,发现日期,来源标题,来源链接,采集时间,解析器版本\n",
            "special_inspection,海安市专项检查问题,海安市教育局,专项检查要求整改,2025-09-01,海安市专项检查问题清单,https://example.gov.cn/case.html,2026-04-26T10:00:00+08:00,case-seed-v1\n",
            "special_inspection,通州区专项检查问题,通州区住建局,专项检查要求整改,2025-09-02,,,,\n"
        );

        let preview = preview_case_seed_csv_bytes_with_options(
            "case-source.csv",
            csv.as_bytes(),
            Some("case source"),
            CaseSeedPreviewOptions {
                template_kind: CaseSeedTemplateKind::SpecialInspection,
                mapping_overrides: Vec::new(),
                assignment_rules: Vec::new(),
            },
        )
        .unwrap();

        assert_eq!(preview.quality_report.accepted_rows, 2);
        assert_eq!(
            preview.records[0]
                .source_evidence
                .as_ref()
                .and_then(|item| item.url.as_deref()),
            Some("https://example.gov.cn/case.html")
        );
        assert!(preview.quality_report.checks.iter().any(|check| {
            check.code == "missing_source_evidence" && check.severity == QualitySeverity::Warning
        }));
    }

    #[test]
    fn infers_due_at_from_accepted_date() {
        let record = CaseSeedImportRecord {
            issue_source: "official_weekly_review".to_string(),
            period: None,
            sequence: None,
            project_name: "Bridge Project".to_string(),
            construction_unit: "Haian Housing Bureau".to_string(),
            consulting_unit: None,
            review_type: None,
            project_category: None,
            submitted_amount: None,
            approved_amount: None,
            reduction_amount: None,
            lead_reviewer: None,
            accepted_at: Some("2025-08-11".to_string()),
            completed_at: None,
            document_no: None,
            recommended_case_type: None,
            recommended_priority: None,
            recommended_issue: "Reduction should be explained".to_string(),
            source_department: None,
            target_department: None,
            rectification_unit_name: None,
            assignee: None,
            sla_due_at: None,
            issue_amount: None,
            issue_amount_unit: None,
            responsible_subject: None,
            issue_category: None,
            required_next_data: Vec::new(),
            rectification_status: None,
            audit_evidence_level: None,
            audit_document_type: None,
            conclusion_strength: None,
            requires_manual_verification: None,
            audit_evidence_weight: None,
            audit_pdf_locator_quality: None,
            evidence_locator_quality: None,
            source_evidence: None,
            source_row: 2,
        };
        assert_eq!(
            infer_case_seed_due_at(&record).as_deref(),
            Some("2025-08-26")
        );
    }

    #[test]
    fn classifies_public_audit_evidence_strength() {
        let preview = preview_case_seed_batch(CaseSeedBatchPayload {
            title: Some("audit evidence levels".to_string()),
            template_kind: Some(CaseSeedTemplateKind::SpecialInspection),
            mapping_overrides: Vec::new(),
            assignment_rules: Vec::new(),
            records: vec![
                CaseSeedImportRecord {
                    issue_source: "江苏省审计厅公开信息".to_string(),
                    period: Some("2024".to_string()),
                    sequence: Some("A-001".to_string()),
                    project_name: "2023年度省级预算执行审计整改跟踪".to_string(),
                    construction_unit: "相关省级部门".to_string(),
                    consulting_unit: None,
                    review_type: Some("公开审计问题线索".to_string()),
                    project_category: None,
                    submitted_amount: None,
                    approved_amount: None,
                    reduction_amount: None,
                    lead_reviewer: None,
                    accepted_at: Some("2025-02-10".to_string()),
                    completed_at: None,
                    document_no: Some("江苏：立行立改问题整改率达100%".to_string()),
                    recommended_case_type: Some("整改成效复核".to_string()),
                    recommended_priority: Some("Medium".to_string()),
                    recommended_issue: "公开信息显示整改率达100%，需补充整改台账和资金凭证"
                        .to_string(),
                    source_department: Some("江苏省审计厅".to_string()),
                    target_department: None,
                    rectification_unit_name: Some("相关省级部门".to_string()),
                    assignee: None,
                    sla_due_at: None,
                    issue_amount: Some("17.81".to_string()),
                    issue_amount_unit: Some(ValueUnit::YiYuan),
                    responsible_subject: Some("相关省级部门".to_string()),
                    issue_category: Some("审计整改".to_string()),
                    required_next_data: vec!["整改台账".to_string(), "资金凭证".to_string()],
                    rectification_status: Some("needs_internal_evidence".to_string()),
                    audit_evidence_level: None,
                    audit_document_type: None,
                    conclusion_strength: None,
                    requires_manual_verification: None,
                    audit_evidence_weight: None,
                    audit_pdf_locator_quality: None,
                    evidence_locator_quality: None,
                    source_evidence: Some(SourceEvidence {
                        title: Some("江苏：立行立改问题整改率达100% 健全完善制度129项".to_string()),
                        url: Some(
                            "https://jssjt.jiangsu.gov.cn/art/2025/2/10/art_995_11489401.html"
                                .to_string(),
                        ),
                        published_at: Some("2025-02-10".to_string()),
                        captured_at: None,
                        row_number: Some(1),
                        parser_version: Some("case-seed-v1".to_string()),
                        page_number: None,
                        section_title: Some("审计整改公开信息".to_string()),
                        locator_hash: Some("rectification".to_string()),
                        raw_excerpt: Some("问题整改率达100%".to_string()),
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
                    }),
                    source_row: 1,
                },
                CaseSeedImportRecord {
                    issue_source: "江苏省审计厅公开信息".to_string(),
                    period: Some("2024".to_string()),
                    sequence: Some("A-002".to_string()),
                    project_name: "徐州市部门预算审计动态".to_string(),
                    construction_unit: "徐州市相关预算部门".to_string(),
                    consulting_unit: None,
                    review_type: Some("公开审计问题线索".to_string()),
                    project_category: None,
                    submitted_amount: None,
                    approved_amount: None,
                    reduction_amount: None,
                    lead_reviewer: None,
                    accepted_at: Some("2024-08-19".to_string()),
                    completed_at: None,
                    document_no: Some("徐州：念好五字诀 推动部门预算审计审深审透审准".to_string()),
                    recommended_case_type: Some("部门预算审计核查".to_string()),
                    recommended_priority: Some("High".to_string()),
                    recommended_issue: "公开信息显示提炼31项问题，需补充正式问题清单".to_string(),
                    source_department: Some("江苏省审计厅".to_string()),
                    target_department: None,
                    rectification_unit_name: Some("徐州市相关预算部门".to_string()),
                    assignee: None,
                    sla_due_at: None,
                    issue_amount: Some("31".to_string()),
                    issue_amount_unit: Some(ValueUnit::Count),
                    responsible_subject: Some("徐州市相关预算部门".to_string()),
                    issue_category: Some("部门预算审计".to_string()),
                    required_next_data: vec!["正式审计报告".to_string(), "问题清单".to_string()],
                    rectification_status: Some("needs_internal_evidence".to_string()),
                    audit_evidence_level: None,
                    audit_document_type: None,
                    conclusion_strength: None,
                    requires_manual_verification: None,
                    audit_evidence_weight: None,
                    audit_pdf_locator_quality: None,
                    evidence_locator_quality: None,
                    source_evidence: Some(SourceEvidence {
                        title: Some("徐州：念好五字诀 推动部门预算审计审深审透审准".to_string()),
                        url: Some(
                            "https://jssjt.jiangsu.gov.cn/art/2024/8/19/art_1104_11322169.html"
                                .to_string(),
                        ),
                        published_at: Some("2024-08-19".to_string()),
                        captured_at: None,
                        row_number: Some(2),
                        parser_version: Some("case-seed-v1".to_string()),
                        page_number: None,
                        section_title: Some("部门预算审计动态".to_string()),
                        locator_hash: Some("xuzhou".to_string()),
                        raw_excerpt: Some("念好五字诀".to_string()),
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
                    }),
                    source_row: 2,
                },
            ],
        });

        assert_eq!(preview.records.len(), 2);
        assert_eq!(
            preview.records[0].audit_evidence_level,
            Some(AuditEvidenceLevel::RectificationProgress)
        );
        assert_eq!(
            preview.records[1].audit_evidence_level,
            Some(AuditEvidenceLevel::AuditWorkUpdate)
        );
        assert_eq!(
            preview.records[1].recommended_priority.as_deref(),
            Some("P3")
        );
        assert_eq!(
            preview.records[1].conclusion_strength.as_deref(),
            Some("supplemental_data_only")
        );
        assert_eq!(preview.records[1].requires_manual_verification, Some(true));
    }

    #[test]
    fn assigns_granular_audit_evidence_weights() {
        let preview = preview_case_seed_batch(CaseSeedBatchPayload {
            title: Some("granular audit evidence".to_string()),
            template_kind: Some(CaseSeedTemplateKind::SpecialInspection),
            mapping_overrides: Vec::new(),
            assignment_rules: Vec::new(),
            records: vec![
                CaseSeedImportRecord {
                    issue_source: "江苏省审计厅".to_string(),
                    period: Some("2025".to_string()),
                    sequence: Some("A-1".to_string()),
                    project_name: "江苏省审计厅开展审计查出问题整改情况专项审计调查".to_string(),
                    construction_unit: "省级部门".to_string(),
                    consulting_unit: None,
                    review_type: Some("审计公开线索".to_string()),
                    project_category: Some("整改专项调查".to_string()),
                    submitted_amount: None,
                    approved_amount: None,
                    reduction_amount: None,
                    lead_reviewer: None,
                    accepted_at: Some("2025-09-22".to_string()),
                    completed_at: None,
                    document_no: Some("专项审计调查".to_string()),
                    recommended_case_type: Some("整改复核".to_string()),
                    recommended_priority: None,
                    recommended_issue: "专项审计调查需要补充抽样清单和现场核查记录".to_string(),
                    source_department: Some("江苏省审计厅".to_string()),
                    target_department: None,
                    rectification_unit_name: Some("省级部门".to_string()),
                    assignee: None,
                    sla_due_at: None,
                    issue_amount: None,
                    issue_amount_unit: None,
                    responsible_subject: Some("省级部门".to_string()),
                    issue_category: Some("整改专项调查".to_string()),
                    required_next_data: vec!["抽样清单".to_string()],
                    rectification_status: Some("needs_internal_evidence".to_string()),
                    audit_evidence_level: None,
                    audit_document_type: None,
                    conclusion_strength: None,
                    requires_manual_verification: None,
                    audit_evidence_weight: None,
                    audit_pdf_locator_quality: None,
                    evidence_locator_quality: None,
                    source_evidence: Some(SourceEvidence {
                        title: Some("江苏省审计厅开展审计查出问题整改情况专项审计调查".to_string()),
                        url: Some(
                            "https://jssjt.jiangsu.gov.cn/art/2025/9/22/art_995_11645280.html"
                                .to_string(),
                        ),
                        published_at: Some("2025-09-22".to_string()),
                        captured_at: None,
                        row_number: Some(1),
                        parser_version: Some("case-seed-v1".to_string()),
                        page_number: None,
                        section_title: Some("专项审计调查".to_string()),
                        locator_hash: Some("survey".to_string()),
                        raw_excerpt: Some("整改情况专项审计调查".to_string()),
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
                    }),
                    source_row: 1,
                },
                CaseSeedImportRecord {
                    issue_source: "江苏省审计厅".to_string(),
                    period: Some("2025".to_string()),
                    sequence: Some("A-2".to_string()),
                    project_name: "县（市、区）党政主要领导干部经济责任审计结果集中反馈会"
                        .to_string(),
                    construction_unit: "县区单位".to_string(),
                    consulting_unit: None,
                    review_type: Some("审计公开线索".to_string()),
                    project_category: Some("结果反馈".to_string()),
                    submitted_amount: None,
                    approved_amount: None,
                    reduction_amount: None,
                    lead_reviewer: None,
                    accepted_at: Some("2025-02-20".to_string()),
                    completed_at: None,
                    document_no: Some("结果集中反馈会".to_string()),
                    recommended_case_type: Some("整改复核".to_string()),
                    recommended_priority: None,
                    recommended_issue: "集中反馈会提出整改意见，需要补充具体问题通报".to_string(),
                    source_department: Some("江苏省审计厅".to_string()),
                    target_department: None,
                    rectification_unit_name: Some("县区单位".to_string()),
                    assignee: None,
                    sla_due_at: None,
                    issue_amount: None,
                    issue_amount_unit: None,
                    responsible_subject: Some("县区单位".to_string()),
                    issue_category: Some("结果反馈".to_string()),
                    required_next_data: vec!["具体问题通报".to_string()],
                    rectification_status: Some("needs_internal_evidence".to_string()),
                    audit_evidence_level: None,
                    audit_document_type: None,
                    conclusion_strength: None,
                    requires_manual_verification: None,
                    audit_evidence_weight: None,
                    audit_pdf_locator_quality: None,
                    evidence_locator_quality: None,
                    source_evidence: Some(SourceEvidence {
                        title: Some("审计结果集中反馈会".to_string()),
                        url: Some(
                            "https://jssjt.jiangsu.gov.cn/art/2025/2/20/art_995_11496064.html"
                                .to_string(),
                        ),
                        published_at: Some("2025-02-20".to_string()),
                        captured_at: None,
                        row_number: Some(2),
                        parser_version: Some("case-seed-v1".to_string()),
                        page_number: None,
                        section_title: Some("结果反馈".to_string()),
                        locator_hash: Some("feedback".to_string()),
                        raw_excerpt: Some("集中反馈会".to_string()),
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
                    }),
                    source_row: 2,
                },
            ],
        });

        assert_eq!(
            preview.records[0].audit_evidence_level,
            Some(AuditEvidenceLevel::SpecialAuditSurvey)
        );
        assert_eq!(preview.records[0].audit_evidence_weight, Some(60));
        assert_eq!(
            preview.records[0].conclusion_strength.as_deref(),
            Some("review_recommended")
        );
        assert_eq!(
            preview.records[1].audit_evidence_level,
            Some(AuditEvidenceLevel::AuditResultFeedback)
        );
        assert_eq!(preview.records[1].audit_evidence_weight, Some(55));
        assert_eq!(preview.records[1].requires_manual_verification, Some(true));
    }

    #[test]
    fn preserves_structured_audit_issue_fields_in_case_seed_preview() {
        let preview = preview_case_seed_batch(CaseSeedBatchPayload {
            title: Some("official audit issue".to_string()),
            template_kind: Some(CaseSeedTemplateKind::SpecialInspection),
            mapping_overrides: Vec::new(),
            assignment_rules: Vec::new(),
            records: vec![CaseSeedImportRecord {
                issue_source: "江苏省审计厅公开审计工作报告".to_string(),
                period: Some("2024".to_string()),
                sequence: Some("ISSUE-001".to_string()),
                project_name: "上年度预算采购项目资金未按规定采用政府采购方式".to_string(),
                construction_unit: "7家部门单位".to_string(),
                consulting_unit: None,
                review_type: Some("审计公开问题线索".to_string()),
                project_category: Some("政府采购审计".to_string()),
                submitted_amount: Some("0.204751".to_string()),
                approved_amount: None,
                reduction_amount: None,
                lead_reviewer: None,
                accepted_at: None,
                completed_at: None,
                document_no: Some("江苏省2024年度省级预算执行审计工作报告".to_string()),
                recommended_case_type: Some("政府采购核查".to_string()),
                recommended_priority: Some("High".to_string()),
                recommended_issue: "需要补充采购计划、审批、合同和支付记录".to_string(),
                source_department: Some("江苏省审计厅".to_string()),
                target_department: None,
                rectification_unit_name: Some("7家部门单位".to_string()),
                assignee: None,
                sla_due_at: None,
                issue_amount: Some("0.204751".to_string()),
                issue_amount_unit: Some(crate::platform::v2::ValueUnit::YiYuan),
                responsible_subject: Some("7家部门单位".to_string()),
                issue_category: Some("政府采购审计".to_string()),
                required_next_data: vec!["采购合同".to_string(), "支付记录".to_string()],
                rectification_status: Some("needs_internal_evidence".to_string()),
                audit_evidence_level: None,
                audit_document_type: None,
                conclusion_strength: None,
                requires_manual_verification: None,
                audit_evidence_weight: None,
                audit_pdf_locator_quality: None,
                evidence_locator_quality: None,
                source_evidence: Some(SourceEvidence {
                    title: Some("江苏省2024年度省级预算执行和其他财政收支审计工作报告".to_string()),
                    url: Some("https://example.gov.cn/report.pdf".to_string()),
                    published_at: Some("2025-07-30".to_string()),
                    captured_at: Some("2026-04-26T16:40:00+08:00".to_string()),
                    row_number: Some(1),
                    parser_version: Some("official-public-instance-v1".to_string()),
                    page_number: Some(12),
                    section_title: Some("政府采购审计".to_string()),
                    locator_hash: Some("hash".to_string()),
                    raw_excerpt: Some("7家部门单位使用上年度预算采购项目资金".to_string()),
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
                }),
                source_row: 1,
            }],
        });

        assert_eq!(preview.quality_report.accepted_rows, 1);
        let record = preview.records.first().unwrap();
        assert_eq!(record.issue_amount.as_deref(), Some("0.204751"));
        assert_eq!(
            record.issue_amount_unit,
            Some(crate::platform::v2::ValueUnit::YiYuan)
        );
        assert_eq!(record.responsible_subject.as_deref(), Some("7家部门单位"));
        assert_eq!(record.required_next_data, vec!["采购合同", "支付记录"]);
        assert_eq!(
            record.rectification_status.as_deref(),
            Some("needs_internal_evidence")
        );
    }

    #[test]
    fn preserves_round_fifteen_audit_locator_quality_and_low_evidence_disposition() {
        let preview = preview_case_seed_batch(CaseSeedBatchPayload {
            title: Some("round15 audit locator quality".to_string()),
            template_kind: Some(CaseSeedTemplateKind::SpecialInspection),
            mapping_overrides: Vec::new(),
            assignment_rules: Vec::new(),
            records: vec![CaseSeedImportRecord {
                issue_source: "Jiangsu Audit Office information disclosure PDF".to_string(),
                period: Some("2025".to_string()),
                sequence: Some("R15-AUDIT-001".to_string()),
                project_name: "audit information disclosure reference".to_string(),
                construction_unit: "Jiangsu Audit Office".to_string(),
                consulting_unit: None,
                review_type: Some("audit information disclosure".to_string()),
                project_category: Some("audit_pdf_locator".to_string()),
                submitted_amount: None,
                approved_amount: None,
                reduction_amount: None,
                lead_reviewer: None,
                accepted_at: None,
                completed_at: None,
                document_no: Some("audit information disclosure report".to_string()),
                recommended_case_type: Some("knowledge reference".to_string()),
                recommended_priority: Some("Info".to_string()),
                recommended_issue: "information disclosure should not become risk candidate"
                    .to_string(),
                source_department: Some("Jiangsu Audit Office".to_string()),
                target_department: None,
                rectification_unit_name: None,
                assignee: None,
                sla_due_at: None,
                issue_amount: None,
                issue_amount_unit: None,
                responsible_subject: Some("Jiangsu Audit Office".to_string()),
                issue_category: Some("audit_project_plan".to_string()),
                required_next_data: vec!["formal audit report".to_string()],
                rectification_status: Some("manual_review".to_string()),
                audit_evidence_level: Some(AuditEvidenceLevel::AuditProjectPlan),
                audit_document_type: Some("audit_information_disclosure_pdf".to_string()),
                conclusion_strength: None,
                requires_manual_verification: None,
                audit_evidence_weight: None,
                audit_pdf_locator_quality: Some("page_table_paragraph_locator".to_string()),
                evidence_locator_quality: Some("complete".to_string()),
                source_evidence: Some(SourceEvidence {
                    title: Some("Jiangsu Audit Office information disclosure PDF".to_string()),
                    url: Some("https://example.gov.cn/audit-info.pdf".to_string()),
                    published_at: Some("2025-01-31".to_string()),
                    captured_at: Some("2026-04-27T22:20:00+08:00".to_string()),
                    row_number: Some(1),
                    parser_version: Some("round15-audit-pdf-v1".to_string()),
                    page_number: Some(3),
                    section_title: Some("audit disclosure".to_string()),
                    locator_hash: Some("r15-audit-locator".to_string()),
                    raw_excerpt: Some("audit information disclosure report".to_string()),
                    table_title: Some("project plan table".to_string()),
                    table_row_index: Some(4),
                    table_column_name: Some("document type".to_string()),
                    paragraph_index: Some(8),
                    pdf_table_id: Some("audit-table-1".to_string()),
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
            }],
        });

        assert_eq!(preview.records.len(), 1);
        let record = &preview.records[0];
        assert_eq!(
            record.audit_pdf_locator_quality.as_deref(),
            Some("page_table_paragraph_locator")
        );
        assert_eq!(record.evidence_locator_quality.as_deref(), Some("complete"));
        assert_eq!(
            record.audit_evidence_level,
            Some(AuditEvidenceLevel::AuditProjectPlan)
        );
        assert_ne!(
            record.conclusion_strength.as_deref(),
            Some("risk_candidate")
        );
    }
}
