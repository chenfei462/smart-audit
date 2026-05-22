import { state, taskKindLabel, sourceKindLabel, datasetKindLabel, linkageModeLabel } from './state.js';
import { $ } from './services.js';
import { buildTaskListView, expandedGroupsForAll, taskGroupKey } from './task-list.js?v=viz-20260430';
import { renderOverviewCharts, renderTaskResultCharts } from './charts.js?v=viz-20260430';
import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from './procurement-chain.js';

function riskBadgeClass(level) {
  if (level === 'Critical' || level === 'High') return 'red';
  if (level === 'Medium') return 'gold';
  return 'green';
}

function riskDisplay(level) {
  if (level === 'Critical') return '极高';
  if (level === 'High') return '高';
  if (level === 'Medium') return '中';
  if (level === 'Low') return '低';
  return level;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function taskListFilters() {
  return state.taskListFilters || {
    keyword: '',
    taskKind: 'all',
    sourceKind: 'all',
    riskLevel: 'all',
  };
}

function renderTaskListControls(view) {
  if ($('taskListCount')) {
    $('taskListCount').textContent = `显示 ${view.visibleCount} / 共 ${view.totalCount} 条`;
  }
  if ($('taskSearchInput')) {
    $('taskSearchInput').value = taskListFilters().keyword || '';
  }
  if ($('taskKindFilter')) {
    const current = taskListFilters().taskKind || 'all';
    const taskKinds = Array.from(new Set((state.tasks || []).map((task) => task.task_kind).filter(Boolean)));
    $('taskKindFilter').innerHTML = [
      '<option value="all">全部类型</option>',
      ...taskKinds.map((taskKind) => `<option value="${escapeHtml(taskKind)}">${escapeHtml(taskKindLabel(taskKind))}</option>`),
    ].join('');
    $('taskKindFilter').value = current;
  }
  if ($('taskSourceFilter')) {
    $('taskSourceFilter').value = taskListFilters().sourceKind || 'all';
  }
  if ($('taskRiskFilter')) {
    $('taskRiskFilter').value = taskListFilters().riskLevel || 'all';
  }
}

function sourceEvidenceLine(record) {
  const evidence = record?.source_evidence;
  if (!evidence) return '来源证据：未提供';
  const title = evidence.title || '未命名来源';
  const url = evidence.url ? ` / ${evidence.url}` : '';
  const published = evidence.published_at ? ` / 发布 ${evidence.published_at}` : '';
  const captured = evidence.captured_at ? ` / 采集 ${evidence.captured_at}` : '';
  const parser = evidence.parser_version ? ` / 解析器 ${evidence.parser_version}` : '';
  const row = evidence.row_number ? ` / 原始行 ${evidence.row_number}` : '';
  return `来源证据：${title}${url}${published}${captured}${parser}${row}`;
}

function normalizedRegionLine(record) {
  const region = record?.normalized_region;
  if (!region) return record?.region ? `区域：${record.region}` : '区域：未提供';
  const code = region.normalized_region_code ? ` / ${region.normalized_region_code}` : '';
  return `区域：${region.display_name || record.region || '-'}${code}`;
}

function linkageExplanationLine(evidence) {
  if (!evidence) return 'Linkage confidence: 0 / no candidate matches';
  const candidates = (evidence.candidate_matches || [])
    .map((item) => `${item.record_type}:${item.record_id}@${item.confidence}`)
    .join(', ');
  const unmatched = evidence.unmatched_reason ? ` / unmatched: ${evidence.unmatched_reason}` : '';
  return `Linkage confidence: ${evidence.linkage_confidence ?? evidence.match_score ?? 0} / candidates: ${candidates || '-'}${unmatched}`;
}

function renderQualityChecks(checks) {
  if (!checks?.length) {
    return '<div class="muted">暂无导入质量问题。</div>';
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

function renderFindings(findings) {
  if (!findings?.length) {
    return '<div class="muted">当前任务未命中规则结果。</div>';
  }
  return findings.map((finding) => `
    <div class="notice" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <strong>${escapeHtml(finding.rule_name)}</strong>
          <div class="muted" style="margin-top:4px;">${escapeHtml(finding.rule_code)} / ${escapeHtml(finding.rule_category)}</div>
        </div>
        <span class="badge ${riskBadgeClass(finding.risk_level)}">${escapeHtml(riskDisplay(finding.risk_level))}</span>
      </div>
      <div style="margin-top:8px;">${escapeHtml(finding.summary)}</div>
      <div class="muted" style="margin-top:8px;">依据：${escapeHtml(finding.audit_rationale)}</div>
      <div class="muted" style="margin-top:4px;">证据：${escapeHtml(finding.evidence_summary)}</div>
      <div class="muted" style="margin-top:4px;">建议：${escapeHtml(finding.recommended_action)}</div>
      ${finding.severity_reason ? `<div class="muted" style="margin-top:4px;">风险解释：${escapeHtml(finding.severity_reason)}</div>` : ''}
      ${(finding.missing_evidence || []).length ? `<div class="muted" style="margin-top:4px;">缺失证据：${escapeHtml((finding.missing_evidence || []).join('；'))}</div>` : ''}
      ${(finding.recommended_next_data || []).length ? `<div class="muted" style="margin-top:4px;">下一步补数：${escapeHtml((finding.recommended_next_data || []).join('；'))}</div>` : ''}
    </div>
  `).join('');
}

function budgetProjectName(detail, budgetProjectId) {
  if (!budgetProjectId) return '未关联预算项目';
  return detail.budget_projects?.find((item) => item.id === budgetProjectId)?.name || budgetProjectId;
}

function renderSummaryCard(title, rows) {
  return `
    <div class="notice">
      <strong>${escapeHtml(title)}</strong>
      ${rows.map((row) => `<div class="muted" style="margin-top:6px;">${escapeHtml(row.label)}：${escapeHtml(row.value)}</div>`).join('')}
    </div>
  `;
}

function closureStatusLabel(status) {
  return {
    closed_public_chain: '公开链条已闭合',
    missing_contract: '缺合同公告',
    missing_downstream_evidence: '缺后续证据',
    incomplete_public_chain: '公开链条不完整',
  }[status] || status || '未判断';
}

function renderChainStageBadges(group) {
  return (group.stage_statuses || []).map((stage) => `
    <span
      class="badge ${stage.present ? 'green' : 'gold'}"
      title="${escapeHtml(stage.present ? stage.source_url || stage.label : `待发现${stage.label}`)}"
      style="margin:0 4px 4px 0;"
    >
      ${escapeHtml(stage.label)}${stage.present ? '' : '缺'}
    </span>
  `).join('');
}

function renderDiscoveryQueue(queue) {
  if (!queue.items.length) {
    return '<div class="muted">当前采购公开链条没有待发现的合同、验收、支付或整改公开来源。</div>';
  }
  return `
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>目标来源</th>
            <th>优先级</th>
            <th>项目 / 包件</th>
            <th>检索关键词</th>
            <th>处置</th>
          </tr>
        </thead>
        <tbody>
          ${queue.items.slice(0, 12).map((item) => `
            <tr>
              <td>${escapeHtml(item.target_stage_label)}</td>
              <td><span class="badge ${item.priority === 'P0' ? 'gold' : 'blue'}">${escapeHtml(item.priority)}</span></td>
              <td>${escapeHtml(item.project_code || '-')} / ${escapeHtml(item.package_no || item.package_name || '-')}</td>
              <td>${escapeHtml(item.search_keyword)}</td>
              <td>${escapeHtml(item.finding_disposition)} / ${escapeHtml(item.review_status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderProcurementChainClosurePanel(detail) {
  const closure = buildProcurementChainClosure(detail.projects || []);
  const queue = buildPublicDiscoveryQueue({
    procurementGroups: closure.groups,
    caseSeedRecords: detail.case_seed_records || detail.caseSeeds || detail.case_seeds || [],
  });
  const summary = closure.summary;
  return `
    <div class="section-title" style="margin-top:18px;">
      <div>
        <h2 style="font-size:17px;">采购链条闭合视图</h2>
        <p>按项目编号、包号和公开阶段归并公告、成交、合同、验收和支付证据。</p>
      </div>
    </div>
    <div class="grid-3">
      ${renderSummaryCard('链条闭合', [
        { label: '链条组数', value: summary.group_count },
        { label: '已闭合', value: summary.closed_group_count },
        { label: '金额复核', value: summary.amount_review_count }
      ])}
      ${renderSummaryCard('缺口分布', [
        { label: '缺合同', value: summary.missing_contract_count },
        { label: '缺验收', value: summary.missing_acceptance_count },
        { label: '缺支付', value: summary.missing_payment_count }
      ])}
      ${renderSummaryCard('自动发现队列', [
        { label: '待发现', value: queue.summary.total_items },
        { label: '合同', value: queue.summary.by_target_stage.contract || 0 },
        { label: '验收 / 支付', value: `${queue.summary.by_target_stage.acceptance || 0} / ${queue.summary.by_target_stage.payment || 0}` }
      ])}
    </div>
    <div style="overflow:auto;margin-top:14px;">
      <table>
        <thead>
          <tr>
            <th>项目 / 包件</th>
            <th>采购单位</th>
            <th>阶段</th>
            <th>金额校验</th>
            <th>下一步补数</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${closure.groups.map((group) => `
            <tr>
              <td><strong>${escapeHtml(group.project_code || group.project_name || '-')}</strong><br><span class="muted">${escapeHtml(group.package_no || '-')} / ${escapeHtml(group.package_name || '-')}</span></td>
              <td>${escapeHtml(group.purchaser_name || '-')}</td>
              <td>${renderChainStageBadges(group)}</td>
              <td>${escapeHtml(group.amount_consistency_status || 'not_checked')}${group.amount_difference_yuan ? `<br><span class="muted">差额 ${escapeHtml(group.amount_difference_yuan)}</span>` : ''}</td>
              <td>${escapeHtml((group.recommended_next_data || []).join('；') || '-')}</td>
              <td>${escapeHtml(closureStatusLabel(group.closure_status))}</td>
            </tr>
          `).join('') || '<tr><td colspan="6" class="muted">暂无采购链条记录。</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="section-title" style="margin-top:18px;">
      <div>
        <h2 style="font-size:17px;">自动发现队列</h2>
        <p>为缺失的合同、验收、支付、整改公开来源生成待复核检索项，不直接形成正式违规结论。</p>
      </div>
    </div>
    ${renderDiscoveryQueue(queue)}
  `;
}

function renderProcurementDetail(task) {
  const detail = task.detail.payload;
  const primaryProject = detail.projects?.[0];
  const primaryEvidence = primaryProject?.linkage_evidence || {
    match_mode: primaryProject?.budget_project_id ? 'exact' : 'none',
    match_score: primaryProject?.budget_project_id ? 100 : 0,
    match_reasons: primaryProject?.budget_project_id ? ['已关联预算项目'] : [],
    candidate_budget_project_ids: primaryProject?.budget_project_id ? [primaryProject.budget_project_id] : []
  };
  const contractSummary = task.contract_linkage_summary || {};
  const paymentSummary = task.payment_linkage_summary || {};
  const ledgerSummary = task.ledger_linkage_summary || {};

  $('detailSubtitle').textContent = `${task.title} / ${taskKindLabel(task.task_kind)} / 总体风险 ${riskDisplay(task.risk_level)}`;
  $('taskDetailBody').innerHTML = `
    <div class="grid-2">
      <div class="notice">
        <strong>${escapeHtml(primaryProject?.project_name || task.title)}</strong>
        <div class="muted" style="margin-top:8px;">采购单位：${escapeHtml(primaryProject?.purchaser_name || task.primary_subject)}</div>
        <div class="muted" style="margin-top:4px;">项目编号：${escapeHtml(primaryProject?.project_code || '-')}</div>
        <div class="muted" style="margin-top:4px;">预算 / 成交：${escapeHtml(primaryProject?.budget_amount || '未提供')} / ${escapeHtml(primaryProject?.award_amount || '未提供')}</div>
        <div class="muted" style="margin-top:4px;">预算项目：${escapeHtml(budgetProjectName(detail, primaryProject?.budget_project_id))}</div>
      </div>
      <div class="notice">
        <strong>预算联动</strong>
        <div class="muted" style="margin-top:8px;">关联模式：${escapeHtml(linkageModeLabel(primaryEvidence.match_mode))}</div>
        <div class="muted" style="margin-top:4px;">证据评分：${escapeHtml(primaryEvidence.match_score || 0)}</div>
        <div class="muted" style="margin-top:4px;">${escapeHtml(linkageExplanationLine(primaryEvidence))}</div>
        <div class="muted" style="margin-top:4px;">${escapeHtml(normalizedRegionLine(primaryProject))}</div>
        <div class="muted" style="margin-top:4px;">${escapeHtml(sourceEvidenceLine(primaryProject))}</div>
        <div class="muted" style="margin-top:4px;">证据摘要：${escapeHtml((primaryEvidence.match_reasons || []).join('；') || '暂无关联证据')}</div>
        <div class="muted" style="margin-top:4px;">指标文号 / 项目库 ID：${escapeHtml(primaryProject?.indicator_document_no || '-')} / ${escapeHtml(primaryProject?.project_catalog_id || '-')}</div>
      </div>
    </div>
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">联查摘要</h2><p>展示合同、支付、会计链条状态。</p></div>
    </div>
    <div class="grid-3">
      ${renderSummaryCard('合同链条', [
        { label: '已关联合同', value: contractSummary.linked_contracts || detail.contracts?.length || 0 },
        { label: '缺失合同', value: contractSummary.missing_contracts || Math.max((detail.projects?.length || 0) - (detail.contracts?.length || 0), 0) },
        { label: '写回待处理', value: contractSummary.writeback_pending || 0 }
      ])}
      ${renderSummaryCard('支付联查', [
        { label: '已关联支付', value: paymentSummary.linked_payments || 0 },
        { label: '已支付未入账', value: paymentSummary.paid_without_ledger || 0 },
        { label: '金额差额', value: paymentSummary.amount_gap || '0' }
      ])}
      ${renderSummaryCard('会计联查', [
        { label: '已关联分录', value: ledgerSummary.linked_entries || 0 },
        { label: '时点异常', value: ledgerSummary.timing_exceptions || 0 },
        { label: '人工复核', value: ledgerSummary.manual_review_required || 0 }
      ])}
    </div>
    ${renderProcurementChainClosurePanel(detail)}
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">项目卡片</h2><p>展示采购项目、合同、写回和预算联动状态。</p></div>
    </div>
    <div class="grid-2">
      ${(detail.projects || []).map((project) => {
        const evidence = project.linkage_evidence || {
          match_mode: project.budget_project_id ? 'exact' : 'none',
          match_score: project.budget_project_id ? 100 : 0,
          match_reasons: project.budget_project_id ? ['已关联预算项目'] : []
        };
        const contract = (detail.contracts || []).find((item) => item.procurement_project_id === project.id);
        return `
          <div class="notice">
            <strong>${escapeHtml(project.project_name)}</strong>
            <div class="muted" style="margin-top:8px;">采购单位：${escapeHtml(project.purchaser_name)}</div>
            <div class="muted" style="margin-top:4px;">供应商：${escapeHtml(project.supplier_name || '-')}</div>
            <div class="muted" style="margin-top:4px;">预算 / 成交：${escapeHtml(project.budget_amount || '未提供')} / ${escapeHtml(project.award_amount || '未提供')}</div>
            <div class="muted" style="margin-top:4px;">预算项目：${escapeHtml(budgetProjectName(detail, project.budget_project_id))}</div>
            <div class="muted" style="margin-top:4px;">关联模式：${escapeHtml(linkageModeLabel(evidence.match_mode))} / 评分 ${escapeHtml(evidence.match_score || 0)}</div>
            <div class="muted" style="margin-top:4px;">${escapeHtml(linkageExplanationLine(evidence))}</div>
            <div class="muted" style="margin-top:4px;">${escapeHtml(normalizedRegionLine(project))}</div>
            <div class="muted" style="margin-top:4px;">${escapeHtml(sourceEvidenceLine(project))}</div>
            <div class="muted" style="margin-top:4px;">合同编号：${escapeHtml(contract?.contract_no || '-')}</div>
            <div class="muted" style="margin-top:4px;">验收状态：${escapeHtml(contract?.acceptance_status || '-')} / 写回状态：${escapeHtml(contract?.writeback_status || '-')}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  $('qualityReportList').innerHTML = renderQualityChecks(detail.quality_report?.checks || []);
  $('findingRows').innerHTML = renderFindings(task.findings || []);
}

function renderBudgetRows(rows) {
  if (!rows?.length) {
    return '<div class="muted">暂无预算行预览。</div>';
  }
  return `
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>期间</th>
            <th>主体</th>
            <th>口径</th>
            <th>方向</th>
            <th>预算金额</th>
            <th>实际金额</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.period)}</td>
              <td>${escapeHtml(row.budget_project_name || row.summary_item || row.budget_unit_name || row.region || '-')}</td>
              <td>${escapeHtml(row.budget_scope)}</td>
              <td>${escapeHtml(row.direction)}</td>
              <td>${escapeHtml(row.budget_amount || '-')}</td>
              <td>${escapeHtml(row.actual_amount || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTrendPoints(points) {
  if (!points?.length) {
    return '<div class="muted">暂无趋势点。</div>';
  }
  return points.map((item) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(item.period)}</strong>
      <div class="muted" style="margin-top:6px;">${escapeHtml(item.label)}</div>
      <div class="muted" style="margin-top:4px;">预算 / 实际：${escapeHtml(item.budget_amount || '-')} / ${escapeHtml(item.actual_amount || '-')}</div>
    </div>
  `).join('');
}

function renderBreakdown(items) {
  if (!items?.length) {
    return '<div class="muted">暂无结构占比。</div>';
  }
  return items.map((item) => `
    <div class="notice" style="margin-bottom:10px;">
      <strong>${escapeHtml(item.label)}</strong>
      <div class="muted" style="margin-top:6px;">${escapeHtml(item.dimension)} / ${escapeHtml(item.key)}</div>
      <div style="margin-top:4px;">${escapeHtml(item.amount)}</div>
    </div>
  `).join('');
}

function renderVariance(items) {
  if (!items?.length) {
    return '<div class="muted">暂无偏差高亮。</div>';
  }
  return items.map((item) => `
    <div class="notice" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="badge ${riskBadgeClass(item.risk_level)}">${escapeHtml(riskDisplay(item.risk_level))}</span>
      </div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(item.subject)}</div>
      <div style="margin-top:4px;">${escapeHtml(item.metric_value)}</div>
    </div>
  `).join('');
}

function renderBudgetDetail(task) {
  const detail = task.detail.payload;
  const linkage = detail.linkage_summary || task.budget_linkage_summary || {};
  $('detailSubtitle').textContent = `${task.title} / ${taskKindLabel(task.task_kind)} / ${datasetKindLabel(detail.dataset_kind)} / 总体风险 ${riskDisplay(task.risk_level)}`;
  $('taskDetailBody').innerHTML = `
    <div class="grid-2">
      <div class="notice">
        <strong>${escapeHtml(datasetKindLabel(detail.dataset_kind))}</strong>
        <div class="muted" style="margin-top:8px;">规则域：${escapeHtml((detail.applicable_rule_sets || []).join(', ') || 'budget_rules')}</div>
        <div class="muted" style="margin-top:4px;">预览行数：${escapeHtml(detail.rows_preview?.length || 0)}</div>
      </div>
      <div class="notice">
        <strong>采购预算联动</strong>
        <div class="muted" style="margin-top:8px;">精确关联：${escapeHtml(linkage.exact_linked_procurement_projects || 0)}</div>
        <div class="muted" style="margin-top:4px;">证据自动关联：${escapeHtml(linkage.evidence_auto_linked_procurement_projects || 0)}</div>
        <div class="muted" style="margin-top:4px;">证据候选关联：${escapeHtml(linkage.candidate_procurement_projects || 0)}</div>
        <div class="muted" style="margin-top:4px;">未关联采购项目：${escapeHtml(linkage.unlinked_procurement_projects || 0)}</div>
      </div>
    </div>
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">趋势与结构</h2><p>展示预算执行趋势、结构占比和偏差高亮。</p></div>
    </div>
    <div class="grid-2">
      <div>${renderTrendPoints(detail.trend_points || [])}</div>
      <div>${renderBreakdown(detail.classification_breakdown || [])}</div>
    </div>
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">偏差高亮</h2><p>基于预算规则输出的重点对象。</p></div>
    </div>
    <div>${renderVariance(detail.variance_highlights || [])}</div>
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">标准化行预览</h2><p>最多展示 200 行标准化预算数据。</p></div>
    </div>
    ${renderBudgetRows(detail.rows_preview || [])}
  `;
  $('qualityReportList').innerHTML = renderQualityChecks(detail.quality_report?.checks || []);
  $('findingRows').innerHTML = renderFindings(task.findings || []);
}

function renderTreasuryDetail(task) {
  const detail = task.detail.payload;
  const contractSummary = detail.contract_linkage_summary || task.contract_linkage_summary || {};
  const paymentSummary = detail.payment_linkage_summary || task.payment_linkage_summary || {};
  const ledgerSummary = detail.ledger_linkage_summary || task.ledger_linkage_summary || {};

  $('detailSubtitle').textContent = `${task.title} / ${taskKindLabel(task.task_kind)} / ${datasetKindLabel(detail.dataset_kind)} / 总体风险 ${riskDisplay(task.risk_level)}`;
  $('taskDetailBody').innerHTML = `
    <div class="grid-3">
      ${renderSummaryCard('合同联查', [
        { label: '已关联合同', value: contractSummary.linked_contracts || 0 },
        { label: '未闭合链条', value: contractSummary.open_contract_chains || 0 },
        { label: '写回待处理', value: contractSummary.writeback_pending || 0 }
      ])}
      ${renderSummaryCard('支付联查', [
        { label: '已关联支付', value: paymentSummary.linked_payments || detail.vouchers?.length || 0 },
        { label: '未匹配支付', value: paymentSummary.unmatched_payments || 0 },
        { label: '金额差额', value: paymentSummary.amount_gap || '0' }
      ])}
      ${renderSummaryCard('会计联查', [
        { label: '已关联分录', value: ledgerSummary.linked_entries || 0 },
        { label: '已支付未入账', value: paymentSummary.paid_without_ledger || 0 },
        { label: '人工复核', value: ledgerSummary.manual_review_required || 0 }
      ])}
    </div>
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">支付凭证</h2><p>展示支付、合同和写回状态。</p></div>
    </div>
    <div class="grid-2">
      ${(detail.vouchers || []).map((voucher) => `
        <div class="notice">
          <strong>${escapeHtml(voucher.payment_order_no || voucher.treasury_voucher_no || '支付凭证')}</strong>
          <div class="muted" style="margin-top:8px;">合同：${escapeHtml(voucher.contract_no || '-')}</div>
          <div class="muted" style="margin-top:4px;">对手方：${escapeHtml(voucher.counterparty || voucher.supplier_name || '-')}</div>
          <div class="muted" style="margin-top:4px;">金额：${escapeHtml(voucher.amount)}</div>
          <div class="muted" style="margin-top:4px;">日期：${escapeHtml(voucher.paid_at)}</div>
          <div class="muted" style="margin-top:4px;">写回状态：${escapeHtml(voucher.writeback_status || '-')} / 对账状态：${escapeHtml(voucher.reconciliation_status || '-')}</div>
        </div>
      `).join('') || '<div class="muted">暂无支付凭证。</div>'}
    </div>
  `;
  $('qualityReportList').innerHTML = renderQualityChecks(detail.quality_report?.checks || []);
  $('findingRows').innerHTML = renderFindings(task.findings || []);
}

function renderVoucherDetail(task) {
  const detail = task.detail.payload;
  const paymentSummary = detail.payment_linkage_summary || task.payment_linkage_summary || {};
  const ledgerSummary = detail.ledger_linkage_summary || task.ledger_linkage_summary || {};

  $('detailSubtitle').textContent = `${task.title} / ${taskKindLabel(task.task_kind)} / ${datasetKindLabel(detail.dataset_kind)} / 总体风险 ${riskDisplay(task.risk_level)}`;
  $('taskDetailBody').innerHTML = `
    <div class="grid-2">
      ${renderSummaryCard('支付勾稽', [
        { label: '已关联支付', value: paymentSummary.linked_payments || 0 },
        { label: '已支付未入账', value: paymentSummary.paid_without_ledger || 0 },
        { label: '有账无支付', value: paymentSummary.ledger_without_payment || 0 }
      ])}
      ${renderSummaryCard('会计勾稽', [
        { label: '已关联分录', value: ledgerSummary.linked_entries || detail.entries?.length || 0 },
        { label: '借贷不平', value: ledgerSummary.unbalanced_entries || 0 },
        { label: '重复入账', value: ledgerSummary.duplicate_entries || 0 }
      ])}
    </div>
    <div class="section-title" style="margin-top:18px;">
      <div><h2 style="font-size:17px;">凭证明细</h2><p>展示凭证、科目、支付勾稽与写回状态。</p></div>
    </div>
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>凭证号</th>
            <th>科目</th>
            <th>借方</th>
            <th>贷方</th>
            <th>记账日期</th>
            <th>支付单号</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${(detail.entries || []).map((entry) => `
            <tr>
              <td>${escapeHtml(entry.voucher_no)}</td>
              <td>${escapeHtml(entry.account_code)} / ${escapeHtml(entry.account_name)}</td>
              <td>${escapeHtml(entry.debit_amount)}</td>
              <td>${escapeHtml(entry.credit_amount)}</td>
              <td>${escapeHtml(entry.booked_at)}</td>
              <td>${escapeHtml(entry.payment_order_no || '-')}</td>
              <td>${escapeHtml(entry.reconciliation_status || '-')}</td>
            </tr>
          `).join('') || '<tr><td colspan="7" class="muted">暂无会计分录</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  $('qualityReportList').innerHTML = renderQualityChecks(detail.quality_report?.checks || []);
  $('findingRows').innerHTML = renderFindings(task.findings || []);
}

export function renderStats() {
  const total = state.tasks.length;
  const procurement = state.tasks.filter((task) => task.task_kind === 'procurement_project').length;
  const budget = state.tasks.filter((task) => task.task_kind === 'budget_summary').length;
  const chain = state.tasks.filter((task) => ['treasury_payment', 'voucher_ledger'].includes(task.task_kind)).length;
  const highRisk = state.tasks.filter((task) => ['Critical', 'High'].includes(task.risk_level)).length;
  $('stats').innerHTML = [
    ['任务总数', total],
    ['采购任务', procurement],
    ['预算任务', budget],
    ['支付 / 会计任务', chain],
    ['高风险任务', highRisk]
  ].map(([label, value]) => `<div class="stat"><span class="muted">${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

export function renderTaskTable(onSelectTask) {
  const labels = {
    taskKindLabel,
    sourceKindLabel,
    riskDisplay,
  };
  const view = buildTaskListView(state.tasks, taskListFilters(), state.taskListExpandedGroups, {
    ...labels,
  });
  renderTaskListControls(view);
  renderOverviewCharts(view.groups.flatMap((group) => group.tasks), labels);

  $('taskRows').innerHTML = view.groups.map((group) => `
    <tr class="task-group-row" data-group-key="${escapeHtml(group.key)}">
      <td colspan="7">
        <button class="task-group-toggle" type="button" data-group-key="${escapeHtml(group.key)}" aria-expanded="${group.expanded ? 'true' : 'false'}">
          <span class="task-group-arrow">${group.expanded ? '▾' : '▸'}</span>
          <strong>${escapeHtml(group.label)}</strong>
          <span class="muted"> · ${escapeHtml(group.count)} 条</span>
        </button>
      </td>
    </tr>
    ${group.expanded ? group.tasks.map((task) => `
      <tr data-id="${task.id}" data-kind="${task.task_kind}">
        <td><strong>${escapeHtml(task.title)}</strong><br><span class="muted">${escapeHtml(task.id.slice(0, 8))}</span></td>
        <td>${escapeHtml(taskKindLabel(task.task_kind))}</td>
        <td>${escapeHtml(sourceKindLabel(task.source_kind))}</td>
        <td><span class="badge blue">${escapeHtml(task.status)}</span></td>
        <td><span class="badge ${riskBadgeClass(task.risk_level)}">${escapeHtml(riskDisplay(task.risk_level))}</span></td>
        <td>${escapeHtml(task.primary_subject)}</td>
        <td>${escapeHtml(task.updated_at)}</td>
      </tr>
    `).join('') : ''}
  `).join('') || '<tr><td colspan="7" class="muted">暂无匹配任务</td></tr>';

  document.querySelectorAll('#taskRows tr[data-id]').forEach((row) => {
    row.onclick = () => onSelectTask(row.dataset.id, row.dataset.kind);
  });
  document.querySelectorAll('#taskRows button[data-group-key]').forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.groupKey;
      const next = { ...(state.taskListExpandedGroups || {}) };
      const sampleTask = state.tasks.find((task) => taskGroupKey(task) === key);
      const defaultExpanded = sampleTask?.source_kind !== 'batch';
      next[key] = !(next[key] ?? defaultExpanded);
      state.taskListExpandedGroups = next;
      renderTaskTable(onSelectTask);
    };
  });
}

export function setAllTaskGroupsExpanded(expanded, onSelectTask) {
  state.taskListExpandedGroups = expandedGroupsForAll(state.tasks, expanded);
  renderTaskTable(onSelectTask);
}

export function renderTaskDetail() {
  const task = state.currentTask;
  if (!task) {
    $('detailSubtitle').textContent = '选择一条任务查看详情。';
    $('taskDetailBody').innerHTML = '<div class="muted">暂无任务。</div>';
    $('qualityReportList').innerHTML = '<div class="muted">暂无导入质量报告。</div>';
    $('findingRows').innerHTML = '<div class="muted">暂无规则结果。</div>';
    renderTaskResultCharts(null, { riskDisplay });
    return;
  }

  switch (task.task_kind) {
    case 'procurement_project':
      renderProcurementDetail(task);
      break;
    case 'budget_summary':
      renderBudgetDetail(task);
      break;
    case 'treasury_payment':
      renderTreasuryDetail(task);
      break;
    case 'voucher_ledger':
      renderVoucherDetail(task);
      break;
    default:
      $('detailSubtitle').textContent = `${task.title} / ${taskKindLabel(task.task_kind)}`;
      $('taskDetailBody').innerHTML = '<div class="muted">当前任务详情暂不可用。</div>';
      $('qualityReportList').innerHTML = '<div class="muted">暂无导入质量报告。</div>';
      $('findingRows').innerHTML = renderFindings(task.findings || []);
      break;
  }
  renderTaskResultCharts(task, { riskDisplay });
}


