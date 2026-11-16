import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/app.js';
import { createLlm, loadEnv } from '../server/llm.js';
import { createApify } from '../server/apify.js';
import { createResearchSources } from '../server/research-sources.js';
import { Store } from '../server/store.js';
import { analysisMarkdown } from '../server/exports.js';
import { startMonitor } from '../server/monitoring.js';
import { isRunning } from '../server/agent/pipeline.js';

const env = loadEnv();
const browserToken = randomBytes(32).toString('hex');
const requestHeaders = { 'content-type': 'application/json', 'x-pickwise-browser-token': browserToken };
const store = new Store('data/verification/sessions'); await store.init();
const apify = createApify({ token: env.APIFY_API_TOKEN });
const researchSources = createResearchSources({ token: env.APIFY_API_TOKEN, reviewsEnabled: env.APIFY_REVIEWS_ENABLED === 'true', noLoginReviewsEnabled: env.APIFY_NO_LOGIN_REVIEWS_ENABLED !== 'false' });
const handler = createApp({ store, apify, researchSources, llm: createLlm(env), publicDir: process.cwd(), deps: { deadlineMs: 420000 } });
const server = createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const monitor = startMonitor({ store, provider: apify, isRunning });
const response = await fetch(`${base}/api/sessions`, { method: 'POST', headers: requestHeaders, body: JSON.stringify({ input: process.argv[2] ?? 'B0C2JXSHSK' }) });
const created = await response.json();
if (!response.ok) { console.log(JSON.stringify(created)); process.exitCode = 1; }
else {
  console.log(JSON.stringify({ started: created.id, model: env.LLM_MODEL, base }));
  let previous = ''; let view; const started = Date.now();
  while (Date.now() - started < 780000) {
    view = await (await fetch(`${base}/api/sessions/${created.id}`, { headers: requestHeaders })).json();
    const state = JSON.stringify({ status: view.research.status, data: view.dataSource?.status, evidence: view.evidence?.length, steps: view.steps?.map(s => ({ id: s.id, status: s.status, activity: s.activity })), sources: view.supplementalSources });
    if (state !== previous) { console.log(state); previous = state; }
    if (!view.running) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await mkdir('data/verification', { recursive: true });
  const session = store.get(created.id);
  await writeFile(`data/verification/e2e-${created.id}.json`, JSON.stringify(view, null, 2));
  await writeFile(`data/verification/e2e-${created.id}.md`, analysisMarkdown(session));
  console.log(JSON.stringify({ completed: view.research.status, elapsedSeconds: (Date.now() - started) / 1000, report: view.analysis?.result?.report, fallback: view.analysis?.result?.fallback ?? false, fallbackSteps: view.steps?.filter(s => s.templateOnly).map(s => s.id), error: view.research.error, repairs: session.events.filter(e => ['repair', 'step_fallback', 'analysis_fallback'].includes(e.type)), usage: view.usage, coverage: view.businessEvidence?.coverage, verdict: view.analysis?.result?.verdict, dimensions: view.analysis?.result?.dimensions.map(d => ({ key: d.key, signal: d.signal, judgment: d.judgment, basis: d.basis, gap: d.gap })) }));
  if (view.research.status !== 'analysis_ready' || !view.analysis?.result?.report?.decision?.title || view.analysis?.result?.dimensions.length !== 5 || !view.analysis?.result?.next_steps?.length || view.analysis?.result?.dimensions.some(d => !d.basis?.length) || view.analysis?.result?.fallback || view.steps?.some(s => s.templateOnly)) process.exitCode = 1;
}
monitor.stop(); await store.flush(); await new Promise(resolve => server.close(resolve));
