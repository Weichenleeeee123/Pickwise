import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CASE } from '../src/ui/demo-data.js';
import { renderWorkspace } from '../src/ui/workspace.js';

// Regression: ISSUE-002 — changing purchase currency did not reveal FX fields.
// Found by functional QA on 2026-11-16.
// Report: docs/qa/2026-11-16-functional-audit.md
test('currency draft exposes FX fields without changing saved assumptions', () => {
  const view = structuredClone(DEMO_CASE.view);
  const ui = { view, page: 'evidence', demo: false, draft: {}, open: new Set(), currencyDraft: 'CNY' };
  const html = renderWorkspace(ui);
  assert.match(html, /id="fx-rate"/);
  assert.match(html, /id="fx-source"/);
  assert.match(html, /id="fx-date"/);
  assert.equal(view.constraints.goodsCostCurrency, 'USD');
  assert.equal(view.constraints.values.goodsCost, 8);
  assert.doesNotMatch(renderWorkspace({ ...ui, currencyDraft: 'USD' }), /id="fx-rate"/);
});
