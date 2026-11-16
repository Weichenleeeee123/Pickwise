import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CASE } from '../src/ui/demo-data.js';
import { renderWorkspace } from '../src/ui/workspace.js';
import { renderReportOverview } from '../src/ui/results.js';
import { termText, reportTerms } from '../src/ui/common.js';

function workspace(page, patch = {}) {
  return { view: structuredClone(DEMO_CASE.view), page, demo: true, activeStep: 'demand', open: new Set(), texts: {}, tab: 'analysis', ...patch };
}

test('research keeps the office as the main scene before controls and supporting evidence', () => {
  const html = renderWorkspace(workspace('room'));
  assert.ok(html.indexOf('class="room-office"') < html.indexOf('class="room-controls"'));
  assert.ok(html.indexOf('data-office-scene') < html.indexOf('step-detail-block room-step-detail'));
  assert.doesNotMatch(html, /office-compact|explanation-rail/);
  assert.equal((html.match(/data-office-scene/g) ?? []).length, 1);
  assert.equal((html.match(/data-step-select=/g) ?? []).length, 6);
  assert.equal((html.match(/data-actor="/g) ?? []).length, 6);
  assert.ok(html.includes('6<span> / 6</span>'));
  assert.doesNotMatch(html, /项待关注/);
  assert.match(html, /data-disclosure-key="office-members"/);
});

test('selected research result is open without a second click and teaching appears only once', () => {
  const html = renderWorkspace(workspace('room'));
  assert.equal((html.match(/data-step="/g) ?? []).length, 1);
  assert.match(html, /data-step="demand"/);
  assert.match(html, /这一步查到了什么/);
  assert.match(html, /如何理解这个结果/);
  assert.match(html, /<details class="step-method" data-disclosure-key="method-demand">/);
  assert.doesNotMatch(html, /data-toggle="demand"/);
  assert.equal(html.split('<h4>为什么查</h4>').length - 1, 1);
  assert.match(html, /本次能说明/);
  assert.match(html, /本次不能说明/);
});

test('unfinished research shows actual activity, pending results, and a usable retry', () => {
  const ui = workspace('room', { demo: false });
  ui.view.analysis = null;
  ui.view.running = true;
  ui.view.research.status = 'researching';
  Object.assign(ui.view.steps[1], { status: 'running', card: null, activity: '正在读取真实关键词' });
  let html = renderWorkspace(ui);
  assert.match(html, /正在读取真实关键词/);
  assert.match(html, /等待真实的数据读取与模型返回/);
  assert.doesNotMatch(html, /查看分析报告 ↗/);
  Object.assign(ui.view.steps[1], { status: 'pending', activity: null });
  html = renderWorkspace(ui);
  assert.match(html, /这一步尚未生成结果/);
  ui.view.running = false;
  ui.view.research.status = 'partial';
  Object.assign(ui.view.steps[1], { status: 'failed', error: { message: '<script>failed</script>' } });
  html = renderWorkspace(ui);
  assert.match(html, /data-action="retry"/);
  assert.ok(html.includes('&lt;script&gt;failed&lt;/script&gt;'));
  assert.doesNotMatch(html, /<script>/);
});

test('report presents one verdict then dimensions, next actions, and complete exports', () => {
  const ui = workspace('report');
  const html = renderWorkspace(ui);
  const sections = ['report-overview', 'report-dimensions', 'report-actions', 'report-document'].map(id => html.indexOf('id="' + id + '"'));
  assert.ok(sections.every(index => index >= 0));
  assert.deepEqual([...sections].sort((a, b) => a - b), sections);
  assert.equal((html.match(/id="report-verdict"/g) ?? []).length, 1);
  assert.equal((html.match(/class="dimension-details"/g) ?? []).length, 5);
  const glossary = reportTerms(ui.view.analysis.result, ui.view.analysis.figures);
  for (const d of ui.view.analysis.result.dimensions) {
    assert.ok(html.includes(termText(d.judgment, glossary)));
    for (const basis of d.basis ?? []) assert.ok(html.includes(termText(basis.text, glossary)));
  }
  assert.match(html, /aria-label="报告目录"/);
  assert.match(html, /data-action="download"/);
  assert.match(html, /data-action="print"/);
  assert.doesNotMatch(html, /coach-drawer/);
  assert.doesNotMatch(html, /<h1>/);
});

test('an old report warns before its verdict and a pending report links to real progress', () => {
  const ui = workspace('report');
  ui.view.analysis.stale = true;
  const html = renderReportOverview(ui.view);
  assert.ok(html.indexOf('report-stale') < html.indexOf('id="report-overview"'));
  ui.view.analysis = null;
  const pending = renderWorkspace(ui);
  assert.match(pending, /分析完成后，在这里查看结论/);
  assert.match(pending, /data-page="room"/);
  assert.doesNotMatch(pending, /先选择一个分析任务|id="report-verdict"/);
});
