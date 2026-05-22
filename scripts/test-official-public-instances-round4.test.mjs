import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFourthOfficialPublicInstancePayloads,
  summarizeFourthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round4.mjs';

test('fourth official payloads use new official sources with traceable evidence', () => {
  const payloads = buildFourthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T21:30:00+08:00',
    parserVersion: 'official-public-instance-round4-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const sourceUrls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.equal(payloads.sourceRegister.sources.length, 20);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round4'));
  assert.ok(payloads.sourceRegister.sources.every((source) => source.review_status === 'reviewed'));
  assert.ok(payloads.sourceRegister.sources.every((source) => source.discovered_by_keyword));
  assert.equal(new Set(sourceUrls).size, sourceUrls.length);
  assert.equal(sourceUrls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.some((source) => source.parser_type === 'ccgp_procurement_html'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.parser_type === 'fiscal_report_pdf'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.parser_type === 'audit_report_html'));

  assert.equal(payloads.procurement.records.length, 7);
  assert.ok(payloads.budget.records.length >= 50);
  assert.equal(payloads.caseSeeds.records.length, 7);
  assert.ok(payloads.collectorSummary.total_records >= 60);

  const allRows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  for (const row of allRows) {
    assert.ok(row.source_evidence.title);
    assert.ok(row.source_evidence.url.startsWith('https://'));
    assert.equal(row.source_evidence.captured_at, '2026-04-26T21:30:00+08:00');
    assert.equal(row.source_evidence.parser_version, 'official-public-instance-round4-v1');
    assert.ok(row.source_evidence.locator_hash);
    assert.ok(row.source_evidence.raw_excerpt);
    assert.ok(row.source_evidence.page_number || row.source_evidence.section_title);
  }

  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'announcement'));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'award'));
  assert.ok(payloads.budget.records.some((row) => row.region.includes('江阴市')));
  assert.ok(payloads.budget.records.some((row) => row.region.includes('如皋市丁堰镇')));
  assert.ok(payloads.budget.records.some((row) => row.actual_value_unit === 'percent'));
  assert.ok(payloads.budget.records.some((row) => row.actual_value_unit === 'count'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'special_audit_survey'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'audit_work_update'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'work_method_reference'));
  assert.ok(payloads.caseSeeds.records.every((row) => Number.isInteger(row.audit_evidence_weight)));
});

test('fourth official summary preserves collector metrics and baseline counts', () => {
  const payloads = buildFourthOfficialPublicInstancePayloads();
  const summary = summarizeFourthOfficialRun({
    generatedAt: '2026-04-26T21:45:00+08:00',
    payloads,
    procurementResponse: {
      detail: { payload: { accepted_rows: payloads.procurement.records.length, rejected_rows: 0, quality_report: [] } },
      findings: [{ rule_code: 'PROC-CHAIN-001', risk_level: 'Info', summary: '补数建议' }],
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      detail: { payload: { accepted_rows: batch.records.length, rejected_rows: 0, quality_report: [] } },
      findings: [],
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round4');
  assert.equal(summary.total_input_records, payloads.collectorSummary.total_records);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.source_completeness_rate, 100);
  assert.equal(summary.collector_summary.source_count, 20);
  assert.equal(summary.collector_summary.previous_source_overlap_count, 0);
  assert.equal(summary.collector_summary.fourth_round_source_count, 20);
  assert.ok(summary.collector_summary.special_fund_structured_coverage_rate > 0);
  assert.ok(summary.collector_summary.amount_semantic_types.award_total >= 1);
  assert.ok(summary.collector_summary.amount_semantic_types.budget_amount >= 1);
  assert.ok(summary.collector_summary.audit_evidence_levels.special_audit_survey >= 1);
  assert.ok(summary.collector_summary.audit_evidence_weights.special_audit_survey >= 60);
});
