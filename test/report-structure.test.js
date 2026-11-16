import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../server/session.js';
import { buildReportPlan, completeReport, reportDimensions } from '../server/report.js';
import { fallbackAnalysis, generateAnalysis } from '../server/agent/pipeline.js';
import { buildFigures, demandViz } from '../server/calc.js';
import { buildView } from '../server/view.js';
import { analysisMarkdown } from '../server/exports.js';
import { renderWorkspace } from '../src/ui/workspace.js';
import { demandChart } from '../src/ui/charts.js';
import { fakeLlm } from '../test-support/fake-llm.js';
import { rankingCandidateEvidence } from '../server/market-expansion.js';
import { appendUniqueEvidence } from '../server/monitoring.js';

function research(operating = false) {
  const s = createSession({ input: 'B012345678', parsed: { asin: 'B012345678', productName: 'Kitchen Shelf', query: '' } });
  const common = { marketplace: 'Amazon US', source_mode: 'live_api', source_name: 'Test source', observed_at: '2026-11-16', currency: 'USD' };
  const add = (id, fields) => s.evidence.push({ ...common, asin: s.targetAsin, id, ...fields });
  add('E1', { title: 'Kitchen Counter Shelf', price: 30, parent_asin: 'P1', product_attributes: { material: 'steel', size: '40cm' } });
  add('E2', { title: 'Kitchen Counter Shelf', asin: 'B111111111', price: 28, parent_asin: 'P2', product_attributes: { material: 'steel', size: '40cm' } });
  add('E3', { evidence_kind: 'keyword', title: 'Kitchen Shelf', keyword: 'kitchen shelf', relevance: 'category', monthly_searches: 1200 });
  add('E4', { evidence_kind: 'market_sales_estimate', title: 'Weekly purchase estimates', history_weeks: 3, history: [{ date: '2026-11-01', purchases: 100 }, { date: '2026-11-08', purchases: 120 }, { date: '2026-11-15', purchases: 110 }] });
  add('E5', { evidence_kind: 'supplier_quote', title: 'Kitchen Counter Shelf', supplier_name: 'Test supplier', moq: 100, price_min: 8, price_max: 8, price_tiers: [] });
  add('E6', { evidence_kind: 'amazon_fee_estimate', title: 'Fee estimate', fba_fee: 4, referral_fee: 4.5 });
  if (operating) Object.assign(s.constraints, { values: { price: 30, goodsCost: 8, logisticsCost: 7, platformCost: 4.5, returnsCost: 1, otherCost: 0.5, cpc: 0.48, cvr: 0.12 }, budget: 5000, moq: 100, launch: { freight: 200, duty: 80, prep: 20, advertising: 600, storage: 80, compliance: 100, fixed: 120, reserve: 500, leadDays: 30, inventoryDays: 45, payoutDays: 14 } });
  return s;
}

const workspace = (view, page = 'report') => ({ view, page, demo: false, activeStep: 'demand', open: new Set(), texts: {}, draft: {}, tab: 'analysis' });

test('source-backed screening produces a concrete sample decision without inventing personal costs', () => {
  const s = research(), plan = buildReportPlan(s);
  assert.equal(plan.decision.stage, 'sample');
  assert.match(plan.decision.title, /建议推进打样/);
  assert.equal(plan.decision.purchaseCleared, false);
  assert.equal(s.constraints.values.price, null);
  assert.equal(s.constraints.moq, null);
  assert.equal(plan.metrics[0].key, 'supplier_margin');
  assert.match(plan.metrics[0].note, /未扣/);
  assert.equal(plan.metrics.find(m => m.key === 'launch').nature, 'unknown');
  assert.ok(plan.actions.some(a => a.task === '取得正式报价并补齐单件成本'));
  assert.ok(!plan.actions.some(a => /补连续/.test(a.task)));
  assert.ok(plan.actions.some(a => /授权与政策/.test(a.task) && a.gate === 'before_order'));
});

test('complete operating inputs support a bounded first-batch plan and exact financial summary', () => {
  const s = research(true), plan = buildReportPlan(s);
  assert.equal(plan.decision.stage, 'pilot');
  assert.match(plan.decision.title, /100 件/);
  assert.match(plan.decision.reason, /\$5\.00/);
  assert.equal(plan.metrics.find(m => m.key === 'contribution').value, '$5.00');
  assert.equal(plan.metrics.find(m => m.key === 'launch').value, '$2,500.00');
  assert.equal(plan.decision.purchaseCleared, false);
  assert.ok(plan.actions.some(a => /100 件试销/.test(a.task) && /600.00/.test(a.why)));
  s.constraints.budget = 2000;
  assert.equal(buildReportPlan(s).decision.stage, 'hold');
  s.constraints.values.price = 20;
  assert.equal(buildReportPlan(s).decision.stage, 'stop');
});

test('positive costs and a single search signal do not imply a supported first batch', () => {
  const s = research(true);
  s.evidence = s.evidence.filter(r => r.evidence_kind !== 'market_sales_estimate');
  const plan = buildReportPlan(s);
  assert.equal(plan.decision.stage, 'sample');
  assert.ok(plan.actions.some(a => /同口径需求历史/.test(a.task)));
});

test('a matching recall blocks the pilot recommendation and absent data never gets a positive conclusion', () => {
  const s = research(true);
  s.evidence.push({ id: 'E7', asin: s.targetAsin, evidence_kind: 'recall', match: 'identifier_match', title: 'Recall', observed_at: '2026-11-16' });
  const plan = buildReportPlan(s);
  assert.equal(plan.decision.stage, 'hold');
  assert.match(plan.decision.title, /召回/);
  const empty = research(); empty.evidence = [];
  assert.equal(buildReportPlan(empty).decision.stage, 'hold');
  assert.ok(reportDimensions(empty).every(d => d.signal === 'insufficient' && d.basis.length && d.gap));
});

test('fallback retains current evidence and annotates every known figure', () => {
  const s = research(true), figures = buildFigures(s);
  const result = fallbackAnalysis(s, figures).result;
  assert.equal(result.fallback, true);
  assert.equal(result.dimensions.length, 5);
  const known = new Set([...s.evidence.map(e => e.id), 'calc', 'user']);
  for (const d of result.dimensions) {
    assert.ok(d.basis.length);
    assert.ok(d.basis.flatMap(b => b.evidence_ids).every(id => known.has(id)));
  }
  for (const figure of figures.filter(f => f.nature !== 'unknown')) assert.ok(result.dimensions.some(d => d.annotations.some(a => a.figure_id === figure.id)));
  assert.ok(result.dimensions.find(d => d.key === 'demand').basis.some(b => b.evidence_ids.includes('E4')));
  assert.ok(result.dimensions.find(d => d.key === 'competition').basis.some(b => b.evidence_ids.includes('E2')));
  assert.ok(!result.next_steps.some(s => /补充连续销量/.test(s.task)));
});

test('real source history feeds the chart with its weekly scope and never a fabricated monthly total', () => {
  const s = research(), viz = demandViz(s);
  assert.equal(viz.bars.length, 3);
  assert.deepEqual(viz.bars.map(b => b.value), [100, 120, 110]);
  assert.ok(viz.bars.every(b => b.id === 'E4' && /周级历史/.test(b.window)));
  const html = demandChart(viz);
  assert.match(html, /购买量历史估算/);
  assert.doesNotMatch(html, /<strong>证据不足/);
});

test('model and fallback share report, export, API and rendering structure', async () => {
  const s = research(true);
  const entry = await generateAnalysis(s, { llm: fakeLlm(), persist() {} });
  assert.equal(entry.result.report.schemaVersion, 1);
  assert.match(entry.result.verdict.title, /100 件/);
  s.research.status = 'analysis_ready';
  const view = buildView(s);
  const html = renderWorkspace(workspace(view));
  assert.match(html, /报告成本与资金/);
  assert.match(html, /\$5\.00/);
  assert.match(html, /执行计划/);
  assert.match(html, /下单前/);
  assert.doesNotMatch(html, /undefined|NaN|完整虚构案例/);
  const markdown = analysisMarkdown(s);
  assert.match(markdown, /建议做，按 100 件方案准备试销/);
  assert.match(markdown, /成本与资金摘要/);
  assert.match(markdown, /已取得证据与范围/);
  assert.match(markdown, /执行计划/);
  const title = entry.result.verdict.title, metricValue = entry.result.report.metrics[0].value;
  s.constraints.values.price = 20;
  const stale = buildView(s);
  assert.equal(stale.analysis.stale, true);
  assert.equal(stale.analysis.result.verdict.title, title);
  assert.equal(stale.analysis.result.report.metrics[0].value, metricValue);
});

test('legacy reports receive the shared structure without writing over stored history', () => {
  const s = research();
  const entry = fallbackAnalysis(s, buildFigures(s));
  const legacy = structuredClone(entry);
  delete legacy.result.report;
  s.analyses.push(legacy);
  const view = buildView(s);
  assert.ok(view.analysis.result.report);
  assert.equal(s.analyses[0].result.report, undefined);
  const result = completeReport(s, { dimensions: [] }, []);
  assert.equal(result.dimensions.length, 5);
  s.constraints.values.price = 22;
  const oldTitle = legacy.result.verdict.title;
  assert.equal(buildView(s).analysis.result.report, undefined);
  const markdown = analysisMarkdown(s);
  assert.match(markdown, /以下结论保留旧版本/);
  assert.ok(markdown.includes(oldTitle));
  assert.doesNotMatch(markdown, /当前输入与测算.*当前输入与测算/);
});

test('ranking discovery provides real candidates without inventing independent demand, specs or BSR', () => {
  const s = research(); s.evidence = s.evidence.filter(r => r.asin === s.targetAsin);
  const list = { id: 'E7', evidence_kind: 'category_rankings', asin: s.targetAsin, source_name: 'Category source', source_mode: 'live_api', source_url: 'https://www.amazon.com/gp/bestsellers/kitchen/123', observed_at: '2026-11-16', list_type: 'bestsellers', ranked_products: [
    { listed_asin: 'B111111111', title: 'Kitchen Counter Shelf', price: 27, currency: 'USD', rank: 3, rating: 4.5 },
    { listed_asin: s.targetAsin, title: 'Kitchen Counter Shelf', price: 30, currency: 'USD', rank: 5 },
    { listed_asin: 'B222222222', title: 'Kitchen Counter Shelf', price: null, currency: 'USD', rank: 6 }
  ] };
  s.evidence.push(list, { ...list, id: 'E8', list_type: 'new-releases' });
  const rows = rankingCandidateEvidence(s.evidence, s.targetAsin);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 27);
  assert.equal(rows[0].rank, null);
  assert.equal(rows[0].estimated_monthly_sales, null);
  assert.deepEqual(rows[0].product_attributes, {});
  assert.equal(rows[0].source_mode, 'live_api');
  appendUniqueEvidence(s, rows);
  assert.equal(rankingCandidateEvidence(s.evidence, s.targetAsin).length, 0);
  const plan = buildReportPlan(s);
  assert.ok(plan.coverage.find(c => c.label === '独立竞品候选').available);
  assert.equal(plan.decision.stage, 'sample');
  assert.match(plan.decision.reason, /规格可比性还需核对/);
  const updatedList = { ...list, id: 'E9', observed_at: '2026-11-17', ranked_products: [{ ...list.ranked_products[0], price: 23 }] };
  s.evidence.push(updatedList);
  const updated = rankingCandidateEvidence(s.evidence, s.targetAsin);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].price, 23);
  assert.equal(updated[0].observed_at, '2026-11-17');
  appendUniqueEvidence(s, updated);
  assert.equal(rankingCandidateEvidence(s.evidence, s.targetAsin).length, 0);
  const fullDetails = { ...updated[0], id: 'E10', discovery_list_type: undefined, observed_at: '2026-11-18', price: 24, product_attributes: { material: 'steel' } };
  s.evidence.push(fullDetails, { ...updatedList, observed_at: '2026-11-19' });
  assert.equal(rankingCandidateEvidence(s.evidence, s.targetAsin).length, 0);
});
