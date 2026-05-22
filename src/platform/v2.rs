use super::case_seed::{CaseSeedAssignmentRule, CaseSeedMappingOverride};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BudgetDatasetKind {
    DepartmentExecutionDetail,
    PublicFiscalSummary,
    PublicStatisticalIndicator,
    InvestmentReviewSummary,
    TownshipFiscalExecutionSummary,
}

impl BudgetDatasetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            BudgetDatasetKind::DepartmentExecutionDetail => "department_execution_detail",
            BudgetDatasetKind::PublicFiscalSummary => "public_fiscal_summary",
            BudgetDatasetKind::PublicStatisticalIndicator => "public_statistical_indicator",
            BudgetDatasetKind::InvestmentReviewSummary => "investment_review_summary",
            BudgetDatasetKind::TownshipFiscalExecutionSummary => {
                "township_fiscal_execution_summary"
            }
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            BudgetDatasetKind::DepartmentExecutionDetail => "部门预算执行明细",
            BudgetDatasetKind::PublicFiscalSummary => "公开财政摘要",
            BudgetDatasetKind::PublicStatisticalIndicator => "公开统计指标",
            BudgetDatasetKind::InvestmentReviewSummary => "投资评审摘要",
            BudgetDatasetKind::TownshipFiscalExecutionSummary => "乡镇财政执行摘要",
        }
    }
}

impl FromStr for BudgetDatasetKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "department_execution_detail" => Ok(BudgetDatasetKind::DepartmentExecutionDetail),
            "public_fiscal_summary" => Ok(BudgetDatasetKind::PublicFiscalSummary),
            "public_statistical_indicator" => Ok(BudgetDatasetKind::PublicStatisticalIndicator),
            "investment_review_summary" => Ok(BudgetDatasetKind::InvestmentReviewSummary),
            "township_fiscal_execution_summary" => {
                Ok(BudgetDatasetKind::TownshipFiscalExecutionSummary)
            }
            other => Err(format!("unsupported budget dataset kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcurementStage {
    PreAnnouncement,
    Announcement,
    Award,
    Contract,
    Acceptance,
    Payment,
    Unknown,
}

impl Default for ProcurementStage {
    fn default() -> Self {
        ProcurementStage::Unknown
    }
}

impl ProcurementStage {
    pub fn as_str(self) -> &'static str {
        match self {
            ProcurementStage::PreAnnouncement => "pre_announcement",
            ProcurementStage::Announcement => "announcement",
            ProcurementStage::Award => "award",
            ProcurementStage::Contract => "contract",
            ProcurementStage::Acceptance => "acceptance",
            ProcurementStage::Payment => "payment",
            ProcurementStage::Unknown => "unknown",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ProcurementStage::PreAnnouncement => "采购意向 / 预公告",
            ProcurementStage::Announcement => "采购公告 / 招标公告",
            ProcurementStage::Award => "中标结果 / 成交公告",
            ProcurementStage::Contract => "合同公告",
            ProcurementStage::Acceptance => "验收公告",
            ProcurementStage::Payment => "支付信息",
            ProcurementStage::Unknown => "未知阶段",
        }
    }
}

impl FromStr for ProcurementStage {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let normalized = value.trim().to_lowercase();
        match normalized.as_str() {
            "pre_announcement"
            | "preannouncement"
            | "intention"
            | "procurement_intention"
            | "procurement intention"
            | "purchase_intention" => Ok(ProcurementStage::PreAnnouncement),
            "announcement" | "notice" | "采购公告" | "招标公告" | "公告" => {
                Ok(ProcurementStage::Announcement)
            }
            "award" | "result" | "中标公告" | "成交公告" | "结果公告" => {
                Ok(ProcurementStage::Award)
            }
            "contract" | "合同" | "合同公告" => Ok(ProcurementStage::Contract),
            "acceptance" | "验收" | "验收公告" | "履约验收" => {
                Ok(ProcurementStage::Acceptance)
            }
            "payment" | "支付" | "付款" => Ok(ProcurementStage::Payment),
            "" | "unknown" | "未知" => Ok(ProcurementStage::Unknown),
            other => Err(format!("unsupported procurement stage {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TreasuryDatasetKind {
    TreasuryPaymentDetail,
    ElectronicPaymentVoucher,
}

impl TreasuryDatasetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TreasuryDatasetKind::TreasuryPaymentDetail => "treasury_payment_detail",
            TreasuryDatasetKind::ElectronicPaymentVoucher => "electronic_payment_voucher",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            TreasuryDatasetKind::TreasuryPaymentDetail => "国库支付明细",
            TreasuryDatasetKind::ElectronicPaymentVoucher => "电子支付凭证",
        }
    }
}

impl FromStr for TreasuryDatasetKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "treasury_payment_detail" => Ok(TreasuryDatasetKind::TreasuryPaymentDetail),
            "electronic_payment_voucher" => Ok(TreasuryDatasetKind::ElectronicPaymentVoucher),
            other => Err(format!("unsupported treasury dataset kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VoucherDatasetKind {
    VoucherEntryDetail,
    GeneralLedgerExport,
}

impl VoucherDatasetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            VoucherDatasetKind::VoucherEntryDetail => "voucher_entry_detail",
            VoucherDatasetKind::GeneralLedgerExport => "general_ledger_export",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            VoucherDatasetKind::VoucherEntryDetail => "会计凭证分录",
            VoucherDatasetKind::GeneralLedgerExport => "总账导出",
        }
    }
}

impl FromStr for VoucherDatasetKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "voucher_entry_detail" => Ok(VoucherDatasetKind::VoucherEntryDetail),
            "general_ledger_export" => Ok(VoucherDatasetKind::GeneralLedgerExport),
            other => Err(format!("unsupported voucher dataset kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InternalSampleTemplateKind {
    DepartmentBudgetIndicator,
    ProcurementContract,
    TreasuryPaymentDetail,
    VoucherEntryDetail,
    RectificationLedger,
}

impl InternalSampleTemplateKind {
    pub fn as_str(self) -> &'static str {
        match self {
            InternalSampleTemplateKind::DepartmentBudgetIndicator => "department_budget_indicator",
            InternalSampleTemplateKind::ProcurementContract => "procurement_contract",
            InternalSampleTemplateKind::TreasuryPaymentDetail => "treasury_payment_detail",
            InternalSampleTemplateKind::VoucherEntryDetail => "voucher_entry_detail",
            InternalSampleTemplateKind::RectificationLedger => "rectification_ledger",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            InternalSampleTemplateKind::DepartmentBudgetIndicator => "部门预算指标",
            InternalSampleTemplateKind::ProcurementContract => "采购合同",
            InternalSampleTemplateKind::TreasuryPaymentDetail => "国库集中支付",
            InternalSampleTemplateKind::VoucherEntryDetail => "会计凭证分录",
            InternalSampleTemplateKind::RectificationLedger => "问题整改台账",
        }
    }
}

impl FromStr for InternalSampleTemplateKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "department_budget_indicator" => {
                Ok(InternalSampleTemplateKind::DepartmentBudgetIndicator)
            }
            "procurement_contract" => Ok(InternalSampleTemplateKind::ProcurementContract),
            "treasury_payment_detail" => Ok(InternalSampleTemplateKind::TreasuryPaymentDetail),
            "voucher_entry_detail" => Ok(InternalSampleTemplateKind::VoucherEntryDetail),
            "rectification_ledger" => Ok(InternalSampleTemplateKind::RectificationLedger),
            other => Err(format!(
                "unsupported internal sample template kind {}",
                other
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    VoucherLedger,
    BudgetSummary,
    ProcurementProject,
    TreasuryPayment,
    SupervisionCaseSeed,
}

impl TaskKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TaskKind::VoucherLedger => "voucher_ledger",
            TaskKind::BudgetSummary => "budget_summary",
            TaskKind::ProcurementProject => "procurement_project",
            TaskKind::TreasuryPayment => "treasury_payment",
            TaskKind::SupervisionCaseSeed => "supervision_case_seed",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            TaskKind::VoucherLedger => "会计凭证",
            TaskKind::BudgetSummary => "预算财政汇总",
            TaskKind::ProcurementProject => "政府采购项目",
            TaskKind::TreasuryPayment => "国库支付",
            TaskKind::SupervisionCaseSeed => "监督案例线索",
        }
    }
}

impl FromStr for TaskKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "voucher_ledger" => Ok(TaskKind::VoucherLedger),
            "budget_summary" => Ok(TaskKind::BudgetSummary),
            "procurement_project" => Ok(TaskKind::ProcurementProject),
            "treasury_payment" => Ok(TaskKind::TreasuryPayment),
            "supervision_case_seed" => Ok(TaskKind::SupervisionCaseSeed),
            other => Err(format!("unsupported task kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportSourceKind {
    File,
    Batch,
    Fetch,
    Connector,
}

impl ImportSourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ImportSourceKind::File => "file",
            ImportSourceKind::Batch => "batch",
            ImportSourceKind::Fetch => "fetch",
            ImportSourceKind::Connector => "connector",
        }
    }
}

impl FromStr for ImportSourceKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "file" => Ok(ImportSourceKind::File),
            "batch" => Ok(ImportSourceKind::Batch),
            "fetch" => Ok(ImportSourceKind::Fetch),
            "connector" => Ok(ImportSourceKind::Connector),
            other => Err(format!("unsupported import source {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformTaskStatus {
    Draft,
    Completed,
    Failed,
    Archived,
}

impl PlatformTaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            PlatformTaskStatus::Draft => "draft",
            PlatformTaskStatus::Completed => "completed",
            PlatformTaskStatus::Failed => "failed",
            PlatformTaskStatus::Archived => "archived",
        }
    }
}

impl FromStr for PlatformTaskStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "draft" => Ok(PlatformTaskStatus::Draft),
            "completed" => Ok(PlatformTaskStatus::Completed),
            "failed" => Ok(PlatformTaskStatus::Failed),
            "archived" => Ok(PlatformTaskStatus::Archived),
            other => Err(format!("unsupported task status {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportJobStatus {
    PreviewReady,
    Committed,
    Failed,
}

impl ImportJobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ImportJobStatus::PreviewReady => "preview_ready",
            ImportJobStatus::Committed => "committed",
            ImportJobStatus::Failed => "failed",
        }
    }
}

impl FromStr for ImportJobStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "preview_ready" => Ok(ImportJobStatus::PreviewReady),
            "committed" => Ok(ImportJobStatus::Committed),
            "failed" => Ok(ImportJobStatus::Failed),
            other => Err(format!("unsupported import job status {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QualitySeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValueUnit {
    Yuan,
    WanYuan,
    YiYuan,
    Percent,
    Count,
    Unknown,
}

impl Default for ValueUnit {
    fn default() -> Self {
        Self::Unknown
    }
}

impl ValueUnit {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Yuan => "yuan",
            Self::WanYuan => "wan_yuan",
            Self::YiYuan => "yi_yuan",
            Self::Percent => "percent",
            Self::Count => "count",
            Self::Unknown => "unknown",
        }
    }
}

impl FromStr for ValueUnit {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "yuan" | "元" => Ok(Self::Yuan),
            "wan_yuan" | "万元" | "万" => Ok(Self::WanYuan),
            "yi_yuan" | "亿元" | "亿" => Ok(Self::YiYuan),
            "percent" | "%" | "百分比" => Ok(Self::Percent),
            "count" | "个" | "项" | "条" => Ok(Self::Count),
            "" | "unknown" => Ok(Self::Unknown),
            other => Err(format!("unsupported value unit {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcurementAmountSemanticType {
    BudgetAmount,
    AwardTotal,
    UnitPrice,
    DiscountRate,
    FrameworkQuote,
    FrameworkLimit,
    ElectronicMarketplaceUnitPrice,
    ElectronicMarketplaceOrderTotal,
    CentralizedBatchTotal,
    CentralizedBatchLotAmount,
    Unknown,
}

impl Default for ProcurementAmountSemanticType {
    fn default() -> Self {
        Self::Unknown
    }
}

impl ProcurementAmountSemanticType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::BudgetAmount => "budget_amount",
            Self::AwardTotal => "award_total",
            Self::UnitPrice => "unit_price",
            Self::DiscountRate => "discount_rate",
            Self::FrameworkQuote => "framework_quote",
            Self::FrameworkLimit => "framework_limit",
            Self::ElectronicMarketplaceUnitPrice => "electronic_marketplace_unit_price",
            Self::ElectronicMarketplaceOrderTotal => "electronic_marketplace_order_total",
            Self::CentralizedBatchTotal => "centralized_batch_total",
            Self::CentralizedBatchLotAmount => "centralized_batch_lot_amount",
            Self::Unknown => "unknown",
        }
    }
}

impl FromStr for ProcurementAmountSemanticType {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "budget_amount" => Ok(Self::BudgetAmount),
            "award_total" => Ok(Self::AwardTotal),
            "unit_price" => Ok(Self::UnitPrice),
            "discount_rate" => Ok(Self::DiscountRate),
            "framework_quote" => Ok(Self::FrameworkQuote),
            "framework_limit" => Ok(Self::FrameworkLimit),
            "electronic_marketplace_unit_price" => Ok(Self::ElectronicMarketplaceUnitPrice),
            "electronic_marketplace_order_total" => Ok(Self::ElectronicMarketplaceOrderTotal),
            "centralized_batch_total" => Ok(Self::CentralizedBatchTotal),
            "centralized_batch_lot_amount" => Ok(Self::CentralizedBatchLotAmount),
            "" | "unknown" => Ok(Self::Unknown),
            other => Err(format!(
                "unsupported procurement amount semantic type {}",
                other
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuditEvidenceLevel {
    FormalAuditReport,
    RectificationProgress,
    SpecialAuditSurvey,
    AuditProjectPlan,
    AuditResultFeedback,
    AuditWorkUpdate,
    MethodologyOrExperience,
    WorkMethodReference,
    Unknown,
}

impl Default for AuditEvidenceLevel {
    fn default() -> Self {
        Self::Unknown
    }
}

impl AuditEvidenceLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FormalAuditReport => "formal_audit_report",
            Self::RectificationProgress => "rectification_progress",
            Self::SpecialAuditSurvey => "special_audit_survey",
            Self::AuditProjectPlan => "audit_project_plan",
            Self::AuditResultFeedback => "audit_result_feedback",
            Self::AuditWorkUpdate => "audit_work_update",
            Self::MethodologyOrExperience => "methodology_or_experience",
            Self::WorkMethodReference => "work_method_reference",
            Self::Unknown => "unknown",
        }
    }

    pub fn evidence_weight(self) -> u8 {
        match self {
            Self::FormalAuditReport => 90,
            Self::RectificationProgress => 70,
            Self::SpecialAuditSurvey => 60,
            Self::AuditProjectPlan => 30,
            Self::AuditResultFeedback => 55,
            Self::AuditWorkUpdate => 35,
            Self::MethodologyOrExperience | Self::WorkMethodReference => 20,
            Self::Unknown => 0,
        }
    }
}

impl FromStr for AuditEvidenceLevel {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "formal_audit_report" => Ok(Self::FormalAuditReport),
            "rectification_progress" => Ok(Self::RectificationProgress),
            "special_audit_survey" => Ok(Self::SpecialAuditSurvey),
            "audit_project_plan" => Ok(Self::AuditProjectPlan),
            "audit_result_feedback" => Ok(Self::AuditResultFeedback),
            "audit_work_update" => Ok(Self::AuditWorkUpdate),
            "methodology_or_experience" => Ok(Self::MethodologyOrExperience),
            "work_method_reference" => Ok(Self::WorkMethodReference),
            "" | "unknown" => Ok(Self::Unknown),
            other => Err(format!("unsupported audit evidence level {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NormalizedPublicValue {
    pub raw_value: String,
    pub unit: ValueUnit,
    pub normalized_value: String,
}

impl QualitySeverity {
    pub fn as_str(self) -> &'static str {
        match self {
            QualitySeverity::Info => "info",
            QualitySeverity::Warning => "warning",
            QualitySeverity::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportTemplateField {
    pub key: String,
    pub label: String,
    pub required: bool,
    pub aliases: Vec<String>,
    pub description: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaseVisibilityScope {
    Tenant,
    Department,
    RectificationUnit,
    Handler,
}

impl CaseVisibilityScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tenant => "tenant",
            Self::Department => "department",
            Self::RectificationUnit => "rectification_unit",
            Self::Handler => "handler",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportProfileScope {
    Shared,
    Private,
}

impl ImportProfileScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Shared => "shared",
            Self::Private => "private",
        }
    }
}

impl FromStr for ImportProfileScope {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "shared" => Ok(Self::Shared),
            "private" => Ok(Self::Private),
            other => Err(format!("unsupported import profile scope {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssignmentRuleSource {
    Profile,
    PrivateDictionary,
    SharedDictionary,
}

impl AssignmentRuleSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Profile => "profile",
            Self::PrivateDictionary => "private_dictionary",
            Self::SharedDictionary => "shared_dictionary",
        }
    }
}

impl FromStr for AssignmentRuleSource {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "profile" => Ok(Self::Profile),
            "private_dictionary" => Ok(Self::PrivateDictionary),
            "shared_dictionary" => Ok(Self::SharedDictionary),
            other => Err(format!("unsupported assignment rule source {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationScheduleKind {
    ManualOnly,
    Hourly,
    Daily,
    Weekly,
}

impl AutomationScheduleKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ManualOnly => "manual_only",
            Self::Hourly => "hourly",
            Self::Daily => "daily",
            Self::Weekly => "weekly",
        }
    }
}

impl FromStr for AutomationScheduleKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "manual_only" => Ok(Self::ManualOnly),
            "hourly" => Ok(Self::Hourly),
            "daily" => Ok(Self::Daily),
            "weekly" => Ok(Self::Weekly),
            other => Err(format!("unsupported automation schedule kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationTargetKind {
    ConnectorSync,
    CaseSeedImport,
    CaseFollowup,
}

impl AutomationTargetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ConnectorSync => "connector_sync",
            Self::CaseSeedImport => "case_seed_import",
            Self::CaseFollowup => "case_followup",
        }
    }
}

impl FromStr for AutomationTargetKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "connector_sync" => Ok(Self::ConnectorSync),
            "case_seed_import" => Ok(Self::CaseSeedImport),
            "case_followup" => Ok(Self::CaseFollowup),
            other => Err(format!("unsupported automation target kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DatasetVariantDefinition {
    pub dataset_kind: String,
    pub label: String,
    pub description: String,
    pub template_fields: Vec<ImportTemplateField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskKindDefinition {
    pub task_kind: TaskKind,
    pub label: String,
    pub description: String,
    pub enabled: bool,
    pub supported_sources: Vec<ImportSourceKind>,
    pub availability_note: Option<String>,
    pub dataset_variants: Vec<DatasetVariantDefinition>,
    pub template_fields: Vec<ImportTemplateField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InternalSampleTemplateDefinition {
    pub template_kind: InternalSampleTemplateKind,
    pub label: String,
    pub description: String,
    pub task_kind: TaskKind,
    pub dataset_kind: Option<String>,
    pub schema_version: String,
    pub field_mapping_version: String,
    pub minimum_fields: Vec<ImportTemplateField>,
    pub recommended_fields: Vec<ImportTemplateField>,
    pub linkage_role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QualityCheck {
    pub code: String,
    pub severity: QualitySeverity,
    pub message: String,
    pub field: Option<String>,
    pub row_number: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ImportQualityReport {
    pub total_rows: usize,
    pub accepted_rows: usize,
    pub rejected_rows: usize,
    pub checks: Vec<QualityCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct SourceEvidence {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub captured_at: Option<String>,
    #[serde(default)]
    pub row_number: Option<usize>,
    #[serde(default)]
    pub parser_version: Option<String>,
    #[serde(default)]
    pub page_number: Option<usize>,
    #[serde(default)]
    pub section_title: Option<String>,
    #[serde(default)]
    pub locator_hash: Option<String>,
    #[serde(default)]
    pub raw_excerpt: Option<String>,
    #[serde(default)]
    pub table_title: Option<String>,
    #[serde(default)]
    pub table_row_index: Option<usize>,
    #[serde(default)]
    pub table_column_name: Option<String>,
    #[serde(default)]
    pub paragraph_index: Option<usize>,
    #[serde(default)]
    pub pdf_table_id: Option<String>,
    #[serde(default)]
    pub legal_basis: Option<String>,
    #[serde(default)]
    pub legal_basis_article: Option<String>,
    #[serde(default)]
    pub decision_paragraph_index: Option<usize>,
    #[serde(default)]
    pub affected_package_no: Option<String>,
    #[serde(default)]
    pub handling_result_locator_hash: Option<String>,
    #[serde(default)]
    pub penalty_basis: Option<String>,
    #[serde(default)]
    pub penalty_decision_paragraph_index: Option<usize>,
    #[serde(default)]
    pub credit_record_locator_hash: Option<String>,
    #[serde(default)]
    pub market_restriction_locator_hash: Option<String>,
}

impl SourceEvidence {
    pub fn has_traceable_source(&self) -> bool {
        self.title
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            || self
                .url
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
    }

    pub fn has_locator(&self) -> bool {
        self.page_number.is_some()
            || self
                .section_title
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .locator_hash
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .raw_excerpt
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .table_title
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self.table_row_index.is_some()
            || self
                .table_column_name
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self.paragraph_index.is_some()
            || self
                .pdf_table_id
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .legal_basis
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .legal_basis_article
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self.decision_paragraph_index.is_some()
            || self
                .affected_package_no
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .handling_result_locator_hash
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .penalty_basis
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self.penalty_decision_paragraph_index.is_some()
            || self
                .credit_record_locator_hash
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .market_restriction_locator_hash
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
    }
}

pub fn normalize_public_value(
    value: &str,
    default_unit: ValueUnit,
) -> Option<NormalizedPublicValue> {
    let raw = value.trim();
    if raw.is_empty() {
        return None;
    }
    let number = extract_decimal_text(raw)?;
    let decimal = Decimal::from_str(&number).ok()?;
    let unit = detect_value_unit(raw).unwrap_or(default_unit);
    let normalized = match unit {
        ValueUnit::Yuan => decimal,
        ValueUnit::WanYuan => decimal * Decimal::from(10_000u32),
        ValueUnit::YiYuan => decimal * Decimal::from(100_000_000u32),
        ValueUnit::Percent | ValueUnit::Count | ValueUnit::Unknown => decimal,
    };
    Some(NormalizedPublicValue {
        raw_value: raw.to_string(),
        unit,
        normalized_value: normalized.normalize().to_string(),
    })
}

fn detect_value_unit(value: &str) -> Option<ValueUnit> {
    let normalized = value.trim().to_ascii_lowercase();
    if value.contains('%') || normalized.contains("percent") {
        Some(ValueUnit::Percent)
    } else if value.contains("亿元") || value.contains('亿') || normalized.contains("yi_yuan") {
        Some(ValueUnit::YiYuan)
    } else if value.contains("万元") || value.contains('万') || normalized.contains("wan_yuan") {
        Some(ValueUnit::WanYuan)
    } else if value.contains('元') || normalized.contains("yuan") {
        Some(ValueUnit::Yuan)
    } else if value.contains('个')
        || value.contains('项')
        || value.contains('条')
        || value.contains('宗')
        || value.contains('所')
        || normalized.contains("count")
    {
        Some(ValueUnit::Count)
    } else {
        None
    }
}

fn extract_decimal_text(value: &str) -> Option<String> {
    let mut number = String::new();
    let mut started = false;
    for character in value.chars() {
        if character.is_ascii_digit() || character == '.' || character == '-' || character == ',' {
            started = true;
            if character != ',' {
                number.push(character);
            }
        } else if started {
            break;
        }
    }
    if number.is_empty() || number == "-" {
        None
    } else {
        Some(number)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct NormalizedRegion {
    pub province: String,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub county: Option<String>,
    #[serde(default)]
    pub normalized_region_code: Option<String>,
    pub display_name: String,
}

pub fn normalize_jiangsu_region(value: &str) -> NormalizedRegion {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return NormalizedRegion {
            province: "江苏省".to_string(),
            city: None,
            county: None,
            normalized_region_code: None,
            display_name: "江苏省".to_string(),
        };
    }

    let compact = trimmed
        .replace(' ', "")
        .replace("江苏省", "")
        .replace("江苏", "")
        .replace("南通市", "")
        .replace("盐城市", "")
        .replace("无锡市", "")
        .replace("苏州市", "")
        .replace("南京市", "");
    let key = compact
        .trim_end_matches('市')
        .trim_end_matches('区')
        .trim_end_matches('县')
        .to_string();

    let matched: Option<(&str, Option<&str>, &str)> = match key.as_str() {
        "南通" | "nantong" => Some(("南通市", None, "320600")),
        "崇川" => Some(("南通市", Some("崇川区"), "320613")),
        "通州" => Some(("南通市", Some("通州区"), "320612")),
        "海门" => Some(("南通市", Some("海门区"), "320614")),
        "海安" => Some(("南通市", Some("海安市"), "320685")),
        "如皋" => Some(("南通市", Some("如皋市"), "320682")),
        "启东" => Some(("南通市", Some("启东市"), "320681")),
        "如东" => Some(("南通市", Some("如东县"), "320623")),
        "东台" => Some(("盐城市", Some("东台市"), "320981")),
        "江阴" => Some(("无锡市", Some("江阴市"), "320281")),
        "昆山" => Some(("苏州市", Some("昆山市"), "320583")),
        "江宁" => Some(("南京市", Some("江宁区"), "320115")),
        _ => None,
    };

    if let Some((city, county, code)) = matched {
        let display_name = county
            .map(|county| format!("江苏省{}{}", city, county))
            .unwrap_or_else(|| format!("江苏省{}", city));
        return NormalizedRegion {
            province: "江苏省".to_string(),
            city: Some(city.to_string()),
            county: county.map(|value| value.to_string()),
            normalized_region_code: Some(code.to_string()),
            display_name,
        };
    }

    NormalizedRegion {
        province: "江苏省".to_string(),
        city: None,
        county: Some(trimmed.to_string()),
        normalized_region_code: None,
        display_name: trimmed.to_string(),
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcurementBudgetLinkMode {
    Exact,
    EvidenceAuto,
    EvidenceCandidate,
    None,
}

impl ProcurementBudgetLinkMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::EvidenceAuto => "evidence_auto",
            Self::EvidenceCandidate => "evidence_candidate",
            Self::None => "none",
        }
    }
}

impl FromStr for ProcurementBudgetLinkMode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "exact" => Ok(Self::Exact),
            "evidence_auto" | "auto" => Ok(Self::EvidenceAuto),
            "evidence_candidate" | "candidate" => Ok(Self::EvidenceCandidate),
            "none" | "" => Ok(Self::None),
            other => Err(format!(
                "unsupported procurement budget link mode {}",
                other
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinkageCandidateMatch {
    pub record_type: String,
    pub record_id: String,
    pub confidence: u32,
    pub match_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetUnitRecord {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetProjectRecord {
    pub id: String,
    pub budget_unit_id: Option<String>,
    pub name: String,
    pub project_catalog_id: Option<String>,
    pub indicator_document_no: Option<String>,
    pub funding_source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformTaskFinding {
    pub id: String,
    pub rule_code: String,
    pub rule_name: String,
    pub rule_category: String,
    pub risk_level: String,
    pub summary: String,
    pub audit_rationale: String,
    pub recommended_action: String,
    pub evidence_summary: String,
    #[serde(default)]
    pub severity_reason: Option<String>,
    #[serde(default)]
    pub missing_evidence: Vec<String>,
    #[serde(default)]
    pub recommended_next_data: Vec<String>,
    #[serde(default)]
    pub finding_disposition: Option<String>,
    pub finding_status: String,
    pub assignee: Option<String>,
    pub disposition_note: Option<String>,
    pub disposition_priority: Option<String>,
    pub disposition_outcome: Option<String>,
    pub remediation_due_at: Option<String>,
    pub reminder_flag: bool,
    pub disposed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportProfile {
    pub id: String,
    pub name: String,
    pub task_kind: TaskKind,
    pub template_kind: Option<String>,
    pub scope: ImportProfileScope,
    pub owner_user_id: String,
    pub is_default: bool,
    pub mapping_overrides: Vec<CaseSeedMappingOverride>,
    pub assignment_rules: Vec<CaseSeedAssignmentRule>,
    pub notes: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportProfileInput {
    pub name: String,
    pub task_kind: TaskKind,
    pub template_kind: Option<String>,
    pub scope: ImportProfileScope,
    pub is_default: bool,
    pub mapping_overrides: Vec<CaseSeedMappingOverride>,
    pub assignment_rules: Vec<CaseSeedAssignmentRule>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssignmentDictionaryRule {
    pub id: String,
    pub task_kind: TaskKind,
    pub template_kind: Option<String>,
    pub match_field: String,
    pub match_value: String,
    pub assignee: String,
    pub target_department: Option<String>,
    pub priority: u32,
    pub scope: ImportProfileScope,
    pub enabled: bool,
    pub label: Option<String>,
    pub owner_user_id: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssignmentDictionaryRuleInput {
    pub task_kind: TaskKind,
    pub template_kind: Option<String>,
    pub match_field: String,
    pub match_value: String,
    pub assignee: String,
    pub target_department: Option<String>,
    pub priority: u32,
    pub scope: ImportProfileScope,
    pub enabled: bool,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutomationSchedule {
    pub id: String,
    pub name: String,
    pub schedule_kind: AutomationScheduleKind,
    pub target_kind: AutomationTargetKind,
    pub enabled: bool,
    pub shared_profile_id: Option<String>,
    pub connector_profile_id: Option<String>,
    pub source_path: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_run_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutomationScheduleInput {
    pub name: String,
    pub schedule_kind: AutomationScheduleKind,
    pub target_kind: AutomationTargetKind,
    pub enabled: bool,
    pub shared_profile_id: Option<String>,
    pub connector_profile_id: Option<String>,
    pub source_path: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct AutomationExecutionSummary {
    pub auto_created_cases: usize,
    pub auto_assignment_hits: usize,
    pub auto_reminders: usize,
    pub auto_escalations: usize,
    pub created_tasks: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutomationExecution {
    pub id: String,
    pub schedule_id: String,
    pub schedule_kind: AutomationScheduleKind,
    pub target_kind: AutomationTargetKind,
    pub status: String,
    pub trigger_kind: String,
    pub trigger_window: Option<String>,
    pub retry_count: usize,
    pub last_error: Option<String>,
    pub summary: AutomationExecutionSummary,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SchedulerLease {
    pub tenant_id: String,
    pub worker_id: String,
    pub acquired: bool,
    pub lease_expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementBudgetLinkEvidence {
    pub match_mode: ProcurementBudgetLinkMode,
    pub match_score: u32,
    pub match_reasons: Vec<String>,
    pub candidate_budget_project_ids: Vec<String>,
    #[serde(default)]
    pub linkage_confidence: u32,
    #[serde(default)]
    pub candidate_matches: Vec<LinkageCandidateMatch>,
    #[serde(default)]
    pub unmatched_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SupplierRecord {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FundingSourceRecord {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AccountClassificationRecord {
    pub id: String,
    pub function_classification_code: Option<String>,
    pub economic_classification_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceDocumentRecord {
    pub id: String,
    pub document_type: String,
    pub title: String,
    pub url: Option<String>,
    pub captured_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct BudgetLinkageSummary {
    pub exact_linked_procurement_projects: usize,
    pub evidence_auto_linked_procurement_projects: usize,
    pub candidate_procurement_projects: usize,
    pub unlinked_procurement_projects: usize,
    pub ambiguous_matches: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ContractLinkageSummary {
    pub linked_contracts: usize,
    pub missing_contracts: usize,
    pub closed_contract_chains: usize,
    pub open_contract_chains: usize,
    pub writeback_pending: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PaymentLinkageSummary {
    pub linked_payments: usize,
    pub unmatched_payments: usize,
    pub paid_without_ledger: usize,
    pub ledger_without_payment: usize,
    pub amount_gap: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct LedgerLinkageSummary {
    pub linked_entries: usize,
    pub unbalanced_entries: usize,
    pub duplicate_entries: usize,
    pub timing_exceptions: usize,
    pub manual_review_required: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementProjectRecord {
    pub id: String,
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
    pub budget_unit_id: Option<String>,
    pub budget_project_id: Option<String>,
    pub supplier_id: Option<String>,
    pub funding_source_id: Option<String>,
    pub account_classification_id: Option<String>,
    pub indicator_document_no: Option<String>,
    pub project_catalog_id: Option<String>,
    pub notice_url: Option<String>,
    #[serde(default)]
    pub source_evidence: Option<SourceEvidence>,
    pub source_row: Option<usize>,
    pub linkage_evidence: Option<ProcurementBudgetLinkEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementContractRecord {
    pub id: String,
    pub procurement_project_id: String,
    pub contract_no: Option<String>,
    pub contract_published_at: Option<String>,
    pub acceptance_summary: Option<String>,
    pub acceptance_status: Option<String>,
    pub contract_amount: Option<String>,
    pub supplier_id: Option<String>,
    pub funding_source_id: Option<String>,
    pub account_classification_id: Option<String>,
    pub source_document_id: Option<String>,
    pub writeback_status: Option<String>,
    pub writeback_ref: Option<String>,
    pub reconciliation_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementTaskDetail {
    pub projects: Vec<ProcurementProjectRecord>,
    pub contracts: Vec<ProcurementContractRecord>,
    pub budget_units: Vec<BudgetUnitRecord>,
    pub budget_projects: Vec<BudgetProjectRecord>,
    pub suppliers: Vec<SupplierRecord>,
    pub funding_sources: Vec<FundingSourceRecord>,
    pub account_classifications: Vec<AccountClassificationRecord>,
    pub source_documents: Vec<SourceDocumentRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetSummaryRowRecord {
    pub id: String,
    pub period: String,
    pub region: Option<String>,
    pub budget_scope: String,
    pub direction: String,
    pub budget_unit_id: Option<String>,
    pub budget_project_id: Option<String>,
    pub funding_source_id: Option<String>,
    pub account_classification_id: Option<String>,
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
    pub source_row: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetTrendPoint {
    pub period: String,
    pub budget_scope: String,
    pub direction: String,
    pub budget_amount: Option<String>,
    pub actual_amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetBreakdownItem {
    pub dimension: String,
    pub key: String,
    pub label: String,
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetVarianceHighlight {
    pub rule_code: String,
    pub label: String,
    pub subject: String,
    pub metric_value: String,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BudgetSummaryTaskDetail {
    pub dataset_kind: BudgetDatasetKind,
    pub rows_preview: Vec<BudgetSummaryRowRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
    pub trend_points: Vec<BudgetTrendPoint>,
    pub classification_breakdown: Vec<BudgetBreakdownItem>,
    pub variance_highlights: Vec<BudgetVarianceHighlight>,
    pub linkage_summary: BudgetLinkageSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TreasuryPaymentVoucherRecord {
    pub id: String,
    pub budget_project_id: Option<String>,
    pub procurement_project_id: Option<String>,
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
    pub funding_source_id: Option<String>,
    pub account_classification_id: Option<String>,
    pub source_document_id: Option<String>,
    pub indicator_document_no: Option<String>,
    pub project_catalog_id: Option<String>,
    pub contract_no: Option<String>,
    pub payment_order_no: Option<String>,
    pub treasury_voucher_no: Option<String>,
    pub amount: String,
    pub paid_at: String,
    pub counterparty: String,
    pub writeback_status: Option<String>,
    pub writeback_ref: Option<String>,
    pub reconciliation_status: Option<String>,
    pub source_row: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TreasuryPaymentTaskDetail {
    pub dataset_kind: TreasuryDatasetKind,
    pub vouchers: Vec<TreasuryPaymentVoucherRecord>,
    pub contracts: Vec<ProcurementContractRecord>,
    pub suppliers: Vec<SupplierRecord>,
    pub funding_sources: Vec<FundingSourceRecord>,
    pub account_classifications: Vec<AccountClassificationRecord>,
    pub source_documents: Vec<SourceDocumentRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
    pub contract_linkage_summary: ContractLinkageSummary,
    pub payment_linkage_summary: PaymentLinkageSummary,
    pub ledger_linkage_summary: LedgerLinkageSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LedgerEntryRecord {
    pub id: String,
    pub budget_project_id: Option<String>,
    pub procurement_project_id: Option<String>,
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
    pub funding_source_id: Option<String>,
    pub account_classification_id: Option<String>,
    pub source_document_id: Option<String>,
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
    pub writeback_status: Option<String>,
    pub writeback_ref: Option<String>,
    pub reconciliation_status: Option<String>,
    pub source_row: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VoucherLedgerTaskDetail {
    pub dataset_kind: VoucherDatasetKind,
    pub entries: Vec<LedgerEntryRecord>,
    pub suppliers: Vec<SupplierRecord>,
    pub funding_sources: Vec<FundingSourceRecord>,
    pub account_classifications: Vec<AccountClassificationRecord>,
    pub source_documents: Vec<SourceDocumentRecord>,
    pub quality_report: ImportQualityReport,
    pub applicable_rule_sets: Vec<String>,
    pub payment_linkage_summary: PaymentLinkageSummary,
    pub ledger_linkage_summary: LedgerLinkageSummary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectorType {
    BudgetSystem,
    TreasurySystem,
    LedgerSystem,
    ProcurementSystem,
}

impl ConnectorType {
    pub fn as_str(self) -> &'static str {
        match self {
            ConnectorType::BudgetSystem => "budget_system",
            ConnectorType::TreasurySystem => "treasury_system",
            ConnectorType::LedgerSystem => "ledger_system",
            ConnectorType::ProcurementSystem => "procurement_system",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ConnectorType::BudgetSystem => "预算指标 / 项目库",
            ConnectorType::TreasurySystem => "国库支付 / 电子支付",
            ConnectorType::LedgerSystem => "财务核算 / 总账凭证",
            ConnectorType::ProcurementSystem => "政府采购 / 合同公告",
        }
    }
}

impl FromStr for ConnectorType {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "budget_system" => Ok(ConnectorType::BudgetSystem),
            "treasury_system" => Ok(ConnectorType::TreasurySystem),
            "ledger_system" => Ok(ConnectorType::LedgerSystem),
            "procurement_system" => Ok(ConnectorType::ProcurementSystem),
            other => Err(format!("unsupported connector type {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectorProfile {
    pub id: String,
    pub name: String,
    pub connector_type: ConnectorType,
    pub task_kind: TaskKind,
    pub dataset_kind: Option<String>,
    pub base_url: String,
    pub auth_mode: String,
    pub credential_state: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_preview_at: Option<String>,
    pub last_commit_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectorProfileInput {
    pub name: String,
    pub connector_type: ConnectorType,
    pub task_kind: TaskKind,
    pub dataset_kind: Option<String>,
    pub base_url: String,
    pub auth_mode: String,
    pub sample_payload_json: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectorSyncJob {
    pub id: String,
    pub profile_id: String,
    pub task_kind: TaskKind,
    pub dataset_kind: Option<String>,
    pub status: String,
    pub mode: String,
    pub source_kind: ImportSourceKind,
    pub preview_job_id: Option<String>,
    pub committed_task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WritebackEvent {
    pub id: String,
    pub tenant_id: String,
    pub task_id: String,
    pub task_kind: TaskKind,
    pub target_type: String,
    pub target_id: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub reminder_flag: bool,
    pub idempotency_key: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WritebackInput {
    pub task_id: String,
    pub task_kind: TaskKind,
    pub target_type: String,
    pub target_id: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub reminder_flag: bool,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReconciliationException {
    pub id: String,
    pub task_id: String,
    pub task_kind: TaskKind,
    pub exception_code: String,
    pub summary: String,
    pub severity: String,
    pub source_record_id: Option<String>,
    pub related_record_id: Option<String>,
    pub status: String,
    pub assignee: Option<String>,
    pub disposition_note: Option<String>,
    pub disposition_priority: Option<String>,
    pub disposition_outcome: Option<String>,
    pub remediation_due_at: Option<String>,
    pub reminder_flag: bool,
    pub disposed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExceptionDispositionEvent {
    pub id: String,
    pub task_id: String,
    pub exception_id: String,
    pub source: String,
    pub status: String,
    pub assignee: Option<String>,
    pub disposition_note: Option<String>,
    pub disposition_priority: Option<String>,
    pub disposition_outcome: Option<String>,
    pub remediation_due_at: Option<String>,
    pub reminder_flag: Option<bool>,
    pub changed_by: String,
    pub changed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExceptionReminderEvent {
    pub id: String,
    pub task_id: String,
    pub exception_id: String,
    pub source: String,
    pub reminder_flag: bool,
    pub reminder_note: Option<String>,
    pub changed_by: String,
    pub changed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExceptionReceiptAttachment {
    pub id: String,
    pub task_id: String,
    pub exception_id: String,
    pub source: String,
    pub file_name: String,
    pub mime_type: String,
    pub storage_path: String,
    pub note: Option<String>,
    pub uploaded_by: String,
    pub uploaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExceptionCase {
    pub id: String,
    pub case_no: String,
    pub task_id: String,
    pub exception_id: String,
    pub exception_source: String,
    pub task_kind: TaskKind,
    pub rule_domain: String,
    pub risk_level: String,
    pub exception_code: String,
    pub exception_title: String,
    pub exception_summary: String,
    pub owner_organization_id: Option<String>,
    pub visibility_scope: String,
    pub priority: String,
    pub case_status: String,
    pub current_stage: String,
    pub current_handler_user_id: Option<String>,
    pub current_handler_display_name: Option<String>,
    pub source_department: Option<String>,
    pub target_department: Option<String>,
    pub rectification_unit_name: Option<String>,
    pub disposition_outcome: Option<String>,
    pub disposition_note: Option<String>,
    pub accepted_at: String,
    pub first_assigned_at: Option<String>,
    pub first_response_at: Option<String>,
    pub submitted_for_review_at: Option<String>,
    pub sla_due_at: Option<String>,
    pub remediation_due_at: Option<String>,
    pub closed_at: Option<String>,
    pub overdue_days: i64,
    pub reminder_count: usize,
    pub escalation_count: usize,
    pub notification_summary: NotificationSummary,
    pub extension_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseTransitionEvent {
    pub id: String,
    pub case_id: String,
    pub task_id: String,
    pub exception_id: String,
    pub event_type: String,
    pub from_stage: Option<String>,
    pub to_stage: String,
    pub case_status: String,
    pub assignee: Option<String>,
    pub priority: Option<String>,
    pub due_at: Option<String>,
    pub outcome: Option<String>,
    pub note: Option<String>,
    pub reminder_flag: Option<bool>,
    pub changed_by: String,
    pub changed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseAssignment {
    pub id: String,
    pub case_id: String,
    pub assigned_to_user_id: Option<String>,
    pub assigned_to_display_name: Option<String>,
    pub source_department: Option<String>,
    pub target_department: Option<String>,
    pub rectification_unit_name: Option<String>,
    pub assigned_by: String,
    pub assigned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RectificationSubmission {
    pub id: String,
    pub case_id: String,
    pub rectification_statement: Option<String>,
    pub requested_extension: Option<String>,
    pub receipt_attachment_count: usize,
    pub submitted_by: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RectificationReviewDecision {
    pub id: String,
    pub case_id: String,
    pub decision: String,
    pub note: Option<String>,
    pub reviewed_by: String,
    pub reviewed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RectificationExtensionRequest {
    pub id: String,
    pub case_id: String,
    pub requested_due_at: String,
    pub reason: Option<String>,
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewed_at: Option<String>,
    pub submitted_by: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseSlaSnapshot {
    pub id: String,
    pub case_id: String,
    pub case_status: String,
    pub current_stage: String,
    pub priority: String,
    pub sla_due_at: Option<String>,
    pub overdue_days: i64,
    pub reminder_count: usize,
    pub escalation_count: usize,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NotificationSummary {
    pub total_deliveries: usize,
    pub reminder_deliveries: usize,
    pub escalation_deliveries: usize,
    pub unread_deliveries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NotificationTemplate {
    pub id: String,
    pub event_type: String,
    pub channel: String,
    pub title_template: String,
    pub body_template: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NotificationDelivery {
    pub id: String,
    pub case_id: String,
    pub event_type: String,
    pub channel: String,
    pub recipient: String,
    pub recipient_scope: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub delivered_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseEscalationEvent {
    pub id: String,
    pub case_id: String,
    pub level: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseMetrics {
    pub total_cases: usize,
    pub open_cases: usize,
    pub closed_cases: usize,
    pub on_time_closed_cases: usize,
    pub overdue_open_cases: usize,
    pub reminder_count: usize,
    pub escalation_count: usize,
    pub average_disposal_days: i64,
    pub average_review_reject_count: i64,
    pub by_task_kind: Vec<CaseMetricBucket>,
    pub by_rule_domain: Vec<CaseMetricBucket>,
    pub by_handler: Vec<CaseMetricBucket>,
    pub by_department: Vec<CaseMetricBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseMetricsOverview {
    pub total_cases: usize,
    pub open_cases: usize,
    pub closed_cases: usize,
    pub overdue_open_cases: usize,
    pub on_time_closed_cases: usize,
    pub reminder_count: usize,
    pub escalation_count: usize,
    pub average_disposal_days: i64,
    pub average_review_reject_count: i64,
    pub closure_rate: String,
    pub on_time_closure_rate: String,
    pub automation_runs: usize,
    pub automation_failure_count: usize,
    pub automation_success_rate: String,
    pub auto_created_cases: usize,
    pub auto_assignment_hits: usize,
    pub auto_reminders: usize,
    pub auto_escalations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseMetricBucket {
    pub key: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseTrendPoint {
    pub period: String,
    pub opened_cases: usize,
    pub closed_cases: usize,
    pub overdue_cases: usize,
    pub reminder_count: usize,
    pub automation_runs: usize,
    pub automation_failures: usize,
    pub auto_created_cases: usize,
    pub auto_reminders: usize,
    pub auto_escalations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CaseMetricsByDimension {
    pub dimension: String,
    pub buckets: Vec<CaseMetricBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExceptionCaseDetail {
    pub case: ExceptionCase,
    pub assignment_history: Vec<CaseAssignment>,
    pub transition_history: Vec<CaseTransitionEvent>,
    pub rectification_submissions: Vec<RectificationSubmission>,
    pub review_decisions: Vec<RectificationReviewDecision>,
    pub extension_requests: Vec<RectificationExtensionRequest>,
    pub sla_snapshots: Vec<CaseSlaSnapshot>,
    pub notification_deliveries: Vec<NotificationDelivery>,
    pub escalation_events: Vec<CaseEscalationEvent>,
    pub receipt_attachments: Vec<ExceptionReceiptAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskExceptionPoolEntry {
    pub id: String,
    pub task_id: String,
    pub task_title: String,
    pub task_kind: TaskKind,
    pub source: String,
    pub code: String,
    pub title: String,
    pub category: String,
    pub summary: String,
    pub severity: String,
    pub status: String,
    pub source_record_id: Option<String>,
    pub related_record_id: Option<String>,
    pub case_id: Option<String>,
    pub case_status: Option<String>,
    pub current_stage: Option<String>,
    pub contract_no: Option<String>,
    pub payment_order_no: Option<String>,
    pub treasury_voucher_no: Option<String>,
    pub voucher_no: Option<String>,
    pub assignee: Option<String>,
    pub disposition_note: Option<String>,
    pub disposition_priority: Option<String>,
    pub disposition_outcome: Option<String>,
    pub remediation_due_at: Option<String>,
    pub reminder_flag: bool,
    pub reminder_count: usize,
    pub disposed_at: Option<String>,
    pub disposition_history: Vec<ExceptionDispositionEvent>,
    pub reminder_history: Vec<ExceptionReminderEvent>,
    pub receipt_attachments: Vec<ExceptionReceiptAttachment>,
    pub evidence_summary: Option<String>,
    pub recommended_action: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExceptionBulkActionTarget {
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(alias = "id")]
    pub exception_id: String,
    pub source: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskOrigin {
    LegacyDemo,
    V2Platform,
    V2Typed,
}

impl TaskOrigin {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::LegacyDemo => "legacy_demo",
            Self::V2Platform => "v2_platform",
            Self::V2Typed => "v2_typed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "task_origin", content = "task", rename_all = "snake_case")]
pub enum AnyTask {
    LegacyDemo(super::AuditTask),
    V2Platform(PlatformTask),
    V2Typed(PlatformTask),
}

impl AnyTask {
    pub fn id(&self) -> &str {
        match self {
            Self::LegacyDemo(task) => &task.id,
            Self::V2Platform(task) | Self::V2Typed(task) => &task.id,
        }
    }

    pub fn origin(&self) -> TaskOrigin {
        match self {
            Self::LegacyDemo(_) => TaskOrigin::LegacyDemo,
            Self::V2Platform(_) => TaskOrigin::V2Platform,
            Self::V2Typed(_) => TaskOrigin::V2Typed,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
pub enum TaskDetailPayload {
    VoucherLedger(VoucherLedgerTaskDetail),
    BudgetSummary(BudgetSummaryTaskDetail),
    ProcurementProject(ProcurementTaskDetail),
    TreasuryPayment(TreasuryPaymentTaskDetail),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformTaskSummary {
    pub id: String,
    pub task_kind: TaskKind,
    pub title: String,
    pub source_kind: ImportSourceKind,
    pub status: PlatformTaskStatus,
    pub risk_level: String,
    pub primary_subject: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformTask {
    pub id: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub task_kind: TaskKind,
    pub title: String,
    pub source_kind: ImportSourceKind,
    pub status: PlatformTaskStatus,
    pub risk_level: String,
    pub primary_subject: String,
    pub findings: Vec<PlatformTaskFinding>,
    pub detail: TaskDetailPayload,
    #[serde(default)]
    pub budget_linkage_summary: BudgetLinkageSummary,
    #[serde(default)]
    pub contract_linkage_summary: ContractLinkageSummary,
    #[serde(default)]
    pub payment_linkage_summary: PaymentLinkageSummary,
    #[serde(default)]
    pub ledger_linkage_summary: LedgerLinkageSummary,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportJobPreview {
    pub id: Option<String>,
    pub task_kind: TaskKind,
    pub source_kind: ImportSourceKind,
    pub title: String,
    pub primary_subject: String,
    pub quality_report: ImportQualityReport,
    pub detail: TaskDetailPayload,
    pub ready_to_commit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportJobRecord {
    pub id: String,
    pub task_kind: TaskKind,
    pub source_kind: ImportSourceKind,
    pub status: ImportJobStatus,
    pub title: String,
    pub primary_subject: String,
    pub preview: ImportJobPreview,
    pub created_at: String,
    pub committed_task_id: Option<String>,
}

fn field(
    key: &str,
    label: &str,
    required: bool,
    aliases: &[&str],
    description: &str,
) -> ImportTemplateField {
    ImportTemplateField {
        key: key.to_string(),
        label: label.to_string(),
        required,
        aliases: aliases.iter().map(|value| value.to_string()).collect(),
        description: description.to_string(),
    }
}

fn simple_template_fields(keys: &[(&str, bool)]) -> Vec<ImportTemplateField> {
    keys.iter()
        .map(|(key, required)| field(key, key, *required, &[], key))
        .collect()
}

fn procurement_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("project_name", true),
        ("purchaser_name", true),
        ("announcement_type", true),
        ("procurement_stage", false),
        ("project_code", true),
        ("package_no", false),
        ("package_name", false),
        ("budget_amount", false),
        ("award_amount", false),
        ("amount_semantic_type", false),
        ("acceptance_management_flag", false),
        ("acceptance_plan", false),
        ("acceptance_opinion", false),
        ("acceptance_archive_status", false),
        ("acceptance_archive_locator", false),
        ("acceptance_issue_summary", false),
        ("service_period", false),
        ("maintenance_period", false),
        ("warranty_period", false),
        ("acceptance_standard", false),
        ("acceptance_result", false),
        ("acceptance_result_locator", false),
        ("service_period_source", false),
        ("warranty_maintenance_source", false),
        ("settlement_basis", false),
        ("payment_trigger", false),
        ("payment_deadline", false),
        ("payment_condition_source", false),
        ("contract_performance_period", false),
        ("government_purchase_service_flag", false),
        ("joint_bid_allowed_flag", false),
        ("sme_policy_requirement", false),
        ("credit_financing_policy_flag", false),
        ("procurement_policy_note", false),
        ("procurement_exception_type", false),
        ("complaint_decision_no", false),
        ("complaint_issue_summary", false),
        ("complaint_handling_result", false),
        ("allegation_type", false),
        ("allegation_outcome", false),
        ("confirmed_fact_flag", false),
        ("remedy_action", false),
        ("remedy_required_flag", false),
        ("allegation_evidence_weight", false),
        ("allegation_weight_reason", false),
        ("false_material_flag", false),
        ("award_invalidated_flag", false),
        ("rebid_required_flag", false),
        ("correction_notice_flag", false),
        ("supervision_penalty_subject", false),
        ("affected_package_no", false),
        ("penalty_decision_no", false),
        ("penalty_basis", false),
        ("penalty_basis_article", false),
        ("penalty_period", false),
        ("market_entry_restriction_scope", false),
        ("penalty_subject_type", false),
        ("penalty_subject_name", false),
        ("credit_repair_status", false),
        ("credit_repair_source_url", false),
        ("re_participation_review_flag", false),
        ("exception_evidence_category", false),
        ("exception_evidence_weight", false),
        ("exception_weight_reason", false),
        ("source_region_scope", false),
        ("source_province", false),
        ("source_city", false),
        ("source_region_code", false),
        ("publisher_level", false),
        ("central_unit_flag", false),
        ("purchaser_region_code", false),
        ("procurement_channel", false),
        ("platform_order_no", false),
        ("item_name", false),
        ("item_quantity", false),
        ("item_unit", false),
        ("unit_price_amount", false),
        ("unit_price_unit", false),
        ("order_total_amount", false),
        ("order_total_unit", false),
        ("procurement_intention_flag", false),
        ("intention_budget_amount", false),
        ("intention_expected_procurement_at", false),
        ("intention_followup_status", false),
        ("batch_month", false),
        ("batch_category", false),
        ("product_category", false),
        ("manufacturer", false),
        ("model", false),
        ("batch_lot_no", false),
        ("batch_total_amount", false),
        ("lot_award_amount", false),
        ("published_at", false),
        ("region", false),
        ("source_title", false),
        ("source_url", false),
    ])
}

fn budget_execution_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("period", true),
        ("budget_unit_name", true),
        ("budget_scope", true),
        ("direction", true),
        ("budget_project_name", false),
        ("indicator_document_no", false),
        ("budget_amount", false),
        ("actual_amount", true),
    ])
}

fn budget_public_summary_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("period", true),
        ("region", true),
        ("budget_scope", true),
        ("direction", true),
        ("summary_item", true),
        ("actual_amount", true),
        ("budget_amount", false),
        ("yoy_rate", false),
        ("required_budget_indicator_data", false),
        ("required_performance_target_data", false),
        ("required_project_performance_target_data", false),
        ("required_quarterly_performance_monitoring_data", false),
        ("required_payment_progress_data", false),
        ("required_voucher_attachment_data", false),
        ("required_payment_data", false),
        ("required_voucher_data", false),
        ("policy_supplemental_checklist_type", false),
        ("policy_topic", false),
        ("required_source_documents", false),
        ("next_data_priority", false),
        ("fund_usage_restriction_level", false),
        ("performance_evidence_required", false),
        ("department_final_account_table_type", false),
        ("subject_code", false),
        ("subject_name", false),
        ("amount_column_name", false),
        ("performance_indicator_name", false),
        ("performance_indicator_value", false),
        ("performance_indicator_unit", false),
        ("source_title", false),
        ("source_url", false),
    ])
}

fn budget_public_statistical_indicator_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("period", true),
        ("region", true),
        ("summary_item", true),
        ("actual_amount", true),
        ("previous_period_amount", false),
        ("yoy_rate", false),
        ("source_title", false),
        ("source_url", false),
    ])
}

fn budget_investment_review_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("period", true),
        ("region", true),
        ("summary_item", true),
        ("actual_amount", true),
        ("source_title", false),
        ("source_url", false),
    ])
}

fn budget_township_fiscal_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("period", true),
        ("region", true),
        ("fiscal_level", false),
        ("fiscal_section", true),
        ("summary_item", true),
        ("opening_budget_amount", false),
        ("actual_amount", true),
        ("completion_rate", false),
        ("available_financial_capacity", false),
        ("fiscal_special_account_amount", false),
        ("livelihood_special_item", false),
        ("caliber_note", false),
    ])
}

fn treasury_payment_template_fields() -> Vec<ImportTemplateField> {
    treasury_payment_detail_minimum_fields()
}

fn voucher_entry_template_fields() -> Vec<ImportTemplateField> {
    voucher_entry_detail_minimum_fields()
}

fn import_batch_metadata_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("internal_sample_run_id", false),
        ("schema_version", false),
        ("field_mapping_version", false),
    ])
}

fn source_evidence_template_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("source_title", false),
        ("source_url", false),
        ("source_published_at", false),
        ("source_captured_at", false),
        ("source_page_number", false),
        ("source_section_title", false),
        ("source_locator_hash", false),
        ("source_raw_excerpt", false),
    ])
}

fn with_recommended_fields(
    mut fields: Vec<ImportTemplateField>,
    mut recommended: Vec<ImportTemplateField>,
) -> Vec<ImportTemplateField> {
    fields.append(&mut recommended);
    fields.extend(import_batch_metadata_fields());
    fields.extend(source_evidence_template_fields());
    fields
}

fn department_budget_indicator_minimum_fields() -> Vec<ImportTemplateField> {
    budget_execution_template_fields()
}

fn department_budget_indicator_recommended_fields() -> Vec<ImportTemplateField> {
    with_recommended_fields(
        department_budget_indicator_minimum_fields(),
        simple_template_fields(&[
            ("budget_unit_code", false),
            ("project_catalog_id", false),
            ("funding_source_name", false),
        ]),
    )
}

fn procurement_contract_minimum_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("project_name", true),
        ("purchaser_name", true),
        ("supplier_name", true),
        ("contract_no", true),
        ("contract_amount", true),
    ])
}

fn procurement_contract_recommended_fields() -> Vec<ImportTemplateField> {
    with_recommended_fields(
        procurement_contract_minimum_fields(),
        simple_template_fields(&[
            ("project_code", false),
            ("package_no", false),
            ("signed_at", false),
            ("settlement_basis", false),
            ("payment_trigger", false),
            ("payment_deadline", false),
        ]),
    )
}

fn treasury_payment_detail_minimum_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("payment_order_no", true),
        ("payee_name", true),
        ("amount", true),
        ("paid_at", true),
    ])
}

fn treasury_payment_detail_recommended_fields() -> Vec<ImportTemplateField> {
    with_recommended_fields(
        treasury_payment_detail_minimum_fields(),
        simple_template_fields(&[
            ("contract_no", false),
            ("treasury_voucher_no", false),
            ("budget_unit_name", false),
            ("budget_project_name", false),
            ("summary", false),
        ]),
    )
}

fn voucher_entry_detail_minimum_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("voucher_no", true),
        ("account_code", true),
        ("account_name", true),
        ("debit_amount", true),
        ("credit_amount", true),
    ])
}

fn voucher_entry_detail_recommended_fields() -> Vec<ImportTemplateField> {
    with_recommended_fields(
        voucher_entry_detail_minimum_fields(),
        simple_template_fields(&[
            ("voucher_date", false),
            ("summary", false),
            ("counterparty_name", false),
            ("payment_order_no", false),
        ]),
    )
}

fn rectification_ledger_minimum_fields() -> Vec<ImportTemplateField> {
    simple_template_fields(&[
        ("issue_source", true),
        ("issue_summary", true),
        ("rectification_unit_name", true),
        ("rectification_status", true),
    ])
}

fn rectification_ledger_recommended_fields() -> Vec<ImportTemplateField> {
    with_recommended_fields(
        rectification_ledger_minimum_fields(),
        simple_template_fields(&[
            ("project_name", false),
            ("finding_rule_code", false),
            ("risk_level", false),
            ("recommended_action", false),
            ("sla_due_at", false),
            ("review_conclusion", false),
        ]),
    )
}

pub fn internal_sample_template_definitions() -> Vec<InternalSampleTemplateDefinition> {
    vec![
        InternalSampleTemplateDefinition {
            template_kind: InternalSampleTemplateKind::DepartmentBudgetIndicator,
            label: InternalSampleTemplateKind::DepartmentBudgetIndicator
                .label()
                .to_string(),
            description: "部门预算指标模板".to_string(),
            task_kind: TaskKind::BudgetSummary,
            dataset_kind: Some(
                BudgetDatasetKind::DepartmentExecutionDetail
                    .as_str()
                    .to_string(),
            ),
            schema_version: "internal-sample-v1".to_string(),
            field_mapping_version: "field-map-v1".to_string(),
            minimum_fields: department_budget_indicator_minimum_fields(),
            recommended_fields: department_budget_indicator_recommended_fields(),
            linkage_role: "budget_indicator".to_string(),
        },
        InternalSampleTemplateDefinition {
            template_kind: InternalSampleTemplateKind::ProcurementContract,
            label: InternalSampleTemplateKind::ProcurementContract
                .label()
                .to_string(),
            description: "采购合同模板".to_string(),
            task_kind: TaskKind::ProcurementProject,
            dataset_kind: Some("procurement_contract".to_string()),
            schema_version: "internal-sample-v1".to_string(),
            field_mapping_version: "field-map-v1".to_string(),
            minimum_fields: procurement_contract_minimum_fields(),
            recommended_fields: procurement_contract_recommended_fields(),
            linkage_role: "contract".to_string(),
        },
        InternalSampleTemplateDefinition {
            template_kind: InternalSampleTemplateKind::TreasuryPaymentDetail,
            label: InternalSampleTemplateKind::TreasuryPaymentDetail
                .label()
                .to_string(),
            description: "国库支付明细模板".to_string(),
            task_kind: TaskKind::TreasuryPayment,
            dataset_kind: Some(
                TreasuryDatasetKind::TreasuryPaymentDetail
                    .as_str()
                    .to_string(),
            ),
            schema_version: "internal-sample-v1".to_string(),
            field_mapping_version: "field-map-v1".to_string(),
            minimum_fields: treasury_payment_detail_minimum_fields(),
            recommended_fields: treasury_payment_detail_recommended_fields(),
            linkage_role: "payment".to_string(),
        },
        InternalSampleTemplateDefinition {
            template_kind: InternalSampleTemplateKind::VoucherEntryDetail,
            label: InternalSampleTemplateKind::VoucherEntryDetail
                .label()
                .to_string(),
            description: "会计凭证分录模板".to_string(),
            task_kind: TaskKind::VoucherLedger,
            dataset_kind: Some(VoucherDatasetKind::VoucherEntryDetail.as_str().to_string()),
            schema_version: "internal-sample-v1".to_string(),
            field_mapping_version: "field-map-v1".to_string(),
            minimum_fields: voucher_entry_detail_minimum_fields(),
            recommended_fields: voucher_entry_detail_recommended_fields(),
            linkage_role: "voucher_entry".to_string(),
        },
        InternalSampleTemplateDefinition {
            template_kind: InternalSampleTemplateKind::RectificationLedger,
            label: InternalSampleTemplateKind::RectificationLedger
                .label()
                .to_string(),
            description: "问题整改台账模板".to_string(),
            task_kind: TaskKind::SupervisionCaseSeed,
            dataset_kind: Some("rectification_ledger".to_string()),
            schema_version: "internal-sample-v1".to_string(),
            field_mapping_version: "field-map-v1".to_string(),
            minimum_fields: rectification_ledger_minimum_fields(),
            recommended_fields: rectification_ledger_recommended_fields(),
            linkage_role: "rectification".to_string(),
        },
    ]
}

pub fn task_kind_definitions() -> Vec<TaskKindDefinition> {
    vec![
        TaskKindDefinition {
            task_kind: TaskKind::ProcurementProject,
            label: TaskKind::ProcurementProject.label().to_string(),
            description: "Procurement source import and evidence review".to_string(),
            enabled: true,
            supported_sources: vec![
                ImportSourceKind::File,
                ImportSourceKind::Batch,
                ImportSourceKind::Fetch,
                ImportSourceKind::Connector,
            ],
            availability_note: None,
            dataset_variants: Vec::new(),
            template_fields: procurement_template_fields(),
        },
        TaskKindDefinition {
            task_kind: TaskKind::VoucherLedger,
            label: TaskKind::VoucherLedger.label().to_string(),
            description: "Voucher and ledger import".to_string(),
            enabled: true,
            supported_sources: vec![
                ImportSourceKind::File,
                ImportSourceKind::Batch,
                ImportSourceKind::Connector,
            ],
            availability_note: None,
            dataset_variants: vec![
                DatasetVariantDefinition {
                    dataset_kind: VoucherDatasetKind::VoucherEntryDetail.as_str().to_string(),
                    label: VoucherDatasetKind::VoucherEntryDetail.label().to_string(),
                    description: "Voucher entry detail".to_string(),
                    template_fields: voucher_entry_template_fields(),
                },
                DatasetVariantDefinition {
                    dataset_kind: VoucherDatasetKind::GeneralLedgerExport.as_str().to_string(),
                    label: VoucherDatasetKind::GeneralLedgerExport.label().to_string(),
                    description: "General ledger export".to_string(),
                    template_fields: voucher_entry_template_fields(),
                },
            ],
            template_fields: voucher_entry_template_fields(),
        },
        TaskKindDefinition {
            task_kind: TaskKind::BudgetSummary,
            label: TaskKind::BudgetSummary.label().to_string(),
            description: "Budget and public fiscal import".to_string(),
            enabled: true,
            supported_sources: vec![
                ImportSourceKind::File,
                ImportSourceKind::Batch,
                ImportSourceKind::Connector,
            ],
            availability_note: None,
            dataset_variants: vec![
                DatasetVariantDefinition {
                    dataset_kind: BudgetDatasetKind::DepartmentExecutionDetail
                        .as_str()
                        .to_string(),
                    label: BudgetDatasetKind::DepartmentExecutionDetail
                        .label()
                        .to_string(),
                    description: "Department execution detail".to_string(),
                    template_fields: budget_execution_template_fields(),
                },
                DatasetVariantDefinition {
                    dataset_kind: BudgetDatasetKind::PublicFiscalSummary.as_str().to_string(),
                    label: BudgetDatasetKind::PublicFiscalSummary.label().to_string(),
                    description: "Public fiscal summary".to_string(),
                    template_fields: budget_public_summary_template_fields(),
                },
                DatasetVariantDefinition {
                    dataset_kind: BudgetDatasetKind::PublicStatisticalIndicator
                        .as_str()
                        .to_string(),
                    label: BudgetDatasetKind::PublicStatisticalIndicator
                        .label()
                        .to_string(),
                    description: "Public statistical indicator".to_string(),
                    template_fields: budget_public_statistical_indicator_template_fields(),
                },
                DatasetVariantDefinition {
                    dataset_kind: BudgetDatasetKind::InvestmentReviewSummary
                        .as_str()
                        .to_string(),
                    label: BudgetDatasetKind::InvestmentReviewSummary
                        .label()
                        .to_string(),
                    description: "Investment review summary".to_string(),
                    template_fields: budget_investment_review_template_fields(),
                },
                DatasetVariantDefinition {
                    dataset_kind: BudgetDatasetKind::TownshipFiscalExecutionSummary
                        .as_str()
                        .to_string(),
                    label: BudgetDatasetKind::TownshipFiscalExecutionSummary
                        .label()
                        .to_string(),
                    description: "Township fiscal execution summary".to_string(),
                    template_fields: budget_township_fiscal_template_fields(),
                },
            ],
            template_fields: budget_execution_template_fields(),
        },
        TaskKindDefinition {
            task_kind: TaskKind::TreasuryPayment,
            label: TaskKind::TreasuryPayment.label().to_string(),
            description: "Treasury payment import".to_string(),
            enabled: true,
            supported_sources: vec![
                ImportSourceKind::File,
                ImportSourceKind::Batch,
                ImportSourceKind::Connector,
            ],
            availability_note: None,
            dataset_variants: vec![
                DatasetVariantDefinition {
                    dataset_kind: TreasuryDatasetKind::TreasuryPaymentDetail
                        .as_str()
                        .to_string(),
                    label: TreasuryDatasetKind::TreasuryPaymentDetail
                        .label()
                        .to_string(),
                    description: "Treasury payment detail".to_string(),
                    template_fields: treasury_payment_template_fields(),
                },
                DatasetVariantDefinition {
                    dataset_kind: TreasuryDatasetKind::ElectronicPaymentVoucher
                        .as_str()
                        .to_string(),
                    label: TreasuryDatasetKind::ElectronicPaymentVoucher
                        .label()
                        .to_string(),
                    description: "Electronic payment voucher".to_string(),
                    template_fields: treasury_payment_template_fields(),
                },
            ],
            template_fields: treasury_payment_template_fields(),
        },
    ]
}

pub fn placeholder_detail(task_kind: TaskKind) -> TaskDetailPayload {
    match task_kind {
        TaskKind::VoucherLedger => TaskDetailPayload::VoucherLedger(VoucherLedgerTaskDetail {
            dataset_kind: VoucherDatasetKind::VoucherEntryDetail,
            entries: Vec::new(),
            suppliers: Vec::new(),
            funding_sources: Vec::new(),
            account_classifications: Vec::new(),
            source_documents: Vec::new(),
            quality_report: ImportQualityReport::default(),
            applicable_rule_sets: vec!["voucher_rules".to_string(), "chain_rules".to_string()],
            payment_linkage_summary: PaymentLinkageSummary::default(),
            ledger_linkage_summary: LedgerLinkageSummary::default(),
        }),
        TaskKind::BudgetSummary => TaskDetailPayload::BudgetSummary(BudgetSummaryTaskDetail {
            dataset_kind: BudgetDatasetKind::DepartmentExecutionDetail,
            rows_preview: Vec::new(),
            quality_report: ImportQualityReport::default(),
            applicable_rule_sets: vec!["budget_rules".to_string()],
            trend_points: Vec::new(),
            classification_breakdown: Vec::new(),
            variance_highlights: Vec::new(),
            linkage_summary: BudgetLinkageSummary::default(),
        }),
        TaskKind::ProcurementProject => {
            TaskDetailPayload::ProcurementProject(ProcurementTaskDetail {
                projects: Vec::new(),
                contracts: Vec::new(),
                budget_units: Vec::new(),
                budget_projects: Vec::new(),
                suppliers: Vec::new(),
                funding_sources: Vec::new(),
                account_classifications: Vec::new(),
                source_documents: Vec::new(),
                quality_report: ImportQualityReport::default(),
                applicable_rule_sets: vec!["procurement_rules".to_string()],
            })
        }
        TaskKind::TreasuryPayment => {
            TaskDetailPayload::TreasuryPayment(TreasuryPaymentTaskDetail {
                dataset_kind: TreasuryDatasetKind::TreasuryPaymentDetail,
                vouchers: Vec::new(),
                contracts: Vec::new(),
                suppliers: Vec::new(),
                funding_sources: Vec::new(),
                account_classifications: Vec::new(),
                source_documents: Vec::new(),
                quality_report: ImportQualityReport::default(),
                applicable_rule_sets: vec!["payment_rules".to_string(), "chain_rules".to_string()],
                contract_linkage_summary: ContractLinkageSummary::default(),
                payment_linkage_summary: PaymentLinkageSummary::default(),
                ledger_linkage_summary: LedgerLinkageSummary::default(),
            })
        }
        TaskKind::SupervisionCaseSeed => {
            unreachable!("supervision case seed does not use platform task detail")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_value_units_and_regions() {
        assert_eq!(ValueUnit::from_str("wan_yuan").unwrap(), ValueUnit::WanYuan);
        assert_eq!(ValueUnit::from_str("%").unwrap(), ValueUnit::Percent);
        let region = normalize_jiangsu_region("南通市海安市");
        assert_eq!(region.province, "江苏省");
        assert_eq!(region.city.as_deref(), Some("南通市"));
        assert_eq!(region.county.as_deref(), Some("海安市"));
        assert_eq!(region.normalized_region_code.as_deref(), Some("320685"));
    }

    #[test]
    fn task_definitions_include_round_seven_fields() {
        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        assert!(procurement
            .template_fields
            .iter()
            .any(|field| field.key == "payment_trigger"));
        let budget = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::BudgetSummary)
            .expect("budget definition");
        assert!(budget.dataset_variants.iter().any(|variant| {
            variant.dataset_kind == BudgetDatasetKind::TownshipFiscalExecutionSummary.as_str()
        }));
    }

    #[test]
    fn task_definitions_include_round_nine_fields() {
        assert_eq!(
            ProcurementAmountSemanticType::from_str("electronic_marketplace_unit_price").unwrap(),
            ProcurementAmountSemanticType::ElectronicMarketplaceUnitPrice
        );
        assert_eq!(
            ProcurementAmountSemanticType::from_str("electronic_marketplace_order_total").unwrap(),
            ProcurementAmountSemanticType::ElectronicMarketplaceOrderTotal
        );

        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        for key in [
            "source_region_scope",
            "central_unit_flag",
            "procurement_channel",
            "platform_order_no",
            "item_quantity",
            "unit_price_amount",
            "order_total_amount",
        ] {
            assert!(
                procurement
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing procurement template field {key}"
            );
        }

        let budget = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::BudgetSummary)
            .expect("budget definition");
        let public_summary = budget
            .dataset_variants
            .iter()
            .find(|variant| variant.dataset_kind == BudgetDatasetKind::PublicFiscalSummary.as_str())
            .expect("public summary variant");
        for key in [
            "department_final_account_table_type",
            "subject_code",
            "subject_name",
            "performance_indicator_name",
            "performance_indicator_value",
        ] {
            assert!(
                public_summary
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing budget template field {key}"
            );
        }
    }

    #[test]
    fn task_definitions_include_round_eleven_fields() {
        assert_eq!(
            ProcurementStage::from_str("pre_announcement").unwrap(),
            ProcurementStage::PreAnnouncement
        );
        assert_eq!(
            ProcurementStage::from_str("intention").unwrap(),
            ProcurementStage::PreAnnouncement
        );
        assert_eq!(
            ProcurementAmountSemanticType::from_str("centralized_batch_total").unwrap(),
            ProcurementAmountSemanticType::CentralizedBatchTotal
        );
        assert_eq!(
            ProcurementAmountSemanticType::from_str("centralized_batch_lot_amount").unwrap(),
            ProcurementAmountSemanticType::CentralizedBatchLotAmount
        );

        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        for key in [
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
            assert!(
                procurement
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing procurement template field {key}"
            );
        }

        let budget = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::BudgetSummary)
            .expect("budget definition");
        let public_summary = budget
            .dataset_variants
            .iter()
            .find(|variant| variant.dataset_kind == BudgetDatasetKind::PublicFiscalSummary.as_str())
            .expect("public summary variant");
        for key in [
            "required_budget_indicator_data",
            "required_performance_target_data",
            "required_project_performance_target_data",
            "required_quarterly_performance_monitoring_data",
            "required_payment_progress_data",
            "required_voucher_attachment_data",
        ] {
            assert!(
                public_summary
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing budget template field {key}"
            );
        }
    }

    #[test]
    fn task_definitions_include_round_thirteen_fields() {
        assert_eq!(
            AuditEvidenceLevel::from_str("audit_project_plan").unwrap(),
            AuditEvidenceLevel::AuditProjectPlan
        );
        assert_eq!(AuditEvidenceLevel::AuditProjectPlan.evidence_weight(), 30);

        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        for key in [
            "contract_performance_period",
            "service_period",
            "maintenance_period",
            "warranty_period",
            "acceptance_standard",
            "acceptance_result",
            "acceptance_result_locator",
            "government_purchase_service_flag",
            "joint_bid_allowed_flag",
            "sme_policy_requirement",
            "credit_financing_policy_flag",
            "procurement_policy_note",
        ] {
            assert!(
                procurement
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing procurement template field {key}"
            );
        }
    }

    #[test]
    fn source_evidence_and_task_definitions_include_round_nineteen_exception_fields() {
        let evidence: SourceEvidence = serde_json::from_str(
            r#"{
                "title":"complaint decision",
                "url":"https://example.gov.cn/r19.html",
                "legal_basis":"Government Procurement Law",
                "legal_basis_article":"Article 94",
                "decision_paragraph_index":7,
                "affected_package_no":"02",
                "handling_result_locator_hash":"handle-locator"
            }"#,
        )
        .expect("source evidence");

        assert_eq!(
            evidence.legal_basis.as_deref(),
            Some("Government Procurement Law")
        );
        assert_eq!(evidence.legal_basis_article.as_deref(), Some("Article 94"));
        assert_eq!(evidence.decision_paragraph_index, Some(7));
        assert_eq!(evidence.affected_package_no.as_deref(), Some("02"));
        assert_eq!(
            evidence.handling_result_locator_hash.as_deref(),
            Some("handle-locator")
        );
        assert!(evidence.has_locator());

        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        for key in [
            "procurement_exception_type",
            "complaint_decision_no",
            "complaint_issue_summary",
            "complaint_handling_result",
            "false_material_flag",
            "award_invalidated_flag",
            "rebid_required_flag",
            "correction_notice_flag",
            "supervision_penalty_subject",
            "affected_package_no",
        ] {
            assert!(
                procurement
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing procurement field {key}"
            );
        }
    }

    #[test]
    fn source_evidence_and_task_definitions_include_round_twenty_one_penalty_fields() {
        let evidence: SourceEvidence = serde_json::from_str(
            r#"{
                "title":"penalty decision",
                "url":"https://example.gov.cn/r21.html",
                "penalty_basis":"Government Procurement Law",
                "penalty_decision_paragraph_index":12,
                "credit_record_locator_hash":"credit-locator",
                "market_restriction_locator_hash":"market-locator"
            }"#,
        )
        .expect("source evidence");

        assert_eq!(
            evidence.penalty_basis.as_deref(),
            Some("Government Procurement Law")
        );
        assert_eq!(evidence.penalty_decision_paragraph_index, Some(12));
        assert_eq!(
            evidence.credit_record_locator_hash.as_deref(),
            Some("credit-locator")
        );
        assert_eq!(
            evidence.market_restriction_locator_hash.as_deref(),
            Some("market-locator")
        );
        assert!(evidence.has_locator());

        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        for key in [
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
        ] {
            assert!(
                procurement
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing procurement field {key}"
            );
        }
    }

    #[test]
    fn task_definitions_include_round_twenty_three_complaint_adjudication_fields() {
        let definitions = task_kind_definitions();
        let procurement = definitions
            .iter()
            .find(|definition| definition.task_kind == TaskKind::ProcurementProject)
            .expect("procurement definition");
        for key in [
            "allegation_type",
            "allegation_outcome",
            "confirmed_fact_flag",
            "remedy_action",
            "remedy_required_flag",
            "allegation_evidence_weight",
            "allegation_weight_reason",
        ] {
            assert!(
                procurement
                    .template_fields
                    .iter()
                    .any(|field| field.key == key),
                "missing procurement field {key}"
            );
        }
    }
}
