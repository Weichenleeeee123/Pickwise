// Real model acceptance using previously collected real evidence, with no repeat
// data-source charges. The original session and its history stay untouched.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createSession } from '../server/session.js';
import { startResearch, isRunning } from '../server/agent/pipeline.js';
import { createLlm, loadEnv } from '../server/llm.js';
import { buildView } from '../server/view.js';
import { analysisMarkdown } from '../server/exports.js';
import { renderAppShell, renderWorkspace } from '../src/ui/workspace.js';
import { esc } from '../src/ui/common.js';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-report.mjs path/to/real-session.json');
const source = JSON.parse(await readFile(path, 'utf8'));
if (source.demo || !source.evidence?.length || source.evidence.some(r => r.source_mode === 'teaching_simulation')) throw new Error('A saved real-data session is required');
const llm = createLlm(loadEnv());
if (!llm.configured) throw new Error('A real configured model is required');
const session = createSession({ input: source.input, parsed: { asin: source.targetAsin, productName: source.product.name, query: '' } });
session.evidence = structuredClone(source.evidence);
session.constraints = structuredClone(source.constraints);
session.supplementalSources = structuredClone(source.supplementalSources ?? {});
session.dataSource = { provider: 'saved_real_sources', status: 'cached', observedAt: source.dataSource?.observedAt, cost: 0, note: 'Reuse saved real evidence; no new data collection.' };
console.log(JSON.stringify({ id: session.id, verificationMode: 'real_model_saved_real_sources', sourceRecords: session.evidence.length }));
await startResearch(session, { llm, persist() {}, deadlineMs: 420000 }, { fresh: true });
const started = Date.now();
let previous;
while (isRunning(session)) {
  const status = session.steps.map(s => `${s.id}:${s.status}`).join(' ');
  if (status !== previous) { console.log(status); previous = status; }
  if (Date.now() - started > 780000) throw new Error('Real-model acceptance exceeded its time limit');
  await new Promise(resolve => setTimeout(resolve, 1500));
}
const view = buildView(session), result = view.analysis?.result;
const prefix = `data/verification/report-${session.id}`;
await mkdir('data/verification', { recursive: true });
await writeFile(`${prefix}.session.json`, JSON.stringify(session, null, 2));
await writeFile(`${prefix}.json`, JSON.stringify(view, null, 2));
await writeFile(`${prefix}.md`, analysisMarkdown(session));
const ui = { view, page: 'report', demo: false, activeStep: 'demand', open: new Set(), texts: { analysis: analysisMarkdown(session) }, draft: {}, tab: 'analysis', config: { llm: { configured: true } }, list: [] };
const css = await readFile('styles.css', 'utf8');
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pickwise 实跑报告快照</title><style>' + css + '</style>' + renderAppShell(ui, '<p class="hint">实跑报告快照 · 真实模型与已采集真实证据 · ' + esc(view.product.name) + '</p>' + renderWorkspace(ui), '<b>Pickwise</b>') + '</html>';
await writeFile(`${prefix}.html`, html);
console.log(JSON.stringify({ status: view.research.status, records: view.evidence.length, elapsedSeconds: Math.round((Date.now() - started) / 1000), fallback: result?.fallback ?? false, fallbackSteps: view.steps.filter(s => s.templateOnly).map(s => s.id), report: result?.report, dimensions: result?.dimensions.map(d => ({ key: d.key, signal: d.signal, basisCount: d.basis.length })), markdown: `${prefix}.md`, snapshot: `${prefix}.html`, usage: view.usage }));
if (view.research.status !== 'analysis_ready' || !result?.report?.decision?.title || result.dimensions.length !== 5 || result.dimensions.some(d => !d.basis.length) || !result.next_steps.length || result.fallback || view.steps.some(s => s.templateOnly)) process.exitCode = 1;
