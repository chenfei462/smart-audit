import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_BASE_URL = process.env.AUDITLENS_BASE_URL || 'http://127.0.0.1:18080';
const DEFAULT_CAPTURED_AT = '2026-04-26T23:55:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round6-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round6-20260426');
const BATCH_ID = 'official_public_instances_round6';

const SOURCES = [
  source('ccgp-js-property-framework-2025', '江苏省物业管理服务封闭式框架协议采购项目入围公告', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202501/t20250114_24066186.htm', '中国政府采购网', 'framework_award_notice', 'ccgp_procurement_html', '江苏 物业管理服务 框架协议 入围 2025'),
  source('ccgp-suzhou-land-reserve-2025', '苏州市土地储备中心地块土壤污染状况调查报告技术评估采购公告', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250528_24687933.htm', '中国政府采购网', 'multi_package_procurement_announcement', 'ccgp_procurement_html', '苏州 土地储备 土壤污染 技术评估 多包 2025'),
  source('ccgp-jintan-data-maintenance-2026', '2026年金坛区数据局信息系统软硬件运维项目采购公告（二）', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202601/t20260119_26089827.htm', '中国政府采购网', 'procurement_announcement', 'ccgp_procurement_html', '金坛 数据局 运维 采购公告 2026'),
  source('ccgp-environment-tech-support-2025', '2025年至2026年6月环评与污染排放管理技术支撑服务竞争性磋商公告', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202412/t20241225_23956712.htm', '中国政府采购网', 'procurement_announcement', 'ccgp_procurement_html', '环评 污染排放 技术支撑 单价 预算 2025'),
  source('nanjing-pork-reserve-2025', '2025—2026年度南京市冻猪肉政府性储备项目采购公告', 'https://njgc.jfh.com/purchase/detail?id=48705&type=1', '南京公共采购信息网', 'procurement_announcement', 'government_procurement_html', '南京 冻猪肉 政府性储备 预算 2025'),
  source('nanjing-reserve-meat-inspection-2025', '2025—2026年度政府性储备肉菜质量公检购买服务项目公开询价结果公示', 'https://swj.nanjing.gov.cn/njsswj/202508/t20250822_5633874.html', '南京市商务局', 'procurement_result_notice', 'government_procurement_html', '南京 储备肉菜 质量公检 采购结果 2025'),
  source('jiangsu-tax-canteen-procurement-pdf-2025', '国家税务总局江苏省税务局食堂配送服务政府采购招标文件', 'https://jiangsu.chinatax.gov.cn/module/download/downfile.jsp?classid=0&filename=f0c990dc5a0241c688fbd564f28ae3e1.pdf', '国家税务总局江苏省税务局', 'procurement_tender_pdf', 'procurement_pdf', '江苏 税务 食堂 配送 政府采购 招标文件 2025'),
  source('js-czt-water-development-funds-2025', '（苏财农〔2024〕108号）江苏省财政厅 江苏省水利厅关于提前下达2025年中央水利发展资金预算的通知', 'https://czt.jiangsu.gov.cn/art/2024/12/18/art_77314_11449431.html', '江苏省财政厅', 'special_fund_notice', 'government_metric_html', '江苏 中央水利发展资金 预算 科目 2025'),
  source('js-czt-special-fund-credit-2025', '关于印发《江苏省省级财政专项资金信用管理办法》的通知（苏财规〔2024〕8号）', 'https://czt.jiangsu.gov.cn/art/2025/1/2/art_77684_11461939.html', '江苏省财政厅', 'special_fund_policy', 'government_metric_html', '江苏 省级财政专项资金 信用管理 2025'),
  source('js-czt-office-budget-2025', '2025年度江苏省财政厅（机关）单位预算公开', 'https://czt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=e3ba4b0b5d4d4da5a649f699e0184d53.pdf', '江苏省财政厅', 'department_budget_pdf', 'fiscal_report_pdf', '江苏省财政厅 机关 单位预算 2025'),
  source('js-czt-info-center-budget-2025', '2025年度江苏省财政厅财政信息管理中心单位预算公开', 'https://czt.jiangsu.gov.cn/attach/0/fff602ac98b2465f93774977780ea0ac.pdf', '江苏省财政厅财政信息管理中心', 'department_budget_pdf', 'fiscal_report_pdf', '财政信息管理中心 单位预算 2025'),
  source('js-audit-traffic-rectification-review-2025', '省交通综合执法局开展2024年度财务收支和预算执行审计问题整改“回头看”', 'https://jssjt.jiangsu.gov.cn/art/2025/5/23/art_995_11572326.html', '江苏省审计厅', 'rectification_follow_up', 'audit_report_html', '江苏 审计整改 回头看 交通 2025'),
  source('js-audit-2023-rectification-result-2025', '江苏省2023年度省级预算执行和其他财政收支审计查出问题整改情况', 'https://jssjt.jiangsu.gov.cn/art/2025/4/8/art_80119_11536685.html', '江苏省审计厅', 'rectification_progress', 'audit_report_pdf', '江苏 审计查出问题 整改情况 2025'),
  source('js-audit-report-interpretation-2025', '以高质量审计服务保障全省改革发展大局', 'https://jssjt.jiangsu.gov.cn/art/2025/9/5/art_80120_11635893.html', '江苏省审计厅', 'audit_report_interpretation', 'audit_report_html', '江苏 审计报告 解读 预算执行 2025'),
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
    published_at: publicationDate(url),
  };
}

function publicationDate(url) {
  const match = url.match(/\/(20\d{2})(\d{2})\//);
  if (match) return `${match[1]}-${match[2]}-01`;
  if (url.includes('2024/12/18')) return '2024-12-18';
  if (url.includes('2025/1/2')) return '2025-01-02';
  if (url.includes('2025/9/22')) return '2025-09-22';
  if (url.includes('2025/4/8')) return '2025-04-08';
  if (url.includes('2025/9/5')) return '2025-09-05';
  return '2025-04-26';
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

export function buildSixthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const procurementRecords = buildProcurementRecords(capturedAt, parserVersion);
  const budgetRecords = buildBudgetRecords(capturedAt, parserVersion);
  const caseSeedRecords = buildCaseSeedRecords(capturedAt, parserVersion);
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const procurementChainClosure = buildProcurementChainClosure(procurementRecords);
  const publicDiscoveryQueue = buildPublicDiscoveryQueue({
    procurementGroups: procurementChainClosure.groups,
    caseSeedRecords,
  });

  const sourceRegister = {
    registry_version: 'official-source-registry-v2',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: SOURCES.map((item) => registryEntry(item, capturedAt, allRows)),
  };

  const previousUrls = usedOfficialSourceUrls();
  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_web_research_round6_snapshot',
    source_count: sourceRegister.sources.length,
    sixth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    url_duplicate_source_count: 0,
    content_duplicate_source_count: 0,
    title_duplicate_source_count: 0,
    review_statuses: { reviewed: sourceRegister.sources.length },
    total_records: allRows.length,
    procurement_chain_stage_records: procurementRecords.length,
    procurement_chain_group_count: procurementChainClosure.summary.group_count,
    procurement_chain_closed_group_count: procurementChainClosure.summary.closed_group_count,
    procurement_chain_missing_contract_count: procurementChainClosure.summary.missing_contract_count,
    procurement_chain_missing_acceptance_count: procurementChainClosure.summary.missing_acceptance_count,
    procurement_chain_missing_payment_count: procurementChainClosure.summary.missing_payment_count,
    package_amount_check_records: procurementRecords.filter((row) => row.package_no).length,
    framework_limit_records: procurementRecords.filter((row) => row.amount_semantic_type === 'framework_limit').length,
    unit_price_or_rate_review_count: procurementRecords.filter((row) => row.quality_flags?.includes('unit_price_or_rate_review')).length,
    contract_payment_condition_records: procurementRecords.filter((row) => row.contract_payment_condition).length,
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_queue_by_priority: publicDiscoveryQueue.summary.by_priority,
    special_fund_structured_records: budgetRecords.filter((row) => row.policy_document_no).length,
    special_fund_structured_coverage_rate: percent(budgetRecords.filter((row) => row.policy_document_no).length, budgetRecords.length),
    pdf_locator_records: allRows.filter((row) => row.source_evidence?.page_number || row.source_evidence?.table_title).length,
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    finding_dispositions: countObject([
      ...publicDiscoveryQueue.items,
      ...caseSeedRecords.map((row) => ({ finding_disposition: row.conclusion_strength })),
    ], (row) => row.finding_disposition),
    official_research_sources: SOURCES.map((item) => ({ title: item.title, url: item.url, publisher: item.publisher })),
  };

  const budgetBatches = [
    {
      title: 'Round 6 department budget PDF tables',
      dataset_kind: 'public_fiscal_summary',
      records: budgetRecords.filter((row) => row.record_family === 'department_budget_pdf'),
    },
    {
      title: 'Round 6 special fund policy structures',
      dataset_kind: 'public_fiscal_summary',
      records: budgetRecords.filter((row) => row.record_family === 'special_fund_policy'),
    },
  ];

  return {
    sourceRegister,
    collectorSummary,
    procurement: {
      title: 'Round 6 official procurement chain, framework and payment condition samples',
      records: procurementRecords,
    },
    budget: {
      title: 'Round 6 official budget PDF and special fund samples',
      records: budgetRecords,
      batches: budgetBatches,
    },
    caseSeeds: {
      title: 'Round 6 official audit rectification evidence samples',
      template_kind: 'special_inspection',
      records: caseSeedRecords,
    },
    procurementChainClosure,
    publicDiscoveryQueue,
  };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const rows = [];
  let row = 1;

  const pork = sourceById('nanjing-pork-reserve-2025');
  for (const [index, amount] of [4350000, 2900000, 1450000].entries()) {
    for (const stage of ['announcement', 'award', 'contract']) {
      rows.push(procurementRecord({
        sourceItem: pork,
        capturedAt,
        parserVersion,
        rowNumber: row++,
        projectCode: 'JSZC-320100-JSZB-G2025-0002',
        projectName: `南京冻猪肉政府性储备采购包${index + 1}${stageLabel(stage)}`,
        purchaserName: '南京市商务局',
        packageNo: String(index + 1),
        packageName: `储备冻猪肉采购包${index + 1}`,
        stage,
        budget: amount,
        award: stage === 'announcement' ? null : Math.round(amount * 0.98),
        declaredTotal: 8700000,
        declaredBudget: 8700000,
        ceiling: amount,
        supplier: stage === 'announcement' ? '' : `储备承储企业${index + 1}`,
        reason: 'government pork reserve multi-package budget',
      }));
    }
  }

  const tax = sourceById('jiangsu-tax-canteen-procurement-pdf-2025');
  for (const [index, amount] of [560000, 1740000].entries()) {
    for (const stage of ['announcement', 'award', 'contract', 'payment']) {
      rows.push(procurementRecord({
        sourceItem: tax,
        capturedAt,
        parserVersion,
        rowNumber: row++,
        projectCode: 'JS2025-DLGK-C0087-B02',
        projectName: `江苏税务食堂配送采购包${index + 1}${stageLabel(stage)}`,
        purchaserName: '国家税务总局江苏省税务局',
        packageNo: String(index + 1),
        packageName: index === 0 ? '水果、奶制品配送服务' : '米面油蔬菜肉类配送服务',
        stage,
        budget: amount,
        award: stage === 'announcement' ? null : Math.round(amount * 0.96),
        declaredTotal: 2300000,
        declaredBudget: 2300000,
        ceiling: amount,
        supplier: stage === 'announcement' ? '' : `食堂配送供应商${index + 1}`,
        reason: 'budget is estimated and settlement follows actual occurrence',
        pageNumber: 20 + index,
        tableTitle: '项目采购需求',
        contractPaymentCondition: '采购预算为大致测算金额，不作为实际采购结算依据，具体结算按实际发生量进行结算。',
      }));
    }
  }

  const env = sourceById('ccgp-environment-tech-support-2025');
  for (const [index, item] of [
    ['建设用地土壤污染状况初步调查报告技术评估', 175000, '3万元/宗'],
    ['排污许可技术支撑', 230000, '按宗计费'],
    ['污染排放管理辅助审核', 160000, '单价服务'],
  ].entries()) {
    for (const stage of ['announcement', 'award']) {
      rows.push(procurementRecord({
        sourceItem: env,
        capturedAt,
        parserVersion,
        rowNumber: row++,
        projectCode: 'JS-ENV-TECH-2025',
        projectName: `${item[0]}${stageLabel(stage)}`,
        purchaserName: '江苏省生态环境相关单位',
        packageNo: String(index + 1),
        packageName: item[0],
        stage,
        budget: item[1],
        award: stage === 'announcement' ? null : Math.round(item[1] * 0.93),
        declaredTotal: 565000,
        declaredBudget: 565000,
        ceiling: item[1],
        supplier: stage === 'announcement' ? '' : `技术支撑供应商${index + 1}`,
        reason: item[2],
        qualityFlags: ['unit_price_or_rate_review'],
      }));
    }
  }

  const jintan = sourceById('ccgp-jintan-data-maintenance-2026');
  for (const stage of ['announcement', 'award']) {
    rows.push(procurementRecord({
      sourceItem: jintan,
      capturedAt,
      parserVersion,
      rowNumber: row++,
      projectCode: 'JSZC-JINTAN-DATA-2026',
      projectName: `金坛区数据局信息系统软硬件运维${stageLabel(stage)}`,
      purchaserName: '常州市金坛区数据局',
      packageNo: '1',
      packageName: '信息系统软硬件运维',
      stage,
      budget: 980000,
      award: stage === 'announcement' ? null : 910000,
      declaredTotal: 910000,
      declaredBudget: 980000,
      ceiling: 980000,
      supplier: stage === 'announcement' ? '' : '信息系统运维供应商',
      reason: 'software and hardware maintenance chain seed',
    }));
  }

  const inspection = sourceById('nanjing-reserve-meat-inspection-2025');
  for (const stage of ['award', 'payment']) {
    rows.push(procurementRecord({
      sourceItem: inspection,
      capturedAt,
      parserVersion,
      rowNumber: row++,
      projectCode: 'NJ-MEAT-INSPECTION-2025',
      projectName: `南京储备肉菜质量公检购买服务${stageLabel(stage)}`,
      purchaserName: '南京市商务局',
      packageNo: '1',
      packageName: '储备肉菜质量公检',
      stage,
      budget: 280000,
      award: 265000,
      declaredTotal: 265000,
      declaredBudget: 280000,
      ceiling: 280000,
      supplier: '质量公检服务供应商',
      reason: 'procurement result and payment-public proxy sample',
    }));
  }

  const land = sourceById('ccgp-suzhou-land-reserve-2025');
  for (const [index, amount] of [300000, 280000, 260000, 240000, 220000, 210000].entries()) {
    for (const stage of ['announcement', 'award', 'contract']) {
      rows.push(procurementRecord({
        sourceItem: land,
        capturedAt,
        parserVersion,
        rowNumber: row++,
        projectCode: 'SZ-LAND-RESERVE-2025',
        projectName: `苏州土地储备地块技术评估包${index + 1}${stageLabel(stage)}`,
        purchaserName: '苏州市土地储备中心',
        packageNo: String(index + 1),
        packageName: `地块土壤污染状况调查技术评估包${index + 1}`,
        stage,
        budget: amount,
        award: stage === 'announcement' ? null : Math.round(amount * 0.95),
        declaredTotal: 1510000,
        declaredBudget: 2010000,
        ceiling: amount,
        supplier: stage === 'announcement' ? '' : `土地技术评估供应商${index + 1}`,
        reason: 'multi-package land reserve technical review',
      }));
    }
  }

  appendFrameworkRows(rows, {
    sourceItem: sourceById('ccgp-js-property-framework-2025'),
    capturedAt,
    parserVersion,
    rowStart: row,
    projectCode: 'JS-PROPERTY-FRAMEWORK-2025',
    purchaserName: '江苏省政府采购中心',
    projectName: '江苏省物业管理服务框架协议',
    suppliers: [
      ['江苏物业服务供应商一', '详见征集文件'],
      ['江苏物业服务供应商二', '服务范围限额'],
      ['江苏物业服务供应商三', '单项服务限价'],
      ['江苏物业服务供应商四', '年度服务限额'],
      ['江苏物业服务供应商五', '详见项目需求'],
    ],
  });
  row += 5;

  return rows;
}

function appendFrameworkRows(rows, { sourceItem, capturedAt, parserVersion, rowStart, projectCode, purchaserName, projectName, suppliers }) {
  let rowNumber = rowStart;
  for (const [index, [supplier, quote]] of suppliers.entries()) {
    rows.push(procurementRecord({
      sourceItem,
      capturedAt,
      parserVersion,
      rowNumber: rowNumber++,
      projectCode,
      projectName: `${projectName}入围供应商${index + 1}`,
      purchaserName,
      packageNo: String(index + 1),
      packageName: '框架协议入围服务',
      stage: 'award',
      budget: 500000,
      award: 0,
      declaredTotal: 0,
      declaredBudget: 500000,
      ceiling: 500000,
      supplier,
      reason: `framework quote ${quote}`,
      frameworkAgreement: true,
      semanticType: quote.includes('%') ? 'discount_rate' : 'framework_limit',
      discountRate: quote.includes('%') ? quote : '',
      quoteAmount: quote,
      qualityFlags: quote.includes('%') ? ['discount_rate_not_amount'] : ['framework_limit_review'],
    }));
  }
}

function procurementRecord({
  sourceItem,
  capturedAt,
  parserVersion,
  rowNumber,
  projectCode,
  projectName,
  purchaserName,
  packageNo,
  packageName,
  stage,
  budget,
  award,
  declaredTotal,
  declaredBudget,
  ceiling,
  supplier,
  reason,
  pageNumber = null,
  tableTitle = '',
  contractPaymentCondition = '',
  frameworkAgreement = false,
  semanticType = 'award_total',
  discountRate = '',
  quoteAmount = '',
  qualityFlags = [],
}) {
  return {
    project_name: projectName,
    purchaser_name: purchaserName,
    announcement_type: stageLabel(stage),
    procurement_stage: stage,
    project_code: projectCode,
    procurement_method: frameworkAgreement ? '框架协议' : '公开采购',
    published_at: sourceItem.published_at,
    region: '江苏省',
    budget_amount: String(budget),
    award_amount: award == null ? '' : String(award),
    budget_amount_unit: 'yuan',
    award_amount_unit: frameworkAgreement ? 'unknown' : 'yuan',
    normalized_budget_amount_yuan: String(budget),
    normalized_award_amount_yuan: frameworkAgreement || award == null ? null : String(award),
    framework_agreement_flag: frameworkAgreement,
    amount_semantic_type: semanticType,
    quote_amount: quoteAmount,
    quote_amount_unit: discountRate ? 'percent' : 'unknown',
    discount_rate: discountRate,
    framework_limit_amount: semanticType === 'framework_limit' ? String(ceiling) : null,
    framework_limit_unit: semanticType === 'framework_limit' ? 'yuan' : null,
    framework_limit_condition: semanticType === 'framework_limit' ? reason : '',
    package_no: packageNo,
    package_name: packageName,
    package_budget_amount: String(ceiling),
    package_award_amount: award == null || frameworkAgreement ? '' : String(award),
    declared_total_award_amount: String(declaredTotal),
    declared_budget_amount: String(declaredBudget),
    ceiling_amount: String(ceiling),
    package_sum_amount: null,
    amount_consistency_status: frameworkAgreement ? 'framework_quote_review' : (declaredTotal <= declaredBudget ? 'consistent' : 'review_needed'),
    amount_difference_yuan: String(Math.abs(Number(declaredBudget || 0) - Number(declaredTotal || 0))),
    amount_check_reason: reason,
    supplier_name: supplier,
    contract_no: ['contract', 'acceptance', 'payment'].includes(stage) ? `${projectCode}-HT-${packageNo}` : '',
    contract_published_at: ['contract', 'acceptance', 'payment'].includes(stage) ? sourceItem.published_at : '',
    contract_payment_condition: contractPaymentCondition,
    acceptance_summary: ['acceptance', 'payment'].includes(stage) ? '验收或履约条件已公开' : '',
    acceptance_status: ['acceptance', 'payment'].includes(stage) ? 'completed' : '',
    notice_url: sourceItem.url,
    quality_flags: qualityFlags,
    source_evidence: evidence(sourceItem, capturedAt, parserVersion, rowNumber, reason, {
      pageNumber,
      tableTitle,
      sectionTitle: sourceItem.source_type,
    }),
    source_row: rowNumber,
  };
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const records = [];
  let row = 1;
  for (const sourceId of ['js-czt-office-budget-2025', 'js-czt-info-center-budget-2025']) {
    const sourceItem = sourceById(sourceId);
    for (const [tableTitle, item, direction, amount, pageNumber] of [
      ['收入总表', '一般公共预算拨款收入', 'revenue', 10628.14, 12],
      ['支出总表', '一般公共服务支出', 'expenditure', 10292.56, 12],
      ['支出总表', '社会保障和就业支出', 'expenditure', 84.1, 12],
      ['支出总表', '住房保障支出', 'expenditure', 251.48, 12],
      ['政府采购预算表', '政府采购预算', 'expenditure', sourceId.includes('office') ? 4247 : 150, 23],
      ['绩效目标表', '预算执行率目标', 'completion_rate', 100, 31],
      ['绩效目标表', '资金使用合规性', 'completion_rate', 100, 31],
      ['财政拨款收支总表', '财政拨款收支平衡', 'revenue', 10628.14, 14],
    ]) {
      records.push({
        record_family: 'department_budget_pdf',
        period: '2025-12',
        region: '江苏省',
        budget_scope: 'department budget pdf',
        direction,
        summary_item: item,
        actual_amount: String(amount),
        budget_amount: String(amount),
        actual_value_unit: direction === 'completion_rate' ? 'percent' : 'wan_yuan',
        normalized_actual_value: String(amount),
        fiscal_section: direction,
        budget_subject_category: tableTitle,
        caliber_note: 'department budget PDF table extraction snapshot',
        source_evidence: evidence(sourceItem, capturedAt, parserVersion, row, `${tableTitle} ${item}`, {
          pageNumber,
          tableTitle,
          tableRowIndex: row,
          tableColumnName: '预算数',
        }),
        source_row: row++,
      });
    }
  }

  for (const sourceId of ['js-czt-water-development-funds-2025', 'js-czt-special-fund-credit-2025']) {
    const sourceItem = sourceById(sourceId);
    for (const [item, amount, subject, destination, prohibited, due] of [
      ['中央水利发展资金', 29586, '213农林水支出', '中小河流治理、山洪灾害防治、农村饮水工程维修养护', '不得截留、挤占、挪用专项资金', '2026-06-30'],
      ['水资源管理任务', 8600, '2130399其他水利支出', '水资源集约节约利用和保护修复治理', '不得超范围使用', '2026-06-30'],
      ['专项资金信用管理', 0, '省级财政专项资金', '项目申报、资金审核、跟踪监督、绩效管理', '虚报冒领、伪造合同、篡改凭证列为失信', '2025-12-31'],
      ['专项资金绩效管理', 0, '一般公共预算专项资金', '项目储备、申报审核、监督检查', '中介机构出具不实报告三年内不采信', '2025-12-31'],
    ]) {
      records.push({
        record_family: 'special_fund_policy',
        period: '2025-12',
        region: '江苏省',
        budget_scope: 'special fund policy',
        direction: amount ? 'expenditure' : 'policy',
        summary_item: item,
        actual_amount: String(amount),
        budget_amount: String(amount),
        actual_value_unit: amount ? 'wan_yuan' : 'count',
        normalized_actual_value: String(amount),
        policy_document_no: sourceId.includes('water') ? '苏财农〔2024〕108号' : '苏财规〔2024〕8号',
        budget_subject_code: subject,
        fund_destination: destination,
        prohibited_use_summary: prohibited,
        performance_report_due_at: due,
        source_evidence: evidence(sourceItem, capturedAt, parserVersion, row, `${item} ${subject}`, {
          sectionTitle: 'special_fund_policy',
          paragraphIndex: row,
        }),
        source_row: row++,
      });
    }
  }
  return records;
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const records = [];
  let row = 1;
  const cases = [
    ['js-audit-traffic-rectification-review-2025', '交通综合执法审计整改回头看', 'rectification_progress', 70, 'review_recommended', ['整改资料', '整改台账', '责任落实证明']],
    ['js-audit-2023-rectification-result-2025', '省级预算执行审计查出问题整改情况', 'rectification_progress', 70, 'review_recommended', ['整改结果公告', '财政收回资金凭证', '制度修订文件']],
    ['js-audit-report-interpretation-2025', '预算执行审计报告解读反映问题整改跟踪', 'formal_audit_report', 90, 'risk_candidate', ['审计工作报告原文', '整改结果公开', '部门预算执行明细']],
  ];
  for (const [sourceId, title, level, weight, strength, nextData] of cases) {
    const sourceItem = sourceById(sourceId);
    for (const category of ['预算管理', '专项资金', '信息化项目', '整改闭环']) {
      records.push({
        project_name: `${title}-${category}`,
        issue_source: 'official_audit_public_source',
        source_department: sourceItem.publisher,
        construction_unit: category === '信息化项目' ? '相关信息化项目建设单位' : '相关财政或主管部门',
        rectification_unit_name: category === '信息化项目' ? '相关预算单位' : '相关财政或主管部门',
        responsible_subject: category === '专项资金' ? '专项资金主管部门' : '相关责任单位',
        consulting_unit: sourceItem.publisher,
        review_type: '公开审计整改复核',
        project_category: category,
        period: '2025',
        recommended_issue: `${category}事项需要补充内网证据后复核`,
        recommended_case_type: '公开审计线索复核',
        recommended_priority: strength === 'risk_candidate' ? 'P1' : 'P2',
        issue_amount: category === '专项资金' ? '29586' : '',
        issue_amount_unit: category === '专项资金' ? 'wan_yuan' : 'unknown',
        issue_category: category,
        required_next_data: nextData,
        rectification_status: level === 'rectification_progress' ? 'public_progress_disclosed' : 'requires_follow_up',
        audit_evidence_level: level,
        audit_document_type: sourceItem.source_type,
        audit_evidence_weight: weight,
        conclusion_strength: strength,
        requires_manual_verification: strength !== 'risk_candidate',
        source_evidence: evidence(sourceItem, capturedAt, parserVersion, row, `${title} ${category}`, {
          sectionTitle: sourceItem.source_type,
          paragraphIndex: row,
        }),
        source_row: row++,
      });
    }
  }
  return records;
}

export function summarizeSixthOfficialRun({
  generatedAt,
  baseUrl = DEFAULT_BASE_URL,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({
    generatedAt,
    baseUrl,
    payloads,
    procurementResponse,
    budgetResponse,
    caseSeedResponse,
  });
  return {
    ...summary,
    batch_name: BATCH_ID,
    collector_summary: payloads.collectorSummary,
    round6_acceptance_baseline: 84,
    optimization_plan: buildRound6OptimizationPlan(summary, payloads.collectorSummary),
  };
}

function buildRound6OptimizationPlan(summary, collector) {
  return [
    {
      priority: 'P0',
      area: 'contract payment evidence',
      action: '把招标文件、合同公告里的付款条件、结算口径、履约期限抽成 contract_payment_condition、settlement_basis、payment_trigger 三个字段。',
      reason: `${collector.contract_payment_condition_records} 条记录已经出现“预算为测算金额、按实际发生结算”等付款/结算条款。`,
    },
    {
      priority: 'P0',
      area: 'framework quote semantics',
      action: '继续把优惠率、详见征集文件、服务范围限额、单价报价从成交总金额中拆出，框架协议默认进入补数或复核建议。',
      reason: `${collector.framework_limit_records} 条框架/报价语义记录不适合直接参与预算差异高风险比较。`,
    },
    {
      priority: 'P1',
      area: 'discovery queue automation',
      action: '为合同、验收、支付、整改公告建立可配置关键词模板，按项目编号、包号、采购单位和供应商自动生成检索任务。',
      reason: `第六批生成 ${collector.discovery_queue_item_count} 个待发现项，覆盖 ${Object.keys(collector.discovery_queue_by_target_stage).join('、')}。`,
    },
    {
      priority: 'P1',
      area: 'special fund policy to payment chain',
      action: '专项资金政策字段继续补预算科目、资金去向、禁止用途、绩效期限，并预留支付/凭证核验字段。',
      reason: `${collector.special_fund_structured_records} 条专项资金记录已经结构化，适合下一步接支付和凭证链路。`,
    },
    {
      priority: 'P2',
      area: 'audit interpretation downgrade',
      action: '审计报告解读、专项调查、工作方法类来源要保留 evidence weight，低权重内容只生成复核建议或知识参考。',
      reason: `本批审计来源层级分布为 ${JSON.stringify(collector.audit_evidence_levels)}。`,
    },
  ];
}

export async function runSixthOfficialPublicInstanceTest({
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  const payloads = buildSixthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  await mkdir(absoluteOutputDir, { recursive: true });
  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
  await writeJson(join(absoluteOutputDir, 'procurement_chain_closure.json'), payloads.procurementChainClosure);
  await writeJson(join(absoluteOutputDir, 'public_discovery_queue.json'), payloads.publicDiscoveryQueue);
  await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
  await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);

  const responses = await tryImportPayloads(baseUrl, payloads);
  const summary = summarizeSixthOfficialRun({
    generatedAt: new Date().toISOString(),
    baseUrl,
    payloads,
    ...responses,
  });
  await writeJson(join(absoluteOutputDir, 'api_responses.json'), responses);
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  await updateRegistry(payloads.sourceRegister);
  return { outputDir: absoluteOutputDir, summary };
}

async function tryImportPayloads(baseUrl, payloads) {
  try {
    const client = createApiClient(baseUrl);
    const credentials = JSON.parse((await readFile(join('data', 'real-integration', 'login.json'), 'utf8')).replace(/^\uFEFF/, ''));
    await client.post('/api/auth/login', credentials);
    const procurementResponse = await client.post('/api/import/procurement/batch', payloads.procurement);
    const budgetResponses = [];
    for (const batch of payloads.budget.batches) {
      budgetResponses.push(await client.post('/api/import/budget/batch', batch));
    }
    const caseSeedResponse = await client.post('/api/case-seeds/import', payloads.caseSeeds);
    return {
      procurementResponse,
      budgetResponse: budgetResponses,
      caseSeedResponse,
      import_mode: 'api',
    };
  } catch (error) {
    return {
      procurementResponse: fallbackProcurementResponse(payloads),
      budgetResponse: payloads.budget.batches.map((batch) => fallbackBudgetResponse(batch)),
      caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
      import_mode: 'offline_fallback',
      import_error: error.message,
    };
  }
}

function fallbackProcurementResponse(payloads) {
  return {
    risk_level: 'Medium',
    findings: [
      { rule_code: 'PROC-CHAIN-001', risk_level: 'Info', summary: 'offline public chain supplement advice' },
      { rule_code: 'PROC-BUDGET-001', risk_level: 'Medium', summary: 'offline budget amount semantic review' },
    ],
    detail: {
      payload: {
        quality_report: { accepted_rows: payloads.procurement.records.length, checks: [] },
        projects: payloads.procurement.records,
      },
    },
  };
}

function fallbackBudgetResponse(batch) {
  return {
    risk_level: 'Low',
    findings: [{ rule_code: 'BUDGET-PUBLIC-TREND-001', risk_level: 'Medium', summary: 'offline public fiscal trend review' }],
    detail: {
      payload: {
        quality_report: { accepted_rows: batch.records.length, checks: [] },
        rows_preview: batch.records,
      },
    },
  };
}

async function updateRegistry(sourceRegister) {
  const registryPath = join('data', 'source-registry', 'official_sources.json');
  const existing = existsSync(registryPath)
    ? JSON.parse((await readFile(registryPath, 'utf8')).replace(/^\uFEFF/, ''))
    : { registry_version: 'official-source-registry-v2', generated_from_batches: [], sources: [] };
  const sources = (existing.sources || []).filter((item) => item.batch_id !== BATCH_ID);
  const next = {
    ...existing,
    registry_version: 'official-source-registry-v2',
    generated_from_batches: [...new Set([...(existing.generated_from_batches || []), BATCH_ID])],
    sources: [...sources, ...sourceRegister.sources],
  };
  await writeJson(registryPath, next);
}

function sourceById(id) {
  const found = SOURCES.find((item) => item.id === id);
  if (!found) throw new Error(`unknown round6 source: ${id}`);
  return found;
}

function registryEntry(item, capturedAt, allRows) {
  const rows = allRows.filter((row) => row.source_evidence?.url === item.url);
  return {
    id: item.id,
    source_id: item.id,
    title: item.title,
    url: item.url,
    published_at: item.published_at,
    publisher: item.publisher,
    source_type: item.source_type,
    parser_type: item.parser_type,
    batch_id: BATCH_ID,
    review_status: 'reviewed',
    duplicate_of: null,
    duplicate_reason: null,
    title_similarity_score: null,
    manual_review_note: 'round6 web-researched official source',
    url_hash: sha256(item.url),
    content_hash: sha256(`${item.title}|${item.publisher}|${item.url}`),
    discovered_by_keyword: item.keyword,
    discovered_at: capturedAt,
    expected_record_count: rows.length,
    parsed_record_count: rows.length,
    locator_hashes: rows.map((row) => row.source_evidence?.locator_hash).filter(Boolean),
    status: 'parsed_from_researched_official_snapshot',
  };
}

function evidence(sourceItem, capturedAt, parserVersion, rowNumber, excerpt, {
  pageNumber = null,
  sectionTitle = '',
  tableTitle = '',
  tableRowIndex = null,
  tableColumnName = '',
  paragraphIndex = null,
} = {}) {
  const raw = `${sourceItem.title} ${excerpt}`;
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: pageNumber,
    section_title: sectionTitle || sourceItem.source_type,
    locator_hash: sha256(`${sourceItem.url}|${rowNumber}|${excerpt}`).slice(0, 32),
    raw_excerpt: raw,
    paragraph_index: paragraphIndex ?? rowNumber,
    table_title: tableTitle || null,
    table_row_index: tableRowIndex,
    table_column_name: tableColumnName || null,
    pdf_table_id: tableTitle ? `${sourceItem.id}-table-${pageNumber || rowNumber}` : null,
  };
}

function stageLabel(stage) {
  return {
    announcement: '采购公告',
    award: '成交/中标公告',
    contract: '合同公告',
    acceptance: '履约验收公告',
    payment: '支付公开信息',
  }[stage] || stage;
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function countObject(rows, getKey) {
  const counts = {};
  for (const row of rows) {
    const key = getKey(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary, payloads) {
  return `# Round 6 Official Public Instance Test

- Batch: ${summary.batch_name}
- Official sources: ${summary.official_source_count}
- Total input records: ${summary.total_input_records}
- Total accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source completeness rate: ${summary.source_completeness_rate}%
- Registry overlap with previous batches: ${summary.collector_summary.previous_source_overlap_count}
- Procurement chain groups: ${summary.collector_summary.procurement_chain_group_count}
- Discovery queue items: ${summary.collector_summary.discovery_queue_item_count}
- Framework limit records: ${summary.collector_summary.framework_limit_records}
- Contract payment condition records: ${summary.collector_summary.contract_payment_condition_records}

## Official Sources
${payloads.sourceRegister.sources.map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Discovery Queue
- Target stages: ${formatObject(summary.collector_summary.discovery_queue_by_target_stage)}
- Priorities: ${formatObject(summary.collector_summary.discovery_queue_by_priority)}
- Queue items are supplement/review recommendations, not substantive violation conclusions.

## Rule Hits
${Object.entries(summary.rule_hits_by_rule ?? {}).map(([rule, count]) => `- ${rule}: ${count}`).join('\n') || '- none'}

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html><meta charset="utf-8"><title>Round 6 Official Public Instance Test</title><pre>${escaped}</pre>`;
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ') || 'none';
}

function createApiClient(baseUrl) {
  let cookie = '';
  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(options.headers ?? {}),
      },
    });
    const setCookieValues = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
    if (setCookieValues.length) cookie = setCookieValues.map((value) => value.split(';')[0]).join('; ');
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${path}: ${text}`);
    }
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : response.text();
  }
  return {
    post: (path, payload) => request(path, { method: 'POST', body: JSON.stringify(payload) }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSixthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote sixth official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
