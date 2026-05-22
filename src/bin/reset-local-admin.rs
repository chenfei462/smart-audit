use anyhow::{Context, Result};
use bcrypt::DEFAULT_COST;
use rusqlite::{params, Connection};
use std::env;
use std::path::PathBuf;

fn main() -> Result<()> {
    let mut args = env::args_os().skip(1);
    let base_dir = args
        .next()
        .map(PathBuf::from)
        .context("usage: reset-local-admin <platform-data-root> <username> <password>")?;
    let username = args
        .next()
        .context("usage: reset-local-admin <platform-data-root> <username> <password>")?
        .to_string_lossy()
        .to_string();
    let password = args
        .next()
        .context("usage: reset-local-admin <platform-data-root> <username> <password>")?
        .to_string_lossy()
        .to_string();

    let db_path = base_dir.join("data").join("platform.db");
    let conn = Connection::open(&db_path)
        .with_context(|| format!("failed to open {}", db_path.display()))?;
    let hash = bcrypt::hash(password, DEFAULT_COST).context("failed to hash password")?;
    let updated = conn
        .execute(
            "UPDATE users
             SET password_hash = ?1, must_change_password = 0, active = 1
             WHERE lower(username) = lower(?2)",
            params![hash, username],
        )
        .context("failed to update admin password")?;
    if updated == 0 {
        anyhow::bail!("user not found: {}", username);
    }
    println!("Reset local password for {username}");
    Ok(())
}
