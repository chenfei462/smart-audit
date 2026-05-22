use crate::platform::{ArtifactStructuredSummary, AudioArtifactSummary, ImageArtifactSummary};
use anyhow::{Context, Result};
use regex::Regex;
use reqwest::multipart::{Form, Part};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct MultimodalConfig {
    pub provider: String,
    pub ocr_enabled: bool,
    pub speech_enabled: bool,
    pub ocr_api_url: String,
    pub speech_api_url: String,
    pub ocr_model: String,
    pub speech_model: String,
    pub ocr_api_key: String,
    pub speech_api_key: String,
}

#[derive(Debug, Clone)]
pub struct RecognitionResult {
    pub transcript_text: String,
    pub structured_summary: ArtifactStructuredSummary,
}

pub async fn recognize_image(
    file_name: &str,
    mime_type: &str,
    file_bytes: &[u8],
    config: &MultimodalConfig,
) -> Result<RecognitionResult> {
    if !config.ocr_enabled {
        anyhow::bail!("OCR is disabled by deployment policy");
    }
    if config.ocr_api_url.trim().is_empty() {
        anyhow::bail!("OCR endpoint is not configured");
    }
    let prompt = "请提取票据或凭证中的关键信息，输出原始识别文本。";
    let transcript_text = call_recognition_endpoint(
        &config.ocr_api_url,
        &config.ocr_api_key,
        &config.ocr_model,
        &config.provider,
        "ocr",
        file_name,
        mime_type,
        file_bytes,
        prompt,
    )
    .await?;

    Ok(RecognitionResult {
        transcript_text: transcript_text.clone(),
        structured_summary: ArtifactStructuredSummary::Image {
            data: build_image_summary(&transcript_text),
        },
    })
}

pub async fn recognize_audio(
    file_name: &str,
    mime_type: &str,
    file_bytes: &[u8],
    config: &MultimodalConfig,
) -> Result<RecognitionResult> {
    if !config.speech_enabled {
        anyhow::bail!("speech recognition is disabled by deployment policy");
    }
    if config.speech_api_url.trim().is_empty() {
        anyhow::bail!("speech recognition endpoint is not configured");
    }
    let prompt = "请将录音内容转写为中文文本。";
    let transcript_text = call_recognition_endpoint(
        &config.speech_api_url,
        &config.speech_api_key,
        &config.speech_model,
        &config.provider,
        "speech",
        file_name,
        mime_type,
        file_bytes,
        prompt,
    )
    .await?;

    Ok(RecognitionResult {
        transcript_text: transcript_text.clone(),
        structured_summary: ArtifactStructuredSummary::Audio {
            data: build_audio_summary(&transcript_text),
        },
    })
}

async fn call_recognition_endpoint(
    endpoint: &str,
    api_key: &str,
    model: &str,
    provider: &str,
    mode: &str,
    file_name: &str,
    mime_type: &str,
    file_bytes: &[u8],
    prompt: &str,
) -> Result<String> {
    let file_part = Part::bytes(file_bytes.to_vec())
        .file_name(file_name.to_string())
        .mime_str(mime_type)
        .context("failed to build multipart file part")?;

    let form = Form::new()
        .text("provider", provider.to_string())
        .text("mode", mode.to_string())
        .text("model", model.to_string())
        .text("prompt", prompt.to_string())
        .part("file", file_part);

    let client = reqwest::Client::new();
    let request = client.post(endpoint).multipart(form);
    let request = if api_key.trim().is_empty() {
        request
    } else {
        request.bearer_auth(api_key)
    };
    let response = request
        .send()
        .await
        .with_context(|| format!("failed to call {} endpoint", mode))?;
    let response = response
        .error_for_status()
        .with_context(|| format!("{} endpoint returned non-success status", mode))?;
    let response_json: Value = response
        .json()
        .await
        .with_context(|| format!("failed to parse {} endpoint response", mode))?;

    extract_transcript_text(&response_json)
        .with_context(|| format!("{} endpoint did not return transcript text", mode))
}

fn extract_transcript_text(value: &Value) -> Result<String> {
    let candidates = [
        value.get("transcript_text"),
        value.get("text"),
        value.get("transcript"),
        value.get("result").and_then(|item| item.get("text")),
        value.get("data").and_then(|item| item.get("text")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if let Some(text) = candidate.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    anyhow::bail!("missing transcript text")
}

fn build_image_summary(transcript_text: &str) -> ImageArtifactSummary {
    let date_regex =
        Regex::new(r"(20\d{2}[年/\-\.]\d{1,2}[月/\-\.]\d{1,2}日?)").expect("valid date regex");
    let amount_regex = Regex::new(r"(?:¥|￥|金额[:：]?\s*)([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)")
        .expect("valid amount regex");
    let number_regex = Regex::new(r"(?:票据号|凭证号|发票号码|单据号)[:：]?\s*([A-Za-z0-9\-]+)")
        .expect("valid number regex");
    let counterparty_regex =
        Regex::new(r"(?:收款单位|付款单位|销售方|购买方|对方单位)[:：]?\s*([^\n\r]{2,40})")
            .expect("valid counterparty regex");

    let document_type = if transcript_text.contains("财政票据") {
        Some("财政票据".to_string())
    } else if transcript_text.contains("发票") {
        Some("发票".to_string())
    } else if transcript_text.contains("收据") {
        Some("收据".to_string())
    } else if transcript_text.contains("凭证") {
        Some("会计凭证".to_string())
    } else if transcript_text.contains("回单") {
        Some("银行回单".to_string())
    } else {
        None
    };

    let keywords = collect_keywords(
        transcript_text,
        &[
            "专项资金",
            "预算",
            "拨付",
            "审批",
            "财政",
            "支付",
            "凭证",
            "票据",
        ],
    );
    let business_summary = transcript_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(2)
        .collect::<Vec<_>>()
        .join(" / ");

    ImageArtifactSummary {
        document_type,
        document_date: date_regex
            .captures(transcript_text)
            .and_then(|captures| captures.get(1).map(|item| item.as_str().to_string())),
        amount: amount_regex
            .captures(transcript_text)
            .and_then(|captures| captures.get(1).map(|item| item.as_str().to_string())),
        document_number: number_regex
            .captures(transcript_text)
            .and_then(|captures| captures.get(1).map(|item| item.as_str().to_string())),
        counterparty: counterparty_regex
            .captures(transcript_text)
            .and_then(|captures| captures.get(1).map(|item| item.as_str().trim().to_string())),
        business_summary: if business_summary.is_empty() {
            None
        } else {
            Some(business_summary)
        },
        keywords,
        reviewer_note: None,
    }
}

fn build_audio_summary(transcript_text: &str) -> AudioArtifactSummary {
    let keywords = collect_keywords(
        transcript_text,
        &[
            "专项资金",
            "预算指标",
            "支付审批",
            "年末",
            "拨付",
            "资金用途",
            "预算",
            "审批",
        ],
    );
    let time_range_regex =
        Regex::new(r"(\d{1,2}:\d{2}(?::\d{2})?)").expect("valid time range regex");
    let times = time_range_regex
        .captures_iter(transcript_text)
        .filter_map(|captures| captures.get(1).map(|item| item.as_str().to_string()))
        .collect::<Vec<_>>();
    let time_range = if times.len() >= 2 {
        Some(format!(
            "{} - {}",
            times.first().unwrap(),
            times.last().unwrap()
        ))
    } else {
        None
    };
    let summary = transcript_text
        .split(['。', '\n'])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(2)
        .collect::<Vec<_>>()
        .join("；");

    AudioArtifactSummary {
        summary: if summary.is_empty() {
            None
        } else {
            Some(summary)
        },
        keywords: keywords.clone(),
        time_range,
        reviewer_note: None,
        mentions_budget: transcript_text.contains("预算"),
        mentions_payment: transcript_text.contains("支付"),
        mentions_approval: transcript_text.contains("审批"),
        mentions_funds: transcript_text.contains("资金") || transcript_text.contains("拨付"),
        needs_manual_review: keywords.is_empty() || transcript_text.chars().count() < 20,
    }
}

fn collect_keywords(text: &str, candidates: &[&str]) -> Vec<String> {
    candidates
        .iter()
        .filter(|candidate| text.contains(**candidate))
        .map(|candidate| candidate.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_image_summary() {
        let summary = build_image_summary(
            "财政票据\n日期：2026-03-30\n金额：￥12,345.67\n凭证号：PZ-001\n收款单位：测试单位\n专项资金拨付",
        );
        assert_eq!(summary.document_type.as_deref(), Some("财政票据"));
        assert_eq!(summary.document_number.as_deref(), Some("PZ-001"));
        assert!(summary.keywords.iter().any(|item| item == "专项资金"));
    }

    #[test]
    fn builds_audio_summary() {
        let summary = build_audio_summary(
            "00:00:01 这笔专项资金已经完成预算指标审批。00:00:08 付款在年末集中拨付。",
        );
        assert!(summary.mentions_budget);
        assert!(summary.mentions_approval);
        assert!(summary.mentions_funds);
        assert!(summary.keywords.iter().any(|item| item == "年末"));
    }
}
