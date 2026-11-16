import { esc, natureTag, statusTag, ids, fmtTime } from './common.js';
import { demandChart, profitChart } from './charts.js';

const TOOL_DONE = { identify: '商品识别', demand: '需求证据', competition: '竞品比较', profit: '利润与资金', risk: '风险核验', summary: '教学总结' };

function foundList(card) {
  if (card.found?.length) return `<ul class="found">${card.found.map((item) => `<li>${natureTag(item.nature)}<span>${esc(item.text)}</span>${ids(item.evidence_ids)}</li>`).join('')}</ul>`;
  return '';
}

function gap(card, step) {
  if (card.gap) return `<div class="callout">${statusTag(step.status === 'unverified' ? 'unverified' : 'insufficient')} ${esc(card.gap)}</div>`;
  return '';
}

function lessonBlock(view, card, step) {
  const lesson = card?.lesson;
  if (!lesson) return '';
  const template = view.teaching.templates[lesson.node];
  const reason = view.teaching.reasons[lesson.node];
  const generic = view.teaching.lessons[lesson.node]?.templateOnly;
  return `<div class="lesson-inline"><div class="lesson-head"><span class="eyebrow">教学节点 ${esc(lesson.node)} · ${esc(template?.title ?? '')}</span>${lesson.depth === 'short' ? '<span class="tag blue">已缩短：你的初判里已有这层理解</span>' : ''}${generic ? '<span class="tag orange">通用讲解，个性化内容未生成</span>' : ''}</div>
    ${reason ? `<p class="why-node"><b>为什么讲这个：</b>${esc(reason)}</p>` : ''}
    <div class="lesson-grid"><div><b>用这个商品的数据看</b><p>${esc(lesson.evidence_card)}</p></div><div><b>方法</b><p>${esc(lesson.method)}</p></div></div>
    <p class="rule"><b>可迁移规则：</b>${esc(template?.rule ?? '')}</p></div>`;
}

function extraBlocks(view, card, step) {
  const parts = [];
  if (step.id === 'identify' && view.identity.assessment) {
    const resolved = view.identity.chosen;
    parts.push(`<div class="callout blue"><b>这是整个分析里唯一需要你确认的地方</b>：输入的名称可能对应多个商品，选一个继续。</div><div class="candidate-list">${view.identity.assessment.candidates.map((c) => `<button class="candidate" data-action="resolve" data-asin="${esc(c.asin)}" ${resolved || view.running ? 'disabled' : ''}><b>${esc(c.title)}</b><small>${esc(c.asin)} · ${esc(c.reason)}</small></button>`).join('')}</div>`);
  }
  if (step.id === 'demand') {
    parts.push(demandChart(view.viz.demand));
    if (view.teaching.deferred.length) parts.push(`<div class="callout blue"><b>另一项问题，已列入报告：</b>${esc(view.teaching.deferred.map((d) => d.text).join('；'))}</div>`);
  }
  if (step.id === 'profit') parts.push(profitChart(view.viz.profit));
  if (step.id === 'competition' && card.comparison_rows?.length) {
    const rows = card.comparison_rows.map((row) => {
      const record = view.evidence.find((item) => item.id === row.evidence_id);
      const role = { comparable: ['可比', 'green'], uncertain: ['待核对', 'orange'], not_comparable: ['不可比', 'red'] }[row.role];
      return `<tr><td>${esc(row.evidence_id)}</td><td>${esc(record?.title ?? '—')}</td><td>${record?.price === null || record?.price === undefined ? '未提供' : `${esc(record.price)} ${esc(record.currency ?? '')}`}</td><td>${record?.estimated_monthly_sales ?? '未提供'}</td><td><span class="tag ${role[1]}">${role[0]}</span></td><td class="wrap">${esc(row.reason)}</td></tr>`;
    }).join('');
    parts.push(`<div class="table-wrap"><table><thead><tr><th>证据</th><th>商品</th><th>价格</th><th>月销估算</th><th>可比性</th><th>判断</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  if (step.id === 'risk' && card.checks?.length) {
    parts.push(`<div class="callout ${view.preloadedDemo ? 'blue' : ''}"><b>${view.preloadedDemo ? '模拟核验流程已完整展示。' : '待核实清单，不是合规结论。'}</b>${view.preloadedDemo ? '以下材料与结果均为虚构演示，不代表真实商品获得认证、授权或通过官方核验。' : view.businessEvidence?.official?.length ? '已取得部分官方记录；目标型号、批次、授权与适用政策仍须逐项核对。' : '本次没有核对任何官方来源。'}</div><ul class="checks">${card.checks.map((c) => `<li><b>${esc(c.item)}</b><span>${esc(c.why)}</span><small>去哪里查：${esc(c.where)}</small></li>`).join('')}</ul>`);
  }
  if (step.id === 'summary' && card.takeaways?.length) {
    parts.push(`<div class="lesson-grid"><div><b>本次的方法要点</b><ul>${card.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div><div><b>下次自己选品的检查清单</b><ul>${card.checklist.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`);
  }
  return parts.join('');
}

function cardBody(view, step, focused = false) {
  const card = step.card;
  if (!card) return '';
  const scope = card.scope ?? {
    identify: { can_show: '候选商品与本次输入的匹配关系。', cannot_show: '不能代替实物规格、包装数量、型号和批次核对。' },
    demand: { can_show: '本次来源实际返回的搜索、趋势或销量估算信号。', cannot_show: '估算和单次快照不能证明真实订单或未来需求。' },
    competition: { can_show: '本次采集候选商品之间可观察到的差异。', cannot_show: '样本不代表整个市场，也不代表新卖家的起点。' },
    profit: { can_show: '按本次已提供成本和明确假设计算出的情景。', cannot_show: '缺失成本不按零处理，结果不是完整企业净利润。' },
    risk: { can_show: '本次检索到的官方记录和待核实事项。', cannot_show: '未命中或通用指引不能证明商品没有风险或已经合规。' },
    summary: { can_show: '当前证据支持的市场初筛结论及待验证部分。', cannot_show: '初筛不能代替个人利润、预算、授权或合规放行。' }
  }[step.id];
  if (focused) return `<section class="step-findings"><h3>这一步查到了什么</h3>${foundList(card) || '<p class="muted">没有可用的数据。</p>'}${gap(card, step)}</section>${extraBlocks(view, card, step)}
    <div class="step-reading"><h3>如何理解这个结果</h3><p>${esc(card.how_to_read)}</p></div>
    <details class="step-method" data-disclosure-key="method-${step.id}"><summary>分析方法与教学说明<span>为什么查、常见误读与适用边界</span></summary><div class="step-method-body"><div class="card-grid"><section><h4>为什么查</h4><p>${esc(card.why)}</p></section><section><h4>常见误读</h4><p>${esc(card.misread?.mistake)}</p><p class="verify">去哪里核实：${esc(card.misread?.verify)}</p></section></div><div class="scope-grid"><section><b>本次能说明</b><p>${esc(scope.can_show)}</p></section><section><b>本次不能说明</b><p>${esc(scope.cannot_show)}</p></section></div>${lessonBlock(view, card, step)}${card.generic ? '<p class="muted">本步骤显示的是通用方法说明。</p>' : ''}</div></details>`;
  return `<div class="card-grid">
    <section><h4>为什么查</h4><p>${esc(card.why)}</p></section>
    <section><h4>查到了什么</h4>${foundList(card) || '<p class="muted">没有可用的数据。</p>'}${gap(card, step)}</section>
    <section><h4>这个数怎么读</h4><p>${esc(card.how_to_read)}</p></section>
    <section><h4>常见误读</h4><p>${esc(card.misread.mistake)}</p><p class="verify">去哪里核实：${esc(card.misread.verify)}</p></section>
  </div><div class="scope-grid"><section><b>本次能说明</b><p>${esc(scope.can_show)}</p></section><section><b>本次不能说明</b><p>${esc(scope.cannot_show)}</p></section></div>${extraBlocks(view, card, step)}${lessonBlock(view, card, step)}${card.generic ? '<p class="muted">本步骤的个性化内容没有通过校验，这里显示的是通用方法说明。</p>' : ''}`;
}

function summaryLine(step) {
  if (step.status === 'failed') return step.error?.message ?? '失败';
  if (!step.card) return '';
  return step.card.found?.[0]?.text ?? step.card.gap ?? step.card.why;
}

export function renderTimeline(view, openIds, onlyId = null) {
  const live = view.steps.find((step) => step.status === 'running');
  return view.steps.map((step, index) => {
    if (onlyId && step.id !== onlyId) return '';
    const running = step.status === 'running';
    const focused = Boolean(onlyId);
    const open = focused || openIds.has(step.id) || running || (!live && step.status === 'failed');
    const failed = step.status === 'failed';
    return `<article class="step-card ${step.status}" data-step="${step.id}">
      <header class="step-head" ${focused ? '' : `data-toggle="${step.id}" role="button" tabindex="0" aria-expanded="${open}"`}>
        <span class="step-no">${index + 1}</span>
        <div class="step-title"><b>${TOOL_DONE[step.id]}</b>${!open && step.card ? `<small>${esc(summaryLine(step))}</small>` : ''}${running ? `<small>${esc(step.activity ?? '进行中')}…</small>` : ''}</div>
        ${statusTag(step.status)}${step.templateOnly ? '<span class="tag orange">通用讲解</span>' : ''}
        <span class="step-time">${step.endedAt ? fmtTime(step.endedAt).slice(-8) : ''}</span>
      </header>
      ${open ? `<div class="step-body">${failed ? `<div class="callout">${esc(step.error?.message ?? '失败')}</div><div class="btn-row"><button class="btn primary" data-action="retry" ${view.running ? 'disabled' : ''}>重试</button></div>` : ''}${running && !step.card ? `<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div><p class="muted">${esc(step.activity ?? '进行中')}…（等待真实的数据读取与模型返回，不显示示意进度）</p>` : ''}${!step.card && !running && !failed ? `<div class="step-pending"><h3>${step.status === 'blocked' ? '等待确认商品' : '这一步尚未生成结果'}</h3><p>${step.status === 'blocked' ? '确认上方候选商品后，分析会继续。' : '分析进行到这里时，会展示查到的依据与结果。'}</p></div>` : ''}${cardBody(view, step, focused)}</div>` : ''}
    </article>`;
  }).join('');
}
