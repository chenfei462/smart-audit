use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn seal_signature(
    task_id: &str,
    exported_by: &str,
    exported_at: &str,
    files: &[serde_json::Value],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(task_id.as_bytes());
    hasher.update(exported_by.as_bytes());
    hasher.update(exported_at.as_bytes());
    for file in files {
        hasher.update(file["name"].as_str().unwrap_or_default().as_bytes());
        hasher.update(file["sha256"].as_str().unwrap_or_default().as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

fn seal_verify_path() -> PathBuf {
    std::env::var_os("CARGO_BIN_EXE_seal-verify")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let suffix = if cfg!(windows) { ".exe" } else { "" };
            PathBuf::from(format!("target/debug/seal-verify{suffix}"))
        })
}

fn write_seal_fixture(path: &Path, task_kind: &str, tamper_payload: bool) {
    let payload = serde_json::json!({
        "task_id": format!("task-{task_kind}"),
        "task_origin": "v2_typed",
        "task_kind": task_kind,
        "rule_results": [{"rule_code": "POC-001", "risk_level": "High"}],
        "associated_budget": {"budget_linkage_summary": {"linked": 1}},
        "evidence_summary": ["采购公告、预算指标、支付凭证链路摘要"],
        "rectification_status": [{"finding_id": "f-1", "status": "open"}],
        "operator": "auditor",
        "generated_at": "2026-05-06T00:00:00Z",
        "rule_version": "0.3.0",
        "template_version": "gov-standard-v1"
    });
    let payload_bytes = serde_json::to_vec_pretty(&payload).unwrap();
    let stored_payload = if tamper_payload {
        br#"{"tampered":true}"#.to_vec()
    } else {
        payload_bytes.clone()
    };
    let files = vec![serde_json::json!({
        "name": "encrypted_payload.json",
        "sha256": sha256_hex(&payload_bytes),
    })];
    let exported_at = "2026-05-06T00:01:00Z";
    let signature = seal_signature(&format!("task-{task_kind}"), "auditor", exported_at, &files);
    let manifest = serde_json::json!({
        "task_id": format!("task-{task_kind}"),
        "exported_by": "auditor",
        "exported_at": exported_at,
        "rule_version": "0.3.0",
        "template_version": "gov-standard-v1",
        "files": files,
        "signature": signature,
    });

    let file = File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("manifest.json", options).unwrap();
    zip.write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes())
        .unwrap();
    zip.start_file("encrypted_payload.json", options).unwrap();
    zip.write_all(&stored_payload).unwrap();
    zip.finish().unwrap();
}

#[test]
fn seal_verify_accepts_manifest_for_v2_typed_task_kinds() {
    let temp = tempfile::tempdir().unwrap();
    for task_kind in [
        "procurement_project",
        "budget_summary",
        "treasury_payment",
        "voucher_ledger",
    ] {
        let package = temp.path().join(format!("{task_kind}.zip"));
        write_seal_fixture(&package, task_kind, false);
        let output = Command::new(seal_verify_path()).arg(&package).output().unwrap();
        assert!(
            output.status.success(),
            "seal-verify failed for {task_kind}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "OK");
        assert!(std::fs::metadata(&package).unwrap().len() > 700);
    }
}

#[test]
fn seal_verify_rejects_tampered_payload_hash() {
    let temp = tempfile::tempdir().unwrap();
    let package = temp.path().join("tampered.zip");
    write_seal_fixture(&package, "procurement_project", true);

    let output = Command::new(seal_verify_path()).arg(&package).output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("sha256 mismatch"));
}
