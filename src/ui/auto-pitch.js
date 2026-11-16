import { NARRATION_RATE, NARRATION_SCENES } from './demo-narration.js';
import { esc } from './common.js';

const seconds = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export const AUTO_PITCH_DURATION = NARRATION_SCENES.reduce((sum, scene) => sum + scene.duration / NARRATION_RATE, 0);

// Audio lives outside the rendered workspace, so page changes never restart it.
// Scene transitions and timed actions follow the media clock, including pause.
export function createAutoPitch({ enter, cue, progress, change, finish }) {
  const state = { active:false, paused:false, index:0, time:0, muted:false, error:'', caption:'', preparing:false };
  let audio, generation=0, ended=false, advancing=false, fired=new Set(), pending=Promise.resolve();
  const valid = token => token === generation && state.active;
  const emit = () => change(state);
  const elapsed = () => NARRATION_SCENES.slice(0,state.index).reduce((sum, s) => sum + s.duration / NARRATION_RATE,0) + state.time / NARRATION_RATE;
  function fail(token, message) {
    if (!valid(token)) return;
    audio?.pause();state.paused=true;state.preparing=false;state.error=message;emit();
  }
  function tick() {
    if (!state.active || !audio) return;
    const scene=NARRATION_SCENES[state.index], token=generation;
    state.time=Math.min(audio.currentTime || 0,scene.duration);
    state.caption=scene.captions.findLast(c => c.start <= state.time)?.text ?? scene.captions[0]?.text ?? scene.text;
    state.elapsed=elapsed();
    progress(scene,state.time/scene.duration);
    // A cue is dispatched once and awaited before the next scene is entered.
    const mark=scene.id==='practice' ? .40 : scene.id==='sensitivity' ? .24 : null;
    if (!state.paused && !state.preparing && mark !== null && state.time/scene.duration >= mark && !fired.has(scene.id)) {
      fired.add(scene.id);
      pending=pending.then(() => valid(token) ? cue(scene,() => valid(token)) : undefined).catch(() => fail(token,'演示操作未完成，请重播本段。'));
    }
    const root=document.querySelector('[data-auto-pitch]');
    if(root) {
      const caption=root.querySelector('[data-auto-caption]');
      if(caption && caption.textContent!==state.caption)caption.textContent=state.caption;
      const bar=root.querySelector('[data-auto-progress]');
      if(bar)bar.value=state.elapsed;
      const clock=root.querySelector('[data-auto-clock]');
      if(clock)clock.textContent=`${seconds(state.elapsed)} / ${seconds(AUTO_PITCH_DURATION)}`;
    }
  }
  async function next() {
    if(advancing)return;
    advancing=true;
    const token=generation;
    await pending;
    if(!valid(token) || state.paused || state.error){advancing=false;return;}
    if(state.index+1<NARRATION_SCENES.length)await playScene(state.index+1);
    else {state.active=false;state.paused=false;emit();finish();}
    advancing=false;
  }
  function ensureAudio() {
    if(audio)return;
    audio=new Audio();audio.preload='auto';
    audio.addEventListener('timeupdate',tick);
    audio.addEventListener('ended',() => {if(!state.active)return;tick();ended=true;next();});
    audio.addEventListener('error',() => fail(generation,'语音暂时无法加载，请检查网络后重试。'));
  }
  async function playScene(index, unlock=false) {
    const token=++generation;
    ensureAudio();audio.pause();pending=Promise.resolve();fired=new Set();ended=false;
    Object.assign(state,{active:true,paused:false,index,time:0,error:'',preparing:true,caption:NARRATION_SCENES[index].captions[0]?.text ?? NARRATION_SCENES[index].text});
    state.elapsed=elapsed();
    audio.src=NARRATION_SCENES[index].src;audio.playbackRate=NARRATION_RATE;audio.muted=state.muted;
    // The first play stays in the initiating click's stack to unlock browser audio.
    const firstPlay=unlock?audio.play().catch(() => fail(token,'点击“继续播放”开启语音。')):null;
    emit();
    try {
      await enter(NARRATION_SCENES[index],() => valid(token));
      if(!valid(token))return;
      state.preparing=false;emit();
      if(!state.paused) {
        if(firstPlay)await firstPlay;
        else await audio.play();
      }
    } catch {fail(token,'播放已暂停，点击重播本段重试。');}
  }
  return {
    state,
    start() {return playScene(0,true);},
    stop() {++generation;audio?.pause();state.active=false;state.paused=false;state.preparing=false;state.error='';pending=Promise.resolve();},
    async toggle() {
      if(!state.active)return;
      if(state.paused) {
        state.paused=false;state.error='';emit();
        if(ended)await next();
        else {try {await audio.play();}catch {fail(generation,'点击“继续播放”开启语音。');}}
      } else {state.paused=true;audio.pause();emit();}
    },
    replay() {return playScene(state.index,true);},
    mute() {state.muted=!state.muted;if(audio)audio.muted=state.muted;emit();}
  };
}

export function renderAutoPitch(state, view) {
  if(!state?.active)return '';
  const scene=NARRATION_SCENES[state.index];
  const calculation=['economics','sensitivity'].includes(scene.id)&&view?.econ?.status==='complete'
    ? `<div class="auto-pitch-calculation"><span>当前 CVR <b>${+(view.constraints.effective.cvr*100).toFixed(2)}%</b></span><span>获客 <b>$${view.econ.acquisitionCost.toFixed(2)}</b></span><span>单件贡献 <b>$${view.econ.postAdContribution.toFixed(2)}</b></span></div>`:'';
  return `<aside class="demo-guide-floating auto-pitch-player" data-auto-pitch aria-label="三分钟自动讲解"><header><img src="/assets/brand/pickwise-icon.svg" alt="纸箱选品教练" width="42" height="42"><div><span class="eyebrow">${state.paused?'已暂停':'自动讲解中'} · ${state.index+1} / ${NARRATION_SCENES.length}</span><h2>${esc(scene.title)}</h2></div><button class="demo-guide-quiet" data-action="auto-pitch-stop">退出</button></header><p class="auto-pitch-caption" data-auto-caption>${esc(state.caption)}</p>${calculation}${state.error?`<p class="auto-pitch-error" role="alert">${esc(state.error)}</p>`:''}<progress data-auto-progress value="${state.elapsed??0}" max="${AUTO_PITCH_DURATION}" aria-label="讲解总进度"></progress><footer><span data-auto-clock>${seconds(state.elapsed??0)} / ${seconds(AUTO_PITCH_DURATION)}</span><div><button class="btn primary" data-action="auto-pitch-pause">${state.paused?'继续播放':'暂停'}</button><button class="btn" data-action="auto-pitch-replay">重播本段</button><button class="btn" data-action="auto-pitch-mute" aria-pressed="${state.muted}">${state.muted?'开启声音':'静音'}</button></div></footer><small>${state.preparing?'正在准备画面…':'网页与语音自动推进 · 合成语音 · 教学模拟'}</small></aside>`;
}
