use super::schema::{build_decision_prompt, parse_decision_response, AiDecisionRequest, AiDecisionResponse};
use super::{AiAdapterKind, AiConfig, ChatMessage, ChatRequest, ChatResponse};
use anyhow::{Context, Result};

pub async fn call_decision_model(
    request: &AiDecisionRequest,
    config: &AiConfig,
) -> Result<AiDecisionResponse> {
    match config.adapter_kind {
        AiAdapterKind::OpenAiCompatible => call_openai_compatible(request, config).await,
        AiAdapterKind::CustomGateway => call_custom_gateway(request, config).await,
    }
}

async fn call_openai_compatible(
    request: &AiDecisionRequest,
    config: &AiConfig,
) -> Result<AiDecisionResponse> {
    let body = ChatRequest {
        model: config.effective_model(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "你是财政监督和政府审计场景的资深分析师。只返回符合要求的 JSON。"
                    .to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: build_decision_prompt(request),
            },
        ],
        temperature: 0.2,
        max_tokens: 2400,
    };

    let response = reqwest::Client::new()
        .post(config.effective_api_url())
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&body)
        .send()
        .await
        .context("AI API 请求失败")?;

    let chat_response: ChatResponse = response.json().await.context("解析 AI 响应失败")?;
    if let Some(error) = chat_response.error {
        anyhow::bail!("AI API 错误: {}", error.message);
    }
    let content = chat_response
        .choices
        .and_then(|choices| choices.into_iter().next())
        .map(|choice| choice.message.content)
        .context("AI 未返回有效响应")?;
    parse_decision_response(&content)
}

async fn call_custom_gateway(
    request: &AiDecisionRequest,
    config: &AiConfig,
) -> Result<AiDecisionResponse> {
    let body = serde_json::json!({
        "model": config.effective_model(),
        "task": "audit_decision_support",
        "input": request,
        "response_format": "auditlens_ai_decision_v1"
    });
    let response = reqwest::Client::new()
        .post(config.effective_api_url())
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&body)
        .send()
        .await
        .context("AI custom gateway 请求失败")?;
    let value = response
        .json::<serde_json::Value>()
        .await
        .context("解析 AI custom gateway 响应失败")?;
    let payload = value.get("result").cloned().unwrap_or(value);
    let decision = serde_json::from_value::<AiDecisionResponse>(payload)
        .context("AI custom gateway 返回结构不正确")?;
    super::schema::validate_decision_response(&decision)?;
    Ok(decision)
}
