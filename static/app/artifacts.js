import { state, deploymentPolicy } from './state.js';
import { $, api, notify } from './services.js';

function artifactStatusLabel(status) {
  if (status === 'Completed') return '已完成';
  if (status === 'Failed') return '失败';
  return '处理中';
}

function artifactStatusClass(status) {
  if (status === 'Completed') return 'green';
  if (status === 'Failed') return 'red';
  return 'gold';
}

function renderStructuredSummary(summary) {
  if (!summary) {
    return '<div class="muted">暂无结构化摘要。</div>';
  }

  if (summary.kind === 'image') {
    const data = summary.data || {};
    const rows = [
      ['票据类型', data.document_type],
      ['日期', data.document_date],
      ['金额', data.amount],
      ['票据/凭证号', data.document_number],
      ['对方单位', data.counterparty],
      ['业务摘要', data.business_summary],
      ['关键词', Array.isArray(data.keywords) ? data.keywords.join('、') : '']
    ].filter(([, value]) => value);

    return rows.length
      ? rows.map(([label, value]) => `<div class="notice" style="margin-bottom:8px;"><strong>${label}</strong><br><span class="muted">${value}</span></div>`).join('')
      : '<div class="muted">OCR 尚未提取到关键字段。</div>';
  }

  if (summary.kind === 'audio') {
    const data = summary.data || {};
    const rows = [
      ['摘要', data.summary],
      ['关键词', Array.isArray(data.keywords) ? data.keywords.join('、') : ''],
      ['时间范围', data.time_range],
      ['预算相关', data.mentions_budget ? '是' : '否'],
      ['支付相关', data.mentions_payment ? '是' : '否'],
      ['审批相关', data.mentions_approval ? '是' : '否'],
      ['资金相关', data.mentions_funds ? '是' : '否'],
      ['需人工复核', data.needs_manual_review ? '是' : '否']
    ];

    return rows.map(([label, value]) => `<div class="notice" style="margin-bottom:8px;"><strong>${label}</strong><br><span class="muted">${value ?? ''}</span></div>`).join('');
  }

  return `<pre>${JSON.stringify(summary, null, 2)}</pre>`;
}

export function renderArtifacts() {
  const artifacts = state.currentArtifacts || [];
  const policy = deploymentPolicy();
  const uploadsDisabled = policy.environment_mode === 'public_demo';
  $('uploadImageBtn').disabled = uploadsDisabled || !policy.ocr_enabled;
  $('uploadAudioBtn').disabled = uploadsDisabled || !policy.speech_enabled;

  if (!state.currentTask) {
    $('artifactList').innerHTML = '<div class="muted">请选择任务后查看证据材料。</div>';
    return;
  }

  if (!artifacts.length) {
    $('artifactList').innerHTML = '<div class="muted">当前任务暂无证据材料。</div>';
    return;
  }

  $('artifactList').innerHTML = artifacts.map((artifact) => `
    <div class="card" style="box-shadow:none;margin-bottom:12px;">
      <div class="section-title">
        <div>
          <h3 style="margin:0;">${artifact.source_filename}</h3>
          <p>${artifact.artifact_type === 'Image' || artifact.artifact_type === 'image' ? '图片 / 票据 OCR' : '音频 / 语音转写'} / ${artifact.mime_type}</p>
        </div>
        <div class="toolbar">
          <span class="badge ${artifactStatusClass(artifact.status)}">${artifactStatusLabel(artifact.status)}</span>
          ${artifact.status === 'Failed' ? `<button class="btn-secondary" onclick="retryArtifact('${artifact.id}')">重试</button>` : ''}
        </div>
      </div>
      <div class="notice" style="margin-bottom:10px;"><strong>原件路径</strong><br><span class="muted">${artifact.storage_path}</span></div>
      ${artifact.error_message ? `<div class="notice" style="margin-bottom:10px;border-color:#efb2ac;background:#fff1ef;"><strong>失败原因</strong><br>${artifact.error_message}</div>` : ''}
      <div class="grid-2">
        <div>
          <h4 style="margin-top:0;">识别全文</h4>
          <div class="notice">${artifact.transcript_text ? artifact.transcript_text.replace(/\n/g, '<br>') : '暂无全文结果。'}</div>
        </div>
        <div>
          <h4 style="margin-top:0;">结构化摘要</h4>
          ${renderStructuredSummary(artifact.structured_summary)}
        </div>
      </div>
    </div>
  `).join('');
}

export async function loadArtifacts(taskId) {
  const data = await api(`/api/tasks/${taskId}/artifacts`);
  state.currentArtifacts = data.artifacts || [];
  renderArtifacts();
}

export async function uploadArtifact(kind) {
  if (!state.currentTask) {
    return notify('请先选择任务', 'error');
  }

  const input = kind === 'image' ? $('imageArtifactInput') : $('audioArtifactInput');
  const file = input.files[0];
  if (!file) {
    return notify(kind === 'image' ? '请选择图片或 PDF' : '请选择音频文件', 'error');
  }

  const form = new FormData();
  form.append('file', file);
  await api(`/api/tasks/${state.currentTask.id}/artifacts/${kind}`, {
    method: 'POST',
    body: form
  });

  notify(kind === 'image' ? '图片证据已上传' : '录音证据已上传');
  input.value = '';
  await loadArtifacts(state.currentTask.id);
}

export async function retryArtifact(artifactId) {
  if (!state.currentTask) {
    return;
  }

  await api(`/api/tasks/${state.currentTask.id}/artifacts/${artifactId}/retry`, {
    method: 'POST'
  });
  notify('证据识别已重新提交');
  await loadArtifacts(state.currentTask.id);
}

window.retryArtifact = retryArtifact;
