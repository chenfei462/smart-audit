export const $ = (id) => document.getElementById(id);

export function notify(message, type = 'info') {
  const root = $('message');
  root.className = `notification-bar notification-${type}`;
  root.textContent = message;
  setTimeout(() => {
    root.classList.add('notification-hide');
    setTimeout(() => { root.className = 'hidden'; }, 400);
  }, 3200);
}

export async function api(url, options = {}) {
  const { timeoutMs = 20000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    cache: 'no-store',
    ...fetchOptions,
    signal: fetchOptions.signal || controller.signal
  }).finally(() => clearTimeout(timeout));
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = '请求失败';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      message = data.error || message;
    }
    throw new Error(message);
  }
  return contentType.includes('application/json') ? response.json() : response.blob();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
