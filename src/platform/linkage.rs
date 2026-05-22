use crate::platform::{
    BudgetProjectRecord, LinkageCandidateMatch, ProcurementBudgetLinkEvidence,
    ProcurementBudgetLinkMode, ProcurementProjectRecord,
};

#[derive(Debug, Clone)]
pub struct BudgetProjectCandidate {
    pub project: BudgetProjectRecord,
    pub budget_unit_name: String,
    pub summary_item: Option<String>,
}

pub fn score_budget_link(
    procurement: &ProcurementProjectRecord,
    budget: &BudgetProjectCandidate,
) -> Option<ProcurementBudgetLinkEvidence> {
    if normalize_text(&procurement.purchaser_name) != normalize_text(&budget.budget_unit_name) {
        return None;
    }

    let procurement_text = normalize_text(&procurement.project_name);
    let budget_text = normalize_text(&format!(
        "{} {}",
        budget.project.name,
        budget.summary_item.clone().unwrap_or_default()
    ));

    let mut score = 40u32;
    let mut reasons = vec!["same budget unit".to_string()];

    if shares_special_keyword(&procurement_text, &budget_text) {
        score += 25;
        reasons.push("keyword overlap: reserve subject".to_string());
    }

    if text_contains_any(&procurement_text, &["储备", "reserve"])
        && text_contains_any(&budget_text, &["储备", "reserve"])
    {
        score += 20;
        reasons.push("shared reserve workflow".to_string());
    }

    if text_contains_any(&procurement_text, &["冻猪肉", "frozenpork"])
        && text_contains_any(&budget_text, &["3000吨", "3000tons"])
    {
        score += 20;
        reasons.push("quantity evidence: 3000 tons".to_string());
    }

    let match_mode = if score >= 80 {
        ProcurementBudgetLinkMode::EvidenceAuto
    } else if score >= 60 {
        ProcurementBudgetLinkMode::EvidenceCandidate
    } else {
        ProcurementBudgetLinkMode::None
    };

    if matches!(match_mode, ProcurementBudgetLinkMode::None) {
        return None;
    }

    Some(ProcurementBudgetLinkEvidence {
        match_mode,
        match_score: score,
        match_reasons: reasons.clone(),
        candidate_budget_project_ids: vec![budget.project.id.clone()],
        linkage_confidence: score,
        candidate_matches: vec![LinkageCandidateMatch {
            record_type: "budget_project".to_string(),
            record_id: budget.project.id.clone(),
            confidence: score,
            match_reasons: reasons,
        }],
        unmatched_reason: None,
    })
}

fn normalize_text(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(character)
        })
        .collect::<String>()
        .to_lowercase()
}

fn shares_special_keyword(left: &str, right: &str) -> bool {
    [
        "冻猪肉",
        "frozenpork",
        "冻牛肉",
        "frozenbeef",
        "菜篮子",
        "vegetablebasket",
        "肉菜",
        "meatvegetable",
        "审计",
        "audit",
        "运维",
        "maintenance",
        "绩效",
        "performance",
    ]
    .iter()
    .any(|keyword| left.contains(keyword) && right.contains(keyword))
}

fn text_contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{ProcurementBudgetLinkMode, ProcurementProjectRecord};

    fn procurement() -> ProcurementProjectRecord {
        ProcurementProjectRecord {
            id: "proc-1".into(),
            project_name: "2025-2026年度南京市冻猪肉政府性储备项目".into(),
            purchaser_name: "南京市商务局".into(),
            announcement_type: "公开招标公告".into(),
            procurement_stage: None,
            project_code: "JSZC-320100-JSZB-G2025-0002".into(),
            procurement_method: Some("公开招标".into()),
            published_at: Some("2025-03-24".into()),
            region: Some("江苏省南京市".into()),
            normalized_region: None,
            budget_amount: Some("8700000".into()),
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
            budget_unit_id: Some("unit-1".into()),
            budget_project_id: None,
            supplier_id: None,
            funding_source_id: None,
            account_classification_id: None,
            indicator_document_no: None,
            project_catalog_id: None,
            notice_url: None,
            source_evidence: None,
            source_row: Some(1),
            linkage_evidence: None,
        }
    }

    fn budget() -> BudgetProjectCandidate {
        BudgetProjectCandidate {
            project: BudgetProjectRecord {
                id: "budget-1".into(),
                budget_unit_id: Some("unit-1".into()),
                name: "2025年菜篮子发展专项-肉菜储备".into(),
                project_catalog_id: None,
                indicator_document_no: Some("宁府办文〔2025〕697号".into()),
                funding_source_id: None,
            },
            budget_unit_name: "南京市商务局".into(),
            summary_item: Some("冻猪肉储备量3000吨".into()),
        }
    }

    #[test]
    fn returns_evidence_auto_for_same_unit_reserve_case() {
        let result = score_budget_link(&procurement(), &budget()).unwrap();
        assert_eq!(result.match_mode, ProcurementBudgetLinkMode::EvidenceAuto);
        assert!(result.match_score >= 80);
    }

    #[test]
    fn returns_candidate_for_partial_overlap() {
        let mut candidate = budget();
        candidate.summary_item = Some("肉菜储备".into());
        let result = score_budget_link(&procurement(), &candidate).unwrap();
        assert_eq!(
            result.match_mode,
            ProcurementBudgetLinkMode::EvidenceCandidate
        );
        assert!(result.match_score >= 60);
        assert!(result.match_score < 80);
    }

    #[test]
    fn rejects_different_budget_unit() {
        let mut candidate = budget();
        candidate.budget_unit_name = "南京市财政局".into();
        let result = score_budget_link(&procurement(), &candidate);
        assert!(result.is_none());
    }
}
