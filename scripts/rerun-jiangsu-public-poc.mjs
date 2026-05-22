import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runs = [
  {
    key: 'nantong_public_samples',
    label: 'Nantong public samples',
    dir: 'data/real-integration/nantong-feasibility-20260426',
    summaryFile: 'api_test_summary_node_utf8.json',
    baselineRecords: 92
  },
  {
    key: 'jiangsu_county_public_samples',
    label: 'Jiangsu multi-county public samples',
    dir: 'data/real-integration/jiangsu-county-feasibility-20260426',
    summaryFile: 'api_test_summary_node_utf8.json',
    baselineRecords: 164
  },
  {
    key: 'official_public_instances_round1',
    label: 'Official public source instances',
    dir: 'data/real-integration/official-public-instances-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 49
  },
  {
    key: 'official_public_instances_round2',
    label: 'Official public source instances round 2',
    dir: 'data/real-integration/official-public-instances-round2-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 118
  },
  {
    key: 'official_public_instances_round3',
    label: 'Official public source instances round 3',
    dir: 'data/real-integration/official-public-instances-round3-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 122
  },
  {
    key: 'official_public_instances_round4',
    label: 'Official public source instances round 4',
    dir: 'data/real-integration/official-public-instances-round4-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 64
  },
  {
    key: 'official_public_instances_round5',
    label: 'Official public source instances round 5',
    dir: 'data/real-integration/official-public-instances-round5-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 80
  },
  {
    key: 'official_public_instances_round6',
    label: 'Official public source instances round 6',
    dir: 'data/real-integration/official-public-instances-round6-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 84
  },
  {
    key: 'official_public_instances_round7',
    label: 'Official public source instances round 7',
    dir: 'data/real-integration/official-public-instances-round7-20260426',
    summaryFile: 'summary.json',
    baselineRecords: 90
  },
  {
    key: 'official_public_instances_round8',
    label: 'Official public source instances round 8',
    dir: 'data/real-integration/official-public-instances-round8-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 80
  },
  {
    key: 'official_public_instances_round9',
    label: 'Official public source instances round 9',
    dir: 'data/real-integration/official-public-instances-round9-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 100
  },
  {
    key: 'official_public_instances_round10',
    label: 'Official public source instances round 10',
    dir: 'data/real-integration/official-public-instances-round10-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 110
  },
  {
    key: 'official_public_instances_round11',
    label: 'Official public source instances round 11',
    dir: 'data/real-integration/official-public-instances-round11-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 120
  },
  {
    key: 'official_public_instances_round12',
    label: 'Official public source instances round 12',
    dir: 'data/real-integration/official-public-instances-round12-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 140
  },
  {
    key: 'official_public_instances_round13',
    label: 'Official public source instances round 13',
    dir: 'data/real-integration/official-public-instances-round13-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 120
  },
  {
    key: 'official_public_instances_round14',
    label: 'Official public source instances round 14',
    dir: 'data/real-integration/official-public-instances-round14-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 150
  },
  {
    key: 'official_public_instances_round15',
    label: 'Official public source instances round 15',
    dir: 'data/real-integration/official-public-instances-round15-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 150
  },
  {
    key: 'official_public_instances_round16',
    label: 'Official public source instances round 16',
    dir: 'data/real-integration/official-public-instances-round16-20260428',
    summaryFile: 'summary.json',
    baselineRecords: 170
  },
  {
    key: 'official_public_instances_round17',
    label: 'Official public source instances round 17',
    dir: 'data/real-integration/official-public-instances-round17-20260428',
    summaryFile: 'summary.json',
    baselineRecords: 120
  },
  {
    key: 'official_public_instances_round18',
    label: 'Official public source instances round 18',
    dir: 'data/real-integration/official-public-instances-round18-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 130
  },
  {
    key: 'official_public_instances_round19',
    label: 'Official public source instances round 19',
    dir: 'data/real-integration/official-public-instances-round19-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 120
  },
  {
    key: 'official_public_instances_round20',
    label: 'Official public source instances round 20',
    dir: 'data/real-integration/official-public-instances-round20-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 130
  },
  {
    key: 'official_public_instances_round21',
    label: 'Official public source instances round 21',
    dir: 'data/real-integration/official-public-instances-round21-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 130
  },
  {
    key: 'official_public_instances_round22',
    label: 'Official public source instances round 22',
    dir: 'data/real-integration/official-public-instances-round22-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 140
  },
  {
    key: 'official_public_instances_round23',
    label: 'Official public source instances round 23',
    dir: 'data/real-integration/official-public-instances-round23-20260427',
    summaryFile: 'summary.json',
    baselineRecords: 140
  }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

function acceptedRows(summary) {
  if (summary.total_accepted_records !== undefined) return Number(summary.total_accepted_records || 0);
  return Number(summary.budget_rows_accepted || 0)
    + Number(summary.fiscal_rows_accepted || 0)
    + Number(summary.procurement_rows_accepted || 0)
    + Number(summary.case_seed_imported || 0);
}

function inputRows(summary) {
  if (summary.total_input_records !== undefined) return Number(summary.total_input_records || 0);
  return Number(summary.fiscal_input_records || 0)
    + Number(summary.procurement_input_records || 0)
    + Number(summary.case_seed_input_records || 0)
    + Number(summary.budget_rows_total || 0)
    + Number(summary.procurement_rows_total || 0)
    + Number(summary.case_seed_imported || 0);
}

function ruleHits(summary) {
  if (summary.rule_hits_by_rule) return summary.rule_hits_by_rule;
  const hits = { ...(summary.procurement_findings_by_rule || {}) };
  if (!Object.keys(hits).length && summary.procurement_findings) hits.procurement_findings = summary.procurement_findings;
  if (summary.budget_findings) hits.budget_findings = summary.budget_findings;
  if (summary.fiscal_findings) hits.fiscal_findings = summary.fiscal_findings;
  return hits;
}

function buildRun(run) {
  const dir = path.join(root, run.dir);
  const summary = readJson(path.join(dir, run.summaryFile));
  const totalInput = inputRows(summary);
  const accepted = acceptedRows(summary);
  const collector = {
    ...(summary.collector_summary || {}),
    ...(readOptionalJson(path.join(dir, 'collector_summary.json')) || {})
  };
  const sourceRegister = readOptionalJson(path.join(dir, 'source_register.json'));
  const sourceRegisterSources = Array.isArray(sourceRegister?.sources) ? sourceRegister.sources : [];
  const procurementChainClosure = readOptionalJson(path.join(dir, 'procurement_chain_closure.json'));
  const publicDiscoveryQueue = readOptionalJson(path.join(dir, 'public_discovery_queue.json'));
  const sourceFiles = fs.readdirSync(dir).filter((name) => /\.(json|csv|md)$/i.test(name));
  return {
    key: run.key,
    label: run.label,
    directory: run.dir,
    verified_at: summary.verified_at,
    baseline_records: run.baselineRecords,
    input_records: totalInput,
    accepted_records: accepted,
    baseline_passed: accepted >= run.baselineRecords,
    import_success_rate: totalInput ? Number(((accepted / totalInput) * 100).toFixed(2)) : 0,
    risk_level: summary.procurement_risk_level || summary.fiscal_risk_level || summary.budget_risk_level || 'Unknown',
    rule_hits: ruleHits(summary),
    collector_summary: Object.keys(collector).length ? collector : null,
    source_registry: {
      source_count: firstNumber(collector.source_count, sourceRegisterSources.length),
      parsed_source_count: firstNumber(
        collector.parsed_source_count,
        sourceRegisterSources.filter((source) => (source.status ?? 'parsed') !== 'failed').length,
      ),
      duplicate_source_count: firstNumber(
        collector.duplicate_source_count,
        sourceRegisterSources.filter((source) => source.review_status === 'duplicate').length,
      ),
      url_duplicate_source_count: firstNumber(
        collector.url_duplicate_source_count,
        sourceRegisterSources.filter((source) => source.duplicate_reason === 'url_hash').length,
      ),
      content_duplicate_source_count: firstNumber(
        collector.content_duplicate_source_count,
        sourceRegisterSources.filter((source) => source.duplicate_reason === 'content_hash').length,
      ),
      title_duplicate_source_count: firstNumber(
        collector.title_duplicate_source_count,
        sourceRegisterSources.filter((source) => source.duplicate_reason === 'title_similarity').length,
      ),
      review_statuses: collector.review_statuses || collector.manual_review_statuses || countBy(sourceRegisterSources, inferredReviewStatus)
    },
    pdf_extraction: {
      locator_coverage_rate: numberOrZero(collector.locator_coverage_rate),
      missing_source_locator_count: numberOrZero(collector.missing_source_locator_count),
      pdf_parse_partial_count: numberOrZero(collector.pdf_parse_partial_count),
      empty_table_detected_count: numberOrZero(collector.empty_table_detected_count),
      zero_budget_table_count: numberOrZero(collector.zero_budget_table_count),
      not_applicable_table_count: numberOrZero(collector.not_applicable_table_count),
      department_final_account_records: numberOrZero(collector.department_final_account_records)
    },
    amount_semantics: {
      unit_normalized_records: numberOrZero(collector.unit_normalized_records),
      amount_unit_review_count: numberOrZero(collector.amount_unit_review_count),
      framework_limit_review_count: numberOrZero(collector.framework_limit_review_count),
      unit_price_or_rate_review_count: numberOrZero(collector.unit_price_or_rate_review_count),
      amount_semantic_types: collector.amount_semantic_types || {},
      framework_agreement_count: numberOrZero(collector.framework_agreement_count),
      electronic_marketplace_records: numberOrZero(collector.electronic_marketplace_records),
      electronic_marketplace_unit_price_records: numberOrZero(collector.electronic_marketplace_unit_price_records),
      electronic_marketplace_order_total_records: numberOrZero(collector.electronic_marketplace_order_total_records),
      centralized_batch_records: numberOrZero(collector.centralized_batch_records),
      centralized_batch_total_records: numberOrZero(collector.centralized_batch_total_records),
      centralized_batch_lot_records: numberOrZero(collector.centralized_batch_lot_records)
    },
    special_funds: {
      structured_records: numberOrZero(collector.special_fund_structured_records),
      structured_coverage_rate: numberOrZero(collector.special_fund_structured_coverage_rate)
    },
    fiscal_policy_supplemental: {
      budget_policy_records: numberOrZero(collector.budget_policy_records),
      policy_supplemental_data_coverage_rate: firstNumber(
        collector.policy_supplemental_data_coverage_rate,
        collector.policy_chain_checklist_coverage_rate,
        collector.fiscal_policy_supplemental_coverage_rate,
      ),
      payment_voucher_linkage_field_coverage_rate: numberOrZero(collector.payment_voucher_linkage_field_coverage_rate)
    },
    contract_policy_terms: {
      contract_term_records: firstNumber(
        collector.contract_term_records,
        collector.procurement_service_period_records,
      ),
      government_purchase_service_records: numberOrZero(collector.government_purchase_service_records),
      joint_bid_allowed_records: numberOrZero(collector.joint_bid_allowed_records),
      policy_sensitive_procurement_records: numberOrZero(collector.policy_sensitive_procurement_records)
    },
    audit_evidence: {
      audit_evidence_levels: collector.audit_evidence_levels || {},
      audit_evidence_weights: collector.audit_evidence_weights || {},
      requires_manual_verification_count: numberOrZero(collector.requires_manual_verification_count)
    },
    procurement_chain_closure: {
      group_count: firstNumber(collector.procurement_chain_group_count, procurementChainClosure?.summary?.group_count),
      closed_group_count: firstNumber(collector.procurement_chain_closed_group_count, procurementChainClosure?.summary?.closed_group_count),
      missing_contract_count: firstNumber(collector.procurement_chain_missing_contract_count, procurementChainClosure?.summary?.missing_contract_count),
      missing_acceptance_count: firstNumber(collector.procurement_chain_missing_acceptance_count, procurementChainClosure?.summary?.missing_acceptance_count),
      missing_payment_count: firstNumber(collector.procurement_chain_missing_payment_count, procurementChainClosure?.summary?.missing_payment_count),
      amount_review_count: firstNumber(procurementChainClosure?.summary?.amount_review_count, collector.procurement_chain_amount_review_count)
    },
    discovery_queue: {
      total_items: firstNumber(collector.discovery_queue_item_count, publicDiscoveryQueue?.summary?.total_items),
      by_target_stage: collector.discovery_queue_by_target_stage || publicDiscoveryQueue?.summary?.by_target_stage || {},
      by_priority: collector.discovery_queue_by_priority || publicDiscoveryQueue?.summary?.by_priority || {},
      review_statuses: publicDiscoveryQueue?.summary?.review_statuses || {},
      chain_metadata_coverage_rate: numberOrZero(collector.chain_discovery_candidate_metadata_coverage_rate)
    },
    payment_conditions: {
      records: numberOrZero(collector.payment_condition_records),
      missing_deadline_count: numberOrZero(collector.payment_deadline_missing_count)
    },
    fulfillment_acceptance: {
      records: firstNumber(
        collector.fulfillment_acceptance_records,
        collector.fulfillment_acceptance_policy_records,
        collector.acceptance_trigger_records,
      ),
      missing_plan_count: numberOrZero(collector.missing_acceptance_plan_count),
      missing_opinion_count: numberOrZero(collector.missing_acceptance_opinion_count),
      missing_archive_count: numberOrZero(collector.missing_acceptance_archive_count),
      not_found_explained_count: numberOrZero(collector.crawler_not_found_explained_count)
    },
    service_period_evidence: {
      service_period_records: firstNumber(
        collector.service_period_records,
        collector.procurement_service_period_records,
      ),
      maintenance_or_warranty_records: numberOrZero(collector.maintenance_or_warranty_records),
      acceptance_standard_records: numberOrZero(collector.acceptance_standard_records),
      acceptance_result_locator_records: numberOrZero(collector.acceptance_result_locator_records),
      acceptance_trigger_records: numberOrZero(collector.acceptance_trigger_records),
      fiscal_performance_metric_records: numberOrZero(collector.fiscal_performance_metric_records),
      fiscal_performance_checklist_coverage_rate: numberOrZero(collector.fiscal_performance_checklist_coverage_rate),
      audit_followup_or_review_records: numberOrZero(collector.audit_followup_or_review_records)
    },
    procurement_exception_evidence: {
      procurement_exception_records: numberOrZero(collector.procurement_exception_records),
      complaint_decision_records: numberOrZero(collector.complaint_decision_records),
      complaint_or_supervision_records: numberOrZero(collector.complaint_or_supervision_records),
      supervision_penalty_records: numberOrZero(collector.supervision_penalty_records),
      correction_notice_records: numberOrZero(collector.correction_notice_records),
      false_material_records: numberOrZero(collector.false_material_records),
      malicious_collusion_records: numberOrZero(collector.malicious_collusion_records),
      award_invalidated_records: numberOrZero(collector.award_invalidated_records),
      rebid_required_records: numberOrZero(collector.rebid_required_records),
      agency_penalty_records: numberOrZero(collector.agency_penalty_records),
      procurement_penalty_records: numberOrZero(collector.procurement_penalty_records),
      credit_constraint_records: numberOrZero(collector.credit_constraint_records),
      credit_repair_followup_records: numberOrZero(collector.credit_repair_followup_records),
      re_participation_review_records: numberOrZero(collector.re_participation_review_records),
      complaint_rejected_records: numberOrZero(collector.complaint_rejected_records),
      exception_weight_coverage_rate: numberOrZero(collector.exception_weight_coverage_rate),
      procurement_complaint_adjudication_records: numberOrZero(collector.procurement_complaint_adjudication_records),
      false_material_allegation_records: numberOrZero(collector.false_material_allegation_records),
      sme_policy_allegation_records: numberOrZero(collector.sme_policy_allegation_records),
      bid_document_defect_records: numberOrZero(collector.bid_document_defect_records),
      complaint_established_records: numberOrZero(collector.complaint_established_records),
      complaint_partly_established_records: numberOrZero(collector.complaint_partly_established_records),
      confirmed_fact_records: numberOrZero(collector.confirmed_fact_records),
      remedy_required_records: numberOrZero(collector.remedy_required_records),
      allegation_weight_coverage_rate: numberOrZero(collector.allegation_weight_coverage_rate),
      complaint_review_only_rate: numberOrZero(collector.complaint_review_only_rate),
      allegation_outcome_coverage_rate: numberOrZero(collector.allegation_outcome_coverage_rate),
      complaint_chain_matched_count: numberOrZero(collector.complaint_chain_matched_count),
      exception_chain_queue_item_count: numberOrZero(collector.exception_chain_queue_item_count),
      review_only_rate: numberOrZero(collector.procurement_exception_review_only_rate)
    },
    discovery_crawler: {
      processed_count: numberOrZero(collector.discovery_crawler_processed_count),
      matched_count: numberOrZero(collector.discovery_crawler_matched_count),
      match_rate: numberOrZero(collector.discovery_crawler_match_rate),
      statuses: collector.discovery_crawler_statuses || {},
      live_sample_mode: Boolean(collector.live_sample_mode),
      live_sample_size: numberOrZero(collector.live_sample_size),
      live_sampled_item_count: numberOrZero(collector.live_sampled_item_count),
      live_stable_baseline_impact: Boolean(collector.live_stable_baseline_impact),
      live_statuses: collector.live_crawler_statuses || {},
      chain_scored_count: numberOrZero(collector.crawler_chain_scored_count)
    },
    source_region: {
      scopes: collector.source_region_scopes || {},
      central_unit_source_count: numberOrZero(collector.central_unit_source_count),
      cross_province_source_count: numberOrZero(collector.cross_province_source_count),
      jiangsu_local_source_count: numberOrZero(collector.jiangsu_local_source_count),
      wrong_jiangsu_attribution_review_count: numberOrZero(collector.wrong_jiangsu_attribution_review_count)
    },
    source_completeness_rate: summary.source_completeness_rate || null,
    source_file_count: sourceFiles.length,
    utf8_roundtrip: Boolean(summary.chinese_preserved_in_procurement_response || summary.procurement_chinese_roundtrip || summary.fiscal_chinese_roundtrip || summary.source_completeness_rate === 100),
    summary
  };
}

function markdown(result) {
  const lines = [
    '# Jiangsu County Public Data PoC Rerun Summary',
    '',
    `Generated at: ${result.generated_at}`,
    `Total baseline records: ${result.totals.baseline_records}`,
    `Total accepted records: ${result.totals.accepted_records}`,
    `Overall result: ${result.totals.baseline_passed ? 'pass' : 'below baseline'}`,
    '',
    '| Sample | Baseline | Accepted | Import success | Risk | UTF-8 | Result |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |'
  ];
  for (const run of result.runs) {
    lines.push(`| ${run.label} | ${run.baseline_records} | ${run.accepted_records} | ${run.import_success_rate}% | ${run.risk_level} | ${run.utf8_roundtrip ? 'pass' : 'review'} | ${run.baseline_passed ? 'pass' : 'below baseline'} |`);
  }
  lines.push('', '## Source Registry And Dedup');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Source coverage: ${run.source_registry.parsed_source_count}/${run.source_registry.source_count}`);
    lines.push(`- Duplicate sources: ${run.source_registry.duplicate_source_count}`);
    lines.push(`- Duplicate breakdown: URL ${run.source_registry.url_duplicate_source_count}, content ${run.source_registry.content_duplicate_source_count}, title ${run.source_registry.title_duplicate_source_count}`);
    lines.push(`- Review statuses: ${formatObject(run.source_registry.review_statuses) || 'none'}`);
    if (run.collector_summary) {
      lines.push(`- Network failures reported: ${numberOrZero(run.collector_summary.network_failure_count)}`);
      lines.push(`- Failure kinds: ${formatObject(run.collector_summary.failure_kinds) || 'none'}`);
      lines.push(`- Registered snapshots verified: ${numberOrZero(run.collector_summary.offline_snapshot_verified_count)}/${numberOrZero(run.collector_summary.source_count)}`);
      lines.push(`- Retry attempts: ${numberOrZero(run.collector_summary.retry_attempt_count)}`);
      lines.push(`- Proxy: ${run.collector_summary.proxy_configured ? run.collector_summary.proxy_origin : 'not configured'}`);
      lines.push(`- External downloader: ${run.collector_summary.external_downloader_configured ? `configured, success ${numberOrZero(run.collector_summary.external_downloader_success_count)}, failed ${numberOrZero(run.collector_summary.external_downloader_failure_count)}` : 'not configured'}`);
      lines.push(`- Download methods: ${formatObject(run.collector_summary.download_methods) || 'none'}`);
    }
  }
  lines.push('', '## PDF And Locator Quality');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- PDF/web locator coverage: ${run.pdf_extraction.locator_coverage_rate}%`);
    lines.push(`- Missing source locators: ${run.pdf_extraction.missing_source_locator_count}`);
    lines.push(`- Partial PDF parses: ${run.pdf_extraction.pdf_parse_partial_count}`);
    lines.push(`- Empty tables: ${run.pdf_extraction.empty_table_detected_count}`);
    lines.push(`- Zero budget tables: ${run.pdf_extraction.zero_budget_table_count}`);
    lines.push(`- Not applicable tables: ${run.pdf_extraction.not_applicable_table_count}`);
    lines.push(`- Department final-account records: ${run.pdf_extraction.department_final_account_records}`);
  }
  lines.push('', '## Amount Semantics And Framework Agreements');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Unit normalized records: ${run.amount_semantics.unit_normalized_records}`);
    lines.push(`- Amount unit reviews: ${run.amount_semantics.amount_unit_review_count}`);
    lines.push(`- Framework limit reviews: ${run.amount_semantics.framework_limit_review_count}`);
    lines.push(`- Unit price/rate reviews: ${run.amount_semantics.unit_price_or_rate_review_count}`);
    lines.push(`- Amount semantic types: ${formatObject(run.amount_semantics.amount_semantic_types) || 'none'}`);
    lines.push(`- Framework agreement records: ${run.amount_semantics.framework_agreement_count}`);
    lines.push(`- Electronic marketplace records: ${run.amount_semantics.electronic_marketplace_records}`);
    lines.push(`- Electronic marketplace unit price / order total: ${run.amount_semantics.electronic_marketplace_unit_price_records} / ${run.amount_semantics.electronic_marketplace_order_total_records}`);
    lines.push(`- Centralized batch total / lot records: ${run.amount_semantics.centralized_batch_total_records} / ${run.amount_semantics.centralized_batch_lot_records}`);
  }
  lines.push('', '## Audit Evidence Levels');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Evidence levels: ${formatObject(run.audit_evidence.audit_evidence_levels) || 'none'}`);
    lines.push(`- Evidence weights: ${formatObject(run.audit_evidence.audit_evidence_weights) || 'none'}`);
    lines.push(`- Manual verification needed: ${run.audit_evidence.requires_manual_verification_count}`);
  }
  lines.push('', '## Special Fund Structuring');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Structured special fund records: ${run.special_funds.structured_records}`);
    lines.push(`- Structured coverage rate: ${run.special_funds.structured_coverage_rate}%`);
  }
  lines.push('', '## Fiscal Policy Supplemental Data');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Policy records: ${run.fiscal_policy_supplemental.budget_policy_records}`);
    lines.push(`- Budget indicator / performance target / payment / voucher checklist coverage: ${run.fiscal_policy_supplemental.policy_supplemental_data_coverage_rate}%`);
    lines.push(`- Payment and voucher linkage field coverage: ${run.fiscal_policy_supplemental.payment_voucher_linkage_field_coverage_rate}%`);
  }
  lines.push('', '## Procurement Chain Closure And Discovery Queue');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Chain groups: ${run.procurement_chain_closure.group_count}`);
    lines.push(`- Closed public chains: ${run.procurement_chain_closure.closed_group_count}`);
    lines.push(`- Missing contract / acceptance / payment: ${run.procurement_chain_closure.missing_contract_count} / ${run.procurement_chain_closure.missing_acceptance_count} / ${run.procurement_chain_closure.missing_payment_count}`);
    lines.push(`- Amount review groups: ${run.procurement_chain_closure.amount_review_count}`);
    lines.push(`- Discovery queue items: ${run.discovery_queue.total_items}`);
    lines.push(`- Discovery queue target stages: ${formatObject(run.discovery_queue.by_target_stage) || 'none'}`);
    lines.push(`- Discovery queue priorities: ${formatObject(run.discovery_queue.by_priority) || 'none'}`);
    lines.push(`- Chain discovery metadata coverage: ${run.discovery_queue.chain_metadata_coverage_rate}%`);
  }
  lines.push('', '## Contract Terms And Government Purchase Service');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Contract term records: ${run.contract_policy_terms.contract_term_records}`);
    lines.push(`- Government purchase service records: ${run.contract_policy_terms.government_purchase_service_records}`);
    lines.push(`- Joint-bid allowed records: ${run.contract_policy_terms.joint_bid_allowed_records}`);
    lines.push(`- Policy-sensitive procurement records: ${run.contract_policy_terms.policy_sensitive_procurement_records}`);
  }
  lines.push('', '## Payment Conditions And Discovery Crawler');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Payment condition records: ${run.payment_conditions.records}`);
    lines.push(`- Payment conditions missing explicit deadline: ${run.payment_conditions.missing_deadline_count}`);
    lines.push(`- Crawler processed queue items: ${run.discovery_crawler.processed_count}`);
    lines.push(`- Crawler matched items: ${run.discovery_crawler.matched_count}`);
    lines.push(`- Crawler match rate: ${run.discovery_crawler.match_rate}%`);
    lines.push(`- Crawler statuses: ${formatObject(run.discovery_crawler.statuses) || 'none'}`);
    if (run.discovery_crawler.live_sample_mode) {
      lines.push(`- Live crawler sample: ${run.discovery_crawler.live_sampled_item_count}/${run.discovery_crawler.live_sample_size}, stable baseline impact ${run.discovery_crawler.live_stable_baseline_impact}`);
      lines.push(`- Live crawler statuses: ${formatObject(run.discovery_crawler.live_statuses) || 'none'}`);
    }
  }
  lines.push('', '## Fulfillment Acceptance And Payment Conditions');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Fulfillment acceptance records: ${run.fulfillment_acceptance.records}`);
    lines.push(`- Missing acceptance plan/opinion/archive: ${run.fulfillment_acceptance.missing_plan_count} / ${run.fulfillment_acceptance.missing_opinion_count} / ${run.fulfillment_acceptance.missing_archive_count}`);
    lines.push(`- Contract performance period records: ${run.contract_policy_terms.contract_term_records}`);
    lines.push(`- Payment trigger/deadline records: ${run.payment_conditions.records}, missing deadline ${run.payment_conditions.missing_deadline_count}`);
    lines.push(`- Crawler not-found or review explanations: ${run.fulfillment_acceptance.not_found_explained_count}`);
  }
  lines.push('', '## Service Period Maintenance And Fiscal Performance Evidence');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Procurement service period records: ${run.service_period_evidence.service_period_records}`);
    lines.push(`- Maintenance or warranty records: ${run.service_period_evidence.maintenance_or_warranty_records}`);
    lines.push(`- Acceptance standard records: ${run.service_period_evidence.acceptance_standard_records}`);
    lines.push(`- Acceptance result locator records: ${run.service_period_evidence.acceptance_result_locator_records}`);
    lines.push(`- Acceptance trigger records: ${run.service_period_evidence.acceptance_trigger_records}`);
    lines.push(`- Fiscal performance metric records: ${run.service_period_evidence.fiscal_performance_metric_records}`);
    lines.push(`- Fiscal performance checklist coverage: ${run.service_period_evidence.fiscal_performance_checklist_coverage_rate}%`);
    lines.push(`- Crawler chain-scored items: ${run.discovery_crawler.chain_scored_count}`);
    lines.push(`- Audit follow-up or review records: ${run.service_period_evidence.audit_followup_or_review_records}`);
  }
  lines.push('', '## Procurement Complaint And Exception Evidence');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Procurement exception records: ${run.procurement_exception_evidence.procurement_exception_records}`);
    lines.push(`- Complaint decision records: ${run.procurement_exception_evidence.complaint_decision_records}`);
    lines.push(`- Complaint or supervision records: ${run.procurement_exception_evidence.complaint_or_supervision_records}`);
    lines.push(`- Supervision penalty records: ${run.procurement_exception_evidence.supervision_penalty_records}`);
    lines.push(`- Correction notice records: ${run.procurement_exception_evidence.correction_notice_records}`);
    lines.push(`- False material records: ${run.procurement_exception_evidence.false_material_records}`);
    lines.push(`- Malicious collusion records: ${run.procurement_exception_evidence.malicious_collusion_records}`);
    lines.push(`- Award invalidated records: ${run.procurement_exception_evidence.award_invalidated_records}`);
    lines.push(`- Rebid required records: ${run.procurement_exception_evidence.rebid_required_records}`);
    lines.push(`- Agency penalty records: ${run.procurement_exception_evidence.agency_penalty_records}`);
    lines.push(`- Exception chain queue items: ${run.procurement_exception_evidence.exception_chain_queue_item_count}`);
    lines.push(`- Review-only rate: ${run.procurement_exception_evidence.review_only_rate}%`);
  }
  lines.push('', '## Supervision Penalty And Credit Constraints');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Administrative penalty records: ${run.procurement_exception_evidence.procurement_penalty_records}`);
    lines.push(`- Credit constraint records: ${run.procurement_exception_evidence.credit_constraint_records}`);
    lines.push(`- Credit repair follow-up records: ${run.procurement_exception_evidence.credit_repair_followup_records}`);
    lines.push(`- Re-participation review records: ${run.procurement_exception_evidence.re_participation_review_records}`);
    lines.push(`- Complaint rejected records: ${run.procurement_exception_evidence.complaint_rejected_records}`);
    lines.push(`- Exception evidence weight coverage: ${run.procurement_exception_evidence.exception_weight_coverage_rate}%`);
    lines.push(`- Review-only rate: ${run.procurement_exception_evidence.review_only_rate}%`);
  }
  lines.push('', '## Procurement Complaint Adjudication Outcomes');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    lines.push(`- Complaint adjudication records: ${run.procurement_exception_evidence.procurement_complaint_adjudication_records}`);
    lines.push(`- False material allegation records: ${run.procurement_exception_evidence.false_material_allegation_records}`);
    lines.push(`- SME policy allegation records: ${run.procurement_exception_evidence.sme_policy_allegation_records}`);
    lines.push(`- Bid document defect records: ${run.procurement_exception_evidence.bid_document_defect_records}`);
    lines.push(`- Established / partly established / rejected: ${run.procurement_exception_evidence.complaint_established_records} / ${run.procurement_exception_evidence.complaint_partly_established_records} / ${run.procurement_exception_evidence.complaint_rejected_records}`);
    lines.push(`- Confirmed fact / remedy required: ${run.procurement_exception_evidence.confirmed_fact_records} / ${run.procurement_exception_evidence.remedy_required_records}`);
    lines.push(`- Allegation weight coverage: ${run.procurement_exception_evidence.allegation_weight_coverage_rate}%`);
    lines.push(`- Allegation outcome coverage: ${run.procurement_exception_evidence.allegation_outcome_coverage_rate}%`);
    lines.push(`- Complaint review-only rate: ${run.procurement_exception_evidence.complaint_review_only_rate}%`);
    lines.push(`- Complaint chain matched: ${run.procurement_exception_evidence.complaint_chain_matched_count}`);
  }
  lines.push('', '## Cross-Region And Web Research Coverage');
  for (const run of result.runs) {
    const collector = run.collector_summary || {};
    lines.push('', `### ${run.label}`);
    lines.push(`- Official web-research sources: ${numberOrZero(collector.official_web_research_source_count)}`);
    lines.push(`- Source region scopes: ${formatObject(run.source_region.scopes) || 'none'}`);
    lines.push(`- Central/cross-province/Jiangsu source counts: ${run.source_region.central_unit_source_count} / ${run.source_region.cross_province_source_count} / ${run.source_region.jiangsu_local_source_count}`);
    lines.push(`- Cross-region procurement records: ${numberOrZero(collector.cross_region_procurement_records)}`);
    lines.push(`- Hubei procurement records: ${numberOrZero(collector.hubei_procurement_records)}`);
    lines.push(`- Wrong Jiangsu attribution review count: ${run.source_region.wrong_jiangsu_attribution_review_count}`);
    lines.push(`- PDF performance records: ${numberOrZero(collector.pdf_performance_records)}`);
  }
  lines.push('', '## Rule Hit Diff');
  for (const run of result.runs) {
    lines.push('', `### ${run.label}`);
    const hits = Object.entries(run.rule_hits);
    if (!hits.length) lines.push('- No rule hits.');
    for (const [rule, count] of hits) lines.push(`- ${rule}: ${count}`);
  }
  lines.push('', '## Next Data Needed');
  lines.push('- Department budget indicators, procurement contracts, treasury payments, accounting vouchers, and rectification ledgers.');
  lines.push('- Complete source title or URL for public records with traceability warnings.');
  lines.push('- For procurement chain hits, supplement evidence by announcement, award, contract, acceptance, and payment stages.');
  return `${lines.join('\n')}\n`;
}

function formatObject(value) {
  return Object.entries(value || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

function inferredReviewStatus(source) {
  if (source.review_status) return source.review_status;
  if (source.status === 'failed') return 'parse_failed';
  return 'reviewed';
}

function html(md) {
  const escaped = md.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html>
<meta charset="utf-8">
<title>Jiangsu County Public Data PoC Rerun Summary</title>
<style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;margin:32px;line-height:1.6;color:#10243f}pre{white-space:pre-wrap;background:#f5f7fb;padding:16px;border:1px solid #d8e0ea}</style>
<pre>${escaped}</pre>`;
}

const builtRuns = runs.map(buildRun);
const result = {
  generated_at: new Date().toISOString(),
  totals: {
    baseline_records: builtRuns.reduce((total, run) => total + run.baseline_records, 0),
    accepted_records: builtRuns.reduce((total, run) => total + run.accepted_records, 0),
    baseline_passed: builtRuns.every((run) => run.baseline_passed)
  },
  runs: builtRuns
};
const outDir = path.join(root, 'data/real-integration/jiangsu-public-poc-rerun');
fs.mkdirSync(outDir, { recursive: true });
const md = markdown(result);
fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, 'summary.md'), md, 'utf8');
fs.writeFileSync(path.join(outDir, 'summary.html'), html(md), 'utf8');
console.log(`Wrote ${path.relative(root, outDir)}`);
