# AuditLens Architecture Notes

## Current State

- `src/web/mod.rs` still owns most HTTP routes.
- `src/platform/v2_store.rs` still owns v2 persistence and task assembly.
- `src/platform/v2.rs` still owns most v2 DTOs.

## Low-risk Split Route

Move behavior without changing route contracts:

- `web/routes/auth.rs`
- `web/routes/tasks.rs`
- `web/routes/cases.rs`
- `web/routes/exceptions.rs`
- `web/routes/connectors.rs`
- `web/routes/admin.rs`
- `web/routes/public.rs`

Then split platform internals:

- `platform/repositories/tasks.rs`
- `platform/repositories/audit_logs.rs`
- `platform/services/seal.rs`
- `platform/services/case_workflow.rs`
- `platform/services/imports.rs`

## Guardrails

- Move one domain at a time.
- Run `cargo test` after every split.
- Keep legacy demo and v2 typed task lookup behind `PlatformStore::find_any_task`.
- Keep route response schema stable and update `docs/API.md` with every contract change.
