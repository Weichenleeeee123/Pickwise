import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, addEvent } from '../server/session.js';
import { buildView } from '../server/view.js';

test('projects specialist identity and lifecycle fields to the client event stream', () => {
  const session = createSession({
    input: 'B012345678',
    parsed: { asin: 'B012345678', productName: null, query: null }
  });
  addEvent(session, {
    type: 'agent_start', step: 'demand', agent_id: 'demand_analyst',
    agent_role: '需求分析', responsibility: '评估搜索和销量信号', status: 'running',
    message: '正在检查需求证据'
  });

  const view = buildView(session);

  assert.deepEqual(view.events[0], {
    seq: 1, ts: session.events[0].ts, type: 'agent_start', step: 'demand',
    label: undefined, name: undefined, ok: undefined, ms: undefined,
    status: 'running', problems: undefined, agent_id: 'demand_analyst',
    agent_role: '需求分析', responsibility: '评估搜索和销量信号',
    message: '正在检查需求证据'
  });
});
