import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
  runPublicDiscoveryCrawler,
} from '../static/app/procurement-chain.js';

function record(stage, overrides = {}) {
  return {
    project_code: 'JS-CHAIN-2026',
    project_name: `链条测试项目${stage}`,
    purchaser_name: '江苏省测试采购单位',
    package_no: '1',
    package_name: '一包',
    procurement_stage: stage,
    budget_amount: '1000000',
    award_amount: stage === 'announcement' ? '' : '980000',
    declared_total_award_amount: '980000',
    package_award_amount: stage === 'announcement' ? '' : '980000',
    amount_consistency_status: 'consistent',
    source_evidence: {
      title: `链条测试${stage}公告`,
      url: `https://example.gov.cn/${stage}`,
      locator_hash: `hash-${stage}`,
    },
    ...overrides,
  };
}

test('procurement chain stage statuses expose fulfillment acceptance and payment term fields', () => {
  const closure = buildProcurementChainClosure([
    record('announcement'),
    record('award'),
    record('contract', {
      contract_no: 'HT-JS-CHAIN-1',
      contract_performance_period: 'one year after signing',
      settlement_basis: 'settle by accepted service quantity',
      payment_trigger: 'after acceptance',
      payment_deadline: '30 days',
    }),
    record('acceptance', {
      acceptance_plan: 'plan disclosed',
      acceptance_opinion: 'accepted',
      acceptance_archive_status: 'archived',
      acceptance_archive_locator: 'archive-hash',
      acceptance_issue_summary: 'none',
    }),
  ]);

  const [group] = closure.groups;
  const contract = group.stage_statuses.find((stage) => stage.stage === 'contract');
  assert.equal(contract.contract_performance_period, 'one year after signing');
  assert.equal(contract.settlement_basis, 'settle by accepted service quantity');
  assert.equal(contract.payment_trigger, 'after acceptance');
  assert.equal(contract.payment_deadline, '30 days');
  const acceptance = group.stage_statuses.find((stage) => stage.stage === 'acceptance');
  assert.equal(acceptance.acceptance_plan, 'plan disclosed');
  assert.equal(acceptance.acceptance_opinion, 'accepted');
  assert.equal(acceptance.acceptance_archive_status, 'archived');
  assert.equal(acceptance.acceptance_archive_locator, 'archive-hash');
  assert.equal(acceptance.acceptance_issue_summary, 'none');
  assert.deepEqual(group.recommended_next_data, ['支付公开信息']);
});

test('procurement chain closure groups records by project code and package stage', () => {
  const closure = buildProcurementChainClosure([
    record('announcement'),
    record('award'),
    record('contract', { contract_no: 'HT-JS-CHAIN-1' }),
  ]);

  assert.equal(closure.summary.group_count, 1);
  assert.equal(closure.summary.closed_group_count, 0);
  assert.equal(closure.summary.missing_acceptance_count, 1);
  assert.equal(closure.summary.missing_payment_count, 1);

  const [group] = closure.groups;
  assert.equal(group.project_code, 'JS-CHAIN-2026');
  assert.equal(group.package_no, '1');
  assert.equal(group.closure_status, 'missing_downstream_evidence');
  assert.deepEqual(
    group.stage_statuses.map((stage) => [stage.stage, stage.present]),
    [
      ['announcement', true],
      ['award', true],
      ['contract', true],
      ['acceptance', false],
      ['payment', false],
    ],
  );
  assert.deepEqual(group.recommended_next_data, ['履约验收公告', '支付公开信息']);
});

test('public discovery queue recommends missing chain and rectification sources without high-risk disposition', () => {
  const closure = buildProcurementChainClosure([
    record('announcement'),
    record('award'),
    record('contract', { contract_no: 'HT-JS-CHAIN-1' }),
  ]);
  const queue = buildPublicDiscoveryQueue({
    procurementGroups: closure.groups,
    caseSeedRecords: [{
      project_name: '链条测试项目整改',
      responsible_subject: '江苏省测试采购单位',
      audit_evidence_level: 'formal_audit_report',
      required_next_data: ['整改结果公告'],
      source_evidence: { url: 'https://example.gov.cn/audit', locator_hash: 'audit-hash' },
    }],
  });

  assert.equal(queue.summary.total_items, 3);
  assert.equal(queue.summary.by_target_stage.acceptance, 1);
  assert.equal(queue.summary.by_target_stage.payment, 1);
  assert.equal(queue.summary.by_target_stage.rectification, 1);
  assert.ok(queue.items.every((item) => item.finding_disposition !== 'substantive_violation'));
  assert.ok(queue.items.some((item) => item.search_keyword.includes('JS-CHAIN-2026')));
  assert.ok(queue.items.some((item) => item.target_stage === 'rectification' && item.review_status === 'new'));
  assert.ok(queue.items.every((item) => item.crawler_status === 'new'));
  assert.ok(queue.items.every((item) => Array.isArray(item.search_keywords)));
  assert.ok(queue.items.every((item) => 'matched_source_url' in item));
  assert.ok(queue.items.every((item) => item.source_stage_from));
  assert.ok(queue.items.every((item) => item.chain_discovery_reason));
  assert.ok(queue.items.every((item) => Array.isArray(item.candidate_source_urls)));
  assert.ok(queue.items.every((item) => item.candidate_stage_scores && typeof item.candidate_stage_scores === 'object'));
  assert.ok(queue.items.some((item) => item.source_stage_from === 'contract' && item.target_stage === 'acceptance'));
});

test('public discovery queue expands procurement exception chains through correction rebid award contract acceptance and payment', () => {
  const closure = buildProcurementChainClosure([
    record('complaint_notice', {
      project_code: 'R19-EX-CHAIN',
      package_no: '02',
      procurement_exception_type: 'complaint_partly_established',
      complaint_decision_no: 'MOF-R19-0001',
      complaint_issue_summary: 'false material allegation',
      complaint_handling_result: 'partly established; award invalidated and rebid required',
      false_material_flag: true,
      award_invalidated_flag: true,
      rebid_required_flag: true,
      correction_notice_flag: true,
      affected_package_no: '02',
      supplier_name: 'Supplier R19',
    }),
  ]);
  const queue = buildPublicDiscoveryQueue({
    procurementGroups: closure.groups,
    caseSeedRecords: [],
  });
  const targetStages = queue.items.map((item) => item.target_stage);

  assert.ok(targetStages.includes('correction_notice'));
  assert.ok(targetStages.includes('award_invalidated'));
  assert.ok(targetStages.includes('rebid_notice'));
  assert.ok(targetStages.includes('new_award'));
  assert.ok(targetStages.includes('contract'));
  assert.ok(targetStages.includes('acceptance'));
  assert.ok(targetStages.includes('payment'));
  assert.ok(queue.items.every((item) => item.finding_disposition !== 'substantive_violation'));
  assert.ok(queue.items.every((item) => item.exception_chain_stage_from === 'complaint_notice'));
  assert.ok(queue.items.every((item) => item.exception_target_stage === item.target_stage));
  assert.ok(queue.items.every((item) => item.exception_chain_reason));
  assert.ok(queue.items.every((item) => item.candidate_exception_stage_scores && typeof item.candidate_exception_stage_scores === 'object'));
});

test('public discovery queue exposes complaint adjudication outcome and remedy fields', () => {
  const closure = buildProcurementChainClosure([
    record('complaint_notice', {
      project_code: 'R23-COMP-CHAIN',
      package_no: '03',
      procurement_exception_type: 'complaint_established',
      complaint_decision_no: 'MOF-R23-0001',
      allegation_type: 'sme_declaration',
      allegation_outcome: 'established',
      confirmed_fact_flag: true,
      remedy_action: 'award_invalidated',
      remedy_required_flag: true,
      allegation_evidence_weight: 60,
      allegation_weight_reason: 'SME declaration allegation was established and requires follow-up remedy evidence',
      complaint_issue_summary: 'SME declaration allegation',
      complaint_handling_result: 'complaint established; award invalidated and new award required',
      award_invalidated_flag: true,
      affected_package_no: '03',
      supplier_name: 'Supplier R23',
    }),
  ]);
  const queue = buildPublicDiscoveryQueue({
    procurementGroups: closure.groups,
    caseSeedRecords: [],
  });
  const targetStages = queue.items.map((item) => item.target_stage);

  assert.ok(targetStages.includes('award_invalidated'));
  assert.ok(targetStages.includes('new_award'));
  assert.ok(targetStages.includes('contract'));
  assert.ok(targetStages.includes('acceptance'));
  assert.ok(targetStages.includes('payment'));
  assert.ok(queue.items.every((item) => item.allegation_type === 'sme_declaration'));
  assert.ok(queue.items.every((item) => item.allegation_outcome === 'established'));
  assert.ok(queue.items.every((item) => item.confirmed_fact_flag === true));
  assert.ok(queue.items.every((item) => item.remedy_action === 'award_invalidated'));
  assert.ok(queue.items.every((item) => item.complaint_chain_stage_from === 'complaint_notice'));
  assert.ok(queue.items.every((item) => item.complaint_target_stage === item.target_stage));
  assert.ok(queue.items.every((item) => item.complaint_chain_reason));
  assert.ok(queue.items.every((item) => item.finding_disposition === 'review_recommended'));
});

test('public discovery crawler scores complaint adjudication candidates by outcome and remedy action', () => {
  const queue = {
    items: [{
      queue_id: 'q-r23-new-award',
      target_stage: 'new_award',
      exception_chain_stage_from: 'award_invalidated',
      exception_target_stage: 'new_award',
      exception_chain_reason: 'complaint_established_requires_new_award',
      complaint_chain_stage_from: 'award_invalidated',
      complaint_target_stage: 'new_award',
      complaint_chain_reason: 'remedy_action_new_award_required',
      project_code: 'R23-COMP-CHAIN',
      package_no: '03',
      purchaser_name: 'Jiangsu Test Purchaser',
      supplier_name: 'Supplier R23',
      complaint_decision_no: 'MOF-R23-0001',
      allegation_type: 'sme_declaration',
      allegation_outcome: 'established',
      confirmed_fact_flag: true,
      remedy_action: 'new_award_required',
      remedy_required_flag: true,
      search_keywords: ['R23-COMP-CHAIN 03 MOF-R23-0001 established new award required Supplier R23'],
      crawler_status: 'new',
      finding_disposition: 'review_recommended',
    }],
  };

  const result = runPublicDiscoveryCrawler({
    queue,
    sourceRegistry: {
      sources: [{
        title: 'R23-COMP-CHAIN 03 MOF-R23-0001 new award notice Supplier R23',
        url: 'https://example.gov.cn/r23/new-award.html',
        source_type: 'new_award_notice',
        publisher: 'Jiangsu Test Purchaser',
        review_status: 'reviewed',
        raw_excerpt: 'complaint adjudication established SME declaration remedy action new_award_required affected package 03',
      }],
    },
  });

  assert.equal(result.summary.by_status.matched, 1);
  const [item] = result.items;
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.exception_chain_score >= 0.62);
  assert.ok(item.candidate_exception_stage_scores.new_award >= 0.62);
  assert.ok(item.score_reasons.includes('complaint_decision_no'));
  assert.ok(item.score_reasons.includes('allegation_outcome'));
  assert.ok(item.score_reasons.includes('remedy_action'));
  assert.ok(item.remedy_action_score > 0);
  assert.ok(item.allegation_outcome_score > 0);
});

test('public discovery queue expands administrative penalty chains through credit repair and re-participation stages', () => {
  const closure = buildProcurementChainClosure([
    record('complaint_notice', {
      project_code: 'R21-PEN-CHAIN',
      package_no: '01',
      procurement_exception_type: 'administrative_penalty',
      penalty_decision_no: 'MOF-R21-0001',
      penalty_subject_name: 'Penalty Supplier',
      penalty_subject_type: 'supplier',
      penalty_basis: 'Government Procurement Law',
      market_entry_restriction_scope: 'government procurement market',
      credit_repair_status: 'pending',
      re_participation_review_flag: true,
      supplier_name: 'Penalty Supplier',
    }),
  ]);
  const queue = buildPublicDiscoveryQueue({
    procurementGroups: closure.groups,
    caseSeedRecords: [],
  });
  const targetStages = queue.items.map((item) => item.target_stage);

  assert.ok(targetStages.includes('penalty_followup'));
  assert.ok(targetStages.includes('credit_restriction'));
  assert.ok(targetStages.includes('credit_repair'));
  assert.ok(targetStages.includes('re_participation'));
  assert.ok(targetStages.includes('contract'));
  assert.ok(targetStages.includes('acceptance'));
  assert.ok(targetStages.includes('payment'));
  assert.ok(targetStages.includes('rectification'));
  assert.ok(queue.items.every((item) => item.finding_disposition === 'review_recommended'));
  assert.ok(queue.items.every((item) => item.penalty_decision_no === 'MOF-R21-0001'));
  assert.ok(queue.items.every((item) => item.penalty_subject_name === 'Penalty Supplier'));
  assert.ok(queue.items.some((item) => item.exception_chain_reason.includes('credit_repair')));
});

test('closed procurement chains do not produce missing-stage queue items', () => {
  const closure = buildProcurementChainClosure([
    record('announcement'),
    record('award'),
    record('contract', { contract_no: 'HT-JS-CHAIN-1' }),
    record('acceptance', { acceptance_status: 'completed' }),
    record('payment'),
  ]);
  const queue = buildPublicDiscoveryQueue({ procurementGroups: closure.groups, caseSeedRecords: [] });

  assert.equal(closure.summary.closed_group_count, 1);
  assert.equal(closure.groups[0].closure_status, 'closed_public_chain');
  assert.equal(queue.summary.total_items, 0);
}
);

test('public discovery crawler consumes queue items with explicit match or failure state', () => {
  const closure = buildProcurementChainClosure([
    record('announcement'),
    record('award'),
    record('contract', { contract_no: 'HT-JS-CHAIN-1' }),
  ]);
  const queue = buildPublicDiscoveryQueue({
    procurementGroups: closure.groups,
    caseSeedRecords: [],
  });
  const result = runPublicDiscoveryCrawler({
    queue,
    sourceRegistry: {
      sources: [
        {
          title: 'JS-CHAIN-2026 acceptance notice',
          url: 'https://example.gov.cn/acceptance',
          source_type: 'acceptance_notice',
          publisher: 'example purchaser',
          review_status: 'reviewed',
        },
      ],
    },
  });

  assert.equal(result.summary.total_items, 2);
  assert.equal(result.summary.processed_count, 2);
  assert.equal(result.summary.by_status.matched, 1);
  assert.equal(result.summary.by_status.not_found, 1);
  assert.ok(result.items.every((item) => item.crawler_status !== 'new'));
  assert.ok(result.items.some((item) => item.crawler_status === 'matched' && item.matched_source_url));
  assert.ok(result.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
});

test('public discovery crawler scores procurement exception chain candidates with diagnostics', () => {
  const queue = {
    items: [{
      queue_id: 'q-r19-rebid',
      target_stage: 'rebid_notice',
      exception_chain_stage_from: 'complaint_notice',
      exception_target_stage: 'rebid_notice',
      exception_chain_reason: 'complaint_partly_established_requires_rebid',
      project_code: 'R19-EX-CHAIN',
      package_no: '02',
      purchaser_name: 'Jiangsu Test Purchaser',
      supplier_name: 'Supplier R19',
      complaint_decision_no: 'MOF-R19-0001',
      complaint_handling_result: 'award invalidated and rebid required',
      affected_package_no: '02',
      search_keywords: ['R19-EX-CHAIN 02 MOF-R19-0001 rebid notice Supplier R19'],
      crawler_status: 'new',
      finding_disposition: 'review_recommended',
    }],
  };

  const result = runPublicDiscoveryCrawler({
    queue,
    sourceRegistry: {
      sources: [{
        title: 'R19-EX-CHAIN 02 MOF-R19-0001 rebid notice Supplier R19',
        url: 'https://example.gov.cn/r19/rebid.html',
        source_type: 'rebid_notice',
        publisher: 'Jiangsu Test Purchaser',
        review_status: 'reviewed',
        raw_excerpt: 'award invalidated and rebid required for affected package 02',
      }],
    },
  });

  assert.equal(result.summary.by_status.matched, 1);
  const [item] = result.items;
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.exception_chain_score >= 0.62);
  assert.ok(item.candidate_exception_stage_scores.rebid_notice >= 0.62);
  assert.ok(item.score_reasons.includes('complaint_decision_no'));
  assert.ok(item.score_reasons.includes('complaint_handling_result'));
  assert.ok(item.best_candidate_excerpt.includes('award invalidated'));
});

test('public discovery crawler scores administrative penalty and credit repair candidates with diagnostics', () => {
  const queue = {
    items: [{
      queue_id: 'q-r21-credit-repair',
      target_stage: 'credit_repair',
      exception_chain_stage_from: 'credit_restriction',
      exception_target_stage: 'credit_repair',
      exception_chain_reason: 'administrative_penalty_requires_credit_repair',
      project_code: 'R21-PEN-CHAIN',
      package_no: '01',
      purchaser_name: 'Central Unit',
      supplier_name: 'Penalty Supplier',
      penalty_decision_no: 'MOF-R21-0001',
      penalty_subject_name: 'Penalty Supplier',
      credit_repair_status: 'pending',
      market_entry_restriction_scope: 'government procurement market',
      search_keywords: ['R21-PEN-CHAIN MOF-R21-0001 Penalty Supplier credit repair'],
      crawler_status: 'new',
      finding_disposition: 'review_recommended',
    }],
  };

  const result = runPublicDiscoveryCrawler({
    queue,
    sourceRegistry: {
      sources: [{
        title: 'R21-PEN-CHAIN MOF-R21-0001 Penalty Supplier credit repair notice',
        url: 'https://example.gov.cn/r21/credit-repair.html',
        source_type: 'credit_repair_notice',
        publisher: 'Central Unit',
        review_status: 'reviewed',
        raw_excerpt: 'Penalty Supplier government procurement market credit repair pending follow-up for decision MOF-R21-0001',
      }],
    },
  });

  assert.equal(result.summary.by_status.matched, 1);
  const [item] = result.items;
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.exception_chain_score >= 0.62);
  assert.ok(item.candidate_exception_stage_scores.credit_repair >= 0.62);
  assert.ok(item.score_reasons.includes('penalty_decision_no'));
  assert.ok(item.score_reasons.includes('penalty_subject_name'));
  assert.ok(item.score_reasons.includes('credit_repair_status'));
  assert.ok(item.best_candidate_excerpt.includes('credit repair'));
});
