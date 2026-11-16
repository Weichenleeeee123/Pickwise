import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { createSession } from '../server/session.js';

test('serves team images as WebP while keeping non-public files outside the static allowlist', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pickwise-assets-'));
  await mkdir(join(root, 'assets', 'team'), { recursive: true });
  const bytes = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
  await writeFile(join(root, 'assets', 'team', 'identify.webp'), bytes);
  await writeFile(join(root, 'assets', 'team', 'private.json'), '{"private":true}');
  await writeFile(join(root, '.env'), 'SECRET=fixture');
  const session = createSession({ input: 'B012345678', parsed: { asin: 'B012345678', productName: null, query: null } });
  session.ownerHash = createHash('sha256').update('c'.repeat(64)).digest('hex');
  const store = { get: (id) => id === session.id ? session : null, list: () => [] };
  const server = createServer(createApp({ store, llm: { configured: false }, publicDir: root }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const image = await fetch(`${base}/assets/team/identify.webp`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  assert.equal((await fetch(`${base}/assets/team/private.json`)).status, 404);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  let view = await fetch(`${base}/api/sessions/${session.id}`, { headers: { 'x-pickwise-browser-token': 'c'.repeat(64) } }).then(response => response.json());
  assert.equal(view.teamAssetsAvailable, false);
  for (const role of ['identify-occupied-v6', 'demand-occupied-v6', 'competition-occupied-v6', 'profit-occupied-v6', 'risk-occupied-v6', 'summary-occupied-v6', 'office-computers-v4', 'chair-empty-v6', ...['identify', 'demand', 'competition', 'profit', 'risk', 'summary'].flatMap(role => [`${role}-standing-v7`, `${role}-walking-four-v11`])]) {
    await writeFile(join(root, 'assets', 'team', `${role}.webp`), bytes);
  }
  view = await fetch(`${base}/api/sessions/${session.id}`, { headers: { 'x-pickwise-browser-token': 'c'.repeat(64) } }).then(response => response.json());
  assert.equal(view.teamAssetsAvailable, true);
});
