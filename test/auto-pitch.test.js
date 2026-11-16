import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoPitch } from '../src/ui/auto-pitch.js';

test('continue reloads failed audio and prepares the scene again after the resource recovers',async()=>{
  const originalAudio=globalThis.Audio;
  let available=false, instance, preparations=0;
  class Media {
    constructor(){instance=this;this.listeners={};this.error=null;this.loads=0;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    set src(value){this.source=value;this.loads++;this.error=null;}
    pause(){this.paused=true;}
    play(){
      if(!available || this.error){this.error={code:4};this.listeners.error();return Promise.reject(new Error('resource unavailable'));}
      this.paused=false;return Promise.resolve();
    }
  }
  globalThis.Audio=Media;
  try {
    const player=createAutoPitch({enter:async()=>{preparations++;},cue:async()=>{},progress(){},change(){},finish(){}});
    await player.start();
    assert.equal(player.state.paused,true);
    assert.equal(instance.loads,1);
    available=true;
    await player.toggle();
    assert.equal(instance.loads,2,'retry must reload the failed resource instead of only calling play');
    assert.equal(preparations,2,'the recovered audio must match a prepared page');
    assert.equal(player.state.paused,false);
    assert.equal(instance.paused,false);
    assert.equal(player.state.error,'');
    player.stop();
  } finally {globalThis.Audio=originalAudio;}
});

test('continue retries failed page preparation before resuming its narration',async()=>{
  const originalAudio=globalThis.Audio;
  let preparations=0;
  class Media {
    addEventListener(){}
    pause(){}
    play(){return Promise.resolve();}
  }
  globalThis.Audio=Media;
  try {
    const player=createAutoPitch({enter:async()=>{if(++preparations===1)throw new Error('page failed');},cue:async()=>{},progress(){},change(){},finish(){}});
    await player.start();
    assert.equal(player.state.paused,true);
    await player.toggle();
    assert.equal(preparations,2);
    assert.equal(player.state.paused,false);
    assert.equal(player.state.preparing,false);
    player.stop();
  } finally {globalThis.Audio=originalAudio;}
});
