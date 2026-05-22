use auditlens::ai_analysis::schema::{build_decision_request, validate_decision_response};
use auditlens::ai_analysis::{generate_local_decision, AiAdapterKind, AiConfig};
use auditlens::auth::UserRole;
use auditlens::models::{
    AuditFinding, AuditReport, FindingMetadata, FindingRiskLevel, Severity,
};
use auditlens::platform::{
    AiApplyRequest, AiFindingApplyItem, AiRunRecord, AiRunStatus, PlatformStore,
    RegistrationInput, SessionIdentity,
};
use rust_decimal_macros::dec;

fn identity(store: &PlatformStore) -> SessionIdentity {
    let admin = store
        .register_tenant_admin(RegistrationInput {
            tenant_name: "Tenant A".to_string(),
            organization_name: "Org A".to_string(),
            username: "admin_a".to_string(),
            password: "Admin123".to_string(),
            display_name: "Alice".to_string(),
        })
        .unwrap();
    SessionIdentity {
        user_id: admin.id,
        tenant_id: admin.tenant_id,
        organization_id: admin.organization_id,
        username: admin.username,
        display_name: admin.display_name,
        role: UserRole::Admin,
    }
}

fn report_with_findings() -> AuditReport {
    let mut report = AuditReport::new(120, dec!(800000), dec!(790000));
    report.add_finding(AuditFinding::from_metadata(
        FindingMetadata {
            rule_code: "BUDGET-EXEC-001",
            rule_name: "Budget execution rate anomaly",
            rule_category: "budget_rules",
            risk_level: FindingRiskLevel::High,
            severity: Severity::Error,
            legal_basis: auditlens::models::DEFAULT_LEGAL_BASIS,
            audit_rationale: "Execution rate is unusually high.",
            recommended_action: "Review concentrated spending and approvals.",
        },
        "Project A reached 98.5% execution rate.",
        vec![1, 2],
    ));
    report.add_finding(AuditFinding::from_metadata(
        FindingMetadata {
            rule_code: "CHAIN-AMOUNT-001",
            rule_name: "Payment amount mismatch",
            rule_category: "chain_rules",
            risk_level: FindingRiskLevel::Medium,
            severity: Severity::Warning,
            legal_basis: auditlens::models::DEFAULT_LEGAL_BASIS,
            audit_rationale: "Contract and payment amount differ.",
            recommended_action: "Review contract and payment vouchers.",
        },
        "Contract C-001 differs from payment P-001.",
        vec![3],
    ));
    report.refresh_summary_metrics(&[]);
    report
}

#[test]
fn decision_request_uses_whitelisted_audit_summary() {
    let request = build_decision_request("task-1", &report_with_findings(), &[]);

    assert_eq!(request.task_id, "task-1");
    assert_eq!(request.findings.len(), 2);
    assert_eq!(request.findings[0].rule_code, "BUDGET-EXEC-001");
    assert!(request.findings[0].evidence_summary.contains("98.5%"));
    assert!(request.cases.is_empty());
    assert!(request.summary.total_findings >= 2);
}

#[test]
fn local_decision_generates_finding_case_trend_and_report_sections() {
    let decision = generate_local_decision("task-1", &report_with_findings(), &[]);

    assert_eq!(decision.task_id, "task-1");
    assert_eq!(decision.finding_classifications.len(), 2);
    assert!(decision
        .finding_classifications
        .iter()
        .any(|item| item.suggested_disposition_priority == "P1"));
    assert!(!decision.trend_forecasts.is_empty());
    assert!(decision.report_draft.markdown.contains("AI 辅助报告草稿"));
    validate_decision_response(&decision).unwrap();
}

#[test]
fn ai_config_defaults_to_local_openai_compatible_adapter() {
    let config = AiConfig::default();

    assert_eq!(config.adapter_kind, AiAdapterKind::OpenAiCompatible);
    assert_eq!(config.provider, "local");
    assert!(!config.enabled_without_secret());
}

#[test]
fn ai_run_records_can_be_saved_loaded_and_applied() {
    let temp = tempfile::tempdir().unwrap();
    let store = PlatformStore::load_or_create(temp.path()).unwrap();
    let identity = identity(&store);
    let decision = generate_local_decision("task-1", &report_with_findings(), &[]);
    let run = AiRunRecord {
        id: "run-1".to_string(),
        tenant_id: identity.tenant_id.clone(),
        task_id: "task-1".to_string(),
        status: AiRunStatus::Succeeded,
        provider: "local".to_string(),
        adapter_kind: AiAdapterKind::OpenAiCompatible,
        model: "local-rules".to_string(),
        guidance: "AI output is advisory only.".to_string(),
        result: decision.clone(),
        error_message: None,
        created_by: identity.user_id.clone(),
        created_at: "2026-05-23T00:00:00+08:00".to_string(),
        applied_at: None,
        applied_by: None,
    };

    store.save_ai_run(&identity, run).unwrap();
    let loaded = store.latest_ai_run(&identity, "task-1").unwrap().unwrap();
    assert_eq!(loaded.result.report_draft.title, decision.report_draft.title);

    let applied = store
        .apply_ai_suggestions(
            &identity,
            "task-1",
            &AiApplyRequest {
                run_id: "run-1".to_string(),
                finding_items: vec![AiFindingApplyItem {
                    finding_id: "missing-finding".to_string(),
                    disposition_priority: Some("P2".to_string()),
                    disposition_outcome: Some("supplement_evidence".to_string()),
                    note: Some("AI 建议人工确认".to_string()),
                }],
                case_items: Vec::new(),
            },
        )
        .unwrap();
    assert_eq!(applied.applied_findings, 0);
    assert_eq!(applied.run_id, "run-1");
    let reapplied = store.latest_ai_run(&identity, "task-1").unwrap().unwrap();
    assert_eq!(reapplied.applied_by.as_deref(), Some(identity.user_id.as_str()));
}
