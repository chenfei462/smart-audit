export const PROCUREMENT_CHAIN_STAGES = [
  {
    stage: 'announcement',
    label: '采购公告',
    sourceTypes: ['采购公告', '招标公告'],
  },
  {
    stage: 'award',
    label: '成交/中标公告',
    sourceTypes: ['成交公告', '中标公告'],
  },
  {
    stage: 'contract',
    label: '合同公告',
    sourceTypes: ['合同公告', '采购合同'],
  },
  {
    stage: 'acceptance',
    label: '履约验收公告',
    sourceTypes: ['履约验收公告', '验收公告'],
  },
  {
    stage: 'payment',
    label: '支付公开信息',
    sourceTypes: ['支付公开', '国库集中支付'],
  },
];

export const PROCUREMENT_EXCEPTION_CHAIN_STAGES = [
  { stage: 'penalty_followup', label: 'Penalty follow-up', sourceTypes: ['administrative penalty follow-up', 'penalty rectification'] },
  { stage: 'credit_restriction', label: 'Credit restriction', sourceTypes: ['credit restriction', 'market entry restriction'] },
  { stage: 'credit_repair', label: 'Credit repair', sourceTypes: ['credit repair', 'credit restoration'] },
  { stage: 're_participation', label: 'Re-participation review', sourceTypes: ['re-participation procurement', 'new procurement participation'] },
  { stage: 'complaint_notice', label: '投诉/监督公告', sourceTypes: ['投诉处理结果公告', '监督公告'] },
  { stage: 'correction_notice', label: '更正公告', sourceTypes: ['更正公告', '澄清公告'] },
  { stage: 'award_invalidated', label: '废标/中标无效', sourceTypes: ['废标公告', '中标无效', '终止公告'] },
  { stage: 'rebid_notice', label: '重采/重招公告', sourceTypes: ['重新采购公告', '重新招标公告', '重采公告'] },
  { stage: 'new_award', label: '新成交/中标公告', sourceTypes: ['重新中标公告', '成交公告', '中标公告'] },
  { stage: 'contract', label: '合同公告', sourceTypes: ['合同公告', '采购合同'] },
  { stage: 'acceptance', label: '履约验收公告', sourceTypes: ['履约验收公告', '验收公告'] },
  { stage: 'payment', label: '支付公开信息', sourceTypes: ['支付公开', '国库集中支付'] },
  { stage: 'rectification', label: '整改公告', sourceTypes: ['整改公告', '整改结果'] },
];

const DISCOVERY_TARGET_STAGES = new Set(['contract', 'acceptance', 'payment']);
const CRAWLER_STATUSES = new Set(['new', 'searched', 'matched', 'not_found', 'parse_failed', 'manual_review']);

export function stageLabel(stage) {
  return PROCUREMENT_CHAIN_STAGES.find((item) => item.stage === stage)?.label || stage || '未知阶段';
}

export function buildProcurementChainClosure(records = []) {
  const groups = new Map();
  for (const record of records || []) {
    const key = groupKey(record);
    if (!groups.has(key)) {
      groups.set(key, newChainGroup(key, record));
    }
    appendRecord(groups.get(key), record);
  }

  const chainGroups = [...groups.values()].map(finalizeGroup);
  return {
    summary: summarizeGroups(chainGroups),
    groups: chainGroups,
  };
}

export function buildPublicDiscoveryQueue({ procurementGroups = [], caseSeedRecords = [] } = {}) {
  const items = [];
  for (const group of procurementGroups || []) {
    if (!hasExceptionEvidence(group)) {
      for (const stage of group.missing_stages || []) {
        if (!DISCOVERY_TARGET_STAGES.has(stage)) continue;
        items.push(discoveryItemForMissingStage(group, stage));
      }
    }
    for (const stage of exceptionTargetsForGroup(group)) {
      items.push(discoveryItemForExceptionStage(group, stage));
    }
  }

  for (const record of caseSeedRecords || []) {
    if (!needsRectificationDiscovery(record)) continue;
    items.push(discoveryItemForRectification(record));
  }

  return {
    summary: {
      total_items: items.length,
      by_target_stage: countBy(items, (item) => item.target_stage),
      by_priority: countBy(items, (item) => item.priority),
      review_statuses: countBy(items, (item) => item.review_status),
      crawler_statuses: countBy(items, (item) => item.crawler_status),
    },
    items,
  };
}

export function runPublicDiscoveryCrawler({ queue = { items: [] }, sourceRegistry = { sources: [] } } = {}) {
  const sources = Array.isArray(sourceRegistry?.sources) ? sourceRegistry.sources : [];
  const items = (queue.items || []).map((item) => crawlDiscoveryItem(item, sources));
  const byStatus = countBy(items, (item) => item.crawler_status);
  return {
    summary: {
      total_items: items.length,
      processed_count: items.filter((item) => item.crawler_status !== 'new').length,
      matched_count: byStatus.matched || 0,
      not_found_count: byStatus.not_found || 0,
      parse_failed_count: byStatus.parse_failed || 0,
      manual_review_count: byStatus.manual_review || 0,
      match_rate: items.length ? Number((((byStatus.matched || 0) / items.length) * 100).toFixed(2)) : 0,
      by_status: byStatus,
      by_target_stage: countBy(items, (item) => item.target_stage),
    },
    items,
  };
}

function newChainGroup(key, record) {
  return {
    chain_id: key,
    project_code: clean(record.project_code),
    project_name: clean(record.package_name || record.project_name),
    purchaser_name: clean(record.purchaser_name),
    package_no: clean(record.package_no),
    package_name: clean(record.package_name),
    supplier_name: clean(record.supplier_name),
    service_period: clean(record.service_period),
    maintenance_period: clean(record.maintenance_period),
    warranty_period: clean(record.warranty_period),
    acceptance_standard: clean(record.acceptance_standard),
    acceptance_result: clean(record.acceptance_result),
    acceptance_result_locator: clean(record.acceptance_result_locator),
    procurement_exception_type: clean(record.procurement_exception_type),
    complaint_decision_no: clean(record.complaint_decision_no),
    complaint_issue_summary: clean(record.complaint_issue_summary),
    complaint_handling_result: clean(record.complaint_handling_result),
    allegation_type: clean(record.allegation_type),
    allegation_outcome: clean(record.allegation_outcome),
    confirmed_fact_flag: record.confirmed_fact_flag == null ? null : Boolean(record.confirmed_fact_flag),
    remedy_action: clean(record.remedy_action),
    remedy_required_flag: record.remedy_required_flag == null ? null : Boolean(record.remedy_required_flag),
    allegation_evidence_weight: Number(record.allegation_evidence_weight || 0),
    allegation_weight_reason: clean(record.allegation_weight_reason),
    false_material_flag: Boolean(record.false_material_flag),
    award_invalidated_flag: Boolean(record.award_invalidated_flag),
    rebid_required_flag: Boolean(record.rebid_required_flag),
    correction_notice_flag: Boolean(record.correction_notice_flag),
    supervision_penalty_subject: clean(record.supervision_penalty_subject),
    affected_package_no: clean(record.affected_package_no),
    penalty_decision_no: clean(record.penalty_decision_no),
    penalty_basis: clean(record.penalty_basis),
    penalty_basis_article: clean(record.penalty_basis_article),
    penalty_period: clean(record.penalty_period),
    market_entry_restriction_scope: clean(record.market_entry_restriction_scope),
    penalty_subject_type: clean(record.penalty_subject_type),
    penalty_subject_name: clean(record.penalty_subject_name),
    credit_repair_status: clean(record.credit_repair_status),
    credit_repair_source_url: clean(record.credit_repair_source_url),
    re_participation_review_flag: Boolean(record.re_participation_review_flag),
    exception_evidence_category: clean(record.exception_evidence_category),
    exception_evidence_weight: Number(record.exception_evidence_weight || 0),
    exception_weight_reason: clean(record.exception_weight_reason),
    declared_total_award_amount: clean(record.declared_total_award_amount),
    declared_budget_amount: clean(record.declared_budget_amount || record.budget_amount),
    ceiling_amount: clean(record.ceiling_amount),
    package_sum_amount: clean(record.package_sum_amount),
    amount_consistency_status: clean(record.amount_consistency_status) || 'not_checked',
    amount_difference_yuan: clean(record.amount_difference_yuan),
    amount_check_reason: clean(record.amount_check_reason),
    records: [],
    stageBuckets: new Map(),
  };
}

function appendRecord(group, record) {
  const stage = normalizeStage(record);
  group.records.push(record);
  if (!group.stageBuckets.has(stage)) {
    group.stageBuckets.set(stage, []);
  }
  group.stageBuckets.get(stage).push(record);

  group.project_code ||= clean(record.project_code);
  group.project_name ||= clean(record.package_name || record.project_name);
  group.purchaser_name ||= clean(record.purchaser_name);
  group.package_no ||= clean(record.package_no);
  group.package_name ||= clean(record.package_name);
  group.supplier_name ||= clean(record.supplier_name);
  group.service_period ||= clean(record.service_period);
  group.maintenance_period ||= clean(record.maintenance_period);
  group.warranty_period ||= clean(record.warranty_period);
  group.acceptance_standard ||= clean(record.acceptance_standard);
  group.acceptance_result ||= clean(record.acceptance_result);
  group.acceptance_result_locator ||= clean(record.acceptance_result_locator);
  group.procurement_exception_type ||= clean(record.procurement_exception_type);
  group.complaint_decision_no ||= clean(record.complaint_decision_no);
  group.complaint_issue_summary ||= clean(record.complaint_issue_summary);
  group.complaint_handling_result ||= clean(record.complaint_handling_result);
  group.allegation_type ||= clean(record.allegation_type);
  group.allegation_outcome ||= clean(record.allegation_outcome);
  if (group.confirmed_fact_flag == null && record.confirmed_fact_flag != null) group.confirmed_fact_flag = Boolean(record.confirmed_fact_flag);
  group.remedy_action ||= clean(record.remedy_action);
  if (group.remedy_required_flag == null && record.remedy_required_flag != null) group.remedy_required_flag = Boolean(record.remedy_required_flag);
  group.allegation_evidence_weight ||= Number(record.allegation_evidence_weight || 0);
  group.allegation_weight_reason ||= clean(record.allegation_weight_reason);
  group.false_material_flag ||= Boolean(record.false_material_flag);
  group.award_invalidated_flag ||= Boolean(record.award_invalidated_flag);
  group.rebid_required_flag ||= Boolean(record.rebid_required_flag);
  group.correction_notice_flag ||= Boolean(record.correction_notice_flag);
  group.supervision_penalty_subject ||= clean(record.supervision_penalty_subject);
  group.affected_package_no ||= clean(record.affected_package_no);
  group.penalty_decision_no ||= clean(record.penalty_decision_no);
  group.penalty_basis ||= clean(record.penalty_basis);
  group.penalty_basis_article ||= clean(record.penalty_basis_article);
  group.penalty_period ||= clean(record.penalty_period);
  group.market_entry_restriction_scope ||= clean(record.market_entry_restriction_scope);
  group.penalty_subject_type ||= clean(record.penalty_subject_type);
  group.penalty_subject_name ||= clean(record.penalty_subject_name);
  group.credit_repair_status ||= clean(record.credit_repair_status);
  group.credit_repair_source_url ||= clean(record.credit_repair_source_url);
  group.re_participation_review_flag ||= Boolean(record.re_participation_review_flag);
  group.exception_evidence_category ||= clean(record.exception_evidence_category);
  group.exception_evidence_weight ||= Number(record.exception_evidence_weight || 0);
  group.exception_weight_reason ||= clean(record.exception_weight_reason);
  group.declared_total_award_amount ||= clean(record.declared_total_award_amount);
  group.declared_budget_amount ||= clean(record.declared_budget_amount || record.budget_amount);
  group.ceiling_amount ||= clean(record.ceiling_amount);
  group.package_sum_amount ||= clean(record.package_sum_amount);
  group.amount_difference_yuan ||= clean(record.amount_difference_yuan);
  group.amount_check_reason ||= clean(record.amount_check_reason);
  if (clean(record.amount_consistency_status) && clean(record.amount_consistency_status) !== 'consistent') {
    group.amount_consistency_status = clean(record.amount_consistency_status);
  }
}

function finalizeGroup(group) {
  const stageStatuses = PROCUREMENT_CHAIN_STAGES.map((definition) => {
    const records = group.stageBuckets.get(definition.stage) || [];
    const first = records[0] || null;
    return {
      stage: definition.stage,
      label: definition.label,
      present: records.length > 0,
      record_count: records.length,
      source_url: first?.source_evidence?.url || first?.notice_url || null,
      published_at: first?.published_at || first?.source_evidence?.published_at || null,
      locator_hash: first?.source_evidence?.locator_hash || null,
      amount: clean(first?.award_amount || first?.package_award_amount || first?.budget_amount),
      contract_performance_period: clean(first?.contract_performance_period),
      settlement_basis: clean(first?.settlement_basis),
      payment_trigger: clean(first?.payment_trigger),
      payment_deadline: clean(first?.payment_deadline),
      service_period: clean(first?.service_period),
      maintenance_period: clean(first?.maintenance_period),
      warranty_period: clean(first?.warranty_period),
      acceptance_standard: clean(first?.acceptance_standard),
      acceptance_result: clean(first?.acceptance_result),
      acceptance_result_locator: clean(first?.acceptance_result_locator),
      service_period_source: clean(first?.service_period_source),
      warranty_maintenance_source: clean(first?.warranty_maintenance_source),
      acceptance_plan: clean(first?.acceptance_plan),
      acceptance_opinion: clean(first?.acceptance_opinion),
      acceptance_archive_status: clean(first?.acceptance_archive_status),
      acceptance_archive_locator: clean(first?.acceptance_archive_locator),
      acceptance_issue_summary: clean(first?.acceptance_issue_summary),
    };
  });
  const missingStages = stageStatuses.filter((stage) => !stage.present).map((stage) => stage.stage);
  const recommendedNextData = missingStages
    .filter((stage) => DISCOVERY_TARGET_STAGES.has(stage))
    .map(stageLabel);
  const exceptionPresentStages = [...new Set(group.records.map(normalizeExceptionStage).filter(Boolean))];

  const serializableGroup = {
    chain_id: group.chain_id,
    project_code: group.project_code,
    project_name: group.project_name,
    purchaser_name: group.purchaser_name,
    package_no: group.package_no,
    package_name: group.package_name,
    supplier_name: group.supplier_name,
    service_period: group.service_period,
    maintenance_period: group.maintenance_period,
    warranty_period: group.warranty_period,
    acceptance_standard: group.acceptance_standard,
    acceptance_result: group.acceptance_result,
    acceptance_result_locator: group.acceptance_result_locator,
    procurement_exception_type: group.procurement_exception_type,
    complaint_decision_no: group.complaint_decision_no,
    complaint_issue_summary: group.complaint_issue_summary,
    complaint_handling_result: group.complaint_handling_result,
    allegation_type: group.allegation_type,
    allegation_outcome: group.allegation_outcome,
    confirmed_fact_flag: group.confirmed_fact_flag,
    remedy_action: group.remedy_action,
    remedy_required_flag: group.remedy_required_flag,
    allegation_evidence_weight: group.allegation_evidence_weight,
    allegation_weight_reason: group.allegation_weight_reason,
    false_material_flag: group.false_material_flag,
    award_invalidated_flag: group.award_invalidated_flag,
    rebid_required_flag: group.rebid_required_flag,
    correction_notice_flag: group.correction_notice_flag,
    supervision_penalty_subject: group.supervision_penalty_subject,
    affected_package_no: group.affected_package_no,
    penalty_decision_no: group.penalty_decision_no,
    penalty_basis: group.penalty_basis,
    penalty_basis_article: group.penalty_basis_article,
    penalty_period: group.penalty_period,
    market_entry_restriction_scope: group.market_entry_restriction_scope,
    penalty_subject_type: group.penalty_subject_type,
    penalty_subject_name: group.penalty_subject_name,
    credit_repair_status: group.credit_repair_status,
    credit_repair_source_url: group.credit_repair_source_url,
    re_participation_review_flag: group.re_participation_review_flag,
    exception_evidence_category: group.exception_evidence_category,
    exception_evidence_weight: group.exception_evidence_weight,
    exception_weight_reason: group.exception_weight_reason,
    declared_total_award_amount: group.declared_total_award_amount,
    declared_budget_amount: group.declared_budget_amount,
    ceiling_amount: group.ceiling_amount,
    package_sum_amount: group.package_sum_amount,
    amount_consistency_status: group.amount_consistency_status,
    amount_difference_yuan: group.amount_difference_yuan,
    amount_check_reason: group.amount_check_reason,
    stage_statuses: stageStatuses,
    present_stages: stageStatuses.filter((stage) => stage.present).map((stage) => stage.stage),
    missing_stages: missingStages,
    exception_present_stages: exceptionPresentStages,
    exception_missing_stages: exceptionTargetsForGroup({ ...group, exception_present_stages: exceptionPresentStages }),
    recommended_next_data: recommendedNextData,
    closure_status: closureStatus(stageStatuses),
  };
  return serializableGroup;
}

function summarizeGroups(groups) {
  return {
    group_count: groups.length,
    closed_group_count: groups.filter((group) => group.closure_status === 'closed_public_chain').length,
    missing_contract_count: groups.filter((group) => group.missing_stages.includes('contract')).length,
    missing_acceptance_count: groups.filter((group) => group.missing_stages.includes('acceptance')).length,
    missing_payment_count: groups.filter((group) => group.missing_stages.includes('payment')).length,
    amount_review_count: groups.filter((group) => !['consistent', 'not_checked', ''].includes(group.amount_consistency_status)).length,
    exception_group_count: groups.filter(hasExceptionEvidence).length,
    exception_open_stage_count: groups.reduce((total, group) => total + (group.exception_missing_stages || []).length, 0),
  };
}

function discoveryItemForMissingStage(group, stage) {
  const definition = PROCUREMENT_CHAIN_STAGES.find((item) => item.stage === stage);
  const sourceStageFrom = sourceStageBeforeTarget(group, stage);
  const keywordParts = [
    group.purchaser_name,
    group.project_code,
    group.package_name || group.project_name,
    definition?.label,
  ].filter(Boolean);
  return {
    queue_id: stableId(['procurement', group.chain_id, stage].join('|')),
    target_stage: stage,
    target_stage_label: definition?.label || stage,
    project_code: group.project_code,
    package_no: group.package_no,
    package_name: group.package_name,
    purchaser_name: group.purchaser_name,
    supplier_name: group.supplier_name,
    service_period: group.service_period,
    maintenance_period: group.maintenance_period,
    warranty_period: group.warranty_period,
    acceptance_standard: group.acceptance_standard,
    acceptance_result: group.acceptance_result,
    acceptance_result_locator: group.acceptance_result_locator,
    search_keyword: keywordParts.join(' '),
    search_keywords: buildSearchKeywords([
      ...keywordParts,
      group.service_period,
      group.maintenance_period,
      group.warranty_period,
      group.acceptance_standard,
      group.acceptance_result,
    ], definition?.sourceTypes || [], group.supplier_name),
    recommended_source_types: definition?.sourceTypes || [],
    priority: stage === 'payment' ? 'P1' : 'P0',
    review_status: 'new',
    crawler_status: 'new',
    matched_source_url: '',
    matched_source_title: '',
    matched_stage: '',
    match_confidence: 0,
    source_stage_from: sourceStageFrom,
    chain_discovery_reason: `missing_${stage}_after_${sourceStageFrom}`,
    candidate_source_urls: [],
    candidate_stage_scores: {},
    failure_reason: '',
    finding_disposition: 'supplemental_data_only',
    reason: `${definition?.label || stage}缺失，建议自动发现公开来源后再复核链条闭合情况`,
  };
}

function discoveryItemForExceptionStage(group, stage) {
  const definition = PROCUREMENT_EXCEPTION_CHAIN_STAGES.find((item) => item.stage === stage);
  const sourceStageFrom = exceptionSourceStageBeforeTarget(group, stage);
  const keywordParts = [
    group.purchaser_name,
    group.project_code,
    group.package_no || group.affected_package_no,
    group.package_name || group.project_name,
    group.supplier_name,
    group.complaint_decision_no,
    group.penalty_decision_no,
    group.penalty_subject_name,
    group.market_entry_restriction_scope,
    group.credit_repair_status,
    group.complaint_handling_result,
    group.allegation_type,
    group.allegation_outcome,
    group.remedy_action,
    definition?.label,
  ].filter(Boolean);
  return {
    queue_id: stableId(['procurement-exception', group.chain_id, stage].join('|')),
    target_stage: stage,
    target_stage_label: definition?.label || stage,
    project_code: group.project_code,
    package_no: group.package_no || group.affected_package_no,
    package_name: group.package_name,
    purchaser_name: group.purchaser_name,
    supplier_name: group.supplier_name,
    procurement_exception_type: group.procurement_exception_type,
    complaint_decision_no: group.complaint_decision_no,
    complaint_issue_summary: group.complaint_issue_summary,
    complaint_handling_result: group.complaint_handling_result,
    allegation_type: group.allegation_type,
    allegation_outcome: group.allegation_outcome,
    confirmed_fact_flag: group.confirmed_fact_flag,
    remedy_action: group.remedy_action,
    remedy_required_flag: group.remedy_required_flag,
    allegation_evidence_weight: group.allegation_evidence_weight,
    allegation_weight_reason: group.allegation_weight_reason,
    false_material_flag: group.false_material_flag,
    award_invalidated_flag: group.award_invalidated_flag,
    rebid_required_flag: group.rebid_required_flag,
    correction_notice_flag: group.correction_notice_flag,
    supervision_penalty_subject: group.supervision_penalty_subject,
    affected_package_no: group.affected_package_no || group.package_no,
    penalty_decision_no: group.penalty_decision_no,
    penalty_basis: group.penalty_basis,
    penalty_basis_article: group.penalty_basis_article,
    penalty_period: group.penalty_period,
    market_entry_restriction_scope: group.market_entry_restriction_scope,
    penalty_subject_type: group.penalty_subject_type,
    penalty_subject_name: group.penalty_subject_name,
    credit_repair_status: group.credit_repair_status,
    credit_repair_source_url: group.credit_repair_source_url,
    re_participation_review_flag: group.re_participation_review_flag,
    exception_evidence_category: group.exception_evidence_category,
    exception_evidence_weight: group.exception_evidence_weight,
    exception_weight_reason: group.exception_weight_reason,
    search_keyword: keywordParts.join(' '),
    search_keywords: buildSearchKeywords(keywordParts, definition?.sourceTypes || [], group.supplier_name),
    recommended_source_types: definition?.sourceTypes || [],
    priority: ['correction_notice', 'rebid_notice', 'new_award'].includes(stage) ? 'P0' : 'P1',
    review_status: 'new',
    crawler_status: 'new',
    matched_source_url: '',
    matched_source_title: '',
    matched_stage: '',
    match_confidence: 0,
    source_stage_from: sourceStageFrom,
    chain_discovery_reason: `exception_${stage}_after_${sourceStageFrom}`,
    exception_chain_stage_from: sourceStageFrom,
    exception_target_stage: stage,
    exception_chain_reason: `procurement_exception_requires_${stage}`,
    complaint_chain_stage_from: sourceStageFrom,
    complaint_target_stage: stage,
    complaint_chain_reason: complaintChainReason(group, stage),
    remedy_action_score: 0,
    allegation_outcome_score: 0,
    candidate_source_urls: [],
    candidate_stage_scores: {},
    candidate_exception_stage_scores: {},
    failure_reason: '',
    finding_disposition: 'review_recommended',
    reason: `${definition?.label || stage} is needed to close procurement complaint or supervision exception chain`,
  };
}

function discoveryItemForRectification(record) {
  const subject = clean(record.responsible_subject || record.rectification_unit_name || record.construction_unit);
  const project = clean(record.project_name || record.issue_title || record.recommended_issue);
  return {
    queue_id: stableId(['rectification', subject, project].join('|')),
    target_stage: 'rectification',
    target_stage_label: '整改公告',
    project_code: clean(record.project_code),
    package_no: '',
    package_name: '',
    purchaser_name: subject,
    search_keyword: [subject, project, '整改结果公告'].filter(Boolean).join(' '),
    recommended_source_types: ['整改结果公告', '整改进展公开', '审计整改公开'],
    search_keywords: buildSearchKeywords([subject, project, 'rectification result'], ['rectification_result', 'audit_rectification']),
    priority: record.audit_evidence_level === 'formal_audit_report' ? 'P1' : 'P2',
    review_status: 'new',
    crawler_status: 'new',
    matched_source_url: '',
    matched_source_title: '',
    matched_stage: '',
    match_confidence: 0,
    source_stage_from: clean(record.audit_evidence_level) || 'audit_source',
    chain_discovery_reason: 'audit_rectification_followup',
    candidate_source_urls: [],
    candidate_stage_scores: {},
    failure_reason: '',
    finding_disposition: 'review_recommended',
    reason: '审计或整改线索需要补充整改结果公开来源，不直接形成实质违规结论',
  };
}

function crawlDiscoveryItem(item, sources) {
  const best = bestSourceMatch(item, sources);
  if (best?.source?.review_status === 'parse_failed' || best?.source?.status === 'parse_failed') {
    return finalizeCrawlerItem(item, {
      crawler_status: 'parse_failed',
      failure_reason: best.source.failure_reason || 'candidate source exists but parser failed',
      matched_source_url: clean(best.source.url),
      matched_source_title: clean(best.source.title),
      matched_stage: item.target_stage,
      match_confidence: Number(best.score.toFixed(2)),
      score_reasons: best.scoreDetails?.reasons || [],
      candidate_stage_scores: stageScoreSummary([best]),
      candidate_exception_stage_scores: exceptionStageScoreSummary([best], item.target_stage, best.score),
      exception_chain_score: best.scoreDetails?.exceptionChainScore ?? best.score,
      remedy_action_score: best.scoreDetails?.remedyActionScore ?? 0,
      allegation_outcome_score: best.scoreDetails?.allegationOutcomeScore ?? 0,
      best_candidate_excerpt: sourceExcerpt(best.source),
    });
  }
  if (best && best.score >= 0.62) {
    return finalizeCrawlerItem(item, {
      crawler_status: 'matched',
      matched_source_url: clean(best.source.url),
      matched_source_title: clean(best.source.title),
      matched_stage: inferStageFromSource(best.source, item.target_stage),
      match_confidence: Number(best.score.toFixed(2)),
      score_reasons: best.scoreDetails?.reasons || [],
      candidate_stage_scores: stageScoreSummary([best]),
      candidate_exception_stage_scores: exceptionStageScoreSummary([best], item.target_stage, best.score),
      exception_chain_score: best.scoreDetails?.exceptionChainScore ?? best.score,
      remedy_action_score: best.scoreDetails?.remedyActionScore ?? 0,
      allegation_outcome_score: best.scoreDetails?.allegationOutcomeScore ?? 0,
      best_candidate_excerpt: sourceExcerpt(best.source),
      failure_reason: '',
    });
  }
  if (best && best.score >= 0.45) {
    return finalizeCrawlerItem(item, {
      crawler_status: 'manual_review',
      matched_source_url: clean(best.source.url),
      matched_source_title: clean(best.source.title),
      matched_stage: inferStageFromSource(best.source, item.target_stage),
      match_confidence: Number(best.score.toFixed(2)),
      score_reasons: best.scoreDetails?.reasons || [],
      candidate_stage_scores: stageScoreSummary([best]),
      candidate_exception_stage_scores: exceptionStageScoreSummary([best], item.target_stage, best.score),
      exception_chain_score: best.scoreDetails?.exceptionChainScore ?? best.score,
      remedy_action_score: best.scoreDetails?.remedyActionScore ?? 0,
      allegation_outcome_score: best.scoreDetails?.allegationOutcomeScore ?? 0,
      best_candidate_excerpt: sourceExcerpt(best.source),
      failure_reason: 'candidate below automatic match confidence threshold',
    });
  }
  return finalizeCrawlerItem(item, {
    crawler_status: 'not_found',
    failure_reason: 'no official source matched generated project, package, purchaser, supplier, and stage keywords',
  });
}

function finalizeCrawlerItem(item, overrides) {
  const crawlerStatus = CRAWLER_STATUSES.has(overrides.crawler_status) ? overrides.crawler_status : 'manual_review';
  return {
    ...item,
    search_keywords: Array.isArray(item.search_keywords) && item.search_keywords.length
      ? item.search_keywords
      : buildSearchKeywords([item.search_keyword, item.project_code, item.package_no, item.purchaser_name], item.recommended_source_types),
    crawler_status: crawlerStatus,
    matched_source_url: clean(overrides.matched_source_url ?? item.matched_source_url),
    matched_source_title: clean(overrides.matched_source_title ?? item.matched_source_title),
    matched_stage: clean(overrides.matched_stage ?? item.matched_stage),
    match_confidence: Number(overrides.match_confidence ?? item.match_confidence ?? 0),
    candidate_source_urls: Array.isArray(overrides.candidate_source_urls)
      ? overrides.candidate_source_urls
      : (Array.isArray(item.candidate_source_urls) ? item.candidate_source_urls : []),
    candidate_stage_scores: overrides.candidate_stage_scores || item.candidate_stage_scores || {},
    candidate_exception_stage_scores: overrides.candidate_exception_stage_scores || item.candidate_exception_stage_scores || {},
    exception_chain_score: Number(overrides.exception_chain_score ?? item.exception_chain_score ?? 0),
    remedy_action_score: Number(overrides.remedy_action_score ?? item.remedy_action_score ?? 0),
    allegation_outcome_score: Number(overrides.allegation_outcome_score ?? item.allegation_outcome_score ?? 0),
    score_reasons: Array.isArray(overrides.score_reasons)
      ? overrides.score_reasons
      : (Array.isArray(item.score_reasons) ? item.score_reasons : []),
    best_candidate_excerpt: clean(overrides.best_candidate_excerpt ?? item.best_candidate_excerpt),
    failure_reason: crawlerStatus === 'matched'
      ? ''
      : clean(overrides.failure_reason ?? item.failure_reason) || 'crawler finished without a confident official-source match',
  };
}

function bestSourceMatch(item, sources) {
  let best = null;
  for (const source of sources || []) {
    const scoreDetails = scoreSourceDetails(item, source);
    const score = scoreDetails.score;
    if (!best || score > best.score) best = { source, score, scoreDetails };
  }
  return best && best.score > 0 ? best : null;
}

function scoreSourceMatch(item, source) {
  return scoreSourceDetails(item, source).score;
}

function scoreSourceDetails(item, source) {
  const sourceText = normalizeSearchText([
    source.title,
    source.url,
    source.publisher,
    source.source_type,
    source.parser_type,
    source.discovered_by_keyword,
    source.keyword,
    source.raw_excerpt,
  ].filter(Boolean).join(' '));
  if (!sourceText) return { score: 0, exceptionChainScore: 0, reasons: [] };

  let score = 0;
  const reasons = [];
  if (stageTokens(clean(item.target_stage)).some((token) => sourceText.includes(normalizeSearchText(token)))) {
    score += 0.35;
    reasons.push('target_stage');
  }
  for (const field of ['project_code', 'package_no', 'purchaser_name', 'supplier_name', 'package_name']) {
    const value = normalizeSearchText(item[field]);
    if (value && value.length >= 2 && sourceText.includes(value)) {
      score += field === 'project_code' ? 0.28 : 0.12;
      reasons.push(field);
    }
  }
  for (const [field, weight] of [
    ['complaint_decision_no', 0.24],
    ['complaint_handling_result', 0.16],
    ['allegation_type', 0.1],
    ['allegation_outcome', 0.12],
    ['remedy_action', 0.14],
    ['affected_package_no', 0.1],
    ['supervision_penalty_subject', 0.1],
    ['complaint_issue_summary', 0.08],
    ['penalty_decision_no', 0.22],
    ['penalty_subject_name', 0.14],
    ['penalty_basis', 0.08],
    ['market_entry_restriction_scope', 0.08],
    ['credit_repair_status', 0.12],
    ['credit_repair_source_url', 0.06],
  ]) {
    const value = normalizeSearchText(item[field]);
    if (value && value.length >= 2 && sourceText.includes(value)) {
      score += weight;
      reasons.push(field);
    }
  }
  const keywords = Array.isArray(item.search_keywords) ? item.search_keywords : [item.search_keyword];
  const keywordHits = keywords
    .map(normalizeSearchText)
    .filter((keyword) => keyword.length >= 3 && sourceText.includes(keyword))
    .length;
  score += Math.min(keywordHits * 0.08, 0.24);
  if ((source.review_status || '') === 'reviewed') score += 0.03;
  if (source.url) score += 0.02;
  const bounded = Math.min(score, 0.99);
  return {
    score: bounded,
    exceptionChainScore: isExceptionDiscoveryItem(item) ? bounded : 0,
    remedyActionScore: reasons.includes('remedy_action') ? 0.14 : 0,
    allegationOutcomeScore: reasons.includes('allegation_outcome') ? 0.12 : 0,
    reasons: [...new Set(reasons)],
  };
}

function stageScoreSummary(candidates) {
  const scores = {};
  for (const candidate of candidates || []) {
    const stage = inferStageFromSource(candidate.source, 'unknown');
    scores[stage] = Math.max(scores[stage] || 0, Number((candidate.score || 0).toFixed(2)));
  }
  return scores;
}

function exceptionStageScoreSummary(candidates, targetStage = '', targetScore = 0) {
  const scores = {};
  if (PROCUREMENT_EXCEPTION_CHAIN_STAGES.some((definition) => definition.stage === targetStage)) {
    scores[targetStage] = Number((targetScore || 0).toFixed(2));
  }
  for (const candidate of candidates || []) {
    const stage = inferExceptionStageFromSource(candidate.source, '');
    if (!stage) continue;
    scores[stage] = Math.max(scores[stage] || 0, Number((candidate.score || 0).toFixed(2)));
  }
  return scores;
}

function sourceExcerpt(source) {
  return clean(source?.raw_excerpt || source?.title || '').slice(0, 240);
}

function hasExceptionEvidence(group) {
  return [
    group.procurement_exception_type,
    group.complaint_decision_no,
    group.complaint_issue_summary,
    group.complaint_handling_result,
    group.allegation_type,
    group.allegation_outcome,
    group.remedy_action,
    group.allegation_weight_reason,
    group.supervision_penalty_subject,
    group.affected_package_no,
    group.penalty_decision_no,
    group.penalty_basis,
    group.penalty_basis_article,
    group.penalty_period,
    group.market_entry_restriction_scope,
    group.penalty_subject_type,
    group.penalty_subject_name,
    group.credit_repair_status,
    group.credit_repair_source_url,
    group.exception_evidence_category,
    group.exception_weight_reason,
  ].some((value) => clean(value))
    || Boolean(group.false_material_flag)
    || Boolean(group.award_invalidated_flag)
    || Boolean(group.rebid_required_flag)
    || Boolean(group.correction_notice_flag)
    || Boolean(group.confirmed_fact_flag)
    || Boolean(group.remedy_required_flag)
    || Number(group.allegation_evidence_weight || 0) > 0
    || Boolean(group.re_participation_review_flag)
    || Number(group.exception_evidence_weight || 0) > 0;
}

function isExceptionDiscoveryItem(item) {
  return Boolean(item.exception_target_stage || item.exception_chain_reason)
    || PROCUREMENT_EXCEPTION_CHAIN_STAGES.some((definition) => definition.stage === item.target_stage);
}

function normalizeExceptionStage(record) {
  const raw = normalizeSearchText([
    record.procurement_exception_type,
    record.procurement_stage,
    record.announcement_type,
    record.source_type,
  ].filter(Boolean).join(' '));
  if (!raw && !hasExceptionEvidence(record)) return '';
  if (raw.includes('credit_repair')) return 'credit_repair';
  if (raw.includes('credit_restriction') || raw.includes('supplier_credit_restriction')) return 'credit_restriction';
  if (raw.includes('re_participation')) return 're_participation';
  if (raw.includes('penalty_followup')) return 'penalty_followup';
  if (raw.includes('correction_notice') || raw.includes('更正') || raw.includes('澄清')) return 'correction_notice';
  if (raw.includes('award_invalidated') || raw.includes('中标无效') || raw.includes('废标')) return 'award_invalidated';
  if (raw.includes('rebid') || raw.includes('重采') || raw.includes('重新采购') || raw.includes('重新招标')) return 'rebid_notice';
  if (raw.includes('new_award') || raw.includes('重新中标') || raw.includes('新成交')) return 'new_award';
  if (raw.includes('contract')) return 'contract';
  if (raw.includes('acceptance')) return 'acceptance';
  if (raw.includes('payment')) return 'payment';
  if (raw.includes('rectification')) return 'rectification';
  return hasExceptionEvidence(record) ? 'complaint_notice' : '';
}

function exceptionTargetsForGroup(group) {
  if (!hasExceptionEvidence(group)) return [];
  const present = new Set(group.exception_present_stages || []);
  const targets = [];
  const add = (stage) => {
    if (!present.has(stage) && !targets.includes(stage)) targets.push(stage);
  };

  const remedy = clean(group.remedy_action);
  const handlingResult = clean(group.complaint_handling_result);
  if (group.correction_notice_flag || group.complaint_decision_no || group.procurement_exception_type || remedy === 'correction_notice') add('correction_notice');
  if (
    clean(group.penalty_decision_no)
    || clean(group.penalty_subject_name)
    || clean(group.market_entry_restriction_scope)
    || ['administrative_penalty', 'malicious_collusion_review', 'false_material_review', 'supplier_credit_restriction', 'credit_repair_followup', 're_participation_review'].includes(clean(group.procurement_exception_type))
  ) {
    add('penalty_followup');
    add('credit_restriction');
    add('credit_repair');
    add('re_participation');
  }
  if (group.award_invalidated_flag || group.false_material_flag || remedy === 'award_invalidated' || handlingResult.includes('中标无效')) {
    add('award_invalidated');
    add('new_award');
  }
  if (remedy === 'new_award_required') add('new_award');
  if (remedy === 'contract_review') add('contract');
  if (group.rebid_required_flag || remedy === 'rebid_required' || handlingResult.includes('重新采购') || handlingResult.includes('重采')) {
    add('rebid_notice');
    add('new_award');
  }
  add('contract');
  add('acceptance');
  add('payment');
  if (clean(group.supervision_penalty_subject) || clean(group.penalty_subject_name) || clean(group.penalty_decision_no)) add('rectification');
  return targets;
}

function complaintChainReason(group, stage) {
  return [
    'complaint_adjudication_requires',
    stage,
    clean(group.allegation_outcome) || 'unknown_outcome',
    clean(group.remedy_action) || 'unknown_remedy',
  ].join('_');
}

function exceptionSourceStageBeforeTarget(group, targetStage) {
  const present = new Set(group.exception_present_stages || []);
  const targetIndex = PROCUREMENT_EXCEPTION_CHAIN_STAGES.findIndex((item) => item.stage === targetStage);
  if (targetIndex <= 0) return 'complaint_notice';
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const stage = PROCUREMENT_EXCEPTION_CHAIN_STAGES[index].stage;
    if (present.has(stage)) return stage;
  }
  return 'complaint_notice';
}

function inferStageFromSource(source, fallbackStage) {
  const text = normalizeSearchText([source.source_type, source.title, source.url, source.raw_excerpt].filter(Boolean).join(' '));
  const exceptionStage = inferExceptionStageFromText(text, '');
  if (exceptionStage) return exceptionStage;
  for (const definition of PROCUREMENT_CHAIN_STAGES) {
    if (stageTokens(definition.stage).some((token) => text.includes(normalizeSearchText(token)))) return definition.stage;
  }
  if (text.includes('rectification') || text.includes('整改')) return 'rectification';
  return fallbackStage || 'unknown';
}

function inferExceptionStageFromSource(source, fallbackStage) {
  const text = normalizeSearchText([source.source_type, source.title, source.url, source.raw_excerpt].filter(Boolean).join(' '));
  return inferExceptionStageFromText(text, fallbackStage);
}

function inferExceptionStageFromText(text, fallbackStage) {
  for (const definition of PROCUREMENT_EXCEPTION_CHAIN_STAGES) {
    if (stageTokens(definition.stage).some((token) => text.includes(normalizeSearchText(token)))) return definition.stage;
  }
  return fallbackStage || '';
}

function stageTokens(stage) {
  return {
    contract: ['contract', '合同'],
    acceptance: ['acceptance', '验收', '履约'],
    payment: ['payment', '支付', '付款', '国库'],
    rectification: ['rectification', '整改'],
    announcement: ['announcement', '采购公告', '招标'],
    award: ['award', '成交', '中标'],
    complaint_notice: ['complaint', 'complaint notice', 'supervision', '投诉', '监督', '处理决定', 'information notice'],
    correction_notice: ['correction', 'correction notice', '更正', '澄清', '变更'],
    award_invalidated: ['award invalidated', 'invalidated', '中标无效', '废标', '终止'],
    rebid_notice: ['rebid', 'rebid notice', '重新采购', '重新招标', '重采'],
    new_award: ['new award', 'award', '成交', '中标', '重新中标'],
  }[stage] || [stage].filter(Boolean);
}

function buildSearchKeywords(parts = [], sourceTypes = [], supplierName = '') {
  const cleanedParts = [...parts, supplierName, ...(sourceTypes || [])].map(clean).filter(Boolean);
  const combined = parts.map(clean).filter(Boolean).join(' ');
  return [...new Set([combined, ...cleanedParts].filter(Boolean))];
}

function sourceStageBeforeTarget(group, targetStage) {
  const present = new Set(group.present_stages || []);
  const targetIndex = PROCUREMENT_CHAIN_STAGES.findIndex((item) => item.stage === targetStage);
  if (targetIndex <= 0) return 'announcement';
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const stage = PROCUREMENT_CHAIN_STAGES[index].stage;
    if (present.has(stage)) return stage;
  }
  return 'announcement';
}

function needsRectificationDiscovery(record) {
  const required = (record.required_next_data || []).join(' ');
  const level = clean(record.audit_evidence_level);
  return required.includes('整改')
    || ['formal_audit_report', 'rectification_progress', 'special_audit_survey', 'audit_result_feedback'].includes(level);
}

function closureStatus(stageStatuses) {
  if (stageStatuses.every((stage) => stage.present)) return 'closed_public_chain';
  const hasContract = stageStatuses.find((stage) => stage.stage === 'contract')?.present;
  if (!hasContract) return 'missing_contract';
  return 'missing_downstream_evidence';
}

function groupKey(record) {
  return stableId([
    clean(record.project_code) || clean(record.project_name) || 'unknown-project',
    clean(record.package_no) || clean(record.package_name) || 'default-package',
  ].join('|'));
}

function normalizeStage(record) {
  const raw = clean(record.procurement_stage || record.announcement_type || record.source_type).toLowerCase();
  if (raw.includes('payment') || raw.includes('支付') || raw.includes('付款')) return 'payment';
  if (raw.includes('acceptance') || raw.includes('验收') || raw.includes('履约')) return 'acceptance';
  if (raw.includes('contract') || raw.includes('合同')) return 'contract';
  if (raw.includes('award') || raw.includes('中标') || raw.includes('成交')) return 'award';
  if (raw.includes('announcement') || raw.includes('采购公告') || raw.includes('招标')) return 'announcement';
  return 'unknown';
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeSearchText(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function stableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pc-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
