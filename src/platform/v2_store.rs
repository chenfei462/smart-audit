use super::budget::{build_budget_task_detail, evaluate_budget_rules, BudgetPreviewResult};
use super::case_seed::{
    infer_case_seed_due_at, preview_case_seed_csv_bytes_with_options,
    preview_case_seed_excel_bytes_with_options, CaseSeedAssignmentField, CaseSeedAssignmentRule,
    CaseSeedPreviewOptions, CaseSeedPreviewResult, CaseSeedTemplateConfig, CaseSeedTemplateKind,
};
use super::defaults::now_string;
use super::linkage::{score_budget_link, BudgetProjectCandidate};
use super::procurement::{
    evaluate_procurement_rules, ProcurementImportRecord, ProcurementPreviewResult,
};
use super::store::PlatformStore;
use super::treasury::{build_treasury_task_detail, evaluate_payment_rules, TreasuryPreviewResult};
use super::voucher::{build_voucher_task_detail, evaluate_voucher_rules, VoucherPreviewResult};
use super::{
    AccountClassificationRecord, AssignmentDictionaryRule, AssignmentDictionaryRuleInput,
    AssignmentRuleSource, AutomationExecution, AutomationExecutionSummary, AutomationSchedule,
    AutomationScheduleInput, AutomationScheduleKind, AutomationTargetKind, BudgetLinkageSummary,
    AuditLogEntry, BudgetProjectRecord, BudgetSummaryRowRecord, BudgetSummaryTaskDetail,
    BudgetUnitRecord,
    CaseAssignment, CaseEscalationEvent, CaseMetricBucket, CaseMetrics, CaseMetricsByDimension,
    CaseMetricsOverview, CaseSlaSnapshot, CaseTransitionEvent, CaseTrendPoint, AnyTask, ConnectorProfile,
    ConnectorProfileInput, ConnectorSyncJob, ConnectorType, ContractLinkageSummary,
    ExceptionBulkActionTarget, ExceptionCase, ExceptionCaseDetail, ExceptionDispositionEvent,
    ExceptionReceiptAttachment, ExceptionReminderEvent, FundingSourceRecord, ImportJobRecord,
    ImportProfile, ImportProfileInput, ImportProfileScope, ImportQualityReport, ImportSourceKind,
    LedgerEntryRecord, LedgerLinkageSummary, LinkageCandidateMatch, NotificationDelivery,
    NotificationSummary, PaymentLinkageSummary, PlatformTask, PlatformTaskFinding,
    PlatformTaskStatus, PlatformTaskSummary, ProcurementBudgetLinkEvidence,
    ProcurementBudgetLinkMode, ProcurementContractRecord, ProcurementProjectRecord,
    ProcurementTaskDetail, QualityCheck, QualitySeverity, ReconciliationException,
    RectificationExtensionRequest, RectificationReviewDecision, RectificationSubmission,
    SchedulerLease, SessionIdentity, SourceDocumentRecord, SupplierRecord, TaskDetailPayload,
    TaskExceptionPoolEntry, TaskKind, TreasuryPaymentTaskDetail, TreasuryPaymentVoucherRecord,
    VoucherLedgerTaskDetail, WritebackEvent, WritebackInput,
};
use crate::auth::UserRole;
use crate::platform::FindingCaseStatus;
use anyhow::{Context, Result};
use chrono::{Datelike, NaiveDate};
use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use rust_decimal::Decimal;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::str::FromStr;
use uuid::Uuid;

const CASE_LIST_EXCEPTION_SYNC_LIMIT: usize = 24;

fn connector_secret_required(auth_mode: &str) -> bool {
    !matches!(auth_mode.trim().to_ascii_lowercase().as_str(), "" | "none")
}

fn connector_secret_env_var_name(profile_id: &str) -> String {
    format!(
        "AUDITLENS_CONNECTOR_SECRET_{}",
        profile_id.replace('-', "_").to_ascii_uppercase()
    )
}

fn connector_credential_state(profile_id: &str, auth_mode: &str) -> String {
    if !connector_secret_required(auth_mode) {
        return "not_required".to_string();
    }
    let env_var = connector_secret_env_var_name(profile_id);
    match env::var(&env_var) {
        Ok(value) if !value.trim().is_empty() => "env_configured".to_string(),
        _ => "missing_env".to_string(),
    }
}

#[derive(Debug, Clone, Default)]
struct ExceptionRecordContext {
    contract_no: Option<String>,
    payment_order_no: Option<String>,
    treasury_voucher_no: Option<String>,
    voucher_no: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ExceptionDisposition {
    status: Option<String>,
    assignee: Option<String>,
    disposition_note: Option<String>,
    disposition_priority: Option<String>,
    disposition_outcome: Option<String>,
    remediation_due_at: Option<String>,
    reminder_flag: Option<bool>,
    disposed_at: Option<String>,
}

impl PlatformStore {
    pub(super) fn ensure_platform_v2_schema(&self) -> Result<()> {
        let conn = self.connect()?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS platform_tasks (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                title TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                status TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                primary_subject TEXT NOT NULL,
                detail_json TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS platform_task_findings (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                rule_code TEXT NOT NULL,
                rule_name TEXT NOT NULL,
                rule_category TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                summary TEXT NOT NULL,
                audit_rationale TEXT NOT NULL,
                recommended_action TEXT NOT NULL,
                evidence_summary TEXT NOT NULL,
                finding_status TEXT NOT NULL,
                assignee TEXT,
                disposition_note TEXT,
                disposition_priority TEXT,
                disposition_outcome TEXT,
                remediation_due_at TEXT,
                reminder_flag INTEGER NOT NULL DEFAULT 0,
                disposed_at TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS import_jobs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL,
                primary_subject TEXT NOT NULL,
                preview_json TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                committed_task_id TEXT
            );
            CREATE TABLE IF NOT EXISTS import_quality_reports (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                owner_type TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                severity TEXT NOT NULL,
                code TEXT NOT NULL,
                field_name TEXT,
                row_number INTEGER,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS import_quality_report_summaries (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                owner_type TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                total_rows INTEGER NOT NULL,
                accepted_rows INTEGER NOT NULL,
                rejected_rows INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_import_quality_report_summaries_owner
                ON import_quality_report_summaries(tenant_id, owner_type, owner_id, task_kind);
            CREATE TABLE IF NOT EXISTS budget_units (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                code TEXT,
                name TEXT NOT NULL,
                region TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_units_tenant_name
                ON budget_units(tenant_id, lower(name));
            CREATE TABLE IF NOT EXISTS budget_projects (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                budget_unit_id TEXT,
                name TEXT NOT NULL,
                project_catalog_id TEXT,
                indicator_document_no TEXT,
                funding_source_id TEXT
            );
            CREATE TABLE IF NOT EXISTS budget_summary_rows (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                dataset_kind TEXT NOT NULL,
                period TEXT NOT NULL,
                region TEXT,
                budget_scope TEXT NOT NULL,
                direction TEXT NOT NULL,
                budget_unit_id TEXT,
                budget_project_id TEXT,
                funding_source_id TEXT,
                account_classification_id TEXT,
                budget_unit_name TEXT,
                budget_unit_code TEXT,
                budget_project_name TEXT,
                project_catalog_id TEXT,
                indicator_document_no TEXT,
                funding_source_name TEXT,
                function_classification_code TEXT,
                function_classification_name TEXT,
                economic_classification_code TEXT,
                economic_classification_name TEXT,
                summary_item TEXT,
                budget_amount TEXT,
                actual_amount TEXT NOT NULL,
                previous_period_amount TEXT,
                yoy_rate TEXT,
                source_row INTEGER
            );
            CREATE TABLE IF NOT EXISTS suppliers (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tenant_name
                ON suppliers(tenant_id, lower(name));
            CREATE TABLE IF NOT EXISTS procurement_projects (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                budget_project_id TEXT,
                budget_unit_id TEXT,
                supplier_id TEXT,
                funding_source_id TEXT,
                account_classification_id TEXT,
                project_name TEXT NOT NULL,
                purchaser_name TEXT NOT NULL,
                announcement_type TEXT NOT NULL,
                project_code TEXT NOT NULL,
                procurement_method TEXT,
                published_at TEXT,
                region TEXT,
                budget_amount TEXT,
                award_amount TEXT,
                supplier_name TEXT,
                indicator_document_no TEXT,
                project_catalog_id TEXT,
                notice_url TEXT,
                source_row INTEGER,
                linkage_match_mode TEXT,
                linkage_match_score INTEGER,
                linkage_match_reasons_json TEXT
            );
            CREATE TABLE IF NOT EXISTS budget_procurement_link_candidates (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                procurement_project_id TEXT NOT NULL,
                budget_project_id TEXT NOT NULL,
                match_mode TEXT NOT NULL,
                match_score INTEGER NOT NULL,
                match_reasons_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS procurement_contracts (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                procurement_project_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                contract_no TEXT,
                contract_published_at TEXT,
                acceptance_summary TEXT,
                acceptance_status TEXT,
                contract_amount TEXT
            );
            CREATE TABLE IF NOT EXISTS treasury_payment_vouchers (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                budget_project_id TEXT,
                payment_order_no TEXT,
                amount TEXT,
                paid_at TEXT,
                counterparty TEXT
            );
            CREATE TABLE IF NOT EXISTS ledger_entries (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                budget_project_id TEXT,
                voucher_no TEXT,
                account_code TEXT,
                account_name TEXT,
                debit_amount TEXT,
                credit_amount TEXT,
                booked_at TEXT
            );
            CREATE TABLE IF NOT EXISTS funding_sources (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS account_classifications (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                function_classification_code TEXT,
                economic_classification_code TEXT
            );
            CREATE TABLE IF NOT EXISTS source_documents (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                document_type TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT,
                captured_at TEXT
            );
            CREATE TABLE IF NOT EXISTS connector_profiles (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                connector_type TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                dataset_kind TEXT,
                base_url TEXT NOT NULL,
                auth_mode TEXT NOT NULL,
                credential_json TEXT NOT NULL,
                sample_payload_json TEXT,
                enabled INTEGER NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_preview_at TEXT,
                last_commit_at TEXT
            );
            CREATE TABLE IF NOT EXISTS connector_sync_jobs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                profile_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                dataset_kind TEXT,
                status TEXT NOT NULL,
                mode TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                preview_job_id TEXT,
                committed_task_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS connector_writeback_events (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                status TEXT NOT NULL,
                conclusion TEXT,
                reminder_flag INTEGER NOT NULL,
                idempotency_key TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_writeback_idempotency
                ON connector_writeback_events(tenant_id, idempotency_key);
            CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                exception_code TEXT NOT NULL,
                summary TEXT NOT NULL,
                severity TEXT NOT NULL,
                source_record_id TEXT,
                related_record_id TEXT,
                status TEXT NOT NULL,
                assignee TEXT,
                disposition_note TEXT,
                disposition_priority TEXT,
                disposition_outcome TEXT,
                remediation_due_at TEXT,
                reminder_flag INTEGER NOT NULL DEFAULT 0,
                disposed_at TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exception_disposition_events (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                exception_id TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                assignee TEXT,
                disposition_note TEXT,
                disposition_priority TEXT,
                disposition_outcome TEXT,
                remediation_due_at TEXT,
                reminder_flag INTEGER,
                changed_by TEXT NOT NULL,
                changed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exception_receipt_attachments (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                exception_id TEXT NOT NULL,
                source TEXT NOT NULL,
                file_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                note TEXT,
                uploaded_by TEXT NOT NULL,
                uploaded_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exception_reminder_events (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                exception_id TEXT NOT NULL,
                source TEXT NOT NULL,
                reminder_flag INTEGER NOT NULL,
                reminder_note TEXT,
                changed_by TEXT NOT NULL,
                changed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exception_cases (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_no TEXT NOT NULL,
                task_id TEXT NOT NULL,
                exception_id TEXT NOT NULL,
                exception_source TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                rule_domain TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                exception_code TEXT NOT NULL,
                exception_title TEXT NOT NULL,
                exception_summary TEXT NOT NULL,
                owner_organization_id TEXT,
                visibility_scope TEXT NOT NULL DEFAULT 'tenant',
                priority TEXT NOT NULL,
                case_status TEXT NOT NULL,
                current_stage TEXT NOT NULL,
                current_handler_user_id TEXT,
                current_handler_display_name TEXT,
                source_department TEXT,
                target_department TEXT,
                rectification_unit_name TEXT,
                disposition_outcome TEXT,
                disposition_note TEXT,
                accepted_at TEXT NOT NULL,
                first_assigned_at TEXT,
                first_response_at TEXT,
                submitted_for_review_at TEXT,
                sla_due_at TEXT,
                remediation_due_at TEXT,
                closed_at TEXT,
                reminder_count INTEGER NOT NULL DEFAULT 0,
                escalation_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_exception_cases_unique
                ON exception_cases(tenant_id, task_id, exception_id, exception_source);
            CREATE TABLE IF NOT EXISTS case_transition_events (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                exception_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                from_stage TEXT,
                to_stage TEXT NOT NULL,
                case_status TEXT NOT NULL,
                assignee TEXT,
                priority TEXT,
                due_at TEXT,
                outcome TEXT,
                note TEXT,
                reminder_flag INTEGER,
                changed_by TEXT NOT NULL,
                changed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_assignments (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                assigned_to_user_id TEXT,
                assigned_to_display_name TEXT,
                source_department TEXT,
                target_department TEXT,
                rectification_unit_name TEXT,
                assigned_by TEXT NOT NULL,
                assigned_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_rectification_submissions (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                rectification_statement TEXT,
                requested_extension TEXT,
                receipt_attachment_count INTEGER NOT NULL DEFAULT 0,
                submitted_by TEXT NOT NULL,
                submitted_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_review_decisions (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                decision TEXT NOT NULL,
                note TEXT,
                reviewed_by TEXT NOT NULL,
                reviewed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_sla_snapshots (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                case_status TEXT NOT NULL,
                current_stage TEXT NOT NULL,
                priority TEXT NOT NULL,
                sla_due_at TEXT,
                overdue_days INTEGER NOT NULL DEFAULT 0,
                reminder_count INTEGER NOT NULL DEFAULT 0,
                escalation_count INTEGER NOT NULL DEFAULT 0,
                captured_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_reminder_notifications (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                note TEXT,
                changed_by TEXT NOT NULL,
                changed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_templates (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                channel TEXT NOT NULL,
                title_template TEXT NOT NULL,
                body_template TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS notification_deliveries (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                channel TEXT NOT NULL,
                recipient TEXT NOT NULL,
                recipient_scope TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL,
                delivered_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_escalation_events (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                level TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_extension_requests (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                requested_due_at TEXT NOT NULL,
                reason TEXT,
                status TEXT NOT NULL,
                reviewed_by TEXT,
                reviewed_at TEXT,
                submitted_by TEXT NOT NULL,
                submitted_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_seed_template_configs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                template_kind TEXT NOT NULL,
                mapping_overrides_json TEXT NOT NULL,
                assignment_rules_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_case_seed_template_configs_user_template
                ON case_seed_template_configs(tenant_id, user_id, template_kind);
            CREATE TABLE IF NOT EXISTS import_profiles (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                owner_user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                template_kind TEXT,
                scope TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                mapping_overrides_json TEXT NOT NULL,
                assignment_rules_json TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_import_profiles_tenant_task
                ON import_profiles(tenant_id, task_kind, template_kind);
            CREATE TABLE IF NOT EXISTS assignment_dictionary_rules (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                owner_user_id TEXT NOT NULL,
                task_kind TEXT NOT NULL,
                template_kind TEXT,
                match_field TEXT NOT NULL,
                match_value TEXT NOT NULL,
                assignee TEXT NOT NULL,
                target_department TEXT,
                priority INTEGER NOT NULL,
                scope TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                label TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_assignment_dictionary_rules_tenant_task
                ON assignment_dictionary_rules(tenant_id, task_kind, template_kind, scope, enabled, priority, created_at);
            CREATE TABLE IF NOT EXISTS automation_schedules (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                name TEXT NOT NULL,
                schedule_kind TEXT NOT NULL,
                target_kind TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                shared_profile_id TEXT,
                connector_profile_id TEXT,
                source_path TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_run_at TEXT
            );
            CREATE TABLE IF NOT EXISTS automation_executions (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                schedule_id TEXT NOT NULL,
                schedule_kind TEXT NOT NULL,
                target_kind TEXT NOT NULL,
                status TEXT NOT NULL,
                trigger_kind TEXT NOT NULL,
                trigger_window TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                summary_json TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_automation_executions_schedule_window
                ON automation_executions(tenant_id, schedule_id, trigger_kind, trigger_window, status);
            CREATE TABLE IF NOT EXISTS scheduler_leases (
                tenant_id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                lease_expires_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            ",
        )
        .context("failed to initialize sqlite v2 schema")?;
        add_column_if_missing(&conn, "procurement_projects", "linkage_match_mode", "TEXT")?;
        add_column_if_missing(
            &conn,
            "procurement_projects",
            "linkage_match_score",
            "INTEGER",
        )?;
        add_column_if_missing(
            &conn,
            "procurement_projects",
            "linkage_match_reasons_json",
            "TEXT",
        )?;
        add_column_if_missing(&conn, "platform_task_findings", "assignee", "TEXT")?;
        add_column_if_missing(&conn, "platform_task_findings", "disposition_note", "TEXT")?;
        add_column_if_missing(
            &conn,
            "platform_task_findings",
            "disposition_priority",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "platform_task_findings",
            "disposition_outcome",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "platform_task_findings",
            "remediation_due_at",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "platform_task_findings",
            "reminder_flag",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(&conn, "platform_task_findings", "disposed_at", "TEXT")?;
        add_column_if_missing(&conn, "reconciliation_exceptions", "assignee", "TEXT")?;
        add_column_if_missing(
            &conn,
            "reconciliation_exceptions",
            "disposition_note",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "reconciliation_exceptions",
            "disposition_priority",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "reconciliation_exceptions",
            "disposition_outcome",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "reconciliation_exceptions",
            "remediation_due_at",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "reconciliation_exceptions",
            "reminder_flag",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(&conn, "reconciliation_exceptions", "disposed_at", "TEXT")?;
        add_column_if_missing(
            &conn,
            "exception_disposition_events",
            "disposition_priority",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "exception_disposition_events",
            "disposition_outcome",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "exception_disposition_events",
            "remediation_due_at",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "exception_disposition_events",
            "reminder_flag",
            "INTEGER",
        )?;
        add_column_if_missing(&conn, "exception_cases", "owner_organization_id", "TEXT")?;
        add_column_if_missing(
            &conn,
            "exception_cases",
            "visibility_scope",
            "TEXT NOT NULL DEFAULT 'tenant'",
        )?;
        add_column_if_missing(&conn, "procurement_contracts", "supplier_id", "TEXT")?;
        add_column_if_missing(&conn, "procurement_contracts", "funding_source_id", "TEXT")?;
        add_column_if_missing(
            &conn,
            "procurement_contracts",
            "account_classification_id",
            "TEXT",
        )?;
        add_column_if_missing(&conn, "procurement_contracts", "source_document_id", "TEXT")?;
        add_column_if_missing(&conn, "procurement_contracts", "writeback_status", "TEXT")?;
        add_column_if_missing(&conn, "procurement_contracts", "writeback_ref", "TEXT")?;
        add_column_if_missing(
            &conn,
            "procurement_contracts",
            "reconciliation_status",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "procurement_project_id",
            "TEXT",
        )?;
        add_column_if_missing(&conn, "treasury_payment_vouchers", "supplier_id", "TEXT")?;
        add_column_if_missing(&conn, "treasury_payment_vouchers", "supplier_name", "TEXT")?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "funding_source_id",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "account_classification_id",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "source_document_id",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "indicator_document_no",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "project_catalog_id",
            "TEXT",
        )?;
        add_column_if_missing(&conn, "treasury_payment_vouchers", "contract_no", "TEXT")?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "treasury_voucher_no",
            "TEXT",
        )?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "writeback_status",
            "TEXT",
        )?;
        add_column_if_missing(&conn, "treasury_payment_vouchers", "writeback_ref", "TEXT")?;
        add_column_if_missing(
            &conn,
            "treasury_payment_vouchers",
            "reconciliation_status",
            "TEXT",
        )?;
        add_column_if_missing(&conn, "treasury_payment_vouchers", "source_row", "INTEGER")?;
        add_column_if_missing(&conn, "ledger_entries", "procurement_project_id", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "supplier_id", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "supplier_name", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "funding_source_id", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "account_classification_id", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "source_document_id", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "indicator_document_no", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "project_catalog_id", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "contract_no", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "payment_order_no", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "treasury_voucher_no", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "writeback_status", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "writeback_ref", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "reconciliation_status", "TEXT")?;
        add_column_if_missing(&conn, "ledger_entries", "source_row", "INTEGER")?;
        Ok(())
    }

    pub fn save_procurement_preview_job(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &ProcurementPreviewResult,
    ) -> Result<String> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start preview transaction")?;
        let job_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO import_jobs (
                id, tenant_id, organization_id, task_kind, source_kind, status, title,
                primary_subject, preview_json, created_by, created_at, committed_task_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
            params![
                job_id,
                actor.tenant_id,
                actor.organization_id,
                TaskKind::ProcurementProject.as_str(),
                source_kind.as_str(),
                "preview_ready",
                preview.title,
                preview.primary_subject,
                serialize_json(preview)?,
                actor.user_id,
                now_string(),
            ],
        )
        .context("failed to insert import preview job")?;
        self.insert_quality_checks(
            &tx,
            &actor.tenant_id,
            "import_job",
            &job_id,
            TaskKind::ProcurementProject,
            &preview.quality_report,
        )?;
        tx.commit().context("failed to commit import preview job")?;
        Ok(job_id)
    }

    pub fn save_budget_preview_job(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &BudgetPreviewResult,
    ) -> Result<String> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start preview transaction")?;
        let job_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO import_jobs (
                id, tenant_id, organization_id, task_kind, source_kind, status, title,
                primary_subject, preview_json, created_by, created_at, committed_task_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
            params![
                job_id,
                actor.tenant_id,
                actor.organization_id,
                TaskKind::BudgetSummary.as_str(),
                source_kind.as_str(),
                "preview_ready",
                preview.title,
                preview.primary_subject,
                serialize_json(preview)?,
                actor.user_id,
                now_string(),
            ],
        )
        .context("failed to insert budget import preview job")?;
        self.insert_quality_checks(
            &tx,
            &actor.tenant_id,
            "import_job",
            &job_id,
            TaskKind::BudgetSummary,
            &preview.quality_report,
        )?;
        tx.commit()
            .context("failed to commit budget import preview job")?;
        Ok(job_id)
    }

    pub fn save_treasury_preview_job(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &TreasuryPreviewResult,
    ) -> Result<String> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start treasury preview transaction")?;
        let job_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO import_jobs (
                id, tenant_id, organization_id, task_kind, source_kind, status, title,
                primary_subject, preview_json, created_by, created_at, committed_task_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
            params![
                job_id,
                actor.tenant_id,
                actor.organization_id,
                TaskKind::TreasuryPayment.as_str(),
                source_kind.as_str(),
                "preview_ready",
                preview.title,
                preview.primary_subject,
                serialize_json(preview)?,
                actor.user_id,
                now_string(),
            ],
        )
        .context("failed to insert treasury import preview job")?;
        self.insert_quality_checks(
            &tx,
            &actor.tenant_id,
            "import_job",
            &job_id,
            TaskKind::TreasuryPayment,
            &preview.quality_report,
        )?;
        tx.commit()
            .context("failed to commit treasury import preview job")?;
        Ok(job_id)
    }

    pub fn save_voucher_preview_job(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &VoucherPreviewResult,
    ) -> Result<String> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start voucher preview transaction")?;
        let job_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO import_jobs (
                id, tenant_id, organization_id, task_kind, source_kind, status, title,
                primary_subject, preview_json, created_by, created_at, committed_task_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
            params![
                job_id,
                actor.tenant_id,
                actor.organization_id,
                TaskKind::VoucherLedger.as_str(),
                source_kind.as_str(),
                "preview_ready",
                preview.title,
                preview.primary_subject,
                serialize_json(preview)?,
                actor.user_id,
                now_string(),
            ],
        )
        .context("failed to insert voucher import preview job")?;
        self.insert_quality_checks(
            &tx,
            &actor.tenant_id,
            "import_job",
            &job_id,
            TaskKind::VoucherLedger,
            &preview.quality_report,
        )?;
        tx.commit()
            .context("failed to commit voucher import preview job")?;
        Ok(job_id)
    }

    pub fn commit_procurement_import_job(
        &self,
        actor: &SessionIdentity,
        job_id: &str,
    ) -> Result<PlatformTask> {
        let task = self.commit_import_job(actor, job_id)?;
        if task.task_kind != TaskKind::ProcurementProject {
            anyhow::bail!("import preview job is not a procurement task");
        }
        Ok(task)
    }

    pub fn commit_import_job(&self, actor: &SessionIdentity, job_id: &str) -> Result<PlatformTask> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start import commit transaction")?;
        let (task_kind, source_kind, preview_json): (String, String, String) = tx
            .query_row(
                "SELECT task_kind, source_kind, preview_json
                 FROM import_jobs
                 WHERE id = ?1 AND tenant_id = ?2 AND committed_task_id IS NULL",
                params![job_id, actor.tenant_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .context("failed to query import job")?
            .context("import preview job not found")?;
        let task_kind = TaskKind::from_str(&task_kind).map_err(anyhow::Error::msg)?;
        let source_kind = ImportSourceKind::from_str(&source_kind).map_err(anyhow::Error::msg)?;
        let task = match task_kind {
            TaskKind::ProcurementProject => {
                let preview: ProcurementPreviewResult = serde_json::from_str(&preview_json)
                    .context("failed to parse procurement preview job payload")?;
                self.insert_procurement_task_tx(&tx, actor, source_kind, &preview)?
            }
            TaskKind::BudgetSummary => {
                let preview: BudgetPreviewResult = serde_json::from_str(&preview_json)
                    .context("failed to parse budget preview job payload")?;
                self.insert_budget_task_tx(&tx, actor, source_kind, &preview)?
            }
            TaskKind::TreasuryPayment => {
                let preview: TreasuryPreviewResult = serde_json::from_str(&preview_json)
                    .context("failed to parse treasury preview job payload")?;
                self.insert_treasury_task_tx(&tx, actor, source_kind, &preview)?
            }
            TaskKind::VoucherLedger => {
                let preview: VoucherPreviewResult = serde_json::from_str(&preview_json)
                    .context("failed to parse voucher preview job payload")?;
                self.insert_voucher_task_tx(&tx, actor, source_kind, &preview)?
            }
            TaskKind::SupervisionCaseSeed => {
                anyhow::bail!("supervision case seed does not use import jobs")
            }
        };
        tx.execute(
            "UPDATE import_jobs
             SET status = 'committed', committed_task_id = ?2
             WHERE id = ?1",
            params![job_id, task.id],
        )
        .context("failed to update import job status")?;
        tx.commit().context("failed to commit import job")?;
        Ok(task)
    }

    pub fn record_procurement_task(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &ProcurementPreviewResult,
    ) -> Result<PlatformTask> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start procurement task transaction")?;
        let task = self.insert_procurement_task_tx(&tx, actor, source_kind, preview)?;
        tx.commit().context("failed to commit procurement task")?;
        Ok(task)
    }

    pub fn record_budget_task(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &BudgetPreviewResult,
    ) -> Result<PlatformTask> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start budget task transaction")?;
        let task = self.insert_budget_task_tx(&tx, actor, source_kind, preview)?;
        tx.commit().context("failed to commit budget task")?;
        Ok(task)
    }

    pub fn record_treasury_task(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &TreasuryPreviewResult,
    ) -> Result<PlatformTask> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start treasury task transaction")?;
        let task = self.insert_treasury_task_tx(&tx, actor, source_kind, preview)?;
        tx.commit().context("failed to commit treasury task")?;
        Ok(task)
    }

    pub fn record_voucher_task(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &VoucherPreviewResult,
    ) -> Result<PlatformTask> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start voucher task transaction")?;
        let task = self.insert_voucher_task_tx(&tx, actor, source_kind, preview)?;
        tx.commit().context("failed to commit voucher task")?;
        Ok(task)
    }

    pub fn import_case_seed_records(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &CaseSeedPreviewResult,
    ) -> Result<Vec<ExceptionCase>> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start case seed import transaction")?;
        let cases = self.insert_case_seed_records_tx(&tx, actor, source_kind, preview)?;
        tx.commit()
            .context("failed to commit case seed import transaction")?;
        Ok(cases)
    }

    pub fn save_case_seed_template_config(
        &self,
        actor: &SessionIdentity,
        config: CaseSeedTemplateConfig,
    ) -> Result<CaseSeedTemplateConfig> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let profile = self.upsert_default_case_seed_import_profile(&conn, actor, &config)?;
        Ok(CaseSeedTemplateConfig {
            template_kind: config.template_kind,
            mapping_overrides: profile.mapping_overrides,
            assignment_rules: profile.assignment_rules,
            updated_at: Some(profile.updated_at),
        })
    }

    pub fn get_case_seed_template_config(
        &self,
        actor: &SessionIdentity,
        template_kind: CaseSeedTemplateKind,
    ) -> Result<Option<CaseSeedTemplateConfig>> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        self.migrate_legacy_case_seed_template_configs(&conn, actor)?;
        if let Some(profile) =
            self.load_default_case_seed_import_profile(&conn, actor, template_kind)?
        {
            return Ok(Some(CaseSeedTemplateConfig {
                template_kind,
                mapping_overrides: profile.mapping_overrides,
                assignment_rules: profile.assignment_rules,
                updated_at: Some(profile.updated_at),
            }));
        }
        conn.query_row(
            "SELECT mapping_overrides_json, assignment_rules_json, updated_at
             FROM case_seed_template_configs
             WHERE tenant_id = ?1 AND user_id = ?2 AND template_kind = ?3",
            params![
                actor.tenant_id.as_str(),
                actor.user_id.as_str(),
                template_kind.as_str()
            ],
            |row| {
                let mapping_raw: String = row.get(0)?;
                let rules_raw: String = row.get(1)?;
                let updated_at: String = row.get(2)?;
                Ok(CaseSeedTemplateConfig {
                    template_kind,
                    mapping_overrides: deserialize_json(0, &mapping_raw)?,
                    assignment_rules: deserialize_json(1, &rules_raw)?,
                    updated_at: Some(updated_at),
                })
            },
        )
        .optional()
        .map_err(anyhow::Error::from)
    }

    pub fn list_import_profiles(
        &self,
        actor: &SessionIdentity,
        task_kind: Option<TaskKind>,
    ) -> Result<Vec<ImportProfile>> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        self.migrate_legacy_case_seed_template_configs(&conn, actor)?;
        let mut sql = String::from(
            "SELECT id, name, task_kind, template_kind, scope, owner_user_id, is_default,
                    mapping_overrides_json, assignment_rules_json, notes, updated_at
             FROM import_profiles
             WHERE tenant_id = ?1
               AND (scope = 'shared' OR owner_user_id = ?2)",
        );
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&actor.tenant_id, &actor.user_id];
        let task_kind_value = task_kind.map(|item| item.as_str().to_string());
        if let Some(value) = task_kind_value.as_ref() {
            sql.push_str(" AND task_kind = ?3");
            params_vec.push(value);
        }
        sql.push_str(" ORDER BY task_kind, COALESCE(template_kind, ''), CASE scope WHEN 'shared' THEN 0 ELSE 1 END, updated_at DESC");
        let mut statement = conn.prepare(&sql)?;
        let rows = statement.query_map(
            rusqlite::params_from_iter(params_vec),
            row_to_import_profile,
        )?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn save_import_profile(
        &self,
        actor: &SessionIdentity,
        input: ImportProfileInput,
    ) -> Result<ImportProfile> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let now = now_string();
        if input.is_default {
            self.clear_default_import_profiles(
                &conn,
                &actor.tenant_id,
                &actor.user_id,
                input.task_kind,
                input.template_kind.as_deref(),
                input.scope,
            )?;
        }
        let profile = ImportProfile {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            task_kind: input.task_kind,
            template_kind: input.template_kind,
            scope: input.scope,
            owner_user_id: actor.user_id.clone(),
            is_default: input.is_default,
            mapping_overrides: input.mapping_overrides,
            assignment_rules: input.assignment_rules,
            notes: input.notes,
            updated_at: now.clone(),
        };
        conn.execute(
            "INSERT INTO import_profiles (
                id, tenant_id, owner_user_id, name, task_kind, template_kind, scope, is_default,
                mapping_overrides_json, assignment_rules_json, notes, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                profile.id,
                actor.tenant_id,
                profile.owner_user_id,
                profile.name,
                profile.task_kind.as_str(),
                profile.template_kind,
                profile.scope.as_str(),
                if profile.is_default { 1_i64 } else { 0_i64 },
                serialize_json(&profile.mapping_overrides)?,
                serialize_json(&profile.assignment_rules)?,
                profile.notes,
                now,
                profile.updated_at,
            ],
        )?;
        self.load_import_profile_for_actor(&conn, actor, &profile.id)?
            .context("saved import profile not found")
    }

    pub fn clone_import_profile(
        &self,
        actor: &SessionIdentity,
        profile_id: &str,
        new_name: String,
        new_scope: ImportProfileScope,
    ) -> Result<ImportProfile> {
        let conn = self.connect()?;
        let source = self
            .load_import_profile_for_actor(&conn, actor, profile_id)?
            .context("import profile not found")?;
        self.save_import_profile(
            actor,
            ImportProfileInput {
                name: new_name,
                task_kind: source.task_kind,
                template_kind: source.template_kind,
                scope: new_scope,
                is_default: false,
                mapping_overrides: source.mapping_overrides,
                assignment_rules: source.assignment_rules,
                notes: source.notes,
            },
        )
    }

    pub fn export_import_profile(
        &self,
        actor: &SessionIdentity,
        profile_id: &str,
    ) -> Result<ImportProfile> {
        let conn = self.connect()?;
        self.load_import_profile_for_actor(&conn, actor, profile_id)?
            .context("import profile not found")
    }

    pub fn import_import_profile(
        &self,
        actor: &SessionIdentity,
        bundle: ImportProfile,
    ) -> Result<ImportProfile> {
        self.save_import_profile(
            actor,
            ImportProfileInput {
                name: bundle.name,
                task_kind: bundle.task_kind,
                template_kind: bundle.template_kind,
                scope: bundle.scope,
                is_default: bundle.is_default,
                mapping_overrides: bundle.mapping_overrides,
                assignment_rules: bundle.assignment_rules,
                notes: bundle.notes,
            },
        )
    }

    pub fn list_assignment_dictionary_rules(
        &self,
        actor: &SessionIdentity,
        task_kind: Option<TaskKind>,
        template_kind: Option<&str>,
    ) -> Result<Vec<AssignmentDictionaryRule>> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let mut sql = String::from(
            "SELECT id, task_kind, template_kind, match_field, match_value, assignee,
                    target_department, priority, scope, enabled, label, owner_user_id, updated_at
             FROM assignment_dictionary_rules
               WHERE tenant_id = ?1
               AND (scope = 'shared' OR owner_user_id = ?2)",
        );
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&actor.tenant_id, &actor.user_id];
        let task_kind_value = task_kind.map(|item| item.as_str().to_string());
        let template_kind_value = template_kind.map(|item| item.to_string());
        if let Some(value) = task_kind_value.as_ref() {
            sql.push_str(" AND task_kind = ?3");
            params_vec.push(value);
            if let Some(template) = template_kind_value.as_ref() {
                sql.push_str(" AND (template_kind = ?4 OR template_kind IS NULL)");
                params_vec.push(template);
            }
        } else if let Some(template) = template_kind_value.as_ref() {
            sql.push_str(" AND (template_kind = ?3 OR template_kind IS NULL)");
            params_vec.push(template);
        }
        sql.push_str(
            " ORDER BY CASE scope WHEN 'private' THEN 0 ELSE 1 END, priority ASC, updated_at ASC, id ASC",
        );
        let mut statement = conn.prepare(&sql)?;
        let rows = statement.query_map(
            rusqlite::params_from_iter(params_vec),
            row_to_assignment_dictionary_rule,
        )?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn save_assignment_dictionary_rule(
        &self,
        actor: &SessionIdentity,
        input: AssignmentDictionaryRuleInput,
    ) -> Result<AssignmentDictionaryRule> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        parse_case_seed_assignment_field(&input.match_field)?;
        let conn = self.connect()?;
        let rule = AssignmentDictionaryRule {
            id: Uuid::new_v4().to_string(),
            task_kind: input.task_kind,
            template_kind: input.template_kind,
            match_field: input.match_field,
            match_value: input.match_value,
            assignee: input.assignee,
            target_department: input.target_department,
            priority: input.priority,
            scope: input.scope,
            enabled: input.enabled,
            label: input.label,
            owner_user_id: actor.user_id.clone(),
            updated_at: now_string(),
        };
        conn.execute(
            "INSERT INTO assignment_dictionary_rules (
                id, tenant_id, owner_user_id, task_kind, template_kind, match_field, match_value,
                assignee, target_department, priority, scope, enabled, label, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                rule.id,
                actor.tenant_id,
                rule.owner_user_id,
                rule.task_kind.as_str(),
                rule.template_kind,
                rule.match_field,
                rule.match_value,
                rule.assignee,
                rule.target_department,
                rule.priority as i64,
                rule.scope.as_str(),
                if rule.enabled { 1_i64 } else { 0_i64 },
                rule.label,
                rule.updated_at,
                rule.updated_at,
            ],
        )?;
        self.load_assignment_dictionary_rule_for_actor(&conn, actor, &rule.id)?
            .context("saved assignment dictionary rule not found")
    }

    pub fn toggle_assignment_dictionary_rule(
        &self,
        actor: &SessionIdentity,
        rule_id: &str,
        enabled: bool,
    ) -> Result<AssignmentDictionaryRule> {
        if !actor.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let existing = self
            .load_assignment_dictionary_rule_for_actor(&conn, actor, rule_id)?
            .context("assignment dictionary rule not found")?;
        conn.execute(
            "UPDATE assignment_dictionary_rules
             SET enabled = ?1, updated_at = ?2
             WHERE tenant_id = ?3 AND id = ?4",
            params![
                if enabled { 1_i64 } else { 0_i64 },
                now_string(),
                actor.tenant_id,
                existing.id
            ],
        )?;
        self.load_assignment_dictionary_rule_for_actor(&conn, actor, rule_id)?
            .context("assignment dictionary rule not found after update")
    }

    pub fn resolve_case_seed_assignment_rules(
        &self,
        actor: &SessionIdentity,
        template_kind: CaseSeedTemplateKind,
        profile_rules: Vec<CaseSeedAssignmentRule>,
    ) -> Result<Vec<CaseSeedAssignmentRule>> {
        let mut combined = profile_rules
            .into_iter()
            .enumerate()
            .map(|(index, mut rule)| {
                if rule.id.is_none() {
                    rule.id = Some(format!("profile:{}:{}", template_kind.as_str(), index));
                }
                if rule.rule_source.is_none() {
                    rule.rule_source = Some(AssignmentRuleSource::Profile.as_str().to_string());
                }
                rule
            })
            .collect::<Vec<_>>();
        let dictionary_rules = self.list_assignment_dictionary_rules(
            actor,
            Some(TaskKind::SupervisionCaseSeed),
            Some(template_kind.as_str()),
        )?;
        for item in dictionary_rules {
            if !item.enabled {
                continue;
            }
            combined.push(CaseSeedAssignmentRule {
                id: Some(item.id),
                priority: Some(item.priority),
                label: item.label,
                match_field: parse_case_seed_assignment_field(&item.match_field)?,
                match_value: item.match_value,
                assignee: item.assignee,
                target_department: item.target_department,
                rule_source: Some(
                    match item.scope {
                        ImportProfileScope::Private => AssignmentRuleSource::PrivateDictionary,
                        ImportProfileScope::Shared => AssignmentRuleSource::SharedDictionary,
                    }
                    .as_str()
                    .to_string(),
                ),
            });
        }
        Ok(combined)
    }

    pub fn persist_treasury_preview(
        &self,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &TreasuryPreviewResult,
    ) -> Result<PlatformTask> {
        self.record_treasury_task(actor, source_kind, preview)
    }

    pub fn list_task_exceptions(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
    ) -> Result<Vec<TaskExceptionPoolEntry>> {
        self.list_task_exception_pool(identity, task_id)
    }

    pub fn ensure_case_for_exception_target(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
        exception_id: &str,
        source: &str,
    ) -> Result<String> {
        if !identity.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let case = self
            .ensure_case_for_target(&conn, identity, task_id, exception_id, source)?
            .context("exception target not found")?;
        Ok(case.id)
    }

    pub fn save_automation_schedule(
        &self,
        actor: &SessionIdentity,
        input: AutomationScheduleInput,
    ) -> Result<AutomationSchedule> {
        if !(actor.role.can_access_operations() || actor.role.can_manage_admin()) {
            anyhow::bail!("operations role required");
        }
        let conn = self.connect()?;
        if let Some(profile_id) = input.shared_profile_id.as_deref() {
            let profile = self
                .load_import_profile_for_actor(&conn, actor, profile_id)?
                .context("shared import profile not found")?;
            if profile.scope != ImportProfileScope::Shared {
                anyhow::bail!("automation schedules require a shared import profile");
            }
        }
        let schedule = AutomationSchedule {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            schedule_kind: input.schedule_kind,
            target_kind: input.target_kind,
            enabled: input.enabled,
            shared_profile_id: input.shared_profile_id,
            connector_profile_id: input.connector_profile_id,
            source_path: input.source_path,
            notes: input.notes,
            created_at: now_string(),
            updated_at: now_string(),
            last_run_at: None,
        };
        conn.execute(
            "INSERT INTO automation_schedules (
                id, tenant_id, created_by, name, schedule_kind, target_kind, enabled,
                shared_profile_id, connector_profile_id, source_path, notes, created_at, updated_at, last_run_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL)",
            params![
                schedule.id,
                actor.tenant_id,
                actor.user_id,
                schedule.name,
                schedule.schedule_kind.as_str(),
                schedule.target_kind.as_str(),
                if schedule.enabled { 1_i64 } else { 0_i64 },
                schedule.shared_profile_id,
                schedule.connector_profile_id,
                schedule.source_path,
                schedule.notes,
                schedule.created_at,
                schedule.updated_at,
            ],
        )?;
        self.load_automation_schedule(&conn, &actor.tenant_id, &schedule.id)?
            .context("saved automation schedule not found")
    }

    pub fn list_automation_schedules(
        &self,
        actor: &SessionIdentity,
    ) -> Result<Vec<AutomationSchedule>> {
        if !(actor.role.can_access_operations() || actor.role.can_manage_admin()) {
            anyhow::bail!("operations role required");
        }
        let conn = self.connect()?;
        let mut statement = conn.prepare(
            "SELECT id, name, schedule_kind, target_kind, enabled, shared_profile_id,
                    connector_profile_id, source_path, notes, created_at, updated_at, last_run_at
             FROM automation_schedules
             WHERE tenant_id = ?1
             ORDER BY created_at DESC, id DESC",
        )?;
        let rows = statement.query_map(
            params![actor.tenant_id.as_str()],
            row_to_automation_schedule,
        )?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn run_automation_schedule(
        &self,
        actor: &SessionIdentity,
        schedule_id: &str,
    ) -> Result<AutomationExecution> {
        if !(actor.role.can_access_operations() || actor.role.can_manage_admin()) {
            anyhow::bail!("operations role required");
        }
        let conn = self.connect()?;
        let schedule = self
            .load_automation_schedule(&conn, &actor.tenant_id, schedule_id)?
            .context("automation schedule not found")?;
        let trigger_window = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.execute_automation_schedule(actor, &schedule, "manual", &trigger_window)
    }

    pub fn run_due_automation_schedules(
        &self,
        worker_id: &str,
    ) -> Result<Vec<AutomationExecution>> {
        let conn = self.connect()?;
        let now = chrono::Utc::now().naive_utc();
        let now_text = now.format("%Y-%m-%d %H:%M:%S").to_string();
        let tenant_ids = {
            let mut statement = conn.prepare(
                "SELECT tenant_id
                 FROM scheduler_leases
                 WHERE worker_id = ?1 AND lease_expires_at > ?2",
            )?;
            let rows = statement
                .query_map(params![worker_id, now_text.as_str()], |row| {
                    row.get::<_, String>(0)
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let mut executions = Vec::new();
        for tenant_id in tenant_ids {
            let Some(identity) = self.automation_identity_for_tenant(&conn, &tenant_id)? else {
                continue;
            };
            let schedules = self.load_due_automation_schedules(&conn, &tenant_id, now)?;
            for schedule in schedules {
                let trigger_window = automation_trigger_window(now, schedule.schedule_kind);
                if self.has_successful_automation_execution(
                    &conn,
                    &tenant_id,
                    &schedule.id,
                    "scheduled",
                    &trigger_window,
                )? {
                    continue;
                }
                executions.push(self.execute_automation_schedule(
                    &identity,
                    &schedule,
                    "scheduled",
                    &trigger_window,
                )?);
            }
        }
        Ok(executions)
    }

    pub fn list_automation_executions(
        &self,
        actor: &SessionIdentity,
    ) -> Result<Vec<AutomationExecution>> {
        if !(actor.role.can_access_operations() || actor.role.can_manage_admin()) {
            anyhow::bail!("operations role required");
        }
        let conn = self.connect()?;
        let mut statement = conn.prepare(
            "SELECT id, schedule_id, schedule_kind, target_kind, status, trigger_kind, trigger_window,
                    retry_count, last_error, summary_json, started_at, finished_at
             FROM automation_executions
             WHERE tenant_id = ?1
             ORDER BY started_at DESC, id DESC",
        )?;
        let rows = statement.query_map(
            params![actor.tenant_id.as_str()],
            row_to_automation_execution,
        )?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn list_tenant_ids(&self) -> Result<Vec<String>> {
        let conn = self.connect()?;
        let mut statement =
            conn.prepare("SELECT id FROM tenants ORDER BY created_at ASC, id ASC")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn get_automation_execution(
        &self,
        actor: &SessionIdentity,
        execution_id: &str,
    ) -> Result<Option<AutomationExecution>> {
        if !(actor.role.can_access_operations() || actor.role.can_manage_admin()) {
            anyhow::bail!("operations role required");
        }
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, schedule_id, schedule_kind, target_kind, status, trigger_kind, trigger_window,
                    retry_count, last_error, summary_json, started_at, finished_at
             FROM automation_executions
             WHERE tenant_id = ?1 AND id = ?2",
            params![actor.tenant_id.as_str(), execution_id],
            row_to_automation_execution,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn acquire_scheduler_lease(
        &self,
        tenant_id: &str,
        worker_id: &str,
        ttl_seconds: i64,
    ) -> Result<SchedulerLease> {
        let conn = self.connect()?;
        let now = chrono::Utc::now().naive_utc();
        let now_text = now.format("%Y-%m-%d %H:%M:%S").to_string();
        let lease_expires_at = (now + chrono::Duration::seconds(ttl_seconds))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let current = conn
            .query_row(
                "SELECT worker_id, lease_expires_at
                 FROM scheduler_leases
                 WHERE tenant_id = ?1",
                params![tenant_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let existing_expiry = current.as_ref().map(|(_, expires_at)| expires_at.clone());
        let acquired = match current {
            Some((current_worker, ref expires_at))
                if current_worker != worker_id
                    && parse_iso_datetime(expires_at)
                        .map(|value| value > now)
                        .unwrap_or(false) =>
            {
                false
            }
            _ => {
                conn.execute(
                    "INSERT INTO scheduler_leases (tenant_id, worker_id, lease_expires_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(tenant_id) DO UPDATE SET
                        worker_id = excluded.worker_id,
                        lease_expires_at = excluded.lease_expires_at,
                        updated_at = excluded.updated_at",
                    params![tenant_id, worker_id, lease_expires_at.as_str(), now_text.as_str()],
                )?;
                true
            }
        };
        Ok(SchedulerLease {
            tenant_id: tenant_id.to_string(),
            worker_id: worker_id.to_string(),
            acquired,
            lease_expires_at: if acquired {
                Some(lease_expires_at)
            } else {
                existing_expiry
            },
        })
    }

    fn migrate_legacy_case_seed_template_configs(
        &self,
        conn: &Connection,
        actor: &SessionIdentity,
    ) -> Result<()> {
        let mut statement = conn.prepare(
            "SELECT template_kind, mapping_overrides_json, assignment_rules_json, updated_at
             FROM case_seed_template_configs
             WHERE tenant_id = ?1 AND user_id = ?2",
        )?;
        let rows = statement.query_map(
            params![actor.tenant_id.as_str(), actor.user_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )?;
        for row in rows {
            let (template_kind, mapping_raw, rules_raw, updated_at) = row?;
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id
                     FROM import_profiles
                     WHERE tenant_id = ?1
                       AND owner_user_id = ?2
                       AND task_kind = ?3
                       AND COALESCE(template_kind, '') = COALESCE(?4, '')
                       AND scope = 'private'
                       AND is_default = 1",
                    params![
                        actor.tenant_id.as_str(),
                        actor.user_id.as_str(),
                        TaskKind::SupervisionCaseSeed.as_str(),
                        template_kind.as_str()
                    ],
                    |db_row| db_row.get(0),
                )
                .optional()?;
            if exists.is_some() {
                continue;
            }
            let profile_name = format!("{} default", template_kind);
            conn.execute(
                "INSERT INTO import_profiles (
                    id, tenant_id, owner_user_id, name, task_kind, template_kind, scope, is_default,
                    mapping_overrides_json, assignment_rules_json, notes, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'private', 1, ?7, ?8, NULL, ?9, ?10)",
                params![
                    Uuid::new_v4().to_string(),
                    actor.tenant_id.as_str(),
                    actor.user_id.as_str(),
                    profile_name,
                    TaskKind::SupervisionCaseSeed.as_str(),
                    template_kind.as_str(),
                    mapping_raw,
                    rules_raw,
                    updated_at.as_str(),
                    updated_at.as_str(),
                ],
            )?;
        }
        Ok(())
    }

    fn load_default_case_seed_import_profile(
        &self,
        conn: &Connection,
        actor: &SessionIdentity,
        template_kind: CaseSeedTemplateKind,
    ) -> Result<Option<ImportProfile>> {
        conn.query_row(
            "SELECT id, name, task_kind, template_kind, scope, owner_user_id, is_default,
                    mapping_overrides_json, assignment_rules_json, notes, updated_at
             FROM import_profiles
             WHERE tenant_id = ?1
               AND owner_user_id = ?2
               AND task_kind = ?3
               AND template_kind = ?4
               AND scope = 'private'
               AND is_default = 1
             ORDER BY updated_at DESC
             LIMIT 1",
            params![
                actor.tenant_id.as_str(),
                actor.user_id.as_str(),
                TaskKind::SupervisionCaseSeed.as_str(),
                template_kind.as_str()
            ],
            row_to_import_profile,
        )
        .optional()
        .map_err(Into::into)
    }

    fn upsert_default_case_seed_import_profile(
        &self,
        conn: &Connection,
        actor: &SessionIdentity,
        config: &CaseSeedTemplateConfig,
    ) -> Result<ImportProfile> {
        self.clear_default_import_profiles(
            conn,
            &actor.tenant_id,
            &actor.user_id,
            TaskKind::SupervisionCaseSeed,
            Some(config.template_kind.as_str()),
            ImportProfileScope::Private,
        )?;
        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id
                 FROM import_profiles
                 WHERE tenant_id = ?1
                   AND owner_user_id = ?2
                   AND task_kind = ?3
                   AND template_kind = ?4
                   AND scope = 'private'
                 ORDER BY updated_at DESC
                 LIMIT 1",
                params![
                    actor.tenant_id.as_str(),
                    actor.user_id.as_str(),
                    TaskKind::SupervisionCaseSeed.as_str(),
                    config.template_kind.as_str()
                ],
                |row| row.get(0),
            )
            .optional()?;
        let now = now_string();
        let mapping_json = serialize_json(&config.mapping_overrides)?;
        let rules_json = serialize_json(&config.assignment_rules)?;
        let profile_id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let profile_name = format!("{} default", config.template_kind.as_str());
        conn.execute(
            "INSERT INTO import_profiles (
                id, tenant_id, owner_user_id, name, task_kind, template_kind, scope, is_default,
                mapping_overrides_json, assignment_rules_json, notes, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'private', 1, ?7, ?8, NULL, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                is_default = 1,
                mapping_overrides_json = excluded.mapping_overrides_json,
                assignment_rules_json = excluded.assignment_rules_json,
                updated_at = excluded.updated_at",
            params![
                profile_id.as_str(),
                actor.tenant_id.as_str(),
                actor.user_id.as_str(),
                profile_name.as_str(),
                TaskKind::SupervisionCaseSeed.as_str(),
                config.template_kind.as_str(),
                mapping_json,
                rules_json,
                now.as_str(),
                now.as_str(),
            ],
        )?;
        self.load_import_profile_for_actor(conn, actor, &profile_id)?
            .context("default case seed import profile not found")
    }

    fn clear_default_import_profiles(
        &self,
        conn: &Connection,
        tenant_id: &str,
        owner_user_id: &str,
        task_kind: TaskKind,
        template_kind: Option<&str>,
        scope: ImportProfileScope,
    ) -> Result<()> {
        match scope {
            ImportProfileScope::Private => {
                conn.execute(
                    "UPDATE import_profiles
                     SET is_default = 0
                     WHERE tenant_id = ?1
                       AND owner_user_id = ?2
                       AND task_kind = ?3
                       AND COALESCE(template_kind, '') = COALESCE(?4, '')
                       AND scope = 'private'",
                    params![tenant_id, owner_user_id, task_kind.as_str(), template_kind],
                )?;
            }
            ImportProfileScope::Shared => {
                conn.execute(
                    "UPDATE import_profiles
                     SET is_default = 0
                     WHERE tenant_id = ?1
                       AND task_kind = ?2
                       AND COALESCE(template_kind, '') = COALESCE(?3, '')
                       AND scope = 'shared'",
                    params![tenant_id, task_kind.as_str(), template_kind],
                )?;
            }
        }
        Ok(())
    }

    fn load_import_profile_for_actor(
        &self,
        conn: &Connection,
        actor: &SessionIdentity,
        profile_id: &str,
    ) -> Result<Option<ImportProfile>> {
        conn.query_row(
            "SELECT id, name, task_kind, template_kind, scope, owner_user_id, is_default,
                    mapping_overrides_json, assignment_rules_json, notes, updated_at
             FROM import_profiles
             WHERE tenant_id = ?1
               AND id = ?2
               AND (scope = 'shared' OR owner_user_id = ?3)",
            params![actor.tenant_id.as_str(), profile_id, actor.user_id.as_str()],
            row_to_import_profile,
        )
        .optional()
        .map_err(Into::into)
    }

    fn load_assignment_dictionary_rule_for_actor(
        &self,
        conn: &Connection,
        actor: &SessionIdentity,
        rule_id: &str,
    ) -> Result<Option<AssignmentDictionaryRule>> {
        conn.query_row(
            "SELECT id, task_kind, template_kind, match_field, match_value, assignee,
                    target_department, priority, scope, enabled, label, owner_user_id, updated_at
             FROM assignment_dictionary_rules
             WHERE tenant_id = ?1
               AND id = ?2
               AND (scope = 'shared' OR owner_user_id = ?3)",
            params![actor.tenant_id.as_str(), rule_id, actor.user_id.as_str()],
            row_to_assignment_dictionary_rule,
        )
        .optional()
        .map_err(Into::into)
    }

    fn load_automation_schedule(
        &self,
        conn: &Connection,
        tenant_id: &str,
        schedule_id: &str,
    ) -> Result<Option<AutomationSchedule>> {
        conn.query_row(
            "SELECT id, name, schedule_kind, target_kind, enabled, shared_profile_id,
                    connector_profile_id, source_path, notes, created_at, updated_at, last_run_at
             FROM automation_schedules
             WHERE tenant_id = ?1 AND id = ?2",
            params![tenant_id, schedule_id],
            row_to_automation_schedule,
        )
        .optional()
        .map_err(Into::into)
    }

    fn load_due_automation_schedules(
        &self,
        conn: &Connection,
        tenant_id: &str,
        now: chrono::NaiveDateTime,
    ) -> Result<Vec<AutomationSchedule>> {
        let mut statement = conn.prepare(
            "SELECT id, name, schedule_kind, target_kind, enabled, shared_profile_id,
                    connector_profile_id, source_path, notes, created_at, updated_at, last_run_at
             FROM automation_schedules
             WHERE tenant_id = ?1 AND enabled = 1",
        )?;
        let schedules = statement
            .query_map(params![tenant_id], row_to_automation_schedule)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(schedules
            .into_iter()
            .filter(|item| automation_schedule_is_due(item, now))
            .collect())
    }

    fn has_successful_automation_execution(
        &self,
        conn: &Connection,
        tenant_id: &str,
        schedule_id: &str,
        trigger_kind: &str,
        trigger_window: &str,
    ) -> Result<bool> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*)
             FROM automation_executions
             WHERE tenant_id = ?1
               AND schedule_id = ?2
               AND trigger_kind = ?3
               AND trigger_window = ?4
               AND status = 'succeeded'",
            params![tenant_id, schedule_id, trigger_kind, trigger_window],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn automation_identity_for_tenant(
        &self,
        conn: &Connection,
        tenant_id: &str,
    ) -> Result<Option<SessionIdentity>> {
        conn.query_row(
            "SELECT id, organization_id, username, display_name, role
             FROM users
             WHERE tenant_id = ?1 AND active = 1
             ORDER BY CASE role
                 WHEN 'admin' THEN 0
                 WHEN 'supervisor' THEN 1
                 WHEN 'department_reviewer' THEN 2
                 WHEN 'auditor' THEN 3
                 ELSE 9
             END,
             created_at ASC
             LIMIT 1",
            params![tenant_id],
            |row| {
                let role_raw: String = row.get(4)?;
                let role = role_raw.parse::<UserRole>().map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        Type::Text,
                        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
                    )
                })?;
                Ok(SessionIdentity {
                    user_id: row.get(0)?,
                    tenant_id: tenant_id.to_string(),
                    organization_id: row.get(1)?,
                    username: row.get(2)?,
                    display_name: row.get(3)?,
                    role,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    fn execute_automation_schedule(
        &self,
        actor: &SessionIdentity,
        schedule: &AutomationSchedule,
        trigger_kind: &str,
        trigger_window: &str,
    ) -> Result<AutomationExecution> {
        let conn = self.connect()?;
        let started_at = now_string();
        let execution_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO automation_executions (
                id, tenant_id, schedule_id, schedule_kind, target_kind, status, trigger_kind,
                trigger_window, retry_count, last_error, summary_json, started_at, finished_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'running', ?6, ?7, 0, NULL, ?8, ?9, NULL)",
            params![
                execution_id.as_str(),
                actor.tenant_id.as_str(),
                schedule.id.as_str(),
                schedule.schedule_kind.as_str(),
                schedule.target_kind.as_str(),
                trigger_kind,
                trigger_window,
                serialize_json(&AutomationExecutionSummary::default())?,
                started_at.as_str(),
            ],
        )?;
        let execution_result = self.perform_automation_schedule(actor, schedule);
        let finished_at = now_string();
        match execution_result {
            Ok(summary) => {
                conn.execute(
                    "UPDATE automation_executions
                     SET status = 'succeeded', summary_json = ?1, finished_at = ?2
                     WHERE id = ?3",
                    params![
                        serialize_json(&summary)?,
                        finished_at.as_str(),
                        execution_id.as_str()
                    ],
                )?;
                conn.execute(
                    "UPDATE automation_schedules
                     SET last_run_at = ?1, updated_at = ?1
                     WHERE tenant_id = ?2 AND id = ?3",
                    params![
                        finished_at.as_str(),
                        actor.tenant_id.as_str(),
                        schedule.id.as_str()
                    ],
                )?;
            }
            Err(error) => {
                conn.execute(
                    "UPDATE automation_executions
                     SET status = 'failed', last_error = ?1, finished_at = ?2
                     WHERE id = ?3",
                    params![
                        error.to_string(),
                        finished_at.as_str(),
                        execution_id.as_str()
                    ],
                )?;
            }
        }
        conn.query_row(
            "SELECT id, schedule_id, schedule_kind, target_kind, status, trigger_kind, trigger_window,
                    retry_count, last_error, summary_json, started_at, finished_at
             FROM automation_executions
             WHERE id = ?1",
            params![execution_id.as_str()],
            row_to_automation_execution,
        )
        .map_err(Into::into)
    }

    fn perform_automation_schedule(
        &self,
        actor: &SessionIdentity,
        schedule: &AutomationSchedule,
    ) -> Result<AutomationExecutionSummary> {
        match schedule.target_kind {
            AutomationTargetKind::CaseFollowup => self.run_case_followup_automation(actor),
            AutomationTargetKind::CaseSeedImport => {
                self.run_case_seed_import_automation(actor, schedule)
            }
            AutomationTargetKind::ConnectorSync => {
                self.run_connector_sync_automation(actor, schedule)
            }
        }
    }

    fn run_case_followup_automation(
        &self,
        actor: &SessionIdentity,
    ) -> Result<AutomationExecutionSummary> {
        let conn = self.connect()?;
        let before_deliveries: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notification_deliveries WHERE tenant_id = ?1",
            params![actor.tenant_id.as_str()],
            |row| row.get(0),
        )?;
        let before_escalations: i64 = conn.query_row(
            "SELECT COUNT(*) FROM case_escalation_events WHERE tenant_id = ?1",
            params![actor.tenant_id.as_str()],
            |row| row.get(0),
        )?;
        self.sync_case_notifications(&conn, actor)?;
        let after_deliveries: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notification_deliveries WHERE tenant_id = ?1",
            params![actor.tenant_id.as_str()],
            |row| row.get(0),
        )?;
        let after_escalations: i64 = conn.query_row(
            "SELECT COUNT(*) FROM case_escalation_events WHERE tenant_id = ?1",
            params![actor.tenant_id.as_str()],
            |row| row.get(0),
        )?;
        Ok(AutomationExecutionSummary {
            auto_created_cases: 0,
            auto_assignment_hits: 0,
            auto_reminders: (after_deliveries - before_deliveries).max(0) as usize,
            auto_escalations: (after_escalations - before_escalations).max(0) as usize,
            created_tasks: 0,
        })
    }

    fn run_case_seed_import_automation(
        &self,
        actor: &SessionIdentity,
        schedule: &AutomationSchedule,
    ) -> Result<AutomationExecutionSummary> {
        let profile_id = schedule
            .shared_profile_id
            .as_deref()
            .context("case seed import automation requires shared_profile_id")?;
        let source_path = schedule
            .source_path
            .as_deref()
            .context("case seed import automation requires source_path")?;
        let conn = self.connect()?;
        let profile = self
            .load_import_profile_for_actor(&conn, actor, profile_id)?
            .context("shared import profile not found")?;
        if profile.scope != ImportProfileScope::Shared {
            anyhow::bail!("case seed import automation requires a shared profile");
        }
        let template_kind = profile
            .template_kind
            .as_deref()
            .unwrap_or("investment_review")
            .parse::<CaseSeedTemplateKind>()
            .map_err(anyhow::Error::msg)?;
        let assignment_rules = self.resolve_case_seed_assignment_rules(
            actor,
            template_kind,
            profile.assignment_rules.clone(),
        )?;
        let options = CaseSeedPreviewOptions {
            template_kind,
            mapping_overrides: profile.mapping_overrides.clone(),
            assignment_rules,
        };
        let bytes = std::fs::read(source_path)
            .with_context(|| format!("failed to read automation source {}", source_path))?;
        let preview = if source_path.to_ascii_lowercase().ends_with(".xls")
            || source_path.to_ascii_lowercase().ends_with(".xlsx")
        {
            preview_case_seed_excel_bytes_with_options(
                source_path,
                &bytes,
                Some(&schedule.name),
                options,
            )?
        } else {
            preview_case_seed_csv_bytes_with_options(
                source_path,
                &bytes,
                Some(&schedule.name),
                options,
            )?
        };
        let cases = self.import_case_seed_records(actor, ImportSourceKind::File, &preview)?;
        Ok(AutomationExecutionSummary {
            auto_created_cases: cases.len(),
            auto_assignment_hits: preview.assignment_hits,
            auto_reminders: 0,
            auto_escalations: 0,
            created_tasks: 0,
        })
    }

    fn run_connector_sync_automation(
        &self,
        actor: &SessionIdentity,
        schedule: &AutomationSchedule,
    ) -> Result<AutomationExecutionSummary> {
        let profile_id = schedule
            .connector_profile_id
            .as_deref()
            .context("connector sync automation requires connector_profile_id")?;
        let (_, task) = self.commit_connector_profile(actor, profile_id)?;
        Ok(AutomationExecutionSummary {
            auto_created_cases: 0,
            auto_assignment_hits: 0,
            auto_reminders: 0,
            auto_escalations: 0,
            created_tasks: usize::from(!task.id.is_empty()),
        })
    }

    pub fn create_connector_profile(
        &self,
        actor: &SessionIdentity,
        input: ConnectorProfileInput,
    ) -> Result<ConnectorProfile> {
        if !actor.role.can_manage_admin() {
            anyhow::bail!("admin role required");
        }
        let now = now_string();
        let profile = ConnectorProfile {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            connector_type: input.connector_type,
            task_kind: input.task_kind,
            dataset_kind: input.dataset_kind,
            base_url: input.base_url,
            auth_mode: input.auth_mode,
            credential_state: "missing_env".to_string(),
            enabled: input.enabled,
            created_at: now.clone(),
            updated_at: now.clone(),
            last_preview_at: None,
            last_commit_at: None,
        };
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start connector profile transaction")?;
        tx.execute(
            "INSERT INTO connector_profiles (
                id, tenant_id, organization_id, name, connector_type, task_kind, dataset_kind,
                base_url, auth_mode, credential_json, sample_payload_json, enabled, created_by,
                created_at, updated_at, last_preview_at, last_commit_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, NULL)",
            params![
                profile.id,
                actor.tenant_id,
                actor.organization_id,
                profile.name,
                profile.connector_type.as_str(),
                profile.task_kind.as_str(),
                profile.dataset_kind,
                profile.base_url,
                profile.auth_mode,
                "",
                input.sample_payload_json,
                if profile.enabled { 1 } else { 0 },
                actor.user_id,
                profile.created_at,
                profile.updated_at,
            ],
        )
        .context("failed to insert connector profile")?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(actor.organization_id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "admin.connector_profile.create".to_string(),
                target_type: "connector_profile".to_string(),
                target_id: profile.id.clone(),
                outcome: "success".to_string(),
                detail: format!(
                    "Created connector profile name={} task_kind={} auth_mode={}",
                    profile.name,
                    profile.task_kind.as_str(),
                    profile.auth_mode
                ),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit connector profile")?;
        Ok(profile)
    }

    pub fn list_connector_profiles(
        &self,
        identity: &SessionIdentity,
    ) -> Result<Vec<ConnectorProfile>> {
        if !identity.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let conn = self.connect()?;
        let mut statement = conn.prepare(
            "SELECT id, name, connector_type, task_kind, dataset_kind, base_url, auth_mode,
                    enabled, created_at, updated_at, last_preview_at, last_commit_at
             FROM connector_profiles
             WHERE tenant_id = ?1
             ORDER BY updated_at DESC",
        )?;
        let rows = statement
            .query_map(params![identity.tenant_id.as_str()], |row| {
                Ok(ConnectorProfile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    connector_type: ConnectorType::from_str(&row.get::<_, String>(2)?)
                        .map_err(conversion_error)?,
                    task_kind: TaskKind::from_str(&row.get::<_, String>(3)?)
                        .map_err(conversion_error)?,
                    dataset_kind: row.get(4)?,
                    base_url: row.get(5)?,
                    auth_mode: row.get(6)?,
                    credential_state: connector_credential_state(
                        &row.get::<_, String>(0)?,
                        &row.get::<_, String>(6)?,
                    ),
                    enabled: row.get::<_, i64>(7)? != 0,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                    last_preview_at: row.get(10)?,
                    last_commit_at: row.get(11)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn list_connector_sync_jobs(
        &self,
        identity: &SessionIdentity,
    ) -> Result<Vec<ConnectorSyncJob>> {
        if !identity.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let conn = self.connect()?;
        let mut statement = conn.prepare(
            "SELECT id, profile_id, task_kind, dataset_kind, status, mode, source_kind,
                    preview_job_id, committed_task_id, created_at, updated_at
             FROM connector_sync_jobs
             WHERE tenant_id = ?1
             ORDER BY updated_at DESC",
        )?;
        let rows = statement
            .query_map(params![identity.tenant_id.as_str()], |row| {
                Ok(ConnectorSyncJob {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    task_kind: TaskKind::from_str(&row.get::<_, String>(2)?)
                        .map_err(conversion_error)?,
                    dataset_kind: row.get(3)?,
                    status: row.get(4)?,
                    mode: row.get(5)?,
                    source_kind: ImportSourceKind::from_str(&row.get::<_, String>(6)?)
                        .map_err(conversion_error)?,
                    preview_job_id: row.get(7)?,
                    committed_task_id: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn list_writeback_events(&self, identity: &SessionIdentity) -> Result<Vec<WritebackEvent>> {
        if !identity.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let conn = self.connect()?;
        let mut statement = conn.prepare(
            "SELECT id, tenant_id, task_id, task_kind, target_type, target_id, status,
                    conclusion, reminder_flag, idempotency_key, created_at
             FROM connector_writeback_events
             WHERE tenant_id = ?1
             ORDER BY created_at DESC",
        )?;
        let rows = statement
            .query_map(params![identity.tenant_id.as_str()], |row| {
                Ok(WritebackEvent {
                    id: row.get(0)?,
                    tenant_id: row.get(1)?,
                    task_id: row.get(2)?,
                    task_kind: TaskKind::from_str(&row.get::<_, String>(3)?)
                        .map_err(conversion_error)?,
                    target_type: row.get(4)?,
                    target_id: row.get(5)?,
                    status: row.get(6)?,
                    conclusion: row.get(7)?,
                    reminder_flag: row.get::<_, i64>(8)? != 0,
                    idempotency_key: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn preview_connector_profile(
        &self,
        actor: &SessionIdentity,
        profile_id: &str,
    ) -> Result<(ConnectorSyncJob, ImportJobRecord)> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let (profile, sample_payload_json) =
            self.load_connector_profile_with_payload(actor, profile_id)?;
        let preview_job = match profile.task_kind {
            TaskKind::ProcurementProject => {
                let payload: crate::platform::ProcurementBatchPayload = serde_json::from_str(
                    sample_payload_json
                        .as_deref()
                        .context("connector profile sample payload is missing")?,
                )
                .context("failed to parse procurement connector sample payload")?;
                let preview = crate::platform::preview_procurement_batch(payload);
                let job_id = self.save_procurement_preview_job(
                    actor,
                    ImportSourceKind::Connector,
                    &preview,
                )?;
                ImportJobRecord {
                    id: job_id.clone(),
                    task_kind: TaskKind::ProcurementProject,
                    source_kind: ImportSourceKind::Connector,
                    status: super::ImportJobStatus::PreviewReady,
                    title: preview.title.clone(),
                    primary_subject: preview.primary_subject.clone(),
                    preview: super::ImportJobPreview {
                        id: Some(job_id.clone()),
                        task_kind: TaskKind::ProcurementProject,
                        source_kind: ImportSourceKind::Connector,
                        title: preview.title.clone(),
                        primary_subject: preview.primary_subject.clone(),
                        quality_report: preview.quality_report.clone(),
                        detail: TaskDetailPayload::ProcurementProject(
                            self.persist_preview_procurement_detail(&preview),
                        ),
                        ready_to_commit: true,
                    },
                    created_at: now_string(),
                    committed_task_id: None,
                }
            }
            TaskKind::BudgetSummary => {
                let payload: crate::platform::BudgetBatchPayload = serde_json::from_str(
                    sample_payload_json
                        .as_deref()
                        .context("connector profile sample payload is missing")?,
                )
                .context("failed to parse budget connector sample payload")?;
                let preview = crate::platform::preview_budget_batch(payload);
                let job_id =
                    self.save_budget_preview_job(actor, ImportSourceKind::Connector, &preview)?;
                ImportJobRecord {
                    id: job_id.clone(),
                    task_kind: TaskKind::BudgetSummary,
                    source_kind: ImportSourceKind::Connector,
                    status: super::ImportJobStatus::PreviewReady,
                    title: preview.title.clone(),
                    primary_subject: preview.primary_subject.clone(),
                    preview: super::ImportJobPreview {
                        id: Some(job_id.clone()),
                        task_kind: TaskKind::BudgetSummary,
                        source_kind: ImportSourceKind::Connector,
                        title: preview.title.clone(),
                        primary_subject: preview.primary_subject.clone(),
                        quality_report: preview.quality_report.clone(),
                        detail: TaskDetailPayload::BudgetSummary(build_budget_task_detail(
                            &preview,
                            Vec::new(),
                            BudgetLinkageSummary::default(),
                        )),
                        ready_to_commit: true,
                    },
                    created_at: now_string(),
                    committed_task_id: None,
                }
            }
            TaskKind::TreasuryPayment => {
                let payload: crate::platform::TreasuryBatchPayload = serde_json::from_str(
                    sample_payload_json
                        .as_deref()
                        .context("connector profile sample payload is missing")?,
                )
                .context("failed to parse treasury connector sample payload")?;
                let preview = crate::platform::preview_treasury_batch(payload);
                let job_id =
                    self.save_treasury_preview_job(actor, ImportSourceKind::Connector, &preview)?;
                ImportJobRecord {
                    id: job_id.clone(),
                    task_kind: TaskKind::TreasuryPayment,
                    source_kind: ImportSourceKind::Connector,
                    status: super::ImportJobStatus::PreviewReady,
                    title: preview.title.clone(),
                    primary_subject: preview.primary_subject.clone(),
                    preview: super::ImportJobPreview {
                        id: Some(job_id.clone()),
                        task_kind: TaskKind::TreasuryPayment,
                        source_kind: ImportSourceKind::Connector,
                        title: preview.title.clone(),
                        primary_subject: preview.primary_subject.clone(),
                        quality_report: preview.quality_report.clone(),
                        detail: TaskDetailPayload::TreasuryPayment(build_treasury_task_detail(
                            &preview,
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            ContractLinkageSummary::default(),
                            PaymentLinkageSummary::default(),
                            LedgerLinkageSummary::default(),
                        )),
                        ready_to_commit: true,
                    },
                    created_at: now_string(),
                    committed_task_id: None,
                }
            }
            TaskKind::VoucherLedger => {
                let payload: crate::platform::VoucherBatchPayload = serde_json::from_str(
                    sample_payload_json
                        .as_deref()
                        .context("connector profile sample payload is missing")?,
                )
                .context("failed to parse voucher connector sample payload")?;
                let preview = crate::platform::preview_voucher_batch(payload);
                let job_id =
                    self.save_voucher_preview_job(actor, ImportSourceKind::Connector, &preview)?;
                ImportJobRecord {
                    id: job_id.clone(),
                    task_kind: TaskKind::VoucherLedger,
                    source_kind: ImportSourceKind::Connector,
                    status: super::ImportJobStatus::PreviewReady,
                    title: preview.title.clone(),
                    primary_subject: preview.primary_subject.clone(),
                    preview: super::ImportJobPreview {
                        id: Some(job_id.clone()),
                        task_kind: TaskKind::VoucherLedger,
                        source_kind: ImportSourceKind::Connector,
                        title: preview.title.clone(),
                        primary_subject: preview.primary_subject.clone(),
                        quality_report: preview.quality_report.clone(),
                        detail: TaskDetailPayload::VoucherLedger(build_voucher_task_detail(
                            &preview,
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            Vec::new(),
                            PaymentLinkageSummary::default(),
                            LedgerLinkageSummary::default(),
                        )),
                        ready_to_commit: true,
                    },
                    created_at: now_string(),
                    committed_task_id: None,
                }
            }
            TaskKind::SupervisionCaseSeed => {
                anyhow::bail!("supervision case seed does not support connectors")
            }
        };

        let sync_job = self.insert_connector_sync_job(
            actor,
            &profile,
            "preview",
            "preview_ready",
            Some(preview_job.id.clone()),
            None,
        )?;
        self.touch_connector_profile(profile_id, actor, true, false)?;
        Ok((sync_job, preview_job))
    }

    pub fn commit_connector_profile(
        &self,
        actor: &SessionIdentity,
        profile_id: &str,
    ) -> Result<(ConnectorSyncJob, PlatformTask)> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let conn = self.connect()?;
        let latest_preview: Option<(String, String, Option<String>)> = conn
            .query_row(
                "SELECT id, task_kind, preview_job_id
                 FROM connector_sync_jobs
                 WHERE tenant_id = ?1 AND profile_id = ?2 AND mode = 'preview'
                 ORDER BY updated_at DESC
                 LIMIT 1",
                params![actor.tenant_id.as_str(), profile_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .context("failed to query latest connector preview job")?;
        let (preview_job_id, task_kind) = match latest_preview {
            Some((_sync_job_id, task_kind, Some(preview_job_id))) => (
                preview_job_id,
                TaskKind::from_str(&task_kind).map_err(anyhow::Error::msg)?,
            ),
            _ => {
                let (_, preview_job) = self.preview_connector_profile(actor, profile_id)?;
                (preview_job.id.clone(), preview_job.task_kind)
            }
        };
        let task = self.commit_import_job(actor, &preview_job_id)?;
        let profile = self.load_connector_profile(actor, profile_id)?;
        let sync_job = self.insert_connector_sync_job(
            actor,
            &profile,
            "commit",
            "committed",
            Some(preview_job_id.to_string()),
            Some(task.id.clone()),
        )?;
        let _ = task_kind;
        self.touch_connector_profile(profile_id, actor, false, true)?;
        Ok((sync_job, task))
    }

    pub fn record_writeback_event(
        &self,
        actor: &SessionIdentity,
        input: WritebackInput,
    ) -> Result<WritebackEvent> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start writeback transaction")?;
        if let Some(existing) = tx
            .query_row(
                "SELECT id, tenant_id, task_id, task_kind, target_type, target_id, status,
                        conclusion, reminder_flag, idempotency_key, created_at
                 FROM connector_writeback_events
                 WHERE tenant_id = ?1 AND idempotency_key = ?2",
                params![actor.tenant_id.as_str(), input.idempotency_key.as_str()],
                |row| {
                    Ok(WritebackEvent {
                        id: row.get(0)?,
                        tenant_id: row.get(1)?,
                        task_id: row.get(2)?,
                        task_kind: TaskKind::from_str(&row.get::<_, String>(3)?)
                            .map_err(conversion_error)?,
                        target_type: row.get(4)?,
                        target_id: row.get(5)?,
                        status: row.get(6)?,
                        conclusion: row.get(7)?,
                        reminder_flag: row.get::<_, i64>(8)? != 0,
                        idempotency_key: row.get(9)?,
                        created_at: row.get(10)?,
                    })
                },
            )
            .optional()
            .context("failed to query existing writeback event")?
        {
            tx.commit().ok();
            return Ok(existing);
        }

        let event = WritebackEvent {
            id: Uuid::new_v4().to_string(),
            tenant_id: actor.tenant_id.clone(),
            task_id: input.task_id.clone(),
            task_kind: input.task_kind,
            target_type: input.target_type.clone(),
            target_id: input.target_id.clone(),
            status: input.status.clone(),
            conclusion: input.conclusion.clone(),
            reminder_flag: input.reminder_flag,
            idempotency_key: input.idempotency_key.clone(),
            created_at: now_string(),
        };
        tx.execute(
            "INSERT INTO connector_writeback_events (
                id, tenant_id, task_id, task_kind, target_type, target_id, status,
                conclusion, reminder_flag, idempotency_key, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                event.id,
                event.tenant_id,
                event.task_id,
                event.task_kind.as_str(),
                event.target_type,
                event.target_id,
                event.status,
                event.conclusion,
                if event.reminder_flag { 1 } else { 0 },
                event.idempotency_key,
                event.created_at,
            ],
        )
        .context("failed to insert writeback event")?;

        match input.target_type.as_str() {
            "contract" => {
                tx.execute(
                    "UPDATE procurement_contracts
                     SET writeback_status = ?3, writeback_ref = ?4
                     WHERE tenant_id = ?1 AND id = ?2",
                    params![
                        actor.tenant_id.as_str(),
                        input.target_id.as_str(),
                        input.status,
                        event.id
                    ],
                )
                .ok();
            }
            "payment" => {
                tx.execute(
                    "UPDATE treasury_payment_vouchers
                     SET writeback_status = ?3, writeback_ref = ?4
                     WHERE tenant_id = ?1 AND id = ?2",
                    params![
                        actor.tenant_id.as_str(),
                        input.target_id.as_str(),
                        input.status,
                        event.id
                    ],
                )
                .ok();
            }
            "ledger" => {
                tx.execute(
                    "UPDATE ledger_entries
                     SET writeback_status = ?3, writeback_ref = ?4
                     WHERE tenant_id = ?1 AND id = ?2",
                    params![
                        actor.tenant_id.as_str(),
                        input.target_id.as_str(),
                        input.status,
                        event.id
                    ],
                )
                .ok();
            }
            _ => {}
        }

        tx.commit().context("failed to commit writeback event")?;
        Ok(event)
    }

    fn load_connector_profile(
        &self,
        identity: &SessionIdentity,
        profile_id: &str,
    ) -> Result<ConnectorProfile> {
        Ok(self
            .load_connector_profile_with_payload(identity, profile_id)?
            .0)
    }

    fn load_connector_profile_with_payload(
        &self,
        identity: &SessionIdentity,
        profile_id: &str,
    ) -> Result<(ConnectorProfile, Option<String>)> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, name, connector_type, task_kind, dataset_kind, base_url, auth_mode,
                    enabled, created_at, updated_at, last_preview_at, last_commit_at,
                    sample_payload_json
             FROM connector_profiles
             WHERE tenant_id = ?1 AND id = ?2",
            params![identity.tenant_id.as_str(), profile_id],
            |row| {
                Ok((
                    ConnectorProfile {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        connector_type: ConnectorType::from_str(&row.get::<_, String>(2)?)
                            .map_err(conversion_error)?,
                        task_kind: TaskKind::from_str(&row.get::<_, String>(3)?)
                            .map_err(conversion_error)?,
                        dataset_kind: row.get(4)?,
                        base_url: row.get(5)?,
                        auth_mode: row.get(6)?,
                        credential_state: connector_credential_state(
                            &row.get::<_, String>(0)?,
                            &row.get::<_, String>(6)?,
                        ),
                        enabled: row.get::<_, i64>(7)? != 0,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                        last_preview_at: row.get(10)?,
                        last_commit_at: row.get(11)?,
                    },
                    row.get(12)?,
                ))
            },
        )
        .optional()
        .context("failed to query connector profile")?
        .context("connector profile not found")
    }

    pub(crate) fn clear_deprecated_connector_secrets(&self) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "UPDATE connector_profiles SET credential_json = '' WHERE credential_json <> ''",
            [],
        )
        .context("failed to clear deprecated connector secrets")?;
        Ok(())
    }

    fn insert_connector_sync_job(
        &self,
        actor: &SessionIdentity,
        profile: &ConnectorProfile,
        mode: &str,
        status: &str,
        preview_job_id: Option<String>,
        committed_task_id: Option<String>,
    ) -> Result<ConnectorSyncJob> {
        let job = ConnectorSyncJob {
            id: Uuid::new_v4().to_string(),
            profile_id: profile.id.clone(),
            task_kind: profile.task_kind,
            dataset_kind: profile.dataset_kind.clone(),
            status: status.to_string(),
            mode: mode.to_string(),
            source_kind: ImportSourceKind::Connector,
            preview_job_id,
            committed_task_id,
            created_at: now_string(),
            updated_at: now_string(),
        };
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO connector_sync_jobs (
                id, tenant_id, profile_id, task_kind, dataset_kind, status, mode, source_kind,
                preview_job_id, committed_task_id, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                job.id,
                actor.tenant_id,
                job.profile_id,
                job.task_kind.as_str(),
                job.dataset_kind,
                job.status,
                job.mode,
                job.source_kind.as_str(),
                job.preview_job_id,
                job.committed_task_id,
                job.created_at,
                job.updated_at,
            ],
        )
        .context("failed to insert connector sync job")?;
        Ok(job)
    }

    fn touch_connector_profile(
        &self,
        profile_id: &str,
        actor: &SessionIdentity,
        previewed: bool,
        committed: bool,
    ) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "UPDATE connector_profiles
             SET updated_at = ?3,
                 last_preview_at = CASE WHEN ?4 = 1 THEN ?3 ELSE last_preview_at END,
                 last_commit_at = CASE WHEN ?5 = 1 THEN ?3 ELSE last_commit_at END
             WHERE tenant_id = ?1 AND id = ?2",
            params![
                actor.tenant_id.as_str(),
                profile_id,
                now_string(),
                if previewed { 1 } else { 0 },
                if committed { 1 } else { 0 },
            ],
        )
        .context("failed to update connector profile timestamps")?;
        Ok(())
    }

    fn persist_preview_procurement_detail(
        &self,
        preview: &ProcurementPreviewResult,
    ) -> ProcurementTaskDetail {
        ProcurementTaskDetail {
            projects: preview
                .records
                .iter()
                .map(|record| ProcurementProjectRecord {
                    id: Uuid::new_v4().to_string(),
                    project_name: record.project_name.clone(),
                    purchaser_name: record.purchaser_name.clone(),
                    announcement_type: record.announcement_type.clone(),
                    procurement_stage: record.procurement_stage,
                    project_code: record.project_code.clone(),
                    procurement_method: record.procurement_method.clone(),
                    published_at: record.published_at.clone(),
                    region: record.region.clone(),
                    normalized_region: record.normalized_region.clone(),
                    budget_amount: record.budget_amount.clone(),
                    award_amount: record.award_amount.clone(),
                    budget_amount_unit: record.budget_amount_unit,
                    award_amount_unit: record.award_amount_unit,
                    normalized_budget_amount_yuan: record.normalized_budget_amount_yuan.clone(),
                    normalized_award_amount_yuan: record.normalized_award_amount_yuan.clone(),
                    framework_agreement_flag: record.framework_agreement_flag,
                    amount_semantic_type: record.amount_semantic_type,
                    quote_amount: record.quote_amount.clone(),
                    quote_amount_unit: record.quote_amount_unit,
                    discount_rate: record.discount_rate.clone(),
                    unit_price: record.unit_price.clone(),
                    total_award_amount: record.total_award_amount.clone(),
                    framework_limit_amount: record.framework_limit_amount.clone(),
                    framework_limit_unit: record.framework_limit_unit,
                    framework_limit_condition: record.framework_limit_condition.clone(),
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
                    acceptance_management_flag: record.acceptance_management_flag,
                    acceptance_plan: record.acceptance_plan.clone(),
                    acceptance_opinion: record.acceptance_opinion.clone(),
                    acceptance_archive_status: record.acceptance_archive_status.clone(),
                    acceptance_archive_locator: record.acceptance_archive_locator.clone(),
                    acceptance_issue_summary: record.acceptance_issue_summary.clone(),
                    service_period: record.service_period.clone(),
                    maintenance_period: record.maintenance_period.clone(),
                    warranty_period: record.warranty_period.clone(),
                    acceptance_standard: record.acceptance_standard.clone(),
                    acceptance_result: record.acceptance_result.clone(),
                    acceptance_result_locator: record.acceptance_result_locator.clone(),
                    service_period_source: record.service_period_source.clone(),
                    warranty_maintenance_source: record.warranty_maintenance_source.clone(),
                    settlement_basis: record.settlement_basis.clone(),
                    payment_trigger: record.payment_trigger.clone(),
                    payment_deadline: record.payment_deadline.clone(),
                    payment_condition_source: record.payment_condition_source.clone(),
                    contract_performance_period: record.contract_performance_period.clone(),
                    government_purchase_service_flag: record.government_purchase_service_flag,
                    joint_bid_allowed_flag: record.joint_bid_allowed_flag,
                    sme_policy_requirement: record.sme_policy_requirement.clone(),
                    credit_financing_policy_flag: record.credit_financing_policy_flag,
                    procurement_policy_note: record.procurement_policy_note.clone(),
                    procurement_exception_type: record.procurement_exception_type.clone(),
                    complaint_decision_no: record.complaint_decision_no.clone(),
                    complaint_issue_summary: record.complaint_issue_summary.clone(),
                    complaint_handling_result: record.complaint_handling_result.clone(),
                    allegation_type: record.allegation_type.clone(),
                    allegation_outcome: record.allegation_outcome.clone(),
                    confirmed_fact_flag: record.confirmed_fact_flag,
                    remedy_action: record.remedy_action.clone(),
                    remedy_required_flag: record.remedy_required_flag,
                    allegation_evidence_weight: record.allegation_evidence_weight,
                    allegation_weight_reason: record.allegation_weight_reason.clone(),
                    false_material_flag: record.false_material_flag,
                    award_invalidated_flag: record.award_invalidated_flag,
                    rebid_required_flag: record.rebid_required_flag,
                    correction_notice_flag: record.correction_notice_flag,
                    supervision_penalty_subject: record.supervision_penalty_subject.clone(),
                    affected_package_no: record.affected_package_no.clone(),
                    penalty_decision_no: record.penalty_decision_no.clone(),
                    penalty_basis: record.penalty_basis.clone(),
                    penalty_basis_article: record.penalty_basis_article.clone(),
                    penalty_period: record.penalty_period.clone(),
                    market_entry_restriction_scope: record.market_entry_restriction_scope.clone(),
                    penalty_subject_type: record.penalty_subject_type.clone(),
                    penalty_subject_name: record.penalty_subject_name.clone(),
                    credit_repair_status: record.credit_repair_status.clone(),
                    credit_repair_source_url: record.credit_repair_source_url.clone(),
                    re_participation_review_flag: record.re_participation_review_flag,
                    exception_evidence_category: record.exception_evidence_category.clone(),
                    exception_evidence_weight: record.exception_evidence_weight,
                    exception_weight_reason: record.exception_weight_reason.clone(),
                    source_region_scope: record.source_region_scope.clone(),
                    source_province: record.source_province.clone(),
                    source_city: record.source_city.clone(),
                    source_region_code: record.source_region_code.clone(),
                    publisher_level: record.publisher_level.clone(),
                    central_unit_flag: record.central_unit_flag,
                    purchaser_region_code: record.purchaser_region_code.clone(),
                    procurement_channel: record.procurement_channel.clone(),
                    platform_order_no: record.platform_order_no.clone(),
                    item_name: record.item_name.clone(),
                    item_quantity: record.item_quantity.clone(),
                    item_unit: record.item_unit.clone(),
                    unit_price_amount: record.unit_price_amount.clone(),
                    unit_price_unit: record.unit_price_unit,
                    order_total_amount: record.order_total_amount.clone(),
                    order_total_unit: record.order_total_unit,
                    procurement_intention_flag: record.procurement_intention_flag,
                    intention_budget_amount: record.intention_budget_amount.clone(),
                    intention_expected_procurement_at: record
                        .intention_expected_procurement_at
                        .clone(),
                    intention_followup_status: record.intention_followup_status.clone(),
                    batch_month: record.batch_month.clone(),
                    batch_category: record.batch_category.clone(),
                    product_category: record.product_category.clone(),
                    manufacturer: record.manufacturer.clone(),
                    model: record.model.clone(),
                    batch_lot_no: record.batch_lot_no.clone(),
                    batch_total_amount: record.batch_total_amount.clone(),
                    lot_award_amount: record.lot_award_amount.clone(),
                    supplier_name: record.supplier_name.clone(),
                    budget_unit_id: None,
                    budget_project_id: record.budget_project_id.clone(),
                    supplier_id: None,
                    funding_source_id: None,
                    account_classification_id: None,
                    indicator_document_no: record.indicator_document_no.clone(),
                    project_catalog_id: record.project_catalog_id.clone(),
                    notice_url: record.notice_url.clone(),
                    source_evidence: record.source_evidence.clone(),
                    source_row: Some(record.source_row),
                    linkage_evidence: None,
                })
                .collect(),
            contracts: Vec::new(),
            budget_units: Vec::new(),
            budget_projects: Vec::new(),
            suppliers: Vec::new(),
            funding_sources: Vec::new(),
            account_classifications: Vec::new(),
            source_documents: Vec::new(),
            quality_report: preview.quality_report.clone(),
            applicable_rule_sets: preview.applicable_rule_sets.clone(),
        }
    }

    fn load_tenant_chain_pool(
        &self,
        conn: &Connection,
        tenant_id: &str,
    ) -> Result<TenantChainPool> {
        let mut statement = conn.prepare(
            "SELECT detail_json
             FROM platform_tasks
             WHERE tenant_id = ?1 AND task_kind IN (?2, ?3)",
        )?;
        let mut pool = TenantChainPool::default();
        let rows = statement.query_map(
            params![
                tenant_id,
                TaskKind::TreasuryPayment.as_str(),
                TaskKind::VoucherLedger.as_str()
            ],
            |row| row.get::<_, String>(0),
        )?;

        for row in rows {
            let detail_json = row?;
            match serde_json::from_str::<TaskDetailPayload>(&detail_json)
                .context("failed to parse chain detail payload")?
            {
                TaskDetailPayload::TreasuryPayment(detail) => {
                    pool.vouchers.extend(detail.vouchers);
                }
                TaskDetailPayload::VoucherLedger(detail) => {
                    pool.entries.extend(detail.entries);
                }
                _ => {}
            }
        }

        Ok(pool)
    }

    fn enrich_procurement_chain_summaries(
        &self,
        detail: &ProcurementTaskDetail,
        pool: &TenantChainPool,
    ) -> (PaymentLinkageSummary, LedgerLinkageSummary) {
        let keys = procurement_match_keys(detail);
        let matched_vouchers = dedupe_vouchers(
            pool.vouchers
                .iter()
                .filter(|voucher| {
                    record_matches_procurement_keys(
                        voucher.budget_project_id.as_deref(),
                        voucher.contract_no.as_deref(),
                        voucher.indicator_document_no.as_deref(),
                        voucher.project_catalog_id.as_deref(),
                        &keys,
                    )
                })
                .cloned()
                .collect(),
        );
        let matched_entries = dedupe_entries(
            pool.entries
                .iter()
                .filter(|entry| {
                    record_matches_procurement_keys(
                        entry.budget_project_id.as_deref(),
                        entry.contract_no.as_deref(),
                        entry.indicator_document_no.as_deref(),
                        entry.project_catalog_id.as_deref(),
                        &keys,
                    )
                })
                .cloned()
                .collect(),
        );

        let paid_without_ledger = matched_vouchers
            .iter()
            .filter(|voucher| {
                !matched_entries
                    .iter()
                    .any(|entry| voucher_matches_entry(voucher, entry))
            })
            .count();
        let ledger_without_payment = matched_entries
            .iter()
            .filter(|entry| {
                !matched_vouchers
                    .iter()
                    .any(|voucher| voucher_matches_entry(voucher, entry))
            })
            .count();
        let timing_exceptions = matched_vouchers
            .iter()
            .filter(|voucher| {
                matched_entries
                    .iter()
                    .filter(|entry| voucher_matches_entry(voucher, entry))
                    .any(|entry| is_timing_exception(voucher, entry))
            })
            .count();
        let payment_total: Decimal = matched_vouchers
            .iter()
            .map(|voucher| parse_decimal_value(&voucher.amount))
            .sum();
        let ledger_total = sum_ledger_entries(&matched_entries);

        (
            PaymentLinkageSummary {
                linked_payments: matched_vouchers.len(),
                unmatched_payments: matched_vouchers
                    .iter()
                    .filter(|voucher| voucher.contract_no.is_none())
                    .count(),
                paid_without_ledger,
                ledger_without_payment,
                amount_gap: decimal_to_string(payment_total - ledger_total),
            },
            LedgerLinkageSummary {
                linked_entries: matched_entries.len(),
                timing_exceptions,
                manual_review_required: paid_without_ledger
                    + ledger_without_payment
                    + timing_exceptions,
                ..LedgerLinkageSummary::default()
            },
        )
    }

    fn enrich_treasury_detail(
        &self,
        detail: &mut TreasuryPaymentTaskDetail,
        pool: &TenantChainPool,
    ) {
        let matched_entries = dedupe_entries(
            pool.entries
                .iter()
                .filter(|entry| {
                    detail
                        .vouchers
                        .iter()
                        .any(|voucher| voucher_matches_entry(voucher, entry))
                })
                .cloned()
                .collect(),
        );

        for voucher in &mut detail.vouchers {
            let matched = matched_entries
                .iter()
                .any(|entry| voucher_matches_entry(voucher, entry));
            voucher.reconciliation_status = Some(if matched {
                "matched".to_string()
            } else {
                "pending".to_string()
            });
        }

        let paid_without_ledger = detail
            .vouchers
            .iter()
            .filter(|voucher| {
                !matched_entries
                    .iter()
                    .any(|entry| voucher_matches_entry(voucher, entry))
            })
            .count();
        let timing_exceptions = detail
            .vouchers
            .iter()
            .filter(|voucher| {
                matched_entries
                    .iter()
                    .filter(|entry| voucher_matches_entry(voucher, entry))
                    .any(|entry| is_timing_exception(voucher, entry))
            })
            .count();
        let payment_total: Decimal = detail
            .vouchers
            .iter()
            .map(|voucher| parse_decimal_value(&voucher.amount))
            .sum();
        let ledger_total = sum_ledger_entries(&matched_entries);

        detail.payment_linkage_summary = PaymentLinkageSummary {
            linked_payments: detail.vouchers.len(),
            unmatched_payments: detail
                .vouchers
                .iter()
                .filter(|voucher| voucher.contract_no.is_none())
                .count(),
            paid_without_ledger,
            ledger_without_payment: 0,
            amount_gap: decimal_to_string(payment_total - ledger_total),
        };
        detail.ledger_linkage_summary = LedgerLinkageSummary {
            linked_entries: matched_entries.len(),
            timing_exceptions,
            manual_review_required: paid_without_ledger + timing_exceptions,
            ..LedgerLinkageSummary::default()
        };
    }

    fn enrich_voucher_detail(&self, detail: &mut VoucherLedgerTaskDetail, pool: &TenantChainPool) {
        let matched_vouchers = dedupe_vouchers(
            pool.vouchers
                .iter()
                .filter(|voucher| {
                    detail
                        .entries
                        .iter()
                        .any(|entry| voucher_matches_entry(voucher, entry))
                })
                .cloned()
                .collect(),
        );

        for entry in &mut detail.entries {
            let matched = matched_vouchers
                .iter()
                .any(|voucher| voucher_matches_entry(voucher, entry));
            entry.reconciliation_status = Some(if matched {
                "matched".to_string()
            } else {
                "pending".to_string()
            });
        }

        let ledger_without_payment = detail
            .entries
            .iter()
            .filter(|entry| {
                !matched_vouchers
                    .iter()
                    .any(|voucher| voucher_matches_entry(voucher, entry))
            })
            .count();
        let timing_exceptions = detail
            .entries
            .iter()
            .filter(|entry| {
                matched_vouchers
                    .iter()
                    .filter(|voucher| voucher_matches_entry(voucher, entry))
                    .any(|voucher| is_timing_exception(voucher, entry))
            })
            .count();
        let payment_total: Decimal = matched_vouchers
            .iter()
            .map(|voucher| parse_decimal_value(&voucher.amount))
            .sum();
        let ledger_total = sum_ledger_entries(&detail.entries);

        detail.payment_linkage_summary = PaymentLinkageSummary {
            linked_payments: matched_vouchers.len(),
            unmatched_payments: ledger_without_payment,
            paid_without_ledger: 0,
            ledger_without_payment,
            amount_gap: decimal_to_string(payment_total - ledger_total),
        };
        detail.ledger_linkage_summary = LedgerLinkageSummary {
            linked_entries: detail.entries.len(),
            timing_exceptions,
            manual_review_required: ledger_without_payment + timing_exceptions,
            ..LedgerLinkageSummary::default()
        };
    }

    fn finding_to_exception_entry(
        &self,
        task: &PlatformTask,
        finding: &PlatformTaskFinding,
    ) -> TaskExceptionPoolEntry {
        let context = self
            .default_exception_context_for_task(task)
            .unwrap_or_default();
        TaskExceptionPoolEntry {
            id: finding.id.clone(),
            task_id: task.id.clone(),
            task_title: task.title.clone(),
            task_kind: task.task_kind,
            source: "rule".to_string(),
            code: finding.rule_code.clone(),
            title: finding.rule_name.clone(),
            category: finding.rule_category.clone(),
            summary: finding.summary.clone(),
            severity: finding.risk_level.clone(),
            status: finding.finding_status.clone(),
            source_record_id: None,
            related_record_id: None,
            case_id: None,
            case_status: None,
            current_stage: None,
            contract_no: context.contract_no,
            payment_order_no: context.payment_order_no,
            treasury_voucher_no: context.treasury_voucher_no,
            voucher_no: context.voucher_no,
            assignee: finding.assignee.clone(),
            disposition_note: finding.disposition_note.clone(),
            disposition_priority: finding.disposition_priority.clone(),
            disposition_outcome: finding.disposition_outcome.clone(),
            remediation_due_at: finding.remediation_due_at.clone(),
            reminder_flag: finding.reminder_flag,
            reminder_count: 0,
            disposed_at: finding.disposed_at.clone(),
            disposition_history: Vec::new(),
            reminder_history: Vec::new(),
            receipt_attachments: Vec::new(),
            evidence_summary: Some(finding.evidence_summary.clone()),
            recommended_action: Some(finding.recommended_action.clone()),
            created_at: task.updated_at.clone(),
        }
    }

    fn reconciliation_to_exception_entry(
        &self,
        task: &PlatformTask,
        item: ReconciliationException,
    ) -> TaskExceptionPoolEntry {
        let context = self
            .exception_context_for_reconciliation(
                task,
                item.source_record_id.as_deref(),
                item.related_record_id.as_deref(),
            )
            .or_else(|| self.default_exception_context_for_task(task))
            .unwrap_or_default();
        TaskExceptionPoolEntry {
            id: item.id,
            task_id: item.task_id,
            task_title: task.title.clone(),
            task_kind: item.task_kind,
            source: "reconciliation".to_string(),
            code: item.exception_code,
            title: item.summary.clone(),
            category: "Reconciliation".to_string(),
            summary: item.summary,
            severity: item.severity,
            status: item.status,
            source_record_id: item.source_record_id,
            related_record_id: item.related_record_id,
            case_id: None,
            case_status: None,
            current_stage: None,
            contract_no: context.contract_no,
            payment_order_no: context.payment_order_no,
            treasury_voucher_no: context.treasury_voucher_no,
            voucher_no: context.voucher_no,
            assignee: item.assignee,
            disposition_note: item.disposition_note,
            disposition_priority: item.disposition_priority,
            disposition_outcome: item.disposition_outcome,
            remediation_due_at: item.remediation_due_at,
            reminder_flag: item.reminder_flag,
            reminder_count: 0,
            disposed_at: item.disposed_at,
            disposition_history: Vec::new(),
            reminder_history: Vec::new(),
            receipt_attachments: Vec::new(),
            evidence_summary: None,
            recommended_action: None,
            created_at: item.created_at,
        }
    }

    fn default_exception_context_for_task(
        &self,
        task: &PlatformTask,
    ) -> Option<ExceptionRecordContext> {
        match &task.detail {
            TaskDetailPayload::TreasuryPayment(detail) if detail.vouchers.len() == 1 => {
                let voucher = detail.vouchers.first()?;
                Some(ExceptionRecordContext {
                    contract_no: voucher.contract_no.clone(),
                    payment_order_no: voucher.payment_order_no.clone(),
                    treasury_voucher_no: voucher.treasury_voucher_no.clone(),
                    voucher_no: None,
                })
            }
            TaskDetailPayload::VoucherLedger(detail) if detail.entries.len() == 1 => {
                let entry = detail.entries.first()?;
                Some(ExceptionRecordContext {
                    contract_no: entry.contract_no.clone(),
                    payment_order_no: entry.payment_order_no.clone(),
                    treasury_voucher_no: entry.treasury_voucher_no.clone(),
                    voucher_no: Some(entry.voucher_no.clone()),
                })
            }
            TaskDetailPayload::ProcurementProject(detail) => Some(ExceptionRecordContext {
                contract_no: detail
                    .contracts
                    .first()
                    .and_then(|contract| contract.contract_no.clone()),
                payment_order_no: None,
                treasury_voucher_no: None,
                voucher_no: None,
            }),
            _ => None,
        }
    }

    fn exception_context_for_reconciliation(
        &self,
        task: &PlatformTask,
        source_record_id: Option<&str>,
        related_record_id: Option<&str>,
    ) -> Option<ExceptionRecordContext> {
        match &task.detail {
            TaskDetailPayload::TreasuryPayment(detail) => {
                let voucher = source_record_id
                    .and_then(|id| detail.vouchers.iter().find(|item| item.id == id))
                    .or_else(|| {
                        related_record_id
                            .and_then(|id| detail.vouchers.iter().find(|item| item.id == id))
                    });
                voucher.map(|matched| ExceptionRecordContext {
                    contract_no: matched.contract_no.clone(),
                    payment_order_no: matched.payment_order_no.clone(),
                    treasury_voucher_no: matched.treasury_voucher_no.clone(),
                    voucher_no: None,
                })
            }
            TaskDetailPayload::VoucherLedger(detail) => {
                let entry = source_record_id
                    .and_then(|id| detail.entries.iter().find(|item| item.id == id))
                    .or_else(|| {
                        related_record_id
                            .and_then(|id| detail.entries.iter().find(|item| item.id == id))
                    });
                entry.map(|matched| ExceptionRecordContext {
                    contract_no: matched.contract_no.clone(),
                    payment_order_no: matched.payment_order_no.clone(),
                    treasury_voucher_no: matched.treasury_voucher_no.clone(),
                    voucher_no: Some(matched.voucher_no.clone()),
                })
            }
            _ => None,
        }
    }

    fn build_reconciliation_exception(
        &self,
        task: &PlatformTask,
        code: &str,
        summary: String,
        severity: &str,
        source_record_id: Option<String>,
        related_record_id: Option<String>,
        created_at: &str,
    ) -> ReconciliationException {
        let id = format!(
            "{}:{}:{}:{}",
            task.id,
            code,
            source_record_id.as_deref().unwrap_or("-"),
            related_record_id.as_deref().unwrap_or("-")
        );
        ReconciliationException {
            id,
            task_id: task.id.clone(),
            task_kind: task.task_kind,
            exception_code: code.to_string(),
            summary,
            severity: severity.to_string(),
            source_record_id,
            related_record_id,
            status: "Open".to_string(),
            assignee: None,
            disposition_note: None,
            disposition_priority: None,
            disposition_outcome: None,
            remediation_due_at: None,
            reminder_flag: false,
            disposed_at: None,
            created_at: created_at.to_string(),
        }
    }

    fn persist_reconciliation_exception(
        &self,
        conn: &Connection,
        tenant_id: &str,
        item: &ReconciliationException,
    ) -> Result<ExceptionDisposition> {
        let existing = conn
            .query_row(
                "SELECT status, assignee, disposition_note, disposition_priority, disposition_outcome, remediation_due_at, reminder_flag, disposed_at
                 FROM reconciliation_exceptions
                 WHERE tenant_id = ?1 AND task_id = ?2 AND id = ?3",
                params![tenant_id, item.task_id, item.id],
                |row| {
                    Ok(ExceptionDisposition {
                        status: row.get(0)?,
                        assignee: row.get(1)?,
                        disposition_note: row.get(2)?,
                        disposition_priority: row.get(3)?,
                        disposition_outcome: row.get(4)?,
                        remediation_due_at: row.get(5)?,
                        reminder_flag: row.get(6)?,
                        disposed_at: row.get(7)?,
                    })
                },
            )
            .optional()?;
        let existing = existing.unwrap_or_default();
        let effective_status = existing.status.unwrap_or_else(|| {
            if item.status.is_empty() {
                "Open".to_string()
            } else {
                item.status.clone()
            }
        });
        let effective_assignee = existing.assignee.or_else(|| item.assignee.clone());
        let effective_note = existing
            .disposition_note
            .or_else(|| item.disposition_note.clone());
        let effective_priority = existing
            .disposition_priority
            .or_else(|| item.disposition_priority.clone());
        let effective_outcome = existing
            .disposition_outcome
            .or_else(|| item.disposition_outcome.clone());
        let effective_due_at = existing
            .remediation_due_at
            .or_else(|| item.remediation_due_at.clone());
        let effective_reminder_flag = existing.reminder_flag.unwrap_or(item.reminder_flag);
        let effective_disposed_at = existing.disposed_at.or_else(|| item.disposed_at.clone());
        conn.execute(
            "INSERT INTO reconciliation_exceptions (
                id, tenant_id, task_id, task_kind, exception_code, summary, severity,
                source_record_id, related_record_id, status, assignee, disposition_note, disposition_priority,
                disposition_outcome, remediation_due_at, reminder_flag, disposed_at, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(id) DO UPDATE SET
                summary = excluded.summary,
                severity = excluded.severity,
                source_record_id = excluded.source_record_id,
                related_record_id = excluded.related_record_id,
                status = ?10,
                assignee = ?11,
                disposition_note = ?12,
                disposition_priority = ?13,
                disposition_outcome = ?14,
                remediation_due_at = ?15,
                reminder_flag = ?16,
                disposed_at = ?17,
                created_at = excluded.created_at",
            params![
                item.id,
                tenant_id,
                item.task_id,
                item.task_kind.as_str(),
                item.exception_code,
                item.summary,
                item.severity,
                item.source_record_id,
                item.related_record_id,
                effective_status,
                effective_assignee,
                effective_note,
                effective_priority,
                effective_outcome,
                effective_due_at,
                effective_reminder_flag,
                effective_disposed_at,
                item.created_at,
            ],
        )?;
        Ok(ExceptionDisposition {
            status: Some(effective_status),
            assignee: effective_assignee,
            disposition_note: effective_note,
            disposition_priority: effective_priority,
            disposition_outcome: effective_outcome,
            remediation_due_at: effective_due_at,
            reminder_flag: Some(effective_reminder_flag),
            disposed_at: effective_disposed_at,
        })
    }

    fn build_reconciliation_exceptions_for_task(
        &self,
        task: &PlatformTask,
        pool: &TenantChainPool,
    ) -> Vec<ReconciliationException> {
        let mut items = Vec::new();
        let created_at = task.updated_at.clone();
        match &task.detail {
            TaskDetailPayload::TreasuryPayment(detail) => {
                let matched_entries = dedupe_entries(
                    pool.entries
                        .iter()
                        .filter(|entry| {
                            detail
                                .vouchers
                                .iter()
                                .any(|voucher| voucher_matches_entry(voucher, entry))
                        })
                        .cloned()
                        .collect(),
                );
                for voucher in unmatched_vouchers(&detail.vouchers, &matched_entries) {
                    let label = voucher
                        .payment_order_no
                        .clone()
                        .or(voucher.treasury_voucher_no.clone())
                        .unwrap_or_else(|| voucher.id.clone());
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-CLOSE-001",
                        format!("payment record {} is paid without ledger entry", label),
                        "High",
                        Some(voucher.id.clone()),
                        None,
                        &created_at,
                    ));
                }
                for (voucher, entry) in timing_exception_pairs(&detail.vouchers, &matched_entries) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-TIMING-001",
                        format!(
                            "payment {} and voucher {} have abnormal booking timing",
                            voucher.payment_order_no.clone().unwrap_or_else(|| voucher.id.clone()),
                            entry.voucher_no
                        ),
                        "Medium",
                        Some(voucher.id.clone()),
                        Some(entry.id.clone()),
                        &created_at,
                    ));
                }
                if amount_gap_non_zero(&task.payment_linkage_summary.amount_gap) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-AMOUNT-001",
                        format!(
                            "payment and ledger amount gap {}",
                            task.payment_linkage_summary.amount_gap
                        ),
                        "High",
                        None,
                        None,
                        &created_at,
                    ));
                }
            }
            TaskDetailPayload::VoucherLedger(detail) => {
                let matched_vouchers = dedupe_vouchers(
                    pool.vouchers
                        .iter()
                        .filter(|voucher| {
                            detail
                                .entries
                                .iter()
                                .any(|entry| voucher_matches_entry(voucher, entry))
                        })
                        .cloned()
                        .collect(),
                );
                for entry in unmatched_entries(&detail.entries, &matched_vouchers) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-CLOSE-001",
                        format!(
                            "voucher {} is booked without matching payment",
                            entry.voucher_no
                        ),
                        "High",
                        Some(entry.id.clone()),
                        None,
                        &created_at,
                    ));
                }
                for (voucher, entry) in timing_exception_pairs(&matched_vouchers, &detail.entries) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-TIMING-001",
                        format!(
                            "payment {} and voucher {} have abnormal booking timing",
                            voucher.payment_order_no.clone().unwrap_or_else(|| voucher.id.clone()),
                            entry.voucher_no
                        ),
                        "Medium",
                        Some(entry.id.clone()),
                        Some(voucher.id.clone()),
                        &created_at,
                    ));
                }
                if amount_gap_non_zero(&task.payment_linkage_summary.amount_gap) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-AMOUNT-001",
                        format!(
                            "payment and ledger amount gap {}",
                            task.payment_linkage_summary.amount_gap
                        ),
                        "High",
                        None,
                        None,
                        &created_at,
                    ));
                }
            }
            TaskDetailPayload::ProcurementProject(detail) => {
                let keys = procurement_match_keys(detail);
                let matched_vouchers = dedupe_vouchers(
                    pool.vouchers
                        .iter()
                        .filter(|voucher| {
                            record_matches_procurement_keys(
                                voucher.budget_project_id.as_deref(),
                                voucher.contract_no.as_deref(),
                                voucher.indicator_document_no.as_deref(),
                                voucher.project_catalog_id.as_deref(),
                                &keys,
                            )
                        })
                        .cloned()
                        .collect(),
                );
                let matched_entries = dedupe_entries(
                    pool.entries
                        .iter()
                        .filter(|entry| {
                            record_matches_procurement_keys(
                                entry.budget_project_id.as_deref(),
                                entry.contract_no.as_deref(),
                                entry.indicator_document_no.as_deref(),
                                entry.project_catalog_id.as_deref(),
                                &keys,
                            )
                        })
                        .cloned()
                        .collect(),
                );
                for voucher in unmatched_vouchers(&matched_vouchers, &matched_entries) {
                    let label = voucher
                        .payment_order_no
                        .clone()
                        .or(voucher.treasury_voucher_no.clone())
                        .unwrap_or_else(|| voucher.id.clone());
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-CLOSE-001",
                        format!(
                            "procurement chain payment {} is paid without ledger entry",
                            label
                        ),
                        "High",
                        Some(voucher.id.clone()),
                        None,
                        &created_at,
                    ));
                }
                for entry in unmatched_entries(&matched_entries, &matched_vouchers) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-CLOSE-001",
                        format!(
                            "procurement chain voucher {} is booked without payment",
                            entry.voucher_no
                        ),
                        "High",
                        Some(entry.id.clone()),
                        None,
                        &created_at,
                    ));
                }
                for (voucher, entry) in timing_exception_pairs(&matched_vouchers, &matched_entries)
                {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-TIMING-001",
                        format!(
                            "procurement payment {} and voucher {} have abnormal booking timing",
                            voucher.payment_order_no.clone().unwrap_or_else(|| voucher.id.clone()),
                            entry.voucher_no
                        ),
                        "Medium",
                        Some(voucher.id.clone()),
                        Some(entry.id.clone()),
                        &created_at,
                    ));
                }
                if amount_gap_non_zero(&task.payment_linkage_summary.amount_gap) {
                    items.push(self.build_reconciliation_exception(
                        task,
                        "CHAIN-AMOUNT-001",
                        format!(
                            "procurement payment and ledger amount gap {}",
                            task.payment_linkage_summary.amount_gap
                        ),
                        "High",
                        None,
                        None,
                        &created_at,
                    ));
                }
            }
            TaskDetailPayload::BudgetSummary(_) => {}
        }
        items
    }

    pub fn list_task_exception_pool(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
    ) -> Result<Vec<TaskExceptionPoolEntry>> {
        let task = self
            .get_platform_task(identity, task_id)
            .ok_or_else(|| anyhow::anyhow!("task not found"))?;
        let conn = self.connect()?;
        let pool = self.load_tenant_chain_pool(&conn, &identity.tenant_id)?;
        let mut items = Vec::new();
        items.extend(
            task.findings
                .iter()
                .filter(|finding| finding_in_exception_pool(finding))
                .map(|finding| self.finding_to_exception_entry(&task, finding)),
        );
        for mut item in self.build_reconciliation_exceptions_for_task(&task, &pool) {
            let disposition =
                self.persist_reconciliation_exception(&conn, &identity.tenant_id, &item)?;
            item.status = disposition.status.unwrap_or_else(|| item.status.clone());
            item.assignee = disposition.assignee;
            item.disposition_note = disposition.disposition_note;
            item.disposition_priority = disposition.disposition_priority;
            item.disposition_outcome = disposition.disposition_outcome;
            item.remediation_due_at = disposition.remediation_due_at;
            item.reminder_flag = disposition.reminder_flag.unwrap_or(item.reminder_flag);
            item.disposed_at = disposition.disposed_at;
            items.push(self.reconciliation_to_exception_entry(&task, item));
        }
        let history_map =
            self.load_exception_disposition_history_map(&conn, &identity.tenant_id, task_id)?;
        let reminder_history_map =
            self.load_exception_reminder_history_map(&conn, &identity.tenant_id, task_id)?;
        let receipt_map =
            self.load_exception_receipt_attachment_map(&conn, &identity.tenant_id, task_id)?;
        for item in &mut items {
            item.disposition_history = history_map.get(&item.id).cloned().unwrap_or_default();
            item.reminder_history = reminder_history_map
                .get(&item.id)
                .cloned()
                .unwrap_or_default();
            item.reminder_count = item
                .reminder_history
                .iter()
                .filter(|event| event.reminder_flag)
                .count();
            item.receipt_attachments = receipt_map.get(&item.id).cloned().unwrap_or_default();
        }
        self.ensure_exception_cases_for_entries(&conn, identity, &items)?;
        let case_map = self.load_case_map_for_task(&conn, &identity.tenant_id, task_id)?;
        for item in &mut items {
            if let Some(case) = case_map.get(&case_entry_key(&item.id, &item.source)) {
                item.case_id = Some(case.id.clone());
                item.case_status = Some(case.case_status.clone());
                item.current_stage = Some(case.current_stage.clone());
                item.remediation_due_at = case
                    .remediation_due_at
                    .clone()
                    .or(item.remediation_due_at.clone());
                item.disposition_priority = Some(case.priority.clone());
                item.disposition_outcome = case
                    .disposition_outcome
                    .clone()
                    .or(item.disposition_outcome.clone());
                item.disposition_note = case
                    .disposition_note
                    .clone()
                    .or(item.disposition_note.clone());
                item.assignee = case
                    .current_handler_display_name
                    .clone()
                    .or(item.assignee.clone());
                item.reminder_count = case.reminder_count.max(item.reminder_count);
            }
        }
        items.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| left.code.cmp(&right.code))
        });
        Ok(items)
    }

    pub fn bulk_update_task_exceptions(
        &self,
        identity: &SessionIdentity,
        targets: &[ExceptionBulkActionTarget],
        status: FindingCaseStatus,
        assignee: Option<String>,
        disposition_note: Option<String>,
        disposition_priority: Option<String>,
        disposition_outcome: Option<String>,
        remediation_due_at: Option<String>,
        reminder_flag: Option<bool>,
        reminder_note: Option<String>,
    ) -> Result<usize> {
        if targets.is_empty() {
            return Ok(0);
        }
        let conn = self.connect()?;
        let mut updated = 0usize;
        let status_value = finding_case_status_label(status);
        let disposed_at = Some(now_string());
        let reminder_flag_sql = reminder_flag.map(|flag| if flag { 1_i64 } else { 0_i64 });
        for target in targets {
            let target_task_id = target
                .task_id
                .as_deref()
                .context("target task_id is required after request normalization")?;
            if target.source.eq_ignore_ascii_case("rule") {
                let changed = conn.execute(
                    "UPDATE platform_task_findings
                     SET finding_status = ?1,
                         assignee = COALESCE(?2, assignee),
                         disposition_note = COALESCE(?3, disposition_note),
                         disposition_priority = COALESCE(?4, disposition_priority),
                         disposition_outcome = COALESCE(?5, disposition_outcome),
                         remediation_due_at = COALESCE(?6, remediation_due_at),
                         reminder_flag = COALESCE(?7, reminder_flag),
                         disposed_at = ?8
                     WHERE task_id = ?9
                       AND id = ?10
                       AND task_id IN (
                           SELECT id FROM platform_tasks WHERE tenant_id = ?11
                       )",
                    params![
                        status_value,
                        assignee.clone(),
                        disposition_note.clone(),
                        disposition_priority.clone(),
                        disposition_outcome.clone(),
                        remediation_due_at.clone(),
                        reminder_flag_sql,
                        disposed_at.clone(),
                        target_task_id,
                        target.exception_id,
                        identity.tenant_id
                    ],
                )?;
                updated += changed;
                if changed > 0 {
                    if let Some(case) = self.ensure_case_for_target(
                        &conn,
                        identity,
                        target_task_id,
                        &target.exception_id,
                        &target.source,
                    )? {
                        let stage = stage_from_exception_status(status_value).to_string();
                        let case_status = case_status_from_stage(&stage).to_string();
                        let effective_priority = disposition_priority
                            .clone()
                            .or_else(|| Some(case.priority.clone()))
                            .unwrap_or_else(|| "P3".to_string());
                        conn.execute(
                            "UPDATE exception_cases
                             SET current_stage = ?1,
                                 case_status = ?2,
                                 current_handler_display_name = COALESCE(?3, current_handler_display_name),
                                 priority = ?4,
                                 disposition_note = COALESCE(?5, disposition_note),
                                 disposition_outcome = COALESCE(?6, disposition_outcome),
                                 sla_due_at = COALESCE(?7, sla_due_at),
                                 remediation_due_at = COALESCE(?7, remediation_due_at),
                                 updated_at = ?8
                             WHERE tenant_id = ?9 AND id = ?10",
                            params![
                                stage,
                                case_status,
                                assignee,
                                effective_priority,
                                disposition_note,
                                disposition_outcome,
                                remediation_due_at,
                                now_string(),
                                identity.tenant_id,
                                case.id,
                            ],
                        )?;
                        self.insert_case_transition_event(
                            &conn,
                            &identity.tenant_id,
                            &case.id,
                            target_task_id,
                            &target.exception_id,
                            "compat_status_update",
                            Some(case.current_stage.as_str()),
                            &stage,
                            &case_status,
                            assignee
                                .as_deref()
                                .or(case.current_handler_display_name.as_deref()),
                            Some(effective_priority.as_str()),
                            remediation_due_at.as_deref().or(case.sla_due_at.as_deref()),
                            disposition_outcome
                                .as_deref()
                                .or(case.disposition_outcome.as_deref()),
                            disposition_note
                                .as_deref()
                                .or(case.disposition_note.as_deref()),
                            reminder_flag,
                            &identity.user_id,
                        )?;
                        if let Some(flag) = reminder_flag {
                            self.insert_case_reminder_notification(
                                &conn,
                                &identity.tenant_id,
                                &case.id,
                                reminder_note.as_deref(),
                                &identity.user_id,
                                flag,
                            )?;
                        }
                        let new_reminder_count =
                            case.reminder_count + usize::from(reminder_flag == Some(true));
                        let new_escalation_count =
                            case.escalation_count + usize::from(stage == "Escalated");
                        self.insert_case_sla_snapshot(
                            &conn,
                            &identity.tenant_id,
                            &case.id,
                            &case_status,
                            &stage,
                            &effective_priority,
                            remediation_due_at.as_deref().or(case.sla_due_at.as_deref()),
                            new_reminder_count,
                            new_escalation_count,
                        )?;
                    }
                    self.insert_exception_disposition_event(
                        &conn,
                        &identity.tenant_id,
                        target_task_id,
                        &target.exception_id,
                        &target.source,
                        status_value,
                        assignee.as_deref(),
                        disposition_note.as_deref(),
                        disposition_priority.as_deref(),
                        disposition_outcome.as_deref(),
                        remediation_due_at.as_deref(),
                        reminder_flag,
                        &identity.user_id,
                    )?;
                    if let Some(flag) = reminder_flag {
                        self.insert_exception_reminder_event(
                            &conn,
                            &identity.tenant_id,
                            target_task_id,
                            &target.exception_id,
                            &target.source,
                            flag,
                            reminder_note.as_deref(),
                            &identity.user_id,
                        )?;
                    }
                }
            } else if target.source.eq_ignore_ascii_case("reconciliation") {
                let changed = conn.execute(
                    "UPDATE reconciliation_exceptions
                     SET status = ?1,
                         assignee = COALESCE(?2, assignee),
                         disposition_note = COALESCE(?3, disposition_note),
                         disposition_priority = COALESCE(?4, disposition_priority),
                         disposition_outcome = COALESCE(?5, disposition_outcome),
                         remediation_due_at = COALESCE(?6, remediation_due_at),
                         reminder_flag = COALESCE(?7, reminder_flag),
                         disposed_at = ?8
                     WHERE tenant_id = ?9 AND task_id = ?10 AND id = ?11",
                    params![
                        status_value,
                        assignee.clone(),
                        disposition_note.clone(),
                        disposition_priority.clone(),
                        disposition_outcome.clone(),
                        remediation_due_at.clone(),
                        reminder_flag_sql,
                        disposed_at.clone(),
                        identity.tenant_id,
                        target_task_id,
                        target.exception_id
                    ],
                )?;
                updated += changed;
                if changed > 0 {
                    if let Some(case) = self.ensure_case_for_target(
                        &conn,
                        identity,
                        target_task_id,
                        &target.exception_id,
                        &target.source,
                    )? {
                        let stage = stage_from_exception_status(status_value).to_string();
                        let case_status = case_status_from_stage(&stage).to_string();
                        let effective_priority = disposition_priority
                            .clone()
                            .or_else(|| Some(case.priority.clone()))
                            .unwrap_or_else(|| "P3".to_string());
                        conn.execute(
                            "UPDATE exception_cases
                             SET current_stage = ?1,
                                 case_status = ?2,
                                 current_handler_display_name = COALESCE(?3, current_handler_display_name),
                                 priority = ?4,
                                 disposition_note = COALESCE(?5, disposition_note),
                                 disposition_outcome = COALESCE(?6, disposition_outcome),
                                 sla_due_at = COALESCE(?7, sla_due_at),
                                 remediation_due_at = COALESCE(?7, remediation_due_at),
                                 updated_at = ?8
                             WHERE tenant_id = ?9 AND id = ?10",
                            params![
                                stage,
                                case_status,
                                assignee,
                                effective_priority,
                                disposition_note,
                                disposition_outcome,
                                remediation_due_at,
                                now_string(),
                                identity.tenant_id,
                                case.id,
                            ],
                        )?;
                        self.insert_case_transition_event(
                            &conn,
                            &identity.tenant_id,
                            &case.id,
                            target_task_id,
                            &target.exception_id,
                            "compat_status_update",
                            Some(case.current_stage.as_str()),
                            &stage,
                            &case_status,
                            assignee
                                .as_deref()
                                .or(case.current_handler_display_name.as_deref()),
                            Some(effective_priority.as_str()),
                            remediation_due_at.as_deref().or(case.sla_due_at.as_deref()),
                            disposition_outcome
                                .as_deref()
                                .or(case.disposition_outcome.as_deref()),
                            disposition_note
                                .as_deref()
                                .or(case.disposition_note.as_deref()),
                            reminder_flag,
                            &identity.user_id,
                        )?;
                        if let Some(flag) = reminder_flag {
                            self.insert_case_reminder_notification(
                                &conn,
                                &identity.tenant_id,
                                &case.id,
                                reminder_note.as_deref(),
                                &identity.user_id,
                                flag,
                            )?;
                        }
                        let new_reminder_count =
                            case.reminder_count + usize::from(reminder_flag == Some(true));
                        let new_escalation_count =
                            case.escalation_count + usize::from(stage == "Escalated");
                        self.insert_case_sla_snapshot(
                            &conn,
                            &identity.tenant_id,
                            &case.id,
                            &case_status,
                            &stage,
                            &effective_priority,
                            remediation_due_at.as_deref().or(case.sla_due_at.as_deref()),
                            new_reminder_count,
                            new_escalation_count,
                        )?;
                    }
                    self.insert_exception_disposition_event(
                        &conn,
                        &identity.tenant_id,
                        target_task_id,
                        &target.exception_id,
                        &target.source,
                        status_value,
                        assignee.as_deref(),
                        disposition_note.as_deref(),
                        disposition_priority.as_deref(),
                        disposition_outcome.as_deref(),
                        remediation_due_at.as_deref(),
                        reminder_flag,
                        &identity.user_id,
                    )?;
                    if let Some(flag) = reminder_flag {
                        self.insert_exception_reminder_event(
                            &conn,
                            &identity.tenant_id,
                            target_task_id,
                            &target.exception_id,
                            &target.source,
                            flag,
                            reminder_note.as_deref(),
                            &identity.user_id,
                        )?;
                    }
                }
            }
        }
        Ok(updated)
    }

    fn insert_exception_disposition_event(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
        exception_id: &str,
        source: &str,
        status: &str,
        assignee: Option<&str>,
        disposition_note: Option<&str>,
        disposition_priority: Option<&str>,
        disposition_outcome: Option<&str>,
        remediation_due_at: Option<&str>,
        reminder_flag: Option<bool>,
        changed_by: &str,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO exception_disposition_events (
                id, tenant_id, task_id, exception_id, source, status,
                assignee, disposition_note, disposition_priority, disposition_outcome, remediation_due_at,
                reminder_flag, changed_by, changed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                task_id,
                exception_id,
                source,
                status,
                assignee,
                disposition_note,
                disposition_priority,
                disposition_outcome,
                remediation_due_at,
                reminder_flag.map(|flag| if flag { 1_i64 } else { 0_i64 }),
                changed_by,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn insert_exception_reminder_event(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
        exception_id: &str,
        source: &str,
        reminder_flag: bool,
        reminder_note: Option<&str>,
        changed_by: &str,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO exception_reminder_events (
                id, tenant_id, task_id, exception_id, source, reminder_flag,
                reminder_note, changed_by, changed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                task_id,
                exception_id,
                source,
                if reminder_flag { 1_i64 } else { 0_i64 },
                reminder_note,
                changed_by,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn load_exception_disposition_history_map(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
    ) -> Result<HashMap<String, Vec<ExceptionDispositionEvent>>> {
        let mut statement = conn.prepare(
            "SELECT e.id, e.task_id, e.exception_id, e.source, e.status, e.assignee,
                    e.disposition_note, e.disposition_priority, e.disposition_outcome, e.remediation_due_at, e.reminder_flag,
                    COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), e.changed_by), e.changed_at
             FROM exception_disposition_events e
             LEFT JOIN users u ON u.id = e.changed_by
             WHERE e.tenant_id = ?1 AND e.task_id = ?2
             ORDER BY e.changed_at DESC, e.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, task_id])?;
        let mut result: HashMap<String, Vec<ExceptionDispositionEvent>> = HashMap::new();
        while let Some(row) = rows.next()? {
            let event = ExceptionDispositionEvent {
                id: row.get(0)?,
                task_id: row.get(1)?,
                exception_id: row.get(2)?,
                source: row.get(3)?,
                status: row.get(4)?,
                assignee: row.get(5)?,
                disposition_note: row.get(6)?,
                disposition_priority: row.get(7)?,
                disposition_outcome: row.get(8)?,
                remediation_due_at: row.get(9)?,
                reminder_flag: row.get::<_, Option<i64>>(10)?.map(|value| value != 0),
                changed_by: row.get(11)?,
                changed_at: row.get(12)?,
            };
            result
                .entry(event.exception_id.clone())
                .or_default()
                .push(event);
        }
        Ok(result)
    }

    fn load_exception_reminder_history_map(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
    ) -> Result<HashMap<String, Vec<ExceptionReminderEvent>>> {
        let mut statement = conn.prepare(
            "SELECT e.id, e.task_id, e.exception_id, e.source, e.reminder_flag, e.reminder_note,
                    COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), e.changed_by), e.changed_at
             FROM exception_reminder_events e
             LEFT JOIN users u ON u.id = e.changed_by
             WHERE e.tenant_id = ?1 AND e.task_id = ?2
             ORDER BY e.changed_at DESC, e.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, task_id])?;
        let mut result: HashMap<String, Vec<ExceptionReminderEvent>> = HashMap::new();
        while let Some(row) = rows.next()? {
            let event = ExceptionReminderEvent {
                id: row.get(0)?,
                task_id: row.get(1)?,
                exception_id: row.get(2)?,
                source: row.get(3)?,
                reminder_flag: row.get::<_, i64>(4)? != 0,
                reminder_note: row.get(5)?,
                changed_by: row.get(6)?,
                changed_at: row.get(7)?,
            };
            result
                .entry(event.exception_id.clone())
                .or_default()
                .push(event);
        }
        Ok(result)
    }

    fn load_exception_receipt_attachment_map(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
    ) -> Result<HashMap<String, Vec<ExceptionReceiptAttachment>>> {
        let mut statement = conn.prepare(
            "SELECT a.id, a.task_id, a.exception_id, a.source, a.file_name, a.mime_type, a.storage_path,
                    a.note, COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), a.uploaded_by), a.uploaded_at
             FROM exception_receipt_attachments a
             LEFT JOIN users u ON u.id = a.uploaded_by
             WHERE a.tenant_id = ?1 AND a.task_id = ?2
             ORDER BY a.uploaded_at DESC, a.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, task_id])?;
        let mut result: HashMap<String, Vec<ExceptionReceiptAttachment>> = HashMap::new();
        while let Some(row) = rows.next()? {
            let attachment = ExceptionReceiptAttachment {
                id: row.get(0)?,
                task_id: row.get(1)?,
                exception_id: row.get(2)?,
                source: row.get(3)?,
                file_name: row.get(4)?,
                mime_type: row.get(5)?,
                storage_path: row.get(6)?,
                note: row.get(7)?,
                uploaded_by: row.get(8)?,
                uploaded_at: row.get(9)?,
            };
            result
                .entry(attachment.exception_id.clone())
                .or_default()
                .push(attachment);
        }
        Ok(result)
    }

    pub fn create_exception_receipt_attachment(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
        exception_id: &str,
        source: &str,
        file_name: &str,
        mime_type: &str,
        storage_path: &str,
        note: Option<String>,
    ) -> Result<ExceptionReceiptAttachment> {
        let conn = self.connect()?;
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM platform_tasks WHERE tenant_id = ?1 AND id = ?2",
                params![identity.tenant_id, task_id],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_none() {
            anyhow::bail!("task not found");
        }
        let id = Uuid::new_v4().to_string();
        let uploaded_at = now_string();
        conn.execute(
            "INSERT INTO exception_receipt_attachments (
                id, tenant_id, task_id, exception_id, source, file_name, mime_type,
                storage_path, note, uploaded_by, uploaded_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                id,
                identity.tenant_id,
                task_id,
                exception_id,
                source,
                file_name,
                mime_type,
                storage_path,
                note,
                identity.user_id,
                uploaded_at,
            ],
        )?;
        Ok(ExceptionReceiptAttachment {
            id,
            task_id: task_id.to_string(),
            exception_id: exception_id.to_string(),
            source: source.to_string(),
            file_name: file_name.to_string(),
            mime_type: mime_type.to_string(),
            storage_path: storage_path.to_string(),
            note,
            uploaded_by: identity.display_name.clone(),
            uploaded_at,
        })
    }

    pub fn create_case_receipt_attachment(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
        file_name: &str,
        mime_type: &str,
        storage_path: &str,
        note: Option<String>,
    ) -> Result<ExceptionReceiptAttachment> {
        let conn = self.connect()?;
        let case = self
            .load_case_record(&conn, &identity.tenant_id, case_id)?
            .context("case not found")?;
        let profile = self.get_profile(identity);
        if !identity.role.can_access_rectification_portal()
            || !self.case_visible_to(identity, profile.as_ref(), &case)
        {
            anyhow::bail!("rectification role required");
        }
        drop(conn);
        self.create_exception_receipt_attachment(
            identity,
            &case.task_id,
            &case.exception_id,
            &case.exception_source,
            file_name,
            mime_type,
            storage_path,
            note,
        )
    }

    pub fn get_exception_receipt_attachment(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
        exception_id: &str,
        receipt_id: &str,
    ) -> Option<ExceptionReceiptAttachment> {
        let conn = self.connect().ok()?;
        conn.query_row(
            "SELECT a.id, a.task_id, a.exception_id, a.source, a.file_name, a.mime_type, a.storage_path,
                    a.note, COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), a.uploaded_by), a.uploaded_at
             FROM exception_receipt_attachments a
             LEFT JOIN users u ON u.id = a.uploaded_by
             WHERE a.tenant_id = ?1 AND a.task_id = ?2 AND a.exception_id = ?3 AND a.id = ?4",
            params![identity.tenant_id, task_id, exception_id, receipt_id],
            |row| {
                Ok(ExceptionReceiptAttachment {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    exception_id: row.get(2)?,
                    source: row.get(3)?,
                    file_name: row.get(4)?,
                    mime_type: row.get(5)?,
                    storage_path: row.get(6)?,
                    note: row.get(7)?,
                    uploaded_by: row.get(8)?,
                    uploaded_at: row.get(9)?,
                })
            },
        )
        .optional()
        .ok()?
    }

    fn ensure_exception_cases_for_entries(
        &self,
        conn: &Connection,
        identity: &SessionIdentity,
        items: &[TaskExceptionPoolEntry],
    ) -> Result<()> {
        for item in items {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM exception_cases
                     WHERE tenant_id = ?1 AND task_id = ?2 AND exception_id = ?3 AND exception_source = ?4",
                    params![identity.tenant_id, item.task_id, item.id, item.source],
                    |row| row.get(0),
                )
                .optional()?;
            if exists.is_some() {
                continue;
            }
            let created_at = now_string();
            let case_id = Uuid::new_v4().to_string();
            let case_no = build_case_no();
            let current_stage = stage_from_exception_status(&item.status).to_string();
            let case_status = case_status_from_stage(&current_stage).to_string();
            let priority = item
                .disposition_priority
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "P3".to_string());
            conn.execute(
                "INSERT INTO exception_cases (
                    id, tenant_id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                    risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                    visibility_scope, priority, case_status,
                    current_stage, current_handler_user_id, current_handler_display_name, source_department,
                    target_department, rectification_unit_name, disposition_outcome, disposition_note,
                    accepted_at, first_assigned_at, first_response_at, submitted_for_review_at, sla_due_at,
                    remediation_due_at, closed_at, reminder_count, escalation_count, created_at, updated_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                    ?9, ?10, ?11, ?12, ?13,
                    ?14, ?15, ?16,
                    ?17, NULL, ?18, NULL,
                    NULL, NULL, ?19, ?20,
                    ?21, NULL, NULL, NULL, ?22,
                    ?23, ?24, ?25, 0, ?26, ?27
                 )",
                params![
                    case_id,
                    identity.tenant_id,
                    case_no,
                    item.task_id,
                    item.id,
                    item.source,
                    item.task_kind.as_str(),
                    rule_domain_from_code(&item.code),
                    item.severity,
                    item.code,
                    item.title,
                    item.summary,
                    identity.organization_id,
                    "department",
                    priority,
                    case_status,
                    current_stage,
                    item.assignee,
                    item.disposition_outcome,
                    item.disposition_note,
                    item.created_at,
                    item.remediation_due_at,
                    item.remediation_due_at,
                    closed_at_for_stage(&current_stage),
                    reminder_count_from_item(item) as i64,
                    created_at,
                    created_at,
                ],
            )?;
            self.insert_case_transition_event(
                conn,
                &identity.tenant_id,
                &case_id,
                &item.task_id,
                &item.id,
                "case_created",
                None,
                &current_stage,
                &case_status,
                item.assignee.as_deref(),
                Some(priority.as_str()),
                item.remediation_due_at.as_deref(),
                item.disposition_outcome.as_deref(),
                item.disposition_note.as_deref(),
                Some(item.reminder_flag),
                &identity.user_id,
            )?;
            self.insert_case_sla_snapshot(
                conn,
                &identity.tenant_id,
                &case_id,
                &case_status,
                &current_stage,
                &priority,
                item.remediation_due_at.as_deref(),
                reminder_count_from_item(item),
                0,
            )?;
        }
        Ok(())
    }

    fn insert_case_seed_records_tx(
        &self,
        tx: &Transaction<'_>,
        identity: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &CaseSeedPreviewResult,
    ) -> Result<Vec<ExceptionCase>> {
        let import_task_id = format!("case-seed:{}:{}", source_kind.as_str(), Uuid::new_v4());
        let created_at = now_string();
        let mut created_cases = Vec::new();

        for record in &preview.records {
            let case_id = Uuid::new_v4().to_string();
            let case_no = build_case_no();
            let exception_id = build_case_seed_exception_id(record);
            let priority = record
                .recommended_priority
                .clone()
                .unwrap_or_else(|| "P3".to_string());
            let risk_level = case_seed_risk_level(record, &priority);
            let assignee = record.assignee.clone();
            let source_department = record
                .source_department
                .clone()
                .or_else(|| Some("鐩戠潱璇勫鍙拌处".to_string()));
            let target_department = record
                .target_department
                .clone()
                .or_else(|| Some(record.construction_unit.clone()));
            let rectification_unit_name = record
                .rectification_unit_name
                .clone()
                .or_else(|| Some(record.construction_unit.clone()));
            let current_stage = if assignee.is_some() {
                "Assigned".to_string()
            } else {
                "New".to_string()
            };
            let case_status = case_status_from_stage(&current_stage).to_string();
            let due_at = infer_case_seed_due_at(record);
            let closed_at = closed_at_for_stage(&current_stage);
            let visibility_scope = if rectification_unit_name.is_some() {
                "rectification_unit"
            } else {
                "department"
            };
            let accepted_at = record
                .accepted_at
                .clone()
                .unwrap_or_else(|| created_at.clone());
            let issue_code = record
                .recommended_case_type
                .clone()
                .unwrap_or_else(|| "case_seed_followup".to_string());

            tx.execute(
                "INSERT INTO exception_cases (
                    id, tenant_id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                    risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                    visibility_scope, priority, case_status,
                    current_stage, current_handler_user_id, current_handler_display_name, source_department,
                    target_department, rectification_unit_name, disposition_outcome, disposition_note,
                    accepted_at, first_assigned_at, first_response_at, submitted_for_review_at, sla_due_at,
                    remediation_due_at, closed_at, reminder_count, escalation_count, created_at, updated_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, 'case_seed', ?6, ?7,
                    ?8, ?9, ?10, ?11, ?12,
                    ?13, ?14, ?15,
                    ?16, NULL, ?17, ?18,
                    ?19, ?20, NULL, ?21,
                    ?22, ?23, NULL, NULL, ?24,
                    ?25, ?26, 0, 0, ?27, ?28
                 )",
                params![
                    case_id.as_str(),
                    identity.tenant_id.as_str(),
                    case_no.as_str(),
                    import_task_id.as_str(),
                    exception_id.as_str(),
                    TaskKind::SupervisionCaseSeed.as_str(),
                    case_seed_rule_domain(record),
                    risk_level,
                    issue_code,
                    record.project_name.as_str(),
                    case_seed_summary(record),
                    identity.organization_id.as_str(),
                    visibility_scope,
                    priority.as_str(),
                    case_status.as_str(),
                    current_stage.as_str(),
                    assignee.as_deref(),
                    source_department.as_deref(),
                    target_department.as_deref(),
                    rectification_unit_name.as_deref(),
                    record.recommended_issue.as_str(),
                    accepted_at.as_str(),
                    if assignee.is_some() {
                        Some(created_at.as_str())
                    } else {
                        None
                    },
                    due_at.as_deref(),
                    due_at.as_deref(),
                    closed_at.as_deref(),
                    created_at.as_str(),
                    created_at.as_str(),
                ],
            )
            .context("failed to insert case seed record")?;

            self.insert_case_transition_event(
                tx,
                &identity.tenant_id,
                &case_id,
                &import_task_id,
                &exception_id,
                "case_seed_imported",
                None,
                &current_stage,
                &case_status,
                assignee.as_deref(),
                Some(priority.as_str()),
                due_at.as_deref(),
                None,
                Some(record.recommended_issue.as_str()),
                Some(false),
                &identity.user_id,
            )?;
            if assignee.is_some() {
                self.insert_case_assignment(
                    tx,
                    &identity.tenant_id,
                    &case_id,
                    assignee.as_deref(),
                    source_department.as_deref(),
                    target_department.as_deref(),
                    rectification_unit_name.as_deref(),
                    &identity.user_id,
                )?;
            }
            self.insert_case_sla_snapshot(
                tx,
                &identity.tenant_id,
                &case_id,
                &case_status,
                &current_stage,
                &priority,
                due_at.as_deref(),
                0,
                0,
            )?;

            let mut case = self
                .load_case_record(tx, &identity.tenant_id, &case_id)?
                .context("seed case not found after insert")?;
            self.populate_case_runtime_fields(tx, &identity.tenant_id, &mut case)?;
            created_cases.push(case);
        }

        Ok(created_cases)
    }

    fn load_case_map_for_task(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
    ) -> Result<HashMap<String, ExceptionCase>> {
        let mut statement = conn.prepare(
            "SELECT id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                    risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                    visibility_scope, priority, case_status, current_stage, current_handler_user_id,
                    current_handler_display_name, source_department, target_department, rectification_unit_name,
                    disposition_outcome, disposition_note, accepted_at, first_assigned_at, first_response_at,
                    submitted_for_review_at, sla_due_at, remediation_due_at, closed_at, reminder_count,
                    escalation_count, created_at, updated_at
             FROM exception_cases
             WHERE tenant_id = ?1 AND task_id = ?2
             ORDER BY updated_at DESC, id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, task_id])?;
        let mut result = HashMap::new();
        while let Some(row) = rows.next()? {
            let case = row_to_exception_case(row)?;
            result.insert(
                case_entry_key(&case.exception_id, &case.exception_source),
                case,
            );
        }
        Ok(result)
    }

    pub fn list_cases(&self, identity: &SessionIdentity) -> Result<Vec<ExceptionCase>> {
        let conn = self.connect()?;
        let tasks_to_sync = self
            .list_platform_tasks(identity)
            .into_iter()
            .take(CASE_LIST_EXCEPTION_SYNC_LIMIT)
            .filter(|task| {
                !self
                    .task_has_exception_cases(&conn, &identity.tenant_id, &task.id)
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>();
        drop(conn);
        for task in tasks_to_sync {
            let _ = self.list_task_exception_pool(identity, &task.id);
        }

        let conn = self.connect()?;
        self.sync_case_notifications(&conn, identity)?;
        let profile = self.get_profile(identity);
        let mut statement = conn.prepare(
            "SELECT id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                    risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                    visibility_scope, priority, case_status, current_stage, current_handler_user_id,
                    current_handler_display_name, source_department, target_department, rectification_unit_name,
                    disposition_outcome, disposition_note, accepted_at, first_assigned_at, first_response_at,
                    submitted_for_review_at, sla_due_at, remediation_due_at, closed_at, reminder_count,
                    escalation_count, created_at, updated_at
             FROM exception_cases
             WHERE tenant_id = ?1
             ORDER BY updated_at DESC, id DESC",
        )?;
        let mut rows = statement.query(params![identity.tenant_id.as_str()])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let mut case = row_to_exception_case(row)?;
            self.populate_case_runtime_fields(&conn, &identity.tenant_id, &mut case)?;
            if self.case_visible_to(identity, profile.as_ref(), &case) {
                result.push(case);
            }
        }
        Ok(result)
    }

    fn task_has_exception_cases(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
    ) -> Result<bool> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(1)
             FROM exception_cases
             WHERE tenant_id = ?1 AND task_id = ?2
             LIMIT 1",
            params![tenant_id, task_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn get_case(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
    ) -> Result<Option<ExceptionCaseDetail>> {
        let conn = self.connect()?;
        self.sync_case_notifications(&conn, identity)?;
        let profile = self.get_profile(identity);
        let case = conn
            .query_row(
                "SELECT id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                        risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                        visibility_scope, priority, case_status, current_stage, current_handler_user_id,
                        current_handler_display_name, source_department, target_department, rectification_unit_name,
                        disposition_outcome, disposition_note, accepted_at, first_assigned_at, first_response_at,
                        submitted_for_review_at, sla_due_at, remediation_due_at, closed_at, reminder_count,
                        escalation_count, created_at, updated_at
                 FROM exception_cases
                 WHERE tenant_id = ?1 AND id = ?2",
                params![identity.tenant_id, case_id],
                row_to_exception_case,
            )
            .optional()?;
        let Some(mut case) = case else {
            return Ok(None);
        };
        self.populate_case_runtime_fields(&conn, &identity.tenant_id, &mut case)?;
        if !self.case_visible_to(identity, profile.as_ref(), &case) {
            return Ok(None);
        }
        let assignment_history =
            self.load_case_assignments(&conn, &identity.tenant_id, &case.id)?;
        let transition_history =
            self.load_case_transition_history(&conn, &identity.tenant_id, &case.id)?;
        let rectification_submissions =
            self.load_case_rectification_submissions(&conn, &identity.tenant_id, &case.id)?;
        let review_decisions =
            self.load_case_review_decisions(&conn, &identity.tenant_id, &case.id)?;
        let extension_requests =
            self.load_case_extension_requests(&conn, &identity.tenant_id, &case.id)?;
        let sla_snapshots = self.load_case_sla_snapshots(&conn, &identity.tenant_id, &case.id)?;
        let notification_deliveries =
            self.load_case_notification_deliveries(&conn, &identity.tenant_id, &case.id)?;
        let escalation_events =
            self.load_case_escalation_events(&conn, &identity.tenant_id, &case.id)?;
        let receipt_attachments = self
            .load_exception_receipt_attachment_map(&conn, &identity.tenant_id, &case.task_id)?
            .remove(&case.exception_id)
            .unwrap_or_default();
        Ok(Some(ExceptionCaseDetail {
            case,
            assignment_history,
            transition_history,
            rectification_submissions,
            review_decisions,
            extension_requests,
            sla_snapshots,
            notification_deliveries,
            escalation_events,
            receipt_attachments,
        }))
    }

    pub fn assign_cases(
        &self,
        identity: &SessionIdentity,
        case_ids: &[String],
        assignee: Option<String>,
        source_department: Option<String>,
        target_department: Option<String>,
        rectification_unit_name: Option<String>,
        sla_due_at: Option<String>,
    ) -> Result<usize> {
        if !identity.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let profile = self.get_profile(identity);
        let mut updated = 0;
        for case_id in case_ids {
            let case = match self.load_case_record(&conn, &identity.tenant_id, case_id)? {
                Some(case) => case,
                None => continue,
            };
            if !self.case_visible_to(identity, profile.as_ref(), &case) {
                continue;
            }
            let now = now_string();
            let to_stage = "Assigned";
            let case_status = "open";
            conn.execute(
                "UPDATE exception_cases
                 SET current_stage = ?1,
                     case_status = ?2,
                     current_handler_display_name = COALESCE(?3, current_handler_display_name),
                     source_department = COALESCE(?4, source_department),
                     target_department = COALESCE(?5, target_department),
                     rectification_unit_name = COALESCE(?6, rectification_unit_name),
                     visibility_scope = CASE
                        WHEN COALESCE(?6, rectification_unit_name) IS NOT NULL THEN 'rectification_unit'
                        WHEN COALESCE(?3, current_handler_display_name) IS NOT NULL THEN 'handler'
                        ELSE visibility_scope
                     END,
                     first_assigned_at = COALESCE(first_assigned_at, ?7),
                     sla_due_at = COALESCE(?8, sla_due_at),
                     remediation_due_at = COALESCE(?8, remediation_due_at),
                     updated_at = ?7
                 WHERE tenant_id = ?9 AND id = ?10",
                params![
                    to_stage,
                    case_status,
                    assignee,
                    source_department,
                    target_department,
                    rectification_unit_name,
                    now,
                    sla_due_at,
                    identity.tenant_id,
                    case_id,
                ],
            )?;
            self.insert_case_assignment(
                &conn,
                &identity.tenant_id,
                &case.id,
                assignee.as_deref(),
                source_department.as_deref(),
                target_department.as_deref(),
                rectification_unit_name.as_deref(),
                &identity.user_id,
            )?;
            self.insert_case_transition_event(
                &conn,
                &identity.tenant_id,
                &case.id,
                &case.task_id,
                &case.exception_id,
                "assigned",
                Some(case.current_stage.as_str()),
                to_stage,
                case_status,
                assignee.as_deref(),
                Some(case.priority.as_str()),
                sla_due_at.as_deref().or(case.sla_due_at.as_deref()),
                case.disposition_outcome.as_deref(),
                case.disposition_note.as_deref(),
                None,
                &identity.user_id,
            )?;
            self.insert_notification_delivery(
                &conn,
                &identity.tenant_id,
                &case.id,
                "assignment",
                "in_app",
                rectification_unit_name
                    .as_deref()
                    .or(case.rectification_unit_name.as_deref())
                    .or(target_department.as_deref())
                    .unwrap_or("case"),
                if rectification_unit_name
                    .as_deref()
                    .or(case.rectification_unit_name.as_deref())
                    .is_some()
                {
                    "rectification_unit"
                } else {
                    "department"
                },
                "Case assigned",
                &format!("{} assigned to rectification workflow", case.case_no),
            )?;
            self.sync_exception_state_from_case(
                &conn,
                &identity.tenant_id,
                &case.task_id,
                &case.exception_id,
                &case.exception_source,
                to_stage,
                assignee.as_deref(),
                case.disposition_note.as_deref(),
                Some(case.priority.as_str()),
                case.disposition_outcome.as_deref(),
                sla_due_at.as_deref().or(case.sla_due_at.as_deref()),
                None,
            )?;
            self.insert_case_sla_snapshot(
                &conn,
                &identity.tenant_id,
                &case.id,
                case_status,
                to_stage,
                &case.priority,
                sla_due_at.as_deref().or(case.sla_due_at.as_deref()),
                case.reminder_count,
                case.escalation_count,
            )?;
            updated += 1;
        }
        Ok(updated)
    }

    pub fn transition_cases(
        &self,
        identity: &SessionIdentity,
        case_ids: &[String],
        to_stage: &str,
        note: Option<String>,
        outcome: Option<String>,
        priority: Option<String>,
        due_at: Option<String>,
        reminder_flag: Option<bool>,
    ) -> Result<usize> {
        if !identity.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let profile = self.get_profile(identity);
        let mut updated = 0;
        for case_id in case_ids {
            let case = match self.load_case_record(&conn, &identity.tenant_id, case_id)? {
                Some(case) => case,
                None => continue,
            };
            if !self.case_visible_to(identity, profile.as_ref(), &case) {
                continue;
            }
            let stage = normalize_case_stage(to_stage)?;
            self.ensure_case_stage_transition(identity, &case, &stage)?;
            let case_status = case_status_from_stage(&stage).to_string();
            let now = now_string();
            let effective_priority = priority.clone().unwrap_or(case.priority.clone());
            let effective_due_at = due_at.clone().or(case.sla_due_at.clone());
            let effective_outcome = outcome.clone().or(case.disposition_outcome.clone());
            let effective_note = note.clone().or(case.disposition_note.clone());
            let escalation_increment = if stage == "Escalated" { 1 } else { 0 };
            let reminder_increment = if reminder_flag == Some(true) { 1 } else { 0 };
            conn.execute(
                "UPDATE exception_cases
                 SET current_stage = ?1,
                     case_status = ?2,
                     priority = ?3,
                     disposition_outcome = ?4,
                     disposition_note = ?5,
                     sla_due_at = COALESCE(?6, sla_due_at),
                     remediation_due_at = COALESCE(?6, remediation_due_at),
                     submitted_for_review_at = CASE WHEN ?1 = 'SubmittedForReview' THEN COALESCE(submitted_for_review_at, ?7) ELSE submitted_for_review_at END,
                     closed_at = CASE WHEN ?2 = 'closed' THEN COALESCE(closed_at, ?7) ELSE NULL END,
                     reminder_count = reminder_count + ?8,
                     escalation_count = escalation_count + ?9,
                     updated_at = ?7
                 WHERE tenant_id = ?10 AND id = ?11",
                params![
                    stage,
                    case_status,
                    effective_priority,
                    effective_outcome,
                    effective_note,
                    effective_due_at,
                    now,
                    reminder_increment,
                    escalation_increment,
                    identity.tenant_id,
                    case_id,
                ],
            )?;
            if let Some(flag) = reminder_flag {
                self.insert_case_reminder_notification(
                    &conn,
                    &identity.tenant_id,
                    &case.id,
                    effective_note.as_deref(),
                    &identity.user_id,
                    flag,
                )?;
            }
            if stage == "Escalated" {
                self.insert_case_escalation_event(
                    &conn,
                    &identity.tenant_id,
                    &case.id,
                    "manual",
                    effective_note.as_deref().unwrap_or("manual escalation"),
                )?;
                self.insert_notification_delivery(
                    &conn,
                    &identity.tenant_id,
                    &case.id,
                    "escalation",
                    "in_app",
                    case.target_department.as_deref().unwrap_or("supervisor"),
                    "department",
                    "Case escalated",
                    &format!("{} escalated for handling", case.case_no),
                )?;
            }
            self.insert_case_transition_event(
                &conn,
                &identity.tenant_id,
                &case.id,
                &case.task_id,
                &case.exception_id,
                "transition",
                Some(case.current_stage.as_str()),
                &stage,
                &case_status,
                case.current_handler_display_name.as_deref(),
                Some(effective_priority.as_str()),
                effective_due_at.as_deref(),
                effective_outcome.as_deref(),
                effective_note.as_deref(),
                reminder_flag,
                &identity.user_id,
            )?;
            self.sync_exception_state_from_case(
                &conn,
                &identity.tenant_id,
                &case.task_id,
                &case.exception_id,
                &case.exception_source,
                &stage,
                case.current_handler_display_name.as_deref(),
                effective_note.as_deref(),
                Some(effective_priority.as_str()),
                effective_outcome.as_deref(),
                effective_due_at.as_deref(),
                reminder_flag,
            )?;
            self.insert_case_sla_snapshot(
                &conn,
                &identity.tenant_id,
                &case.id,
                &case_status,
                &stage,
                &effective_priority,
                effective_due_at.as_deref(),
                case.reminder_count + reminder_increment,
                case.escalation_count + escalation_increment,
            )?;
            updated += 1;
        }
        Ok(updated)
    }

    pub fn submit_case_rectification(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
        rectification_statement: Option<String>,
        requested_extension: Option<String>,
    ) -> Result<RectificationSubmission> {
        let conn = self.connect()?;
        let case = self
            .load_case_record(&conn, &identity.tenant_id, case_id)?
            .context("case not found")?;
        let profile = self.get_profile(identity);
        if !identity.role.can_access_rectification_portal()
            || !self.case_visible_to(identity, profile.as_ref(), &case)
        {
            anyhow::bail!("rectification role required");
        }
        let receipt_attachment_count: usize = conn.query_row(
            "SELECT COUNT(1) FROM exception_receipt_attachments
             WHERE tenant_id = ?1 AND task_id = ?2 AND exception_id = ?3",
            params![identity.tenant_id, case.task_id, case.exception_id],
            |row| row.get(0),
        )?;
        let submission = RectificationSubmission {
            id: Uuid::new_v4().to_string(),
            case_id: case.id.clone(),
            rectification_statement,
            requested_extension,
            receipt_attachment_count,
            submitted_by: identity.display_name.clone(),
            submitted_at: now_string(),
        };
        conn.execute(
            "INSERT INTO case_rectification_submissions (
                id, tenant_id, case_id, rectification_statement, requested_extension,
                receipt_attachment_count, submitted_by, submitted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                submission.id,
                identity.tenant_id,
                submission.case_id,
                submission.rectification_statement,
                submission.requested_extension,
                submission.receipt_attachment_count as i64,
                identity.user_id,
                submission.submitted_at,
            ],
        )?;
        if let Some(requested_due_at) = submission.requested_extension.clone() {
            self.insert_case_extension_request(
                &conn,
                &identity.tenant_id,
                &case.id,
                &requested_due_at,
                submission.rectification_statement.as_deref(),
                &identity.user_id,
            )?;
        }
        conn.execute(
            "UPDATE exception_cases
             SET current_stage = 'SubmittedForReview',
                 case_status = 'open',
                 first_response_at = COALESCE(first_response_at, ?1),
                 submitted_for_review_at = COALESCE(submitted_for_review_at, ?1),
                 updated_at = ?1
             WHERE tenant_id = ?2 AND id = ?3",
            params![submission.submitted_at, identity.tenant_id, case.id],
        )?;
        self.insert_case_transition_event(
            &conn,
            &identity.tenant_id,
            &case.id,
            &case.task_id,
            &case.exception_id,
            "rectification_submitted",
            Some(case.current_stage.as_str()),
            "SubmittedForReview",
            "open",
            case.current_handler_display_name.as_deref(),
            Some(case.priority.as_str()),
            case.sla_due_at.as_deref(),
            case.disposition_outcome.as_deref(),
            submission.rectification_statement.as_deref(),
            None,
            &identity.user_id,
        )?;
        self.insert_notification_delivery(
            &conn,
            &identity.tenant_id,
            &case.id,
            "rectification_submitted",
            "in_app",
            case.target_department.as_deref().unwrap_or("review"),
            "department",
            "Rectification submitted",
            &format!("{} submitted rectification materials", case.case_no),
        )?;
        self.insert_case_sla_snapshot(
            &conn,
            &identity.tenant_id,
            &case.id,
            "open",
            "SubmittedForReview",
            &case.priority,
            case.sla_due_at.as_deref(),
            case.reminder_count,
            case.escalation_count,
        )?;
        Ok(submission)
    }

    pub fn review_case_rectification(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
        decision: &str,
        note: Option<String>,
    ) -> Result<RectificationReviewDecision> {
        if !identity.role.can_review_case() {
            anyhow::bail!("review role required");
        }
        let conn = self.connect()?;
        let case = self
            .load_case_record(&conn, &identity.tenant_id, case_id)?
            .context("case not found")?;
        let profile = self.get_profile(identity);
        if !self.case_visible_to(identity, profile.as_ref(), &case) {
            anyhow::bail!("case not found");
        }
        let normalized_decision = match decision {
            "approved" | "approve" => "approved",
            "rejected" | "reject" => "rejected",
            "accept_rectification" => "approved",
            "reject_rectification" => "rejected",
            "request_more_materials" => "needs_more_materials",
            "approve_extension" => "extension_approved",
            "reject_extension" => "extension_rejected",
            other => anyhow::bail!("unsupported review decision {}", other),
        };
        let review = RectificationReviewDecision {
            id: Uuid::new_v4().to_string(),
            case_id: case.id.clone(),
            decision: normalized_decision.to_string(),
            note,
            reviewed_by: identity.display_name.clone(),
            reviewed_at: now_string(),
        };
        conn.execute(
            "INSERT INTO case_review_decisions (
                id, tenant_id, case_id, decision, note, reviewed_by, reviewed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                review.id,
                identity.tenant_id,
                review.case_id,
                review.decision,
                review.note,
                identity.user_id,
                review.reviewed_at,
            ],
        )?;
        let next_stage = match normalized_decision {
            "approved" | "extension_approved" => "Reviewed",
            _ => "ReviewRejected",
        };
        conn.execute(
            "UPDATE exception_cases
             SET current_stage = ?1, case_status = 'open', updated_at = ?2
             WHERE tenant_id = ?3 AND id = ?4",
            params![next_stage, review.reviewed_at, identity.tenant_id, case.id],
        )?;
        if matches!(
            normalized_decision,
            "extension_approved" | "extension_rejected"
        ) {
            conn.execute(
                "UPDATE case_extension_requests
                 SET status = ?1, reviewed_by = ?2, reviewed_at = ?3
                 WHERE tenant_id = ?4 AND case_id = ?5 AND status = 'pending'",
                params![
                    if normalized_decision == "extension_approved" {
                        "approved"
                    } else {
                        "rejected"
                    },
                    identity.user_id,
                    review.reviewed_at,
                    identity.tenant_id,
                    case.id
                ],
            )?;
        }
        self.insert_case_transition_event(
            &conn,
            &identity.tenant_id,
            &case.id,
            &case.task_id,
            &case.exception_id,
            "review",
            Some(case.current_stage.as_str()),
            next_stage,
            "open",
            case.current_handler_display_name.as_deref(),
            Some(case.priority.as_str()),
            case.sla_due_at.as_deref(),
            case.disposition_outcome.as_deref(),
            review.note.as_deref(),
            None,
            &identity.user_id,
        )?;
        self.sync_exception_state_from_case(
            &conn,
            &identity.tenant_id,
            &case.task_id,
            &case.exception_id,
            &case.exception_source,
            next_stage,
            case.current_handler_display_name.as_deref(),
            review.note.as_deref().or(case.disposition_note.as_deref()),
            Some(case.priority.as_str()),
            case.disposition_outcome.as_deref(),
            case.sla_due_at.as_deref(),
            None,
        )?;
        self.insert_notification_delivery(
            &conn,
            &identity.tenant_id,
            &case.id,
            "review_decision",
            "in_app",
            case.rectification_unit_name
                .as_deref()
                .unwrap_or("rectification"),
            "rectification_unit",
            "Rectification review decision",
            &format!("{} review decision: {}", case.case_no, normalized_decision),
        )?;
        self.insert_case_sla_snapshot(
            &conn,
            &identity.tenant_id,
            &case.id,
            "open",
            next_stage,
            &case.priority,
            case.sla_due_at.as_deref(),
            case.reminder_count,
            case.escalation_count,
        )?;
        Ok(review)
    }

    pub fn record_case_reminder(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
        note: Option<String>,
    ) -> Result<()> {
        if !identity.role.can_access_case_workbench() {
            anyhow::bail!("case workbench role required");
        }
        let conn = self.connect()?;
        let case = self
            .load_case_record(&conn, &identity.tenant_id, case_id)?
            .context("case not found")?;
        let profile = self.get_profile(identity);
        if !self.case_visible_to(identity, profile.as_ref(), &case) {
            anyhow::bail!("case not found");
        }
        conn.execute(
            "UPDATE exception_cases
            SET reminder_count = reminder_count + 1, updated_at = ?1
            WHERE tenant_id = ?2 AND id = ?3",
            params![now_string(), identity.tenant_id, case.id],
        )?;
        self.insert_case_reminder_notification(
            &conn,
            &identity.tenant_id,
            &case.id,
            note.as_deref(),
            &identity.user_id,
            true,
        )?;
        self.insert_case_transition_event(
            &conn,
            &identity.tenant_id,
            &case.id,
            &case.task_id,
            &case.exception_id,
            "reminder",
            Some(case.current_stage.as_str()),
            &case.current_stage,
            &case.case_status,
            case.current_handler_display_name.as_deref(),
            Some(case.priority.as_str()),
            case.sla_due_at.as_deref(),
            case.disposition_outcome.as_deref(),
            note.as_deref(),
            Some(true),
            &identity.user_id,
        )?;
        self.insert_notification_delivery(
            &conn,
            &identity.tenant_id,
            &case.id,
            "reminder",
            "in_app",
            case.rectification_unit_name
                .as_deref()
                .unwrap_or("rectification"),
            "rectification_unit",
            "Case reminder",
            &format!("{} reminder triggered", case.case_no),
        )?;
        self.insert_case_sla_snapshot(
            &conn,
            &identity.tenant_id,
            &case.id,
            &case.case_status,
            &case.current_stage,
            &case.priority,
            case.sla_due_at.as_deref(),
            case.reminder_count + 1,
            case.escalation_count,
        )?;
        Ok(())
    }

    pub fn case_metrics(&self, identity: &SessionIdentity) -> Result<CaseMetrics> {
        let cases = self.list_cases(identity)?;
        let mut closed_on_time = 0usize;
        let mut overdue_open = 0usize;
        let mut total_days = 0i64;
        let mut total_closed = 0usize;
        let mut review_reject_count = 0i64;
        let mut by_task_kind: HashMap<String, usize> = HashMap::new();
        let mut by_rule_domain: HashMap<String, usize> = HashMap::new();
        let mut by_handler: HashMap<String, usize> = HashMap::new();
        let mut by_department: HashMap<String, usize> = HashMap::new();
        let conn = self.connect()?;
        for case in &cases {
            *by_task_kind
                .entry(case.task_kind.as_str().to_string())
                .or_default() += 1;
            *by_rule_domain.entry(case.rule_domain.clone()).or_default() += 1;
            if let Some(handler) = case.current_handler_display_name.as_ref() {
                *by_handler.entry(handler.clone()).or_default() += 1;
            }
            if let Some(department) = case.target_department.as_ref() {
                *by_department.entry(department.clone()).or_default() += 1;
            }
            if case.case_status == "closed" {
                total_closed += 1;
                if let (Some(accepted_at), Some(closed_at)) = (
                    parse_iso_datetime(&case.accepted_at),
                    case.closed_at.as_deref().and_then(parse_iso_datetime),
                ) {
                    total_days += (closed_at - accepted_at).num_days().max(0);
                }
                if case.overdue_days <= 0 {
                    closed_on_time += 1;
                }
            } else if case.overdue_days > 0 {
                overdue_open += 1;
            }
            let rejects: i64 = conn.query_row(
                "SELECT COUNT(1) FROM case_review_decisions WHERE tenant_id = ?1 AND case_id = ?2 AND decision = 'rejected'",
                params![identity.tenant_id, case.id],
                |row| row.get(0),
            )?;
            review_reject_count += rejects;
        }
        Ok(CaseMetrics {
            total_cases: cases.len(),
            open_cases: cases
                .iter()
                .filter(|case| case.case_status != "closed" && case.case_status != "archived")
                .count(),
            closed_cases: total_closed,
            on_time_closed_cases: closed_on_time,
            overdue_open_cases: overdue_open,
            reminder_count: cases.iter().map(|case| case.reminder_count).sum(),
            escalation_count: cases.iter().map(|case| case.escalation_count).sum(),
            average_disposal_days: if total_closed == 0 {
                0
            } else {
                total_days / total_closed as i64
            },
            average_review_reject_count: if cases.is_empty() {
                0
            } else {
                review_reject_count / cases.len() as i64
            },
            by_task_kind: bucketize_case_metric(by_task_kind),
            by_rule_domain: bucketize_case_metric(by_rule_domain),
            by_handler: bucketize_case_metric(by_handler),
            by_department: bucketize_case_metric(by_department),
        })
    }

    pub fn list_rectification_cases(
        &self,
        identity: &SessionIdentity,
    ) -> Result<Vec<ExceptionCase>> {
        if !identity.role.can_access_rectification_portal() {
            anyhow::bail!("rectification role required");
        }
        self.list_cases(identity)
    }

    pub fn case_metrics_overview(&self, identity: &SessionIdentity) -> Result<CaseMetricsOverview> {
        let metrics = self.case_metrics(identity)?;
        let executions = self.list_automation_executions(identity)?;
        let automation_runs = executions.len();
        let automation_failure_count = executions
            .iter()
            .filter(|item| item.status != "succeeded")
            .count();
        let automation_success_count = automation_runs.saturating_sub(automation_failure_count);
        let auto_created_cases = executions
            .iter()
            .map(|item| item.summary.auto_created_cases)
            .sum();
        let auto_assignment_hits = executions
            .iter()
            .map(|item| item.summary.auto_assignment_hits)
            .sum();
        let auto_reminders = executions
            .iter()
            .map(|item| item.summary.auto_reminders)
            .sum();
        let auto_escalations = executions
            .iter()
            .map(|item| item.summary.auto_escalations)
            .sum();
        Ok(CaseMetricsOverview {
            total_cases: metrics.total_cases,
            open_cases: metrics.open_cases,
            closed_cases: metrics.closed_cases,
            overdue_open_cases: metrics.overdue_open_cases,
            on_time_closed_cases: metrics.on_time_closed_cases,
            reminder_count: metrics.reminder_count,
            escalation_count: metrics.escalation_count,
            average_disposal_days: metrics.average_disposal_days,
            average_review_reject_count: metrics.average_review_reject_count,
            closure_rate: ratio_string(metrics.closed_cases, metrics.total_cases),
            on_time_closure_rate: ratio_string(metrics.on_time_closed_cases, metrics.closed_cases),
            automation_runs,
            automation_failure_count,
            automation_success_rate: ratio_string(automation_success_count, automation_runs),
            auto_created_cases,
            auto_assignment_hits,
            auto_reminders,
            auto_escalations,
        })
    }

    pub fn case_metrics_by_dimension(
        &self,
        identity: &SessionIdentity,
        dimension: &str,
    ) -> Result<CaseMetricsByDimension> {
        let metrics = self.case_metrics(identity)?;
        let buckets = match dimension {
            "department" => metrics.by_department,
            "handler" => metrics.by_handler,
            "rule_domain" => metrics.by_rule_domain,
            "task_kind" => metrics.by_task_kind,
            "rectification_unit" => {
                let mut counts = HashMap::new();
                for case in self.list_cases(identity)? {
                    if let Some(unit) = case.rectification_unit_name {
                        *counts.entry(unit).or_insert(0usize) += 1;
                    }
                }
                bucketize_case_metric(counts)
            }
            other => anyhow::bail!("unsupported metrics dimension {}", other),
        };
        Ok(CaseMetricsByDimension {
            dimension: dimension.to_string(),
            buckets,
        })
    }

    pub fn case_metrics_trends(&self, identity: &SessionIdentity) -> Result<Vec<CaseTrendPoint>> {
        let cases = self.list_cases(identity)?;
        let mut buckets: HashMap<String, CaseTrendPoint> = HashMap::new();
        for case in cases {
            let period = case.created_at.get(0..7).unwrap_or("unknown").to_string();
            let bucket = buckets.entry(period.clone()).or_insert(CaseTrendPoint {
                period,
                opened_cases: 0,
                closed_cases: 0,
                overdue_cases: 0,
                reminder_count: 0,
                automation_runs: 0,
                automation_failures: 0,
                auto_created_cases: 0,
                auto_reminders: 0,
                auto_escalations: 0,
            });
            bucket.opened_cases += 1;
            if case.case_status == "closed" {
                bucket.closed_cases += 1;
            }
            if case.overdue_days > 0
                && case.case_status != "closed"
                && case.case_status != "archived"
            {
                bucket.overdue_cases += 1;
            }
            bucket.reminder_count += case.reminder_count;
        }
        for execution in self.list_automation_executions(identity)? {
            let period = execution
                .started_at
                .get(0..7)
                .unwrap_or("unknown")
                .to_string();
            let bucket = buckets.entry(period.clone()).or_insert(CaseTrendPoint {
                period,
                opened_cases: 0,
                closed_cases: 0,
                overdue_cases: 0,
                reminder_count: 0,
                automation_runs: 0,
                automation_failures: 0,
                auto_created_cases: 0,
                auto_reminders: 0,
                auto_escalations: 0,
            });
            bucket.automation_runs += 1;
            if execution.status != "succeeded" {
                bucket.automation_failures += 1;
            }
            bucket.auto_created_cases += execution.summary.auto_created_cases;
            bucket.auto_reminders += execution.summary.auto_reminders;
            bucket.auto_escalations += execution.summary.auto_escalations;
        }
        let mut items = buckets.into_values().collect::<Vec<_>>();
        items.sort_by(|left, right| left.period.cmp(&right.period));
        Ok(items)
    }

    pub fn export_cases_csv(&self, identity: &SessionIdentity) -> Result<String> {
        let cases = self.list_cases(identity)?;
        let mut out = String::from(
            "case_no,task_kind,rule_domain,risk_level,case_status,current_stage,priority,handler,department,rectification_unit,sla_due_at,overdue_days,reminder_count,escalation_count\n",
        );
        for case in cases {
            let row = [
                csv_escape(&case.case_no),
                csv_escape(case.task_kind.as_str()),
                csv_escape(&case.rule_domain),
                csv_escape(&case.risk_level),
                csv_escape(&case.case_status),
                csv_escape(&case.current_stage),
                csv_escape(&case.priority),
                csv_escape(case.current_handler_display_name.as_deref().unwrap_or("")),
                csv_escape(case.target_department.as_deref().unwrap_or("")),
                csv_escape(case.rectification_unit_name.as_deref().unwrap_or("")),
                csv_escape(case.sla_due_at.as_deref().unwrap_or("")),
                csv_escape(&case.overdue_days.to_string()),
                csv_escape(&case.reminder_count.to_string()),
                csv_escape(&case.escalation_count.to_string()),
            ];
            out.push_str(&row.join(","));
            out.push('\n');
        }
        Ok(out)
    }

    pub fn submit_case_extension_request(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
        requested_due_at: &str,
        reason: Option<String>,
    ) -> Result<RectificationExtensionRequest> {
        let conn = self.connect()?;
        let case = self
            .load_case_record(&conn, &identity.tenant_id, case_id)?
            .context("case not found")?;
        let profile = self.get_profile(identity);
        if !identity.role.can_access_rectification_portal()
            || !self.case_visible_to(identity, profile.as_ref(), &case)
        {
            anyhow::bail!("rectification role required");
        }
        let request = self.insert_case_extension_request(
            &conn,
            &identity.tenant_id,
            &case.id,
            requested_due_at,
            reason.as_deref(),
            &identity.user_id,
        )?;
        self.insert_notification_delivery(
            &conn,
            &identity.tenant_id,
            &case.id,
            "extension_requested",
            "in_app",
            case.target_department.as_deref().unwrap_or("review"),
            "department",
            "Extension requested",
            &format!("{} submitted an extension request", case.case_no),
        )?;
        Ok(request)
    }

    pub fn review_case_decision(
        &self,
        identity: &SessionIdentity,
        case_id: &str,
        decision: &str,
        note: Option<String>,
    ) -> Result<RectificationReviewDecision> {
        self.review_case_rectification(identity, case_id, decision, note)
    }

    fn case_visible_to(
        &self,
        identity: &SessionIdentity,
        profile: Option<&crate::platform::UserProfile>,
        case: &ExceptionCase,
    ) -> bool {
        let organization_name = profile
            .map(|item| item.organization_name.as_str())
            .unwrap_or("");
        match identity.role {
            UserRole::Admin | UserRole::Supervisor => true,
            UserRole::DepartmentReviewer => {
                case.owner_organization_id.as_deref() == Some(identity.organization_id.as_str())
                    || case.target_department.as_deref() == Some(organization_name)
            }
            UserRole::Auditor => {
                case.owner_organization_id.as_deref() == Some(identity.organization_id.as_str())
                    || case.current_handler_user_id.as_deref() == Some(identity.user_id.as_str())
            }
            UserRole::RectificationUser => {
                case.rectification_unit_name.as_deref() == Some(organization_name)
            }
            UserRole::Viewer => false,
        }
    }

    fn ensure_case_stage_transition(
        &self,
        identity: &SessionIdentity,
        case: &ExceptionCase,
        to_stage: &str,
    ) -> Result<()> {
        if matches!(to_stage, "Closed" | "Archived" | "Reviewed" | "Escalated")
            && !identity.role.can_review_case()
        {
            anyhow::bail!("review role required");
        }
        if case.current_stage == "Archived" && to_stage != "Archived" {
            anyhow::bail!("archived cases cannot transition");
        }
        Ok(())
    }

    fn populate_case_runtime_fields(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case: &mut ExceptionCase,
    ) -> Result<()> {
        case.notification_summary =
            self.load_case_notification_summary(conn, tenant_id, &case.id)?;
        case.extension_status = conn
            .query_row(
                "SELECT status FROM case_extension_requests
                 WHERE tenant_id = ?1 AND case_id = ?2
                 ORDER BY submitted_at DESC
                 LIMIT 1",
                params![tenant_id, case.id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        Ok(())
    }

    fn load_case_notification_summary(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<NotificationSummary> {
        let total_deliveries: i64 = conn.query_row(
            "SELECT COUNT(1) FROM notification_deliveries WHERE tenant_id = ?1 AND case_id = ?2",
            params![tenant_id, case_id],
            |row| row.get(0),
        )?;
        let reminder_deliveries: i64 = conn.query_row(
            "SELECT COUNT(1) FROM notification_deliveries
             WHERE tenant_id = ?1 AND case_id = ?2 AND event_type LIKE 'reminder%'",
            params![tenant_id, case_id],
            |row| row.get(0),
        )?;
        let escalation_deliveries: i64 = conn.query_row(
            "SELECT COUNT(1) FROM notification_deliveries
             WHERE tenant_id = ?1 AND case_id = ?2 AND event_type = 'escalation'",
            params![tenant_id, case_id],
            |row| row.get(0),
        )?;
        Ok(NotificationSummary {
            total_deliveries: total_deliveries as usize,
            reminder_deliveries: reminder_deliveries as usize,
            escalation_deliveries: escalation_deliveries as usize,
            unread_deliveries: 0,
        })
    }

    fn load_case_extension_requests(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<RectificationExtensionRequest>> {
        let mut statement = conn.prepare(
            "SELECT id, case_id, requested_due_at, reason, status, reviewed_by, reviewed_at,
                    submitted_by, submitted_at
             FROM case_extension_requests
             WHERE tenant_id = ?1 AND case_id = ?2
             ORDER BY submitted_at DESC",
        )?;
        let rows = statement
            .query_map(params![tenant_id, case_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            items.push(RectificationExtensionRequest {
                id: row.0,
                case_id: row.1,
                requested_due_at: row.2,
                reason: row.3,
                status: row.4,
                reviewed_by: self.resolve_user_display_name(conn, row.5)?,
                reviewed_at: row.6,
                submitted_by: self
                    .resolve_user_display_name(conn, row.7)?
                    .unwrap_or_default(),
                submitted_at: row.8,
            });
        }
        Ok(items)
    }

    fn load_case_notification_deliveries(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<NotificationDelivery>> {
        let mut statement = conn.prepare(
            "SELECT id, case_id, event_type, channel, recipient, recipient_scope, title, body, status, delivered_at
             FROM notification_deliveries
             WHERE tenant_id = ?1 AND case_id = ?2
             ORDER BY delivered_at DESC",
        )?;
        let items = statement
            .query_map(params![tenant_id, case_id], |row| {
                Ok(NotificationDelivery {
                    id: row.get(0)?,
                    case_id: row.get(1)?,
                    event_type: row.get(2)?,
                    channel: row.get(3)?,
                    recipient: row.get(4)?,
                    recipient_scope: row.get(5)?,
                    title: row.get(6)?,
                    body: row.get(7)?,
                    status: row.get(8)?,
                    delivered_at: row.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(anyhow::Error::from)?;
        Ok(items)
    }

    fn load_case_escalation_events(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<CaseEscalationEvent>> {
        let mut statement = conn.prepare(
            "SELECT id, case_id, level, reason, created_at
             FROM case_escalation_events
             WHERE tenant_id = ?1 AND case_id = ?2
             ORDER BY created_at DESC",
        )?;
        let items = statement
            .query_map(params![tenant_id, case_id], |row| {
                Ok(CaseEscalationEvent {
                    id: row.get(0)?,
                    case_id: row.get(1)?,
                    level: row.get(2)?,
                    reason: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(anyhow::Error::from)?;
        Ok(items)
    }

    fn insert_notification_delivery(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        event_type: &str,
        channel: &str,
        recipient: &str,
        recipient_scope: &str,
        title: &str,
        body: &str,
    ) -> Result<()> {
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM notification_deliveries
                 WHERE tenant_id = ?1 AND case_id = ?2 AND event_type = ?3 AND recipient = ?4 AND title = ?5",
                params![tenant_id, case_id, event_type, recipient, title],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_some() {
            return Ok(());
        }
        conn.execute(
            "INSERT INTO notification_deliveries (
                id, tenant_id, case_id, event_type, channel, recipient, recipient_scope,
                title, body, status, delivered_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'sent', ?10)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                case_id,
                event_type,
                channel,
                recipient,
                recipient_scope,
                title,
                body,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn insert_case_escalation_event(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        level: &str,
        reason: &str,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO case_escalation_events (id, tenant_id, case_id, level, reason, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                case_id,
                level,
                reason,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn insert_case_extension_request(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        requested_due_at: &str,
        reason: Option<&str>,
        submitted_by: &str,
    ) -> Result<RectificationExtensionRequest> {
        let request = RectificationExtensionRequest {
            id: Uuid::new_v4().to_string(),
            case_id: case_id.to_string(),
            requested_due_at: requested_due_at.to_string(),
            reason: reason.map(|value| value.to_string()),
            status: "pending".to_string(),
            reviewed_by: None,
            reviewed_at: None,
            submitted_by: self
                .resolve_user_display_name(conn, Some(submitted_by.to_string()))?
                .unwrap_or_else(|| submitted_by.to_string()),
            submitted_at: now_string(),
        };
        conn.execute(
            "INSERT INTO case_extension_requests (
                id, tenant_id, case_id, requested_due_at, reason, status,
                reviewed_by, reviewed_at, submitted_by, submitted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?8)",
            params![
                request.id,
                tenant_id,
                request.case_id,
                request.requested_due_at,
                request.reason,
                request.status,
                submitted_by,
                request.submitted_at,
            ],
        )?;
        Ok(request)
    }

    fn resolve_user_display_name(
        &self,
        conn: &Connection,
        user_id: Option<String>,
    ) -> Result<Option<String>> {
        let Some(user_id) = user_id else {
            return Ok(None);
        };
        conn.query_row(
            "SELECT COALESCE(NULLIF(display_name, ''), username) FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
    }

    fn sync_case_notifications(&self, conn: &Connection, identity: &SessionIdentity) -> Result<()> {
        let mut statement = conn.prepare(
            "SELECT id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                    risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                    visibility_scope, priority, case_status, current_stage, current_handler_user_id,
                    current_handler_display_name, source_department, target_department, rectification_unit_name,
                    disposition_outcome, disposition_note, accepted_at, first_assigned_at, first_response_at,
                    submitted_for_review_at, sla_due_at, remediation_due_at, closed_at, reminder_count,
                    escalation_count, created_at, updated_at
             FROM exception_cases
             WHERE tenant_id = ?1 AND case_status NOT IN ('closed', 'archived')",
        )?;
        let cases = statement
            .query_map(params![identity.tenant_id.as_str()], row_to_exception_case)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let today = chrono::Utc::now().date_naive();
        for case in cases {
            let Some(due_at) = case.sla_due_at.as_deref().and_then(parse_iso_date) else {
                continue;
            };
            let delta = (due_at - today).num_days();
            if delta == 3 {
                self.insert_notification_delivery(
                    conn,
                    &identity.tenant_id,
                    &case.id,
                    "reminder_due_3d",
                    "in_app",
                    case.rectification_unit_name
                        .as_deref()
                        .unwrap_or("rectification"),
                    "rectification_unit",
                    "Rectification due warning",
                    &format!("{} has 3 days before due date", case.case_no),
                )?;
            } else if delta == 0 {
                self.insert_notification_delivery(
                    conn,
                    &identity.tenant_id,
                    &case.id,
                    "reminder_due_today",
                    "in_app",
                    case.rectification_unit_name
                        .as_deref()
                        .unwrap_or("rectification"),
                    "rectification_unit",
                    "Rectification due today",
                    &format!("{} is due today", case.case_no),
                )?;
            } else if delta <= -1 {
                let overdue = delta.unsigned_abs() as i64;
                let event_type = match overdue {
                    1 => Some("reminder_overdue_1d"),
                    3 => Some("reminder_overdue_3d"),
                    7 => Some("reminder_overdue_7d"),
                    _ => None,
                };
                if let Some(event_type) = event_type {
                    self.insert_notification_delivery(
                        conn,
                        &identity.tenant_id,
                        &case.id,
                        event_type,
                        "in_app",
                        case.rectification_unit_name
                            .as_deref()
                            .unwrap_or("rectification"),
                        "rectification_unit",
                        "Rectification overdue reminder",
                        &format!("{} is overdue by {} days", case.case_no, overdue),
                    )?;
                }
                if overdue >= 7 && case.current_stage != "Escalated" {
                    conn.execute(
                        "UPDATE exception_cases
                         SET current_stage = 'Escalated', escalation_count = escalation_count + 1, updated_at = ?1
                         WHERE tenant_id = ?2 AND id = ?3 AND current_stage != 'Escalated'",
                        params![now_string(), identity.tenant_id.as_str(), case.id.as_str()],
                    )?;
                    self.insert_case_escalation_event(
                        conn,
                        &identity.tenant_id,
                        &case.id,
                        "automatic",
                        "automatic overdue escalation",
                    )?;
                    self.insert_notification_delivery(
                        conn,
                        &identity.tenant_id,
                        &case.id,
                        "escalation",
                        "in_app",
                        case.target_department.as_deref().unwrap_or("supervisor"),
                        "department",
                        "Case auto escalated",
                        &format!("{} auto escalated because it is overdue", case.case_no),
                    )?;
                }
            }
        }
        Ok(())
    }

    fn load_case_record(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Option<ExceptionCase>> {
        conn.query_row(
            "SELECT id, case_no, task_id, exception_id, exception_source, task_kind, rule_domain,
                    risk_level, exception_code, exception_title, exception_summary, owner_organization_id,
                    visibility_scope, priority, case_status, current_stage, current_handler_user_id,
                    current_handler_display_name, source_department, target_department, rectification_unit_name,
                    disposition_outcome, disposition_note, accepted_at, first_assigned_at, first_response_at,
                    submitted_for_review_at, sla_due_at, remediation_due_at, closed_at, reminder_count,
                    escalation_count, created_at, updated_at
             FROM exception_cases
             WHERE tenant_id = ?1 AND id = ?2",
            params![tenant_id, case_id],
            row_to_exception_case,
        )
        .optional()
        .map_err(Into::into)
    }

    fn ensure_case_for_target(
        &self,
        conn: &Connection,
        identity: &SessionIdentity,
        task_id: &str,
        exception_id: &str,
        source: &str,
    ) -> Result<Option<ExceptionCase>> {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM exception_cases
                 WHERE tenant_id = ?1 AND task_id = ?2 AND exception_id = ?3 AND exception_source = ?4",
                params![identity.tenant_id, task_id, exception_id, source],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(case_id) = existing {
            return self.load_case_record(conn, &identity.tenant_id, &case_id);
        }

        let task = self
            .get_platform_task(identity, task_id)
            .ok_or_else(|| anyhow::anyhow!("task not found"))?;
        let maybe_item = if source.eq_ignore_ascii_case("rule") {
            task.findings
                .iter()
                .find(|finding| finding.id == exception_id && finding_in_exception_pool(finding))
                .map(|finding| self.finding_to_exception_entry(&task, finding))
        } else {
            let pool = self.load_tenant_chain_pool(conn, &identity.tenant_id)?;
            self.build_reconciliation_exceptions_for_task(&task, &pool)
                .into_iter()
                .find(|item| item.id == exception_id)
                .map(|item| {
                    let disposition = self
                        .persist_reconciliation_exception(conn, &identity.tenant_id, &item)
                        .unwrap_or_default();
                    let mut persisted = item;
                    persisted.status = disposition
                        .status
                        .unwrap_or_else(|| persisted.status.clone());
                    persisted.assignee = disposition.assignee;
                    persisted.disposition_note = disposition.disposition_note;
                    persisted.disposition_priority = disposition.disposition_priority;
                    persisted.disposition_outcome = disposition.disposition_outcome;
                    persisted.remediation_due_at = disposition.remediation_due_at;
                    persisted.reminder_flag =
                        disposition.reminder_flag.unwrap_or(persisted.reminder_flag);
                    persisted.disposed_at = disposition.disposed_at;
                    self.reconciliation_to_exception_entry(&task, persisted)
                })
        };
        let Some(item) = maybe_item else {
            return Ok(None);
        };
        self.ensure_exception_cases_for_entries(conn, identity, &[item])?;
        let mut case_map = self.load_case_map_for_task(conn, &identity.tenant_id, task_id)?;
        Ok(case_map.remove(&case_entry_key(exception_id, source)))
    }

    fn insert_case_transition_event(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        task_id: &str,
        exception_id: &str,
        event_type: &str,
        from_stage: Option<&str>,
        to_stage: &str,
        case_status: &str,
        assignee: Option<&str>,
        priority: Option<&str>,
        due_at: Option<&str>,
        outcome: Option<&str>,
        note: Option<&str>,
        reminder_flag: Option<bool>,
        changed_by: &str,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO case_transition_events (
                id, tenant_id, case_id, task_id, exception_id, event_type, from_stage, to_stage,
                case_status, assignee, priority, due_at, outcome, note, reminder_flag, changed_by, changed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                case_id,
                task_id,
                exception_id,
                event_type,
                from_stage,
                to_stage,
                case_status,
                assignee,
                priority,
                due_at,
                outcome,
                note,
                reminder_flag.map(|flag| if flag { 1_i64 } else { 0_i64 }),
                changed_by,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn insert_case_assignment(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        assignee: Option<&str>,
        source_department: Option<&str>,
        target_department: Option<&str>,
        rectification_unit_name: Option<&str>,
        assigned_by: &str,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO case_assignments (
                id, tenant_id, case_id, assigned_to_user_id, assigned_to_display_name,
                source_department, target_department, rectification_unit_name, assigned_by, assigned_at
             ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                case_id,
                assignee,
                source_department,
                target_department,
                rectification_unit_name,
                assigned_by,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn insert_case_sla_snapshot(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        case_status: &str,
        current_stage: &str,
        priority: &str,
        sla_due_at: Option<&str>,
        reminder_count: usize,
        escalation_count: usize,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO case_sla_snapshots (
                id, tenant_id, case_id, case_status, current_stage, priority, sla_due_at,
                overdue_days, reminder_count, escalation_count, captured_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                case_id,
                case_status,
                current_stage,
                priority,
                sla_due_at,
                overdue_days(sla_due_at, case_status),
                reminder_count as i64,
                escalation_count as i64,
                now_string(),
            ],
        )?;
        Ok(())
    }

    fn insert_case_reminder_notification(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
        note: Option<&str>,
        changed_by: &str,
        reminder_flag: bool,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO case_reminder_notifications (
                id, tenant_id, case_id, note, changed_by, changed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                case_id,
                note,
                changed_by,
                now_string(),
            ],
        )?;
        if reminder_flag {
            conn.execute(
                "UPDATE exception_cases SET reminder_count = reminder_count + 1 WHERE tenant_id = ?1 AND id = ?2",
                params![tenant_id, case_id],
            )?;
        }
        Ok(())
    }

    fn load_case_assignments(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<CaseAssignment>> {
        let mut statement = conn.prepare(
            "SELECT a.id, a.case_id, a.assigned_to_user_id,
                    COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), a.assigned_to_display_name),
                    a.source_department, a.target_department, a.rectification_unit_name,
                    COALESCE(NULLIF(changed.display_name, ''), NULLIF(changed.username, ''), a.assigned_by),
                    a.assigned_at
             FROM case_assignments a
             LEFT JOIN users u ON u.id = a.assigned_to_user_id
             LEFT JOIN users changed ON changed.id = a.assigned_by
             WHERE a.tenant_id = ?1 AND a.case_id = ?2
             ORDER BY a.assigned_at DESC, a.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, case_id])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            result.push(CaseAssignment {
                id: row.get(0)?,
                case_id: row.get(1)?,
                assigned_to_user_id: row.get(2)?,
                assigned_to_display_name: row.get(3)?,
                source_department: row.get(4)?,
                target_department: row.get(5)?,
                rectification_unit_name: row.get(6)?,
                assigned_by: row.get(7)?,
                assigned_at: row.get(8)?,
            });
        }
        Ok(result)
    }

    fn load_case_transition_history(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<CaseTransitionEvent>> {
        let mut statement = conn.prepare(
            "SELECT e.id, e.case_id, e.task_id, e.exception_id, e.event_type, e.from_stage, e.to_stage,
                    e.case_status, e.assignee, e.priority, e.due_at, e.outcome, e.note, e.reminder_flag,
                    COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), e.changed_by), e.changed_at
             FROM case_transition_events e
             LEFT JOIN users u ON u.id = e.changed_by
             WHERE e.tenant_id = ?1 AND e.case_id = ?2
             ORDER BY e.changed_at DESC, e.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, case_id])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            result.push(CaseTransitionEvent {
                id: row.get(0)?,
                case_id: row.get(1)?,
                task_id: row.get(2)?,
                exception_id: row.get(3)?,
                event_type: row.get(4)?,
                from_stage: row.get(5)?,
                to_stage: row.get(6)?,
                case_status: row.get(7)?,
                assignee: row.get(8)?,
                priority: row.get(9)?,
                due_at: row.get(10)?,
                outcome: row.get(11)?,
                note: row.get(12)?,
                reminder_flag: row.get::<_, Option<i64>>(13)?.map(|value| value != 0),
                changed_by: row.get(14)?,
                changed_at: row.get(15)?,
            });
        }
        Ok(result)
    }

    fn load_case_rectification_submissions(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<RectificationSubmission>> {
        let mut statement = conn.prepare(
            "SELECT s.id, s.case_id, s.rectification_statement, s.requested_extension,
                    s.receipt_attachment_count,
                    COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), s.submitted_by), s.submitted_at
             FROM case_rectification_submissions s
             LEFT JOIN users u ON u.id = s.submitted_by
             WHERE s.tenant_id = ?1 AND s.case_id = ?2
             ORDER BY s.submitted_at DESC, s.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, case_id])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            result.push(RectificationSubmission {
                id: row.get(0)?,
                case_id: row.get(1)?,
                rectification_statement: row.get(2)?,
                requested_extension: row.get(3)?,
                receipt_attachment_count: row.get::<_, i64>(4)? as usize,
                submitted_by: row.get(5)?,
                submitted_at: row.get(6)?,
            });
        }
        Ok(result)
    }

    fn load_case_review_decisions(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<RectificationReviewDecision>> {
        let mut statement = conn.prepare(
            "SELECT d.id, d.case_id, d.decision, d.note,
                    COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), d.reviewed_by), d.reviewed_at
             FROM case_review_decisions d
             LEFT JOIN users u ON u.id = d.reviewed_by
             WHERE d.tenant_id = ?1 AND d.case_id = ?2
             ORDER BY d.reviewed_at DESC, d.id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, case_id])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            result.push(RectificationReviewDecision {
                id: row.get(0)?,
                case_id: row.get(1)?,
                decision: row.get(2)?,
                note: row.get(3)?,
                reviewed_by: row.get(4)?,
                reviewed_at: row.get(5)?,
            });
        }
        Ok(result)
    }

    fn load_case_sla_snapshots(
        &self,
        conn: &Connection,
        tenant_id: &str,
        case_id: &str,
    ) -> Result<Vec<CaseSlaSnapshot>> {
        let mut statement = conn.prepare(
            "SELECT id, case_id, case_status, current_stage, priority, sla_due_at,
                    overdue_days, reminder_count, escalation_count, captured_at
             FROM case_sla_snapshots
             WHERE tenant_id = ?1 AND case_id = ?2
             ORDER BY captured_at DESC, id DESC",
        )?;
        let mut rows = statement.query(params![tenant_id, case_id])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            result.push(CaseSlaSnapshot {
                id: row.get(0)?,
                case_id: row.get(1)?,
                case_status: row.get(2)?,
                current_stage: row.get(3)?,
                priority: row.get(4)?,
                sla_due_at: row.get(5)?,
                overdue_days: row.get::<_, i64>(6)?,
                reminder_count: row.get::<_, i64>(7)? as usize,
                escalation_count: row.get::<_, i64>(8)? as usize,
                captured_at: row.get(9)?,
            });
        }
        Ok(result)
    }

    fn sync_exception_state_from_case(
        &self,
        conn: &Connection,
        tenant_id: &str,
        task_id: &str,
        exception_id: &str,
        source: &str,
        current_stage: &str,
        assignee: Option<&str>,
        note: Option<&str>,
        priority: Option<&str>,
        outcome: Option<&str>,
        due_at: Option<&str>,
        reminder_flag: Option<bool>,
    ) -> Result<()> {
        let finding_status = finding_status_from_case_stage(current_stage);
        let disposed_at = if finding_status == "Open" {
            None
        } else {
            Some(now_string())
        };
        if source == "rule" {
            conn.execute(
                "UPDATE platform_task_findings
                 SET finding_status = ?1,
                     assignee = COALESCE(?2, assignee),
                     disposition_note = COALESCE(?3, disposition_note),
                     disposition_priority = COALESCE(?4, disposition_priority),
                     disposition_outcome = COALESCE(?5, disposition_outcome),
                     remediation_due_at = COALESCE(?6, remediation_due_at),
                     reminder_flag = COALESCE(?7, reminder_flag),
                     disposed_at = ?8
                 WHERE tenant_id = ?9 AND task_id = ?10 AND id = ?11",
                params![
                    finding_status,
                    assignee,
                    note,
                    priority,
                    outcome,
                    due_at,
                    reminder_flag.map(|flag| if flag { 1_i64 } else { 0_i64 }),
                    disposed_at,
                    tenant_id,
                    task_id,
                    exception_id,
                ],
            )?;
        } else {
            conn.execute(
                "UPDATE reconciliation_exceptions
                 SET status = ?1,
                     assignee = COALESCE(?2, assignee),
                     disposition_note = COALESCE(?3, disposition_note),
                     disposition_priority = COALESCE(?4, disposition_priority),
                     disposition_outcome = COALESCE(?5, disposition_outcome),
                     remediation_due_at = COALESCE(?6, remediation_due_at),
                     reminder_flag = COALESCE(?7, reminder_flag),
                     disposed_at = ?8
                 WHERE tenant_id = ?9 AND task_id = ?10 AND id = ?11",
                params![
                    finding_status,
                    assignee,
                    note,
                    priority,
                    outcome,
                    due_at,
                    reminder_flag.map(|flag| if flag { 1_i64 } else { 0_i64 }),
                    disposed_at,
                    tenant_id,
                    task_id,
                    exception_id,
                ],
            )?;
        }
        Ok(())
    }

    pub fn list_platform_tasks(&self, identity: &SessionIdentity) -> Vec<PlatformTaskSummary> {
        let conn = match self.connect() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };
        let mut statement = match conn.prepare(
            "SELECT id, task_kind, title, source_kind, status, risk_level, primary_subject, updated_at
             FROM platform_tasks
             WHERE tenant_id = ?1
             ORDER BY updated_at DESC",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };

        statement
            .query_map([identity.tenant_id.as_str()], row_to_platform_task_summary)
            .ok()
            .into_iter()
            .flat_map(|mapped| mapped.filter_map(|item| item.ok()))
            .collect()
    }

    pub fn get_platform_task(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
    ) -> Option<PlatformTask> {
        let conn = self.connect().ok()?;
        let mut task = conn
            .query_row(
                "SELECT id, tenant_id, organization_id, task_kind, title, source_kind, status,
                        risk_level, primary_subject, detail_json, created_by, created_at, updated_at
                 FROM platform_tasks
                 WHERE tenant_id = ?1 AND id = ?2",
                params![identity.tenant_id, task_id],
                row_to_platform_task,
            )
            .optional()
            .ok()??;

        let mut statement = conn
            .prepare(
                "SELECT id, rule_code, rule_name, rule_category, risk_level, summary,
                        audit_rationale, recommended_action, evidence_summary, finding_status,
                        assignee, disposition_note, disposition_priority, disposition_outcome,
                        remediation_due_at, reminder_flag, disposed_at
                 FROM platform_task_findings
                 WHERE tenant_id = ?1 AND task_id = ?2
                 ORDER BY created_at ASC",
            )
            .ok()?;
        task.findings = statement
            .query_map(
                params![identity.tenant_id.as_str(), task_id],
                row_to_platform_task_finding,
            )
            .ok()?
            .filter_map(|item| item.ok())
            .collect();
        task.detail = match task.task_kind {
            TaskKind::ProcurementProject => self
                .load_procurement_detail(&conn, &task.id, &task.tenant_id)
                .ok()
                .map(TaskDetailPayload::ProcurementProject)
                .unwrap_or(task.detail),
            TaskKind::BudgetSummary => self
                .load_budget_detail(&conn, &task.id, &task.tenant_id)
                .ok()
                .map(TaskDetailPayload::BudgetSummary)
                .unwrap_or(task.detail),
            TaskKind::TreasuryPayment => self
                .load_treasury_detail(&conn, &task.id, &task.tenant_id)
                .ok()
                .map(TaskDetailPayload::TreasuryPayment)
                .unwrap_or(task.detail),
            TaskKind::VoucherLedger => self
                .load_voucher_detail(&conn, &task.id, &task.tenant_id)
                .ok()
                .map(TaskDetailPayload::VoucherLedger)
                .unwrap_or(task.detail),
            TaskKind::SupervisionCaseSeed => task.detail,
        };
        let chain_pool = self.load_tenant_chain_pool(&conn, &task.tenant_id).ok();
        match &mut task.detail {
            TaskDetailPayload::ProcurementProject(detail) => {
                let linked_contracts = detail.contracts.len();
                let closed_contract_chains = detail
                    .contracts
                    .iter()
                    .filter(|contract| contract.acceptance_status.as_deref() == Some("completed"))
                    .count();
                let writeback_pending = detail
                    .contracts
                    .iter()
                    .filter(|contract| {
                        contract.writeback_status.is_some()
                            && contract.writeback_status.as_deref() != Some("completed")
                    })
                    .count();
                task.contract_linkage_summary = ContractLinkageSummary {
                    linked_contracts,
                    missing_contracts: detail.projects.len().saturating_sub(linked_contracts),
                    closed_contract_chains,
                    open_contract_chains: linked_contracts.saturating_sub(closed_contract_chains),
                    writeback_pending,
                };
                if let Some(pool) = &chain_pool {
                    let (payment_summary, ledger_summary) =
                        self.enrich_procurement_chain_summaries(detail, pool);
                    task.payment_linkage_summary = payment_summary;
                    task.ledger_linkage_summary = ledger_summary;
                }
            }
            TaskDetailPayload::BudgetSummary(detail) => {
                task.budget_linkage_summary = detail.linkage_summary.clone();
            }
            TaskDetailPayload::TreasuryPayment(detail) => {
                if let Some(pool) = &chain_pool {
                    self.enrich_treasury_detail(detail, pool);
                }
                task.contract_linkage_summary = detail.contract_linkage_summary.clone();
                task.payment_linkage_summary = detail.payment_linkage_summary.clone();
                task.ledger_linkage_summary = detail.ledger_linkage_summary.clone();
            }
            TaskDetailPayload::VoucherLedger(detail) => {
                if let Some(pool) = &chain_pool {
                    self.enrich_voucher_detail(detail, pool);
                }
                task.payment_linkage_summary = detail.payment_linkage_summary.clone();
                task.ledger_linkage_summary = detail.ledger_linkage_summary.clone();
            }
        }
        Some(task)
    }

    pub fn find_any_task(&self, identity: &SessionIdentity, task_id: &str) -> Option<AnyTask> {
        if let Some(task) = self.get_task(identity, task_id) {
            return Some(AnyTask::LegacyDemo(task));
        }

        self.get_platform_task(identity, task_id)
            .map(|task| match task.detail {
                TaskDetailPayload::ProcurementProject(_)
                | TaskDetailPayload::BudgetSummary(_)
                | TaskDetailPayload::TreasuryPayment(_)
                | TaskDetailPayload::VoucherLedger(_) => AnyTask::V2Typed(task),
            })
    }

    fn insert_procurement_task_tx(
        &self,
        tx: &Transaction<'_>,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &ProcurementPreviewResult,
    ) -> Result<PlatformTask> {
        let task_id = Uuid::new_v4().to_string();
        let findings = evaluate_procurement_rules(&preview.records);
        let detail =
            self.persist_procurement_detail_tx(tx, &task_id, &actor.tenant_id, preview, &findings)?;
        let now = now_string();
        let task = PlatformTask {
            id: task_id,
            tenant_id: actor.tenant_id.clone(),
            organization_id: actor.organization_id.clone(),
            task_kind: TaskKind::ProcurementProject,
            title: preview.title.clone(),
            source_kind,
            status: PlatformTaskStatus::Completed,
            risk_level: highest_risk_level(&findings),
            primary_subject: preview.primary_subject.clone(),
            findings: findings.clone(),
            detail: TaskDetailPayload::ProcurementProject(detail),
            budget_linkage_summary: BudgetLinkageSummary::default(),
            contract_linkage_summary: ContractLinkageSummary::default(),
            payment_linkage_summary: PaymentLinkageSummary::default(),
            ledger_linkage_summary: LedgerLinkageSummary::default(),
            created_by: actor.user_id.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        tx.execute(
            "INSERT INTO platform_tasks (
                id, tenant_id, organization_id, task_kind, title, source_kind, status,
                risk_level, primary_subject, detail_json, created_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task.id,
                task.tenant_id,
                task.organization_id,
                task.task_kind.as_str(),
                task.title,
                task.source_kind.as_str(),
                task.status.as_str(),
                task.risk_level,
                task.primary_subject,
                serialize_json(&task.detail)?,
                task.created_by,
                task.created_at,
                task.updated_at,
            ],
        )
        .context("failed to insert platform task")?;
        self.insert_platform_task_findings(tx, &task)?;
        if let TaskDetailPayload::ProcurementProject(detail) = &task.detail {
            self.insert_quality_checks(
                tx,
                &actor.tenant_id,
                "task",
                &task.id,
                TaskKind::ProcurementProject,
                &detail.quality_report,
            )?;
        }
        Ok(task)
    }

    fn insert_budget_task_tx(
        &self,
        tx: &Transaction<'_>,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &BudgetPreviewResult,
    ) -> Result<PlatformTask> {
        let task_id = Uuid::new_v4().to_string();
        let findings = evaluate_budget_rules(&preview.records);
        let detail = self.persist_budget_detail_tx(tx, &task_id, &actor.tenant_id, preview)?;
        let now = now_string();
        let task = PlatformTask {
            id: task_id,
            tenant_id: actor.tenant_id.clone(),
            organization_id: actor.organization_id.clone(),
            task_kind: TaskKind::BudgetSummary,
            title: preview.title.clone(),
            source_kind,
            status: PlatformTaskStatus::Completed,
            risk_level: highest_risk_level(&findings),
            primary_subject: preview.primary_subject.clone(),
            findings: findings.clone(),
            detail: TaskDetailPayload::BudgetSummary(detail),
            budget_linkage_summary: BudgetLinkageSummary::default(),
            contract_linkage_summary: ContractLinkageSummary::default(),
            payment_linkage_summary: PaymentLinkageSummary::default(),
            ledger_linkage_summary: LedgerLinkageSummary::default(),
            created_by: actor.user_id.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        tx.execute(
            "INSERT INTO platform_tasks (
                id, tenant_id, organization_id, task_kind, title, source_kind, status,
                risk_level, primary_subject, detail_json, created_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task.id,
                task.tenant_id,
                task.organization_id,
                task.task_kind.as_str(),
                task.title,
                task.source_kind.as_str(),
                task.status.as_str(),
                task.risk_level,
                task.primary_subject,
                serialize_json(&task.detail)?,
                task.created_by,
                task.created_at,
                task.updated_at,
            ],
        )
        .context("failed to insert budget platform task")?;
        self.insert_platform_task_findings(tx, &task)?;
        if let TaskDetailPayload::BudgetSummary(detail) = &task.detail {
            self.insert_quality_checks(
                tx,
                &actor.tenant_id,
                "task",
                &task.id,
                TaskKind::BudgetSummary,
                &detail.quality_report,
            )?;
        }
        Ok(task)
    }

    fn insert_treasury_task_tx(
        &self,
        tx: &Transaction<'_>,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &TreasuryPreviewResult,
    ) -> Result<PlatformTask> {
        let task_id = Uuid::new_v4().to_string();
        let findings = evaluate_payment_rules(&preview.records);
        let detail = self.persist_treasury_detail_tx(tx, &task_id, &actor.tenant_id, preview)?;
        let now = now_string();
        let task = PlatformTask {
            id: task_id,
            tenant_id: actor.tenant_id.clone(),
            organization_id: actor.organization_id.clone(),
            task_kind: TaskKind::TreasuryPayment,
            title: preview.title.clone(),
            source_kind,
            status: PlatformTaskStatus::Completed,
            risk_level: highest_risk_level(&findings),
            primary_subject: preview.primary_subject.clone(),
            findings: findings.clone(),
            contract_linkage_summary: detail.contract_linkage_summary.clone(),
            payment_linkage_summary: detail.payment_linkage_summary.clone(),
            ledger_linkage_summary: detail.ledger_linkage_summary.clone(),
            budget_linkage_summary: BudgetLinkageSummary::default(),
            detail: TaskDetailPayload::TreasuryPayment(detail),
            created_by: actor.user_id.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        tx.execute(
            "INSERT INTO platform_tasks (
                id, tenant_id, organization_id, task_kind, title, source_kind, status,
                risk_level, primary_subject, detail_json, created_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task.id,
                task.tenant_id,
                task.organization_id,
                task.task_kind.as_str(),
                task.title,
                task.source_kind.as_str(),
                task.status.as_str(),
                task.risk_level,
                task.primary_subject,
                serialize_json(&task.detail)?,
                task.created_by,
                task.created_at,
                task.updated_at,
            ],
        )
        .context("failed to insert treasury platform task")?;
        self.insert_platform_task_findings(tx, &task)?;
        if let TaskDetailPayload::TreasuryPayment(detail) = &task.detail {
            self.insert_quality_checks(
                tx,
                &actor.tenant_id,
                "task",
                &task.id,
                TaskKind::TreasuryPayment,
                &detail.quality_report,
            )?;
        }
        Ok(task)
    }

    fn insert_voucher_task_tx(
        &self,
        tx: &Transaction<'_>,
        actor: &SessionIdentity,
        source_kind: ImportSourceKind,
        preview: &VoucherPreviewResult,
    ) -> Result<PlatformTask> {
        let task_id = Uuid::new_v4().to_string();
        let findings = evaluate_voucher_rules(&preview.records);
        let detail = self.persist_voucher_detail_tx(tx, &task_id, &actor.tenant_id, preview)?;
        let now = now_string();
        let task = PlatformTask {
            id: task_id,
            tenant_id: actor.tenant_id.clone(),
            organization_id: actor.organization_id.clone(),
            task_kind: TaskKind::VoucherLedger,
            title: preview.title.clone(),
            source_kind,
            status: PlatformTaskStatus::Completed,
            risk_level: highest_risk_level(&findings),
            primary_subject: preview.primary_subject.clone(),
            findings: findings.clone(),
            contract_linkage_summary: ContractLinkageSummary::default(),
            payment_linkage_summary: detail.payment_linkage_summary.clone(),
            ledger_linkage_summary: detail.ledger_linkage_summary.clone(),
            budget_linkage_summary: BudgetLinkageSummary::default(),
            detail: TaskDetailPayload::VoucherLedger(detail),
            created_by: actor.user_id.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        tx.execute(
            "INSERT INTO platform_tasks (
                id, tenant_id, organization_id, task_kind, title, source_kind, status,
                risk_level, primary_subject, detail_json, created_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task.id,
                task.tenant_id,
                task.organization_id,
                task.task_kind.as_str(),
                task.title,
                task.source_kind.as_str(),
                task.status.as_str(),
                task.risk_level,
                task.primary_subject,
                serialize_json(&task.detail)?,
                task.created_by,
                task.created_at,
                task.updated_at,
            ],
        )
        .context("failed to insert voucher platform task")?;
        self.insert_platform_task_findings(tx, &task)?;
        if let TaskDetailPayload::VoucherLedger(detail) = &task.detail {
            self.insert_quality_checks(
                tx,
                &actor.tenant_id,
                "task",
                &task.id,
                TaskKind::VoucherLedger,
                &detail.quality_report,
            )?;
        }
        Ok(task)
    }

    fn persist_budget_detail_tx(
        &self,
        tx: &Transaction<'_>,
        task_id: &str,
        tenant_id: &str,
        preview: &BudgetPreviewResult,
    ) -> Result<BudgetSummaryTaskDetail> {
        let mut rows_preview = Vec::<BudgetSummaryRowRecord>::new();
        let mut budget_projects = Vec::<BudgetProjectRecord>::new();
        let mut project_ids_seen = HashSet::<String>::new();

        for record in &preview.records {
            let budget_unit = self.upsert_budget_unit_tx(
                tx,
                tenant_id,
                record.budget_unit_name.as_deref(),
                record.budget_unit_code.as_deref(),
                record.region.clone(),
            )?;
            let funding_source = self.upsert_funding_source_tx(
                tx,
                tenant_id,
                record.funding_source_name.as_deref(),
            )?;
            let classification = self.upsert_account_classification_tx(
                tx,
                tenant_id,
                record.function_classification_code.as_deref(),
                record.economic_classification_code.as_deref(),
            )?;
            let budget_project = self.resolve_budget_project_tx(
                tx,
                tenant_id,
                budget_unit.as_ref().map(|item| item.id.as_str()),
                record.budget_project_name.as_deref(),
                record.project_catalog_id.as_deref(),
                record.indicator_document_no.as_deref(),
                funding_source.as_ref().map(|item| item.id.as_str()),
            )?;
            if let Some(project) = &budget_project {
                if project_ids_seen.insert(project.id.clone()) {
                    budget_projects.push(project.clone());
                }
            }

            let row = BudgetSummaryRowRecord {
                id: Uuid::new_v4().to_string(),
                period: record.period.clone(),
                region: record.region.clone(),
                budget_scope: record.budget_scope.clone(),
                direction: record.direction.clone(),
                budget_unit_id: budget_unit.as_ref().map(|item| item.id.clone()),
                budget_project_id: budget_project.as_ref().map(|item| item.id.clone()),
                funding_source_id: funding_source.as_ref().map(|item| item.id.clone()),
                account_classification_id: classification.as_ref().map(|item| item.id.clone()),
                budget_unit_name: record.budget_unit_name.clone(),
                budget_unit_code: record.budget_unit_code.clone(),
                budget_project_name: record.budget_project_name.clone(),
                project_catalog_id: record.project_catalog_id.clone(),
                indicator_document_no: record.indicator_document_no.clone(),
                funding_source_name: record.funding_source_name.clone(),
                function_classification_code: record.function_classification_code.clone(),
                function_classification_name: record.function_classification_name.clone(),
                economic_classification_code: record.economic_classification_code.clone(),
                economic_classification_name: record.economic_classification_name.clone(),
                summary_item: record.summary_item.clone(),
                budget_amount: record.budget_amount.clone(),
                actual_amount: record.actual_amount.clone(),
                previous_period_amount: record.previous_period_amount.clone(),
                budget_value_unit: record.budget_value_unit,
                actual_value_unit: record.actual_value_unit,
                previous_period_value_unit: record.previous_period_value_unit,
                normalized_actual_value: record.normalized_actual_value.clone(),
                yoy_rate: record.yoy_rate.clone(),
                policy_document_no: record.policy_document_no.clone(),
                budget_subject_code: record.budget_subject_code.clone(),
                fund_destination: record.fund_destination.clone(),
                prohibited_use_summary: record.prohibited_use_summary.clone(),
                performance_report_due_at: record.performance_report_due_at.clone(),
                required_budget_indicator_data: record.required_budget_indicator_data.clone(),
                required_performance_target_data: record.required_performance_target_data.clone(),
                required_project_performance_target_data: record
                    .required_project_performance_target_data
                    .clone(),
                required_quarterly_performance_monitoring_data: record
                    .required_quarterly_performance_monitoring_data
                    .clone(),
                required_payment_progress_data: record.required_payment_progress_data.clone(),
                required_voucher_attachment_data: record.required_voucher_attachment_data.clone(),
                required_payment_data: record.required_payment_data.clone(),
                required_voucher_data: record.required_voucher_data.clone(),
                policy_supplemental_checklist_type: record
                    .policy_supplemental_checklist_type
                    .clone(),
                policy_topic: record.policy_topic.clone(),
                required_source_documents: record.required_source_documents.clone(),
                next_data_priority: record.next_data_priority.clone(),
                fund_usage_restriction_level: record.fund_usage_restriction_level.clone(),
                performance_evidence_required: record.performance_evidence_required,
                fiscal_level: record.fiscal_level.clone(),
                fiscal_section: record.fiscal_section.clone(),
                budget_subject_category: record.budget_subject_category.clone(),
                opening_budget_amount: record.opening_budget_amount.clone(),
                completion_rate: record.completion_rate.clone(),
                available_financial_capacity: record.available_financial_capacity.clone(),
                fiscal_special_account_amount: record.fiscal_special_account_amount.clone(),
                livelihood_special_item: record.livelihood_special_item.clone(),
                caliber_note: record.caliber_note.clone(),
                normalized_region: record.normalized_region.clone(),
                source_evidence: record.source_evidence.clone(),
                source_row: Some(record.source_row),
            };
            tx.execute(
                "INSERT INTO budget_summary_rows (
                    id, task_id, tenant_id, dataset_kind, period, region, budget_scope, direction,
                    budget_unit_id, budget_project_id, funding_source_id, account_classification_id,
                    budget_unit_name, budget_unit_code, budget_project_name, project_catalog_id,
                    indicator_document_no, funding_source_name, function_classification_code,
                    function_classification_name, economic_classification_code,
                    economic_classification_name, summary_item, budget_amount, actual_amount,
                    previous_period_amount, yoy_rate, source_row
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                    ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28
                 )",
                params![
                    row.id,
                    task_id,
                    tenant_id,
                    preview.dataset_kind.as_str(),
                    row.period,
                    row.region,
                    row.budget_scope,
                    row.direction,
                    row.budget_unit_id,
                    row.budget_project_id,
                    row.funding_source_id,
                    row.account_classification_id,
                    row.budget_unit_name,
                    row.budget_unit_code,
                    row.budget_project_name,
                    row.project_catalog_id,
                    row.indicator_document_no,
                    row.funding_source_name,
                    row.function_classification_code,
                    row.function_classification_name,
                    row.economic_classification_code,
                    row.economic_classification_name,
                    row.summary_item,
                    row.budget_amount,
                    row.actual_amount,
                    row.previous_period_amount,
                    row.yoy_rate,
                    row.source_row.map(|value| value as i64),
                ],
            )
            .context("failed to insert budget summary row")?;
            if rows_preview.len() < 200 {
                rows_preview.push(row);
            }
        }

        let linkage_summary = self.link_procurement_projects_tx(tx, tenant_id, &budget_projects)?;
        Ok(build_budget_task_detail(
            preview,
            rows_preview,
            linkage_summary,
        ))
    }

    fn persist_procurement_detail_tx(
        &self,
        tx: &Transaction<'_>,
        task_id: &str,
        tenant_id: &str,
        preview: &ProcurementPreviewResult,
        findings: &[PlatformTaskFinding],
    ) -> Result<ProcurementTaskDetail> {
        let mut budget_units_by_name = HashMap::<String, BudgetUnitRecord>::new();
        let mut suppliers_by_name = HashMap::<String, SupplierRecord>::new();
        let mut account_classifications = Vec::<AccountClassificationRecord>::new();
        let mut budget_projects = Vec::<BudgetProjectRecord>::new();
        let funding_sources = Vec::<FundingSourceRecord>::new();
        let mut source_documents = Vec::<SourceDocumentRecord>::new();
        let mut projects = Vec::<ProcurementProjectRecord>::new();
        let mut contracts = Vec::<ProcurementContractRecord>::new();

        for record in &preview.records {
            let budget_unit =
                if let Some(existing) = budget_units_by_name.get(&record.purchaser_name) {
                    existing.clone()
                } else {
                    let id = self.upsert_named_record(
                        tx,
                        "budget_units",
                        tenant_id,
                        &record.purchaser_name,
                        record.region.clone(),
                    )?;
                    let budget_unit = BudgetUnitRecord {
                        id,
                        code: None,
                        name: record.purchaser_name.clone(),
                        region: record.region.clone(),
                    };
                    budget_units_by_name.insert(record.purchaser_name.clone(), budget_unit.clone());
                    budget_unit
                };

            let supplier = match record.supplier_name.as_deref() {
                Some(name) if !name.trim().is_empty() => {
                    if let Some(existing) = suppliers_by_name.get(name) {
                        Some(existing.clone())
                    } else {
                        let id =
                            self.upsert_named_record(tx, "suppliers", tenant_id, name, None)?;
                        let supplier = SupplierRecord {
                            id,
                            name: name.to_string(),
                        };
                        suppliers_by_name.insert(name.to_string(), supplier.clone());
                        Some(supplier)
                    }
                }
                _ => None,
            };

            let classification = if record.function_classification_code.is_some()
                || record.economic_classification_code.is_some()
            {
                let item = AccountClassificationRecord {
                    id: Uuid::new_v4().to_string(),
                    function_classification_code: record.function_classification_code.clone(),
                    economic_classification_code: record.economic_classification_code.clone(),
                };
                tx.execute(
                    "INSERT INTO account_classifications (
                        id, tenant_id, function_classification_code, economic_classification_code
                     ) VALUES (?1, ?2, ?3, ?4)",
                    params![
                        item.id,
                        tenant_id,
                        item.function_classification_code,
                        item.economic_classification_code,
                    ],
                )
                .context("failed to insert account classification")?;
                account_classifications.push(item.clone());
                Some(item)
            } else {
                None
            };

            let budget_project = BudgetProjectRecord {
                id: Uuid::new_v4().to_string(),
                budget_unit_id: Some(budget_unit.id.clone()),
                name: record.project_name.clone(),
                project_catalog_id: record.project_catalog_id.clone(),
                indicator_document_no: record.indicator_document_no.clone(),
                funding_source_id: None,
            };
            tx.execute(
                "INSERT INTO budget_projects (
                    id, tenant_id, budget_unit_id, name, project_catalog_id, indicator_document_no, funding_source_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    budget_project.id,
                    tenant_id,
                    budget_project.budget_unit_id,
                    budget_project.name,
                    budget_project.project_catalog_id,
                    budget_project.indicator_document_no,
                    budget_project.funding_source_id,
                ],
            )
            .context("failed to insert budget project")?;
            budget_projects.push(budget_project.clone());

            let project = ProcurementProjectRecord {
                id: Uuid::new_v4().to_string(),
                project_name: record.project_name.clone(),
                purchaser_name: record.purchaser_name.clone(),
                announcement_type: record.announcement_type.clone(),
                procurement_stage: record.procurement_stage,
                project_code: record.project_code.clone(),
                procurement_method: record.procurement_method.clone(),
                published_at: record.published_at.clone(),
                region: record.region.clone(),
                normalized_region: record.normalized_region.clone(),
                budget_amount: record.budget_amount.clone(),
                award_amount: record.award_amount.clone(),
                budget_amount_unit: record.budget_amount_unit,
                award_amount_unit: record.award_amount_unit,
                normalized_budget_amount_yuan: record.normalized_budget_amount_yuan.clone(),
                normalized_award_amount_yuan: record.normalized_award_amount_yuan.clone(),
                framework_agreement_flag: record.framework_agreement_flag,
                amount_semantic_type: record.amount_semantic_type,
                quote_amount: record.quote_amount.clone(),
                quote_amount_unit: record.quote_amount_unit,
                discount_rate: record.discount_rate.clone(),
                unit_price: record.unit_price.clone(),
                total_award_amount: record.total_award_amount.clone(),
                framework_limit_amount: record.framework_limit_amount.clone(),
                framework_limit_unit: record.framework_limit_unit,
                framework_limit_condition: record.framework_limit_condition.clone(),
                package_no: record.package_no.clone(),
                package_name: record.package_name.clone(),
                package_budget_amount: record.package_budget_amount.clone(),
                package_award_amount: record.package_award_amount.clone(),
                declared_total_award_amount: record.declared_total_award_amount.clone(),
                declared_budget_amount: record.declared_budget_amount.clone(),
                ceiling_amount: record.ceiling_amount.clone(),
                package_sum_amount: record.package_sum_amount.clone(),
                amount_consistency_status: record.amount_consistency_status.clone(),
                amount_difference_yuan: record.amount_difference_yuan.clone(),
                amount_check_reason: record.amount_check_reason.clone(),
                acceptance_management_flag: record.acceptance_management_flag,
                acceptance_plan: record.acceptance_plan.clone(),
                acceptance_opinion: record.acceptance_opinion.clone(),
                acceptance_archive_status: record.acceptance_archive_status.clone(),
                acceptance_archive_locator: record.acceptance_archive_locator.clone(),
                acceptance_issue_summary: record.acceptance_issue_summary.clone(),
                service_period: record.service_period.clone(),
                maintenance_period: record.maintenance_period.clone(),
                warranty_period: record.warranty_period.clone(),
                acceptance_standard: record.acceptance_standard.clone(),
                acceptance_result: record.acceptance_result.clone(),
                acceptance_result_locator: record.acceptance_result_locator.clone(),
                service_period_source: record.service_period_source.clone(),
                warranty_maintenance_source: record.warranty_maintenance_source.clone(),
                settlement_basis: record.settlement_basis.clone(),
                payment_trigger: record.payment_trigger.clone(),
                payment_deadline: record.payment_deadline.clone(),
                payment_condition_source: record.payment_condition_source.clone(),
                contract_performance_period: record.contract_performance_period.clone(),
                government_purchase_service_flag: record.government_purchase_service_flag,
                joint_bid_allowed_flag: record.joint_bid_allowed_flag,
                sme_policy_requirement: record.sme_policy_requirement.clone(),
                credit_financing_policy_flag: record.credit_financing_policy_flag,
                procurement_policy_note: record.procurement_policy_note.clone(),
                procurement_exception_type: record.procurement_exception_type.clone(),
                complaint_decision_no: record.complaint_decision_no.clone(),
                complaint_issue_summary: record.complaint_issue_summary.clone(),
                complaint_handling_result: record.complaint_handling_result.clone(),
                allegation_type: record.allegation_type.clone(),
                allegation_outcome: record.allegation_outcome.clone(),
                confirmed_fact_flag: record.confirmed_fact_flag,
                remedy_action: record.remedy_action.clone(),
                remedy_required_flag: record.remedy_required_flag,
                allegation_evidence_weight: record.allegation_evidence_weight,
                allegation_weight_reason: record.allegation_weight_reason.clone(),
                false_material_flag: record.false_material_flag,
                award_invalidated_flag: record.award_invalidated_flag,
                rebid_required_flag: record.rebid_required_flag,
                correction_notice_flag: record.correction_notice_flag,
                supervision_penalty_subject: record.supervision_penalty_subject.clone(),
                affected_package_no: record.affected_package_no.clone(),
                penalty_decision_no: record.penalty_decision_no.clone(),
                penalty_basis: record.penalty_basis.clone(),
                penalty_basis_article: record.penalty_basis_article.clone(),
                penalty_period: record.penalty_period.clone(),
                market_entry_restriction_scope: record.market_entry_restriction_scope.clone(),
                penalty_subject_type: record.penalty_subject_type.clone(),
                penalty_subject_name: record.penalty_subject_name.clone(),
                credit_repair_status: record.credit_repair_status.clone(),
                credit_repair_source_url: record.credit_repair_source_url.clone(),
                re_participation_review_flag: record.re_participation_review_flag,
                exception_evidence_category: record.exception_evidence_category.clone(),
                exception_evidence_weight: record.exception_evidence_weight,
                exception_weight_reason: record.exception_weight_reason.clone(),
                source_region_scope: record.source_region_scope.clone(),
                source_province: record.source_province.clone(),
                source_city: record.source_city.clone(),
                source_region_code: record.source_region_code.clone(),
                publisher_level: record.publisher_level.clone(),
                central_unit_flag: record.central_unit_flag,
                purchaser_region_code: record.purchaser_region_code.clone(),
                procurement_channel: record.procurement_channel.clone(),
                platform_order_no: record.platform_order_no.clone(),
                item_name: record.item_name.clone(),
                item_quantity: record.item_quantity.clone(),
                item_unit: record.item_unit.clone(),
                unit_price_amount: record.unit_price_amount.clone(),
                unit_price_unit: record.unit_price_unit,
                order_total_amount: record.order_total_amount.clone(),
                order_total_unit: record.order_total_unit,
                procurement_intention_flag: record.procurement_intention_flag,
                intention_budget_amount: record.intention_budget_amount.clone(),
                intention_expected_procurement_at: record.intention_expected_procurement_at.clone(),
                intention_followup_status: record.intention_followup_status.clone(),
                batch_month: record.batch_month.clone(),
                batch_category: record.batch_category.clone(),
                product_category: record.product_category.clone(),
                manufacturer: record.manufacturer.clone(),
                model: record.model.clone(),
                batch_lot_no: record.batch_lot_no.clone(),
                batch_total_amount: record.batch_total_amount.clone(),
                lot_award_amount: record.lot_award_amount.clone(),
                supplier_name: record.supplier_name.clone(),
                budget_unit_id: Some(budget_unit.id.clone()),
                budget_project_id: Some(budget_project.id.clone()),
                supplier_id: supplier.as_ref().map(|item| item.id.clone()),
                funding_source_id: None,
                account_classification_id: classification.as_ref().map(|item| item.id.clone()),
                indicator_document_no: record.indicator_document_no.clone(),
                project_catalog_id: record.project_catalog_id.clone(),
                notice_url: record.notice_url.clone(),
                source_evidence: record.source_evidence.clone(),
                source_row: Some(record.source_row),
                linkage_evidence: Some(ProcurementBudgetLinkEvidence {
                    match_mode: ProcurementBudgetLinkMode::Exact,
                    match_score: 100,
                    match_reasons: vec!["linked during procurement import".to_string()],
                    candidate_budget_project_ids: vec![budget_project.id.clone()],
                    linkage_confidence: 100,
                    candidate_matches: vec![LinkageCandidateMatch {
                        record_type: "budget_project".to_string(),
                        record_id: budget_project.id.clone(),
                        confidence: 100,
                        match_reasons: vec!["linked during procurement import".to_string()],
                    }],
                    unmatched_reason: None,
                }),
            };
            tx.execute(
                "INSERT INTO procurement_projects (
                    id, task_id, tenant_id, budget_project_id, budget_unit_id, supplier_id,
                    funding_source_id, account_classification_id, project_name, purchaser_name,
                    announcement_type, project_code, procurement_method, published_at, region,
                    budget_amount, award_amount, supplier_name, indicator_document_no,
                    project_catalog_id, notice_url, source_row, linkage_match_mode,
                    linkage_match_score, linkage_match_reasons_json
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                    ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25
                 )",
                params![
                    project.id,
                    task_id,
                    tenant_id,
                    project.budget_project_id,
                    project.budget_unit_id,
                    project.supplier_id,
                    project.funding_source_id,
                    project.account_classification_id,
                    project.project_name,
                    project.purchaser_name,
                    project.announcement_type,
                    project.project_code,
                    project.procurement_method,
                    project.published_at,
                    project.region,
                    project.budget_amount,
                    project.award_amount,
                    project.supplier_name,
                    project.indicator_document_no,
                    project.project_catalog_id,
                    project.notice_url,
                    project.source_row.map(|value| value as i64),
                    "exact",
                    100i64,
                    serialize_json(&vec!["linked during procurement import".to_string()])?,
                ],
            )
            .context("failed to insert procurement project")?;

            if record.contract_no.is_some()
                || record.contract_published_at.is_some()
                || record.acceptance_summary.is_some()
                || record.acceptance_status.is_some()
                || record.award_amount.is_some()
            {
                let contract = ProcurementContractRecord {
                    id: Uuid::new_v4().to_string(),
                    procurement_project_id: project.id.clone(),
                    contract_no: record.contract_no.clone(),
                    contract_published_at: record.contract_published_at.clone(),
                    acceptance_summary: record.acceptance_summary.clone(),
                    acceptance_status: record.acceptance_status.clone(),
                    contract_amount: record.award_amount.clone(),
                    supplier_id: supplier.as_ref().map(|item| item.id.clone()),
                    funding_source_id: None,
                    account_classification_id: classification.as_ref().map(|item| item.id.clone()),
                    source_document_id: None,
                    writeback_status: None,
                    writeback_ref: None,
                    reconciliation_status: None,
                };
                tx.execute(
                    "INSERT INTO procurement_contracts (
                        id, task_id, procurement_project_id, tenant_id, contract_no,
                        contract_published_at, acceptance_summary, acceptance_status, contract_amount
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        contract.id,
                        task_id,
                        contract.procurement_project_id,
                        tenant_id,
                        contract.contract_no,
                        contract.contract_published_at,
                        contract.acceptance_summary,
                        contract.acceptance_status,
                        contract.contract_amount,
                    ],
                )
                .context("failed to insert procurement contract")?;
                contracts.push(contract);
            }

            if let Some(url) = record.notice_url.as_deref() {
                let source_document = SourceDocumentRecord {
                    id: Uuid::new_v4().to_string(),
                    document_type: "procurement_notice".to_string(),
                    title: record.project_name.clone(),
                    url: Some(url.to_string()),
                    captured_at: record.published_at.clone(),
                };
                tx.execute(
                    "INSERT INTO source_documents (
                        id, task_id, tenant_id, document_type, title, url, captured_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        source_document.id,
                        task_id,
                        tenant_id,
                        source_document.document_type,
                        source_document.title,
                        source_document.url,
                        source_document.captured_at,
                    ],
                )
                .context("failed to insert source document")?;
                source_documents.push(source_document);
            }

            projects.push(project);
        }

        let mut quality_report = preview.quality_report.clone();
        if findings.is_empty() && quality_report.checks.is_empty() {
            quality_report.checks.push(QualityCheck {
                code: "procurement_clean_import".to_string(),
                severity: QualitySeverity::Info,
                message: "import completed without extra quality warnings or procurement rule hits"
                    .to_string(),
                field: None,
                row_number: None,
            });
        }

        Ok(ProcurementTaskDetail {
            projects,
            contracts,
            budget_units: budget_units_by_name.into_values().collect(),
            budget_projects,
            suppliers: suppliers_by_name.into_values().collect(),
            funding_sources,
            account_classifications,
            source_documents,
            quality_report,
            applicable_rule_sets: vec!["procurement_rules".to_string()],
        })
    }

    fn persist_treasury_detail_tx(
        &self,
        tx: &Transaction<'_>,
        task_id: &str,
        tenant_id: &str,
        preview: &TreasuryPreviewResult,
    ) -> Result<TreasuryPaymentTaskDetail> {
        let mut vouchers = Vec::new();
        let mut suppliers = Vec::<SupplierRecord>::new();
        let mut funding_sources = Vec::<FundingSourceRecord>::new();
        let mut account_classifications = Vec::<AccountClassificationRecord>::new();
        let mut source_documents = Vec::<SourceDocumentRecord>::new();
        let mut contracts = Vec::<ProcurementContractRecord>::new();
        let mut seen_suppliers = HashSet::new();
        let mut seen_sources = HashSet::new();
        let mut seen_classifications = HashSet::new();

        for record in &preview.records {
            let budget_unit = self.upsert_budget_unit_tx(
                tx,
                tenant_id,
                record.budget_unit_name.as_deref(),
                None,
                None,
            )?;
            let funding_source = self.upsert_funding_source_tx(
                tx,
                tenant_id,
                record.funding_source_name.as_deref(),
            )?;
            let classification = self.upsert_account_classification_tx(
                tx,
                tenant_id,
                record.function_classification_code.as_deref(),
                record.economic_classification_code.as_deref(),
            )?;
            let budget_project = self.resolve_budget_project_tx(
                tx,
                tenant_id,
                budget_unit.as_ref().map(|item| item.id.as_str()),
                record.budget_project_name.as_deref(),
                record.project_catalog_id.as_deref(),
                record.indicator_document_no.as_deref(),
                funding_source.as_ref().map(|item| item.id.as_str()),
            )?;

            let supplier = match record
                .supplier_name
                .as_deref()
                .or(Some(record.counterparty.as_str()))
            {
                Some(name) if !name.trim().is_empty() => {
                    let id = self.upsert_named_record(tx, "suppliers", tenant_id, name, None)?;
                    let item = SupplierRecord {
                        id,
                        name: name.to_string(),
                    };
                    if seen_suppliers.insert(item.id.clone()) {
                        suppliers.push(item.clone());
                    }
                    Some(item)
                }
                _ => None,
            };

            if let Some(item) = &funding_source {
                if seen_sources.insert(item.id.clone()) {
                    funding_sources.push(item.clone());
                }
            }
            if let Some(item) = &classification {
                if seen_classifications.insert(item.id.clone()) {
                    account_classifications.push(item.clone());
                }
            }

            tx.execute(
                "INSERT INTO treasury_payment_vouchers (
                    id, task_id, tenant_id, budget_project_id, payment_order_no, amount, paid_at, counterparty
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    task_id,
                    tenant_id,
                    budget_project.as_ref().map(|item| item.id.as_str()),
                    record.payment_order_no,
                    record.amount,
                    record.paid_at,
                    record.counterparty,
                ],
            )
            .context("failed to insert treasury payment voucher")?;

            let voucher = TreasuryPaymentVoucherRecord {
                id: Uuid::new_v4().to_string(),
                budget_project_id: budget_project.as_ref().map(|item| item.id.clone()),
                procurement_project_id: record.procurement_project_id.clone(),
                supplier_id: supplier.as_ref().map(|item| item.id.clone()),
                supplier_name: record
                    .supplier_name
                    .clone()
                    .or_else(|| Some(record.counterparty.clone())),
                funding_source_id: funding_source.as_ref().map(|item| item.id.clone()),
                account_classification_id: classification.as_ref().map(|item| item.id.clone()),
                source_document_id: None,
                indicator_document_no: record.indicator_document_no.clone(),
                project_catalog_id: record.project_catalog_id.clone(),
                contract_no: record.contract_no.clone(),
                payment_order_no: Some(record.payment_order_no.clone()),
                treasury_voucher_no: record.treasury_voucher_no.clone(),
                amount: record.amount.clone(),
                paid_at: record.paid_at.clone(),
                counterparty: record.counterparty.clone(),
                writeback_status: None,
                writeback_ref: None,
                reconciliation_status: Some("pending".to_string()),
                source_row: Some(record.source_row),
            };
            vouchers.push(voucher);

            if let Some(contract_no) = record.contract_no.as_deref() {
                if let Some(contract) = tx
                    .query_row(
                        "SELECT id, procurement_project_id, contract_no, contract_published_at,
                                acceptance_summary, acceptance_status, contract_amount
                         FROM procurement_contracts
                         WHERE tenant_id = ?1 AND contract_no = ?2
                         LIMIT 1",
                        params![tenant_id, contract_no],
                        |row| {
                            Ok(ProcurementContractRecord {
                                id: row.get(0)?,
                                procurement_project_id: row.get(1)?,
                                contract_no: row.get(2)?,
                                contract_published_at: row.get(3)?,
                                acceptance_summary: row.get(4)?,
                                acceptance_status: row.get(5)?,
                                contract_amount: row.get(6)?,
                                supplier_id: supplier.as_ref().map(|item| item.id.clone()),
                                funding_source_id: funding_source
                                    .as_ref()
                                    .map(|item| item.id.clone()),
                                account_classification_id: classification
                                    .as_ref()
                                    .map(|item| item.id.clone()),
                                source_document_id: None,
                                writeback_status: None,
                                writeback_ref: None,
                                reconciliation_status: Some("pending".to_string()),
                            })
                        },
                    )
                    .optional()
                    .context("failed to load linked procurement contract")?
                {
                    contracts.push(contract);
                }
            }

            if let Some(contract_no) = record.contract_no.as_deref() {
                source_documents.push(SourceDocumentRecord {
                    id: Uuid::new_v4().to_string(),
                    document_type: "payment_voucher".to_string(),
                    title: format!("payment voucher {}", contract_no),
                    url: None,
                    captured_at: Some(record.paid_at.clone()),
                });
            }
        }

        Ok(build_treasury_task_detail(
            preview,
            vouchers.clone(),
            contracts,
            suppliers,
            funding_sources,
            account_classifications,
            source_documents,
            ContractLinkageSummary {
                linked_contracts: vouchers
                    .iter()
                    .filter(|item| item.contract_no.is_some())
                    .count(),
                missing_contracts: vouchers
                    .iter()
                    .filter(|item| item.contract_no.is_none())
                    .count(),
                closed_contract_chains: 0,
                open_contract_chains: vouchers.len(),
                writeback_pending: 0,
            },
            PaymentLinkageSummary {
                linked_payments: vouchers.len(),
                unmatched_payments: vouchers
                    .iter()
                    .filter(|item| item.contract_no.is_none())
                    .count(),
                paid_without_ledger: vouchers.len(),
                ledger_without_payment: 0,
                amount_gap: "0".to_string(),
            },
            LedgerLinkageSummary::default(),
        ))
    }

    fn persist_voucher_detail_tx(
        &self,
        tx: &Transaction<'_>,
        task_id: &str,
        tenant_id: &str,
        preview: &VoucherPreviewResult,
    ) -> Result<VoucherLedgerTaskDetail> {
        let mut entries = Vec::new();
        let mut suppliers = Vec::<SupplierRecord>::new();
        let mut funding_sources = Vec::<FundingSourceRecord>::new();
        let mut account_classifications = Vec::<AccountClassificationRecord>::new();
        let source_documents = Vec::<SourceDocumentRecord>::new();
        let mut seen_suppliers = HashSet::new();
        let mut seen_sources = HashSet::new();
        let mut seen_classifications = HashSet::new();

        for record in &preview.records {
            let budget_unit = self.upsert_budget_unit_tx(
                tx,
                tenant_id,
                record.budget_unit_name.as_deref(),
                None,
                None,
            )?;
            let funding_source = self.upsert_funding_source_tx(
                tx,
                tenant_id,
                record.funding_source_name.as_deref(),
            )?;
            let classification = self.upsert_account_classification_tx(
                tx,
                tenant_id,
                record.function_classification_code.as_deref(),
                record.economic_classification_code.as_deref(),
            )?;
            let budget_project = self.resolve_budget_project_tx(
                tx,
                tenant_id,
                budget_unit.as_ref().map(|item| item.id.as_str()),
                record.budget_project_name.as_deref(),
                record.project_catalog_id.as_deref(),
                record.indicator_document_no.as_deref(),
                funding_source.as_ref().map(|item| item.id.as_str()),
            )?;

            let supplier = match record.supplier_name.as_deref() {
                Some(name) if !name.trim().is_empty() => {
                    let id = self.upsert_named_record(tx, "suppliers", tenant_id, name, None)?;
                    let item = SupplierRecord {
                        id,
                        name: name.to_string(),
                    };
                    if seen_suppliers.insert(item.id.clone()) {
                        suppliers.push(item.clone());
                    }
                    Some(item)
                }
                _ => None,
            };

            if let Some(item) = &funding_source {
                if seen_sources.insert(item.id.clone()) {
                    funding_sources.push(item.clone());
                }
            }
            if let Some(item) = &classification {
                if seen_classifications.insert(item.id.clone()) {
                    account_classifications.push(item.clone());
                }
            }

            tx.execute(
                "INSERT INTO ledger_entries (
                    id, task_id, tenant_id, budget_project_id, voucher_no, account_code, account_name,
                    debit_amount, credit_amount, booked_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    Uuid::new_v4().to_string(),
                    task_id,
                    tenant_id,
                    budget_project.as_ref().map(|item| item.id.as_str()),
                    record.voucher_no,
                    record.account_code,
                    record.account_name,
                    record.debit_amount,
                    record.credit_amount,
                    record.booked_at,
                ],
            )
            .context("failed to insert ledger entry")?;

            entries.push(LedgerEntryRecord {
                id: Uuid::new_v4().to_string(),
                budget_project_id: budget_project.as_ref().map(|item| item.id.clone()),
                procurement_project_id: record.procurement_project_id.clone(),
                supplier_id: supplier.as_ref().map(|item| item.id.clone()),
                supplier_name: record.supplier_name.clone(),
                funding_source_id: funding_source.as_ref().map(|item| item.id.clone()),
                account_classification_id: classification.as_ref().map(|item| item.id.clone()),
                source_document_id: None,
                indicator_document_no: record.indicator_document_no.clone(),
                project_catalog_id: record.project_catalog_id.clone(),
                contract_no: record.contract_no.clone(),
                payment_order_no: record.payment_order_no.clone(),
                treasury_voucher_no: record.treasury_voucher_no.clone(),
                voucher_no: record.voucher_no.clone(),
                account_code: record.account_code.clone(),
                account_name: record.account_name.clone(),
                debit_amount: record.debit_amount.clone(),
                credit_amount: record.credit_amount.clone(),
                booked_at: record.booked_at.clone(),
                writeback_status: None,
                writeback_ref: None,
                reconciliation_status: Some("pending".to_string()),
                source_row: Some(record.source_row),
            });
        }

        Ok(build_voucher_task_detail(
            preview,
            entries.clone(),
            suppliers,
            funding_sources,
            account_classifications,
            source_documents,
            PaymentLinkageSummary {
                linked_payments: entries
                    .iter()
                    .filter(|item| item.payment_order_no.is_some())
                    .count(),
                unmatched_payments: entries
                    .iter()
                    .filter(|item| item.payment_order_no.is_none())
                    .count(),
                paid_without_ledger: 0,
                ledger_without_payment: entries
                    .iter()
                    .filter(|item| item.payment_order_no.is_none())
                    .count(),
                amount_gap: "0".to_string(),
            },
            LedgerLinkageSummary {
                linked_entries: entries.len(),
                ..LedgerLinkageSummary::default()
            },
        ))
    }

    fn load_treasury_detail(
        &self,
        conn: &Connection,
        task_id: &str,
        tenant_id: &str,
    ) -> Result<TreasuryPaymentTaskDetail> {
        let detail_json: String = conn.query_row(
            "SELECT detail_json FROM platform_tasks WHERE tenant_id = ?1 AND id = ?2",
            params![tenant_id, task_id],
            |row| row.get(0),
        )?;
        match serde_json::from_str::<TaskDetailPayload>(&detail_json)
            .context("failed to parse stored treasury detail")?
        {
            TaskDetailPayload::TreasuryPayment(detail) => Ok(detail),
            _ => anyhow::bail!("stored task detail is not treasury detail"),
        }
    }

    fn load_voucher_detail(
        &self,
        conn: &Connection,
        task_id: &str,
        tenant_id: &str,
    ) -> Result<VoucherLedgerTaskDetail> {
        let detail_json: String = conn.query_row(
            "SELECT detail_json FROM platform_tasks WHERE tenant_id = ?1 AND id = ?2",
            params![tenant_id, task_id],
            |row| row.get(0),
        )?;
        match serde_json::from_str::<TaskDetailPayload>(&detail_json)
            .context("failed to parse stored voucher detail")?
        {
            TaskDetailPayload::VoucherLedger(detail) => Ok(detail),
            _ => anyhow::bail!("stored task detail is not voucher detail"),
        }
    }

    fn load_procurement_detail(
        &self,
        conn: &Connection,
        task_id: &str,
        tenant_id: &str,
    ) -> Result<ProcurementTaskDetail> {
        let mut projects_statement = conn.prepare(
            "SELECT id, project_name, purchaser_name, announcement_type, project_code,
                    procurement_method, published_at, region, budget_amount, award_amount,
                    supplier_name, budget_unit_id, budget_project_id, supplier_id,
                    funding_source_id, account_classification_id, indicator_document_no,
                    project_catalog_id, notice_url, source_row, linkage_match_mode,
                    linkage_match_score, linkage_match_reasons_json
             FROM procurement_projects
             WHERE tenant_id = ?1 AND task_id = ?2
             ORDER BY source_row ASC, id ASC",
        )?;
        let mut projects = projects_statement
            .query_map(params![tenant_id, task_id], |row| {
                Ok(ProcurementProjectRecord {
                    id: row.get(0)?,
                    project_name: row.get(1)?,
                    purchaser_name: row.get(2)?,
                    announcement_type: row.get(3)?,
                    procurement_stage: None,
                    project_code: row.get(4)?,
                    procurement_method: row.get(5)?,
                    published_at: row.get(6)?,
                    region: row.get(7)?,
                    normalized_region: None,
                    budget_amount: row.get(8)?,
                    award_amount: row.get(9)?,
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
                    supplier_name: row.get(10)?,
                    budget_unit_id: row.get(11)?,
                    budget_project_id: row.get(12)?,
                    supplier_id: row.get(13)?,
                    funding_source_id: row.get(14)?,
                    account_classification_id: row.get(15)?,
                    indicator_document_no: row.get(16)?,
                    project_catalog_id: row.get(17)?,
                    notice_url: row.get(18)?,
                    source_evidence: None,
                    source_row: row.get::<_, Option<i64>>(19)?.map(|value| value as usize),
                    linkage_evidence: parse_linkage_evidence(
                        row.get(20)?,
                        row.get::<_, Option<i64>>(21)?,
                        row.get(22)?,
                    )?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut candidate_statement = conn.prepare(
            "SELECT procurement_project_id, budget_project_id
             FROM budget_procurement_link_candidates
             WHERE tenant_id = ?1",
        )?;
        let candidate_rows = candidate_statement
            .query_map(params![tenant_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut candidate_map = HashMap::<String, Vec<String>>::new();
        for (procurement_project_id, budget_project_id) in candidate_rows {
            candidate_map
                .entry(procurement_project_id)
                .or_default()
                .push(budget_project_id);
        }
        for project in &mut projects {
            if let Some(evidence) = project.linkage_evidence.as_mut() {
                if let Some(candidate_ids) = candidate_map.get(&project.id) {
                    evidence.candidate_budget_project_ids = candidate_ids.clone();
                } else if evidence.candidate_budget_project_ids.is_empty() {
                    if let Some(budget_project_id) = project.budget_project_id.clone() {
                        evidence.candidate_budget_project_ids = vec![budget_project_id];
                    }
                }
            }
        }

        let mut contracts_statement = conn.prepare(
            "SELECT id, procurement_project_id, contract_no, contract_published_at,
                    acceptance_summary, acceptance_status, contract_amount
             FROM procurement_contracts
             WHERE tenant_id = ?1 AND task_id = ?2
             ORDER BY id ASC",
        )?;
        let contracts = contracts_statement
            .query_map(params![tenant_id, task_id], |row| {
                Ok(ProcurementContractRecord {
                    id: row.get(0)?,
                    procurement_project_id: row.get(1)?,
                    contract_no: row.get(2)?,
                    contract_published_at: row.get(3)?,
                    acceptance_summary: row.get(4)?,
                    acceptance_status: row.get(5)?,
                    contract_amount: row.get(6)?,
                    supplier_id: None,
                    funding_source_id: None,
                    account_classification_id: None,
                    source_document_id: None,
                    writeback_status: None,
                    writeback_ref: None,
                    reconciliation_status: None,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut budget_units = Vec::new();
        let mut budget_projects = Vec::new();
        let mut suppliers = Vec::new();
        let mut funding_sources = Vec::new();
        let mut account_classifications = Vec::new();
        let mut seen_budget_units = HashSet::new();
        let mut seen_budget_projects = HashSet::new();
        let mut seen_suppliers = HashSet::new();
        let mut seen_funding_sources = HashSet::new();
        let mut seen_classifications = HashSet::new();

        for project in &projects {
            if let Some(id) = project.budget_unit_id.as_deref() {
                if seen_budget_units.insert(id.to_string()) {
                    if let Some(item) = conn
                        .query_row(
                            "SELECT id, code, name, region FROM budget_units WHERE tenant_id = ?1 AND id = ?2",
                            params![tenant_id, id],
                            |row| {
                                Ok(BudgetUnitRecord {
                                    id: row.get(0)?,
                                    code: row.get(1)?,
                                    name: row.get(2)?,
                                    region: row.get(3)?,
                                })
                            },
                        )
                        .optional()?
                    {
                        budget_units.push(item);
                    }
                }
            }
            if let Some(id) = project.budget_project_id.as_deref() {
                if seen_budget_projects.insert(id.to_string()) {
                    if let Some(item) = conn
                        .query_row(
                            "SELECT id, budget_unit_id, name, project_catalog_id, indicator_document_no, funding_source_id
                             FROM budget_projects WHERE tenant_id = ?1 AND id = ?2",
                            params![tenant_id, id],
                            |row| {
                                Ok(BudgetProjectRecord {
                                    id: row.get(0)?,
                                    budget_unit_id: row.get(1)?,
                                    name: row.get(2)?,
                                    project_catalog_id: row.get(3)?,
                                    indicator_document_no: row.get(4)?,
                                    funding_source_id: row.get(5)?,
                                })
                            },
                        )
                        .optional()?
                    {
                        budget_projects.push(item);
                    }
                }
            }
            if let Some(id) = project.supplier_id.as_deref() {
                if seen_suppliers.insert(id.to_string()) {
                    if let Some(item) = conn
                        .query_row(
                            "SELECT id, name FROM suppliers WHERE tenant_id = ?1 AND id = ?2",
                            params![tenant_id, id],
                            |row| {
                                Ok(SupplierRecord {
                                    id: row.get(0)?,
                                    name: row.get(1)?,
                                })
                            },
                        )
                        .optional()?
                    {
                        suppliers.push(item);
                    }
                }
            }
            if let Some(id) = project.funding_source_id.as_deref() {
                if seen_funding_sources.insert(id.to_string()) {
                    if let Some(item) = conn
                        .query_row(
                            "SELECT id, name FROM funding_sources WHERE tenant_id = ?1 AND id = ?2",
                            params![tenant_id, id],
                            |row| {
                                Ok(FundingSourceRecord {
                                    id: row.get(0)?,
                                    name: row.get(1)?,
                                })
                            },
                        )
                        .optional()?
                    {
                        funding_sources.push(item);
                    }
                }
            }
            if let Some(id) = project.account_classification_id.as_deref() {
                if seen_classifications.insert(id.to_string()) {
                    if let Some(item) = conn
                        .query_row(
                            "SELECT id, function_classification_code, economic_classification_code
                             FROM account_classifications WHERE tenant_id = ?1 AND id = ?2",
                            params![tenant_id, id],
                            |row| {
                                Ok(AccountClassificationRecord {
                                    id: row.get(0)?,
                                    function_classification_code: row.get(1)?,
                                    economic_classification_code: row.get(2)?,
                                })
                            },
                        )
                        .optional()?
                    {
                        account_classifications.push(item);
                    }
                }
            }
        }

        let mut source_statement = conn.prepare(
            "SELECT id, document_type, title, url, captured_at
             FROM source_documents
             WHERE tenant_id = ?1 AND task_id = ?2
             ORDER BY id ASC",
        )?;
        let source_documents = source_statement
            .query_map(params![tenant_id, task_id], |row| {
                Ok(SourceDocumentRecord {
                    id: row.get(0)?,
                    document_type: row.get(1)?,
                    title: row.get(2)?,
                    url: row.get(3)?,
                    captured_at: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let quality_report = self.load_quality_report(
            conn,
            tenant_id,
            "task",
            task_id,
            TaskKind::ProcurementProject,
        )?;

        Ok(ProcurementTaskDetail {
            projects,
            contracts,
            budget_units,
            budget_projects,
            suppliers,
            funding_sources,
            account_classifications,
            source_documents,
            quality_report,
            applicable_rule_sets: vec!["procurement_rules".to_string()],
        })
    }

    fn load_budget_detail(
        &self,
        conn: &Connection,
        task_id: &str,
        tenant_id: &str,
    ) -> Result<BudgetSummaryTaskDetail> {
        let detail_json: String = conn.query_row(
            "SELECT detail_json FROM platform_tasks WHERE tenant_id = ?1 AND id = ?2",
            params![tenant_id, task_id],
            |row| row.get(0),
        )?;
        let base_detail = match serde_json::from_str::<TaskDetailPayload>(&detail_json)
            .context("failed to parse stored budget detail")?
        {
            TaskDetailPayload::BudgetSummary(detail) => detail,
            _ => anyhow::bail!("stored task detail is not budget detail"),
        };

        let mut statement = conn.prepare(
            "SELECT id, period, region, budget_scope, direction, budget_unit_id, budget_project_id,
                    funding_source_id, account_classification_id, budget_unit_name, budget_unit_code,
                    budget_project_name, project_catalog_id, indicator_document_no, funding_source_name,
                    function_classification_code, function_classification_name,
                    economic_classification_code, economic_classification_name, summary_item,
                    budget_amount, actual_amount, previous_period_amount, yoy_rate, source_row
             FROM budget_summary_rows
             WHERE tenant_id = ?1 AND task_id = ?2
             ORDER BY source_row ASC, id ASC
             LIMIT 200",
        )?;
        let rows_preview = statement
            .query_map(params![tenant_id, task_id], |row| {
                Ok(BudgetSummaryRowRecord {
                    id: row.get(0)?,
                    period: row.get(1)?,
                    region: row.get(2)?,
                    budget_scope: row.get(3)?,
                    direction: row.get(4)?,
                    budget_unit_id: row.get(5)?,
                    budget_project_id: row.get(6)?,
                    funding_source_id: row.get(7)?,
                    account_classification_id: row.get(8)?,
                    budget_unit_name: row.get(9)?,
                    budget_unit_code: row.get(10)?,
                    budget_project_name: row.get(11)?,
                    project_catalog_id: row.get(12)?,
                    indicator_document_no: row.get(13)?,
                    funding_source_name: row.get(14)?,
                    function_classification_code: row.get(15)?,
                    function_classification_name: row.get(16)?,
                    economic_classification_code: row.get(17)?,
                    economic_classification_name: row.get(18)?,
                    summary_item: row.get(19)?,
                    budget_amount: row.get(20)?,
                    actual_amount: row.get(21)?,
                    previous_period_amount: row.get(22)?,
                    budget_value_unit: None,
                    actual_value_unit: None,
                    previous_period_value_unit: None,
                    normalized_actual_value: None,
                    yoy_rate: row.get(23)?,
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
                    source_row: row.get::<_, Option<i64>>(24)?.map(|value| value as usize),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let project_ids = rows_preview
            .iter()
            .filter_map(|row| row.budget_project_id.clone())
            .collect::<HashSet<_>>();
        let linkage_summary = if project_ids.is_empty() {
            BudgetLinkageSummary::default()
        } else {
            let exact_linked = conn.query_row(
                &format!(
                    "SELECT COUNT(1) FROM procurement_projects
                     WHERE tenant_id = ?1
                       AND budget_project_id IN ({})
                       AND IFNULL(linkage_match_mode, 'exact') = 'exact'",
                    placeholder_list(project_ids.len())
                ),
                rusqlite::params_from_iter(
                    std::iter::once(tenant_id.to_string()).chain(project_ids.iter().cloned()),
                ),
                |row| row.get::<_, i64>(0),
            )? as usize;
            let evidence_auto_linked = conn.query_row(
                &format!(
                    "SELECT COUNT(1) FROM procurement_projects
                     WHERE tenant_id = ?1
                       AND budget_project_id IN ({})
                       AND linkage_match_mode = 'evidence_auto'",
                    placeholder_list(project_ids.len())
                ),
                rusqlite::params_from_iter(
                    std::iter::once(tenant_id.to_string()).chain(project_ids.iter().cloned()),
                ),
                |row| row.get::<_, i64>(0),
            )? as usize;
            let candidate_linked = conn.query_row(
                &format!(
                    "SELECT COUNT(DISTINCT procurement_project_id)
                     FROM budget_procurement_link_candidates
                     WHERE tenant_id = ?1
                       AND budget_project_id IN ({})",
                    placeholder_list(project_ids.len())
                ),
                rusqlite::params_from_iter(
                    std::iter::once(tenant_id.to_string()).chain(project_ids.iter().cloned()),
                ),
                |row| row.get::<_, i64>(0),
            )? as usize;
            BudgetLinkageSummary {
                exact_linked_procurement_projects: exact_linked,
                evidence_auto_linked_procurement_projects: evidence_auto_linked,
                candidate_procurement_projects: candidate_linked,
                unlinked_procurement_projects: 0,
                ambiguous_matches: 0,
            }
        };

        Ok(BudgetSummaryTaskDetail {
            rows_preview,
            quality_report: self.load_quality_report(
                conn,
                tenant_id,
                "task",
                task_id,
                TaskKind::BudgetSummary,
            )?,
            linkage_summary,
            ..base_detail
        })
    }

    fn load_quality_report(
        &self,
        conn: &Connection,
        tenant_id: &str,
        owner_type: &str,
        owner_id: &str,
        task_kind: TaskKind,
    ) -> Result<super::ImportQualityReport> {
        let mut statement = conn.prepare(
            "SELECT severity, code, field_name, row_number, message
             FROM import_quality_reports
             WHERE tenant_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND task_kind = ?4
             ORDER BY created_at ASC",
        )?;
        let checks = statement
            .query_map(
                params![tenant_id, owner_type, owner_id, task_kind.as_str()],
                |row| {
                    Ok(QualityCheck {
                        severity: match row.get::<_, String>(0)?.as_str() {
                            "info" => QualitySeverity::Info,
                            "warning" => QualitySeverity::Warning,
                            _ => QualitySeverity::Error,
                        },
                        code: row.get(1)?,
                        field: row.get(2)?,
                        row_number: row.get::<_, Option<i64>>(3)?.map(|value| value as usize),
                        message: row.get(4)?,
                    })
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let summary = conn
            .query_row(
                "SELECT total_rows, accepted_rows, rejected_rows
                 FROM import_quality_report_summaries
                 WHERE tenant_id = ?1 AND owner_type = ?2 AND owner_id = ?3 AND task_kind = ?4",
                params![tenant_id, owner_type, owner_id, task_kind.as_str()],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? as usize,
                        row.get::<_, i64>(1)? as usize,
                        row.get::<_, i64>(2)? as usize,
                    ))
                },
            )
            .optional()?;
        let (total_rows, accepted_rows, rejected_rows) = summary.unwrap_or_else(|| {
            let rejected_rows = checks
                .iter()
                .filter(|check| check.severity == QualitySeverity::Error)
                .filter_map(|check| check.row_number)
                .collect::<HashSet<_>>()
                .len();
            let observed_rows = checks
                .iter()
                .filter_map(|check| check.row_number)
                .collect::<HashSet<_>>()
                .len();
            (
                observed_rows.max(checks.len().saturating_sub(rejected_rows)),
                observed_rows.saturating_sub(rejected_rows),
                rejected_rows,
            )
        });
        Ok(super::ImportQualityReport {
            total_rows,
            accepted_rows,
            rejected_rows,
            checks,
        })
    }

    fn upsert_budget_unit_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        name: Option<&str>,
        code: Option<&str>,
        region: Option<String>,
    ) -> Result<Option<BudgetUnitRecord>> {
        let Some(name) = name.filter(|value| !value.trim().is_empty()) else {
            return Ok(None);
        };
        let id = self.upsert_named_record(tx, "budget_units", tenant_id, name, region.clone())?;
        if let Some(code) = code.filter(|value| !value.trim().is_empty()) {
            tx.execute(
                "UPDATE budget_units SET code = COALESCE(code, ?3), region = COALESCE(region, ?4)
                 WHERE tenant_id = ?1 AND id = ?2",
                params![tenant_id, id, code, region],
            )
            .context("failed to upsert budget unit metadata")?;
        }
        Ok(Some(BudgetUnitRecord {
            id,
            code: code.map(|value| value.to_string()),
            name: name.to_string(),
            region,
        }))
    }

    fn upsert_funding_source_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        name: Option<&str>,
    ) -> Result<Option<FundingSourceRecord>> {
        let Some(name) = name.filter(|value| !value.trim().is_empty()) else {
            return Ok(None);
        };
        let existing = tx
            .query_row(
                "SELECT id FROM funding_sources WHERE tenant_id = ?1 AND lower(name) = lower(?2)",
                params![tenant_id, name],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .context("failed to query funding source")?;
        let id = match existing {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO funding_sources (id, tenant_id, name) VALUES (?1, ?2, ?3)",
                    params![id, tenant_id, name],
                )
                .context("failed to insert funding source")?;
                id
            }
        };
        Ok(Some(FundingSourceRecord {
            id,
            name: name.to_string(),
        }))
    }

    fn upsert_account_classification_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        function_code: Option<&str>,
        economic_code: Option<&str>,
    ) -> Result<Option<AccountClassificationRecord>> {
        if function_code.unwrap_or_default().trim().is_empty()
            && economic_code.unwrap_or_default().trim().is_empty()
        {
            return Ok(None);
        }
        let existing = tx
            .query_row(
                "SELECT id FROM account_classifications
                 WHERE tenant_id = ?1
                   AND IFNULL(function_classification_code, '') = IFNULL(?2, '')
                   AND IFNULL(economic_classification_code, '') = IFNULL(?3, '')",
                params![tenant_id, function_code, economic_code],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .context("failed to query account classification")?;
        let id = match existing {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO account_classifications (
                        id, tenant_id, function_classification_code, economic_classification_code
                     ) VALUES (?1, ?2, ?3, ?4)",
                    params![id, tenant_id, function_code, economic_code],
                )
                .context("failed to insert account classification")?;
                id
            }
        };
        Ok(Some(AccountClassificationRecord {
            id,
            function_classification_code: function_code.map(|value| value.to_string()),
            economic_classification_code: economic_code.map(|value| value.to_string()),
        }))
    }

    fn resolve_budget_project_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        budget_unit_id: Option<&str>,
        name: Option<&str>,
        project_catalog_id: Option<&str>,
        indicator_document_no: Option<&str>,
        funding_source_id: Option<&str>,
    ) -> Result<Option<BudgetProjectRecord>> {
        if name.unwrap_or_default().trim().is_empty()
            && project_catalog_id.unwrap_or_default().trim().is_empty()
            && indicator_document_no.unwrap_or_default().trim().is_empty()
        {
            return Ok(None);
        }

        let existing_id = if let Some(indicator_document_no) =
            indicator_document_no.filter(|value| !value.trim().is_empty())
        {
            tx.query_row(
                "SELECT id FROM budget_projects WHERE tenant_id = ?1 AND indicator_document_no = ?2",
                params![tenant_id, indicator_document_no],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .context("failed to query budget project by indicator document number")?
        } else if let (Some(project_catalog_id), Some(unit_id)) = (
            project_catalog_id.filter(|value| !value.trim().is_empty()),
            budget_unit_id,
        ) {
            tx.query_row(
                "SELECT id FROM budget_projects
                 WHERE tenant_id = ?1 AND project_catalog_id = ?2 AND IFNULL(budget_unit_id, '') = ?3",
                params![tenant_id, project_catalog_id, unit_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .context("failed to query budget project by catalog id")?
        } else if let (Some(name), Some(unit_id)) = (
            name.filter(|value| !value.trim().is_empty()),
            budget_unit_id,
        ) {
            tx.query_row(
                "SELECT id FROM budget_projects
                 WHERE tenant_id = ?1 AND IFNULL(budget_unit_id, '') = ?2 AND lower(name) = lower(?3)",
                params![tenant_id, unit_id, name],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .context("failed to query budget project by unit and name")?
        } else {
            None
        };

        let id = match existing_id {
            Some(id) => {
                tx.execute(
                    "UPDATE budget_projects
                     SET name = COALESCE(NULLIF(?3, ''), name),
                         project_catalog_id = COALESCE(NULLIF(?4, ''), project_catalog_id),
                         indicator_document_no = COALESCE(NULLIF(?5, ''), indicator_document_no),
                         funding_source_id = COALESCE(?6, funding_source_id)
                     WHERE tenant_id = ?1 AND id = ?2",
                    params![
                        tenant_id,
                        id,
                        name.unwrap_or_default(),
                        project_catalog_id.unwrap_or_default(),
                        indicator_document_no.unwrap_or_default(),
                        funding_source_id
                    ],
                )
                .context("failed to update budget project")?;
                id
            }
            None => {
                let id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO budget_projects (
                        id, tenant_id, budget_unit_id, name, project_catalog_id, indicator_document_no, funding_source_id
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        id,
                        tenant_id,
                        budget_unit_id,
                        name.unwrap_or("unnamed budget project"),
                        project_catalog_id,
                        indicator_document_no,
                        funding_source_id
                    ],
                )
                .context("failed to insert budget project")?;
                id
            }
        };

        Ok(Some(BudgetProjectRecord {
            id,
            budget_unit_id: budget_unit_id.map(|value| value.to_string()),
            name: name.unwrap_or("unnamed budget project").to_string(),
            project_catalog_id: project_catalog_id.map(|value| value.to_string()),
            indicator_document_no: indicator_document_no.map(|value| value.to_string()),
            funding_source_id: funding_source_id.map(|value| value.to_string()),
        }))
    }

    fn link_procurement_projects_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        budget_projects: &[BudgetProjectRecord],
    ) -> Result<BudgetLinkageSummary> {
        if budget_projects.is_empty() {
            return Ok(BudgetLinkageSummary::default());
        }
        let budget_project_candidates =
            self.load_budget_project_candidates_tx(tx, tenant_id, budget_projects)?;
        let mut statement = tx.prepare(
            "SELECT id, task_id, budget_unit_id, project_name, purchaser_name, indicator_document_no, project_catalog_id
             FROM procurement_projects
             WHERE tenant_id = ?1",
        )?;
        let procurement_rows = statement
            .query_map(params![tenant_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut affected_task_ids = HashSet::new();
        let mut exact_linked = 0usize;
        let mut evidence_auto_linked = 0usize;
        let mut candidate_linked = 0usize;
        let mut ambiguous = 0usize;
        let mut unlinked = 0usize;

        for (
            project_id,
            task_id,
            budget_unit_id,
            project_name,
            purchaser_name,
            indicator_document_no,
            project_catalog_id,
        ) in procurement_rows
        {
            self.clear_procurement_link_candidates_tx(tx, tenant_id, &project_id)?;

            let exact_candidates = budget_projects
                .iter()
                .filter(|item| {
                    if let (Some(left), Some(right)) = (
                        indicator_document_no.as_deref(),
                        item.indicator_document_no.as_deref(),
                    ) {
                        return left == right;
                    }
                    if let (Some(left), Some(right), Some(unit_id)) = (
                        project_catalog_id.as_deref(),
                        item.project_catalog_id.as_deref(),
                        budget_unit_id.as_deref(),
                    ) {
                        return left == right
                            && item.budget_unit_id.as_deref().unwrap_or_default() == unit_id;
                    }
                    if let Some(unit_id) = budget_unit_id.as_deref() {
                        return item.budget_unit_id.as_deref().unwrap_or_default() == unit_id
                            && normalize_project_key(&item.name)
                                == normalize_project_key(&project_name);
                    }
                    false
                })
                .map(|item| item.id.clone())
                .collect::<Vec<_>>();

            match exact_candidates.len() {
                1 => {
                    tx.execute(
                        "UPDATE procurement_projects
                         SET budget_project_id = ?3,
                             linkage_match_mode = 'exact',
                             linkage_match_score = 100,
                             linkage_match_reasons_json = ?4
                         WHERE tenant_id = ?1 AND id = ?2",
                        params![
                            tenant_id,
                            project_id,
                            exact_candidates[0],
                            serialize_json(&vec![
                                "matched by existing exact linkage rule".to_string()
                            ])?
                        ],
                    )
                    .context("failed to link procurement project to budget project")?;
                    affected_task_ids.insert(task_id);
                    exact_linked += 1;
                }
                0 => {
                    let procurement_project = ProcurementProjectRecord {
                        id: project_id.clone(),
                        project_name: project_name.clone(),
                        purchaser_name: purchaser_name.clone(),
                        announcement_type: String::new(),
                        procurement_stage: None,
                        project_code: String::new(),
                        procurement_method: None,
                        published_at: None,
                        region: None,
                        normalized_region: None,
                        budget_amount: None,
                        award_amount: None,
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
                        supplier_name: None,
                        budget_unit_id: budget_unit_id.clone(),
                        budget_project_id: None,
                        supplier_id: None,
                        funding_source_id: None,
                        account_classification_id: None,
                        indicator_document_no: indicator_document_no.clone(),
                        project_catalog_id: project_catalog_id.clone(),
                        notice_url: None,
                        source_evidence: None,
                        source_row: None,
                        linkage_evidence: None,
                    };
                    let mut evidence_candidates = budget_project_candidates
                        .iter()
                        .filter_map(|candidate| {
                            score_budget_link(&procurement_project, candidate)
                                .map(|evidence| (candidate.project.id.clone(), evidence))
                        })
                        .collect::<Vec<_>>();
                    let auto_matches = evidence_candidates
                        .iter()
                        .filter(|(_, evidence)| {
                            evidence.match_mode == ProcurementBudgetLinkMode::EvidenceAuto
                        })
                        .cloned()
                        .collect::<Vec<_>>();
                    if auto_matches.len() == 1 {
                        let (budget_project_id, evidence) = &auto_matches[0];
                        tx.execute(
                            "UPDATE procurement_projects
                             SET budget_project_id = ?3,
                                 linkage_match_mode = 'evidence_auto',
                                 linkage_match_score = ?4,
                                 linkage_match_reasons_json = ?5
                             WHERE tenant_id = ?1 AND id = ?2",
                            params![
                                tenant_id,
                                project_id,
                                budget_project_id,
                                i64::from(evidence.match_score),
                                serialize_json(&evidence.match_reasons)?,
                            ],
                        )
                        .context("failed to evidence-link procurement project to budget project")?;
                        affected_task_ids.insert(task_id);
                        evidence_auto_linked += 1;
                    } else if auto_matches.len() > 1 {
                        tx.execute(
                            "UPDATE procurement_projects
                             SET budget_project_id = NULL,
                                 linkage_match_mode = NULL,
                                 linkage_match_score = NULL,
                                 linkage_match_reasons_json = NULL
                             WHERE tenant_id = ?1 AND id = ?2",
                            params![tenant_id, project_id],
                        )
                        .context("failed to clear ambiguous procurement project linkage")?;
                        ambiguous += 1;
                    } else {
                        let candidate_matches = evidence_candidates
                            .drain(..)
                            .filter(|(_, evidence)| {
                                evidence.match_mode == ProcurementBudgetLinkMode::EvidenceCandidate
                            })
                            .collect::<Vec<_>>();
                        if !candidate_matches.is_empty() {
                            let mut top_score = 0u32;
                            let mut top_reasons = Vec::<String>::new();
                            for (budget_project_id, evidence) in &candidate_matches {
                                top_score = top_score.max(evidence.match_score);
                                if top_reasons.is_empty() {
                                    top_reasons = evidence.match_reasons.clone();
                                }
                                tx.execute(
                                    "INSERT INTO budget_procurement_link_candidates (
                                        id, tenant_id, procurement_project_id, budget_project_id,
                                        match_mode, match_score, match_reasons_json, created_at
                                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                                    params![
                                        Uuid::new_v4().to_string(),
                                        tenant_id,
                                        project_id,
                                        budget_project_id,
                                        "evidence_candidate",
                                        i64::from(evidence.match_score),
                                        serialize_json(&evidence.match_reasons)?,
                                        now_string(),
                                    ],
                                )
                                .context("failed to insert evidence candidate linkage")?;
                            }
                            tx.execute(
                                "UPDATE procurement_projects
                                 SET budget_project_id = NULL,
                                     linkage_match_mode = 'evidence_candidate',
                                     linkage_match_score = ?3,
                                     linkage_match_reasons_json = ?4
                                 WHERE tenant_id = ?1 AND id = ?2",
                                params![
                                    tenant_id,
                                    project_id,
                                    i64::from(top_score),
                                    serialize_json(&top_reasons)?,
                                ],
                            )
                            .context("failed to persist procurement candidate linkage state")?;
                            affected_task_ids.insert(task_id);
                            candidate_linked += 1;
                        } else {
                            tx.execute(
                                "UPDATE procurement_projects
                                 SET budget_project_id = NULL,
                                     linkage_match_mode = NULL,
                                     linkage_match_score = NULL,
                                     linkage_match_reasons_json = NULL
                                 WHERE tenant_id = ?1 AND id = ?2",
                                params![tenant_id, project_id],
                            )
                            .context("failed to clear procurement linkage state")?;
                            unlinked += 1;
                        }
                    }
                }
                _ => {
                    ambiguous += 1;
                }
            }
        }

        for task_id in affected_task_ids {
            let detail = self.load_procurement_detail(tx, &task_id, tenant_id)?;
            let findings = self.procurement_findings_from_detail(&detail);
            tx.execute(
                "UPDATE platform_tasks
                 SET detail_json = ?3, risk_level = ?4, updated_at = ?5
                 WHERE tenant_id = ?1 AND id = ?2",
                params![
                    tenant_id,
                    task_id,
                    serialize_json(&TaskDetailPayload::ProcurementProject(detail))?,
                    highest_risk_level(&findings),
                    now_string(),
                ],
            )
            .context("failed to refresh procurement task detail json")?;
            self.replace_platform_task_findings(tx, tenant_id, &task_id, &findings)?;
        }

        Ok(BudgetLinkageSummary {
            exact_linked_procurement_projects: exact_linked,
            evidence_auto_linked_procurement_projects: evidence_auto_linked,
            candidate_procurement_projects: candidate_linked,
            unlinked_procurement_projects: unlinked,
            ambiguous_matches: ambiguous,
        })
    }

    fn load_budget_project_candidates_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        budget_projects: &[BudgetProjectRecord],
    ) -> Result<Vec<BudgetProjectCandidate>> {
        let mut candidates = Vec::new();
        for project in budget_projects {
            let budget_unit_name = if let Some(unit_id) = project.budget_unit_id.as_deref() {
                tx.query_row(
                    "SELECT name FROM budget_units WHERE tenant_id = ?1 AND id = ?2",
                    params![tenant_id, unit_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .context("failed to load budget unit name for linkage candidate")?
                .unwrap_or_default()
            } else {
                String::new()
            };
            let summary_item = tx
                .query_row(
                    "SELECT summary_item
                     FROM budget_summary_rows
                     WHERE tenant_id = ?1 AND budget_project_id = ?2
                     ORDER BY source_row ASC, id ASC
                     LIMIT 1",
                    params![tenant_id, project.id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .context("failed to load budget summary item for linkage candidate")?
                .flatten();
            candidates.push(BudgetProjectCandidate {
                project: project.clone(),
                budget_unit_name,
                summary_item,
            });
        }
        Ok(candidates)
    }

    fn clear_procurement_link_candidates_tx(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        procurement_project_id: &str,
    ) -> Result<()> {
        tx.execute(
            "DELETE FROM budget_procurement_link_candidates
             WHERE tenant_id = ?1 AND procurement_project_id = ?2",
            params![tenant_id, procurement_project_id],
        )
        .context("failed to clear procurement link candidates")?;
        Ok(())
    }

    fn upsert_named_record(
        &self,
        tx: &Transaction<'_>,
        table_name: &str,
        tenant_id: &str,
        name: &str,
        region: Option<String>,
    ) -> Result<String> {
        let existing = match table_name {
            "budget_units" => tx
                .query_row(
                    "SELECT id FROM budget_units WHERE tenant_id = ?1 AND lower(name) = lower(?2)",
                    params![tenant_id, name],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .context("failed to query budget unit")?,
            "suppliers" => tx
                .query_row(
                    "SELECT id FROM suppliers WHERE tenant_id = ?1 AND lower(name) = lower(?2)",
                    params![tenant_id, name],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .context("failed to query supplier")?,
            other => anyhow::bail!("unsupported named table {}", other),
        };
        if let Some(existing) = existing {
            return Ok(existing);
        }

        let id = Uuid::new_v4().to_string();
        match table_name {
            "budget_units" => {
                tx.execute(
                    "INSERT INTO budget_units (id, tenant_id, code, name, region)
                     VALUES (?1, ?2, NULL, ?3, ?4)",
                    params![id, tenant_id, name, region],
                )
                .context("failed to insert budget unit")?;
            }
            "suppliers" => {
                tx.execute(
                    "INSERT INTO suppliers (id, tenant_id, name)
                     VALUES (?1, ?2, ?3)",
                    params![id, tenant_id, name],
                )
                .context("failed to insert supplier")?;
            }
            _ => {}
        }
        Ok(id)
    }

    fn procurement_findings_from_detail(
        &self,
        detail: &ProcurementTaskDetail,
    ) -> Vec<PlatformTaskFinding> {
        evaluate_procurement_rules(&self.procurement_records_from_detail(detail))
    }

    fn procurement_records_from_detail(
        &self,
        detail: &ProcurementTaskDetail,
    ) -> Vec<ProcurementImportRecord> {
        detail
            .projects
            .iter()
            .map(|project| {
                let contract = detail
                    .contracts
                    .iter()
                    .find(|item| item.procurement_project_id == project.id);
                ProcurementImportRecord {
                    project_name: project.project_name.clone(),
                    purchaser_name: project.purchaser_name.clone(),
                    announcement_type: project.announcement_type.clone(),
                    procurement_stage: project.procurement_stage,
                    project_code: project.project_code.clone(),
                    procurement_method: project.procurement_method.clone(),
                    published_at: project.published_at.clone(),
                    region: project.region.clone(),
                    normalized_region: project.normalized_region.clone(),
                    budget_amount: project.budget_amount.clone(),
                    award_amount: project.award_amount.clone(),
                    budget_amount_unit: None,
                    award_amount_unit: None,
                    normalized_budget_amount_yuan: None,
                    normalized_award_amount_yuan: None,
                    framework_agreement_flag: project.framework_agreement_flag,
                    amount_semantic_type: project.amount_semantic_type,
                    quote_amount: project.quote_amount.clone(),
                    quote_amount_unit: project.quote_amount_unit,
                    discount_rate: project.discount_rate.clone(),
                    unit_price: project.unit_price.clone(),
                    total_award_amount: project.total_award_amount.clone(),
                    framework_limit_amount: project.framework_limit_amount.clone(),
                    framework_limit_unit: project.framework_limit_unit,
                    framework_limit_condition: project.framework_limit_condition.clone(),
                    package_no: project.package_no.clone(),
                    package_name: project.package_name.clone(),
                    package_budget_amount: project.package_budget_amount.clone(),
                    package_award_amount: project.package_award_amount.clone(),
                    declared_total_award_amount: project.declared_total_award_amount.clone(),
                    declared_budget_amount: project.declared_budget_amount.clone(),
                    ceiling_amount: project.ceiling_amount.clone(),
                    package_sum_amount: project.package_sum_amount.clone(),
                    amount_consistency_status: project.amount_consistency_status.clone(),
                    amount_difference_yuan: project.amount_difference_yuan.clone(),
                    amount_check_reason: project.amount_check_reason.clone(),
                    acceptance_management_flag: project.acceptance_management_flag,
                    acceptance_plan: project.acceptance_plan.clone(),
                    acceptance_opinion: project.acceptance_opinion.clone(),
                    acceptance_archive_status: project.acceptance_archive_status.clone(),
                    acceptance_archive_locator: project.acceptance_archive_locator.clone(),
                    acceptance_issue_summary: project.acceptance_issue_summary.clone(),
                    service_period: project.service_period.clone(),
                    maintenance_period: project.maintenance_period.clone(),
                    warranty_period: project.warranty_period.clone(),
                    acceptance_standard: project.acceptance_standard.clone(),
                    acceptance_result: project.acceptance_result.clone(),
                    acceptance_result_locator: project.acceptance_result_locator.clone(),
                    service_period_source: project.service_period_source.clone(),
                    warranty_maintenance_source: project.warranty_maintenance_source.clone(),
                    settlement_basis: project.settlement_basis.clone(),
                    payment_trigger: project.payment_trigger.clone(),
                    payment_deadline: project.payment_deadline.clone(),
                    payment_condition_source: project.payment_condition_source.clone(),
                    contract_performance_period: project.contract_performance_period.clone(),
                    government_purchase_service_flag: project.government_purchase_service_flag,
                    joint_bid_allowed_flag: project.joint_bid_allowed_flag,
                    sme_policy_requirement: project.sme_policy_requirement.clone(),
                    credit_financing_policy_flag: project.credit_financing_policy_flag,
                    procurement_policy_note: project.procurement_policy_note.clone(),
                    procurement_exception_type: project.procurement_exception_type.clone(),
                    complaint_decision_no: project.complaint_decision_no.clone(),
                    complaint_issue_summary: project.complaint_issue_summary.clone(),
                    complaint_handling_result: project.complaint_handling_result.clone(),
                    allegation_type: project.allegation_type.clone(),
                    allegation_outcome: project.allegation_outcome.clone(),
                    confirmed_fact_flag: project.confirmed_fact_flag,
                    remedy_action: project.remedy_action.clone(),
                    remedy_required_flag: project.remedy_required_flag,
                    allegation_evidence_weight: project.allegation_evidence_weight,
                    allegation_weight_reason: project.allegation_weight_reason.clone(),
                    false_material_flag: project.false_material_flag,
                    award_invalidated_flag: project.award_invalidated_flag,
                    rebid_required_flag: project.rebid_required_flag,
                    correction_notice_flag: project.correction_notice_flag,
                    supervision_penalty_subject: project.supervision_penalty_subject.clone(),
                    affected_package_no: project.affected_package_no.clone(),
                    penalty_decision_no: project.penalty_decision_no.clone(),
                    penalty_basis: project.penalty_basis.clone(),
                    penalty_basis_article: project.penalty_basis_article.clone(),
                    penalty_period: project.penalty_period.clone(),
                    market_entry_restriction_scope: project.market_entry_restriction_scope.clone(),
                    penalty_subject_type: project.penalty_subject_type.clone(),
                    penalty_subject_name: project.penalty_subject_name.clone(),
                    credit_repair_status: project.credit_repair_status.clone(),
                    credit_repair_source_url: project.credit_repair_source_url.clone(),
                    re_participation_review_flag: project.re_participation_review_flag,
                    exception_evidence_category: project.exception_evidence_category.clone(),
                    exception_evidence_weight: project.exception_evidence_weight,
                    exception_weight_reason: project.exception_weight_reason.clone(),
                    source_region_scope: project.source_region_scope.clone(),
                    source_province: project.source_province.clone(),
                    source_city: project.source_city.clone(),
                    source_region_code: project.source_region_code.clone(),
                    publisher_level: project.publisher_level.clone(),
                    central_unit_flag: project.central_unit_flag,
                    purchaser_region_code: project.purchaser_region_code.clone(),
                    procurement_channel: project.procurement_channel.clone(),
                    platform_order_no: project.platform_order_no.clone(),
                    item_name: project.item_name.clone(),
                    item_quantity: project.item_quantity.clone(),
                    item_unit: project.item_unit.clone(),
                    unit_price_amount: project.unit_price_amount.clone(),
                    unit_price_unit: project.unit_price_unit,
                    order_total_amount: project.order_total_amount.clone(),
                    order_total_unit: project.order_total_unit,
                    procurement_intention_flag: project.procurement_intention_flag,
                    intention_budget_amount: project.intention_budget_amount.clone(),
                    intention_expected_procurement_at: project
                        .intention_expected_procurement_at
                        .clone(),
                    intention_followup_status: project.intention_followup_status.clone(),
                    batch_month: project.batch_month.clone(),
                    batch_category: project.batch_category.clone(),
                    product_category: project.product_category.clone(),
                    manufacturer: project.manufacturer.clone(),
                    model: project.model.clone(),
                    batch_lot_no: project.batch_lot_no.clone(),
                    batch_total_amount: project.batch_total_amount.clone(),
                    lot_award_amount: project.lot_award_amount.clone(),
                    supplier_name: project.supplier_name.clone(),
                    budget_project_id: project.budget_project_id.clone(),
                    contract_no: contract.and_then(|item| item.contract_no.clone()),
                    contract_published_at: contract
                        .and_then(|item| item.contract_published_at.clone()),
                    acceptance_summary: contract.and_then(|item| item.acceptance_summary.clone()),
                    acceptance_status: contract.and_then(|item| item.acceptance_status.clone()),
                    notice_url: project.notice_url.clone(),
                    indicator_document_no: project.indicator_document_no.clone(),
                    project_catalog_id: project.project_catalog_id.clone(),
                    function_classification_code: detail
                        .account_classifications
                        .iter()
                        .find(|item| {
                            Some(item.id.as_str()) == project.account_classification_id.as_deref()
                        })
                        .and_then(|item| item.function_classification_code.clone()),
                    economic_classification_code: detail
                        .account_classifications
                        .iter()
                        .find(|item| {
                            Some(item.id.as_str()) == project.account_classification_id.as_deref()
                        })
                        .and_then(|item| item.economic_classification_code.clone()),
                    source_evidence: project.source_evidence.clone(),
                    source_row: project.source_row.unwrap_or_default(),
                }
            })
            .collect()
    }

    fn insert_platform_task_findings(
        &self,
        tx: &Transaction<'_>,
        task: &PlatformTask,
    ) -> Result<()> {
        for finding in &task.findings {
            tx.execute(
                "INSERT INTO platform_task_findings (
                    id, task_id, tenant_id, rule_code, rule_name, rule_category, risk_level,
                    summary, audit_rationale, recommended_action, evidence_summary, finding_status,
                    assignee, disposition_note, disposition_priority, disposition_outcome, remediation_due_at,
                    reminder_flag, disposed_at, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
                params![
                    finding.id,
                    task.id,
                    task.tenant_id,
                    finding.rule_code,
                    finding.rule_name,
                    finding.rule_category,
                    finding.risk_level,
                    finding.summary,
                    finding.audit_rationale,
                    finding.recommended_action,
                    finding.evidence_summary,
                    finding.finding_status,
                    finding.assignee,
                    finding.disposition_note,
                    finding.disposition_priority,
                    finding.disposition_outcome,
                    finding.remediation_due_at,
                    if finding.reminder_flag { 1_i64 } else { 0_i64 },
                    finding.disposed_at,
                    now_string(),
                ],
            )
            .context("failed to insert platform task finding")?;
        }
        Ok(())
    }

    fn replace_platform_task_findings(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        task_id: &str,
        findings: &[PlatformTaskFinding],
    ) -> Result<()> {
        tx.execute(
            "DELETE FROM platform_task_findings WHERE tenant_id = ?1 AND task_id = ?2",
            params![tenant_id, task_id],
        )
        .context("failed to delete existing platform task findings")?;
        for finding in findings {
            tx.execute(
                "INSERT INTO platform_task_findings (
                    id, task_id, tenant_id, rule_code, rule_name, rule_category, risk_level,
                    summary, audit_rationale, recommended_action, evidence_summary, finding_status,
                    assignee, disposition_note, disposition_priority, disposition_outcome, remediation_due_at,
                    reminder_flag, disposed_at, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
                params![
                    finding.id,
                    task_id,
                    tenant_id,
                    finding.rule_code,
                    finding.rule_name,
                    finding.rule_category,
                    finding.risk_level,
                    finding.summary,
                    finding.audit_rationale,
                    finding.recommended_action,
                    finding.evidence_summary,
                    finding.finding_status,
                    finding.assignee,
                    finding.disposition_note,
                    finding.disposition_priority,
                    finding.disposition_outcome,
                    finding.remediation_due_at,
                    if finding.reminder_flag { 1_i64 } else { 0_i64 },
                    finding.disposed_at,
                    now_string(),
                ],
            )
            .context("failed to replace platform task finding")?;
        }
        Ok(())
    }

    fn insert_quality_checks(
        &self,
        tx: &Transaction<'_>,
        tenant_id: &str,
        owner_type: &str,
        owner_id: &str,
        task_kind: TaskKind,
        report: &ImportQualityReport,
    ) -> Result<()> {
        tx.execute(
            "INSERT INTO import_quality_report_summaries (
                id, tenant_id, owner_type, owner_id, task_kind, total_rows, accepted_rows, rejected_rows, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(tenant_id, owner_type, owner_id, task_kind) DO UPDATE SET
                total_rows = excluded.total_rows,
                accepted_rows = excluded.accepted_rows,
                rejected_rows = excluded.rejected_rows,
                created_at = excluded.created_at",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                owner_type,
                owner_id,
                task_kind.as_str(),
                report.total_rows as i64,
                report.accepted_rows as i64,
                report.rejected_rows as i64,
                now_string(),
            ],
        )
        .context("failed to upsert import quality report summary")?;
        for check in &report.checks {
            tx.execute(
                "INSERT INTO import_quality_reports (
                    id, tenant_id, owner_type, owner_id, task_kind, severity, code,
                    field_name, row_number, message, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    Uuid::new_v4().to_string(),
                    tenant_id,
                    owner_type,
                    owner_id,
                    task_kind.as_str(),
                    check.severity.as_str(),
                    check.code,
                    check.field,
                    check.row_number.map(|value| value as i64),
                    check.message,
                    now_string(),
                ],
            )
            .context("failed to insert import quality check")?;
        }
        Ok(())
    }
}

fn row_to_platform_task_summary(row: &Row<'_>) -> rusqlite::Result<PlatformTaskSummary> {
    Ok(PlatformTaskSummary {
        id: row.get(0)?,
        task_kind: parse_task_kind(row.get::<_, String>(1)?)?,
        title: row.get(2)?,
        source_kind: parse_import_source(row.get::<_, String>(3)?)?,
        status: parse_platform_task_status(row.get::<_, String>(4)?)?,
        risk_level: row.get(5)?,
        primary_subject: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn row_to_platform_task(row: &Row<'_>) -> rusqlite::Result<PlatformTask> {
    let detail_json: String = row.get(9)?;
    Ok(PlatformTask {
        id: row.get(0)?,
        tenant_id: row.get(1)?,
        organization_id: row.get(2)?,
        task_kind: parse_task_kind(row.get::<_, String>(3)?)?,
        title: row.get(4)?,
        source_kind: parse_import_source(row.get::<_, String>(5)?)?,
        status: parse_platform_task_status(row.get::<_, String>(6)?)?,
        risk_level: row.get(7)?,
        primary_subject: row.get(8)?,
        findings: Vec::new(),
        detail: deserialize_json(9, &detail_json)?,
        budget_linkage_summary: BudgetLinkageSummary::default(),
        contract_linkage_summary: ContractLinkageSummary::default(),
        payment_linkage_summary: PaymentLinkageSummary::default(),
        ledger_linkage_summary: LedgerLinkageSummary::default(),
        created_by: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn row_to_platform_task_finding(row: &Row<'_>) -> rusqlite::Result<PlatformTaskFinding> {
    Ok(PlatformTaskFinding {
        id: row.get(0)?,
        rule_code: row.get(1)?,
        rule_name: row.get(2)?,
        rule_category: row.get(3)?,
        risk_level: row.get(4)?,
        summary: row.get(5)?,
        audit_rationale: row.get(6)?,
        recommended_action: row.get(7)?,
        evidence_summary: row.get(8)?,
        severity_reason: None,
        missing_evidence: Vec::new(),
        recommended_next_data: Vec::new(),
        finding_disposition: None,
        finding_status: row.get(9)?,
        assignee: row.get(10)?,
        disposition_note: row.get(11)?,
        disposition_priority: row.get(12)?,
        disposition_outcome: row.get(13)?,
        remediation_due_at: row.get(14)?,
        reminder_flag: row.get::<_, i64>(15)? != 0,
        disposed_at: row.get(16)?,
    })
}

fn parse_task_kind(value: String) -> rusqlite::Result<TaskKind> {
    TaskKind::from_str(&value).map_err(|error| conversion_error(error))
}

fn parse_import_profile_scope(value: String) -> rusqlite::Result<ImportProfileScope> {
    ImportProfileScope::from_str(&value).map_err(|error| conversion_error(error))
}

fn parse_automation_schedule_kind(value: String) -> rusqlite::Result<AutomationScheduleKind> {
    AutomationScheduleKind::from_str(&value).map_err(|error| conversion_error(error))
}

fn parse_automation_target_kind(value: String) -> rusqlite::Result<AutomationTargetKind> {
    AutomationTargetKind::from_str(&value).map_err(|error| conversion_error(error))
}

fn parse_import_source(value: String) -> rusqlite::Result<ImportSourceKind> {
    ImportSourceKind::from_str(&value).map_err(|error| conversion_error(error))
}

fn parse_platform_task_status(value: String) -> rusqlite::Result<PlatformTaskStatus> {
    PlatformTaskStatus::from_str(&value).map_err(|error| conversion_error(error))
}

fn conversion_error(error: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        Type::Text,
        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
    )
}

fn serialize_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).context("failed to serialize json")
}

fn parse_case_seed_assignment_field(value: &str) -> Result<CaseSeedAssignmentField> {
    match value {
        "source_department" => Ok(CaseSeedAssignmentField::SourceDepartment),
        "rectification_unit_name" => Ok(CaseSeedAssignmentField::RectificationUnitName),
        other => anyhow::bail!("unsupported case seed assignment field {}", other),
    }
}

fn row_to_import_profile(row: &Row<'_>) -> rusqlite::Result<ImportProfile> {
    let task_kind: String = row.get(2)?;
    let scope: String = row.get(4)?;
    let mapping_raw: String = row.get(7)?;
    let rules_raw: String = row.get(8)?;
    Ok(ImportProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        task_kind: parse_task_kind(task_kind)?,
        template_kind: row.get(3)?,
        scope: parse_import_profile_scope(scope)?,
        owner_user_id: row.get(5)?,
        is_default: row.get::<_, i64>(6)? != 0,
        mapping_overrides: deserialize_json(7, &mapping_raw)?,
        assignment_rules: deserialize_json(8, &rules_raw)?,
        notes: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn row_to_assignment_dictionary_rule(row: &Row<'_>) -> rusqlite::Result<AssignmentDictionaryRule> {
    let task_kind: String = row.get(1)?;
    let scope: String = row.get(8)?;
    Ok(AssignmentDictionaryRule {
        id: row.get(0)?,
        task_kind: parse_task_kind(task_kind)?,
        template_kind: row.get(2)?,
        match_field: row.get(3)?,
        match_value: row.get(4)?,
        assignee: row.get(5)?,
        target_department: row.get(6)?,
        priority: row.get::<_, i64>(7)? as u32,
        scope: parse_import_profile_scope(scope)?,
        enabled: row.get::<_, i64>(9)? != 0,
        label: row.get(10)?,
        owner_user_id: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn row_to_automation_schedule(row: &Row<'_>) -> rusqlite::Result<AutomationSchedule> {
    let schedule_kind: String = row.get(2)?;
    let target_kind: String = row.get(3)?;
    Ok(AutomationSchedule {
        id: row.get(0)?,
        name: row.get(1)?,
        schedule_kind: parse_automation_schedule_kind(schedule_kind)?,
        target_kind: parse_automation_target_kind(target_kind)?,
        enabled: row.get::<_, i64>(4)? != 0,
        shared_profile_id: row.get(5)?,
        connector_profile_id: row.get(6)?,
        source_path: row.get(7)?,
        notes: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        last_run_at: row.get(11)?,
    })
}

fn row_to_automation_execution(row: &Row<'_>) -> rusqlite::Result<AutomationExecution> {
    let schedule_kind: String = row.get(2)?;
    let target_kind: String = row.get(3)?;
    let summary_raw: String = row.get(9)?;
    Ok(AutomationExecution {
        id: row.get(0)?,
        schedule_id: row.get(1)?,
        schedule_kind: parse_automation_schedule_kind(schedule_kind)?,
        target_kind: parse_automation_target_kind(target_kind)?,
        status: row.get(4)?,
        trigger_kind: row.get(5)?,
        trigger_window: row.get(6)?,
        retry_count: row.get::<_, i64>(7)? as usize,
        last_error: row.get(8)?,
        summary: deserialize_json(9, &summary_raw)?,
        started_at: row.get(10)?,
        finished_at: row.get(11)?,
    })
}

fn finding_case_status_label(status: FindingCaseStatus) -> &'static str {
    match status {
        FindingCaseStatus::Open => "Open",
        FindingCaseStatus::InReview => "InReview",
        FindingCaseStatus::Resolved => "Resolved",
        FindingCaseStatus::Closed => "Closed",
    }
}

fn deserialize_json<T: DeserializeOwned>(index: usize, raw: &str) -> rusqlite::Result<T> {
    serde_json::from_str(raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
    })
}

fn add_column_if_missing(
    conn: &Connection,
    table_name: &str,
    column_name: &str,
    column_definition: &str,
) -> Result<()> {
    let sql = format!(
        "ALTER TABLE {} ADD COLUMN {} {}",
        table_name, column_name, column_definition
    );
    match conn.execute(&sql, []) {
        Ok(_) => Ok(()),
        Err(error) => {
            let message = error.to_string().to_ascii_lowercase();
            if message.contains("duplicate column name") {
                Ok(())
            } else {
                Err(error).with_context(|| {
                    format!(
                        "failed to add optional column {}.{}",
                        table_name, column_name
                    )
                })
            }
        }
    }
}

fn parse_linkage_evidence(
    match_mode: Option<String>,
    match_score: Option<i64>,
    match_reasons_json: Option<String>,
) -> Result<Option<ProcurementBudgetLinkEvidence>, rusqlite::Error> {
    let Some(mode_raw) = match_mode else {
        return Ok(None);
    };
    let match_mode = ProcurementBudgetLinkMode::from_str(&mode_raw).map_err(conversion_error)?;
    let reasons = match match_reasons_json {
        Some(raw) if !raw.trim().is_empty() => deserialize_json(0, &raw)?,
        _ => Vec::<String>::new(),
    };
    let score = match_score.unwrap_or_default().max(0) as u32;
    Ok(Some(ProcurementBudgetLinkEvidence {
        match_mode,
        match_score: score,
        match_reasons: reasons,
        candidate_budget_project_ids: Vec::new(),
        linkage_confidence: score,
        candidate_matches: Vec::new(),
        unmatched_reason: if matches!(match_mode, ProcurementBudgetLinkMode::None) {
            Some("no budget project match recorded".to_string())
        } else {
            None
        },
    }))
}

fn highest_risk_level(findings: &[PlatformTaskFinding]) -> String {
    let mut best = 0;
    let mut label = "Low";
    for finding in findings {
        let score = match finding.risk_level.as_str() {
            "Critical" => 4,
            "High" => 3,
            "Medium" => 2,
            _ => 1,
        };
        if score > best {
            best = score;
            label = finding.risk_level.as_str();
        }
    }
    label.to_string()
}

fn placeholder_list(len: usize) -> String {
    std::iter::repeat("?")
        .take(len)
        .collect::<Vec<_>>()
        .join(", ")
}

fn normalize_project_key(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|character| {
            character.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(character)
        })
        .flat_map(|character| character.to_lowercase())
        .collect()
}

#[derive(Default)]
struct TenantChainPool {
    vouchers: Vec<TreasuryPaymentVoucherRecord>,
    entries: Vec<LedgerEntryRecord>,
}

#[derive(Default)]
struct ProcurementMatchKeys {
    budget_project_ids: HashSet<String>,
    contract_nos: HashSet<String>,
    indicator_document_nos: HashSet<String>,
    project_catalog_ids: HashSet<String>,
}

fn normalized_option(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn option_matches(left: Option<&str>, right: Option<&str>) -> bool {
    matches!(
        (normalized_option(left), normalized_option(right)),
        (Some(left), Some(right)) if left == right
    )
}

fn parse_decimal_value(value: &str) -> Decimal {
    Decimal::from_str(value.trim()).unwrap_or(Decimal::ZERO)
}

fn automation_trigger_window(
    now: chrono::NaiveDateTime,
    schedule_kind: AutomationScheduleKind,
) -> String {
    match schedule_kind {
        AutomationScheduleKind::ManualOnly => now.format("%Y-%m-%d %H:%M:%S").to_string(),
        AutomationScheduleKind::Hourly => now.format("%Y-%m-%d %H").to_string(),
        AutomationScheduleKind::Daily => now.format("%Y-%m-%d").to_string(),
        AutomationScheduleKind::Weekly => {
            let iso = now.date().iso_week();
            format!("{:04}-W{:02}", iso.year(), iso.week())
        }
    }
}

fn automation_schedule_is_due(schedule: &AutomationSchedule, now: chrono::NaiveDateTime) -> bool {
    if !schedule.enabled || schedule.schedule_kind == AutomationScheduleKind::ManualOnly {
        return false;
    }
    let current_window = automation_trigger_window(now, schedule.schedule_kind);
    match schedule.last_run_at.as_deref().and_then(parse_iso_datetime) {
        Some(last_run_at) => {
            automation_trigger_window(last_run_at, schedule.schedule_kind) != current_window
        }
        None => true,
    }
}

fn decimal_to_string(value: Decimal) -> String {
    value.normalize().to_string()
}

fn sum_ledger_entries(entries: &[LedgerEntryRecord]) -> Decimal {
    let mut grouped = HashMap::<String, (Decimal, Decimal)>::new();
    for entry in entries {
        let totals = grouped
            .entry(entry.voucher_no.clone())
            .or_insert((Decimal::ZERO, Decimal::ZERO));
        totals.0 += parse_decimal_value(&entry.debit_amount);
        totals.1 += parse_decimal_value(&entry.credit_amount);
    }
    grouped
        .into_values()
        .map(|(debit, credit)| debit.max(credit))
        .sum()
}

fn parse_iso_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d").ok()
}

fn is_timing_exception(voucher: &TreasuryPaymentVoucherRecord, entry: &LedgerEntryRecord) -> bool {
    match (
        parse_iso_date(&voucher.paid_at),
        parse_iso_date(&entry.booked_at),
    ) {
        (Some(paid_at), Some(booked_at)) => {
            booked_at < paid_at || (booked_at - paid_at).num_days().abs() > 7
        }
        _ => false,
    }
}

fn voucher_matches_entry(
    voucher: &TreasuryPaymentVoucherRecord,
    entry: &LedgerEntryRecord,
) -> bool {
    option_matches(
        voucher.payment_order_no.as_deref(),
        entry.payment_order_no.as_deref(),
    ) || option_matches(
        voucher.treasury_voucher_no.as_deref(),
        entry.treasury_voucher_no.as_deref(),
    ) || option_matches(voucher.contract_no.as_deref(), entry.contract_no.as_deref())
        || option_matches(
            voucher.budget_project_id.as_deref(),
            entry.budget_project_id.as_deref(),
        )
        || option_matches(
            voucher.indicator_document_no.as_deref(),
            entry.indicator_document_no.as_deref(),
        )
        || option_matches(
            voucher.project_catalog_id.as_deref(),
            entry.project_catalog_id.as_deref(),
        )
}

fn insert_if_present(target: &mut HashSet<String>, value: Option<&str>) {
    if let Some(value) = normalized_option(value) {
        target.insert(value);
    }
}

fn procurement_match_keys(detail: &ProcurementTaskDetail) -> ProcurementMatchKeys {
    let mut keys = ProcurementMatchKeys::default();
    for project in &detail.projects {
        insert_if_present(
            &mut keys.budget_project_ids,
            project.budget_project_id.as_deref(),
        );
        insert_if_present(
            &mut keys.indicator_document_nos,
            project.indicator_document_no.as_deref(),
        );
        insert_if_present(
            &mut keys.project_catalog_ids,
            project.project_catalog_id.as_deref(),
        );
    }
    for contract in &detail.contracts {
        insert_if_present(&mut keys.contract_nos, contract.contract_no.as_deref());
    }
    keys
}

fn record_matches_procurement_keys(
    budget_project_id: Option<&str>,
    contract_no: Option<&str>,
    indicator_document_no: Option<&str>,
    project_catalog_id: Option<&str>,
    keys: &ProcurementMatchKeys,
) -> bool {
    normalized_option(budget_project_id)
        .is_some_and(|value| keys.budget_project_ids.contains(&value))
        || normalized_option(contract_no).is_some_and(|value| keys.contract_nos.contains(&value))
        || normalized_option(indicator_document_no)
            .is_some_and(|value| keys.indicator_document_nos.contains(&value))
        || normalized_option(project_catalog_id)
            .is_some_and(|value| keys.project_catalog_ids.contains(&value))
}

fn voucher_business_key(voucher: &TreasuryPaymentVoucherRecord) -> String {
    if let Some(value) = normalized_option(voucher.payment_order_no.as_deref()) {
        return format!("payment_order:{value}");
    }
    if let Some(value) = normalized_option(voucher.treasury_voucher_no.as_deref()) {
        return format!("treasury_voucher:{value}");
    }
    if let Some(value) = normalized_option(voucher.contract_no.as_deref()) {
        return format!(
            "contract:{value}:{}:{}",
            voucher.amount.trim(),
            voucher.paid_at.trim()
        );
    }
    voucher.id.clone()
}

fn ledger_business_key(entry: &LedgerEntryRecord) -> String {
    if let Some(value) = normalized_option(entry.payment_order_no.as_deref()) {
        return format!("payment_order:{value}");
    }
    if let Some(value) = normalized_option(entry.treasury_voucher_no.as_deref()) {
        return format!("treasury_voucher:{value}");
    }
    format!(
        "voucher:{}:{}",
        entry.voucher_no.trim(),
        entry.booked_at.trim()
    )
}

fn dedupe_vouchers(
    records: Vec<TreasuryPaymentVoucherRecord>,
) -> Vec<TreasuryPaymentVoucherRecord> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for record in records {
        let key = voucher_business_key(&record);
        if seen.insert(key) {
            deduped.push(record);
        }
    }
    deduped
}

fn dedupe_entries(records: Vec<LedgerEntryRecord>) -> Vec<LedgerEntryRecord> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for record in records {
        let key = ledger_business_key(&record);
        if seen.insert(key) {
            deduped.push(record);
        }
    }
    deduped
}

fn unmatched_vouchers(
    vouchers: &[TreasuryPaymentVoucherRecord],
    entries: &[LedgerEntryRecord],
) -> Vec<TreasuryPaymentVoucherRecord> {
    dedupe_vouchers(vouchers.to_vec())
        .into_iter()
        .filter(|voucher| {
            !entries
                .iter()
                .any(|entry| voucher_matches_entry(voucher, entry))
        })
        .collect()
}

fn unmatched_entries(
    entries: &[LedgerEntryRecord],
    vouchers: &[TreasuryPaymentVoucherRecord],
) -> Vec<LedgerEntryRecord> {
    dedupe_entries(entries.to_vec())
        .into_iter()
        .filter(|entry| {
            !vouchers
                .iter()
                .any(|voucher| voucher_matches_entry(voucher, entry))
        })
        .collect()
}

fn timing_exception_pairs(
    vouchers: &[TreasuryPaymentVoucherRecord],
    entries: &[LedgerEntryRecord],
) -> Vec<(TreasuryPaymentVoucherRecord, LedgerEntryRecord)> {
    let vouchers = dedupe_vouchers(vouchers.to_vec());
    let entries = dedupe_entries(entries.to_vec());
    let mut seen = HashSet::new();
    let mut pairs = Vec::new();
    for voucher in &vouchers {
        for entry in &entries {
            if voucher_matches_entry(voucher, entry) && is_timing_exception(voucher, entry) {
                let key = format!(
                    "{}|{}",
                    voucher_business_key(voucher),
                    ledger_business_key(entry)
                );
                if seen.insert(key) {
                    pairs.push((voucher.clone(), entry.clone()));
                }
            }
        }
    }
    pairs
}

fn amount_gap_non_zero(value: &str) -> bool {
    parse_decimal_value(value) != Decimal::ZERO
}

fn case_entry_key(exception_id: &str, source: &str) -> String {
    format!("{source}:{exception_id}")
}

fn build_case_no() -> String {
    format!(
        "CASE-{}-{}",
        chrono::Utc::now().format("%Y%m%d"),
        &Uuid::new_v4().simple().to_string()[..8]
    )
}

fn build_case_seed_exception_id(record: &crate::platform::CaseSeedImportRecord) -> String {
    let document_no = record
        .document_no
        .clone()
        .unwrap_or_else(|| format!("row-{}", record.source_row));
    let sequence = record.sequence.clone().unwrap_or_default();
    let period = record.period.clone().unwrap_or_default();
    format!(
        "case-seed:{}:{}:{}:{}",
        record.issue_source, period, sequence, document_no
    )
}

fn case_seed_rule_domain(record: &crate::platform::CaseSeedImportRecord) -> String {
    if let Some(case_type) = record.recommended_case_type.as_deref() {
        if case_type.contains("penalty") {
            return "penalty".to_string();
        }
        if case_type.contains("inspection") {
            return "inspection".to_string();
        }
        if case_type.contains("review") {
            return "review".to_string();
        }
    }
    if let Some(review_type) = record.review_type.as_deref() {
        if review_type.contains("budget") {
            return "review".to_string();
        }
    }
    "supervision".to_string()
}

fn case_seed_summary(record: &crate::platform::CaseSeedImportRecord) -> String {
    let mut parts = vec![record.recommended_issue.clone()];
    if let Some(value) = record.document_no.as_deref() {
        parts.push(format!("document no: {}", value));
    }
    if let Some(value) = record.reduction_amount.as_deref() {
        parts.push(format!("reduction amount: {}", value));
    }
    if let Some(value) = record.consulting_unit.as_deref() {
        parts.push(format!("consulting unit: {}", value));
    }
    parts.join("; ")
}

fn case_seed_risk_level(record: &crate::platform::CaseSeedImportRecord, priority: &str) -> String {
    let amount_level = record
        .reduction_amount
        .as_deref()
        .and_then(|value| Decimal::from_str(value).ok())
        .map(|value| {
            if value >= Decimal::from_str("100").unwrap() {
                "High"
            } else if value >= Decimal::from_str("10").unwrap() {
                "Medium"
            } else {
                "Low"
            }
        });
    match (priority, amount_level) {
        ("P1", _) => "Critical".to_string(),
        ("P2", Some("High")) => "High".to_string(),
        ("P2", _) => "Medium".to_string(),
        ("P3", Some(level)) => level.to_string(),
        ("P4", _) => "Low".to_string(),
        (_, Some(level)) => level.to_string(),
        _ => "Medium".to_string(),
    }
}

fn rule_domain_from_code(code: &str) -> String {
    if code.starts_with("PAY-") {
        "payment".to_string()
    } else if code.starts_with("LEDGER-") {
        "ledger".to_string()
    } else if code.starts_with("CHAIN-") {
        "chain".to_string()
    } else if code.starts_with("PROC-") {
        "procurement".to_string()
    } else if code.starts_with("BUDGET-") {
        "budget".to_string()
    } else {
        "general".to_string()
    }
}

fn stage_from_exception_status(status: &str) -> &'static str {
    match status {
        "Open" | "open" => "New",
        "InReview" | "in_review" | "inreview" => "Assigned",
        "Resolved" | "resolved" => "Reviewed",
        "Closed" | "closed" => "Closed",
        _ => "New",
    }
}

fn case_status_from_stage(stage: &str) -> &'static str {
    match stage {
        "Closed" => "closed",
        "Archived" => "archived",
        _ => "open",
    }
}

fn normalize_case_stage(stage: &str) -> Result<String> {
    let normalized = match stage {
        "New" | "new" => "New",
        "Assigned" | "assigned" => "Assigned",
        "InRectification" | "in_rectification" | "inrectification" => "InRectification",
        "SubmittedForReview" | "submitted_for_review" | "submittedforreview" => {
            "SubmittedForReview"
        }
        "ReviewRejected" | "review_rejected" | "reviewrejected" => "ReviewRejected",
        "Reviewed" | "reviewed" => "Reviewed",
        "Escalated" | "escalated" => "Escalated",
        "Closed" | "closed" => "Closed",
        "Archived" | "archived" => "Archived",
        other => anyhow::bail!("unsupported case stage {}", other),
    };
    Ok(normalized.to_string())
}

fn closed_at_for_stage(stage: &str) -> Option<String> {
    if case_status_from_stage(stage) == "closed" {
        Some(now_string())
    } else {
        None
    }
}

fn finding_status_from_case_stage(stage: &str) -> &'static str {
    match stage {
        "New" => "Open",
        "Assigned" | "InRectification" | "SubmittedForReview" | "ReviewRejected" | "Escalated" => {
            "InReview"
        }
        "Reviewed" => "Resolved",
        "Closed" | "Archived" => "Closed",
        _ => "Open",
    }
}

fn parse_iso_datetime(value: &str) -> Option<chrono::NaiveDateTime> {
    chrono::NaiveDateTime::parse_from_str(value.trim(), "%Y-%m-%d %H:%M:%S").ok()
}

fn overdue_days(sla_due_at: Option<&str>, case_status: &str) -> i64 {
    if matches!(case_status, "closed" | "archived") {
        return 0;
    }
    let Some(date) = sla_due_at.and_then(parse_iso_date) else {
        return 0;
    };
    let today = chrono::Utc::now().date_naive();
    (today - date).num_days().max(0)
}

fn bucketize_case_metric(map: HashMap<String, usize>) -> Vec<CaseMetricBucket> {
    let mut items = map
        .into_iter()
        .map(|(key, count)| CaseMetricBucket { key, count })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.key.cmp(&right.key))
    });
    items
}

fn ratio_string(numerator: usize, denominator: usize) -> String {
    if denominator == 0 {
        return "0.0%".to_string();
    }
    format!("{:.1}%", (numerator as f64 / denominator as f64) * 100.0)
}

fn csv_escape(value: &str) -> String {
    let escaped = value.replace('"', "\"\"");
    format!("\"{}\"", escaped)
}

fn reminder_count_from_item(item: &TaskExceptionPoolEntry) -> usize {
    item.reminder_history
        .iter()
        .filter(|event| event.reminder_flag)
        .count()
        .max(item.reminder_count)
}

fn row_to_exception_case(row: &Row<'_>) -> rusqlite::Result<ExceptionCase> {
    let task_kind_raw: String = row.get(5)?;
    let task_kind = TaskKind::from_str(&task_kind_raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            5,
            Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
        )
    })?;
    let case_status: String = row.get(14)?;
    let sla_due_at: Option<String> = row.get(27)?;
    Ok(ExceptionCase {
        id: row.get(0)?,
        case_no: row.get(1)?,
        task_id: row.get(2)?,
        exception_id: row.get(3)?,
        exception_source: row.get(4)?,
        task_kind,
        rule_domain: row.get(6)?,
        risk_level: row.get(7)?,
        exception_code: row.get(8)?,
        exception_title: row.get(9)?,
        exception_summary: row.get(10)?,
        owner_organization_id: row.get(11)?,
        visibility_scope: row.get(12)?,
        priority: row.get(13)?,
        case_status: case_status.clone(),
        current_stage: row.get(15)?,
        current_handler_user_id: row.get(16)?,
        current_handler_display_name: row.get(17)?,
        source_department: row.get(18)?,
        target_department: row.get(19)?,
        rectification_unit_name: row.get(20)?,
        disposition_outcome: row.get(21)?,
        disposition_note: row.get(22)?,
        accepted_at: row.get(23)?,
        first_assigned_at: row.get(24)?,
        first_response_at: row.get(25)?,
        submitted_for_review_at: row.get(26)?,
        sla_due_at: sla_due_at.clone(),
        remediation_due_at: row.get(28)?,
        closed_at: row.get(29)?,
        overdue_days: overdue_days(sla_due_at.as_deref(), &case_status),
        reminder_count: row.get::<_, i64>(30)? as usize,
        escalation_count: row.get::<_, i64>(31)? as usize,
        notification_summary: NotificationSummary {
            total_deliveries: 0,
            reminder_deliveries: 0,
            escalation_deliveries: 0,
            unread_deliveries: 0,
        },
        extension_status: None,
        created_at: row.get(32)?,
        updated_at: row.get(33)?,
    })
}

fn finding_in_exception_pool(finding: &PlatformTaskFinding) -> bool {
    ["PAY-", "LEDGER-", "CHAIN-"]
        .iter()
        .any(|prefix| finding.rule_code.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    #[test]
    fn v2_store_placeholder_test() {
        assert!(true);
    }
}
