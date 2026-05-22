import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

async function loadTaskListModule() {
  const source = await readFile(resolve('static/app/task-list.js'), 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(dataUrl);
}

const labels = {
  taskKindLabel: (value) => ({
    budget_summary: '预算财政汇总',
    procurement_project: '政府采购项目',
    treasury_payment: '国库支付',
  }[value] || value),
  sourceKindLabel: (value) => ({
    batch: '批量导入',
    file: '文件导入',
    connector: '连接器',
  }[value] || value),
  riskDisplay: (value) => ({
    High: '高',
    Medium: '中',
    Low: '低',
  }[value] || value),
};

const tasks = [
  {
    id: 'file-budget-001',
    task_kind: 'budget_summary',
    title: '内部样例：部门预算指标',
    source_kind: 'file',
    risk_level: 'Low',
    primary_subject: '海安市财政局',
  },
  {
    id: 'batch-budget-001',
    task_kind: 'budget_summary',
    title: 'Round 6 department budget PDF tables',
    source_kind: 'batch',
    risk_level: 'Medium',
    primary_subject: '江苏省',
  },
  {
    id: 'batch-proc-001',
    task_kind: 'procurement_project',
    title: 'Round 6 official procurement chain',
    source_kind: 'batch',
    risk_level: 'High',
    primary_subject: '南京市商务局',
  },
  {
    id: 'connector-treasury-001',
    task_kind: 'treasury_payment',
    title: '国库支付连接器样本',
    source_kind: 'connector',
    risk_level: 'Medium',
    primary_subject: '支付中心',
  },
];

test('groups tasks by task kind and source with batch groups collapsed by default', async () => {
  const { buildTaskListView, defaultTaskListFilters } = await loadTaskListModule();

  const view = buildTaskListView(tasks, defaultTaskListFilters(), {}, labels);

  assert.equal(view.totalCount, 4);
  assert.equal(view.visibleCount, 4);
  assert.deepEqual(view.groups.map((group) => group.key), [
    'budget_summary::file',
    'budget_summary::batch',
    'procurement_project::batch',
    'treasury_payment::connector',
  ]);
  assert.equal(view.groups[0].expanded, true);
  assert.equal(view.groups[1].expanded, false);
  assert.equal(view.groups[1].label, '预算财政汇总 / 批量导入');
  assert.equal(view.groups[2].expanded, false);
  assert.equal(view.groups[3].expanded, true);
});

test('search matches title, subject, id, task kind label and source label, then expands result groups', async () => {
  const { buildTaskListView, defaultTaskListFilters } = await loadTaskListModule();

  const bySubject = buildTaskListView(tasks, {
    ...defaultTaskListFilters(),
    keyword: '商务局',
  }, {}, labels);
  assert.deepEqual(bySubject.groups.map((group) => group.key), ['procurement_project::batch']);
  assert.equal(bySubject.groups[0].expanded, true);

  const byShortId = buildTaskListView(tasks, {
    ...defaultTaskListFilters(),
    keyword: 'batch-proc',
  }, {}, labels);
  assert.equal(byShortId.visibleCount, 1);
  assert.equal(byShortId.groups[0].tasks[0].id, 'batch-proc-001');

  const byLabel = buildTaskListView(tasks, {
    ...defaultTaskListFilters(),
    keyword: '批量导入',
  }, {}, labels);
  assert.equal(byLabel.visibleCount, 2);
  assert.equal(byLabel.groups.every((group) => group.expanded), true);
});

test('task kind, source and risk filters combine before grouping', async () => {
  const { buildTaskListView, defaultTaskListFilters } = await loadTaskListModule();

  const view = buildTaskListView(tasks, {
    ...defaultTaskListFilters(),
    taskKind: 'budget_summary',
    sourceKind: 'batch',
    riskLevel: 'Medium',
  }, {}, labels);

  assert.equal(view.visibleCount, 1);
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].key, 'budget_summary::batch');
  assert.equal(view.groups[0].expanded, true);
  assert.equal(view.groups[0].tasks[0].title, 'Round 6 department budget PDF tables');
});
