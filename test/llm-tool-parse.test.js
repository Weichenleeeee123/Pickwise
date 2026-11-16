import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../server/llm.js';
import { LlmError } from '../server/llm.js';
import { runAgentTask } from '../server/agent/runner.js';
import { createSession } from '../server/session.js';

test('accepts a tool call with harmless trailing commas in JSON arguments', async () => {
  const llm = createLlm({ LLM_PROVIDER: 'openai', LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'test-key', LLM_MODEL: 'test-model' }, async () => new Response(JSON.stringify({
    choices: [{ message: { tool_calls: [{ id: 'call_1', function: { name: 'submit_result', arguments: '{"ok":true,}' } }] } }], usage: {}
  }), { status: 200 }));

  const result = await llm.chat({ system: 'system', messages: [{ role: 'user', content: 'hello' }] });
  assert.deepEqual(result.toolCalls[0].input, { ok: true });
});

test('malformed model tool payload is retried with concise structured feedback before fallback', async () => {
  const s = createSession({ input: 'B012345678', parsed: { asin: 'B012345678', productName: 'Printer', query: '' } });
  let calls = 0; let second;
  const llm = { chat: async input => { calls++; assert.equal(input.maxTokens, 10000); if (calls === 1) throw new LlmError('bad_output', '模型返回的工具参数不是有效 JSON', 'truncated'); second = input; return { text: '', toolCalls: [{ id: 'ok', name: 'submit_result', input: { message: '数据不足' } }], usage: {}, ms: 1 }; } };
  const result = await runAgentTask({ llm, session: s, stepId: 'demand', label: 'Demand', system: 'system', user: 'inspect', schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } } });
  assert.equal(result.value.message, '数据不足'); assert.equal(calls, 2);
  assert.ok(second.messages.some(m => typeof m.content === 'string' && /精简|简短/.test(m.content)));
  assert.ok(s.events.some(e => e.type === 'repair' && e.category === 'malformed_json'));
});

test('provider finish reason and token usage survive malformed tool argument errors', async () => {
  const llm = createLlm({ LLM_PROVIDER: 'openai', LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'test-key', LLM_MODEL: 'test' }, async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { tool_calls: [{ id: 'x', function: { name: 'submit_result', arguments: '{unfinished' } }] } }], usage: { prompt_tokens: 100, completion_tokens: 10000 } })));
  await assert.rejects(llm.chat({ system: 'x', messages: [], maxTokens: 10000 }), e => e.finishReason === 'length' && e.usage.output === 10000);
});

test('structured tasks allow sufficient generation time for the configured output budget', async () => {
  const s = createSession({ input: 'B012345678', parsed: { asin: 'B012345678', productName: 'Printer', query: '' } });
  let options;
  const llm = { chat: async input => { options = input; return { text: '', toolCalls: [{ id: 'x', name: 'submit_result', input: { ok: true } }], usage: {}, ms: 1 }; } };
  await runAgentTask({ llm, session: s, system: 'x', user: 'x', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(options.maxTokens, 10000); assert.equal(options.timeoutMs, 120000);
});

test('recall candidate cannot support an assertion that the target was not recalled', async () => {
  const s = createSession({ input: 'B012345678', parsed: { asin: 'B012345678', productName: 'Printer', query: '' } });
  s.evidence.push({ id: 'E1', evidence_kind: 'recall', asin: s.targetAsin, match: 'candidate' });
  let calls = 0;
  const llm = { chat: async () => ({ text: '', toolCalls: [{ id: `x${++calls}`, name: 'submit_result', input: { message: calls === 1 ? '记录标注目标商品未被召回' : '检索仅得到品牌候选，目标召回状态未知' } }], usage: {}, ms: 1 }) };
  const r = await runAgentTask({ llm, session: s, system: 'x', user: 'x', schema: { type: 'object', properties: { message: { type: 'string' } } } });
  assert.equal(calls, 2); assert.match(r.value.message, /未知/);
});
