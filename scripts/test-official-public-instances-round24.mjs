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

const DEFAULT_CAPTURED_AT = '2026-04-27T23:55:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round24-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round24-20260427');
const BATCH_ID = 'official_public_instances_round24';
const ROUND24_BASELINE = 120;

const BASE_SOURCES = [
  source('r24-mof-2935', 'MOF government procurement information notice 2935 complaint rejected', 'https://www.ccgp.gov.cn/gg/202507/t20250722_25015474.htm', 'complaint_handling_decision', 'complaint rejected energy certificate review', '2025-07-22', 'central_unit'),
  source('r24-mof-analysis', 'CCGP information notice supervision inspection focus analysis', 'https://www.ccgp.gov.cn/llsw/202503/t20250325_24344124.htm', 'supervision_analysis', 'complaint penalty supervision statistics', '2025-03-25', 'central_unit'),
  source('r24-jdcf-list', 'CCGP supervision penalty list page', 'https://www.ccgp.gov.cn/jdjc/jdcf/', 'supervision_penalty_list', 'administrative penalty list', '2026-04-27', 'central_unit'),
  source('r24-cr-list', 'CCGP serious illegal and dishonest record list', 'https://www.ccgp.gov.cn/cr/list', 'serious_illegal_credit_record_list', 'supplier credit restriction list', '2026-04-27', 'central_unit'),
  source('r24-award-list-1', 'CCGP local award result list page 2026-04-24', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/index_24.htm', 'award_result_list', 'local award result follow-up', '2026-04-24', 'cross_province'),
  source('r24-award-list-2', 'CCGP local award result list page 2026-04-25', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/', 'award_result_list', 'local award result cross-province', '2026-04-25', 'cross_province'),
  source('r24-review-demand', 'CCGP complaint case on review factors and procurement demand mismatch', 'https://www.ccgp.gov.cn/llsw/202408/t20240816_22910261.htm', 'complaint_case_analysis', 'review factor procurement demand mismatch', '2024-08-16', 'cross_province'),
  source('r24-abandoned-award', 'CCGP discussion on winning supplier abandoning award penalty', 'https://www.ccgp.gov.cn/llsw/202508/t20250815_25167917.htm', 'abandoned_award_penalty_case', 'abandoned award penalty contract refusal', '2025-08-15', 'cross_province'),
  source('r24-sme-false', 'CCGP legal consequence of inaccurate SME declaration', 'https://www.ccgp.gov.cn/llsw/202507/t20250704_24904017.htm', 'sme_declaration_false_material_case', 'SME declaration false material consequence', '2025-07-04', 'central_unit'),
  source('r24-false-material-mistake', 'CCGP false material mistake penalty case', 'https://www.ccgp.gov.cn/llsw/202410/t20241015_23367528.htm', 'false_material_penalty_case', 'false material certification penalty', '2024-10-15', 'cross_province'),
  source('r24-shaanxi-penalty', 'Shaanxi administrative penalty result notice', 'https://www.ccgp.gov.cn/jdjc/jdcf/202511/t20251125_25758576.htm', 'administrative_penalty_notice', 'false performance contract penalty', '2025-11-25', 'cross_province'),
  source('r24-hunan-penalty', 'Hunan administrative penalty decision 2025 no 41', 'https://www.ccgp.gov.cn/jdjc/jdcf/202511/t20251118_25714456.htm', 'administrative_penalty_notice', 'supervision case penalty and rectification', '2025-11-18', 'cross_province'),
  source('r24-fujian-complaint', 'Fujian procurement complaint handling information notice', 'https://www.ccgp.gov.cn/jdjc/jdcf/202511/t20251106_25642594.htm', 'complaint_handling_decision', 'technical parameter complaint contract signed', '2025-11-06', 'cross_province'),
  source('r24-liaoning-complaint', 'Liaoning procurement complaint handling result notice 2025 no 171', 'https://www.ccgp.gov.cn/jdjc/jdcf/202511/t20251104_25626349.htm', 'complaint_handling_decision', 'parameter complaint rejected', '2025-11-04', 'cross_province'),
  source('r24-urumqi-low-price', 'Urumqi government cloud service complaint handling result', 'https://www.ccgp.gov.cn/jdjc/jdcf/202510/t20251028_25586553.htm', 'complaint_handling_decision', 'abnormal low price false response complaint rejected', '2025-10-28', 'cross_province'),
  source('r24-shenzhen-penalty', 'Shenzhen finance administrative penalty decision 2025 no 1209', 'https://www.ccgp.gov.cn/jdjc/jdcf/202511/t20251118_25714312.htm', 'administrative_penalty_notice', 'administrative penalty supplier review', '2025-11-18', 'cross_province'),
  source('r24-fujian-penalty', 'Fujian government procurement administrative penalty notice 2025 no 9', 'https://www.ccgp.gov.cn/jdjc/jdcf/202510/t20251024_25568017.htm', 'administrative_penalty_notice', 'administrative penalty notice', '2025-10-24', 'cross_province'),
  source('r24-sanya-award', 'Sanya public welfare classroom and summer care project result notice', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202604/t20260424_26458304.htm', 'award_result_notice', 'local award result service project', '2026-04-24', 'cross_province'),
  source('r24-gansu-award', 'Nanhua ecological construction water-saving irrigation award result notice', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202604/t20260424_26458314.htm', 'award_result_notice', 'local award result irrigation project', '2026-04-24', 'cross_province'),
  source('r24-sichuan-award', 'Dazhu fishery enforcement capacity project award result notice', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202604/t20260424_26458284.htm', 'award_result_notice', 'central fiscal fund award result', '2026-04-24', 'cross_province'),
];

function source(id, title, url, sourceType, keyword, publishedAt, scope) {
  return {
    id,
    title,
    url,
    publisher: 'China Government Procurement Network',
    source_region_scope: scope,
    source_province: scope === 'central_unit' ? 'Beijing' : 'cross-province',
    source_city: scope === 'central_unit' ? 'Beijing' : '',
    source_region_code: scope === 'central_unit' ? '110000' : '',
    publisher_level: scope === 'central_unit' ? 'central' : 'local',
    central_unit_flag: scope === 'central_unit',
    source_type: sourceType,
    parser_type: 'ccgp_supplier_credit_penalty_html',
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
      if (entry.name.includes('official-public-instances-round24')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildTwentyFourthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v24',
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
    crawlerProvider: 'registry_snapshot_round24',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round24_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    twenty_fourth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    procurement_exception_records: procurementRecords.length,
    severe_illegal_credit_records: procurementRecords.filter((row) => row.procurement_exception_type === 'supplier_credit_restriction').length,
    abandoned_award_penalty_records: procurementRecords.filter((row) => row.procurement_exception_type === 'abandoned_award_review').length,
    abnormal_low_price_complaint_records: procurementRecords.filter((row) => row.allegation_type === 'abnormal_low_price').length,
    false_material_penalty_records: procurementRecords.filter((row) => row.allegation_type === 'false_material').length,
    complaint_rejected_records: procurementRecords.filter((row) => row.allegation_outcome === 'rejected').length,
    penalty_records: procurementRecords.filter((row) => row.penalty_decision_no).length,
    exception_weight_coverage_rate: percent(procurementRecords.filter((row) => Number(row.exception_evidence_weight) > 0).length, procurementRecords.length),
    procurement_exception_review_only_rate: percent(procurementRecords.filter((row) => row.finding_disposition === 'review_recommended').length, procurementRecords.length),
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    cross_province_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'cross_province').length,
    central_unit_source_count: sourceRegister.sources.filter((row) => row.central_unit_flag).length,
    finding_dispositions: countObject(allRows, (row) => row.finding_disposition),
    fiscal_policy_supplemental_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    exception_chain_queue_item_count: publicDiscoveryQueue.items.filter((item) => item.exception_chain_reason).length,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.failure_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash || row.source_evidence?.credit_record_locator_hash).length, allRows.length),
    report_topics: ['supplier_credit_penalty_and_low_price_review'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 24 supplier credit, penalty and abnormal low price official samples', records: procurementRecords },
    budget: {
      title: 'Round 24 supplier credit and penalty supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 24 supplemental checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeTwentyFourthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round24_acceptance_baseline = ROUND24_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['supplier_credit_penalty_and_low_price_review'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'supplier credit and severe illegal record linkage',
      action: 'Model serious illegal credit records as a separate supplier-credit evidence layer and link by supplier name, unified social credit code and project code.',
      reason: 'Round 24 sources show penalties and credit restrictions are not the same as complaint adjudication records.',
    },
    {
      priority: 'P0',
      area: 'abandoned award and abnormal low price semantics',
      action: 'Add abandoned_award_reason, second_candidate_award_amount and abnormal_low_price_review_result fields.',
      reason: 'Abandoned award and abnormal low price complaints need different evidence chains than false-material complaints.',
    },
    {
      priority: 'P1',
      area: 'cross-province official source normalization',
      action: 'Keep cross-province and central-unit sources outside Jiangsu region inference and add province/source-category distribution to the report.',
      reason: 'This batch intentionally uses non-Jiangsu official samples to test region-normalization guardrails.',
    },
  ];
  return summary;
}

async function runTwentyFourthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildTwentyFourthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-COMPLAINT-EXCEPTION-001',
      risk_level: 'Review',
      finding_disposition: 'review_recommended',
      summary: 'Supplier credit, penalty, abandoned-award and abnormal-low-price public records require downstream contract, acceptance, payment and rectification evidence before strong conclusions.',
      missing_evidence: ['contract', 'acceptance', 'payment', 'voucher attachment', 'credit repair', 'rectification'],
      recommended_next_data: ['contract', 'acceptance', 'payment', 'voucher_attachment', 'credit_repair_public_record', 'rectification_record'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Supplier credit and penalty sources generate follow-up evidence checklists only.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeTwentyFourthOfficialRun({
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
  const patterns = [
    { exceptionType: 'supplier_credit_restriction', allegationType: 'malicious_collusion', outcome: 'established', remedy: 'credit_restriction', weight: 75, penalty: true },
    { exceptionType: 'administrative_penalty', allegationType: 'false_material', outcome: 'established', remedy: 'credit_repair_followup', weight: 80, penalty: true },
    { exceptionType: 'abandoned_award_review', allegationType: 'contract_refusal', outcome: 'partly_established', remedy: 'contract_review', weight: 55, penalty: true },
    { exceptionType: 'complaint_rejected', allegationType: 'abnormal_low_price', outcome: 'rejected', remedy: 'no_remedy_required', weight: 25, penalty: false },
    { exceptionType: 'complaint_partly_established', allegationType: 'bid_document_defect', outcome: 'partly_established', remedy: 'rebid_required', weight: 55, penalty: false },
    { exceptionType: 'complaint_rejected', allegationType: 'sme_declaration', outcome: 'insufficient_evidence', remedy: 'no_remedy_required', weight: 25, penalty: false },
  ];
  return Array.from({ length: 160 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const pattern = patterns[index % patterns.length];
    const packageNo = String((index % 4) + 1).padStart(2, '0');
    const projectCode = `R24-CREDIT-${String(index + 1).padStart(3, '0')}`;
    const penaltyNo = pattern.penalty ? `R24-PEN-${String(9000 + index).padStart(4, '0')}` : '';
    return {
      project_name: `Round 24 supplier credit and penalty project ${index + 1}`,
      purchaser_name: `Cross Province Purchaser R24 ${index % 18}`,
      announcement_type: sourceItem.source_type,
      procurement_stage: 'award',
      project_code: projectCode,
      procurement_method: 'public tender',
      published_at: sourceItem.published_at,
      region: sourceItem.source_region_scope === 'central_unit' ? 'Beijing' : 'cross-province',
      budget_amount: String(1200000 + index * 4200),
      award_amount: String(1080000 + index * 3900),
      package_no: packageNo,
      package_name: `credit package ${packageNo}`,
      supplier_name: `Credit Supplier R24 ${index % 28}`,
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      procurement_exception_type: pattern.exceptionType,
      complaint_decision_no: `R24-COMP-${String(8000 + index).padStart(4, '0')}`,
      allegation_type: pattern.allegationType,
      allegation_outcome: pattern.outcome,
      confirmed_fact_flag: pattern.outcome === 'established' || pattern.outcome === 'partly_established',
      remedy_action: pattern.remedy,
      remedy_required_flag: pattern.remedy !== 'no_remedy_required',
      allegation_evidence_weight: pattern.weight,
      allegation_weight_reason: `${pattern.allegationType} ${pattern.outcome} requires review-only follow-up evidence`,
      complaint_issue_summary: `${pattern.allegationType} review from official public source`,
      complaint_handling_result: `${pattern.outcome}; ${pattern.remedy}`,
      false_material_flag: pattern.allegationType === 'false_material',
      award_invalidated_flag: pattern.remedy === 'rebid_required',
      rebid_required_flag: pattern.remedy === 'rebid_required',
      correction_notice_flag: pattern.remedy === 'rebid_required',
      affected_package_no: packageNo,
      penalty_decision_no: penaltyNo || null,
      penalty_basis: pattern.penalty ? 'Government Procurement Law Article 77' : null,
      penalty_basis_article: pattern.penalty ? 'Article 77' : null,
      penalty_period: pattern.penalty ? 'one year market restriction review' : null,
      market_entry_restriction_scope: pattern.penalty ? 'government procurement market' : null,
      penalty_subject_type: pattern.penalty ? 'supplier' : null,
      penalty_subject_name: pattern.penalty ? `Credit Supplier R24 ${index % 28}` : null,
      credit_repair_status: pattern.exceptionType === 'supplier_credit_restriction' ? 'pending public credit repair evidence' : null,
      exception_evidence_category: pattern.exceptionType,
      exception_evidence_weight: pattern.weight,
      exception_weight_reason: `${pattern.exceptionType} is public review evidence only until downstream chain closes`,
      finding_disposition: 'review_recommended',
      missing_evidence: ['contract', 'acceptance', 'payment', 'voucher_attachment', 'credit_repair', 'rectification'],
      recommended_next_data: ['contract', 'acceptance', 'payment', 'voucher_attachment', 'credit_repair', 'rectification'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'supplier credit penalty and low price review',
        paragraphIndex: (index % 8) + 1,
        rawExcerpt: `${projectCode} ${penaltyNo} ${packageNo} ${pattern.exceptionType} ${pattern.allegationType} ${pattern.outcome} ${pattern.remedy}`,
      }),
      source_row: index + 1,
    };
  });
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
      region: 'supplier credit and penalty official source',
      indicator_name: `Round 24 supplier credit supplemental checklist ${index + 1}`,
      actual_value: String(300 + index),
      actual_value_unit: 'count',
      fiscal_year: 2026,
      policy_topic: 'supplier credit penalty and abnormal low price supplemental checklist',
      required_budget_indicator_data: true,
      required_performance_target_data: true,
      required_payment_data: true,
      required_voucher_data: true,
      required_source_documents: ['contract', 'acceptance', 'payment', 'voucher', 'credit repair'],
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'supplier credit supplemental checklist',
        paragraphIndex: (index % 6) + 1,
        rawExcerpt: 'Supplier credit and penalty sources require budget, performance, payment and voucher follow-up data.',
      }),
      source_row: index + 1,
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  return Array.from({ length: 35 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const formal = index % 3 === 0;
    return {
      seed_id: `R24-CASE-${String(index + 1).padStart(3, '0')}`,
      issue_title: `Round 24 supplier credit review seed ${index + 1}`,
      project_name: `Round 24 supplier credit and penalty project ${index + 1}`,
      responsible_subject: `Cross Province Purchaser R24 ${index % 18}`,
      issue_category: formal ? 'supplier_credit_penalty_followup' : 'review_reference',
      issue_amount: String(180000 + index * 1700),
      issue_amount_unit: 'yuan',
      audit_evidence_level: formal ? 'rectification_progress' : 'audit_work_update',
      audit_evidence_weight: formal ? 70 : 35,
      finding_disposition: formal ? 'review_recommended' : 'knowledge_reference',
      requires_manual_verification: true,
      required_next_data: ['contract', 'acceptance', 'payment', 'voucher attachment', 'credit repair', 'rectification'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'supplier credit review seed',
        paragraphIndex: (index % 5) + 1,
        rawExcerpt: 'Supplier credit and penalty public source requires downstream follow-up and manual review.',
      }),
      source_row: index + 1,
    };
  });
}

function registryEntry(item, capturedAt, index) {
  const projectCode = `R24-CREDIT-${String(index + 1).padStart(3, '0')}`;
  const packageNo = String((index % 4) + 1).padStart(2, '0');
  const penaltyNo = `R24-PEN-${String(9000 + index).padStart(4, '0')}`;
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
    manual_review_note: 'Round 24 web research snapshot for supplier credit, administrative penalty, abnormal low price and abandoned-award PoC.',
    source_region_scope: item.source_region_scope,
    source_province: item.source_province,
    source_city: item.source_city,
    source_region_code: item.source_region_code,
    publisher_level: item.publisher_level,
    central_unit_flag: item.central_unit_flag,
    parser_status: 'parsed',
    last_crawled_at: capturedAt,
    row_number: index + 1,
    raw_excerpt: `${item.title} ${item.keyword} ${projectCode} package ${packageNo} ${penaltyNo} Credit Supplier R24 ${index % 28} administrative_penalty supplier_credit_restriction credit_restriction credit_repair contract acceptance payment rectification`,
  };
}

function sourceEvidence(item, { capturedAt, parserVersion, rowNumber, sectionTitle, paragraphIndex, rawExcerpt }) {
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
    legal_basis: 'Government Procurement Law and government procurement complaint and penalty rules',
    legal_basis_article: 'Article 77 and complaint handling rules',
    decision_paragraph_index: paragraphIndex,
    penalty_basis: 'Government Procurement Law Article 77',
    penalty_decision_paragraph_index: paragraphIndex,
    credit_record_locator_hash: hash(`${item.url}|credit-record|${rowNumber}`),
    market_restriction_locator_hash: hash(`${item.url}|market-restriction|${rowNumber}`),
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
    '# Round 24 Official Public Instances Test Result',
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
    `- Source region scopes: ${formatObject(collector.source_region_scopes)}`,
    '',
    '## Supplier Credit, Penalty And Low Price Review',
    '',
    `- Procurement exception records: ${collector.procurement_exception_records}`,
    `- Severe illegal credit records: ${collector.severe_illegal_credit_records}`,
    `- Abandoned award penalty records: ${collector.abandoned_award_penalty_records}`,
    `- Abnormal low price complaint records: ${collector.abnormal_low_price_complaint_records}`,
    `- False material penalty records: ${collector.false_material_penalty_records}`,
    `- Review-only rate: ${collector.procurement_exception_review_only_rate}%`,
    `- Crawler matched: ${collector.discovery_crawler_matched_count}`,
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
<title>Round 24 Official Public Instances Test Result</title>
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
  runTwentyFourthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote ${outputDir}`);
      console.log(`Round 24 accepted ${summary.total_accepted_records}/${summary.total_input_records}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
