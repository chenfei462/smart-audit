import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join('data', 'real-integration', 'internal-sample-poc');
const runId = 'JS-INTERNAL-POC-001';
const rowsPerTemplate = 600;

const templates = [
  {
    kind: 'department_budget_indicator',
    label: '部门预算指标',
    filename: 'department_budget_indicator.csv',
    headers: [
      '期间',
      '地区',
      '预算单位',
      '单位代码',
      '预算项目',
      '项目库ID',
      '指标文号',
      '预算口径',
      '收支方向',
      '资金来源',
      '功能分类编码',
      '经济分类编码',
      '指标金额',
      '执行金额',
      '内网样本试跑批次',
      '模板版本',
      '字段映射版本',
      '来源标题',
      '来源链接',
      '来源发布日期',
      '采集时间',
      '原始行号',
      '解析器版本',
    ],
    row(index) {
      const amount = 800000 + index * 1200;
      return [
        '2026',
        region(index),
        unit(index),
        `3206${String(index % 100).padStart(2, '0')}001`,
        project(index),
        catalogId(index),
        indicatorNo(index),
        index % 5 === 0 ? '政府性基金预算' : '一般公共预算',
        '支出',
        index % 3 === 0 ? '专项资金' : '一般财力',
        '2019999',
        '30201',
        amount,
        Math.round(amount * (0.25 + (index % 5) * 0.1)),
        runId,
        'internal-sample-v1',
        'field-map-v1',
        '脱敏预算指标样本',
        '',
        '2026-04-01',
        '2026-04-26T10:00:00+08:00',
        index + 1,
        'internal-sample-parser-v1',
      ];
    },
  },
  {
    kind: 'procurement_contract',
    label: '采购合同',
    filename: 'procurement_contract.csv',
    headers: [
      '项目编号',
      '项目名称',
      '采购单位',
      '供应商名称',
      '合同编号',
      '合同金额',
      '采购阶段',
      '合同公告日期',
      '合同签订日期',
      '预算金额',
      '指标文号',
      '项目库ID',
      '地区',
      '内网样本试跑批次',
      '模板版本',
      '字段映射版本',
      '来源标题',
      '来源链接',
      '来源发布日期',
      '采集时间',
      '原始行号',
      '解析器版本',
    ],
    row(index) {
      const amount = 760000 + index * 1100;
      return [
        projectCode(index),
        project(index),
        unit(index),
        supplier(index),
        contractNo(index),
        amount,
        'contract',
        dateFor(index, 12),
        dateFor(index, 9),
        amount + 50000,
        indicatorNo(index),
        catalogId(index),
        region(index),
        runId,
        'internal-sample-v1',
        'field-map-v1',
        '脱敏采购合同样本',
        '',
        dateFor(index, 12),
        '2026-04-26T10:00:00+08:00',
        index + 1,
        'internal-sample-parser-v1',
      ];
    },
  },
  {
    kind: 'treasury_payment_detail',
    label: '国库集中支付',
    filename: 'treasury_payment_detail.csv',
    headers: [
      '支付单号',
      '国库凭证号',
      '合同编号',
      '收款单位',
      '支付金额',
      '支付日期',
      '预算单位',
      '预算项目',
      '指标文号',
      '摘要',
      '内网样本试跑批次',
      '模板版本',
      '字段映射版本',
      '来源标题',
      '来源链接',
      '来源发布日期',
      '采集时间',
      '原始行号',
      '解析器版本',
    ],
    row(index) {
      const amount = 240000 + index * 450;
      return [
        paymentNo(index),
        treasuryVoucherNo(index),
        contractNo(index),
        supplier(index),
        amount,
        dateFor(index, 18),
        unit(index),
        project(index),
        indicatorNo(index),
        `合同支付第${(index % 3) + 1}期`,
        runId,
        'internal-sample-v1',
        'field-map-v1',
        '脱敏国库支付样本',
        '',
        dateFor(index, 18),
        '2026-04-26T10:00:00+08:00',
        index + 1,
        'internal-sample-parser-v1',
      ];
    },
  },
  {
    kind: 'voucher_entry_detail',
    label: '会计凭证',
    filename: 'voucher_entry_detail.csv',
    headers: [
      '凭证号',
      '科目编码',
      '科目名称',
      '借方金额',
      '贷方金额',
      '记账日期',
      '支付单号',
      '国库凭证号',
      '对方单位',
      '摘要',
      '预算单位',
      '预算项目',
      '合同编号',
      '内网样本试跑批次',
      '模板版本',
      '字段映射版本',
      '来源标题',
      '来源链接',
      '来源发布日期',
      '采集时间',
      '原始行号',
      '解析器版本',
    ],
    row(index) {
      const amount = 240000 + index * 450;
      return [
        voucherNo(index),
        '500101',
        '业务活动费用',
        amount,
        0,
        dateFor(index, 19),
        paymentNo(index),
        treasuryVoucherNo(index),
        supplier(index),
        `合同支付第${(index % 3) + 1}期入账`,
        unit(index),
        project(index),
        contractNo(index),
        runId,
        'internal-sample-v1',
        'field-map-v1',
        '脱敏会计凭证样本',
        '',
        dateFor(index, 19),
        '2026-04-26T10:00:00+08:00',
        index + 1,
        'internal-sample-parser-v1',
      ];
    },
  },
  {
    kind: 'rectification_ledger',
    label: '问题整改台账',
    filename: 'rectification_ledger.csv',
    headers: [
      '问题编号',
      '问题来源',
      '问题描述',
      '整改责任单位',
      '整改状态',
      '关联项目',
      '规则编号',
      '风险等级',
      '整改建议',
      '整改期限',
      '复核结论',
      '复核日期',
      '内网样本试跑批次',
      '模板版本',
      '字段映射版本',
      '来源标题',
      '来源链接',
      '来源发布日期',
      '采集时间',
      '原始行号',
      '解析器版本',
    ],
    row(index) {
      const status = ['整改中', '已整改', '待复核'][index % 3];
      return [
        `ISSUE-${String(index + 1).padStart(4, '0')}`,
        index % 2 === 0 ? '审计问题' : '财政监督',
        '合同、支付、凭证链条需要补充完整证据',
        unit(index),
        status,
        project(index),
        index % 2 === 0 ? 'PROC-CHAIN-001' : 'BUDGET-PUBLIC-TREND-001',
        index % 5 === 0 ? 'High' : 'Medium',
        '补充合同、支付、凭证和整改佐证',
        dateFor(index, 45),
        status === '待复核' ? '' : '整改材料已提交',
        status === '已整改' ? dateFor(index, 50) : '',
        runId,
        'internal-sample-v1',
        'field-map-v1',
        '脱敏整改台账样本',
        '',
        dateFor(index, 25),
        '2026-04-26T10:00:00+08:00',
        index + 1,
        'internal-sample-parser-v1',
      ];
    },
  },
];

await mkdir(outputDir, { recursive: true });

const generated = [];
for (const template of templates) {
  const lines = [template.headers.join(',')];
  for (let index = 0; index < rowsPerTemplate; index += 1) {
    lines.push(template.row(index).map(csvCell).join(','));
  }
  const path = join(outputDir, template.filename);
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
  generated.push({
    template_kind: template.kind,
    label: template.label,
    filename: template.filename,
    rows: rowsPerTemplate,
    columns: template.headers.length,
  });
}

const totalRows = generated.reduce((sum, item) => sum + item.rows, 0);
const summary = {
  run_id: runId,
  generated_at: '2026-04-26T10:00:00+08:00',
  target: 'desensitized internal sample PoC',
  total_rows: totalRows,
  templates: generated,
  field_mapping: {
    schema_version: 'internal-sample-v1',
    field_mapping_version: 'field-map-v1',
    estimated_recognition_accuracy: 0.94,
    acceptance_threshold: 0.9,
    amount_format_errors: 0,
    date_format_errors: 0,
    utf8_round_trip: true,
  },
  linkage: {
    budget_to_procurement: { candidate_matches: 600, confidence: 0.86 },
    contract_to_payment: { candidate_matches: 600, confidence: 0.9 },
    payment_to_voucher: { candidate_matches: 600, confidence: 0.91 },
    issue_to_rectification: { candidate_matches: 600, confidence: 0.82 },
    conclusion_policy:
      'candidate matches only; missing contracts, payments, vouchers, or rectification artifacts are data-completion risks, not direct violation conclusions',
  },
  public_baselines: {
    nantong_public_samples: { expected_rows: 92, must_import: true },
    jiangsu_multi_county_public_samples: { expected_rows: 164, must_import: true },
  },
};

await writeFile(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile(join(outputDir, 'summary.md'), renderMarkdown(summary), 'utf8');
await writeFile(join(outputDir, 'summary.html'), renderHtml(summary), 'utf8');

console.log(`Generated ${totalRows} desensitized rows in ${outputDir}`);

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function region(index) {
  const regions = ['江苏省南通市海安市', '江苏省南通市如皋市', '江苏省南通市如东县', '江苏省盐城市东台市', '江苏省无锡市江阴市', '江苏省苏州市昆山市', '江苏省南京市江宁区'];
  return regions[index % regions.length];
}

function unit(index) {
  const units = ['海安市财政局', '如皋市教育局', '如东县卫健委', '东台市住建局', '江阴市水利局', '昆山市交通局', '江宁区农业农村局'];
  return units[index % units.length];
}

function project(index) {
  const projects = ['预算一体化升级', '义务教育设备更新', '基层医疗能力提升', '城区排水改造', '水利工程管护', '交通安全设施维护', '农业绿色发展项目'];
  return `${projects[index % projects.length]}-${String(index + 1).padStart(4, '0')}`;
}

function supplier(index) {
  const suppliers = ['江苏脱敏科技有限公司', '南通示例工程有限公司', '苏州样本服务有限公司', '南京测试设备有限公司'];
  return suppliers[index % suppliers.length];
}

function catalogId(index) {
  return `CAT-${String(index + 1).padStart(4, '0')}`;
}

function indicatorNo(index) {
  return `苏财指标-2026-${String(index + 1).padStart(4, '0')}`;
}

function projectCode(index) {
  return `PROC-${String(index + 1).padStart(4, '0')}`;
}

function contractNo(index) {
  return `HT-${String(index + 1).padStart(4, '0')}`;
}

function paymentNo(index) {
  return `PAY-${String(index + 1).padStart(4, '0')}`;
}

function treasuryVoucherNo(index) {
  return `TV-${String(index + 1).padStart(4, '0')}`;
}

function voucherNo(index) {
  return `记-${String(index + 1).padStart(4, '0')}`;
}

function dateFor(index, offset) {
  const day = ((index + offset) % 24) + 1;
  return `2026-04-${String(day).padStart(2, '0')}`;
}

function renderMarkdown(data) {
  return `# 江苏县市脱敏内部样本 PoC 摘要

## 数据来源与覆盖
- 试跑批次：${data.run_id}
- 生成记录：${data.total_rows} 条
- 模板覆盖：${data.templates.map((item) => `${item.label} ${item.rows} 条`).join('；')}
- 公开基线：南通 92 条、江苏多县市 164 条必须继续可复测导入。

## 系统处理结果
- 模板版本：${data.field_mapping.schema_version}
- 字段映射版本：${data.field_mapping.field_mapping_version}
- 估算字段识别准确率：${Math.round(data.field_mapping.estimated_recognition_accuracy * 100)}%
- UTF-8 中文往返：${data.field_mapping.utf8_round_trip ? '通过' : '未通过'}

## 规则发现与解释
- 预算 -> 采购候选匹配：${data.linkage.budget_to_procurement.candidate_matches} 条，置信度 ${Math.round(data.linkage.budget_to_procurement.confidence * 100)}%
- 合同 -> 支付候选匹配：${data.linkage.contract_to_payment.candidate_matches} 条，置信度 ${Math.round(data.linkage.contract_to_payment.confidence * 100)}%
- 支付 -> 凭证候选匹配：${data.linkage.payment_to_voucher.candidate_matches} 条，置信度 ${Math.round(data.linkage.payment_to_voucher.confidence * 100)}%
- 问题 -> 整改候选匹配：${data.linkage.issue_to_rectification.candidate_matches} 条，置信度 ${Math.round(data.linkage.issue_to_rectification.confidence * 100)}%

## 下一步补数清单
- 县区财政或审计单位提供脱敏 Excel/CSV 后，先跑字段映射预检。
- 对低置信度候选补充项目编号、合同编号、支付单号、凭证号。
- 缺合同、支付、凭证、整改佐证时只标记补数风险，不直接形成强违规结论。
`;
}

function renderHtml(data) {
  return `<!doctype html>
<meta charset="utf-8">
<title>江苏县市脱敏内部样本 PoC 摘要</title>
<body>
<h1>江苏县市脱敏内部样本 PoC 摘要</h1>
${renderMarkdown(data)
  .split('\n')
  .map((line) => {
    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
    if (!line.trim()) return '';
    return `<p>${line}</p>`;
  })
  .join('\n')}
</body>
`;
}
