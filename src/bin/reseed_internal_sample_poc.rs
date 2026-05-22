use anyhow::{Context, Result};
use auditlens::auth::UserRole;
use auditlens::platform::{
    preview_budget_csv_bytes, preview_case_seed_csv_bytes, preview_procurement_csv_bytes,
    preview_treasury_csv_bytes, preview_voucher_csv_bytes, BudgetDatasetKind, ImportSourceKind,
    PlatformStore, SessionIdentity, TreasuryDatasetKind, VoucherDatasetKind,
};
use rusqlite::{Connection, OptionalExtension};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;

fn main() -> Result<()> {
    let mut args = env::args_os().skip(1);
    let base_dir = args
        .next()
        .map(PathBuf::from)
        .context("usage: reseed_internal_sample_poc <platform-data-root> <fixture-dir>")?;
    let fixture_dir = args
        .next()
        .map(PathBuf::from)
        .context("usage: reseed_internal_sample_poc <platform-data-root> <fixture-dir>")?;

    let store = PlatformStore::load_or_create(&base_dir)?;
    let actor = load_audit_actor(&base_dir)?;
    let source_kind = ImportSourceKind::File;

    let budget = read_fixture(&fixture_dir, "department_budget_indicator.csv")?;
    let budget_preview = preview_budget_csv_bytes(
        "department_budget_indicator.csv",
        &budget,
        BudgetDatasetKind::DepartmentExecutionDetail,
        Some("内部样例：部门预算指标"),
    )?;
    let budget_job = store.save_budget_preview_job(&actor, source_kind, &budget_preview)?;
    let budget_task = store.commit_import_job(&actor, &budget_job)?;
    println!("budget_summary job={} task={}", budget_job, budget_task.id);

    let procurement = read_fixture(&fixture_dir, "procurement_contract.csv")?;
    let procurement_preview = preview_procurement_csv_bytes(
        "procurement_contract.csv",
        &procurement,
        Some("内部样例：采购合同"),
    )?;
    let procurement_job =
        store.save_procurement_preview_job(&actor, source_kind, &procurement_preview)?;
    let procurement_task = store.commit_import_job(&actor, &procurement_job)?;
    println!(
        "procurement_project job={} task={}",
        procurement_job, procurement_task.id
    );

    let treasury = read_fixture(&fixture_dir, "treasury_payment_detail.csv")?;
    let treasury_preview = preview_treasury_csv_bytes(
        "treasury_payment_detail.csv",
        &treasury,
        TreasuryDatasetKind::TreasuryPaymentDetail,
        Some("内部样例：国库集中支付"),
    )?;
    let treasury_job = store.save_treasury_preview_job(&actor, source_kind, &treasury_preview)?;
    let treasury_task = store.commit_import_job(&actor, &treasury_job)?;
    println!(
        "treasury_payment job={} task={}",
        treasury_job, treasury_task.id
    );

    let voucher = read_fixture(&fixture_dir, "voucher_entry_detail.csv")?;
    let voucher_preview = preview_voucher_csv_bytes(
        "voucher_entry_detail.csv",
        &voucher,
        VoucherDatasetKind::VoucherEntryDetail,
        Some("内部样例：会计凭证分录"),
    )?;
    let voucher_job = store.save_voucher_preview_job(&actor, source_kind, &voucher_preview)?;
    let voucher_task = store.commit_import_job(&actor, &voucher_job)?;
    println!(
        "voucher_ledger job={} task={}",
        voucher_job, voucher_task.id
    );

    let rectification = read_fixture(&fixture_dir, "rectification_ledger.csv")?;
    let rectification_preview = preview_case_seed_csv_bytes(
        "rectification_ledger.csv",
        &rectification,
        Some("内部样例：问题整改台账"),
    )?;
    let cases = store.import_case_seed_records(&actor, source_kind, &rectification_preview)?;
    println!("supervision_case_seed cases={}", cases.len());

    Ok(())
}

fn read_fixture(fixture_dir: &Path, file_name: &str) -> Result<Vec<u8>> {
    let path = fixture_dir.join(file_name);
    fs::read(&path).with_context(|| format!("failed to read {}", path.display()))
}

fn load_audit_actor(base_dir: &Path) -> Result<SessionIdentity> {
    let db_path = base_dir.join("data").join("platform.db");
    let conn = Connection::open(&db_path)
        .with_context(|| format!("failed to open {}", db_path.display()))?;
    let user = conn
        .query_row(
            "SELECT id, tenant_id, organization_id, username, display_name, role
             FROM users
             WHERE active = 1
               AND role IN ('admin', 'auditor', 'department_reviewer', 'supervisor')
             ORDER BY CASE role
                 WHEN 'admin' THEN 0
                 WHEN 'auditor' THEN 1
                 WHEN 'department_reviewer' THEN 2
                 WHEN 'supervisor' THEN 3
                 ELSE 4
             END
             LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()?
        .context("no active audit-capable user found")?;

    Ok(SessionIdentity {
        user_id: user.0,
        tenant_id: user.1,
        organization_id: user.2,
        username: user.3,
        display_name: user.4,
        role: UserRole::from_str(&user.5).map_err(anyhow::Error::msg)?,
    })
}
