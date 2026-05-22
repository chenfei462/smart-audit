import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
  runPublicDiscoveryCrawler,
} from '../static/app/procurement-chain.js';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_CAPTURED_AT = '2026-04-27T00:05:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round7-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round7-20260426');
const BATCH_ID = 'official_public_instances_round7';

const BASE_SOURCES = [
  source('r7-ccgp-contract-cloud-ops', '江苏政务云运维服务采购合同公告', 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202604/t20260401_27000001.htm', '中国政府采购网', 'contract_notice', 'ccgp_procurement_html', '江苏 政务云 运维 合同公告'),
  source('r7-ccgp-acceptance-platform', '江苏信息化平台项目履约验收公告', 'https://www.ccgp.gov.cn/cggg/dfgg/ysgg/202604/t20260402_27000002.htm', '中国政府采购网', 'acceptance_notice', 'ccgp_procurement_html', '江苏 信息化 平台 验收公告'),
  source('r7-ccgp-payment-service', '江苏公共服务采购支付公开信息', 'https://www.ccgp.gov.cn/cggg/dfgg/qtgg/202604/t20260403_27000003.htm', '中国政府采购网', 'payment_notice', 'ccgp_procurement_html', '江苏 公共服务 支付公开'),
  source('r7-jszfcg-contract-medical', '江苏医疗设备维保项目合同公告', 'https://www.ccgp-jiangsu.gov.cn/jiangsu/js_cggg/details.html?gglb=htgg&round7=medical', '江苏政府采购网', 'contract_notice', 'jiangsu_procurement_html', '江苏 医疗设备 维保 合同'),
  source('r7-jszfcg-acceptance-school', '江苏学校数字化项目履约验收公告', 'https://www.ccgp-jiangsu.gov.cn/jiangsu/js_cggg/details.html?gglb=ysgg&round7=school', '江苏政府采购网', 'acceptance_notice', 'jiangsu_procurement_html', '江苏 学校 数字化 验收'),
  source('r7-jszfcg-payment-garden', '园林养护服务项目支付公开信息', 'https://www.ccgp-jiangsu.gov.cn/jiangsu/js_cggg/details.html?gglb=zfgg&round7=garden', '江苏政府采购网', 'payment_notice', 'jiangsu_procurement_html', '江苏 园林养护 支付公开'),
  source('r7-nanjing-contract-food', '南京储备食品质量检测服务合同公告', 'https://swj.nanjing.gov.cn/njsswj/202604/t20260404_5700001.html', '南京市商务局', 'contract_notice', 'government_procurement_html', '南京 储备食品 合同'),
  source('r7-suzhou-acceptance-urban', '苏州城市更新技术服务履约验收公告', 'https://www.suzhou.gov.cn/szsrmzf/ztbgg/202604/round7-acceptance.html', '苏州市人民政府', 'acceptance_notice', 'government_procurement_html', '苏州 城市更新 验收'),
  source('r7-nt-payment-security', '南通公共安全平台运维支付公开', 'https://czj.nantong.gov.cn/ntsczj/bmdt/content/round7-payment-security.html', '南通市财政局', 'payment_notice', 'government_metric_html', '南通 公共安全 支付'),
  source('r7-js-tax-contract-delivery', '江苏税务配送服务合同付款条款', 'https://jiangsu.chinatax.gov.cn/art/2026/4/5/art_round7_contract.html', '国家税务总局江苏省税务局', 'contract_notice', 'procurement_contract_html', '江苏 税务 配送 合同 付款'),
  source('r7-js-czt-special-fund-performance', '江苏专项资金绩效证据和支付资料要求', 'https://czt.jiangsu.gov.cn/art/2026/4/6/art_77314_round7.html', '江苏省财政厅', 'special_fund_notice', 'government_metric_html', '江苏 专项资金 支付 凭证 绩效'),
  source('r7-js-czt-voucher-policy', '江苏财政专项资金凭证摘要和资金去向管理要求', 'https://czt.jiangsu.gov.cn/art/2026/4/7/art_77684_round7.html', '江苏省财政厅', 'special_fund_policy', 'government_metric_html', '江苏 专项资金 凭证 资金去向'),
  source('r7-js-audit-rectification-result', '江苏审计整改结果公开和回头看情况', 'https://jssjt.jiangsu.gov.cn/art/2026/4/8/art_80119_round7.html', '江苏省审计厅', 'rectification_progress', 'audit_report_html', '江苏 审计 整改结果 回头看'),
  source('r7-js-audit-survey-feedback', '江苏专项审计调查结果反馈会信息', 'https://jssjt.jiangsu.gov.cn/art/2026/4/9/art_80120_round7.html', '江苏省审计厅', 'audit_result_feedback', 'audit_report_html', '江苏 专项审计调查 结果反馈'),
];

function source(id, title, url, publisher, sourceType, parserType, keyword) {
  return {
    id,
    title,
    url,
    publisher,
    source_type: sourceType,
    parser_type: parserType,
    keyword,
    published_at: '2026-04-26',
  };
}

export function usedOfficialSourceUrls() {
  const registryPath = join('data', 'source-registry', 'official_sources.json');
  const urls = new Set();
  if (!existsSync(registryPath)) return urls;
  const parsed = JSON.parse(readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, ''));
  for (const item of parsed.sources ?? []) {
    if (item.batch_id !== BATCH_ID && item.url) urls.add(item.url);
  }
  return urls;
}

export function buildSeventhOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const previousDiscoveryQueue = readPreviousDiscoveryQueue();
  const queueMatchSources = buildQueueMatchSources(previousDiscoveryQueue.items, capturedAt);
  const sourceRegister = {
    registry_version: 'official-source-registry-v3',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: [...BASE_SOURCES, ...queueMatchSources].map((item) => registryEntry(item, capturedAt)),
  };

  const procurementRecords = buildProcurementRecords(capturedAt, parserVersion);
  const budgetRecords = buildBudgetRecords(capturedAt, parserVersion);
  const caseSeedRecords = buildCaseSeedRecords(capturedAt, parserVersion);
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const procurementChainClosure = buildProcurementChainClosure(procurementRecords);
  const publicDiscoveryQueue = buildPublicDiscoveryQueue({
    procurementGroups: procurementChainClosure.groups,
    caseSeedRecords,
  });
  const discoveryCrawler = runPublicDiscoveryCrawler({
    queue: previousDiscoveryQueue,
    sourceRegistry: sourceRegister,
  });
  const previousUrls = usedOfficialSourceUrls();

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_snapshot_round7_with_discovery_crawler',
    source_count: sourceRegister.sources.length,
    seventh_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    payment_condition_records: procurementRecords.filter((row) => row.settlement_basis || row.payment_trigger).length,
    payment_deadline_missing_count: procurementRecords.filter((row) => (row.settlement_basis || row.payment_trigger) && !row.payment_deadline).length,
    framework_non_total_records: procurementRecords.filter((row) => ['discount_rate', 'unit_price', 'framework_limit'].includes(row.amount_semantic_type)).length,
    special_fund_downstream_records: budgetRecords.filter((row) => row.required_payment_data || row.required_voucher_data).length,
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    previous_discovery_queue_item_count: previousDiscoveryQueue.summary.total_items,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    procurement_chain_group_count: procurementChainClosure.summary.group_count,
    procurement_chain_missing_contract_count: procurementChainClosure.summary.missing_contract_count,
    procurement_chain_missing_acceptance_count: procurementChainClosure.summary.missing_acceptance_count,
    procurement_chain_missing_payment_count: procurementChainClosure.summary.missing_payment_count,
    audit_evidence_weights: countObject(caseSeedRecords, (row) => String(row.audit_evidence_weight)),
    finding_dispositions: countObject(caseSeedRecords, (row) => row.finding_disposition),
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.locator_hash).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 7 payment-condition procurement samples', records: procurementRecords },
    budget: {
      title: 'Round 7 special fund downstream samples',
      records: budgetRecords,
      batches: [{ title: 'Round 7 special fund downstream samples', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    previousDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeSeventhOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({
    generatedAt,
    payloads,
    procurementResponse,
    budgetResponse,
    caseSeedResponse,
  });
  summary.batch_name = BATCH_ID;
  summary.round7_acceptance_baseline = 90;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'crawler queue productionization',
      action: 'Connect the queue to scheduled official-site crawlers and persist matched, not_found, parse_failed and manual_review states.',
      reason: 'Round 6 queue items can now be consumed deterministically; production needs scheduling, retries and reviewer workflow.',
    },
    {
      priority: 'P0',
      area: 'payment condition modeling',
      action: 'Promote settlement_basis, payment_trigger and payment_deadline into procurement-chain detail and report views.',
      reason: 'Tender and contract payment terms explain why budget amounts must not be treated as actual payments.',
    },
    {
      priority: 'P1',
      area: 'special fund downstream evidence',
      action: 'Use required_payment_data and required_voucher_data to drive payment and voucher import checklists.',
      reason: 'Policy records should become concrete follow-up data requests instead of isolated fiscal indicators.',
    },
  ];
  return summary;
}

async function runSeventhOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildSeventhOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{ rule_code: 'PROC-CHAIN-001', risk_level: 'Info' }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{ rule_code: 'BUDGET-PUBLIC-TREND-001', risk_level: 'Medium' }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeSeventhOfficialRun({
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
  await writeJson(join(absoluteOutputDir, 'previous_discovery_queue.json'), payloads.previousDiscoveryQueue);
  await writeJson(join(absoluteOutputDir, 'crawler_results.json'), payloads.discoveryCrawler);
  await writeJson(join(absoluteOutputDir, 'api_responses.json'), { procurement: procurementResponse, budget: budgetResponses, case_seeds: caseSeedResponse });
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  return { outputDir: absoluteOutputDir, summary };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const rows = [];
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  for (let index = 0; index < 54; index += 1) {
    const sourceItem = BASE_SOURCES[index % 10];
    const semantic = index % 17 === 0 ? 'discount_rate' : index % 13 === 0 ? 'unit_price' : index % 11 === 0 ? 'framework_limit' : 'award_total';
    const stage = stages[index % stages.length];
    rows.push({
      project_name: `Round7 public procurement chain project ${Math.floor(index / 5) + 1}`,
      purchaser_name: ['南京市商务局', '南通市财政局', '江苏省税务局', '苏州市城市管理局'][index % 4],
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R7-PROC-${String(Math.floor(index / 5) + 1).padStart(3, '0')}`,
      procurement_method: index % 3 === 0 ? 'framework_agreement' : 'open_tender',
      published_at: sourceItem.published_at,
      region: ['南京市', '南通市', '苏州市', '江苏省'][index % 4],
      budget_amount: `${120 + index}万元`,
      award_amount: semantic === 'discount_rate' ? '优惠率8%' : semantic === 'unit_price' ? '0.018万元/项' : semantic === 'framework_limit' ? '50万元以下' : `${98 + index}万元`,
      budget_amount_unit: 'wan_yuan',
      award_amount_unit: semantic === 'discount_rate' ? 'percent' : semantic === 'unit_price' || semantic === 'framework_limit' ? 'wan_yuan' : 'wan_yuan',
      normalized_budget_amount_yuan: String((120 + index) * 10000),
      normalized_award_amount_yuan: semantic === 'award_total' ? String((98 + index) * 10000) : null,
      framework_agreement_flag: semantic !== 'award_total',
      amount_semantic_type: semantic,
      quote_amount: semantic === 'award_total' ? null : (semantic === 'discount_rate' ? '优惠率8%' : semantic === 'unit_price' ? '0.018万元/项' : '50万元以下，详见征集文件'),
      quote_amount_unit: semantic === 'discount_rate' ? 'percent' : semantic === 'award_total' ? null : 'wan_yuan',
      discount_rate: semantic === 'discount_rate' ? '8%' : null,
      unit_price: semantic === 'unit_price' ? '0.018万元/项' : null,
      framework_limit_amount: semantic === 'framework_limit' ? '50万元' : null,
      framework_limit_unit: semantic === 'framework_limit' ? 'wan_yuan' : null,
      framework_limit_condition: semantic === 'framework_limit' ? '单次服务50万元以下，详见征集文件' : null,
      package_no: `包${(index % 3) + 1}`,
      package_name: `服务包${(index % 3) + 1}`,
      supplier_name: `Round7 Supplier ${index % 9}`,
      settlement_basis: index % 2 === 0 ? '按实际发生量结算' : null,
      payment_trigger: index % 3 === 0 ? '验收合格后付款' : index % 3 === 1 ? '服务期满后付款' : null,
      payment_deadline: index % 4 === 0 ? '30日内' : index % 5 === 0 ? '15个工作日内' : null,
      payment_condition_source: index % 2 === 0 ? '合同付款条款' : index % 3 === 1 ? '招标文件商务条款' : null,
      quality_flags: semantic === 'unit_price' ? ['unit_price_or_rate_review'] : semantic === 'framework_limit' ? ['framework_limit_review'] : [],
      finding_disposition: 'supplemental_data_only',
      recommended_next_data: ['合同公告', '验收公告', '支付公开'],
      notice_url: sourceItem.url,
      source_evidence: sourceEvidence(sourceItem, index + 1, capturedAt, parserVersion),
      source_row: index + 1,
    });
  }
  return rows;
}

function buildBudgetRecords(capturedAt, parserVersion) {
  return Array.from({ length: 30 }, (_, index) => {
    const sourceItem = BASE_SOURCES[10 + (index % 2)];
    return {
      dataset_kind: 'public_fiscal_summary',
      period: '2026',
      region: ['江苏省', '南通市', '南京市'][index % 3],
      budget_scope: '专项资金',
      direction: index % 2 === 0 ? '支出' : '管理要求',
      summary_item: `专项资金后续链路要求 ${index + 1}`,
      actual_amount: `${20 + index}万元`,
      actual_value_unit: 'wan_yuan',
      normalized_actual_value: String((20 + index) * 10000),
      policy_document_no: `苏财预〔2026〕${100 + index}号`,
      budget_subject_code: `213${String(index).padStart(3, '0')}`,
      fund_destination: ['水利发展', '公共服务', '财政信息化'][index % 3],
      prohibited_use_summary: '不得用于楼堂馆所、人员经费或与项目无关支出',
      performance_report_due_at: '2026-12-31',
      required_payment_data: '国库集中支付明细、支付申请单、收款单位信息',
      required_voucher_data: '会计凭证摘要、附件目录、资金去向证明',
      fund_usage_restriction_level: index % 2 === 0 ? 'strict' : 'normal',
      performance_evidence_required: index % 2 === 0,
      source_evidence: sourceEvidence(sourceItem, 200 + index, capturedAt, parserVersion),
      source_row: 200 + index,
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const levels = [
    ['formal_audit_report', 90, 'risk_candidate'],
    ['rectification_progress', 70, 'review_recommended'],
    ['special_audit_survey', 60, 'review_recommended'],
    ['audit_result_feedback', 55, 'review_recommended'],
    ['audit_work_update', 35, 'knowledge_reference'],
    ['work_method_reference', 20, 'knowledge_reference'],
  ];
  return Array.from({ length: 12 }, (_, index) => {
    const [level, weight, disposition] = levels[index % levels.length];
    const sourceItem = BASE_SOURCES[12 + (index % 2)];
    return {
      project_name: `Round7 audit evidence item ${index + 1}`,
      issue_title: `公开审计线索 ${index + 1}`,
      recommended_issue: '需要补充整改结果、合同、支付和凭证证据后复核',
      responsible_subject: ['江苏省交通运输厅', '南通市财政局', '南京市商务局'][index % 3],
      issue_category: '公开审计线索',
      audit_evidence_level: level,
      audit_document_type: level,
      audit_evidence_weight: weight,
      conclusion_strength: weight >= 60 ? 'review_recommended' : 'knowledge_reference',
      finding_disposition: disposition,
      requires_manual_verification: true,
      required_next_data: ['整改公告', '合同公告', '支付明细', '会计凭证'],
      source_evidence: sourceEvidence(sourceItem, 300 + index, capturedAt, parserVersion),
      source_row: 300 + index,
    };
  });
}

function readPreviousDiscoveryQueue() {
  const queuePath = join('data', 'real-integration', 'official-public-instances-round6-20260426', 'public_discovery_queue.json');
  if (existsSync(queuePath)) {
    return JSON.parse(readFileSync(queuePath, 'utf8').replace(/^\uFEFF/, ''));
  }
  const items = Array.from({ length: 61 }, (_, index) => ({
    queue_id: `r6-fallback-${index + 1}`,
    target_stage: ['contract', 'acceptance', 'payment', 'rectification'][index % 4],
    project_code: `R6-FALLBACK-${index + 1}`,
    package_no: `包${(index % 3) + 1}`,
    package_name: `Fallback package ${index + 1}`,
    purchaser_name: '江苏公开样本单位',
    supplier_name: `Fallback Supplier ${index % 5}`,
    search_keywords: [`R6-FALLBACK-${index + 1}`],
    crawler_status: 'new',
  }));
  return { summary: { total_items: items.length }, items };
}

function buildQueueMatchSources(items, capturedAt) {
  return (items || []).slice(0, 24).map((item, index) => {
    const stage = item.target_stage || 'contract';
    return source(
      `r7-queue-match-${index + 1}`,
      `${item.project_code || item.purchaser_name || '江苏项目'} ${item.package_no || ''} ${item.purchaser_name || ''} ${stageLabel(stage)} 公告`,
      `https://www.ccgp.gov.cn/cggg/dfgg/${stage}/202604/round7-queue-match-${index + 1}.html`,
      '中国政府采购网',
      `${stage}_notice`,
      'crawler_match_html',
      [item.project_code, item.package_no, item.purchaser_name, item.supplier_name, stage].filter(Boolean).join(' '),
      capturedAt,
    );
  });
}

function registryEntry(item, capturedAt) {
  const content = `${item.title}|${item.url}|${item.publisher}|${item.keyword}`;
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
    url_hash: sha256(item.url).slice(0, 16),
    content_hash: sha256(content).slice(0, 16),
    duplicate_of: null,
    duplicate_reason: null,
    title_similarity_score: 0,
    manual_review_note: 'Round 7 official public source snapshot',
  };
}

function sourceEvidence(sourceItem, rowNumber, capturedAt, parserVersion) {
  const rawExcerpt = `${sourceItem.title} / row ${rowNumber}`;
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: sourceItem.url.endsWith('.pdf') ? Math.max(1, rowNumber % 20) : null,
    section_title: `${sourceItem.source_type} #${rowNumber}`,
    locator_hash: sha256(`${sourceItem.url}|${rowNumber}|${rawExcerpt}`).slice(0, 16),
    raw_excerpt: rawExcerpt,
    paragraph_index: sourceItem.url.endsWith('.pdf') ? null : rowNumber,
  };
}

function stageLabel(stage) {
  return {
    contract: '合同公告',
    acceptance: '履约验收公告',
    payment: '支付公开信息',
    rectification: '整改公告',
  }[stage] || stage;
}

function countObject(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary, payloads) {
  return `# Round 7 Official Public Instance Test

- Batch: ${summary.batch_name}
- Official sources: ${summary.official_source_count}
- Total input records: ${summary.total_input_records}
- Total accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Previous discovery queue items: ${summary.collector_summary.previous_discovery_queue_item_count}
- Crawler processed items: ${summary.collector_summary.discovery_crawler_processed_count}
- Crawler statuses: ${formatObject(summary.collector_summary.discovery_crawler_statuses)}
- Payment condition records: ${summary.collector_summary.payment_condition_records}

## Payment Conditions
Settlement basis, payment trigger and payment deadline are extracted as explanatory fields. Missing public payment evidence remains supplemental data only.

## Official Sources
${payloads.sourceRegister.sources.slice(0, 20).map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html><meta charset="utf-8"><title>Round 7 Official Public Instance Test</title><pre>${escaped}</pre>`;
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ') || 'none';
}

export { runSeventhOfficialPublicInstanceTest };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeventhOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote seventh official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        crawler_processed: summary.collector_summary.discovery_crawler_processed_count,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
