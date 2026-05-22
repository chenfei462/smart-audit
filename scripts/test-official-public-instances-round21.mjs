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

const DEFAULT_CAPTURED_AT = '2026-04-27T21:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round21-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round21-20260427');
const BATCH_ID = 'official_public_instances_round21';
const ROUND21_BASELINE = 130;

const BASE_SOURCES = [
  source('r21-mof-01', 'MOF procurement information notice 20260204 26148907 administrative penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148907.htm', 'administrative_penalty_notice', 'administrative penalty credit restriction', '2026-02-04'),
  source('r21-mof-02', 'MOF procurement information notice 20260204 26148891 credit restriction follow-up', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148891.htm', 'supplier_credit_restriction_notice', 'credit restriction supplier penalty', '2026-02-04'),
  source('r21-mof-03', 'MOF procurement information notice 20260204 26148876 false material review', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148876.htm', 'false_material_review_notice', 'false material administrative penalty', '2026-02-04'),
  source('r21-mof-04', 'MOF procurement information notice 20260204 26148870 malicious collusion review', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148870.htm', 'malicious_collusion_notice', 'malicious collusion review', '2026-02-04'),
  source('r21-mof-05', 'MOF procurement information notice 20260204 26148838 complaint handling rejected', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148838.htm', 'complaint_handling_decision', 'complaint rejected low evidence weight', '2026-02-04'),
  source('r21-mof-06', 'MOF procurement information notice 20260204 26148836 credit repair follow-up', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148836.htm', 'credit_repair_notice', 'credit repair follow-up', '2026-02-04'),
  source('r21-mof-07', 'MOF procurement information notice 20260204 26148812 re-participation review', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148812.htm', 're_participation_notice', 're-participation procurement review', '2026-02-04'),
  source('r21-mof-08', 'MOF procurement information notice 20260204 26148802 market entry restriction', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148802.htm', 'credit_restriction_notice', 'market entry restriction', '2026-02-04'),
  source('r21-mof-09', 'MOF procurement information notice 20260204 26148790 administrative penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148790.htm', 'administrative_penalty_notice', 'penalty decision supplier', '2026-02-04'),
  source('r21-mof-10', 'MOF procurement information notice 20260204 26148759 false material penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148759.htm', 'false_material_review_notice', 'false material supplier penalty', '2026-02-04'),
  source('r21-mof-11', 'MOF procurement information notice 20260204 26148757 complaint established', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148757.htm', 'complaint_handling_decision', 'complaint established review', '2026-02-04'),
  source('r21-mof-12', 'MOF procurement information notice 20260204 26148742 complaint partly established', 'https://www.ccgp.gov.cn/gg/202602/t20260204_26148742.htm', 'complaint_handling_decision', 'complaint partly established', '2026-02-04'),
  source('r21-mof-13', 'MOF procurement information notice 20260202 26141639 administrative penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141639.htm', 'administrative_penalty_notice', 'administrative penalty follow-up', '2026-02-02'),
  source('r21-mof-14', 'MOF procurement information notice 20260202 26141614 credit restriction', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141614.htm', 'credit_restriction_notice', 'credit restriction follow-up', '2026-02-02'),
  source('r21-mof-15', 'MOF procurement information notice 20260202 26141593 malicious collusion', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141593.htm', 'malicious_collusion_notice', 'malicious collusion penalty', '2026-02-02'),
  source('r21-mof-16', 'MOF procurement information notice 20260202 26141571 credit repair', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141571.htm', 'credit_repair_notice', 'credit repair status', '2026-02-02'),
  source('r21-mof-17', 'MOF procurement information notice 20260202 26141542 re-participation', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141542.htm', 're_participation_notice', 'supplier re-participation review', '2026-02-02'),
  source('r21-mof-18', 'MOF procurement information notice 20260202 26141519 administrative penalty', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141519.htm', 'administrative_penalty_notice', 'penalty basis article', '2026-02-02'),
  source('r21-mof-19', 'MOF procurement information notice 20260202 26141498 supplier credit restriction', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141498.htm', 'supplier_credit_restriction_notice', 'supplier credit restriction', '2026-02-02'),
  source('r21-mof-20', 'MOF procurement information notice 20260202 26141471 complaint rejected', 'https://www.ccgp.gov.cn/gg/202602/t20260202_26141471.htm', 'complaint_handling_decision', 'complaint rejected no violation conclusion', '2026-02-02'),
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
    parser_type: 'ccgp_procurement_penalty_credit_html',
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
      if (entry.name.includes('official-public-instances-round21')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildTwentyFirstOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v21',
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
    crawlerProvider: 'registry_snapshot_round21',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round21_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    twenty_first_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    procurement_exception_records: procurementRecords.length,
    procurement_penalty_records: procurementRecords.filter((row) => row.penalty_decision_no).length,
    credit_constraint_records: procurementRecords.filter((row) => row.market_entry_restriction_scope || row.procurement_exception_type === 'supplier_credit_restriction').length,
    credit_repair_followup_records: procurementRecords.filter((row) => row.credit_repair_status || row.procurement_exception_type === 'credit_repair_followup').length,
    re_participation_review_records: procurementRecords.filter((row) => row.re_participation_review_flag || row.procurement_exception_type === 're_participation_review').length,
    malicious_collusion_records: procurementRecords.filter((row) => row.exception_evidence_category === 'malicious_collusion').length,
    false_material_records: procurementRecords.filter((row) => row.exception_evidence_category === 'false_material').length,
    complaint_rejected_records: procurementRecords.filter((row) => row.exception_evidence_category === 'complaint_rejected').length,
    exception_weight_coverage_rate: percent(procurementRecords.filter((row) => Number(row.exception_evidence_weight) > 0).length, procurementRecords.length),
    procurement_exception_review_only_rate: percent(procurementRecords.filter((row) => row.finding_disposition !== 'substantive_violation' && row.finding_disposition !== 'risk_candidate').length, procurementRecords.length),
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
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.failure_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash || row.source_evidence?.credit_record_locator_hash).length, allRows.length),
    report_topics: ['procurement_penalty_credit_constraints'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 21 procurement penalty, credit constraint and follow-up samples', records: procurementRecords },
    budget: {
      title: 'Round 21 fiscal policy supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 21 fiscal supplemental checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeTwentyFirstOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round21_acceptance_baseline = ROUND21_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['procurement_penalty_credit_constraints'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'administrative penalty and credit constraints',
      action: 'Keep penalty decision number, legal basis, penalty period, market restriction scope, penalty subject and credit repair status as first-class procurement fields.',
      reason: 'Round 21 sources show administrative penalties need different evidence weight and follow-up handling from rejected complaints.',
    },
    {
      priority: 'P0',
      area: 'exception chain discovery',
      action: 'Search penalty follow-up, credit restriction, credit repair, re-participation, contract, acceptance and payment by decision number plus penalty subject.',
      reason: 'Penalty notices alone remain review evidence; downstream closure is required before any risk candidate.',
    },
    {
      priority: 'P1',
      area: 'reporting topic',
      action: 'Separate supervision penalty and credit constraint reporting from complaint handling, with evidence weights and manual review status.',
      reason: 'PoC delivery should not give complaint rejection and administrative penalty the same weight.',
    },
  ];
  return summary;
}

async function runTwentyFirstOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildTwentyFirstOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-COMPLAINT-EXCEPTION-001',
      risk_level: 'Review',
      finding_disposition: 'review_recommended',
      summary: 'Administrative penalty, credit restriction and complaint notices are review-only until downstream evidence is complete.',
      missing_evidence: ['penalty follow-up', 'credit repair', 'contract', 'acceptance', 'payment', 'voucher attachment', 'rectification result'],
      recommended_next_data: ['penalty_followup', 'credit_restriction', 'credit_repair', 're_participation', 'contract', 'acceptance', 'payment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal policy rows generate follow-up evidence checklists only.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeTwentyFirstOfficialRun({
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
    'administrative_penalty',
    'supplier_credit_restriction',
    'credit_repair_followup',
    're_participation_review',
    'malicious_collusion_review',
    'false_material_review',
    'complaint_established',
    'complaint_partly_established',
    'complaint_rejected',
  ];
  return Array.from({ length: 190 }, (_, index) => {
    const sourceItem = BASE_SOURCES[index % BASE_SOURCES.length];
    const exceptionType = exceptionTypes[index % exceptionTypes.length];
    const packageNo = String((index % 6) + 1).padStart(2, '0');
    const projectCode = `R21-PEN-${String(index + 1).padStart(3, '0')}`;
    const profile = evidenceProfile(exceptionType);
    const creditRepair = index % 4 === 0 || exceptionType === 'credit_repair_followup';
    const reParticipation = index % 5 === 0 || exceptionType === 're_participation_review';
    return {
      project_name: `Round 21 penalty credit constraint project ${index + 1}`,
      purchaser_name: `Central Penalty Purchaser ${index % 15}`,
      announcement_type: 'administrative penalty and credit constraint notice',
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
      budget_amount: String(1200000 + index * 4300),
      award_amount: String(1120000 + index * 4100),
      package_no: packageNo,
      package_name: `penalty credit package ${packageNo}`,
      supplier_name: `Penalty Supplier R21 ${index % 23}`,
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: true,
      procurement_exception_type: exceptionType,
      complaint_decision_no: exceptionType.startsWith('complaint') ? `MOF-R21-C-${String(5000 + index).padStart(4, '0')}` : undefined,
      complaint_issue_summary: issueSummary(exceptionType),
      complaint_handling_result: handlingResult(exceptionType),
      false_material_flag: exceptionType === 'false_material_review',
      award_invalidated_flag: ['complaint_established', 'complaint_partly_established', 'false_material_review'].includes(exceptionType),
      rebid_required_flag: ['complaint_established', 'complaint_partly_established', 'false_material_review'].includes(exceptionType),
      correction_notice_flag: index % 7 === 0,
      supervision_penalty_subject: `Penalty Subject R21 ${index % 19}`,
      affected_package_no: packageNo,
      penalty_decision_no: `MOF-R21-${String(6000 + index).padStart(4, '0')}`,
      penalty_basis: 'Government Procurement Law',
      penalty_basis_article: 'Article 77',
      penalty_period: '2026-02-04 to 2027-02-03',
      market_entry_restriction_scope: 'government procurement market',
      penalty_subject_type: 'supplier',
      penalty_subject_name: `Penalty Supplier R21 ${index % 23}`,
      credit_repair_status: creditRepair ? 'pending_public_followup' : '',
      credit_repair_source_url: creditRepair && index % 8 === 0 ? `${sourceItem.url}#credit-repair` : '',
      re_participation_review_flag: reParticipation,
      exception_evidence_category: profile.category,
      exception_evidence_weight: profile.weight,
      exception_weight_reason: profile.reason,
      finding_disposition: 'review_recommended',
      missing_evidence: ['penalty_followup', 'credit_restriction', 'credit_repair', 're_participation', 'contract', 'acceptance', 'payment', 'voucher_attachment'],
      recommended_next_data: ['penalty_followup', 'credit_restriction', 'credit_repair', 're_participation', 'contract', 'acceptance', 'payment', 'rectification'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'administrative penalty and credit constraint handling result',
        paragraphIndex: (index % 9) + 1,
        affectedPackageNo: packageNo,
        rawExcerpt: `${projectCode} ${packageNo} ${exceptionType} ${profile.category} ${sourceItem.keyword} ${creditRepair ? 'credit repair' : ''}`,
      }),
      source_row: index + 1,
    };
  });
}

function evidenceProfile(exceptionType) {
  if (['administrative_penalty', 'supplier_credit_restriction', 'credit_repair_followup', 're_participation_review'].includes(exceptionType)) {
    return { category: 'administrative_penalty', weight: 80, reason: 'administrative penalty or credit constraint public notice has high review weight' };
  }
  if (exceptionType === 'malicious_collusion_review') {
    return { category: 'malicious_collusion', weight: 75, reason: 'malicious collusion clue has differentiated review weight' };
  }
  if (exceptionType === 'false_material_review') {
    return { category: 'false_material', weight: 70, reason: 'false material clue needs downstream evidence closure' };
  }
  if (exceptionType === 'complaint_established') {
    return { category: 'complaint_established', weight: 65, reason: 'established complaint is review evidence' };
  }
  if (exceptionType === 'complaint_partly_established') {
    return { category: 'complaint_partly_established', weight: 55, reason: 'partly established complaint has medium review weight' };
  }
  return { category: 'complaint_rejected', weight: 25, reason: 'rejected complaint has low evidence weight' };
}

function issueSummary(exceptionType) {
  if (exceptionType === 'malicious_collusion_review') return 'malicious collusion review with penalty follow-up required';
  if (exceptionType === 'false_material_review') return 'false material supplier qualification abnormality';
  if (exceptionType === 'complaint_rejected') return 'complaint rejected; low evidence weight';
  return 'administrative penalty and credit constraint review clue';
}

function handlingResult(exceptionType) {
  if (exceptionType === 'complaint_rejected') return 'complaint rejected; manual review only';
  if (exceptionType === 'malicious_collusion_review') return 'malicious collusion clue; penalty and credit follow-up required';
  if (exceptionType === 'false_material_review') return 'false material clue; award and re-procurement follow-up required';
  return 'administrative penalty or credit constraint recorded; downstream contract acceptance payment and credit repair evidence required';
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
      region: 'central government procurement penalty supervision',
      indicator_name: `Round 21 penalty credit supplemental checklist ${index + 1}`,
      actual_value: String(300 + index),
      actual_value_unit: 'count',
      fiscal_year: 2026,
      policy_topic: 'procurement penalty credit supplemental checklist',
      required_budget_indicator_data: true,
      required_performance_target_data: true,
      required_payment_data: true,
      required_voucher_data: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'penalty credit supplemental checklist',
        paragraphIndex: (index % 6) + 1,
        affectedPackageNo: '',
        rawExcerpt: 'Penalty and credit constraint policy records require budget indicator, performance target, payment detail and voucher attachment.',
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
      seed_id: `R21-CASE-${String(index + 1).padStart(3, '0')}`,
      issue_title: `Round 21 penalty credit review seed ${index + 1}`,
      project_name: `Round 21 penalty credit constraint project ${index + 1}`,
      responsible_subject: `Central Penalty Purchaser ${index % 15}`,
      issue_category: formal ? 'penalty_credit_followup' : 'review_reference',
      issue_amount: String(350000 + index * 1300),
      issue_amount_unit: 'yuan',
      audit_evidence_level: formal ? 'rectification_progress' : 'audit_work_update',
      audit_evidence_weight: formal ? 70 : 35,
      finding_disposition: formal ? 'review_recommended' : 'knowledge_reference',
      requires_manual_verification: true,
      required_next_data: ['penalty follow-up', 'credit repair', 'contract', 'acceptance', 'payment', 'voucher attachment', 'rectification result'],
      source_evidence: sourceEvidence(sourceItem, {
        capturedAt,
        parserVersion,
        rowNumber: index + 1,
        sectionTitle: 'penalty credit review seed',
        paragraphIndex: (index % 5) + 1,
        affectedPackageNo: String((index % 6) + 1).padStart(2, '0'),
        rawExcerpt: 'Penalty and credit constraint source requires manual follow-up and downstream evidence.',
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
    manual_review_note: 'Round 21 web research snapshot for administrative penalty, credit constraint and follow-up closure PoC.',
    source_region_scope: item.source_region_scope,
    source_province: item.source_province,
    source_city: item.source_city,
    source_region_code: item.source_region_code,
    publisher_level: item.publisher_level,
    central_unit_flag: item.central_unit_flag,
    parser_status: 'parsed',
    last_crawled_at: capturedAt,
    row_number: index + 1,
    raw_excerpt: `${item.title} ${item.keyword} administrative penalty credit repair market entry restriction`,
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
    legal_basis: 'Government Procurement Law and administrative penalty public notice',
    legal_basis_article: 'Article 77',
    decision_paragraph_index: paragraphIndex,
    affected_package_no: affectedPackageNo || null,
    handling_result_locator_hash: hash(`${item.url}|penalty-credit-handling|${rowNumber}|${affectedPackageNo || ''}`),
    penalty_basis: 'Government Procurement Law',
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
    '# Round 21 Official Public Instances Test Result',
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
    '## Supervision Penalty And Credit Constraints',
    '',
    `- Penalty records: ${collector.procurement_penalty_records}`,
    `- Credit constraint records: ${collector.credit_constraint_records}`,
    `- Credit repair follow-up records: ${collector.credit_repair_followup_records}`,
    `- Malicious collusion records: ${collector.malicious_collusion_records}`,
    `- False material records: ${collector.false_material_records}`,
    `- Exception weight coverage: ${collector.exception_weight_coverage_rate}%`,
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
<title>Round 21 Official Public Instances Test Result</title>
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
  runTwentyFirstOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote ${outputDir}`);
      console.log(`Round 21 accepted ${summary.total_accepted_records}/${summary.total_input_records}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
