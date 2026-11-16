import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isSessionId(value) {
  return ID.test(String(value));
}

// 单机 JSON 文件存储：每个会话一个文件，内存做读缓存，写入按会话串行并原子替换。
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    this.queues = new Map();
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const session = JSON.parse(await readFile(join(this.dir, name), 'utf8'));
        if (isSessionId(session.id)) this.cache.set(session.id, session);
      } catch { /* 损坏的文件跳过，不覆盖 */ }
    }
  }

  get(id) {
    return this.cache.get(id) ?? null;
  }

  list() {
    return [...this.cache.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  put(session) {
    this.cache.set(session.id, session);
    return this.save(session);
  }

  save(session) {
    const previous = this.queues.get(session.id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const target = join(this.dir, `${session.id}.json`);
      const temp = `${target}.tmp`;
      await writeFile(temp, JSON.stringify(session), 'utf8');
      await rename(temp, target);
    });
    this.queues.set(session.id, next);
    return next;
  }

  async flush() {
    await Promise.all([...this.queues.values()].map((promise) => promise.catch(() => {})));
  }
}
