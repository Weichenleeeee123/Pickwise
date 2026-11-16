import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_LAYOUT, sceneActors, simulationAt, SIMULATION_DURATION } from '../src/ui/office-scene.js';
import { renderAnalysisTeam } from '../src/ui/team.js';
import * as office from '../src/ui/office-scene.js';

test('working employees keep their whole chair and head on a stable frame', () => {
  const a = sceneActors(simulationAt(14000)).find(actor => actor.id === 'profit');
  const b = sceneActors(simulationAt(14500)).find(actor => actor.id === 'profit');
  assert.equal(a.frame, b.frame);
  assert.equal(a.frame, 0);
});

test('summary positions form three mirrored pairs around the same table center', () => {
  const p = OFFICE_LAYOUT.meeting;
  assert.equal(p[0][0] + p[2][0], 1540);
  assert.equal(p[0][1], p[2][1]);
  assert.equal(p[3][0] + p[5][0], 1540);
  assert.equal(p[3][1], p[5][1]);
  assert.equal(p[0][0], p[3][0]);
  assert.equal(p[2][0], p[5][0]);
  assert.equal(p[1][0], 770);
  assert.equal(p[4][0], 770);
  assert.equal(p[0][1] + p[3][1], p[1][1] + p[4][1]);
});

test('idle employees keep walking continuously and return home when assigned work', () => {
  const motion = office.createOfficeMotion();
  const idle = { id: 'wander-test', running: true, steps: [] };
  office.advanceOfficeMotion(motion, idle, 0);
  let walked = false;
  for (let time = 0; time < 20000; time += 250) {
    const actors = office.advanceOfficeMotion(motion, idle, 250);
    walked ||= actors.some(actor => actor.moving);
    assert.ok(actors.every(actor => actor.moving && actor.posture === 'walking'));
  }
  assert.ok(walked, 'idle team never leaves its chairs');
  const before = office.advanceOfficeMotion(motion, idle, 0);
  assert.deepEqual(office.advanceOfficeMotion(motion, idle, 0), before);
  const assigned = { ...idle, steps: [{ id: 'demand', status: 'running' }] };
  const recalled = office.advanceOfficeMotion(motion, assigned, 0).find(a => a.id === 'demand');
  assert.equal(recalled.intent, 'work');
  const arrived = office.advanceOfficeMotion(motion, assigned, 20000).find(a => a.id === 'demand');
  assert.equal(arrived.posture, 'seated');
  assert.equal(arrived.showEmptyChair, false);
  assert.equal(arrived.x, OFFICE_LAYOUT.seats[1].x);
  assert.equal(arrived.y, OFFICE_LAYOUT.seats[1].y);
});

test('office uses one fixed world with six nonoverlapping seats below the short back wall', () => {
  assert.deepEqual(OFFICE_LAYOUT.size, [1536, 1024]);
  assert.equal(OFFICE_LAYOUT.seats.length, 6);
  assert.equal(OFFICE_LAYOUT.seatSprite.width, 216);
  assert.equal(OFFICE_LAYOUT.seatSprite.height, 238);
  for (const seat of OFFICE_LAYOUT.seats) {
    assert.ok(seat.y > 240 && seat.y < 1000);
    assert.ok(seat.x > 120 && seat.x < 1416);
  }
  const html = renderAnalysisTeam({ teamAssetsAvailable: true, steps: [], events: [] });
  assert.match(html, /viewBox="0 0 1536 1024"/);
  assert.doesNotMatch(html, /office-desk|roundtable.webp|<div class="office-table/);
  assert.equal((html.match(/data-actor="/g) ?? []).length, 6);
  assert.match(html, /office-computers-v4.webp/);
  assert.ok(html.indexOf('office-scenery') < html.indexOf('office-people'));
  assert.doesNotMatch(html, /office-seatbacks/);
  assert.equal((html.match(/data-empty-seat="/g) ?? []).length, 6);
  assert.match(html, /chair-empty-v6.webp/);
  assert.match(html, /identify-occupied-v6.webp/);
});

test('local example runs work, parallel tasks, discussion and completion on a bounded timeline', () => {
  const initial = simulationAt(0);
  const parallel = simulationAt(14000);
  const meeting = simulationAt(30000);
  const finished = simulationAt(SIMULATION_DURATION);
  assert.equal(initial.simulated, true);
  assert.ok(parallel.steps.filter(s => s.status === 'running').length >= 2);
  assert.equal(meeting.steps.find(s => s.id === 'summary').status, 'running');
  assert.equal(finished.running, false);
  assert.equal(finished.steps.find(s => s.id === 'risk').status, 'done');
  assert.ok(finished.caption.includes('模拟'));
  assert.deepEqual(simulationAt(-100).steps, initial.steps);
  assert.deepEqual(simulationAt(SIMULATION_DURATION + 5000).steps, finished.steps);
  assert.ok(sceneActors(simulationAt(38000)).every(actor => !actor.meeting));
});

test('actors use step state and never replay stale summary start events', () => {
  const view = { running: false, steps: [{ id: 'summary', status: 'done' }], events: [{ type: 'agent_start', step: 'summary', status: 'running' }] };
  const actors = sceneActors(view);
  assert.ok(actors.every(actor => !actor.working && !actor.meeting));
  assert.equal(sceneActors(simulationAt(30000)).filter(actor => actor.meeting).length, 6);
  assert.equal(new Set(sceneActors(simulationAt(30000)).map(a => `${a.x},${a.y}`)).size, 6);
});

test('empty chair remains at a workstation while its person attends the meeting', () => {
  const idle = sceneActors({ running: false, steps: [] });
  const meeting = sceneActors(simulationAt(30000));
  assert.ok(idle.every(actor => !actor.meeting));
  assert.ok(meeting.every(actor => actor.meeting));
  assert.deepEqual(idle.map(a => a.id), meeting.map(a => a.id));
  const html = renderAnalysisTeam({teamAssetsAvailable:true,steps:[],events:[]});
  assert.equal((html.match(/data-empty-seat="/g) ?? []).length, 6);
  assert.doesNotMatch(html, /chair-computer-v4|office-seatbacks/);
});

test('only working employees sit while the whole team attends the round table', () => {
  const work = sceneActors(simulationAt(14000));
  const meeting = sceneActors(simulationAt(33000));
  const returned = sceneActors(simulationAt(38000));
  assert.ok(work.filter(actor => actor.working).every(actor => actor.posture === 'seated'));
  assert.ok(work.some(actor => actor.intent === 'idle' && actor.showEmptyChair));
  assert.ok(meeting.every(actor => actor.posture === 'standing'));
  assert.deepEqual(meeting.map(actor => actor.facing), ['east', 'south', 'west', 'northeast', 'north', 'northwest']);
  assert.ok(returned.every(actor => actor.intent === 'idle' && actor.showEmptyChair));
  const html = renderAnalysisTeam(simulationAt(30000));
  assert.match(html, /identify-standing-v7.webp/);
  assert.match(html, /data-posture="standing"/);
  assert.match(html, /data-facing="east"/);
  assert.equal((html.match(/data-empty-seat="/g) ?? []).length, 6);
});

test('meeting departure uses walking and completed employees are free to roam', () => {
  const leaving = sceneActors(simulationAt(27400));
  const returning = sceneActors(simulationAt(36900));
  assert.ok(leaving.every((actor, index) => actor.showEmptyChair && (actor.moving ? actor.posture === 'walking' : actor.posture === 'standing' && Math.hypot(actor.x - OFFICE_LAYOUT.meeting[index][0], actor.y - OFFICE_LAYOUT.meeting[index][1]) < .01)));
  assert.ok(leaving.some(actor => actor.moving));
  assert.ok(returning.every(actor => actor.intent === 'idle' && actor.showEmptyChair));
  const later = sceneActors(simulationAt(41000));
  assert.ok(later.some(actor => actor.moving));
});

test('seeking samples the same motion in both directions and keeps feet outside the table', () => {
  const expected = sceneActors(simulationAt(27400));
  sceneActors(simulationAt(37400));
  assert.deepEqual(sceneActors(simulationAt(27400)), expected);
  for (let elapsed = 27000; elapsed <= 37800; elapsed += 100) {
    for (const actor of sceneActors(simulationAt(elapsed))) {
      assert.ok(((actor.x - 770) / 170) ** 2 + ((actor.y - 530) / 140) ** 2 >= 1, `${actor.id} crossed the table at ${elapsed}`);
    }
  }
});

test('live motion survives rerenders and reverses continuously before sitting', () => {
  assert.equal(typeof office.createOfficeMotion, 'function');
  const motion = office.createOfficeMotion();
  const working = { id: 'live', running: true, steps: [{ id: 'profit', status: 'running' }] };
  const meeting = { ...working, steps: [{ id: 'summary', status: 'running' }] };
  office.advanceOfficeMotion(motion, working, 0);
  const outbound = office.advanceOfficeMotion(motion, meeting, 800);
  assert.ok(outbound.every(actor => actor.moving && actor.posture === 'walking'));
  assert.deepEqual(office.advanceOfficeMotion(motion, meeting, 0), outbound);
  const reversing = office.advanceOfficeMotion(motion, working, 0);
  assert.deepEqual(reversing.map(({ x, y }) => [x, y]), outbound.map(({ x, y }) => [x, y]));
  assert.equal(reversing.find(actor => actor.id === 'profit').posture, 'walking');
  const returned = office.advanceOfficeMotion(motion, working, 10000);
  assert.equal(returned.find(actor => actor.id === 'profit').posture, 'seated');
  assert.ok(returned.some(actor => actor.intent === 'idle' && actor.showEmptyChair));
  const loadedMeeting = office.advanceOfficeMotion(office.createOfficeMotion(), meeting, 0);
  assert.deepEqual(loadedMeeting.map(({ x, y }) => [x, y]), OFFICE_LAYOUT.meeting);
});

test('travel uses walking artwork while idle stopping frames remain neutral', () => {
  const leaving = sceneActors(simulationAt(27400));
  const returning = sceneActors(simulationAt(37400));
  // Continuous roaming can place an employee within 400ms of their meeting spot.
  // Only employees still in transit use the walking artwork.
  assert.ok(leaving.filter(actor => actor.moving).every(actor => actor.posture === 'walking'));
  assert.ok(leaving.some(actor => actor.moving));
  assert.ok(leaving.filter(actor => !actor.moving).every((actor) => actor.posture === 'standing'));
  assert.ok(returning.every(actor => actor.intent === 'idle' && actor.posture !== 'standing'));
  assert.notEqual(leaving[0].frame, sceneActors(simulationAt(27520))[0].frame);
  const html = renderAnalysisTeam(simulationAt(27400));
  assert.match(html, /data-walking-asset="\/assets\/team\/identify-walking-four-v11.webp"/);
  assert.match(html, /href="\/assets\/team\/identify-walking-four-v11.webp"/);
});

test('walking selects a separately drawn row for all four travel directions', () => {
  const directions = new Set();
  const rows = { south: 0, west: 1, east: 2, north: 3 };
  for (const elapsed of [27400, 27900, 28400, 36400, 36900, 37400]) {
    for (const actor of sceneActors(simulationAt(elapsed))) {
      if (!actor.moving) continue;
      directions.add(actor.facing);
      assert.equal(actor.walkRow, rows[actor.facing]);
      assert.ok(actor.frame >= 0 && actor.frame < 4);
      assert.equal(actor.mirrored, false);
    }
  }
  assert.equal(directions.size, 4);
});

test('standing and sitting share the same floor anchor when work finishes', () => {
  const motion = office.createOfficeMotion();
  const seated = office.advanceOfficeMotion(motion, { running: true, steps: OFFICE_LAYOUT.seats.map(seat => ({ id: seat.id, status: 'running' })).filter(s => s.id !== 'summary') }, 0);
  const justStood = office.advanceOfficeMotion(motion, { running: false, steps: [] }, 0);
  for (let i = 0; i < seated.length; i++) {
    if (seated[i].posture !== 'seated') continue;
    const seatedTop = seated[i].y + OFFICE_LAYOUT.seatSprite.y;
    const standingTop = justStood[i].y + OFFICE_LAYOUT.standingSprite.y;
    assert.equal(standingTop, seatedTop);
    assert.equal(justStood[i].showEmptyChair, true);
  }
});

test('roaming avoids furniture and preserves its route through rerenders', () => {
  const motion = office.createOfficeMotion();
  const view = { running: false, steps: [] };
  for (let time = 0; time < 30000; time += 250) {
    const actors = office.advanceOfficeMotion(motion, view, 250);
    for (const actor of actors) {
      assert.ok(((actor.x - 770) / 170) ** 2 + ((actor.y - 530) / 140) ** 2 >= 1);
      assert.ok(actor.x >= 250 && actor.x <= 1300 && actor.y >= 300 && actor.y <= 950);
    }
  }
  const before = office.advanceOfficeMotion(motion, view, 0);
  assert.deepEqual(sceneActors(view, motion), before);
});
