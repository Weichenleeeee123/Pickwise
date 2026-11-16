import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DEMO_TOUR_STEPS, createDemoTour, demoTourStep, renderDemoGuide, renderDemoGuideFooter } from '../src/ui/demo-guide.js';
import { DEMO_CASE } from '../src/ui/demo-data.js';
import { demoProvider, resetDemo } from '../src/ui/demo-provider.js';
import { renderWorkspace, renderAppShell, PAGES } from '../src/ui/workspace.js';
import { COACH_QUESTIONS } from '../src/ui/coach.js';

function harness(preference=null) {
  const listeners={};
  const preferences=new Map(preference ? [['pickwise.demo-assistance',preference]] : []);
  const app={querySelectorAll:()=>[],querySelector:()=>null,addEventListener(name,fn){listeners[name]=fn;},set innerHTML(value){}};
  const api=Object.fromEntries(Object.entries(demoProvider).map(([k,fn])=>[k,fn.bind(demoProvider)]));
  const context=vm.createContext({document:{querySelector:()=>app,getElementById:()=>null,activeElement:null,addEventListener(){},body:{append(){}},createElement:()=>({setAttribute(){}})},localStorage:{getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value)},location:{search:'?demo=1',href:'http://localhost/?demo=1',pathname:'/',hash:''},history:{replaceState(){}},window:{scrollY:0,scrollTo(){},addEventListener(){}},URL,URLSearchParams,setTimeout:()=>0,clearTimeout(){},createOfficeMotion:()=>({}),mountOfficeScene:()=>()=>{},renderWorkspace:()=>'',renderAppShell:()=>'',api,setDataMode(){},ApiError:Error,createDemoTour,demoTourStep,DEMO_TOUR_STEPS,PAGES,COACH_QUESTIONS});
  const source=readFileSync(new URL('../src/ui/main.js',import.meta.url),'utf8').split('\n').filter(line=>!line.startsWith('import ')).join('\n').replace(/boot\(\);\s*$/,'');
  vm.runInContext(source+'\nglobalThis.qa={ui,handleDemoTour,enterDemo,mutate,navigate,playback:()=>officePlayback};',context);
  return {...context.qa,listeners,preferences};
}

test('demo guidance explains a visitor scenario, route and free exploration without entering live pages',()=>{
  const ui={demo:true,view:structuredClone(DEMO_CASE.view),page:'room',demoTour:createDemoTour()};
  const welcome=renderDemoGuide(ui);
  assert.match(welcome,/5,000 USD/);
  assert.match(welcome,/约 3 分钟/);
  assert.match(welcome,/无需讲解员/);
  assert.equal(DEMO_TOUR_STEPS.length,5);
  assert.match(welcome,/我想自由探索/);
  assert.equal(renderDemoGuide({...ui,demo:false}),'');
  assert.equal(renderDemoGuide({...ui,view:null}),'');
  ui.demoTour.mode='active';ui.demoTour.index=1;ui.page='evidence';
  assert.match(renderDemoGuide(ui),/进度已保留/);
  assert.match(renderDemoGuide(ui),/回到这一步/);
  assert.match(renderDemoGuide(ui),/demo-guide-floating/);
  assert.equal(renderDemoGuideFooter(ui),'');
  ui.demoTour.mode='complete';
  const done=renderDemoGuide(ui);
  assert.match(done,/还可以试试/);
  assert.doesNotMatch(done,/<small>已体验/);
});

test('unattended demo can complete all stops with local actions and reset for the next visitor',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('No external services during the demo');};
  try {
    const h=harness();
    await h.enterDemo();
    assert.equal(h.ui.demoTour.mode,'welcome');
    await h.handleDemoTour('demo-tour-start',{});
    assert.equal(h.ui.demoTour.index,0);
    assert.equal(h.playback().elapsed,0);
    await h.handleDemoTour('demo-tour-next',{});
    assert.equal(h.ui.page,'report');
    assert.equal(h.playback(),null);
    await h.handleDemoTour('demo-tour-evidence',{});
    assert.equal(h.ui.details['report:raw-demand-H1'],true);
    assert.equal(h.ui.demoTour.evidence,true);
    await h.handleDemoTour('demo-tour-next',{});
    assert.equal(h.ui.page,'evidence');
    await h.handleDemoTour('demo-tour-scenario',{});
    assert.equal(h.ui.view.constraints.effective.cvr,.06);
    assert.equal(h.ui.view.econ.postAdContribution,.7);
    assert.equal(h.ui.view.analysis.stale,true);
    await h.handleDemoTour('demo-tour-scenario',{});
    assert.equal(h.ui.view.econ.postAdContribution,.7,'the preset is idempotent, not another halving');
    await h.handleDemoTour('demo-tour-next',{});
    assert.equal(h.ui.demoTour.index,3);
    assert.equal(h.ui.view.econ.postAdContribution,4.7);
    assert.equal(h.ui.view.analysis.stale,false);
    await h.handleDemoTour('demo-tour-coach',{});
    assert.equal(h.ui.coachState.open,true);
    assert.equal(h.ui.view.coach.length,1);
    assert.equal(h.ui.view.coach[0].simulated,true);
    assert.equal(h.ui.demoTour.coach,true);
    await h.handleDemoTour('demo-tour-next',{});
    assert.equal(h.ui.page,'learning');
    await h.handleDemoTour('demo-tour-practice',{});
    assert.equal(h.ui.view.practice.N3.status,'ready');
    await h.mutate('practice/N3/answer',{choice:'b'});
    assert.equal(h.ui.view.practice.N3.answer.correct,true);
    assert.equal(h.ui.demoTour.practice,true);
    await h.handleDemoTour('demo-tour-next',{});
    assert.equal(h.ui.demoTour.mode,'complete');
    assert.equal((renderDemoGuide(h.ui).match(/已体验/g)??[]).length,4);
    await h.handleDemoTour('demo-tour-restart',{});
    assert.equal(h.ui.demoTour.mode,'welcome');
    assert.equal(h.ui.demoTour.scenario,false);
    assert.equal(h.ui.view.coach.length,0);
    assert.deepEqual(h.ui.view.practice,{});
    assert.equal(h.ui.view.econ.postAdContribution,4.7);
  } finally {globalThis.fetch=originalFetch;resetDemo();}
});

test('visitors may skip, browse elsewhere and resume without claiming completed activities',async()=>{
  const h=harness();await h.enterDemo();
  await h.handleDemoTour('demo-tour-free',{});
  assert.equal(h.ui.demoTour.mode,'free');
  h.navigate('evidence');
  await h.handleDemoTour('demo-tour-resume',{});
  assert.equal(h.ui.page,'room');
  await h.handleDemoTour('demo-tour-step',{dataset:{tourIndex:'4'}});
  assert.equal(h.ui.page,'learning');
  await h.handleDemoTour('demo-tour-finish',{});
  assert.equal(h.ui.demoTour.mode,'complete');
  assert.equal(h.ui.demoTour.practice,false);
  assert.equal(h.ui.demoTour.coach,false);
});

test('the existing office-only button bypasses the pitch while replay inside a tour keeps its guide',async()=>{
  const h=harness();
  await h.listeners.click({target:{closest:()=>({dataset:{action:'office-preview'}})}});
  assert.equal(h.ui.demo,true);
  assert.equal(h.ui.demoTour.mode,'free');
  assert.ok(h.playback());
  assert.match(renderWorkspace(h.ui,{playback:h.playback()}),/data-office-scene/);
  await h.handleDemoTour('demo-tour-start',{});
  await h.listeners.click({target:{closest:()=>({dataset:{action:'office-replay'}})}});
  assert.equal(h.ui.demoTour.mode,'active');
  assert.equal(h.ui.demoTour.index,0);
});

test('the demo assistance switch preserves work and progress while restoring the original demo pages',async()=>{
  const h=harness();await h.enterDemo();
  const click=action=>h.listeners.click({target:{closest:()=>({dataset:{action}})}});
  await h.handleDemoTour('demo-tour-start',{});
  await h.handleDemoTour('demo-tour-step',{dataset:{tourIndex:'2'}});
  await h.handleDemoTour('demo-tour-scenario',{});
  const scenarioView=h.ui.view;
  await click('demo-assistance-toggle');
  assert.equal(h.ui.demoAssistanceEnabled,false);
  assert.equal(h.preferences.get('pickwise.demo-assistance'),'off');
  assert.equal(h.ui.demo,true);
  assert.equal(h.ui.view,scenarioView);
  assert.equal(h.ui.view.econ.postAdContribution,.7);
  assert.equal(h.ui.demoTour.index,2);
  assert.equal(renderDemoGuide(h.ui),'');
  const html=renderAppShell(h.ui,renderWorkspace(h.ui),'Pickwise');
  assert.match(html,/role="switch" aria-checked="false" aria-label="自助讲解"/);
  assert.doesNotMatch(html,/demo-guide-floating|demo-pitch|data-action="demo-tour-resume"|产品介绍/);
  await click('demo-pitch-open');
  assert.equal(h.ui.demoAssistanceEnabled,false);
  assert.equal(h.ui.demoTour.index,2);
  await click('demo-assistance-toggle');
  assert.equal(h.ui.demoAssistanceEnabled,true);
  assert.equal(h.ui.demoTour.index,2);
  assert.equal(h.ui.view.econ.postAdContribution,.7);
  assert.match(renderDemoGuide(h.ui),/demo-guide-floating/);
  await click('demo-assistance-toggle');
  await click('demo-tour-restart');
  assert.equal(h.ui.demoAssistanceEnabled,false,'the presenter preference survives next-visitor reset');
  assert.equal(h.ui.view.econ.postAdContribution,4.7);
  assert.match(renderWorkspace(h.ui),/data-office-scene/,'welcome state cannot hide the original demo when guidance is off');
  const refreshed=harness('off');await refreshed.enterDemo();
  assert.equal(refreshed.ui.demoAssistanceEnabled,false);
  assert.match(renderWorkspace(refreshed.ui),/data-office-scene/);
  for(const page of Object.keys(PAGES)) {
    const state={...refreshed.ui,page};
    const pageHtml=renderAppShell(state,renderWorkspace(state),'Pickwise');
    assert.doesNotMatch(pageHtml,/demo-guide-floating|class="demo-pitch"|data-action="demo-pitch-|data-action="demo-tour-resume"|data-action="demo-tour-finish"/);
  }
  h.ui.demo=false;
  const live=renderAppShell(h.ui,'','Pickwise');
  assert.doesNotMatch(live,/demo-assistance-toggle|demo-guide-floating/);
});

test('the floating guide folds independently and uses a compact layout alongside the coach',async()=>{
  const h=harness();await h.enterDemo();await h.handleDemoTour('demo-tour-start',{});
  await h.handleDemoTour('demo-tour-fold',{});
  assert.equal(h.ui.demoTour.compact,true);
  let html=renderDemoGuide(h.ui);
  assert.match(html,/is-compact/);
  assert.match(html,/id="demo-floating-content" hidden/);
  assert.match(html,/data-action="demo-tour-next"/);
  await h.handleDemoTour('demo-tour-fold',{});
  assert.equal(h.ui.demoTour.compact,false);
  h.ui.coachState={...h.ui.coachState,open:true};
  html=renderDemoGuide(h.ui);
  assert.match(html,/is-compact/);
  await h.handleDemoTour('demo-tour-fold',{});
  assert.equal(h.ui.coachState.open,false);
  assert.doesNotMatch(renderDemoGuide(h.ui),/id="demo-floating-content" hidden/);
  await h.handleDemoTour('demo-tour-free',{});
  assert.match(renderDemoGuide(h.ui),/demo-guide-floating demo-guide-paused/);
});

test('demo teaching answers, hints, retries and downloads reflect real local choices',async()=>{
  const view=resetDemo();
  let v=await demoProvider.post(view.id,'practice/N3/start');
  v=await demoProvider.post(view.id,'practice/N3/hint');
  assert.equal(v.practice.N3.hints,1);
  v=await demoProvider.post(view.id,'practice/N3/answer',{choice:'a'});
  assert.equal(v.practice.N3.answer.correct,false);
  assert.match(v.practice.N3.feedback.feedback,/获客成本/);
  assert.match(await demoProvider.exportText(view.id,'learning'),/本题需要回看方法/);
  v=await demoProvider.post(view.id,'practice/N3/start');
  assert.equal(v.practice.N3.hints,0);
  v=await demoProvider.post(view.id,'practice/N3/answer',{choice:'b'});
  assert.equal(v.practice.N3.answer.correct,true);
  await demoProvider.post(view.id,'practice/N2/skip');
  assert.match(await demoProvider.exportText(view.id,'learning'),/已跳过，理解未验证/);
  assert.equal(v.learning.outcome,'unverified');
  await assert.rejects(()=>demoProvider.post(view.id,'practice/N2/answer',{choice:'a'}),/先打开/);
  resetDemo();
});

test('the guided scenario explanation follows hand-edited costs as well as the preset',async()=>{
  const v=resetDemo();
  await demoProvider.post(v.id,'demo/scenario',{scenario:'low-cvr'});
  const changed=await demoProvider.post(v.id,'constraints',{values:{price:24,cpc:.6}});
  const html=renderDemoGuide({demo:true,view:changed,page:'evidence',demoTour:{...createDemoTour(),mode:'active',index:2}});
  assert.equal(changed.econ.acquisitionCost,10);
  assert.equal(changed.econ.postAdContribution,-7.2);
  assert.match(html,/获客成本 \$10.00，广告后贡献 \$-7.20/);
  assert.doesNotMatch(html,/贡献只剩 \$0.70/);
  resetDemo();
});

test('demo pages keep office primary and offer working teaching controls instead of unavailable model actions',()=>{
  const ui={demo:true,view:structuredClone(DEMO_CASE.view),page:'learning',open:new Set(),texts:{},draft:{},demoTour:{...createDemoTour(),mode:'active',index:4}};
  const learning=renderWorkspace(ui);
  assert.match(learning,/把研究变成你的方法/);
  assert.match(learning,/data-action="practice-start"/);
  assert.doesNotMatch(learning,/data-action="transfer-start"|data-action="gen-learning"/);
  const shell=renderAppShell(ui,learning,'Pickwise');
  assert.match(shell,/下一位体验/);
  assert.match(shell,/自助导览浮层/);
  const room=renderWorkspace({...ui,page:'room',activeStep:'identify'});
  assert.equal((room.match(/data-office-scene/g)??[]).length,1);
  assert.ok(room.indexOf('room-office')<room.indexOf('room-controls'));
  const playing=renderWorkspace({...ui,page:'room',activeStep:'identify',demoTour:{...ui.demoTour,index:0}},{playback:{elapsed:0,paused:false,speed:1}});
  assert.match(playing,/看懂了，去看结论/);
  assert.match(playing,/结束回放，查看案例步骤/);
  assert.doesNotMatch(playing,/返回真实分析/);
});
