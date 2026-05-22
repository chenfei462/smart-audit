import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractDepartmentFinalAccountTablesFromPages,
  extractBudgetPdfTablesFromPages,
  locatorHash,
} from './lib/pdf-table-extractor.mjs';

test('budget PDF table extractor preserves table locator metadata', () => {
  const pages = [
    {
      pageNumber: 3,
      text: `
收入总表
科目编码 科目名称 金额
201 一般公共服务支出 7131.02
208 社会保障和就业支出 1401.65

支出总表
科目编码 科目名称 金额
210 卫生健康支出 302.10
221 住房保障支出 3477.11
`,
    },
    {
      pageNumber: 4,
      text: `
财政拨款收支总表
科目编码 科目名称 金额
201 财政拨款收入 12009.78

一般公共预算支出表
科目编码 科目名称 金额
201 一般公共服务支出 7131.02

政府性基金预算支出表
本表无数据
`,
    },
    {
      pageNumber: 5,
      text: `
“三公”经费预算表
科目编码 科目名称 金额
30217 公务接待费 10.00
`,
    },
  ];

  const result = extractBudgetPdfTablesFromPages({
    source: {
      source_id: 'nanjing-finance-2025-budget-pdf',
      title: '南京市财政局2025年度部门预算公开',
      url: 'https://czj.nanjing.gov.cn/report.pdf',
    },
    pages,
  });

  assert.ok(result.tables.length >= 6);
  assert.ok(result.records.length >= 6);
  assert.ok(result.quality_checks.some((check) => check.code === 'empty_table_detected'));
  assert.ok(result.records.every((row) => row.page_number));
  assert.ok(result.records.every((row) => row.table_title));
  assert.ok(result.records.every((row) => row.locator_hash));
  assert.equal(locatorHash('abc'), locatorHash('abc'));
});

test('department final-account PDF extractor preserves subject and performance metadata', () => {
  const pages = [
    {
      pageNumber: 7,
      text: `
收入支出决算总表
科目编码 科目名称 金额
201 一般公共服务支出 1200.50
207 文化旅游体育与传媒支出 850.25

财政拨款收入支出决算总表
科目编码 科目名称 金额
201 财政拨款收入 1300.00
`,
    },
    {
      pageNumber: 12,
      text: `
项目支出绩效自评价表
指标名称 指标值 单位
公共文化服务覆盖率 95 %
服务对象满意度 96 %
`,
    },
  ];

  const result = extractDepartmentFinalAccountTablesFromPages({
    source: {
      source_id: 'js-czt-culture-final-account-2024',
      title: '2024 annual final account',
      url: 'https://czt.jiangsu.gov.cn/final-account.pdf',
    },
    pages,
  });

  assert.ok(result.tables.length >= 3);
  assert.ok(result.records.some((row) => row.department_final_account_table_type === 'final_income_expense'));
  assert.ok(result.records.some((row) => row.department_final_account_table_type === 'fiscal_appropriation_final'));
  assert.ok(result.records.some((row) => row.department_final_account_table_type === 'performance_self_evaluation'));
  assert.ok(result.records.some((row) => row.subject_code === '201' && row.subject_name.includes('一般公共服务')));
  assert.ok(result.records.some((row) => row.performance_indicator_name === '公共文化服务覆盖率' && row.performance_indicator_value === '95'));
  assert.ok(result.records.every((row) => row.page_number));
  assert.ok(result.records.every((row) => row.table_title));
  assert.ok(result.records.every((row) => row.locator_hash));
});
