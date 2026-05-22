import {
  state,
  deploymentPolicy,
  taskKindDefinition,
  taskKindDefinitions,
  taskKindLabel,
  sourceKindLabel,
  caseSeedTemplateLabel,
  datasetKindLabel,
  datasetVariantDefinitions,
  activeDatasetVariant,
  connectorProfileDefinitions
} from './state.js';
import { $, api, notify, downloadBlob } from './services.js';
import { renderStats, renderTaskDetail, renderTaskTable, setAllTaskGroupsExpanded } from './report.js?v=viz-20260430';
import { renderTaskExceptionPool } from './exceptions.js?v=viz-20260430';
import { loadArtifacts } from './artifacts.js';
import { buildCaseSeedImportPayload, validateCaseSeedPreviewForImport } from './payloads.js';

const SOURCE_ORDER = ['file', 'batch', 'fetch', 'connector'];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function activeDefinition() {
  return taskKindDefinition(state.selectedTaskKind);
}

function activeFieldDefinitions() {
  return activeDatasetVariant()?.template_fields?.length
    ? activeDatasetVariant().template_fields
    : (activeDefinition()?.template_fields || []);
}

function canUseTaskActions() {
  return ['Admin', 'Auditor', 'admin', 'auditor'].includes(state.user?.role);
}

function updateTaskActionControls() {
  const enabled = Boolean(state.currentTask && canUseTaskActions());
  if ($('exportPdfBtn')) $('exportPdfBtn').disabled = !enabled;
  if ($('sealTaskBtn')) $('sealTaskBtn').disabled = !enabled;
  if ($('aiExplainBtn')) {
    $('aiExplainBtn').disabled = !enabled || !deploymentPolicy().ai_enabled;
    $('aiExplainBtn').title = deploymentPolicy().ai_enabled ? '' : 'AI 已按当前部署策略关闭';
  }
  if ($('uploadImageBtn')) $('uploadImageBtn').disabled = !enabled || !deploymentPolicy().ocr_enabled;
  if ($('uploadAudioBtn')) $('uploadAudioBtn').disabled = !enabled || !deploymentPolicy().speech_enabled;
}

function renderInternalSampleStats(definitions) {
  const templateCount = definitions.length;
  const requiredFields = definitions.reduce((sum, definition) => sum + (definition.minimum_fields || []).length, 0);
  const recommendedFields = definitions.reduce((sum, definition) => sum + (definition.recommended_fields || []).length, 0);
  return `
    <div class="stat"><strong>${escapeHtml(templateCount)}</strong><span>内部模板</span></div>
    <div class="stat"><strong>3000+</strong><span>脱敏记录目标</span></div>
    <div class="stat"><strong>90%+</strong><span>字段识别验收线</span></div>
    <div class="stat"><strong>${escapeHtml(requiredFields)} / ${escapeHtml(recommendedFields)}</strong><span>最小 / 推荐字段</span></div>
  `;
}

export function renderInternalSamplePocPanel() {
  const rows = $('internalSampleTemplateRows');
  const stats = $('internalSamplePocStats');
  const selector = $('internalSampleTemplateKind');
  if (!rows || !stats || !selector) return;

  const definitions = state.internalSampleTemplates || [];
  if (!definitions.length) {
    stats.innerHTML = '';
    rows.innerHTML = '<div class="muted">暂无内部样本模板定义。</div>';
    return;
  }

  if (!definitions.some((item) => item.template_kind === state.selectedInternalSampleTemplateKind)) {
    state.selectedInternalSampleTemplateKind = definitions[0].template_kind;
  }

  selector.innerHTML = definitions.map((definition) => `
    <option value="${escapeHtml(definition.template_kind)}" ${definition.template_kind === state.selectedInternalSampleTemplateKind ? 'selected' : ''}>
      ${escapeHtml(definition.label)}
    </option>
  `).join('');
  stats.innerHTML = renderInternalSampleStats(definitions);
  rows.innerHTML = definitions.map((definition) => {
    const required = (definition.minimum_fields || []).filter((field) => field.required).length;
    const recommended = (definition.recommended_fields || []).length;
    const sourceReady = (definition.recommended_fields || []).some((field) => field.key === 'source_url');
    return `
      <div class="notice">
        <strong>${escapeHtml(definition.label)}</strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml(definition.template_kind)} / ${escapeHtml(taskKindLabel(definition.task_kind))}${definition.dataset_kind ? ` / ${escapeHtml(datasetKindLabel(definition.dataset_kind))}` : ''}</div>
        <div class="muted" style="margin-top:4px;">${escapeHtml(definition.description || '')}</div>
        <div class="muted" style="margin-top:4px;">模板：${escapeHtml(definition.schema_version)} / 映射：${escapeHtml(definition.field_mapping_version)}</div>
        <div class="muted" style="margin-top:4px;">字段：必填 ${escapeHtml(required)}，推荐 ${escapeHtml(recommended)}，来源证据 ${sourceReady ? '已覆盖' : '未覆盖'}</div>
        <div class="muted" style="margin-top:4px;">链路角色：${escapeHtml(definition.linkage_role)}</div>
      </div>
    `;
  }).join('');
}

export async function loadInternalSampleTemplates() {
  state.internalSampleTemplates = await api('/api/import/internal-sample/templates');
  renderInternalSamplePocPanel();
}

export function setInternalSampleTemplateKind(templateKind) {
  state.selectedInternalSampleTemplateKind = templateKind;
  renderInternalSamplePocPanel();
}

export function updateTaskListFilters(patch = {}) {
  state.taskListFilters = {
    ...(state.taskListFilters || {}),
    ...patch,
  };
  renderTaskTable(selectTaskById);
}

export function expandAllTaskGroups() {
  setAllTaskGroupsExpanded(true, selectTaskById);
}

export function collapseAllTaskGroups() {
  setAllTaskGroupsExpanded(false, selectTaskById);
}

export async function downloadInternalSampleTemplate() {
  const templateKind = $('internalSampleTemplateKind')?.value || state.selectedInternalSampleTemplateKind;
  const blob = await api(`/api/import/internal-sample/templates/${templateKind}`);
  downloadBlob(blob, `${templateKind}-internal-sample-template.csv`);
}

function normalizeBatchPayload(rawValue) {
  const parsed = JSON.parse(rawValue);
  if (Array.isArray(parsed)) {
    return { records: parsed };
  }
  return parsed;
}

function parseTaskRoute() {
  const match = location.hash.match(/^#\/tasks\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { taskKind: match[1], taskId: match[2] };
}

function setTaskHash(task) {
  const nextHash = `#/tasks/${task.task_kind}/${task.id}`;
  if (location.hash !== nextHash) {
    location.hash = nextHash;
  }
}

function currentVariantSummary() {
  const variant = activeDatasetVariant();
  if (!variant) return '';
  return `
    <div class="notice" style="margin-bottom:12px;">
      <strong>子类型：${escapeHtml(variant.label)}</strong>
      <div class="muted" style="margin-top:6px;">${escapeHtml(variant.description || '')}</div>
      <div class="toolbar" style="margin-top:10px;flex-wrap:wrap;">
        ${datasetVariantDefinitions().map((item) => `
          <button
            class="${item.dataset_kind === state.selectedDatasetKind ? 'btn-primary' : 'btn-secondary'}"
            data-dataset-kind="${item.dataset_kind}"
            type="button"
          >
            ${escapeHtml(item.label)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function procurementPreviewCards(records) {
  if (!records?.length) {
    return '<div class="muted">暂无可提交的采购记录。</div>';
  }
  return records.slice(0, 6).map((record) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(record.project_name)}</strong>
      <div class="muted" style="margin-top:6px;">采购单位：${escapeHtml(record.purchaser_name)}</div>
      <div class="muted" style="margin-top:4px;">项目编号：${escapeHtml(record.project_code)}</div>
      <div class="muted" style="margin-top:4px;">预算 / 成交：${escapeHtml(record.budget_amount || '未提供')} / ${escapeHtml(record.award_amount || '未提供')}</div>
      <div class="muted" style="margin-top:4px;">供应商：${escapeHtml(record.supplier_name || '-')}</div>
    </div>
  `).join('');
}

function budgetPreviewSummary(preview) {
  const linkage = preview.linkage_summary || {};
  const trend = preview.trend_points?.slice(0, 3) || [];
  const variance = preview.variance_highlights?.slice(0, 3) || [];
  const breakdown = preview.classification_breakdown?.slice(0, 3) || [];
  return `
    <div class="grid-2" style="margin-bottom:12px;">
      <div class="notice">
        <strong>${escapeHtml(datasetKindLabel(preview.dataset_kind))}</strong>
        <div class="muted" style="margin-top:6px;">已接收 ${escapeHtml(preview.quality_report?.accepted_rows || 0)} 行，拒绝 ${escapeHtml(preview.quality_report?.rejected_rows || 0)} 行</div>
        <div class="muted" style="margin-top:4px;">预算联动：精确 ${escapeHtml(linkage.exact_linked_procurement_projects || 0)} / 证据自动 ${escapeHtml(linkage.evidence_auto_linked_procurement_projects || 0)} / 候选 ${escapeHtml(linkage.candidate_procurement_projects || 0)}</div>
      </div>
      <div class="notice">
        <strong>规则适用范围</strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml((preview.applicable_rule_sets || []).join(', ') || 'budget_rules')}</div>
      </div>
    </div>
    ${trend.length ? `
      <div class="notice" style="margin-bottom:12px;">
        <strong>趋势摘要</strong>
        <div class="muted" style="margin-top:6px;">
          ${trend.map((item) => `${escapeHtml(item.period)} / ${escapeHtml(item.label)} / ${escapeHtml(item.actual_amount || '-')}`).join('<br>')}
        </div>
      </div>
    ` : ''}
    ${breakdown.length ? `
      <div class="notice" style="margin-bottom:12px;">
        <strong>结构占比预览</strong>
        <div class="muted" style="margin-top:6px;">
          ${breakdown.map((item) => `${escapeHtml(item.label)}：${escapeHtml(item.amount)}`).join('<br>')}
        </div>
      </div>
    ` : ''}
    ${variance.length ? `
      <div class="notice" style="margin-bottom:12px;">
        <strong>偏差高亮</strong>
        <div class="muted" style="margin-top:6px;">
          ${variance.map((item) => `${escapeHtml(item.label)} / ${escapeHtml(item.subject)} / ${escapeHtml(item.metric_value)}`).join('<br>')}
        </div>
      </div>
    ` : ''}
  `;
}

function budgetPreviewCards(preview) {
  const records = preview.records || preview.rows_preview || [];
  if (!records.length) {
    return `${budgetPreviewSummary(preview)}<div class="muted">暂无可提交的预算记录。</div>`;
  }
  return `${budgetPreviewSummary(preview)}${records.slice(0, 6).map((record) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(record.budget_project_name || record.summary_item || record.budget_unit_name || record.region || '预算记录')}</strong>
      <div class="muted" style="margin-top:6px;">期间：${escapeHtml(record.period)} / 口径：${escapeHtml(record.budget_scope)} / 方向：${escapeHtml(record.direction)}</div>
      <div class="muted" style="margin-top:4px;">预算单位 / 地区：${escapeHtml(record.budget_unit_name || '-')} / ${escapeHtml(record.region || '-')}</div>
      <div class="muted" style="margin-top:4px;">预算 / 实际：${escapeHtml(record.budget_amount || '未提供')} / ${escapeHtml(record.actual_amount || '未提供')}</div>
    </div>
  `).join('')}`;
}

function treasuryPreviewCards(preview) {
  const records = preview.records || preview.vouchers || [];
  const summary = preview.payment_linkage_summary || {};
  const contractSummary = preview.contract_linkage_summary || {};
  if (!records.length) {
    return '<div class="muted">暂无可提交的支付记录。</div>';
  }
  return `
    <div class="grid-2" style="margin-bottom:12px;">
      <div class="notice">
        <strong>${escapeHtml(datasetKindLabel(preview.dataset_kind))}</strong>
        <div class="muted" style="margin-top:6px;">已接收 ${escapeHtml(preview.quality_report?.accepted_rows || 0)} 行，拒绝 ${escapeHtml(preview.quality_report?.rejected_rows || 0)} 行</div>
        <div class="muted" style="margin-top:4px;">规则适用：${escapeHtml((preview.applicable_rule_sets || []).join(', ') || 'payment_rules')}</div>
      </div>
      <div class="notice">
        <strong>联查摘要</strong>
        <div class="muted" style="margin-top:6px;">关联合同：${escapeHtml(contractSummary.linked_contracts || 0)} / 未闭合：${escapeHtml(contractSummary.open_contract_chains || 0)}</div>
        <div class="muted" style="margin-top:4px;">关联支付：${escapeHtml(summary.linked_payments || 0)} / 金额差：${escapeHtml(summary.amount_gap || '0')}</div>
      </div>
    </div>
    ${records.slice(0, 6).map((record) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(record.payment_order_no || record.treasury_voucher_no || '支付凭证')}</strong>
        <div class="muted" style="margin-top:6px;">合同：${escapeHtml(record.contract_no || '-')} / 对手方：${escapeHtml(record.counterparty || record.supplier_name || '-')}</div>
        <div class="muted" style="margin-top:4px;">金额：${escapeHtml(record.amount)}</div>
        <div class="muted" style="margin-top:4px;">日期：${escapeHtml(record.paid_at)}</div>
      </div>
    `).join('')}
  `;
}

function voucherPreviewCards(preview) {
  const records = preview.records || preview.entries || [];
  const paymentSummary = preview.payment_linkage_summary || {};
  const ledgerSummary = preview.ledger_linkage_summary || {};
  if (!records.length) {
    return '<div class="muted">暂无可提交的会计分录。</div>';
  }
  return `
    <div class="grid-2" style="margin-bottom:12px;">
      <div class="notice">
        <strong>${escapeHtml(datasetKindLabel(preview.dataset_kind))}</strong>
        <div class="muted" style="margin-top:6px;">已接收 ${escapeHtml(preview.quality_report?.accepted_rows || 0)} 行，拒绝 ${escapeHtml(preview.quality_report?.rejected_rows || 0)} 行</div>
        <div class="muted" style="margin-top:4px;">规则适用：${escapeHtml((preview.applicable_rule_sets || []).join(', ') || 'voucher_rules')}</div>
      </div>
      <div class="notice">
        <strong>联查摘要</strong>
        <div class="muted" style="margin-top:6px;">支付匹配：${escapeHtml(paymentSummary.linked_payments || 0)} / 已支付未入账：${escapeHtml(paymentSummary.paid_without_ledger || 0)}</div>
        <div class="muted" style="margin-top:4px;">借贷异常：${escapeHtml(ledgerSummary.unbalanced_entries || 0)} / 重复入账：${escapeHtml(ledgerSummary.duplicate_entries || 0)}</div>
      </div>
    </div>
    ${records.slice(0, 6).map((record) => `
      <div class="notice" style="margin-bottom:10px;">
        <strong>${escapeHtml(record.voucher_no)}</strong>
        <div class="muted" style="margin-top:6px;">科目：${escapeHtml(record.account_code)} / ${escapeHtml(record.account_name)}</div>
        <div class="muted" style="margin-top:4px;">借 / 贷：${escapeHtml(record.debit_amount)} / ${escapeHtml(record.credit_amount)}</div>
        <div class="muted" style="margin-top:4px;">记账日期：${escapeHtml(record.booked_at)}</div>
      </div>
    `).join('')}
  `;
}

function previewRecordCards(taskKind, preview) {
  switch (taskKind) {
    case 'budget_summary':
      return budgetPreviewCards(preview);
    case 'treasury_payment':
      return treasuryPreviewCards(preview);
    case 'voucher_ledger':
      return voucherPreviewCards(preview);
    default:
      return procurementPreviewCards(preview.records || preview.projects || []);
  }
}

function qualityChecks(checks) {
  if (!checks?.length) {
    return '<div class="muted">预检未发现质量问题。</div>';
  }
  return checks.map((check) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(check.code)}</strong>
      <div class="muted" style="margin-top:6px;">
        ${escapeHtml(check.severity)}${check.field ? ` / 字段 ${escapeHtml(check.field)}` : ''}${check.row_number ? ` / 第 ${escapeHtml(check.row_number)} 行` : ''}
      </div>
      <div style="margin-top:6px;">${escapeHtml(check.message)}</div>
    </div>
  `).join('');
}

function caseSeedPreviewCards(preview) {
  const records = preview.records || [];
  if (!records.length) {
    return '<div class="muted">暂无案件种子预检结果。</div>';
  }
  return records.slice(0, 6).map((record) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(record.project_name)}</strong>
      <div class="muted" style="margin-top:6px;">整改单位：${escapeHtml(record.rectification_unit_name || record.construction_unit || '-')}</div>
      <div class="muted" style="margin-top:4px;">问题来源 / 周期：${escapeHtml(record.issue_source)} / ${escapeHtml(record.period || '-')}</div>
      <div class="muted" style="margin-top:4px;">核减额 / 优先级：${escapeHtml(record.reduction_amount || '-')} / ${escapeHtml(record.recommended_priority || 'P3')}</div>
      <div style="margin-top:6px;">${escapeHtml(record.recommended_issue || '')}</div>
    </div>
  `).join('');
}

function caseSeedFieldMappingCards(preview) {
  const mappings = preview.field_mappings || [];
  if (!mappings.length) {
    return '<div class="muted">暂无字段映射预览。</div>';
  }
  const availableHeaders = preview.available_headers || [];
  const rows = mappings.map((item) => `
    <tr>
      <td>${escapeHtml(item.field_label)}</td>
      <td>
        <select data-case-seed-mapping-field="${escapeHtml(item.field_key)}">
          <option value="">自动识别</option>
          ${availableHeaders.map((header) => `
            <option value="${escapeHtml(header)}" ${caseSeedMappingValue(item) === header ? 'selected' : ''}>
              ${escapeHtml(header)}
            </option>
          `).join('')}
        </select>
      </td>
      <td>${item.required ? '必填' : '可选'}</td>
      <td>${item.matched ? '已识别' : '未识别'}</td>
    </tr>
  `).join('');
  const unmapped = (preview.unmapped_headers || []).length
    ? `<div class="muted" style="margin-top:10px;">未识别列：${escapeHtml((preview.unmapped_headers || []).join(' / '))}</div>`
    : '';
  return `
    <div style="overflow:auto;">
      <table>
        <thead><tr><th>系统字段</th><th>识别到的列</th><th>要求</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${unmapped}
  `;
}

function caseSeedAssignmentRuleRows() {
  if (!state.caseSeedAssignmentRules.length) {
    return '<div class="muted">未配置自动分派规则，导入后保持未分派。</div>';
  }
  return state.caseSeedAssignmentRules.map((rule, index) => `
    <div class="toolbar" style="margin-bottom:8px;align-items:center;">
      <input data-case-seed-rule-priority="${index}" type="number" min="1" step="1" placeholder="优先级" value="${escapeHtml(rule.priority ?? '')}" style="max-width:88px;">
      <input data-case-seed-rule-label="${index}" placeholder="规则说明" value="${escapeHtml(rule.label || '')}" style="min-width:140px;">
      <select data-case-seed-rule-field="${index}">
        <option value="source_department" ${rule.match_field === 'source_department' ? 'selected' : ''}>按来源部门</option>
        <option value="rectification_unit_name" ${rule.match_field === 'rectification_unit_name' ? 'selected' : ''}>按整改单位</option>
      </select>
      <input data-case-seed-rule-value="${index}" placeholder="匹配值" value="${escapeHtml(rule.match_value || '')}">
      <input data-case-seed-rule-assignee="${index}" placeholder="落责任人" value="${escapeHtml(rule.assignee || '')}">
      <button class="btn-secondary" type="button" data-case-seed-rule-remove="${index}">删除</button>
    </div>
  `).join('');
}

function caseSeedAssignmentMatchCards(preview) {
  const matches = preview.assignment_matches || [];
  if (!matches.length) {
    return '<div class="muted">本次预检没有命中自动分派规则。</div>';
  }
  return matches.map((item) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(item.project_name)}</strong>
      <div class="muted" style="margin-top:6px;">优先级 ${escapeHtml(item.priority)} / 责任人 ${escapeHtml(item.assignee)}</div>
      <div class="muted" style="margin-top:4px;">${escapeHtml(item.rule_label || item.match_field)} / ${escapeHtml(item.match_value)}</div>
      <div style="margin-top:6px;">${escapeHtml(item.reason)}</div>
    </div>
  `).join('');
}

function currentCaseSeedAssignmentRules() {
  return (state.caseSeedAssignmentRules || [])
    .map((rule) => ({
      priority: rule.priority === '' || rule.priority == null ? null : Number(rule.priority),
      label: String(rule.label || '').trim() || null,
      match_field: String(rule.match_field || '').trim(),
      match_value: String(rule.match_value || '').trim(),
      assignee: String(rule.assignee || '').trim()
    }))
    .filter((rule) => rule.match_field && rule.match_value && rule.assignee);
}

function currentCaseSeedMappingOverrides() {
  return (state.caseSeedMappingOverrides || [])
    .map((item) => ({
      field_key: String(item.field_key || '').trim(),
      source_header: String(item.source_header || '').trim()
    }))
    .filter((item) => item.field_key && item.source_header);
}

function caseSeedMappingValue(item) {
  const override = (state.caseSeedMappingOverrides || []).find((entry) => entry.field_key === item.field_key);
  return override?.source_header || '';
}

function batchEndpoint(taskKind) {
  switch (taskKind) {
    case 'budget_summary':
      return '/api/import/budget/batch';
    case 'treasury_payment':
      return '/api/import/treasury/batch';
    case 'voucher_ledger':
      return '/api/import/voucher/batch';
    default:
      return '/api/import/procurement/batch';
  }
}

function batchPlaceholder() {
  if (state.selectedTaskKind === 'budget_summary') {
    if (state.selectedDatasetKind === 'public_fiscal_summary') {
      return JSON.stringify({
        title: '公开财政收支导入',
        dataset_kind: 'public_fiscal_summary',
        records: [{
          period: '2026-03',
          region: '江苏省',
          budget_scope: '一般公共预算',
          direction: '收入',
          summary_item: '税收收入',
          actual_amount: '6500000',
          budget_amount: '7000000'
        }]
      }, null, 2);
    }
    return JSON.stringify({
      title: '预算执行导入',
      dataset_kind: 'department_execution_detail',
      records: [{
        period: '2026-03',
        budget_unit_name: '某财政局',
        budget_unit_code: '320100001',
        budget_scope: '一般公共预算',
        direction: '支出',
        budget_project_name: '预算一体化升级',
        project_catalog_id: 'CAT-001',
        indicator_document_no: '指标-001',
        funding_source_name: '一般财政',
        function_classification_code: '2019999',
        economic_classification_code: '30201',
        budget_amount: '1000000',
        actual_amount: '820000'
      }]
    }, null, 2);
  }
  if (state.selectedTaskKind === 'treasury_payment') {
    return JSON.stringify({
      title: '国库支付批量导入',
      dataset_kind: 'treasury_payment_detail',
      records: [{
        budget_unit_name: '某财政局',
        budget_project_name: '绩效评价咨询服务',
        supplier_name: '中标供应商',
        funding_source_name: '一般公共预算',
        function_classification_code: '2019999',
        economic_classification_code: '30201',
        indicator_document_no: '指标-001',
        project_catalog_id: 'CAT-001',
        contract_no: 'HT-001',
        payment_order_no: 'PAY-001',
        treasury_voucher_no: 'TV-001',
        amount: '500000',
        paid_at: '2026-04-20',
        counterparty: '中标供应商'
      }]
    }, null, 2);
  }
  if (state.selectedTaskKind === 'voucher_ledger') {
    return JSON.stringify({
      title: '会计凭证批量导入',
      dataset_kind: 'voucher_entry_detail',
      records: [{
        budget_unit_name: '某财政局',
        budget_project_name: '绩效评价咨询服务',
        supplier_name: '中标供应商',
        funding_source_name: '一般公共预算',
        function_classification_code: '2019999',
        economic_classification_code: '30201',
        indicator_document_no: '指标-001',
        project_catalog_id: 'CAT-001',
        contract_no: 'HT-001',
        payment_order_no: 'PAY-001',
        treasury_voucher_no: 'TV-001',
        voucher_no: '记-001',
        account_code: '500101',
        account_name: '业务活动费用',
        debit_amount: '500000',
        credit_amount: '500000',
        booked_at: '2026-04-21'
      }]
    }, null, 2);
  }
  return JSON.stringify({
    title: '批量采购导入',
    records: [{
      project_name: '预算一体化升级',
      purchaser_name: '某财政局',
      announcement_type: '中标公告',
      project_code: 'PROC-001',
      budget_amount: '1000000',
      award_amount: '980000'
    }]
  }, null, 2);
}

function normalizeConnectorPreview(response) {
  const previewJob = response.preview_job || {};
  const preview = previewJob.preview || {};
  const detail = preview.detail?.payload || preview.detail || {};
  const common = {
    title: preview.title,
    primary_subject: preview.primary_subject,
    quality_report: preview.quality_report,
    applicable_rule_sets: detail.applicable_rule_sets || []
  };
  let normalizedPreview = common;
  switch (previewJob.task_kind) {
    case 'budget_summary':
      normalizedPreview = {
        ...common,
        dataset_kind: detail.dataset_kind,
        records: detail.rows_preview || [],
        rows_preview: detail.rows_preview || [],
        trend_points: detail.trend_points || [],
        classification_breakdown: detail.classification_breakdown || [],
        variance_highlights: detail.variance_highlights || [],
        linkage_summary: detail.linkage_summary || {}
      };
      break;
    case 'treasury_payment':
      normalizedPreview = {
        ...common,
        dataset_kind: detail.dataset_kind,
        records: detail.vouchers || [],
        vouchers: detail.vouchers || [],
        contracts: detail.contracts || [],
        contract_linkage_summary: detail.contract_linkage_summary || {},
        payment_linkage_summary: detail.payment_linkage_summary || {},
        ledger_linkage_summary: detail.ledger_linkage_summary || {}
      };
      break;
    case 'voucher_ledger':
      normalizedPreview = {
        ...common,
        dataset_kind: detail.dataset_kind,
        records: detail.entries || [],
        entries: detail.entries || [],
        payment_linkage_summary: detail.payment_linkage_summary || {},
        ledger_linkage_summary: detail.ledger_linkage_summary || {}
      };
      break;
    default:
      normalizedPreview = {
        ...common,
        records: detail.projects || [],
        projects: detail.projects || [],
        contracts: detail.contracts || []
      };
      break;
  }

  return {
    job_id: previewJob.id,
    task_kind: previewJob.task_kind,
    source_kind: previewJob.source_kind,
    connector_sync_job: response.sync_job,
    preview: normalizedPreview
  };
}

function updateConnectorProfileSelection(profiles) {
  if (!profiles.some((item) => item.id === state.selectedConnectorProfileId)) {
    state.selectedConnectorProfileId = profiles[0]?.id || '';
  }
}

export function renderEnvironmentCopy() {
  const policy = deploymentPolicy();
  const publicCopy = policy.environment_mode === 'public_demo'
    ? '公网环境仅用于方案汇报、路演和脱敏样例演示，不承载真实政府业务数据。'
    : policy.environment_mode === 'government_poc'
      ? '当前环境用于单租户政府 PoC，要求经 HTTPS 入口访问并受控接入数据。'
      : '当前环境用于本地开发与联调，可通过环境变量注入受控凭据。';
  const aiCopy = policy.ai_enabled
    ? 'AI 仅用于辅助解释与摘要生成，规则结论仍以系统规则为准。'
    : '当前环境已关闭 AI，仅保留标准导入、规则和报告链路。';
  if ($('publicModeText')) $('publicModeText').textContent = publicCopy;
  if ($('sidebarDeploymentCopy')) $('sidebarDeploymentCopy').textContent = publicCopy;
  if ($('sidebarAiCopy')) $('sidebarAiCopy').textContent = aiCopy;
  if ($('environmentBanner')) {
    const title = {
      local: '当前为本地开发环境',
      public_demo: '当前为公网样板环境',
      government_poc: '当前为政府 PoC 环境'
    }[policy.environment_mode] || '当前环境';
    const transportCopy = policy.environment_mode === 'government_poc'
      ? '传输入口必须通过 HTTPS 反向代理。'
      : '传输入口允许本地 HTTP 调试。';
    $('environmentBanner').innerHTML = `<strong>${title}</strong><br>${publicCopy}<br>${transportCopy}<br>${aiCopy}`;
  }
}

export function toggleRegisterPanel() {
  const policy = deploymentPolicy();
  const canRegister = state.bootstrap?.needs_registration || policy.allow_public_registration;
  $('registerTab').classList.toggle('hidden', !canRegister);
  if (!canRegister) {
    $('registerForm').classList.add('hidden');
    $('loginForm').classList.remove('hidden');
    $('loginTab').classList.add('active');
    $('registerTab').classList.remove('active');
  }
}

export function renderAiState() {
  if ($('adminAiNotice')) {
    $('adminAiNotice').textContent = deploymentPolicy().ai_enabled
      ? '当前环境允许 AI 辅助解释；凭据仅从环境变量读取。'
      : '当前环境已关闭 AI；管理员仍可维护配置。';
  }
}

export async function loadConnectorBootstrap(force = false) {
  if (!state.user) return null;
  if (!force && state.connectorBootstrap) {
    return state.connectorBootstrap;
  }
  try {
    state.connectorBootstrap = await api('/api/connectors/bootstrap');
    return state.connectorBootstrap;
  } catch (error) {
    state.connectorBootstrap = {
      connector_types: [],
      profiles: [],
      sync_jobs: [],
      writeback_events: []
    };
    if (force) {
      throw error;
    }
    return state.connectorBootstrap;
  }
}

export function renderImportWorkbench() {
  const definition = activeDefinition();
  if (!definition) return;
  const policy = deploymentPolicy();
  const dataEntryDisabled = policy.environment_mode === 'public_demo';

  const variants = datasetVariantDefinitions();
  if (variants.length) {
    if (!variants.some((item) => item.dataset_kind === state.selectedDatasetKind)) {
      state.selectedDatasetKind = variants[0].dataset_kind;
    }
  } else {
    state.selectedDatasetKind = null;
  }

  if (!definition.supported_sources.includes(state.selectedSourceKind)) {
    state.selectedSourceKind = definition.supported_sources[0] || 'file';
  }

  $('taskKindGrid').innerHTML = taskKindDefinitions().map((item) => `
    <div class="scenario ${item.task_kind === state.selectedTaskKind ? 'active' : ''}" data-task-kind="${item.task_kind}">
      <div class="pill">${escapeHtml(item.enabled ? 'enabled' : 'planned')}</div>
      <h3>${escapeHtml(item.label)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <small class="muted">${escapeHtml(item.availability_note || '当前阶段可用')}</small>
    </div>
  `).join('');
  document.querySelectorAll('[data-task-kind]').forEach((node) => {
    node.onclick = () => {
      state.selectedTaskKind = node.dataset.taskKind;
      state.currentPreview = null;
      renderImportWorkbench();
      renderPreviewPanel();
    };
  });

  $('sourceKindTabs').innerHTML = SOURCE_ORDER
    .filter((kind) => definition.supported_sources.includes(kind))
    .map((kind) => `<button class="btn-secondary ${kind === state.selectedSourceKind ? 'active' : ''}" data-source-kind="${kind}">${escapeHtml(sourceKindLabel(kind))}</button>`)
    .join('');
  document.querySelectorAll('[data-source-kind]').forEach((node) => {
    node.onclick = () => {
      state.selectedSourceKind = node.dataset.sourceKind;
      renderImportWorkbench();
    };
  });

  $('importDefinitionTitle').textContent = definition.label;
  $('importDefinitionCopy').textContent = definition.enabled
    ? (activeDatasetVariant()?.description || '先选导入来源，再做预检或直接创建任务。')
    : (definition.availability_note || '当前阶段尚未启用。');
  $('importDefinitionFields').innerHTML = `${currentVariantSummary()}${activeFieldDefinitions().length
    ? activeFieldDefinitions().map((field) => `
      <div class="notice" style="margin-bottom:8px;">
        <strong>${escapeHtml(field.label)}${field.required ? ' *' : ''}</strong><br>
        <span class="muted">${escapeHtml(field.description || '')}</span>
      </div>
    `).join('')
    : '<div class="muted">当前类型仅保留入口和占位说明。</div>'}`;

  document.querySelectorAll('[data-dataset-kind]').forEach((node) => {
    node.onclick = () => {
      state.selectedDatasetKind = node.dataset.datasetKind;
      state.currentPreview = null;
      renderImportWorkbench();
      renderPreviewPanel();
    };
  });

  const profiles = connectorProfileDefinitions(state.selectedTaskKind, state.selectedDatasetKind);
  updateConnectorProfileSelection(profiles);
  if ($('connectorProfileSelect')) {
    $('connectorProfileSelect').innerHTML = profiles.length
      ? profiles.map((profile) => `
        <option value="${profile.id}" ${profile.id === state.selectedConnectorProfileId ? 'selected' : ''}>
          ${escapeHtml(profile.name)} / ${escapeHtml(profile.base_url)}
        </option>
      `).join('')
      : '<option value="">暂无可用连接档案</option>';
    $('connectorProfileSelect').onchange = (event) => {
      state.selectedConnectorProfileId = event.target.value;
    };
  }
  if ($('connectorDatasetHint')) {
    $('connectorDatasetHint').textContent = profiles.length
      ? `当前可用档案 ${profiles.length} 个，按 ${taskKindLabel(state.selectedTaskKind)} / ${datasetKindLabel(state.selectedDatasetKind)} 过滤。`
      : '当前任务类型下没有连接档案，请先在管理员后台创建。';
  }

  $('fileSourcePanel').classList.toggle('hidden', state.selectedSourceKind !== 'file');
  $('batchSourcePanel').classList.toggle('hidden', state.selectedSourceKind !== 'batch');
  $('fetchSourcePanel').classList.toggle('hidden', state.selectedSourceKind !== 'fetch');
  $('connectorSourcePanel').classList.toggle('hidden', state.selectedSourceKind !== 'connector');

  $('previewImportBtn').disabled = dataEntryDisabled || !definition.enabled || state.selectedSourceKind !== 'file';
  $('commitImportBtn').disabled = !state.currentPreview?.job_id || state.currentPreview?.source_kind === 'connector';
  $('submitBatchBtn').disabled = dataEntryDisabled || !definition.enabled || state.selectedSourceKind !== 'batch';
  if ($('submitFetchBtn')) {
    $('submitFetchBtn').disabled = dataEntryDisabled || state.selectedTaskKind !== 'procurement_project' || state.selectedSourceKind !== 'fetch';
  }
  if ($('previewConnectorBtn')) {
    $('previewConnectorBtn').disabled = dataEntryDisabled || state.selectedSourceKind !== 'connector' || !state.selectedConnectorProfileId;
  }
  if ($('commitConnectorBtn')) {
    $('commitConnectorBtn').disabled = dataEntryDisabled || state.selectedSourceKind !== 'connector' || !state.selectedConnectorProfileId;
  }
  if ($('batchPayload')) {
    $('batchPayload').placeholder = batchPlaceholder();
  }
  renderCaseSeedImportPanel();
}

export function renderPreviewPanel() {
  const current = state.currentPreview;
  if (!current) {
    $('previewMeta').textContent = '先执行导入预检或直接创建批量 / URL / 连接器任务。';
    $('previewRecords').innerHTML = '<div class="muted">暂无预检结果。</div>';
    $('previewChecks').innerHTML = '<div class="muted">暂无质量报告。</div>';
    $('commitImportBtn').disabled = true;
    return;
  }

  const preview = current.preview || {};
  const metaParts = [taskKindLabel(current.task_kind)];
  if (preview.dataset_kind) {
    metaParts.push(datasetKindLabel(preview.dataset_kind));
  }
  metaParts.push(sourceKindLabel(current.source_kind));
  metaParts.push(`接收 ${preview.quality_report?.accepted_rows || 0} 行，拒绝 ${preview.quality_report?.rejected_rows || 0} 行`);
  $('previewMeta').textContent = metaParts.join(' / ');
  $('previewRecords').innerHTML = previewRecordCards(current.task_kind, preview);
  $('previewChecks').innerHTML = qualityChecks(preview.quality_report?.checks || []);
  $('commitImportBtn').disabled = !current.job_id || current.source_kind === 'connector';
}

export function renderCaseSeedImportPanel() {
  const preview = state.caseSeedPreview;
  const dataEntryDisabled = deploymentPolicy().environment_mode === 'public_demo';
  if ($('caseSeedTemplateKind')) {
    $('caseSeedTemplateKind').value = state.caseSeedTemplateKind || 'investment_review';
  }
  if ($('caseSeedAssignmentRuleRows')) {
    $('caseSeedAssignmentRuleRows').innerHTML = caseSeedAssignmentRuleRows();
  }
  if ($('caseSeedConfigMeta')) {
    $('caseSeedConfigMeta').textContent = state.caseSeedConfigUpdatedAt
      ? `当前模板配置已保存 / ${state.caseSeedConfigUpdatedAt}`
      : '当前模板还没有保存的导入配置。';
  }
  if ($('caseSeedPreviewMeta')) {
    $('caseSeedPreviewMeta').textContent = preview
      ? `${caseSeedTemplateLabel(preview.template_kind)} / 文件预检 / 接收 ${preview.quality_report?.accepted_rows || 0} 行，拒绝 ${preview.quality_report?.rejected_rows || 0} 行 / 自动分派 ${preview.assignment_hits || 0} 条`
      : '上传监督评审台账、审减额周报、处罚台账或专项检查问题清单，直接生成案件种子。';
  }
  if ($('caseSeedPreviewRecords')) {
    $('caseSeedPreviewRecords').innerHTML = preview
      ? caseSeedPreviewCards(preview)
      : '<div class="muted">暂无案件种子预检结果。</div>';
  }
  if ($('caseSeedFieldMappings')) {
    $('caseSeedFieldMappings').innerHTML = preview
      ? caseSeedFieldMappingCards(preview)
      : '<div class="muted">暂无字段映射预览。</div>';
  }
  if ($('caseSeedPreviewChecks')) {
    $('caseSeedPreviewChecks').innerHTML = preview
      ? qualityChecks(preview.quality_report?.checks || [])
      : '<div class="muted">暂无质量报告。</div>';
  }
  if ($('caseSeedAssignmentMatches')) {
    $('caseSeedAssignmentMatches').innerHTML = preview
      ? caseSeedAssignmentMatchCards(preview)
      : '<div class="muted">暂无自动分派命中说明。</div>';
  }
  if ($('importCaseSeedBtn')) {
    $('importCaseSeedBtn').disabled = dataEntryDisabled || !preview?.records?.length;
  }
  if ($('previewCaseSeedBtn')) {
    $('previewCaseSeedBtn').disabled = dataEntryDisabled;
  }
}

export async function downloadImportTemplate() {
  const query = state.selectedDatasetKind
    ? `?dataset_kind=${encodeURIComponent(state.selectedDatasetKind)}`
    : '';
  const blob = await api(`/api/import/templates/${state.selectedTaskKind}${query}`);
  downloadBlob(blob, `${state.selectedTaskKind}-${state.selectedDatasetKind || 'default'}-template.csv`);
}

export async function previewFileImport() {
  const definition = activeDefinition();
  if (!definition?.enabled) {
    return notify('当前类型尚未启用文件导入', 'error');
  }
  const file = $('importFileInput').files[0];
  if (!file) {
    return notify('请选择一个 CSV 或 Excel 文件', 'error');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('task_kind', state.selectedTaskKind);
  form.append('source_kind', 'file');
  form.append('title', $('importTitle').value || '');
  if (state.selectedDatasetKind) {
    form.append('dataset_kind', state.selectedDatasetKind);
  }
  state.currentPreview = await api('/api/import/preview', { method: 'POST', body: form });
  renderPreviewPanel();
  notify('导入预检完成');
}

export async function commitPreviewImport() {
  if (!state.currentPreview?.job_id) {
    return notify('请先完成文件预检', 'error');
  }
  state.currentTask = await api('/api/import/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: state.currentPreview.job_id })
  });
  state.currentPreview = null;
  renderPreviewPanel();
  await refreshTasks(state.currentTask.id);
  notify(`${taskKindLabel(state.currentTask.task_kind)}任务已创建`);
}

export async function downloadCaseSeedTemplate() {
  const blob = await api(`/api/case-seeds/template?template_kind=${encodeURIComponent(state.caseSeedTemplateKind || 'investment_review')}`);
  downloadBlob(blob, `supervision-case-seed-${state.caseSeedTemplateKind || 'investment_review'}-template.csv`);
}

export async function previewCaseSeedImport() {
  const file = $('caseSeedFileInput').files[0];
  if (!file) {
    return notify('请选择案件种子 CSV 或 Excel 文件', 'error');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('title', $('caseSeedTitle').value || '');
  form.append('template_kind', state.caseSeedTemplateKind || 'investment_review');
  form.append('mapping_overrides_json', JSON.stringify(currentCaseSeedMappingOverrides()));
  form.append('assignment_rules_json', JSON.stringify(currentCaseSeedAssignmentRules()));
  const response = await api('/api/case-seeds/preview', { method: 'POST', body: form });
  state.caseSeedPreview = response.preview;
  renderCaseSeedImportPanel();
  notify('案件种子预检完成');
}

export async function importCaseSeedBatch() {
  const preview = state.caseSeedPreview;
  const validationError = validateCaseSeedPreviewForImport(preview);
  if (validationError) {
    return notify(validationError, 'error');
  }
  const response = await api('/api/case-seeds/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCaseSeedImportPayload({
      preview,
      title: $('caseSeedTitle').value,
      templateKind: state.caseSeedTemplateKind,
      mappingOverrides: currentCaseSeedMappingOverrides(),
      assignmentRules: currentCaseSeedAssignmentRules()
    }))
  });
  state.caseSeedPreview = null;
  renderCaseSeedImportPanel();
  await refreshTasks();
  notify(`案件种子已导入 ${response.imported} 条`);
}

export async function loadCaseSeedTemplateConfig() {
  const response = await api(`/api/case-seeds/config?template_kind=${encodeURIComponent(state.caseSeedTemplateKind || 'investment_review')}`);
  const config = response.config;
  state.caseSeedMappingOverrides = config?.mapping_overrides || [];
  state.caseSeedAssignmentRules = config?.assignment_rules || [];
  state.caseSeedConfigUpdatedAt = config?.updated_at || null;
  renderCaseSeedImportPanel();
}

export async function saveCaseSeedTemplateConfig() {
  const response = await api('/api/case-seeds/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_kind: state.caseSeedTemplateKind || 'investment_review',
      mapping_overrides: currentCaseSeedMappingOverrides(),
      assignment_rules: currentCaseSeedAssignmentRules()
    })
  });
  state.caseSeedConfigUpdatedAt = response.config?.updated_at || null;
  notify(`已保存${caseSeedTemplateLabel(state.caseSeedTemplateKind)}导入配置`);
  renderCaseSeedImportPanel();
}

export async function setCaseSeedTemplateKind(value) {
  state.caseSeedTemplateKind = value || 'investment_review';
  state.caseSeedPreview = null;
  await loadCaseSeedTemplateConfig();
}

export function addCaseSeedAssignmentRule() {
  state.caseSeedAssignmentRules.push({
    priority: '',
    label: '',
    match_field: 'source_department',
    match_value: '',
    assignee: ''
  });
  renderCaseSeedImportPanel();
}

export function updateCaseSeedAssignmentRule(index, patch) {
  if (!state.caseSeedAssignmentRules[index]) return;
  state.caseSeedAssignmentRules[index] = {
    ...state.caseSeedAssignmentRules[index],
    ...patch
  };
}

export function removeCaseSeedAssignmentRule(index) {
  state.caseSeedAssignmentRules.splice(index, 1);
  renderCaseSeedImportPanel();
}

export function updateCaseSeedMappingOverride(fieldKey, sourceHeader) {
  const next = (state.caseSeedMappingOverrides || []).filter((item) => item.field_key !== fieldKey);
  if (sourceHeader) {
    next.push({ field_key: fieldKey, source_header: sourceHeader });
  }
  state.caseSeedMappingOverrides = next;
  renderCaseSeedImportPanel();
}

export async function submitBatchImport() {
  const rawValue = $('batchPayload').value.trim();
  if (!rawValue) {
    return notify('请填写批量 JSON payload', 'error');
  }
  const payload = normalizeBatchPayload(rawValue);
  if (!$('batchTitle').value && !payload.title) {
    payload.title = `${taskKindLabel(state.selectedTaskKind)}批量导入`;
  } else if ($('batchTitle').value) {
    payload.title = $('batchTitle').value;
  }
  if (state.selectedDatasetKind && !payload.dataset_kind && state.selectedTaskKind !== 'procurement_project') {
    payload.dataset_kind = state.selectedDatasetKind;
  }
  state.currentTask = await api(batchEndpoint(state.selectedTaskKind), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await refreshTasks(state.currentTask.id);
  notify(`${taskKindLabel(state.currentTask.task_kind)}批量任务已创建`);
}

export async function submitFetchImport() {
  if (state.selectedTaskKind !== 'procurement_project') {
    return notify('当前仅采购模式支持 URL 主动采集', 'error');
  }
  const urls = $('fetchUrls').value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!urls.length) {
    return notify('请至少提供一个公告页或列表页 URL', 'error');
  }
  state.currentTask = await api('/api/import/procurement/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: $('fetchTitle').value || '公告抓取导入',
      urls
    })
  });
  await refreshTasks(state.currentTask.id);
  notify('公告抓取任务已创建');
}

export async function previewConnectorImport() {
  const profileId = state.selectedConnectorProfileId || $('connectorProfileSelect')?.value;
  if (!profileId) {
    return notify('请先选择连接档案', 'error');
  }
  const response = await api(`/api/connectors/${encodeURIComponent(profileId)}/preview`, {
    method: 'POST'
  });
  state.currentPreview = normalizeConnectorPreview(response);
  await loadConnectorBootstrap(true);
  renderImportWorkbench();
  renderPreviewPanel();
  notify('连接器预检完成');
}

export async function commitConnectorImport() {
  const profileId = state.selectedConnectorProfileId || $('connectorProfileSelect')?.value;
  if (!profileId) {
    return notify('请先选择连接档案', 'error');
  }
  const response = await api(`/api/connectors/${encodeURIComponent(profileId)}/commit`, {
    method: 'POST'
  });
  state.currentTask = response.task;
  state.currentPreview = null;
  await loadConnectorBootstrap(true);
  renderPreviewPanel();
  await refreshTasks(state.currentTask.id);
  notify(`${taskKindLabel(state.currentTask.task_kind)}连接器任务已创建`);
}

export async function selectTaskById(taskId, taskKind = null, keepHash = false) {
  const [task, exceptions] = await Promise.all([
    api(`/api/tasks/${taskId}`),
    api(`/api/tasks/${taskId}/exceptions`).catch(() => [])
  ]);
  state.currentTask = task;
  state.currentTaskExceptions = Array.isArray(exceptions) ? exceptions : [];
  state.currentTaskExceptionSelection = [];
  renderTaskDetail();
  renderTaskExceptionPool();
  updateTaskActionControls();
  await loadArtifacts(taskId).catch(() => {});
  if (!keepHash) {
    setTaskHash(state.currentTask);
  }
}

export async function exportCurrentTaskPdf() {
  if (!state.currentTask) {
    return notify('请先选择任务', 'error');
  }
  const blob = await api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}/report.pdf`, { method: 'GET' });
  downloadBlob(blob, `audit-report-${state.currentTask.id}.pdf`);
}

export async function sealCurrentTaskPackage() {
  if (!state.currentTask) {
    return notify('请先选择任务', 'error');
  }
  const blob = await api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}/seal`, { method: 'POST' });
  downloadBlob(blob, `audit-seal-${state.currentTask.id}.zip`);
  if ($('taskActionStatus')) {
    $('taskActionStatus').textContent = `密封包已生成，大小 ${blob.size || 0} bytes`;
  }
}

export async function explainCurrentTaskWithAi() {
  if (!state.currentTask) {
    return notify('请先选择任务', 'error');
  }
  if (!deploymentPolicy().ai_enabled) {
    if ($('taskActionStatus')) {
      $('taskActionStatus').textContent = 'AI 已按 PoC 策略关闭';
    }
    return notify('当前部署策略已关闭 AI 辅助解释', 'error');
  }
  const result = await api(`/api/tasks/${encodeURIComponent(state.currentTask.id)}/ai`, { method: 'POST' });
  if ($('taskActionStatus')) {
    $('taskActionStatus').textContent = result.summary || 'AI 解释已生成';
  }
}

export async function syncTaskRoute(preferredTaskId = null) {
  const route = parseTaskRoute();
  const candidateId = preferredTaskId || route?.taskId || state.currentTask?.id || state.tasks[0]?.id;
  const summary = state.tasks.find((item) => item.id === candidateId);
  if (!summary) {
    state.currentTask = null;
    state.currentTaskExceptions = [];
    state.currentTaskExceptionSelection = [];
    renderTaskDetail();
    renderTaskExceptionPool();
    updateTaskActionControls();
    return;
  }
  await selectTaskById(summary.id, summary.task_kind, true);
  if (state.currentWorkspacePage === 'tasks' && (!route || route.taskId !== summary.id || route.taskKind !== summary.task_kind)) {
    setTaskHash(summary);
  }
}

export async function refreshTasks(preferredTaskId = null) {
  state.tasks = await api('/api/tasks');
  renderTaskTable(selectTaskById);
  renderStats();
  await syncTaskRoute(preferredTaskId);
}


