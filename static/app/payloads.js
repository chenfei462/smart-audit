export function buildExceptionBulkStatusPayload({
  taskId,
  items,
  status,
  assignee = '',
  dispositionNote = '',
  dispositionPriority = '',
  dispositionOutcome = '',
  remediationDueAt = '',
  reminderMode = '',
  reminderNote = ''
}) {
  return {
    status,
    assignee: assignee || null,
    disposition_note: dispositionNote || null,
    disposition_priority: dispositionPriority || null,
    disposition_outcome: dispositionOutcome || null,
    remediation_due_at: remediationDueAt || null,
    reminder_flag: reminderMode === '' ? null : reminderMode === 'true',
    reminder_note: reminderNote || null,
    targets: items.map((item) => ({
      task_id: item.task_id || taskId,
      exception_id: item.id,
      source: item.source
    }))
  };
}

export function validateCaseSeedPreviewForImport(preview) {
  if (!preview?.records?.length) {
    return '请先完成案件种子预检';
  }
  if (!Array.isArray(preview.records)) {
    return '案件种子 payload 必须包含 records 数组';
  }
  const missingMapping = (preview.field_mappings || []).some((mapping) => !mapping.source_field || !mapping.target_field);
  if (missingMapping) {
    return '案件种子字段映射不完整，请重新预检或修正映射';
  }
  return '';
}

export function buildCaseSeedImportPayload({
  preview,
  title,
  templateKind,
  mappingOverrides = [],
  assignmentRules = []
}) {
  return {
    title: title || preview.title || '监督评审台账导入',
    template_kind: templateKind || 'investment_review',
    mapping_overrides: mappingOverrides,
    assignment_rules: assignmentRules,
    records: preview.records
  };
}

export function normalizeAutomationScheduleKind(kind) {
  return kind === 'manual' ? 'manual_only' : (kind || 'manual_only');
}
