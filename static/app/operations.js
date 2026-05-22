import { state } from './state.js';
import { $, api, downloadBlob } from './services.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBuckets(title, payload) {
  if (!payload?.buckets?.length) {
    return `<div class="notice"><strong>${escapeHtml(title)}</strong><div class="muted" style="margin-top:8px;">暂无数据</div></div>`;
  }
  return `
    <div class="notice">
      <strong>${escapeHtml(title)}</strong>
      <div class="muted" style="margin-top:8px;">${payload.buckets.slice(0, 8).map((item) => `${escapeHtml(item.key)}: ${escapeHtml(item.count)}`).join('<br>')}</div>
    </div>
  `;
}

export async function loadOperations() {
  const [overview, byDepartment, byRectificationUnit, byHandler, trends] = await Promise.all([
    api('/api/cases/metrics/overview'),
    api('/api/cases/metrics/by-department'),
    api('/api/cases/metrics/by-rectification-unit'),
    api('/api/cases/metrics/by-handler'),
    api('/api/cases/metrics/trends')
  ]);
  state.operationsOverview = overview;
  state.operationsByDepartment = byDepartment;
  state.operationsByRectificationUnit = byRectificationUnit;
  state.operationsByHandler = byHandler;
  state.operationsTrends = trends;
  renderOperationsBoard();
}

export function renderOperationsBoard() {
  const root = $('operationsBoard');
  if (!root) return;
  if (!state.user || !['admin', 'department_reviewer', 'supervisor'].includes(String(state.user.role || '').toLowerCase())) return;

  const overview = state.operationsOverview;
  $('operationsOverview').innerHTML = overview ? `
    <div class="grid-4">
      <div class="notice"><strong>案件总数</strong><div style="margin-top:8px;">${escapeHtml(overview.total_cases)}</div></div>
      <div class="notice"><strong>办结率</strong><div style="margin-top:8px;">${escapeHtml(overview.closure_rate)}</div></div>
      <div class="notice"><strong>按期办结率</strong><div style="margin-top:8px;">${escapeHtml(overview.on_time_closure_rate)}</div></div>
      <div class="notice"><strong>超期未结</strong><div style="margin-top:8px;">${escapeHtml(overview.overdue_open_cases)}</div></div>
      <div class="notice"><strong>自动化执行</strong><div style="margin-top:8px;">${escapeHtml(overview.automation_runs || 0)}</div></div>
      <div class="notice"><strong>自动化成功率</strong><div style="margin-top:8px;">${escapeHtml(overview.automation_success_rate || '0.00%')}</div></div>
      <div class="notice"><strong>自动立案 / 命中分派</strong><div style="margin-top:8px;">${escapeHtml(overview.auto_created_cases || 0)} / ${escapeHtml(overview.auto_assignment_hits || 0)}</div></div>
      <div class="notice"><strong>自动提醒 / 升级</strong><div style="margin-top:8px;">${escapeHtml(overview.auto_reminders || 0)} / ${escapeHtml(overview.auto_escalations || 0)}</div></div>
    </div>
  ` : '<div class="muted">暂无运营指标。</div>';

  $('operationsBuckets').innerHTML = `
    <div class="grid-3">
      ${renderBuckets('按处室', state.operationsByDepartment)}
      ${renderBuckets('按整改单位', state.operationsByRectificationUnit)}
      ${renderBuckets('按责任人', state.operationsByHandler)}
    </div>
  `;

  $('operationsTrends').innerHTML = state.operationsTrends.length
    ? state.operationsTrends.map((item) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(item.period)}</strong>
        <div class="muted" style="margin-top:6px;">新建 ${escapeHtml(item.opened_cases)} / 办结 ${escapeHtml(item.closed_cases)} / 超期 ${escapeHtml(item.overdue_cases)} / 催办 ${escapeHtml(item.reminder_count)}</div>
        <div class="muted" style="margin-top:6px;">自动化 ${escapeHtml(item.automation_runs || 0)} / 失败 ${escapeHtml(item.automation_failures || 0)} / 自动立案 ${escapeHtml(item.auto_created_cases || 0)} / 自动提醒 ${escapeHtml(item.auto_reminders || 0)} / 自动升级 ${escapeHtml(item.auto_escalations || 0)}</div>
      </div>
    `).join('')
    : '<div class="muted">暂无趋势数据。</div>';
}

export async function exportOperationsCases() {
  const blob = await api('/api/cases/export');
  downloadBlob(blob, 'cases-export.csv');
}
