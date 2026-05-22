import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildThirteenthOfficialPublicInstancePayloads,
  summarizeThirteenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round13.mjs';

test('round13 payloads productize contract terms and government purchase service fields', () => {
  const payloads = buildThirteenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T20:30:00+08:00',
    parserVersion: 'official-public-instance-round13-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);
  const records = payloads.procurement.records;

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(records.length >= 90);
  assert.ok(records.every((row) => 'contract_performance_period' in row));
  assert.ok(records.some((row) => row.government_purchase_service_flag));
  assert.ok(records.some((row) => row.joint_bid_allowed_flag));
  assert.ok(records.some((row) => row.sme_policy_requirement));
  assert.ok(records.some((row) => row.credit_financing_policy_flag));
  assert.ok(records.some((row) => row.procurement_policy_note));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round13 policy and audit records stay supplemental or review-only', () => {
  const payloads = buildThirteenthOfficialPublicInstancePayloads();
  const policyRows = payloads.budget.records.filter((row) => row.dataset_kind === 'budget_performance_policy');
  const auditRows = payloads.caseSeeds.records;

  assert.ok(policyRows.length >= 35);
  assert.ok(policyRows.every((row) => row.required_budget_indicator_data));
  assert.ok(policyRows.every((row) => row.required_performance_target_data));
  assert.ok(policyRows.every((row) => row.required_payment_data));
  assert.ok(policyRows.every((row) => row.required_voucher_data));
  assert.equal(payloads.collectorSummary.policy_supplemental_data_coverage_rate, 100);
  assert.ok(auditRows.some((row) => row.audit_evidence_level === 'audit_project_plan'));
  assert.ok(auditRows.some((row) => row.audit_evidence_level === 'audit_work_update'));
  assert.ok(auditRows.filter((row) => Number(row.audit_evidence_weight || 0) < 60)
    .every((row) => row.finding_disposition !== 'risk_candidate'));
});

test('round13 crawler queue includes chain discovery metadata and candidate diagnostics', () => {
  const payloads = buildThirteenthOfficialPublicInstancePayloads();
  const queueItems = payloads.publicDiscoveryQueue.items;
  const crawlerItems = payloads.discoveryCrawler.items;

  assert.ok(queueItems.length >= 100);
  assert.ok(queueItems.every((item) => item.source_stage_from));
  assert.ok(queueItems.every((item) => item.chain_discovery_reason));
  assert.ok(queueItems.every((item) => Array.isArray(item.candidate_source_urls)));
  assert.ok(queueItems.every((item) => item.candidate_stage_scores && typeof item.candidate_stage_scores === 'object'));
  assert.ok(crawlerItems.every((item) => ['matched', 'not_found', 'parse_failed', 'manual_review'].includes(item.crawler_status)));
  assert.ok(crawlerItems.every((item) => item.crawler_status === 'matched' || item.failure_reason));
  assert.ok(payloads.collectorSummary.chain_discovery_candidate_metadata_coverage_rate === 100);
});

test('round13 summary reports acceptance baseline and report topic coverage', () => {
  const payloads = buildThirteenthOfficialPublicInstancePayloads();
  const summary = summarizeThirteenthOfficialRun({
    generatedAt: '2026-04-27T20:35:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-POLICY-TERMS-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-POLICY-CHAIN-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round13');
  assert.ok(summary.total_input_records >= 120);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round13_acceptance_baseline, 120);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'contract policy terms and chain discovery'));
});
