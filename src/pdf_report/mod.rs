use crate::models::{AuditFinding, AuditReport};
use crate::platform::{ImportQualityReport, QualitySeverity};
use anyhow::{Context, Result};
use printpdf::*;
use std::collections::BTreeMap;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct PdfBranding {
    pub institution_name: String,
    pub cover_title: String,
    pub watermark: String,
    pub classification: String,
}

impl Default for PdfBranding {
    fn default() -> Self {
        Self {
            institution_name: "AuditLens 财政监督工作台".to_string(),
            cover_title: "财政监督审计报告".to_string(),
            watermark: "CONFIDENTIAL".to_string(),
            classification: "财政监督内部使用".to_string(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PdfRiskCounts {
    pub critical: usize,
    pub high: usize,
    pub medium: usize,
    pub low: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PdfChartValue {
    pub label: String,
    pub value: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PdfChartSummary {
    pub risk_counts: PdfRiskCounts,
    pub rule_categories: Vec<PdfChartValue>,
    pub quality_checks: Vec<PdfChartValue>,
}

impl PdfChartSummary {
    pub fn from_report(report: &AuditReport) -> Self {
        Self::from_report_with_quality(report, None)
    }

    pub fn from_report_with_quality(
        report: &AuditReport,
        quality_report: Option<&ImportQualityReport>,
    ) -> Self {
        let mut risk_counts = PdfRiskCounts::default();
        let mut categories = BTreeMap::<String, usize>::new();

        for finding in &report.findings {
            match finding.risk_level.as_str() {
                "Critical" => risk_counts.critical += 1,
                "High" => risk_counts.high += 1,
                "Medium" => risk_counts.medium += 1,
                _ => risk_counts.low += 1,
            }
            *categories.entry(finding.rule_category.clone()).or_insert(0) += 1;
        }

        let mut rule_categories: Vec<PdfChartValue> = categories
            .into_iter()
            .map(|(label, value)| PdfChartValue { label, value })
            .collect();
        rule_categories.sort_by(|left, right| {
            right
                .value
                .cmp(&left.value)
                .then_with(|| left.label.cmp(&right.label))
        });

        let mut quality_counts = [0usize; 3];
        if let Some(quality_report) = quality_report {
            for check in &quality_report.checks {
                match check.severity {
                    QualitySeverity::Error => quality_counts[0] += 1,
                    QualitySeverity::Warning => quality_counts[1] += 1,
                    QualitySeverity::Info => quality_counts[2] += 1,
                }
            }
        }
        let quality_checks = [
            ("错误", quality_counts[0]),
            ("警告", quality_counts[1]),
            ("信息", quality_counts[2]),
        ]
        .into_iter()
        .filter(|(_, value)| *value > 0)
        .map(|(label, value)| PdfChartValue {
            label: label.to_string(),
            value,
        })
        .collect();

        Self {
            risk_counts,
            rule_categories,
            quality_checks,
        }
    }
}

pub struct PdfReportGenerator;

impl PdfReportGenerator {
    pub fn generate(report: &AuditReport, output_path: &Path) -> Result<()> {
        Self::generate_with_branding(report, output_path, &PdfBranding::default())
    }

    pub fn generate_with_branding(
        report: &AuditReport,
        output_path: &Path,
        branding: &PdfBranding,
    ) -> Result<()> {
        Self::generate_with_branding_and_quality(report, output_path, branding, None)
    }

    pub fn generate_with_branding_and_quality(
        report: &AuditReport,
        output_path: &Path,
        branding: &PdfBranding,
        quality_report: Option<&ImportQualityReport>,
    ) -> Result<()> {
        let (doc, page1, layer1) =
            PdfDocument::new(&branding.cover_title, Mm(210.0), Mm(297.0), "Page 1");
        let font = load_font(&doc, false)?;
        let font_bold = load_font(&doc, true)?;
        let mut active_layer = doc.get_page(page1).get_layer(layer1);
        let mut page_index = 1usize;
        let mut y = 278.0;

        write_line(
            &active_layer,
            &branding.cover_title,
            22.0,
            18.0,
            y,
            &font_bold,
        );
        y -= 11.0;
        write_line(
            &active_layer,
            &branding.institution_name,
            11.0,
            18.0,
            y,
            &font,
        );
        y -= 7.0;
        write_line(
            &active_layer,
            &format!(
                "密级：{}    水印：{}",
                branding.classification, branding.watermark
            ),
            10.0,
            18.0,
            y,
            &font,
        );
        y -= 14.0;

        write_section_title(&active_layer, "一、项目概况", &mut y, &font_bold);
        write_wrapped_line(
            &active_layer,
            &format!("审计时间：{}", report.audit_time),
            &mut y,
            &font,
            11.0,
            30.0,
            70,
        );
        write_wrapped_line(
            &active_layer,
            &format!(
                "交易总数：{}，借方总额：{}，贷方总额：{}",
                report.total_transactions, report.total_debit, report.total_credit
            ),
            &mut y,
            &font,
            11.0,
            30.0,
            70,
        );

        ensure_page(
            &doc,
            &mut active_layer,
            &font_bold,
            &branding.cover_title,
            &mut y,
            &mut page_index,
            48.0,
        )?;
        write_section_title(&active_layer, "二、数据范围说明", &mut y, &font_bold);
        write_wrapped_line(&active_layer, "本报告基于财政监督样例或受控导入数据生成，重点覆盖专项资金支出、集中支付、年末突击列支、重复支付等典型风险场景。", &mut y, &font, 11.0, 30.0, 70);
        write_wrapped_line(
            &active_layer,
            "异常交易笔数按触发重点财政监督规则的唯一交易行统计，不等同于最终审计认定数量。",
            &mut y,
            &font,
            11.0,
            30.0,
            70,
        );

        ensure_page(
            &doc,
            &mut active_layer,
            &font_bold,
            &branding.cover_title,
            &mut y,
            &mut page_index,
            60.0,
        )?;
        write_section_title(&active_layer, "三、风险结论摘要", &mut y, &font_bold);
        write_wrapped_line(
            &active_layer,
            &format!("总体风险等级：{}", report.highest_risk_level()),
            &mut y,
            &font,
            11.0,
            30.0,
            70,
        );
        write_wrapped_line(
            &active_layer,
            &format!(
                "高风险金额：{}；异常交易笔数：{}。",
                report.summary_metrics.high_risk_amount,
                report.summary_metrics.anomalous_transaction_count
            ),
            &mut y,
            &font,
            11.0,
            30.0,
            70,
        );
        let category_summary = if report.summary_metrics.key_category_distribution.is_empty() {
            "关键问题类别分布：当前样本未形成明确类别分布。".to_string()
        } else {
            format!(
                "关键问题类别分布：{}。",
                report
                    .summary_metrics
                    .key_category_distribution
                    .iter()
                    .map(|item| format!("{} {}项", item.category, item.count))
                    .collect::<Vec<_>>()
                    .join("；")
            )
        };
        write_wrapped_line(
            &active_layer,
            &category_summary,
            &mut y,
            &font,
            11.0,
            30.0,
            70,
        );
        if !report.summary_metrics.remediation_priorities.is_empty() {
            write_wrapped_line(
                &active_layer,
                &format!(
                    "整改优先级：{}。",
                    report.summary_metrics.remediation_priorities.join("；")
                ),
                &mut y,
                &font,
                11.0,
                30.0,
                70,
            );
        }

        ensure_page(
            &doc,
            &mut active_layer,
            &font_bold,
            &branding.cover_title,
            &mut y,
            &mut page_index,
            102.0,
        )?;
        write_section_title(&active_layer, "四、结果可视化摘要", &mut y, &font_bold);
        let chart_summary = PdfChartSummary::from_report_with_quality(report, quality_report);
        draw_visual_summary(&active_layer, &chart_summary, &mut y, &font, &font_bold);

        ensure_page(
            &doc,
            &mut active_layer,
            &font_bold,
            &branding.cover_title,
            &mut y,
            &mut page_index,
            88.0,
        )?;
        write_section_title(&active_layer, "五、重点问题明细", &mut y, &font_bold);
        for (index, finding) in report.findings.iter().enumerate() {
            ensure_page(
                &doc,
                &mut active_layer,
                &font_bold,
                &branding.cover_title,
                &mut y,
                &mut page_index,
                54.0,
            )?;
            write_wrapped_line(
                &active_layer,
                &format!(
                    "{}. {} / {} / {}",
                    index + 1,
                    finding.rule_name,
                    finding.rule_category,
                    finding.risk_level
                ),
                &mut y,
                &font_bold,
                11.0,
                30.0,
                70,
            );
            write_wrapped_line(
                &active_layer,
                &format!("规则编码：{}", finding.rule_code),
                &mut y,
                &font,
                10.5,
                34.0,
                68,
            );
            write_wrapped_line(
                &active_layer,
                &format!("证据摘要：{}", finding.evidence_summary),
                &mut y,
                &font,
                10.5,
                34.0,
                68,
            );
            let rows = if finding.related_rows.is_empty() {
                "-".to_string()
            } else {
                finding
                    .related_rows
                    .iter()
                    .map(|row| row.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            write_wrapped_line(
                &active_layer,
                &format!("涉及行：{}", rows),
                &mut y,
                &font,
                10.5,
                34.0,
                68,
            );
            y -= 2.0;
        }

        ensure_page(
            &doc,
            &mut active_layer,
            &font_bold,
            &branding.cover_title,
            &mut y,
            &mut page_index,
            72.0,
        )?;
        write_section_title(&active_layer, "六、审计判断依据", &mut y, &font_bold);
        for finding in &report.findings {
            ensure_page(
                &doc,
                &mut active_layer,
                &font_bold,
                &branding.cover_title,
                &mut y,
                &mut page_index,
                28.0,
            )?;
            write_wrapped_line(
                &active_layer,
                &format!("{}：{}", finding.rule_name, finding.audit_rationale),
                &mut y,
                &font,
                10.5,
                30.0,
                72,
            );
        }

        ensure_page(
            &doc,
            &mut active_layer,
            &font_bold,
            &branding.cover_title,
            &mut y,
            &mut page_index,
            72.0,
        )?;
        write_section_title(&active_layer, "七、整改建议", &mut y, &font_bold);
        for finding in unique_recommendations(&report.findings) {
            ensure_page(
                &doc,
                &mut active_layer,
                &font_bold,
                &branding.cover_title,
                &mut y,
                &mut page_index,
                28.0,
            )?;
            write_wrapped_line(&active_layer, &finding, &mut y, &font, 10.5, 30.0, 72);
        }

        let file = File::create(output_path)
            .with_context(|| format!("failed to create {}", output_path.display()))?;
        doc.save(&mut BufWriter::new(file))
            .context("failed to save generated PDF")?;
        Ok(())
    }
}

fn load_font(doc: &PdfDocumentReference, bold: bool) -> Result<IndirectFontRef> {
    let font_candidates: Vec<PathBuf> = if bold {
        vec![
            PathBuf::from("C:/Windows/Fonts/simsunb.ttf"),
            PathBuf::from("C:/Windows/Fonts/simhei.ttf"),
        ]
    } else {
        vec![
            PathBuf::from("C:/Windows/Fonts/simhei.ttf"),
            PathBuf::from("C:/Windows/Fonts/simsun.ttc"),
        ]
    };

    for candidate in font_candidates {
        if candidate.exists() {
            if let Ok(file) = File::open(&candidate) {
                if let Ok(font) = doc.add_external_font(file) {
                    return Ok(font);
                }
            }
        }
    }

    if bold {
        doc.add_builtin_font(BuiltinFont::HelveticaBold)
            .context("failed to load fallback bold font")
    } else {
        doc.add_builtin_font(BuiltinFont::Helvetica)
            .context("failed to load fallback font")
    }
}

fn draw_visual_summary(
    layer: &PdfLayerReference,
    summary: &PdfChartSummary,
    y: &mut f64,
    font: &IndirectFontRef,
    font_bold: &IndirectFontRef,
) {
    let risk_rows = vec![
        PdfChartValue {
            label: "极高".to_string(),
            value: summary.risk_counts.critical,
        },
        PdfChartValue {
            label: "高".to_string(),
            value: summary.risk_counts.high,
        },
        PdfChartValue {
            label: "中".to_string(),
            value: summary.risk_counts.medium,
        },
        PdfChartValue {
            label: "低".to_string(),
            value: summary.risk_counts.low,
        },
    ];

    write_line(layer, "规则风险分布", 11.0, 30.0, *y, font_bold);
    *y -= 8.0;
    draw_bar_group(layer, &risk_rows, 34.0, y, 112.0, font);

    *y -= 3.0;
    write_line(layer, "规则类别分布", 11.0, 30.0, *y, font_bold);
    *y -= 8.0;
    if summary.rule_categories.is_empty() {
        write_wrapped_line(layer, "暂无规则类别分布。", y, font, 10.0, 34.0, 68);
    } else {
        draw_bar_group(layer, &summary.rule_categories, 34.0, y, 112.0, font);
    }

    *y -= 3.0;
    write_line(layer, "导入质量检查", 11.0, 30.0, *y, font_bold);
    *y -= 8.0;
    if summary.quality_checks.is_empty() {
        write_wrapped_line(layer, "暂无导入质量问题。", y, font, 10.0, 34.0, 68);
    } else {
        draw_bar_group(layer, &summary.quality_checks, 34.0, y, 112.0, font);
    }
}

fn draw_bar_group(
    layer: &PdfLayerReference,
    values: &[PdfChartValue],
    x: f64,
    y: &mut f64,
    max_width: f64,
    font: &IndirectFontRef,
) {
    let max_value = values.iter().map(|item| item.value).max().unwrap_or(0);
    if max_value == 0 {
        write_wrapped_line(layer, "暂无可视化数据。", y, font, 10.0, x, 68);
        return;
    }

    for (index, item) in values.iter().take(6).enumerate() {
        let bar_width = max_width * item.value as f64 / max_value as f64;
        let row_y = *y - index as f64 * 7.2;
        write_line(
            layer,
            &format!("{} {}", item.label, item.value),
            9.5,
            x,
            row_y,
            font,
        );
        draw_bar_line(
            layer,
            x + 42.0,
            row_y + 1.8,
            max_width,
            2.4,
            (0.91, 0.94, 0.97),
        );
        draw_bar_line(
            layer,
            x + 42.0,
            row_y + 1.8,
            bar_width.max(2.0),
            2.4,
            chart_color(index),
        );
    }
    *y -= values.iter().take(6).count() as f64 * 7.2 + 2.0;
}

fn draw_bar_line(
    layer: &PdfLayerReference,
    x: f64,
    y: f64,
    width: f64,
    thickness: f64,
    color: (f64, f64, f64),
) {
    layer.set_outline_color(Color::Rgb(Rgb::new(
        color.0 as f32,
        color.1 as f32,
        color.2 as f32,
        None,
    )));
    layer.set_outline_thickness(thickness as f32);
    layer.add_line(Line {
        points: vec![
            (Point::new(Mm(x as f32), Mm(y as f32)), false),
            (Point::new(Mm((x + width) as f32), Mm(y as f32)), false),
        ],
        is_closed: false,
    });
}

fn chart_color(index: usize) -> (f64, f64, f64) {
    match index % 5 {
        0 => (0.16, 0.43, 0.70),
        1 => (0.78, 0.59, 0.25),
        2 => (0.18, 0.49, 0.36),
        3 => (0.75, 0.29, 0.24),
        _ => (0.31, 0.39, 0.49),
    }
}

fn ensure_page(
    doc: &PdfDocumentReference,
    active_layer: &mut PdfLayerReference,
    font_bold: &IndirectFontRef,
    title: &str,
    y: &mut f64,
    page_index: &mut usize,
    min_y: f64,
) -> Result<()> {
    if *y >= min_y {
        return Ok(());
    }
    *page_index += 1;
    let (page, layer) = doc.add_page(Mm(210.0), Mm(297.0), format!("Page {}", page_index));
    *active_layer = doc.get_page(page).get_layer(layer);
    *y = 278.0;
    write_line(active_layer, title, 14.0, 18.0, *y, font_bold);
    *y -= 14.0;
    Ok(())
}

fn write_section_title(
    layer: &PdfLayerReference,
    title: &str,
    y: &mut f64,
    font: &IndirectFontRef,
) {
    write_line(layer, title, 14.0, 18.0, *y, font);
    *y -= 9.0;
}

fn write_wrapped_line(
    layer: &PdfLayerReference,
    text: &str,
    y: &mut f64,
    font: &IndirectFontRef,
    font_size: f64,
    x: f64,
    max_chars: usize,
) {
    for chunk in wrap_text(text, max_chars) {
        write_line(layer, &chunk, font_size, x, *y, font);
        *y -= 6.0;
    }
    *y -= 2.0;
}

fn write_line(
    layer: &PdfLayerReference,
    text: &str,
    font_size: f64,
    x: f64,
    y: f64,
    font: &IndirectFontRef,
) {
    layer.use_text(text, font_size as f32, Mm(x as f32), Mm(y as f32), font);
}

fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return vec![String::new()];
    }
    chars
        .chunks(max_chars)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect()
}

fn unique_recommendations(findings: &[AuditFinding]) -> Vec<String> {
    let mut values = Vec::new();
    for finding in findings {
        if !values.contains(&finding.recommended_action) {
            values.push(finding.recommended_action.clone());
        }
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuditFinding, AuditReport, FindingMetadata, FindingRiskLevel, Severity};
    use crate::platform::{ImportQualityReport, QualityCheck, QualitySeverity};
    use rust_decimal_macros::dec;

    #[test]
    fn generates_pdf() {
        let mut report = AuditReport::new(3, dec!(1000), dec!(1000));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-001",
                rule_name: "大额专项资金支付",
                rule_category: "资金流向异常",
                risk_level: FindingRiskLevel::High,
                severity: Severity::Warning,
                legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                audit_rationale: "测试依据",
                recommended_action: "测试建议",
            },
            "大额财政资金支出。",
            vec![1],
        ));
        let tmp = tempfile::NamedTempFile::new().unwrap();
        PdfReportGenerator::generate(&report, tmp.path()).unwrap();
        assert!(tmp.path().exists());
    }

    #[test]
    fn builds_visual_summary_from_report_findings() {
        let mut report = AuditReport::new(3, dec!(1000), dec!(1000));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-001",
                rule_name: "采购规则",
                rule_category: "采购合规",
                risk_level: FindingRiskLevel::High,
                severity: Severity::Warning,
                legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                audit_rationale: "依据",
                recommended_action: "建议",
            },
            "证据",
            vec![1],
        ));
        report.add_finding(AuditFinding::from_metadata(
            FindingMetadata {
                rule_code: "TEST-002",
                rule_name: "预算规则",
                rule_category: "预算执行",
                risk_level: FindingRiskLevel::Medium,
                severity: Severity::Info,
                legal_basis: crate::models::DEFAULT_LEGAL_BASIS,
                audit_rationale: "依据",
                recommended_action: "建议",
            },
            "证据",
            vec![2],
        ));

        let quality_report = ImportQualityReport {
            total_rows: 3,
            accepted_rows: 2,
            rejected_rows: 1,
            checks: vec![
                QualityCheck {
                    code: "missing_required".to_string(),
                    severity: QualitySeverity::Error,
                    message: "缺少必填字段".to_string(),
                    field: Some("amount".to_string()),
                    row_number: Some(2),
                },
                QualityCheck {
                    code: "date_warning".to_string(),
                    severity: QualitySeverity::Warning,
                    message: "日期格式待复核".to_string(),
                    field: Some("date".to_string()),
                    row_number: Some(3),
                },
            ],
        };
        let summary = PdfChartSummary::from_report_with_quality(&report, Some(&quality_report));

        assert_eq!(summary.risk_counts.high, 1);
        assert_eq!(summary.risk_counts.medium, 1);
        assert_eq!(summary.rule_categories[0].label, "采购合规");
        assert_eq!(summary.rule_categories[0].value, 1);
        assert_eq!(summary.quality_checks[0].label, "错误");
        assert_eq!(summary.quality_checks[0].value, 1);
        assert_eq!(summary.quality_checks[1].label, "警告");
        assert_eq!(summary.quality_checks[1].value, 1);
    }
}
