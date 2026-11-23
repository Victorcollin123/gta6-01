// Port Velo — the city itself. A fixed road grid (avenues every 400 px) with
// building blocks between the roads, a beach along the south edge, a park,
// and the named places the missions use. Deterministic from the seed: the
// same seed always builds the same streets, so screenshots are repeatable.
import { WORLD } from './config.js';
import { intRange, pick, range } from './random.js';

export const ROAD_W = 96;
export const BLOCK = 400;

const PALETTES = [
  ['#2e4a6b', '#3a5a80', '#274058'],
  ['#6b4a2e', '#7d5a3a', '#5d3c24'],
  ['#3d6b4a', '#4a7d5a', '#33573c'],
  ['#5a3d6b', '#6b4a7d', '#4a3357'],
  ['#6b2e3d', '#7d3a4a', '#572430'],
];

export function buildCity(rng) {
  const roadsX = [];
  const roadsY = [];
  for (let x = 200; x < WORLD.width - 100; x += BLOCK) roadsX.push(x);
  for (let y = 200; y < WORLD.height - 100; y += BLOCK) roadsY.push(y);

  const buildings = [];
  // One building per block cell, inset from the roads, with a random footprint.
  for (const rx of roadsX) {
    for (const ry of roadsY) {
      const bx = rx + ROAD_W + 14;
      const by = ry + ROAD_W + 14;
      const bw = BLOCK - ROAD_W - 28;
      const bh = BLOCK - ROAD_W - 28;
      // Edge blocks are left open so no building ever leaves the world.
      if (bx + bw > WORLD.width - 10 || by + bh > WORLD.height - 10) continue;
      // The park replaces the block at (1200, 1500)-ish; the plaza at (2400, 1100).
      if (rx === 1200 && ry === 1400) continue; // park
      if (rx === 2400 && ry === 1000) continue; // plaza
      if (rx === 200 && ry === 1800) continue; // hideout yard
      const palette = pick(rng, PALETTES);
      const split = rng() < 0.45;
      if (split) {
        const cut = intRange(rng, 90, bw - 90);
        buildings.push({ x: bx, y: by, w: cut - 8, h: bh, color: palette[0], roof: palette[1], hgt: intRange(rng, 1, 4) });
        buildings.push({ x: bx + cut + 8, y: by, w: bw - cut - 8, h: bh, color: palette[2], roof: palette[0], hgt: intRange(rng, 1, 4) });
      } else {
        buildings.push({ x: bx, y: by, w: bw, h: bh, color: palette[0], roof: palette[1], hgt: intRange(rng, 1, 5) });
      }
    }
  }

  // Named places (all on roads, so the player can always reach them).
  const places = {
    hideout: { x: 320, y: 1980, label: 'HIDEOUT' },
    marina: { x: 560, y: 300, label: 'MARINA' },
    market: { x: 480, y: 1100, label: 'MARKET' },
    pier: { x: 2900, y: 2248, label: 'THE PIER' },
    plaza: { x: 2600, y: 1200, label: 'PLAZA' },
    downtown: { x: 1650, y: 648, label: 'DOWNTOWN' },
    bank: { x: 1490, y: 900, label: 'BANK' },
    strip: { x: 2848, y: 648, label: 'NEON STRIP' },
  };
  const park = { x: 1310, y: 1510, w: 276, h: 276 };
  const plazaRect = { x: 2510, y: 1110, w: 276, h: 276 };
  const beach = { x: 0, y: WORLD.height - 130, w: WORLD.width, h: 130 };

  // Lay-low alleys: narrow gaps where wanted decays fast.
  const layLow = [
    { x: 700, y: 700, w: 120, h: 60 },
    { x: 1900, y: 1500, w: 120, h: 60 },
    { x: 2700, y: 1700, w: 120, h: 60 },
    { x: 1100, y: 2100, w: 120, h: 60 },
  ];

  // Parked cars the player can steal, scattered on road edges.
  const parked = [];
  const parkedSpots = [
    { x: 560, y: 250, angle: 0, color: '#f2c200', name: 'Coupe' },
    { x: 1560, y: 648, angle: Math.PI / 2, color: '#c23b2e', name: 'Sedan' },
    { x: 2600, y: 700, angle: 0, color: '#2e8bc2', name: 'Hatch' },
    { x: 900, y: 1500, angle: Math.PI / 2, color: '#7dc23b', name: 'Pickup' },
    { x: 2100, y: 1900, angle: 0, color: '#c23b8a', name: 'Coupe' },
    { x: 3200, y: 1100, angle: Math.PI / 2, color: '#e8e4da', name: 'Sedan' },
    { x: 700, y: 2200, angle: 0, color: '#3bc2a8', name: 'Van' },
    { x: 2900, y: 1500, angle: Math.PI / 2, color: '#f28c13', name: 'Taxi' },
  ];
  for (const s of parkedSpots) parked.push({ ...s, taken: false });

  // Decorative palms along the beach and the pier.
  const palms = [];
  for (let x = 120; x < WORLD.width; x += 170) {
    palms.push({ x: x + range(rng, -30, 30), y: WORLD.height - 70 + range(rng, -14, 14) });
  }
  for (let i = 0; i < 26; i += 1) {
    palms.push({ x: range(rng, park.x, park.x + park.w), y: range(rng, park.y, park.y + park.h) });
  }

  return { roadsX, roadsY, buildings, places, park, plaza: plazaRect, beach, layLow, parked, palms };
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function circleHitsRect(x, y, radius, r) {
  const cx = Math.max(r.x, Math.min(x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(y, r.y + r.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

// Push a circle out of every building it overlaps; returns true if it hit one.
export function collideBuildings(x, y, radius, buildings) {
  let hit = false;
  for (const b of buildings) {
    if (!circleHitsRect(x, y, radius, b)) continue;
    hit = true;
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - cx;
    let dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    if (d === 0 || (cx === x && cy === y)) {
      // Centre inside the rect: push out along the smallest penetration.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - radius;
      else if (m === right) x = b.x + b.w + radius;
      else if (m === top) y = b.y - radius;
      else y = b.y + b.h + radius;
      continue;
    }
    dx /= d;
    dy /= d;
    x = cx + dx * radius;
    y = cy + dy * radius;
  }
  return { x, y, hit };
}

export function onRoad(x, y, city) {
  for (const rx of city.roadsX) if (x >= rx && x <= rx + ROAD_W) return true;
  for (const ry of city.roadsY) if (y >= ry && y <= ry + ROAD_W) return true;
  return false;
}

// Nearest point on the road network (used to spawn traffic / route cars).
export function nearestRoadPoint(x, y, city) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadsX) {
    const px = rx + ROAD_W / 2;
    const d = Math.abs(x - px);
    if (d < bestD) { bestD = d; best = { x: px, y }; }
  }
  for (const ry of city.roadsY) {
    const py = ry + ROAD_W / 2;
    const d = Math.abs(y - py);
    if (d < bestD) { bestD = d; best = { x, y: py }; }
  }
  return best;
}
