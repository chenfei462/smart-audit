import { state, taskKindLabel } from './state.js';
import { $, api, downloadBlob, notify } from './services.js';
import { renderTaskDetail } from './report.js?v=viz-20260430';
import { loadCases } from './cases.js';
import { buildExceptionBulkStatusPayload } from './payloads.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function riskBadgeClass(level) {
  if (level === 'Critical' || level === 'High') return 'red';
  if (level === 'Medium') return 'gold';
  return 'green';
}

function riskDisplay(level) {
  if (!level) return '-';
  return level;
}

function sourceLabel(source) {
  return source === 'reconciliation' ? 'Chain' : 'Rule';
}

function outcomeLabel(value) {
  return {
    pending_evidence: '待补证据',
    confirmed_issue: '确认异常',
    false_positive: '误报排除',
    rectified: '已整改',
    escalated: '已上报'
  }[value] || value || '-';
}

function priorityLabel(value) {
  return {
    P1: 'P1 / 立即处理',
    P2: 'P2 / 高优先级',
    P3: 'P3 / 常规处理',
    P4: 'P4 / 观察跟踪'
  }[value] || value || '-';
}

function normalizeFilters() {
  return state.currentTaskExceptionFilters || {
    source: 'all',
    prefix: 'all',
    taskKind: 'all',
    severity: 'all',
    status: 'all',
    assigneeKeyword: '',
    contractKeyword: '',
    paymentKeyword: '',
    voucherKeyword: ''
  };
}

function normalizeHistoryFilters() {
  return state.currentTaskExceptionHistoryFilters || {
    status: 'all',
    assigneeKeyword: '',
    changedByKeyword: '',
    changedAtKeyword: ''
  };
}

function normalizedKeyword(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesKeyword(sourceValue, keyword) {
  if (!keyword) return true;
  return String(sourceValue || '').toLowerCase().includes(keyword);
}

function matchesFilters(item, filters) {
  if (filters.source !== 'all' && item.source !== filters.source) return false;
  if (filters.prefix !== 'all' && !String(item.code || '').startsWith(`${filters.prefix}-`)) return false;
  if (filters.taskKind !== 'all' && item.task_kind !== filters.taskKind) return false;
  if (filters.severity !== 'all' && item.severity !== filters.severity) return false;
  if (filters.status !== 'all' && String(item.status || '').toLowerCase() !== filters.status.toLowerCase()) return false;
  if (!matchesKeyword(item.assignee, normalizedKeyword(filters.assigneeKeyword))) return false;
  if (!matchesKeyword(item.contract_no, normalizedKeyword(filters.contractKeyword))) return false;
  if (!matchesKeyword(item.payment_order_no, normalizedKeyword(filters.paymentKeyword))) return false;
  const voucherKeyword = normalizedKeyword(filters.voucherKeyword);
  if (voucherKeyword && !matchesKeyword(item.treasury_voucher_no, voucherKeyword) && !matchesKeyword(item.voucher_no, voucherKeyword)) return false;
  return true;
}

function selectedIds() {
  return new Set(state.currentTaskExceptionSelection || []);
}

function filteredItems() {
  return (state.currentTaskExceptions || []).filter((item) => matchesFilters(item, normalizeFilters()));
}

function timelineEntries() {
  return (state.currentTaskExceptions || []).flatMap((item) =>
    (item.disposition_history || []).map((event) => ({
      ...event,
      exception_id: item.id,
      exception_code: item.code,
      task_title: item.task_title,
      task_kind: item.task_kind,
      severity: item.severity,
      contract_no: item.contract_no,
      payment_order_no: item.payment_order_no,
      treasury_voucher_no: item.treasury_voucher_no,
      voucher_no: item.voucher_no
    }))
  );
}

function matchesHistoryFilters(entry, filters) {
  if (filters.status !== 'all' && String(entry.status || '').toLowerCase() !== filters.status.toLowerCase()) return false;
  if (!matchesKeyword(entry.assignee, normalizedKeyword(filters.assigneeKeyword))) return false;
  if (!matchesKeyword(entry.changed_by, normalizedKeyword(filters.changedByKeyword))) return false;
  if (!matchesKeyword(entry.changed_at, normalizedKeyword(filters.changedAtKeyword))) return false;
  return true;
}

function filteredTimelineEntries() {
  return timelineEntries()
    .filter((entry) => matchesHistoryFilters(entry, normalizeHistoryFilters()))
    .sort((left, right) => String(right.changed_at || '').localeCompare(String(left.changed_at || '')) || String(left.exception_code || '').localeCompare(String(right.exception_code || '')));
}

function reminderCount(item) {
  return Number(item.reminder_count || 0);
}

function isClosedStatus(status) {
  const value = String(status || '').toLowerCase();
  return value === 'resolved' || value === 'closed';
}

function isOverdue(item) {
  if (!item?.remediation_due_at || isClosedStatus(item.status)) return false;
  const dueAt = new Date(`${item.remediation_due_at}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return false;
  return dueAt.getTime() < Date.now();
}

function renderContextRow(label, value) {
  if (!value) return '';
  return `<div class="muted" style="margin-top:4px;">${escapeHtml(label)}: ${escapeHtml(value)}</div>`;
}

function renderDispositionHistory(history) {
  if (!Array.isArray(history) || !history.length) return '';
  return `
    <div class="muted" style="margin-top:8px;">History:</div>
    <div style="margin-top:6px;display:grid;gap:6px;">
      ${history.map((event) => `
        <div class="notice" style="padding:10px;">
          <div><strong>${escapeHtml(event.status)}</strong> / ${escapeHtml(event.changed_at)}</div>
          ${renderContextRow('Assignee', event.assignee)}
          ${renderContextRow('Note', event.disposition_note)}
          ${renderContextRow('Priority', priorityLabel(event.disposition_priority))}
          ${renderContextRow('Outcome', outcomeLabel(event.disposition_outcome))}
          ${renderContextRow('Due At', event.remediation_due_at)}
          ${renderContextRow('Reminder', event.reminder_flag === null || event.reminder_flag === undefined ? '' : (event.reminder_flag ? '催办中' : '未催办'))}
          ${renderContextRow('Changed By', event.changed_by)}
        </div>
      `).join('')}
    </div>
  `;
}

function renderReminderHistory(history) {
  if (!Array.isArray(history) || !history.length) return '';
  return `
    <div class="muted" style="margin-top:8px;">Reminder History:</div>
    <div style="margin-top:6px;display:grid;gap:6px;">
      ${history.map((event) => `
        <div class="notice" style="padding:10px;">
          <div><strong>${event.reminder_flag ? '催办中' : '已清除催办'}</strong> / ${escapeHtml(event.changed_at)}</div>
          ${renderContextRow('Note', event.reminder_note)}
          ${renderContextRow('Changed By', event.changed_by)}
        </div>
      `).join('')}
    </div>
  `;
}

function renderReceiptAttachments(item) {
  const attachments = item.receipt_attachments || [];
  const rows = attachments.length
    ? attachments.map((attachment) => `
        <div class="notice" style="padding:10px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div>
              <strong>${escapeHtml(attachment.file_name)}</strong>
              ${renderContextRow('Uploaded By', attachment.uploaded_by)}
              ${renderContextRow('Uploaded At', attachment.uploaded_at)}
              ${renderContextRow('Note', attachment.note)}
            </div>
            <a class="btn-secondary" href="/api/tasks/${encodeURIComponent(item.task_id)}/exceptions/${encodeURIComponent(item.id)}/receipts/${encodeURIComponent(attachment.id)}">下载</a>
          </div>
        </div>
      `).join('')
    : '<div class="muted" style="margin-top:6px;">暂无整改回执。</div>';
  return `
    <div class="muted" style="margin-top:8px;">Receipts:</div>
    <div style="margin-top:6px;display:grid;gap:6px;">${rows}</div>
    <div style="margin-top:8px;display:grid;gap:8px;">
      <input type="file" class="exception-receipt-file" data-exception-id="${escapeHtml(item.id)}">
      <input type="text" class="exception-receipt-note" data-exception-id="${escapeHtml(item.id)}" placeholder="回执备注">
      <button class="btn-secondary exception-receipt-upload" type="button" data-exception-id="${escapeHtml(item.id)}" data-task-id="${escapeHtml(item.task_id)}" data-source="${escapeHtml(item.source)}">上传整改回执</button>
    </div>
  `;
}

function renderWorkflowStats() {
  const root = $('exceptionWorkflowStats');
  if (!root) return;
  const items = state.currentTaskExceptions || [];
  if (!state.currentTask) {
    root.innerHTML = '<div class="muted">暂无工单统计。</div>';
    return;
  }
  const overdueCount = items.filter((item) => isOverdue(item)).length;
  const reminderTotal = items.reduce((sum, item) => sum + reminderCount(item), 0);
  const priorityOpen = items.filter((item) => ['P1', 'P2'].includes(item.disposition_priority) && !isClosedStatus(item.status)).length;
  const receiptTotal = items.reduce((sum, item) => sum + ((item.receipt_attachments || []).length), 0);
  root.innerHTML = `
    <div class="grid-4">
      <div class="notice"><strong>超期工单</strong><div style="margin-top:8px;">${escapeHtml(overdueCount)}</div></div>
      <div class="notice"><strong>催办次数</strong><div style="margin-top:8px;">${escapeHtml(reminderTotal)}</div></div>
      <div class="notice"><strong>P1/P2 未闭环</strong><div style="margin-top:8px;">${escapeHtml(priorityOpen)}</div></div>
      <div class="notice"><strong>整改回执附件</strong><div style="margin-top:8px;">${escapeHtml(receiptTotal)}</div></div>
    </div>
  `;
}

function renderOverdueView() {
  const root = $('exceptionOverdueList');
  if (!root) return;
  if (!state.currentTask) {
    root.innerHTML = '<div class="muted">暂无超期视图。</div>';
    return;
  }
  const items = (state.currentTaskExceptions || []).filter((item) => isOverdue(item));
  root.innerHTML = items.length
    ? items.map((item) => `
        <div class="notice" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
            <div>
              <strong>${escapeHtml(item.code)}</strong>
              <div class="muted" style="margin-top:4px;">${escapeHtml(item.summary)}</div>
            </div>
            <span class="badge ${riskBadgeClass(item.severity)}">${escapeHtml(riskDisplay(item.severity))}</span>
          </div>
          ${renderContextRow('Priority', priorityLabel(item.disposition_priority))}
          ${renderContextRow('Due At', item.remediation_due_at)}
          ${renderContextRow('Assignee', item.assignee)}
          ${renderContextRow('Reminder Count', reminderCount(item))}
          ${renderContextRow('Task', item.task_title)}
        </div>
      `).join('')
    : '<div class="muted">当前没有超期工单。</div>';
}

function renderTimelineRow(entry) {
  return `
    <div class="notice" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <strong>${escapeHtml(entry.exception_code)}</strong>
          <div class="muted" style="margin-top:4px;">${escapeHtml(taskKindLabel(entry.task_kind))} / ${escapeHtml(entry.task_title)}</div>
        </div>
        <span class="badge ${riskBadgeClass(entry.severity)}">${escapeHtml(riskDisplay(entry.severity))}</span>
      </div>
      <div style="margin-top:8px;"><strong>${escapeHtml(entry.status)}</strong> / ${escapeHtml(entry.changed_at)}</div>
      ${renderContextRow('Changed By', entry.changed_by)}
      ${renderContextRow('Assignee', entry.assignee)}
      ${renderContextRow('Note', entry.disposition_note)}
      ${renderContextRow('Priority', priorityLabel(entry.disposition_priority))}
      ${renderContextRow('Outcome', outcomeLabel(entry.disposition_outcome))}
      ${renderContextRow('Due At', entry.remediation_due_at)}
      ${renderContextRow('Reminder', entry.reminder_flag === null || entry.reminder_flag === undefined ? '' : (entry.reminder_flag ? '催办中' : '未催办'))}
      ${renderContextRow('Contract', entry.contract_no)}
      ${renderContextRow('Payment', entry.payment_order_no)}
      ${renderContextRow('Treasury Voucher', entry.treasury_voucher_no)}
      ${renderContextRow('Ledger Voucher', entry.voucher_no)}
    </div>
  `;
}

function renderTimelineView() {
  const root = $('exceptionTimelineList');
  if (!root) return;
  const filters = normalizeHistoryFilters();
  if ($('exceptionTimelineStatusFilter')) $('exceptionTimelineStatusFilter').value = filters.status;
  if ($('exceptionTimelineAssigneeFilter')) $('exceptionTimelineAssigneeFilter').value = filters.assigneeKeyword;
  if ($('exceptionTimelineChangedByFilter')) $('exceptionTimelineChangedByFilter').value = filters.changedByKeyword;
  if ($('exceptionTimelineChangedAtFilter')) $('exceptionTimelineChangedAtFilter').value = filters.changedAtKeyword;

  if (!state.currentTask) {
    root.innerHTML = '<div class="muted">No disposition timeline.</div>';
    if ($('exceptionTimelineMeta')) $('exceptionTimelineMeta').textContent = 'Timeline 0';
    return;
  }

  const entries = filteredTimelineEntries();
  root.innerHTML = entries.length
    ? entries.map((entry) => renderTimelineRow(entry)).join('')
    : '<div class="muted">No disposition events under current filters.</div>';
  if ($('exceptionTimelineMeta')) $('exceptionTimelineMeta').textContent = `Timeline ${entries.length}`;
}

function toCsvValue(value) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function renderExceptionItem(item) {
  const checked = selectedIds().has(item.id) ? 'checked' : '';
  return `
    <div class="notice" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <label style="display:flex;gap:10px;align-items:flex-start;flex:1;">
          <input type="checkbox" class="exception-select" data-exception-id="${escapeHtml(item.id)}" ${checked}>
          <div style="flex:1;">
            <strong>${escapeHtml(item.code)}</strong>
            <div class="muted" style="margin-top:4px;">${escapeHtml(sourceLabel(item.source))} / ${escapeHtml(item.category || '-')} / ${escapeHtml(taskKindLabel(item.task_kind))}</div>
          </div>
        </label>
        <span class="badge ${riskBadgeClass(item.severity)}">${escapeHtml(riskDisplay(item.severity))}</span>
      </div>
      <div style="margin-top:8px;">${escapeHtml(item.summary)}</div>
      <div class="muted" style="margin-top:8px;">Status: ${escapeHtml(item.status || '-')}</div>
      ${renderContextRow('Assignee', item.assignee)}
      ${renderContextRow('Disposed At', item.disposed_at)}
      ${renderContextRow('Note', item.disposition_note)}
      ${renderContextRow('Priority', priorityLabel(item.disposition_priority))}
      ${renderContextRow('Outcome', outcomeLabel(item.disposition_outcome))}
      ${renderContextRow('Due At', item.remediation_due_at)}
      ${renderContextRow('Reminder', item.reminder_flag ? '催办中' : '未催办')}
      ${renderContextRow('Reminder Count', reminderCount(item))}
      ${renderContextRow('Task', item.task_title)}
      ${renderContextRow('Contract', item.contract_no)}
      ${renderContextRow('Payment', item.payment_order_no)}
      ${renderContextRow('Treasury Voucher', item.treasury_voucher_no)}
      ${renderContextRow('Ledger Voucher', item.voucher_no)}
      ${renderContextRow('Source Record', item.source_record_id)}
      ${renderContextRow('Related Record', item.related_record_id)}
      ${renderContextRow('Evidence', item.evidence_summary)}
      ${renderContextRow('Action', item.recommended_action)}
      ${renderDispositionHistory(item.disposition_history)}
      ${renderReminderHistory(item.reminder_history)}
      ${renderReceiptAttachments(item)}
    </div>
  `;
}

function syncSelectionBindings() {
  document.querySelectorAll('.exception-select').forEach((node) => {
    node.onchange = () => {
      const next = selectedIds();
      if (node.checked) {
        next.add(node.dataset.exceptionId);
      } else {
        next.delete(node.dataset.exceptionId);
      }
      state.currentTaskExceptionSelection = Array.from(next);
      updateExceptionSelectionState();
    };
  });
}

function syncReceiptBindings() {
  document.querySelectorAll('.exception-receipt-upload').forEach((node) => {
    node.onclick = () => uploadExceptionReceipt(node.dataset.taskId, node.dataset.exceptionId, node.dataset.source)
      .catch((error) => notify(error.message, 'error'));
  });
}

function updateExceptionSelectionState() {
  const items = filteredItems();
  const selected = items.filter((item) => selectedIds().has(item.id));
  if ($('exceptionSelectionMeta')) {
    $('exceptionSelectionMeta').textContent = `Filtered ${items.length} / Selected ${selected.length}`;
  }
  if ($('exceptionSelectAll')) {
    $('exceptionSelectAll').checked = items.length > 0 && selected.length === items.length;
    $('exceptionSelectAll').indeterminate = selected.length > 0 && selected.length < items.length;
  }
  if ($('applyExceptionBulkBtn')) {
    $('applyExceptionBulkBtn').disabled = selected.length === 0;
  }
}

export function syncTaskExceptionFilters() {
  state.currentTaskExceptionFilters = {
    source: $('exceptionSourceFilter')?.value || 'all',
    prefix: $('exceptionPrefixFilter')?.value || 'all',
    taskKind: $('exceptionTaskKindFilter')?.value || 'all',
    severity: $('exceptionSeverityFilter')?.value || 'all',
    status: $('exceptionStatusFilter')?.value || 'all',
    assigneeKeyword: $('exceptionAssigneeFilter')?.value || '',
    contractKeyword: $('exceptionContractFilter')?.value || '',
    paymentKeyword: $('exceptionPaymentFilter')?.value || '',
    voucherKeyword: $('exceptionVoucherFilter')?.value || ''
  };
  renderTaskExceptionPool();
}

export function syncTaskExceptionHistoryFilters() {
  state.currentTaskExceptionHistoryFilters = {
    status: $('exceptionTimelineStatusFilter')?.value || 'all',
    assigneeKeyword: $('exceptionTimelineAssigneeFilter')?.value || '',
    changedByKeyword: $('exceptionTimelineChangedByFilter')?.value || '',
    changedAtKeyword: $('exceptionTimelineChangedAtFilter')?.value || ''
  };
  renderTimelineView();
}

export function toggleSelectAllFilteredExceptions() {
  const ids = selectedIds();
  const items = filteredItems();
  const allSelected = items.length > 0 && items.every((item) => ids.has(item.id));
  items.forEach((item) => {
    if (allSelected) {
      ids.delete(item.id);
    } else {
      ids.add(item.id);
    }
  });
  state.currentTaskExceptionSelection = Array.from(ids);
  renderTaskExceptionPool();
}

export async function submitExceptionBulkStatus() {
  if (!state.currentTask?.id) {
    return notify('No active task', 'error');
  }
  const status = $('exceptionBulkStatusSelect')?.value || '';
  const assignee = String($('exceptionBulkAssignee')?.value || '').trim();
  const dispositionNote = String($('exceptionBulkNote')?.value || '').trim();
  const dispositionPriority = String($('exceptionBulkPrioritySelect')?.value || '').trim();
  const dispositionOutcome = String($('exceptionBulkOutcomeSelect')?.value || '').trim();
  const remediationDueAt = String($('exceptionBulkDueAt')?.value || '').trim();
  const reminderMode = String($('exceptionBulkReminderSelect')?.value || '').trim();
  const reminderNote = String($('exceptionBulkReminderNote')?.value || '').trim();
  const items = filteredItems().filter((item) => selectedIds().has(item.id));
  if (!items.length) {
    return notify('Select at least one exception', 'error');
  }
  await api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}/exceptions/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildExceptionBulkStatusPayload({
      taskId: state.currentTask.id,
      items,
      status,
      assignee,
      dispositionNote,
      dispositionPriority,
      dispositionOutcome,
      remediationDueAt,
      reminderMode,
      reminderNote
    }))
  });
  const [task, exceptions] = await Promise.all([
    api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}`),
    api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}/exceptions`)
  ]);
  state.currentTask = task;
  state.currentTaskExceptions = Array.isArray(exceptions) ? exceptions : [];
    state.currentTaskExceptionSelection = [];
    if ($('exceptionBulkNote')) $('exceptionBulkNote').value = '';
    if ($('exceptionBulkReminderNote')) $('exceptionBulkReminderNote').value = '';
    await loadCases();
    renderTaskDetail();
    renderTaskExceptionPool();
    renderTimelineView();
  notify(`Updated ${items.length} exceptions`);
}

async function refreshExceptionPoolState() {
  const [task, exceptions] = await Promise.all([
    api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}`),
    api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}/exceptions`)
  ]);
  state.currentTask = task;
  state.currentTaskExceptions = Array.isArray(exceptions) ? exceptions : [];
}

export async function uploadExceptionReceipt(taskId, exceptionId, source) {
  if (!state.currentTask?.id || state.currentTask.id !== taskId) {
    return notify('No active task', 'error');
  }
  const fileInput = document.querySelector(`.exception-receipt-file[data-exception-id="${CSS.escape(exceptionId)}"]`);
  const noteInput = document.querySelector(`.exception-receipt-note[data-exception-id="${CSS.escape(exceptionId)}"]`);
  const file = fileInput?.files?.[0];
  if (!file) {
    return notify('Select a receipt file first', 'error');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source || 'rule');
  if (noteInput?.value) {
    formData.append('note', noteInput.value.trim());
  }
  await api(`/api/tasks/${encodeURIComponent(taskId)}/exceptions/${encodeURIComponent(exceptionId)}/receipts`, {
    method: 'POST',
    body: formData
  });
  if (fileInput) fileInput.value = '';
  if (noteInput) noteInput.value = '';
  await refreshExceptionPoolState();
  renderTaskDetail();
  renderTaskExceptionPool();
  notify('Receipt uploaded');
}

export function exportExceptionDispositionHistory() {
  const entries = filteredTimelineEntries();
  if (!entries.length) {
    return notify('No timeline records under current filters', 'error');
  }
  const header = [
    'exception_code',
    'task_kind',
    'task_title',
    'status',
    'changed_at',
    'changed_by',
    'assignee',
    'disposition_note',
    'disposition_priority',
    'disposition_outcome',
    'remediation_due_at',
    'reminder_flag',
    'contract_no',
    'payment_order_no',
    'treasury_voucher_no',
    'voucher_no'
  ];
  const rows = entries.map((entry) => ([
    entry.exception_code,
    taskKindLabel(entry.task_kind),
    entry.task_title,
    entry.status,
    entry.changed_at,
    entry.changed_by,
    entry.assignee || '',
    entry.disposition_note || '',
    priorityLabel(entry.disposition_priority),
    outcomeLabel(entry.disposition_outcome),
    entry.remediation_due_at || '',
    entry.reminder_flag === null || entry.reminder_flag === undefined ? '' : (entry.reminder_flag ? '催办中' : '未催办'),
    entry.contract_no || '',
    entry.payment_order_no || '',
    entry.treasury_voucher_no || '',
    entry.voucher_no || ''
  ].map(toCsvValue).join(',')));
  const csv = [header.join(','), ...rows].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `exception-disposition-history-${state.currentTask?.id || 'task'}.csv`);
}

export function renderTaskExceptionPool() {
  const root = $('exceptionPoolList');
  if (!root) return;

  const filters = normalizeFilters();
  if ($('exceptionSourceFilter')) $('exceptionSourceFilter').value = filters.source;
  if ($('exceptionPrefixFilter')) $('exceptionPrefixFilter').value = filters.prefix;
  if ($('exceptionTaskKindFilter')) $('exceptionTaskKindFilter').value = filters.taskKind;
  if ($('exceptionSeverityFilter')) $('exceptionSeverityFilter').value = filters.severity;
  if ($('exceptionStatusFilter')) $('exceptionStatusFilter').value = filters.status;
  if ($('exceptionAssigneeFilter')) $('exceptionAssigneeFilter').value = filters.assigneeKeyword;
  if ($('exceptionContractFilter')) $('exceptionContractFilter').value = filters.contractKeyword;
  if ($('exceptionPaymentFilter')) $('exceptionPaymentFilter').value = filters.paymentKeyword;
  if ($('exceptionVoucherFilter')) $('exceptionVoucherFilter').value = filters.voucherKeyword;

  if (!state.currentTask) {
    root.innerHTML = '<div class="muted">No exception pool.</div>';
    updateExceptionSelectionState();
    renderWorkflowStats();
    renderOverdueView();
    renderTimelineView();
    return;
  }

  const items = filteredItems();
  root.innerHTML = items.length
    ? items.map((item) => renderExceptionItem(item)).join('')
    : '<div class="muted">No exceptions under current filters.</div>';
  syncSelectionBindings();
  syncReceiptBindings();
  updateExceptionSelectionState();
  renderWorkflowStats();
  renderOverdueView();
  renderTimelineView();
}


