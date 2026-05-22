import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdditionalOfficialPublicInstancePayloads,
  previousOfficialSourceUrls,
  summarizeAdditionalOfficialRun,
} from './test-official-public-instances-round2.mjs';

test('additional official payloads use new source URLs and enough records', () => {
  const payloads = buildAdditionalOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T18:30:00+08:00',
    parserVersion: 'official-public-instance-round2-v1',
  });
  const previousUrls = previousOfficialSourceUrls();
  const sourceUrls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.ok(payloads.procurement.records.length >= 40);
  assert.ok(payloads.budget.records.length >= 60);
  assert.ok(payloads.caseSeeds.records.length >= 8);
  assert.equal(new Set(sourceUrls).size, sourceUrls.length);
  assert.equal(sourceUrls.filter((url) => previousUrls.has(url)).length, 0);

  const allRows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  for (const row of allRows) {
    assert.ok(row.source_evidence.title);
    assert.ok(row.source_evidence.url.startsWith('https://'));
    assert.equal(row.source_evidence.captured_at, '2026-04-26T18:30:00+08:00');
    assert.equal(row.source_evidence.parser_version, 'official-public-instance-round2-v1');
    assert.ok(row.source_evidence.locator_hash);
    assert.ok(row.source_evidence.raw_excerpt);
    assert.ok(row.source_evidence.page_number || row.source_evidence.section_title);
  }

  assert.ok(payloads.procurement.records.every((row) => row.notice_url && row.procurement_stage));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'announcement'));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'award'));
  assert.ok(payloads.procurement.records.every((row) =>
    row.normalized_award_amount_yuan ||
    row.normalized_budget_amount_yuan ||
    row.discount_rate ||
    row.unit_price ||
    row.quote_amount,
  ));

  const frameworkRows = payloads.procurement.records.filter((row) => row.framework_agreement_flag);
  assert.ok(frameworkRows.length >= 20);
  assert.ok(frameworkRows.some((row) => row.amount_semantic_type === 'discount_rate'));
  assert.ok(frameworkRows.some((row) => row.amount_semantic_type === 'framework_quote'));
  assert.ok(frameworkRows.every((row) => !row.normalized_award_amount_yuan));
  assert.ok(frameworkRows.every((row) => row.quote_amount_unit));

  assert.ok(payloads.budget.records.every((row) => row.actual_value_unit));
  assert.ok(payloads.budget.records.every((row) => row.normalized_actual_value));
  assert.ok(payloads.budget.records.every((row) => /^\d{4}-\d{2}$/.test(row.period)));
  assert.ok(payloads.caseSeeds.records.every((row) => row.issue_amount_unit));
  assert.ok(payloads.caseSeeds.records.every((row) => row.required_next_data.length > 0));
  assert.ok(payloads.caseSeeds.records.every((row) => row.audit_evidence_level));
  assert.ok(payloads.caseSeeds.records.every((row) => typeof row.requires_manual_verification === 'boolean'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'rectification_progress'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'audit_work_update'));
});

test('additional official summary preserves collector and source coverage metrics', () => {
  const payloads = buildAdditionalOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T18:30:00+08:00',
  });
  const summary = summarizeAdditionalOfficialRun({
    generatedAt: '2026-04-26T18:45:00+08:00',
    payloads,
    procurementResponse: {
      detail: { payload: { accepted_rows: payloads.procurement.records.length, rejected_rows: 0, quality_report: [] } },
      findings: [{ rule_code: 'PROC-CHAIN-001', risk_level: 'Info', summary: 'announcement-stage补数建议' }],
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      detail: { payload: { accepted_rows: batch.records.length, rejected_rows: 0, quality_report: [] } },
      findings: [],
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  const expectedTotal =
    payloads.procurement.records.length +
    payloads.budget.records.length +
    payloads.caseSeeds.records.length;
  assert.equal(summary.total_input_records, expectedTotal);
  assert.equal(summary.total_accepted_records, expectedTotal);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.source_completeness_rate, 100);
  assert.equal(summary.collector_summary.source_count, payloads.sourceRegister.sources.length);
  assert.equal(summary.collector_summary.total_records, expectedTotal);
});
