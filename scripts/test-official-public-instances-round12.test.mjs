import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwelfthOfficialPublicInstancePayloads,
  summarizeTwelfthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round12.mjs';

test('round12 payloads use newly researched official sources without prior URL overlap', () => {
  const payloads = buildTwelfthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T19:00:00+08:00',
    parserVersion: 'official-public-instance-round12-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round12'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.publisher === 'China Government Procurement Network'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.publisher === 'Jiangsu Department of Finance'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.publisher === 'Jiangsu Audit Office'));
});

test('round12 procurement samples cover contract terms, government purchase service, and policy-sensitive notices', () => {
  const payloads = buildTwelfthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 85);
  assert.ok(records.some((row) => row.government_purchase_service_flag));
  assert.ok(records.some((row) => row.joint_bid_allowed_flag));
  assert.ok(records.some((row) => row.contract_performance_period));
  assert.ok(records.some((row) => row.procurement_stage === 'announcement'));
  assert.ok(records.some((row) => row.procurement_stage === 'award'));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(payloads.collectorSummary.contract_term_records >= 60);
  assert.ok(payloads.collectorSummary.government_purchase_service_records >= 10);
});

test('round12 fiscal and audit samples stay evidence-weighted and supplemental', () => {
  const payloads = buildTwelfthOfficialPublicInstancePayloads();
  const policyRows = payloads.budget.records.filter((row) => row.dataset_kind === 'budget_performance_policy');
  const auditRows = payloads.caseSeeds.records;

  assert.ok(payloads.budget.records.length >= 38);
  assert.ok(policyRows.length >= 25);
  assert.ok(policyRows.every((row) => row.required_budget_indicator_data));
  assert.ok(policyRows.every((row) => row.required_performance_target_data));
  assert.ok(policyRows.every((row) => row.policy_chain_stage));
  assert.equal(payloads.collectorSummary.policy_chain_checklist_coverage_rate, 100);

  assert.ok(auditRows.length >= 16);
  assert.ok(auditRows.some((row) => row.audit_evidence_level === 'special_audit_survey'));
  assert.ok(auditRows.some((row) => row.audit_evidence_level === 'audit_project_plan'));
  assert.ok(auditRows.filter((row) => Number(row.audit_evidence_weight || 0) < 60)
    .every((row) => row.finding_disposition !== 'risk_candidate'));
});

test('round12 summary reports acceptance and optimization areas', () => {
  const payloads = buildTwelfthOfficialPublicInstancePayloads();
  const summary = summarizeTwelfthOfficialRun({
    generatedAt: '2026-04-27T19:10:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-CONTRACT-TERMS-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-POLICY-CHAIN-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round12');
  assert.ok(summary.total_input_records >= 140);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round12_acceptance_baseline, 140);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'contract terms and government purchase service modeling'));
});
