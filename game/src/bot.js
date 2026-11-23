// Port Velo — autopilot. Drives the player toward a target point the way a
// human would: on foot it walks straight there; in a car it follows the road
// grid — along the current road to the target's avenue, then up that avenue
// to the target. Used by the screenshot scenes and by the Node tests to prove
// missions are completable.
import { WORLD } from './config.js';
import { ROAD_W, collideBuildings } from './city.js';

function nearest(value, list) {
  let best = list[0];
  for (const v of list) if (Math.abs(v - value) < Math.abs(best - value)) best = v;
  return best;
}

// Waypoints along the road grid from (x, y) to (tx, ty).
function roadRoute(state, x, y, tx, ty) {
  const xs = state.city.roadsX.map((r) => r + ROAD_W / 2);
  const ys = state.city.roadsY.map((r) => r + ROAD_W / 2);
  const cx = nearest(x, xs);
  const cy = nearest(y, ys);
  const txr = nearest(tx, xs);
  const tyr = nearest(ty, ys);
  const onHorizontal = Math.abs(y - cy) <= Math.abs(x - cx);
  if (onHorizontal) {
    return [{ x: txr, y: cy }, { x: txr, y: tyr }, { x: tx, y: ty }];
  }
  return [{ x: cx, y: tyr }, { x: txr, y: tyr }, { x: tx, y: ty }];
}

// Waypoint progress is remembered per world (a WeakMap keyed by the state
// object), so the bot follows its route in order and never flip-flops
// between two close waypoints: once a waypoint is reached it stays reached.
const progressByState = new WeakMap();

function routeProgress(state, tx, ty, inCar, route) {
  const key = `${tx},${ty},${inCar ? 'car' : 'foot'}`;
  let prog = progressByState.get(state);
  if (!prog || prog.key !== key) {
    prog = { key, index: 0, route };
    progressByState.set(state, prog);
  }
  return prog;
}

function nextWaypoint(state, tx, ty, inCar, px, py, threshold) {
  const route = roadRoute(state, px, py, tx, ty);
  const prog = routeProgress(state, tx, ty, inCar, route);
  const r = prog.route;
  while (prog.index < r.length - 1 && Math.hypot(r[prog.index].x - px, r[prog.index].y - py) < threshold) {
    prog.index += 1;
  }
  return r[prog.index];
}

export function driveInput(state, tx, ty) {
  const p = state.player;
  const car = state.cars.find((c) => c.id === p.carId);
  const input = { up: false, down: false, left: false, right: false, run: true, enter: false, punch: false, shoot: false, aimWorld: null };
  if (!car) {
    // On foot: follow the road route, one waypoint at a time — walking
    // straight at a target through the blocks gets stuck on corners.
    const wp = nextWaypoint(state, tx, ty, false, p.x, p.y, 40);
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 24) return input;
    const nx = p.x + (dx / d) * 20;
    const ny = p.y + (dy / d) * 20;
    const hit = collideBuildings(nx, ny, 12, state.city.buildings);
    if (hit.hit) {
      // Blocked: slide along the wall — try x-only, then y-only.
      const hx = collideBuildings(p.x + (dx / d) * 20, p.y, 12, state.city.buildings);
      const hy = collideBuildings(p.x, p.y + (dy / d) * 20, 12, state.city.buildings);
      if (!hx.hit) { input.right = dx > 0; input.left = dx < 0; }
      else if (!hy.hit) { input.down = dy > 0; input.up = dy < 0; }
      else { input.right = dx > 0; input.left = dx < 0; input.down = dy > 0; input.up = dy < 0; }
      return input;
    }
    input.right = dx > 8;
    input.left = dx < -8;
    input.down = dy > 8;
    input.up = dy < -8;
    return input;
  }
  // Driving: follow the road route, one waypoint at a time.
  const wp = nextWaypoint(state, tx, ty, true, car.x, car.y, 70);
  const dx = wp.x - car.x;
  const dy = wp.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 30) return input;
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > 2.4 && Math.abs(car.speed) < 60) {
    // Facing away: reverse out of it.
    input.down = true;
    input.left = diff > 0;
    input.right = diff < 0;
    return input;
  }
  // Slow down for a sharp turn or a close waypoint.
  const sharp = Math.abs(diff) > 0.7;
  input.up = !sharp || Math.abs(car.speed) < 140;
  if (d < 120 && Math.abs(car.speed) > 200) input.up = false;
  input.left = diff > 0.12;
  input.right = diff < -0.12;
  // Brake for a wall dead ahead.
  const ahead = { x: car.x + Math.cos(car.angle) * 90, y: car.y + Math.sin(car.angle) * 90 };
  const hit = collideBuildings(ahead.x, ahead.y, 12, state.city.buildings);
  if (hit.hit && Math.abs(car.speed) > 60) { input.up = false; input.down = true; }
  return input;
}

// Enter the nearest stealable car, then drive it to (tx, ty). On foot and far
// from the target, walk to the car nearest the TARGET first — that is the car
// the trip is about (the marina coupe for M1, the closest wheels otherwise).
// Driving beats walking, and the mission car is the one parked at the job.
export function autopilotTo(state, tx, ty) {
  const p = state.player;
  if (p.onFoot) {
    const stealable = state.cars.filter((c) => c.kind === 'parked');
    const near = stealable
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (near && Math.hypot(near.x - p.x, near.y - p.y) < 60) {
      return { up: false, down: false, left: false, right: false, run: false, enter: true, punch: false, shoot: false, aimWorld: null };
    }
    if (Math.hypot(tx - p.x, ty - p.y) > 500) {
      const atTarget = stealable
        .sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0];
      if (atTarget) return driveInput(state, atTarget.x, atTarget.y);
    }
    return driveInput(state, tx, ty);
  }
  return driveInput(state, tx, ty);
}

export function clampToWorld(x, y) {
  return { x: Math.max(20, Math.min(WORLD.width - 20, x)), y: Math.max(20, Math.min(WORLD.height - 20, y)) };
}
