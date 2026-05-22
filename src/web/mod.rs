use crate::ai_analysis::{self, AiConfig};
use crate::auth::UserRole;
use crate::data_parser::csv_parser::CsvParser;
use crate::data_parser::excel_parser::ExcelParser;
use crate::data_parser::DataSource;
use crate::database::{DatabaseConfig, DatabaseType};
use crate::models::{AuditFinding, AuditReport, FindingRiskLevel, Severity};
use crate::multimodal::{self, MultimodalConfig};
use crate::pdf_report::{PdfBranding, PdfReportGenerator};
use crate::platform::{
    build_demo_transactions, expand_notice_urls_from_list_page,
    internal_sample_template_definitions, parse_procurement_notice_html, preview_budget_batch,
    preview_budget_csv_bytes, preview_budget_excel_bytes, preview_case_seed_batch,
    preview_case_seed_csv_bytes_with_options, preview_case_seed_excel_bytes_with_options,
    preview_procurement_batch, preview_procurement_csv_bytes, preview_procurement_excel_bytes,
    preview_treasury_batch, preview_treasury_csv_bytes, preview_treasury_excel_bytes,
    preview_voucher_batch, preview_voucher_csv_bytes, preview_voucher_excel_bytes,
    summarize_by_date, task_kind_definitions, AiServiceProfile, ArtifactStatus,
    ArtifactStructuredSummary, ArtifactType, AssignmentDictionaryRuleInput, AudioArtifactSummary,
    AutomationScheduleInput, AutomationScheduleKind, AutomationTargetKind, BudgetBatchPayload,
    BudgetDatasetKind, CaseSeedAssignmentRule, CaseSeedBatchPayload, CaseSeedMappingOverride,
    CaseSeedPreviewOptions, CaseSeedTemplateConfig, CaseSeedTemplateKind, CompletedTaskInput,
    ConnectorProfileInput, ConnectorType, DataSourceTemplate, EvidenceArtifact,
    ExceptionBulkActionTarget, FindingCaseStatus, ImageArtifactSummary, ImportProfile,
    ImportProfileInput, ImportProfileScope, ImportQualityReport, ImportSourceKind,
    InternalSampleTemplateKind, LeadRequest, LeadRequestInput, NewEvidenceArtifactInput,
    NewUserInput, AnyTask, PlatformStore, PlatformTask, ProcurementBatchPayload, ProcurementFetchRequest,
    RegistrationInput, SessionIdentity, TaskDetailPayload, TaskKind, TreasuryBatchPayload,
    TreasuryDatasetKind, VoucherBatchPayload, VoucherDatasetKind, WritebackInput,
};
use actix_files as afs;
use actix_multipart::Multipart;
use actix_session::{
    config::PersistentSession, storage::CookieSessionStore, Session, SessionMiddleware,
};
use actix_web::cookie::time::Duration;
use actix_web::cookie::{Key, SameSite};
use actix_web::body::{BoxBody, MessageBody};
use actix_web::dev::{ServiceRequest, ServiceResponse};
use actix_web::http::header::{self, HeaderValue};
use actix_web::middleware::{from_fn, Next};
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use futures_util::StreamExt;
use reqwest::Client;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Cursor, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration as StdDuration, Instant};

#[derive(Clone)]
struct AppContext {
    platform: Arc<PlatformStore>,
    runtime: DeploymentPolicy,
    login_locks: Arc<Mutex<HashMap<String, LoginLockState>>>,
}

async fn no_store_static_assets(
    req: ServiceRequest,
    next: Next<impl MessageBody + 'static>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let mut response = next.call(req).await?;
    let path = response.request().path();
    if path == "/" || path == "/index.html" || path.starts_with("/app/") {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store, no-cache, must-revalidate, max-age=0"),
        );
        response
            .headers_mut()
            .insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    }
    Ok(response)
}

async fn enforce_transport_security(
    req: ServiceRequest,
    next: Next<impl MessageBody + 'static>,
) -> Result<ServiceResponse<BoxBody>, Error> {
    let context = req
        .app_data::<web::Data<AppContext>>()
        .map(|data| data.get_ref().clone());
    let Some(context) = context else {
        return Ok(next.call(req).await?.map_into_boxed_body());
    };
    if context.runtime.environment_mode != EnvironmentMode::GovernmentPoc {
        return Ok(next.call(req).await?.map_into_boxed_body());
    }

    let path = req.path().to_string();
    if matches!(path.as_str(), "/api/health" | "/api/health/details") {
        return Ok(next.call(req).await?.map_into_boxed_body());
    }

    let is_loopback = req
        .peer_addr()
        .map(|addr| addr.ip().is_loopback())
        .unwrap_or(false);
    if is_loopback {
        return Ok(next.call(req).await?.map_into_boxed_body());
    }

    let forwarded_proto = req
        .headers()
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if forwarded_proto.eq_ignore_ascii_case("https") {
        return Ok(next.call(req).await?.map_into_boxed_body());
    }

    let response = HttpResponse::MisdirectedRequest().json(error_json(
        "government_poc requires HTTPS via reverse proxy (X-Forwarded-Proto=https)",
    ));
    Ok(req.into_response(response).map_into_boxed_body())
}

#[derive(Clone)]
struct LoginLockState {
    failures: u32,
    locked_until: Option<Instant>,
}

#[derive(Clone)]
struct DeploymentPolicy {
    environment_mode: EnvironmentMode,
    session_secret: String,
    platform_data_dir: String,
    secure_cookies: bool,
    allow_public_registration: bool,
    ai_enabled: bool,
    public_demo_mode: bool,
    multimodal_provider: String,
    ocr_enabled: bool,
    speech_enabled: bool,
    ocr_api_url: String,
    speech_api_url: String,
    ocr_model: String,
    speech_model: String,
    ocr_api_key: String,
    speech_api_key: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum EnvironmentMode {
    Local,
    PublicDemo,
    GovernmentPoc,
}

impl EnvironmentMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::PublicDemo => "public_demo",
            Self::GovernmentPoc => "government_poc",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfigFile {
    environment_mode: Option<EnvironmentMode>,
    platform_data_dir: Option<String>,
    secure_cookies: Option<bool>,
    allow_public_registration: Option<bool>,
    ai_enabled: Option<bool>,
    public_demo_mode: Option<bool>,
    multimodal_provider: Option<String>,
    ocr_enabled: Option<bool>,
    speech_enabled: Option<bool>,
    ocr_api_url: Option<String>,
    speech_api_url: Option<String>,
    ocr_model: Option<String>,
    speech_model: Option<String>,
}

#[derive(Serialize)]
struct DeploymentPolicySummary {
    baseline: String,
    environment_mode: String,
    secure_cookies: bool,
    allow_public_registration: bool,
    ai_enabled: bool,
    public_demo_mode: bool,
    ocr_enabled: bool,
    speech_enabled: bool,
    deviations: Vec<String>,
}

#[derive(Serialize)]
struct BootstrapResponse {
    needs_registration: bool,
    deployment_policy: DeploymentPolicySummary,
    scenarios: Vec<crate::platform::ScenarioPreset>,
    report_templates: Vec<crate::platform::ReportTemplate>,
    data_sources: Vec<DataSourceTemplate>,
}

#[derive(Serialize)]
struct HealthDetailsResponse {
    status: String,
    db: String,
    ocr: String,
    asr: String,
    ai: String,
    connectors: String,
}

#[derive(Serialize)]
struct SessionResponse {
    logged_in: bool,
    user: Option<crate::platform::UserProfile>,
}

#[derive(Serialize)]
struct ImportBootstrapResponse {
    task_kinds: Vec<crate::platform::TaskKindDefinition>,
}

#[derive(Serialize)]
struct ConnectorTypeDefinition {
    connector_type: String,
    label: String,
}

#[derive(Deserialize)]
struct ExceptionBulkUpdateRequest {
    targets: Vec<ExceptionBulkActionTarget>,
    status: String,
    assignee: Option<String>,
    disposition_note: Option<String>,
    disposition_priority: Option<String>,
    disposition_outcome: Option<String>,
    remediation_due_at: Option<String>,
    reminder_flag: Option<bool>,
    reminder_note: Option<String>,
}

#[derive(Serialize)]
struct ExceptionBulkUpdateResponse {
    updated: usize,
}

#[derive(Deserialize)]
struct CaseAssignRequest {
    case_ids: Vec<String>,
    assignee: Option<String>,
    source_department: Option<String>,
    target_department: Option<String>,
    rectification_unit_name: Option<String>,
    sla_due_at: Option<String>,
}

#[derive(Deserialize)]
struct CaseTransitionRequest {
    case_ids: Vec<String>,
    current_stage: String,
    note: Option<String>,
    outcome: Option<String>,
    priority: Option<String>,
    due_at: Option<String>,
    reminder_flag: Option<bool>,
}

#[derive(Deserialize)]
struct CaseRectificationRequest {
    rectification_statement: Option<String>,
    requested_extension: Option<String>,
}

#[derive(Deserialize)]
struct CaseExtensionRequest {
    requested_due_at: String,
    reason: Option<String>,
}

#[derive(Deserialize)]
struct CaseReviewRequest {
    decision: String,
    note: Option<String>,
}

#[derive(Deserialize)]
struct CaseReminderRequest {
    note: Option<String>,
}

#[derive(Serialize)]
struct CaseMutationResponse {
    updated: usize,
}

#[derive(Serialize)]
struct ConnectorBootstrapResponse {
    connector_types: Vec<ConnectorTypeDefinition>,
    profiles: Vec<crate::platform::ConnectorProfile>,
    sync_jobs: Vec<crate::platform::ConnectorSyncJob>,
    writeback_events: Vec<crate::platform::WritebackEvent>,
}

#[derive(Serialize)]
struct ConnectorPreviewResponse {
    sync_job: crate::platform::ConnectorSyncJob,
    preview_job: crate::platform::ImportJobRecord,
}

#[derive(Serialize)]
struct ConnectorCommitResponse {
    sync_job: crate::platform::ConnectorSyncJob,
    task: crate::platform::PlatformTask,
}

#[derive(Serialize)]
struct PreviewImportResponse {
    job_id: String,
    task_kind: TaskKind,
    source_kind: ImportSourceKind,
    preview: serde_json::Value,
}

#[derive(Serialize)]
struct CaseSeedPreviewResponse {
    source_kind: ImportSourceKind,
    preview: serde_json::Value,
}

#[derive(Serialize)]
struct CaseSeedImportResponse {
    imported: usize,
    cases: Vec<crate::platform::ExceptionCase>,
}

#[derive(Serialize)]
struct CaseSeedConfigResponse {
    config: Option<CaseSeedTemplateConfig>,
}

#[derive(Deserialize)]
struct ImportProfileQuery {
    task_kind: Option<String>,
}

#[derive(Deserialize)]
struct CreateImportProfileRequest {
    name: String,
    task_kind: String,
    template_kind: Option<String>,
    scope: String,
    is_default: Option<bool>,
    mapping_overrides: Option<Vec<CaseSeedMappingOverride>>,
    assignment_rules: Option<Vec<CaseSeedAssignmentRule>>,
    notes: Option<String>,
}

#[derive(Deserialize)]
struct CloneImportProfileRequest {
    name: String,
    scope: String,
}

#[derive(Serialize)]
struct ImportProfilesResponse {
    profiles: Vec<ImportProfile>,
}

#[derive(Serialize)]
struct ImportProfileResponse {
    profile: ImportProfile,
}

#[derive(Deserialize)]
struct AssignmentDictionaryQuery {
    task_kind: Option<String>,
    template_kind: Option<String>,
}

#[derive(Deserialize)]
struct CreateAssignmentDictionaryRuleRequest {
    task_kind: String,
    template_kind: Option<String>,
    match_field: String,
    match_value: String,
    assignee: String,
    target_department: Option<String>,
    priority: u32,
    scope: String,
    enabled: Option<bool>,
    label: Option<String>,
}

#[derive(Deserialize)]
struct ToggleAssignmentDictionaryRuleRequest {
    enabled: bool,
}

#[derive(Serialize)]
struct AssignmentDictionaryResponse {
    rules: Vec<crate::platform::AssignmentDictionaryRule>,
}

#[derive(Serialize)]
struct AssignmentDictionaryRuleResponse {
    rule: crate::platform::AssignmentDictionaryRule,
}

#[derive(Deserialize)]
struct CreateAutomationScheduleRequest {
    name: String,
    schedule_kind: String,
    target_kind: String,
    enabled: Option<bool>,
    shared_profile_id: Option<String>,
    connector_profile_id: Option<String>,
    source_path: Option<String>,
    notes: Option<String>,
}

#[derive(Serialize)]
struct AutomationSchedulesResponse {
    schedules: Vec<crate::platform::AutomationSchedule>,
}

#[derive(Serialize)]
struct AutomationScheduleResponse {
    schedule: crate::platform::AutomationSchedule,
}

#[derive(Serialize)]
struct AutomationExecutionsResponse {
    executions: Vec<crate::platform::AutomationExecution>,
}

#[derive(Serialize)]
struct AutomationExecutionResponse {
    execution: crate::platform::AutomationExecution,
}

#[derive(Deserialize)]
struct ImportTemplateQuery {
    dataset_kind: Option<String>,
}

#[derive(Deserialize)]
struct CaseSeedTemplateQuery {
    template_kind: Option<String>,
}

#[derive(Deserialize)]
struct CommitImportRequest {
    job_id: String,
}

#[derive(Deserialize)]
struct RegisterRequest {
    tenant_name: String,
    organization_name: String,
    username: String,
    password: String,
    display_name: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct DatabaseAuditRequest {
    scenario_id: String,
    project_name: String,
    report_template_id: String,
    template_id: String,
    host: String,
    user: String,
    password: String,
    database: String,
    table: String,
}

#[derive(Deserialize)]
struct CreateUserRequest {
    organization_id: String,
    username: String,
    password: String,
    display_name: String,
    role: String,
}

#[derive(Deserialize)]
struct ResetPasswordRequest {
    new_password: String,
}

#[derive(Deserialize)]
struct UpdateFindingRequest {
    assignee: Option<String>,
    note: Option<String>,
    status: Option<String>,
}

#[derive(Serialize)]
struct AdminOverviewResponse {
    users: Vec<crate::platform::UserProfile>,
    logs: Vec<crate::platform::AuditLogEntry>,
    lead_requests: Vec<LeadRequest>,
    deployment_policy: DeploymentPolicySummary,
    ai_profile: AiServiceProfile,
    data_sources: Vec<DataSourceTemplate>,
    report_templates: Vec<crate::platform::ReportTemplate>,
    connector_profiles: Vec<crate::platform::ConnectorProfile>,
    connector_sync_jobs: Vec<crate::platform::ConnectorSyncJob>,
    writeback_events: Vec<crate::platform::WritebackEvent>,
}

#[derive(Serialize)]
struct ArtifactListResponse {
    artifacts: Vec<EvidenceArtifact>,
}

#[derive(Default, Deserialize)]
struct CreateDemoTaskRequest {
    scenario_id: Option<String>,
    project_name: Option<String>,
    dataset_name: Option<String>,
}

#[derive(Deserialize)]
struct PublicLeadRequest {
    contact_name: String,
    contact_channel: String,
    unit_type: String,
    department: String,
    audit_scenario: String,
    deployment_preference: String,
    involves_real_data: bool,
    ai_expectation: String,
    note: String,
}

#[derive(Deserialize)]
struct CreateConnectorProfileRequest {
    name: String,
    connector_type: String,
    task_kind: String,
    dataset_kind: Option<String>,
    base_url: String,
    auth_mode: String,
    sample_payload_json: Option<String>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct ConnectorPreviewPath {
    profile_id: String,
}

#[derive(Deserialize)]
struct ConnectorWritebackRequest {
    task_id: String,
    task_kind: String,
    target_type: String,
    target_id: String,
    status: String,
    conclusion: Option<String>,
    reminder_flag: bool,
    idempotency_key: String,
}

impl DeploymentPolicy {
    fn load(base_dir: &Path) -> Result<Self> {
        let config_path = base_dir.join("config").join("runtime.local.json");
        let raw = fs::read_to_string(&config_path).with_context(|| {
            format!(
                "failed to read runtime config at {}. Run scripts/init-local.ps1 first",
                config_path.display()
            )
        })?;
        let raw = raw.trim_start_matches('\u{feff}');
        let file: RuntimeConfigFile =
            serde_json::from_str(&raw).context("failed to parse runtime config json")?;
        let environment_mode = file
            .environment_mode
            .context("runtime config field environmentMode is required")?;
        let runtime = Self {
            environment_mode,
            session_secret: required_env_secret("AUDITLENS_SESSION_SECRET")?,
            platform_data_dir: file.platform_data_dir.unwrap_or_else(|| ".".to_string()),
            secure_cookies: file.secure_cookies.unwrap_or(false),
            allow_public_registration: file.allow_public_registration.unwrap_or(false),
            ai_enabled: file.ai_enabled.unwrap_or(true),
            public_demo_mode: file.public_demo_mode.unwrap_or(true),
            multimodal_provider: file.multimodal_provider.unwrap_or_default(),
            ocr_enabled: file.ocr_enabled.unwrap_or(false),
            speech_enabled: file.speech_enabled.unwrap_or(false),
            ocr_api_url: file.ocr_api_url.unwrap_or_default(),
            speech_api_url: file.speech_api_url.unwrap_or_default(),
            ocr_model: file.ocr_model.unwrap_or_default(),
            speech_model: file.speech_model.unwrap_or_default(),
            ocr_api_key: env::var("AUDITLENS_OCR_API_KEY").unwrap_or_default(),
            speech_api_key: env::var("AUDITLENS_SPEECH_API_KEY").unwrap_or_default(),
        };
        runtime.validate()?;
        Ok(runtime)
    }

    fn session_key(&self) -> Result<Key> {
        let decoded = BASE64
            .decode(self.session_secret.as_bytes())
            .context("failed to decode runtime sessionSecret")?;
        if decoded.len() < 64 {
            anyhow::bail!("runtime sessionSecret must decode to at least 64 bytes");
        }
        Ok(Key::from(&decoded[..64]))
    }

    fn summary(&self) -> DeploymentPolicySummary {
        let mut deviations = Vec::new();
        match self.environment_mode {
            EnvironmentMode::Local => {
                if self.public_demo_mode {
                    deviations.push("local mode is using public demo restrictions".to_string());
                }
            }
            EnvironmentMode::PublicDemo => {
                if !self.public_demo_mode {
                    deviations.push("publicDemoMode must be true for public_demo".to_string());
                }
            }
            EnvironmentMode::GovernmentPoc => {
                if !self.secure_cookies {
                    deviations.push("secureCookies must be true for government_poc".to_string());
                }
                if self.allow_public_registration {
                    deviations.push(
                        "allowPublicRegistration must be false for government_poc".to_string(),
                    );
                }
                if self.public_demo_mode {
                    deviations.push("publicDemoMode must be false for government_poc".to_string());
                }
            }
        }
        DeploymentPolicySummary {
            baseline: self.environment_mode.as_str().to_string(),
            environment_mode: self.environment_mode.as_str().to_string(),
            secure_cookies: self.secure_cookies,
            allow_public_registration: self.allow_public_registration,
            ai_enabled: self.ai_enabled,
            public_demo_mode: self.public_demo_mode,
            ocr_enabled: self.ocr_enabled,
            speech_enabled: self.speech_enabled,
            deviations,
        }
    }

    fn multimodal_config(&self) -> MultimodalConfig {
        MultimodalConfig {
            provider: self.multimodal_provider.clone(),
            ocr_enabled: self.ocr_enabled,
            speech_enabled: self.speech_enabled,
            ocr_api_url: self.ocr_api_url.clone(),
            speech_api_url: self.speech_api_url.clone(),
            ocr_model: self.ocr_model.clone(),
            speech_model: self.speech_model.clone(),
            ocr_api_key: self.ocr_api_key.clone(),
            speech_api_key: self.speech_api_key.clone(),
        }
    }

    fn platform_base_dir(&self) -> &Path {
        Path::new(&self.platform_data_dir)
    }

    fn validate(&self) -> Result<()> {
        let decoded = BASE64
            .decode(self.session_secret.as_bytes())
            .context("failed to decode AUDITLENS_SESSION_SECRET")?;
        if decoded.len() < 64 {
            anyhow::bail!("AUDITLENS_SESSION_SECRET must decode to at least 64 bytes");
        }
        match self.environment_mode {
            EnvironmentMode::Local => Ok(()),
            EnvironmentMode::PublicDemo => {
                if !self.public_demo_mode {
                    anyhow::bail!("public_demo requires publicDemoMode=true");
                }
                Ok(())
            }
            EnvironmentMode::GovernmentPoc => {
                if !self.secure_cookies {
                    anyhow::bail!("government_poc requires secureCookies=true");
                }
                if self.allow_public_registration {
                    anyhow::bail!("government_poc requires allowPublicRegistration=false");
                }
                if self.public_demo_mode {
                    anyhow::bail!("government_poc requires publicDemoMode=false");
                }
                Ok(())
            }
        }
    }

    fn ai_api_key(&self) -> Option<String> {
        env_secret("AUDITLENS_AI_API_KEY")
    }

    fn ai_secret_configured(&self) -> bool {
        self.ai_api_key().is_some()
    }

    fn fingerprint_summary(&self) -> String {
        format!(
            "environment_mode={} secure_cookies={} allow_public_registration={} public_demo_mode={} ai_enabled={} session_secret=true ai_secret={} ocr_secret={} speech_secret={}",
            self.environment_mode.as_str(),
            self.secure_cookies,
            self.allow_public_registration,
            self.public_demo_mode,
            self.ai_enabled,
            self.ai_secret_configured(),
            env_secret("AUDITLENS_OCR_API_KEY").is_some(),
            env_secret("AUDITLENS_SPEECH_API_KEY").is_some()
        )
    }
}

fn env_secret(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn required_env_secret(name: &str) -> Result<String> {
    let value = env_secret(name).with_context(|| format!("required environment variable {} is missing", name))?;
    if value.eq_ignore_ascii_case("changeme")
        || value.eq_ignore_ascii_case("default")
        || value.eq_ignore_ascii_case("placeholder")
    {
        anyhow::bail!("{} is using a disallowed placeholder value", name);
    }
    Ok(value)
}

fn ensure_not_public_demo_for_data_entry(
    context: &AppContext,
    capability: &str,
) -> std::result::Result<(), HttpResponse> {
    if context.runtime.environment_mode == EnvironmentMode::PublicDemo {
        Err(HttpResponse::Forbidden().json(error_json(format!(
            "{} is disabled in public_demo",
            capability
        ))))
    } else {
        Ok(())
    }
}

fn ensure_connector_secret_configured(
    auth_mode: &str,
    profile_id: &str,
) -> std::result::Result<(), anyhow::Error> {
    let auth_mode = auth_mode.trim().to_ascii_lowercase();
    if auth_mode.is_empty() || auth_mode == "none" {
        return Ok(());
    }
    let env_var = format!(
        "AUDITLENS_CONNECTOR_SECRET_{}",
        profile_id.replace('-', "_").to_ascii_uppercase()
    );
    match env::var(&env_var) {
        Ok(value) if !value.trim().is_empty() => Ok(()),
        _ => anyhow::bail!("secret_not_configured"),
    }
}

fn require_session(session: &Session) -> std::result::Result<SessionIdentity, HttpResponse> {
    let user_id = session
        .get::<String>("user_id")
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid session")))?
        .ok_or_else(|| HttpResponse::Unauthorized().json(error_json("login required")))?;
    let tenant_id = session
        .get::<String>("tenant_id")
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid session")))?
        .ok_or_else(|| HttpResponse::Unauthorized().json(error_json("login required")))?;
    let organization_id = session
        .get::<String>("organization_id")
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid session")))?
        .ok_or_else(|| HttpResponse::Unauthorized().json(error_json("login required")))?;
    let username = session
        .get::<String>("username")
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid session")))?
        .ok_or_else(|| HttpResponse::Unauthorized().json(error_json("login required")))?;
    let display_name = session
        .get::<String>("display_name")
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid session")))?
        .ok_or_else(|| HttpResponse::Unauthorized().json(error_json("login required")))?;
    let role_raw = session
        .get::<String>("role")
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid session")))?
        .ok_or_else(|| HttpResponse::Unauthorized().json(error_json("login required")))?;
    let role = role_raw
        .parse::<UserRole>()
        .map_err(|_| HttpResponse::Unauthorized().json(error_json("invalid role")))?;
    Ok(SessionIdentity {
        user_id,
        tenant_id,
        organization_id,
        username,
        display_name,
        role,
    })
}

fn ensure_audit_role(identity: &SessionIdentity) -> std::result::Result<(), HttpResponse> {
    if identity.role.can_run_audit() {
        Ok(())
    } else {
        Err(HttpResponse::Forbidden().json(error_json("auditor role required")))
    }
}

fn ensure_admin_role(identity: &SessionIdentity) -> std::result::Result<(), HttpResponse> {
    if identity.role.can_manage_admin() {
        Ok(())
    } else {
        Err(HttpResponse::Forbidden().json(error_json("admin role required")))
    }
}

fn ensure_case_workbench_role(identity: &SessionIdentity) -> std::result::Result<(), HttpResponse> {
    if identity.role.can_access_case_workbench() {
        Ok(())
    } else {
        Err(HttpResponse::Forbidden().json(error_json("case workbench role required")))
    }
}

fn ensure_case_review_role(identity: &SessionIdentity) -> std::result::Result<(), HttpResponse> {
    if identity.role.can_review_case() {
        Ok(())
    } else {
        Err(HttpResponse::Forbidden().json(error_json("review role required")))
    }
}

fn ensure_rectification_role(identity: &SessionIdentity) -> std::result::Result<(), HttpResponse> {
    if identity.role.can_access_rectification_portal() {
        Ok(())
    } else {
        Err(HttpResponse::Forbidden().json(error_json("rectification role required")))
    }
}

fn ensure_operations_role(identity: &SessionIdentity) -> std::result::Result<(), HttpResponse> {
    if identity.role.can_access_operations() {
        Ok(())
    } else {
        Err(HttpResponse::Forbidden().json(error_json("operations role required")))
    }
}

fn error_json(message: impl Into<String>) -> serde_json::Value {
    serde_json::json!({ "error": message.into() })
}

fn schema_error_json(
    message: impl Into<String>,
    hint: impl Into<String>,
    expected_schema_url: impl Into<String>,
) -> serde_json::Value {
    serde_json::json!({
        "error": message.into(),
        "hint": hint.into(),
        "expected_schema_url": expected_schema_url.into(),
    })
}

fn task_not_found_json(task_id: &str) -> serde_json::Value {
    schema_error_json(
        "task not found",
        format!(
            "No legacy demo, v2 platform, or v2 typed task exists for task_id '{}'",
            task_id
        ),
        "/docs/API.md#task-detail",
    )
}

fn remember_session(session: &Session, identity: &SessionIdentity) -> Result<()> {
    session.insert("user_id", &identity.user_id)?;
    session.insert("tenant_id", &identity.tenant_id)?;
    session.insert("organization_id", &identity.organization_id)?;
    session.insert("username", &identity.username)?;
    session.insert("display_name", &identity.display_name)?;
    session.insert("role", identity.role.to_string())?;
    Ok(())
}

fn login_lock_keys(username: &str, source_ip: &str) -> [String; 2] {
    [
        format!("username:{}", username.trim().to_lowercase()),
        format!("ip:{}", source_ip.trim()),
    ]
}

fn source_ip_from_request(request: &HttpRequest) -> String {
    request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| request.peer_addr().map(|addr| addr.ip().to_string()))
        .unwrap_or_else(|| "unknown".to_string())
}

fn login_locked_until(context: &AppContext, username: &str, source_ip: &str) -> Option<Instant> {
    let now = Instant::now();
    let mut locks = context.login_locks.lock().ok()?;
    let mut locked_until: Option<Instant> = None;
    for key in login_lock_keys(username, source_ip) {
        if matches!(locks.get(&key).and_then(|state| state.locked_until), Some(until) if until <= now)
        {
            locks.remove(&key);
            continue;
        }
        if let Some(until) = locks.get(&key).and_then(|state| state.locked_until) {
            locked_until = Some(locked_until.map_or(until, |current| current.max(until)));
        }
    }
    locked_until
}

fn record_login_failure(context: &AppContext, username: &str, source_ip: &str) {
    let lock_for = StdDuration::from_secs(10 * 60);
    let mut locks = match context.login_locks.lock() {
        Ok(locks) => locks,
        Err(_) => return,
    };
    for key in login_lock_keys(username, source_ip) {
        let state = locks.entry(key).or_insert(LoginLockState {
            failures: 0,
            locked_until: None,
        });
        state.failures = state.failures.saturating_add(1);
        if state.failures >= 5 {
            state.locked_until = Some(Instant::now() + lock_for);
        }
    }
}

fn clear_login_failures(context: &AppContext, username: &str, source_ip: &str) {
    if let Ok(mut locks) = context.login_locks.lock() {
        for key in login_lock_keys(username, source_ip) {
            locks.remove(&key);
        }
    }
}

async fn bootstrap(context: web::Data<AppContext>) -> impl Responder {
    HttpResponse::Ok().json(BootstrapResponse {
        needs_registration: !context.platform.has_users(),
        deployment_policy: context.runtime.summary(),
        scenarios: context.platform.list_scenarios(),
        report_templates: context.platform.list_report_templates(),
        data_sources: context.platform.list_data_sources(),
    })
}

async fn import_bootstrap() -> impl Responder {
    HttpResponse::Ok().json(ImportBootstrapResponse {
        task_kinds: task_kind_definitions(),
    })
}

async fn internal_sample_templates() -> impl Responder {
    HttpResponse::Ok().json(internal_sample_template_definitions())
}

async fn internal_sample_template_csv(template_kind: web::Path<String>) -> impl Responder {
    let template_kind = match template_kind.parse::<InternalSampleTemplateKind>() {
        Ok(value) => value,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let (filename, body) = internal_sample_template_csv_body(template_kind);
    HttpResponse::Ok()
        .content_type("text/csv; charset=utf-8")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", filename),
        ))
        .body(body)
}

fn procurement_template_csv_v2() -> String {
    [
        "项目名称,采购单位,公告类型,项目编号,预算金额,采购方式,发布时间,地域,中标（成交）金额,供应商名称,合同编号,合同公告日期,履约验收信息,验收状态,公告链接,指标文号,项目库ID,功能分类编码,经济分类编码",
        "预算一体化升级,某财政局,中标公告,PROC-001,1000000,公开招标,2026-04-01,广东省,980000,甲供应商,HT-001,2026-04-15,已验收,completed,https://www.ccgp.gov.cn/example.htm,指标-001,CAT-001,2019999,30201",
    ]
    .join("\n")
}

fn budget_execution_template_csv() -> String {
    [
        "期间,预算单位,单位代码,预算口径,收支方向,预算项目,项目库ID,指标文号,资金来源,功能分类编码,功能分类名称,经济分类编码,经济分类名称,预算金额,实际金额",
        "2026-03,某财政局,440100001,一般公共预算,支出,预算一体化升级,CAT-001,指标-001,一般财力,2019999,财政事务,30201,办公费,1000000,820000",
    ]
    .join("\n")
}

fn budget_public_summary_template_csv() -> String {
    [
        "期间,地区,预算口径,收支方向,汇总项目,实际金额,预算金额,上期金额,同比增幅,来源标题,来源链接,发布日期,采集时间,解析器版本",
        "2026-03,广东省,一般公共预算,收入,税收收入,6500000,7000000,6100000,6.56%,广东省财政收支公开,https://example.gov.cn/fiscal.html,2026-04-10,2026-04-26T10:00:00+08:00,public-fiscal-v1",
    ]
    .join("\n")
}

fn budget_public_statistical_indicator_template_csv() -> String {
    [
        "期间,地区,统计指标,实际金额,上年同期,同比增幅,来源标题,来源链接,发布日期,采集时间,解析器版本",
        "2025,海安市,地区生产总值,16500000,15200000,8.55%,海安市统计公报,https://example.gov.cn/haian.html,2026-03-31,2026-04-26T10:00:00+08:00,jiangsu-public-v1",
    ]
    .join("\n")
}

fn budget_investment_review_template_csv() -> String {
    [
        "期间,地区,评审项目,送审金额,审定金额,上年同期,同比增幅,来源标题,来源链接,发布日期,采集时间,解析器版本",
        "2025,南通市,政府投资项目评审,12000000,10800000,10000000,8%,南通投资评审公开摘要,https://example.gov.cn/review.html,2026-03-31,2026-04-26T10:00:00+08:00,jiangsu-public-v1",
    ]
    .join("\n")
}

fn budget_township_fiscal_template_csv() -> String {
    [
        "period,region,budget_scope,direction,summary_item,actual_amount,fiscal_level,fiscal_section,budget_subject_category,opening_budget_amount,completion_rate,available_financial_capacity,fiscal_special_account_amount,livelihood_special_item,caliber_note,source_title,source_url,source_table_title,source_table_row_index,source_table_column_name,source_paragraph_index,source_pdf_table_id",
        "2025-12,Rugao Banjing Town,township fiscal execution,revenue,general public budget revenue,3200,township,revenue,general public budget,3000,106.7%,5100,120,livelihood special,restored caliber,Banjing 2025 fiscal report,https://example.gov.cn/township-fiscal.html,revenue completion table,4,actual revenue,8,township-table-1",
    ]
    .join("\n")
}

#[allow(dead_code)]
fn procurement_template_csv() -> String {
    [
        "项目名称,采购单位,公告类型,项目编号,预算金额,采购方式,发布时间,地域,中标（成交）金额,供应商名称,合同编号,合同公告日期,履约验收信息,验收状态,公告链接,指标文号,项目库ID,功能分类编码,经济分类编码",
        "预算一体化升级,某财政局,中标公告,PROC-001,1000000,公开招标,2026-04-01,广东省,980000,甲供应商,HT-001,2026-04-15,已验收,completed,https://www.ccgp.gov.cn/example.htm,指标-001,CAT-001,2019999,30201",
    ]
    .join("\n")
}

fn treasury_template_csv() -> String {
    [
        "预算单位,预算项目,供应商名称,资金来源,功能分类编码,经济分类编码,指标文号,项目库ID,合同编号,支付单号,国库凭证号,支付金额,支付日期,收款单位",
        "某财政局,绩效评价咨询服务,中标供应商,一般公共预算,2019999,30201,指标-001,CAT-001,HT-001,PAY-001,TV-001,500000,2026-04-20,中标供应商",
    ]
    .join("\n")
}

fn voucher_template_csv() -> String {
    [
        "预算单位,预算项目,供应商名称,资金来源,功能分类编码,经济分类编码,指标文号,项目库ID,合同编号,支付单号,国库凭证号,凭证号,科目编码,科目名称,借方金额,贷方金额,记账日期",
        "某财政局,绩效评价咨询服务,中标供应商,一般公共预算,2019999,30201,指标-001,CAT-001,HT-001,PAY-001,TV-001,记-001,500101,业务活动费用,500000,500000,2026-04-21",
    ]
    .join("\n")
}

fn case_seed_template_csv(template_kind: CaseSeedTemplateKind) -> String {
    match template_kind {
        CaseSeedTemplateKind::InvestmentReview => [
            "issue_source,period,sequence,project_name,construction_unit,consulting_unit,review_type,project_category,submitted_amount,approved_amount,reduction_amount,lead_reviewer,accepted_at,completed_at,document_no,recommended_case_type,recommended_priority,recommended_issue,source_department,target_department,rectification_unit_name,assignee,sla_due_at",
            "official_weekly_review,2025-W34,1,Haian Bridge Project,Haian Housing Bureau,Jiangsu Demo Consulting,budget,municipal,301.56,291.85,9.71,Wang Jun,2025-08-11,2025-08-20,HA-2025-030,review_reduction_followup,P2,Review reduction should be explained and archived,Haian Investment Review Center,Haian Housing Bureau,Haian Housing Bureau,auditor.seed,2025-08-26",
        ]
        .join("\n"),
        CaseSeedTemplateKind::PenaltyLedger => [
            "处罚对象,处罚决定书号,处罚事由,处罚金额,承办处室,整改单位,立案日期,处罚决定日期,优先级,责任人",
            "海安市某单位,罚决字-001,未按规定采购,12.50,监督检查科,海安市某单位,2025-09-01,2025-09-08,P2,auditor.penalty",
        ]
        .join("\n"),
        CaseSeedTemplateKind::SpecialInspection => [
            "问题名称,责任单位,检查处室,问题编号,问题描述,发现日期,整改截止时间,优先级,责任人",
            "专项检查问题,海安市教育局,监督检查科,SP-001,专项检查要求整改,2025-09-01,2025-09-16,P2,auditor.special",
        ]
        .join("\n"),
    }
}

fn internal_sample_template_csv_body(
    template_kind: InternalSampleTemplateKind,
) -> (&'static str, String) {
    match template_kind {
        InternalSampleTemplateKind::DepartmentBudgetIndicator => (
            "department-budget-indicator-template.csv",
            [
                "期间,地区,预算单位,单位代码,预算项目,项目库ID,指标文号,预算口径,收支方向,资金来源,功能分类编码,经济分类编码,指标金额,执行金额,内网样本试跑批次,模板版本,字段映射版本,来源标题,来源链接,来源发布日期,采集时间,原始行号,解析器版本",
                "2026,江苏省南通市海安市,海安市财政局,320685001,预算一体化升级,CAT-001,海财指标-2026-001,一般公共预算,支出,一般财力,2019999,30201,1000000,320000,JS-INTERNAL-POC-001,internal-sample-v1,field-map-v1,脱敏预算指标样本,,2026-04-01,2026-04-26T10:00:00+08:00,2,internal-sample-parser-v1",
            ]
            .join("\n"),
        ),
        InternalSampleTemplateKind::ProcurementContract => (
            "procurement-contract-template.csv",
            [
                "项目编号,项目名称,采购单位,供应商名称,合同编号,合同金额,采购阶段,合同公告日期,合同签订日期,预算金额,指标文号,项目库ID,地区,内网样本试跑批次,模板版本,字段映射版本,来源标题,来源链接,来源发布日期,采集时间,原始行号,解析器版本",
                "PROC-001,预算一体化升级,海安市财政局,江苏脱敏科技有限公司,HT-001,980000,contract,2026-04-15,2026-04-12,1000000,海财指标-2026-001,CAT-001,江苏省南通市海安市,JS-INTERNAL-POC-001,internal-sample-v1,field-map-v1,脱敏采购合同样本,,2026-04-15,2026-04-26T10:00:00+08:00,2,internal-sample-parser-v1",
            ]
            .join("\n"),
        ),
        InternalSampleTemplateKind::TreasuryPaymentDetail => (
            "treasury-payment-detail-template.csv",
            [
                "支付单号,国库凭证号,合同编号,收款单位,支付金额,支付日期,预算单位,预算项目,指标文号,摘要,内网样本试跑批次,模板版本,字段映射版本,来源标题,来源链接,来源发布日期,采集时间,原始行号,解析器版本",
                "PAY-001,TV-001,HT-001,江苏脱敏科技有限公司,500000,2026-04-20,海安市财政局,预算一体化升级,海财指标-2026-001,合同首付款,JS-INTERNAL-POC-001,internal-sample-v1,field-map-v1,脱敏国库支付样本,,2026-04-20,2026-04-26T10:00:00+08:00,2,internal-sample-parser-v1",
            ]
            .join("\n"),
        ),
        InternalSampleTemplateKind::VoucherEntryDetail => (
            "voucher-entry-detail-template.csv",
            [
                "凭证号,科目编码,科目名称,借方金额,贷方金额,记账日期,支付单号,国库凭证号,对方单位,摘要,预算单位,预算项目,合同编号,内网样本试跑批次,模板版本,字段映射版本,来源标题,来源链接,来源发布日期,采集时间,原始行号,解析器版本",
                "记-001,500101,业务活动费用,500000,0,2026-04-21,PAY-001,TV-001,江苏脱敏科技有限公司,合同首付款入账,海安市财政局,预算一体化升级,HT-001,JS-INTERNAL-POC-001,internal-sample-v1,field-map-v1,脱敏会计凭证样本,,2026-04-21,2026-04-26T10:00:00+08:00,2,internal-sample-parser-v1",
            ]
            .join("\n"),
        ),
        InternalSampleTemplateKind::RectificationLedger => (
            "rectification-ledger-template.csv",
            [
                "问题编号,问题来源,问题描述,整改责任单位,整改状态,关联项目,规则编号,风险等级,整改建议,整改期限,复核结论,复核日期,内网样本试跑批次,模板版本,字段映射版本,来源标题,来源链接,来源发布日期,采集时间,原始行号,解析器版本",
                "ISSUE-001,审计问题,合同支付凭证链条需要补充完整证据,海安市财政局,整改中,预算一体化升级,PROC-CHAIN-001,Medium,补充合同、支付、凭证和整改佐证,2026-05-15,,,JS-INTERNAL-POC-001,internal-sample-v1,field-map-v1,脱敏整改台账样本,,2026-04-25,2026-04-26T10:00:00+08:00,2,internal-sample-parser-v1",
            ]
            .join("\n"),
        ),
    }
}

fn connector_type_definitions() -> Vec<ConnectorTypeDefinition> {
    [
        ConnectorType::BudgetSystem,
        ConnectorType::TreasurySystem,
        ConnectorType::LedgerSystem,
        ConnectorType::ProcurementSystem,
    ]
    .into_iter()
    .map(|connector_type| ConnectorTypeDefinition {
        connector_type: connector_type.as_str().to_string(),
        label: connector_type.label().to_string(),
    })
    .collect()
}

async fn import_template(
    task_kind: web::Path<String>,
    query: web::Query<ImportTemplateQuery>,
) -> impl Responder {
    let task_kind = match task_kind.parse::<TaskKind>() {
        Ok(task_kind) => task_kind,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };

    match task_kind {
        TaskKind::ProcurementProject => HttpResponse::Ok()
            .content_type("text/csv; charset=utf-8")
            .insert_header((
                "Content-Disposition",
                "attachment; filename=\"procurement-template.csv\"",
            ))
            .body(procurement_template_csv_v2()),
        TaskKind::BudgetSummary => {
            let dataset_kind = query
                .dataset_kind
                .as_deref()
                .unwrap_or("department_execution_detail")
                .parse::<BudgetDatasetKind>()
                .unwrap_or(BudgetDatasetKind::DepartmentExecutionDetail);
            let (filename, body) = match dataset_kind {
                BudgetDatasetKind::DepartmentExecutionDetail => (
                    "budget-execution-template.csv",
                    budget_execution_template_csv(),
                ),
                BudgetDatasetKind::PublicFiscalSummary => (
                    "public-fiscal-summary-template.csv",
                    budget_public_summary_template_csv(),
                ),
                BudgetDatasetKind::PublicStatisticalIndicator => (
                    "public-statistical-indicator-template.csv",
                    budget_public_statistical_indicator_template_csv(),
                ),
                BudgetDatasetKind::InvestmentReviewSummary => (
                    "investment-review-summary-template.csv",
                    budget_investment_review_template_csv(),
                ),
                BudgetDatasetKind::TownshipFiscalExecutionSummary => (
                    "township-fiscal-execution-template.csv",
                    budget_township_fiscal_template_csv(),
                ),
            };
            HttpResponse::Ok()
                .content_type("text/csv; charset=utf-8")
                .insert_header((
                    "Content-Disposition",
                    format!("attachment; filename=\"{}\"", filename),
                ))
                .body(body)
        }
        TaskKind::TreasuryPayment => HttpResponse::Ok()
            .content_type("text/csv; charset=utf-8")
            .insert_header((
                "Content-Disposition",
                "attachment; filename=\"treasury-payment-template.csv\"",
            ))
            .body(treasury_template_csv()),
        TaskKind::VoucherLedger => HttpResponse::Ok()
            .content_type("text/csv; charset=utf-8")
            .insert_header((
                "Content-Disposition",
                "attachment; filename=\"voucher-ledger-template.csv\"",
            ))
            .body(voucher_template_csv()),
        TaskKind::SupervisionCaseSeed => HttpResponse::BadRequest().json(error_json(
            "use /api/case-seeds/template for supervision case seeds",
        )),
    }
}

fn parse_case_seed_template_kind(value: Option<&str>) -> Result<CaseSeedTemplateKind> {
    Ok(match value {
        Some(raw) => raw
            .parse::<CaseSeedTemplateKind>()
            .map_err(anyhow::Error::msg)?,
        None => CaseSeedTemplateKind::InvestmentReview,
    })
}

fn parse_import_profile_scope(value: &str) -> Result<ImportProfileScope> {
    value
        .parse::<ImportProfileScope>()
        .map_err(anyhow::Error::msg)
}

fn parse_automation_schedule_kind(value: &str) -> Result<AutomationScheduleKind> {
    value
        .parse::<AutomationScheduleKind>()
        .map_err(anyhow::Error::msg)
}

fn parse_automation_target_kind(value: &str) -> Result<AutomationTargetKind> {
    value
        .parse::<AutomationTargetKind>()
        .map_err(anyhow::Error::msg)
}

fn parse_case_seed_assignment_rules_json(
    value: Option<&String>,
) -> Result<Vec<CaseSeedAssignmentRule>> {
    match value {
        Some(raw) if !raw.trim().is_empty() => {
            serde_json::from_str::<Vec<CaseSeedAssignmentRule>>(raw)
                .context("failed to parse case seed assignment rules")
        }
        _ => Ok(Vec::new()),
    }
}

fn parse_case_seed_mapping_overrides_json(
    value: Option<&String>,
) -> Result<Vec<CaseSeedMappingOverride>> {
    match value {
        Some(raw) if !raw.trim().is_empty() => {
            serde_json::from_str::<Vec<CaseSeedMappingOverride>>(raw)
                .context("failed to parse case seed mapping overrides")
        }
        _ => Ok(Vec::new()),
    }
}

async fn case_seed_template(query: web::Query<CaseSeedTemplateQuery>) -> impl Responder {
    let template_kind = match parse_case_seed_template_kind(query.template_kind.as_deref()) {
        Ok(kind) => kind,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    HttpResponse::Ok()
        .content_type("text/csv; charset=utf-8")
        .insert_header((
            "Content-Disposition",
            format!(
                "attachment; filename=\"supervision-case-seed-{}-template.csv\"",
                template_kind.as_str()
            ),
        ))
        .body(case_seed_template_csv(template_kind))
}

async fn get_case_seed_config(
    context: web::Data<AppContext>,
    session: Session,
    query: web::Query<CaseSeedTemplateQuery>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    let template_kind = match parse_case_seed_template_kind(query.template_kind.as_deref()) {
        Ok(kind) => kind,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    match context
        .platform
        .get_case_seed_template_config(&identity, template_kind)
    {
        Ok(config) => HttpResponse::Ok().json(CaseSeedConfigResponse { config }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn save_case_seed_config(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CaseSeedTemplateConfig>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context
        .platform
        .save_case_seed_template_config(&identity, request.into_inner())
    {
        Ok(config) => HttpResponse::Ok().json(CaseSeedConfigResponse {
            config: Some(config),
        }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_import_profiles_api(
    context: web::Data<AppContext>,
    session: Session,
    query: web::Query<ImportProfileQuery>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    let task_kind = match query.task_kind.as_deref() {
        Some(raw) => match raw.parse::<TaskKind>() {
            Ok(kind) => Some(kind),
            Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
        },
        None => None,
    };
    match context.platform.list_import_profiles(&identity, task_kind) {
        Ok(profiles) => HttpResponse::Ok().json(ImportProfilesResponse { profiles }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_import_profile_api(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CreateImportProfileRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    let task_kind = match request.task_kind.parse::<TaskKind>() {
        Ok(kind) => kind,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let scope = match parse_import_profile_scope(&request.scope) {
        Ok(scope) => scope,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    match context.platform.save_import_profile(
        &identity,
        ImportProfileInput {
            name: request.name.clone(),
            task_kind,
            template_kind: request.template_kind.clone(),
            scope,
            is_default: request.is_default.unwrap_or(false),
            mapping_overrides: request.mapping_overrides.clone().unwrap_or_default(),
            assignment_rules: request.assignment_rules.clone().unwrap_or_default(),
            notes: request.notes.clone(),
        },
    ) {
        Ok(profile) => HttpResponse::Ok().json(ImportProfileResponse { profile }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn clone_import_profile_api(
    context: web::Data<AppContext>,
    session: Session,
    profile_id: web::Path<String>,
    request: web::Json<CloneImportProfileRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    let scope = match parse_import_profile_scope(&request.scope) {
        Ok(scope) => scope,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    match context
        .platform
        .clone_import_profile(&identity, &profile_id, request.name.clone(), scope)
    {
        Ok(profile) => HttpResponse::Ok().json(ImportProfileResponse { profile }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn export_import_profile_api(
    context: web::Data<AppContext>,
    session: Session,
    profile_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context
        .platform
        .export_import_profile(&identity, &profile_id)
    {
        Ok(profile) => HttpResponse::Ok().json(profile),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_import_profile_api(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<ImportProfile>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context
        .platform
        .import_import_profile(&identity, request.into_inner())
    {
        Ok(profile) => HttpResponse::Ok().json(ImportProfileResponse { profile }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_assignment_dictionary_api(
    context: web::Data<AppContext>,
    session: Session,
    query: web::Query<AssignmentDictionaryQuery>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    let task_kind = match query.task_kind.as_deref() {
        Some(raw) => match raw.parse::<TaskKind>() {
            Ok(kind) => Some(kind),
            Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
        },
        None => None,
    };
    match context.platform.list_assignment_dictionary_rules(
        &identity,
        task_kind,
        query.template_kind.as_deref(),
    ) {
        Ok(rules) => HttpResponse::Ok().json(AssignmentDictionaryResponse { rules }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_assignment_dictionary_rule_api(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CreateAssignmentDictionaryRuleRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    let task_kind = match request.task_kind.parse::<TaskKind>() {
        Ok(kind) => kind,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let scope = match parse_import_profile_scope(&request.scope) {
        Ok(scope) => scope,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    match context.platform.save_assignment_dictionary_rule(
        &identity,
        AssignmentDictionaryRuleInput {
            task_kind,
            template_kind: request.template_kind.clone(),
            match_field: request.match_field.clone(),
            match_value: request.match_value.clone(),
            assignee: request.assignee.clone(),
            target_department: request.target_department.clone(),
            priority: request.priority,
            scope,
            enabled: request.enabled.unwrap_or(true),
            label: request.label.clone(),
        },
    ) {
        Ok(rule) => HttpResponse::Ok().json(AssignmentDictionaryRuleResponse { rule }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn toggle_assignment_dictionary_rule_api(
    context: web::Data<AppContext>,
    session: Session,
    rule_id: web::Path<String>,
    request: web::Json<ToggleAssignmentDictionaryRuleRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context
        .platform
        .toggle_assignment_dictionary_rule(&identity, &rule_id, request.enabled)
    {
        Ok(rule) => HttpResponse::Ok().json(AssignmentDictionaryRuleResponse { rule }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_automation_schedules_api(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context.platform.list_automation_schedules(&identity) {
        Ok(schedules) => HttpResponse::Ok().json(AutomationSchedulesResponse { schedules }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_automation_schedule_api(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CreateAutomationScheduleRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    let schedule_kind = match parse_automation_schedule_kind(&request.schedule_kind) {
        Ok(kind) => kind,
        Err(error) if request.schedule_kind == "manual" => {
            return HttpResponse::BadRequest().json(schema_error_json(
                error.to_string(),
                "use manual_only",
                "/docs/API.md#automation-schedules",
            ))
        }
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let target_kind = match parse_automation_target_kind(&request.target_kind) {
        Ok(kind) => kind,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    match context.platform.save_automation_schedule(
        &identity,
        AutomationScheduleInput {
            name: request.name.clone(),
            schedule_kind,
            target_kind,
            enabled: request.enabled.unwrap_or(true),
            shared_profile_id: request.shared_profile_id.clone(),
            connector_profile_id: request.connector_profile_id.clone(),
            source_path: request.source_path.clone(),
            notes: request.notes.clone(),
        },
    ) {
        Ok(schedule) => HttpResponse::Ok().json(AutomationScheduleResponse { schedule }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn run_automation_schedule_api(
    context: web::Data<AppContext>,
    session: Session,
    schedule_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context
        .platform
        .run_automation_schedule(&identity, &schedule_id)
    {
        Ok(execution) => HttpResponse::Ok().json(AutomationExecutionResponse { execution }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_automation_executions_api(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context.platform.list_automation_executions(&identity) {
        Ok(executions) => HttpResponse::Ok().json(AutomationExecutionsResponse { executions }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_automation_execution_api(
    context: web::Data<AppContext>,
    session: Session,
    execution_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context
        .platform
        .get_automation_execution(&identity, &execution_id)
    {
        Ok(Some(execution)) => HttpResponse::Ok().json(AutomationExecutionResponse { execution }),
        Ok(None) => HttpResponse::NotFound().json(error_json("automation execution not found")),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn preview_case_seed_import(
    context: web::Data<AppContext>,
    session: Session,
    payload: Multipart,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "case seed preview") {
        return response;
    }

    let (file_bytes, file_name, _, fields) = match read_multipart(payload).await {
        Ok(result) => result,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let title = fields.get("title").map(String::as_str);
    let options = match (
        parse_case_seed_template_kind(fields.get("template_kind").map(String::as_str)),
        parse_case_seed_mapping_overrides_json(fields.get("mapping_overrides_json")),
        parse_case_seed_assignment_rules_json(fields.get("assignment_rules_json")),
    ) {
        (Ok(template_kind), Ok(mapping_overrides), Ok(assignment_rules)) => {
            CaseSeedPreviewOptions {
                template_kind,
                mapping_overrides,
                assignment_rules,
            }
        }
        (Err(error), _, _) | (_, Err(error), _) | (_, _, Err(error)) => {
            return HttpResponse::BadRequest().json(error_json(error.to_string()))
        }
    };
    let lowered = file_name.to_ascii_lowercase();
    let preview = if lowered.ends_with(".xlsx") || lowered.ends_with(".xls") {
        preview_case_seed_excel_bytes_with_options(&file_name, &file_bytes, title, options)
    } else {
        preview_case_seed_csv_bytes_with_options(&file_name, &file_bytes, title, options)
    };

    match preview {
        Ok(preview) => HttpResponse::Ok().json(CaseSeedPreviewResponse {
            source_kind: ImportSourceKind::File,
            preview: serde_json::to_value(&preview)
                .unwrap_or_else(|_| serde_json::json!({ "error": "serialize preview failed" })),
        }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_case_seed_batch(
    context: web::Data<AppContext>,
    session: Session,
    body: web::Bytes,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "case seed import") {
        return response;
    }

    let request = match serde_json::from_slice::<CaseSeedBatchPayload>(&body) {
        Ok(request) => request,
        Err(error) => {
            let message = error.to_string();
            let missing = message
                .strip_prefix("missing field `")
                .and_then(|rest| rest.split('`').next())
                .unwrap_or("records");
            return HttpResponse::BadRequest().json(schema_error_json(
                format!("missing or invalid field {missing}"),
                "Expected JSON shape: { \"records\": [ ... ], \"title\": \"optional\", \"template_kind\": \"investment_review\" }",
                "/docs/API.md#case-seeds-import",
            ));
        }
    };
    let preview = preview_case_seed_batch(request);
    match context
        .platform
        .import_case_seed_records(&identity, ImportSourceKind::Batch, &preview)
    {
        Ok(cases) => HttpResponse::Ok().json(CaseSeedImportResponse {
            imported: cases.len(),
            cases,
        }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn preview_import(
    context: web::Data<AppContext>,
    session: Session,
    payload: Multipart,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "file import preview") {
        return response;
    }

    let (file_bytes, file_name, _, fields) = match read_multipart(payload).await {
        Ok(result) => result,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let task_kind = match fields
        .get("task_kind")
        .map(|value| value.parse::<TaskKind>())
        .transpose()
    {
        Ok(Some(task_kind)) => task_kind,
        Ok(None) => return HttpResponse::BadRequest().json(error_json("task_kind is required")),
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let source_kind = match fields
        .get("source_kind")
        .map(|value| value.parse::<ImportSourceKind>())
        .transpose()
    {
        Ok(Some(source_kind)) => source_kind,
        Ok(None) => ImportSourceKind::File,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let title = fields.get("title").map(String::as_str);
    let dataset_kind = fields.get("dataset_kind").cloned();

    let lowered = file_name.to_ascii_lowercase();
    let preview: Result<PreviewImportResponse> = match task_kind {
        TaskKind::ProcurementProject => (|| -> Result<PreviewImportResponse> {
            let preview = if lowered.ends_with(".xlsx") || lowered.ends_with(".xls") {
                preview_procurement_excel_bytes(&file_name, &file_bytes, title)
            } else {
                preview_procurement_csv_bytes(&file_name, &file_bytes, title)
            }?;
            let job_id =
                context
                    .platform
                    .save_procurement_preview_job(&identity, source_kind, &preview)?;
            Ok(PreviewImportResponse {
                job_id,
                task_kind,
                source_kind,
                preview: serde_json::to_value(&preview)
                    .context("failed to serialize procurement preview")?,
            })
        })(),
        TaskKind::BudgetSummary => (|| -> Result<PreviewImportResponse> {
            let dataset_kind = dataset_kind
                .as_deref()
                .unwrap_or("department_execution_detail")
                .parse::<BudgetDatasetKind>()
                .map_err(anyhow::Error::msg)?;
            let preview = if lowered.ends_with(".xlsx") || lowered.ends_with(".xls") {
                preview_budget_excel_bytes(&file_name, &file_bytes, dataset_kind, title)
            } else {
                preview_budget_csv_bytes(&file_name, &file_bytes, dataset_kind, title)
            }?;
            let job_id =
                context
                    .platform
                    .save_budget_preview_job(&identity, source_kind, &preview)?;
            Ok(PreviewImportResponse {
                job_id,
                task_kind,
                source_kind,
                preview: serde_json::to_value(&preview)
                    .context("failed to serialize budget preview")?,
            })
        })(),
        TaskKind::TreasuryPayment => (|| -> Result<PreviewImportResponse> {
            let dataset_kind = dataset_kind
                .as_deref()
                .unwrap_or("treasury_payment_detail")
                .parse::<TreasuryDatasetKind>()
                .map_err(anyhow::Error::msg)?;
            let preview = if lowered.ends_with(".xlsx") || lowered.ends_with(".xls") {
                preview_treasury_excel_bytes(&file_name, &file_bytes, dataset_kind, title)
            } else {
                preview_treasury_csv_bytes(&file_name, &file_bytes, dataset_kind, title)
            }?;
            let job_id =
                context
                    .platform
                    .save_treasury_preview_job(&identity, source_kind, &preview)?;
            Ok(PreviewImportResponse {
                job_id,
                task_kind,
                source_kind,
                preview: serde_json::to_value(&preview)
                    .context("failed to serialize treasury preview")?,
            })
        })(),
        TaskKind::VoucherLedger => (|| -> Result<PreviewImportResponse> {
            let dataset_kind = dataset_kind
                .as_deref()
                .unwrap_or("voucher_entry_detail")
                .parse::<VoucherDatasetKind>()
                .map_err(anyhow::Error::msg)?;
            let preview = if lowered.ends_with(".xlsx") || lowered.ends_with(".xls") {
                preview_voucher_excel_bytes(&file_name, &file_bytes, dataset_kind, title)
            } else {
                preview_voucher_csv_bytes(&file_name, &file_bytes, dataset_kind, title)
            }?;
            let job_id =
                context
                    .platform
                    .save_voucher_preview_job(&identity, source_kind, &preview)?;
            Ok(PreviewImportResponse {
                job_id,
                task_kind,
                source_kind,
                preview: serde_json::to_value(&preview)
                    .context("failed to serialize voucher preview")?,
            })
        })(),
        TaskKind::SupervisionCaseSeed => Err(anyhow::anyhow!(
            "use /api/case-seeds/preview for supervision case seeds"
        )),
    };

    match preview {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn commit_import(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CommitImportRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "import commit") {
        return response;
    }

    match context
        .platform
        .commit_import_job(&identity, &request.job_id)
    {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_procurement_batch(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<ProcurementBatchPayload>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "batch import") {
        return response;
    }
    let preview = preview_procurement_batch(request.into_inner());
    match context
        .platform
        .record_procurement_task(&identity, ImportSourceKind::Batch, &preview)
    {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_budget_batch(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<BudgetBatchPayload>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "batch import") {
        return response;
    }
    let preview = preview_budget_batch(request.into_inner());
    match context
        .platform
        .record_budget_task(&identity, ImportSourceKind::Batch, &preview)
    {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_treasury_batch(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<TreasuryBatchPayload>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "batch import") {
        return response;
    }
    let preview = preview_treasury_batch(request.into_inner());
    match context
        .platform
        .record_treasury_task(&identity, ImportSourceKind::Batch, &preview)
    {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_voucher_batch(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<VoucherBatchPayload>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "batch import") {
        return response;
    }
    let preview = preview_voucher_batch(request.into_inner());
    match context
        .platform
        .record_voucher_task(&identity, ImportSourceKind::Batch, &preview)
    {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn import_procurement_fetch(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<ProcurementFetchRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "connector or fetch import") {
        return response;
    }

    match fetch_procurement_preview(request.into_inner()).await {
        Ok(preview) => match context.platform.record_procurement_task(
            &identity,
            ImportSourceKind::Fetch,
            &preview,
        ) {
            Ok(task) => HttpResponse::Ok().json(task),
            Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
        },
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn fetch_procurement_preview(
    request: ProcurementFetchRequest,
) -> Result<crate::platform::ProcurementPreviewResult> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .context("failed to create procurement http client")?;

    let mut notice_pages: Vec<(String, String)> = Vec::new();
    for input_url in request
        .urls
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        let response = client
            .get(input_url)
            .send()
            .await
            .with_context(|| format!("failed to fetch {}", input_url))?
            .error_for_status()
            .with_context(|| format!("failed to fetch {}", input_url))?;
        let html = response
            .text()
            .await
            .with_context(|| format!("failed to read html from {}", input_url))?;
        let expanded = expand_notice_urls_from_list_page(input_url, &html);
        if expanded.is_empty() {
            notice_pages.push((input_url.to_string(), html));
            continue;
        }
        for notice_url in expanded.into_iter().take(20) {
            let notice_html = client
                .get(&notice_url)
                .send()
                .await
                .with_context(|| format!("failed to fetch {}", notice_url))?
                .error_for_status()
                .with_context(|| format!("failed to fetch {}", notice_url))?
                .text()
                .await
                .with_context(|| format!("failed to read html from {}", notice_url))?;
            notice_pages.push((notice_url, notice_html));
        }
    }

    let mut records = Vec::new();
    for (url, html) in notice_pages {
        if let Some(record) = parse_procurement_notice_html(&url, &html) {
            records.push(record);
        }
    }
    if records.is_empty() {
        anyhow::bail!("未从给定 URL 中识别到可导入的采购公告字段");
    }
    Ok(preview_procurement_batch(ProcurementBatchPayload {
        title: request.title,
        records,
    }))
}

async fn register(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<RegisterRequest>,
) -> impl Responder {
    if context.platform.has_users() && !context.runtime.allow_public_registration {
        return HttpResponse::Forbidden().json(error_json(
            "public self-registration is disabled in this deployment",
        ));
    }
    match context.platform.register_tenant_admin(RegistrationInput {
        tenant_name: request.tenant_name.clone(),
        organization_name: request.organization_name.clone(),
        username: request.username.clone(),
        password: request.password.clone(),
        display_name: request.display_name.clone(),
    }) {
        Ok(profile) => {
            let identity = SessionIdentity {
                user_id: profile.id.clone(),
                tenant_id: profile.tenant_id.clone(),
                organization_id: profile.organization_id.clone(),
                username: profile.username.clone(),
                display_name: profile.display_name.clone(),
                role: profile.role.clone(),
            };
            if let Err(error) = remember_session(&session, &identity) {
                return HttpResponse::InternalServerError()
                    .json(error_json(format!("failed to create session: {}", error)));
            }
            HttpResponse::Ok().json(serde_json::json!({ "success": true, "user": profile }))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn login(
    context: web::Data<AppContext>,
    session: Session,
    request_meta: HttpRequest,
    request: web::Json<LoginRequest>,
) -> impl Responder {
    let source_ip = source_ip_from_request(&request_meta);
    if let Some(locked_until) = login_locked_until(&context, &request.username, &source_ip) {
        let remaining = locked_until
            .saturating_duration_since(Instant::now())
            .as_secs()
            .max(1);
        return HttpResponse::TooManyRequests().json(schema_error_json(
            "login locked",
            format!("Too many failed login attempts. Try again in {} seconds.", remaining),
            "/docs/API.md#auth-login",
        ));
    }

    match context
        .platform
        .authenticate(&request.username, &request.password)
    {
        Ok(identity) => {
            clear_login_failures(&context, &request.username, &source_ip);
            if let Err(error) = remember_session(&session, &identity) {
                return HttpResponse::InternalServerError()
                    .json(error_json(format!("failed to create session: {}", error)));
            }
            let user = context.platform.get_profile(&identity);
            HttpResponse::Ok().json(serde_json::json!({ "success": true, "user": user }))
        }
        Err(error) => {
            record_login_failure(&context, &request.username, &source_ip);
            let _ = context.platform.record_event(
                None,
                "auth.login_failed",
                "user",
                request.username.trim(),
                "failure",
                format!("source_ip={}; {}", source_ip, error),
            );
            HttpResponse::Unauthorized().json(schema_error_json(
                "invalid username or password",
                "Check username/password. After 5 failures, username and source IP are locked for 10 minutes.",
                "/docs/API.md#auth-login",
            ))
        }
    }
}

async fn logout(context: web::Data<AppContext>, session: Session) -> impl Responder {
    if let Ok(identity) = require_session(&session) {
        let _ = context.platform.record_event(
            Some(&identity),
            "auth.logout",
            "user",
            &identity.user_id,
            "success",
            "Logout successful".to_string(),
        );
    }
    session.purge();
    HttpResponse::Ok().json(serde_json::json!({ "success": true }))
}

async fn me(context: web::Data<AppContext>, session: Session) -> impl Responder {
    match require_session(&session) {
        Ok(identity) => HttpResponse::Ok().json(SessionResponse {
            logged_in: true,
            user: context.platform.get_profile(&identity),
        }),
        Err(_) => HttpResponse::Ok().json(SessionResponse {
            logged_in: false,
            user: None,
        }),
    }
}

async fn read_multipart(
    mut payload: Multipart,
) -> Result<(Vec<u8>, String, String, HashMap<String, String>)> {
    let mut file_bytes = Vec::new();
    let mut file_name = "upload.csv".to_string();
    let mut mime_type = String::new();
    let mut fields = HashMap::new();

    while let Some(item) = payload.next().await {
        let mut field =
            item.map_err(|error| anyhow::anyhow!("invalid multipart field: {}", error))?;
        let disposition = field.content_disposition();
        let field_name = disposition
            .as_ref()
            .and_then(|cd| cd.get_name())
            .unwrap_or_default()
            .to_string();

        if field_name == "file" {
            if let Some(name) = disposition
                .as_ref()
                .and_then(|cd| cd.get_filename())
                .map(|value| value.to_string())
            {
                file_name = name;
            }
            if let Some(content_type) = field.content_type() {
                mime_type = content_type.to_string();
            }
            while let Some(chunk) = field.next().await {
                let chunk = chunk.map_err(|error| {
                    anyhow::anyhow!("failed to read multipart chunk: {}", error)
                })?;
                file_bytes.extend_from_slice(&chunk);
            }
            continue;
        }

        let mut buffer = Vec::new();
        while let Some(chunk) = field.next().await {
            let chunk = chunk
                .map_err(|error| anyhow::anyhow!("failed to read multipart field: {}", error))?;
            buffer.extend_from_slice(&chunk);
        }
        fields.insert(
            field_name,
            String::from_utf8_lossy(&buffer).trim().to_string(),
        );
    }

    Ok((file_bytes, file_name, mime_type, fields))
}

fn parse_transactions_from_bytes(
    file_name: &str,
    file_bytes: &[u8],
) -> Result<Vec<crate::models::Transaction>> {
    if file_bytes.is_empty() {
        anyhow::bail!("no file uploaded");
    }
    let temp_dir = std::env::temp_dir();
    let lowered_file_name = file_name.to_ascii_lowercase();
    let extension = if lowered_file_name.ends_with(".xlsx") || lowered_file_name.ends_with(".xls") {
        ".xlsx"
    } else {
        ".csv"
    };
    let temp_path = temp_dir.join(format!("auditlens_{}{}", uuid::Uuid::new_v4(), extension));
    let mut file = std::fs::File::create(&temp_path).context("failed to create temp file")?;
    file.write_all(file_bytes)
        .context("failed to write temp file")?;
    let transactions = if extension == ".xlsx" {
        ExcelParser.parse(&temp_path)
    } else {
        CsvParser.parse(&temp_path)
    };
    let _ = std::fs::remove_file(&temp_path);
    transactions.map_err(Into::into)
}

fn detect_mime_type(file_name: &str, provided_mime_type: &str) -> String {
    if !provided_mime_type.trim().is_empty() {
        return provided_mime_type.to_string();
    }
    let lowered = file_name.to_ascii_lowercase();
    if lowered.ends_with(".jpg") || lowered.ends_with(".jpeg") {
        "image/jpeg".to_string()
    } else if lowered.ends_with(".png") {
        "image/png".to_string()
    } else if lowered.ends_with(".pdf") {
        "application/pdf".to_string()
    } else if lowered.ends_with(".wav") {
        "audio/wav".to_string()
    } else if lowered.ends_with(".mp3") {
        "audio/mpeg".to_string()
    } else if lowered.ends_with(".m4a") {
        "audio/mp4".to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

fn ensure_supported_artifact(
    file_name: &str,
    mime_type: &str,
    artifact_type: &ArtifactType,
) -> Result<()> {
    let lowered = file_name.to_ascii_lowercase();
    let supported = match artifact_type {
        ArtifactType::Image => {
            mime_type.starts_with("image/")
                || mime_type == "application/pdf"
                || lowered.ends_with(".jpg")
                || lowered.ends_with(".jpeg")
                || lowered.ends_with(".png")
                || lowered.ends_with(".pdf")
        }
        ArtifactType::Audio => {
            mime_type.starts_with("audio/")
                || lowered.ends_with(".wav")
                || lowered.ends_with(".mp3")
                || lowered.ends_with(".m4a")
        }
    };

    if supported {
        Ok(())
    } else {
        anyhow::bail!("unsupported {:?} artifact format", artifact_type)
    }
}

fn storage_extension(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{}", extension.to_ascii_lowercase()))
        .unwrap_or_default()
}

fn save_artifact_file(
    task_id: &str,
    artifact_id: &str,
    file_name: &str,
    file_bytes: &[u8],
) -> Result<String> {
    let relative_dir = Path::new("data").join("evidence").join(task_id);
    fs::create_dir_all(&relative_dir)
        .with_context(|| format!("failed to create {}", relative_dir.display()))?;
    let relative_path =
        relative_dir.join(format!("{}{}", artifact_id, storage_extension(file_name)));
    fs::write(&relative_path, file_bytes)
        .with_context(|| format!("failed to write {}", relative_path.display()))?;
    Ok(relative_path.to_string_lossy().replace('\\', "/"))
}

fn save_exception_receipt_file(
    task_id: &str,
    exception_id: &str,
    receipt_id: &str,
    file_name: &str,
    file_bytes: &[u8],
) -> Result<String> {
    let relative_dir = Path::new("data")
        .join("exception-receipts")
        .join(task_id)
        .join(BASE64.encode(exception_id));
    fs::create_dir_all(&relative_dir)
        .with_context(|| format!("failed to create {}", relative_dir.display()))?;
    let relative_path =
        relative_dir.join(format!("{}{}", receipt_id, storage_extension(file_name)));
    fs::write(&relative_path, file_bytes)
        .with_context(|| format!("failed to write {}", relative_path.display()))?;
    Ok(relative_path.to_string_lossy().replace('\\', "/"))
}

fn empty_artifact_summary(artifact_type: &ArtifactType) -> ArtifactStructuredSummary {
    match artifact_type {
        ArtifactType::Image => ArtifactStructuredSummary::Image {
            data: ImageArtifactSummary::default(),
        },
        ArtifactType::Audio => ArtifactStructuredSummary::Audio {
            data: AudioArtifactSummary::default(),
        },
    }
}

fn default_report_template(
    context: &AppContext,
    scenario_id: &str,
    requested: Option<&str>,
) -> String {
    if let Some(template_id) = requested {
        return template_id.to_string();
    }
    context
        .platform
        .list_scenarios()
        .into_iter()
        .find(|scenario| scenario.id == scenario_id)
        .map(|scenario| scenario.report_template_id)
        .unwrap_or_else(|| "gov-standard".to_string())
}

fn create_task_from_transactions(
    context: &AppContext,
    identity: &SessionIdentity,
    scenario_id: String,
    project_name: String,
    dataset_name: String,
    source_kind: String,
    source_label: String,
    report_template_id: String,
    transactions: Vec<crate::models::Transaction>,
) -> Result<crate::platform::AuditTask> {
    let config = context.platform.scenario_config(&scenario_id)?;
    let report = crate::run_audit(&transactions, &config)?;
    let summary = summarize_by_date(&transactions);
    context.platform.record_task(
        identity,
        CompletedTaskInput {
            scenario_id,
            project_name,
            dataset_name,
            source_kind,
            source_label,
            report_template_id,
            report,
            transactions_summary: summary,
        },
    )
}

fn demo_project_name(scenario_id: &str) -> &'static str {
    match scenario_id {
        "state-owned-capital" => "国资监管样板任务",
        "procurement-expense" => "采购审计样板任务",
        _ => "财政监督样板任务",
    }
}

fn demo_dataset_name(scenario_id: &str) -> &'static str {
    match scenario_id {
        "state-owned-capital" => "国资监管脱敏样例",
        "procurement-expense" => "采购审计脱敏样例",
        _ => "财政监督脱敏样例",
    }
}

async fn create_demo_task(
    context: web::Data<AppContext>,
    session: Session,
    body: web::Bytes,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    let request = if body.is_empty() {
        CreateDemoTaskRequest::default()
    } else {
        match serde_json::from_slice::<CreateDemoTaskRequest>(&body) {
            Ok(request) => request,
            Err(error) => {
                return HttpResponse::BadRequest()
                    .json(error_json(format!("invalid demo request: {}", error)));
            }
        }
    };
    let transactions = build_demo_transactions();
    let scenario_id = request
        .scenario_id
        .unwrap_or_else(|| "fiscal-supervision".to_string());
    let project_name = request
        .project_name
        .unwrap_or_else(|| demo_project_name(&scenario_id).to_string());
    let dataset_name = request
        .dataset_name
        .unwrap_or_else(|| demo_dataset_name(&scenario_id).to_string());
    let report_template_id = default_report_template(&context, &scenario_id, None);
    let _ = context.platform.record_event(
        Some(&identity),
        "audit.demo.start",
        "dataset",
        "demo-seed",
        "success",
        "Started demo audit task".to_string(),
    );
    match create_task_from_transactions(
        &context,
        &identity,
        scenario_id,
        project_name,
        dataset_name,
        "demo".to_string(),
        "财政监督主场景脱敏样板数据".to_string(),
        report_template_id,
        transactions,
    ) {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_file_task(
    context: web::Data<AppContext>,
    session: Session,
    payload: Multipart,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "file import") {
        return response;
    }

    let (file_bytes, file_name, _mime_type, fields) = match read_multipart(payload).await {
        Ok(result) => result,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let scenario_id = fields
        .get("scenario_id")
        .cloned()
        .unwrap_or_else(|| "fiscal-supervision".to_string());
    let project_name = fields
        .get("project_name")
        .cloned()
        .unwrap_or_else(|| "财政监督导入任务".to_string());
    let report_template_id = default_report_template(
        &context,
        &scenario_id,
        fields.get("report_template_id").map(String::as_str),
    );
    let _ = context.platform.record_event(
        Some(&identity),
        "audit.file.upload",
        "dataset",
        &file_name,
        "success",
        format!("Uploaded file for scenario {}", scenario_id),
    );

    let transactions = match parse_transactions_from_bytes(&file_name, &file_bytes) {
        Ok(transactions) => transactions,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };

    match create_task_from_transactions(
        &context,
        &identity,
        scenario_id,
        project_name,
        file_name.clone(),
        "file".to_string(),
        format!("file://{}", file_name),
        report_template_id,
        transactions,
    ) {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_database_task(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<DatabaseAuditRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_admin_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "database import") {
        return response;
    }

    let template = match context.platform.resolve_data_source(
        &identity,
        &request.template_id,
        Some(&request.table),
    ) {
        Ok(template) => template,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };

    let query = template.query.replace("{table}", &request.table);
    let db_type = match template.db_type.as_str() {
        "mysql" => DatabaseType::MySQL,
        "postgres" => DatabaseType::PostgreSQL,
        _ => {
            return HttpResponse::BadRequest().json(error_json("unsupported data source type"));
        }
    };
    let connection_string = match db_type {
        DatabaseType::MySQL => format!(
            "mysql://{}:{}@{}/{}",
            request.user, request.password, request.host, request.database
        ),
        DatabaseType::PostgreSQL => format!(
            "postgres://{}:{}@{}/{}",
            request.user, request.password, request.host, request.database
        ),
    };
    let _ = context.platform.record_event(
        Some(&identity),
        "audit.database.start",
        "data_source_template",
        &template.id,
        "success",
        format!(
            "Database audit requested for {}@{}/{}",
            request.user, request.host, request.database
        ),
    );
    let transactions = match crate::database::fetch_transactions(&DatabaseConfig {
        connection_string,
        db_type,
        query: Some(query),
        table_name: Some(request.table.clone()),
    })
    .await
    {
        Ok(transactions) => transactions,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let report_template_id = default_report_template(
        &context,
        &request.scenario_id,
        Some(&request.report_template_id),
    );
    match create_task_from_transactions(
        &context,
        &identity,
        request.scenario_id.clone(),
        request.project_name.clone(),
        format!("{}:{}", request.database, request.table),
        "database".to_string(),
        format!("{} [{}]", request.host, template.name),
        report_template_id,
        transactions,
    ) {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_evidence_artifact(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
    payload: Multipart,
    artifact_type: ArtifactType,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "evidence upload") {
        return response;
    }

    let task_id = task_id.into_inner();
    let (file_bytes, file_name, provided_mime_type, _fields) = match read_multipart(payload).await {
        Ok(result) => result,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let mime_type = detect_mime_type(&file_name, &provided_mime_type);
    if let Err(error) = ensure_supported_artifact(&file_name, &mime_type, &artifact_type) {
        return HttpResponse::BadRequest().json(error_json(error.to_string()));
    }

    let artifact_id = uuid::Uuid::new_v4().to_string();
    let storage_path = match save_artifact_file(&task_id, &artifact_id, &file_name, &file_bytes) {
        Ok(path) => path,
        Err(error) => {
            return HttpResponse::InternalServerError().json(error_json(error.to_string()))
        }
    };

    let multimodal_config = context.runtime.multimodal_config();
    let recognition = match artifact_type {
        ArtifactType::Image => {
            multimodal::recognize_image(&file_name, &mime_type, &file_bytes, &multimodal_config)
                .await
        }
        ArtifactType::Audio => {
            multimodal::recognize_audio(&file_name, &mime_type, &file_bytes, &multimodal_config)
                .await
        }
    };

    let (transcript_text, structured_summary, status, error_message) = match recognition {
        Ok(result) => (
            result.transcript_text,
            result.structured_summary,
            ArtifactStatus::Completed,
            None,
        ),
        Err(error) => (
            String::new(),
            empty_artifact_summary(&artifact_type),
            ArtifactStatus::Failed,
            Some(error.to_string()),
        ),
    };

    match context.platform.create_evidence_artifact(
        &identity,
        &task_id,
        NewEvidenceArtifactInput {
            id: artifact_id,
            artifact_type: artifact_type.clone(),
            source_filename: file_name,
            mime_type,
            storage_path,
            transcript_text,
            structured_summary,
            status,
            error_message,
        },
    ) {
        Ok(artifact) => HttpResponse::Ok().json(artifact),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn create_image_artifact(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
    payload: Multipart,
) -> impl Responder {
    create_evidence_artifact(context, session, task_id, payload, ArtifactType::Image).await
}

async fn create_audio_artifact(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
    payload: Multipart,
) -> impl Responder {
    create_evidence_artifact(context, session, task_id, payload, ArtifactType::Audio).await
}

async fn list_task_artifacts(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    HttpResponse::Ok().json(ArtifactListResponse {
        artifacts: context
            .platform
            .list_evidence_artifacts(&identity, &task_id),
    })
}

async fn retry_task_artifact(
    context: web::Data<AppContext>,
    session: Session,
    path: web::Path<(String, String)>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "evidence processing") {
        return response;
    }
    let (task_id, artifact_id) = path.into_inner();
    let artifact = match context
        .platform
        .get_evidence_artifact(&identity, &task_id, &artifact_id)
    {
        Some(artifact) => artifact,
        None => return HttpResponse::NotFound().json(error_json("artifact not found")),
    };
    let file_bytes = match fs::read(&artifact.storage_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return HttpResponse::InternalServerError().json(error_json(format!(
                "failed to read artifact file: {}",
                error
            )));
        }
    };
    let multimodal_config = context.runtime.multimodal_config();
    let recognition = match artifact.artifact_type {
        ArtifactType::Image => {
            multimodal::recognize_image(
                &artifact.source_filename,
                &artifact.mime_type,
                &file_bytes,
                &multimodal_config,
            )
            .await
        }
        ArtifactType::Audio => {
            multimodal::recognize_audio(
                &artifact.source_filename,
                &artifact.mime_type,
                &file_bytes,
                &multimodal_config,
            )
            .await
        }
    };

    let (transcript_text, structured_summary, status, error_message) = match recognition {
        Ok(result) => (
            result.transcript_text,
            result.structured_summary,
            ArtifactStatus::Completed,
            None,
        ),
        Err(error) => (
            String::new(),
            empty_artifact_summary(&artifact.artifact_type),
            ArtifactStatus::Failed,
            Some(error.to_string()),
        ),
    };

    match context.platform.update_evidence_artifact(
        &identity,
        &task_id,
        &artifact_id,
        transcript_text,
        structured_summary,
        status,
        error_message,
    ) {
        Ok(updated) => HttpResponse::Ok().json(updated),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_tasks(context: web::Data<AppContext>, session: Session) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    HttpResponse::Ok().json(context.platform.list_platform_tasks(&identity))
}

fn any_task_response_value(task: &AnyTask) -> serde_json::Value {
    let mut value = match task {
        AnyTask::LegacyDemo(task) => serde_json::to_value(task),
        AnyTask::V2Platform(task) | AnyTask::V2Typed(task) => serde_json::to_value(task),
    }
    .unwrap_or_else(|_| serde_json::json!({}));
    if let serde_json::Value::Object(ref mut object) = value {
        object.insert(
            "task_origin".to_string(),
            serde_json::Value::String(task.origin().as_str().to_string()),
        );
    }
    value
}

fn normalize_exception_targets_for_task(
    task_id: &str,
    targets: &[ExceptionBulkActionTarget],
) -> std::result::Result<Vec<ExceptionBulkActionTarget>, serde_json::Value> {
    let mut normalized = targets.to_vec();
    for target in &mut normalized {
        match target.task_id.as_deref() {
            Some(target_task_id) if target_task_id != task_id => {
                return Err(schema_error_json(
                    "task_id mismatch",
                    "targets[].task_id must be omitted or match the path task_id",
                    "/docs/API.md#exceptions-status",
                ));
            }
            Some(_) => {}
            None => target.task_id = Some(task_id.to_string()),
        }
    }
    Ok(normalized)
}

async fn get_task(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    let task_id = task_id.into_inner();
    match context.platform.find_any_task(&identity, &task_id) {
        Some(task) => HttpResponse::Ok().json(any_task_response_value(&task)),
        None => HttpResponse::NotFound().json(task_not_found_json(&task_id)),
    }
}

async fn list_task_exceptions(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    match context
        .platform
        .list_task_exception_pool(&identity, &task_id)
    {
        Ok(items) => HttpResponse::Ok().json(items),
        Err(error) if error.to_string().contains("task not found") => {
            match context.platform.find_any_task(&identity, &task_id) {
                Some(AnyTask::LegacyDemo(_)) => {
                    HttpResponse::Ok().json(Vec::<serde_json::Value>::new())
                }
                Some(AnyTask::V2Platform(_)) | Some(AnyTask::V2Typed(_)) => {
                    HttpResponse::Ok().json(Vec::<serde_json::Value>::new())
                }
                None => HttpResponse::NotFound().json(task_not_found_json(&task_id)),
            }
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_cases(context: web::Data<AppContext>, session: Session) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context.platform.list_cases(&identity) {
        Ok(items) => HttpResponse::Ok().json(items),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_case(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context.platform.get_case(&identity, &case_id) {
        Ok(Some(case)) => HttpResponse::Ok().json(case),
        Ok(None) => HttpResponse::NotFound().json(error_json("case not found")),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn assign_cases(
    context: web::Data<AppContext>,
    session: Session,
    payload: web::Json<CaseAssignRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    if payload.case_ids.is_empty() {
        return HttpResponse::BadRequest().json(error_json("case_ids are required"));
    }
    match context.platform.assign_cases(
        &identity,
        &payload.case_ids,
        payload
            .assignee
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .source_department
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .target_department
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .rectification_unit_name
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .sla_due_at
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(updated) => HttpResponse::Ok().json(CaseMutationResponse { updated }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn transition_cases(
    context: web::Data<AppContext>,
    session: Session,
    payload: web::Json<CaseTransitionRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    if payload.case_ids.is_empty() {
        return HttpResponse::BadRequest().json(error_json("case_ids are required"));
    }
    match context.platform.transition_cases(
        &identity,
        &payload.case_ids,
        &payload.current_stage,
        payload
            .note
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .outcome
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .priority
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .due_at
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload.reminder_flag,
    ) {
        Ok(updated) => HttpResponse::Ok().json(CaseMutationResponse { updated }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn submit_case_rectification(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
    payload: web::Json<CaseRectificationRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_rectification_role(&identity) {
        return response;
    }
    match context.platform.submit_case_rectification(
        &identity,
        &case_id,
        payload
            .rectification_statement
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .requested_extension
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(submission) => HttpResponse::Ok().json(submission),
        Err(error) if error.to_string().contains("case not found") => {
            HttpResponse::NotFound().json(error_json("case not found"))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn review_case_rectification(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
    payload: web::Json<CaseReviewRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_review_role(&identity) {
        return response;
    }
    match context.platform.review_case_rectification(
        &identity,
        &case_id,
        &payload.decision,
        payload
            .note
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(review) => HttpResponse::Ok().json(review),
        Err(error) if error.to_string().contains("case not found") => {
            HttpResponse::NotFound().json(error_json("case not found"))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn remind_case(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
    payload: web::Json<CaseReminderRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context.platform.record_case_reminder(
        &identity,
        &case_id,
        payload
            .note
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(error) if error.to_string().contains("case not found") => {
            HttpResponse::NotFound().json(error_json("case not found"))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_case_timeline(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context.platform.get_case(&identity, &case_id) {
        Ok(Some(case)) => HttpResponse::Ok().json(case.transition_history),
        Ok(None) => HttpResponse::NotFound().json(error_json("case not found")),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_case_metrics(context: web::Data<AppContext>, session: Session) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_workbench_role(&identity) {
        return response;
    }
    match context.platform.case_metrics(&identity) {
        Ok(metrics) => HttpResponse::Ok().json(metrics),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn list_rectification_cases(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_rectification_role(&identity) {
        return response;
    }
    match context.platform.list_rectification_cases(&identity) {
        Ok(items) => HttpResponse::Ok().json(items),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_rectification_case(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_rectification_role(&identity) {
        return response;
    }
    match context.platform.get_case(&identity, &case_id) {
        Ok(Some(case)) => HttpResponse::Ok().json(case),
        Ok(None) => HttpResponse::NotFound().json(error_json("case not found")),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn request_case_extension(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
    payload: web::Json<CaseExtensionRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_rectification_role(&identity) {
        return response;
    }
    match context.platform.submit_case_extension_request(
        &identity,
        &case_id,
        &payload.requested_due_at,
        payload
            .reason
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(request) => HttpResponse::Ok().json(request),
        Err(error) if error.to_string().contains("case not found") => {
            HttpResponse::NotFound().json(error_json("case not found"))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn upload_rectification_attachment(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
    payload: Multipart,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_rectification_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "evidence upload") {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "evidence upload") {
        return response;
    }
    let (file_bytes, file_name, provided_mime_type, fields) = match read_multipart(payload).await {
        Ok(result) => result,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    if file_bytes.is_empty() {
        return HttpResponse::BadRequest().json(error_json("attachment file is required"));
    }
    let note = fields
        .get("note")
        .cloned()
        .filter(|value| !value.trim().is_empty());
    let mime_type = detect_mime_type(&file_name, &provided_mime_type);
    let storage_path = match save_exception_receipt_file(
        "rectification",
        &case_id,
        &uuid::Uuid::new_v4().to_string(),
        &file_name,
        &file_bytes,
    ) {
        Ok(path) => path,
        Err(error) => {
            return HttpResponse::InternalServerError().json(error_json(error.to_string()))
        }
    };
    match context.platform.create_case_receipt_attachment(
        &identity,
        &case_id,
        &file_name,
        &mime_type,
        &storage_path,
        note,
    ) {
        Ok(attachment) => HttpResponse::Ok().json(attachment),
        Err(error) if error.to_string().contains("case not found") => {
            HttpResponse::NotFound().json(error_json("case not found"))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn review_case_decision(
    context: web::Data<AppContext>,
    session: Session,
    case_id: web::Path<String>,
    payload: web::Json<CaseReviewRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_case_review_role(&identity) {
        return response;
    }
    match context.platform.review_case_decision(
        &identity,
        &case_id,
        &payload.decision,
        payload
            .note
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(review) => HttpResponse::Ok().json(review),
        Err(error) if error.to_string().contains("case not found") => {
            HttpResponse::NotFound().json(error_json("case not found"))
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_case_metrics_overview(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context.platform.case_metrics_overview(&identity) {
        Ok(metrics) => HttpResponse::Ok().json(metrics),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_case_metrics_dimension(
    context: web::Data<AppContext>,
    session: Session,
    dimension: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context
        .platform
        .case_metrics_by_dimension(&identity, &dimension)
    {
        Ok(metrics) => HttpResponse::Ok().json(metrics),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn get_case_metrics_by_department(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    get_case_metrics_dimension(context, session, web::Path::from("department".to_string())).await
}

async fn get_case_metrics_by_rectification_unit(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    get_case_metrics_dimension(
        context,
        session,
        web::Path::from("rectification_unit".to_string()),
    )
    .await
}

async fn get_case_metrics_by_handler(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    get_case_metrics_dimension(context, session, web::Path::from("handler".to_string())).await
}

async fn get_case_metrics_trends(
    context: web::Data<AppContext>,
    session: Session,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context.platform.case_metrics_trends(&identity) {
        Ok(trends) => HttpResponse::Ok().json(trends),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn export_cases(context: web::Data<AppContext>, session: Session) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_operations_role(&identity) {
        return response;
    }
    match context.platform.export_cases_csv(&identity) {
        Ok(csv) => HttpResponse::Ok()
            .insert_header((header::CONTENT_TYPE, "text/csv; charset=utf-8"))
            .insert_header((
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"cases-export.csv\"",
            ))
            .body(csv),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn upload_exception_receipt(
    context: web::Data<AppContext>,
    session: Session,
    path: web::Path<(String, String)>,
    payload: Multipart,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "evidence upload") {
        return response;
    }

    let (task_id, exception_id) = path.into_inner();
    let (file_bytes, file_name, provided_mime_type, fields) = match read_multipart(payload).await {
        Ok(result) => result,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    if file_bytes.is_empty() {
        return HttpResponse::BadRequest().json(error_json("receipt file is required"));
    }
    let source = fields
        .get("source")
        .cloned()
        .unwrap_or_else(|| "rule".to_string());
    let note = fields
        .get("note")
        .cloned()
        .filter(|value| !value.trim().is_empty());
    let mime_type = detect_mime_type(&file_name, &provided_mime_type);
    let receipt_id = uuid::Uuid::new_v4().to_string();
    let storage_path = match save_exception_receipt_file(
        &task_id,
        &exception_id,
        &receipt_id,
        &file_name,
        &file_bytes,
    ) {
        Ok(path) => path,
        Err(error) => {
            return HttpResponse::InternalServerError().json(error_json(error.to_string()))
        }
    };

    match context.platform.create_exception_receipt_attachment(
        &identity,
        &task_id,
        &exception_id,
        &source,
        &file_name,
        &mime_type,
        &storage_path,
        note,
    ) {
        Ok(attachment) => HttpResponse::Ok().json(attachment),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn download_exception_receipt(
    context: web::Data<AppContext>,
    session: Session,
    path: web::Path<(String, String, String)>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    let (task_id, exception_id, receipt_id) = path.into_inner();
    let attachment = match context.platform.get_exception_receipt_attachment(
        &identity,
        &task_id,
        &exception_id,
        &receipt_id,
    ) {
        Some(attachment) => attachment,
        None => return HttpResponse::NotFound().json(error_json("receipt not found")),
    };
    let bytes = match fs::read(&attachment.storage_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return HttpResponse::InternalServerError().json(error_json(error.to_string()))
        }
    };
    HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, attachment.mime_type))
        .insert_header((
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", attachment.file_name),
        ))
        .body(bytes)
}

async fn bulk_update_task_exceptions(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
    payload: web::Json<ExceptionBulkUpdateRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    let status = match parse_case_status(Some(payload.status.as_str())) {
        Ok(Some(status)) => status,
        Ok(None) => return HttpResponse::BadRequest().json(error_json("status is required")),
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    if payload.targets.is_empty() {
        return HttpResponse::BadRequest().json(error_json("targets are required"));
    }
    let task_id = task_id.into_inner();
    let targets = match normalize_exception_targets_for_task(&task_id, &payload.targets) {
        Ok(targets) => targets,
        Err(error) => return HttpResponse::BadRequest().json(error),
    };
    match context.platform.bulk_update_task_exceptions(
        &identity,
        &targets,
        status,
        payload.assignee.clone(),
        payload.disposition_note.clone(),
        payload
            .disposition_priority
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .disposition_outcome
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload
            .remediation_due_at
            .clone()
            .filter(|value| !value.trim().is_empty()),
        payload.reminder_flag,
        payload
            .reminder_note
            .clone()
            .filter(|value| !value.trim().is_empty()),
    ) {
        Ok(updated) => HttpResponse::Ok().json(ExceptionBulkUpdateResponse { updated }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

fn parse_case_status(value: Option<&str>) -> Result<Option<FindingCaseStatus>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let status = match value {
        "Open" | "open" => FindingCaseStatus::Open,
        "InReview" | "in_review" | "inreview" => FindingCaseStatus::InReview,
        "Resolved" | "resolved" => FindingCaseStatus::Resolved,
        "Closed" | "closed" => FindingCaseStatus::Closed,
        _ => anyhow::bail!("invalid case status"),
    };
    Ok(Some(status))
}

async fn update_finding(
    context: web::Data<AppContext>,
    session: Session,
    path: web::Path<(String, String)>,
    request: web::Json<UpdateFindingRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    let (task_id, finding_id) = path.into_inner();
    let status = match parse_case_status(request.status.as_deref()) {
        Ok(status) => status,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    match context.platform.update_finding_case(
        &identity,
        &task_id,
        &finding_id,
        request.assignee.clone(),
        request.note.clone(),
        status,
    ) {
        Ok(task) => HttpResponse::Ok().json(task),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn analyze_task_with_ai(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
) -> impl Responder {
    if !context.runtime.ai_enabled {
        return HttpResponse::BadRequest().json(error_json(
            "AI is disabled by deployment policy for this environment",
        ));
    }
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    let task_id = task_id.into_inner();
    let task = match context.platform.find_any_task(&identity, &task_id) {
        Some(task) => task,
        None => return HttpResponse::NotFound().json(task_not_found_json(&task_id)),
    };
    let report = match &task {
        AnyTask::LegacyDemo(task) => task.report.clone(),
        AnyTask::V2Platform(task) | AnyTask::V2Typed(task) => {
            platform_task_report(task, task_quality_report(&task.detail))
        }
    };
    let profile = context.platform.ai_profile();
    if profile.enabled && !context.runtime.ai_secret_configured() {
        return HttpResponse::BadRequest().json(error_json("secret_not_configured"));
    }
    let config = AiConfig {
        api_url: profile.api_url.clone(),
        api_key: if profile.enabled {
            context.runtime.ai_api_key().unwrap_or_default()
        } else {
            String::new()
        },
        model: profile.model.clone(),
    };
    let analysis = match ai_analysis::analyze_with_ai(&report, &config).await {
        Ok(analysis) => analysis,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let _ = context.platform.record_event(
        Some(&identity),
        "audit.ai.analyze",
        "task",
        task.id(),
        "success",
        format!("Provider={} model={}", profile.provider, profile.model),
    );
    HttpResponse::Ok().json(serde_json::json!({
        "guidance": profile.guidance,
        "analysis": analysis,
    }))
}

fn task_quality_report(detail: &TaskDetailPayload) -> &ImportQualityReport {
    match detail {
        TaskDetailPayload::VoucherLedger(detail) => &detail.quality_report,
        TaskDetailPayload::BudgetSummary(detail) => &detail.quality_report,
        TaskDetailPayload::ProcurementProject(detail) => &detail.quality_report,
        TaskDetailPayload::TreasuryPayment(detail) => &detail.quality_report,
    }
}

fn platform_finding_risk_level(value: &str) -> FindingRiskLevel {
    match value {
        "Critical" => FindingRiskLevel::Critical,
        "High" => FindingRiskLevel::High,
        "Medium" => FindingRiskLevel::Medium,
        _ => FindingRiskLevel::Low,
    }
}

fn platform_finding_severity(value: &str) -> Severity {
    match value {
        "Critical" | "High" => Severity::Error,
        "Medium" => Severity::Warning,
        _ => Severity::Info,
    }
}

fn platform_task_report(task: &PlatformTask, quality_report: &ImportQualityReport) -> AuditReport {
    let total_rows = quality_report.total_rows.max(task.findings.len());
    let mut report = AuditReport::new(total_rows, Decimal::ZERO, Decimal::ZERO);
    for finding in &task.findings {
        report.add_finding(AuditFinding {
            rule_code: finding.rule_code.clone(),
            rule_name: finding.rule_name.clone(),
            rule_category: finding.rule_category.clone(),
            risk_level: platform_finding_risk_level(&finding.risk_level),
            severity: platform_finding_severity(&finding.risk_level),
            message: finding.summary.clone(),
            legal_basis: crate::models::DEFAULT_LEGAL_BASIS.into(),
            audit_rationale: finding.audit_rationale.clone(),
            evidence_summary: finding.evidence_summary.clone(),
            recommended_action: finding.recommended_action.clone(),
            related_rows: Vec::new(),
        });
    }
    report
}

fn generate_pdf_bytes(
    task_id: &str,
    report: &AuditReport,
    branding: &PdfBranding,
    quality_report: Option<&ImportQualityReport>,
) -> Result<Vec<u8>> {
    let temp_path = std::env::temp_dir().join(format!("audit_report_{}.pdf", task_id));
    PdfReportGenerator::generate_with_branding_and_quality(
        report,
        &temp_path,
        branding,
        quality_report,
    )?;
    let bytes = std::fs::read(&temp_path)
        .with_context(|| format!("failed to read generated PDF {}", temp_path.display()))?;
    let _ = std::fs::remove_file(&temp_path);
    Ok(bytes)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn seal_signature(
    task_id: &str,
    exported_by: &str,
    exported_at: &str,
    files: &[serde_json::Value],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(task_id.as_bytes());
    hasher.update(exported_by.as_bytes());
    hasher.update(exported_at.as_bytes());
    for file in files {
        hasher.update(file["name"].as_str().unwrap_or_default().as_bytes());
        hasher.update(file["sha256"].as_str().unwrap_or_default().as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

fn build_seal_payload(task: &AnyTask, identity: &SessionIdentity) -> serde_json::Value {
    let generated_at = chrono::Utc::now().to_rfc3339();
    let task_value = any_task_response_value(task);
    match task {
        AnyTask::LegacyDemo(task) => serde_json::json!({
            "task_id": &task.id,
            "base_info": {
                "title": &task.project_id,
                "status": &task.status,
                "risk_level": &task.risk_level,
                "created_at": &task.created_at,
                "completed_at": &task.completed_at,
            },
            "task_origin": "legacy_demo",
            "task_kind": "legacy_demo",
            "rule_results": &task.report.findings,
            "associated_budget": &task.transactions_summary,
            "evidence_summary": task.report.findings.iter().map(|finding| finding.evidence_summary.clone()).collect::<Vec<_>>(),
            "rectification_status": &task.findings,
            "operator": &identity.username,
            "generated_at": generated_at,
            "rule_version": env!("CARGO_PKG_VERSION"),
            "template_version": &task.report_template_id,
            "raw_task": task_value,
        }),
        AnyTask::V2Platform(task) | AnyTask::V2Typed(task) => serde_json::json!({
            "task_id": &task.id,
            "base_info": {
                "title": &task.title,
                "status": &task.status,
                "risk_level": &task.risk_level,
                "primary_subject": &task.primary_subject,
                "created_at": &task.created_at,
                "updated_at": &task.updated_at,
            },
            "task_origin": task_value.get("task_origin").and_then(|value| value.as_str()).unwrap_or("v2_typed"),
            "task_kind": task.task_kind.as_str(),
            "rule_results": &task.findings,
            "associated_budget": {
                "budget_linkage_summary": &task.budget_linkage_summary,
                "contract_linkage_summary": &task.contract_linkage_summary,
                "payment_linkage_summary": &task.payment_linkage_summary,
                "ledger_linkage_summary": &task.ledger_linkage_summary,
            },
            "evidence_summary": task.findings.iter().map(|finding| finding.evidence_summary.clone()).collect::<Vec<_>>(),
            "rectification_status": task.findings.iter().map(|finding| serde_json::json!({
                "finding_id": &finding.id,
                "status": &finding.finding_status,
                "assignee": &finding.assignee,
                "disposition_note": &finding.disposition_note,
                "remediation_due_at": &finding.remediation_due_at,
            })).collect::<Vec<_>>(),
            "operator": &identity.username,
            "generated_at": generated_at,
            "rule_version": env!("CARGO_PKG_VERSION"),
            "template_version": "gov-standard-v1",
            "detail": &task.detail,
            "raw_task": task_value,
        }),
    }
}

fn build_seal_package(
    task: &AnyTask,
    identity: &SessionIdentity,
    key: &[u8],
) -> Result<(Vec<u8>, String)> {
    let payload = build_seal_payload(task, identity);
    let payload_text = serde_json::to_string_pretty(&payload)?;
    let encrypted = crate::encryption::encrypt_with_key(
        &payload_text,
        key,
        &format!("tenant:{}", identity.tenant_id),
    )?;
    let encrypted_text = serde_json::to_string_pretty(&encrypted)?;
    let encrypted_bytes = encrypted_text.as_bytes();
    let exported_at = chrono::Utc::now().to_rfc3339();
    let files = vec![serde_json::json!({
        "name": "encrypted_payload.json",
        "sha256": sha256_hex(encrypted_bytes),
    })];
    let signature = seal_signature(task.id(), &identity.username, &exported_at, &files);
    let manifest = serde_json::json!({
        "task_id": task.id(),
        "exported_by": identity.username,
        "exported_at": exported_at,
        "rule_version": env!("CARGO_PKG_VERSION"),
        "template_version": match task {
            AnyTask::LegacyDemo(task) => task.report_template_id.as_str(),
            AnyTask::V2Platform(_) | AnyTask::V2Typed(_) => "gov-standard-v1",
        },
        "files": files,
        "signature": signature,
    });
    let manifest_text = serde_json::to_string_pretty(&manifest)?;

    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("manifest.json", options)?;
    zip.write_all(manifest_text.as_bytes())?;
    zip.start_file("encrypted_payload.json", options)?;
    zip.write_all(encrypted_bytes)?;
    let cursor = zip.finish()?;
    Ok((cursor.into_inner(), signature))
}

async fn export_task_pdf(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if !identity.role.can_export_sensitive() {
        return HttpResponse::Forbidden().json(error_json("export permission required"));
    }
    let task_id = task_id.into_inner();
    let task = match context.platform.find_any_task(&identity, &task_id) {
        Some(task) => task,
        None => return HttpResponse::NotFound().json(task_not_found_json(&task_id)),
    };
    match task {
        AnyTask::V2Platform(task) | AnyTask::V2Typed(task) => {
            let template =
                context
                    .platform
                    .resolve_report_template("gov-standard")
                    .unwrap_or_else(|| crate::platform::ReportTemplate {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        institution_name: "AuditLens Governance Suite".to_string(),
                        cover_title: "Audit Review Report".to_string(),
                        watermark: "CONFIDENTIAL".to_string(),
                        classification: "Internal".to_string(),
                        active: true,
                    });
            let branding = PdfBranding {
                institution_name: template.institution_name,
                cover_title: template.cover_title,
                watermark: template.watermark,
                classification: template.classification,
            };
            let quality_report = task_quality_report(&task.detail);
            let report = platform_task_report(&task, quality_report);
            let bytes = match generate_pdf_bytes(&task.id, &report, &branding, Some(quality_report))
            {
                Ok(bytes) => bytes,
                Err(error) => {
                    return HttpResponse::InternalServerError().json(error_json(error.to_string()));
                }
            };
            let _ = context.platform.record_event(
                Some(&identity),
                "audit.report.export_pdf",
                "task",
                &task.id,
                "success",
                "Exported platform task report using template gov-standard".to_string(),
            );
            HttpResponse::Ok()
                .content_type("application/pdf")
                .insert_header((
                    "Content-Disposition",
                    format!("attachment; filename=\"audit-report-{}.pdf\"", task.id),
                ))
                .body(bytes)
        }
        AnyTask::LegacyDemo(task) => {
            let template = context
                .platform
                .resolve_report_template(&task.report_template_id)
                .unwrap_or_else(|| crate::platform::ReportTemplate {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    institution_name: "AuditLens Governance Suite".to_string(),
                    cover_title: "Audit Review Report".to_string(),
                    watermark: "CONFIDENTIAL".to_string(),
                    classification: "Internal".to_string(),
                    active: true,
                });
            let branding = PdfBranding {
                institution_name: template.institution_name,
                cover_title: template.cover_title,
                watermark: template.watermark,
                classification: template.classification,
            };
            let bytes = match generate_pdf_bytes(&task.id, &task.report, &branding, None) {
                Ok(bytes) => bytes,
                Err(error) => {
                    return HttpResponse::InternalServerError().json(error_json(error.to_string()));
                }
            };
            let _ = context.platform.record_event(
                Some(&identity),
                "audit.report.export_pdf",
                "task",
                &task.id,
                "success",
                format!("Exported report using template {}", task.report_template_id),
            );
            HttpResponse::Ok()
                .content_type("application/pdf")
                .insert_header((
                    "Content-Disposition",
                    format!("attachment; filename=\"audit-report-{}.pdf\"", task.id),
                ))
                .body(bytes)
        }
    }
}

async fn seal_task_export(
    context: web::Data<AppContext>,
    session: Session,
    task_id: web::Path<String>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if !identity.role.can_export_sensitive() {
        return HttpResponse::Forbidden().json(error_json("export permission required"));
    }
    let task_id = task_id.into_inner();
    let task = match context.platform.find_any_task(&identity, &task_id) {
        Some(task) => task,
        None => return HttpResponse::NotFound().json(task_not_found_json(&task_id)),
    };
    let key = match context.platform.tenant_data_key(&identity.tenant_id) {
        Some(key) => key,
        None => {
            return HttpResponse::InternalServerError().json(error_json("tenant key unavailable"));
        }
    };
    let (package, signature) = match build_seal_package(&task, &identity, &key) {
        Ok(package) => package,
        Err(error) => {
            return HttpResponse::InternalServerError().json(error_json(error.to_string()));
        }
    };
    let _ = context.platform.record_event(
        Some(&identity),
        "audit.report.seal",
        "task",
        task.id(),
        "success",
        format!("Created tenant-managed sealed report package signature={signature}"),
    );
    HttpResponse::Ok()
        .content_type("application/zip")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"audit-seal-{}.zip\"", task.id()),
        ))
        .insert_header(("X-Seal-Sha256", sha256_hex(&package)))
        .body(package)
}

async fn create_public_lead_request(
    context: web::Data<AppContext>,
    request: web::Json<PublicLeadRequest>,
) -> impl Responder {
    match context.platform.create_lead_request(LeadRequestInput {
        contact_name: request.contact_name.clone(),
        contact_channel: request.contact_channel.clone(),
        unit_type: request.unit_type.clone(),
        department: request.department.clone(),
        audit_scenario: request.audit_scenario.clone(),
        deployment_preference: request.deployment_preference.clone(),
        involves_real_data: request.involves_real_data,
        ai_expectation: request.ai_expectation.clone(),
        note: request.note.clone(),
    }) {
        Ok(lead) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "lead_request": lead,
        })),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn connectors_bootstrap(context: web::Data<AppContext>, session: Session) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }

    let profiles = match context.platform.list_connector_profiles(&identity) {
        Ok(items) => items,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let sync_jobs = match context.platform.list_connector_sync_jobs(&identity) {
        Ok(items) => items,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let writeback_events = match context.platform.list_writeback_events(&identity) {
        Ok(items) => items,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };

    HttpResponse::Ok().json(ConnectorBootstrapResponse {
        connector_types: connector_type_definitions(),
        profiles,
        sync_jobs,
        writeback_events,
    })
}

async fn connectors_create_profile(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CreateConnectorProfileRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_admin_role(&identity) {
        return response;
    }

    let connector_type = match request.connector_type.parse::<ConnectorType>() {
        Ok(value) => value,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let task_kind = match request.task_kind.parse::<TaskKind>() {
        Ok(value) => value,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    let dataset_kind = match task_kind {
        TaskKind::ProcurementProject => None,
        TaskKind::BudgetSummary => match request.dataset_kind.as_deref() {
            Some(value) => match value.parse::<BudgetDatasetKind>() {
                Ok(kind) => Some(kind.as_str().to_string()),
                Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
            },
            None => Some(
                BudgetDatasetKind::DepartmentExecutionDetail
                    .as_str()
                    .to_string(),
            ),
        },
        TaskKind::TreasuryPayment => match request.dataset_kind.as_deref() {
            Some(value) => match value.parse::<TreasuryDatasetKind>() {
                Ok(kind) => Some(kind.as_str().to_string()),
                Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
            },
            None => Some(
                TreasuryDatasetKind::TreasuryPaymentDetail
                    .as_str()
                    .to_string(),
            ),
        },
        TaskKind::VoucherLedger => match request.dataset_kind.as_deref() {
            Some(value) => match value.parse::<VoucherDatasetKind>() {
                Ok(kind) => Some(kind.as_str().to_string()),
                Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
            },
            None => Some(VoucherDatasetKind::VoucherEntryDetail.as_str().to_string()),
        },
        TaskKind::SupervisionCaseSeed => {
            return HttpResponse::BadRequest().json(error_json(
                "supervision case seed does not support connectors",
            ))
        }
    };

    match context.platform.create_connector_profile(
        &identity,
        ConnectorProfileInput {
            name: request.name.clone(),
            connector_type,
            task_kind,
            dataset_kind,
            base_url: request.base_url.clone(),
            auth_mode: request.auth_mode.clone(),
            sample_payload_json: request.sample_payload_json.clone(),
            enabled: request.enabled.unwrap_or(true),
        },
    ) {
        Ok(profile) => HttpResponse::Ok().json(profile),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn connectors_preview_profile(
    context: web::Data<AppContext>,
    session: Session,
    path: web::Path<ConnectorPreviewPath>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "connector import") {
        return response;
    }
    let profile_id = path.into_inner().profile_id;
    let profiles = match context.platform.list_connector_profiles(&identity) {
        Ok(items) => items,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let Some(profile) = profiles.into_iter().find(|item| item.id == profile_id) else {
        return HttpResponse::NotFound().json(error_json("connector profile not found"));
    };
    if let Err(error) = ensure_connector_secret_configured(&profile.auth_mode, &profile.id) {
        return HttpResponse::BadRequest().json(error_json(error.to_string()));
    }

    match context
        .platform
        .preview_connector_profile(&identity, &profile.id)
    {
        Ok((sync_job, preview_job)) => HttpResponse::Ok().json(ConnectorPreviewResponse {
            sync_job,
            preview_job,
        }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn connectors_commit_profile(
    context: web::Data<AppContext>,
    session: Session,
    path: web::Path<ConnectorPreviewPath>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }
    if let Err(response) = ensure_not_public_demo_for_data_entry(&context, "connector import") {
        return response;
    }
    let profile_id = path.into_inner().profile_id;
    let profiles = match context.platform.list_connector_profiles(&identity) {
        Ok(items) => items,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error.to_string())),
    };
    let Some(profile) = profiles.into_iter().find(|item| item.id == profile_id) else {
        return HttpResponse::NotFound().json(error_json("connector profile not found"));
    };
    if let Err(error) = ensure_connector_secret_configured(&profile.auth_mode, &profile.id) {
        return HttpResponse::BadRequest().json(error_json(error.to_string()));
    }

    match context
        .platform
        .commit_connector_profile(&identity, &profile.id)
    {
        Ok((sync_job, task)) => HttpResponse::Ok().json(ConnectorCommitResponse { sync_job, task }),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn connectors_writeback(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<ConnectorWritebackRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_audit_role(&identity) {
        return response;
    }

    let task_kind = match request.task_kind.parse::<TaskKind>() {
        Ok(value) => value,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };

    match context.platform.record_writeback_event(
        &identity,
        WritebackInput {
            task_id: request.task_id.clone(),
            task_kind,
            target_type: request.target_type.clone(),
            target_id: request.target_id.clone(),
            status: request.status.clone(),
            conclusion: request.conclusion.clone(),
            reminder_flag: request.reminder_flag,
            idempotency_key: request.idempotency_key.clone(),
        },
    ) {
        Ok(event) => HttpResponse::Ok().json(event),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn admin_overview(context: web::Data<AppContext>, session: Session) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_admin_role(&identity) {
        return response;
    }
    let mut ai_profile = context.platform.ai_profile();
    ai_profile.secret_configured = context.runtime.ai_secret_configured();
    HttpResponse::Ok().json(AdminOverviewResponse {
        users: context.platform.list_users_for_tenant(&identity.tenant_id),
        logs: context.platform.list_audit_logs(&identity),
        lead_requests: context.platform.list_lead_requests(20),
        deployment_policy: context.runtime.summary(),
        ai_profile,
        data_sources: context.platform.list_data_sources(),
        report_templates: context.platform.list_report_templates(),
        connector_profiles: context
            .platform
            .list_connector_profiles(&identity)
            .unwrap_or_default(),
        connector_sync_jobs: context
            .platform
            .list_connector_sync_jobs(&identity)
            .unwrap_or_default(),
        writeback_events: context
            .platform
            .list_writeback_events(&identity)
            .unwrap_or_default(),
    })
}

async fn admin_create_user(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<CreateUserRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_admin_role(&identity) {
        return response;
    }
    let role = match request.role.parse::<UserRole>() {
        Ok(role) => role,
        Err(error) => return HttpResponse::BadRequest().json(error_json(error)),
    };
    match context.platform.create_user(
        &identity,
        NewUserInput {
            organization_id: request.organization_id.clone(),
            username: request.username.clone(),
            password: request.password.clone(),
            display_name: request.display_name.clone(),
            role,
        },
    ) {
        Ok(user) => HttpResponse::Ok().json(user),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn admin_reset_password(
    context: web::Data<AppContext>,
    session: Session,
    user_id: web::Path<String>,
    request: web::Json<ResetPasswordRequest>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_admin_role(&identity) {
        return response;
    }
    match context
        .platform
        .reset_password(&identity, &user_id, &request.new_password)
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn admin_update_ai_profile(
    context: web::Data<AppContext>,
    session: Session,
    request: web::Json<AiServiceProfile>,
) -> impl Responder {
    let identity = match require_session(&session) {
        Ok(identity) => identity,
        Err(response) => return response,
    };
    if let Err(response) = ensure_admin_role(&identity) {
        return response;
    }
    match context.platform.update_ai_profile(&identity, request.into_inner()) {
        Ok(mut profile) => {
            profile.secret_configured = context.runtime.ai_secret_configured();
            HttpResponse::Ok().json(profile)
        }
        Err(error) => HttpResponse::BadRequest().json(error_json(error.to_string())),
    }
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn health_details(context: web::Data<AppContext>) -> impl Responder {
    let db_status = if context.platform.has_users() {
        "ok"
    } else {
        "empty"
    };
    HttpResponse::Ok().json(HealthDetailsResponse {
        status: "ok".to_string(),
        db: db_status.to_string(),
        ocr: if context.runtime.ocr_enabled {
            "enabled".to_string()
        } else {
            "disabled".to_string()
        },
        asr: if context.runtime.speech_enabled {
            "enabled".to_string()
        } else {
            "disabled".to_string()
        },
        ai: if context.runtime.ai_enabled {
            if context.runtime.ai_secret_configured() {
                "enabled".to_string()
            } else {
                "secret_not_configured".to_string()
            }
        } else {
            "disabled_by_policy".to_string()
        },
        connectors: "metadata_only".to_string(),
    })
}

pub async fn start_server(host: &str, port: u16) -> Result<()> {
    let runtime = DeploymentPolicy::load(Path::new("."))?;
    let secret_key = runtime.session_key()?;
    let platform = Arc::new(PlatformStore::load_or_create(runtime.platform_base_dir())?);
    let _ = platform.record_event(
        None,
        "runtime.startup",
        "deployment_policy",
        runtime.environment_mode.as_str(),
        "success",
        runtime.fingerprint_summary(),
    );
    let context = web::Data::new(AppContext {
        platform,
        runtime,
        login_locks: Arc::new(Mutex::new(HashMap::new())),
    });
    let bind_addr = format!("{}:{}", host, port);
    let scheduler_platform = context.platform.clone();
    let scheduler_worker_id = format!("scheduler-{}", uuid::Uuid::new_v4());

    println!("AuditLens product server starting on http://{}", bind_addr);

    tokio::spawn(async move {
        loop {
            match scheduler_platform.list_tenant_ids() {
                Ok(tenant_ids) => {
                    for tenant_id in tenant_ids {
                        if let Err(error) = scheduler_platform.acquire_scheduler_lease(
                            &tenant_id,
                            &scheduler_worker_id,
                            330,
                        ) {
                            eprintln!(
                                "scheduler lease acquisition failed for tenant {}: {}",
                                tenant_id, error
                            );
                        }
                    }
                    if let Err(error) =
                        scheduler_platform.run_due_automation_schedules(&scheduler_worker_id)
                    {
                        eprintln!("scheduler execution failed: {}", error);
                    }
                }
                Err(error) => eprintln!("scheduler tenant enumeration failed: {}", error),
            }
            tokio::time::sleep(StdDuration::from_secs(300)).await;
        }
    });

    HttpServer::new(move || {
        App::new()
            .app_data(context.clone())
            .wrap(from_fn(no_store_static_assets))
            .wrap(from_fn(enforce_transport_security))
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), secret_key.clone())
                    .cookie_secure(context.runtime.secure_cookies)
                    .cookie_same_site(SameSite::Lax)
                    .cookie_http_only(true)
                    .session_lifecycle(PersistentSession::default().session_ttl(Duration::hours(8)))
                    .build(),
            )
            .route("/api/health", web::get().to(health_check))
            .route("/api/health/details", web::get().to(health_details))
            .route("/api/bootstrap", web::get().to(bootstrap))
            .route("/api/import/bootstrap", web::get().to(import_bootstrap))
            .route(
                "/api/case-seeds/template",
                web::get().to(case_seed_template),
            )
            .route(
                "/api/case-seeds/config",
                web::get().to(get_case_seed_config),
            )
            .route(
                "/api/case-seeds/config",
                web::post().to(save_case_seed_config),
            )
            .route(
                "/api/case-seeds/preview",
                web::post().to(preview_case_seed_import),
            )
            .route(
                "/api/case-seeds/import",
                web::post().to(import_case_seed_batch),
            )
            .route(
                "/api/import-profiles",
                web::get().to(list_import_profiles_api),
            )
            .route(
                "/api/import-profiles",
                web::post().to(create_import_profile_api),
            )
            .route(
                "/api/import-profiles/{profile_id}/clone",
                web::post().to(clone_import_profile_api),
            )
            .route(
                "/api/import-profiles/{profile_id}/export",
                web::get().to(export_import_profile_api),
            )
            .route(
                "/api/import-profiles/import",
                web::post().to(import_import_profile_api),
            )
            .route(
                "/api/assignment-dictionary",
                web::get().to(list_assignment_dictionary_api),
            )
            .route(
                "/api/assignment-dictionary",
                web::post().to(create_assignment_dictionary_rule_api),
            )
            .route(
                "/api/assignment-dictionary/{rule_id}/toggle",
                web::post().to(toggle_assignment_dictionary_rule_api),
            )
            .route(
                "/api/automation/schedules",
                web::get().to(list_automation_schedules_api),
            )
            .route(
                "/api/automation/schedules",
                web::post().to(create_automation_schedule_api),
            )
            .route(
                "/api/automation/schedules/{schedule_id}/run",
                web::post().to(run_automation_schedule_api),
            )
            .route(
                "/api/automation/executions",
                web::get().to(list_automation_executions_api),
            )
            .route(
                "/api/automation/executions/{execution_id}",
                web::get().to(get_automation_execution_api),
            )
            .route(
                "/api/import/templates/{task_kind}",
                web::get().to(import_template),
            )
            .route(
                "/api/import/internal-sample/templates",
                web::get().to(internal_sample_templates),
            )
            .route(
                "/api/import/internal-sample/templates/{template_kind}",
                web::get().to(internal_sample_template_csv),
            )
            .route("/api/import/preview", web::post().to(preview_import))
            .route("/api/import/commit", web::post().to(commit_import))
            .route(
                "/api/import/procurement/batch",
                web::post().to(import_procurement_batch),
            )
            .route(
                "/api/import/budget/batch",
                web::post().to(import_budget_batch),
            )
            .route(
                "/api/import/treasury/batch",
                web::post().to(import_treasury_batch),
            )
            .route(
                "/api/import/voucher/batch",
                web::post().to(import_voucher_batch),
            )
            .route(
                "/api/import/procurement/fetch",
                web::post().to(import_procurement_fetch),
            )
            .route(
                "/api/connectors/bootstrap",
                web::get().to(connectors_bootstrap),
            )
            .route(
                "/api/connectors/profiles",
                web::post().to(connectors_create_profile),
            )
            .route(
                "/api/connectors/{profile_id}/preview",
                web::post().to(connectors_preview_profile),
            )
            .route(
                "/api/connectors/{profile_id}/commit",
                web::post().to(connectors_commit_profile),
            )
            .route(
                "/api/connectors/writeback",
                web::post().to(connectors_writeback),
            )
            .route(
                "/api/public/requests",
                web::post().to(create_public_lead_request),
            )
            .route("/api/auth/register", web::post().to(register))
            .route("/api/auth/login", web::post().to(login))
            .route("/api/auth/logout", web::post().to(logout))
            .route("/api/auth/me", web::get().to(me))
            .route("/api/tasks", web::get().to(list_tasks))
            .route("/api/tasks/demo", web::post().to(create_demo_task))
            .route("/api/tasks/file", web::post().to(create_file_task))
            .route("/api/tasks/database", web::post().to(create_database_task))
            .route("/api/tasks/{task_id}", web::get().to(get_task))
            .route(
                "/api/tasks/{task_id}/exceptions",
                web::get().to(list_task_exceptions),
            )
            .route(
                "/api/tasks/{task_id}/exceptions/status",
                web::post().to(bulk_update_task_exceptions),
            )
            .route(
                "/api/tasks/{task_id}/exceptions/{exception_id}/receipts",
                web::post().to(upload_exception_receipt),
            )
            .route(
                "/api/tasks/{task_id}/exceptions/{exception_id}/receipts/{receipt_id}",
                web::get().to(download_exception_receipt),
            )
            .route("/api/cases", web::get().to(list_cases))
            .route("/api/cases/assign", web::post().to(assign_cases))
            .route("/api/cases/transition", web::post().to(transition_cases))
            .route("/api/cases/metrics", web::get().to(get_case_metrics))
            .route(
                "/api/cases/metrics/overview",
                web::get().to(get_case_metrics_overview),
            )
            .route(
                "/api/cases/metrics/by-department",
                web::get().to(get_case_metrics_by_department),
            )
            .route(
                "/api/cases/metrics/by-rectification-unit",
                web::get().to(get_case_metrics_by_rectification_unit),
            )
            .route(
                "/api/cases/metrics/by-handler",
                web::get().to(get_case_metrics_by_handler),
            )
            .route(
                "/api/cases/metrics/trends",
                web::get().to(get_case_metrics_trends),
            )
            .route("/api/cases/export", web::get().to(export_cases))
            .route(
                "/api/cases/{case_id}/rectification",
                web::post().to(submit_case_rectification),
            )
            .route(
                "/api/cases/{case_id}/review/decision",
                web::post().to(review_case_decision),
            )
            .route(
                "/api/cases/{case_id}/review",
                web::post().to(review_case_rectification),
            )
            .route(
                "/api/cases/{case_id}/reminders",
                web::post().to(remind_case),
            )
            .route(
                "/api/cases/{case_id}/timeline",
                web::get().to(get_case_timeline),
            )
            .route("/api/cases/{case_id}", web::get().to(get_case))
            .route(
                "/api/rectification/cases",
                web::get().to(list_rectification_cases),
            )
            .route(
                "/api/rectification/cases/{case_id}",
                web::get().to(get_rectification_case),
            )
            .route(
                "/api/rectification/cases/{case_id}/submit",
                web::post().to(submit_case_rectification),
            )
            .route(
                "/api/rectification/cases/{case_id}/attachments",
                web::post().to(upload_rectification_attachment),
            )
            .route(
                "/api/rectification/cases/{case_id}/extension",
                web::post().to(request_case_extension),
            )
            .route(
                "/api/tasks/{task_id}/artifacts",
                web::get().to(list_task_artifacts),
            )
            .route(
                "/api/tasks/{task_id}/artifacts/image",
                web::post().to(create_image_artifact),
            )
            .route(
                "/api/tasks/{task_id}/artifacts/audio",
                web::post().to(create_audio_artifact),
            )
            .route(
                "/api/tasks/{task_id}/artifacts/{artifact_id}/retry",
                web::post().to(retry_task_artifact),
            )
            .route(
                "/api/tasks/{task_id}/findings/{finding_id}",
                web::post().to(update_finding),
            )
            .route(
                "/api/tasks/{task_id}/ai",
                web::post().to(analyze_task_with_ai),
            )
            .route(
                "/api/tasks/{task_id}/export/pdf",
                web::post().to(export_task_pdf),
            )
            .route(
                "/api/tasks/{task_id}/report.pdf",
                web::get().to(export_task_pdf),
            )
            .route(
                "/api/tasks/{task_id}/seal",
                web::post().to(seal_task_export),
            )
            .route("/api/admin/overview", web::get().to(admin_overview))
            .route("/api/admin/users", web::post().to(admin_create_user))
            .route(
                "/api/admin/users/{user_id}/reset-password",
                web::post().to(admin_reset_password),
            )
            .route(
                "/api/admin/ai-profile",
                web::post().to(admin_update_ai_profile),
            )
            .service(
                afs::Files::new("/", "./static")
                    .index_file("index.html")
                    .use_etag(false)
                    .use_last_modified(false),
            )
    })
    .bind(&bind_addr)?
    .run()
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{http::StatusCode, test};
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, OnceLock};
    use tempfile::tempdir;

    fn runtime_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct CurrentDirGuard {
        previous: PathBuf,
    }

    impl CurrentDirGuard {
        fn push(path: &Path) -> Self {
            let previous = env::current_dir().unwrap();
            env::set_current_dir(path).unwrap();
            Self { previous }
        }
    }

    impl Drop for CurrentDirGuard {
        fn drop(&mut self) {
            let _ = env::set_current_dir(&self.previous);
        }
    }

    struct EnvVarGuard {
        key: &'static str,
        previous: Option<String>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let previous = env::var(key).ok();
            env::set_var(key, value);
            Self { key, previous }
        }

        fn remove(key: &'static str) -> Self {
            let previous = env::var(key).ok();
            env::remove_var(key);
            Self { key, previous }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            if let Some(value) = &self.previous {
                env::set_var(self.key, value);
            } else {
                env::remove_var(self.key);
            }
        }
    }

    #[actix_web::test]
    async fn marks_static_app_assets_as_no_store() {
        let app = test::init_service(
            App::new()
                .wrap(from_fn(no_store_static_assets))
                .service(
                    afs::Files::new("/", "./static")
                        .index_file("index.html")
                        .use_etag(false)
                        .use_last_modified(false),
                ),
        )
        .await;

        for uri in ["/", "/app/main.js"] {
            let response = test::call_service(
                &app,
                test::TestRequest::get().uri(uri).to_request(),
            )
            .await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                response.headers().get(header::CACHE_CONTROL),
                Some(&HeaderValue::from_static(
                    "no-store, no-cache, must-revalidate, max-age=0"
                )),
                "{} should not be cached by browsers",
                uri
            );
        }
    }

    #[::core::prelude::v1::test]
    fn deployment_policy_requires_environment_mode_and_session_secret() {
        let _guard = runtime_test_lock().lock().unwrap();
        let temp = tempdir().unwrap();
        let config_dir = temp.path().join("config");
        fs::create_dir_all(&config_dir).unwrap();
        let config_path = config_dir.join("runtime.local.json");
        fs::write(
            &config_path,
            r#"{
  "environmentMode": "government_poc",
  "host": "127.0.0.1",
  "port": 18080,
  "secureCookies": true,
  "allowPublicRegistration": false,
  "aiEnabled": false,
  "publicDemoMode": false
}"#,
        )
        .unwrap();
        let _cwd = CurrentDirGuard::push(temp.path());
        let _secret = EnvVarGuard::remove("AUDITLENS_SESSION_SECRET");
        let result = DeploymentPolicy::load(Path::new("."));

        assert!(result.is_err());
        let message = result.err().unwrap().to_string();
        assert!(message.contains("AUDITLENS_SESSION_SECRET"));
    }

    #[::core::prelude::v1::test]
    fn deployment_policy_rejects_government_poc_demo_flags() {
        let _guard = runtime_test_lock().lock().unwrap();
        let temp = tempdir().unwrap();
        let config_dir = temp.path().join("config");
        fs::create_dir_all(&config_dir).unwrap();
        let config_path = config_dir.join("runtime.local.json");
        fs::write(
            &config_path,
            r#"{
  "environmentMode": "government_poc",
  "host": "127.0.0.1",
  "port": 18080,
  "secureCookies": false,
  "allowPublicRegistration": true,
  "aiEnabled": false,
  "publicDemoMode": true
}"#,
        )
        .unwrap();
        let _cwd = CurrentDirGuard::push(temp.path());
        let _secret = EnvVarGuard::set("AUDITLENS_SESSION_SECRET", &STANDARD.encode([0u8; 64]));
        let result = DeploymentPolicy::load(Path::new("."));

        assert!(result.is_err());
        let message = result.err().unwrap().to_string();
        assert!(message.contains("government_poc requires secureCookies=true"));
    }

    #[actix_web::test]
    async fn returns_public_statistical_indicator_template() {
        let app = test::init_service(App::new().route(
            "/api/import/templates/{task_kind}",
            web::get().to(import_template),
        ))
        .await;

        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/import/templates/budget_summary?dataset_kind=public_statistical_indicator")
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = String::from_utf8(test::read_body(response).await.to_vec()).unwrap();
        assert!(body.contains("统计指标"));
        assert!(body.contains("来源标题"));
        assert!(body.contains("解析器版本"));
    }

    #[actix_web::test]
    async fn returns_phase3_templates_for_treasury_and_voucher() {
        let app = test::init_service(App::new().route(
            "/api/import/templates/{task_kind}",
            web::get().to(import_template),
        ))
        .await;

        let treasury_response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/import/templates/treasury_payment")
                .to_request(),
        )
        .await;
        assert_eq!(treasury_response.status(), StatusCode::OK);
        let treasury_body =
            String::from_utf8(test::read_body(treasury_response).await.to_vec()).unwrap();
        assert!(
            treasury_body.contains("支付单号"),
            "treasury template should expose payment columns, got: {}",
            treasury_body
        );

        let voucher_response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/import/templates/voucher_ledger")
                .to_request(),
        )
        .await;
        assert_eq!(voucher_response.status(), StatusCode::OK);
        let voucher_body =
            String::from_utf8(test::read_body(voucher_response).await.to_vec()).unwrap();
        assert!(
            voucher_body.contains("凭证号"),
            "voucher template should expose voucher columns, got: {}",
            voucher_body
        );
    }

    #[actix_web::test]
    async fn returns_internal_sample_template_definitions_and_csv() {
        let app = test::init_service(
            App::new()
                .route(
                    "/api/import/internal-sample/templates",
                    web::get().to(internal_sample_templates),
                )
                .route(
                    "/api/import/internal-sample/templates/{template_kind}",
                    web::get().to(internal_sample_template_csv),
                ),
        )
        .await;

        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/import/internal-sample/templates")
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = String::from_utf8(test::read_body(response).await.to_vec()).unwrap();
        assert!(body.contains("department_budget_indicator"));
        assert!(body.contains("procurement_contract"));
        assert!(body.contains("field_mapping_version"));

        let csv_response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/import/internal-sample/templates/procurement_contract")
                .to_request(),
        )
        .await;
        assert_eq!(csv_response.status(), StatusCode::OK);
        let csv_body = String::from_utf8(test::read_body(csv_response).await.to_vec()).unwrap();
        assert!(csv_body.contains("合同编号"));
        assert!(csv_body.contains("采购阶段"));
        assert!(csv_body.contains("来源标题"));
    }

    #[actix_web::test]
    async fn returns_case_seed_penalty_template() {
        let app = test::init_service(App::new().route(
            "/api/case-seeds/template",
            web::get().to(case_seed_template),
        ))
        .await;

        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/case-seeds/template?template_kind=penalty_ledger")
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = String::from_utf8(test::read_body(response).await.to_vec()).unwrap();
        assert!(body.contains("处罚对象"));
        assert!(body.contains("处罚决定书号"));
    }

    #[::core::prelude::v1::test]
    fn normalizes_exception_targets_from_path_task_id() {
        let targets = vec![ExceptionBulkActionTarget {
            task_id: None,
            exception_id: "ex-1".to_string(),
            source: "rule".to_string(),
        }];
        let normalized = normalize_exception_targets_for_task("task-1", &targets).unwrap();
        assert_eq!(normalized[0].task_id.as_deref(), Some("task-1"));
    }

    #[::core::prelude::v1::test]
    fn rejects_exception_target_task_id_mismatch_with_hint() {
        let targets = vec![ExceptionBulkActionTarget {
            task_id: Some("task-2".to_string()),
            exception_id: "ex-1".to_string(),
            source: "rule".to_string(),
        }];
        let error = normalize_exception_targets_for_task("task-1", &targets).unwrap_err();
        assert_eq!(error["error"], "task_id mismatch");
        assert!(error["hint"]
            .as_str()
            .unwrap_or_default()
            .contains("targets[].task_id"));
        assert!(error["expected_schema_url"]
            .as_str()
            .unwrap_or_default()
            .contains("exceptions-status"));
    }
}
