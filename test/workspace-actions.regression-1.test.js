import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Regression: ISSUE-003/004/005 — invisible requests and stale import fields.
// Found by functional QA on 2026-11-16.
// Report: docs/qa/2026-11-16-functional-audit.md
function harness(post) {
  const listeners = {};
  const windowListeners = {};
  const printDetails = [{ open: false, isConnected: true }, { open: true, isConnected: true }];
  const input = { id: 'c-goodsCost', type: 'number', value: '' };
  const renders = [];
  const app = {
    querySelectorAll: selector => selector.startsWith('input:not') ? [input] : selector === '.report-dimensions details, .report-actions details' ? printDetails : [],
    addEventListener: (name, callback) => { listeners[name] = callback; },
    set innerHTML(html) { renders.push(html); input.value = '20'; }
  };
  const context = vm.createContext({
    document: { querySelector: selector => selector === '#app' ? app : null, activeElement: null, getElementById: id => id === input.id ? input : null,
      body: { append() {} }, createElement: () => ({ setAttribute() {} }) },
    localStorage: { getItem: () => null, setItem() {} },
    location: { search: '', href: 'http://localhost/' }, history: { replaceState() {} },
    window: { scrollY: 0, scrollTo() {}, addEventListener(name, callback) { windowListeners[name] = callback; } }, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout() {}, createOfficeMotion: () => ({}), mountOfficeScene: () => () => {},
    renderWorkspace: () => '', renderAppShell: ui => ui.busy ? 'pending' : 'idle',
    api: { post, list: async () => ({ sessions: [] }) }, ApiError: Error,
    esc: value => value, performCoachAction: () => false, PAGES: { home: [], evidence: [] }
  });
  const source = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8')
    .split('\n').filter(line => !line.startsWith('import ')).join('\n').replace(/boot\(\);\s*$/, '');
  vm.runInContext(source + '\nglobalThis.qa = { ui, mutate };', context);
  context.qa.ui.view = { id: 'test-session', running: false, analysis: null };
  context.qa.ui.page = 'evidence';
  return { ...context.qa, listeners, input, renders, windowListeners, printDetails };
}

test('a pending model request is visible and duplicate writes are suppressed', async () => {
  let finish;
  let calls = 0;
  const response = new Promise(resolve => { finish = resolve; });
  const app = harness(() => { calls++; return response; });
  const first = app.mutate('coach', {});
  assert.equal(app.ui.busy, true);
  assert.equal(app.renders.at(-1), 'pending');
  await app.mutate('coach', {});
  assert.equal(calls, 1);
  finish({ id: 'test-session', running: false, analysis: null });
  await first;
  assert.equal(app.ui.busy, false);
  assert.equal(app.renders.at(-1), 'idle');
});

test('printing includes folded report evidence and restores the original reading state', () => {
  const app = harness(async () => ({}));
  app.windowListeners.beforeprint();
  assert.deepEqual(app.printDetails.map(element => element.open), [true, true]);
  app.windowListeners.afterprint();
  assert.deepEqual(app.printDetails.map(element => element.open), [false, true]);
});

test('confirmed business imports replace blank drafts with server values', async () => {
  const app = harness(async () => ({ id: 'test-session', running: false, analysis: null }));
  app.ui.pageInputs.evidence = { 'c-goodsCost': '' };
  await app.mutate('operating-import', {});
  assert.equal(app.input.value, '20');
  assert.equal(app.ui.pageInputs.evidence, undefined);
});

test('CSV evidence import completes the success branch without an undefined action', async () => {
  const app = harness(async () => ({ id: 'test-session', running: false, analysis: null,
    importResult: { accepted: 1, rejected: [], excluded: 0 } }));
  await app.listeners.change({ target: { id: 'evidence-file', type: 'file', files: [{ name: 'evidence.csv', size: 100, text: async () => 'csv' }] } });
  assert.equal(app.ui.view.importResult.accepted, 1);
  assert.equal(app.renders.at(-1), 'idle');
});
