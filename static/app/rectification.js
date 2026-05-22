import { state } from './state.js';
import { $, api, notify } from './services.js';

let activeCaseId = '';
let currentPage = 1;

const PAGE_SIZE = 24;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function totalPages() {
  return Math.max(1, Math.ceil((state.rectificationCases.length || 0) / PAGE_SIZE));
}

function clampCurrentPage() {
  currentPage = Math.min(Math.max(currentPage, 1), totalPages());
}

function visibleCases() {
  clampCurrentPage();
  const start = (currentPage - 1) * PAGE_SIZE;
  return state.rectificationCases.slice(start, start + PAGE_SIZE);
}

function syncPageToActiveCase() {
  const index = state.rectificationCases.findIndex((item) => item.id === activeCaseId);
  currentPage = index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : 1;
  clampCurrentPage();
}

function ensureActiveCaseVisible() {
  const items = visibleCases();
  if (!items.some((item) => item.id === activeCaseId)) {
    activeCaseId = items[0]?.id || '';
  }
}

function renderPager() {
  const totalCount = state.rectificationCases.length;
  if (totalCount <= PAGE_SIZE) return '';
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalCount);
  return `
    <div class="toolbar" style="margin-bottom:12px;justify-content:space-between;align-items:center;">
      <span class="muted">显示 ${start}-${end} / ${totalCount}，第 ${currentPage} / ${totalPages()} 页</span>
      <div class="toolbar">
        <button class="btn-secondary" data-rectification-page="prev" type="button" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
        <button class="btn-secondary" data-rectification-page="next" type="button" ${currentPage === totalPages() ? 'disabled' : ''}>下一页</button>
      </div>
    </div>
  `;
}

function renderCard(item) {
  const selected = item.id === activeCaseId;
  return `
    <div class="notice" style="margin-bottom:10px; border-color:${selected ? '#9cb6d8' : '#d7e3f4'};">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <strong>${escapeHtml(item.case_no)}</strong>
          <div class="muted" style="margin-top:4px;">${escapeHtml(item.exception_code)} / ${escapeHtml(item.exception_title)}</div>
        </div>
        <button type="button" class="btn-secondary rect-case-select" data-case-id="${escapeHtml(item.id)}">查看</button>
      </div>
      <div style="margin-top:8px;">${escapeHtml(item.exception_summary)}</div>
      <div class="muted" style="margin-top:6px;">阶段：${escapeHtml(item.current_stage)} / 截止：${escapeHtml(item.sla_due_at || '-')}</div>
      <div class="muted" style="margin-top:4px;">整改单位：${escapeHtml(item.rectification_unit_name || '-')} / 催办：${escapeHtml(item.reminder_count)}</div>
    </div>
  `;
}

function bindSelection() {
  document.querySelectorAll('.rect-case-select').forEach((node) => {
    node.onclick = async () => {
      activeCaseId = node.dataset.caseId;
      syncPageToActiveCase();
      renderRectificationWorkbench();
      await loadRectificationCaseDetail();
    };
  });

  document.querySelectorAll('[data-rectification-page]').forEach((node) => {
    node.onclick = async () => {
      currentPage += node.dataset.rectificationPage === 'next' ? 1 : -1;
      clampCurrentPage();
      ensureActiveCaseVisible();
      renderRectificationWorkbench();
      await loadRectificationCaseDetail();
    };
  });
}

async function loadRectificationCaseDetail() {
  if (!activeCaseId) {
    $('rectificationDetail').innerHTML = '<div class="muted" style="margin-bottom:12px;">请选择案件。</div>';
    return;
  }
  const detail = await api(`/api/rectification/cases/${activeCaseId}`);
  $('rectificationDetail').innerHTML = `
    <div class="notice">
      <strong>${escapeHtml(detail.case.case_no)}</strong>
      <div class="muted" style="margin-top:6px;">阶段：${escapeHtml(detail.case.current_stage)} / 结论：${escapeHtml(detail.case.disposition_outcome || '-')}</div>
      <div class="muted" style="margin-top:4px;">延期状态：${escapeHtml(detail.case.extension_status || '-')} / 通知：${escapeHtml(detail.case.notification_summary.total_deliveries)}</div>
      <div style="margin-top:8px;">${escapeHtml(detail.case.exception_summary)}</div>
    </div>
  `;
}

export async function loadRectificationCases() {
  state.rectificationCases = await api('/api/rectification/cases');
  if (!activeCaseId && state.rectificationCases.length) {
    activeCaseId = state.rectificationCases[0].id;
  }
  syncPageToActiveCase();
  ensureActiveCaseVisible();
  renderRectificationWorkbench();
  await loadRectificationCaseDetail();
}

export function renderRectificationWorkbench() {
  const root = $('rectificationBoard');
  if (!root) return;
  if (!state.user || !['admin', 'rectification_user'].includes(String(state.user.role || '').toLowerCase())) return;

  clampCurrentPage();
  ensureActiveCaseVisible();

  const pager = renderPager();
  const items = visibleCases();
  $('rectificationCaseList').innerHTML = state.rectificationCases.length
    ? `${pager}${items.map(renderCard).join('')}${pager}`
    : '<div class="muted">暂无分配到本单位的案件。</div>';

  if (state.rectificationCases.length) {
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, state.rectificationCases.length);
    $('rectificationMeta').textContent = `案件 ${state.rectificationCases.length} · 当前 ${start}-${end}`;
  } else {
    $('rectificationMeta').textContent = '案件 0';
  }

  bindSelection();
}

export async function submitRectification() {
  if (!activeCaseId) throw new Error('请先选择案件');
  await api(`/api/rectification/cases/${activeCaseId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rectification_statement: $('rectificationStatement').value || '',
      requested_extension: $('rectificationRequestedExtension').value || null
    })
  });
  notify('整改材料已提交');
  await loadRectificationCases();
}

export async function submitRectificationExtension() {
  if (!activeCaseId) throw new Error('请先选择案件');
  await api(`/api/rectification/cases/${activeCaseId}/extension`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requested_due_at: $('rectificationExtensionDueAt').value,
      reason: $('rectificationExtensionReason').value || ''
    })
  });
  notify('延期申请已提交');
  await loadRectificationCases();
}

export async function uploadRectificationAttachment() {
  if (!activeCaseId) throw new Error('请先选择案件');
  const file = $('rectificationAttachmentFile')?.files?.[0];
  if (!file) throw new Error('请选择附件');
  const form = new FormData();
  form.append('file', file);
  form.append('note', $('rectificationAttachmentNote')?.value || '');
  await api(`/api/rectification/cases/${activeCaseId}/attachments`, {
    method: 'POST',
    body: form
  });
  notify('附件已上传');
  await loadRectificationCases();
}
