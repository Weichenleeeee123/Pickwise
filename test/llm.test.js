import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../server/llm.js';

test('accepts an OpenAI-compatible full chat completions URL without appending it twice', async () => {
  let requestedUrl;
  const llm = createLlm({
    LLM_PROVIDER: 'openai',
    LLM_BASE_URL: 'https://example.test/v1/chat/completions',
    LLM_API_KEY: 'test-key',
    LLM_MODEL: 'test-model'
  }, async (url) => {
    requestedUrl = url;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: {} }), { status: 200 });
  });

  await llm.chat({ system: 'system', messages: [{ role: 'user', content: 'hello' }] });

  assert.equal(requestedUrl, 'https://example.test/v1/chat/completions');
});
