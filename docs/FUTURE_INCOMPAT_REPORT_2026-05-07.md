# Rust Future-Incompatibility Report

Date: 2026-05-07

Command:

```powershell
cargo report future-incompatibilities --id 5
```

Result:

- The remaining future-incompatibility warning is from upstream dependency `sqlx-postgres v0.7.2`.
- The warning is Rust 2024 never-type fallback in `sqlx-postgres` internals, including `connection/executor.rs` and `copy.rs`.
- Cargo reports newer compatible patch/minor candidates: `0.7.3`, `0.7.4`, and `0.8.x`.
- This is not triggered by AuditLens application code.

Decision:

- Do not upgrade `sqlx` during the PoC repair window because the current fullstack and followup acceptance suites are green.
- Track a post-PoC dependency upgrade task to test `sqlx` `0.7.4` first, then consider `0.8.x` with database integration coverage.

Verification:

- `cargo test` passes after documenting this warning.
