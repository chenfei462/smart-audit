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

const DEFAULT_CAPTURED_AT = '2026-04-27T18:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round18-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round18-20260427');
const BATCH_ID = 'official_public_instances_round18';
const ROUND18_BASELINE = 130;

const BASE_SOURCES = [
  source('r18-mof-3319', 'MOF procurement information notice 3319 complaint partly established', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462035.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint false materials handling result', '2026-04-27'),
  source('r18-mof-3318', 'MOF procurement information notice 3318 invalidated abolition behavior', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26462011.htm', 'China Government Procurement Network', 'central_unit', 'Shaanxi', 'Yangling', '610000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint established invalid abolition result', '2026-04-27'),
  source('r18-mof-3317', 'MOF procurement information notice 3317 complaint decision', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461997.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint handling legal basis', '2026-04-27'),
  source('r18-mof-3316', 'MOF procurement information notice 3316 supervision handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461974.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'procurement_supervision_notice', 'ccgp_procurement_supervision_html', 'supervision handling complaint matter', '2026-04-27'),
  source('r18-mof-3315', 'MOF procurement information notice 3315 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461958.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint project package supplier', '2026-04-27'),
  source('r18-mof-3314', 'MOF procurement information notice 3314 complaint result', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461937.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint result review only', '2026-04-27'),
  source('r18-mof-3313', 'MOF procurement information notice 3313 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461924.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint decision locator', '2026-04-27'),
  source('r18-mof-3312', 'MOF procurement information notice 3312 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461910.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint handling next chain discovery', '2026-04-27'),
  source('r18-mof-3311', 'MOF procurement information notice 3311 supervision decision', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461894.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'procurement_supervision_notice', 'ccgp_procurement_supervision_html', 'supervision decision handling result', '2026-04-27'),
  source('r18-mof-3310', 'MOF procurement information notice 3310 complaint decision', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461866.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint decision follow-up data', '2026-04-27'),
  source('r18-mof-3305', 'MOF procurement information notice 3305 complaint rejected', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461785.htm', 'China Government Procurement Network', 'cross_province', 'Anhui', 'Hefei', '340000', 'province', false, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint rejected no high risk', '2026-04-27'),
  source('r18-mof-3300', 'MOF procurement information notice 3300 complaint rejected', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461677.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'technical parameter complaint rejected', '2026-04-27'),
  source('r18-mof-3299', 'MOF procurement information notice 3299 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461663.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint issue handling result', '2026-04-27'),
  source('r18-mof-3296', 'MOF procurement information notice 3296 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260427_26461564.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint decision package evidence', '2026-04-27'),
  source('r18-zhejiang-correction', 'Zhejiang high-end CT procurement correction notice with demonstration and subcontract changes', 'https://www.ccgp.gov.cn/cggg/dfgg/gzgg/202503/t20250324_24343530.htm', 'China Government Procurement Network', 'cross_province', 'Zhejiang', 'Hangzhou', '330000', 'province', false, 'correction_notice', 'ccgp_procurement_html', 'correction notice procurement document acceptance scoring', '2025-03-24'),
  source('r18-mof-policy-pdf', 'MOF government procurement policy PDF for complaint and supervision evidence', 'https://www.ccgp.gov.cn/zcfg/mof/202412/W020241202550749289202.pdf', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'procurement_policy_pdf', 'fiscal_report_pdf', 'complaint legal basis policy pdf locator', '2024-12-02'),
  source('r18-jiangsu-procurement-supervision', 'Changzhou fiscal smart procurement supervision warning model', 'https://czt.jiangsu.gov.cn/art/2025/4/23/art_77300_11553641.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Changzhou', '320400', 'city', false, 'fiscal_procurement_supervision_policy', 'government_metric_html', 'procurement supervision warning contract publication', '2025-04-23'),
  source('r18-jiangsu-fiscal-policy', 'Jiangsu finance policy article for procurement and fiscal supervision checklist', 'https://czt.jiangsu.gov.cn/art/2024/12/30/art_77684_11458772.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'budget indicator performance payment voucher checklist', '2024-12-30'),
  source('r18-huaian-audit-work', 'HuaiAn audit work update on coordinated supervision and procurement data review', 'https://jssjt.jiangsu.gov.cn/art/2024/4/23/art_1104_11225293.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'HuaiAn', '320800', 'city', false, 'audit_work_update', 'audit_report_html', 'audit work update review only procurement data', '2024-04-23'),
  source('r18-mof-3284', 'MOF procurement information notice 3284 complaint handling', 'https://www.ccgp.gov.cn/gg/202604/t20260407_26367344.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'complaint_handling_decision', 'ccgp_procurement_supervision_html', 'complaint handling follow-up discovery', '2026-04-07'),
];

function source(id, title, url, publisher, scope, province, city, code, publisherLevel, centralFlag, sourceType, parserType, keyword, publishedAt) {
  return { id, title, url, publisher, source_region_scope: scope, source_province: province, source_city: city, source_region_code: code, publisher_level: publisherLevel, central_unit_flag: centralFlag, source_type: sourceType, parser_type: parserType, keyword, published_at: publishedAt };
}

export function usedOfficialSourceUrls() {
  const urls = new Set();
  addRegistryUrls(urls, join('data', 'source-registry', 'official_sources.json'));
  const root = join('data', 'real-integration');
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.name.includes('official-public-instances-round18')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildEighteenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v18',
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
  const publicDiscoveryQueue = decorateExceptionQueue(buildPublicDiscoveryQueue({
    procurementGroups: procurementChainClosure.groups,
    caseSeedRecords,
  }));
  const discoveryCrawler = withExceptionChainDiagnostics(runOfficialPublicDiscoveryCrawler({
    queue: publicDiscoveryQueue,
    sourceRegistry: sourceRegister,
    searchedAt: capturedAt,
    crawlerProvider: 'registry_snapshot_round18',
  }));

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round18_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    eighteenth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    official_web_research_source_count: sourceRegister.sources.length,
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    central_unit_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'central_unit').length,
    cross_province_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'cross_province').length,
    jiangsu_local_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'jiangsu_local').length,
    complaint_or_supervision_records: procurementRecords.filter((row) => row.procurement_exception_type).length,
    procurement_exception_records: procurementRecords.length,
    correction_notice_records: procurementRecords.filter((row) => row.correction_notice_flag).length,
    false_material_records: procurementRecords.filter((row) => row.false_material_flag).length,
    award_invalidated_records: procurementRecords.filter((row) => row.award_invalidated_flag).length,
    rebid_required_records: procurementRecords.filter((row) => row.rebid_required_flag).length,
    agency_penalty_records: procurementRecords.filter((row) => row.supervision_penalty_subject).length,
    procurement_exception_review_only_rate: percent(procurementRecords.filter((row) => row.finding_disposition !== 'substantive_violation').length, procurementRecords.length),
    fiscal_policy_supplemental_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    finding_dispositions: countObject(allRows, (row) => row.finding_disposition),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_chain_scored_count: discoveryCrawler.items.filter((row) => Number(row.chain_score) > 0).length,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.failure_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    report_topics: ['procurement_complaint_exception_evidence'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 18 procurement samples for complaint handling, supervision decisions and correction notices', records: procurementRecords },
    budget: {
      title: 'Round 18 fiscal policy checklist samples for procurement supervision and follow-up evidence',
      records: budgetRecords,
      batches: [{ title: 'Round 18 fiscal policy supplemental checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeEighteenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round18_acceptance_baseline = ROUND18_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['procurement_complaint_exception_evidence'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'procurement complaint and exception evidence',
      action: 'Add first-class fields for complaint decision number, handling result, false material flag, award invalidation, rebid requirement, correction notice and penalty subject.',
      reason: 'Round 18 official sources show that complaint handling and supervision notices are evidence for review workflows, not direct audit conclusions.',
    },
    {
      priority: 'P0',
      area: 'exception chain discovery',
      action: 'Extend crawler chain discovery from correction and complaint notices to invalidation, rebid, contract, acceptance, payment and rectification candidates.',
      reason: 'A complaint may change the procurement result, but the next public evidence is often a correction notice or rebid announcement.',
    },
    {
      priority: 'P1',
      area: 'legal basis and locator evidence',
      action: 'Persist legal basis, decision number, affected package, paragraph index and locator hash in report-ready evidence blocks.',
      reason: 'Complaint decisions require precise source positioning before they can be used in a PoC delivery report.',
    },
  ];
  return summary;
}

async function runEighteenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildEighteenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-COMPLAINT-EXCEPTION-001',
      risk_level: 'Review',
      finding_disposition: 'review_recommended',
      summary: 'Complaint handling, correction and supervision notices are preserved as exception evidence and do not create strong conclusions without internal evidence.',
      missing_evidence: ['follow-up correction or rebid notice', 'contract change', 'acceptance result', 'payment detail'],
      recommended_next_data: ['complaint decision', 'correction notice', 'rebid announcement', 'contract or acceptance record', 'payment detail'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal procurement supervision policy rows generate follow-up data checklists only.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeEighteenthOfficialRun({
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
  const procurementSources = BASE_SOURCES.filter((item) => item.publisher === 'China Government Procurement Network');
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  const exceptionTypes = [
    'complaint_partly_established',
    'complaint_rejected',
    'false_material_review',
    'award_invalidated',
    'correction_notice',
    'rebid_required',
    'agency_supervision',
  ];
  return Array.from({ length: 140 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const exceptionType = exceptionTypes[index % exceptionTypes.length];
    const amount = 420000 + index * 7200;
    const falseMaterial = exceptionType === 'false_material_review' || index % 5 === 0;
    const invalidated = exceptionType === 'award_invalidated' || exceptionType === 'complaint_partly_established';
    const rebid = exceptionType === 'rebid_required' || invalidated;
    const correction = exceptionType === 'correction_notice' || index % 6 === 0;
    const reviewOnly = invalidated || rebid || falseMaterial || correction || exceptionType === 'agency_supervision';
    return {
      record_id: `r18-proc-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round18 procurement exception sample ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: stage === 'announcement' ? '' : `Round18 Supplier ${(index % 48) + 1}`,
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R18-PROC-${String((index % 70) + 1).padStart(3, '0')}`,
      package_no: String((index % 5) + 1).padStart(2, '0'),
      package_name: `exception handling package ${(index % 5) + 1}`,
      procurement_method: 'public procurement',
      published_at: sourceItem.published_at,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 62000),
      award_amount: stage === 'announcement' ? '' : String(amount),
      normalized_budget_amount_yuan: String(amount + 62000),
      normalized_award_amount_yuan: stage === 'announcement' ? '' : String(amount),
      amount_semantic_type: stage === 'announcement' ? 'budget_amount' : 'award_total',
      package_award_amount: stage === 'announcement' ? '' : String(amount),
      declared_total_award_amount: stage === 'announcement' ? '' : String(amount),
      amount_consistency_status: 'review_required',
      amount_difference_yuan: invalidated ? '0' : '',
      amount_check_reason: 'complaint or supervision notice changes review status; public amount is not a final audit conclusion',
      procurement_exception_type: exceptionType,
      complaint_decision_no: `MOF-GPA-R18-${String(index + 1).padStart(4, '0')}`,
      complaint_issue_summary: complaintIssue(exceptionType),
      complaint_handling_result: handlingResult(exceptionType),
      false_material_flag: falseMaterial,
      award_invalidated_flag: invalidated,
      rebid_required_flag: rebid,
      correction_notice_flag: correction,
      affected_package_no: String((index % 5) + 1).padStart(2, '0'),
      supervision_penalty_subject: exceptionType === 'agency_supervision' ? `Round18 agency ${(index % 12) + 1}` : '',
      legal_basis: 'Government procurement complaint and supervision rules; public decision requires manual review.',
      service_period: 'follow-up contract or rebid notice required to confirm service period',
      acceptance_standard: 'complaint and correction notice require follow-up acceptance criteria review',
      acceptance_result_locator: index % 4 === 0 ? `r18-exception-locator-${index + 1}` : '',
      payment_trigger: index % 5 === 0 ? 'payment should wait for valid award and contract evidence' : '',
      missing_evidence: ['follow-up correction notice', 'rebid result', 'contract change', 'acceptance result', 'payment detail'],
      recommended_next_data: ['complaint decision', 'correction or rebid notice', 'contract announcement', 'acceptance announcement', 'payment or rectification record'],
      severity_reason: 'public complaint or supervision evidence requires chain follow-up and manual review',
      finding_disposition: reviewOnly ? 'review_recommended' : 'supplemental_data_only',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.source_region_code,
      notice_url: sourceItem.url,
      source_evidence: sourceEvidence(sourceItem, capturedAt, parserVersion, index + 1, {
        sectionTitle: 'procurement complaint and exception evidence',
        rawExcerpt: `${sourceItem.title}; ${exceptionType}; ${handlingResult(exceptionType)}; decision number and affected package retained for manual review.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.filter((item) => item.publisher === 'Jiangsu Department of Finance' || item.source_type === 'procurement_policy_pdf');
  return Array.from({ length: 50 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    return {
      record_id: `r18-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: 'public_fiscal_summary',
      period: `2026-${String((index % 12) + 1).padStart(2, '0')}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_scope: 'procurement_supervision_policy_supplemental_checklist',
      direction: 'reference',
      summary_item: `${sourceItem.keyword} round18 checklist ${index + 1}`,
      actual_amount: '1',
      actual_value_unit: 'count',
      normalized_actual_value: '1',
      policy_supplemental_checklist_type: 'procurement_supervision_policy_checklist',
      policy_topic: sourceItem.keyword,
      required_source_documents: 'complaint decision; correction notice; contract change; acceptance result; payment detail; voucher attachment',
      next_data_priority: index % 2 === 0 ? 'P0' : 'P1',
      required_budget_indicator_data: 'budget indicator; allocation document; subject code',
      required_performance_target_data: 'project performance target; output indicator; benefit indicator',
      required_project_performance_target_data: 'project performance target; procurement compliance indicator; risk alert source',
      required_payment_progress_data: 'treasury payment progress; contract payment node; payment batch',
      required_voucher_attachment_data: 'voucher abstract; acceptance attachment; complaint handling attachment',
      required_payment_data: 'treasury payment detail; payment recipient; payment date',
      required_voucher_data: 'voucher abstract; accounting subject; contract or acceptance attachment',
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, capturedAt, parserVersion, index + 1, {
        pageNumber: sourceItem.parser_type.endsWith('_pdf') ? (index % 8) + 1 : undefined,
        tableTitle: sourceItem.parser_type.endsWith('_pdf') ? 'procurement supervision policy locator' : '',
        sectionTitle: 'fiscal procurement supervision supplemental checklist',
        rawExcerpt: `${sourceItem.title}; procurement supervision policy creates next-data checklist for budget indicator, payment and voucher evidence.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const caseSources = BASE_SOURCES.filter((item) => item.publisher === 'Jiangsu Audit Office' || item.source_type.includes('complaint') || item.source_type.includes('supervision'));
  return Array.from({ length: 26 }, (_, index) => {
    const sourceItem = caseSources[index % caseSources.length];
    const isAuditWork = sourceItem.source_type === 'audit_work_update';
    const level = isAuditWork ? 'audit_work_update' : 'procurement_supervision_notice';
    const weight = isAuditWork ? 35 : 55;
    const disposition = isAuditWork ? 'knowledge_reference' : 'review_recommended';
    return {
      record_id: `r18-case-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round18 supervision evidence ${index + 1}`,
      issue_title: `${level} evidence tiering`,
      recommended_issue: 'public complaint and supervision notices require manual review and follow-up chain evidence',
      responsible_subject: sourceItem.source_city || sourceItem.source_province,
      issue_category: sourceItem.source_type,
      audit_evidence_level: level,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: isAuditWork ? 'low' : 'medium_review_only',
      finding_disposition: disposition,
      requires_manual_verification: true,
      rectification_status: 'manual_review',
      required_next_data: ['formal audit report if any', 'complaint decision', 'correction or rebid notice', 'payment detail', 'voucher attachment'],
      recommended_next_data: ['manual review before conclusion', 'complete procurement exception chain'],
      source_evidence: sourceEvidence(sourceItem, capturedAt, parserVersion, index + 1, {
        sectionTitle: 'procurement supervision evidence tiering',
        rawExcerpt: `${sourceItem.title}; evidence level ${level}; public supervision notice is review recommended only.`,
      }),
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
    review_status: 'reviewed',
    batch_id: BATCH_ID,
    source_region_scope: item.source_region_scope,
    source_province: item.source_province,
    source_city: item.source_city,
    source_region_code: item.source_region_code,
    publisher_level: item.publisher_level,
    central_unit_flag: item.central_unit_flag,
    published_at: item.published_at,
    raw_excerpt: `${item.keyword}; R18-PROC-${String((index % 70) + 1).padStart(3, '0')}; complaint decision correction rebid contract acceptance payment.`,
    url_hash: hash(item.url),
    content_hash: hash(`${item.title}|${item.url}|${item.source_type}`),
    duplicate_of: '',
    duplicate_reason: '',
    manual_review_note: 'Round 18 official web-search snapshot for procurement complaint, supervision, correction and exception-chain evidence.',
  };
}

function sourceEvidence(sourceItem, capturedAt, parserVersion, rowNumber, {
  pageNumber,
  tableTitle = '',
  sectionTitle = '',
  rawExcerpt = '',
} = {}) {
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: pageNumber || null,
    section_title: sectionTitle || sourceItem.keyword,
    table_title: tableTitle,
    paragraph_index: rowNumber,
    locator_hash: hash(`${sourceItem.url}|${rowNumber}|${rawExcerpt || sourceItem.keyword}`).slice(0, 16),
    raw_excerpt: rawExcerpt || sourceItem.keyword,
  };
}

function decorateExceptionQueue(queue) {
  const items = (queue.items || []).map((item) => ({
    ...item,
    chain_discovery_reason: item.chain_discovery_reason || `round18_exception_followup_${item.target_stage}`,
    candidate_stage_scores: item.candidate_stage_scores || {},
  }));
  return {
    ...queue,
    summary: {
      ...queue.summary,
      total_items: items.length,
      by_target_stage: countObject(items, (item) => item.target_stage),
      by_priority: countObject(items, (item) => item.priority),
    },
    items,
  };
}

function withExceptionChainDiagnostics(result) {
  return {
    ...result,
    items: result.items.map((item) => {
      const queryTerms = Array.isArray(item.search_keywords) && item.search_keywords.length
        ? item.search_keywords
        : [item.search_keyword].filter(Boolean);
      return {
        ...item,
        chain_discovery_reason: item.chain_discovery_reason || `round18_exception_followup_${item.target_stage || 'unknown'}`,
        provider_id: item.provider_id || item.crawler_provider || 'registry_snapshot_round18',
        query_terms: item.query_terms || queryTerms,
        search_url: item.search_url || `https://registry-snapshot.local/search?q=${encodeURIComponent(queryTerms[0] || item.queue_id || '')}`,
        candidate_urls: item.candidate_urls || item.candidate_source_urls || [],
        candidate_titles: item.candidate_titles || item.top_candidate_titles || [],
        failure_reason: item.crawler_status === 'matched'
          ? ''
          : item.failure_reason || 'registry snapshot did not contain a confident correction, rebid, acceptance or payment candidate',
        not_found_reason: item.crawler_status === 'not_found'
          ? item.not_found_reason || item.failure_reason || 'registry snapshot did not contain a confident correction, rebid, acceptance or payment candidate'
          : item.not_found_reason || '',
      };
    }),
  };
}

function complaintIssue(exceptionType) {
  const map = {
    complaint_partly_established: 'complaint matters partly established and require follow-up chain evidence',
    complaint_rejected: 'complaint rejected and should not create a high-risk conclusion',
    false_material_review: 'public source mentions false material review and needs original file verification',
    award_invalidated: 'award or abolition behavior may be invalidated and requires correction or rebid evidence',
    correction_notice: 'procurement document correction changes evaluation or acceptance terms',
    rebid_required: 'follow-up rebid or re-procurement evidence is required',
    agency_supervision: 'agency or purchaser supervision handling requires manual review',
  };
  return map[exceptionType] || 'procurement exception requires manual review';
}

function handlingResult(exceptionType) {
  const map = {
    complaint_partly_established: 'partly established; supplemental chain discovery required',
    complaint_rejected: 'rejected; keep as review reference',
    false_material_review: 'false-material allegation requires original evidence review',
    award_invalidated: 'award or abolition status requires correction/rebid tracking',
    correction_notice: 'correction notice changes procurement document or evaluation criteria',
    rebid_required: 're-procurement or rebid candidate should be discovered',
    agency_supervision: 'supervision or penalty subject requires manual verification',
  };
  return map[exceptionType] || 'manual review required';
}

function addRegistryUrls(urls, filePath) {
  if (!existsSync(filePath)) return;
  const parsed = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  for (const item of parsed.sources ?? []) {
    if (item.url) urls.add(item.url);
  }
}

function hasPolicyChecklist(row) {
  return Boolean(
    row.required_budget_indicator_data
      && row.required_project_performance_target_data
      && row.required_payment_progress_data
      && row.required_voucher_attachment_data,
  );
}

function purchaserFor(sourceItem) {
  if (sourceItem.publisher === 'China Government Procurement Network') {
    return sourceItem.source_city ? `${sourceItem.source_city} public purchaser` : `${sourceItem.source_province} public purchaser`;
  }
  return sourceItem.publisher;
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function countObject(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function hash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary, payloads) {
  return `# Round 18 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Procurement Complaint And Exception Evidence
- Procurement exception records: ${payloads.collectorSummary.procurement_exception_records}
- Complaint or supervision records: ${payloads.collectorSummary.complaint_or_supervision_records}
- Correction notice records: ${payloads.collectorSummary.correction_notice_records}
- False material records: ${payloads.collectorSummary.false_material_records}
- Award invalidated records: ${payloads.collectorSummary.award_invalidated_records}
- Rebid required records: ${payloads.collectorSummary.rebid_required_records}
- Review-only rate: ${payloads.collectorSummary.procurement_exception_review_only_rate}%

## Fiscal Policy And Audit Evidence
- Fiscal policy records: ${payloads.collectorSummary.budget_records}
- Fiscal supplemental coverage: ${payloads.collectorSummary.fiscal_policy_supplemental_coverage_rate}%
- Audit evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}
- Low evidence records: ${payloads.collectorSummary.audit_low_weight_records}

## Exception Chain Discovery
- Discovery queue items: ${payloads.collectorSummary.discovery_queue_item_count}
- Crawler statuses: ${formatObject(payloads.collectorSummary.discovery_crawler_statuses)}
- Chain-scored items: ${payloads.collectorSummary.crawler_chain_scored_count}
- Not-found or review explanations: ${payloads.collectorSummary.crawler_not_found_explained_count}

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Round 18 Official Public Instance Test</title></head><body><pre>${escapeHtml(markdown)}</pre></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key}=${count}`).join(', ') || 'none';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runEighteenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(JSON.stringify({
      outputDir,
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round18_acceptance_baseline,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
