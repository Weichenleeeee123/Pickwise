import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDemoPitch, PITCH_QUESTIONS } from '../src/ui/demo-pitch.js';
import { renderDemoGuide, createDemoTour } from '../src/ui/demo-guide.js';
import { renderAppShell, renderWorkspace } from '../src/ui/workspace.js';
import { renderCoachDrawer } from '../src/ui/coach.js';
import { demoProvider, resetDemo } from '../src/ui/demo-provider.js';
import { PAGES } from '../src/ui/workspace.js';

test('the unattended pitch explains user, work, teaching, business and evidence without interaction',()=>{
  const html=renderDemoPitch();
  for(const text of ['新手电商','一人','数字员工','研究没人做','数字看不懂','利润算不全','Agent 执行','五维报告','程序计算','教学','已经实现','下一步验证','¥49','¥129','待验证测试价','当前未开通收款'])assert.ok(html.includes(text),text);
  const order=['01 / 为什么做','02 / 数字员工怎样工作','03 / 为什么叫教练','04 / 亲手体验一个判断','05 / 已经做到哪一步','06 / 如何成为一门生意'].map(x=>html.indexOf(x));
  assert.ok(order.every(x=>x>=0));assert.deepEqual([...order].sort((a,b)=>a-b),order);
  assert.match(html,/data-action="demo-tour-start"/);
  assert.match(html,/href="https:\/\/pickwise.icu\/materials\/pitch-preview.pdf"/);
  assert.doesNotMatch(html,/<form|data-action="purchase"|稳赚|已有.*付费客户/);
});

test('product introduction has its own presentation and always links back to self-guided experience',()=>{
  const ui={demo:true,view:resetDemo(),page:'room',demoTour:createDemoTour(),open:new Set(),texts:{},draft:{},coachState:{open:true}};
  const body=renderWorkspace(ui);
  assert.equal(body,'','the welcome pitch does not duplicate or bury the office');
  const html=renderAppShell(ui,body,'Pickwise');
  assert.match(html,/Pickwise · AI 选品教练/);
  assert.match(html,/产品介绍/);
  assert.match(html,/给新手电商/);
  assert.equal((html.match(/id="demo-pitch-title"/g)??[]).length,1);
  assert.equal((html.match(/data-question-key=/g)??[]).length,3);
  assert.match(html,/一句话介绍 Pickwise/);
  assert.match(html,/和普通聊天有什么不同/);
  const active={...ui,demoTour:{...ui.demoTour,mode:'active'}};
  assert.match(renderWorkspace(active),/data-office-scene/,'the office remains primary once the visitor starts');
  assert.doesNotMatch(renderCoachDrawer(active),/一句话介绍 Pickwise/);
  assert.equal(renderDemoGuide({...ui,demo:false}),'');
});

test('pitch questions answer product and pricing locally without turning research fees into product pricing',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Pitch must be available without external services');};
  try {
    const view=resetDemo();
    for(const preset of PITCH_QUESTIONS)await demoProvider.post(view.id,'coach',{question:preset.question});
    const current=await demoProvider.get(view.id);
    assert.equal(current.coach.length,3);
    assert.match(current.coach[0].answer,/数字员工/);
    assert.match(current.coach[1].answer,/程序|计算/);
    assert.match(current.coach[2].answer,/单项目 ¥49、三项目包 ¥129/);
    assert.match(current.coach[2].answer,/待验证|测试方案/);
    assert.match(current.coach[2].answer,/没有收款/);
    assert.ok(current.coach.every(m=>m.simulated));
    assert.ok(current.coach.every(m=>m.contextKind==='product'&&m.analysisVersion===null));
    const fees=await demoProvider.post(view.id,'coach',{question:'Amazon FBA 怎么收费，是否已经计入利润？'});
    assert.match(fees.coach.at(-1).answer,/4.70/);
    assert.doesNotMatch(fees.coach.at(-1).answer,/单项目 ¥49/);
    const cost=await demoProvider.post(view.id,'coach',{question:'当前成本和利润如何？'});
    assert.match(cost.coach.at(-1).answer,/4.70/);
    assert.doesNotMatch(cost.coach.at(-1).answer,/单项目 ¥49/);
    assert.equal(resetDemo().coach.length,0);
  }finally{globalThis.fetch=previous;resetDemo();}
});

test('live pages never show expo pitch, guide, pricing or product prompts even with leftover demo state',()=>{
  const view=resetDemo();
  const ui={demo:false,view,config:{llm:{configured:true}},demoTour:createDemoTour(),open:new Set(),texts:{},draft:{},list:[],coachState:{open:true}};
  for(const page of Object.keys(PAGES)) {
    const state={...ui,page};
    const html=renderAppShell(state,renderWorkspace(state),'Pickwise');
    assert.doesNotMatch(html,/class="demo-pitch"|class="demo-guide|data-action="demo-pitch-|data-action="demo-tour-|自助路演|¥49|¥129|一句话介绍 Pickwise|计划怎么收费/);
    assert.match(html,/data-action="enter-demo"/,'live mode retains its existing explicit demo entry');
  }
  assert.match(renderWorkspace({...ui,page:'room',activeStep:'identify'}),/data-office-scene/);
});
