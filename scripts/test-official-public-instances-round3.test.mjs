import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildThirdOfficialPublicInstancePayloads,
  summarizeThirdOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round3.mjs';

test('third official payloads use newly researched official sources', () => {
  const payloads = buildThirdOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T20:10:00+08:00',
    parserVersion: 'official-public-instance-round3-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const sourceUrls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 28);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round3'));
  assert.ok(payloads.sourceRegister.sources.every((source) => source.review_status === 'reviewed'));
  assert.ok(payloads.sourceRegister.sources.every((source) => source.discovered_by_keyword));
  assert.ok(payloads.sourceRegister.sources.every((source) => source.discovered_at));
  assert.equal(new Set(sourceUrls).size, sourceUrls.length);
  assert.equal(sourceUrls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.some((source) => source.parser_type === 'ccgp_procurement_html'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.parser_type === 'government_metric_html'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.parser_type === 'audit_report_html'));

  assert.ok(payloads.procurement.records.length >= 30);
  assert.ok(payloads.budget.records.length >= 75);
  assert.ok(payloads.caseSeeds.records.length >= 10);

  const allRows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  assert.ok(allRows.length >= 120);
  for (const row of allRows) {
    assert.ok(row.source_evidence.title);
    assert.ok(row.source_evidence.url.startsWith('https://'));
    assert.equal(row.source_evidence.captured_at, '2026-04-26T20:10:00+08:00');
    assert.equal(row.source_evidence.parser_version, 'official-public-instance-round3-v1');
    assert.ok(row.source_evidence.locator_hash);
    assert.ok(row.source_evidence.raw_excerpt);
    assert.ok(row.source_evidence.page_number || row.source_evidence.section_title);
  }

  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'announcement'));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'award'));
  assert.ok(payloads.procurement.records.some((row) => row.amount_semantic_type === 'discount_rate'));
  assert.ok(payloads.procurement.records.some((row) => row.amount_semantic_type === 'unit_price'));
  assert.ok(payloads.procurement.records.some((row) => row.amount_semantic_type === 'framework_limit'));
  assert.ok(payloads.procurement.records
    .filter((row) => row.amount_semantic_type === 'framework_limit')
    .every((row) => row.framework_limit_condition && !row.normalized_award_amount_yuan));
  assert.ok(payloads.procurement.records
    .filter((row) => row.amount_semantic_type === 'discount_rate')
    .every((row) => !row.normalized_award_amount_yuan));

  assert.ok(payloads.budget.records.some((row) => row.dataset_kind === 'investment_review_summary'));
  assert.ok(payloads.budget.records.some((row) => row.policy_document_no && row.budget_subject_code));
  assert.ok(payloads.budget.records.some((row) => row.fund_destination && row.performance_report_due_at));
  assert.ok(payloads.budget.records.some((row) => row.actual_value_unit === 'percent'));
  assert.ok(payloads.budget.records.some((row) => row.actual_value_unit === 'count'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'formal_audit_report'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'audit_work_update'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'rectification_progress'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'special_audit_survey'));
  assert.ok(payloads.caseSeeds.records.every((row) => Number.isInteger(row.audit_evidence_weight)));
});

test('third official summary keeps source, semantic, and evidence metrics', () => {
  const payloads = buildThirdOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T20:10:00+08:00',
  });
  const summary = summarizeThirdOfficialRun({
    generatedAt: '2026-04-26T20:30:00+08:00',
    payloads,
    procurementResponse: {
      detail: { payload: { accepted_rows: payloads.procurement.records.length, rejected_rows: 0, quality_report: [] } },
      findings: [{ rule_code: 'PROC-BUDGET-001', risk_level: 'Info', summary: '补数建议' }],
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      detail: { payload: { accepted_rows: batch.records.length, rejected_rows: 0, quality_report: [] } },
      findings: [],
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round3');
  assert.equal(summary.total_input_records, payloads.procurement.records.length + payloads.budget.records.length + payloads.caseSeeds.records.length);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.source_completeness_rate, 100);
  assert.equal(summary.collector_summary.source_count, payloads.sourceRegister.sources.length);
  assert.equal(summary.collector_summary.previous_source_overlap_count, 0);
  assert.equal(summary.collector_summary.third_round_source_count, payloads.sourceRegister.sources.length);
  assert.equal(summary.collector_summary.url_duplicate_source_count, 0);
  assert.equal(summary.collector_summary.title_duplicate_source_count, 0);
  assert.ok(summary.collector_summary.special_fund_structured_coverage_rate > 0);
  assert.ok(summary.collector_summary.amount_semantic_types.discount_rate >= 1);
  assert.ok(summary.collector_summary.amount_semantic_types.framework_limit >= 1);
  assert.ok(summary.collector_summary.audit_evidence_levels.formal_audit_report >= 1);
  assert.ok(summary.collector_summary.audit_evidence_weights.formal_audit_report >= 90);
});
