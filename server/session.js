import { randomUUID } from 'node:crypto';

export const STEP_DEFS = [
  { id: 'identify', title: '商品识别' },
  { id: 'demand', title: '需求证据' },
  { id: 'competition', title: '竞品比较' },
  { id: 'profit', title: '利润与资金' },
  { id: 'risk', title: '风险核验' },
  { id: 'summary', title: '教学总结' }
];

export const COST_KEYS = ['price', 'goodsCost', 'logisticsCost', 'platformCost', 'returnsCost', 'otherCost', 'cpc', 'cvr'];

export function freshSteps() {
  return STEP_DEFS.map((def) => ({ ...def, status: 'pending', startedAt: null, endedAt: null, activity: null, card: null, error: null, templateOnly: false }));
}

export function createSession({ input, parsed, demo = false }) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    input,
    demo,
    market: 'Amazon US',
    product: { asin: parsed.asin, name: parsed.productName, query: parsed.query },
    targetAsin: parsed.asin !== '待识别' ? parsed.asin : null,
    research: { status: 'draft', runId: null, startedAt: null, completedAt: null, firstResultAt: null, error: null },
    dataSource: { provider: 'DataForSEO', status: 'pending', observedAt: null, cost: 0, error: null },
    resultViewedAt: null,
    identity: { assessment: null, chosen: null },
    constraints: { currency: 'USD', values: Object.fromEntries(COST_KEYS.map((key) => [key, null])), budget: null, moq: null, goodsCostCurrency: 'USD', fx: null, provenance: 'user', updatedAt: null },
    evidence: [],
    supplementalSources: {},
    monitoring: { enabled: false, intervalHours: 24, maxSamples: 7, samples: 0, nextAt: null, lastError: null },
    evidenceRejected: [],
    importLog: [],
    steps: freshSteps(),
    events: [],
    seq: 0,
    teaching: { nodes: [], reasons: {}, deferred: [], issues: [], lessons: {}, skippedAll: false },
    practice: {},
    judgment: null,
    analyses: [],
    comparison: null,
    transfer: null,
    learning: { record: null, recordStale: true, recordStatus: 'none' },
    usage: { llmCalls: 0, inputTokens: 0, outputTokens: 0, llmMs: 0, toolCalls: 0, failures: 0 }
  };
}

export function addEvent(session, event) {
  session.seq += 1;
  session.events.push({ seq: session.seq, ts: new Date().toISOString(), ...event });
  if (session.events.length > 600) session.events.splice(0, session.events.length - 600);
  session.updatedAt = new Date().toISOString();
  return session.seq;
}

export function getStep(session, id) {
  return session.steps.find((step) => step.id === id);
}

export function latestAnalysis(session) {
  return session.analyses[session.analyses.length - 1] ?? null;
}

export function learningState(session) {
  if (session.teaching.skippedAll) return 'skipped';
  if (session.transfer?.result) return 'completed';
  const nodes = session.teaching.nodes;
  const practiced = nodes.length > 0 && nodes.every((id) => ['done', 'skipped'].includes(session.practice[id]?.status));
  if (practiced) return 'transfer_pending';
  return session.research.status === 'draft' ? 'not_started' : 'coaching';
}

export function learningOutcome(session) {
  return session.transfer?.result?.outcome ?? 'unverified';
}
