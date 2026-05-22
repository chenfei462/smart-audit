import { state, deploymentPolicy, taskKindDefinitions, datasetVariantDefinitions, taskKindLabel, datasetKindLabel, sourceKindLabel } from './state.js';
import { $, api, notify } from './services.js';
import { renderAiState, loadConnectorBootstrap, renderImportWorkbench } from './tasks.js?v=viz-20260430';
import { UI_COPY } from './config.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderConnectorDatasetOptions(taskKind) {
  const variants = datasetVariantDefinitions(taskKind);
  if (!$('adminConnectorDatasetKind')) return;
  $('adminConnectorDatasetKind').innerHTML = variants.length
    ? variants.map((variant) => `<option value="${variant.dataset_kind}">${escapeHtml(variant.label)}</option>`).join('')
    : '<option value="">不区分子类型</option>';
}

function renderConnectorAdminPanels() {
  const profiles = state.adminOverview?.connector_profiles || [];
  const syncJobs = state.adminOverview?.connector_sync_jobs || [];
  const writebackEvents = state.adminOverview?.writeback_events || [];

  $('connectorProfiles').innerHTML = profiles.length
    ? profiles.map((profile) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(profile.name)}</strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml(profile.connector_type)} / ${escapeHtml(taskKindLabel(profile.task_kind))}</div>
        <div class="muted" style="margin-top:4px;">子类型：${escapeHtml(datasetKindLabel(profile.dataset_kind))}</div>
        <div class="muted" style="margin-top:4px;">${escapeHtml(profile.base_url)} / ${escapeHtml(profile.auth_mode)}</div>
        <div class="muted" style="margin-top:4px;">凭据状态：${escapeHtml(profile.credential_state)} / 最近预检：${escapeHtml(profile.last_preview_at || '-')} / 最近入库：${escapeHtml(profile.last_commit_at || '-')}</div>
      </div>
    `).join('')
    : '<div class="muted">暂无连接档案。</div>';

  $('connectorSyncJobs').innerHTML = syncJobs.length
    ? syncJobs.slice(0, 12).map((job) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(job.mode)}</strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml(taskKindLabel(job.task_kind))} / ${escapeHtml(sourceKindLabel(job.source_kind))}</div>
        <div class="muted" style="margin-top:4px;">状态：${escapeHtml(job.status)} / 预检任务：${escapeHtml(job.preview_job_id || '-')}</div>
        <div class="muted" style="margin-top:4px;">已入库任务：${escapeHtml(job.committed_task_id || '-')}</div>
      </div>
    `).join('')
    : '<div class="muted">暂无同步作业。</div>';

  $('writebackEvents').innerHTML = writebackEvents.length
    ? writebackEvents.slice(0, 12).map((event) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(event.target_type)}</strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml(taskKindLabel(event.task_kind))} / 状态：${escapeHtml(event.status)}</div>
        <div class="muted" style="margin-top:4px;">目标：${escapeHtml(event.target_id)} / 催办：${event.reminder_flag ? '是' : '否'}</div>
        <div class="muted" style="margin-top:4px;">结论：${escapeHtml(event.conclusion || '-')}</div>
      </div>
    `).join('')
    : '<div class="muted">暂无写回事件。</div>';
}

export function renderDeploymentPolicySummary(policy) {
  const environmentLabel = {
    local: '本地开发环境',
    public_demo: '公网样板环境',
    government_poc: '政府 PoC 环境'
  }[policy.environment_mode] || policy.environment_mode || '未识别环境';
  $('deploymentPolicySummary').innerHTML = `
    <div class="notice" style="margin-bottom:10px;"><strong>环境模式</strong><br><span class="muted">${environmentLabel}</span></div>
    <div class="notice" style="margin-bottom:10px;"><strong>Secure Cookie</strong><br><span class="muted">${policy.secure_cookies ? '已开启' : '未开启'}</span></div>
    <div class="notice" style="margin-bottom:10px;"><strong>公开注册</strong><br><span class="muted">${policy.allow_public_registration ? '允许' : '关闭'}</span></div>
    <div class="notice" style="margin-bottom:10px;"><strong>AI 策略</strong><br><span class="muted">${policy.ai_enabled ? '启用，可做辅助解释' : '关闭，仅保留规则审计'}</span></div>
    <div class="notice" style="margin-bottom:10px;"><strong>OCR 策略</strong><br><span class="muted">${policy.ocr_enabled ? '启用' : '关闭'}</span></div>
    <div class="notice" style="margin-bottom:10px;"><strong>语音转写策略</strong><br><span class="muted">${policy.speech_enabled ? '启用' : '关闭'}</span></div>
    <div class="notice"><strong>环境定位</strong><br><span class="muted">${environmentLabel}</span></div>
  `;
}

export async function loadAdminOverview() {
  state.adminOverview = await api('/api/admin/overview');
  $('aiProvider').value = state.adminOverview.ai_profile.provider || '';
  $('aiModel').value = state.adminOverview.ai_profile.model || '';
  $('aiUrl').value = state.adminOverview.ai_profile.api_url || '';
  $('aiGuidance').value = state.adminOverview.ai_profile.guidance || '';
  if ($('aiSecretStatus')) {
    $('aiSecretStatus').textContent = state.adminOverview.ai_profile.secret_configured
      ? '已配置'
      : '未配置';
  }
  $('adminUsers').innerHTML = state.adminOverview.users.map((user) => `<div class="notice" style="margin-bottom:10px;"><strong>${escapeHtml(user.display_name)}</strong> (${escapeHtml(user.username)})<br><span class="muted">${escapeHtml(user.role)} / ${escapeHtml(user.organization_name)}</span></div>`).join('');
  $('auditLogs').innerHTML = state.adminOverview.logs.slice(0, 12).map((log) => `<div class="notice" style="margin-bottom:10px;"><strong>${escapeHtml(log.action)}</strong><br><span class="muted">${escapeHtml(log.created_at)} / ${escapeHtml(log.detail)}</span></div>`).join('');
  $('leadRequests').innerHTML = state.adminOverview.lead_requests.length
    ? state.adminOverview.lead_requests.map((lead) => `<div class="notice" style="margin-bottom:10px;"><strong>${escapeHtml(lead.contact_name)}</strong> / ${escapeHtml(lead.contact_channel)}<br><span class="muted">${escapeHtml(lead.unit_type)} · ${escapeHtml(lead.department)}</span><br><span class="muted">场景：${escapeHtml(lead.audit_scenario)}</span><br><span class="muted">部署：${escapeHtml(lead.deployment_preference)} / 真实数据：${lead.involves_real_data ? '是' : '否'} / AI：${escapeHtml(lead.ai_expectation)}</span><br><span class="muted">${escapeHtml(lead.created_at)}${lead.note ? ` / ${escapeHtml(lead.note)}` : ''}</span></div>`).join('')
    : UI_COPY.noLeadRequests;
  renderDeploymentPolicySummary(state.adminOverview.deployment_policy || deploymentPolicy());
  renderConnectorAdminPanels();
  renderAiState();
}

export async function createAdminUser() {
  await api('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_id: state.user.organization_id,
      username: $('adminUser').value,
      password: $('adminPassword').value,
      display_name: $('adminName').value,
      role: $('adminRole').value
    })
  });
  notify('用户已创建');
  await loadAdminOverview();
}

export async function saveAiConfig() {
  await api('/api/admin/ai-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: $('aiProvider').value,
      model: $('aiModel').value,
      api_url: $('aiUrl').value,
      enabled: true,
      guidance: $('aiGuidance').value
    })
  });
  notify('AI 服务配置已保存');
  await loadAdminOverview();
}

export function syncConnectorDatasetOptions() {
  const taskKind = $('adminConnectorTaskKind')?.value || taskKindDefinitions()[0]?.task_kind || 'procurement_project';
  renderConnectorDatasetOptions(taskKind);
}

export async function createConnectorProfile() {
  await api('/api/connectors/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('adminConnectorName').value,
      connector_type: $('adminConnectorType').value,
      task_kind: $('adminConnectorTaskKind').value,
      dataset_kind: $('adminConnectorDatasetKind').value || null,
      base_url: $('adminConnectorBaseUrl').value,
      auth_mode: $('adminConnectorAuthMode').value,
      sample_payload_json: $('adminConnectorSamplePayload').value || null,
      enabled: $('adminConnectorEnabled').checked
    })
  });
  notify('连接档案已创建');
  await Promise.all([loadAdminOverview(), loadConnectorBootstrap(true)]);
  renderImportWorkbench();
}


