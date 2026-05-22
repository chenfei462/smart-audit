import { state } from './state.js';
import { $, api, downloadBlob, notify } from './services.js';
import { renderCaseSeedImportPanel } from './tasks.js?v=viz-20260430';
import { loadOperations } from './operations.js';
import { normalizeAutomationScheduleKind } from './payloads.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scopeLabel(scope) {
  return scope === 'shared' ? '共享' : '私有';
}

function scheduleKindLabel(kind) {
  return {
    manual_only: '仅手动',
    hourly: '每小时',
    daily: '每日',
    weekly: '每周'
  }[kind] || kind;
}

function targetKindLabel(kind) {
  return {
    connector_sync: '连接器同步',
    case_seed_import: '案件种子导入',
    case_followup: '案件跟进'
  }[kind] || kind;
}

function currentCaseSeedMappingOverrides() {
  return (state.caseSeedMappingOverrides || [])
    .map((item) => ({
      field_key: String(item.field_key || '').trim(),
      source_header: String(item.source_header || '').trim()
    }))
    .filter((item) => item.field_key && item.source_header);
}

function currentCaseSeedAssignmentRules() {
  return (state.caseSeedAssignmentRules || [])
    .map((rule) => ({
      priority: rule.priority === '' || rule.priority == null ? null : Number(rule.priority),
      label: String(rule.label || '').trim() || null,
      match_field: String(rule.match_field || '').trim(),
      match_value: String(rule.match_value || '').trim(),
      assignee: String(rule.assignee || '').trim(),
      target_department: String(rule.target_department || '').trim() || null
    }))
    .filter((rule) => rule.match_field && rule.match_value && rule.assignee);
}

function sharedImportProfiles() {
  return (state.importProfiles || []).filter((profile) => profile.scope === 'shared');
}

function connectorOptions() {
  return state.connectorBootstrap?.profiles || [];
}

export async function loadImportProfiles() {
  const response = await api('/api/import-profiles?task_kind=supervision_case_seed');
  state.importProfiles = response.profiles || [];
  if (!state.importProfiles.some((profile) => profile.id === state.selectedImportProfileId)) {
    state.selectedImportProfileId = state.importProfiles[0]?.id || '';
  }
  renderImportProfileCenter();
  renderAutomationCenter();
}

export async function loadAssignmentDictionary() {
  const params = new URLSearchParams({
    task_kind: 'supervision_case_seed',
    template_kind: state.caseSeedTemplateKind || 'investment_review'
  });
  const response = await api(`/api/assignment-dictionary?${params.toString()}`);
  state.assignmentDictionaryRules = response.rules || [];
  renderAssignmentDictionaryCenter();
}

export async function loadAutomationCenter() {
  const [schedulesResponse, executionsResponse] = await Promise.all([
    api('/api/automation/schedules'),
    api('/api/automation/executions')
  ]);
  state.automationSchedules = schedulesResponse.schedules || [];
  state.automationExecutions = executionsResponse.executions || [];
  renderAutomationCenter();
}

export function renderImportProfileCenter() {
  const root = $('importConfigCenter');
  if (!root || root.classList.contains('hidden')) return;
  const scopeFilter = state.importProfileScopeFilter || 'all';
  const profiles = (state.importProfiles || []).filter((profile) => (
    scopeFilter === 'all' || profile.scope === scopeFilter
  ));
  if ($('importProfileScopeFilter')) {
    $('importProfileScopeFilter').value = scopeFilter;
  }
  if ($('importProfileTemplateKind')) {
    $('importProfileTemplateKind').value = state.caseSeedTemplateKind || 'investment_review';
  }
  if ($('importProfilesMeta')) {
    $('importProfilesMeta').textContent = `当前模板 ${state.caseSeedTemplateKind || 'investment_review'} / 共 ${profiles.length} 个方案`;
  }
  if ($('importProfileRows')) {
    $('importProfileRows').innerHTML = profiles.length ? profiles.map((profile) => `
      <div class="notice" style="margin-bottom:10px;">
        <div class="toolbar" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <strong>${escapeHtml(profile.name)}</strong>
            <div class="muted" style="margin-top:6px;">
              ${escapeHtml(scopeLabel(profile.scope))} / ${escapeHtml(profile.template_kind || 'investment_review')}
              ${profile.is_default ? ' / 默认方案' : ''}
            </div>
            <div class="muted" style="margin-top:6px;">映射 ${escapeHtml(profile.mapping_overrides?.length || 0)} 项 / 分派规则 ${escapeHtml(profile.assignment_rules?.length || 0)} 条 / 更新时间 ${escapeHtml(profile.updated_at)}</div>
            ${profile.notes ? `<div class="muted" style="margin-top:6px;">${escapeHtml(profile.notes)}</div>` : ''}
          </div>
          <div class="toolbar">
            <button class="btn-secondary" data-import-profile-apply="${profile.id}" type="button">套用</button>
            <button class="btn-secondary" data-import-profile-export="${profile.id}" type="button">导出</button>
            <button class="btn-secondary" data-import-profile-clone="${profile.id}" type="button">复制</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="muted">暂无导入方案。</div>';
  }
  if ($('automationSharedProfileId')) {
    const options = sharedImportProfiles();
    $('automationSharedProfileId').innerHTML = options.length
      ? options.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name)} / ${escapeHtml(profile.template_kind || '-')}</option>`).join('')
      : '<option value="">暂无共享方案</option>';
  }
}

export function renderAssignmentDictionaryCenter() {
  const root = $('importConfigCenter');
  if (!root || root.classList.contains('hidden')) return;
  const scopeFilter = state.assignmentDictionaryScopeFilter || 'all';
  const rules = (state.assignmentDictionaryRules || []).filter((rule) => (
    scopeFilter === 'all' || rule.scope === scopeFilter
  ));
  if ($('assignmentDictionaryScopeFilter')) {
    $('assignmentDictionaryScopeFilter').value = scopeFilter;
  }
  if ($('assignmentDictionaryTemplateKind')) {
    $('assignmentDictionaryTemplateKind').value = state.caseSeedTemplateKind || 'investment_review';
  }
  if ($('assignmentDictionaryMeta')) {
    $('assignmentDictionaryMeta').textContent = `当前模板 ${state.caseSeedTemplateKind || 'investment_review'} / 共 ${rules.length} 条规则`;
  }
  if ($('assignmentDictionaryRows')) {
    $('assignmentDictionaryRows').innerHTML = rules.length ? rules.map((rule) => `
      <div class="notice" style="margin-bottom:10px;">
        <div class="toolbar" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <strong>${escapeHtml(rule.label || '(未命名规则)')}</strong>
            <div class="muted" style="margin-top:6px;">${escapeHtml(scopeLabel(rule.scope))} / 优先级 ${escapeHtml(rule.priority)} / ${rule.enabled ? '启用' : '停用'}</div>
            <div class="muted" style="margin-top:6px;">${escapeHtml(rule.match_field)} = ${escapeHtml(rule.match_value)} → ${escapeHtml(rule.assignee)}</div>
            <div class="muted" style="margin-top:6px;">处室 ${escapeHtml(rule.target_department || '-')} / 更新时间 ${escapeHtml(rule.updated_at)}</div>
          </div>
          <div class="toolbar">
            <button class="btn-secondary" data-assignment-rule-toggle="${rule.id}" data-enabled="${rule.enabled ? '1' : '0'}" type="button">${rule.enabled ? '停用' : '启用'}</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="muted">暂无责任分派字典规则。</div>';
  }
}

export function renderAutomationCenter() {
  const root = $('automationCenter');
  if (!root || root.classList.contains('hidden')) return;
  if ($('automationConnectorProfileId')) {
    const options = connectorOptions();
    $('automationConnectorProfileId').innerHTML = options.length
      ? options.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name)} / ${escapeHtml(profile.base_url)}</option>`).join('')
      : '<option value="">暂无连接档案</option>';
  }
  if ($('automationScheduleRows')) {
    $('automationScheduleRows').innerHTML = (state.automationSchedules || []).length ? state.automationSchedules.map((schedule) => `
      <div class="notice" style="margin-bottom:10px;">
        <div class="toolbar" style="justify-content:space-between;align-items:flex-start;">
          <div>
            <strong>${escapeHtml(schedule.name)}</strong>
            <div class="muted" style="margin-top:6px;">${escapeHtml(scheduleKindLabel(schedule.schedule_kind))} / ${escapeHtml(targetKindLabel(schedule.target_kind))} / ${schedule.enabled ? '启用' : '停用'}</div>
            <div class="muted" style="margin-top:6px;">共享方案 ${escapeHtml(schedule.shared_profile_id || '-')} / 连接档案 ${escapeHtml(schedule.connector_profile_id || '-')}</div>
            <div class="muted" style="margin-top:6px;">源路径 ${escapeHtml(schedule.source_path || '-')} / 最近执行 ${escapeHtml(schedule.last_run_at || '-')}</div>
            ${schedule.notes ? `<div class="muted" style="margin-top:6px;">${escapeHtml(schedule.notes)}</div>` : ''}
          </div>
          <div class="toolbar">
            <button class="btn-primary" data-automation-run="${schedule.id}" type="button">立即执行</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="muted">暂无自动化计划。</div>';
  }
  if ($('automationExecutionRows')) {
    $('automationExecutionRows').innerHTML = (state.automationExecutions || []).length ? state.automationExecutions.slice(0, 10).map((execution) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(targetKindLabel(execution.target_kind))}</strong>
        <div class="muted" style="margin-top:6px;">状态 ${escapeHtml(execution.status)} / 触发 ${escapeHtml(execution.trigger_kind)} / 窗口 ${escapeHtml(execution.trigger_window)}</div>
        <div class="muted" style="margin-top:6px;">自动立案 ${escapeHtml(execution.summary?.auto_created_cases || 0)} / 命中分派 ${escapeHtml(execution.summary?.auto_assignment_hits || 0)} / 提醒 ${escapeHtml(execution.summary?.auto_reminders || 0)} / 升级 ${escapeHtml(execution.summary?.auto_escalations || 0)}</div>
        <div class="muted" style="margin-top:6px;">创建任务 ${escapeHtml(execution.summary?.created_tasks || 0)} / 开始 ${escapeHtml(execution.started_at)} / 结束 ${escapeHtml(execution.finished_at || '-')}</div>
        ${execution.last_error ? `<div class="muted" style="margin-top:6px;color:#b42318;">${escapeHtml(execution.last_error)}</div>` : ''}
      </div>
    `).join('') : '<div class="muted">暂无自动化执行记录。</div>';
  }
}

export async function createImportProfileFromCurrent() {
  const response = await api('/api/import-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('importProfileName').value || `案件种子方案 ${new Date().toISOString().slice(0, 16)}`,
      task_kind: 'supervision_case_seed',
      template_kind: $('importProfileTemplateKind').value || state.caseSeedTemplateKind || 'investment_review',
      scope: $('importProfileScope').value || 'private',
      is_default: Boolean($('importProfileDefault').checked),
      mapping_overrides: currentCaseSeedMappingOverrides(),
      assignment_rules: currentCaseSeedAssignmentRules(),
      notes: $('importProfileNotes').value || null
    })
  });
  state.selectedImportProfileId = response.profile?.id || '';
  await loadImportProfiles();
  notify('导入方案已保存');
}

export async function cloneSelectedImportProfile(profileId) {
  const targetId = profileId || state.selectedImportProfileId;
  if (!targetId) {
    throw new Error('请先选择要复制的方案');
  }
  await api(`/api/import-profiles/${encodeURIComponent(targetId)}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('importProfileName').value || `方案副本 ${new Date().toISOString().slice(0, 16)}`,
      scope: $('importProfileScope').value || 'private'
    })
  });
  await loadImportProfiles();
  notify('导入方案已复制');
}

export async function exportSelectedImportProfile(profileId) {
  const targetId = profileId || state.selectedImportProfileId;
  if (!targetId) {
    throw new Error('请先选择要导出的方案');
  }
  const profile = await api(`/api/import-profiles/${encodeURIComponent(targetId)}/export`);
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${profile.name || 'import-profile'}.json`);
}

export async function importImportProfileFile() {
  const file = $('importProfileFile').files[0];
  if (!file) {
    throw new Error('请先选择 JSON 配置文件');
  }
  const payload = JSON.parse(await file.text());
  const response = await api('/api/import-profiles/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.selectedImportProfileId = response.profile?.id || '';
  await loadImportProfiles();
  notify('导入方案 JSON 已导入');
}

export async function applyImportProfile(profileId) {
  const profile = (state.importProfiles || []).find((item) => item.id === (profileId || state.selectedImportProfileId));
  if (!profile) {
    throw new Error('导入方案不存在');
  }
  state.selectedImportProfileId = profile.id;
  state.caseSeedTemplateKind = profile.template_kind || 'investment_review';
  state.caseSeedMappingOverrides = profile.mapping_overrides || [];
  state.caseSeedAssignmentRules = profile.assignment_rules || [];
  state.caseSeedConfigUpdatedAt = profile.updated_at || null;
  renderCaseSeedImportPanel();
  renderImportProfileCenter();
  await loadAssignmentDictionary();
  notify(`已套用方案 ${profile.name}`);
}

export async function createAssignmentDictionaryRule() {
  await api('/api/assignment-dictionary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_kind: 'supervision_case_seed',
      template_kind: $('assignmentDictionaryTemplateKind').value || state.caseSeedTemplateKind || 'investment_review',
      match_field: $('assignmentDictionaryField').value || 'rectification_unit_name',
      match_value: $('assignmentDictionaryValue').value,
      assignee: $('assignmentDictionaryAssignee').value,
      target_department: $('assignmentDictionaryTargetDepartment').value || null,
      priority: Number($('assignmentDictionaryPriority').value || 100),
      scope: $('assignmentDictionaryScope').value || 'private',
      enabled: Boolean($('assignmentDictionaryEnabled').checked),
      label: $('assignmentDictionaryLabel').value || null
    })
  });
  await loadAssignmentDictionary();
  notify('责任分派字典规则已保存');
}

export async function toggleAssignmentDictionaryRule(ruleId, enabled) {
  await api(`/api/assignment-dictionary/${encodeURIComponent(ruleId)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  await loadAssignmentDictionary();
  notify(`规则已${enabled ? '启用' : '停用'}`);
}

export async function createAutomationSchedule() {
  const targetKind = $('automationTargetKind').value || 'case_followup';
  await api('/api/automation/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('automationScheduleName').value || `自动化计划 ${new Date().toISOString().slice(0, 16)}`,
      schedule_kind: normalizeAutomationScheduleKind($('automationScheduleKind').value),
      target_kind: targetKind,
      enabled: Boolean($('automationEnabled').checked),
      shared_profile_id: targetKind === 'case_seed_import' ? ($('automationSharedProfileId').value || null) : null,
      connector_profile_id: targetKind === 'connector_sync' ? ($('automationConnectorProfileId').value || null) : null,
      source_path: targetKind === 'case_seed_import' ? ($('automationSourcePath').value || null) : null,
      notes: $('automationNotes').value || null
    })
  });
  await loadAutomationCenter();
  notify('自动化计划已创建');
}

export async function runAutomationSchedule(scheduleId) {
  await api(`/api/automation/schedules/${encodeURIComponent(scheduleId)}/run`, {
    method: 'POST'
  });
  await Promise.all([loadAutomationCenter(), loadOperations()]);
  notify('自动化计划已执行');
}


