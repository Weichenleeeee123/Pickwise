import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createSession } from '../server/session.js';
import { completeReport } from '../server/report.js';
import { publicSourceRecord } from '../server/report-detail.js';
import { askCoach } from '../server/agent/coaching.js';
import { renderDimensionSources } from '../src/ui/evidence-detail.js';
import { renderDimensions } from '../src/ui/results.js';
import { renderAppShell, renderWorkspace } from '../src/ui/workspace.js';
import { renderCoach, renderCoachDrawer, COACH_QUESTIONS } from '../src/ui/coach.js';
import { DEMO_CASE } from '../src/ui/demo-data.js';
import { demoProvider, resetDemo } from '../src/ui/demo-provider.js';

function detailSession() {
  const s = createSession({ input:'B012345678', parsed:{asin:'B012345678',productName:'Kitchen Shelf',query:''} });
  s.evidence = [
    { id:'E1',asin:s.targetAsin,title:'Kitchen Shelf',price:30,currency:'USD',source_name:'real source',source_url:'https://example.com/product',source_mode:'live_api',observed_at:'2026-11-16' },
    { id:'E2',asin:s.targetAsin,title:'History',evidence_kind:'market_sales_estimate',history:Array.from({length:52},(_,i)=>({date:`2026-01-${String(i%28+1).padStart(2,'0')}`,purchases:i+1})),source_name:'real source',source_mode:'live_api',observed_at:'2026-11-16',_cache_key:'private-cache',token:'private-token' },
    { id:'E3',asin:s.targetAsin,title:'Official policy',evidence_kind:'official_policy',excerpt:'完整政策原文，保留本次观察范围。',source_name:'official source',observed_at:'2026-11-16',source_url:'https://example.com/policy' }
  ];
  return s;
}

test('report secondary disclosures retain all source rows and snapshot their original fields', () => {
  const s = detailSession();
  const result = completeReport(s,{dimensions:[],verdict:{bucket:'need_more'}},[]);
  assert.equal(result.report.detailVersion,1);
  assert.ok(result.dimensions.every(d=>d.interpretation.length>=2));
  assert.match(result.dimensions.find(d=>d.key==='demand').interpretation[0],/52 个来源周期/);
  const demand = result.dimensions.find(d=>d.key==='demand');
  assert.equal(demand.source_records.find(r=>r.id==='E2').history.length,52);
  assert.equal(demand.source_records.find(r=>r.id==='E2')._cache_key,undefined);
  assert.equal(demand.source_records.find(r=>r.id==='E2').token,undefined);
  const html = renderDimensionSources({analysis:{stale:false},evidence:s.evidence},demand);
  assert.match(html,/52 条/);
  assert.match(html,/查看完整字段 JSON/);
  assert.match(html,/>52<\/td>/);
  assert.doesNotMatch(html,/private-cache|private-token/);
  s.evidence[1].history[0].purchases=999;
  assert.equal(demand.source_records.find(r=>r.id==='E2').history[0].purchases,1);
  assert.match(renderDimensionSources({analysis:{stale:true},evidence:s.evidence},{key:'demand',basis:[]}),/旧版未保存原始记录快照/);
});

test('source details escape data, preserve prose and never turn untrusted links into executable content', () => {
  const record = publicSourceRecord({id:'E1',title:'<script>alert(1)</script>',excerpt:'政策第一段\n完整第二段',source_url:'javascript:alert(1)',nested:{password:'secret',observed:12},history:[{date:'2026-11-16',purchases:52}]});
  const html = renderDimensionSources({analysis:{}},{key:'risk',source_records:[record]});
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>|href="javascript:|secret/);
  assert.match(html,/完整第二段/);
});

test('demo and live use the same detailed reading and global coach sidebar', () => {
  const view = structuredClone(DEMO_CASE.view);
  const dimensions = renderDimensions(view);
  assert.equal((dimensions.match(/class="dimension-reading"/g)??[]).length,5);
  assert.equal((dimensions.match(/aria-label="本维度原始数据"/g)??[]).length,5);
  assert.match(dimensions,/评论正文样本/);
  assert.match(dimensions,/本版经营输入与程序结果/);
  const ui={view,demo:true,page:'report',open:new Set(),texts:{},coachState:{open:true,quote:'引用内容',question:'追问'}};
  const html=renderAppShell(ui,renderWorkspace(ui),'Pickwise');
  assert.equal((html.match(/id="coach-question"/g)??[]).length,1);
  assert.match(html,/role="dialog" aria-modal="false"/);
  assert.match(html,/coach-launcher/);
  assert.match(html,/pickwise-icon.svg/);
  assert.equal((html.match(/data-question-key=/g)??[]).length,4);
  assert.match(html,/引用内容/);
  assert.doesNotMatch(html,/coach-drawer/);
  assert.doesNotMatch(renderCoachDrawer({...ui,coachState:{open:false}}),/id="coach-question"/);
  view.coach=[{question:'利润如何？',answer:'按该版测算解释。',analysisVersion:1}];
  assert.match(renderCoach(view),/基于报告 v1/);
  assert.match(renderCoach(view),/报告或经营条件已变化/);
});

test('real coach receives the report, full conversation context and optional quote in its actual model prompt', async () => {
  const s=detailSession();
  const result=completeReport(s,{dimensions:[],verdict:{bucket:'need_more'}},[]);
  s.analyses=[{version:3,result,figures:[],constraintsHash:'old'}];
  const prompts=[];
  const llm={configured:true,async chat({messages}) {prompts.push(messages[0].content);return {text:'',toolCalls:[{id:'answer',name:'submit_result',input:{answer:'当前资料保留了需求历史，但个人经营成本尚未齐备。\n\n先向供应商和货代取得同规格报价，再核对平台费用与广告假设。</answer></invoke>'}}],usage:{input:10,output:10},ms:1};}};
  await askCoach(s,{llm},{question:'为什么先核价？'});
  await askCoach(s,{llm},{selectedText:'E3 政策第一段',question:'那刚才说的政策怎么查？'});
  assert.equal(s.coach.length,2);
  assert.equal(s.coach[0].selectedText,'');
  assert.equal(s.coach[0].analysisVersion,3);
  assert.doesNotMatch(s.coach[0].answer,/<\/answer>|<\/invoke>/);
  assert.match(prompts[0],/Kitchen Shelf/);
  assert.match(prompts[0],/当前报告材料/);
  assert.match(prompts[1],/为什么先核价/);
  assert.match(prompts[1],/完整政策原文/);
  assert.match(prompts[1],/"stale":true/);
  assert.doesNotMatch(prompts[1],/private-token/);
  await assert.rejects(()=>askCoach(s,{llm},{selectedText:'x'.repeat(1201),question:'解释'}),/1200/);
});

test('demo coach answers preset and follow-up questions locally and resets its own conversation', async () => {
  const oldFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('No network in demo');};
  try {
    const v=resetDemo();
    const first=await demoProvider.post(v.id,'coach',{question:COACH_QUESTIONS[0].question});
    assert.equal(first.coach.length,1);
    assert.equal(first.coach[0].simulated,true);
    assert.match(first.coach[0].answer,/120/);
    const next=await demoProvider.post(v.id,'coach',{selectedText:'CVR 减半',question:'利润会怎么变化？'});
    assert.equal(next.coach.length,2);
    assert.equal(next.coach[1].selectedText,'CVR 减半');
    assert.match(next.coach[1].answer,/0.70/);
    assert.equal(resetDemo().coach.length,0);
  } finally {globalThis.fetch=oldFetch;resetDemo();}
});

function chatHarness(post) {
  const listeners={},field={focus(){}},log={scrollTop:0,scrollHeight:100};
  const app={querySelector:()=>log,querySelectorAll:()=>[],addEventListener:(name,fn)=>{listeners[name]=fn;},set innerHTML(x){}};
  const context=vm.createContext({document:{querySelector:()=>app,getElementById:()=>field,activeElement:null,addEventListener(){},body:{append(){}},createElement:()=>({setAttribute(){}})},localStorage:{getItem:()=>null,setItem(){}},location:{search:'',href:'http://localhost/'},history:{replaceState(){}},window:{scrollY:0,scrollTo(){},addEventListener(){}},URL,URLSearchParams,setTimeout:()=>0,clearTimeout(){},createOfficeMotion:()=>({}),mountOfficeScene:()=>()=>{},renderWorkspace:()=>'',renderAppShell:()=>'',api:{post},ApiError:Error,COACH_QUESTIONS});
  const code=readFileSync(new URL('../src/ui/main.js',import.meta.url),'utf8').split('\n').filter(l=>!l.startsWith('import ')).join('\n').replace(/boot\(\);\s*$/,'');
  vm.runInContext(code+'\nglobalThis.harness={ui,sendCoach,coachState,mutate};',context);
  context.harness.ui.view={id:'case-a',analysis:{},coach:[],constraints:{price:30}};
  return {...context.harness,listeners};
}

test('pending coach calls are independent, preserve concurrent edits and cannot leak into another session', async () => {
  let finish,calls=0;
  const h=chatHarness(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  h.coachState().question='当前成本如何？';
  const request=h.sendCoach();
  assert.equal(h.coachState().pending,true);
  assert.equal(h.ui.busy,false);
  await h.sendCoach();assert.equal(calls,1);
  h.ui.view.constraints.price=27;
  finish({coach:[{question:'当前成本如何？',answer:'按当前报告核对。'}],constraints:{price:30}});
  await request;
  assert.equal(h.ui.view.constraints.price,27);
  assert.equal(h.ui.view.coach.length,1);
  assert.equal(h.coachState().question,'');
  const stale=h.sendCoach('再解释');
  h.ui.seq++;h.ui.view={id:'case-b',analysis:{},coach:[]};h.coachState();
  finish({coach:[{answer:'旧会话回答'}]});await stale;
  assert.equal(h.ui.view.coach.length,0);
  assert.equal(h.coachState().quote,'');
});

test('a delayed cost response cannot erase a newer completed coach exchange', async () => {
  let finishCost, finishChat;
  const h=chatHarness((id,action)=>new Promise(resolve=>{if(action==='coach')finishChat=resolve;else finishCost=resolve;}));
  const costs=h.mutate('constraints',{});
  const chat=h.sendCoach('先核对什么？');
  finishChat({coach:[{question:'先核对什么？',answer:'先核对成本。'}]});
  await chat;
  assert.equal(h.ui.view.coach.length,1);
  finishCost({id:'case-a',analysis:null,coach:[],constraints:{price:27}});
  await costs;
  assert.equal(h.ui.view.coach.length,1);
  assert.equal(h.ui.view.constraints.price,27);
});
