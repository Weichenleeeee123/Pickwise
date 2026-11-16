// Position and intent live independently from rendered DOM and sprite frames.
const ROWS = { south: 0, west: 1, east: 2, north: 3 };
const FLOOR_OFFSET = 59;
const TABLE = { x: 770, y: 530, rx: 170, ry: 140 };
const DESKS = [
  [140, 240, 525, 385], [120, 450, 520, 605], [95, 665, 525, 835],
  [1010, 240, 1400, 385], [1010, 450, 1415, 605], [1010, 665, 1440, 835]
];
const STOPS = [
  [550, 350], [660, 350], [770, 350], [880, 350], [990, 350],
  [550, 430], [550, 520], [550, 640], [550, 710], [550, 800], [550, 920],
  [990, 430], [990, 520], [990, 640], [990, 710], [990, 800], [990, 920],
  [660, 710], [770, 710], [880, 710], [660, 920], [770, 920], [880, 920]
];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function clearLine(a, b) {
  const count = Math.max(1, Math.ceil(distance(a, b) / 8));
  for (let i = 0; i <= count; i++) {
    const x = a[0] + (b[0] - a[0]) * i / count;
    const y = a[1] + (b[1] - a[1]) * i / count;
    if (((x - TABLE.x) / TABLE.rx) ** 2 + ((y - TABLE.y) / TABLE.ry) ** 2 < 1) return false;
    if (DESKS.some(([l, t, r, b]) => x > l && x < r && y > t && y < b)) return false;
  }
  return true;
}

function route(start, target) {
  if (distance(start, target) < .01) return [];
  if (clearLine(start, target)) return [target];
  const nodes = [start, target, ...STOPS];
  const costs = nodes.map(() => Infinity); costs[0] = 0;
  const previous = []; const visited = new Set();
  while (visited.size < nodes.length) {
    let best = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (best < 0 || costs[i] < costs[best])) best = i;
    if (best < 0 || !Number.isFinite(costs[best])) break;
    if (best === 1) {
      const result = [];
      for (let i = 1; i; i = previous[i]) result.unshift(nodes[i]);
      return result;
    }
    visited.add(best);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      const cost = costs[best] + distance(nodes[best], nodes[i]);
      if (cost < costs[i] && clearLine(nodes[best], nodes[i])) { costs[i] = cost; previous[i] = best; }
    }
  }
  return [];
}

function random(agent) {
  agent.seed = (Math.imul(agent.seed, 1664525) + 1013904223) >>> 0;
  return agent.seed / 4294967296;
}
function keepWandering(agent) {
  const first = Math.floor(random(agent) * STOPS.length);
  for (let offset = 0; offset < STOPS.length; offset++) {
    const stop = (first + offset) % STOPS.length;
    if (stop === agent.lastStop || distance(agent.point, STOPS[stop]) < 10) continue;
    const path = route(agent.point, STOPS[stop]);
    if (path.length) { agent.lastStop = stop; agent.path = path; return; }
  }
}
function intentOf(view, id) {
  if (view?.running === true && view.steps?.some(s => s.id === 'summary' && s.status === 'running')) return 'meeting';
  return view?.running === true && view.steps?.some(s => s.id === id && s.status === 'running') ? 'work' : 'idle';
}

export function newMotion() { return { initialized: false, time: 0, agents: [] }; }

function initialize(motion, view, layout) {
  if (motion.initialized) return;
  motion.initialized = true;
  motion.agents = layout.seats.map((seat, index) => {
    const intent = intentOf(view, seat.id);
    const home = [seat.x, seat.y + FLOOR_OFFSET];
    return { id: seat.id, index, home, point: [...(intent === 'meeting' ? layout.meeting[index] : home)],
      intent, path: [], seated: intent === 'work', facing: 'south',
      seed: 173 + index * 7919, lastStop: -1 };
  });
}

export function advanceMotion(motion, view, elapsed, layout, reduced = false) {
  initialize(motion, view, layout);
  // Bounded substeps keep path following stable at varying frame rates.
  let remaining = Math.max(0, elapsed);
  do {
    const delta = Math.min(50, remaining);
    motion.time += delta;
    for (const agent of motion.agents) {
      const intent = intentOf(view, agent.id);
      if (intent !== agent.intent) {
        agent.intent = intent;
        agent.path = intent === 'idle' ? [] : route(agent.point, intent === 'work' ? agent.home : layout.meeting[agent.index]);
      }
      if (reduced) {
        agent.point = [...(intent === 'meeting' ? layout.meeting[agent.index] : agent.home)];
        agent.path = []; agent.seated = intent === 'work';
        continue;
      }
      if (intent === 'idle' && !agent.path.length) keepWandering(agent);
      if (agent.path.length && delta > 0) {
        agent.seated = false;
        let travel = delta * (intent === 'idle' ? 95 : 250) / 1000;
        while (agent.path.length && travel > 0) {
          const target = agent.path[0]; const length = distance(agent.point, target);
          const dx = target[0] - agent.point[0], dy = target[1] - agent.point[1];
          if (length > .001) agent.facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'east' : 'west' : dy > 0 ? 'south' : 'north';
          if (travel >= length) {
            agent.point = [...target]; agent.path.shift(); travel -= length;
            if (intent === 'idle' && !agent.path.length) keepWandering(agent);
          }
          else { agent.point[0] += dx * travel / length; agent.point[1] += dy * travel / length; travel = 0; }
        }
      }
      agent.seated = intent === 'work' && !agent.path.length && distance(agent.point, agent.home) < .01;
    }
    remaining -= delta;
  } while (remaining > 0);
  return motionActors(motion, view, layout, reduced);
}

export function motionActors(motion, view, layout, reduced = false) {
  initialize(motion, view, layout);
  return motion.agents.map(agent => {
    const moving = agent.path.length > 0;
    const intent = intentOf(view, agent.id);
    const discussing = intent === 'meeting' && !moving;
    const posture = agent.seated ? 'seated' : moving ? 'walking' : discussing ? 'standing' : 'idle';
    const facing = discussing ? layout.meetingFacing[agent.index] : agent.seated ? 'north' : agent.facing;
    const [x, floorY] = agent.point;
    return { id: agent.id, x, y: floorY - (agent.seated ? FLOOR_OFFSET : 0), intent,
      meeting: intent === 'meeting', moving, mirrored: false, posture, facing,
      walkRow: posture === 'walking' || posture === 'idle' ? ROWS[facing] : 0,
      working: intent === 'work' && agent.seated, showEmptyChair: !agent.seated,
      status: view?.steps?.find(s => s.id === agent.id)?.status ?? 'pending',
      frame: reduced || posture === 'seated' || posture === 'idle' ? 0 : moving ? Math.floor(motion.time / 120) % 4 : 1 + Math.floor(motion.time / 420) % 2 };
  });
}
