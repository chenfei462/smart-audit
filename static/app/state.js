export const state = {
  bootstrap: null,
  importBootstrap: null,
  connectorBootstrap: null,
  user: null,
  currentWorkspacePage: 'import',
  currentCasesView: 'workbench',
  currentOperationsView: 'overview',
  tasks: [],
  cases: [],
  caseMetrics: null,
  rectificationCases: [],
  operationsOverview: null,
  operationsByDepartment: null,
  operationsByRectificationUnit: null,
  operationsByHandler: null,
  operationsTrends: [],
  currentTask: null,
  currentTaskExceptions: [],
  currentPreview: null,
  caseSeedPreview: null,
  caseSeedTemplateKind: 'investment_review',
  caseSeedMappingOverrides: [],
  caseSeedAssignmentRules: [],
  caseSeedConfigUpdatedAt: null,
  importProfiles: [],
  selectedImportProfileId: '',
  importProfileScopeFilter: 'all',
  assignmentDictionaryRules: [],
  assignmentDictionaryScopeFilter: 'all',
  automationSchedules: [],
  automationExecutions: [],
  internalSampleTemplates: [],
  selectedInternalSampleTemplateKind: 'department_budget_indicator',
  selectedTaskKind: 'procurement_project',
  selectedSourceKind: 'file',
  selectedDatasetKind: null,
  selectedConnectorProfileId: '',
  taskListFilters: {
    keyword: '',
    taskKind: 'all',
    sourceKind: 'all',
    riskLevel: 'all'
  },
  taskListExpandedGroups: {},
  currentTaskExceptionFilters: {
    source: 'all',
    prefix: 'all',
    taskKind: 'all',
    severity: 'all',
    status: 'all',
    assigneeKeyword: '',
    contractKeyword: '',
    paymentKeyword: '',
    voucherKeyword: ''
  },
  currentTaskExceptionHistoryFilters: {
    status: 'all',
    assigneeKeyword: '',
    changedByKeyword: '',
    changedAtKeyword: ''
  },
  currentTaskExceptionSelection: [],
  currentCaseFilters: {
    taskKind: 'all',
    caseStatus: 'all',
    currentStage: 'all',
    handlerKeyword: ''
  },
  currentCaseSelection: [],
  adminOverview: null
};

export function deploymentPolicy() {
  return state.bootstrap?.deployment_policy || {
    environment_mode: 'local',
    baseline: 'local',
    secure_cookies: false,
    allow_public_registration: false,
    ai_enabled: true,
    public_demo_mode: false,
    ocr_enabled: false,
    speech_enabled: false
  };
}

export function taskKindDefinitions() {
  return state.importBootstrap?.task_kinds || [];
}

export function taskKindDefinition(taskKind = state.selectedTaskKind) {
  return taskKindDefinitions().find((item) => item.task_kind === taskKind) || null;
}

export function datasetVariantDefinitions(taskKind = state.selectedTaskKind) {
  return taskKindDefinition(taskKind)?.dataset_variants || [];
}

export function activeDatasetVariant() {
  const variants = datasetVariantDefinitions();
  if (!variants.length) return null;
  return variants.find((item) => item.dataset_kind === state.selectedDatasetKind) || variants[0];
}

export function connectorProfiles() {
  return state.connectorBootstrap?.profiles || [];
}

export function connectorProfileDefinitions(taskKind = state.selectedTaskKind, datasetKind = state.selectedDatasetKind) {
  return connectorProfiles().filter((profile) => {
    if (profile.task_kind !== taskKind) return false;
    if (!datasetKind) return true;
    if (!profile.dataset_kind) return true;
    return profile.dataset_kind === datasetKind;
  });
}

export function taskKindLabel(taskKind) {
  return taskKindDefinition(taskKind)?.label || {
    supervision_case_seed: '监督评审台账 / 案件种子'
  }[taskKind] || taskKind;
}

export function datasetKindLabel(datasetKind) {
  for (const definition of taskKindDefinitions()) {
    const match = (definition.dataset_variants || []).find((item) => item.dataset_kind === datasetKind);
    if (match) return match.label;
  }
  return datasetKind || '默认子类型';
}

export function sourceKindLabel(sourceKind) {
  return {
    file: '文件导入',
    batch: '标准批量 payload',
    fetch: '公告页主动采集',
    connector: '连接器导入'
  }[sourceKind] || sourceKind;
}

export function caseSeedTemplateLabel(templateKind) {
  return {
    investment_review: '投资评审',
    penalty_ledger: '处罚台账',
    special_inspection: '专项检查'
  }[templateKind] || templateKind || '投资评审';
}

export function linkageModeLabel(mode) {
  return {
    exact: '精确关联',
    evidence_auto: '证据自动关联',
    evidence_candidate: '证据候选关联',
    none: '未关联'
  }[mode] || mode || '未关联';
}

export function userRole() {
  return String(state.user?.role || 'viewer').toLowerCase();
}

export function canAccessCaseWorkbench() {
  return ['admin', 'auditor', 'department_reviewer', 'supervisor'].includes(userRole());
}

export function canAccessRectificationPortal() {
  return ['admin', 'rectification_user'].includes(userRole());
}

export function canAccessOperations() {
  return ['admin', 'department_reviewer', 'supervisor'].includes(userRole());
}
