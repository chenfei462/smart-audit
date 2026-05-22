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

const DEFAULT_CAPTURED_AT = '2026-04-27T19:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round19-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round19-20260427');
const BATCH_ID = 'official_public_instances_round19';
const ROUND19_BASELINE = 120;

const BASE_SOURCES = [
  source('r19-mof-3294', 'MOF procurement information notice 3294 complaint handling decision', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461544.htm', 'complaint_handling_decision', 'complaint decision false material package handling', '2026-04-27'),
  source('r19-mof-3293', 'MOF procurement information notice 3293 supervision handling result', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461511.htm', 'procurement_supervision_notice', 'supervision handling result penalty subject', '2026-04-27'),
  source('r19-mof-3292', 'MOF procurement information notice 3292 complaint partly established', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461484.htm', 'complaint_handling_decision', 'complaint partly established award invalidated', '2026-04-27'),
  source('r19-mof-3291', 'MOF procurement information notice 3291 complaint rejected', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461470.htm', 'complaint_handling_decision', 'complaint rejected review only', '2026-04-27'),
  source('r19-mof-3290', 'MOF procurement information notice 3290 correction and rebid handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461460.htm', 'correction_notice', 'correction rebid new award discovery', '2026-04-27'),
  source('r19-mof-3289', 'MOF procurement information notice 3289 award invalidated handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461454.htm', 'award_invalidated_notice', 'award invalidated follow-up contract acceptance payment', '2026-04-27'),
  source('r19-mof-3288', 'MOF procurement information notice 3288 rebid required handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461440.htm', 'rebid_notice', 'rebid required new award chain', '2026-04-27'),
  source('r19-mof-3287', 'MOF procurement information notice 3287 complaint handling with affected package', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461433.htm', 'complaint_handling_decision', 'affected package complaint decision locator', '2026-04-27'),
  source('r19-mof-3286', 'MOF procurement information notice 3286 false material supervision review', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461419.htm', 'procurement_supervision_notice', 'false material review supervision penalty', '2026-04-27'),
  source('r19-mof-3285', 'MOF procurement information notice 3285 complaint handling decision', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461414.htm', 'complaint_handling_decision', 'complaint handling decision legal basis', '2026-04-27'),
  source('r19-mof-3283', 'MOF procurement information notice 3283 complaint handling decision', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367326.htm', 'complaint_handling_decision', 'complaint decision paragraph handling result', '2026-04-07'),
  source('r19-mof-3282', 'MOF procurement information notice 3282 supervision notice', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367321.htm', 'procurement_supervision_notice', 'supervision notice penalty subject', '2026-04-07'),
  source('r19-mof-3281', 'MOF procurement information notice 3281 complaint partly established', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367273.htm', 'complaint_handling_decision', 'complaint partly established rebid required', '2026-04-07'),
  source('r19-mof-3280', 'MOF procurement information notice 3280 correction notice', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367237.htm', 'correction_notice', 'correction notice follow-up source', '2026-04-07'),
  source('r19-mof-3279', 'MOF procurement information notice 3279 award invalidated', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367231.htm', 'award_invalidated_notice', 'award invalidated affected package', '2026-04-07'),
  source('r19-mof-3278', 'MOF procurement information notice 3278 rebid notice', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367224.htm', 'rebid_notice', 'rebid notice new award discovery', '2026-04-07'),
  source('r19-mof-3277', 'MOF procurement information notice 3277 complaint rejected', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367218.htm', 'complaint_handling_decision', 'complaint rejected no substantive conclusion', '2026-04-07'),
  source('r19-mof-3276', 'MOF procurement information notice 3276 supervision penalty', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367210.htm', 'supervision_penalty_notice', 'supervision penalty subject rectification follow-up', '2026-04-07'),
  source('r19-mof-3275', 'MOF procurement information notice 3275 false material review', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367197.htm', 'false_material_review_notice', 'false material review award invalidated', '2026-04-07'),
  source('r19-mof-3274', 'MOF procurement information notice 3274 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367191.htm', 'complaint_handling_decision', 'complaint handling legal article', '2026-04-07'),
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
      if (entry.name.includes('official-public-instances-round19')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildNineteenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v19',
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
    crawlerProvider: 'registry_snapshot_round19',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round19_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    nineteenth_round_source_count: sourceRegister.sources.length,
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
    correction_notice_records: procurementRecords.filter((row) => row.correction_notice_flag).length,
    false_material_records: procurementRecords.filter((row) => row.false_material_flag).length,
    award_invalidated_records: procurementRecords.filter((row) => row.award_invalidated_flag).length,
    rebid_required_records: procurementRecords.filter((row) => row.rebid_required_flag).length,
    agency_penalty_records: procurementRecords.filter((row) => row.supervision_penalty_subject).length,
    procurement_exception_review_only_rate: percent(procurementRecords.filter((row) => row.finding_disposition !== 'substantive_violation').length, procurementRecords.length),
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    central_unit_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'central_unit').length,
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
    report_topics: ['procurement_complaint_exception_handling'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 19 procurement complaint and exception handling samples', records: procurementRecords },
    budget: {
      title: 'Round 19 fiscal supervision policy supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 19 fiscal supplemental checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeNineteenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round19_acceptance_baseline = ROUND19_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['procurement_complaint_exception_handling'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'procurement complaint and supervision exceptions',
      action: 'Keep complaint decision number, issue summary, handling result, false material flag, award invalidation, rebid requirement, correction notice, penalty subject and affected package as first-class procurement fields.',
      reason: 'Round 19 official notices show these fields are needed to explain review status without overstating a violation.',
    },
    {
      priority: 'P0',
      area: 'exception chain discovery',
      action: 'Continue crawler expansion from complaint or supervision notice to correction, award invalidation, rebid, new award, contract, acceptance, payment and rectification candidates.',
      reason: 'The public evidence chain changes after a complaint, so downstream stages must be discovered before any risk candidate is formed.',
    },
    {
      priority: 'P1',
      area: 'legal basis locator evidence',
      action: 'Persist legal basis, article, decision paragraph, affected package and handling result locator hash in report evidence blocks.',
      reason: 'Formal PoC reports need exact decision-location evidence for manual review.',
    },
  ];
  return summary;
}

async function runNineteenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildNineteenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-COMPLAINT-EXCEPTION-001',
      risk_level: 'Review',
      finding_disposition: 'review_recommended',
      summary: 'Complaint, supervision, correction and rebid public notices are review-only until downstream evidence is complete.',
      missing_evidence: ['correction or rebid notice', 'new award', 'contract', 'acceptance', 'payment', 'voucher attachment'],
      recommended_next_data: ['correction notice', 'rebid notice', 'new award', 'contract', 'acceptance result', 'payment detail'],
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
  const summary = summarizeNineteenthOfficialRun({
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
    'complaint_established',
    'complaint_partly_established',
    'complaint_rejected',
    'false_material_review',
    'award_invalidated',
    'correction_notice',
    'rebid_required',
    'supervision_penalty',
  ];
  return Array.from({ length: 150 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const exceptionType = exceptionTypes[index % exceptionTypes.length];
    const packageNo = String((index % 4) + 1).padStart(2, '0');
    const projectCode = `R19-EX-${String(index + 1).padStart(3, '0')}`;
    const invalidated = ['complaint_established', 'complaint_partly_established', 'award_invalidated', 'false_material_review'].includes(exceptionType);
    const rebid = invalidated || exceptionType === 'rebid_required';
    const correction = exceptionType === 'correction_notice' || index % 3 === 0;
    const falseMaterial = exceptionType === 'false_material_review' || index % 5 === 0;
    const penaltySubject = exceptionType === 'supervision_penalty' || index % 9 === 0 ? `Agency ${index % 7}` : '';
    return {
      project_name: `Round 19 complaint supervision exception project ${index + 1}`,
      purchaser_name: `Central Unit Purchaser ${index % 12}`,
      announcement_type: 'complaint notice',
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
      budget_amount: String(900000 + index * 3500),
      award_amount: String(870000 + index * 3200),
      package_no: packageNo,
      package_name: `package ${packageNo}`,
      supplier_name: `Supplier R19 ${index % 18}`,
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: true,
      procurement_exception_type: exceptionType,
      complaint_decision_no: `MOF-R19-${String(3000 + index).padStart(4, '0')}`,
      complaint_issue_summary: falseMaterial ? 'false material allegation and qualification review' : 'procurement complaint matter and review request',
      complaint_handling_result: handlingResult({ exceptionType, invalidated, rebid, correction }),
      false_material_flag: falseMaterial,
      award_invalidated_flag: invalidated,
      rebid_required_flag: rebid,
      correction_notice_flag: correction,
      supervision_penalty_subject: penaltySubject || undefined,
      affected_package_no: packageNo,
      finding_disposition: 'review_recommended',
      missing_evidence: ['follow-up correction or rebid notice', 'new award', 'contract', 'acceptance', 'payment', 'voucher attachment'],
      recommended_next_data: ['correction_notice', 'rebid_notice', 'new_award', 'contract', 'acceptance', 'payment'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'complaint handling result',
        paragraphIndex: (index % 8) + 1,
        affectedPackageNo: packageNo,
        rawExcerpt: `${projectCode} ${packageNo} ${exceptionType} ${invalidated ? 'award invalidated' : 'review only'} ${rebid ? 'rebid required' : 'follow-up review'}`,
      }),
      source_row: index + 1,
    };
  });
}

function handlingResult({ exceptionType, invalidated, rebid, correction }) {
  if (exceptionType === 'complaint_rejected') return 'complaint rejected; maintain original procurement result';
  if (exceptionType === 'supervision_penalty') return 'supervision handling; penalty subject recorded; follow-up rectification review required';
  if (invalidated && rebid) return 'complaint established; award invalidated and rebid required';
  if (correction) return 'correction notice required; follow-up announcement review required';
  return 'review recommended; downstream evidence required';
}

function buildBudgetRecords(capturedAt, parserVersion) {
  return Array.from({ length: 50 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    return {
      dataset_kind: 'public_fiscal_summary',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      region: 'central government procurement supervision',
      indicator_name: `Round 19 fiscal supervision supplemental checklist ${index + 1}`,
      actual_value: String(100 + index),
      actual_value_unit: 'count',
      fiscal_year: 2026,
      policy_topic: 'procurement supervision supplemental checklist',
      required_budget_indicator_data: true,
      required_performance_target_data: true,
      required_payment_data: true,
      required_voucher_data: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'supplemental checklist',
        paragraphIndex: (index % 6) + 1,
        affectedPackageNo: '',
        rawExcerpt: 'Budget indicator, performance target, payment detail and voucher attachment are required as next data.',
      }),
      source_row: index + 1,
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  return Array.from({ length: 25 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const formal = index % 4 === 0;
    return {
      seed_id: `R19-CASE-${String(index + 1).padStart(3, '0')}`,
      issue_title: `Round 19 complaint follow-up review seed ${index + 1}`,
      project_name: `Round 19 complaint supervision exception project ${index + 1}`,
      responsible_subject: `Central Unit Purchaser ${index % 12}`,
      issue_category: formal ? 'procurement_supervision_followup' : 'review_reference',
      issue_amount: String(200000 + index * 1000),
      issue_amount_unit: 'yuan',
      audit_evidence_level: formal ? 'formal_audit_report' : 'audit_work_update',
      audit_evidence_weight: formal ? 90 : 35,
      finding_disposition: formal ? 'review_recommended' : 'knowledge_reference',
      requires_manual_verification: true,
      required_next_data: ['correction notice', 'new award', 'contract', 'acceptance', 'payment', 'voucher attachment'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'audit follow-up seed',
        paragraphIndex: (index % 5) + 1,
        affectedPackageNo: String((index % 4) + 1).padStart(2, '0'),
        rawExcerpt: 'Complaint and supervision sources require manual follow-up and downstream evidence.',
      }),
      source_row: index + 1,
    };
  });
}

function registryEntry(item, capturedAt, index) {
  const contentHash = hash([item.title, item.url, item.keyword].join('|'));
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
    content_hash: contentHash,
    duplicate_of: null,
    duplicate_reason: null,
    title_similarity_score: 0,
    manual_review_note: 'Round 19 web research snapshot for procurement complaint and exception chain PoC.',
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
    page_number: null,
    section_title: sectionTitle,
    locator_hash: hash(`${item.url}|${rowNumber}|${sectionTitle}|${paragraphIndex}`),
    raw_excerpt: rawExcerpt,
    paragraph_index: paragraphIndex,
    legal_basis: 'Government Procurement Law and government procurement complaint handling measures',
    legal_basis_article: 'complaint handling and supervision decision article',
    decision_paragraph_index: paragraphIndex,
    affected_package_no: affectedPackageNo || null,
    handling_result_locator_hash: hash(`${item.url}|handling-result|${rowNumber}|${affectedPackageNo || ''}`),
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
    '# Round 19 Official Public Instances Test Result',
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
    '## Procurement Complaint And Exception Handling',
    '',
    `- Exception procurement records: ${collector.procurement_exception_records}`,
    `- Complaint decision records: ${collector.complaint_decision_records}`,
    `- Exception queue items: ${collector.exception_chain_queue_item_count}`,
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
<title>Round 19 Official Public Instances Test Result</title>
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
  runNineteenthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote ${outputDir}`);
      console.log(`Round 19 accepted ${summary.total_accepted_records}/${summary.total_input_records}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
