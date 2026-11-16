import { demoProvider } from './demo-provider.js';
import { createBrowserHistory } from './browser-history.js';

const browserHistory = createBrowserHistory();
export class ApiError extends Error {
  constructor(category, message, status = null) { super(message); this.category = category; this.status = status; }
}

async function request(path, body) {
  let response;
  const token = browserHistory.token();
  try {
    response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-pickwise-browser-token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError('network', '无法连接 Pickwise 服务，请确认服务已启动。'); }
  const text = await response.text();
  if (token !== browserHistory.token()) throw new ApiError('browser_changed', '浏览器数据已更改，请重新开始分析。');
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON 响应按状态码处理 */ }
  if (!response.ok) throw new ApiError(data?.error?.category ?? 'http', data?.error?.message ?? `请求失败（${response.status}）`, response.status);
  if (data?.id && data.product) browserHistory.remember(data, token);
  return data;
}

const liveApi = {
  config: () => request('/config'),
  list: async () => ({ sessions: browserHistory.list(), persistent: browserHistory.persistent }),
  create: (input) => request('/sessions', { input }),
  demo: () => request('/demo', {}),
  get: (id) => request(`/sessions/${id}`),
  post: (id, action, body = {}) => request(`/sessions/${id}/${action}`, body),
  async exportText(id, kind) {
    let response;
    const token = browserHistory.token();
    try { response = await fetch(`/api/sessions/${id}/export/${kind}`, { headers: { 'x-pickwise-browser-token': token } }); } catch { throw new ApiError('network', '无法连接 Pickwise 服务。'); }
    if (!response.ok) throw new ApiError('http', `导出失败（${response.status}）`);
    const text = await response.text();
    if (token !== browserHistory.token()) throw new ApiError('browser_changed', '浏览器数据已更改，请重新开始分析。');
    return text;
  }
};

let mode = 'live';
export function setDataMode(next) { mode = next === 'demo' ? 'demo' : 'live'; }
export const api = Object.fromEntries(Object.keys(liveApi).map(key => [key, (...args) => (mode === 'demo' ? demoProvider : liveApi)[key](...args)]));
