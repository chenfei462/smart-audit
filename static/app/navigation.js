import { $, notify } from './services.js';
import { state, canAccessCaseWorkbench, canAccessOperations, canAccessRectificationPortal, userRole } from './state.js';
import { syncTaskRoute } from './tasks.js?v=viz-20260430';
import { loadCases } from './cases.js';
import { loadRectificationCases } from './rectification.js?v=viz-20260520h';
import { loadOperations } from './operations.js';
import { loadAutomationCenter } from './configuration.js?v=viz-20260430';

const PAGE_DEFINITIONS = {
  import: {
    label: '导入工作台',
    copy: '按导入预检、任务入库和规则研判的顺序推进当前工作。',
    visible: () => true
  },
  tasks: {
    label: '任务总览',
    copy: '集中查看任务列表、详情、证据、规则结果和异常池。',
    visible: () => true
  },
  cases: {
    label: '案件与整改',
    copy: '把异常提升为案件，并为整改单位提供独立的整改入口。',
    visible: () => canAccessCaseWorkbench() || canAccessRectificationPortal()
  },
  operations: {
    label: '运营与自动化',
    copy: '按处室和责任人观察办理压力，并维护自动化调度计划。',
    visible: () => canAccessOperations()
  },
  admin: {
    label: '管理员后台',
    copy: '维护部署策略、连接档案、用户和审计留痕。',
    visible: () => userRole() === 'admin'
  }
};

const PAGE_ROOTS = {
  import: 'workspacePageImport',
  tasks: 'workspacePageTasks',
  cases: 'workspacePageCases',
  operations: 'workspacePageOperations',
  admin: 'workspacePageAdmin'
};

function visiblePages() {
  return Object.entries(PAGE_DEFINITIONS)
    .filter(([, config]) => config.visible())
    .map(([key]) => key);
}

function firstVisiblePage() {
  return visiblePages()[0] || 'import';
}

export function parseWorkspaceHash() {
  const hash = location.hash || '';
  const taskMatch = hash.match(/^#\/tasks\/([^/]+)\/([^/]+)$/);
  if (taskMatch) {
    return {
      page: 'tasks',
      taskKind: taskMatch[1],
      taskId: taskMatch[2]
    };
  }

  const pageMatch = hash.match(/^#\/([a-z-]+)(?:\/([a-z-]+))?$/);
  if (!pageMatch) {
    return { page: firstVisiblePage() };
  }

  const pageToken = pageMatch[1];
  if (pageToken === 'tasks') return { page: 'tasks' };
  if (pageToken === 'import') return { page: 'import' };
  if (pageToken === 'cases') {
    return { page: 'cases', subpage: pageMatch[2] || 'workbench' };
  }
  if (pageToken === 'operations') {
    return { page: 'operations', subpage: pageMatch[2] || 'overview' };
  }
  if (pageToken === 'admin') return { page: 'admin' };
  return { page: firstVisiblePage() };
}

function workspaceHash(page = state.currentWorkspacePage, subpage = null) {
  if (page === 'cases') {
    return `#/cases/${subpage || state.currentCasesView || 'workbench'}`;
  }
  if (page === 'operations') {
    return `#/operations/${subpage || state.currentOperationsView || 'overview'}`;
  }
  return `#/${page}`;
}

export function setWorkspaceHash(page, subpage = null) {
  const nextHash = workspaceHash(page, subpage);
  if (location.hash !== nextHash) {
    location.hash = nextHash;
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
    syncWorkspaceRoute().catch((error) => notify(error.message, 'error'));
  }
}

export function shouldIgnoreStaleWorkspaceRoute(startHash, currentHash = location.hash) {
  return currentHash !== startHash;
}

export function updateWorkspaceChrome() {
  const visible = new Set(visiblePages());
  const currentPage = visible.has(state.currentWorkspacePage) ? state.currentWorkspacePage : firstVisiblePage();
  state.currentWorkspacePage = currentPage;

  Object.entries(PAGE_ROOTS).forEach(([page, rootId]) => {
    const root = $(rootId);
    if (!root) return;
    root.classList.toggle('hidden', page !== currentPage || !visible.has(page));
  });

  if ($('caseBoard')) {
    $('caseBoard').classList.toggle(
      'hidden',
      currentPage !== 'cases' || state.currentCasesView !== 'workbench' || !canAccessCaseWorkbench()
    );
  }
  if ($('rectificationBoard')) {
    $('rectificationBoard').classList.toggle(
      'hidden',
      currentPage !== 'cases' || state.currentCasesView !== 'rectification' || !canAccessRectificationPortal()
    );
  }
  if ($('operationsBoard')) {
    $('operationsBoard').classList.toggle(
      'hidden',
      currentPage !== 'operations' || state.currentOperationsView !== 'overview' || !canAccessOperations()
    );
  }
  if ($('automationCenter')) {
    $('automationCenter').classList.toggle(
      'hidden',
      currentPage !== 'operations' || state.currentOperationsView !== 'automation' || !canAccessOperations()
    );
  }
  if ($('adminPanel')) {
    $('adminPanel').classList.toggle('hidden', currentPage !== 'admin' || userRole() !== 'admin');
  }

  document.querySelectorAll('[data-workspace-page]').forEach((node) => {
    const page = node.dataset.workspacePage;
    const isVisible = visible.has(page);
    node.classList.toggle('hidden', !isVisible);
    node.classList.toggle('active', page === currentPage);
  });

  document.querySelectorAll('[data-cases-view]').forEach((node) => {
    node.classList.toggle('active', node.dataset.casesView === state.currentCasesView);
  });
  document.querySelectorAll('[data-operations-view]').forEach((node) => {
    node.classList.toggle('active', node.dataset.operationsView === state.currentOperationsView);
  });

  if ($('topbarTitle')) {
    $('topbarTitle').textContent = PAGE_DEFINITIONS[currentPage]?.label || '工作台';
  }
  if ($('topbarCopy')) {
    $('topbarCopy').textContent = PAGE_DEFINITIONS[currentPage]?.copy || '';
  }
}

async function ensurePageData(page) {
  if (page === 'cases') {
    if (state.currentCasesView === 'workbench' && canAccessCaseWorkbench()) {
      await loadCases();
    }
    if (state.currentCasesView === 'rectification' && canAccessRectificationPortal()) {
      await loadRectificationCases();
    }
  }
  if (page === 'operations') {
    if (state.currentOperationsView === 'overview' && canAccessOperations()) {
      await loadOperations();
    }
    if (state.currentOperationsView === 'automation' && canAccessOperations()) {
      await loadAutomationCenter();
    }
  }
  if (page === 'tasks') {
    await syncTaskRoute();
  }
}

export async function syncWorkspaceRoute() {
  const startHash = location.hash || '';
  const route = parseWorkspaceHash();
  const visible = new Set(visiblePages());
  const resolvedPage = visible.has(route.page) ? route.page : firstVisiblePage();

  state.currentWorkspacePage = resolvedPage;
  if (resolvedPage === 'cases') {
    const requested = route.subpage === 'rectification' ? 'rectification' : 'workbench';
    state.currentCasesView = (requested === 'rectification' && canAccessRectificationPortal()) ? 'rectification' : 'workbench';
    if (state.currentCasesView === 'workbench' && !canAccessCaseWorkbench() && canAccessRectificationPortal()) {
      state.currentCasesView = 'rectification';
    }
  }
  if (resolvedPage === 'operations') {
    state.currentOperationsView = route.subpage === 'automation' ? 'automation' : 'overview';
  }

  updateWorkspaceChrome();
  await ensurePageData(resolvedPage);
  if (shouldIgnoreStaleWorkspaceRoute(startHash)) {
    return;
  }
  updateWorkspaceChrome();

  const normalizedHash = route.taskId || resolvedPage === 'tasks'
    ? null
    : workspaceHash(
      resolvedPage,
      resolvedPage === 'cases'
        ? state.currentCasesView
        : (resolvedPage === 'operations' ? state.currentOperationsView : null)
    );
  if (normalizedHash && location.hash !== normalizedHash) {
    location.hash = normalizedHash;
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

