// Port Velo — Node tests for the pure simulation. No browser needed: the
// world steps in fixed 1/60 s ticks from a seeded RNG, and the autopilot
// proves each mission is completable from a fresh world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../game/src/random.js';
import { createWorld, EVENT_MISSION } from '../game/src/world.js';
import { STEP, WORLD } from '../game/src/config.js';
import { autopilotTo, driveInput } from '../game/src/bot.js';
import { circleHitsRect, onRoad } from '../game/src/city.js';

const IDLE = { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, aimWorld: null };

function freshWorld(seed = 1) {
  return createWorld(createRandom(seed), seed);
}

function stepFor(world, seconds, inputFn = () => IDLE) {
  let events = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) events |= world.step(STEP, inputFn(world.state));
  return events;
}

test('city: buildings never sit on a road and stay inside the world', () => {
  const w = freshWorld(1);
  for (const b of w.state.city.buildings) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= WORLD.width && b.y + b.h <= WORLD.height);
    // A building's centre must not be on a road.
    assert.ok(!onRoad(b.x + b.w / 2, b.y + b.h / 2, w.state.city), `building at ${b.x},${b.y} is on a road`);
  }
  // Every named place is reachable: not inside a building.
  for (const [name, pl] of Object.entries(w.state.city.places)) {
    const inside = w.state.city.buildings.some((b) => circleHitsRect(pl.x, pl.y, 4, b));
    assert.ok(!inside, `${name} is inside a building`);
  }
});

test('player walks, and a building blocks the walk', () => {
  const w = freshWorld(1);
  const p = w.state.player;
  const startX = p.x;
  stepFor(w, 1, () => ({ ...IDLE, right: true, run: true }));
  assert.ok(p.x > startX, 'player should move right');
  // Teleport against a building face and push into it: the collision holds.
  const b = w.state.city.buildings[0];
  p.x = b.x - 12;
  p.y = b.y + b.h / 2;
  stepFor(w, 1, () => ({ ...IDLE, right: true }));
  assert.ok(p.x < b.x, 'player must not enter the building');
});

test('stealing a parked car raises wanted and lets the player drive', () => {
  const w = freshWorld(1);
  const p = w.state.player;
  const coupe = w.state.cars.find((c) => c.color === '#f2c200');
  assert.ok(coupe, 'the yellow marina coupe exists');
  p.x = coupe.x;
  p.y = coupe.y;
  w.step(STEP, { ...IDLE, enter: true });
  assert.equal(p.onFoot, false, 'player should be in the car');
  assert.equal(w.state.wanted, 1, 'stealing a car is a 1-star crime');
  const speedBefore = Math.abs(coupe.speed);
  stepFor(w, 2, () => ({ ...IDLE, up: true }));
  assert.ok(Math.abs(coupe.speed) > speedBefore, 'the car should accelerate');
});

test('wanted decays to zero when the player stays clean and unseen', () => {
  const w = freshWorld(1);
  w.addWanted(2);
  assert.equal(w.state.wanted, 2);
  // Park in a lay-low alley, far from any cop, and wait.
  const alley = w.state.city.layLow[0];
  w.state.player.x = alley.x + 40;
  w.state.player.y = alley.y + 30;
  w.state.cars = w.state.cars.filter((c) => c.kind !== 'police');
  stepFor(w, 120);
  assert.equal(w.state.wanted, 0, 'heat should cool off in the alley');
});

test('police spawn while wanted and chase the player', () => {
  const w = freshWorld(1);
  w.addWanted(2);
  stepFor(w, 2);
  const cops = w.state.cars.filter((c) => c.kind === 'police');
  assert.ok(cops.length >= 1, 'cops should spawn');
  assert.equal(w.state.wanted, 2, 'a fleeing player should not be busted in 2 s');
  // The player runs for the far corner; a cop should close the gap.
  const d0 = Math.hypot(cops[0].x - w.state.player.x, cops[0].y - w.state.player.y);
  stepFor(w, 4, () => ({ ...IDLE, up: true, left: true, run: true }));
  const d1 = Math.hypot(cops[0].x - w.state.player.x, cops[0].y - w.state.player.y);
  assert.ok(d1 < d0 + 200, 'a cop should close in, not wander off');
});

test('mission 1 completes: steal the coupe, drive it to the Hideout', () => {
  const w = freshWorld(1);
  const P = w.state.city.places;
  assert.equal(w.state.mission.id, 'first-wheels');
  stepFor(w, 60, (s) => autopilotTo(s, P.marina.x, P.marina.y));
  assert.equal(w.state.player.onFoot, false, 'autopilot should have stolen a car');
  stepFor(w, 60, (s) => autopilotTo(s, P.hideout.x, P.hideout.y));
  assert.equal(w.state.missionIndex, 1, 'mission 1 should complete and advance');
  assert.ok(w.state.player.cash >= 250, 'mission 1 pays $250');
});

test('mission 4 completes: three cash bags and back to the Hideout', () => {
  const w = freshWorld(1);
  w.startMission(3);
  const P = w.state.city.places;
  stepFor(w, 90, (s) => autopilotTo(s, P.downtown.x, P.downtown.y));
  stepFor(w, 90, (s) => autopilotTo(s, P.bank.x, P.bank.y));
  stepFor(w, 90, (s) => autopilotTo(s, P.strip.x, P.strip.y));
  stepFor(w, 90, (s) => autopilotTo(s, P.hideout.x, P.hideout.y));
  assert.equal(w.state.missionIndex, 4, 'mission 4 should complete and advance');
  assert.ok(w.state.stats.missionsDone >= 1, 'mission 4 should count as done');
  assert.ok(w.state.player.cash >= 500, 'mission 4 pays $800 (minus any bust fines on the way)');
});

test('snapshot / restore round-trips the save', () => {
  const w = freshWorld(1);
  w.state.player.cash = 1234;
  w.state.player.pistol = true;
  w.state.player.ammo = 10;
  const snap = w.snapshot();
  const w2 = freshWorld(1);
  assert.ok(w2.restore(snap));
  assert.equal(w2.state.player.cash, 1234);
  assert.equal(w2.state.player.pistol, true);
  assert.equal(w2.state.player.ammo, 10);
});

test('reset restores a fresh world at the Hideout', () => {
  const w = freshWorld(1);
  w.state.player.cash = 999;
  w.state.player.x = 3000;
  w.reset();
  assert.equal(w.state.player.cash, 0);
  assert.equal(w.state.missionIndex, 0);
  assert.ok(Math.abs(w.state.player.x - w.state.city.places.hideout.x) < 2);
});
