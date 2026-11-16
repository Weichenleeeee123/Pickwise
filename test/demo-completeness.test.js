import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CASE } from '../src/ui/demo-data.js';
import { demoProvider, resetDemo } from '../src/ui/demo-provider.js';
import { calculateUnitEconomics, hasSalesTrendHistory, inspectEvidence } from '../src/domain.js';
import { diagnoseEvidence, describeIssues } from '../src/diagnosis.js';
import { renderWorkspace } from '../src/ui/workspace.js';
import { renderReportOverview } from '../src/ui/results.js';
import { simulationAt, SIMULATION_DURATION } from '../src/ui/office-scene.js';

const uiFor = (view, page, activeStep = 'demand') => ({ view, page, activeStep, demo: true, open: new Set(), texts: {}, draft: {}, tab: 'analysis' });

test('the complete fictional demo has consistent evidence instead of an incomplete teaching exercise', () => {
  const v = DEMO_CASE.view;
  assert.equal(v.preloadedDemo, true);
  assert.equal(v.dataSource.status, 'preloaded');
  assert.equal(v.dataSource.error, null);
  assert.equal(v.research.evidenceCount, v.evidence.length);
  assert.ok(v.evidence.every(r => r.source_mode === 'teaching_simulation' && !r.source_url));
  assert.equal(new Set(v.evidence.map(r => r.id)).size, v.evidence.length);
  assert.ok(v.steps.every(s => s.status === 'done' && !s.card.gap));
  assert.deepEqual(v.dataIssues, []);
  assert.deepEqual(describeIssues(diagnoseEvidence(v.evidence)), []);
  assert.deepEqual(inspectEvidence(v.evidence).duplicateGroups, []);
  assert.equal(hasSalesTrendHistory(v.evidence.filter(r => r.asin === v.targetAsin)), true);
  assert.equal(v.viz.demand.bars.length, 6);
  assert.ok(v.viz.demand.bars.every(r => r.included && r.scope === 'listing'));
  const b = v.businessEvidence;
  for (const key of ['keywords', 'trends', 'salesHistory', 'reviewRecords', 'marketOffers', 'categoryRankings', 'suppliers', 'dimensions', 'fees', 'official']) assert.ok(b[key].length, key);
  assert.equal(b.competitors.filter(r => r.match.classification === 'comparable').length, 3);
  assert.ok(Object.values(v.supplementalSources).every(s => s.status === 'preloaded'));
  assert.equal(b.coverage.compliance_verified, false);
  assert.equal(b.coverage.official_recall_check, false);
  assert.equal(b.coverage.simulated_risk_review, true);
  for (const h of b.history) {
    const record = v.evidence.find(r => r.id === h.id);
    assert.equal(record.observed_at, h.observed_at);
    assert.equal(record.bestseller_rank, h.bsr);
    assert.equal(record.review_count, h.review_count);
  }
  const ids = new Set([...v.evidence.map(r => r.id), 'calc', 'user']);
  for (const d of v.analysis.result.dimensions) for (const basis of d.basis) assert.ok(basis.evidence_ids.every(id => ids.has(id)));
});

test('demo verdict, figures, costs, funding, scenarios and exported report agree', async () => {
  const v = resetDemo();
  assert.deepEqual(v.econ, { ...calculateUnitEconomics(v.constraints.values), missingLabels: [] });
  const launch = ['freight', 'duty', 'prep', 'advertising', 'storage', 'compliance', 'fixed', 'reserve'];
  const total = v.constraints.moq * v.constraints.values.goodsCost + launch.reduce((sum, k) => sum + v.constraints.launch[k], 0);
  assert.equal(total, 2966);
  assert.equal(v.funding.totalRequired, total);
  assert.equal(v.funding.budgetGap, total - v.constraints.budget);
  assert.equal(v.funding.status, 'within_budget');
  assert.deepEqual(v.funding.missing, []);
  assert.equal(v.econ.postAdContribution, 4.7);
  assert.equal(v.constraints.values.logisticsCost, v.businessEvidence.fees[0].fba_fee + (v.constraints.launch.freight + v.constraints.launch.duty + v.constraints.launch.prep) / v.constraints.moq);
  assert.equal(v.viz.profit.bars.at(-1).value, v.econ.postAdContribution);
  assert.equal(v.scenarios.rows.find(r => r.label === 'CVR 减半').result.postAdContribution, 0.7);
  assert.equal(v.analysis.result.verdict.bucket, 'pilot_launch');
  assert.equal(v.buckets.pilot_launch, '建议做，首批 120 件试销');
  assert.ok(v.analysis.result.dimensions.every(d => d.signal !== 'insufficient' && !d.gap));
  const report = await demoProvider.exportText(v.id, 'analysis');
  assert.match(report, /虚构/);
  assert.match(report, /广告后贡献 4.70 USD/);
  assert.match(report, /结论：建议做，首批 120 件试销/);
  assert.doesNotMatch(report, /值得进一步验证/);
  assert.match(report, /2,966|2966/);
  assert.doesNotMatch(report, /证据不足|缺连续|启动现金总额仍算不出|模型调用 17 次|本次此项为空/);
  const overview = renderReportOverview(v);
  assert.match(overview, /证据覆盖/);
  assert.match(overview, /5<small>个维度齐备/);
});

test('all demo pages and six office results render with simulation labels and no evidence failure', () => {
  const v = structuredClone(DEMO_CASE.view);
  for (const page of ['room', 'report', 'evidence', 'learning']) {
    const html = renderWorkspace(uiFor(v, page));
    assert.doesNotMatch(html, /undefined|证据不足|项待关注|Apify 商品抓取失败|未取得可用关键词/);
    assert.match(html, /完整虚构案例/);
  }
  for (const step of v.steps) {
    const html = renderWorkspace(uiFor(v, 'room', step.id));
    assert.doesNotMatch(html, /证据不足|项待关注|本次没有核对任何官方来源/);
    assert.match(html, /data-office-scene/);
  }
  const evidence = renderWorkspace(uiFor(v, 'evidence'));
  assert.match(evidence, /模拟评论样本/);
  assert.match(evidence, /虚构演示样本/);
  assert.doesNotMatch(evidence, /已验证购买|公开返回样本|真实业务证据与覆盖范围|本系统真实采样/);
  const playback = simulationAt(SIMULATION_DURATION);
  assert.ok(playback.steps.every(s => s.status === 'done'));
  assert.doesNotMatch(playback.caption, /风险待核实/);
});

test('changing demo costs recalculates locally without losing the profit chart or changing the source case', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Demo must never request a remote service'); };
  try {
    const v = await demoProvider.demo();
    const changed = await demoProvider.post(v.id, 'constraints', { values: { price: 24 } });
    assert.equal(changed.econ.postAdContribution, -1.2);
    assert.equal(changed.viz.profit.bars.at(-1).value, changed.econ.postAdContribution);
    assert.equal(changed.analysis.stale, true);
    assert.doesNotThrow(() => renderWorkspace(uiFor(changed, 'evidence')));
    assert.match(await demoProvider.exportText(v.id, 'analysis'), /原始案例报告/);
    const incomplete = await demoProvider.post(v.id, 'constraints', { values: { goodsCost: null } });
    assert.equal(incomplete.econ.status, 'incomplete');
    assert.doesNotThrow(() => renderWorkspace(uiFor(incomplete, 'evidence')));
    const restored = resetDemo();
    assert.equal(restored.econ.postAdContribution, 4.7);
    assert.equal(restored.constraints.values.price, 29.9);
    assert.equal(restored.analysis.stale, false);
    restored.evidence[0].title = 'local mutation';
    assert.notEqual((await demoProvider.get()).evidence[0].title, restored.evidence[0].title);
  } finally { globalThis.fetch = originalFetch; resetDemo(); }
});

test('real research retains incomplete evidence and risk warnings', () => {
  const v = structuredClone(DEMO_CASE.view);
  v.demo = false; v.preloadedDemo = false;
  v.businessEvidence.official = [];
  const risk = v.steps.find(s => s.id === 'risk');
  risk.status = 'unverified'; risk.card.gap = '缺少真实商品的官方核验材料';
  Object.assign(v.analysis.result.dimensions[0], { signal: 'insufficient', gap: '缺连续历史' });
  const html = renderWorkspace({ ...uiFor(v, 'room', 'risk'), demo: false });
  assert.match(html, /本次没有核对任何官方来源/);
  assert.match(html, /1 项待关注/);
  const overview = renderReportOverview(v);
  assert.match(overview, /仍有缺口/);
  assert.match(overview, /1<small>个维度/);
});
