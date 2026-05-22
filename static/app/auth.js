import { state, canAccessCaseWorkbench, canAccessOperations, canAccessRectificationPortal } from './state.js';
import { $, api, notify } from './services.js';
import { renderEnvironmentCopy, toggleRegisterPanel, renderAiState, renderImportWorkbench, renderPreviewPanel, refreshTasks, loadConnectorBootstrap, loadCaseSeedTemplateConfig, loadInternalSampleTemplates } from './tasks.js?v=viz-20260430';
import { loadAdminOverview } from './admin.js?v=viz-20260430';
import { loadCases } from './cases.js';
import { loadRectificationCases, renderRectificationWorkbench } from './rectification.js?v=viz-20260520h';
import { loadOperations, renderOperationsBoard } from './operations.js';
import {
  loadImportProfiles,
  loadAssignmentDictionary,
  loadAutomationCenter,
  renderImportProfileCenter,
  renderAssignmentDictionaryCenter,
  renderAutomationCenter
} from './configuration.js?v=viz-20260430';
import { updateWorkspaceChrome, syncWorkspaceRoute } from './navigation.js?v=viz-20260520h';

export async function loadBootstrap() {
  const [bootstrap, importBootstrap] = await Promise.all([
    api('/api/bootstrap'),
    api('/api/import/bootstrap')
  ]);
  state.bootstrap = bootstrap;
  state.importBootstrap = importBootstrap;
  const firstEnabled = importBootstrap.task_kinds.find((item) => item.enabled) || importBootstrap.task_kinds[0];
  if (firstEnabled) {
    state.selectedTaskKind = firstEnabled.task_kind;
    state.selectedSourceKind = firstEnabled.supported_sources[0] || 'file';
  }
  renderEnvironmentCopy();
  toggleRegisterPanel();
  renderAiState();
  renderImportWorkbench();
  renderPreviewPanel();
}

export async function loadSession() {
  const data = await api('/api/auth/me');
  state.user = data.user;
  if (!data.logged_in) {
    $('authRoot').classList.remove('hidden');
    $('appRoot').classList.add('hidden');
    return;
  }

  renderAuthenticatedSession(data.user);
  await loadWorkspaceData();
}

export function renderAuthenticatedSession(user) {
  state.user = user;
  const role = String(user.role || '').toLowerCase();
  $('authRoot').classList.add('hidden');
  $('appRoot').classList.remove('hidden');
  $('userName').textContent = user.display_name;
  $('userOrg').textContent = `${user.tenant_name} / ${user.organization_name}`;
  $('userRole').textContent = role;
  $('importConfigCenter').classList.toggle('hidden', !canAccessCaseWorkbench());
  renderAiState();
  renderImportProfileCenter();
  renderAssignmentDictionaryCenter();
  renderRectificationWorkbench();
  renderOperationsBoard();
  renderAutomationCenter();
  updateWorkspaceChrome();
}

export async function loadWorkspaceData() {
  const user = state.user;
  if (!user) return;
  try {
    await Promise.all([
      loadConnectorBootstrap(),
      loadInternalSampleTemplates(),
      refreshTasks()
    ]);

    await syncWorkspaceRoute();

    const followupLoads = [];
    if (canAccessCaseWorkbench()) {
      followupLoads.push(loadCaseSeedTemplateConfig(), loadImportProfiles(), loadAssignmentDictionary(), loadCases());
    }
    if (canAccessRectificationPortal()) {
      followupLoads.push(loadRectificationCases());
    }
    if (canAccessOperations()) {
      followupLoads.push(loadAutomationCenter(), loadOperations());
    }
    if (String(user.role || '').toLowerCase() === 'admin') {
      followupLoads.push(loadAdminOverview());
    }

    if (followupLoads.length) {
      await Promise.all(followupLoads);
    }

    await syncWorkspaceRoute();
  } catch (error) {
    notify(error.message, 'error');
  }
}

export async function submitLeadRequest(event) {
  event.preventDefault();
  await api('/api/public/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_name: $('leadContactName').value,
      contact_channel: $('leadContactChannel').value,
      unit_type: $('leadUnitType').value,
      department: $('leadDepartment').value,
      audit_scenario: taskKindLabelForLead(),
      deployment_preference: $('leadDeployment').value,
      involves_real_data: $('leadRealData').value === 'true',
      ai_expectation: $('leadAiPolicy').value,
      note: $('leadNote').value
    })
  });
  notify('椤圭洰鐢宠宸叉彁浜わ紝鎴戜滑浼氭寜澶氱被鍨嬪鍏?PoC 璺緞璺熻繘');
  $('leadForm').reset();
  $('leadDeployment').value = 'private-cloud-poc';
  $('leadRealData').value = 'false';
  $('leadAiPolicy').value = 'configurable';
}

function taskKindLabelForLead() {
  const current = state.importBootstrap?.task_kinds?.find((item) => item.task_kind === state.selectedTaskKind);
  return current?.label || '鏀垮簻閲囪喘椤圭洰 / 鍏憡 / 鍚堝悓';
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
}



