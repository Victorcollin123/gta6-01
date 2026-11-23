// Port Velo — the pure simulation. No DOM, no canvas, no audio here, so the
// same code runs in the browser and in Node tests. One fixed step (1/60 s)
// advances the player (on foot or in a car), traffic, pedestrians, police,
// the wanted level, bullets and the current mission's objectives.
import { CAR, MISSIONS, PEDS, PLAYER, POLICE, STEP, TRAFFIC, WANTED, WORLD } from './config.js';
import { buildCity, circleHitsRect, collideBuildings, nearestRoadPoint, onRoad, pointInRect } from './city.js';
import { intRange, pick, range } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_CRIME = 1;
export const EVENT_MISSION = 2;
export const EVENT_WASTED = 4;
export const EVENT_BUSTED = 8;
export const EVENT_PICKUP = 16;

const CAR_COLORS = ['#c23b2e', '#2e8bc2', '#e8e4da', '#7dc23b', '#c23b8a', '#f28c13', '#3bc2a8', '#8a6bc2'];
const PED_COLORS = ['#e8b88a', '#c98d5f', '#8a5a3b', '#f0d0a8', '#6b4a2e'];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(angle, target, maxStep) {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function createWorld(rng, seed) {
  const city = buildCity(rng);
  const state = {
    seed: seed ?? 1,
    time: 0,
    rng,
    city,
    player: {
      x: city.places.hideout.x, y: city.places.hideout.y, angle: -Math.PI / 2,
      health: PLAYER.health, cash: 0, pistol: false, ammo: 0,
      onFoot: true, carId: null, punchCd: 0, shootCd: 0, bustedHold: 0,
      moving: false, speed: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    wanted: 0,
    heat: 0, // 0..1 within the current star level; crimes push it up
    lastCrimeAt: -999,
    lastSeenAt: -999,
    missionIndex: 0,
    mission: null,
    missionTimer: 0,
    missionMsg: '',
    message: '',
    messageAt: 0,
    stats: { carsStolen: 0, pedsHit: 0, missionsDone: 0, shotsFired: 0 },
    over: null, // 'wasted' | 'busted' | null (transient; cleared on respawn)
    started: false,
  };
  const world = { state, rng };

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const horizontal = rng() < 0.5;
      const road = horizontal ? pick(rng, city.roadsY) : pick(rng, city.roadsX);
      const fixed = road + 24 + (rng() < 0.5 ? 0 : 48);
      const pos = range(rng, 0, horizontal ? WORLD.width : WORLD.height);
      state.cars.push({
        id: `t${i}`, kind: 'traffic', x: horizontal ? pos : fixed, y: horizontal ? fixed : pos,
        angle: horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        speed: range(rng, 120, 180), axis: horizontal ? 'x' : 'y', fixed, dir: rng() < 0.5 ? 1 : -1,
        color: pick(rng, CAR_COLORS), name: 'Traffic', health: 100, targetSpeed: 0,
      });
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const p = nearestRoadPoint(range(rng, 200, WORLD.width - 200), range(rng, 200, WORLD.height - 200), city);
      state.peds.push({
        id: `p${i}`, kind: 'ped', x: p.x + range(rng, -30, 30), y: p.y + range(rng, -30, 30),
        tx: p.x, ty: p.y, speed: range(rng, 40, 70), color: pick(rng, PED_COLORS),
        state: 'walk', fleeX: 0, fleeY: 0, down: 0, cop: false,
      });
    }
  }

  function spawnParked() {
    for (const s of city.parked) {
      state.cars.push({
        id: `park-${s.x}-${s.y}`, kind: 'parked', x: s.x, y: s.y, angle: s.angle,
        speed: 0, color: s.color, name: s.name, health: 100,
      });
    }
  }

  function startMission(index) {
    state.missionIndex = index;
    const def = MISSIONS[index];
    if (!def) { state.mission = null; state.missionMsg = 'All missions complete — Port Velo is yours. Free roam!'; return; }
    const m = { id: def.id, name: def.name, brief: def.brief, reward: def.reward, step: 0, objectives: [], done: false };
    const P = city.places;
    if (def.id === 'first-wheels') {
      m.objectives = [
        { type: 'enter', label: 'Steal the yellow coupe at the Marina', x: P.marina.x, y: P.marina.y, carColor: '#f2c200' },
        { type: 'goto', label: 'Drive the coupe to the Hideout', x: P.hideout.x, y: P.hideout.y, radius: 90, inCar: true },
      ];
    } else if (def.id === 'courier') {
      m.objectives = [
        { type: 'collect', label: 'Pick up the package at the Market', x: P.market.x, y: P.market.y, pickup: 'package' },
        { type: 'goto', label: 'Deliver to the Pier', x: P.pier.x, y: P.pier.y, radius: 90 },
        { type: 'goto', label: 'Deliver to the Plaza', x: P.plaza.x, y: P.plaza.y, radius: 90 },
      ];
      state.missionTimer = def.timeLimit;
    } else if (def.id === 'heat') {
      addWanted(2, state);
      m.objectives = [{ type: 'survive', label: 'Lose the heat — stay out of sight or outrun them', seconds: def.survive }];
      state.missionTimer = def.survive;
    } else if (def.id === 'the-take') {
      const bags = [
        { x: P.downtown.x, y: P.downtown.y }, { x: P.bank.x, y: P.bank.y }, { x: P.strip.x, y: P.strip.y },
      ];
      m.objectives = bags.map((b, i) => ({ type: 'collect', label: `Grab cash bag ${i + 1} of 3`, x: b.x, y: b.y, pickup: 'cashbag' }));
      m.objectives.push({ type: 'goto', label: 'Get back to the Hideout', x: P.hideout.x, y: P.hideout.y, radius: 90 });
      for (const b of bags) state.pickups.push({ kind: 'cashbag', x: b.x, y: b.y, taken: false });
    } else if (def.id === 'neon-tide') {
      const p = state.player;
      state.cars.push({
        id: 'rival', kind: 'rival', x: p.x + 300, y: p.y + 100, angle: 0, speed: 0,
        color: '#111318', name: 'Rico', health: 100, flee: 0,
      });
      m.objectives = [
        { type: 'ram', label: 'Ram Rico’s black sedan until it gives up', target: 'rival' },
        { type: 'goto', label: 'Escape to the Pier', x: P.pier.x, y: P.pier.y, radius: 90 },
      ];
    }
    state.mission = m;
    state.missionMsg = `${def.name} — ${def.brief}`;
    say(state, `${def.name}: ${def.brief}`);
  }

  function say(s, text) {
    s.message = text;
    s.messageAt = s.time;
  }

  function addWanted(stars, s) {
    if (stars <= 0) return EVENT_NONE;
    s.wanted = Math.min(5, s.wanted + stars);
    s.heat = 1;
    s.lastCrimeAt = s.time;
    return EVENT_CRIME;
  }

  function nearestCar(x, y, maxD, kinds) {
    let best = null;
    let bestD = maxD;
    for (const c of state.cars) {
      if (kinds && !kinds.includes(c.kind)) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function playerCar() {
    return state.player.carId ? state.cars.find((c) => c.id === state.player.carId) ?? null : null;
  }

  function enterCar(car) {
    const p = state.player;
    p.onFoot = false;
    p.carId = car.id;
    if (car.kind === 'parked') {
      car.kind = 'stolen';
      state.stats.carsStolen += 1;
      return addWanted(WANTED.stealCar, state);
    }
    if (car.kind === 'traffic') {
      car.kind = 'stolen';
      car.axis = undefined;
      state.stats.carsStolen += 1;
      return addWanted(WANTED.stealCar, state);
    }
    return EVENT_NONE;
  }

  function exitCar() {
    const p = state.player;
    const car = playerCar();
    if (!car) return;
    const bx = car.x - Math.sin(car.angle) * 40;
    const by = car.y + Math.cos(car.angle) * 40;
    const fixed = collideBuildings(bx, by, PLAYER.radius, state.city.buildings);
    p.x = Math.max(20, Math.min(WORLD.width - 20, fixed.x));
    p.y = Math.max(20, Math.min(WORLD.height - 20, fixed.y));
    p.angle = car.angle;
    p.onFoot = true;
    p.carId = null;
    car.speed = 0;
  }

  function respawn(reason) {
    const p = state.player;
    const lost = Math.min(p.cash, reason === 'busted' ? 150 : Math.floor(p.cash / 2));
    p.cash -= lost;
    p.health = PLAYER.health;
    p.x = state.city.places.hideout.x;
    p.y = state.city.places.hideout.y;
    p.angle = -Math.PI / 2;
    if (!p.onFoot) { p.onFoot = true; p.carId = null; }
    state.wanted = 0;
    state.heat = 0;
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.peds = state.peds.filter((pd) => !pd.cop);
    state.over = reason;
    say(state, reason === 'busted'
      ? `BUSTED — the Velo PD took $${lost}. You wake up at the Hideout.`
      : `WASTED — you wake up at the Hideout, $${lost} lighter.`);
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    const car = playerCar();
    if (!car) {
      // On foot.
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const mag = Math.hypot(mx, my);
      p.moving = mag > 0;
      if (mag > 0) {
        mx /= mag;
        my /= mag;
        const speed = input.run ? PLAYER.run : PLAYER.walk;
        p.speed = speed;
        p.angle = Math.atan2(my, mx);
        const nx = p.x + mx * speed * dt;
        const ny = p.y + my * speed * dt;
        const fx = collideBuildings(nx, p.y, PLAYER.radius, state.city.buildings);
        const fy = collideBuildings(fx.x, ny, PLAYER.radius, state.city.buildings);
        p.x = Math.max(16, Math.min(WORLD.width - 16, fy.x));
        p.y = Math.max(16, Math.min(WORLD.height - 16, fy.y));
      } else p.speed = 0;
      if (input.enter) {
        const target = nearestCar(p.x, p.y, 70, ['parked', 'traffic']);
        if (target) return enterCar(target);
      }
      if (input.punch && p.punchCd <= 0) {
        p.punchCd = PLAYER.punchCooldown;
        punch();
      }
      if (input.shoot && p.pistol && p.ammo > 0 && p.shootCd <= 0) {
        p.shootCd = PLAYER.shootCooldown;
        shoot(input);
      }
      return EVENT_NONE;
    }
    // Driving.
    const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (fwd > 0) car.speed += CAR.accel * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
    else car.speed -= Math.sign(car.speed) * CAR.drag * 220 * dt;
    if (Math.abs(car.speed) < 4 && fwd === 0) car.speed = 0;
    car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
    if (Math.abs(car.speed) > 5) car.angle += steer * CAR.turn * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 200);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hit = collideBuildings(nx, ny, 20, state.city.buildings);
    if (hit.hit) {
      car.speed *= 0.4;
      if (Math.abs(car.speed) > 200) { car.health -= 4; }
    }
    car.x = Math.max(30, Math.min(WORLD.width - 30, hit.x));
    car.y = Math.max(30, Math.min(WORLD.height - 30, hit.y));
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = Math.abs(car.speed);
    p.moving = Math.abs(car.speed) > 5;
    if (input.enter) exitCar();
    return EVENT_NONE;
  }

  function punch() {
    const p = state.player;
    const px = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const py = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    for (const pd of state.peds) {
      if (pd.down > 0 || pd.cop) continue;
      if (dist(px, py, pd.x, pd.y) < 30) {
        pd.state = 'flee';
        pd.fleeX = pd.x - p.x;
        pd.fleeY = pd.y - p.y;
        state.stats.pedsHit += 1;
        return addWanted(WANTED.hitPed, state);
      }
    }
    return EVENT_NONE;
  }

  function shoot(input) {
    const p = state.player;
    p.ammo -= 1;
    state.stats.shotsFired += 1;
    const aim = input.aimWorld ?? { x: p.x + Math.cos(p.angle) * 100, y: p.y + Math.sin(p.angle) * 100 };
    const a = angleTo(p.x, p.y, aim.x, aim.y);
    state.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed, life: 0.9, from: 'player' });
    p.angle = a;
    return addWanted(WANTED.shoot, state);
  }

  function stepBullets(dt) {
    let ev = EVENT_NONE;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (circleHitsRect(b.x, b.y, 3, { x: 0, y: 0, w: 0, h: 0 })) { /* noop */ }
      for (const bd of state.city.buildings) {
        if (pointInRect(b.x, b.y, bd)) { b.life = 0; break; }
      }
      if (b.life <= 0) continue;
      for (const pd of state.peds) {
        if (pd.down > 0) continue;
        if (dist(b.x, b.y, pd.x, pd.y) < 14) {
          b.life = 0;
          pd.down = 999;
          if (pd.cop) { state.wanted = Math.min(5, state.wanted + 1); }
          else ev |= addWanted(WANTED.killPed, state);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const c of state.cars) {
        if (c.id === state.player.carId) continue;
        if (Math.abs(b.x - c.x) < 30 && Math.abs(b.y - c.y) < 18) {
          b.life = 0;
          c.health -= PLAYER.bulletDamage;
          if (c.kind === 'rival') { /* mission checks health */ }
          if (c.kind === 'police') ev |= addWanted(1, state);
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height);
    return ev;
  }

  function stepTraffic(dt) {
    const p = state.player;
    const pCar = playerCar();
    for (const c of state.cars) {
      if (c.kind !== 'traffic') continue;
      // Slow down for a car ahead in the same lane.
      let target = c.speed;
      for (const o of state.cars) {
        if (o === c || o.axis !== c.axis || o.fixed !== c.fixed || o.dir !== c.dir) continue;
        const along = c.axis === 'x' ? (o.x - c.x) * c.dir : (o.y - c.y) * c.dir;
        if (along > 0 && along < 90) { target = 0; break; }
      }
      // Slow for the player's car blocking the lane.
      if (pCar && pCar.axis === undefined) {
        const along = c.axis === 'x' ? (pCar.x - c.x) * c.dir : (pCar.y - c.y) * c.dir;
        const lat = c.axis === 'x' ? Math.abs(pCar.y - c.fixed) : Math.abs(pCar.x - c.fixed);
        if (along > 0 && along < 80 && lat < 40) target = 0;
      }
      c.speed += (target - c.speed) * Math.min(1, dt * 3);
      if (c.axis === 'x') {
        c.x += c.dir * c.speed * dt;
        if (c.x > WORLD.width + 60) c.x = -60;
        if (c.x < -60) c.x = WORLD.width + 60;
        c.angle = c.dir > 0 ? 0 : Math.PI;
      } else {
        c.y += c.dir * c.speed * dt;
        if (c.y > WORLD.height + 60) c.y = -60;
        if (c.y < -60) c.y = WORLD.height + 60;
        c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      // Running over a pedestrian is a crime, even for traffic the player caused.
      for (const pd of state.peds) {
        if (pd.down > 0 || pd.cop) continue;
        if (Math.abs(pd.x - c.x) < 26 && Math.abs(pd.y - c.y) < 16) {
          pd.down = 999;
        }
      }
      void p;
    }
    // Player car vs other cars: shove apart, damage both a little.
    if (pCar) {
      for (const o of state.cars) {
        if (o === pCar) continue;
        const d = dist(pCar.x, pCar.y, o.x, o.y);
        if (d < 56 && d > 0.01) {
          const push = (56 - d) / 2;
          const ux = (pCar.x - o.x) / d;
          const uy = (pCar.y - o.y) / d;
          pCar.x += ux * push;
          pCar.y += uy * push;
          if (o.kind === 'traffic' || o.kind === 'parked' || o.kind === 'stolen') {
            o.x -= ux * push;
            o.y -= uy * push;
          }
          const impact = Math.abs(pCar.speed);
          if (impact > 120) {
            pCar.health -= 3;
            o.health -= 3;
            if (o.kind === 'traffic') { /* a bump, not a crime unless a ped is hit */ }
          }
          pCar.speed *= 0.85;
        }
      }
      // Player car running over a pedestrian.
      for (const pd of state.peds) {
        if (pd.down > 0) continue;
        if (Math.abs(pd.x - pCar.x) < 30 && Math.abs(pd.y - pCar.y) < 20 && Math.abs(pCar.speed) > 30) {
          pd.down = 999;
          state.stats.pedsHit += 1;
          addWanted(pd.cop ? WANTED.ramCop : WANTED.hitPed, state);
        }
      }
    }
    // Wrecked cars stop being drivable.
    for (const c of state.cars) {
      if (c.health <= 0 && c.kind !== 'wreck') {
        c.health = 0;
        if (c.kind === 'rival') { /* mission sees it */ }
        else if (c.id === state.player.carId) { exitCar(); }
        if (c.kind !== 'rival') c.kind = 'wreck';
      }
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const pd of state.peds) {
      if (pd.down > 0) { pd.down -= dt; continue; }
      if (pd.cop) {
        // Foot cop: chase the player on foot, arrest on contact.
        const d = dist(pd.x, pd.y, p.x, p.y);
        if (!p.onFoot) { pd.state = 'walk'; continue; }
        const a = angleTo(pd.x, pd.y, p.x, p.y);
        pd.x += Math.cos(a) * 205 * dt;
        pd.y += Math.sin(a) * 205 * dt;
        if (d < 26) {
          p.bustedHold += dt;
          if (p.bustedHold > 2.0) { respawn('busted'); return; }
        } else p.bustedHold = Math.max(0, p.bustedHold - dt * 2);
        continue;
      }
      if (pd.state === 'flee') {
        const a = Math.atan2(pd.fleeY, pd.fleeX);
        pd.x += Math.cos(a) * 190 * dt;
        pd.y += Math.sin(a) * 190 * dt;
        if (dist(pd.x, pd.y, p.x, p.y) > 420) pd.state = 'walk';
        continue;
      }
      const d = dist(pd.x, pd.y, pd.tx, pd.ty);
      if (d < 12) {
        const t = nearestRoadPoint(pd.x + range(rng, -500, 500), pd.y + range(rng, -500, 500), state.city);
        pd.tx = t.x;
        pd.ty = t.y;
      } else {
        const a = angleTo(pd.x, pd.y, pd.tx, pd.ty);
        pd.x += Math.cos(a) * pd.speed * dt;
        pd.y += Math.sin(a) * pd.speed * dt;
      }
      // A pedestrian in the player's path on foot gets shoved, not hurt.
      if (p.onFoot && dist(pd.x, pd.y, p.x, p.y) < 22) {
        const a = angleTo(p.x, p.y, pd.x, pd.y);
        pd.x += Math.cos(a) * 40 * dt;
        pd.y += Math.sin(a) * 40 * dt;
      }
    }
    state.peds = state.peds.filter((pd) => pd.down < 900);
  }

  function stepPolice(dt) {
    const p = state.player;
    const want = Math.min(state.wanted, POLICE.max);
    const cops = state.cars.filter((c) => c.kind === 'police');
    // Spawn up to the wanted level's count.
    if (cops.length < want) {
      const road = nearestRoadPoint(p.x + range(rng, -600, 600), p.y + range(rng, -600, 600), state.city);
      state.cars.push({
        id: `cop-${state.time.toFixed(0)}-${cops.length}`, kind: 'police',
        x: road.x, y: road.y, angle: 0, speed: 0, color: '#1c2733', name: 'VPD', health: 100,
      });
    }
    // Despawn extras when wanted falls.
    if (cops.length > want) {
      const extra = cops[cops.length - 1];
      state.cars = state.cars.filter((c) => c !== extra);
    }
    for (const cop of state.cars.filter((c) => c.kind === 'police')) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      const a = angleTo(cop.x, cop.y, p.x, p.y);
      cop.angle = turnToward(cop.angle, a, 3.2 * dt);
      // Near the player on foot the cop slows to pull up, instead of
      // blasting through them at full speed.
      let target = d > 700 ? POLICE.speed : POLICE.speed * 0.92;
      if (p.onFoot && d < 140) target = 140;
      cop.speed += (target - cop.speed) * Math.min(1, dt * 1.5);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      const hit = collideBuildings(cop.x, cop.y, 20, state.city.buildings);
      cop.x = hit.x;
      cop.y = hit.y;
      // A cop that catches the player's car rams it; a cop that pulls up
      // beside the player on foot sends an officer out. The car has to slow
      // down first, so a drive-by never arrests you.
      if (d < 60 && !p.onFoot) {
        const car = playerCar();
        // A real ram, not a nudge: only a cop moving fast hurts the car, and
        // even then a car survives ~40 s of contact — one star is a chase,
        // not a death sentence. The driver only gets hurt when the car
        // itself gives out (see step()).
        if (car && cop.speed > 150) {
          car.health -= 2.5 * dt;
          car.speed *= 0.96;
        }
      }
      if (d < 60 && p.onFoot && cop.speed < 150) {
        if (!state.peds.some((pd) => pd.cop)) {
          state.peds.push({
            id: `copfoot-${state.time.toFixed(0)}`, kind: 'ped', cop: true,
            x: cop.x, y: cop.y, tx: p.x, ty: p.y, speed: 205,
            color: '#1c2733', state: 'chase', fleeX: 0, fleeY: 0, down: 0,
          });
        }
      }
      if (d < 500) state.lastSeenAt = state.time;
    }
    // The player is "seen" while any cop is close.
    if (state.wanted > 0 && cops.length > 0) {
      const nearest = Math.min(...cops.map((c) => dist(c.x, c.y, p.x, p.y)));
      if (nearest < 520) state.lastSeenAt = state.time;
    }
  }

  function inLayLow(x, y) {
    return state.city.layLow.some((r) => pointInRect(x, y, r));
  }

  function stepWanted(dt) {
    if (state.wanted === 0) return;
    const sinceCrime = state.time - state.lastCrimeAt;
    const sinceSeen = state.time - state.lastSeenAt;
    const hidden = inLayLow(state.player.x, state.player.y);
    if (sinceCrime > WANTED.decayDelay && sinceSeen > 6) {
      const rate = (hidden ? WANTED.layLowBoost : 1) / WANTED.decayStep;
      state.heat -= rate * dt;
      if (state.heat <= 0) {
        state.wanted -= 1;
        state.heat = state.wanted > 0 ? 1 : 0;
        if (state.wanted === 0) say(state, 'Heat’s off. You’re clean — for now.');
      }
    } else {
      state.heat = Math.min(1, state.heat + dt * 0.02);
    }
  }

  function stepMission(dt) {
    const m = state.mission;
    if (!m || m.done) return EVENT_NONE;
    const p = state.player;
    if (state.missionTimer > 0) state.missionTimer -= dt;
    const obj = m.objectives[m.step];
    if (!obj) {
      m.done = true;
      p.cash += m.reward;
      state.stats.missionsDone += 1;
      // A finished job cools the heat: Mara's crew makes the call, the VPD
      // stands down, and the player keeps the car they are in.
      state.wanted = 0;
      state.heat = 0;
      state.cars = state.cars.filter((c) => c.kind !== 'police');
      state.peds = state.peds.filter((pd) => !pd.cop);
      say(state, `${m.name} COMPLETE — +$${m.reward}. Heat’s off.`);
      const next = state.missionIndex + 1;
      if (next < MISSIONS.length) {
        state.missionIndex = next;
        startMission(next);
      } else {
        state.missionIndex = next;
        state.mission = null;
        state.missionMsg = 'All missions complete — Port Velo is yours. Free roam!';
      }
      return EVENT_MISSION;
    }
    if (obj.type === 'goto') {
      if (dist(p.x, p.y, obj.x, obj.y) < (obj.radius ?? 90) && (!obj.inCar || !p.onFoot)) {
        m.step += 1;
        say(state, `Objective done — ${obj.label}.`);
        return EVENT_MISSION;
      }
    } else if (obj.type === 'enter') {
      if (!p.onFoot && playerCar() && playerCar().color === obj.carColor) {
        m.step += 1;
        say(state, 'You’ve got the coupe. Now lose the attention and drive home.');
        return EVENT_MISSION;
      }
    } else if (obj.type === 'collect') {
      const pk = state.pickups.find((k) => !k.taken && k.kind === obj.pickup && dist(p.x, p.y, k.x, k.y) < 40);
      if (pk) {
        pk.taken = true;
        m.step += 1;
        if (obj.pickup === 'package') say(state, 'Package secured. Deliver it — fast.');
        else say(state, 'Cash bag grabbed.');
        return EVENT_PICKUP | EVENT_MISSION;
      }
      // The package pickup spawns when the mission starts.
      if (obj.pickup === 'package' && !state.pickups.some((k) => k.kind === 'package')) {
        state.pickups.push({ kind: 'package', x: obj.x, y: obj.y, taken: false });
      }
    } else if (obj.type === 'survive') {
      if (state.missionTimer <= 0 || (state.wanted === 0 && state.time - state.lastCrimeAt > 10)) {
        m.step += 1;
        return EVENT_MISSION;
      }
    } else if (obj.type === 'ram') {
      const rival = state.cars.find((c) => c.id === obj.target);
      if (rival && rival.health <= 0) {
        rival.kind = 'wreck';
        m.step += 1;
        say(state, 'Rico’s sedan is done. Now get to the Pier.');
        return EVENT_MISSION;
      }
    }
    // Courier timer running out fails the mission (retryable, no penalty).
    if (m.id === 'courier' && state.missionTimer <= 0 && m.step < m.objectives.length) {
      say(state, 'Courier run failed — the clock beat you. Mara is giving you another shot.');
      state.missionTimer = MISSIONS[1].timeLimit;
      m.step = 0;
      state.pickups = state.pickups.filter((k) => k.kind !== 'package');
    }
    return EVENT_NONE;
  }

  function stepRival(dt) {
    const rival = state.cars.find((c) => c.kind === 'rival');
    if (!rival) return;
    const p = state.player;
    const d = dist(rival.x, rival.y, p.x, p.y);
    // Rico flees along the roads, away from the player.
    const away = angleTo(p.x, p.y, rival.x, rival.y);
    rival.angle = turnToward(rival.angle, away, 2.2 * dt);
    const target = d < 900 ? 480 : 300;
    rival.speed += (target - rival.speed) * Math.min(1, dt);
    rival.x += Math.cos(rival.angle) * rival.speed * dt;
    rival.y += Math.sin(rival.angle) * rival.speed * dt;
    const hit = collideBuildings(rival.x, rival.y, 20, state.city.buildings);
    rival.x = hit.x;
    rival.y = hit.y;
    // Ramming: the player's car smashing into the rival damages it.
    const pCar = playerCar();
    if (pCar && dist(pCar.x, pCar.y, rival.x, rival.y) < 58) {
      const impact = Math.abs(pCar.speed);
      if (impact > 150 && rival.flee <= 0) {
        rival.health -= 26;
        rival.flee = 0.6;
        pCar.speed *= 0.6;
        addWanted(0, state);
      }
    }
    rival.flee = Math.max(0, (rival.flee ?? 0) - dt);
  }

  function stepPickups() {
    const p = state.player;
    if (!p.onFoot) return;
    for (const pk of state.pickups) {
      if (pk.taken || pk.kind !== 'pistol') continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        p.pistol = true;
        p.ammo = 24;
        say(state, 'Pistol picked up — 24 rounds. Click to shoot, F also fires.');
      }
    }
  }

  function step(dt, input) {
    let ev = EVENT_NONE;
    state.time += dt;
    ev |= stepPlayer(dt, input);
    ev |= stepBullets(dt);
    stepPickups();
    stepTraffic(dt);
    stepPeds(dt);
    stepPolice(dt);
    stepRival(dt);
    stepWanted(dt);
    ev |= stepMission(dt);
    // Player health / car health edges.
    if (state.player.health <= 0) {
      state.player.health = 0;
      respawn('wasted');
      ev |= EVENT_WASTED;
    }
    const car = playerCar();
    if (car && car.health <= 0) {
      state.player.health = Math.max(0, state.player.health - 25);
      exitCar();
      car.kind = 'wreck';
    }
    return ev;
  }

  function reset() {
    const fresh = createWorld(createRandomFromSeed(state.seed), state.seed);
    // Keep the same object identity so renderers holding `world` keep working.
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, fresh.state);
    startMission(0);
  }

  function createRandomFromSeed(seed) {
    // Local import-free mulberry32 (random.js is the same code; duplicated
    // here so reset() never needs a second module load path).
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function snapshot() {
    const p = state.player;
    return {
      version: 1, cash: p.cash, missionIndex: state.missionIndex,
      health: p.health, pistol: p.pistol, ammo: p.ammo,
      x: p.x, y: p.y, wanted: state.wanted, time: state.time,
      stats: state.stats,
    };
  }

  function restore(snap) {
    if (!snap || snap.version !== 1) return false;
    const p = state.player;
    p.cash = snap.cash ?? 0;
    p.health = snap.health ?? PLAYER.health;
    p.pistol = !!snap.pistol;
    p.ammo = snap.ammo ?? 0;
    p.x = snap.x ?? state.city.places.hideout.x;
    p.y = snap.y ?? state.city.places.hideout.y;
    state.wanted = snap.wanted ?? 0;
    state.missionIndex = Math.min(snap.missionIndex ?? 0, MISSIONS.length - 1);
    if (snap.stats) state.stats = snap.stats;
    if (!p.onFoot) { p.onFoot = true; p.carId = null; }
    // The pistol waits at the Hideout for anyone who has not picked it up.
    if (!p.pistol && !state.pickups.some((k) => k.kind === 'pistol')) {
      state.pickups.push({ kind: 'pistol', x: state.city.places.hideout.x + 60, y: state.city.places.hideout.y, taken: false });
    }
    startMission(state.missionIndex);
    return true;
  }

  spawnTraffic();
  spawnPeds();
  spawnParked();
  // The pistol waits by the Hideout door from the start.
  state.pickups.push({ kind: 'pistol', x: city.places.hideout.x + 60, y: city.places.hideout.y, taken: false });
  startMission(0);

  return {
    state, step, reset, snapshot, restore,
    startMission, addWanted: (n) => addWanted(n, state),
    nearestCar: (x, y, d, kinds) => nearestCar(x, y, d, kinds),
    playerCar,
  };
}

export { STEP };
