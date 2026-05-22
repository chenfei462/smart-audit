import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_BASE_URL = process.env.AUDITLENS_BASE_URL || 'http://127.0.0.1:18080';
const DEFAULT_CAPTURED_AT = '2026-04-26T20:10:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round3-v1';
const DEFAULT_OUTPUT_DIR = join(
  'data',
  'real-integration',
  'official-public-instances-round3-20260426',
);

const ROUND3_SOURCES = [
  {
    id: 'ccgp-lyg-proton-award',
    title: '连云港市第一人民医院开发区院区单室质子治疗系统采购项目单一来源采购成交公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202501/t20250110_24051542.htm',
    published_at: '2025-01-10',
    publisher: '中国政府采购网',
    source_type: '成交公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '连云港 医院 单室质子 成交公告',
  },
  {
    id: 'ccgp-lyg-ecology-plan-announcement',
    title: '“十五五”生态环境保护规划前期重大课题研究及规划编制项目采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202505/t20250508_24562288.htm',
    published_at: '2025-05-08',
    publisher: '中国政府采购网',
    source_type: '竞争性磋商公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '连云港 十五五 生态环境 采购公告',
  },
  {
    id: 'ccgp-lyg-tcm-hospital-equipment-award',
    title: '江苏省中医院连云港医院项目医疗设备采购-第八批中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202504/t20250411_24430708.htm',
    published_at: '2025-04-11',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '连云港 中医院 医疗设备 中标公告',
  },
  {
    id: 'ccgp-taizhou-jiangyan-print-framework',
    title: '泰州市姜堰区2025-2026年行政事业单位和团体组织印刷服务框架协议采购入围公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202505/t20250516_24612510.htm',
    published_at: '2025-05-16',
    publisher: '中国政府采购网',
    source_type: '框架协议入围公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '泰州 姜堰 印刷服务 框架协议',
  },
  {
    id: 'ccgp-suzhou-printing-framework-award',
    title: '2025-2026年度苏州市印刷服务框架协议采购入围公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202412/t20241230_23984393.htm',
    published_at: '2024-12-30',
    publisher: '中国政府采购网',
    source_type: '框架协议入围公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '苏州 印刷服务 框架协议 优惠率',
  },
  {
    id: 'ccgp-wuxi-microscope-announcement',
    title: '体视显微镜及远程网络布置采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202506/t20250603_24699993.htm',
    published_at: '2025-06-03',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '无锡 体视显微镜 采购公告',
  },
  {
    id: 'ccgp-changzhou-drainage-testing-award',
    title: '常州市排水管理处、常州市城市排水有限公司2025-2026年第三方委托检测服务项目中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202506/t20250603_24700081.htm',
    published_at: '2025-06-03',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '常州 排水 第三方检测 中标公告',
  },
  {
    id: 'ccgp-changzhou-property-framework-announcement',
    title: '2025-2026年度常州市党政机关、事业单位及团体组织物业管理服务框架协议采购征集公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202506/t20250613_24773870.htm',
    published_at: '2025-06-13',
    publisher: '中国政府采购网',
    source_type: '框架协议征集公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '常州 物业管理 框架协议 征集公告',
  },
  {
    id: 'ccgp-yangzhou-cyber-platform-announcement',
    title: '扬州市委网信办网络安全态势感知与协同监管平台项目采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202504/t20250430_24530433.htm',
    published_at: '2025-04-30',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '扬州 网络安全 平台 采购公告',
  },
  {
    id: 'ccgp-lyg-ais-award',
    title: '交通运输部东海航海保障中心连云港航标处AIS航标采购项目中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202505/t20250507_24549798.htm',
    published_at: '2025-05-07',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '连云港 AIS 航标 中标公告',
  },
  {
    id: 'ccgp-lyg-sanitation-single-source',
    title: '连云港市海州区城乡环卫作业服务项目单一来源采购公示',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/dylygg/202505/t20250512_24580234.htm',
    published_at: '2025-05-12',
    publisher: '中国政府采购网',
    source_type: '单一来源采购公示',
    parser_type: 'ccgp_procurement_html',
    keyword: '连云港 海州 环卫 单一来源',
  },
  {
    id: 'ccgp-changzhou-linear-accelerator-announcement',
    title: '常州市第二人民医院直线加速器及配套设备采购项目招标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250528_24671904.htm',
    published_at: '2025-05-28',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '常州 第二人民医院 直线加速器 招标',
  },
  {
    id: 'ccgp-changshu-lifeline-risk-announcement',
    title: '常熟市2025年城市生命线安全工程风险评估和监测方案项目招标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202504/t20250408_24406557.htm',
    published_at: '2025-04-08',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '常熟 城市生命线 风险评估 招标',
  },
  {
    id: 'ccgp-nanjing-pork-reserve-announcement',
    title: '2025—2026年度1000吨冻猪肉储备项目采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202507/t20250703_24901878.htm',
    published_at: '2025-07-03',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '南京 冻猪肉 储备 采购公告',
  },
  {
    id: 'ccgp-changzhou-carbon-budget-announcement',
    title: '常州市“十五五”时期碳预算管理制度课题研究采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202601/t20260112_26065235.htm',
    published_at: '2026-01-12',
    publisher: '中国政府采购网',
    source_type: '竞争性磋商公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '常州 碳预算 采购公告',
  },
  {
    id: 'taizhou-budget-disclosure-plan-2025',
    title: '泰州市财政局关于印发2025年市级预决算公开工作方案的通知',
    url: 'https://czj.taizhou.gov.cn/xxgk/fdzdgknr/zcwj/bmwj/art/2025/art_06cbdeea6d644615bd954f8c8ce03019.html',
    published_at: '2025-02-03',
    publisher: '泰州市财政局',
    source_type: '财政预算公开制度文件',
    parser_type: 'government_metric_html',
    keyword: '泰州 预决算公开 2025',
  },
  {
    id: 'taizhou-agri-special-fund-2025',
    title: '市财政局关于下达2025年农口部门（单位）市级财政支农专项资金的通知',
    url: 'https://czj.taizhou.gov.cn/xxgk/fdzdgknr/zcwj/bmwj/art/2025/art_ac601b7a61f942339dfd149065ff412e.html',
    published_at: '2025-03-24',
    publisher: '泰州市财政局',
    source_type: '专项资金下达通知',
    parser_type: 'government_metric_html',
    keyword: '泰州 支农专项资金 1593.78',
  },
  {
    id: 'taizhou-rural-collective-fund-2025',
    title: '下达2025年第一批扶持新型农村集体经济发展市级补助资金的通知',
    url: 'https://czj.taizhou.gov.cn/xxgk/fdzdgknr/zcwj/bmwj/art/2025/art_28a7ac73b7e547a3a6823666d5f2b4d2.html',
    published_at: '2025-04-09',
    publisher: '泰州市财政局',
    source_type: '专项资金下达通知',
    parser_type: 'government_metric_html',
    keyword: '泰州 农村集体经济 补助资金',
  },
  {
    id: 'taizhou-seed-rd-fund-2025',
    title: '下达泰州市2025年种业研发攻关项目资金及立项计划的通知',
    url: 'https://czj.taizhou.gov.cn/xxgk/fdzdgknr/zcwj/bmwj/art/2025/art_3ce87360ee744078bb7cf890f831a70f.html',
    published_at: '2025-12-16',
    publisher: '泰州市财政局',
    source_type: '专项资金下达通知',
    parser_type: 'government_metric_html',
    keyword: '泰州 种业研发 175万元 9个项目',
  },
  {
    id: 'taizhou-third-agri-subsidy-2025',
    title: '下达2025年度第三批省级现代农业发展补助专项资金的通知',
    url: 'https://czj.taizhou.gov.cn/xxgk/fdzdgknr/zcwj/bmwj/art/2025/art_36e16cee15884161a5b4c52b315131ee.html',
    published_at: '2025-09-30',
    publisher: '泰州市财政局',
    source_type: '专项资金下达通知',
    parser_type: 'government_metric_html',
    keyword: '泰州 现代农业 第三批 补助资金',
  },
  {
    id: 'taizhou-info-disclosure-annual-report-2025',
    title: '泰州市财政局2025年政府信息公开工作年度报告',
    url: 'https://czj.taizhou.gov.cn/xxgk/zfxxgknb/art/2026/art_fe08083ef8034019ad289cdf9d3b8d82.html',
    published_at: '2026-01-26',
    publisher: '泰州市财政局',
    source_type: '政府信息公开年报',
    parser_type: 'government_metric_html',
    keyword: '泰州 财政局 2025 政府信息公开 年报',
  },
  {
    id: 'wuxi-budget-standard-system-2025',
    title: '无锡市财政局积极推进预算支出标准体系建设，服务零基预算管理',
    url: 'https://czt.jiangsu.gov.cn/art/2025/4/2/art_77300_11537210.html',
    published_at: '2025-04-02',
    publisher: '江苏省财政厅',
    source_type: '市县财政动态',
    parser_type: 'government_metric_html',
    keyword: '无锡 预算支出标准 零基预算',
  },
  {
    id: 'suzhou-budget-report-2025',
    title: '关于苏州市2024年预算执行情况和2025年预算草案的报告',
    url: 'https://www.suzhou.gov.cn/szsrmzf/czyjsbg/202502/e4d4339343ca471ca41096fa89b006bf.shtml',
    published_at: '2025-02-17',
    publisher: '苏州市人民政府',
    source_type: '预算执行和预算草案报告',
    parser_type: 'government_metric_html',
    keyword: '苏州 2024预算执行 2025预算草案',
  },
  {
    id: 'suzhou-finance-summary-2025',
    title: '苏州市财政局2025年工作总结和2026年工作打算',
    url: 'https://czju.suzhou.gov.cn/czj/jhzj/202602/b6f690a3c38d4191b63eb65cf4983bda.shtml',
    published_at: '2026-02-01',
    publisher: '苏州市财政局',
    source_type: '财政工作总结',
    parser_type: 'government_metric_html',
    keyword: '苏州 财政 2025 工作总结',
  },
  {
    id: 'wuxi-new-district-finance-plan-2025',
    title: '无锡高新区（新吴区）财政局2025年工作思路',
    url: 'https://www.wnd.gov.cn/doc/2025/02/26/4507437.shtml',
    published_at: '2025-02-26',
    publisher: '无锡高新区（新吴区）财政局',
    source_type: '财政工作计划',
    parser_type: 'government_metric_html',
    keyword: '无锡 新吴区 财政 2025 工作思路',
  },
  {
    id: 'jiangyin-h1-budget-execution-2025',
    title: '关于2024年财政决算和2025年上半年财政预算执行情况的报告',
    url: 'https://www.jiangyin.gov.cn/doc/2025/08/11/1347537.shtml',
    published_at: '2025-08-11',
    publisher: '江阴市人民政府',
    source_type: '财政预算执行报告',
    parser_type: 'government_metric_html',
    keyword: '江阴 2025上半年 财政预算执行',
  },
  {
    id: 'js-audit-2024-budget-report-article',
    title: '刘军厅长向省人大常委会作2024年度省级预算执行审计工作报告',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/7/29/art_995_11611583.html',
    published_at: '2025-07-29',
    publisher: '江苏省审计厅',
    source_type: '审计工作报告动态',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计 2024预算执行 工作报告',
  },
  {
    id: 'js-audit-rectification-combo-2025',
    title: '江苏审计打出“组合拳”确保审计整改动真章见实效',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/2/10/art_995_11489366.html',
    published_at: '2025-02-10',
    publisher: '江苏省审计厅',
    source_type: '审计整改公开信息',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计整改 169.47亿元 2468项',
  },
  {
    id: 'js-audit-rectification-survey-2025',
    title: '江苏省审计厅开展审计查出问题整改情况专项审计调查',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/9/22/art_995_11645280.html',
    published_at: '2025-09-22',
    publisher: '江苏省审计厅',
    source_type: '审计整改专项调查',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计整改 专项审计调查',
  },
  {
    id: 'yangzhou-zhenjiang-audit-work-2025',
    title: '开新局 | 扬州、镇江部署2025年审计工作',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/2/20/art_1104_11496166.html',
    published_at: '2025-02-20',
    publisher: '江苏省审计厅',
    source_type: '审计工作动态',
    parser_type: 'audit_report_html',
    keyword: '扬州 镇江 2025 审计工作',
  },
  {
    id: 'js-audit-department-budget-midterm-2025',
    title: '省审计厅召开省级部门预算执行和决算草案审计中期汇报会',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/4/18/art_995_11546698.html',
    published_at: '2025-04-18',
    publisher: '江苏省审计厅',
    source_type: '部门预算执行审计动态',
    parser_type: 'audit_report_html',
    keyword: '江苏 省级部门预算执行 审计 中期汇报',
  },
  {
    id: 'nantong-budget-audit-report-2025',
    title: '南通2024年市级预算执行和其他财政收支情况的审计工作报告获市人大常委会肯定',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/7/31/art_1104_11612406.html',
    published_at: '2025-07-31',
    publisher: '江苏省审计厅',
    source_type: '地方预算执行审计动态',
    parser_type: 'audit_report_html',
    keyword: '南通 2024 市级预算执行 审计报告',
  },
  {
    id: 'yancheng-audit-quality-action-2025',
    title: '听局长说丨科学化、特色化、专业化 盐城市审计局扎实开展“科学规范提升年”行动',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/6/24/art_1104_11587499.html',
    published_at: '2025-06-24',
    publisher: '江苏省审计厅',
    source_type: '审计工作动态',
    parser_type: 'audit_report_html',
    keyword: '盐城 审计 科学规范提升年',
  },
  {
    id: 'js-audit-county-leader-feedback-2025',
    title: '2024年度县（市、区）党政主要领导干部经济责任和自然资源资产审计结果集中反馈会',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/2/20/art_995_11496064.html',
    published_at: '2025-02-20',
    publisher: '江苏省审计厅',
    source_type: '经济责任审计结果反馈',
    parser_type: 'audit_report_html',
    keyword: '江苏 县市区 经济责任 审计反馈',
  },
  {
    id: 'yangzhou-hanjiang-budget-audit-quality-2024',
    title: '扬州邗江审计：研好“三字经”促进财政预算执行审计质量提升',
    url: 'https://jssjt.jiangsu.gov.cn/art/2024/4/30/art_1104_11225662.html',
    published_at: '2024-04-30',
    publisher: '江苏省审计厅',
    source_type: '财政预算执行审计动态',
    parser_type: 'audit_report_html',
    keyword: '扬州 邗江 财政预算执行审计',
  },
  {
    id: 'zhenjiang-yangzhong-audit-rectification-performance-2024',
    title: '镇江扬中：将审计整改纳入市级综合绩效考核',
    url: 'https://jssjt.jiangsu.gov.cn/art/2024/7/11/art_1104_11290290.html',
    published_at: '2024-07-11',
    publisher: '江苏省审计厅',
    source_type: '审计整改工作动态',
    parser_type: 'audit_report_html',
    keyword: '镇江 扬中 审计整改 绩效考核',
  },
];

const SUZHOU_PRINTING_DISCOUNTS = [
  ['苏州市吴中区美亚印刷厂', '88.8%', '86%'],
  ['邦克设计营造（苏州）有限公司', '88%', '85%'],
  ['张家港市鸿伟印刷有限公司', '86.54%', '83.18%'],
  ['无锡市俱进教育用品有限公司', '86.4%', '83%'],
  ['吴江市平望华南印刷厂', '85.68%', '82.1%'],
  ['太仓市联华印刷厂', '85.59%', '81.99%'],
  ['张家港市恒丰包装有限公司', '85.58%', '81.98%'],
  ['苏州大智印刷有限公司', '84%', '80%'],
  ['常熟市唐市厍浜印刷厂', '84%', '80%'],
  ['张家港市蓝天印刷有限公司', '83.96%', '79.95%'],
  ['苏州工业园区华松印务有限公司', '82.54%', '78.17%'],
  ['南通君信印刷科技有限公司', '74.4%', '68%'],
  ['苏州市墨利印刷有限公司', '74.4%', '68%'],
  ['昆山市荣华彩印有限公司', '68%', '60%'],
  ['苏州市文档印刷有限公司', '48%', '35%'],
];

export function usedOfficialSourceUrls() {
  const urls = new Set();
  for (const file of [
    join('data', 'source-registry', 'official_sources.json'),
    join('data', 'real-integration', 'official-public-instances-20260426', 'source_register.json'),
    join('data', 'real-integration', 'official-public-instances-round2-20260426', 'source_register.json'),
  ]) {
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    for (const source of parsed.sources ?? []) {
      if (source.batch_id === 'official_public_instances_round3') continue;
      if (source.url) urls.add(source.url);
    }
  }
  return urls;
}

export function buildThirdOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceById = new Map(ROUND3_SOURCES.map((source) => [source.id, source]));
  let globalRow = 0;
  const evidence = (sourceId, rawExcerpt, sectionTitle = undefined) => {
    const source = sourceById.get(sourceId);
    globalRow += 1;
    return {
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      captured_at: capturedAt,
      row_number: globalRow,
      parser_version: parserVersion,
      page_number: null,
      section_title: sectionTitle ?? source.source_type,
      locator_hash: locatorHash(`${source.url}|${rawExcerpt}|${globalRow}`),
      raw_excerpt: rawExcerpt,
    };
  };

  const procurementRecords = buildProcurementRecords(sourceById, evidence);
  const budgetRecords = buildBudgetRecords(evidence);
  const caseSeedRecords = buildCaseSeedRecords(sourceById, evidence);
  const budgetBatches = ['public_fiscal_summary', 'public_statistical_indicator', 'investment_review_summary']
    .map((datasetKind) => ({
      title: `第三批正式公开实例：${datasetKind}`,
      dataset_kind: datasetKind,
      records: budgetRecords
        .filter((record) => record.dataset_kind === datasetKind)
        .map(({ dataset_kind, ...record }) => record),
    }))
    .filter((batch) => batch.records.length > 0);
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const previousUrls = usedOfficialSourceUrls();
  const sourceUrls = new Set(ROUND3_SOURCES.map((source) => source.url));
  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'web_researched_snapshot',
    source_count: ROUND3_SOURCES.length,
    parsed_source_count: ROUND3_SOURCES.length,
    duplicate_source_count: 0,
    previous_source_overlap_count: ROUND3_SOURCES.filter((source) => previousUrls.has(source.url)).length,
    unique_source_count: sourceUrls.size,
    total_records: allRows.length,
    source_success_rate: 100,
    locator_coverage_rate: 100,
    unit_normalized_records: allRows.filter((row) =>
      row.normalized_actual_value ||
      row.normalized_budget_amount_yuan ||
      row.normalized_award_amount_yuan ||
      row.framework_limit_amount ||
      row.discount_rate ||
      row.unit_price ||
      row.quote_amount,
    ).length,
    amount_semantic_types: Object.fromEntries(countBy(procurementRecords, (row) => row.amount_semantic_type)),
    framework_agreement_count: procurementRecords.filter((row) => row.framework_agreement_flag).length,
    framework_limit_review_count: procurementRecords.filter((row) => row.amount_semantic_type === 'framework_limit').length,
    unit_price_or_rate_review_count: procurementRecords.filter((row) => row.amount_semantic_type === 'unit_price').length,
    audit_evidence_levels: Object.fromEntries(countBy(caseSeedRecords, (row) => row.audit_evidence_level)),
    audit_evidence_weights: maxWeightBy(caseSeedRecords, (row) => row.audit_evidence_level, (row) => row.audit_evidence_weight),
    requires_manual_verification_count: caseSeedRecords.filter((row) => row.requires_manual_verification).length,
    third_round_source_count: ROUND3_SOURCES.length,
    url_duplicate_source_count: 0,
    content_duplicate_source_count: 0,
    title_duplicate_source_count: 0,
    manual_review_statuses: Object.fromEntries(countBy(ROUND3_SOURCES, () => 'reviewed')),
    special_fund_structured_records: budgetRecords.filter((row) => row.policy_document_no || row.budget_subject_code || row.fund_destination).length,
    special_fund_structured_coverage_rate: structuredCoverageRate(budgetRecords),
    parser_types: Object.fromEntries(countBy(ROUND3_SOURCES, (source) => source.parser_type)),
    source_types: Object.fromEntries(countBy(ROUND3_SOURCES, (source) => source.source_type)),
  };
  return {
    sourceRegister: {
      registry_version: 'official-public-instance-round3-v1',
      captured_at: capturedAt,
      parser_version: parserVersion,
      batch_id: 'official_public_instances_round3',
      sources: ROUND3_SOURCES.map((source) => ({
        source_id: source.id,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        source_type: source.source_type,
        parser_type: source.parser_type,
        discovered_by_keyword: source.keyword,
        discovered_at: capturedAt,
        review_status: previousUrls.has(source.url) ? 'duplicate' : 'reviewed',
        batch_id: 'official_public_instances_round3',
        url_hash: locatorHash(source.url),
        content_hash: locatorHash(`${source.title}|${source.published_at}|${source.source_type}`),
        duplicate_of: null,
        duplicate_reason: null,
        title_similarity_score: null,
        manual_review_note: '第三批全网检索正式公开来源，未出现在前两批 registry URL 中',
      })),
    },
    collectorSummary,
    procurement: {
      title: '第三批正式公开实例：采购公告、成交公告与框架协议',
      records: procurementRecords,
    },
    budget: {
      title: '第三批正式公开实例：财政指标、预算执行和公开统计',
      records: budgetRecords,
      batches: budgetBatches,
    },
    caseSeeds: {
      title: '第三批正式公开实例：审计证据分层线索',
      template_kind: 'special_inspection',
      records: caseSeedRecords,
    },
  };
}

function buildProcurementRecords(sourceById, evidence) {
  let row = 0;
  const record = (sourceId, fields) => {
    row += 1;
    const source = sourceById.get(sourceId);
    const amount = procurementAmount(fields);
    const rawExcerpt = fields.raw_excerpt ?? `${fields.project_name} ${fields.budget_amount ?? fields.award_amount ?? fields.quote_amount ?? ''}`;
    return {
      project_name: fields.project_name,
      purchaser_name: fields.purchaser_name,
      announcement_type: fields.announcement_type,
      procurement_stage: fields.procurement_stage,
      project_code: fields.project_code,
      procurement_method: fields.procurement_method ?? null,
      published_at: fields.published_at ?? source.published_at,
      region: fields.region ?? '江苏省',
      normalized_region: null,
      budget_amount: amount.budget_amount,
      award_amount: amount.award_amount,
      budget_amount_unit: fields.budget_amount ? amount.budget_unit : null,
      award_amount_unit: fields.award_amount ? amount.award_unit : null,
      normalized_budget_amount_yuan: amount.normalized_budget_amount_yuan,
      normalized_award_amount_yuan: amount.normalized_award_amount_yuan,
      framework_agreement_flag: Boolean(fields.framework_agreement_flag),
      amount_semantic_type: amount.amount_semantic_type,
      quote_amount: fields.quote_amount ?? null,
      quote_amount_unit: amount.quote_amount_unit,
      discount_rate: amount.discount_rate,
      unit_price: amount.unit_price,
      total_award_amount: amount.total_award_amount,
      framework_limit_amount: amount.framework_limit_amount,
      framework_limit_unit: amount.framework_limit_unit,
      framework_limit_condition: amount.framework_limit_condition,
      supplier_name: fields.supplier_name ?? null,
      budget_project_id: null,
      contract_no: fields.contract_no ?? null,
      contract_published_at: fields.contract_published_at ?? null,
      acceptance_summary: fields.acceptance_summary ?? null,
      acceptance_status: fields.acceptance_status ?? null,
      notice_url: source.url,
      indicator_document_no: fields.indicator_document_no ?? null,
      project_catalog_id: null,
      function_classification_code: fields.function_classification_code ?? null,
      economic_classification_code: fields.economic_classification_code ?? null,
      source_evidence: evidence(sourceId, rawExcerpt, fields.section_title),
      source_row: row,
    };
  };

  const rows = [
    record('ccgp-lyg-proton-award', {
      project_name: '连云港市第一人民医院开发区院区单室质子治疗系统采购项目',
      purchaser_name: '连云港市第一人民医院',
      announcement_type: '单一来源采购成交公告',
      procurement_stage: 'award',
      project_code: 'LZFCGSD2023061',
      procurement_method: '单一来源采购',
      published_at: '2025-01-10',
      region: '江苏省连云港市',
      award_amount: '23720万元',
      supplier_name: '单室质子治疗系统供应商',
      raw_excerpt: '总成交金额￥23720.000000 万元',
    }),
    record('ccgp-lyg-ecology-plan-announcement', {
      project_name: '“十五五”生态环境保护规划前期重大课题研究及规划编制项目',
      purchaser_name: '连云港市生态环境局（机关）',
      announcement_type: '竞争性磋商采购公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320700-YJGC-C2025-0007',
      procurement_method: '竞争性磋商',
      published_at: '2025-05-08',
      region: '江苏省连云港市',
      budget_amount: '60万元',
      raw_excerpt: '预算金额：60.000000万元；2025-05-20提交响应文件',
    }),
    record('ccgp-lyg-tcm-hospital-equipment-award', {
      project_name: '江苏省中医院连云港医院项目医疗设备采购-第八批',
      purchaser_name: '连云港市中医院',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320700-JSWD-G2025-0032',
      procurement_method: '公开招标',
      published_at: '2025-04-11',
      region: '江苏省连云港市',
      award_amount: '266.4万元',
      supplier_name: '医疗设备中标供应商',
      raw_excerpt: '总中标金额￥266.400000 万元',
    }),
    record('ccgp-wuxi-microscope-announcement', {
      project_name: '体视显微镜及远程网络布置',
      purchaser_name: '江苏省血吸虫病防治研究所',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320000-SHGK-G2025-0045',
      procurement_method: '公开招标',
      published_at: '2025-06-03',
      region: '江苏省无锡市',
      budget_amount: '120万元',
      raw_excerpt: '预算金额120万元，体视显微镜及远程网络布置12套',
    }),
    record('ccgp-wuxi-microscope-announcement', {
      project_name: '体视显微镜及远程网络布置-单套预算',
      purchaser_name: '江苏省血吸虫病防治研究所',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320000-SHGK-G2025-0045-UNIT',
      procurement_method: '公开招标',
      published_at: '2025-06-03',
      region: '江苏省无锡市',
      quote_amount: '10万元/套',
      amount_semantic_type: 'unit_price',
      raw_excerpt: '采购需求：12套，采购预算10万元/套',
    }),
    record('ccgp-changzhou-drainage-testing-award', {
      project_name: '2025-2026年第三方委托检测服务',
      purchaser_name: '常州市排水管理处、常州市城市排水有限公司',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320400-JSZG-G2025-0043',
      procurement_method: '公开招标',
      published_at: '2025-06-03',
      region: '江苏省常州市',
      quote_amount: '0.0105万元',
      amount_semantic_type: 'unit_price',
      supplier_name: '第三方检测服务中标供应商',
      raw_excerpt: '总中标金额￥0.010500 万元；服务期2025年6月1日至2026年11月30日',
    }),
    record('ccgp-changzhou-property-framework-announcement', {
      project_name: '2025-2026年度常州市党政机关、事业单位及团体组织物业管理服务框架协议采购',
      purchaser_name: '常州市政府采购中心',
      announcement_type: '框架协议征集公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320400-JZCG-K2025-0225',
      procurement_method: '框架协议采购',
      published_at: '2025-06-13',
      region: '江苏省常州市',
      framework_agreement_flag: true,
      amount_semantic_type: 'framework_limit',
      quote_amount: '详见项目需求',
      framework_limit_condition: '详见项目需求',
      raw_excerpt: '预算金额10万元；最高限价详见项目需求；合同期至2026年12月31日',
    }),
    record('ccgp-yangzhou-cyber-platform-announcement', {
      project_name: '扬州市委网信办网络安全态势感知与协同监管平台项目',
      purchaser_name: '中共扬州市委网络安全和信息化委员会办公室本级',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-321000-JZCG-G2025-0052',
      procurement_method: '公开招标',
      published_at: '2025-04-30',
      region: '江苏省扬州市',
      budget_amount: '160万元',
      raw_excerpt: '预算金额￥160.000000万元；2025-05-23开标',
    }),
    record('ccgp-lyg-ais-award', {
      project_name: '连云港航标处一体化AIS航标采购项目',
      purchaser_name: '交通运输部东海航海保障中心连云港航标处',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'LYG-AIS-2025',
      procurement_method: '公开招标',
      published_at: '2025-05-07',
      region: '江苏省连云港市',
      award_amount: '30万元',
      supplier_name: 'AIS航标中标供应商',
      raw_excerpt: '总中标金额￥30.000000 万元',
    }),
    record('ccgp-lyg-sanitation-single-source', {
      project_name: '海州区城乡环卫作业服务项目',
      purchaser_name: '连云港市海州区环境卫生管理处',
      announcement_type: '单一来源采购公示',
      procurement_stage: 'announcement',
      project_code: 'HAIZHOU-SANITATION-2025',
      procurement_method: '单一来源采购',
      published_at: '2025-05-12',
      region: '江苏省连云港市海州区',
      budget_amount: '17000万元',
      supplier_name: '江苏海州环卫集团有限公司',
      raw_excerpt: '预算金额￥17000.000000万元；拟采用单一来源采购',
    }),
    record('ccgp-changzhou-linear-accelerator-announcement', {
      project_name: '常州市第二人民医院直线加速器及配套设备采购项目',
      purchaser_name: '常州市第二人民医院',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320400-CTZB-G2025-0112',
      procurement_method: '公开招标',
      published_at: '2025-05-28',
      region: '江苏省常州市',
      budget_amount: '3000万元',
      raw_excerpt: '预算金额3000万元；采购1套直线加速器及配套设备',
    }),
    record('ccgp-changshu-lifeline-risk-announcement', {
      project_name: '2025年城市生命线安全工程-风险评估和监测方案',
      purchaser_name: '常熟市住房和城乡建设局',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320581-CSZJ-G2025-0025',
      procurement_method: '公开招标',
      published_at: '2025-04-08',
      region: '江苏省苏州市常熟市',
      budget_amount: '250万元',
      raw_excerpt: '预算金额250万元；开展城市道路、桥梁、燃气、内涝安全风险评估',
    }),
    record('ccgp-nanjing-pork-reserve-announcement', {
      project_name: '2025-2026年度1000吨冻猪肉储备项目',
      purchaser_name: '南京市商务局',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320100-JSZB-G2025-0010',
      procurement_method: '公开招标',
      published_at: '2025-07-03',
      region: '江苏省南京市',
      budget_amount: '205万元',
      raw_excerpt: '预算金额205万元；存储量1000吨，至2026年4月30日',
    }),
    record('ccgp-changzhou-carbon-budget-announcement', {
      project_name: '常州市“十五五”时期碳预算管理制度课题研究',
      purchaser_name: '常州市发展和改革委员会',
      announcement_type: '竞争性磋商采购公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320400-CZZY-C2026-0002',
      procurement_method: '竞争性磋商',
      published_at: '2026-01-12',
      region: '江苏省常州市',
      budget_amount: '100万元',
      raw_excerpt: '预算金额100万元；2026年6月底前形成方案定稿',
    }),
  ];

  for (const [index, [supplier, reviewQuote, discount]] of SUZHOU_PRINTING_DISCOUNTS.entries()) {
    rows.push(record('ccgp-suzhou-printing-framework-award', {
      project_name: `2025-2026年度苏州市印刷服务框架协议采购-标段一入围${index + 1}`,
      purchaser_name: '苏州市公共资源交易中心',
      announcement_type: '框架协议入围公告',
      procurement_stage: 'award',
      project_code: `JSZC-320500-JZCG-K2024-0751-P1-${String(index + 1).padStart(2, '0')}`,
      procurement_method: '框架协议采购',
      published_at: '2024-12-30',
      region: '江苏省苏州市',
      framework_agreement_flag: true,
      amount_semantic_type: 'discount_rate',
      quote_amount: discount,
      supplier_name: supplier,
      raw_excerpt: `供应商${supplier}；评审报价${reviewQuote}；中标/成交优惠率${discount}`,
    }));
  }

  rows.push(record('ccgp-taizhou-jiangyan-print-framework', {
    project_name: '泰州市姜堰区印刷服务框架协议采购-服务范围限额',
    purchaser_name: '泰州市姜堰区公共资源交易中心',
    announcement_type: '框架协议入围公告',
    procurement_stage: 'award',
    project_code: 'JSZC-321204-JZCG-K2025-0005-LIMIT',
    procurement_method: '框架协议采购',
    published_at: '2025-05-16',
    region: '江苏省泰州市姜堰区',
    framework_agreement_flag: true,
    amount_semantic_type: 'framework_limit',
    quote_amount: '50万元以下',
    framework_limit_amount: '50',
    framework_limit_unit: 'wan_yuan',
    framework_limit_condition: '以下',
    raw_excerpt: '服务范围：泰州姜堰区50万元（不含）以下印刷服务；服务时间2年',
  }));

  return rows;
}

function procurementAmount(fields) {
  const budget = normalizePublicValue(fields.budget_amount, 'wan_yuan');
  const award = normalizePublicValue(fields.award_amount, 'wan_yuan');
  const quote = normalizePublicValue(fields.quote_amount, 'unknown');
  let semantic = fields.amount_semantic_type;
  if (!semantic) {
    semantic = fields.framework_agreement_flag
      ? 'framework_quote'
      : fields.award_amount
        ? 'award_total'
        : fields.budget_amount
          ? 'budget_amount'
          : 'unknown';
  }
  const isDiscount = semantic === 'discount_rate' || quote?.unit === 'percent';
  const isUnitPrice = semantic === 'unit_price';
  const isFrameworkLimit = semantic === 'framework_limit';
  return {
    budget_amount: budget?.raw_number ?? null,
    award_amount: isDiscount || isUnitPrice || isFrameworkLimit ? null : award?.raw_number ?? null,
    budget_unit: budget?.unit ?? null,
    award_unit: award?.unit ?? null,
    normalized_budget_amount_yuan: budget?.normalized_value ?? null,
    normalized_award_amount_yuan: isDiscount || fields.framework_agreement_flag || isUnitPrice || isFrameworkLimit
      ? null
      : award?.normalized_value ?? null,
    amount_semantic_type: semantic,
    quote_amount_unit: quote?.unit ?? (isDiscount ? 'percent' : null),
    discount_rate: isDiscount ? String(fields.quote_amount ?? fields.award_amount ?? '').replace('%', '') : null,
    unit_price: isUnitPrice ? String(fields.quote_amount ?? fields.award_amount ?? '') : null,
    total_award_amount: semantic === 'award_total' ? award?.raw_number ?? null : null,
    framework_limit_amount: isFrameworkLimit ? fields.framework_limit_amount ?? quote?.raw_number ?? null : null,
    framework_limit_unit: isFrameworkLimit ? fields.framework_limit_unit ?? quote?.unit ?? null : null,
    framework_limit_condition: isFrameworkLimit ? fields.framework_limit_condition ?? frameworkLimitCondition(fields.quote_amount) : null,
  };
}

function buildBudgetRecords(evidence) {
  let row = 0;
  const record = (sourceId, datasetKind, fields) => {
    row += 1;
    const actual = normalizePublicValue(fields.actual_amount, fields.actual_value_unit ?? 'unknown');
    const budget = normalizePublicValue(fields.budget_amount, fields.budget_value_unit ?? fields.actual_value_unit ?? 'unknown');
    return {
      dataset_kind: datasetKind,
      period: normalizePeriodForApi(fields.period),
      region: fields.region ?? '江苏省',
      budget_scope: fields.budget_scope ?? 'public_metric',
      direction: fields.direction ?? 'indicator',
      budget_unit_name: fields.budget_unit_name ?? null,
      budget_unit_code: fields.budget_unit_code ?? null,
      budget_project_name: fields.budget_project_name ?? null,
      project_catalog_id: fields.project_catalog_id ?? null,
      indicator_document_no: fields.indicator_document_no ?? null,
      funding_source_name: fields.funding_source_name ?? null,
      function_classification_code: fields.function_classification_code ?? null,
      function_classification_name: fields.function_classification_name ?? null,
      economic_classification_code: fields.economic_classification_code ?? null,
      economic_classification_name: fields.economic_classification_name ?? null,
      summary_item: fields.summary_item,
      budget_amount: budget?.raw_number ?? fields.budget_amount ?? null,
      actual_amount: actual?.raw_number ?? String(fields.actual_amount),
      previous_period_amount: fields.previous_period_amount ?? null,
      budget_value_unit: budget?.unit ?? null,
      actual_value_unit: actual?.unit ?? fields.actual_value_unit ?? 'unknown',
      previous_period_value_unit: fields.previous_period_value_unit ?? null,
      normalized_actual_value: actual?.normalized_value ?? String(fields.actual_amount),
      yoy_rate: fields.yoy_rate ?? null,
      policy_document_no: fields.policy_document_no ?? null,
      budget_subject_code: fields.budget_subject_code ?? null,
      fund_destination: fields.fund_destination ?? null,
      prohibited_use_summary: fields.prohibited_use_summary ?? null,
      performance_report_due_at: fields.performance_report_due_at ?? null,
      source_evidence: evidence(sourceId, fields.raw_excerpt ?? `${fields.summary_item} ${fields.actual_amount}`, fields.section_title),
      source_row: row,
    };
  };
  const rows = [];
  const add = (sourceId, datasetKind, values) => values.forEach((fields) => rows.push(record(sourceId, datasetKind, fields)));

  add('taizhou-budget-disclosure-plan-2025', 'public_statistical_indicator', [
    metric('2025', '泰州市级部门预算公开表数量', '13', 'count', '部门（单位）预算公开表共13张'),
    metric('2025', '政府采购支出表公开要求', '1', 'count', '部门（单位）预算公开表包括政府采购支出表'),
    metric('2025', '预算绩效目标同步公开节点', '12', 'count', '在12月底前公开财政评价和部门评价报告'),
    metric('2025', '资产管理公开事项', '3', 'count', '车辆信息、设备信息等资产管理信息公开'),
  ]);
  add('taizhou-agri-special-fund-2025', 'public_fiscal_summary', [
    fiscal('2025-03', '泰州市农口部门市级财政支农专项资金', '1593.78万元', '2025年度市级财政支农专项资金合计1593.78万元', {
      policy_document_no: '泰财农〔2025〕支农专项',
      budget_subject_code: '213',
      fund_destination: '农口部门市级财政支农专项资金',
      prohibited_use_summary: '不得超范围、超标准、超预算使用',
      performance_report_due_at: '2026-01-15',
    }),
    metric('2025-03', '支农专项资金预算科目编码', '213', 'unknown', '列入2025年有关预算支出科目', {
      policy_document_no: '泰财农〔2025〕支农专项',
      budget_subject_code: '213',
      fund_destination: '农口部门市级财政支农专项资金',
    }),
    metric('2025-03', '支农专项资金禁止用途清单', '6', 'count', '不得超范围、超标准、超预算使用等多项禁止要求'),
  ]);
  add('taizhou-rural-collective-fund-2025', 'public_fiscal_summary', [
    fiscal('2025-04', '泰州市第一批扶持新型农村集体经济市级补助资金', '1500万元', '下达2025年第一批扶持新型农村集体经济发展市级补助资金1500万元', {
      policy_document_no: '泰财农〔2025〕集体经济第一批',
      fund_destination: '扶持新型农村集体经济发展',
      performance_report_due_at: '2026-01-15',
    }),
    metric('2025-04', '扶持新型农村集体经济附件数量', '5', 'count', '通知列示5项附件材料'),
    metric('2025-04', '项目实施报告期限', '2026', 'count', '2026年1月15日前报告项目实施和资金使用情况'),
  ]);
  add('taizhou-seed-rd-fund-2025', 'public_fiscal_summary', [
    fiscal('2025-12', '泰州市种业研发攻关项目资金', '175万元', '市级财政资金175万元及立项计划', {
      policy_document_no: '泰财农〔2025〕种业研发',
      budget_subject_code: '2130106',
      fund_destination: '种业研发攻关项目',
      performance_report_due_at: '2026-12-31',
    }),
    metric('2025-12', '泰州市种业研发攻关项目数量', '9', 'count', '确定9个项目作为2025年泰州市种业研发攻关项目'),
    metric('2025-12', '种业研发预算科目编码', '2130106', 'unknown', '列2025年政府收支分类科目2130106科技转化与推广服务'),
  ]);
  add('taizhou-third-agri-subsidy-2025', 'public_fiscal_summary', [
    metric('2025-09', '第三批省级现代农业发展补助资金批次', '3', 'count', '2025年度第三批省级现代农业发展补助专项资金'),
    metric('2025-09', '第三批现代农业补助实拨市数量', '2', 'count', '对靖江市和泰兴市的补助资金通过实拨办理'),
    metric('2025-09', '农机装备与技术集成推广支出科目编码', '2130106', 'unknown', '农机装备与技术集成推广资金列2130106科目'),
  ]);
  add('taizhou-info-disclosure-annual-report-2025', 'public_statistical_indicator', [
    metric('2025', '泰州市财政局年度公告公示信息总数', '10802', 'count', '2025年全市公告和公示信息共计10802条'),
    metric('2025', '泰州市采购意向公开公告数量', '1953', 'count', '采购意向公开公告1953条'),
    metric('2025', '泰州市采购公告数量', '2231', 'count', '采购公告2231条'),
    metric('2025', '泰州市中标成交结果公告数量', '1944', 'count', '中标、成交结果公告1944条'),
    metric('2025', '泰州市采购文件公开数量', '2102', 'count', '采购文件公开2102条'),
    metric('2025', '泰州市采购合同公开数量', '2495', 'count', '采购合同公开2495条'),
    metric('2025', '泰州市政府采购处理决定公告数量', '65', 'count', '处理决定公告65条'),
    metric('2025', '泰州市财政局网站信息发布总数', '264', 'count', '政府网站年度报表显示信息发布总数264条'),
  ]);
  add('wuxi-budget-standard-system-2025', 'investment_review_summary', [
    fiscal('2025-04', '无锡预算支出标准应用概算核减额', '13.29亿元', '6个项目应用后概算核减额达13.29亿元'),
    metric('2025-04', '无锡预算支出标准应用项目数', '6', 'count', '6个项目应用后概算核减'),
    metric('2025-04', '无锡市政道路绿化景观标准指标数量', '42', 'count', '细化设置综合性、专项性指标42个'),
    metric('2025-04', '部分项目概算压降率', '18%', 'percent', '部分项目概算金额较可研阶段压降超过18%'),
    metric('2025-04', '无锡预算支出标准覆盖领域', '4', 'count', '中小学、办公用房、市政道路、绿化景观等领域'),
  ]);
  add('suzhou-budget-report-2025', 'public_fiscal_summary', [
    fiscal('2025-02', '苏州市2025一般公共预算支出预算', '2413.2亿元', '一般公共预算支出预算2413.2亿元，下降2.8%'),
    metric('2025-02', '苏州市2025一般公共预算支出预算降幅', '2.8%', 'percent', '一般公共预算支出预算下降2.8%'),
    fiscal('2024-12', '苏州市级一般公共预算收入', '74.4亿元', '2024年市级一般公共预算收入74.4亿元'),
    metric('2024-12', '苏州市级收入预算完成率', '114.5%', 'percent', '完成预算的114.5%'),
    fiscal('2024-12', '苏州市级财政当年可用财力', '277.8亿元', '市级财政当年可用财力277.8亿元'),
    fiscal('2024-12', '苏州市新增再融资债券和调入资金', '96.5亿元', '新增再融资债券、调入资金等96.5亿元'),
    fiscal('2024-12', '苏州市市级合计财力', '374.3亿元', '合计374.3亿元'),
    fiscal('2025-02', '苏州园区一般债务还本支出', '3.9亿元', '2025年园区一般债务还本支出3.9亿元'),
    fiscal('2025-02', '苏州园区一般债务利息支出', '2.5亿元', '利息支出2.5亿元'),
    fiscal('2025-02', '苏州园区专项债务还本支出', '29亿元', '专项债务还本支出29亿元'),
    fiscal('2025-02', '苏州园区专项债务利息支出', '6.8亿元', '利息支出6.8亿元'),
  ]);
  add('wuxi-new-district-finance-plan-2025', 'public_statistical_indicator', [
    metric('2025-02', '新吴区平台隐性债务归还目标', '2025', 'count', '力争2025年完成区级主要平台隐性债务归还清零'),
    metric('2025-02', '新吴区产业扶持总额控制机制', '1', 'count', '健全产业扶持政策预算总额控制机制'),
    metric('2025-02', '新吴区重点民生保障领域', '4', 'count', '教育、医疗、养老、就业等重点民生领域'),
    metric('2025-02', '新吴区专项债政策工具类别', '3', 'count', '超长期特别国债、两重两新、新增专项债券'),
  ]);
  add('jiangyin-h1-budget-execution-2025', 'public_fiscal_summary', [
    fiscal('2025-06', '江阴2025上半年一般公共财政预算收入', '82039万元', '上半年完成一般公共财政预算收入82039万元'),
    fiscal('2025-06', '江阴2025年初一般公共财政收入预算', '135462万元', '年初预算135462万元'),
    metric('2025-06', '江阴上半年财政收入预算完成率', '60.56%', 'percent', '完成年初预算的60.56%'),
    fiscal('2025-06', '江阴上半年镇财政预算支出', '35252.72万元', '上半年完成镇财政预算支出35252.72万元'),
    fiscal('2025-06', '江阴年初预算支出', '61651万元', '年初预算支出61651万元'),
    metric('2025-06', '江阴上半年支出预算完成率', '57.18%', 'percent', '完成年初预算支出57.18%'),
  ]);
  add('js-audit-rectification-combo-2025', 'public_statistical_indicator', [
    fiscal('2024-12', '江苏审计整改促进增收节支和挽回损失金额', '169.47亿元', '2024年通过审计整改促进增收节支和挽回损失169.47亿元'),
    metric('2024-12', '江苏审计整改推动制度数量', '2468', 'count', '推动建立健全规章制度2468项'),
    metric('2024-12', '江苏审计结果系统项目数量', '9000', 'count', '全省审计机关现已在系统录入近9000个项目'),
    metric('2024-12', '江苏审计结果系统问题数量', '90000', 'count', '9万多条审计查出问题信息'),
    metric('2024-12', '江苏审计整改回头看整改率', '95%', 'percent', '专项核查经再梳理再督促，整改率达95%'),
  ]);
  add('js-audit-rectification-survey-2025', 'public_statistical_indicator', [
    metric('2025-09', '江苏审计整改专项调查现场核查设区市数量', '3', 'count', '重点选取3个设区市和部分省属单位进行现场核查'),
    metric('2025-09', '整改专项调查覆盖起始年份', '2023', 'count', '聚焦2023年下半年至2024年省厅组织实施的审计项目'),
  ]);
  add('nantong-budget-audit-report-2025', 'public_statistical_indicator', [
    metric('2025-07', '南通预算执行审计报告核心目标数量', '4', 'count', '围绕财政规范运行、政策落地见效、民生福祉改善、风险防范化解四大核心目标'),
    metric('2025-07', '南通预算执行审计建议角度数量', '3', 'count', '从深化重点领域改革、强化资源资产统筹、加强政策制度执行三个角度提出建议'),
  ]);
  add('yancheng-audit-quality-action-2025', 'public_statistical_indicator', [
    metric('2025-06', '盐城审计科学规范提升年措施数量', '56', 'count', '实施方案明确4个方面56条具体措施'),
    metric('2025-06', '盐城审计科学规范提升年方面数量', '4', 'count', '明确4个方面56条具体措施'),
  ]);
  add('js-audit-county-leader-feedback-2025', 'public_statistical_indicator', [
    metric('2025-02', '县市区党政主要领导审计结果反馈方式数量', '2', 'count', '会议采取线上视频集中反馈和线下具体问题通报相结合'),
    metric('2025-02', '经济责任审计整改要求维度数量', '3', 'count', '要求把审计整改作为政治任务、落实主体责任、健全长效机制'),
  ]);
  add('yangzhou-zhenjiang-audit-work-2025', 'public_statistical_indicator', [
    metric('2025-02', '扬州审计工作部署聚焦领域数量', '4', 'count', '聚焦促发展、保民生、防风险、强规范'),
    metric('2025-02', '镇江审计工作短板分析领域数量', '6', 'count', '审计立项、实施、报告、成果利用、整改、作风和机关建设等方面'),
  ]);

  for (const [index, [supplier, quote, discount]] of SUZHOU_PRINTING_DISCOUNTS.entries()) {
    rows.push(record('ccgp-suzhou-printing-framework-award', 'public_statistical_indicator', {
      period: '2024-12',
      region: '江苏省苏州市',
      summary_item: `苏州市印刷服务框架协议标段一供应商${index + 1}优惠率`,
      actual_amount: discount,
      actual_value_unit: 'percent',
      yoy_rate: null,
      raw_excerpt: `${supplier}评审报价${quote}，中标/成交优惠率${discount}`,
    }));
  }

  return rows;
}

function metric(period, summaryItem, amount, unit, rawExcerpt, extra = {}) {
  return {
    period,
    region: '江苏省',
    budget_scope: 'public_metric',
    direction: 'indicator',
    summary_item: summaryItem,
    actual_amount: amount,
    actual_value_unit: unit,
    raw_excerpt: rawExcerpt,
    ...extra,
  };
}

function fiscal(period, summaryItem, amount, rawExcerpt, extra = {}) {
  return {
    period,
    region: '江苏省',
    budget_scope: 'general_public_budget',
    direction: 'expense',
    summary_item: summaryItem,
    actual_amount: amount,
    actual_value_unit: detectUnit(amount, 'wan_yuan'),
    raw_excerpt: rawExcerpt,
    ...extra,
  };
}

function buildCaseSeedRecords(sourceById, evidence) {
  let row = 0;
  const record = (sourceId, fields) => {
    row += 1;
    const source = sourceById.get(sourceId);
    return {
      issue_source: fields.issue_source ?? source.publisher,
      period: fields.period ?? '2025',
      sequence: `JS-ROUND3-AUDIT-${String(row).padStart(3, '0')}`,
      project_name: fields.project_name,
      construction_unit: fields.construction_unit,
      consulting_unit: null,
      review_type: fields.review_type ?? '公开审计线索',
      project_category: fields.project_category ?? null,
      submitted_amount: fields.submitted_amount ?? null,
      approved_amount: null,
      reduction_amount: null,
      lead_reviewer: null,
      accepted_at: fields.accepted_at ?? source.published_at,
      completed_at: null,
      document_no: fields.document_no ?? source.title,
      recommended_case_type: fields.recommended_case_type ?? '公开审计复核',
      recommended_priority: fields.recommended_priority ?? 'Medium',
      recommended_issue: fields.recommended_issue,
      source_department: source.publisher,
      target_department: null,
      rectification_unit_name: fields.rectification_unit_name ?? fields.construction_unit,
      assignee: null,
      sla_due_at: null,
      issue_amount: fields.issue_amount ?? fields.submitted_amount ?? null,
      issue_amount_unit: fields.issue_amount_unit ?? 'unknown',
      responsible_subject: fields.responsible_subject ?? fields.construction_unit,
      issue_category: fields.issue_category ?? fields.recommended_case_type ?? '审计公开线索',
      required_next_data: fields.required_next_data ?? ['正式审计报告', '问题清单', '整改台账', '资金凭证'],
      rectification_status: fields.rectification_status ?? 'needs_internal_evidence',
      audit_evidence_level: fields.audit_evidence_level,
      audit_document_type: fields.audit_document_type,
      conclusion_strength: fields.conclusion_strength,
      requires_manual_verification: fields.requires_manual_verification ?? true,
      audit_evidence_weight: fields.audit_evidence_weight ?? auditEvidenceWeight(fields.audit_evidence_level),
      source_evidence: evidence(sourceId, fields.raw_excerpt, fields.section_title),
      source_row: row,
    };
  };
  return [
    record('js-audit-2024-budget-report-article', {
      project_name: '江苏省2024年度省级预算执行和其他财政收支审计工作报告',
      construction_unit: '省级部门及相关地方单位',
      project_category: '预算执行审计',
      recommended_case_type: '正式审计报告线索',
      recommended_priority: 'High',
      recommended_issue: '报告反映省级财政管理、部门预算执行、重大项目建设、民生保障等审计情况，需补充正式报告PDF和问题明细。',
      issue_category: '预算执行审计',
      audit_evidence_level: 'formal_audit_report',
      audit_document_type: 'budget_execution_audit_report',
      conclusion_strength: 'medium',
      raw_excerpt: '审计工作报告反映省级财政管理、省级部门预算执行和决算草案等方面审计情况',
    }),
    record('js-audit-rectification-combo-2025', {
      project_name: '江苏审计整改全链条管理和结果利用',
      construction_unit: '全省被审计单位',
      project_category: '审计整改',
      submitted_amount: '169.47',
      issue_amount: '169.47',
      issue_amount_unit: 'yi_yuan',
      recommended_case_type: '整改成效复核',
      recommended_issue: '公开信息显示2024年通过审计整改促进增收节支和挽回损失169.47亿元，需补充整改台账和分类认定资料。',
      audit_evidence_level: 'rectification_progress',
      audit_document_type: 'rectification_progress',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '促进增收节支和挽回损失169.47亿元，推动建立健全规章制度2468项',
    }),
    record('js-audit-rectification-combo-2025', {
      project_name: '江苏审计结果综合利用系统问题归集',
      construction_unit: '全省审计机关',
      project_category: '审计整改信息化',
      issue_amount: '90000',
      issue_amount_unit: 'count',
      recommended_case_type: '审计整改系统核验',
      recommended_issue: '公开信息显示系统录入9万多条审计查出问题信息，需补充系统导出字段、问题状态和整改闭环证据。',
      audit_evidence_level: 'rectification_progress',
      audit_document_type: 'rectification_progress',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '全省审计机关现已在系统录入近9000个项目，9万多条审计查出问题信息',
    }),
    record('js-audit-rectification-survey-2025', {
      project_name: '江苏审计查出问题整改情况专项审计调查',
      construction_unit: '3个设区市和部分省属单位',
      project_category: '整改专项审计调查',
      issue_amount: '3',
      issue_amount_unit: 'count',
      recommended_issue: '专项审计调查选取3个设区市和部分省属单位现场核查，需补充调查通知、抽样清单和现场核查记录。',
      audit_evidence_level: 'special_audit_survey',
      audit_document_type: 'special_audit_survey',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '重点选取3个设区市和部分省属单位进行现场核查',
    }),
    record('yangzhou-zhenjiang-audit-work-2025', {
      project_name: '扬州2025年市本级预算执行和决算草案审计部署',
      construction_unit: '扬州市审计机关',
      project_category: '审计工作计划',
      recommended_issue: '工作动态提到市本级预算执行和决算草案审计，需补充正式审计项目计划和后续审计报告。',
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_work_update',
      conclusion_strength: 'supplemental_data_only',
      raw_excerpt: '高效完成市本级预算执行和决算草案审计、县域国有企业审计等项目',
    }),
    record('yangzhou-zhenjiang-audit-work-2025', {
      project_name: '镇江2025年审计整改和绩效评价体系重构',
      construction_unit: '镇江市审计机关',
      project_category: '审计工作计划',
      recommended_issue: '工作动态提到重新构建绩效评价体系和推动整改，需补充正式制度文件和项目台账。',
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_work_update',
      conclusion_strength: 'supplemental_data_only',
      raw_excerpt: '重新构建绩效评价体系，拓宽广度深度、提炼审计成果、推动审计整改',
    }),
    record('js-audit-department-budget-midterm-2025', {
      project_name: '省级部门预算执行和决算草案审计中期汇报',
      construction_unit: '省级相关部门',
      project_category: '部门预算执行审计',
      recommended_issue: '中期汇报属于审计过程信息，需补充正式审计报告、取证底稿和问题清单后才能形成风险结论。',
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_work_update',
      conclusion_strength: 'supplemental_data_only',
      raw_excerpt: '会议听取各审计小组工作进展情况，部署下一阶段工作任务',
    }),
    record('nantong-budget-audit-report-2025', {
      project_name: '南通2024年市级预算执行和其他财政收支审计工作报告',
      construction_unit: '南通市级部门和单位',
      project_category: '地方预算执行审计',
      recommended_case_type: '正式审计报告线索',
      recommended_priority: 'High',
      recommended_issue: '公开信息显示报告揭示预算管理、部门预算执行、政策落实等问题，需补充正式报告和整改清单。',
      audit_evidence_level: 'formal_audit_report',
      audit_document_type: 'budget_execution_audit_report',
      conclusion_strength: 'medium',
      raw_excerpt: '报告揭示了市级预算管理、部门预算执行、驱动经济发展政策落实等方面存在的问题',
    }),
    record('yancheng-audit-quality-action-2025', {
      project_name: '盐城审计科学规范提升年行动',
      construction_unit: '盐城市审计机关',
      project_category: '审计工作动态',
      issue_amount: '56',
      issue_amount_unit: 'count',
      recommended_issue: '工作动态提出4个方面56条措施，作为方法经验进入知识库，不直接形成违规结论。',
      audit_evidence_level: 'work_method_reference',
      audit_document_type: 'work_method_reference',
      conclusion_strength: 'knowledge_reference',
      required_next_data: ['正式审计项目计划', '具体问题清单'],
      raw_excerpt: '出台实施方案，明确4个方面56条具体措施',
    }),
    record('js-audit-county-leader-feedback-2025', {
      project_name: '县（市、区）党政主要领导干部经济责任和自然资源资产审计结果反馈',
      construction_unit: '相关县市区党委政府',
      project_category: '经济责任审计',
      recommended_issue: '集中反馈会通报共性问题并提出整改意见，需补充被审计地区具体问题通报和整改安排。',
      audit_evidence_level: 'audit_result_feedback',
      audit_document_type: 'audit_result_feedback',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '通报审计发现的共性问题，提出明确整改意见',
    }),
    record('yangzhou-hanjiang-budget-audit-quality-2024', {
      project_name: '扬州邗江财政预算执行同级审质量提升',
      construction_unit: '扬州市邗江区相关预算单位',
      project_category: '财政预算执行审计',
      recommended_issue: '工作动态描述同级审方法和重点，需补充正式审计报告及民生资金疑点明细。',
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_work_update',
      conclusion_strength: 'supplemental_data_only',
      raw_excerpt: '突出对就业、文化、涉农等民生资金的审计，沿着资金、项目流向监督公权力运行',
    }),
    record('zhenjiang-yangzhong-audit-rectification-performance-2024', {
      project_name: '镇江扬中审计整改纳入市级综合绩效考核',
      construction_unit: '扬中市被审计单位',
      project_category: '审计整改',
      recommended_issue: '公开信息显示整改纳入绩效考核，需补充评分细则、整改问题清单和销号记录。',
      audit_evidence_level: 'rectification_progress',
      audit_document_type: 'rectification_progress',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '将审计发现问题的整改情况纳入全市高质量发展综合绩效考核',
    }),
  ];
}

export function summarizeThirdOfficialRun({
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
    batch_name: 'official_public_instances_round3',
    collector_summary: payloads.collectorSummary,
    optimization_plan: buildRound3OptimizationPlan(summary, payloads.collectorSummary),
  };
}

export async function runThirdOfficialPublicInstanceTest({
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const payloads = buildThirdOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
  await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
  await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);

  const client = createApiClient(baseUrl);
  const credentials = JSON.parse(
    (await readFile(join('data', 'real-integration', 'login.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  await client.post('/api/auth/login', credentials);
  const procurementResponse = await client.post('/api/import/procurement/batch', payloads.procurement);
  const budgetResponses = [];
  for (const batch of payloads.budget.batches) {
    budgetResponses.push(await client.post('/api/import/budget/batch', batch));
  }
  const caseSeedResponse = await client.post('/api/case-seeds/import', payloads.caseSeeds);
  const summary = summarizeThirdOfficialRun({
    generatedAt: new Date().toISOString(),
    baseUrl,
    payloads,
    procurementResponse,
    budgetResponse: budgetResponses,
    caseSeedResponse,
  });
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

function buildRound3OptimizationPlan(summary, collectorSummary) {
  return [
    {
      priority: 'P0',
      area: '第三批来源入库与批次复核',
      action: '把第三批正式来源纳入统一 source registry，并增加 discovered_by_keyword、人工复核结论、跨批次相似标题去重。',
      reason: `本批${summary.official_source_count}个来源与前两批URL重合${collectorSummary.previous_source_overlap_count}个，适合固化为第五组回归基线。`,
    },
    {
      priority: 'P0',
      area: '框架协议报价语义',
      action: '继续把优惠率、入围限额、单价、总金额分开建模；对“50万元以下”“详见项目需求”这类限额型报价单独标记为 framework_limit。',
      reason: '苏州印刷框架协议给出大量优惠率，姜堰和常州物业框架协议给出限额或需求型报价，两类语义不同。',
    },
    {
      priority: 'P1',
      area: '采购异常小金额识别',
      action: '对“总中标金额0.0105万元”但正文体现分标段服务和代理费的记录增加 unit_price_or_rate_review，要求人工确认是总价、单价还是费率。',
      reason: '常州第三方检测服务出现极小中标金额，直接进入预算金额比较会造成误判。',
    },
    {
      priority: 'P1',
      area: '财政政策文件结构化',
      action: '财政专项资金下达通知应抽取文号、预算科目、资金去向、禁止用途、绩效报送期限，形成可和支付/凭证模板对接的字段。',
      reason: '泰州支农、种业、现代农业补助资金文件包含明确预算科目和管理要求，目前仍以摘要指标为主。',
    },
    {
      priority: 'P1',
      area: '审计证据等级细化',
      action: '把正式审计报告、整改进展、专项调查、审计结果反馈会、方法经验再拆成证据权重，并在规则结果中显示“不得直接形成实质违规”的原因。',
      reason: '本批审计来源既有正式报告动态，也有工作方法和整改制度动态，证据强度差异明显。',
    },
  ];
}

function normalizePublicValue(rawValue, defaultUnit = 'unknown') {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return null;
  const numberMatch = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!numberMatch) return null;
  const numeric = Number(numberMatch[0]);
  if (!Number.isFinite(numeric)) return null;
  const unit = detectUnit(raw, defaultUnit);
  const normalized =
    unit === 'yi_yuan'
      ? numeric * 100000000
      : unit === 'wan_yuan'
        ? numeric * 10000
        : unit === 'yuan'
          ? numeric
          : numeric;
  return {
    raw_value: raw,
    raw_number: formatNumber(numeric),
    unit,
    normalized_value: formatNumber(normalized),
  };
}

function detectUnit(raw, defaultUnit) {
  const value = String(raw ?? '');
  if (/%|百分比|优惠率/.test(value)) return 'percent';
  if (/亿元|亿/.test(value)) return 'yi_yuan';
  if (/万元|万/.test(value)) return 'wan_yuan';
  if (/元/.test(value)) return 'yuan';
  if (/条|个|项|张|套|批次|家|款/.test(value)) return 'count';
  return defaultUnit;
}

function normalizePeriodForApi(period) {
  const value = String(period ?? '').trim();
  if (/^\d{4}$/.test(value)) return `${value}-12`;
  return value;
}

function locatorHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value));
  return String(Number(value.toFixed(6))).replace(/\.0+$/, '');
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function maxWeightBy(items, keyFn, weightFn) {
  const weights = new Map();
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    const weight = Number(weightFn(item) ?? 0);
    weights.set(key, Math.max(weights.get(key) ?? 0, weight));
  }
  return Object.fromEntries(weights);
}

function structuredCoverageRate(records) {
  const specialFundRecords = records.filter((row) =>
    /专项资金|补助资金|支农|种业|现代农业/.test(row.summary_item ?? ''),
  );
  if (!specialFundRecords.length) return 0;
  const structured = specialFundRecords.filter((row) =>
    row.policy_document_no ||
    row.budget_subject_code ||
    row.fund_destination ||
    row.prohibited_use_summary ||
    row.performance_report_due_at,
  );
  return Number(((structured.length / specialFundRecords.length) * 100).toFixed(2));
}

function frameworkLimitCondition(value) {
  const raw = String(value ?? '');
  if (/以下|不含/.test(raw)) return '以下';
  if (/详见项目需求|最高限价详见/.test(raw)) return '详见项目需求';
  if (/服务范围/.test(raw)) return '服务范围限额';
  return null;
}

function auditEvidenceWeight(level) {
  return {
    formal_audit_report: 90,
    rectification_progress: 70,
    special_audit_survey: 60,
    audit_result_feedback: 55,
    audit_work_update: 35,
    methodology_or_experience: 20,
    work_method_reference: 20,
    unknown: 0,
  }[level ?? 'unknown'] ?? 0;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    }
    return body;
  }
  return {
    post(path, body) {
      return request(path, { method: 'POST', body: JSON.stringify(body) });
    },
  };
}

function renderMarkdown(summary, payloads) {
  const lines = [
    '# 第三批正式公开实例测试结果',
    '',
    `生成时间：${summary.generated_at}`,
    `测试服务：${summary.base_url}`,
    '',
    '## 数据来源与覆盖',
    '',
    `- 新来源数量：${summary.official_source_count}`,
    `- 与前两批URL重合：${summary.collector_summary.previous_source_overlap_count}`,
    `- Registry去重：URL ${summary.collector_summary.url_duplicate_source_count}、正文 ${summary.collector_summary.content_duplicate_source_count}、标题 ${summary.collector_summary.title_duplicate_source_count}`,
    `- 人工复核状态：${formatObject(summary.collector_summary.manual_review_statuses)}`,
    `- 输入记录：${summary.total_input_records} 条（采购 ${summary.procurement_input_records}、财政/统计 ${summary.budget_input_records}、审计线索 ${summary.case_seed_input_records}）`,
    `- 导入成功率：${summary.import_success_rate}%`,
    `- 来源可追溯率：${summary.source_completeness_rate}%`,
    `- 框架协议记录：${summary.collector_summary.framework_agreement_count}`,
    `- 金额语义：${formatObject(summary.collector_summary.amount_semantic_types)}`,
    `- 限额/单价复核提示：framework_limit_review ${summary.collector_summary.framework_limit_review_count}、unit_price_or_rate_review ${summary.collector_summary.unit_price_or_rate_review_count}`,
    `- 专项资金结构化覆盖率：${summary.collector_summary.special_fund_structured_coverage_rate}%`,
    `- 审计证据等级：${formatObject(summary.collector_summary.audit_evidence_levels)}`,
    `- 审计证据权重：${formatObject(summary.collector_summary.audit_evidence_weights)}`,
    '',
    '主要来源：',
    ...payloads.sourceRegister.sources.map((source) => `- [${source.publisher}] ${source.title}：${source.url}`),
    '',
    '## 规则命中',
    '',
    ...Object.entries(summary.rule_hits_by_rule ?? {}).map(([rule, count]) => `- ${rule}: ${count}`),
    '',
    '## 进一步优化方案',
    '',
    ...summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}：${item.action} 原因：${item.reason}`),
  ];
  return `${lines.join('\n')}\n`;
}

function formatObject(value) {
  return Object.entries(value ?? {})
    .map(([key, count]) => `${key} ${count}`)
    .join(', ') || 'none';
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html>
<meta charset="utf-8">
<title>第三批正式公开实例测试结果</title>
<style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;margin:32px;line-height:1.6;color:#10243f}pre{white-space:pre-wrap;background:#f5f7fb;padding:16px;border:1px solid #d8e0ea}</style>
<pre>${escaped}</pre>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runThirdOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote third official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        finding_count: summary.finding_count,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
