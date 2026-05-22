export function defaultTaskListFilters() {
  return {
    keyword: '',
    taskKind: 'all',
    sourceKind: 'all',
    riskLevel: 'all',
  };
}

export function taskGroupKey(task) {
  return `${task.task_kind || 'unknown'}::${task.source_kind || 'unknown'}`;
}

export function normalizeTaskListFilters(filters = {}) {
  return {
    ...defaultTaskListFilters(),
    ...filters,
    keyword: String(filters.keyword || '').trim(),
  };
}

export function hasActiveTaskListFilters(filters = {}) {
  const normalized = normalizeTaskListFilters(filters);
  return Boolean(
    normalized.keyword
      || normalized.taskKind !== 'all'
      || normalized.sourceKind !== 'all'
      || normalized.riskLevel !== 'all',
  );
}

function normalizedText(value) {
  return String(value || '').trim().toLowerCase();
}

function taskSearchText(task, labels) {
  return [
    task.id,
    task.id?.slice(0, 8),
    task.title,
    task.primary_subject,
    task.task_kind,
    task.source_kind,
    task.risk_level,
    labels.taskKindLabel(task.task_kind),
    labels.sourceKindLabel(task.source_kind),
    labels.riskDisplay(task.risk_level),
    task.updated_at,
  ].map(normalizedText).join(' ');
}

function matchesTask(task, filters, labels) {
  if (filters.taskKind !== 'all' && task.task_kind !== filters.taskKind) return false;
  if (filters.sourceKind !== 'all' && task.source_kind !== filters.sourceKind) return false;
  if (filters.riskLevel !== 'all' && task.risk_level !== filters.riskLevel) return false;

  const keyword = normalizedText(filters.keyword);
  if (!keyword) return true;
  return taskSearchText(task, labels).includes(keyword);
}

function fallbackLabels(labels = {}) {
  return {
    taskKindLabel: labels.taskKindLabel || ((value) => value || '未知任务'),
    sourceKindLabel: labels.sourceKindLabel || ((value) => value || '未知来源'),
    riskDisplay: labels.riskDisplay || ((value) => value || '未知风险'),
  };
}

export function buildTaskListView(tasks = [], filters = {}, expandedGroups = {}, labels = {}) {
  const normalizedFilters = normalizeTaskListFilters(filters);
  const activeFilters = hasActiveTaskListFilters(normalizedFilters);
  const labelFns = fallbackLabels(labels);
  const groupsByKey = new Map();

  for (const task of tasks) {
    if (!matchesTask(task, normalizedFilters, labelFns)) continue;

    const key = taskGroupKey(task);
    if (!groupsByKey.has(key)) {
      const taskKindLabel = labelFns.taskKindLabel(task.task_kind);
      const sourceKindLabel = labelFns.sourceKindLabel(task.source_kind);
      groupsByKey.set(key, {
        key,
        label: `${taskKindLabel} / ${sourceKindLabel}`,
        taskKind: task.task_kind,
        sourceKind: task.source_kind,
        tasks: [],
        count: 0,
        expanded: activeFilters
          ? true
          : expandedGroups[key] ?? task.source_kind !== 'batch',
      });
    }
    const group = groupsByKey.get(key);
    group.tasks.push(task);
    group.count += 1;
  }

  const groups = Array.from(groupsByKey.values());
  return {
    groups,
    totalCount: tasks.length,
    visibleCount: groups.reduce((sum, group) => sum + group.count, 0),
    hasActiveFilters: activeFilters,
  };
}

export function expandedGroupsForAll(tasks = [], expanded) {
  return tasks.reduce((next, task) => {
    next[taskGroupKey(task)] = expanded;
    return next;
  }, {});
}
