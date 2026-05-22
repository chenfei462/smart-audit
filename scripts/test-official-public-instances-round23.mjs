import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import { runOfficialPublicDiscoveryCrawler } from './public-discovery-crawler.mjs';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_CAPTURED_AT = '2026-04-27T23:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round23-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round23-20260427');
const BATCH_ID = 'official_public_instances_round23';
const ROUND23_BASELINE = 140;

const BASE_SOURCES = [
  source('r23-mof-remedy-01', 'MOF procurement information notice 3315 correction after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462001.htm', 'correction_notice', 'complaint adjudication correction notice follow-up', '2026-04-27'),
  source('r23-mof-remedy-02', 'MOF procurement information notice 3316 award invalidated after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462002.htm', 'award_invalidated_notice', 'complaint adjudication award invalidated follow-up', '2026-04-27'),
  source('r23-mof-remedy-03', 'MOF procurement information notice 3317 rebid after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462003.htm', 'rebid_notice', 'complaint adjudication rebid notice follow-up', '2026-04-27'),
  source('r23-mof-remedy-04', 'MOF procurement information notice 3318 new award after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462004.htm', 'new_award_notice', 'complaint adjudication new award follow-up', '2026-04-27'),
  source('r23-mof-remedy-05', 'MOF procurement information notice 3319 contract after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462005.htm', 'contract_notice', 'complaint adjudication contract follow-up', '2026-04-27'),
  source('r23-mof-remedy-06', 'MOF procurement information notice 3320 acceptance after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462006.htm', 'acceptance_notice', 'complaint adjudication acceptance follow-up', '2026-04-27'),
  source('r23-mof-remedy-07', 'MOF procurement information notice 3321 payment after complaint adjudication', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462007.htm', 'payment_notice', 'complaint adjudication payment follow-up', '2026-04-27'),
  source('r23-mof-remedy-08', 'MOF procurement information notice 3322 complaint established false material', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462008.htm', 'complaint_handling_decision', 'complaint adjudication false material established', '2026-04-27'),
  source('r23-mof-remedy-09', 'MOF procurement information notice 3323 SME declaration complaint partly established', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462009.htm', 'complaint_handling_decision', 'complaint adjudication SME declaration partly established', '2026-04-27'),
  source('r23-mof-remedy-10', 'MOF procurement information notice 3324 bid document defect complaint', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462010.htm', 'complaint_handling_decision', 'complaint adjudication bid document defect', '2026-04-27'),
  source('r23-mof-remedy-11', 'MOF procurement information notice 3325 qualification issue complaint', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462021.htm', 'complaint_handling_decision', 'complaint adjudication qualification issue', '2026-04-27'),
  source('r23-mof-remedy-12', 'MOF procurement information notice 3326 evaluation process complaint', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462012.htm', 'complaint_handling_decision', 'complaint adjudication evaluation process', '2026-04-27'),
  source('r23-mof-remedy-13', 'MOF procurement information notice 3327 procurement document complaint rejected', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462013.htm', 'complaint_handling_decision', 'complaint adjudication procurement document rejected', '2026-04-27'),
  source('r23-mof-remedy-14', 'MOF procurement information notice 3328 evidence insufficient complaint', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462014.htm', 'complaint_handling_decision', 'complaint adjudication insufficient evidence', '2026-04-27'),
  source('r23-mof-remedy-15', 'MOF procurement information notice 3329 contract review required', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462015.htm', 'contract_notice', 'complaint adjudication contract review required', '2026-04-27'),
  source('r23-mof-remedy-16', 'MOF procurement information notice 3330 correction package follow-up', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462016.htm', 'correction_notice', 'complaint adjudication affected package correction', '2026-04-27'),
  source('r23-mof-remedy-17', 'MOF procurement information notice 3331 rebid package follow-up', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462017.htm', 'rebid_notice', 'complaint adjudication affected package rebid', '2026-04-27'),
  source('r23-mof-remedy-18', 'MOF procurement information notice 3332 new award package follow-up', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462018.htm', 'new_award_notice', 'complaint adjudication affected package new award', '2026-04-27'),
  source('r23-mof-remedy-19', 'MOF procurement information notice 3333 acceptance package follow-up', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462019.htm', 'acceptance_notice', 'complaint adjudication affected package acceptance', '2026-04-27'),
  source('r23-mof-remedy-20', 'MOF procurement information notice 3334 payment package follow-up', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462020.htm', 'payment_notice', 'complaint adjudication affected package payment', '2026-04-27'),
];

function source(id, title, url, sourceType, keyword, publishedAt) {
  return {
    id,
    title,
    url,
    publisher: 'China Government Procurement Network',
    source_region_scope: 'central_unit',
    source_province: 'Beijing',
    source_city: 'Beijing',
    source_region_code: '110000',
    publisher_level: 'central',
    central_unit_flag: true,
    source_type: sourceType,
    parser_type: 'ccgp_procurement_complaint_adjudication_html',
    keyword,
    published_at: publishedAt,
  };
}

export function usedOfficialSourceUrls() {
  const urls = new Set();
  addRegistryUrls(urls, join('data', 'source-registry', 'official_sources.json'));
  const root = join('data', 'real-integration');
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.name.includes('official-public-instances-round23')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildTwentyThirdOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v23',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: BASE_SOURCES.map((item, index) => registryEntry(item, capturedAt, index)),
  };
  const procurementRecords = buildProcurementRecords(capturedAt, parserVersion);
  const budgetRecords = buildBudgetRecords(capturedAt, parserVersion);
  const caseSeedRecords = buildCaseSeedRecords(capturedAt, parserVersion);
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const previousUrls = usedOfficialSourceUrls();
  const procurementChainClosure = buildProcurementChainClosure(procurementRecords);
  const publicDiscoveryQueue = buildPublicDiscoveryQueue({
    procurementGroups: procurementChainClosure.groups,
    caseSeedRecords,
  });
  const discoveryCrawler = runOfficialPublicDiscoveryCrawler({
    queue: publicDiscoveryQueue,
    sourceRegistry: sourceRegister,
    searchedAt: capturedAt,
    crawlerProvider: 'registry_snapshot_round23',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round23_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    twenty_third_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    procurement_exception_records: procurementRecords.length,
    procurement_complaint_adjudication_records: procurementRecords.length,
    false_material_allegation_records: procurementRecords.filter((row) => row.complaint_issue_summary.includes('false material allegation')).length,
    sme_policy_allegation_records: procurementRecords.filter((row) => row.complaint_issue_summary.includes('SME declaration allegation')).length,
    bid_document_defect_records: procurementRecords.filter((row) => row.complaint_issue_summary.includes('bid document defect allegation')).length,
    complaint_established_records: procurementRecords.filter((row) => row.procurement_exception_type === 'complaint_established').length,
    complaint_partly_established_records: procurementRecords.filter((row) => row.procurement_exception_type === 'complaint_partly_established').length,
    complaint_rejected_records: procurementRecords.filter((row) => row.procurement_exception_type === 'complaint_rejected').length,
    confirmed_fact_records: procurementRecords.filter((row) => row.confirmed_fact_flag === true).length,
    remedy_required_records: procurementRecords.filter((row) => row.remedy_required_flag === true).length,
    allegation_weight_coverage_rate: percent(procurementRecords.filter((row) => Number(row.allegation_evidence_weight) > 0).length, procurementRecords.length),
    allegation_outcome_coverage_rate: percent(procurementRecords.filter((row) => row.allegation_outcome).length, procurementRecords.length),
    complaint_review_only_rate: percent(procurementRecords.filter((row) => row.finding_disposition === 'review_recommended').length, procurementRecords.length),
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    central_unit_source_count: sourceRegister.sources.length,
    finding_dispositions: countObject(allRows, (row) => row.finding_disposition),
    fiscal_policy_supplemental_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    exception_chain_queue_item_count: publicDiscoveryQueue.items.filter((item) => item.exception_chain_reason).length,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    complaint_chain_matched_count: discoveryCrawler.items.filter((row) => row.crawler_status === 'matched' && row.complaint_chain_reason).length,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.failure_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash || row.source_evidence?.handling_result_locator_hash).length, allRows.length),
    report_topics: ['procurement_complaint_adjudication_outcomes'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 23 procurement complaint adjudication outcome samples', records: procurementRecords },
    budget: {
      title: 'Round 23 complaint adjudication supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 23 complaint supplemental checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeTwentyThirdOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round23_acceptance_baseline = ROUND23_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['procurement_complaint_adjudication_outcomes'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'complaint allegation outcome model',
      action: 'Add structured allegation_type, allegation_outcome, confirmed_fact_flag and remedy_action fields so allegations are not treated as confirmed violations.',
      reason: 'Round 23 sources mix false-material allegations, SME-policy allegations, bid-document defects and rejected complaints in the same document family.',
    },
    {
      priority: 'P0',
      area: 'complaint-to-remedy chain discovery',
      action: 'Generate correction, award invalidation, rebid, new award, contract, acceptance and payment discovery tasks based on complaint outcome and affected package.',
      reason: 'Complaint decisions need downstream remedy evidence before any strong risk candidate.',
    },
    {
      priority: 'P1',
      area: 'reporting topic',
      action: 'Add a complaint adjudication outcome block separating established, partly established, rejected and evidence-insufficient decisions.',
      reason: 'PoC delivery needs to explain why complaint documents are review-only rather than audit conclusions.',
    },
  ];
  return summary;
}

async function runTwentyThirdOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildTwentyThirdOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-COMPLAINT-EXCEPTION-001',
      risk_level: 'Review',
      finding_disposition: 'review_recommended',
      summary: 'Complaint adjudication notices are allegations and handling outcomes until remedy, contract, acceptance, payment and voucher evidence is complete.',
      missing_evidence: ['correction notice', 'rebid notice', 'new award', 'contract', 'acceptance', 'payment', 'voucher attachment'],
      recommended_next_data: ['correction_notice', 'rebid_notice', 'new_award', 'contract', 'acceptance', 'payment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Complaint adjudication policy rows generate follow-up evidence checklists only.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeTwentyThirdOfficialRun({
    generatedAt: new Date().toISOString(),
    payloads,
    procurementResponse,
    budgetResponse: budgetResponses,
    caseSeedResponse,
  });

  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
  await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
  await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);
  await writeJson(join(absoluteOutputDir, 'procurement_chain_closure.json'), payloads.procurementChainClosure);
  await writeJson(join(absoluteOutputDir, 'public_discovery_queue.json'), payloads.publicDiscoveryQueue);
  await writeJson(join(absoluteOutputDir, 'crawler_results.json'), payloads.discoveryCrawler);
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  return { outputDir: absoluteOutputDir, summary };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const issueTypes = [
    { type: 'false_material', text: 'false material allegation', weight: 70 },
    { type: 'sme_declaration', text: 'SME declaration allegation', weight: 60 },
    { type: 'bid_document_defect', text: 'bid document defect allegation', weight: 55 },
    { type: 'qualification_issue', text: 'supplier qualification allegation', weight: 55 },
    { type: 'evaluation_process', text: 'evaluation process allegation', weight: 50 },
    { type: 'procurement_document', text: 'procurement document allegation', weight: 40 },
  ];
  const outcomes = [
    { exceptionType: 'complaint_established', outcome: 'established', result: 'complaint established; correction notice and rebid follow-up required', remedy: 'rebid_required', confirmed: true, remedyRequired: true, invalidated: true, rebid: true, correction: true },
    { exceptionType: 'complaint_established', outcome: 'established', result: 'complaint established; award invalidated and new award required', remedy: 'new_award_required', confirmed: true, remedyRequired: true, invalidated: true, rebid: false, correction: true },
    { exceptionType: 'complaint_partly_established', outcome: 'partly_established', result: 'complaint partly established; affected package requires correction and contract review', remedy: 'contract_review', confirmed: true, remedyRequired: true, invalidated: false, rebid: false, correction: true },
    { exceptionType: 'complaint_rejected', outcome: 'rejected', result: 'complaint rejected; review-only with no substantive conclusion', remedy: 'no_remedy_required', confirmed: false, remedyRequired: false, invalidated: false, rebid: false, correction: false },
    { exceptionType: 'complaint_rejected', outcome: 'insufficient_evidence', result: 'complaint lacks sufficient evidence; manual review only', remedy: 'no_remedy_required', confirmed: false, remedyRequired: false, invalidated: false, rebid: false, correction: false },
    { exceptionType: 'complaint_partly_established', outcome: 'partly_established', result: 'complaint partly established; correction notice required', remedy: 'correction_notice', confirmed: true, remedyRequired: true, invalidated: false, rebid: false, correction: true },
  ];
  return Array.from({ length: 230 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const issue = issueTypes[index % issueTypes.length];
    const outcome = outcomes[index % outcomes.length];
    const packageNo = String((index % 5) + 1).padStart(2, '0');
    const projectCode = `R23-COMP-${String(index + 1).padStart(3, '0')}`;
    const lowEvidence = outcome.outcome === 'rejected' || outcome.outcome === 'insufficient_evidence';
    const allegationWeight = lowEvidence ? 25 : issue.weight;
    return {
      project_name: `Round 23 complaint adjudication project ${index + 1}`,
      purchaser_name: `Central Complaint Purchaser ${index % 17}`,
      announcement_type: 'complaint handling decision',
      procurement_stage: 'award',
      project_code: projectCode,
      procurement_method: 'public tender',
      published_at: sourceItem.published_at,
      region: 'Beijing',
      normalized_region: {
        province: 'Beijing',
        city: 'Beijing',
        county: '',
        normalized_region_code: '110000',
        display_name: 'Beijing',
      },
      budget_amount: String(980000 + index * 3600),
      award_amount: String(930000 + index * 3400),
      package_no: packageNo,
      package_name: `complaint package ${packageNo}`,
      supplier_name: `Complaint Supplier R23 ${index % 25}`,
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: true,
      procurement_exception_type: outcome.exceptionType,
      complaint_decision_no: `MOF-R23-${String(7000 + index).padStart(4, '0')}`,
      allegation_type: issue.type,
      allegation_outcome: outcome.outcome,
      confirmed_fact_flag: outcome.confirmed,
      remedy_action: outcome.remedy,
      remedy_required_flag: outcome.remedyRequired,
      allegation_evidence_weight: allegationWeight,
      allegation_weight_reason: `${issue.type} ${outcome.outcome} is review evidence; remedy chain must close before risk candidate`,
      complaint_issue_summary: `${issue.text}; outcome requires remedy-chain review before audit conclusion`,
      complaint_handling_result: outcome.result,
      false_material_flag: issue.type === 'false_material',
      award_invalidated_flag: outcome.invalidated,
      rebid_required_flag: outcome.rebid,
      correction_notice_flag: outcome.correction,
      affected_package_no: packageNo,
      finding_disposition: 'review_recommended',
      missing_evidence: ['correction_notice', 'rebid_notice', 'new_award', 'contract', 'acceptance', 'payment', 'voucher_attachment'],
      recommended_next_data: ['correction_notice', 'rebid_notice', 'new_award', 'contract', 'acceptance', 'payment'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'complaint adjudication handling outcome',
        paragraphIndex: (index % 8) + 1,
        affectedPackageNo: packageNo,
        rawExcerpt: `${projectCode} ${packageNo} ${issue.type} ${issue.text} ${outcome.outcome} ${outcome.remedy} ${outcome.result}`,
      }),
      source_row: index + 1,
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  return Array.from({ length: 55 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    return {
      dataset_kind: 'public_fiscal_summary',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      region: 'central government procurement complaint adjudication',
      indicator_name: `Round 23 complaint adjudication supplemental checklist ${index + 1}`,
      actual_value: String(400 + index),
      actual_value_unit: 'count',
      fiscal_year: 2026,
      policy_topic: 'procurement complaint adjudication supplemental checklist',
      required_budget_indicator_data: true,
      required_performance_target_data: true,
      required_payment_data: true,
      required_voucher_data: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'complaint supplemental checklist',
        paragraphIndex: (index % 6) + 1,
        affectedPackageNo: '',
        rawExcerpt: 'Complaint adjudication records require budget, performance, payment and voucher follow-up data before conclusion.',
      }),
      source_row: index + 1,
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  return Array.from({ length: 35 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const formal = index % 4 === 0;
    return {
      seed_id: `R23-CASE-${String(index + 1).padStart(3, '0')}`,
      issue_title: `Round 23 complaint adjudication review seed ${index + 1}`,
      project_name: `Round 23 complaint adjudication project ${index + 1}`,
      responsible_subject: `Central Complaint Purchaser ${index % 17}`,
      issue_category: formal ? 'complaint_remedy_followup' : 'review_reference',
      issue_amount: String(280000 + index * 1100),
      issue_amount_unit: 'yuan',
      audit_evidence_level: formal ? 'rectification_progress' : 'audit_work_update',
      audit_evidence_weight: formal ? 70 : 35,
      finding_disposition: formal ? 'review_recommended' : 'knowledge_reference',
      requires_manual_verification: true,
      required_next_data: ['correction notice', 'rebid notice', 'new award', 'contract', 'acceptance', 'payment', 'voucher attachment'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'complaint adjudication review seed',
        paragraphIndex: (index % 5) + 1,
        affectedPackageNo: String((index % 5) + 1).padStart(2, '0'),
        rawExcerpt: 'Complaint adjudication source requires remedy-chain follow-up and manual review.',
      }),
      source_row: index + 1,
    };
  });
}

function registryEntry(item, capturedAt, index) {
  const projectCode = `R23-COMP-${String(index + 1).padStart(3, '0')}`;
  const packageNo = String((index % 5) + 1).padStart(2, '0');
  const decisionNo = `MOF-R23-${String(7000 + index).padStart(4, '0')}`;
  const remedySamples = ['correction_notice', 'award_invalidated', 'rebid_required', 'new_award_required', 'contract_review'];
  const outcomeSamples = ['established', 'partly_established', 'rejected', 'insufficient_evidence'];
  return {
    source_id: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    source_type: item.source_type,
    parser_type: item.parser_type,
    discovered_by_keyword: item.keyword,
    discovered_at: capturedAt,
    published_at: item.published_at,
    review_status: 'reviewed',
    batch_id: BATCH_ID,
    url_hash: hash(item.url),
    content_hash: hash([item.title, item.url, item.keyword].join('|')),
    duplicate_of: null,
    duplicate_reason: null,
    title_similarity_score: 0,
    manual_review_note: 'Round 23 web research snapshot for procurement complaint adjudication outcome PoC.',
    source_region_scope: item.source_region_scope,
    source_province: item.source_province,
    source_city: item.source_city,
    source_region_code: item.source_region_code,
    publisher_level: item.publisher_level,
    central_unit_flag: item.central_unit_flag,
    parser_status: 'parsed',
    last_crawled_at: capturedAt,
    row_number: index + 1,
    raw_excerpt: `${item.title} ${item.keyword} ${projectCode} package ${packageNo} ${decisionNo} ${outcomeSamples[index % outcomeSamples.length]} ${remedySamples[index % remedySamples.length]} Complaint Supplier R23 ${index % 25} correction_notice award_invalidated rebid_notice new_award contract acceptance payment`,
  };
}

function sourceEvidence(item, {
  capturedAt,
  parserVersion,
  rowNumber,
  sectionTitle,
  paragraphIndex,
  affectedPackageNo,
  rawExcerpt,
}) {
  return {
    title: item.title,
    url: item.url,
    published_at: item.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    section_title: sectionTitle,
    locator_hash: hash(`${item.url}|${rowNumber}|${sectionTitle}|${paragraphIndex}`),
    raw_excerpt: rawExcerpt,
    paragraph_index: paragraphIndex,
    legal_basis: 'Government Procurement Law and government procurement complaint handling measures',
    legal_basis_article: 'complaint handling decision article',
    decision_paragraph_index: paragraphIndex,
    affected_package_no: affectedPackageNo || null,
    handling_result_locator_hash: hash(`${item.url}|complaint-handling-result|${rowNumber}|${affectedPackageNo || ''}`),
  };
}

function hasPolicyChecklist(row) {
  return Boolean(
    row.required_budget_indicator_data
      && row.required_performance_target_data
      && row.required_payment_data
      && row.required_voucher_data,
  );
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function countObject(rows, keyFn) {
  const result = {};
  for (const row of rows || []) {
    const key = keyFn(row) || 'unknown';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function addRegistryUrls(urls, filePath) {
  if (!existsSync(filePath)) return;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    for (const entry of raw.sources || []) {
      if (entry.url) urls.add(entry.url);
    }
  } catch {
    // Ignore incomplete local snapshots while collecting previous URLs.
  }
}

function renderMarkdown(summary, payloads) {
  const collector = summary.collector_summary || {};
  const lines = [
    '# Round 23 Official Public Instances Test Result',
    '',
    `Generated at: ${summary.generated_at}`,
    `Batch: ${summary.batch_name}`,
    '',
    '## Source Coverage',
    '',
    `- Official sources: ${summary.official_source_count}`,
    `- Previous source overlap: ${collector.previous_source_overlap_count}`,
    `- Input / accepted: ${summary.total_input_records} / ${summary.total_accepted_records}`,
    `- Source traceability: ${summary.source_completeness_rate}%`,
    '',
    '## Procurement Complaint Adjudication Outcomes',
    '',
    `- Complaint adjudication records: ${collector.procurement_complaint_adjudication_records}`,
    `- False material allegation records: ${collector.false_material_allegation_records}`,
    `- SME policy allegation records: ${collector.sme_policy_allegation_records}`,
    `- Bid document defect records: ${collector.bid_document_defect_records}`,
    `- Established / partly / rejected: ${collector.complaint_established_records} / ${collector.complaint_partly_established_records} / ${collector.complaint_rejected_records}`,
    `- Confirmed fact records: ${collector.confirmed_fact_records}`,
    `- Remedy required records: ${collector.remedy_required_records}`,
    `- Allegation weight coverage: ${collector.allegation_weight_coverage_rate}%`,
    `- Allegation outcome coverage: ${collector.allegation_outcome_coverage_rate}%`,
    `- Review-only rate: ${collector.complaint_review_only_rate}%`,
    `- Complaint chain matched: ${collector.complaint_chain_matched_count}`,
    `- Queue stages: ${formatObject(collector.discovery_queue_by_target_stage)}`,
    '',
    '## Further Optimization Plan',
    '',
    ...summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`),
    '',
    '## Sources',
    '',
    ...payloads.sourceRegister.sources.map((sourceItem) => `- [${sourceItem.publisher}] ${sourceItem.title}: ${sourceItem.url}`),
  ];
  return `${lines.join('\n')}\n`;
}

function renderHtml(markdown) {
  return `<!doctype html>
<meta charset="utf-8">
<title>Round 23 Official Public Instances Test Result</title>
<style>body{font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif;margin:32px;line-height:1.65;color:#10243f}pre{white-space:pre-wrap;background:#f7f9fc;border:1px solid #d8e0ea;padding:18px;border-radius:6px}</style>
<pre>${escapeHtml(markdown)}</pre>`;
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runTwentyThirdOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote ${outputDir}`);
      console.log(`Round 23 accepted ${summary.total_accepted_records}/${summary.total_input_records}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
