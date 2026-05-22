use crate::models::AuditReport;
use crate::platform::ExceptionCase;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

pub mod provider;
pub mod schema;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiAdapterKind {
    OpenAiCompatible,
    CustomGateway,
}

impl Default for AiAdapterKind {
    fn default() -> Self {
        Self::OpenAiCompatible
    }
}

impl AiAdapterKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai_compatible",
            Self::CustomGateway => "custom_gateway",
        }
    }
}

impl std::str::FromStr for AiAdapterKind {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value {
            "openai_compatible" | "openai-compatible" | "openai" => Ok(Self::OpenAiCompatible),
            "custom_gateway" | "custom-gateway" | "custom" => Ok(Self::CustomGateway),
            other => Err(format!("unsupported AI adapter kind {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: String,
    pub adapter_kind: AiAdapterKind,
    pub api_url: String,
    pub api_key: String,
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: "local".to_string(),
            adapter_kind: AiAdapterKind::OpenAiCompatible,
            api_url: "http://127.0.0.1:8000/v1/chat/completions".to_string(),
            api_key: String::new(),
            model: "qwen-government".to_string(),
        }
    }
}

impl AiConfig {
    pub fn effective_model(&self) -> String {
        if self.model.trim().is_empty() {
            if self.provider == "qwen" || self.provider == "local" {
                "qwen-government".to_string()
            } else {
                "auditlens-local".to_string()
            }
        } else {
            self.model.clone()
        }
    }

    pub fn effective_api_url(&self) -> &str {
        if self.api_url.trim().is_empty() {
            "http://127.0.0.1:8000/v1/chat/completions"
        } else {
            &self.api_url
        }
    }

    pub fn enabled_without_secret(&self) -> bool {
        self.provider == "local" && self.api_key.trim().is_empty()
    }
}

#[derive(Serialize)]
pub(crate) struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
pub(crate) struct ChatResponse {
    pub choices: Option<Vec<ChatChoice>>,
    pub error: Option<ApiError>,
}

#[derive(Deserialize)]
pub(crate) struct ChatChoice {
    pub message: ChatMessage,
}

#[derive(Deserialize)]
pub(crate) struct ApiError {
    pub message: String,
}

fn build_audit_prompt(report: &AuditReport) -> String {
    let findings_text = report
        .findings
        .iter()
        .take(20)
        .enumerate()
        .map(|(index, finding)| {
            format!(
                "{}. {} / {} / {}\n证据：{}\n依据：{}\n建议：{}\n",
                index + 1,
                finding.rule_name,
                finding.rule_category,
                finding.risk_level,
                finding.evidence_summary,
                finding.audit_rationale,
                finding.recommended_action
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "你是一名财政监督审计专家。请基于以下审计结果，用中文输出结构化分析，内容包括：整体风险判断、重点问题、审计依据、整改优先级、后续核查建议。\n\n审计时间：{}\n交易总数：{}\n高风险金额：{}\n异常交易笔数：{}\n总体风险等级：{}\n\n重点问题：\n{}",
        report.audit_time,
        report.total_transactions,
        report.summary_metrics.high_risk_amount,
        report.summary_metrics.anomalous_transaction_count,
        report.highest_risk_level(),
        findings_text
    )
}

pub async fn analyze_with_ai(report: &AuditReport, config: &AiConfig) -> Result<String> {
    if config.api_key.trim().is_empty() {
        return Ok(generate_local_analysis(report));
    }

    let request = ChatRequest {
        model: config.model.clone(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "你是财政监督和政府审计场景的资深分析师，输出应专业、谨慎、可执行。"
                    .to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: build_audit_prompt(report),
            },
        ],
        temperature: 0.2,
        max_tokens: 1800,
    };

    let response = reqwest::Client::new()
        .post(&config.api_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request)
        .send()
        .await
        .context("AI API 请求失败")?;

    let chat_response: ChatResponse = response.json().await.context("解析 AI 响应失败")?;
    if let Some(error) = chat_response.error {
        anyhow::bail!("AI API 错误: {}", error.message);
    }
    if let Some(choices) = chat_response.choices {
        if let Some(choice) = choices.first() {
            return Ok(choice.message.content.clone());
        }
    }

    anyhow::bail!("AI 未返回有效响应")
}

pub async fn generate_decision_with_ai(
    task_id: &str,
    report: &AuditReport,
    cases: &[ExceptionCase],
    config: &AiConfig,
) -> (schema::AiDecisionResponse, Option<String>) {
    if config.api_key.trim().is_empty() {
        return (generate_local_decision(task_id, report, cases), None);
    }
    let request = schema::build_decision_request(task_id, report, cases);
    match provider::call_decision_model(&request, config).await {
        Ok(decision) => (decision, None),
        Err(error) => (
            generate_local_decision(task_id, report, cases),
            Some(error.to_string()),
        ),
    }
}

pub fn generate_local_decision(
    task_id: &str,
    report: &AuditReport,
    cases: &[ExceptionCase],
) -> schema::AiDecisionResponse {
    let request = schema::build_decision_request(task_id, report, cases);
    let finding_classifications = request
        .findings
        .iter()
        .map(|finding| schema::AiFindingClassification {
            finding_id: finding.finding_id.clone(),
            suggested_category: finding.rule_category.clone(),
            suggested_disposition_priority: schema::priority_for_risk(&finding.risk_level),
            suggested_disposition_outcome: schema::outcome_for_category(&finding.rule_category),
            confidence: if finding.risk_level == "Critical" || finding.risk_level == "High" {
                82
            } else {
                68
            },
            rationale: format!(
                "基于规则 {}、风险等级 {} 和证据摘要生成辅助归类。",
                finding.rule_code, finding.risk_level
            ),
        })
        .collect::<Vec<_>>();

    let case_classifications = request
        .cases
        .iter()
        .map(|case| schema::AiCaseClassification {
            case_id: case.case_id.clone(),
            suggested_priority: case.priority.clone(),
            suggested_stage: if case.case_status == "closed" {
                case.current_stage.clone()
            } else {
                "Assigned".to_string()
            },
            suggested_disposition_outcome: schema::outcome_for_category(&case.rule_domain),
            confidence: 66,
            rationale: format!("基于案件 {} 当前阶段和规则域生成辅助建议。", case.case_no),
        })
        .collect::<Vec<_>>();

    let high_count = report
        .findings
        .iter()
        .filter(|finding| matches!(finding.risk_level.to_string().as_str(), "Critical" | "High"))
        .count();
    let direction = schema::forecast_direction_for_level(report.highest_risk_level());
    let mut trends = vec![schema::AiTrendForecast {
        scope: "finding_risk".to_string(),
        metric: "high_risk_finding_share".to_string(),
        direction: direction.to_string(),
        confidence: 70,
        basis: format!(
            "当前 {} 条发现中 {} 条为高风险或极高风险。",
            report.findings.len(),
            high_count
        ),
    }];
    if !cases.is_empty() {
        let open_cases = cases
            .iter()
            .filter(|case| case.case_status != "closed" && case.case_status != "archived")
            .count();
        trends.push(schema::AiTrendForecast {
            scope: "case_operations".to_string(),
            metric: "open_case_pressure".to_string(),
            direction: if open_cases > cases.len() / 2 { "up" } else { "stable" }.to_string(),
            confidence: 64,
            basis: format!("当前关联案件 {} 个，未结案 {} 个。", cases.len(), open_cases),
        });
    }

    let report_markdown = format!(
        "# AI 辅助报告草稿\n\n> 本草稿仅用于辅助解释和汇报准备，正式结论仍以规则审计、证据复核和人工意见为准。\n\n## 风险概览\n\n本任务共识别 {} 条规则发现，最高风险等级为 {}。\n\n## 重点归类\n\n{}\n\n## 后续建议\n\n优先处理 P0/P1 建议项，补充预算、采购、支付和凭证链路证据，并保留人工复核意见。",
        report.findings.len(),
        report.highest_risk_level(),
        finding_classifications
            .iter()
            .take(8)
            .map(|item| format!(
                "- {} / {} / {}",
                item.finding_id, item.suggested_disposition_priority, item.suggested_disposition_outcome
            ))
            .collect::<Vec<_>>()
            .join("\n")
    );

    schema::AiDecisionResponse {
        task_id: task_id.to_string(),
        finding_classifications,
        case_classifications,
        trend_forecasts: trends,
        report_draft: schema::AiReportDraft {
            title: "AI 辅助报告草稿".to_string(),
            markdown: report_markdown,
            disclaimer: "AI output is advisory only. Rule findings remain the system of record."
                .to_string(),
        },
        model_notes: "local deterministic advisory generator".to_string(),
    }
}

pub fn generate_local_analysis(report: &AuditReport) -> String {
    let risk_level = report.highest_risk_level();
    let risk_label = match risk_level.to_string().as_str() {
        "Critical" => "极高",
        "High" => "高",
        "Medium" => "中",
        _ => "低",
    };

    let top_categories = if report.summary_metrics.key_category_distribution.is_empty() {
        "当前样本未形成明确类别分布。".to_string()
    } else {
        report
            .summary_metrics
            .key_category_distribution
            .iter()
            .map(|item| format!("{} {}项", item.category, item.count))
            .collect::<Vec<_>>()
            .join("；")
    };

    let urgent_actions = if report.summary_metrics.remediation_priorities.is_empty() {
        "建议先核查高风险财政支出与账务勾稽异常。".to_string()
    } else {
        report.summary_metrics.remediation_priorities.join("；")
    };

    let critical_findings = report
        .findings
        .iter()
        .filter(|finding| {
            finding.risk_level.to_string() == "High" || finding.risk_level.to_string() == "Critical"
        })
        .take(5)
        .map(|finding| format!("- {}：{}", finding.rule_name, finding.evidence_summary))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "# 财政监督审计分析摘要\n\n## 1. 整体风险判断\n\n总体风险等级：**{}**。本次共审阅{}笔交易，识别异常交易{}笔，高风险金额{}。\n\n## 2. 重点风险类别\n\n{}\n\n## 3. 重点问题\n\n{}\n\n## 4. 审计判断依据\n\n当前结论以规则审计为主，重点围绕预算执行偏离、资金流向异常、支付时点异常、重复与拆分支付、往来与挂账异常进行判断。\n\n## 5. 整改优先级\n\n{}\n\n## 6. 后续核查建议\n\n建议优先抽查专项资金大额支付、年末集中列支、疑似重复支付和账务勾稽异常对应的原始凭证、审批链路与预算指标。",
        risk_label,
        report.total_transactions,
        report.summary_metrics.anomalous_transaction_count,
        report.summary_metrics.high_risk_amount,
        top_categories,
        if critical_findings.is_empty() { "- 当前未形成需重点列示的问题。".to_string() } else { critical_findings },
        urgent_actions,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuditFinding, AuditReport, FindingMetadata, FindingRiskLevel, Severity};
    use rust_decimal_macros::dec;

    #[test]
    fn test_local_analysis() {
        let mut report = AuditReport::new(100, dec!(500000), dec!(495000));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-001",
                rule_name: "凭证借贷失衡",
                rule_category: "预算执行偏离",
                risk_level: FindingRiskLevel::High,
                severity: Severity::Error,
                legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                audit_rationale: "借贷不平衡会影响预算执行真实性。",
                recommended_action: "核对分录与原始凭证。",
            },
            "凭证 FY-001 借贷不平。",
            vec![1],
        ));
        report.refresh_summary_metrics(&[]);

        let analysis = generate_local_analysis(&report);
        assert!(analysis.contains("整体风险判断"));
        assert!(analysis.contains("重点问题"));
        assert!(analysis.contains("整改优先级"));
    }
}
