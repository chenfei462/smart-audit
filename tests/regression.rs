#[path = "regression/nanjing_commerce.rs"]
mod nanjing_commerce;

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use auditlens::auth::UserRole;
use auditlens::models::AuditFinding;
use auditlens::platform::{
    PlatformStore, RegistrationInput, RuleFeedbackInput, RuleFeedbackStatus, SessionIdentity,
};
use auditlens::rule_engine::BALANCE_METADATA;

fn powershell_path() -> PathBuf {
    PathBuf::from(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn runtime_env_example_only_documents_secret_injection() {
    let example = fs::read_to_string(repo_root().join("config/runtime.local.env.example")).unwrap();
    assert!(example.contains("AUDITLENS_SESSION_SECRET"));
    assert!(!example.contains("AUDITLENS_AI_API_KEY="));
}

#[test]
fn switch_profile_script_writes_env_file_next_to_runtime_config() {
    let temp = tempfile::tempdir().unwrap();
    let config_dir = temp.path().join("config");
    fs::create_dir_all(&config_dir).unwrap();
    let config_path = config_dir.join("runtime.local.json");
    fs::write(
        &config_path,
        r#"{
  "environmentMode": "local",
  "host": "127.0.0.1",
  "port": 18080,
  "cargoTargetDir": "./target-local",
  "platformDataDir": "./data",
  "useReleaseProfile": false,
  "healthPath": "/api/health",
  "secureCookies": false,
  "allowPublicRegistration": false,
  "aiEnabled": true,
  "publicDemoMode": false,
  "multimodalProvider": "",
  "ocrEnabled": false,
  "speechEnabled": false,
  "ocrApiUrl": "",
  "speechApiUrl": "",
  "ocrModel": "",
  "speechModel": ""
}"#,
    )
    .unwrap();

    let output = Command::new(powershell_path())
        .args([
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            repo_root().join("scripts/switch-profile.ps1").to_str().unwrap(),
            "poc",
            "-ConfigPath",
            config_path.to_str().unwrap(),
        ])
        .output()
        .expect("switch-profile should run");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let env_path = config_dir.join("runtime.local.env");
    assert!(env_path.exists(), "expected env file at {}", env_path.display());
    let env_content = fs::read_to_string(env_path).unwrap();
    assert!(env_content.contains("AUDITLENS_SESSION_SECRET="));
}

#[test]
fn built_in_rule_findings_include_legal_basis_metadata() {
    let finding = AuditFinding::from_metadata(BALANCE_METADATA, "voucher V001 is unbalanced", vec![1]);

    assert_eq!(finding.legal_basis.regulation_name, "中华人民共和国会计法");
    assert_eq!(finding.legal_basis.article_no, "第十四条、第十七条");
    assert!(finding.legal_basis.scope.contains("会计凭证"));
    assert!(finding.legal_basis.legal_reasoning.contains("真实、完整"));
}

#[test]
fn rule_feedback_stats_count_false_positive_rate_among_reviewed_hits() {
    let tmp = tempfile::tempdir().unwrap();
    let store = PlatformStore::load_or_create(tmp.path()).unwrap();
    let admin = store
        .register_tenant_admin(RegistrationInput {
            tenant_name: "Tenant A".to_string(),
            organization_name: "Org A".to_string(),
            username: "admin_a".to_string(),
            password: "Admin123".to_string(),
            display_name: "Alice".to_string(),
        })
        .unwrap();
    let identity = SessionIdentity {
        user_id: admin.id,
        tenant_id: admin.tenant_id,
        organization_id: admin.organization_id,
        username: admin.username,
        display_name: admin.display_name,
        role: UserRole::Admin,
    };

    store
        .record_rule_feedback(
            &identity,
            RuleFeedbackInput {
                task_id: "task-1".to_string(),
                finding_id: "finding-1".to_string(),
                rule_code: "FISCAL-BUDGET-001".to_string(),
                scenario_id: "fiscal-supervision".to_string(),
                rule_version: "0.3.0".to_string(),
                status: RuleFeedbackStatus::FalsePositive,
                note: Some("业务补录导致的会计分录暂时不平衡".to_string()),
            },
        )
        .unwrap();
    store
        .record_rule_feedback(
            &identity,
            RuleFeedbackInput {
                task_id: "task-2".to_string(),
                finding_id: "finding-2".to_string(),
                rule_code: "FISCAL-BUDGET-001".to_string(),
                scenario_id: "fiscal-supervision".to_string(),
                rule_version: "0.3.0".to_string(),
                status: RuleFeedbackStatus::TruePositive,
                note: None,
            },
        )
        .unwrap();
    store
        .record_rule_feedback(
            &identity,
            RuleFeedbackInput {
                task_id: "task-3".to_string(),
                finding_id: "finding-3".to_string(),
                rule_code: "FISCAL-BUDGET-001".to_string(),
                scenario_id: "fiscal-supervision".to_string(),
                rule_version: "0.3.0".to_string(),
                status: RuleFeedbackStatus::NeedsReview,
                note: None,
            },
        )
        .unwrap();

    let stats = store
        .rule_feedback_stats(&identity, "FISCAL-BUDGET-001", "fiscal-supervision", "0.3.0")
        .unwrap();
    assert_eq!(stats.reviewed_hits, 2);
    assert_eq!(stats.false_positive_hits, 1);
    assert_eq!(stats.false_positive_rate, 0.5);
}

#[test]
fn audit_review_package_includes_jsonl_csv_manifest_and_checksums_without_secrets() {
    let tmp = tempfile::tempdir().unwrap();
    let store = PlatformStore::load_or_create(tmp.path()).unwrap();
    let admin = store
        .register_tenant_admin(RegistrationInput {
            tenant_name: "Tenant A".to_string(),
            organization_name: "Org A".to_string(),
            username: "admin_a".to_string(),
            password: "Admin123".to_string(),
            display_name: "Alice".to_string(),
        })
        .unwrap();
    let identity = SessionIdentity {
        user_id: admin.id,
        tenant_id: admin.tenant_id,
        organization_id: admin.organization_id,
        username: admin.username,
        display_name: admin.display_name,
        role: UserRole::Admin,
    };
    store
        .create_user(
            &identity,
            auditlens::platform::NewUserInput {
                organization_id: identity.organization_id.clone(),
                username: "reviewer_a".to_string(),
                password: "Reviewer123".to_string(),
                display_name: "Reviewer".to_string(),
                role: UserRole::Auditor,
            },
        )
        .unwrap();

    let package = store.export_audit_review_package(&identity).unwrap();
    let combined = format!(
        "{}\n{}\n{}\n{}",
        package.jsonl, package.csv, package.manifest_json, package.package_checksum_sha256
    );

    assert!(package.jsonl.lines().any(|line| line.contains("\"who\"")));
    assert!(package.jsonl.contains("\"action\":\"user.create\""));
    assert!(package.csv.starts_with("event_id,who,when,action,target_type,target_id,outcome"));
    assert!(package.manifest_json.contains("\"audit-log.jsonl\""));
    assert!(package.manifest_json.contains("\"audit-log.csv\""));
    assert_eq!(package.package_checksum_sha256.len(), 64);
    assert!(!combined.contains("Admin123"));
    assert!(!combined.contains("Reviewer123"));
    assert!(!combined.to_ascii_lowercase().contains("secret"));
}
