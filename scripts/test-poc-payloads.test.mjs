import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCaseSeedImportPayload,
  buildExceptionBulkStatusPayload,
  normalizeAutomationScheduleKind,
  validateCaseSeedPreviewForImport,
} from '../static/app/payloads.js';

test('exception bulk status payload carries path task_id into every target', () => {
  const payload = buildExceptionBulkStatusPayload({
    taskId: 'task-001',
    status: 'in_progress',
    items: [
      { id: 'finding-1', source: 'rule' },
      { id: 'finding-2', source: 'reconciliation', task_id: 'task-001' },
    ],
  });

  assert.deepEqual(payload.targets, [
    { task_id: 'task-001', exception_id: 'finding-1', source: 'rule' },
    { task_id: 'task-001', exception_id: 'finding-2', source: 'reconciliation' },
  ]);
});

test('case seed import payload always wraps preview rows in records', () => {
  const preview = {
    title: 'PoC case seed',
    records: [{ case_no: 'NJ-001' }],
    field_mappings: [{ source_field: 'case_no', target_field: 'case_no' }],
  };

  assert.equal(validateCaseSeedPreviewForImport(preview), '');
  assert.deepEqual(buildCaseSeedImportPayload({
    preview,
    templateKind: 'investment_review',
    mappingOverrides: [{ source_field: 'a', target_field: 'b' }],
    assignmentRules: [{ field: 'region', value: '南京' }],
  }), {
    title: 'PoC case seed',
    template_kind: 'investment_review',
    mapping_overrides: [{ source_field: 'a', target_field: 'b' }],
    assignment_rules: [{ field: 'region', value: '南京' }],
    records: [{ case_no: 'NJ-001' }],
  });
});

test('automation schedule kind normalizes legacy manual to manual_only', () => {
  assert.equal(normalizeAutomationScheduleKind('manual'), 'manual_only');
  assert.equal(normalizeAutomationScheduleKind('manual_only'), 'manual_only');
  assert.equal(normalizeAutomationScheduleKind('daily'), 'daily');
  assert.equal(normalizeAutomationScheduleKind(''), 'manual_only');
});
