import { api, ApiError, setDataMode } from './api.js';
import { PAGES, renderAppShell, renderWorkspace } from './workspace.js';
import { esc } from './common.js';
import { COACH_QUESTIONS } from './coach.js';
import { mountTermHelp } from './term-help.js';
import { mountOfficeScene, createOfficeMotion, simulationAt, nextSimulationTime, simulationStepTime, SIMULATION_DURATION } from './office-scene.js';
import { createDemoTour, demoTourStep, DEMO_TOUR_STEPS } from './demo-guide.js';
import { PITCH_QUESTIONS } from './demo-pitch.js';
import { createAutoPitch } from './auto-pitch.js';

const app = document.querySelector('#app');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* 无痕模式下忽略 */ } } };

const ui = { config: null, list: [], view: null, error: null, open: new Set(), tab: 'analysis', texts: {}, draft: { choice: null, reason: '' }, pollTimer: null, seq: 0, busy: false, focus: null, sessionKey: store.get('pickwise.active'), page: 'home', demo: false, demoAssistanceEnabled:store.get('pickwise.demo-assistance')!=='off', historyOpen: false, collapsed: store.get('pickwise.nav-collapsed') === '1', activeStep: 'identify', pageInputs: {}, details: {}, currencyDraft: null };

function coachState() {
  const context = (ui.demo ? 'demo' : 'live') + ':' + (ui.view?.id ?? 'none');
  if (ui.coachState?.context !== context) ui.coachState = { context, open:false, quote:'', question:'', selection:'', pending:false, error:null };
  return ui.coachState;
}
function captureCoachSelection() {
  const selection = window.getSelection?.();
  const anchor = selection?.anchorNode;
  const element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
  if (!element?.closest?.('#workspace-main') || element.closest('.coach-sidebar, input, textarea')) return;
  const text = String(selection ?? '').trim().slice(0,1200);
  if (!text) return;
  coachState().selection = text;
  const button = document.getElementById('coach-capture');
  if (button) button.hidden = false;
}
function openCoach(quote = null) {
  const state = coachState(); state.open = true;
  if (quote !== null) { state.quote = quote; state.selection = ''; }
  render();
  document.getElementById('coach-question')?.focus({preventScroll:true});
}
async function sendCoach(question = coachState().question) {
  const state = coachState();
  if (state.pending) return;
  if (!ui.view?.analysis) { toast('先打开一个分析报告，或体验演示案例'); return; }
  const asked = String(question).trim().slice(0,500);
  if (!asked) { toast('写下你想问的问题'); return; }
  const id = ui.view.id, seq = ui.seq;
  ui.coachRevision = (ui.coachRevision ?? 0) + 1;
  state.open = true; state.pending = true; state.error = null;
  state.pendingQuote = state.quote; state.pendingQuestion = asked;
  render();
  const scroll = () => { const log = app.querySelector('.coach-messages'); if (log) log.scrollTop = log.scrollHeight; };
  scroll();
  try {
    const next = await api.post(id,'coach',{selectedText:state.quote,question:asked});
    if (seq !== ui.seq || id !== ui.view?.id || state !== ui.coachState) return;
    // Chat responses cannot overwrite concurrent cost edits or a refreshed report.
    ui.view.coach = next.coach;
    if(ui.demo&&ui.demoTour)ui.demoTour.coach=true;
    ui.coachRevision++;
    state.question = ''; state.quote = ''; state.pending = false;
    render(); scroll(); document.getElementById('coach-question')?.focus({preventScroll:true});
  } catch (error) {
    if (seq !== ui.seq || state !== ui.coachState) return;
    state.pending = false; state.question = asked; state.error = error.message;
    render(); scroll();
  } finally { state.pending = false; }
}
document.addEventListener?.('selectionchange',captureCoachSelection);
app.addEventListener('pointerdown',event => {
  if (event.target.closest?.('[data-action^="coach-"]')) captureCoachSelection();
});
let officePlayback = new URLSearchParams(location.search).has('office-demo') ? { elapsed: 0, paused: false, speed: 1 } : null;
let disposeOffice = () => {};
let officeMotion = createOfficeMotion();
let officeMotionKey = null;
let printDisclosures = [];
let autoPitch;
function automaticPitch() { return autoPitch ??= createAutoPitch({
  enter: enterAutoPitchScene,
  cue: runAutoPitchCue,
  progress(scene, ratio) {
    if(scene.id==='office' && officePlayback) {
      // The office and all six task details use the narration's media clock.
      officePlayback.elapsed=Math.min(SIMULATION_DURATION,ratio*SIMULATION_DURATION);
      officePlayback.paused=true;
    }
  },
  change(state) {ui.autoPitch=state;render();},
  finish() {
    ui.demoTour.mode='complete';ui.demoTour.automatic=true;
    officePlayback=null;coachState().open=false;render();window.scrollTo(0,0);
  }
}); }
function autoPitchScroll(selector) {
  app.querySelector(selector)?.scrollIntoView({block:'start',behavior:'instant'});
}
function autoPitchChapter(number) {
  ui.demoTour.mode='welcome';officePlayback=null;coachState().open=false;
  render();autoPitchScroll(`[data-pitch-chapter="${number}"]`);
}
async function enterAutoPitchScene(scene, current) {
  if(!ui.demo || ui.demoAssistanceEnabled===false)return;
  if(scene.id==='opening') {
    ui.demoTour=createDemoTour();ui.pitchLowCvr=false;ui.details={};
    ui.view=await api.demo();
    if(!current())return;
    ui.pageInputs={};renderedContext=null;autoPitchChapter(1);
  } else if(scene.id==='need')autoPitchChapter(2);
  else if(scene.id==='office') {
    await visitDemoTour(0);if(!current())return;
    ui.focus=null;officePlayback={elapsed:0,paused:true,speed:1};render();autoPitchScroll('.analysis-team');
  } else if(scene.id==='competition') {
    await visitDemoTour(1);if(!current())return;
    ui.details['report:dimension-competition']=true;
    render();autoPitchScroll('#report-dimension-competition');
  } else if(scene.id==='evidence') {
    ui.demoTour.evidence=true;
    ui.details['report:dimension-demand']=true;ui.details['report:raw-demand-H1']=true;
    render();autoPitchScroll('[data-disclosure-key="raw-demand-H1"]');
  } else if(scene.id==='economics') {
    await visitDemoTour(2);if(!current())return;
    await applyDemoScenario('baseline');if(current())autoPitchScroll('#adjust');
  } else if(scene.id==='sensitivity') {
    await visitDemoTour(2);if(!current())return;
    await applyDemoScenario('baseline');if(current())autoPitchScroll('#adjust');
  } else if(scene.id==='coach') {
    await visitDemoTour(3);if(!current())return;
    autoPitchScroll('#report-dimension-profit');
    coachState().quote=ui.view.analysis.result.dimensions.find(d=>d.key==='profit').judgment;
    await sendCoach('利润最怕什么变化？请解释 CVR 减半后的成本和贡献。');
  } else if(scene.id==='practice') {
    await visitDemoTour(4);if(!current())return;
    await mutate('practice/N3/start',{});if(!current())return;
    autoPitchScroll('input[name="p-N3"]');
    app.querySelector('input[name="p-N3"]')?.closest('.practice')?.scrollIntoView({block:'center'});
  } else if(scene.id==='business')autoPitchChapter(7);
  else if(scene.id==='closing')autoPitchChapter(8);
}
async function runAutoPitchCue(scene,current) {
  if(!current() || !ui.demo)return;
  if(scene.id==='sensitivity') {
    await applyDemoScenario('low-cvr');if(current())autoPitchScroll('#adjust');
  } else if(scene.id==='practice') {
    await mutate('practice/N3/answer',{choice:'b',demonstration:true});
    if(!current())return;
    ui.demoTour.practice=false;ui.demoTour.practiceDemo=true;
    app.querySelector('input[name="p-N3"]')?.closest('.practice')?.scrollIntoView({block:'center'});
  }
}
function stopAutoPitch({free=true}={}) {
  if(!autoPitch?.state.active)return;
  autoPitch.stop();
  if(free && ui.demoTour)ui.demoTour.mode='free';
}
async function applyDemoScenario(scenario) {
  if (!ui.demo || !ui.view || ui.busy) return false;
  const seq=ui.seq, id=ui.view.id;
  const next=await api.post(id,'demo/scenario',{scenario});
  if(seq!==ui.seq || !ui.demo || ui.view?.id!==id) return false;
  ui.view=next;ui.pageInputs.evidence={};ui.currencyDraft=null;renderedContext=null;
  if(scenario==='low-cvr' && ui.demoTour)ui.demoTour.scenario=true;
  render();return true;
}
async function visitDemoTour(index) {
  if(!ui.demo)return;
  if(!ui.demoTour)ui.demoTour=createDemoTour();
  const previous=demoTourStep(ui.demoTour);
  const nextIndex=Math.min(DEMO_TOUR_STEPS.length-1,Math.max(0,Number(index)||0));
  if(previous.id==='economics' && nextIndex>ui.demoTour.index)await applyDemoScenario('baseline');
  Object.assign(ui.demoTour,{mode:'active',index:nextIndex,compact:false});
  coachState().open=false;
  navigate(DEMO_TOUR_STEPS[nextIndex].page);
}
async function handleDemoTour(action,target) {
  if(!ui.demo || !action?.startsWith('demo-tour-'))return false;
  if(action==='demo-tour-restart'){await enterDemo();return true;}
  if(ui.demoAssistanceEnabled===false)return false;
  if(!ui.demoTour)ui.demoTour=createDemoTour();
  const state=ui.demoTour;
  if(action==='demo-tour-start') {await visitDemoTour(0);officePlayback={elapsed:0,paused:false,speed:1};render();app.querySelector('.analysis-team')?.scrollIntoView({block:'start'});}
  else if(action==='demo-tour-restart')await enterDemo();
  else if(action==='demo-tour-fold'){
    if(coachState().open){coachState().open=false;state.compact=false;}
    else state.compact=!state.compact;
    render();
  }
  else if(action==='demo-tour-free'){state.mode='free';officePlayback=null;render();}
  else if(action==='demo-tour-resume')await visitDemoTour(state.index);
  else if(action==='demo-tour-step')await visitDemoTour(target.dataset.tourIndex);
  else if(action==='demo-tour-back')await visitDemoTour(state.index-1);
  else if(action==='demo-tour-next'){
    if(state.index===DEMO_TOUR_STEPS.length-1){state.mode='complete';officePlayback=null;coachState().open=false;render();window.scrollTo(0,0);}
    else await visitDemoTour(state.index+1);
  }
  else if(action==='demo-tour-finish'){state.mode='complete';coachState().open=false;render();window.scrollTo(0,0);}
  else if(action==='demo-tour-replay'){officePlayback={elapsed:0,paused:false,speed:1};render();}
  else if(action==='demo-tour-evidence'){
    state.evidence=true;ui.details['report:dimension-demand']=true;ui.details['report:raw-demand-H1']=true;render();
    app.querySelector('[data-disclosure-key="raw-demand-H1"]')?.scrollIntoView({block:'start'});
  }
  else if(action==='demo-tour-scenario')await applyDemoScenario('low-cvr');
  else if(action==='demo-tour-baseline')await applyDemoScenario('baseline');
  else if(action==='demo-tour-coach'){
    coachState().quote=ui.view.analysis.result.dimensions.find(d=>d.key==='profit').judgment;
    await sendCoach('利润最怕什么变化？请解释 CVR 减半后的成本和贡献。');
  }
  else if(action==='demo-tour-practice'){
    await mutate('practice/N3/start',{});
    app.querySelector('input[name="p-N3"]')?.closest('.practice')?.scrollIntoView({block:'center'});
  }
  else if(action==='demo-tour-download'){
    const report=await api.exportText(ui.view.id,'analysis');
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([report],{type:'text/markdown;charset=utf-8'}));link.download='Pickwise-demo-case.md';link.click();URL.revokeObjectURL(link.href);
  }
  return true;
}
let termHelp = { close() {} };
window.addEventListener?.('beforeprint', () => {
  printDisclosures = [...app.querySelectorAll('.report-dimensions details, .report-actions details')].map(element => [element, element.open]);
  for (const [element] of printDisclosures) element.open = true;
});
window.addEventListener?.('afterprint', () => {
  for (const [element, open] of printDisclosures) if (element.isConnected) element.open = open;
  printDisclosures = [];
});

function toast(message) {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = 'toast';
  element.setAttribute('role', 'status');
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 3200);
}

let renderedContext = null;
function readInputs() {
  const values = {};
  for (const el of app.querySelectorAll('input:not([type="file"]), textarea, select')) {
    if (el.id?.startsWith('coach-')) continue;
    if (el.type === 'range') continue;
    if (el.type === 'radio') { if (el.checked) values['radio:' + el.name] = el.value; }
    else if (el.id) values[el.id] = el.value;
  }
  return values;
}
function restoreInputs(saved) {
  for (const [id, value] of Object.entries(saved)) {
    if (id.startsWith('radio:')) {
      for (const el of app.querySelectorAll('input[type="radio"]')) if (el.name === id.slice(6) && !el.disabled) el.checked = el.value === value;
    } else {
      const el = document.getElementById(id);
      if (el && el.value !== undefined && el.value !== value) el.value = value;
    }
  }
}


let viewedReported = false;

function reportViewedIfNeeded() {
  if (ui.demo || !['report', 'learning'].includes(ui.page) || !ui.view?.analysis || ui.view.resultViewedAt || viewedReported) return;
  viewedReported = true;
  api.post(ui.view.id, 'viewed-result', {}).then((next) => {
    // 只吸收 resultViewedAt，不整体覆盖 ui.view（避免冲掉用户正在编辑的输入或并发状态）。
    if (!ui.demo && ui.view && ui.view.id === next.id) ui.view.resultViewedAt = next.resultViewedAt;
  }).catch(() => { viewedReported = false; });
}

function render() {
  termHelp.close();
  coachState();
  const previousChatScroll = app.querySelector?.('.coach-messages')?.scrollTop;
  disposeOffice();
  if (officeMotionKey !== (ui.view?.id ?? null)) {
    officeMotionKey = ui.view?.id ?? null;
    officeMotion = createOfficeMotion();
  }
  const context = (ui.demo ? 'demo' : 'live') + ':' + (ui.view?.id ?? 'none') + ':' + ui.page;
  const saved = renderedContext === context ? readInputs() : {};
  renderedContext = context;
  const active = document.activeElement;
  const focusId = active?.id ?? null;
  const scrollY = window.scrollY;
  const brand = '<button class="brand" data-action="home" aria-label="返回首页"><img class="brand-mark" src="/assets/brand/pickwise-icon.svg" alt="" width="42" height="42"><span>Pickwise<small>AI 选品教练</small></span></button>';
  const body = renderWorkspace(ui, { motion: officeMotion, playback: officePlayback });
  app.innerHTML = renderAppShell(ui, body, brand);
  app.querySelectorAll('details').forEach((element, index) => {
    const key = ui.page + ':' + (element.dataset.disclosureKey ?? ((element.closest('[data-step]')?.dataset.step ?? '') + ':' + index));
    if (Object.hasOwn(ui.details, key)) element.open = ui.details[key];
    element.addEventListener('toggle', () => { if (element.isConnected) {ui.details[key] = element.open;if(ui.demo&&element.open&&element.dataset.disclosureKey?.startsWith('raw-')&&ui.demoTour)ui.demoTour.evidence=true;} });
  });
  if (ui.demo) {
    app.querySelectorAll('[data-action="rerun"], [data-action="retry"], [data-action="reanalyze"], [data-action="gen-learning"], [data-action="transfer-start"], [data-action="transfer-retry"], [data-action="transfer-score"]').forEach(button => { button.disabled = true; button.title = '预制演示不调用模型，请切换到实时分析使用此功能'; });
    app.querySelectorAll('input[type="file"]').forEach(input => { input.disabled = true; input.title = '请在实时分析中导入数据'; });
    app.querySelectorAll('.coach-panel .panel-hint').forEach(el => { el.textContent = '预制演示不调用模型；实时分析中可引用证据提问。'; });
  }
  if (ui.busy) {
    app.querySelectorAll('[data-action]').forEach(button => {
      if (/^(coach-ask|retry|rerun|reanalyze|resolve|save-judgment|monitor-toggle|snapshot-now|save-constraints|practice-|transfer-|gen-learning)/.test(button.dataset.action)) button.disabled = true;
    });
    app.querySelectorAll('input[type="file"]').forEach(input => { input.disabled = true; });
  }
  app.querySelectorAll('.team-sprite-probe, .office-asset-probe').forEach((image) => {
    image.addEventListener('error', () => image.parentElement?.classList.add('asset-missing'), { once: true });
    image.addEventListener('load', () => image.parentElement?.classList.add('asset-ready'), { once: true });
  });
  disposeOffice = mountOfficeScene(app, { view: ui.view, playback: officePlayback, motion: officeMotion, onPhaseChange: () => {
    if (!app.querySelector('[data-sim-seek]:active')) render();
  } });
  if (!officePlayback) reportViewedIfNeeded();
  restoreInputs({ ...(ui.pageInputs[ui.page] ?? {}), ...saved });
  const chatLog = app.querySelector?.('.coach-messages');
  if (chatLog && previousChatScroll !== undefined) chatLog.scrollTop = previousChatScroll;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  window.scrollTo(0, scrollY);
}

async function loadList() { const seq = ui.seq; try { const result = await api.list(); if (seq === ui.seq) { ui.list = result.sessions; ui.historyPersistent = result.persistent !== false; } } catch { /* 列表失败不阻塞主流程 */ } }

async function syncBrowserHistory(identityChanged = false) {
  if (ui.demo) { if (identityChanged) { liveWorkspace = null; store.set('pickwise.active', ''); } return; }
  await loadList();
  if (ui.view && !ui.list.some(item => item.id === ui.view.id)) {
    ++ui.seq; clearTimeout(ui.pollTimer);
    ui.view = null; ui.busy = false; ui.page = 'home'; ui.texts = {}; ui.pageInputs = {}; ui.details = {}; ui.currencyDraft = null;
    ui.historyOpen = false; renderedContext = null; store.set('pickwise.active', ''); syncLocation();
  }
  render();
}
window.addEventListener?.('storage', event => {
  if (event.key !== null && event.key !== 'pickwise.browser-history.v1') return;
  let changed = event.key === null;
  if (!changed) { try { changed = JSON.parse(event.oldValue)?.token !== JSON.parse(event.newValue)?.token; } catch { changed = true; } }
  syncBrowserHistory(changed);
});

function schedulePoll() {
  clearTimeout(ui.pollTimer);
  if (!ui.view || ui.demo || officePlayback) return;
  const busy = ui.view.running || ui.view.reanalysis?.status === 'running';
  ui.pollTimer = setTimeout(refresh, busy ? 1200 : 6000);
}

async function refresh() {
  if (!ui.view || ui.demo) return;
  const id = ui.view.id;
  const requestSeq = ui.seq;
  const coachRevision = ui.coachRevision;
  try {
    const next = await api.get(id);
    if (ui.seq !== requestSeq || ui.demo || ui.view?.id !== id) return;
    const changed = next.updatedAt !== ui.view.updatedAt || next.running !== ui.view.running;
    if (coachRevision !== ui.coachRevision) next.coach = ui.view.coach;
    ui.view = next;
    if (!ui.focus) ui.activeStep = next.steps.find(step => step.status === 'running')?.id ?? ui.activeStep;
    if (changed) { await loadList(); render(); }
  } catch (error) {
    if (error.category === 'browser_changed' || error.status === 404) { await syncBrowserHistory(); return; }
    if (error instanceof ApiError && error.category === 'network') toast('与服务的连接中断，正在重试…');
  }
  schedulePoll();
}

async function openSession(id) {
  const requestSeq = ++ui.seq;
  try {
    const next = await api.get(id);
    if (requestSeq !== ui.seq) return;
    ui.view = next;
    officePlayback = null;
    ui.page = next.analysis ? 'report' : 'room';
    ui.activeStep = next.steps.find(step => step.status === 'running')?.id ?? 'identify';
    ui.currencyDraft = null; ui.focus = null; ui.pageInputs = {}; ui.details = {}; ui.historyOpen = false;
    if (!ui.demo) store.set('pickwise.active', id);
    syncLocation();
    ui.texts = {};
    ui.draft = { choice: null, reason: '' };
    ui.open = new Set();
    viewedReported = Boolean(ui.view.resultViewedAt);
    await loadList();
    render();
    schedulePoll();
    if (ui.view.analysis) loadText(ui.tab);
  } catch (error) { if (requestSeq !== ui.seq) return; ui.view = null; ui.error = error.message; render(); }
}

async function loadText(kind) {
  if (!ui.view) return;
  const id = ui.view.id, requestSeq = ui.seq;
  try { const text = await api.exportText(id, kind); if (requestSeq !== ui.seq || ui.view?.id !== id) return; ui.texts[kind] = text; render(); } catch (error) { ui.texts[kind] = `加载失败：${error.message}`; render(); }
}

async function mutate(action, body, success) {
  if (ui.busy) return;
  ui.busy = true;
  const requestSeq = ui.seq;
  const coachRevision = ui.coachRevision;
  render();
  try {
    const next = await api.post(ui.view.id, action, body);
    if (requestSeq !== ui.seq) return;
    ui.busy = false;
    if (coachRevision !== ui.coachRevision) next.coach = ui.view.coach;
    ui.view = next;
    if (action === 'constraints') ui.currencyDraft = null;
    if(ui.demo&&ui.demoTour&&/^practice\/.+\/answer$/.test(action))ui.demoTour.practice=true;
    if (action === 'operating-import') {
      ui.currencyDraft = null;
      delete ui.pageInputs.evidence;
      renderedContext = null;
    }
    ui.texts = {};
    await loadList();
    render();
    if (success) toast(success);
    schedulePoll();
    if (next.analysis) loadText(ui.tab);
    return next;
  } catch (error) { if (requestSeq === ui.seq) { ui.busy = false; toast(error.message); render(); } } finally { if (requestSeq === ui.seq) ui.busy = false; }
}

function collect(selector, attr) {
  const out = {};
  for (const el of app.querySelectorAll(selector)) out[el.dataset[attr]] = el.value;
  return out;
}

app.addEventListener('submit', async (event) => {
  if (event.target.id === 'coach-form') { event.preventDefault(); sendCoach(); return; }
  if (event.target.id !== 'entry-form') return;
  event.preventDefault();
  const input = new FormData(event.target).get('product');
  const button = event.target.querySelector('button');
  const requestSeq = ui.seq;
  button.disabled = true;
  try { if (ui.demo) { toast('预制演示使用厨房置物架案例；输入其他商品请切换到实时分析'); button.disabled = false; return; } const next = await api.create(String(input)); if (requestSeq !== ui.seq || ui.demo) return; ui.view = next; ui.page = 'room'; ui.activeStep = 'identify'; ui.currencyDraft = null; ui.pageInputs = {}; ui.details = {}; ui.seq++; syncLocation(); ui.error = null; store.set('pickwise.active', ui.view.id); ui.open = new Set(); ui.texts = {}; ui.draft = { choice: null, reason: '' }; viewedReported = false; await loadList(); render(); schedulePoll(); }
  catch (error) { if (requestSeq !== ui.seq) return; ui.error = error.message; render(); }
});

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-open], [data-toggle], [data-tab], [data-page], [data-step-select]');
  if (!target || target.disabled) return;
  const autoAction=target.dataset.action;
  if(autoAction?.startsWith('auto-pitch-')) {
    if(!ui.demo || ui.demoAssistanceEnabled===false)return;
    if(autoAction==='auto-pitch-start'){if(!ui.busy)automaticPitch().start();return;}
    if(!autoPitch?.state.active)return;
    if(autoAction==='auto-pitch-pause')await autoPitch.toggle();
    else if(autoAction==='auto-pitch-replay')await autoPitch.replay();
    else if(autoAction==='auto-pitch-mute')autoPitch.mute();
    else if(autoAction==='auto-pitch-stop'){stopAutoPitch();officePlayback=null;render();}
    return;
  }
  // Taking over a page hands control back to the visitor immediately.
  if(autoPitch?.state.active) {stopAutoPitch();render();}
  if (target.dataset.page) { navigate(target.dataset.page); return; }
  if (target.dataset.stepSelect) {
    ui.activeStep = target.dataset.stepSelect; ui.focus = ui.activeStep; ui.open = new Set([ui.activeStep]);
    if (ui.demo && officePlayback && simulationAt(officePlayback.elapsed).steps.find(step => step.id === ui.activeStep)?.status === 'pending') {
      officePlayback.elapsed = simulationStepTime(ui.activeStep);
    }
    render(); app.querySelector('.room-step-detail')?.scrollIntoView({ block: 'start' }); return;
  }
  if (target.dataset.open) { if (ui.demo) await enterDemo({ replay: true }); else openSession(target.dataset.open); return; }
  if (target.dataset.toggle) { const id = target.dataset.toggle; ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id); render(); return; }
  if (target.dataset.tab) { ui.tab = target.dataset.tab; render(); loadText(ui.tab); return; }
  const action = target.dataset.action;
  if(action==='demo-assistance-toggle'){
    if(!ui.demo)return;
    const wasPitch=ui.demoTour?.mode==='welcome';
    ui.demoAssistanceEnabled=ui.demoAssistanceEnabled===false;
    store.set('pickwise.demo-assistance',ui.demoAssistanceEnabled?'on':'off');
    render();
    if(wasPitch)window.scrollTo(0,0);
    return;
  }
  if(action==='demo-pitch-open') {
    if(!ui.demo || ui.demoAssistanceEnabled===false)return;
    ui.demoTour??=createDemoTour();ui.demoTour.mode='welcome';officePlayback=null;coachState().open=false;render();window.scrollTo(0,0);
    return;
  }
  if(action==='demo-pitch-story'){if(ui.demo&&ui.demoAssistanceEnabled!==false)app.querySelector('#pitch-story')?.scrollIntoView({block:'start'});return;}
  if(action==='demo-pitch-calculation'){
    if(!ui.demo||ui.demoAssistanceEnabled===false)return;
    ui.pitchLowCvr=target.dataset.scenario==='low';render();return;
  }
  if(action==='demo-pitch-coach'){if(ui.demo&&ui.demoAssistanceEnabled!==false)openCoach();return;}
  if(await handleDemoTour(action,target))return;
  if (action === 'coach-open') { captureCoachSelection(); openCoach(); return; }
  if (action === 'coach-close') { coachState().open = false; render(); document.getElementById('coach-launcher')?.focus({preventScroll:true}); return; }
  if (action === 'coach-use-selection') {
    captureCoachSelection(); const selected = coachState().selection;
    if (!selected) { toast('先在页面中选中一段文字，再点击引用'); return; }
    openCoach(selected); return;
  }
  if (action === 'coach-clear-quote') { coachState().quote = ''; render(); return; }
  if (action === 'coach-suggest') { const preset = (ui.demo&&ui.demoAssistanceEnabled!==false?[...COACH_QUESTIONS,...PITCH_QUESTIONS]:COACH_QUESTIONS).find(q => q.key === target.dataset.questionKey); if (preset) sendCoach(preset.question); return; }
  if (action === 'coach-ask') { sendCoach(); return; }
  const node = target.dataset.node;
  if (action === 'enter-demo' || action === 'reset-demo') { await enterDemo({ replay: ui.page === 'home' || action === 'reset-demo' }); return; }
  if (action === 'exit-demo') { await exitDemo(); return; }
  if (action === 'history') { await loadList(); ui.historyOpen = !ui.historyOpen; render(); return; }
  if (action === 'collapse-nav') { ui.collapsed = !ui.collapsed; store.set('pickwise.nav-collapsed', ui.collapsed ? '1' : '0'); render(); return; }
  if (action === 'office-preview' || action === 'office-replay') { if (!ui.demo) await enterDemo(); if(ui.demoTour?.mode==='welcome')ui.demoTour.mode='free'; clearTimeout(ui.pollTimer); ui.page = 'room'; ui.focus = null; officePlayback = { elapsed: 0, paused: false, speed: 1 }; syncLocation(); render(); return; }
  if (action === 'office-pause' && officePlayback) { officePlayback.paused = !officePlayback.paused; return; }
  if (action === 'office-next' && officePlayback) {
    officePlayback.elapsed = nextSimulationTime(officePlayback.elapsed);
    if (officePlayback.elapsed >= SIMULATION_DURATION) officePlayback.paused = true;
    ui.focus = null; render(); return;
  }
  if (action === 'office-speed' && officePlayback) { officePlayback.speed = officePlayback.speed === 1 ? 2 : officePlayback.speed === 2 ? .5 : 1; target.textContent = `${officePlayback.speed}×`; return; }
  if (action === 'office-exit') { officePlayback = null; syncLocation(); render(); schedulePoll(); return; }
  if (action === 'home') { navigate('home'); return; }
  if (action === 'demo') { await enterDemo({ replay: ui.page === 'home' }); return; }
  if (!ui.view) return;
  if (action === 'retry') return mutate('research', { mode: 'resume' });
  if (action === 'rerun') return mutate('research', { mode: 'fresh' });
  if (action === 'reanalyze') return mutate('constraints', {});
  if (action === 'resolve') return mutate('resolve', { asin: target.dataset.asin });
  if (action === 'save-judgment') {
    const choice = app.querySelector('input[name="jc"]:checked')?.value;
    const reason = document.querySelector('#jr')?.value ?? '';
    ui.draft = { choice, reason };
    if (!choice) { toast('先选一个：值得做 / 不值得做 / 不确定'); return; }
    return mutate('judgment', { choice, reason }, '直觉已保存');
  }
  if (["monitor-toggle","snapshot-now"].includes(action)) return mutate("monitoring", { enabled: action === "monitor-toggle" ? !ui.view.monitoring?.enabled : Boolean(ui.view.monitoring?.enabled), collectNow: action === "snapshot-now" });
  if (action === 'save-constraints') {
    const values = {};
    for (const el of app.querySelectorAll('[data-c]')) {
      const key = el.dataset.c;
      if (['budget', 'moq', 'goodsCostCurrency'].includes(key)) continue;
      values[key] = el.value === '' ? null : key === 'cvr' ? Number(el.value) / 100 : Number(el.value);
    }
    const body = { values, budget: app.querySelector('#c-budget').value === '' ? null : Number(app.querySelector('#c-budget').value), moq: app.querySelector('#c-moq').value === '' ? null : Number(app.querySelector('#c-moq').value), goodsCostCurrency: app.querySelector('#c-cur').value };
    const fx = collect('[data-fx]', 'fx');
    body.launch = Object.fromEntries([...app.querySelectorAll('[data-launch]')].map(el => [el.dataset.launch, el.value === '' ? null : Number(el.value)]));
    if (body.goodsCostCurrency !== 'USD') body.fx = fx.rate || fx.source || fx.date ? { rate: fx.rate, source: fx.source, date: fx.date } : null;
    else body.fx = null;
    return mutate('constraints', body, ui.demo ? '本地试算已更新；报告保留原案例结论' : '条件已保存，数字已重算，解释正在更新');
  }
  if (action === 'practice-start') return mutate(`practice/${node}/start`, {});
  if (action === 'practice-skip') return mutate(`practice/${node}/skip`, {});
  if (action === 'practice-hint') return mutate(`practice/${node}/hint`, {});
  if (action === 'practice-explain') { const details = document.querySelector(`details[data-explain="${node}"]`); if (details) details.open = !details.open; return; }
  if (action === 'practice-answer') {
    const choice = app.querySelector(`input[name="p-${node}"]:checked`)?.value;
    if (!choice) { toast('先选一个答案，或跳过'); return; }
    return mutate(`practice/${node}/answer`, { choice });
  }
  if (action === 'transfer-start' || action === 'transfer-retry') return mutate('transfer/start', {});
  if (action === 'transfer-hint') return mutate('transfer/hint', {});
  if (action === 'transfer-skip') return mutate('transfer/skip', {});
  if (action === 'transfer-score') {
    const answer = collect('[data-t]', 't');
    if (!answer.evidence?.trim() || !answer.scope?.trim() || !answer.uncertainty?.trim() || answer.postAdContribution === '') { toast('请完整回答四项，或选择跳过'); return; }
    return mutate('transfer/score', answer);
  }
  if (action === 'gen-learning') return mutate('learning/generate', {}, '学习记录已更新');
  if (action === 'print') { window.print(); return; }
  if (action === 'download') {
    try {
      const kind = target.dataset.kind;
      const text = ui.texts[kind] ?? await api.exportText(ui.view.id, kind);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      link.download = `${(ui.view.targetAsin ?? 'product')}-${kind}-v${ui.view.analysis?.version ?? 0}.md`.replace(/[^\w.-]+/g, '-');
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) { toast(error.message); }
  }
});

app.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && coachState().open) { coachState().open = false; render(); document.getElementById('coach-launcher')?.focus({preventScroll:true}); return; }
  if (event.target.id === 'coach-question' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendCoach(); return; }
  if (!['Enter', ' '].includes(event.key)) return;
  const head = event.target.closest?.('[data-toggle]');
  if (head && event.target === head) { event.preventDefault(); head.click(); }
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'coach-question') { coachState().question = event.target.value; return; }
  if (event.target.matches('[data-sim-seek]') && officePlayback) { officePlayback.elapsed = Number(event.target.value); return; }
  if (event.target.id === 'jr') ui.draft.reason = event.target.value;
});

app.addEventListener('change', async (event) => {
  if (officePlayback && event.target.matches?.('[data-sim-seek]')) {
    render(); app.querySelector('[data-sim-seek]')?.focus({ preventScroll: true }); return;
  }
  if (event.target.id === 'c-cur') { ui.currencyDraft = event.target.value; render(); return; }
  if (event.target.name === 'jc') { ui.draft.choice = event.target.value; return; }
  if (ui.demo && event.target.type === 'file') { toast('请切换到实时分析导入数据'); return; }
  if (event.target.id === 'operating-file' && event.target.files?.[0]) {
    const file = event.target.files[0];
    try { if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB'); await mutate('operating-import', { name: file.name, content: await file.text() }, '已导入经营数据，保留来源与窗口'); }
    catch (error) { toast(error.message); }
    return;
  }
  if (event.target.id !== 'evidence-file' || !event.target.files?.[0]) return;
  const file = event.target.files[0];
  const feedback = document.querySelector('#import-feedback');
  if (file.size > 5 * 1024 * 1024) { feedback.innerHTML = '<div class="callout">文件不能超过 5 MB</div>'; return; }
  try {
    const content = await file.text();
    const requestSeq = ui.seq;
    const next = await api.post(ui.view.id, 'import', { name: file.name, content });
    if (requestSeq !== ui.seq) return;
    ui.view = next;
    ui.texts = {};
    await loadList();
    render();
    const rejected = next.importResult.rejected.length;
    toast(`导入 ${next.importResult.accepted} 条${rejected ? `，排除 ${rejected} 条` : ''}${next.importResult.excluded ? `，${next.importResult.excluded} 条销量缺口径` : ''}`);
  } catch (error) { if (feedback) feedback.innerHTML = `<div class="callout">${esc(error.message)}</div>`; }
});

let liveWorkspace = null;
function syncLocation() {
  const url = new URL(location.href);
  url.searchParams.delete('office-demo');
  if (ui.demo) url.searchParams.set('demo', '1'); else url.searchParams.delete('demo');
  url.searchParams.set('page', ui.page);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
function navigate(page) {
  if (!PAGES[page]) return;
  if(ui.demo&&ui.demoAssistanceEnabled!==false&&ui.demoTour?.mode==='welcome')ui.demoTour.mode='free';
  ui.pageInputs[ui.page] = readInputs();
  ui.page = page;
  ui.historyOpen = false;
  history.replaceState(null, '', location.pathname + location.search);
  if (page !== 'room') officePlayback = null;
  if (page === 'report') ui.tab = 'analysis';
  if (page === 'learning') ui.tab = 'learning';
  syncLocation(); render(); window.scrollTo(0, 0); schedulePoll();
  if (ui.view?.analysis && ['report', 'learning'].includes(page)) loadText(ui.tab);
}
async function enterDemo({ replay = false } = {}) {
  stopAutoPitch({free:false});
  ui.pitchLowCvr=false;
  ui.demoTour=createDemoTour();
  ui.coachState = null;
  clearTimeout(ui.pollTimer); ++ui.seq;
  if (!ui.demo) liveWorkspace = { view: ui.view, list: ui.list, config: ui.config, page: ui.page, tab: ui.tab, texts: ui.texts, draft: ui.draft, open: ui.open, focus: ui.focus, pageInputs: { ...ui.pageInputs, [ui.page]: readInputs() }, details: ui.details, activeStep: ui.activeStep, currencyDraft: ui.currencyDraft };
  renderedContext = null; setDataMode('demo'); ui.demo = true; ui.busy = false; ui.view = await api.demo(); ui.config = await api.config();
  ui.currencyDraft = null; ui.page = 'room'; ui.tab = 'analysis'; ui.activeStep = 'identify'; ui.focus = null; ui.historyOpen = false; ui.error = null; ui.open = new Set(); ui.pageInputs = {}; ui.details = {}; ui.draft = { choice: null, reason: '' }; ui.texts = {}; officePlayback = null;
  // Case data is precomputed; replay its process on entry instead of showing its finished state.
  if (replay || ui.demoAssistanceEnabled === false) {
    ui.demoTour.mode = ui.demoAssistanceEnabled === false ? 'free' : 'active';
    officePlayback = { elapsed: 0, paused: false, speed: 1 };
  }
  await loadList(); syncLocation(); render(); window.scrollTo(0, 0); loadText(ui.tab);
}
async function exitDemo() {
  stopAutoPitch({free:false});
  ui.coachState = null;
  ++ui.seq; clearTimeout(ui.pollTimer); setDataMode('live'); ui.demo = false; ui.busy = false; officePlayback = null;
  const saved = liveWorkspace; liveWorkspace = null;
  await loadList();
  if (saved?.view && ui.list.some(item => item.id === saved.view.id)) { const list = ui.list; Object.assign(ui, saved); ui.list = list; }
  else { ui.view = null; ui.page = 'home'; ui.texts = {}; ui.pageInputs = {}; ui.details = {}; ui.currencyDraft = null; ui.config = await api.config().catch(() => null); }
  ui.historyOpen = false; ui.error = null; syncLocation(); render(); schedulePoll();
}
async function boot() {
  termHelp = mountTermHelp(app);
  const params = new URLSearchParams(location.search);
  const page = params.get('page');
  if (params.has('demo') || params.has('office-demo')) {
    const play = params.has('office-demo');
    await enterDemo();
    if (page && PAGES[page]) navigate(page);
    if (play) { ui.demoTour.mode='free';officePlayback = { elapsed: 0, paused: false, speed: 1 }; ui.page = 'room'; render(); }
    else { ui.demoTour.mode='welcome';render(); }
    return;
  }
  try { ui.config = await api.config(); } catch (error) { ui.error = error.message; }
  await loadList();
  const remembered = ui.sessionKey && ui.list.some(s => s.id === ui.sessionKey) ? ui.sessionKey : null;
  if (remembered) await openSession(remembered); else render();
  if (page && PAGES[page]) navigate(page);
}
boot();
