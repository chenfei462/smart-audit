# Government PoC Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-risk P0 and P1 gaps so AuditLens can be presented and delivered as a controlled single-tenant government PoC rather than only a strong demo.

**Architecture:** Keep the current Rust backend, SQLite runtime state, static frontend, and profile-based deployment model. Prioritize policy enforcement, evidence traceability, auditability, and role clarity without starting a large structural refactor before PoC hardening is complete.

**Tech Stack:** Rust, Actix Web, SQLite/rusqlite, vanilla JavaScript, static HTML, PowerShell startup scripts, Markdown operations docs.

---

## Scope

This plan focuses on the gaps documented in:

- `docs/GOVERNMENT_POC_GAP_ASSESSMENT_2026-05-22.md`
- `docs/POC_ACCEPTANCE_CHECKLIST.md`
- `docs/STATUS.md`

This plan does not include:

- Multi-tenant production redesign
- Large backend module splits
- Frontend framework migration
- New business lines outside the current fiscal supervision scope

## Phase Targets

### Phase A: PoC safety baseline

- Sensitive configuration is no longer treated as plain local-file policy only
- Public demo and PoC data boundaries are technically enforced
- Key admin and export actions are fully traceable

### Phase B: Evidence credibility baseline

- Audit conclusions can be traced back to source, batch, parser, and mapping version
- Rules are explainable in business language
- Candidate findings and confirmed findings are clearly separated

### Phase C: Delivery and operations baseline

- Roles, reports, rectification flow, and operational checks are aligned with field delivery
- Acceptance can be rerun with stable commands and checklist evidence

## Task 1: Freeze acceptance baseline and delivery scope

**Files:**
- Modify: `docs/POC_ACCEPTANCE_CHECKLIST.md`
- Modify: `docs/GOVERNMENT_POC_PACKAGE.md`
- Modify: `docs/STATUS.md`
- Modify: `README.md`

- [ ] Confirm the target statement for this round is "single-tenant government PoC hardening" and not "formal production launch".
- [ ] Add a short delivery note to `docs/POC_ACCEPTANCE_CHECKLIST.md` that distinguishes public demo, government PoC, and formal production.
- [ ] Update `docs/STATUS.md` with a new section named `2026-05-22 hardening target` listing the P0 items planned for this round.
- [ ] Update `README.md` so the government PoC section points readers to the new gap assessment and this plan.
- [ ] Review all four documents together and make sure the environment language uses the same terms: `public demo`, `government PoC`, `formal production`.

## Task 2: Harden sensitive configuration and startup policy

**Files:**
- Modify: `config/runtime.example.json`
- Modify: `config/runtime.poc.json`
- Modify: `scripts/init-local.ps1`
- Modify: `scripts/init-local.cmd`
- Modify: `src/web/mod.rs`
- Test: `tests/regression.rs`

- [ ] Add a failing regression test that starts PoC-mode config validation with an empty or placeholder `sessionSecret` and expects startup rejection.
- [ ] Add a failing regression test that verifies PoC mode refuses startup when insecure demo-oriented flags are enabled together.
- [ ] Implement runtime validation in `src/web/mod.rs` so PoC mode rejects invalid `sessionSecret`, insecure cookie policy, or conflicting public-demo settings.
- [ ] Adjust `scripts/init-local.ps1` and `scripts/init-local.cmd` so generated local config clearly separates local convenience defaults from PoC deployment requirements.
- [ ] Update `config/runtime.example.json` comments or placeholder values so they no longer read like acceptable production defaults.
- [ ] Run `cargo test --test regression` and confirm the new validation passes.

## Task 3: Enforce public-demo and PoC data boundaries

**Files:**
- Modify: `src/web/mod.rs`
- Modify: `src/platform/v2_store.rs`
- Modify: `static/app/main.js`
- Modify: `static/app/tasks.js`
- Modify: `static/app/admin.js`
- Test: `tests/regression.rs`
- Test: `scripts/test-poc-payloads.test.mjs`

- [ ] Add a failing backend test that verifies public-demo mode blocks real-data import or sensitive export paths.
- [ ] Add a failing frontend or payload test that verifies demo mode shows the correct restricted behavior for upload/export entry points.
- [ ] Implement backend guards for data-import and sensitive-export operations based on deployment policy rather than UI-only checks.
- [ ] Add explicit frontend notices for restricted operations in public-demo mode so the block is visible and understandable.
- [ ] Verify that PoC mode keeps the same main flows available while demo mode remains restricted.
- [ ] Run `cargo test --test regression` and `node --test scripts/test-poc-payloads.test.mjs`.

## Task 4: Add provenance and evidence-chain fields

**Files:**
- Modify: `src/platform/v2.rs`
- Modify: `src/platform/v2_store.rs`
- Modify: `src/report_gen/json_export.rs`
- Modify: `src/report_gen/csv_export.rs`
- Modify: `static/app/report.js`
- Modify: `static/app/tasks.js`
- Test: `tests/regression.rs`

- [ ] Define the minimum provenance fields required for every import batch: source locator, collected time, parser version, field mapping version, and integrity summary.
- [ ] Add a failing test that imports or loads a task and expects provenance metadata to be preserved in stored task detail.
- [ ] Implement the new fields in the Rust domain model and persistence path without changing unrelated task behavior.
- [ ] Surface provenance details in task detail and report views using business-readable labels rather than raw field names only.
- [ ] Extend export output so JSON or CSV evidence views keep the provenance fields needed for third-party review.
- [ ] Run focused regression coverage for task detail and export behavior.

## Task 5: Make rule explanations reviewable and separate confirmed vs candidate findings

**Files:**
- Modify: `src/rule_engine/rules.rs`
- Modify: `src/rule_engine/mod.rs`
- Modify: `src/platform/procurement.rs`
- Modify: `src/platform/v2_store.rs`
- Modify: `static/app/report.js`
- Modify: `static/app/exceptions.js`
- Test: `tests/regression.rs`

- [ ] Define a compact explanation schema for rule hits: purpose, trigger condition, risk level, suggested disposition, and confidence class.
- [ ] Add a failing regression test for at least one fiscal-risk rule that expects explanation metadata in the result structure.
- [ ] Add a failing regression test that distinguishes candidate findings from confirmed findings in rendered or exported data.
- [ ] Implement the explanation metadata in the rule result pipeline while keeping existing scoring and hit behavior stable.
- [ ] Update report and exception views so users can see whether a hit is confirmed, candidate, or requires manual review.
- [ ] Run regression tests and manually inspect one representative rule-hit payload.

## Task 6: Expand high-risk audit logging

**Files:**
- Modify: `src/platform/store.rs`
- Modify: `src/platform/v2_store.rs`
- Modify: `static/app/admin.js`
- Modify: `docs/OPERATIONS.md`
- Test: `tests/regression.rs`

- [ ] List the minimum high-risk events that must produce audit logs in this round: user creation, password reset, AI profile change, connector change, evidence upload, PDF export, sealed export, and deployment-policy change.
- [ ] Add a failing regression test for at least two missing events so logging behavior is pinned before implementation.
- [ ] Implement the missing audit-log writes with consistent action naming and enough detail for actor, target, and outcome review.
- [ ] Update the admin page expectations so recent logs reflect the newly added events in the same style as existing entries.
- [ ] Update `docs/OPERATIONS.md` so the audit-log review checklist names the new event families explicitly.
- [ ] Run focused regression coverage and verify log visibility from an admin flow.

## Task 7: Align role model, rectification flow, and report delivery

**Files:**
- Modify: `src/auth/mod.rs`
- Modify: `src/platform/v2_store.rs`
- Modify: `src/report_gen/pdf_export.rs`
- Modify: `static/index.html`
- Modify: `static/app/admin.js`
- Modify: `static/app/rectification.js`
- Modify: `static/app/cases.js`
- Modify: `docs/GOVERNMENT_POC_PACKAGE.md`
- Test: `tests/regression.rs`

- [ ] Review the current role set in `src/auth/mod.rs` and document which roles are active for the next PoC delivery round.
- [ ] Update admin and documentation surfaces so `department_reviewer`, `supervisor`, and `rectification_user` are not hidden implementation details.
- [ ] Add failing tests for one role-specific permission boundary and one rectification-flow update that should remain allowed.
- [ ] Add minimum rectification timeline fields needed for PoC review: note, reviewer opinion, handling result, and updated time.
- [ ] Extend PDF export metadata with delivery-friendly fields such as template version, export operator, and batch context where those fields already exist.
- [ ] Run focused role, rectification, and export regression commands.

## Task 8: Strengthen operations checks and rerunnable acceptance

**Files:**
- Modify: `src/web/mod.rs`
- Modify: `scripts/check-health.ps1`
- Modify: `scripts/check-health.cmd`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/STATUS.md`

- [ ] Expand `/api/health` or its documented contract so operators can distinguish app, database, OCR/ASR, and policy readiness status.
- [ ] Update local health-check scripts so they display the expanded readiness information in a predictable format.
- [ ] Add an operations checklist section that tells an engineer exactly what to capture as evidence before calling the PoC environment ready.
- [ ] Add a rerun block in `docs/STATUS.md` listing the exact commands used to prove this hardening round passed.
- [ ] Manually run the updated health-check path once the code changes for this phase land.

## Verification Commands

Run the following before calling the hardening round complete:

```powershell
cargo test
node --test scripts/*.test.mjs
cargo test --test regression --test seal_v2_task
./scripts/switch-profile.cmd poc
./scripts/check-health.cmd
```

Expected result:

- Rust tests pass
- Node tests pass
- PoC profile validation passes
- Health output clearly distinguishes readiness areas

## Delivery Notes

- Keep code movement conservative until P0 and P1 behavior is verified.
- Prefer adding validation, provenance, and logging around existing flows over inventing new parallel flows.
- If a task exposes a larger structural problem, document it and defer it to a P2 architecture pass unless it blocks PoC safety or credibility.

## Exit Criteria

This plan is complete when:

- PoC mode is technically safer than public-demo mode
- Real-data boundaries are enforced by code, not only by team convention
- Findings, reports, and exports carry enough provenance for review
- High-risk operations are audit-traceable
- Roles and rectification flow are understandable to delivery teams
- Acceptance can be rerun with stable commands and evidence
