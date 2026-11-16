import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { renderEntry } from '../src/ui/shell.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('approved brand icons load as SVG and PNG without exposing private brand files', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'pickwise-brand-'));
  await mkdir(join(fixture, 'assets/brand'), { recursive: true });
  for (const name of ['pickwise-icon.svg', 'pickwise-icon-small.svg', 'pickwise-icon-32.png']) {
    await writeFile(join(fixture, 'assets/brand', name), await readFile(join(root, 'assets/brand', name)));
  }
  await writeFile(join(fixture, 'assets/brand/private.json'), '{"private":true}');
  await writeFile(join(fixture, 'assets/brand/private.svg'), '<svg/>');
  const server = createServer(createApp({ store: { list: () => [] }, llm: { configured: false }, publicDir: fixture }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const [name, type] of [['pickwise-icon.svg', 'image/svg+xml'], ['pickwise-icon-small.svg', 'image/svg+xml'], ['pickwise-icon-32.png', 'image/png']]) {
    const response = await fetch(base + '/assets/brand/' + name);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('content-type'), type, name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(join(root, 'assets/brand', name)));
  }
  for (const name of ['private.json', 'private.svg']) assert.equal((await fetch(base + '/assets/brand/' + name)).status, 404, name);
});
test('site uses the package coach in navigation, entry artwork, and favicon', async () => {
  const [html, main, css, icon] = await Promise.all(['index.html', 'src/ui/main.js', 'styles.css', 'assets/brand/pickwise-icon.svg'].map(name => readFile(join(root, name), 'utf8')));
  assert.ok(html.includes('href="/assets/brand/pickwise-icon-small.svg"'));
  assert.ok(html.includes('href="/assets/brand/pickwise-icon-32.png"'));
  assert.ok(main.includes('<img class="brand-mark" src="/assets/brand/pickwise-icon.svg"'));
  assert.ok(!main.includes('<span class="brand-mark">P</span>'));
  assert.match(renderEntry({ llm: { configured: true } }), /entry-art--coach/);
  assert.ok(renderEntry({ llm: { configured: true } }).includes('src="/assets/brand/pickwise-icon.svg"'));
  assert.match(css, /\.brand-mark \{ box-shadow: none; \}/);
  assert.match(icon, /#E8BF83/);
  assert.doesNotMatch(icon, /#D6A76C|<script|<image|href=/);
});
