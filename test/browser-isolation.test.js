import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { createSession } from '../server/session.js';
import { Store } from '../server/store.js';
import { fakeLlm } from '../test-support/fake-llm.js';
const A='a'.repeat(64), B='b'.repeat(64);
const hash=token=>createHash('sha256').update(token).digest('hex');
async function boot(t, deps = {}) {
 const dir=await mkdtemp(join(tmpdir(),'pickwise-isolation-'));
 const store=new Store(dir);await store.init();
 const owned=createSession({input:'B012345678',parsed:{asin:'B012345678',productName:'Private product',query:null}});
 owned.ownerHash=hash(A);await store.put(owned);
 const legacy=createSession({input:'B012345679',parsed:{asin:'B012345679',productName:'Legacy private',query:null}});await store.put(legacy);
 const server=createServer(createApp({store,llm:fakeLlm(),publicDir:process.cwd(),deps}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await store.flush();await new Promise(r=>server.close(r));});
 const call=async(path,token,body)=>{
  const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{'x-pickwise-browser-token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 return {store,owned,legacy,call,dir};
}
test('server lists only the requesting browser and never lists legacy unowned sessions',async t=>{
 const app=await boot(t);
 assert.deepEqual((await app.call('/api/sessions',B)).body.sessions,[]);
 assert.deepEqual((await app.call('/api/sessions')).body.sessions,[]);
 assert.deepEqual((await app.call('/api/sessions',A)).body.sessions.map(s=>s.id),[app.owned.id]);
});
test('other browsers cannot read change or export a session even when its ID is known',async t=>{
 const app=await boot(t), path='/api/sessions/'+app.owned.id;
 for(const token of [undefined,B]) {
  assert.equal((await app.call(path,token)).status,404);
  assert.equal((await app.call(path+'/judgment',token,{choice:'worth',reason:'intrusion'})).status,404);
  assert.equal((await app.call(path+'/export/analysis',token)).status,404);
 }
 assert.equal((await app.call(path,A)).status,200);
 assert.equal((await app.call('/api/sessions/'+app.legacy.id,A)).status,404);
 assert.equal(app.owned.judgment,null);
 assert.doesNotMatch(JSON.stringify((await app.call(path,A)).body),/ownerHash|aaaaaaaaaaaaaaaa/);
});
test('new tasks require browser credentials and persist only the credential hash',async t=>{
 const app=await boot(t);
 assert.equal((await app.call('/api/sessions',undefined,{input:'B012345678'})).status,400);
 assert.equal((await app.call('/api/demo','bad',{ })).status,400);
 const created=await app.call('/api/demo',B,{});assert.equal(created.status,200);
 const id=created.body.id;
 for(let n=0;n<200;n++) {const r=await app.call('/api/sessions/'+id,B);if(!r.body.running)break;await new Promise(r=>setTimeout(r,10));}
 await app.store.flush();
 const reloaded=new Store(app.dir);await reloaded.init();
 assert.equal(reloaded.get(id).ownerHash,hash(B));
 assert.doesNotMatch(JSON.stringify(reloaded.get(id)),new RegExp(B));
 assert.equal((await app.call('/api/sessions/'+id,A)).status,404);
});
test('private imports from other browsers never enter a new task through persisted caches',async t=>{
 let captured;
 const provider={configured:true,name:'test',fetchEvidence:async({cachedRecords})=>{captured=cachedRecords;return {records:[],cost:0};}};
 const app=await boot(t,{dataProvider:provider});
 app.owned.evidence=[{asin:'B012345678',secret:'private uploaded costs'}];
 const created=await app.call('/api/sessions',B,{input:'B012345678'});
 for(let n=0;n<200;n++) {const r=await app.call('/api/sessions/'+created.body.id,B);if(!r.body.running)break;await new Promise(r=>setTimeout(r,10));}
 assert.deepEqual(captured,[]);
});
