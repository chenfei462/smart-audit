import { state, taskKindLabel } from './state.js';
import { $, api, notify } from './services.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function filters() {
  return state.currentCaseFilters || {
    taskKind: 'all',
    caseStatus: 'all',
    currentStage: 'all',
    handlerKeyword: ''
  };
}

function matchesCase(caseItem, currentFilters) {
  if (currentFilters.taskKind !== 'all' && caseItem.task_kind !== currentFilters.taskKind) return false;
  if (currentFilters.caseStatus !== 'all' && caseItem.case_status !== currentFilters.caseStatus) return false;
  if (currentFilters.currentStage !== 'all' && caseItem.current_stage !== currentFilters.currentStage) return false;
  const keyword = String(currentFilters.handlerKeyword || '').trim().toLowerCase();
  if (keyword && !String(caseItem.current_handler_display_name || '').toLowerCase().includes(keyword)) return false;
  return true;
}

function filteredCases() {
  return (state.cases || []).filter((item) => matchesCase(item, filters()));
}

function selectedIds() {
  return new Set(state.currentCaseSelection || []);
}

function overdueLabel(caseItem) {
  return Number(caseItem.overdue_days || 0) > 0 ? `超期 ${caseItem.overdue_days} 天` : '未超期';
}

function metricsCards() {
  const metrics = state.caseMetrics;
  if (!metrics) {
    return '<div class="muted">暂无案件指标。</div>';
  }
  return `
    <div class="grid-4">
      <div class="notice"><strong>案件总数</strong><div style="margin-top:8px;">${escapeHtml(metrics.total_cases)}</div></div>
      <div class="notice"><strong>未结案件</strong><div style="margin-top:8px;">${escapeHtml(metrics.open_cases)}</div></div>
      <div class="notice"><strong>超期未结</strong><div style="margin-top:8px;">${escapeHtml(metrics.overdue_open_cases)}</div></div>
      <div class="notice"><strong>按期办结</strong><div style="margin-top:8px;">${escapeHtml(metrics.on_time_closed_cases)}</div></div>
    </div>
  `;
}

function renderBuckets(title, buckets) {
  if (!buckets?.length) return '';
  return `
    <div class="notice">
      <strong>${escapeHtml(title)}</strong>
      <div class="muted" style="margin-top:8px;">
        ${buckets.slice(0, 6).map((item) => `${escapeHtml(item.key)}: ${escapeHtml(item.count)}`).join('<br>')}
      </div>
    </div>
  `;
}

function renderCaseCard(caseItem) {
  const selected = selectedIds().has(caseItem.id);
  return `
    <div class="notice" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input class="case-select" type="checkbox" data-case-id="${escapeHtml(caseItem.id)}" ${selected ? 'checked' : ''}>
          <div>
            <strong>${escapeHtml(caseItem.case_no)}</strong>
            <div class="muted" style="margin-top:4px;">${escapeHtml(caseItem.exception_code)} / ${escapeHtml(caseItem.exception_title)}</div>
          </div>
        </label>
        <span class="badge ${caseItem.risk_level === 'High' || caseItem.risk_level === 'Critical' ? 'red' : (caseItem.risk_level === 'Medium' ? 'gold' : 'green')}">${escapeHtml(caseItem.risk_level)}</span>
      </div>
      <div style="margin-top:8px;">${escapeHtml(caseItem.exception_summary)}</div>
      <div class="muted" style="margin-top:8px;">任务：${escapeHtml(taskKindLabel(caseItem.task_kind))} / 规则域：${escapeHtml(caseItem.rule_domain)}</div>
      <div class="muted" style="margin-top:4px;">阶段：${escapeHtml(caseItem.current_stage)} / 状态：${escapeHtml(caseItem.case_status)}</div>
      <div class="muted" style="margin-top:4px;">责任人：${escapeHtml(caseItem.current_handler_display_name || '-')} / 优先级：${escapeHtml(caseItem.priority)}</div>
      <div class="muted" style="margin-top:4px;">整改单位：${escapeHtml(caseItem.rectification_unit_name || '-')} / SLA：${escapeHtml(caseItem.sla_due_at || '-')}</div>
      <div class="muted" style="margin-top:4px;">${escapeHtml(overdueLabel(caseItem))} / 催办 ${escapeHtml(caseItem.reminder_count)} 次 / 升级 ${escapeHtml(caseItem.escalation_count)} 次</div>
    </div>
  `;
}

function syncSelectionBindings() {
  document.querySelectorAll('.case-select').forEach((node) => {
    node.onchange = () => {
      const next = new Set(state.currentCaseSelection || []);
      if (node.checked) {
        next.add(node.dataset.caseId);
      } else {
        next.delete(node.dataset.caseId);
      }
      state.currentCaseSelection = [...next];
      renderCaseWorkbench();
    };
  });
}

export async function loadCases() {
  const [cases, metrics] = await Promise.all([
    api('/api/cases'),
    api('/api/cases/metrics')
  ]);
  state.cases = cases;
  state.caseMetrics = metrics;
  renderCaseWorkbench();
}

export function renderCaseWorkbench() {
  const metricsRoot = $('caseMetricsPanel');
  const listRoot = $('caseList');
  const summaryRoot = $('caseSelectionMeta');
  const boardRoot = $('caseBoard');
  if (!metricsRoot || !listRoot || !summaryRoot || !boardRoot) return;
  if (!state.user) return;
  metricsRoot.innerHTML = metricsCards() + `
    <div class="grid-3" style="margin-top:12px;">
      ${renderBuckets('按任务类型', state.caseMetrics?.by_task_kind)}
      ${renderBuckets('按规则域', state.caseMetrics?.by_rule_domain)}
      ${renderBuckets('按责任人', state.caseMetrics?.by_handler)}
    </div>
  `;
  const items = filteredCases();
  listRoot.innerHTML = items.length
    ? items.map((item) => renderCaseCard(item)).join('')
    : '<div class="muted">当前筛选条件下暂无案件。</div>';
  summaryRoot.textContent = `Filtered ${items.length} / Selected ${(state.currentCaseSelection || []).length}`;
  syncSelectionBindings();
}

export function syncCaseFilters() {
  state.currentCaseFilters = {
    taskKind: $('caseTaskKindFilter')?.value || 'all',
    caseStatus: $('caseStatusFilter')?.value || 'all',
    currentStage: $('caseStageFilter')?.value || 'all',
    handlerKeyword: $('caseHandlerFilter')?.value || ''
  };
  state.currentCaseSelection = [];
  renderCaseWorkbench();
}

export function toggleSelectAllFilteredCases() {
  const filtered = filteredCases().map((item) => item.id);
  const selected = new Set(state.currentCaseSelection || []);
  const allSelected = filtered.length > 0 && filtered.every((id) => selected.has(id));
  state.currentCaseSelection = allSelected ? [] : filtered;
  renderCaseWorkbench();
}

export async function submitCaseAssign() {
  if (!(state.currentCaseSelection || []).length) {
    throw new Error('请先选择案件');
  }
  const payload = {
    case_ids: state.currentCaseSelection,
    assignee: $('caseBulkAssignee')?.value || '',
    source_department: $('caseSourceDepartment')?.value || '',
    target_department: $('caseTargetDepartment')?.value || '',
    rectification_unit_name: $('caseRectificationUnit')?.value || '',
    sla_due_at: $('caseBulkDueAt')?.value || ''
  };
  await api('/api/cases/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  notify('案件已分发');
  await loadCases();
}

export async function submitCaseTransition() {
  if (!(state.currentCaseSelection || []).length) {
    throw new Error('请先选择案件');
  }
  const reminderValue = $('caseReminderFlag')?.value || '';
  const payload = {
    case_ids: state.currentCaseSelection,
    current_stage: $('caseStageSelect')?.value || 'Assigned',
    note: $('caseTransitionNote')?.value || '',
    outcome: $('caseOutcomeSelect')?.value || '',
    priority: $('casePrioritySelect')?.value || '',
    due_at: $('caseTransitionDueAt')?.value || '',
    reminder_flag: reminderValue === '' ? null : reminderValue === 'true'
  };
  await api('/api/cases/transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  notify('案件已流转');
  await loadCases();
}
