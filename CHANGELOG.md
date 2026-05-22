# Changelog

## 2026-05-07

- Capped lazy case exception synchronization for `/api/cases`, metrics, and CSV export so accumulated smoke-test data no longer causes case APIs to time out.
- Reverified PoC readiness: `cargo test`, JS syntax checks, Node tests, seal/regression integration tests, fullstack smoke 44/44, followup smoke 7/7, and `poc`/`public` profile switching.
- Added demonstrable audit log archival via `archive-audit-log` plus Windows scripts, producing month-partitioned `.jsonl.gz` files and `.sha256` sidecars.
- Fixed local backup/restore script path handling for runtime `platformDataDir\data\platform.db`.
- Documented the remaining upstream `sqlx-postgres v0.7.2` future-incompatibility report and cleaned local Rust unused warnings.

## 2026-05-06

- Added unified task lookup for legacy demo, v2 platform, and v2 typed tasks.
- Fixed demo/v2 task detail, PDF export, AI explain, and sealed export lookup consistency.
- Added sealed ZIP manifest generation and the `seal-verify` integrity checker.
- Added Windows port probing and runtime profile switching for `poc` and `public`.
- Fixed exception bulk status, case seed import, and automation schedule payload compatibility.
- Added single-h1 accessibility fix, task detail export/action controls, and no-store fetch timeout handling.
- Added login failure auditing and 5-failure lockout by username/source IP.
- Added Nanjing commerce linkage regression and PoC payload Node tests.
- Updated API, deployment, operations, status, and README documentation.
