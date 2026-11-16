// History belongs to this browser origin; full analysis stays on the server.
const KEY = 'pickwise.browser-history.v1';
const TOKEN = /^[a-f0-9]{64}$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function summary(value) {
  if (!value || !ID.test(value.id) || !Number.isFinite(Date.parse(value.createdAt))) return null;
  return {
    id: value.id, createdAt: value.createdAt,
    name: String(value.product?.name ?? value.name ?? value.targetAsin ?? value.asin ?? '待识别商品').slice(0, 300),
    asin: value.targetAsin ?? value.asin ?? null, demo: Boolean(value.demo),
    research: String(value.research?.status ?? value.research ?? 'draft'),
    running: Boolean(value.running), evidenceCount: Array.isArray(value.evidence) ? value.evidence.length : Number(value.evidenceCount ?? 0)
  };
}
export function createBrowserHistory({ storage, crypto = globalThis.crypto } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { /* Storage may be blocked. */ } }
  let credential = null, records = [], persistent = Boolean(storage);
  function fresh() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    credential = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    records = [];
    save();
  }
  function read() {
    if (!persistent) return;
    let raw;
    try { raw = storage.getItem(KEY); }
    catch { persistent = false; return; }
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 1 || typeof value.token !== 'string' || !TOKEN.test(value.token) || !Array.isArray(value.records)) { fresh(); return; }
      credential = value.token;
      records = [...new Map(value.records.map(summary).filter(Boolean).map(row => [row.id, row])).values()];
    } catch { fresh(); }
  }
  function save() {
    if (!persistent) return;
    try { storage.setItem(KEY, JSON.stringify({ version: 1, token: credential, records })); }
    catch { persistent = false; }
  }
  read();
  if (!credential) fresh();
  return {
    token() { read(); return credential; },
    list() { read(); return records.map(row => ({ ...row })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    remember(value, expectedToken) {
      const row = summary(value);
      if (!row) return;
      read();
      if (expectedToken && expectedToken !== credential) return;
      const before = records.find(item => item.id === row.id);
      if (before && JSON.stringify(before) === JSON.stringify(row)) return;
      records = [...records.filter(item => item.id !== row.id), row];
      save();
    },
    get persistent() { return persistent; }
  };
}
