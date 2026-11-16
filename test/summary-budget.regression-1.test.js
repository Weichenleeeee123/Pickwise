import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgentTask} from '../server/agent/runner.js';
import {createSession} from '../server/session.js';
import {LlmError} from '../server/llm.js';
const session=()=>createSession({input:'B012345678',parsed:{asin:'B012345678',productName:'Fixture'}});
const options=s=>({session:s,system:'Only submit the supported answer.',user:'Original evidence '.repeat(1000),compactUser:'Compact evidence: source returned no orders.',toolNames:[],schema:{type:'object',properties:{answer:{type:'string'}},required:['answer']},textFields:o=>[{label:'answer',text:o.answer}]});
test('truncated synthesis retries once with compact material and the same token budget',async()=>{
 const s=session();const calls=[];
 const result=await runAgentTask({...options(s),llm:{chat:async request=>{
  calls.push(structuredClone(request));
  assert.equal(request.maxTokens,10000);
  if(calls.length===1){const e=new LlmError('bad_output','incomplete JSON');e.usage={input:100,output:10000};e.finishReason='length';throw e;}
  return {text:'',toolCalls:[{id:'submit',name:'submit_result',input:{answer:'证据不足'}}],usage:{input:20,output:100},ms:1};
 }}});
 assert.equal(result.value.answer,'证据不足');assert.equal(calls.length,2);assert.match(calls[1].messages[0].content,/Compact evidence/);
 assert.ok(calls[1].messages[0].content.length<calls[0].messages[0].content.length);assert.equal(s.usage.llmCalls,2);assert.equal(s.usage.outputTokens,10100);
});
test('usage from a second malformed response is still counted before surfacing failure',async()=>{
 const s=session();
 await assert.rejects(()=>runAgentTask({...options(s),llm:{chat:async()=>{const e=new LlmError('bad_output','incomplete');e.usage={input:5,output:10};throw e;}}}),/incomplete/);
 assert.equal(s.usage.llmCalls,2);assert.equal(s.usage.outputTokens,20);
});
