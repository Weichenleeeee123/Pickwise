import { esc, natureTag } from './common.js';

const fmt = (value, currency = 'USD') => (value === null || value === undefined ? '未提供' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value));

// 销量柱状图：每根柱子标注统计窗口与层级；被排除的记录用斜纹+文字说明，不只靠颜色。
export function demandChart(viz) {
  const bars = viz.bars.filter((bar) => bar.value !== null);
  if (!bars.length) return `<div class="chart-empty"><strong>证据不足</strong><span>没有带完整窗口与层级的销量，不绘制示意曲线。</span></div>`;
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const rows = bars.map((bar) => {
    const width = Math.max(2, Math.round((bar.value / max) * 100));
    const note = bar.included ? '' : `<span class="bar-note">已排除：${esc(({ duplicate_parent_sales: '父体销量重复', missing_sales_window: '缺统计窗口', missing_sales_scope: '缺销量层级', invalid_sales_value: '数值无效' })[bar.reason] ?? '口径不完整')}</span>`;
    return `<div class="bar-row"><div class="bar-label"><b>${esc(bar.label)}</b><small>${esc(bar.scope)} · ${esc(bar.window)}</small></div><div class="bar-track"><div class="bar-fill ${bar.included ? '' : 'excluded'}" style="width:${width}%"></div></div><div class="bar-value">${bar.value}${note}</div></div>`;
  }).join('');
  return `<figure class="chart"><figcaption>${esc(viz.title ?? '月销量估算（件）')}${natureTag('estimate')}<small>${esc(viz.note ?? '柱子按各自的统计窗口标注，不同窗口不能直接比较')}</small></figcaption>${rows}</figure>`;
}

// 利润瀑布条：从售价到广告后贡献。未提供的成本项显示“未提供”，不画示意值。
export function profitChart(viz) {
  const price = viz.bars.find((bar) => bar.label === '售价');
  if (!price || price.value === null) return `<div class="chart-empty"><strong>证据不足</strong><span>没有售价，无法绘制利润瀑布。</span></div>`;
  const scale = price.value || 1;
  let running = price.value;
  const rows = viz.bars.map((bar) => {
    if (bar.unknown) return `<div class="wf-row"><div class="wf-label">${esc(bar.label)}</div><div class="wf-track"><span class="wf-unknown">未提供 · 不计为 0</span></div><div class="wf-value">—</div></div>`;
    let start; let end; let cls;
    if (bar.kind === 'in') { start = 0; end = bar.value; cls = 'in'; running = bar.value; }
    else if (bar.kind === 'out') { end = running; start = running - bar.value; running = start; cls = 'out'; }
    else { start = Math.min(0, bar.value); end = Math.max(0, bar.value); cls = bar.kind === 'total' ? (bar.value >= 0 ? 'total' : 'loss') : 'sub'; if (bar.kind !== 'out') running = bar.value; }
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const left = ((lo + scale * 0.3) / (scale * 1.3)) * 100;
    const width = Math.max(1.2, ((hi - lo) / (scale * 1.3)) * 100);
    return `<div class="wf-row"><div class="wf-label">${esc(bar.label)}</div><div class="wf-track"><span class="wf-bar ${cls}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></span></div><div class="wf-value ${bar.value < 0 ? 'neg' : ''}">${bar.kind === 'out' ? '−' : ''}${fmt(Math.abs(bar.value), viz.currency)}</div></div>`;
  }).join('');
  return `<figure class="chart"><figcaption>从售价到广告后单件贡献（${esc(viz.currency)}）${natureTag(viz.nature)}<small>${esc(viz.note)}</small></figcaption>${rows}</figure>`;
}
