# API Summary

## Public bootstrap, lead intake, and auth

- `GET /api/bootstrap`
- `POST /api/public/requests`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

`GET /api/bootstrap` now exposes deployment policy flags used by the frontend:

- `deployment_policy.secure_cookies`
- `deployment_policy.baseline`
- `deployment_policy.deviations`
- `deployment_policy.allow_public_registration`
- `deployment_policy.ai_enabled`
- `deployment_policy.public_demo_mode`
- `deployment_policy.ocr_enabled`
- `deployment_policy.speech_enabled`

`GET /api/health/details` returns component status:

```json
{
  "status": "ok",
  "db": "ok",
  "ocr": "enabled",
  "asr": "enabled",
  "ai": "disabled_by_policy",
  "connectors": "configured"
}
```

## Task workflow

- `GET /api/tasks`
- `POST /api/tasks/demo`
- `POST /api/tasks/file`
- `POST /api/tasks/database`
- `GET /api/tasks/{task_id}`
- `GET /api/tasks/{task_id}/artifacts`
- `POST /api/tasks/{task_id}/artifacts/image`
- `POST /api/tasks/{task_id}/artifacts/audio`
- `POST /api/tasks/{task_id}/artifacts/{artifact_id}/retry`
- `POST /api/tasks/{task_id}/findings/{finding_id}`
- `POST /api/tasks/{task_id}/ai`
- `POST /api/tasks/{task_id}/export/pdf`
- `GET /api/tasks/{task_id}/report.pdf`
- `POST /api/tasks/{task_id}/seal`

`GET /api/tasks/{task_id}` uses the unified task lookup and returns `task_origin`:

- `legacy_demo`
- `v2_platform`
- `v2_typed`

Missing task responses use:

```json
{
  "error": "task not found",
  "hint": "Use a task id returned by POST /api/tasks/demo, a v2 import task, or GET /api/tasks.",
  "expected_schema_url": "/docs/API.md#task-detail"
}
```

## Sealed export

`POST /api/tasks/{task_id}/seal` returns `application/zip` with:

- `manifest.json`
- `encrypted_payload.json`

`manifest.json` schema:

```json
{
  "task_id": "task-id",
  "exported_by": "auditor",
  "exported_at": "2026-05-06T00:00:00Z",
  "rule_version": "0.3.0",
  "template_version": "gov-standard-v1",
  "files": [{ "name": "encrypted_payload.json", "sha256": "..." }],
  "signature": "..."
}
```

The payload contains task base information, `task_origin`, `task_kind`, rule results, associated budget/linkage summary, evidence summary, rectification status, operator, generation time, rule version, and template version.

Verify a package:

```powershell
cargo run --bin seal-verify -- path\to\sealed-package.zip
```

Expected output is `OK`; hash or signature mismatches produce a readable error.

## Exceptions status

`POST /api/tasks/{task_id}/exceptions/status`

```json
{
  "status": "in_progress",
  "assignee": "auditor",
  "disposition_note": "reviewed",
  "targets": [
    { "task_id": "task-id", "exception_id": "finding-id", "source": "rule" }
  ]
}
```

For backward compatibility, `targets[].task_id` may be omitted; the path `task_id` is used. If an explicit target task id differs from the path id, the server returns:

```json
{
  "error": "task_id mismatch",
  "hint": "targets[].task_id must be omitted or equal to the path task_id",
  "expected_schema_url": "/docs/API.md#exceptions-status"
}
```

## Case seed import

`POST /api/case-seeds/import`

Minimum payload:

```json
{
  "title": "监督评审台账导入",
  "template_kind": "investment_review",
  "mapping_overrides": [],
  "assignment_rules": [],
  "records": [
    { "case_no": "NJ-001", "title": "项目复核", "unit": "南京商务局" }
  ]
}
```

Missing `records` returns a structured 400:

```json
{
  "error": "missing field records",
  "hint": "Expected JSON shape: { \"records\": [ ... ] }",
  "expected_schema_url": "/docs/API.md#case-seed-import"
}
```

## Automation schedules

`POST /api/automation/schedules`

Supported `schedule_kind` values:

- `manual_only`
- `hourly`
- `daily`
- `weekly`
- `cron`
- `interval`

Legacy `manual` is rejected with a hint to use `manual_only`.

## Admin

- `GET /api/admin/overview`
- `POST /api/admin/users`
- `POST /api/admin/users/{user_id}/reset-password`
- `POST /api/admin/ai-profile`

`GET /api/admin/overview` also returns:

- `lead_requests`
- `deployment_policy`

## Behavior rules

- All task and admin routes require a session
- Public lead intake does not require a session
- Database-source audits require `admin`
- File audits require `admin` or `auditor`
- Artifact uploads and retries require `admin` or `auditor`
- Viewer accounts cannot create audits or export sensitive artifacts
- AI analysis can be hard-disabled by deployment policy even if the AI profile is configured
- OCR and speech recognition can be independently disabled by deployment policy
- Public self-registration should stay disabled in public demo and PoC environments once initialization is complete
