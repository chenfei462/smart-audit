import { $, notify } from './services.js';
import { state } from './state.js';
import { loadBootstrap, loadSession, submitLeadRequest, logout, renderAuthenticatedSession, loadWorkspaceData } from './auth.js?v=viz-20260520h';
import {
  refreshTasks,
  renderImportWorkbench,
  renderPreviewPanel,
  downloadInternalSampleTemplate,
  downloadImportTemplate,
  downloadCaseSeedTemplate,
  setInternalSampleTemplateKind,
  previewFileImport,
  previewCaseSeedImport,
  commitPreviewImport,
  importCaseSeedBatch,
  setCaseSeedTemplateKind,
  saveCaseSeedTemplateConfig,
  addCaseSeedAssignmentRule,
  updateCaseSeedAssignmentRule,
  updateCaseSeedMappingOverride,
  removeCaseSeedAssignmentRule,
  submitBatchImport,
  submitFetchImport,
  previewConnectorImport,
  commitConnectorImport,
  syncTaskRoute,
  updateTaskListFilters,
  expandAllTaskGroups,
  collapseAllTaskGroups,
  exportCurrentTaskPdf,
  sealCurrentTaskPackage,
  explainCurrentTaskWithAi
} from './tasks.js?v=viz-20260430';
import { createAdminUser, saveAiConfig, createConnectorProfile, syncConnectorDatasetOptions } from './admin.js?v=viz-20260430';
import {
  syncTaskExceptionFilters,
  toggleSelectAllFilteredExceptions,
  submitExceptionBulkStatus,
  syncTaskExceptionHistoryFilters,
  exportExceptionDispositionHistory
} from './exceptions.js?v=viz-20260430';
import {
  syncCaseFilters,
  toggleSelectAllFilteredCases,
  loadCases,
  submitCaseAssign,
  submitCaseTransition
} from './cases.js';
import {
  submitRectification,
  submitRectificationExtension,
  uploadRectificationAttachment
} from './rectification.js?v=viz-20260520h';
import {
  exportOperationsCases
} from './operations.js';
import {
  uploadArtifact
} from './artifacts.js';
import {
  createImportProfileFromCurrent,
  cloneSelectedImportProfile,
  exportSelectedImportProfile,
  importImportProfileFile,
  applyImportProfile,
  loadImportProfiles,
  renderImportProfileCenter,
  createAssignmentDictionaryRule,
  toggleAssignmentDictionaryRule,
  loadAssignmentDictionary,
  renderAssignmentDictionaryCenter,
  createAutomationSchedule,
  runAutomationSchedule,
  loadAutomationCenter
} from './configuration.js?v=viz-20260430';
import { setWorkspaceHash, syncWorkspaceRoute } from './navigation.js?v=viz-20260520h';
import { loadRectificationCases } from './rectification.js?v=viz-20260520h';
import { loadOperations } from './operations.js';

$('briefingBtn').onclick = () => {
  $('leadDeployment').value = 'briefing-only';
  $('leadPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

$('pocBtn').onclick = () => {
  $('leadDeployment').value = 'private-cloud-poc';
  $('leadPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

$('loginTab').onclick = () => {
  $('loginTab').classList.add('active');
  $('registerTab').classList.remove('active');
  $('loginForm').classList.remove('hidden');
  $('registerForm').classList.add('hidden');
};

$('registerTab').onclick = () => {
  $('registerTab').classList.add('active');
  $('loginTab').classList.remove('active');
  $('registerForm').classList.remove('hidden');
  $('loginForm').classList.add('hidden');
};

$('loginForm').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const data = await fetch('/api/auth/login', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $('loginUser').value,
        password: $('loginPass').value
      })
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '鐧诲綍澶辫触');
      }
      return payload;
    });
    notify('鐧诲綍鎴愬姛');
    renderAuthenticatedSession(data.user);
    await loadWorkspaceData();
  } catch (error) {
    notify(error.message, 'error');
  }
};

$('registerForm').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const data = await fetch('/api/auth/register', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_name: $('regTenant').value,
        organization_name: $('regOrg').value,
        username: $('regUser').value,
        password: $('regPass').value,
        display_name: $('regName').value
      })
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '鍒濆鍖栧け璐?);
      }
      return payload;
    });
    notify('绉熸埛鍒涘缓鎴愬姛');
    renderAuthenticatedSession(data.user);
    await loadWorkspaceData();
  } catch (error) {
    notify(error.message, 'error');
  }
};

$('leadForm').onsubmit = (event) => submitLeadRequest(event).catch((error) => notify(error.message, 'error'));
$('refreshBtn').onclick = async () => {
  try {
    await refreshTasks();
    if (state.currentWorkspacePage === 'cases') {
      if (state.currentCasesView === 'workbench') {
        await loadCases();
      } else {
        await loadRectificationCases();
      }
    }
    if (state.currentWorkspacePage === 'operations') {
      if (state.currentOperationsView === 'overview') {
        await loadOperations();
      } else {
        await loadAutomationCenter();
      }
    }
  } catch (error) {
    notify(error.message, 'error');
  }
};
$('taskSearchInput').oninput = (event) => updateTaskListFilters({ keyword: event.target.value });
$('taskKindFilter').onchange = (event) => updateTaskListFilters({ taskKind: event.target.value });
$('taskSourceFilter').onchange = (event) => updateTaskListFilters({ sourceKind: event.target.value });
$('taskRiskFilter').onchange = (event) => updateTaskListFilters({ riskLevel: event.target.value });
$('expandTaskGroupsBtn').onclick = () => expandAllTaskGroups();
$('collapseTaskGroupsBtn').onclick = () => collapseAllTaskGroups();
$('downloadTemplateBtn').onclick = () => downloadImportTemplate().catch((error) => notify(error.message, 'error'));
$('downloadInternalSampleTemplateBtn').onclick = () => downloadInternalSampleTemplate().catch((error) => notify(error.message, 'error'));
$('internalSampleTemplateKind').onchange = (event) => setInternalSampleTemplateKind(event.target.value);
$('downloadCaseSeedTemplateBtn').onclick = () => downloadCaseSeedTemplate().catch((error) => notify(error.message, 'error'));
$('caseSeedTemplateKind').onchange = (event) => setCaseSeedTemplateKind(event.target.value)
  .then(() => Promise.all([loadAssignmentDictionary(), loadImportProfiles()]))
  .catch((error) => notify(error.message, 'error'));
$('saveCaseSeedConfigBtn').onclick = () => saveCaseSeedTemplateConfig().catch((error) => notify(error.message, 'error'));
$('addCaseSeedAssignmentRuleBtn').onclick = () => addCaseSeedAssignmentRule();
$('createImportProfileBtn').onclick = () => createImportProfileFromCurrent().catch((error) => notify(error.message, 'error'));
$('cloneImportProfileBtn').onclick = () => cloneSelectedImportProfile().catch((error) => notify(error.message, 'error'));
$('exportImportProfileBtn').onclick = () => exportSelectedImportProfile().catch((error) => notify(error.message, 'error'));
$('importImportProfileBtn').onclick = () => importImportProfileFile().catch((error) => notify(error.message, 'error'));
$('importProfileScopeFilter').onchange = () => renderImportProfileCenter();
$('assignmentDictionaryScopeFilter').onchange = () => renderAssignmentDictionaryCenter();
$('createAssignmentDictionaryBtn').onclick = () => createAssignmentDictionaryRule().catch((error) => notify(error.message, 'error'));
$('refreshAutomationCenterBtn').onclick = () => loadAutomationCenter().catch((error) => notify(error.message, 'error'));
$('createAutomationScheduleBtn').onclick = () => createAutomationSchedule().catch((error) => notify(error.message, 'error'));
$('previewImportBtn').onclick = () => previewFileImport().catch((error) => notify(error.message, 'error'));
$('previewCaseSeedBtn').onclick = () => previewCaseSeedImport().catch((error) => notify(error.message, 'error'));
$('commitImportBtn').onclick = () => commitPreviewImport().catch((error) => notify(error.message, 'error'));
$('importCaseSeedBtn').onclick = () => importCaseSeedBatch().then(() => loadCases()).catch((error) => notify(error.message, 'error'));
$('submitBatchBtn').onclick = () => submitBatchImport().catch((error) => notify(error.message, 'error'));
$('submitFetchBtn').onclick = () => submitFetchImport().catch((error) => notify(error.message, 'error'));
$('previewConnectorBtn').onclick = () => previewConnectorImport().catch((error) => notify(error.message, 'error'));
$('commitConnectorBtn').onclick = () => commitConnectorImport().catch((error) => notify(error.message, 'error'));
$('logoutBtn').onclick = () => logout().catch((error) => notify(error.message, 'error'));
$('createUserBtn').onclick = () => createAdminUser().catch((error) => notify(error.message, 'error'));
$('saveAiBtn').onclick = () => saveAiConfig().catch((error) => notify(error.message, 'error'));
$('createConnectorProfileBtn').onclick = () => createConnectorProfile().catch((error) => notify(error.message, 'error'));
$('adminConnectorTaskKind').onchange = () => syncConnectorDatasetOptions();
$('exceptionSourceFilter').onchange = () => syncTaskExceptionFilters();
$('exceptionPrefixFilter').onchange = () => syncTaskExceptionFilters();
$('exceptionTaskKindFilter').onchange = () => syncTaskExceptionFilters();
$('exceptionSeverityFilter').onchange = () => syncTaskExceptionFilters();
$('exceptionStatusFilter').onchange = () => syncTaskExceptionFilters();
$('exceptionAssigneeFilter').oninput = () => syncTaskExceptionFilters();
$('exceptionContractFilter').oninput = () => syncTaskExceptionFilters();
$('exceptionPaymentFilter').oninput = () => syncTaskExceptionFilters();
$('exceptionVoucherFilter').oninput = () => syncTaskExceptionFilters();
$('exceptionSelectAll').onclick = () => toggleSelectAllFilteredExceptions();
$('applyExceptionBulkBtn').onclick = () => submitExceptionBulkStatus().catch((error) => notify(error.message, 'error'));
$('exceptionTimelineStatusFilter').onchange = () => syncTaskExceptionHistoryFilters();
$('exceptionTimelineAssigneeFilter').oninput = () => syncTaskExceptionHistoryFilters();
$('exceptionTimelineChangedByFilter').oninput = () => syncTaskExceptionHistoryFilters();
$('exceptionTimelineChangedAtFilter').oninput = () => syncTaskExceptionHistoryFilters();
$('exportExceptionTimelineBtn').onclick = () => exportExceptionDispositionHistory();
$('caseTaskKindFilter').onchange = () => syncCaseFilters();
$('caseStatusFilter').onchange = () => syncCaseFilters();
$('caseStageFilter').onchange = () => syncCaseFilters();
$('caseHandlerFilter').oninput = () => syncCaseFilters();
$('caseSelectAll').onclick = () => toggleSelectAllFilteredCases();
$('assignCasesBtn').onclick = () => submitCaseAssign().catch((error) => notify(error.message, 'error'));
$('transitionCasesBtn').onclick = () => submitCaseTransition().catch((error) => notify(error.message, 'error'));
$('submitRectificationBtn').onclick = () => submitRectification().catch((error) => notify(error.message, 'error'));
$('submitRectificationExtensionBtn').onclick = () => submitRectificationExtension().catch((error) => notify(error.message, 'error'));
$('uploadRectificationAttachmentBtn').onclick = () => uploadRectificationAttachment().catch((error) => notify(error.message, 'error'));
$('exportOperationsCasesBtn').onclick = () => exportOperationsCases().catch((error) => notify(error.message, 'error'));
$('exportPdfBtn').onclick = () => exportCurrentTaskPdf().catch((error) => notify(error.message, 'error'));
$('sealTaskBtn').onclick = () => sealCurrentTaskPackage().catch((error) => notify(error.message, 'error'));
$('aiExplainBtn').onclick = () => explainCurrentTaskWithAi().catch((error) => notify(error.message, 'error'));
$('uploadImageBtn').onclick = () => uploadArtifact('image').catch((error) => notify(error.message, 'error'));
$('uploadAudioBtn').onclick = () => uploadArtifact('audio').catch((error) => notify(error.message, 'error'));

$('caseSeedAssignmentRuleRows').addEventListener('input', (event) => {
  const target = event.target;
  if (target.matches('[data-case-seed-rule-priority]')) {
    updateCaseSeedAssignmentRule(Number(target.dataset.caseSeedRulePriority), { priority: target.value });
  }
  if (target.matches('[data-case-seed-rule-label]')) {
    updateCaseSeedAssignmentRule(Number(target.dataset.caseSeedRuleLabel), { label: target.value });
  }
  if (target.matches('[data-case-seed-rule-field]')) {
    updateCaseSeedAssignmentRule(Number(target.dataset.caseSeedRuleField), { match_field: target.value });
  }
  if (target.matches('[data-case-seed-rule-value]')) {
    updateCaseSeedAssignmentRule(Number(target.dataset.caseSeedRuleValue), { match_value: target.value });
  }
  if (target.matches('[data-case-seed-rule-assignee]')) {
    updateCaseSeedAssignmentRule(Number(target.dataset.caseSeedRuleAssignee), { assignee: target.value });
  }
});

$('caseSeedAssignmentRuleRows').addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-case-seed-rule-field]')) {
    updateCaseSeedAssignmentRule(Number(target.dataset.caseSeedRuleField), { match_field: target.value });
  }
});

$('caseSeedAssignmentRuleRows').addEventListener('click', (event) => {
  const target = event.target;
  if (target.matches('[data-case-seed-rule-remove]')) {
    removeCaseSeedAssignmentRule(Number(target.dataset.caseSeedRuleRemove));
  }
});

$('caseSeedFieldMappings').addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-case-seed-mapping-field]')) {
    updateCaseSeedMappingOverride(target.dataset.caseSeedMappingField, target.value);
  }
});

$('importProfileRows').addEventListener('click', (event) => {
  const target = event.target;
  if (target.matches('[data-import-profile-apply]')) {
    applyImportProfile(target.dataset.importProfileApply).catch((error) => notify(error.message, 'error'));
  }
  if (target.matches('[data-import-profile-export]')) {
    exportSelectedImportProfile(target.dataset.importProfileExport).catch((error) => notify(error.message, 'error'));
  }
  if (target.matches('[data-import-profile-clone]')) {
    state.selectedImportProfileId = target.dataset.importProfileClone;
    cloneSelectedImportProfile(target.dataset.importProfileClone).catch((error) => notify(error.message, 'error'));
  }
});

$('assignmentDictionaryRows').addEventListener('click', (event) => {
  const target = event.target;
  if (target.matches('[data-assignment-rule-toggle]')) {
    toggleAssignmentDictionaryRule(target.dataset.assignmentRuleToggle, target.dataset.enabled !== '1')
      .catch((error) => notify(error.message, 'error'));
  }
});

$('automationScheduleRows').addEventListener('click', (event) => {
  const target = event.target;
  if (target.matches('[data-automation-run]')) {
    runAutomationSchedule(target.dataset.automationRun).catch((error) => notify(error.message, 'error'));
  }
});

document.querySelectorAll('[data-workspace-page]').forEach((node) => {
  node.onclick = () => setWorkspaceHash(node.dataset.workspacePage);
});

document.querySelectorAll('[data-cases-view]').forEach((node) => {
  node.onclick = () => setWorkspaceHash('cases', node.dataset.casesView);
});

document.querySelectorAll('[data-operations-view]').forEach((node) => {
  node.onclick = () => setWorkspaceHash('operations', node.dataset.operationsView);
});

window.addEventListener('hashchange', () => syncWorkspaceRoute().catch((error) => notify(error.message, 'error')));
window.addEventListener('focus', () => renderImportWorkbench());
window.addEventListener('focus', () => renderPreviewPanel());
window.addEventListener('focus', () => loadImportProfiles().catch(() => {}));
window.addEventListener('focus', () => loadAssignmentDictionary().catch(() => {}));
window.addEventListener('focus', () => loadAutomationCenter().catch(() => {}));

document.querySelectorAll('.collapsible').forEach((node) => {
  if (!node.hasAttribute('open')) {
    node.open = false;
  }
});

(async function init() {
  try {
    await loadBootstrap();
    syncConnectorDatasetOptions();
    await loadSession();
  } catch (error) {
    notify(error.message, 'error');
  }
})();



