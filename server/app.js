import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { parseProductReference } from '../src/domain.js';
import { numberOrNull } from '../src/format.js';
import { LlmError } from './llm.js';
import { DEMO } from './demo.js';
import { addEvent, createSession, getStep, latestAnalysis } from './session.js';
import { appendEvidence, parseEvidenceFile } from './importer.js';
import { constraintsHash, isRunning, runReanalysis, startResearch } from './agent/pipeline.js';
import { answerPractice, askCoach, generateLearningRecord, generatePractice, scoreTransfer, skipPractice, skipTransfer, startTransfer, transferHint, usePracticeHint } from './agent/coaching.js';
import { analysisMarkdown, learningMarkdown, transferMarkdown } from './exports.js';
import { buildView, summaryOf } from './view.js';
import { isSessionId } from './store.js';
import { parseOperatingFile, applyOperatingImport, LAUNCH_FIELDS } from './operating-import.js';
import { collectSnapshot } from './monitoring.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const STATIC = /^\/(?:src\/(?:ui\/)?[\w-]+\.js|src\/[\w-]+\.js|assets\/demo\/narration\/v(?:1|3)-(?:opening|need|office|competition|evidence|economics|sensitivity|coach|practice|business|closing)\.mp3|assets\/brand\/(?:pickwise-icon|pickwise-icon-small|pickwise-icon-32)\.(?:svg|png)|assets\/team\/(?:identify|demand|competition|profit|risk|summary|office|chair|desk|roundtable|office-computers-v4|chair-computer-v4|(?:identify|demand|competition|profit|risk|summary)-computer-v4|chair-empty-v6|(?:identify|demand|competition|profit|risk|summary)-occupied-v6|(?:identify|demand|competition|profit|risk|summary)-(?:standing-v7|walking-four-v11))\.webp|styles\.css|index\.html)?$/;
const CURRENCIES = ['USD', 'CNY', 'EUR'];

class HttpError extends Error {
  constructor(status, message, category = 'bad_request') { super(message); this.status = status; this.category = category; }
}

function fail(message, status = 400) { throw new HttpError(status, message); }

async function readJson(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail('请求内容过大', 413);
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('请求内容不是有效的 JSON'); }
}

function send(response, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(payload);
}

export function validateConstraints(body, current) {
  const next = { ...current, values: { ...current.values } };
  next.launch = { ...(current.launch ?? {}) };
  next.inputSources = { ...(current.inputSources ?? {}) };
  const nonNegative = (value, label) => {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0) fail(`${label} 需要是不小于 0 的数字`);
    return value;
  };
  if (body.values && typeof body.values === 'object') {
    for (const key of Object.keys(next.values)) {
      if (!(key in body.values)) continue;
      const value = numberOrNull(body.values[key]);
      if (key === 'cvr') {
        if (value !== null && (value <= 0 || value > 1)) fail('CVR 需要大于 0 且不超过 100%');
        next.values[key] = value;
      } else next.values[key] = nonNegative(value, key === 'cpc' ? 'CPC' : '成本');
      if (current.values[key] !== next.values[key]) next.inputSources[key] = { source: '用户手工输入', date: new Date().toISOString().slice(0, 10), nature: 'assumption' };
    }
  }
  if ('budget' in body) next.budget = nonNegative(numberOrNull(body.budget), '预算');
  if (body.launch && typeof body.launch === 'object') for (const key of Object.keys(LAUNCH_FIELDS)) {
    if (!(key in body.launch)) continue;
    next.launch[key] = nonNegative(numberOrNull(body.launch[key]), LAUNCH_FIELDS[key]);
    if (current.launch?.[key] !== next.launch[key]) next.inputSources[key] = { source: '用户手工输入', date: new Date().toISOString().slice(0, 10), nature: 'assumption' };
  }
  if ('moq' in body) {
    const moq = nonNegative(numberOrNull(body.moq), '起订量');
    if (moq !== null && !Number.isInteger(moq)) fail('起订量需要是整数');
    next.moq = moq;
  }
  if ('goodsCostCurrency' in body) {
    if (!CURRENCIES.includes(body.goodsCostCurrency)) fail('不支持的币种');
    next.goodsCostCurrency = body.goodsCostCurrency;
    if (current.goodsCostCurrency !== next.goodsCostCurrency) next.inputSources.goodsCost = { source: '用户手工输入', date: new Date().toISOString().slice(0, 10), nature: 'assumption' };
  }
  if ('fx' in body) {
    if (body.fx === null) next.fx = null;
    else {
      const rate = numberOrNull(body.fx?.rate);
      const source = String(body.fx?.source ?? '').trim().slice(0, 120);
      const date = String(body.fx?.date ?? '').trim();
      if (rate === null || rate <= 0 || !source || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('汇率需要同时提供大于 0 的数值、来源和日期（YYYY-MM-DD）');
      next.fx = { rate, source, date };
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function createApp({ store, llm, dataForSeo = null, apify = null, researchSources = null, publicDir, deps = {} }) {
  const browserOwner = (request) => {
    const token = request.headers['x-pickwise-browser-token'];
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null;
  };
  const runtime = (session) => ({ llm, dataForSeo, apify, researchSources, dataProvider: apify?.configured ? apify : dataForSeo, getCachedEvidence: () => store.list().filter(item => session.ownerHash && item.ownerHash === session.ownerHash).flatMap((item) => item.evidence ?? []), persist: () => store.save(session), ...deps });
  const hasTeamAssets = () => Boolean(publicDir && ['identify-occupied-v6', 'demand-occupied-v6', 'competition-occupied-v6', 'profit-occupied-v6', 'risk-occupied-v6', 'summary-occupied-v6', 'office-computers-v4', 'chair-empty-v6', ...['identify', 'demand', 'competition', 'profit', 'risk', 'summary'].flatMap(role => [`${role}-standing-v7`, `${role}-walking-four-v11`])].every((name) => existsSync(join(publicDir, 'assets', 'team', `${name}.webp`))));

  const need = (id, ownerHash) => {
    if (!isSessionId(id)) fail('任务编号无效', 404);
    const session = store.get(id);
    if (!session || !ownerHash || session.ownerHash !== ownerHash) fail('找不到该任务', 404);
    return session;
  };
  const needLlm = () => { if (!llm.configured) throw new LlmError('not_configured', '服务端尚未配置模型，请在 .env 中填写 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL 后重启服务'); };
  const view = (session, after = 0) => ({ ...buildView(session, { after, running: isRunning(session), llmConfigured: llm.configured }), teamAssetsAvailable: hasTeamAssets() });
  const idle = (session) => { if (isRunning(session)) fail('分析正在进行，请稍后再操作', 409); };

  async function route(request, url) {
    const method = request.method;
    const ownerHash = browserOwner(request);
    const parts = url.pathname.split('/').filter(Boolean).slice(1);

    if (method === 'GET' && parts[0] === 'config') return { llm: { configured: llm.configured, provider: llm.provider, model: llm.model }, apify: { configured: Boolean(apify?.configured) }, dataForSeo: { configured: Boolean(dataForSeo?.configured) } };
    if (method === 'GET' && parts[0] === 'sessions' && parts.length === 1) return { sessions: store.list().filter(session => ownerHash && session.ownerHash === ownerHash).map((session) => summaryOf(session, isRunning(session))) };

    if (method === 'POST' && parts[0] === 'sessions' && parts.length === 1) {
      if (!ownerHash) fail('浏览器标识无效，请刷新页面后重试');
      const body = await readJson(request, 8 * 1024);
      let parsed;
      try { parsed = parseProductReference(body.input); } catch (error) { fail(error.message); }
      needLlm();
      const session = createSession({ input: String(body.input).trim(), parsed });
      session.ownerHash = ownerHash;
      if (apify?.configured && session.targetAsin) session.monitoring = { ...session.monitoring, enabled: true, nextAt: new Date(Date.now() + 24 * 3600_000).toISOString() };
      await store.put(session);
      await startResearch(session, runtime(session));
      return view(session);
    }

    if (method === 'POST' && parts[0] === 'demo') {
      if (!ownerHash) fail('浏览器标识无效，请刷新页面后重试');
      needLlm();
      const session = createSession({ input: DEMO.input, parsed: { asin: DEMO.asin, productName: DEMO.name, query: '' }, demo: true });
      session.ownerHash = ownerHash;
      session.evidence = DEMO.evidence.map((record, index) => ({ ...record, id: `E${index + 1}` }));
      session.constraints.values = Object.fromEntries(Object.keys(session.constraints.values).map((key) => [key, DEMO.constraints[key] ?? null]));
      session.constraints.budget = DEMO.constraints.budget;
      session.constraints.moq = DEMO.constraints.moq;
      await store.put(session);
      await startResearch(session, runtime(session));
      return view(session);
    }

    if (parts[0] !== 'sessions') fail('接口不存在', 404);
    const session = need(parts[1], ownerHash);
    const action = parts[2];

    if (method === 'GET' && !action) return view(session, Number(url.searchParams.get('after') ?? 0));

    if (method === 'GET' && action === 'export') {
      const kind = parts[3];
      const builder = { analysis: analysisMarkdown, learning: learningMarkdown, transfer: transferMarkdown }[kind];
      if (!builder) fail('未知成果类型', 404);
      return { __markdown: builder(session), filename: `${session.targetAsin ?? 'product'}-${kind}-v${latestAnalysis(session)?.version ?? 0}.md` };
    }

    if (method !== 'POST') fail('接口不存在', 404);

    if (action === 'monitoring') {
      idle(session);
      const body = await readJson(request, 1024);
      if (!session.targetAsin || session.demo) fail('请先确定真实商品 ASIN');
      if (!(deps.dataProvider ?? apify)?.fetchSnapshot) fail('当前数据源不支持快照');
      const intervalHours = Number(body.intervalHours ?? session.monitoring?.intervalHours ?? 24);
      const maxSamples = Number(body.maxSamples ?? session.monitoring?.maxSamples ?? 7);
      if (!Number.isFinite(intervalHours) || intervalHours < 6 || intervalHours > 720 || !Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 30) fail('采样间隔须为 6–720 小时，次数上限为 1–30');
      session.monitoring = { ...(session.monitoring ?? {}), enabled: body.enabled === true, intervalHours, maxSamples, samples: session.monitoring?.samples ?? 0, nextAt: new Date(Date.now() + intervalHours * 3600_000).toISOString() };
      await store.save(session);
      if (body.collectNow) await collectSnapshot(session, { provider: deps.dataProvider ?? apify, persist: () => store.save(session) });
      return view(session);
    }

    if (action === 'operating-import') {
      idle(session);
      const body = await readJson(request, 6 * 1024 * 1024);
      let parsed;
      try { parsed = parseOperatingFile(String(body.name ?? ''), String(body.content ?? ''), session.targetAsin); } catch (error) { fail(error.message); }
      applyOperatingImport(session, parsed);
      session.learning.recordStale = true;
      addEvent(session, { type: 'operating_imported' });
      await store.save(session);
      if (latestAnalysis(session)) { needLlm(); await runReanalysis(session, runtime(session)); }
      return view(session);
    }

    if (action === 'viewed-result') {
      if (!session.resultViewedAt && latestAnalysis(session)) {
        session.resultViewedAt = new Date().toISOString();
        addEvent(session, { type: 'result_viewed' });
        await store.save(session);
      }
      return view(session);
    }

    if (action === 'judgment') {
      const body = await readJson(request, 8 * 1024);
      if (!['worth', 'not_worth', 'unsure'].includes(body.choice)) fail('请选择“值得做 / 不值得做 / 不确定”');
      if (session.judgment?.eligible && session.resultViewedAt) fail('结果已经展示，不能再修改用于对照的初判');
      const eligible = !session.resultViewedAt;
      session.judgment = { choice: body.choice, reason: String(body.reason ?? '').trim().slice(0, 300), savedAt: new Date().toISOString(), eligible };
      session.learning.recordStale = true;
      addEvent(session, { type: 'judgment_saved', eligible });
      await store.save(session);
      return view(session);
    }

    if (action === 'constraints') {
      const body = await readJson(request, 8 * 1024);
      session.constraints = validateConstraints(body, session.constraints);
      session.learning.recordStale = true;
      addEvent(session, { type: 'constraints_saved' });
      await store.save(session);
      const changed = latestAnalysis(session) && latestAnalysis(session).constraintsHash !== constraintsHash(session);
      // 研究或上一次重算还在跑时不立即重算：数字已经按新成本在 econ/funding 里重算好了（纯函数，始终准确），
      // 只是旧版本的文字解释暂时还对不上新数字。标记为 pending，待当前运行结束后统一补一次重算，
      // 不能静默跳过——否则调用方会误以为重算已经发生。
      if (changed) {
        if (isRunning(session)) { session.reanalysis = { status: 'pending', error: null, startedAt: new Date().toISOString() }; await store.save(session); }
        else { needLlm(); await runReanalysis(session, runtime(session)); }
      }
      return view(session);
    }

    if (action === 'import') {
      idle(session);
      const body = await readJson(request, 6 * 1024 * 1024);
      let parsed;
      try { parsed = parseEvidenceFile(String(body.name ?? ''), String(body.content ?? '')); } catch (error) { fail(error.message); }
      appendEvidence(session, parsed, String(body.name ?? '').slice(0, 120));
      if (session.demo && session.evidence.some((record) => record.source_mode !== 'teaching_simulation')) session.demo = false;
      addEvent(session, { type: 'evidence_imported', count: parsed.records.length });
      await store.save(session);
      return { ...view(session), importResult: { accepted: parsed.records.length, rejected: parsed.rejected, excluded: parsed.validation.excluded.length } };
    }

    if (action === 'research') {
      idle(session);
      needLlm();
      const body = await readJson(request, 1024);
      const fresh = body.mode === 'fresh';
      if (fresh) { session.judgment = session.judgment?.eligible ? { ...session.judgment } : session.judgment; }
      await startResearch(session, runtime(session), { fresh });
      return view(session);
    }

    if (action === 'resolve') {
      idle(session);
      needLlm();
      const body = await readJson(request, 1024);
      const candidates = session.identity.assessment?.candidates ?? [];
      const chosen = candidates.find((candidate) => candidate.asin === body.asin);
      if (!chosen) fail('请从候选商品中选择一项');
      session.targetAsin = chosen.asin;
      session.product.asin = chosen.asin;
      session.product.name = chosen.title || chosen.asin;
      session.identity.chosen = { asin: chosen.asin, at: new Date().toISOString() };
      const step = getStep(session, 'identify');
      step.status = 'done';
      step.endedAt = new Date().toISOString();
      addEvent(session, { type: 'identity_resolved', asin: chosen.asin });
      await startResearch(session, runtime(session), { fresh: false });
      return view(session);
    }

    if (action === 'practice') {
      const node = parts[3];
      const sub = parts[4];
      if (!['N1', 'N2', 'N3'].includes(node) || !session.teaching.nodes.includes(node)) fail('该节点不在本次教学里', 404);
      if (session.research.status !== 'analysis_ready') fail('分析完成后才能练习');
      if (sub === 'start') { needLlm(); await generatePractice(session, runtime(session), node); }
      else if (sub === 'hint') usePracticeHint(session, node);
      else if (sub === 'skip') skipPractice(session, node);
      else if (sub === 'answer') {
        needLlm();
        const body = await readJson(request, 1024);
        await answerPractice(session, runtime(session), node, body.choice);
      } else fail('接口不存在', 404);
      await store.save(session);
      return view(session);
    }

    if (action === 'coach') {
      needLlm();
      const body = await readJson(request, 8 * 1024);
      if (body.selectedText != null && (typeof body.selectedText !== 'string' || body.selectedText.trim().length > 1200)) fail('引用内容最多 1200 个字符');
      if (typeof body.question !== 'string' || !body.question.trim() || body.question.trim().length > 500) fail('问题需为 1 到 500 个字符');
      await askCoach(session, runtime(session), body);
      await store.save(session);
      return view(session);
    }

    if (action === 'transfer') {
      const sub = parts[3];
      if (session.research.status !== 'analysis_ready') fail('分析完成后才能进行迁移练习');
      if (sub === 'start') startTransfer(session);
      else if (sub === 'hint') transferHint(session);
      else if (sub === 'skip') skipTransfer(session);
      else if (sub === 'retry') startTransfer(session);
      else if (sub === 'score') { needLlm(); await scoreTransfer(session, runtime(session), await readJson(request, 8 * 1024)); }
      else fail('接口不存在', 404);
      await store.save(session);
      return view(session);
    }

    if (action === 'learning' && parts[3] === 'generate') {
      needLlm();
      await generateLearningRecord(session, runtime(session));
      await store.save(session);
      return view(session);
    }

    fail('接口不存在', 404);
  }

  async function serveStatic(response, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = normalize(join(publicDir, rel));
    if (!file.startsWith(normalize(publicDir))) return send(response, 404, 'Not found');
    try {
      await stat(file);
      response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(response);
    } catch { send(response, 404, 'Not found'); }
  }

  return async function handler(request, response) {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const result = await route(request, url);
        if (result?.__markdown !== undefined) {
          response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.filename.replace(/[^\w.-]+/g, '-')}"`, 'Cache-Control': 'no-store' });
          response.end(result.__markdown);
          return;
        }
        send(response, 200, result);
        return;
      }
      if (!STATIC.test(url.pathname)) return send(response, 404, 'Not found');
      await serveStatic(response, url.pathname);
    } catch (error) {
      if (error instanceof HttpError) return send(response, error.status, { error: { category: error.category, message: error.message } });
      if (error instanceof LlmError) {
        const status = error.category === 'not_configured' ? 503 : 502;
        return send(response, status, { error: { category: error.category, message: error.message } });
      }
      console.error(error);
      send(response, 500, { error: { category: 'internal', message: '服务内部错误，已记录' } });
    }
  };
}
