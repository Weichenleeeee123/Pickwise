// 仅用于界面检查：用脚本化的假模型启动服务。不属于产品运行路径，真实运行请用 npm run dev。
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { fakeLlm } from './fake-llm.js';

const store = new Store(await mkdtemp(join(tmpdir(), 'pickwise-ui-')));
await store.init();
const handler = createApp({ store, llm: fakeLlm(), publicDir: fileURLToPath(new URL('..', import.meta.url)) });
const port = Number(process.env.PORT ?? 4180);
createServer(handler).listen(port, '127.0.0.1', () => console.log(`UI check server (fake model) on ${port}`));
