import { LlmError } from '../server/llm.js';

// 测试用的脚本化“模型”：只用来验证流水线、校验和状态机，不代表模型输出质量。
// 它会真实调用工具并基于工具返回的内容提交结构化结果，所以护栏（数字溯源、证据编号、节点范围）是真的在被检验。
export function fakeLlm(options = {}) {
  let open;
  const gate = options.gate ? new Promise((resolve) => { open = resolve; }) : null;
  const captured = [];
  const toolResultsSeen = [];

  function taskOf(prompt) {
    const table = [
      ['任务：商品识别', 'identify'], ['任务：需求证据', 'demand'], ['任务：竞品比较', 'competition'], ['任务：利润与资金', 'profit'],
      ['任务：风险核验', 'risk'], ['任务：教学总结', 'summary'], ['请综合已完成的拆解步骤', 'analysis'], ['请把用户的初判与证据显示的结果并列对照', 'comparison'],
      ['请为教学节点', 'practice'], ['用户回答了', 'feedback'], ['请按评分表', 'transfer'], ['请为用户整理个人学习记录', 'learning'], ['用户选中的报告原文', 'coach']
    ];
    return table.find(([marker]) => prompt.includes(marker))?.[1];
  }

  function results(messages) {
    const names = new Map();
    const out = {};
    for (const message of messages) {
      if (message.role === 'assistant' && Array.isArray(message.content)) for (const block of message.content) if (block.type === 'tool_use') names.set(block.id, block.name);
      if (message.role === 'user' && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type !== 'tool_result') continue;
          const name = names.get(block.tool_use_id);
          if (!name) continue;
          try { out[name] = out[name] ? [...[].concat(out[name]), JSON.parse(block.content)] : JSON.parse(block.content); } catch { /* 校验反馈文本 */ }
        }
      }
    }
    return out;
  }

  const grab = (prompt, prefix) => {
    const line = prompt.split('\n').find((item) => item.startsWith(prefix));
    if (!line) return null;
    try { return JSON.parse(line.slice(prefix.length)); } catch { return null; }
  };

  const card = (extra = {}) => ({ why: '这一步用来判断后面的结论有没有依据。', found: [], how_to_read: '先看数据来源、统计窗口和商品层级，再看数字。', scope: { can_show: '本次来源记录的商品和观察信号。', cannot_show: '不能由公开快照推出卖家实际订单。' }, misread: { mistake: '把估算当成真实订单。', verify: '回到数据来源核对统计口径。' }, ...extra });

  function submitFor(task, prompt, messages) {
    const r = results(messages);
    if (task === 'identify') {
      const target = /目标商品 ASIN：([^\n]+)/.exec(prompt)?.[1]?.trim();
      const rows = r.list_evidence?.rows ?? [];
      const asins = [...new Set(rows.map((row) => row.asin))];
      if (target && target !== '尚未确定') return card({ decision: 'single', candidates: [{ asin: target, reason: '用户输入已经包含明确的 ASIN。' }], found: rows.some((row) => row.asin === target) ? [{ text: '导入的证据里有该商品的快照。', nature: 'fact', evidence_ids: [rows.find((row) => row.asin === target).id] }] : [], gap: rows.length ? undefined : '还没有导入该商品的资料，需要到 Amazon.com 商品页核对标题与规格。' });
      if (asins.length >= 2) return card({ decision: 'ambiguous', candidates: asins.slice(0, 2).map((asin) => ({ asin, reason: '标题与输入的名称都相近。' })) });
      if (asins.length === 1) return card({ decision: 'single', candidates: [{ asin: asins[0], reason: '只有这一个候选。' }], found: [{ text: '导入的证据里只有这一个相近商品。', nature: 'fact', evidence_ids: [rows[0].id] }] });
      return card({ decision: 'none', candidates: [], gap: '没有导入任何商品资料，无法把名称匹配到具体 ASIN。' });
    }
    if (task === 'demand') {
      const rows = r.list_evidence?.rows ?? [];
      const sales = r.inspect_sales;
      const scope = sales.all_evidence.duplicate_parent_groups.length > 0 || sales.all_evidence.mixed_parent_and_child_scope.length > 0 || sales.all_evidence.window_mismatch;
      const history = sales.target.no_usable_sales || sales.target.single_period_only;
      const second = scope ? 'N1' : 'N2';
      const bad = options.badDemandAlways ? '，合计 99999 件' : '';
      const withSales = rows.filter((row) => row.monthly_sales_estimate !== null);
      return card({
        found: withSales.length ? [{ text: `目标商品附近有带统计窗口的月销估算${bad}。`, nature: 'estimate', evidence_ids: [withSales[0].id] }] : [],
        gap: withSales.length ? undefined : '目标商品没有任何带完整窗口与层级的销量，需要向数据来源索取。',
        lesson: { node: second, evidence_card: `同一父体、同一窗口的整款销量只能算一次，这条证据的口径需要先核对${bad}。`, method: '先确认销量层级和统计窗口，再决定能不能相加。', depth: 'default' },
        second_node: second,
        second_node_reason: scope ? '数据里出现了父体重复或窗口不一致，口径会改变数字本身。' : '只有单期销量，缺少连续历史。',
        deferred_issue: scope && history ? '目标商品只有单个窗口的销量，持续性仍未知。' : undefined
      });
    }
    if (task === 'competition') {
      const products = r.compare_products?.products ?? [];
      return card({
        found: products.length ? [{ text: '有若干候选竞品快照可供比较。', nature: 'estimate', evidence_ids: [products[0].id] }] : [],
        gap: products.length ? undefined : '没有导入其他商品，需要同用途、同规格的样本。',
        comparison_rows: products.slice(0, 4).map((product) => ({ evidence_id: product.id, role: 'uncertain', reason: '规格与包装数量还没有逐项核对。' }))
      });
    }
    if (task === 'profit') {
      const base = [].concat(r.compute_unit_economics ?? [])[0];
      const complete = base?.status === 'complete';
      return card({
        found: complete ? [{ text: `广告前贡献 ${base.preAdContribution}，广告后贡献 ${base.postAdContribution}。`, nature: 'estimate', evidence_ids: ['calc'] }] : [],
        gap: complete ? undefined : '成本项缺失，不能给出广告后贡献。',
        lesson: { node: 'N3', evidence_card: complete ? `获客成本 ${base.acquisitionCost}，广告后贡献 ${base.postAdContribution}。` : '成本不完整，下面只演示公式。', method: 'CAC 等于 CPC 除以 CVR，广告后贡献等于广告前贡献减 CAC。', depth: 'default' }
      });
    }
    if (task === 'risk') {
      return card({ found: [], gap: '本次没有核对任何官方来源。', checks: [1, 2, 3].map((n) => ({ item: `待核实事项 ${n}`, why: '可能影响能否上架或被下架。', where: 'Amazon 卖家后台的类目政策页。' })) });
    }
    if (task === 'summary') {
      return card({ takeaways: ['先核对口径，再读数字。', '广告成本会改变利润结论。'], checklist: ['核对销量层级', '核对统计窗口', '列全成本项'] });
    }
    if (task === 'analysis') {
      const figures = grab(prompt, '程序给出的主要数字（只能引用，不得改写或自己计算）：') ?? [];
      const status = /程序给出的状态：([^\n]+)/.exec(prompt)?.[1] ?? '';
      const noSales = status.includes('没有可用销量');
      const noComp = status.includes('竞品没有候选');
      const econOk = status.includes('利润计算complete');
      const fundOk = /预算比较(within_budget|over_budget)/.test(status);
      const post = figures.find((figure) => figure.id === 'F_post');
      const negative = econOk && post && post.display.startsWith('-');
      const groups = { demand: [], competition: [], profit: [], risk: [], fit: [] };
      for (const figure of figures) {
        if (figure.nature === 'unknown') continue;
        const key = figure.id.startsWith('F_sales') ? 'demand' : ['F_purchase', 'F_gap'].includes(figure.id) ? 'fit' : 'profit';
        groups[key].push({ figure_id: figure.id, how_to_read: '这个数来自估算或假设，先确认口径再使用。', verify: '回到来源核对统计窗口和成本是否完整。' });
      }
      const dim = (key, insufficient, signal = 'neutral') => ({
        key, signal: insufficient ? 'insufficient' : signal, judgment: insufficient ? '目前没有足够证据下判断。' : '证据支持做进一步验证。',
        basis: insufficient ? [] : [{ text: '依据已导入的证据和成本输入。', nature: 'estimate', evidence_ids: [key === 'demand' ? (figures.find((f) => f.id.startsWith('F_sales'))?.refs?.[0] ?? 'calc') : 'calc'] }],
        gap: insufficient ? '缺少相关证据，需要补充后再判断。' : undefined, annotations: groups[key]
      });
      const updating = prompt.includes('这是对已有结论的更新');
      return {
        dimensions: [dim('demand', noSales), dim('competition', noComp), dim('profit', !econOk, negative ? 'negative' : 'positive'), dim('risk', true), dim('fit', !fundOk)],
        verdict: { bucket: !econOk ? 'need_more' : negative ? 'not_recommended' : 'worth_verifying', reason: !econOk ? '成本不完整，先补资料再判断。' : negative ? '当前假设下广告后每件亏损。' : '当前假设下广告后仍为正，值得继续验证。' },
        assumptions: [{ text: '转化率是用户假设的值。', nature: 'assumption', verify: '用同类商品的广告报告校准。' }],
        next_steps: [{ task: '核对销量口径', why: '口径决定数字能否使用。', where: '数据来源的字段说明。' }],
        glossary: [{ key: 'asin', explanation: 'Amazon 目录中用于区分商品或规格的编号。' }],
        change_note: updating ? '转化率假设变化导致广告获客成本改变，利润结论随之变化。' : undefined
      };
    }
    if (task === 'comparison') {
      const figures = grab(prompt, '主要数字：') ?? [];
      return { difference: '你的判断和证据显示的结果不完全相同，差别出在广告后的利润。', driven_by: figures.length ? [{ figure_id: figures[0].id, note: '这个数字决定了结论。' }] : [] };
    }
    if (task === 'practice') {
      return { question: '同一父体在同一窗口出现两行相同销量，应该怎么处理？', options: [{ id: 'a', text: '直接相加', why: '会把整款销量放大。' }, { id: 'b', text: '确认同父体同窗口后只算一次', why: '这样才符合口径。' }, { id: 'c', text: '按零处理', why: '空值不等于零。' }], correct: 'b', hint: '先看两行的父体编号和统计窗口。', difficulty: 'default' };
    }
    if (task === 'feedback') return { feedback: '程序已经判定了对错，请对照选项说明再看一遍这个口径。', method_reminder: '同父体同窗口只算一次。' };
    if (task === 'transfer') {
      const answer = grab(prompt, '用户回答：') ?? {};
      const quote = (text) => String(text ?? '').slice(0, 6);
      return {
        items: [
          { dimension: 'evidence', score: 2, quote: quote(answer.evidence), reason: '选择了带口径的历史证据。' },
          { dimension: 'scope', score: 2, quote: quote(answer.scope), reason: '指出了同窗口不能相加。' },
          { dimension: 'uncertainty', score: 2, quote: quote(answer.uncertainty), reason: '指出了具体未计入项和核实位置。' }
        ],
        next_practice: '下次试着先列出所有成本项再算。'
      };
    }
    if (task === 'learning') return { corrected: [], unverified: ['未完成的练习没有验证。'], methods: ['核对口径', '计算广告后贡献'], checklist: ['核对来源', '核对窗口', '列全成本'] };
    if (task === 'coach') return { answer: '这段证据能说明当前观察到的内容；不能据此推断未来销量。' };
    throw new Error(`fake llm: unknown task for prompt: ${prompt.slice(0, 60)}`);
  }

  const preCalls = {
    identify: ['list_evidence'], demand: ['inspect_sales', 'list_evidence'], competition: ['compare_products', 'list_evidence'],
    profit: ['get_cost_inputs', 'compute_unit_economics', 'compute_unit_economics', 'check_budget'], risk: [], summary: []
  };

  return {
    configured: options.configured ?? true,
    provider: 'fake',
    model: 'fake-model',
    captured,
    toolResults: toolResultsSeen,
    open: () => open?.(),
    async chat({ messages, tools }) {
      if (gate) await gate;
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const prompt = typeof messages[0].content === 'string' ? messages[0].content : '';
      captured.push(prompt);
      for (const message of messages) if (message.role === 'user' && Array.isArray(message.content)) for (const block of message.content) if (block.type === 'tool_result') toolResultsSeen.push(block.content);
      const task = taskOf(prompt);
      if (options.failStep && task === options.failStep) throw new LlmError(options.failCategory ?? 'upstream', '模拟的模型服务失败');
      if (options.badOutputStep && task === options.badOutputStep) return { text: '{}', toolCalls: [], usage: { input: 100, output: 10 }, ms: 1 };
      const available = new Set(tools.map((tool) => tool.name));
      if (messages.length === 1 && preCalls[task]?.length) {
        let n = 0;
        const calls = preCalls[task].filter((name) => available.has(name)).map((name) => {
          const input = name === 'compute_unit_economics' ? (n++ === 0 ? {} : { cvr: 0.05 }) : {};
          return { id: `call_${name}_${n}_${Math.random().toString(16).slice(2, 8)}`, name, input };
        });
        return { text: '', toolCalls: calls, usage: { input: 100, output: 20 }, ms: 1 };
      }
      return { text: '', toolCalls: [{ id: `submit_${Math.random().toString(16).slice(2, 8)}`, name: 'submit_result', input: submitFor(task, prompt, messages) }], usage: { input: 120, output: 60 }, ms: 1 };
    }
  };
}
