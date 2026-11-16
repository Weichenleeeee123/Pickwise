import { readFileSync } from 'node:fs';
import { extractJson } from './schema.js';

// 内部统一使用 Anthropic 风格的消息块：assistant 含 text / tool_use，user 含 text / tool_result。
export class LlmError extends Error {
  constructor(category, message, detail = '') {
    super(message);
    this.category = category;
    this.detail = detail;
  }
}

export function loadEnv(file = new URL('../.env', import.meta.url)) {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 没有 .env 文件时只读取进程环境变量 */ }
  return env;
}

function toOpenAiMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (typeof message.content === 'string') { out.push({ role: message.role, content: message.content }); continue; }
    if (message.role === 'assistant') {
      const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = message.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const block of message.content) {
        if (block.type === 'tool_result') out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: String(block.content) });
        else if (block.type === 'text') out.push({ role: 'user', content: block.text });
      }
    }
  }
  return out;
}

function buildRequest(config, { system, messages, tools = [], maxTokens }) {
  if (config.provider === 'anthropic') {
    return {
      url: config.base.endsWith('/v1/messages') ? config.base : `${config.base}/v1/messages`,
      headers: { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
      body: { model: config.model, max_tokens: maxTokens, system, messages, ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })) } : {}) }
    };
  }
  return {
    url: config.base.endsWith('/chat/completions') ? config.base : `${config.base}/chat/completions`,
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: { model: config.model, max_tokens: maxTokens, messages: toOpenAiMessages(system, messages), ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })) } : {}) }
  };
}

function parseResponse(provider, data) {
  if (provider === 'anthropic') {
    const blocks = Array.isArray(data.content) ? data.content : [];
    return {
      text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
      toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} })),
      usage: { input: data.usage?.input_tokens ?? null, output: data.usage?.output_tokens ?? null }
    };
  }
  const message = data.choices?.[0]?.message ?? {};
  let toolCalls;
  try { toolCalls = (message.tool_calls ?? []).map((call) => {
    const raw = call.function?.arguments ?? '{}';
    const input = parseToolArguments(raw);
    return { id: call.id, name: call.function?.name, input };
  }); } catch (error) {
    error.finishReason = data.choices?.[0]?.finish_reason ?? null;
    error.usage = { input: data.usage?.prompt_tokens ?? null, output: data.usage?.completion_tokens ?? null };
    throw error;
  }
  return { text: message.content ?? '', toolCalls, finishReason: data.choices?.[0]?.finish_reason ?? null, usage: { input: data.usage?.prompt_tokens ?? null, output: data.usage?.completion_tokens ?? null } };
}

function parseToolArguments(raw) {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '{}').trim();
  try { return JSON.parse(text); } catch { /* try common provider formatting defects below */ }
  const extracted = extractJson(text);
  if (extracted) return extracted;
  const withoutTrailingCommas = text.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(withoutTrailingCommas); } catch { /* report the original payload */ }
  throw new LlmError('bad_output', '模型返回的工具参数不是有效 JSON', text.slice(0, 1000));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(request, timeoutMs, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await wait(800);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(request.url, { method: 'POST', headers: { 'content-type': 'application/json', ...request.headers }, body: JSON.stringify(request.body), signal: controller.signal });
      const text = await response.text();
      if (response.ok) {
        try { return JSON.parse(text); } catch { throw new LlmError('bad_output', '模型服务返回了无法解析的内容', text.slice(0, 200)); }
      }
      const category = [401, 403].includes(response.status) ? 'auth' : response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'upstream' : 'bad_request';
      lastError = new LlmError(category, `模型服务返回 ${response.status}`, text.slice(0, 300));
      if (!['rate_limit', 'upstream'].includes(category)) throw lastError;
    } catch (error) {
      if (error instanceof LlmError && !['rate_limit', 'upstream'].includes(error.category)) throw error;
      lastError = error instanceof LlmError ? error : new LlmError(error.name === 'AbortError' ? 'timeout' : 'network', error.name === 'AbortError' ? '模型服务响应超时' : '无法连接模型服务', String(error.message).slice(0, 200));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export function createLlm(env = loadEnv(), fetchImpl = globalThis.fetch) {
  const provider = (env.LLM_PROVIDER || 'openai').toLowerCase();
  const base = (env.LLM_BASE_URL || (provider === 'anthropic' ? 'https://api.anthropic.com' : '')).replace(/\/+$/, '');
  const config = { provider, base, apiKey: env.LLM_API_KEY, model: env.LLM_MODEL };
  const configured = Boolean(config.apiKey && config.model && base);
  return {
    configured,
    provider,
    model: config.model ?? null,
    async chat({ system, messages, tools = [], maxTokens = 2048, timeoutMs = 60000 }) {
      if (!configured) throw new LlmError('not_configured', '服务端尚未配置模型（需要 LLM_PROVIDER、LLM_BASE_URL、LLM_API_KEY、LLM_MODEL）');
      const started = Date.now();
      const data = await post(buildRequest(config, { system, messages, tools, maxTokens }), timeoutMs, fetchImpl);
      return { ...parseResponse(provider, data), ms: Date.now() - started };
    }
  };
}
