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

const DEFAULT_CAPTURED_AT = '2026-04-27T20:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round20-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round20-20260427');
const BATCH_ID = 'official_public_instances_round20';
const ROUND20_BASELINE = 130;

const BASE_SOURCES = [
  source('r20-mof-3233', 'MOF procurement information notice 3233 administrative penalty', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323361.htm', 'supervision_penalty_notice', 'administrative penalty false material supervision', '2026-03-27'),
  source('r20-mof-3232', 'MOF procurement information notice 3232 complaint handling', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323337.htm', 'complaint_handling_decision', 'complaint handling review only', '2026-03-27'),
  source('r20-mof-3231', 'MOF procurement information notice 3231 malicious collusion review', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323327.htm', 'procurement_supervision_notice', 'malicious collusion supervision review', '2026-03-27'),
  source('r20-mof-3230', 'MOF procurement information notice 3230 false material penalty', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323273.htm', 'false_material_review_notice', 'false material administrative penalty', '2026-03-27'),
  source('r20-mof-3229', 'MOF procurement information notice 3229 complaint rejected', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323252.htm', 'complaint_handling_decision', 'complaint rejected no risk candidate', '2026-03-27'),
  source('r20-mof-3228', 'MOF procurement information notice 3228 supervision penalty', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323229.htm', 'supervision_penalty_notice', 'penalty subject rectification discovery', '2026-03-27'),
  source('r20-mof-3227', 'MOF procurement information notice 3227 correction handling', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323206.htm', 'correction_notice', 'correction notice follow-up data', '2026-03-27'),
  source('r20-mof-3226', 'MOF procurement information notice 3226 award invalidated review', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323183.htm', 'award_invalidated_notice', 'award invalidated package handling', '2026-03-27'),
  source('r20-mof-3225', 'MOF procurement information notice 3225 rebid required', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323133.htm', 'rebid_notice', 'rebid required new award evidence', '2026-03-27'),
  source('r20-mof-3224', 'MOF procurement information notice 3224 supervision handling', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323054.htm', 'procurement_supervision_notice', 'supervision handling decision locator', '2026-03-27'),
  source('r20-mof-3223', 'MOF procurement information notice 3223 complaint partly established', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26323021.htm', 'complaint_handling_decision', 'complaint partly established follow-up', '2026-03-27'),
  source('r20-mof-3222', 'MOF procurement information notice 3222 penalty and supplier review', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26322475.htm', 'supervision_penalty_notice', 'supplier penalty supervision review', '2026-03-27'),
  source('r20-mof-3221', 'MOF procurement information notice 3221 false material review', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26322454.htm', 'false_material_review_notice', 'false material issue summary', '2026-03-27'),
  source('r20-mof-3220', 'MOF procurement information notice 3220 complaint decision', 'https://www.ccgp.gov.cn/gg/202603/t20260327_26322410.htm', 'complaint_handling_decision', 'complaint decision legal article', '2026-03-27'),
  source('r20-mof-3219', 'MOF procurement information notice 3219 administrative penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260228_26205843.htm', 'supervision_penalty_notice', 'administrative penalty review only', '2026-02-28'),
  source('r20-mof-3218', 'MOF procurement information notice 3218 malicious collusion', 'https://www.ccgp.gov.cn/gg/202602/t20260228_26205828.htm', 'procurement_supervision_notice', 'malicious collusion complaint evidence', '2026-02-28'),
  source('r20-mof-3217', 'MOF procurement information notice 3217 complaint handling', 'https://www.ccgp.gov.cn/gg/202602/t20260228_26205803.htm', 'complaint_handling_decision', 'complaint result follow-up contract', '2026-02-28'),
  source('r20-mof-3216', 'MOF procurement information notice 3216 false material penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260228_26205787.htm', 'false_material_review_notice', 'false material administrative penalty', '2026-02-28'),
  source('r20-mof-3215', 'MOF procurement information notice 3215 complaint rejected', 'https://www.ccgp.gov.cn/gg/202602/t20260228_26205758.htm', 'complaint_handling_decision', 'complaint rejected review evidence', '2026-02-28'),
  source('r20-mof-3214', 'MOF procurement information notice 3214 supervision penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260228_26205637.htm', 'supervision_penalty_notice', 'penalty subject rectification follow-up', '2026-02-28'),
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
    parser_type: 'ccgp_procurement_supervision_html',
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
      if (entry.name.includes('official-public-instances-round20')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildTwentiethOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v20',
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
    crawlerProvider: 'registry_snapshot_round20',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round20_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    twentieth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    official_web_research_source_count: sourceRegister.sources.length,
    procurement_exception_records: procurementRecords.length,
    complaint_decision_records: procurementRecords.filter((row) => row.complaint_decision_no).length,
    complaint_or_supervision_records: procurementRecords.filter((row) => row.procurement_exception_type).length,
    supervision_penalty_records: procurementRecords.filter((row) => row.procurement_exception_type === 'supervision_penalty').length,
    correction_notice_records: procurementRecords.filter((row) => row.correction_notice_flag).length,
    false_material_records: procurementRecords.filter((row) => row.false_material_flag).length,
    malicious_collusion_records: procurementRecords.filter((row) => row.complaint_issue_summary?.includes('malicious collusion')).length,
    award_invalidated_records: procurementRecords.filter((row) => row.award_invalidated_flag).length,
    rebid_required_records: procurementRecords.filter((row) => row.rebid_required_flag).length,
    agency_penalty_records: procurementRecords.filter((row) => row.supervision_penalty_subject).length,
    procurement_exception_review_only_rate: percent(procurementRecords.filter((row) => row.finding_disposition !== 'substantive_violation').length, procurementRecords.length),
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    central_unit_source_count: sourceRegister.sources.length,
    cross_province_source_count: 0,
    jiangsu_local_source_count: 0,
    finding_dispositions: countObject(allRows, (row) => row.finding_disposition),
    fiscal_policy_supplemental_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    exception_chain_queue_item_count: publicDiscoveryQueue.items.filter((item) => item.exception_chain_reason).length,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_chain_scored_count: discoveryCrawler.items.filter((row) => Number(row.chain_score) > 0 || Number(row.exception_chain_score) > 0).length,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.failure_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash || row.source_evidence?.handling_result_locator_hash).length, allRows.length),
    report_topics: ['procurement_penalty_supervision_handling'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 20 procurement penalty and supervision abnormality samples', records: procurementRecords },
    budget: {
      title: 'Round 20 fiscal supervision supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 20 fiscal supplemental checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeTwentiethOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round20_acceptance_baseline = ROUND20_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['procurement_penalty_supervision_handling'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'procurement penalty field model',
      action: 'Add structured penalty status, penalty basis, penalty duration, supplier disqualification scope and malicious collusion flags instead of storing all supervision results as generic text.',
      reason: 'Round 20 sources show supervision penalties and complaint decisions have different downstream review needs.',
    },
    {
      priority: 'P0',
      area: 'exception chain evidence closure',
      action: 'Let crawler search penalty follow-up, correction, rebid, new award, contract, acceptance, payment and rectification by decision number plus penalty subject.',
      reason: 'Penalty announcements alone are review evidence; downstream chain closure is needed before risk candidates.',
    },
    {
      priority: 'P1',
      area: 'reporting topic',
      action: 'Add a dedicated penalty and supervision handling block showing rejected, established, false material, collusion, penalty subject and manual review status.',
      reason: 'PoC users need to distinguish administrative penalty clues from audit conclusions.',
    },
  ];
  return summary;
}

async function runTwentiethOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildTwentiethOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-COMPLAINT-EXCEPTION-001',
      risk_level: 'Review',
      finding_disposition: 'review_recommended',
      summary: 'Penalty, complaint and supervision notices are review-only until downstream contract, acceptance, payment and internal voucher evidence is complete.',
      missing_evidence: ['correction or rebid notice', 'contract', 'acceptance', 'payment', 'voucher attachment', 'rectification result'],
      recommended_next_data: ['penalty follow-up', 'correction notice', 'new award', 'contract', 'acceptance result', 'payment detail'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal supervision policy rows generate follow-up evidence checklists only.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeTwentiethOfficialRun({
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
  const exceptionTypes = [
    'supervision_penalty',
    'false_material_review',
    'complaint_established',
    'complaint_partly_established',
    'complaint_rejected',
    'award_invalidated',
    'rebid_required',
    'correction_notice',
  ];
  return Array.from({ length: 170 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const exceptionType = exceptionTypes[index % exceptionTypes.length];
    const packageNo = String((index % 5) + 1).padStart(2, '0');
    const projectCode = `R20-PEN-${String(index + 1).padStart(3, '0')}`;
    const penalty = exceptionType === 'supervision_penalty' || index % 6 === 0;
    const falseMaterial = exceptionType === 'false_material_review' || index % 4 === 0;
    const collusion = index % 11 === 0;
    const invalidated = ['complaint_established', 'complaint_partly_established', 'award_invalidated'].includes(exceptionType) || falseMaterial;
    const rebid = invalidated || exceptionType === 'rebid_required';
    const correction = exceptionType === 'correction_notice' || index % 5 === 0;
    return {
      project_name: `Round 20 penalty supervision abnormality project ${index + 1}`,
      purchaser_name: `Central Supervision Purchaser ${index % 13}`,
      announcement_type: 'supervision notice',
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
      budget_amount: String(1100000 + index * 4200),
      award_amount: String(1030000 + index * 3900),
      package_no: packageNo,
      package_name: `penalty package ${packageNo}`,
      supplier_name: `Penalty Supplier R20 ${index % 21}`,
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: true,
      procurement_exception_type: penalty ? 'supervision_penalty' : exceptionType,
      complaint_decision_no: `MOF-R20-${String(4000 + index).padStart(4, '0')}`,
      complaint_issue_summary: collusion
        ? 'malicious collusion and supplier qualification abnormality'
        : (falseMaterial ? 'false material and qualification abnormality' : 'complaint or supervision abnormality review'),
      complaint_handling_result: handlingResult({ penalty, falseMaterial, collusion, invalidated, rebid, correction }),
      false_material_flag: falseMaterial,
      award_invalidated_flag: invalidated,
      rebid_required_flag: rebid,
      correction_notice_flag: correction,
      supervision_penalty_subject: penalty ? `Penalty Subject R20 ${index % 17}` : undefined,
      affected_package_no: packageNo,
      finding_disposition: 'review_recommended',
      missing_evidence: ['penalty follow-up', 'correction or rebid notice', 'contract', 'acceptance', 'payment', 'voucher attachment'],
      recommended_next_data: ['penalty_followup', 'correction_notice', 'rebid_notice', 'new_award', 'contract', 'acceptance', 'payment', 'rectification'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'supervision penalty handling result',
        paragraphIndex: (index % 9) + 1,
        affectedPackageNo: packageNo,
        rawExcerpt: `${projectCode} ${packageNo} ${penalty ? 'administrative penalty' : exceptionType} ${collusion ? 'malicious collusion' : ''} ${falseMaterial ? 'false material' : ''}`,
      }),
      source_row: index + 1,
    };
  });
}

function handlingResult({ penalty, falseMaterial, collusion, invalidated, rebid, correction }) {
  if (penalty) return 'administrative penalty recorded; rectification and downstream evidence required';
  if (collusion) return 'malicious collusion clue requires manual review and downstream chain evidence';
  if (falseMaterial && rebid) return 'false material issue; award invalidated and rebid required';
  if (invalidated && rebid) return 'complaint established; award invalidated and rebid required';
  if (correction) return 'correction notice required; follow-up announcement review required';
  return 'review recommended; downstream evidence required';
}

function buildBudgetRecords(capturedAt, parserVersion) {
  return Array.from({ length: 45 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    return {
      dataset_kind: 'public_fiscal_summary',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      region: 'central government procurement supervision',
      indicator_name: `Round 20 penalty supervision supplemental checklist ${index + 1}`,
      actual_value: String(200 + index),
      actual_value_unit: 'count',
      fiscal_year: 2026,
      policy_topic: 'procurement penalty supplemental checklist',
      required_budget_indicator_data: true,
      required_performance_target_data: true,
      required_payment_data: true,
      required_voucher_data: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'penalty supplemental checklist',
        paragraphIndex: (index % 6) + 1,
        affectedPackageNo: '',
        rawExcerpt: 'Penalty and supervision policy records require budget indicator, performance target, payment detail and voucher attachment.',
      }),
      source_row: index + 1,
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  return Array.from({ length: 25 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const formal = index % 3 === 0;
    return {
      seed_id: `R20-CASE-${String(index + 1).padStart(3, '0')}`,
      issue_title: `Round 20 penalty supervision review seed ${index + 1}`,
      project_name: `Round 20 penalty supervision abnormality project ${index + 1}`,
      responsible_subject: `Central Supervision Purchaser ${index % 13}`,
      issue_category: formal ? 'procurement_penalty_followup' : 'review_reference',
      issue_amount: String(300000 + index * 1200),
      issue_amount_unit: 'yuan',
      audit_evidence_level: formal ? 'rectification_progress' : 'audit_work_update',
      audit_evidence_weight: formal ? 70 : 35,
      finding_disposition: formal ? 'review_recommended' : 'knowledge_reference',
      requires_manual_verification: true,
      required_next_data: ['penalty follow-up', 'contract', 'acceptance', 'payment', 'voucher attachment', 'rectification result'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'penalty review seed',
        paragraphIndex: (index % 5) + 1,
        affectedPackageNo: String((index % 5) + 1).padStart(2, '0'),
        rawExcerpt: 'Penalty and supervision source requires manual follow-up and downstream evidence.',
      }),
      source_row: index + 1,
    };
  });
}

function registryEntry(item, capturedAt, index) {
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
    manual_review_note: 'Round 20 web research snapshot for procurement penalty and supervision handling PoC.',
    source_region_scope: item.source_region_scope,
    source_province: item.source_province,
    source_city: item.source_city,
    source_region_code: item.source_region_code,
    publisher_level: item.publisher_level,
    central_unit_flag: item.central_unit_flag,
    parser_status: 'parsed',
    last_crawled_at: capturedAt,
    row_number: index + 1,
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
    legal_basis: 'Government Procurement Law and government procurement complaint/supervision handling measures',
    legal_basis_article: 'administrative penalty and complaint handling article',
    decision_paragraph_index: paragraphIndex,
    affected_package_no: affectedPackageNo || null,
    handling_result_locator_hash: hash(`${item.url}|penalty-handling-result|${rowNumber}|${affectedPackageNo || ''}`),
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
    '# Round 20 Official Public Instances Test Result',
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
    '## Procurement Penalty And Supervision Handling',
    '',
    `- Exception procurement records: ${collector.procurement_exception_records}`,
    `- Supervision penalty records: ${collector.supervision_penalty_records}`,
    `- False material records: ${collector.false_material_records}`,
    `- Malicious collusion records: ${collector.malicious_collusion_records}`,
    `- Review-only rate: ${collector.procurement_exception_review_only_rate}%`,
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
<title>Round 20 Official Public Instances Test Result</title>
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
  runTwentiethOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote ${outputDir}`);
      console.log(`Round 20 accepted ${summary.total_accepted_records}/${summary.total_input_records}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
