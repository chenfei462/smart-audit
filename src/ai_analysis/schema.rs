use crate::models::{AuditReport, FindingRiskLevel};
use crate::platform::ExceptionCase;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiDecisionRequest {
    pub task_id: String,
    pub summary: AiDecisionSummary,
    pub findings: Vec<AiFindingContext>,
    pub cases: Vec<AiCaseContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiDecisionSummary {
    pub total_transactions: usize,
    pub total_findings: usize,
    pub highest_risk_level: String,
    pub high_risk_amount: String,
    pub anomalous_transaction_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiFindingContext {
    pub finding_id: String,
    pub rule_code: String,
    pub rule_name: String,
    pub rule_category: String,
    pub risk_level: String,
    pub evidence_summary: String,
    pub audit_rationale: String,
    pub recommended_action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiCaseContext {
    pub case_id: String,
    pub case_no: String,
    pub exception_id: String,
    pub rule_domain: String,
    pub risk_level: String,
    pub priority: String,
    pub case_status: String,
    pub current_stage: String,
    pub exception_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiDecisionResponse {
    pub task_id: String,
    pub finding_classifications: Vec<AiFindingClassification>,
    pub case_classifications: Vec<AiCaseClassification>,
    pub trend_forecasts: Vec<AiTrendForecast>,
    pub report_draft: AiReportDraft,
    pub model_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiFindingClassification {
    pub finding_id: String,
    pub suggested_category: String,
    pub suggested_disposition_priority: String,
    pub suggested_disposition_outcome: String,
    pub confidence: u8,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiCaseClassification {
    pub case_id: String,
    pub suggested_priority: String,
    pub suggested_stage: String,
    pub suggested_disposition_outcome: String,
    pub confidence: u8,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiTrendForecast {
    pub scope: String,
    pub metric: String,
    pub direction: String,
    pub confidence: u8,
    pub basis: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiReportDraft {
    pub title: String,
    pub markdown: String,
    pub disclaimer: String,
}

pub fn build_decision_request(
    task_id: &str,
    report: &AuditReport,
    cases: &[ExceptionCase],
) -> AiDecisionRequest {
    AiDecisionRequest {
        task_id: task_id.to_string(),
        summary: AiDecisionSummary {
            total_transactions: report.total_transactions,
            total_findings: report.findings.len(),
            highest_risk_level: report.highest_risk_level().to_string(),
            high_risk_amount: report.summary_metrics.high_risk_amount.clone(),
            anomalous_transaction_count: report.summary_metrics.anomalous_transaction_count,
        },
        findings: report
            .findings
            .iter()
            .enumerate()
            .take(80)
            .map(|(index, finding)| AiFindingContext {
                finding_id: finding.rule_code.clone().if_empty(format!("finding-{}", index + 1)),
                rule_code: finding.rule_code.clone(),
                rule_name: finding.rule_name.clone(),
                rule_category: finding.rule_category.clone(),
                risk_level: finding.risk_level.to_string(),
                evidence_summary: truncate(&finding.evidence_summary, 500),
                audit_rationale: truncate(&finding.audit_rationale, 500),
                recommended_action: truncate(&finding.recommended_action, 500),
            })
            .collect(),
        cases: cases
            .iter()
            .take(80)
            .map(|case| AiCaseContext {
                case_id: case.id.clone(),
                case_no: case.case_no.clone(),
                exception_id: case.exception_id.clone(),
                rule_domain: case.rule_domain.clone(),
                risk_level: case.risk_level.clone(),
                priority: case.priority.clone(),
                case_status: case.case_status.clone(),
                current_stage: case.current_stage.clone(),
                exception_summary: truncate(&case.exception_summary, 500),
            })
            .collect(),
    }
}

pub fn build_decision_prompt(request: &AiDecisionRequest) -> String {
    format!(
        "请基于财政监督审计数据生成 JSON，不要输出 Markdown 包裹。JSON 字段必须包含 task_id、finding_classifications、case_classifications、trend_forecasts、report_draft、model_notes。AI 仅作为辅助建议，不得改变规则结论。\n\n{}",
        serde_json::to_string_pretty(request).unwrap_or_else(|_| "{}".to_string())
    )
}

pub fn validate_decision_response(response: &AiDecisionResponse) -> Result<()> {
    if response.task_id.trim().is_empty() {
        anyhow::bail!("AI decision task_id is required");
    }
    if response.report_draft.markdown.trim().is_empty() {
        anyhow::bail!("AI report draft markdown is required");
    }
    for item in &response.finding_classifications {
        validate_confidence(item.confidence)
            .with_context(|| format!("invalid confidence for finding {}", item.finding_id))?;
        if item.finding_id.trim().is_empty() {
            anyhow::bail!("AI finding classification missing finding_id");
        }
    }
    for item in &response.case_classifications {
        validate_confidence(item.confidence)
            .with_context(|| format!("invalid confidence for case {}", item.case_id))?;
        if item.case_id.trim().is_empty() {
            anyhow::bail!("AI case classification missing case_id");
        }
    }
    for item in &response.trend_forecasts {
        validate_confidence(item.confidence)
            .with_context(|| format!("invalid confidence for trend {}", item.metric))?;
    }
    Ok(())
}

pub fn parse_decision_response(raw: &str) -> Result<AiDecisionResponse> {
    let clean = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let response = serde_json::from_str::<AiDecisionResponse>(clean)
        .context("AI 返回的结构化 JSON 格式不正确")?;
    validate_decision_response(&response)?;
    Ok(response)
}

fn validate_confidence(value: u8) -> Result<()> {
    if value > 100 {
        anyhow::bail!("confidence must be between 0 and 100");
    }
    Ok(())
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

trait EmptyStringFallback {
    fn if_empty(self, fallback: String) -> String;
}

impl EmptyStringFallback for String {
    fn if_empty(self, fallback: String) -> String {
        if self.trim().is_empty() {
            fallback
        } else {
            self
        }
    }
}

pub fn priority_for_risk(risk_level: &str) -> String {
    match risk_level {
        "Critical" => "P0".to_string(),
        "High" => "P1".to_string(),
        "Medium" => "P2".to_string(),
        _ => "P3".to_string(),
    }
}

pub fn outcome_for_category(rule_category: &str) -> String {
    let normalized = rule_category.to_ascii_lowercase();
    if normalized.contains("chain") || rule_category.contains("勾稽") {
        "supplement_chain_evidence".to_string()
    } else if normalized.contains("budget") || rule_category.contains("预算") {
        "review_budget_execution".to_string()
    } else if normalized.contains("procurement") || rule_category.contains("采购") {
        "review_procurement_compliance".to_string()
    } else {
        "manual_review_required".to_string()
    }
}

pub fn forecast_direction_for_level(level: FindingRiskLevel) -> &'static str {
    match level {
        FindingRiskLevel::Critical | FindingRiskLevel::High => "up",
        FindingRiskLevel::Medium => "stable",
        FindingRiskLevel::Low => "down",
    }
}
