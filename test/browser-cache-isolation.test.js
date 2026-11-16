import test from 'node:test';
import assert from 'node:assert/strict';
import { createApify } from '../server/apify.js';
import { createDataForSeo } from '../server/dataforseo.js';

test('provider memory caches never carry private persisted records to another browser', async () => {
  const at='2026-11-16T00:00:00Z';
  for(const kind of ['apify','dataforseo']) {
    let calls=0;
    const fetchImpl=async()=>{calls++;return new Response(JSON.stringify(kind==='apify'?[]:{status_code:20000,tasks:[{status_code:20000,result:[{items:[]}]}]}));};
    const options={token:'test',login:'test',password:'test',now:()=>new Date(at),fetchImpl};
    const provider=kind==='apify'?createApify(options):createDataForSeo(options);
    const record={asin:'B012345678',observed_at:at,_cache_key:kind==='apify'?'amazon:v5:query:printer':'amazon:query:printer',private_quote:'supplier confidential'};
    const own=await provider.fetchEvidence({query:'printer',cachedRecords:[record],cacheNamespace:'browser-a'});
    assert.equal(own.records[0].private_quote,'supplier confidential');
    const other=await provider.fetchEvidence({query:'printer',cachedRecords:[],cacheNamespace:'browser-b'});
    assert.doesNotMatch(JSON.stringify(other),/supplier confidential/,kind);
    assert.ok(calls>0,kind+' must not use another browser cache');
  }
});
