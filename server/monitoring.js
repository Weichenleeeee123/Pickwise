import { addEvent } from './session.js';
const busy = new Set();
export function appendUniqueEvidence(session, records) {
  const keyOf = r => `${r.asin}|${r.evidence_kind ?? 'product'}|${r.source_url}|${r.evidence_kind === 'seller_sales' ? `${r.period_start}|${r.period_end}|${r.units_ordered}|${r.ordered_product_sales}` : r.observed_at}|${r.keyword ?? ''}`;
  const keys = new Set(session.evidence.map(keyOf));
  for (const record of records) {
    const key = keyOf(record);
    if (keys.has(key)) continue;
    keys.add(key); session.evidence.push({ ...record, id: `E${session.evidence.length + 1}` });
  }
}
export async function collectSnapshot(session, { provider, persist, now = () => new Date() }) {
  if (busy.has(session.id)) return;
  if (!session.targetAsin || session.demo) throw new Error('只有确定 ASIN 的真实商品可以采样');
  const m = session.monitoring ??= { enabled: false, intervalHours: 24, maxSamples: 7, samples: 0 };
  if ((m.samples ?? 0) >= m.maxSamples) { m.enabled = false; await persist(); return; }
  busy.add(session.id); m.samples = (m.samples ?? 0) + 1; m.lastAttemptAt = now().toISOString();
  try {
    await persist();
    if (!provider?.fetchSnapshot) throw new Error('当前数据源不支持独立快照');
    const result = await provider.fetchSnapshot({ asin: session.targetAsin });
    if (!result.records.some(r => r.asin === session.targetAsin)) throw new Error('快照未返回目标 ASIN，未保存为有效采样');
    appendUniqueEvidence(session, result.records); m.lastSuccessAt = now().toISOString(); m.lastError = null;
    session.learning.recordStale = true; addEvent(session, { type: 'snapshot_collected', records: result.records.length });
  } catch (e) { m.lastError = String(e.message).slice(0, 200); addEvent(session, { type: 'snapshot_failed' }); }
  finally { m.nextAt = new Date(now().getTime() + m.intervalHours * 3600_000).toISOString(); if (m.samples >= m.maxSamples) m.enabled = false; busy.delete(session.id); await persist(); }
}
export function startMonitor({ store, provider, intervalMs = 60000, isRunning = () => false }) {
  let ticking = false;
  const tick = async () => {
    if (ticking) return; ticking = true;
    try { for (const session of store.list()) {
      if (!session.monitoring?.enabled || isRunning(session) || Date.parse(session.monitoring.nextAt ?? 0) > Date.now()) continue;
      await collectSnapshot(session, { provider, persist: () => store.save(session) });
    } } finally { ticking = false; }
  };
  const timer = setInterval(() => tick().catch(() => {}), intervalMs); timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
