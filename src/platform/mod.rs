mod budget;
mod case_seed;
mod defaults;
mod linkage;
mod procurement;
mod store;
mod treasury;
mod v2;
mod v2_store;
mod voucher;

use crate::auth::UserRole;
use crate::models::{AuditFinding, AuditReport};
use serde::{Deserialize, Serialize};

pub use budget::*;
pub use case_seed::*;
pub use defaults::{build_demo_transactions, summarize_by_date};
pub use linkage::*;
pub use procurement::*;
pub use store::PlatformStore;
pub use treasury::*;
pub use v2::*;
pub use voucher::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    pub deployment_mode: String,
    pub data_key_b64: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAccount {
    pub id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub username: String,
    pub password_hash: String,
    pub display_name: String,
    pub role: UserRole,
    pub active: bool,
    pub must_change_password: bool,
    pub created_at: String,
    pub last_login_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub name: String,
    pub scenario_id: String,
    pub description: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaySummary {
    pub date: String,
    pub total_debit: String,
    pub total_credit: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FindingCaseStatus {
    Open,
    InReview,
    Resolved,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingCase {
    pub id: String,
    pub finding: AuditFinding,
    pub assignee: Option<String>,
    pub note: String,
    pub status: FindingCaseStatus,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ArtifactType {
    Image,
    Audio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ArtifactStatus {
    Processing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ImageArtifactSummary {
    pub document_type: Option<String>,
    pub document_date: Option<String>,
    pub amount: Option<String>,
    pub document_number: Option<String>,
    pub counterparty: Option<String>,
    pub business_summary: Option<String>,
    pub keywords: Vec<String>,
    pub reviewer_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AudioArtifactSummary {
    pub summary: Option<String>,
    pub keywords: Vec<String>,
    pub time_range: Option<String>,
    pub reviewer_note: Option<String>,
    pub mentions_budget: bool,
    pub mentions_payment: bool,
    pub mentions_approval: bool,
    pub mentions_funds: bool,
    pub needs_manual_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ArtifactStructuredSummary {
    Image { data: ImageArtifactSummary },
    Audio { data: AudioArtifactSummary },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceArtifact {
    pub id: String,
    pub task_id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub artifact_type: ArtifactType,
    pub source_filename: String,
    pub mime_type: String,
    pub storage_path: String,
    pub transcript_text: String,
    pub structured_summary: ArtifactStructuredSummary,
    pub status: ArtifactStatus,
    pub error_message: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditTask {
    pub id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub project_id: String,
    pub scenario_id: String,
    pub scenario_name: String,
    pub report_template_id: String,
    pub dataset_name: String,
    pub source_kind: String,
    pub source_label: String,
    pub status: TaskStatus,
    pub risk_level: String,
    pub total_transactions: usize,
    pub report: AuditReport,
    pub transactions_summary: Vec<DaySummary>,
    pub findings: Vec<FindingCase>,
    pub created_by: String,
    pub created_at: String,
    pub started_at: String,
    pub completed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub focus: String,
    pub report_template_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportTemplate {
    pub id: String,
    pub name: String,
    pub institution_name: String,
    pub cover_title: String,
    pub watermark: String,
    pub classification: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSourceTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub db_type: String,
    pub query: String,
    pub allowed_tables: Vec<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiServiceProfile {
    pub provider: String,
    pub api_url: String,
    pub model: String,
    #[serde(default = "default_ai_adapter_kind")]
    pub adapter_kind: crate::ai_analysis::AiAdapterKind,
    pub enabled: bool,
    pub guidance: String,
    #[serde(default)]
    pub secret_configured: bool,
}

fn default_ai_adapter_kind() -> crate::ai_analysis::AiAdapterKind {
    crate::ai_analysis::AiAdapterKind::OpenAiCompatible
}

impl Default for AiServiceProfile {
    fn default() -> Self {
        Self {
            provider: "local".to_string(),
            api_url: "http://127.0.0.1:8000/v1/chat/completions".to_string(),
            model: "qwen-government".to_string(),
            adapter_kind: crate::ai_analysis::AiAdapterKind::OpenAiCompatible,
            enabled: true,
            guidance: "AI output is advisory only. Rule findings remain the system of record."
                .to_string(),
            secret_configured: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub tenant_id: Option<String>,
    pub organization_id: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub outcome: String,
    pub detail: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiRunStatus {
    Succeeded,
    Fallback,
    Failed,
}

impl AiRunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Succeeded => "succeeded",
            Self::Fallback => "fallback",
            Self::Failed => "failed",
        }
    }
}

impl std::str::FromStr for AiRunStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "succeeded" => Ok(Self::Succeeded),
            "fallback" => Ok(Self::Fallback),
            "failed" => Ok(Self::Failed),
            other => Err(format!("unsupported AI run status {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiRunRecord {
    pub id: String,
    pub tenant_id: String,
    pub task_id: String,
    pub status: AiRunStatus,
    pub provider: String,
    pub adapter_kind: crate::ai_analysis::AiAdapterKind,
    pub model: String,
    pub guidance: String,
    pub result: crate::ai_analysis::schema::AiDecisionResponse,
    pub error_message: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub applied_at: Option<String>,
    pub applied_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiFindingApplyItem {
    pub finding_id: String,
    pub disposition_priority: Option<String>,
    pub disposition_outcome: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiCaseApplyItem {
    pub case_id: String,
    pub priority: Option<String>,
    pub current_stage: Option<String>,
    pub disposition_outcome: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiApplyRequest {
    pub run_id: String,
    #[serde(default)]
    pub finding_items: Vec<AiFindingApplyItem>,
    #[serde(default)]
    pub case_items: Vec<AiCaseApplyItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiApplyResult {
    pub run_id: String,
    pub applied_findings: usize,
    pub applied_cases: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuleFeedbackStatus {
    TruePositive,
    FalsePositive,
    NeedsReview,
}

impl RuleFeedbackStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TruePositive => "true_positive",
            Self::FalsePositive => "false_positive",
            Self::NeedsReview => "needs_review",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RuleFeedbackInput {
    pub task_id: String,
    pub finding_id: String,
    pub rule_code: String,
    pub scenario_id: String,
    pub rule_version: String,
    pub status: RuleFeedbackStatus,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleFeedbackStats {
    pub rule_code: String,
    pub scenario_id: String,
    pub rule_version: String,
    pub reviewed_hits: usize,
    pub false_positive_hits: usize,
    pub true_positive_hits: usize,
    pub needs_review_hits: usize,
    pub false_positive_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReviewPackage {
    pub jsonl: String,
    pub csv: String,
    pub manifest_json: String,
    pub package_checksum_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformState {
    pub tenants: Vec<Tenant>,
    pub organizations: Vec<Organization>,
    pub users: Vec<UserAccount>,
    pub projects: Vec<ProjectRecord>,
    pub tasks: Vec<AuditTask>,
    #[serde(default)]
    pub evidence_artifacts: Vec<EvidenceArtifact>,
    pub scenarios: Vec<ScenarioPreset>,
    pub report_templates: Vec<ReportTemplate>,
    pub data_sources: Vec<DataSourceTemplate>,
    pub audit_logs: Vec<AuditLogEntry>,
    pub ai_profile: AiServiceProfile,
}

impl Default for PlatformState {
    fn default() -> Self {
        Self {
            tenants: Vec::new(),
            organizations: Vec::new(),
            users: Vec::new(),
            projects: Vec::new(),
            tasks: Vec::new(),
            evidence_artifacts: Vec::new(),
            scenarios: defaults::default_scenarios(),
            report_templates: defaults::default_report_templates(),
            data_sources: defaults::default_data_sources(),
            audit_logs: Vec::new(),
            ai_profile: AiServiceProfile::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UserProfile {
    pub id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub username: String,
    pub display_name: String,
    pub role: UserRole,
    pub organization_name: String,
    pub tenant_name: String,
    pub must_change_password: bool,
}

#[derive(Debug, Clone)]
pub struct SessionIdentity {
    pub user_id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub username: String,
    pub display_name: String,
    pub role: UserRole,
}

#[derive(Debug, Clone)]
pub struct RegistrationInput {
    pub tenant_name: String,
    pub organization_name: String,
    pub username: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub struct NewUserInput {
    pub organization_id: String,
    pub username: String,
    pub password: String,
    pub display_name: String,
    pub role: UserRole,
}

#[derive(Debug, Clone)]
pub struct CompletedTaskInput {
    pub scenario_id: String,
    pub project_name: String,
    pub dataset_name: String,
    pub source_kind: String,
    pub source_label: String,
    pub report_template_id: String,
    pub report: AuditReport,
    pub transactions_summary: Vec<DaySummary>,
}

#[derive(Debug, Clone)]
pub struct NewEvidenceArtifactInput {
    pub id: String,
    pub artifact_type: ArtifactType,
    pub source_filename: String,
    pub mime_type: String,
    pub storage_path: String,
    pub transcript_text: String,
    pub structured_summary: ArtifactStructuredSummary,
    pub status: ArtifactStatus,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeadRequest {
    pub id: String,
    pub contact_name: String,
    pub contact_channel: String,
    pub unit_type: String,
    pub department: String,
    pub audit_scenario: String,
    pub deployment_preference: String,
    pub involves_real_data: bool,
    pub ai_expectation: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct LeadRequestInput {
    pub contact_name: String,
    pub contact_channel: String,
    pub unit_type: String,
    pub department: String,
    pub audit_scenario: String,
    pub deployment_preference: String,
    pub involves_real_data: bool,
    pub ai_expectation: String,
    pub note: String,
}
