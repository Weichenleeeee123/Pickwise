import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const module = await import('../src/ui/browser-history.js').catch(() => ({}));
function factory(storage) {
  assert.equal(typeof module.createBrowserHistory, 'function', 'browser history implementation is required');
  return module.createBrowserHistory({ storage, crypto: webcrypto });
}
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
const view = (id, date = '2026-11-16T00:00:00Z') => ({ id, createdAt: date, updatedAt: date, product: { name: 'Printer', asin: 'B012345678' }, targetAsin: 'B012345678', research: { status: 'analysis_ready' }, evidence: [{ raw: 'private evidence' }], running: false, analysis: { large: 'not for history' } });
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';

test('browser history and credentials persist across reloads without storing raw reports', () => {
  const storage = memoryStorage(), a = factory(storage);
  assert.match(a.token(), /^[a-f0-9]{64}$/);
  a.remember(view(first));
  const b = factory(storage);
  assert.equal(b.token(), a.token());
  assert.equal(b.list()[0].id, first);
  assert.equal(b.list()[0].name, 'Printer');
  assert.equal(b.persistent, true);
  const saved = [...storage.data.values()].join('');
  assert.doesNotMatch(saved, /private evidence|not for history/);
});
test('another browser starts empty and receives an independent credential', () => {
  const a=factory(memoryStorage()), b=factory(memoryStorage());
  a.remember(view(first));
  assert.notEqual(a.token(), b.token());
  assert.deepEqual(b.list(), []);
});
test('history updates do not duplicate entries and read additions from another tab', () => {
  const storage=memoryStorage(), a=factory(storage), b=factory(storage);
  a.remember(view(first));
  b.remember(view(second, '2026-11-17T00:00:00Z'));
  a.remember({ ...view(first), research: { status: 'partial' } });
  assert.deepEqual(b.list().map(row=>row.id), [second,first]);
  assert.equal(b.list()[1].research, 'partial');
});
test('corrupt browser data starts a fresh local history without exposing old entries', () => {
  const storage=memoryStorage(), a=factory(storage);a.remember(view(first));
  for(const key of storage.data.keys()) storage.data.set(key, '{broken');
  const b=factory(storage);
  assert.deepEqual(b.list(), []);
  assert.match(b.token(), /^[a-f0-9]{64}$/);
});
test('blocked storage keeps a stable in-memory history and reports that persistence is unavailable', () => {
  const a=factory({ getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');} });
  const token=a.token();a.remember(view(first));
  assert.equal(a.token(),token);
  assert.equal(a.list()[0].id,first);
  assert.equal(a.persistent,false);
});
test('quota errors retain current records in memory and never erase prior persisted history', () => {
  const storage=memoryStorage(), a=factory(storage);a.remember(view(first));
  storage.setItem=()=>{throw new Error('quota');};
  a.remember(view(second));
  assert.equal(a.list().length,2);
  assert.equal(a.persistent,false);
  assert.equal(factory(storage).list()[0].id,first);
});
test('clearing site data rotates the credential and old requests cannot restore history', () => {
  const storage=memoryStorage(), a=factory(storage);
  const old=a.token();a.remember(view(first));storage.data.clear();
  assert.deepEqual(a.list(),[]);
  assert.notEqual(a.token(),old);
  a.remember(view(first),old);
  assert.deepEqual(a.list(),[]);
  assert.deepEqual(factory(storage).list(),[]);
});
test('a damaged or replaced identity never reuses records from the previous browser identity', () => {
  const storage=memoryStorage(), a=factory(storage);a.remember(view(first));
  for(const key of storage.data.keys()) storage.data.set(key,'{invalid');
  assert.deepEqual(a.list(),[]);
  assert.deepEqual(factory(storage).list(),[]);
});
test('API uses local history without fetching the shared list and authenticates exports', async () => {
  const previousFetch=globalThis.fetch, previousStorage=globalThis.localStorage;
  const storage=memoryStorage(), calls=[];
  globalThis.localStorage=storage;
  globalThis.fetch=async (url,options={})=>{
    calls.push({url,options});
    return new Response(String(url).includes('/export/')?'report':JSON.stringify(view(first)));
  };
  try {
    const {api,setDataMode}=await import('../src/ui/api.js?history-regression');
    assert.deepEqual((await api.list()).sessions,[]);
    assert.equal(calls.length,0);
    await api.create('B012345678');
    assert.equal((await api.list()).sessions[0].id,first);
    const token=calls[0].options.headers['x-pickwise-browser-token'];
    assert.match(token,/^[a-f0-9]{64}$/);
    assert.equal(await api.exportText(first,'analysis'),'report');
    assert.equal(calls[1].options.headers['x-pickwise-browser-token'],token);
    setDataMode('demo');await api.demo();setDataMode('live');
    assert.equal((await api.list()).sessions.length,1);
    assert.equal(calls.length,2);
    globalThis.fetch=async()=>{storage.data.clear();return new Response(JSON.stringify(view(first)));};
    await assert.rejects(api.get(first),error=>error.category==='browser_changed');
    assert.deepEqual((await api.list()).sessions,[]);
  } finally {
    globalThis.fetch=previousFetch;
    if(previousStorage===undefined)Reflect.deleteProperty(globalThis,'localStorage');else globalThis.localStorage=previousStorage;
  }
});
