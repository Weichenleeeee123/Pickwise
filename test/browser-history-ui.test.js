import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('leaving demo never restores a workspace removed from local browser history',async()=>{
  const app={querySelectorAll:()=>[],addEventListener(){},set innerHTML(value){}};
  const context=vm.createContext({
    document:{querySelector:()=>app,activeElement:null,getElementById:()=>null},
    window:{scrollY:0,scrollTo(){},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},
    location:{search:'',href:'http://localhost/',pathname:'/'},history:{replaceState(){}},URL,URLSearchParams,
    clearTimeout(){},setTimeout:()=>0,createOfficeMotion:()=>({}),mountOfficeScene:()=>()=>{},
    renderWorkspace:()=>'',renderAppShell:()=>'',setDataMode(){},PAGES:{home:[]},
    api:{list:async()=>({sessions:[]}),config:async()=>({})},ApiError:Error
  });
  const source=readFileSync(new URL('../src/ui/main.js',import.meta.url),'utf8').split('\n').filter(line=>!line.startsWith('import ')).join('\n').replace(/boot\(\);\s*$/,'');
  vm.runInContext(source+'\nglobalThis.qa={ui,exitDemo,setSaved:value=>liveWorkspace=value};',context);
  context.qa.ui.demo=true;
  context.qa.setSaved({view:{id:'cleared-private-task',steps:[],research:{status:'draft'}},list:[{id:'cleared-private-task'}],page:'room',texts:{analysis:'private report'}});
  await context.qa.exitDemo();
  assert.equal(context.qa.ui.view,null);
  assert.equal(context.qa.ui.list.length,0);
  assert.equal(context.qa.ui.texts.analysis,undefined);
});
