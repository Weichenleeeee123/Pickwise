import { esc, fmtTime, statusTag } from './common.js';
import { OFFICE_LAYOUT, sceneActors, simulationAt, SIMULATION_DURATION } from './office-scene.js';

export const ANALYSIS_TEAM = {
  identify: { name: '商品识别', specialty: '确认商品与规格', initials: '侦', asset: '/assets/team/identify-occupied-v6.webp' },
  demand: { name: '需求研究', specialty: '查看需求与趋势', initials: '需', asset: '/assets/team/demand-occupied-v6.webp' },
  competition: { name: '竞品研究', specialty: '比较同类商品', initials: '竞', asset: '/assets/team/competition-occupied-v6.webp' },
  profit: { name: '利润分析', specialty: '核对费用与情景', initials: '利', asset: '/assets/team/profit-occupied-v6.webp' },
  risk: { name: '风险核验', specialty: '核查官方来源', initials: '险', asset: '/assets/team/risk-occupied-v6.webp' },
  summary: { name: '研究教练', specialty: '汇总证据与方法', initials: '教', asset: '/assets/team/summary-occupied-v6.webp' }
};
export const OFFICE_ASSETS = { background: '/assets/team/office-computers-v4.webp', chair: '/assets/team/chair-empty-v6.webp' };
export const SPECIALIST_ASSETS = {};
const EVENT_TITLES = { step_start: '开始分析', step_done: '步骤结束', step_failed: '步骤失败', step_fallback: '通用讲解', tool: '读取数据', repair: '校验后重试', agent_start: '专员开始工作', agent_done: '专员完成工作', agent_failed: '专员未完成', research_start: '开始研究', research_end: '研究结束', supplemental_start: '补充采集', supplemental_done: '补充采集完成', result_viewed: '查看报告', analysis: '整理初筛结论' };

export function teamDiscussionState(view) {
  const summary = view?.steps?.find(step => step.id === 'summary');
  if (view?.running === true && summary?.status === 'running') return 'discussion';
  if (summary?.status === 'done') return 'review';
  return 'quiet';
}
export function teamSpriteState(status, running) {
  return { frame: status === 'done' ? 3 : status === 'running' ? 1 : 0, working: status === 'running' && running === true };
}
function sceneMarkup(view, motion = null) {
  const available = view?.teamAssetsAvailable === true;
  const actors = sceneActors(view, motion?.initialized ? motion : null);
  const people = [...actors].sort((a, b) => a.y - b.y).map(actor => {
    const member = ANALYSIS_TEAM[actor.id];
    const standingAsset = `/assets/team/${actor.id}-standing-v7.webp`;
    const walkingAsset = `/assets/team/${actor.id}-walking-four-v11.webp`;
    const geometry = actor.posture !== 'seated' ? OFFICE_LAYOUT.standingSprite : OFFICE_LAYOUT.seatSprite;
    return `<g data-actor="${actor.id}" data-working="${actor.working}" data-posture="${actor.posture}" data-facing="${actor.facing}" data-standing-asset="${standingAsset}" data-walking-asset="${walkingAsset}" data-seated-asset="${member.asset}" data-frame="${actor.frame}" data-walk-row="${actor.walkRow}" transform="translate(${actor.x} ${actor.y})"><g data-actor-visual transform="${actor.mirrored ? 'scale(-1 1)' : 'scale(1 1)'}">${available ? `<svg class="office-character" x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" viewBox="${actor.frame * 256} ${actor.walkRow * 256} 256 256" preserveAspectRatio="xMidYMid meet" overflow="hidden"><image href="${['walking', 'idle'].includes(actor.posture) ? walkingAsset : actor.posture === 'standing' ? standingAsset : member.asset}" x="0" y="0" width="1024" height="${['walking', 'idle'].includes(actor.posture) ? 1024 : 256}" /></svg>` : `<circle cx="0" cy="-60" r="28" fill="#e7b08b" /><path d="M-32,-32 Q0,-48 32,-32 L36,20 L-36,20Z" fill="#527c69" />`}</g><title>${member.name} · ${member.specialty}</title></g>`;
  }).join('');
  const emptySeats = OFFICE_LAYOUT.seats.map(seat => `<g transform="translate(${seat.x} ${seat.y})" data-empty-seat="${seat.id}" opacity="${actors.find(actor => actor.id === seat.id)?.showEmptyChair ? 1 : 0}">${available ? `<image href="${OFFICE_ASSETS.chair}" x="${OFFICE_LAYOUT.seatSprite.x}" y="${OFFICE_LAYOUT.seatSprite.y}" width="${OFFICE_LAYOUT.seatSprite.width}" height="${OFFICE_LAYOUT.seatSprite.height}" preserveAspectRatio="xMidYMid meet" />` : '<rect x="-28" y="-18" rx="10" width="56" height="54" fill="#355d4b" />'}</g>`).join('');
  const names = OFFICE_LAYOUT.seats.map(seat => `<g transform="translate(${seat.x} ${seat.y + 90})"><rect x="-70" y="-19" rx="9" width="140" height="32" fill="#233e32" fill-opacity=".88" /><text text-anchor="middle" font-size="20" fill="#fff9ed">${ANALYSIS_TEAM[seat.id].name}</text></g>`).join('');
  return `<div class="office-stage" data-discussion="${teamDiscussionState(view)}"><svg class="office-world" data-office-scene viewBox="0 0 1536 1024" width="1536" height="1024" role="img" aria-label="俯视电商研究办公室：左右各三张电脑工位，中央一张圆桌"><g class="office-scenery">${available ? `<image href="${OFFICE_ASSETS.background}" width="1536" height="1024" preserveAspectRatio="xMidYMid meet" />` : `<rect width="1536" height="1024" fill="#e8d8b8" /><rect width="1536" height="170" fill="#dae2d2" /><ellipse cx="768" cy="625" rx="143" ry="108" fill="#a5794b" />${OFFICE_LAYOUT.seats.map(seat => `<rect x="${seat.x - 140}" y="${seat.y - 125}" rx="10" width="280" height="100" fill="#b3aa8b" />`).join('')}`}</g><g class="office-empty-seats">${emptySeats}</g><g class="office-people">${people}</g><g class="office-nameplates">${names}</g></svg></div>`;
}

export function renderAnalysisTeam(view, { playback = null, motion = null, collapsibleRoles = false, guidedNext = false } = {}) {
  const current = playback ? simulationAt(playback.elapsed) : view;
  const simulation = Boolean(playback);
  const roles = Object.entries(ANALYSIS_TEAM).map(([id, actor]) => {
    const step = current?.steps?.find(item => item.id === id) ?? { status: 'pending' };
    return `<li class="office-role-item" data-team-step="${id}"><b>${actor.name}</b><span data-role-status="${id}" data-status="${step.status}">${({pending:'待命',running:'分析中',done:'已完成',unverified:'待核实',insufficient:'证据不足',failed:'失败',blocked:'等你确认'})[step.status] ?? '待命'}</span><small>${actor.specialty}</small></li>`;
  }).join('');
  const events = Array.isArray(current?.events) ? [...current.events].sort((a,b) => (b?.seq ?? 0) - (a?.seq ?? 0)).slice(0,4) : [];
  const log = events.map(event => `<li><b>${esc(event.label || EVENT_TITLES[event.type] || '分析记录')}</b><span>${esc(event.message || event.name || event.agent_role || event.role || '')}</span>${event.ts ? `<time>${esc(fmtTime(event.ts).slice(-8))}</time>` : ''}</li>`).join('');
  const roleList = `<ol class="office-role-list">${roles}</ol>`;
  return `<section class="analysis-team modern-office${simulation ? ' office-simulation' : ''}" aria-labelledby="analysis-team-title"><header class="team-heading"><div><span class="eyebrow">${simulation ? '本地模拟 · 无外部调用' : view?.demo ? '教学模拟 · 分析记录' : '实时研究 · 事件驱动'}</span><h2 id="analysis-team-title">电商研究办公室</h2><p>${simulation ? '脚本演示团队协作，示例内容不构成真实选品结论。' : '角色跟随真实任务状态。步骤完成不代表结论已获验证。'}</p></div><button class="btn" data-action="office-preview">${simulation ? '重新开始' : '模拟回放'}</button></header>${sceneMarkup(current, playback ? null : motion)}<div class="office-caption"><strong data-sim-phase>${esc(simulation ? current.phase : teamDiscussionState(current) === 'discussion' ? '圆桌汇总' : current?.running ? '研究进行中' : '研究记录')}</strong><span data-sim-caption>${esc(simulation ? current.caption : '查看各工位状态，详细证据与教学解释见下方分析步骤。')}</span>${guidedNext?'<button class="btn primary" data-action="demo-tour-next">看懂了，去看结论 →</button>':''}</div>${simulation ? `<div class="office-playback"><button class="btn primary" data-action="office-pause" aria-pressed="${Boolean(playback.paused)}">${playback.paused ? '继续' : '暂停'}</button><button class="btn" data-action="office-next" ${playback.elapsed >= SIMULATION_DURATION ? 'disabled' : ''}>下一步 →</button><button class="btn" data-action="office-replay">重播</button><label>进度<input data-sim-seek type="range" min="0" max="${SIMULATION_DURATION}" step="100" value="${playback.elapsed}" aria-label="演示进度" /></label><span data-sim-clock>${Math.floor(playback.elapsed / 1000)} / 42 秒</span><button class="btn" data-action="office-speed">${playback.speed || 1}×</button><button class="btn" data-action="office-exit">${view?.demo ? '结束回放，查看案例步骤' : view ? '返回真实分析' : '返回首页'}</button></div>` : ''}${collapsibleRoles ? `<details class="office-members" data-disclosure-key="office-members"><summary>六位研究角色的状态</summary>${roleList}</details>` : roleList}${log ? `<details class="office-event-details" data-disclosure-key="office-events"><summary>最近${simulation ? '模拟' : view?.preloadedDemo ? '案例' : '真实'}事件</summary><ol>${log}</ol></details>` : ''}</section>`;
}
