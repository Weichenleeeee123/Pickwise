import { renderDimensionSources } from './evidence-detail.js';
import { esc, natureTag, signalTag, statusTag, CHOICE, fmtTime, ids, reportTerms, termText } from './common.js';
import { renderLaunchInputs, LAUNCH_INPUTS } from './business.js';
import { TEACHING_TERM_BY_KEY, TEACHING_TERMS } from '../terms.js';

const COST_FIELDS = [
  ['price', '预期售价', 'USD'], ['goodsCost', '单件采购成本', null], ['logisticsCost', '运输与履约', 'USD'], ['platformCost', '平台费用', 'USD'],
  ['returnsCost', '退货预留', 'USD'], ['otherCost', '其他变动成本', 'USD'], ['cpc', 'CPC 广告点击成本', 'USD'], ['cvr', 'CVR 广告转化率', '%']
];

export function renderComparison(view) {
  const judgment = view.judgment;
  const analysis = view.analysis;
  if (!analysis) return '';
  if (!judgment) return '';
  if (!judgment.eligible) {
    return `<section class="panel"><div class="panel-head"><div><div class="panel-title">初判对照</div><div class="panel-hint">你的初判（${CHOICE[judgment.choice]}）是在结果展示后才保存的，不用于对照，只记录在学习记录里。</div></div></div></section>`;
  }
  const c = view.comparison;
  const bucket = analysis.result.verdict.title ?? view.buckets[analysis.result.verdict.bucket];
  const body = !c ? '<p class="muted">对照生成中…</p>' : c.failed
    ? '<div class="callout">对照文字没有通过校验，已保留你的初判与证据结论，可点“重新分析”再试。</div>'
    : `<p class="diff">${esc(c.difference)}</p>${(c.driven_by ?? []).map((item) => { const figure = analysis.figures.find((f) => f.id === item.figure_id); return `<p class="driver"><b>${esc(figure?.label ?? item.figure_id)} ${esc(figure?.display ?? '')}</b>：${esc(item.note)}</p>`; }).join('')}`;
  return `<section class="panel comparison"><div class="panel-head"><div><div class="panel-title">初判对照</div><div class="panel-hint">并列显示你的判断与证据显示的结果，以及差异出在哪</div></div></div><div class="panel-body"><div class="versus"><div><span class="eyebrow">你的初判</span><strong>${CHOICE[judgment.choice]}</strong><p>${esc(judgment.reason || '（没有写理由）')}</p></div><div><span class="eyebrow">证据显示</span><strong>${esc(bucket)}</strong><p>${esc(analysis.result.verdict.reason)}</p></div></div>${body}${c && c.analysisVersion !== analysis.version ? `<p class="muted">该对照基于分析版本 ${c.analysisVersion}。</p>` : ''}</div></section>`;
}

function annotationBlock(view, dimension, glossary) {
  const notes = dimension.annotations ?? [];
  if (!notes.length) return '';
  return `<div class="notes">${notes.map((note) => {
    const figure = view.analysis.figures.find((item) => item.id === note.figure_id);
    if (!figure) return '';
    return `<div class="note"><div class="note-fig"><span class="note-label">${esc(figure.label)}</span><strong>${esc(figure.display)}</strong>${natureTag(figure.nature)}${figure.meta ? `<small>${esc(figure.meta)}</small>` : ''}</div><div class="note-read"><b>怎么读</b><p>${termText(note.how_to_read, glossary)}</p><small>下次去哪里核实：${termText(note.verify, glossary)}</small></div></div>`;
  }).join('')}</div>`;
}

function glossaryBlock(glossary) {
  const used = new Set(glossary.map((item) => item.key));
  const generated = glossary.map((item) => {
    const label = TEACHING_TERM_BY_KEY[item.key]?.label;
    return label ? `<li><details class="term-help"><summary title="${esc(item.explanation)}">${esc(label)}</summary><span>${esc(item.explanation)}</span></details></li>` : '';
  }).join('');
  const more = TEACHING_TERMS.filter((term) => !used.has(term.key)).map((term) => `<li><details class="term-help"><summary title="${esc(term.definition)}">${esc(term.label)}</summary><span>${esc(term.definition)}</span></details></li>`).join('');
  return `<div class="glossary-groups"><details class="glossary"><summary>本次报告术语</summary><ul>${generated || '<li class="muted">本次分析没有使用需要单独解释的术语。</li>'}</ul></details><details class="glossary"><summary>更多常见术语</summary><ul>${more}</ul></details></div>`;
}

function reportMetrics(report) {
  if (!report?.metrics?.length) return '';
  return '<section class="panel report-economics" aria-label="报告成本与资金"><div class="panel-head"><div><h2 class="panel-title">成本与资金，一眼看清</h2><p class="panel-hint">正式测算与货源初筛分别标明；缺项保留未知。</p></div></div><div class="panel-body"><div class="report-metric-grid">' + report.metrics.map(m => '<article class="report-metric"><span>' + esc(m.label) + '</span><strong>' + esc(m.value) + '</strong>' + natureTag(m.nature) + '<p>' + esc(m.note) + '</p>' + ids(m.evidence_ids ?? []) + '</article>').join('') + '</div><details class="report-coverage" data-disclosure-key="report-coverage"><summary>查看已取得的证据与范围</summary><ul>' + (report.coverage ?? []).map(c => '<li><b>' + esc(c.label) + '</b><span>' + (c.available ? '已取得' : '待补充') + '</span>' + ids(c.evidence_ids ?? []) + '</li>').join('') + '</ul></details></div></section>';
}

export function renderReportOverview(view) {
  if (!view.analysis) return '';
  const { analysis } = view;
  const result = analysis.result;
  const glossary = reportTerms(result, analysis.figures);
  const gaps = result.dimensions.filter(d => d.gap || d.signal === 'insufficient').length;
  return `${analysis.stale ? '<div class="callout report-stale" role="status">成本或证据已变化，以下报告对应旧版本。请在重新分析完成后查看更新结论。</div>' : ''}<section class="report-overview" id="report-overview" aria-labelledby="report-verdict"><div class="report-overview-main"><span class="eyebrow">01 / 先看结论</span><h2 id="report-verdict">${esc(result.verdict.title ?? view.buckets[result.verdict.bucket] ?? '等待判断')}</h2><p>${termText(result.verdict.reason, glossary)}</p><div class="report-version">版本 ${esc(analysis.version)} · ${esc(fmtTime(analysis.createdAt))}${analysis.stale ? ' · 文字结论待更新' : ''}</div></div><dl class="report-overview-facts"><div><dt>本次证据</dt><dd>${view.evidence.length}<small>条记录</small></dd></div><div><dt>${view.preloadedDemo ? '证据覆盖' : '仍有缺口'}</dt><dd>${view.preloadedDemo ? result.dimensions.length - gaps : gaps}<small>${view.preloadedDemo ? '个维度齐备' : '个维度'}</small></dd></div><div><dt>下一步</dt><dd>${result.next_steps.length}<small>${view.preloadedDemo || result.report ? "项执行" : "项验证"}</small></dd></div></dl></section>${reportMetrics(result.report)}`;
}

export function renderDimensions(view) {
  const analysis = view.analysis;
  if (!analysis) return '';
  const result = analysis.result;
  const glossary = reportTerms(result, analysis.figures);
  const unannotated = analysis.figures.filter((figure) => figure.nature === 'unknown');
  return `<section class="panel report-dimensions" id="report-dimensions" aria-labelledby="report-dimensions-title"><div class="panel-head"><div><span class="eyebrow">02 / 再看依据</span><h2 class="panel-title" id="report-dimensions-title">五个维度，逐项判断</h2><div class="panel-hint">先读判断；展开后查看引用证据、数字口径与教学解释。</div></div></div>
    <div class="panel-body">${analysis.stale ? '<div class="callout">成本或证据已变化，下面的文字对应旧版本。重新分析完成前不要把新数字和旧结论放在一起读。</div>' : ''}
    <div class="dimension-list">${view.dimensions.map((def) => {
      const d = result.dimensions.find((item) => item.key === def.key);
      if (!d) return '';
      return `<article class="dimension" id="report-dimension-${esc(def.key)}"><div class="dimension-heading"><h3 class="dimension-name">${esc(def.name)}</h3>${signalTag(d.signal)}</div><p class="dimension-question">${esc(def.ask)}</p><p class="judgment">${termText(d.judgment, glossary)}</p>${(d.interpretation ?? []).length ? `<div class="dimension-reading">${d.interpretation.map(p => `<p>${termText(p, glossary)}</p>`).join('')}</div>` : ''}${d.gap ? `<div class="dimension-gap"><b>待补充</b><span>${termText(d.gap, glossary)}</span></div>` : ''}<details class="dimension-details" data-disclosure-key="dimension-${esc(def.key)}"><summary>查看原始数据与判断依据<span>${(d.source_records ?? []).length} 条原始记录 · ${(d.basis ?? []).length} 条依据</span></summary><div>${(d.basis ?? []).length ? `<ul class="found">${d.basis.map((b) => `<li>${natureTag(b.nature)}<span>${termText(b.text, glossary)}</span>${ids(b.evidence_ids)}</li>`).join('')}</ul>` : '<p class="muted">该维度暂无引用依据，不能据此补出判断。</p>'}${annotationBlock(view, d, glossary)}${renderDimensionSources(view, d)}</div></details></article>`;
    }).join('')}</div>
    ${unannotated.length ? `<p class="muted">未提供的数字：${unannotated.map((f) => `${esc(f.label)}（${esc(f.meta ?? '缺少输入')}）`).join('；')}。它们显示为“未提供”，没有按零处理。</p>` : ''}
    ${glossaryBlock(glossary)}</div></section>`;
}

export { renderCoach, performCoachAction } from './coach.js';

export function renderNextSteps(view) {
  const analysis = view.analysis;
  if (!analysis) return '';
  const result = analysis.result;
  const glossary = reportTerms(result, analysis.figures);
  return `<section class="panel report-actions" id="report-actions" aria-labelledby="report-actions-title"><div class="panel-head"><div><span class="eyebrow">03 / 接下来怎么做</span><h2 class="panel-title" id="report-actions-title">${view.preloadedDemo || result.report ? "执行计划" : "下一步验证"}</h2><div class="panel-hint">${view.preloadedDemo || result.report ? "按当前建议推进；标为下单前的事项须先核验。" : "把判断中的缺口，转成可以执行的查证任务。"}</div></div></div><div class="panel-body"><ol class="report-action-list">${result.next_steps.map((s, i) => `<li><span class="action-number">${String(i + 1).padStart(2, '0')}</span><div><h3>${termText(s.task, glossary)}${s.gate === 'before_order' ? ' <span class="tag orange">下单前</span>' : ''}</h3><p>${termText(s.why, glossary)}</p><small>去哪里查：${termText(s.where, glossary)}</small>${ids(s.evidence_ids ?? [])}</div></li>`).join('') || '<li><p class="muted">本次没有生成验证任务。</p></li>'}</ol><details class="report-assumptions" data-disclosure-key="assumptions"><summary>结论依赖的关键假设<span>${(result.assumptions ?? []).length} 项</span></summary>${(result.assumptions ?? []).length ? `<ul class="found">${result.assumptions.map(a => `<li>${natureTag(a.nature)}<span>${termText(a.text, glossary)}<small>核实：${termText(a.verify, glossary)}</small></span></li>`).join('')}</ul>` : '<p class="muted">没有列出关键假设。</p>'}</details></div></section>`;
}

export function renderAdjust(view, { goodsCostCurrency = view.constraints.goodsCostCurrency } = {}) {
  const c = { ...view.constraints, goodsCostCurrency };
  const econ = view.econ;
  const busy = view.running || view.reanalysis.status === 'running';
  const field = ([key, label, unit]) => {
    const value = c.values[key];
    const shown = value === null || value === undefined ? '' : key === 'cvr' ? +(value * 100).toFixed(4) : value;
    const placeholder = key === 'price' && c.marketPrice ? `市场观察 $${c.marketPrice.value}，请填写你的目标售价` : '未提供';
    const cur = key === 'goodsCost' ? c.goodsCostCurrency : unit;
    return `<div class="field"><label for="c-${key}">${label}</label><div class="number-with-unit"><input class="input" id="c-${key}" data-c="${key}" type="number" min="0" step="${key === 'cvr' ? '0.1' : '0.01'}" value="${shown}" placeholder="${esc(placeholder)}" /><span>${esc(cur ?? '')}</span></div></div>`;
  };
  const result = econ.status === 'complete'
    ? `<div class="metric-grid"><div class="metric"><div class="metric-label">广告前单件贡献</div><div class="metric-value">$${econ.preAdContribution}</div></div><div class="metric"><div class="metric-label">广告获客成本</div><div class="metric-value">$${econ.acquisitionCost}</div></div><div class="metric"><div class="metric-label">广告后单件贡献</div><div class="metric-value ${econ.postAdContribution >= 0 ? 'positive' : 'negative'}">$${econ.postAdContribution}</div></div><div class="metric"><div class="metric-label">保本转化率</div><div class="metric-value">${econ.breakEvenCvr === null ? '无正贡献' : `${(econ.breakEvenCvr * 100).toFixed(2)}%`}</div></div></div>${econ.preAdNotPositive ? '<div class="callout">广告前贡献不为正，因此不生成保本转化率。</div>' : ''}${econ.breakEvenUnreachable ? '<div class="callout">保本转化率高于 100%，当前假设组合不可实现。</div>' : ''}`
    : `<div class="callout">${statusTag('insufficient')} ${esc(econ.status === 'invalid' ? econ.error : econ.status === 'fx_required' ? econ.message : `缺少 ${econ.missingLabels.join('、')}，不能计算广告后贡献。缺失的成本保持“未知”，没有按零处理。`)}</div>`;
  const funding = view.funding;
  const fundingLabels = Object.fromEntries([...LAUNCH_INPUTS.map(([key, label]) => [key, label]), ['budget', '可用预算'], ['moq', '起订量'], ['goodsCost', '单件采购成本']]);
  const fundingText = ['within_budget', 'over_budget'].includes(funding.status)
    ? `起订采购 $${funding.purchaseAmount}，完整启动现金需求 $${funding.totalRequired}，${funding.budgetGap > 0 ? `超出预算 $${funding.budgetGap}` : `启动后剩余 $${Math.abs(funding.budgetGap)}`}。现金周期假设 ${funding.cashCycleDays ?? '未知'} 天。`
    : funding.status === 'invalid' ? esc(funding.error) : `启动现金尚缺：${esc((funding.missing ?? []).map(key => fundingLabels[key] ?? key).join('、'))}。仅采购金额 ${funding.purchaseAmount ?? '未知'}，不能据此判定总预算够用。`;
  const history = view.analysisVersions.length > 1 ? `<div class="versions"><h4>版本记录</h4>${view.analysisVersions.map((v) => `<div class="version"><b>版本 ${v.version}</b><span>${esc(fmtTime(v.createdAt))}</span><span>${esc(view.buckets[v.bucket])}</span><span>广告后 ${esc(v.post ?? '—')}</span>${v.changeNote ? `<small>${esc(v.changeNote)}</small>` : ''}</div>`).join('')}</div>` : '';
  return `<section class="panel" id="adjust"><div class="panel-head"><div><div class="panel-title">Agent 自动利润与资金初筛</div><div class="panel-hint">先用采集到的商品、费用与货源估算；你的经营条件有资料时再补充，不影响完成选品分析。</div></div>${view.reanalysis.status === 'running' ? '<span class="tag blue">重新分析中</span>' : ''}</div><div class="panel-body">
    ${result}<p class="hint">${fundingText}</p>${c.marketPrice ? `<p class="hint">市场观察价 $${esc(c.marketPrice.value)} · ${esc(c.marketPrice.evidenceId)} · ${esc(fmtTime(c.marketPrice.observedAt))}；系统另以竞品价格带作情景价，不当作你的最终售价。</p>` : ''}
    <details class="optional-business-inputs"><summary>可选：补充你自己的售价、预算、报价和广告报表，提高估算精度</summary><p class="hint">不提供也可看市场趋势和货源估算。只有采购报价、现金预算、实际广告表现等个人经营数据无法从公开商品页取得。</p>
    <div class="field-grid">${COST_FIELDS.map(field).join('')}
      <div class="field"><label for="c-budget">可用预算</label><div class="number-with-unit"><input class="input" id="c-budget" data-c="budget" type="number" min="0" step="1" value="${c.budget ?? ''}" placeholder="未提供" /><span>USD</span></div></div>
      <div class="field"><label for="c-moq">起订量</label><div class="number-with-unit"><input class="input" id="c-moq" data-c="moq" type="number" min="0" step="1" value="${c.moq ?? ''}" placeholder="未提供" /><span>件</span></div></div>
      <div class="field"><label for="c-cur">采购价币种</label><select id="c-cur" data-c="goodsCostCurrency"><option value="USD" ${c.goodsCostCurrency === 'USD' ? 'selected' : ''}>USD</option><option value="CNY" ${c.goodsCostCurrency === 'CNY' ? 'selected' : ''}>CNY</option><option value="EUR" ${c.goodsCostCurrency === 'EUR' ? 'selected' : ''}>EUR</option></select></div>
    </div>
    ${c.goodsCostCurrency !== 'USD' ? `<div class="field-grid fx"><div class="field"><label for="fx-rate">汇率（1 ${esc(c.goodsCostCurrency)} = ? USD）</label><input class="input" id="fx-rate" data-fx="rate" type="number" min="0" step="0.0001" value="${c.fx?.rate ?? ''}" /></div><div class="field"><label for="fx-source">汇率来源</label><input class="input" id="fx-source" data-fx="source" value="${esc(c.fx?.source ?? '')}" /></div><div class="field"><label for="fx-date">汇率日期</label><input class="input" id="fx-date" data-fx="date" type="date" value="${esc(c.fx?.date ?? '')}" /></div></div><p class="hint">未提供带来源与日期的汇率时，不会把 ${esc(c.goodsCostCurrency)} 与美元售价直接相减。</p>` : ''}
    ${c.fxNote ? `<p class="hint">${esc(c.fxNote)}</p>` : ''}
    ${renderLaunchInputs(view)}<div class="btn-row"><button class="btn primary" data-action="save-constraints" ${busy ? 'disabled' : ''}>保存并重新计算</button><span class="hint">空白表示未知；确实不发生的成本需要你明确填 0。</span></div>
    </details>${history}</div></section>`;
}

function practiceCard(view, nodeId) {
  const lesson = view.teaching.lessons[nodeId];
  const record = view.practice[nodeId];
  const template = view.teaching.templates[nodeId];
  const head = `<div class="lesson-head"><span class="eyebrow">节点 ${nodeId} · ${esc(template.title)}</span>${record?.status === 'done' ? `<span class="tag ${record.answer.correct ? 'green' : 'orange'}">${record.answer.correct ? '答对' : '答错'}${record.hints ? ` · 提示 ${record.hints} 次` : ' · 独立作答'}</span>` : record?.status === 'skipped' ? '<span class="tag gray">已跳过 · 未验证</span>' : '<span class="tag gray">可选</span>'}</div>`;
  if (!record || record.status === 'pending' || (record.status === 'unavailable' && !record.question)) {
    return `<div class="practice">${head}<p class="muted">${esc(template.goal)}</p>${record?.error ? `<div class="callout">${esc(record.error.message)}</div>` : ''}<div class="btn-row"><button class="btn primary" data-action="practice-start" data-node="${nodeId}">做一道题</button><button class="btn ghost" data-action="practice-skip" data-node="${nodeId}">跳过</button><button class="btn ghost" data-action="practice-explain" data-node="${nodeId}">先看解释</button></div>${lesson ? `<details class="explain" data-explain="${nodeId}"><summary>讲解回顾</summary><p>${esc(lesson.evidence_card)}</p><p>${esc(lesson.method)}</p></details>` : ''}</div>`;
  }
  if (record.status === 'skipped') return `<div class="practice">${head}<p class="muted">已跳过，这个节点标记为“未验证”，不会显示为已掌握。</p><button class="btn" data-action="practice-start" data-node="${nodeId}">还是做一下</button></div>`;
  const q = record.question;
  const done = record.status === 'done';
  const options = q.options.map((o) => {
    const mark = done ? (o.id === q.correct ? 'correct' : o.id === record.answer.choice ? 'wrong' : '') : '';
    return `<label class="choice ${mark}"><input type="radio" name="p-${nodeId}" value="${o.id}" ${done ? 'disabled' : ''} ${record.answer?.choice === o.id ? 'checked' : ''}/><span>${esc(o.text)}${done ? `<small>${o.id === q.correct ? '正确选项' : o.id === record.answer.choice ? '你的选择' : ''}${mark ? ' · ' : ''}${esc(o.why)}</small>` : ''}</span></label>`;
  }).join('');
  return `<div class="practice">${head}${record.stale ? '<div class="callout">成本已变化，这道题基于旧数字。</div>' : ''}<h4>${esc(q.question)}</h4><div class="radio-list">${options}</div>
    ${done ? `<div class="outcome"><span class="outcome-mark">${record.answer.correct ? '✓' : 'i'}</span><div><strong>${record.answer.correct ? '判断正确' : '参考方法'}</strong><p>${esc(record.feedback?.feedback ?? '')}</p>${record.feedback?.refers_to_judgment ? `<p><b>回到你的初判：</b>${esc(record.feedback.refers_to_judgment)}</p>` : ''}<p><b>可迁移规则：</b>${esc(record.feedback?.method_reminder ?? '')}</p>${record.feedback?.fallback ? '<small>个性化反馈未通过校验，显示的是选项说明。</small>' : ''}</div></div>`
      : `<div class="btn-row"><button class="btn primary" data-action="practice-answer" data-node="${nodeId}">提交答案</button><button class="btn" data-action="practice-hint" data-node="${nodeId}">给我一个提示</button><button class="btn ghost" data-action="practice-skip" data-node="${nodeId}">跳过</button></div>${record.hintShown ? `<p class="hint">提示：${esc(q.hint)}（已使用 ${record.hints} 次）</p>` : ''}`}</div>`;
}

export function renderPractice(view) {
  if (!view.analysis) return '';
  const nodes = view.teaching.nodes;
  if (!nodes.length) return '';
  return `<section class="panel"><div class="panel-head"><div><div class="panel-title">教学练习</div><div class="panel-hint">两个教学节点各一道题，用当前商品的数据。可以提示、跳过；跳过不影响查看全部成果。</div></div></div><div class="panel-body grid two">${nodes.map((id) => practiceCard(view, id)).join('')}</div></section>`;
}

export function renderTransfer(view) {
  if (!view.analysis) return '';
  const t = view.transfer;
  const head = (tag) => `<div class="panel-head"><div><div class="panel-title">迁移练习</div><div class="panel-hint">换一个商品，检验同样的方法能不能用起来 · 教学模拟案例</div></div>${tag}</div>`;
  if (!t) return `<section class="panel">${head('<span class="tag orange">教学模拟</span>')}<div class="panel-body"><p class="muted">用一组独立的数据，先写下你的判断和依据，再看反馈。不做也不影响查看成果，但学习状态会记为“未验证”。</p><div class="btn-row"><button class="btn primary" data-action="transfer-start">开始迁移练习</button><button class="btn ghost" data-action="transfer-skip">跳过</button></div></div></section>`;
  const c = t.case;
  const sims = c.evidence.map((e) => `<tr><td>${esc(e.asin)}</td><td>${esc(e.parent_asin ?? '—')}</td><td>${esc(e.title)}</td><td>${e.price}</td><td>${e.estimated_monthly_sales}</td><td>${esc(e.sales_scope)}</td><td>${esc(e.period_start)} 至 ${esc(e.period_end)}</td></tr>`).join('');
  const caseBlock = `<div class="callout blue"><b>教学模拟：${esc(c.title)}</b>（不属于真实商品数据，数据日期 2026-11-14）</div><div class="table-wrap"><table><thead><tr><th>ASIN</th><th>父体</th><th>标题</th><th>价格</th><th>月销估算</th><th>层级</th><th>窗口</th></tr></thead><tbody>${sims}</tbody></table></div><p class="muted">成本（USD）：采购 ${c.goodsCost}、运输 ${c.logisticsCost}、平台费 ${c.platformCost}、退货预留 ${c.returnsCost}、其他 ${c.otherCost}；CPC ${c.cpc}；CVR ${c.cvr * 100}%；售价 ${c.price}。</p>`;
  if (t.result) {
    const r = t.result;
    if (r.skipped) return `<section class="panel">${head('<span class="tag gray">已跳过</span>')}<div class="panel-body"><div class="outcome"><span class="outcome-mark">i</span><div><strong>迁移练习未验证</strong><p>你跳过了练习，没有成绩，也不会显示为已掌握。</p></div></div><button class="btn" data-action="transfer-retry">重新练习</button></div></section>`;
    if (r.incomplete) return `<section class="panel">${head('<span class="tag orange">评分未完成</span>')}<div class="panel-body"><div class="callout">${esc(r.error?.message ?? '评分没有完成')}。程序核验的计算项：${r.calc.score}/2（标准答案 ${r.calc.expected}，你的答案 ${r.calc.given}）。</div><button class="btn" data-action="transfer-retry">重新练习</button></div></section>`;
    return `<section class="panel">${head(`<span class="tag ${r.outcome === 'needs_practice' ? 'orange' : 'green'}">${esc(({ independent_application: '本次已初步运用', assisted_completion: '提示后完成', needs_practice: '建议再练一次' })[r.outcome])} · ${r.total}/8</span>`)}<div class="panel-body">${caseBlock}
      <div class="metric-grid">${r.items.map((i) => `<div class="metric"><div class="metric-label">${esc(i.label)}</div><div class="metric-value">${i.score} / 2</div><div class="metric-foot">${i.deterministic ? '程序核验' : '依据你的原话'}</div></div>`).join('')}</div>
      <div class="rationale">${r.items.map((i) => `<p><b>${esc(i.label)}</b> ${i.quote ? `<q>${esc(i.quote)}</q>` : ''}<span>${esc(i.reason)}</span></p>`).join('')}</div>
      <p class="muted">参考计算：广告前贡献 ${r.reference.preAd}，CAC ${r.reference.cac}，广告后贡献 ${r.reference.postAd}。仓储、税费等未计入的费用仍需核实。提示 ${t.hints} 次${t.hints ? '（提示后成绩不算独立成绩）' : ''}。总分只反映这道练习，不是能力认证。</p>${r.nextPractice ? `<p><b>下次练习建议：</b>${esc(r.nextPractice)}</p>` : ''}<button class="btn" data-action="transfer-retry">再练一次</button></div></section>`;
  }
  return `<section class="panel">${head('<span class="tag orange">教学模拟</span>')}<div class="panel-body">${caseBlock}<div class="grid two">
    <div class="field"><label for="t-evidence">你会优先看哪些证据？为什么？</label><textarea id="t-evidence" data-t="evidence" maxlength="600"></textarea></div>
    <div class="field"><label for="t-scope">这几行销量数据能怎么用、不能怎么用？</label><textarea id="t-scope" data-t="scope" maxlength="600"></textarea></div>
    <div class="field"><label for="t-calc">广告后单件贡献是多少（USD）？</label><input class="input" id="t-calc" data-t="postAdContribution" type="number" step="0.01" /></div>
    <div class="field"><label for="t-unc">还有什么没算进去、你下一步去哪里核实？</label><textarea id="t-unc" data-t="uncertainty" maxlength="600"></textarea></div></div>
    <div class="btn-row"><button class="btn primary" data-action="transfer-score">提交并看反馈</button><button class="btn" data-action="transfer-hint">给我一个提示</button><button class="btn ghost" data-action="transfer-skip">跳过</button></div>
    ${t.hintLog.length ? `<p class="hint">提示（${t.hints} 次）：${t.hintLog.map((h) => esc(h.text)).join(' / ')}</p>` : ''}</div></section>`;
}
