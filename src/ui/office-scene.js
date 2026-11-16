import { newMotion, advanceMotion, motionActors } from './office-motion.js';

export const OFFICE_LAYOUT = {
  size: [1536, 1024],
  seats: [
    { id: 'identify', x: 350, y: 370 }, { id: 'demand', x: 330, y: 580 },
    { id: 'competition', x: 300, y: 807 }, { id: 'profit', x: 1185, y: 370 },
    { id: 'risk', x: 1210, y: 580 }, { id: 'summary', x: 1230, y: 807 }
  ],
  meeting: [[580, 469], [770, 365], [960, 469], [580, 676], [770, 780], [960, 676]],
  meetingFacing: ['east', 'south', 'west', 'northeast', 'north', 'northwest'],
  seatSprite: { x: -108, y: -145, width: 216, height: 238 },
  standingSprite: { x: -108, y: -204, width: 216, height: 238 }
};
export const SIMULATION_DURATION = 42000;
const PHASES = [
  { at: 0, title: '先确认：到底研究哪一款？', text: '模拟案例：锁定双层银色厨房置物架。三层变体不混用，后面的售价、销量与成本才有同一个对象。', active: ['identify'] },
  { at: 6000, title: '有人买，和我能做，是两个问题', text: '模拟案例：需求专员读取六个月历史；竞品专员核对三个独立双层架。搜索热度不等于订单，同父体也不算新对手。', active: ['demand', 'competition'] },
  { at: 12000, title: '把商品信号接到经营条件上', text: '模拟案例：需求从 340 增至 438 件，竞品中位价 $29.90。利润专员还要算物流、平台费、退货与广告，不能只用售价减采购。', active: ['demand', 'competition', 'profit'] },
  { at: 20000, title: '算得出利润，也要看资金与风险', text: '模拟案例：广告后贡献 $4.70，启动现金 $2,966。风险角色检查预制材料；这里是虚构核验流程，不是实际商品的认证。', active: ['profit', 'risk'] },
  { at: 27000, title: '把依据整理成能执行的结论', text: '模拟案例：首批 120 件试销，围绕层高与护角包装打样。圆桌动画展示汇总过程，具体数据、边界与动作都在报告里。', active: ['summary'] },
  { at: 36000, title: '完成研究，也留下可以复用的方法', text: '模拟案例：下一站看结论，再动手把转化率减半。你会看到 $4.70 为什么会变成 $0.70，理解条件比记住答案更重要。', active: [] },
  { at: SIMULATION_DURATION, title: '协作回放完成', text: '模拟回放已结束。可以重播，或点导览中的“去看分析结论”。全程未请求模型或外部数据源。', active: [] }
];

export function simulationAt(elapsed) {
  const ms = Math.min(SIMULATION_DURATION, Math.max(0, Number(elapsed) || 0));
  const index = PHASES.findLastIndex(phase => phase.at <= ms);
  const phase = PHASES[index];
  const seen = new Set(PHASES.slice(0, index + 1).flatMap(item => item.active));
  return { simulated: true, demo: true, teamAssetsAvailable: true, running: ms < SIMULATION_DURATION,
    caption: phase.text, phase: phase.title, elapsed: ms,
    steps: OFFICE_LAYOUT.seats.map(seat => ({ id: seat.id, status: phase.active.includes(seat.id) ? 'running' : seen.has(seat.id) ? 'done' : 'pending', activity: phase.text })),
    events: PHASES.slice(0, index + 1).map((item, seq) => ({ seq: seq + 1, type: 'simulation', label: item.title, message: item.text })) };
}

export function createOfficeMotion() { return newMotion(); }

export function advanceOfficeMotion(motion, view, delta, reducedMotion = false) {
  return advanceMotion(motion, view, delta, OFFICE_LAYOUT, reducedMotion);
}

// Cached deterministic replay keeps seeking and pause tied to the same clock.
let preview = { time: 0, motion: newMotion(), reduced: false };
function previewActors(view, reduced = false) {
  const target = Math.min(SIMULATION_DURATION, Math.max(0, view.elapsed || 0));
  if (target < preview.time || reduced !== preview.reduced) preview = { time: 0, motion: newMotion(), reduced };
  while (preview.time < target) {
    const boundary = PHASES.find(phase => phase.at > preview.time)?.at ?? target;
    const end = Math.min(target, boundary);
    advanceOfficeMotion(preview.motion, simulationAt(preview.time), end - preview.time, reduced);
    preview.time = end;
  }
  return advanceOfficeMotion(preview.motion, view, 0, reduced);
}

export function sceneActors(view, motion = null) {
  if (view?.simulated) return previewActors(view, motion?.reducedMotion ?? false);
  return motionActors(motion ?? newMotion(), view, OFFICE_LAYOUT, motion?.reducedMotion ?? false);
}

// Updates only the scene and its demonstration controls, never stored reports.
export function mountOfficeScene(root, { view, playback, motion = createOfficeMotion() } = {}) {
  const scene = root.querySelector('[data-office-scene]');
  if (!scene) return () => {};
  for (const actor of scene.querySelectorAll('[data-standing-asset]')) {
    if (!actor.querySelector('image')) continue;
    for (const src of [actor.dataset.standingAsset, actor.dataset.walkingAsset]) {
      if (src) { const preload = new Image(); preload.src = src; }
    }
  }
  let raf = 0; let last = performance.now();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousPhase = '';
  const tick = (time) => {
    const delta = document.hidden ? 0 : Math.min(100, time - last); last = time;
    if (playback && !playback.paused) playback.elapsed = Math.min(SIMULATION_DURATION, playback.elapsed + delta * (playback.speed || 1));
    const current = playback ? simulationAt(playback.elapsed) : view;
    const actors = playback ? sceneActors(current, { reducedMotion }) : advanceOfficeMotion(motion, current, delta, reducedMotion);
    const people = scene.querySelector('.office-people');
    for (const actor of actors) {
      const group = scene.querySelector(`[data-actor="${actor.id}"]`);
      if (!group) continue;
      group.setAttribute('transform', `translate(${actor.x.toFixed(2)} ${actor.y.toFixed(2)})`);
      const sprite = group.querySelector('svg');
      if (sprite && group.dataset.posture !== actor.posture) {
        const standing = actor.posture !== 'seated';
        const geometry = standing ? OFFICE_LAYOUT.standingSprite : OFFICE_LAYOUT.seatSprite;
        for (const [key, value] of Object.entries(geometry)) sprite.setAttribute(key, String(value));
        const image = sprite.querySelector('image');
        image?.setAttribute('href', ['walking', 'idle'].includes(actor.posture) ? group.dataset.walkingAsset : standing ? group.dataset.standingAsset : group.dataset.seatedAsset);
        image?.setAttribute('width', '1024');
        image?.setAttribute('height', ['walking', 'idle'].includes(actor.posture) ? '1024' : '256');
        group.dataset.posture = actor.posture;
      }
      group.dataset.facing = actor.facing;
      group.dataset.moving = String(actor.moving);
      if (group.dataset.frame !== String(actor.frame) || group.dataset.walkRow !== String(actor.walkRow)) {
        sprite?.setAttribute('viewBox', `${actor.frame * 256} ${actor.walkRow * 256} 256 256`);
        group.dataset.frame = String(actor.frame);
        group.dataset.walkRow = String(actor.walkRow);
      }
      group.dataset.working = String(actor.working);
      const empty = scene.querySelector(`[data-empty-seat="${actor.id}"]`);
      if (empty) empty.setAttribute('opacity', actor.showEmptyChair ? '1' : '0');
    }
    const order = [...actors].sort((a, b) => a.y - b.y).map(actor => scene.querySelector(`[data-actor="${actor.id}"]`));
    if (people && order.some((group, index) => people.children[index] !== group)) people.append(...order);
    if (playback) {
      if (playback.elapsed >= SIMULATION_DURATION) playback.paused = true;
      if (current.phase !== previousPhase) {
        previousPhase = current.phase;
        root.querySelectorAll('[data-sim-caption]').forEach(el => { el.textContent = current.caption; });
        root.querySelectorAll('[data-sim-phase]').forEach(el => { el.textContent = current.phase; });
      }
      root.querySelectorAll('[data-sim-clock]').forEach(el => { el.textContent = `${Math.floor(playback.elapsed / 1000)} / ${SIMULATION_DURATION / 1000} 秒`; });
      root.querySelectorAll('[data-action="office-pause"]').forEach(el => { el.textContent = playback.paused ? '继续' : '暂停'; el.setAttribute('aria-pressed', String(playback.paused)); });
      root.querySelectorAll('[data-sim-seek]').forEach(el => { if (document.activeElement !== el) el.value = playback.elapsed; });
      for (const step of current.steps) {
        const el = root.querySelector(`[data-role-status="${step.id}"]`);
        if (el) { el.textContent = ({ pending: '待命', running: '分析中', done: '已完成', unverified: '待核实' })[step.status]; el.dataset.status = step.status; }
      }
      scene.dataset.phase = current.phase;
      scene.closest('.office-stage')?.setAttribute('data-discussion', current.steps.some(step => step.id === 'summary' && step.status === 'running') ? 'discussion' : 'quiet');
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
