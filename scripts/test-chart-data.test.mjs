import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateOverviewCharts,
  aggregateTaskResultCharts,
} from '../static/app/charts.js';

const labels = {
  taskKindLabel: (value) => ({
    procurement_project: '政府采购项目',
    budget_summary: '预算财政汇总',
  }[value] || value),
  sourceKindLabel: (value) => ({
    file: '文件导入',
    batch: '标准批量 payload',
  }[value] || value),
  riskDisplay: (value) => ({
    Critical: '极高',
    High: '高',
    Medium: '中',
    Low: '低',
  }[value] || value),
};

test('aggregateOverviewCharts counts filtered tasks by risk, type and source', () => {
  const charts = aggregateOverviewCharts([
    {
      id: '1',
      task_kind: 'procurement_project',
      source_kind: 'batch',
      risk_level: 'High',
    },
    {
      id: '2',
      task_kind: 'procurement_project',
      source_kind: 'file',
      risk_level: 'Medium',
    },
    {
      id: '3',
      task_kind: 'budget_summary',
      source_kind: 'batch',
      risk_level: 'High',
    },
  ], labels);

  assert.equal(charts.total, 3);
  assert.deepEqual(
    charts.risk.map((item) => [item.key, item.label, item.value]),
    [
      ['Critical', '极高', 0],
      ['High', '高', 2],
      ['Medium', '中', 1],
      ['Low', '低', 0],
    ],
  );
  assert.deepEqual(
    charts.taskKinds.map((item) => [item.key, item.label, item.value]),
    [
      ['procurement_project', '政府采购项目', 2],
      ['budget_summary', '预算财政汇总', 1],
    ],
  );
  assert.deepEqual(
    charts.sources.map((item) => [item.key, item.label, item.value]),
    [
      ['batch', '标准批量 payload', 2],
      ['file', '文件导入', 1],
    ],
  );
});

test('aggregateTaskResultCharts summarizes finding risks, rule categories and quality checks', () => {
  const charts = aggregateTaskResultCharts({
    findings: [
      { risk_level: 'High', rule_category: '采购合规' },
      { risk_level: 'Medium', rule_category: '采购合规' },
      { risk_level: 'High', rule_category: '预算执行' },
    ],
    detail: {
      payload: {
        quality_report: {
          checks: [
            { severity: 'Error' },
            { severity: 'Warning' },
            { severity: 'Warning' },
          ],
        },
      },
    },
  }, labels);

  assert.deepEqual(
    charts.findingRisk.map((item) => [item.key, item.value]),
    [
      ['Critical', 0],
      ['High', 2],
      ['Medium', 1],
      ['Low', 0],
    ],
  );
  assert.deepEqual(
    charts.ruleCategories.map((item) => [item.key, item.label, item.value]),
    [
      ['采购合规', '采购合规', 2],
      ['预算执行', '预算执行', 1],
    ],
  );
  assert.deepEqual(
    charts.qualityChecks.map((item) => [item.key, item.label, item.value]),
    [
      ['Error', '错误', 1],
      ['Warning', '警告', 2],
      ['Info', '提示', 0],
    ],
  );
});
