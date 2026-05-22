# Operations Runbook

## Daily checks

- Confirm `/api/health` returns `ok`
- Confirm the local OCR / ASR bridge returns `ok` at `/health` when multimodal evidence collection is enabled
- Confirm the deployment policy matches the environment intent in the admin panel
- Confirm the latest startup log includes the expected configuration fingerprint without secret values
- Review recent audit logs in the admin panel
- Review new `预约汇报 / 申请 PoC` requests in the admin panel
- Verify new audit tasks are completing successfully
- Confirm PDF exports and sealed packages can be generated

## Backup and recovery

- Back up `data/platform.db` on a fixed schedule
- Back up the writable `platformDataDir` used by the runtime config
- Keep at least one off-host copy
- To recover, stop the service, restore `data/platform.db`, and restart
- Back up `config/runtime.local.json` for deployment policy and `config/runtime.local.env` for the session secret and injected API keys if you need to preserve local runtime state after rebuilds

Commands:

```powershell
./scripts/backup-platform-db.cmd
./scripts/restore-platform-db.cmd .\data\backup\platform-YYYYMMDD-HHMMSS.db .\tmp\restore-drill
```

Backup uses `sqlite3 VACUUM INTO` when `sqlite3` is available, writes a `.sha256` hash, and prints the restored hash during drills. Run a restore drill at least monthly.

## Sealed package verification

Generate a sealed package from the task detail page or:

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:18080/api/tasks/{task_id}/seal -OutFile sealed.zip
```

Verify integrity:

```powershell
cargo run --bin seal-verify -- .\sealed.zip
```

Expected output:

```text
OK
```

If any file is modified, `seal-verify` reports the mismatched file hash or manifest signature.

## Audit log retention

High-risk operations currently recorded include login success/failure, password reset, AI profile changes, connector configuration, PDF export, sealed export, evidence uploads, case status updates, exception bulk updates, and automation schedule changes.

PoC retention assumption: keep active audit logs for at least `audit_log_retention_days=180`; archive older records to `data/archive/audit_log/yyyy-mm.jsonl.gz` with a sidecar SHA256 hash.

Demonstration archive without deleting source rows:

```powershell
./scripts/archive-audit-log.cmd -All
```

Retention archive for logs older than 180 days:

```powershell
./scripts/archive-audit-log.cmd -RetentionDays 180
```

Production pruning is explicit:

```powershell
./scripts/archive-audit-log.cmd -RetentionDays 180 -Prune
```

The script reads `config/runtime.local.json`, resolves the runtime `platformDataDir`, writes month-partitioned gzip JSONL files, and writes a `.sha256` sidecar for every archive.

## Role model

- `admin`: tenant setup, AI config, user creation, database-source audits
- `auditor`: file audits, task review, remediation updates, exports
- `viewer`: read-only task inspection

## Demo and PoC operating rules

- Public demo accepts desensitized sample data only
- Government PoC uses single-tenant deployment, sample data first, controlled real-data subset second
- Public demo keeps `allowPublicRegistration=false` after first initialization
- Public demo blocks generic file import, batch import, connector import, and evidence upload at the backend
- Government PoC keeps `aiEnabled=false` by default unless explicitly approved
- Government PoC must be entered through an HTTPS reverse proxy that sends `X-Forwarded-Proto=https` for non-local traffic
- Local OCR / ASR evidence collection depends on the local bridge at `http://127.0.0.1:8090`

## Incident response

- If login issues occur, inspect recent `auth.*` audit logs first
- If AI analysis fails or is disabled by deployment policy, the platform should continue to work with rule-based audit, export, and remediation flows
- If AI is enabled but no AI secret is configured, inject `AUDITLENS_AI_API_KEY`; the admin UI only shows whether the secret is configured
- If OCR / ASR evidence recognition fails, verify the local bridge process, Whisper model file, Tesseract installation, and `runtime.local.json` endpoints
- If a data source audit fails, validate the selected template and whitelist table
- If users lose session unexpectedly after restart, verify the persisted `sessionSecret` in `config/runtime.local.env`

## Local admin recovery

For local sample environments only, reset a known administrator password:

```powershell
cargo run --bin reset-local-admin -- "C:\Users\CYL\Documents\New project\smart-audit-data" admin Admin123
```

Restart the service after repeated failed logins to clear in-memory lockout state.
