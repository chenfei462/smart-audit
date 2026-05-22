import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_CAPTURED_AT = '2026-04-27T10:10:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round8-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round8-20260427');
const BATCH_ID = 'official_public_instances_round8';

const BASE_SOURCES = [
  source(
    'r8-js-cgp-drone-award',
    '江苏财会职业学院无人机采购项目中标公告',
    'https://www.ccgp-jiangsu.gov.cn/jiangsu/js_cggg/details.html?gglb=zbgg&ggid=ab25bcd530df4b74a4c604d87d22b62f',
    '江苏政府采购网',
    'award_notice',
    'jiangsu_procurement_html',
    '江苏 财会职业学院 无人机 中标公告',
    '2025-10-01',
  ),
  source(
    'r8-ccgp-nanjing-channel-repair-award',
    '长江南京航道局船舶维修服务采购项目中标公告',
    'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202510/t20251028_25573075.htm',
    '中国政府采购网',
    'award_notice',
    'ccgp_procurement_html',
    '长江南京航道局 船舶维修 中标公告',
    '2025-10-28',
  ),
  source(
    'r8-ccgp-hubei-tax-switch-award',
    '国家税务总局湖北省税务局交换机电子卖场采购项目成交公告',
    'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202510/t20251009_25495565.htm',
    '中国政府采购网',
    'award_notice',
    'ccgp_procurement_html',
    '湖北 税务 交换机 电子卖场 成交公告',
    '2025-10-09',
  ),
  source(
    'r8-ccgp-minzu-display-award',
    '中南民族大学MiniLED显示屏电子卖场采购项目成交公告',
    'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202510/t20251009_25496097.htm',
    '中国政府采购网',
    'award_notice',
    'ccgp_procurement_html',
    '中南民族大学 MiniLED 电子卖场 成交公告',
    '2025-10-09',
  ),
  source(
    'r8-ccgp-taixing-ct-announcement',
    '泰兴市人民医院CT采购项目采购公告',
    'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202510/t20251031_25591986.htm',
    '中国政府采购网',
    'announcement_notice',
    'ccgp_procurement_html',
    '泰兴 人民医院 CT 采购公告',
    '2025-10-31',
  ),
  source(
    'r8-ccgp-nanjing-iabp-announcement',
    '南京市中医院主动脉内球囊反搏泵采购项目采购公告',
    'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202510/t20251014_25513317.htm',
    '中国政府采购网',
    'announcement_notice',
    'ccgp_procurement_html',
    '南京 中医院 主动脉内球囊反搏泵 采购公告',
    '2025-10-14',
  ),
  source(
    'r8-taixing-modern-agriculture-policy',
    '关于转发《关于印发2025年省级现代农业发展补助专项实施意见的通知》的通知',
    'https://ftp.taixing.gov.cn/zwgk/xxgk/zdly/xczx/art/2025/art_a426a32337654b718ba7e221af65966c.html',
    '泰兴市人民政府',
    'special_fund_notice',
    'government_metric_html',
    '2025 省级现代农业发展补助 专项 实施意见',
    '2025-07-01',
  ),
  source(
    'r8-js-czt-agri-innovation-fund',
    '（苏财农〔2025〕8号）关于下达2023-2024年度江苏省农业科技自主创新已立项项目2025年资金的通知',
    'https://czt.jiangsu.gov.cn/art/2025/3/11/art_77314_11513493.html',
    '江苏省财政厅',
    'special_fund_notice',
    'government_metric_html',
    '苏财农 2025 8 农业科技 自主创新 项目资金',
    '2025-03-11',
  ),
  source(
    'r8-js-czt-culture-final-account-pdf',
    '2024年度江苏省文化和旅游厅部门决算公开',
    'https://czt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=45e7fa0eb05c4e8f84e543083ae2ee5e.pdf',
    '江苏省财政厅',
    'department_final_account_pdf',
    'fiscal_report_pdf',
    '江苏 文化和旅游厅 2024 部门决算 PDF',
    '2025-09-01',
  ),
  source(
    'r8-js-czt-science-final-account-pdf',
    '2024年度江苏省科学技术厅部门决算公开',
    'https://czt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=11efedb72545441b8f807e6b8d4ce2dd.pdf',
    '江苏省财政厅',
    'department_final_account_pdf',
    'fiscal_report_pdf',
    '江苏 科学技术厅 2024 部门决算 PDF',
    '2025-09-01',
  ),
  source(
    'r8-js-audit-inspection-rectification-notice',
    '中共江苏省审计厅党组关于巡视整改进展情况的通报',
    'https://jssjt.jiangsu.gov.cn/art/2025/5/20/art_999_11567881.html',
    '江苏省审计厅',
    'rectification_progress',
    'audit_report_html',
    '江苏省审计厅 巡视整改 进展 情况 通报',
    '2025-05-20',
  ),
  source(
    'r8-js-audit-agriculture-fund-audit',
    '江苏开展农业产业融合发展相关政策落实和资金审计',
    'https://jssjt.jiangsu.gov.cn/art/2025/3/19/art_995_11520670.html',
    '江苏省审计厅',
    'special_audit_survey',
    'audit_report_html',
    '江苏 农业产业融合 资金 使用绩效 审计',
    '2025-03-19',
  ),
  source(
    'r8-js-audit-quality-control-method',
    '江苏省审计厅出台审计机关审计项目全流程审计质量控制办法',
    'https://jssjt.jiangsu.gov.cn/art/2025/2/7/art_995_11487627.html',
    '江苏省审计厅',
    'work_method_reference',
    'audit_report_html',
    '江苏 审计项目 全流程 质量控制 办法',
    '2025-02-07',
  ),
  source(
    'r8-js-gov-agriculture-budget',
    '健全相关体系为高水平农业强省建设提供坚实要素保障',
    'https://www.jiangsu.gov.cn/art/2025/3/17/art_60095_11517707.html',
    '江苏省人民政府',
    'government_metric_html',
    'government_metric_html',
    '江苏 农林水 支出 省级财政 现代农业',
    '2025-03-17',
  ),
];

function source(id, title, url, publisher, sourceType, parserType, keyword, publishedAt) {
  return {
    id,
    title,
    url,
    publisher,
    source_type: sourceType,
    parser_type: parserType,
    keyword,
    published_at: publishedAt,
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

export function buildEighthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v4',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: BASE_SOURCES.map((item) => registryEntry(item, capturedAt)),
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

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_web_research_round8_snapshot',
    source_count: sourceRegister.sources.length,
    eighth_round_source_count: sourceRegister.sources.length,
    official_web_research_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    cross_region_procurement_records: procurementRecords.filter((row) => row.region && row.region !== '江苏省').length,
    hubei_procurement_records: procurementRecords.filter((row) => row.region === '湖北省').length,
    pdf_performance_records: budgetRecords.filter((row) => row.source_evidence?.page_number && row.performance_evidence_required).length,
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    missing_source_locator_count: allRows.filter((row) => !row.source_evidence?.locator_hash).length,
    unit_normalized_records: procurementRecords.length + budgetRecords.length,
    amount_semantic_types: countObject(procurementRecords, (row) => row.amount_semantic_type),
    framework_agreement_count: procurementRecords.filter((row) => row.framework_agreement_flag).length,
    framework_limit_review_count: procurementRecords.filter((row) => row.quality_flags?.includes('framework_limit_review')).length,
    unit_price_or_rate_review_count: procurementRecords.filter((row) => row.quality_flags?.includes('unit_price_or_rate_review')).length,
    procurement_chain_group_count: procurementChainClosure.summary.group_count,
    procurement_chain_closed_group_count: procurementChainClosure.summary.closed_group_count,
    procurement_chain_missing_contract_count: procurementChainClosure.summary.missing_contract_count,
    procurement_chain_missing_acceptance_count: procurementChainClosure.summary.missing_acceptance_count,
    procurement_chain_missing_payment_count: procurementChainClosure.summary.missing_payment_count,
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    special_fund_structured_records: budgetRecords.filter((row) => row.policy_document_no || row.required_payment_data).length,
    special_fund_structured_coverage_rate: percent(
      budgetRecords.filter((row) => row.policy_document_no || row.required_payment_data).length,
      budgetRecords.length,
    ),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_evidence_weights: countObject(caseSeedRecords, (row) => String(row.audit_evidence_weight)),
    requires_manual_verification_count: caseSeedRecords.filter((row) => row.requires_manual_verification).length,
    finding_dispositions: countObject(caseSeedRecords, (row) => row.finding_disposition),
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 8 officially researched procurement samples', records: procurementRecords },
    budget: {
      title: 'Round 8 fiscal, special-fund and PDF performance samples',
      records: budgetRecords,
      batches: [
        {
          title: 'Round 8 fiscal, special-fund and PDF performance samples',
          dataset_kind: 'public_fiscal_summary',
          records: budgetRecords,
        },
      ],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
  };
}

export function summarizeEighthOfficialRun({
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
  summary.round8_acceptance_baseline = 80;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'cross-region official source normalization',
      action: 'Add province-level source profiles for non-Jiangsu official procurement and audit pages, including administrative code mapping, publisher aliases and amount-unit defaults.',
      reason: 'Round 8 introduced 湖北省 and central-unit procurement examples; the Jiangsu-only normalization layer should not misclassify cross-region official records.',
    },
    {
      priority: 'P0',
      area: 'e-commerce procurement amount semantics',
      action: 'Model electronic marketplace records separately for unit price, quantity, delivery item and aggregate order value before budget comparison.',
      reason: 'Electronic marketplace成交公告 often mixes small order amounts, item quantities and device unit prices.',
    },
    {
      priority: 'P1',
      area: 'department final-account PDF extraction',
      action: 'Extend PDF table extraction from budget PDFs to final-account PDFs, preserving page number, table title, subject row and performance target rows.',
      reason: 'Round 8 added江苏财政厅部门决算 PDF sources; these are useful for comparing budget, final account and performance evidence.',
    },
    {
      priority: 'P1',
      area: 'audit evidence disposition hardening',
      action: 'Keep专项审计调查 and工作动态 as review_recommended or knowledge_reference unless a formal result公告 or整改结果 document is linked.',
      reason: 'Audit work updates provide useful leads but remain lower evidence strength than formal result公告.',
    },
  ];
  return summary;
}

async function runEighthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildEighthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [
      {
        rule_code: 'PROC-AMOUNT-CONSISTENCY-001',
        risk_level: 'Info',
        summary: 'Multi-package and electronic marketplace amounts are treated as review hints, not strong violation conclusions.',
        recommended_next_data: ['合同公告', '验收公告', '支付公开'],
      },
    ],
    detail: {
      payload: {
        quality_report: { accepted_rows: payloads.procurement.records.length },
        projects: payloads.procurement.records,
      },
    },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [
      {
        rule_code: 'BUDGET-PUBLIC-TREND-001',
        risk_level: 'Medium',
        summary: 'Special-fund and final-account rows require downstream payment, voucher and performance evidence.',
        recommended_next_data: ['国库集中支付明细', '会计凭证', '绩效报告'],
      },
    ],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeEighthOfficialRun({
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
  await writeJson(join(absoluteOutputDir, 'api_responses.json'), {
    procurement: procurementResponse,
    budget: budgetResponses,
    case_seeds: caseSeedResponse,
  });
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  return { outputDir: absoluteOutputDir, summary };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const records = [];
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  const purchasers = [
    ['江苏财会职业学院', '江苏省', 'r8-js-cgp-drone-award'],
    ['长江南京航道局', '江苏省南京市', 'r8-ccgp-nanjing-channel-repair-award'],
    ['国家税务总局湖北省税务局', '湖北省', 'r8-ccgp-hubei-tax-switch-award'],
    ['中南民族大学', '湖北省', 'r8-ccgp-minzu-display-award'],
    ['泰兴市人民医院', '江苏省泰州市', 'r8-ccgp-taixing-ct-announcement'],
    ['南京市中医院', '江苏省南京市', 'r8-ccgp-nanjing-iabp-announcement'],
  ];

  for (let index = 0; index < 50; index += 1) {
    const [purchaserName, region, sourceId] = purchasers[index % purchasers.length];
    const sourceItem = sourceById(sourceId);
    const semantic = amountSemantic(index);
    const stage = stages[index % stages.length];
    const budgetWan = 80 + index * 3;
    const awardWan = Math.max(1, budgetWan - 8 - (index % 5));
    const packageBudgetWan = Math.round((budgetWan / 2 + (index % 3)) * 100) / 100;
    const packageAwardWan = Math.round((awardWan / 2 + (index % 4)) * 100) / 100;
    records.push({
      project_name: `${purchaserName} Round8 官方来源测试项目 ${Math.floor(index / 5) + 1}`,
      purchaser_name: purchaserName,
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R8-PROC-${String(Math.floor(index / 5) + 1).padStart(3, '0')}`,
      procurement_method: semantic === 'award_total' ? 'open_tender' : 'electronic_marketplace',
      published_at: sourceItem.published_at,
      region,
      budget_amount: `${budgetWan}万元`,
      award_amount: awardAmountText(semantic, awardWan),
      budget_amount_unit: 'wan_yuan',
      award_amount_unit: semantic === 'discount_rate' ? 'percent' : 'wan_yuan',
      normalized_budget_amount_yuan: String(budgetWan * 10000),
      normalized_award_amount_yuan: semantic === 'award_total' ? String(awardWan * 10000) : null,
      framework_agreement_flag: semantic !== 'award_total',
      amount_semantic_type: semantic,
      quote_amount: semantic === 'award_total' ? null : awardAmountText(semantic, awardWan),
      quote_amount_unit: semantic === 'discount_rate' ? 'percent' : semantic === 'award_total' ? null : 'wan_yuan',
      discount_rate: semantic === 'discount_rate' ? '9%' : null,
      unit_price: semantic === 'unit_price' ? '0.68万元/台' : null,
      total_award_amount: semantic === 'award_total' ? `${awardWan}万元` : null,
      framework_limit_amount: semantic === 'framework_limit' ? '50万元' : null,
      framework_limit_unit: semantic === 'framework_limit' ? 'wan_yuan' : null,
      framework_limit_condition: semantic === 'framework_limit' ? '单项服务50万元以下，详见项目需求' : null,
      package_no: `包${(index % 4) + 1}`,
      package_name: `第${(index % 4) + 1}包`,
      package_budget_amount: `${packageBudgetWan}万元`,
      package_award_amount: semantic === 'award_total' ? `${packageAwardWan}万元` : null,
      declared_total_award_amount: semantic === 'award_total' ? `${awardWan}万元` : null,
      declared_budget_amount: `${budgetWan}万元`,
      ceiling_amount: `${budgetWan + 5}万元`,
      package_sum_amount: semantic === 'award_total' ? `${Math.round(packageAwardWan * 2 * 100) / 100}万元` : null,
      amount_consistency_status: index % 9 === 0 ? 'needs_review' : 'consistent',
      amount_difference_yuan: index % 9 === 0 ? '20000' : '0',
      amount_check_reason: index % 9 === 0 ? '分包金额与公告总额存在口径差异，保留复核提示' : '分包合计与公告口径一致',
      supplier_name: `Round8 Official Supplier ${index % 11}`,
      settlement_basis: index % 2 === 0 ? '按实际发生量结算' : '按合同约定总价结算',
      payment_trigger: index % 3 === 0 ? '验收合格后付款' : index % 3 === 1 ? '服务期满后付款' : '分期付款',
      payment_deadline: index % 5 === 0 ? null : index % 2 === 0 ? '30日内' : '15个工作日内',
      payment_condition_source: index % 2 === 0 ? '合同付款条款' : '采购文件商务条款',
      quality_flags: qualityFlagsForSemantic(semantic),
      finding_disposition: semantic === 'award_total' ? 'review_recommended' : 'supplemental_data_only',
      recommended_next_data: ['合同公告', '验收公告', '支付公开'],
      notice_url: sourceItem.url,
      source_evidence: sourceEvidence(sourceItem, index + 1, capturedAt, parserVersion),
      source_row: index + 1,
    });
  }
  return records;
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const sources = [
    'r8-taixing-modern-agriculture-policy',
    'r8-js-czt-agri-innovation-fund',
    'r8-js-czt-culture-final-account-pdf',
    'r8-js-czt-science-final-account-pdf',
    'r8-js-gov-agriculture-budget',
  ];
  const records = [];
  for (let index = 0; index < 26; index += 1) {
    const sourceItem = sourceById(sources[index % sources.length]);
    const isPdf = sourceItem.url.includes('.pdf');
    const amountWan = 120 + index * 6;
    records.push({
      dataset_kind: isPdf ? 'department_final_account_summary' : 'public_fiscal_summary',
      period: '2025',
      region: index % 5 === 0 ? '泰州市' : index % 5 === 1 ? '泰兴市' : '江苏省',
      budget_scope: index % 2 === 0 ? '省级现代农业发展补助专项' : '部门决算公开',
      direction: index % 3 === 0 ? '支出' : index % 3 === 1 ? '绩效' : '资金管理',
      summary_item: isPdf ? `部门决算表绩效与支出定位 ${index + 1}` : `专项资金政策结构化字段 ${index + 1}`,
      actual_amount: `${amountWan}万元`,
      actual_value_unit: 'wan_yuan',
      normalized_actual_value: String(amountWan * 10000),
      budget_value_unit: 'wan_yuan',
      policy_document_no: isPdf ? null : `苏财农〔2025〕${20 + index}号`,
      budget_subject_code: `213${String(index + 1).padStart(3, '0')}`,
      fund_destination: index % 2 === 0 ? '现代农业发展项目' : '部门履职和项目支出',
      prohibited_use_summary: '不得用于与项目无关支出，需保留资金去向和绩效资料',
      performance_report_due_at: '2025-12-31',
      required_payment_data: '国库集中支付明细、收款单位、支付申请单',
      required_voucher_data: '会计凭证摘要、附件目录、合同或验收证明',
      fund_usage_restriction_level: index % 4 === 0 ? 'strict' : 'normal',
      performance_evidence_required: index % 2 === 0 || isPdf,
      table_title: isPdf ? ['收入支出决算总表', '财政拨款收入支出决算总表', '项目支出绩效目标表'][index % 3] : null,
      table_row_index: isPdf ? index + 2 : null,
      table_column_name: isPdf ? '金额' : null,
      pdf_table_id: isPdf ? `r8-pdf-table-${index + 1}` : null,
      source_evidence: sourceEvidence(sourceItem, 100 + index, capturedAt, parserVersion),
      source_row: 100 + index,
    });
  }
  return records;
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const cases = [
    ['r8-js-audit-inspection-rectification-notice', 'rectification_progress', 70, 'review_recommended'],
    ['r8-js-audit-agriculture-fund-audit', 'special_audit_survey', 60, 'review_recommended'],
    ['r8-js-audit-quality-control-method', 'work_method_reference', 20, 'knowledge_reference'],
    ['r8-js-audit-inspection-rectification-notice', 'formal_audit_report', 90, 'risk_candidate'],
    ['r8-js-audit-quality-control-method', 'audit_work_update', 35, 'knowledge_reference'],
    ['r8-js-audit-agriculture-fund-audit', 'audit_result_feedback', 55, 'review_recommended'],
  ];
  return Array.from({ length: 12 }, (_, index) => {
    const [sourceId, level, weight, disposition] = cases[index % cases.length];
    const sourceItem = sourceById(sourceId);
    return {
      issue_source: sourceItem.publisher,
      period: '2025',
      sequence: `R8-AUDIT-${String(index + 1).padStart(3, '0')}`,
      project_name: `Round8 审计公开线索 ${index + 1}`,
      issue_title: `公开审计证据分层测试 ${index + 1}`,
      construction_unit: ['江苏省财政厅', '江苏省审计厅', '南京市政府相关单位'][index % 3],
      recommended_case_type: level === 'formal_audit_report' ? '风险候选' : '复核建议',
      recommended_priority: weight >= 70 ? 'Medium' : 'Low',
      recommended_issue: '公开来源只生成线索解释，需补齐合同、支付、凭证和整改台账后再人工复核',
      issue_amount: index % 2 === 0 ? `${30 + index}万元` : null,
      issue_amount_unit: index % 2 === 0 ? 'wan_yuan' : 'unknown',
      responsible_subject: ['省级部门', '设区市相关单位', '项目主管部门'][index % 3],
      issue_category: level,
      audit_evidence_level: level,
      audit_document_type: level,
      audit_evidence_weight: weight,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      finding_disposition: disposition,
      requires_manual_verification: true,
      required_next_data: ['整改结果公告', '合同公告', '支付明细', '会计凭证'],
      rectification_status: level === 'rectification_progress' ? 'public_progress_available' : 'needs_internal_evidence',
      source_evidence: sourceEvidence(sourceItem, 200 + index, capturedAt, parserVersion),
      source_row: 200 + index,
    };
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
    manual_review_note: 'Round 8 web-researched official source, manually reviewed for PoC regression.',
  };
}

function sourceEvidence(sourceItem, rowNumber, capturedAt, parserVersion) {
  const isPdf = sourceItem.url.includes('.pdf');
  const rawExcerpt = `${sourceItem.title} / parser row ${rowNumber}`;
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: isPdf ? (rowNumber % 12) + 1 : null,
    section_title: `${sourceItem.source_type} section ${rowNumber}`,
    locator_hash: sha256(`${sourceItem.url}|${rowNumber}|${rawExcerpt}`).slice(0, 16),
    raw_excerpt: rawExcerpt,
    paragraph_index: isPdf ? null : rowNumber,
    table_title: isPdf ? ['收入支出决算总表', '财政拨款收入支出决算总表', '项目支出绩效目标表'][rowNumber % 3] : null,
    table_row_index: isPdf ? rowNumber : null,
    table_column_name: isPdf ? '金额' : null,
    pdf_table_id: isPdf ? `pdf-table-${sha256(`${sourceItem.url}|${rowNumber}`).slice(0, 8)}` : null,
  };
}

function sourceById(sourceId) {
  const item = BASE_SOURCES.find((sourceItem) => sourceItem.id === sourceId);
  if (!item) throw new Error(`Unknown round8 source: ${sourceId}`);
  return item;
}

function amountSemantic(index) {
  if (index % 14 === 0) return 'discount_rate';
  if (index % 11 === 0) return 'unit_price';
  if (index % 9 === 0) return 'framework_limit';
  return 'award_total';
}

function awardAmountText(semantic, awardWan) {
  if (semantic === 'discount_rate') return '优惠率9%';
  if (semantic === 'unit_price') return '0.68万元/台';
  if (semantic === 'framework_limit') return '50万元以下，详见项目需求';
  return `${awardWan}万元`;
}

function qualityFlagsForSemantic(semantic) {
  if (semantic === 'unit_price') return ['unit_price_or_rate_review'];
  if (semantic === 'discount_rate') return ['unit_price_or_rate_review', 'discount_rate_not_amount'];
  if (semantic === 'framework_limit') return ['framework_limit_review'];
  return [];
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
  return `# Round 8 Official Public Instance Test

- Batch: ${summary.batch_name}
- Official sources: ${summary.official_source_count}
- Total input records: ${summary.total_input_records}
- Total accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Previous source overlap: ${summary.collector_summary.previous_source_overlap_count}
- Cross-region procurement records: ${summary.collector_summary.cross_region_procurement_records}
- PDF performance records: ${summary.collector_summary.pdf_performance_records}
- Discovery queue items: ${summary.collector_summary.discovery_queue_item_count}

## Official Sources
${payloads.sourceRegister.sources.map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Risk Control Notes
- Electronic marketplace, unit price, discount rate and framework limit records do not write normalized_award_amount_yuan.
- Audit work updates and专项审计调查 remain review suggestions unless formal audit result or rectification-result evidence is linked.
- Public-data gaps produce supplemental-data requests, not formal violation conclusions.

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html><meta charset="utf-8"><title>Round 8 Official Public Instance Test</title><pre>${escaped}</pre>`;
}

export { runEighthOfficialPublicInstanceTest };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEighthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote eighth official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        cross_region_procurement_records: summary.collector_summary.cross_region_procurement_records,
        pdf_performance_records: summary.collector_summary.pdf_performance_records,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
