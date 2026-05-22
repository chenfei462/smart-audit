# AuditLens PoC Readiness Status

Date: 2026-05-22

## 2026-05-22 Phase A / P0 Security Baseline

This round moved the security baseline from demo-oriented defaults to controlled single-tenant government PoC behavior.

Completed:

- Explicit `environmentMode` is used for `local`, `public_demo`, and `government_poc`.
- `AUDITLENS_SESSION_SECRET`, OCR / ASR keys, AI key, and connector secrets are injected from environment variables instead of runtime JSON.
- AI profile APIs and admin UI no longer accept, persist, or echo `api_key`; they expose `secret_configured`.
- Connector profile creation no longer accepts `credential_secret`; connector state is derived from `AUDITLENS_CONNECTOR_SECRET_<PROFILE_ID>`.
- Deprecated `ai_profile.api_key` and `connector_profiles.credential_json` values are cleared on startup and are no longer used as fallback secrets.
- `government_poc` refuses unsafe startup policy combinations and requires HTTPS proxy signaling for non-local access.
- `public_demo` blocks real-data entry paths including generic file import, batch import, connector import, and evidence upload.
- Startup configuration fingerprint logging records mode, policy booleans, and secret presence without logging secret values.
- Windows profile and startup scripts now load adjacent `.env` files for local secret injection.

Verification 2026-05-22:

- `C:\Users\CYL\.cargo\bin\cargo.exe test`: pass.
- `C:\Users\CYL\.cargo\bin\cargo.exe test --test regression --test seal_v2_task`: pass.
- `node --test scripts/*.test.mjs`: pass, 121/121.
- `node --check static/app/*.js` equivalent per-file loop: pass.
- `./scripts/switch-profile.cmd poc`: pass, produced `environmentMode=government_poc`, `secureCookies=true`, `publicDemoMode=false`, `allowPublicRegistration=false`.
- `./scripts/check-health.cmd`: pass against the local PoC server, returned `{ "status": "ok", "version": "0.3.0" }`.

Notes:

- `cargo` is installed at `C:\Users\CYL\.cargo\bin\cargo.exe` but is not on the default PowerShell `PATH` in this session.
- The workspace at `D:\Desktop\smart-audit` is not a Git repository, so no branch, commit, or diff summary is available.
- Current local profile after verification is `government_poc`; `config/runtime.local.env` contains the local generated session secret and must remain uncommitted.

Next wave:

- Data-import approval workflow.
- Discipline-inspection and finance-specific expanded roles.
- Customer-confirmed permission matrix.
- Production multi-tenant secret orchestration.

## Assumptions

- The workspace at `D:\Desktop\smart-audit` is not a Git repository, so no feature branch or commit was created.
- `rg` failed with an access-denied error in this environment, so repository scans used PowerShell file/search commands.
- Local PowerShell does not expand `node --check static/app/*.js`; verification uses the equivalent per-file loop.
- `cargo` is installed at `C:\Users\CYL\.cargo\bin\cargo.exe` but is not on the default PowerShell PATH in this session.
- PoC local profile uses `secureCookies=true`; fullstack local smoke uses the public profile unless the environment is behind HTTPS.
- Fullstack and followup smoke tests are run sequentially because both use the local admin/IP login path and can otherwise interfere with login lockout counters.

## Completed Baseline

- P0 task lookup is unified through `find_any_task` for legacy demo, v2 platform, and v2 typed task payloads.
- Task detail, PDF export, AI explain, and sealed export share the unified lookup path.
- Sealed export ZIP now includes `manifest.json` plus encrypted payload and can be verified by `seal-verify`.
- Windows init/start/check scripts read runtime ports instead of hard-coding `8081` / `8090`.
- Frontend payloads for exception bulk status, case seed import, and automation schedule kind are covered by Node tests.
- One-click `poc` / `public` runtime profile switching is available.
- The page now has a single `h1`, a skip link, and `main-content`.
- Nanjing commerce linkage baseline is pinned in `data/regression/nanjing_commerce_baseline.json`.
- `/api/cases`, case metrics, and case CSV export no longer rescan every historical task on each request; lazy exception-case synchronization is capped to recent unsynced tasks for PoC-scale accumulated smoke data.

## Verification 2026-05-07

- `cargo test`: pass, 95 unit tests plus integration tests.
- `node --check static/app/*.js` equivalent per-file loop: pass.
- `node --test scripts/*.test.mjs`: pass, 120/120.
- `cargo test --test seal_v2_task --test regression`: pass.
- `node .tmp/fullstack-test.mjs`: pass, 44/44 and `.tmp/fullstack-test-report.json` has 0 failures.
- `node .tmp/followup-test.mjs`: pass, 7/7 and `.tmp/followup-test-report.json` has 0 failures.
- `scripts\switch-profile.cmd poc` and `scripts\switch-profile.cmd public`: pass, runtime profile fields validated.
- `scripts\archive-audit-log.cmd -All`: pass, generated month-partitioned `.jsonl.gz` audit archives and `.sha256` sidecars without pruning source rows.
- `scripts\backup-platform-db.cmd -OutputDir .tmp\backup-drill` plus restore to `.tmp\restore-drill`: pass, SHA256 matched.
- Local Rust `unused` warnings in `src/platform/procurement.rs` are suppressed/cleaned; the remaining Cargo warning is upstream `sqlx-postgres v0.7.2` and is documented in `docs/FUTURE_INCOMPAT_REPORT_2026-05-07.md`.

## Partial / Follow-up Items

- Audit log archival to compressed `jsonl.gz` is scriptable and demonstrated; production scheduler wiring remains a follow-up.
- Domain module split for the largest Rust files is documented as an engineering route; this repair kept code movement minimal to protect PoC behavior.
- Data provenance and rule explanation fields exist in several import/detail structures; a full UI drill-down for every finding remains a P2 hardening follow-up.
