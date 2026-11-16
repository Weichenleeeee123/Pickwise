import { LlmError } from '../llm.js';
import { checkGrounding, collectStrings, forbiddenClaims, groundedNumbers, numbersIn } from '../guard.js';
import { extractJson, validate } from '../schema.js';
import { addEvent } from '../session.js';
import { TOOL_ACTIVITY, buildTools } from './tools.js';

const MAX_TURNS = 7;
const SUBMIT = 'submit_result';

function record(session, usage, ms) {
  session.usage.llmCalls += 1;
  session.usage.inputTokens += usage?.input ?? 0;
  session.usage.outputTokens += usage?.output ?? 0;
  session.usage.llmMs += ms ?? 0;
}

// 通用的“读数据 → 提交结构化结果 → 校验 → 最多修复一次”循环。
// validators 返回问题清单（字符串数组）；数字溯源与禁用断言在这里统一检查。
export async function runAgentTask(options) {
  const { agent, session, stepId = null } = options;
  if (!agent) return runAgentTaskLoop(options);
  const eventAgent = { agent_id: agent.id, agent_role: agent.role, responsibility: agent.responsibility };
  addEvent(session, { type: 'agent_start', step: stepId, ...eventAgent, status: 'running' });
  try {
    const result = await runAgentTaskLoop({
      ...options,
      system: `${options.system}\n\n本次 specialist：${agent.role}。职责：${agent.responsibility}`
    });
    addEvent(session, { type: 'agent_done', step: stepId, ...eventAgent, status: 'complete', ms: result.ms });
    return result;
  } catch (error) {
    addEvent(session, { type: 'agent_failed', step: stepId, ...eventAgent, status: 'failed', category: error.category ?? 'internal' });
    throw error;
  }
}

async function runAgentTaskLoop({ llm, session, stepId = null, label, system, user, toolNames = [], schema, validators = [], textFields, extraFacts = '', onActivity, agent, compactUser }) {
  const tools = buildTools(session, toolNames);
  const submit = { name: SUBMIT, description: '提交最终结果。必须符合给定结构；校验失败会返回错误清单，请据此修正后重新提交。', schema };
  const messages = [{ role: 'user', content: user }];
  let facts = `${user}\n${extraFacts}`;
  let repaired = false;
  let malformedRetries = 0;
  const started = Date.now();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try { response = await llm.chat({ system, messages, tools: [...tools, submit], maxTokens: 10000, timeoutMs: 120000 }); }
    catch (error) {
      if (error instanceof LlmError && error.category === 'bad_output') record(session, error.usage, error.ms);
      if (error instanceof LlmError && error.category === 'bad_output' && malformedRetries < 1) {
        malformedRetries++;
        if (compactUser && !toolNames.length) messages.splice(0, messages.length, { role:'user', content:compactUser });
        addEvent(session, { type: 'repair', category: 'malformed_json', step: stepId, ...(agent ? { agent_id: agent.id, agent_role: agent.role, responsibility: agent.responsibility, status: 'repairing' } : {}), finishReason: error.finishReason ?? null, problems: ['模型工具参数 JSON 不完整，保留已取得事实并精简重试一次'] });
        messages.push({ role: 'user', content: '上次结构化参数无法解析，可能被截断。请精简输出：每个文字字段一两句话，found 最多五条；不要重复证据表，不写大段说明。保留证据编号并提交完整合法 JSON。不得补造缺失值。' });
        continue;
      }
      throw error;
    }
    record(session, response.usage, response.ms);
    const assistantBlocks = [];
    if (response.text) assistantBlocks.push({ type: 'text', text: response.text });
    for (const call of response.toolCalls) assistantBlocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    if (assistantBlocks.length) messages.push({ role: 'assistant', content: assistantBlocks });

    let submission = response.toolCalls.find((call) => call.name === SUBMIT);
    const results = [];

    for (const call of response.toolCalls) {
      if (call.name === SUBMIT) continue;
      const tool = tools.find((item) => item.name === call.name);
      const callStart = Date.now();
      let content;
      let ok = true;
      if (!tool) { content = JSON.stringify({ error: `未知工具 ${call.name}` }); ok = false; }
      else {
        try { content = JSON.stringify(tool.handler(call.input ?? {})); }
        catch (error) { content = JSON.stringify({ error: String(error.message).slice(0, 200) }); ok = false; }
      }
      session.usage.toolCalls += 1;
      addEvent(session, { type: 'tool', step: stepId, ...(agent ? { agent_id: agent.id, agent_role: agent.role, responsibility: agent.responsibility } : {}), status: ok ? 'complete' : 'failed', name: call.name, label: TOOL_ACTIVITY[call.name] ?? call.name, ok, ms: Date.now() - callStart });
      onActivity?.(TOOL_ACTIVITY[call.name] ?? call.name);
      facts += `\n${content}`;
      results.push({ type: 'tool_result', tool_use_id: call.id, content });
    }

    if (!submission && !response.toolCalls.length) {
      const parsed = extractJson(response.text);
      if (parsed) submission = { id: 'inline', name: SUBMIT, input: parsed, inline: true };
    }

    if (submission) {
      submission.input = normalizeSubmission(submission.input);
      const problems = checkSubmission({ schema, input: submission.input, validators, textFields, facts, session });
      if (!problems.length) return { value: submission.input, ms: Date.now() - started };
      if (repaired) throw new LlmError('bad_output', `模型输出未通过校验：${problems.slice(0, 3).join('；')}`);
      repaired = true;
      addEvent(session, { type: 'repair', step: stepId, ...(agent ? { agent_id: agent.id, agent_role: agent.role, responsibility: agent.responsibility, status: 'repairing' } : {}), label, problems: problems.slice(0, 5) });
      const feedback = `提交未通过校验，请逐项修正后重新调用 ${SUBMIT}：\n- ${problems.slice(0, 8).join('\n- ')}\n\n修复规则：事实材料中没有的数字不要换一个写，直接删除或改成“未知 / 未提供 / 证据不足”；不要写未经来源支持的价格区间、数量、日期、法规编号或示例阈值。`;
      if (submission.inline) messages.push({ role: 'user', content: feedback });
      else results.push({ type: 'tool_result', tool_use_id: submission.id, content: feedback });
    } else if (!results.length) {
      messages.push({ role: 'user', content: `请调用 ${SUBMIT} 提交结果。` });
    }
    if (results.length) messages.push({ role: 'user', content: results });
  }
  throw new LlmError('bad_output', '模型多轮调用后仍未提交有效结果');
}

function normalizeSubmission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const normalized = { ...input };
  if (typeof normalized.misread === 'string') {
    normalized.misread = { mistake: normalized.misread, verify: '回到来源和统计口径核对。' };
  }
  return normalized;
}

function checkSubmission({ schema, input, validators, textFields, facts, session }) {
  const problems = validate(schema, input);
  if (problems.length) return problems;
  for (const validator of validators) problems.push(...validator(input));
  const fields = textFields ?? ((output) => collectStrings(output).map((text, index) => ({ label: `文字${index + 1}`, text })));
  const groundingFields = fields(input).filter(({ label }) => !isExplanatoryField(label));
  problems.push(...checkGrounding(input, facts, () => groundingFields));
  for (const { label, text } of fields(input)) {
    if (session.evidence.some(r => r.evidence_kind === 'recall') && /目标(?:商品|ASIN)?.{0,8}(?:未被召回|没有被召回|不在召回|无召回)/.test(text)) problems.push(`${label} 不能声称目标未被召回：品牌/型号候选检索不足以排除召回，必须写目标召回状态未知`);
    const bad = forbiddenClaims(text);
    if (bad.length) problems.push(`${label} 含有不允许的断言“${bad[0]}”`);
  }
  return problems;
}

function isExplanatoryField(label) {
  return /(?:misread|how_to_read|verify|gap|scope\.(can_show|cannot_show)|glossary\[\d+\]\.explanation|checks\[\d+\]\.(item|why|where)|takeaways|checklist|next_steps\[\d+\]\.(why|where)|assumptions\[\d+\]\.verify)/.test(String(label));
}

// found 条目的证据编号校验：fact/estimate 必须指向真实存在的证据，或来自程序计算（calc）、用户输入（user）。
export function evidenceRefValidator(session, path = 'found') {
  const known = new Set(session.evidence.map((record) => record.id));
  return (input) => {
    const problems = [];
    (input[path] ?? []).forEach((item, index) => {
      const ids = item.evidence_ids ?? [];
      for (const id of ids) if (!known.has(id) && id !== 'calc' && id !== 'user') problems.push(`${path}[${index}] 引用了不存在的证据编号 ${id}`);
      if (['fact', 'estimate'].includes(item.nature) && !ids.length) problems.push(`${path}[${index}] 标为 ${item.nature} 但没有证据编号（程序计算用 "calc"）`);
    });
    return problems;
  };
}

export function mustBeSupported(session) {
  return (input) => {
    const known = new Set(session.evidence.map((record) => record.id));
    const problems = [];
    for (const row of input.comparison_rows ?? []) if (!known.has(row.evidence_id)) problems.push(`comparison_rows 引用了不存在的证据编号 ${row.evidence_id}`);
    for (const candidate of input.candidates ?? []) if (candidate.asin !== session.targetAsin && !session.evidence.some((record) => record.asin === candidate.asin)) problems.push(`候选 ${candidate.asin} 不在导入的证据里`);
    return problems;
  };
}

export { groundedNumbers, numbersIn, isExplanatoryField };
