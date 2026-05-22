use anyhow::{bail, Context, Result};
use chrono::{Duration, Utc};
use flate2::write::GzEncoder;
use flate2::Compression;
use rusqlite::{params, Connection, Row};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
struct AuditLogRow {
    id: String,
    tenant_id: Option<String>,
    organization_id: Option<String>,
    user_id: Option<String>,
    username: Option<String>,
    action: String,
    target_type: String,
    target_id: String,
    outcome: String,
    detail: String,
    created_at: String,
}

#[derive(Debug)]
struct ArchiveOptions {
    data_dir: PathBuf,
    output_root: PathBuf,
    retention_days: i64,
    archive_all: bool,
    prune: bool,
}

fn usage() -> &'static str {
    "Usage: archive-audit-log <platformDataDir> [--output-root <dir>] [--retention-days <days>] [--all] [--prune]"
}

fn parse_args() -> Result<ArchiveOptions> {
    let mut args = env::args_os().skip(1);
    let Some(data_dir) = args.next() else {
        bail!(usage());
    };
    let data_dir = PathBuf::from(data_dir);
    let mut output_root = data_dir.join("archive").join("audit_log");
    let mut retention_days = 180_i64;
    let mut archive_all = false;
    let mut prune = false;

    while let Some(arg) = args.next() {
        match arg.to_string_lossy().as_ref() {
            "--output-root" => {
                let Some(value) = args.next() else {
                    bail!("--output-root requires a directory");
                };
                output_root = PathBuf::from(value);
            }
            "--retention-days" => {
                let Some(value) = args.next() else {
                    bail!("--retention-days requires a number");
                };
                retention_days = value
                    .to_string_lossy()
                    .parse::<i64>()
                    .context("invalid --retention-days value")?;
                if retention_days < 0 {
                    bail!("--retention-days must be non-negative");
                }
            }
            "--all" => archive_all = true,
            "--prune" => prune = true,
            "--help" | "-h" => bail!(usage()),
            other => bail!("unknown argument: {other}\n{}", usage()),
        }
    }

    Ok(ArchiveOptions {
        data_dir,
        output_root,
        retention_days,
        archive_all,
        prune,
    })
}

fn row_to_audit_log(row: &Row<'_>) -> rusqlite::Result<AuditLogRow> {
    Ok(AuditLogRow {
        id: row.get(0)?,
        tenant_id: row.get(1)?,
        organization_id: row.get(2)?,
        user_id: row.get(3)?,
        username: row.get(4)?,
        action: row.get(5)?,
        target_type: row.get(6)?,
        target_id: row.get(7)?,
        outcome: row.get(8)?,
        detail: row.get(9)?,
        created_at: row.get(10)?,
    })
}

fn archive_month(created_at: &str) -> String {
    let candidate = created_at.get(0..7).unwrap_or("unknown");
    if candidate.len() == 7
        && candidate.chars().enumerate().all(|(index, character)| {
            (index == 4 && character == '-') || (index != 4 && character.is_ascii_digit())
        })
    {
        candidate.to_string()
    } else {
        "unknown".to_string()
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn write_month_archive(path: &Path, rows: &[AuditLogRow]) -> Result<String> {
    let file = fs::File::create(path)
        .with_context(|| format!("failed to create archive {}", path.display()))?;
    let mut encoder = GzEncoder::new(file, Compression::default());
    for row in rows {
        let detail = serde_json::from_str::<serde_json::Value>(&row.detail)
            .unwrap_or_else(|_| json!({ "raw": row.detail }));
        let value = json!({
            "id": row.id,
            "tenant_id": row.tenant_id,
            "organization_id": row.organization_id,
            "user_id": row.user_id,
            "username": row.username,
            "action": row.action,
            "target_type": row.target_type,
            "target_id": row.target_id,
            "outcome": row.outcome,
            "detail": detail,
            "created_at": row.created_at,
        });
        serde_json::to_writer(&mut encoder, &value)?;
        encoder.write_all(b"\n")?;
    }
    encoder.finish()?;

    let bytes = fs::read(path).with_context(|| format!("failed to hash {}", path.display()))?;
    let hash = sha256_hex(&bytes);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("audit-log.jsonl.gz");
    let hash_path = path.with_file_name(format!("{file_name}.sha256"));
    fs::write(&hash_path, format!("{hash}  {file_name}\n"))
        .with_context(|| format!("failed to write {}", hash_path.display()))?;
    Ok(hash)
}

fn load_rows(conn: &Connection, options: &ArchiveOptions) -> Result<Vec<AuditLogRow>> {
    let base_sql = "SELECT id, tenant_id, organization_id, user_id, username, action, target_type,
                          target_id, outcome, detail, created_at
                   FROM audit_logs";
    if options.archive_all {
        let mut statement = conn.prepare(&format!("{base_sql} ORDER BY created_at ASC, id ASC"))?;
        let rows = statement
            .query_map([], row_to_audit_log)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        return Ok(rows);
    }

    let cutoff = (Utc::now() - Duration::days(options.retention_days))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let mut statement = conn.prepare(&format!(
        "{base_sql} WHERE created_at < ?1 ORDER BY created_at ASC, id ASC"
    ))?;
    let rows = statement
        .query_map(params![cutoff], row_to_audit_log)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn prune_rows(conn: &mut Connection, ids: &[String]) -> Result<()> {
    let tx = conn.transaction()?;
    for id in ids {
        tx.execute("DELETE FROM audit_logs WHERE id = ?1", params![id])?;
    }
    tx.commit()?;
    Ok(())
}

fn resolve_db_path(data_dir: &Path) -> Result<PathBuf> {
    let candidates = [
        data_dir.join("platform.db"),
        data_dir.join("data").join("platform.db"),
    ];
    candidates
        .iter()
        .find(|path| path.exists())
        .cloned()
        .ok_or_else(|| {
            anyhow::anyhow!(
                "platform database not found; checked {} and {}",
                candidates[0].display(),
                candidates[1].display()
            )
        })
}

fn run(options: ArchiveOptions) -> Result<()> {
    let db_path = resolve_db_path(&options.data_dir)?;
    fs::create_dir_all(&options.output_root)?;
    let mut conn = Connection::open(&db_path)
        .with_context(|| format!("failed to open {}", db_path.display()))?;
    let rows = load_rows(&conn, &options)?;
    if rows.is_empty() {
        println!("No audit logs matched the archive criteria.");
        return Ok(());
    }

    let mut groups = BTreeMap::<String, Vec<AuditLogRow>>::new();
    for row in rows {
        groups.entry(archive_month(&row.created_at)).or_default().push(row);
    }

    let mut archived_ids = Vec::new();
    for (month, month_rows) in groups {
        let path = options.output_root.join(format!("{month}.jsonl.gz"));
        let hash = write_month_archive(&path, &month_rows)?;
        archived_ids.extend(month_rows.iter().map(|row| row.id.clone()));
        println!(
            "Archived {} rows to {}",
            month_rows.len(),
            path.display()
        );
        println!("SHA256: {hash}");
    }

    if options.prune {
        prune_rows(&mut conn, &archived_ids)?;
        println!("Pruned {} archived audit log rows.", archived_ids.len());
    } else {
        println!("Prune disabled; source audit_logs table was not modified.");
    }

    Ok(())
}

fn main() {
    match parse_args().and_then(run) {
        Ok(()) => {}
        Err(error) => {
            eprintln!("{error:#}");
            std::process::exit(1);
        }
    }
}
