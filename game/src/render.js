// Port Velo — the canvas renderer. Top-down camera that follows the player,
// a sun-soaked city drawn from the city data (roads, beach, park, roofs with
// a lit edge), cars and people as seen from above, and the whole HUD:
// health, cash, wanted stars, mission line, speed, message feed and minimap.
import { VIEW, WORLD } from './config.js';
import { ROAD_W } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const STAR = '★';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  function camera(state) {
    const p = state.player;
    return {
      x: Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2)),
      y: Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2)),
    };
  }

  function drawCity(state, cam) {
    const city = state.city;
    // Ground: dry grass / concrete base.
    ctx.fillStyle = '#7a8f5a';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Beach along the south edge.
    const b = city.beach;
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, WORLD.height - 46 - cam.y, VIEW.width, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = 0; x < VIEW.width; x += 90) {
      ctx.fillRect(((x + state.time * 12) % 180) - 40, WORLD.height - 52 - cam.y, 60, 3);
    }
    // Park.
    ctx.fillStyle = '#4a7d3a';
    ctx.fillRect(city.park.x - cam.x, city.park.y - cam.y, city.park.w, city.park.h);
    ctx.fillStyle = '#6aa84f';
    ctx.beginPath();
    ctx.arc(city.park.x + 150 - cam.x, city.park.y + 150 - cam.y, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d8fc2';
    ctx.beginPath();
    ctx.arc(city.park.x + 150 - cam.x, city.park.y + 150 - cam.y, 30, 0, Math.PI * 2);
    ctx.fill();
    // Plaza paving.
    ctx.fillStyle = '#b8a888';
    ctx.fillRect(city.plaza.x - cam.x, city.plaza.y - cam.y, city.plaza.w, city.plaza.h);
    // Roads.
    ctx.fillStyle = '#3a3f46';
    for (const rx of city.roadsX) ctx.fillRect(rx - cam.x, 0, ROAD_W, VIEW.height);
    for (const ry of city.roadsY) ctx.fillRect(0, ry - cam.y, VIEW.width, ROAD_W);
    // Lane dashes.
    ctx.fillStyle = '#e8d44d';
    for (const rx of city.roadsX) {
      for (let y = -cam.y % 60; y < VIEW.height; y += 60) ctx.fillRect(rx + ROAD_W / 2 - 2 - cam.x, y, 4, 26);
    }
    for (const ry of city.roadsY) {
      for (let x = -cam.x % 60; x < VIEW.width; x += 60) ctx.fillRect(x, ry + ROAD_W / 2 - 2 - cam.y, 26, 4);
    }
    // Lay-low alleys, marked with a teal tint.
    ctx.fillStyle = 'rgba(46,160,160,0.35)';
    for (const r of city.layLow) ctx.fillRect(r.x - cam.x, r.y - cam.y, r.w, r.h);
    ctx.fillStyle = '#2ea0a0';
    ctx.font = 'bold 11px sans-serif';
    for (const r of city.layLow) ctx.fillText('LAY LOW', r.x + 18 - cam.x, r.y + 34 - cam.y);
    // Buildings: body, roof, lit south edge, windows.
    for (const bd of city.buildings) {
      const x = bd.x - cam.x;
      const y = bd.y - cam.y;
      if (x > VIEW.width || y > VIEW.height || x + bd.w < 0 || y + bd.h < 0) continue;
      ctx.fillStyle = bd.color;
      ctx.fillRect(x, y, bd.w, bd.h);
      ctx.fillStyle = bd.roof;
      ctx.fillRect(x + 6, y + 6, bd.w - 12, bd.h - 12);
      ctx.fillStyle = 'rgba(255,235,160,0.55)';
      ctx.fillRect(x + 6, y + bd.h - 12, bd.w - 12, 5);
      ctx.fillStyle = 'rgba(20,30,50,0.5)';
      for (let wy = y + 16; wy < y + bd.h - 14; wy += 22) {
        for (let wx = x + 14; wx < x + bd.w - 14; wx += 26) ctx.fillRect(wx, wy, 10, 8);
      }
      if (bd.hgt >= 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 4, y + 4, bd.w, bd.h);
        ctx.fillStyle = bd.roof;
        ctx.fillRect(x + 8, y + 8, bd.w - 16, bd.h - 16);
      }
    }
    // Palms.
    for (const pl of city.palms) {
      const x = pl.x - cam.x;
      const y = pl.y - cam.y;
      if (x < -20 || x > VIEW.width + 20 || y < -20 || y > VIEW.height + 20) continue;
      ctx.strokeStyle = '#6b4a2e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3, y - 14);
      ctx.stroke();
      ctx.fillStyle = '#3d8a4a';
      ctx.beginPath();
      ctx.arc(x + 3, y - 18, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    // District labels.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    for (const d of [
      { name: 'MARINA', x: 560, y: 360 }, { name: 'DOWNTOWN', x: 1650, y: 560 },
      { name: 'MARKET ROW', x: 590, y: 1120 }, { name: 'OLD TOWN', x: 1600, y: 1360 },
      { name: 'NEON STRIP', x: 2850, y: 560 }, { name: 'THE PIER', x: 2900, y: 2080 },
    ]) ctx.fillText(d.name, d.x - cam.x, d.y - cam.y);
    ctx.textAlign = 'left';
    // Place markers.
    ctx.font = 'bold 12px sans-serif';
    for (const [key, pl] of Object.entries(city.places)) {
      ctx.fillStyle = key === 'hideout' ? '#f2c200' : '#ffffff';
      ctx.fillText(pl.label, pl.x - cam.x - 20, pl.y - cam.y - 26);
    }
  }

  function drawCar(c, cam) {
    const x = c.x - cam.x;
    const y = c.y - cam.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-26 + 3, -13 + 4, 52, 26);
    ctx.fillStyle = c.color;
    ctx.fillRect(-26, -13, 52, 26);
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(-6, -11, 14, 22);
    ctx.fillStyle = c.kind === 'police' ? '#ffffff' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(14, -11, 8, 22);
    if (c.kind === 'police') {
      ctx.fillStyle = '#1c2733';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VPD', 0, 4);
      ctx.textAlign = 'left';
      const flash = Math.floor(state_time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
      ctx.beginPath();
      ctx.arc(-14, -8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#2e7bff' : '#ff2e2e';
      ctx.beginPath();
      ctx.arc(-14, 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.kind === 'rival') {
      ctx.fillStyle = '#f2c200';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RICO', 0, 4);
      ctx.textAlign = 'left';
    }
    if (c.health < 100 && c.kind !== 'wreck') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-26, -20, 52, 4);
      ctx.fillStyle = c.health > 40 ? '#7dc23b' : '#c23b2e';
      ctx.fillRect(-26, -20, 52 * (c.health / 100), 4);
    }
    ctx.restore();
    if (c.kind === 'wreck') {
      ctx.fillStyle = 'rgba(40,40,40,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(pd, cam) {
    const x = pd.x - cam.x;
    const y = pd.y - cam.y;
    if (pd.down > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pd.cop ? '#1c2733' : pd.color;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pd.cop ? '#dfe8ff' : '#2e2a24';
    ctx.beginPath();
    ctx.arc(x, y - 3, 5, 0, Math.PI * 2);
    ctx.fill();
    if (pd.cop) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VPD', x, y + 3);
      ctx.textAlign = 'left';
    }
  }

  function drawPlayer(state, cam) {
    const p = state.player;
    const car = state.cars.find((c) => c.id === p.carId);
    if (car) return; // drawn with the cars
    const x = p.x - cam.x;
    const y = p.y - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#f2c200';
    ctx.fillRect(-8, -11, 16, 22);
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(4, -11, 8, 22);
    ctx.restore();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e2a24';
    ctx.beginPath();
    ctx.arc(x, y - 2, 6, Math.PI, Math.PI * 2);
    ctx.fill();
    if (p.pistol) {
      ctx.fillStyle = '#222';
      ctx.fillRect(x + Math.cos(p.angle) * 12 - 3, y + Math.sin(p.angle) * 12 - 2, 8, 4);
    }
  }

  function drawMarker(state, cam) {
    const m = state.mission;
    if (!m) return;
    const obj = m.objectives[m.step];
    if (!obj || obj.x === undefined) return;
    const x = obj.x - cam.x;
    const y = obj.y - cam.y;
    const pulse = 1 + Math.sin(state_time * 4) * 0.15;
    ctx.strokeStyle = '#f2c200';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f2c200';
    ctx.beginPath();
    ctx.moveTo(x, y - 44);
    ctx.lineTo(x - 9, y - 26);
    ctx.lineTo(x + 9, y - 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼', x, y - 30);
    ctx.textAlign = 'left';
  }

  function drawMinimap(state) {
    const mw = 220;
    const mh = 158;
    const mx = VIEW.width - mw - 14;
    const my = 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = '#0d141d';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#f2c200';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = '#3a3f46';
    for (const rx of state.city.roadsX) ctx.fillRect(mx + rx * sx, my, 96 * sx, mh);
    for (const ry of state.city.roadsY) ctx.fillRect(mx, my + ry * sy, mw, 96 * sy);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(mx, my + mh - 8, mw, 8);
    ctx.fillStyle = '#4a7d3a';
    ctx.fillRect(mx + state.city.park.x * sx, my + state.city.park.y * sy, state.city.park.w * sx, state.city.park.h * sy);
    const m = state.mission;
    if (m) {
      const obj = m.objectives[m.step];
      if (obj && obj.x !== undefined) {
        ctx.fillStyle = '#f2c200';
        ctx.beginPath();
        ctx.arc(mx + obj.x * sx, my + obj.y * sy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const c of state.cars) {
      if (c.kind === 'police') {
        ctx.fillStyle = '#4d8bff';
        ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4);
      }
    }
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2c200';
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('PORT VELO', mx + 4, my + mh - 6);
  }

  function drawHUD(state) {
    const p = state.player;
    // Top-left: cash, health, ammo.
    ctx.fillStyle = '#0d141d';
    ctx.fillRect(14, 14, 250, 84);
    ctx.fillStyle = '#7dc23b';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`$${p.cash}`, 26, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`HEALTH ${Math.max(0, Math.round(p.health))}`, 26, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(26, 72, 180, 8);
    ctx.fillStyle = p.health > 40 ? '#7dc23b' : '#c23b2e';
    ctx.fillRect(26, 72, 180 * Math.max(0, p.health / 100), 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.pistol ? `PISTOL ${p.ammo} rds` : 'NO WEAPON — pistol at Hideout', 26, 94);
    // Wanted stars, top centre.
    ctx.fillStyle = '#0d141d';
    ctx.fillRect(VIEW.width / 2 - 110, 14, 220, 40);
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? '#f2c200' : 'rgba(255,255,255,0.25)';
      ctx.fillText(STAR, VIEW.width / 2 - 80 + i * 40, 44);
    }
    ctx.textAlign = 'left';
    if (state.wanted > 0) {
      ctx.fillStyle = '#ff6b5e';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.wanted >= 3 ? 'THE WHOLE VPD IS COMING' : 'WANTED — break line of sight, cool off in alleys', VIEW.width / 2, 68);
      ctx.textAlign = 'left';
    }
    // Mission line, bottom-left.
    const m = state.mission;
    if (m) {
      const obj = m.objectives[m.step];
      ctx.fillStyle = '#0d141d';
      const lines = [m.name, obj ? obj.label : 'Return to Mara'];
      ctx.fillRect(14, VIEW.height - 78, 560, 64);
      ctx.fillStyle = '#f2c200';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(lines[0], 26, VIEW.height - 52);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px sans-serif';
      ctx.fillText(lines[1], 26, VIEW.height - 30);
      if (state.missionTimer > 0) {
        ctx.fillStyle = state.missionTimer < 20 ? '#ff6b5e' : '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${Math.ceil(state.missionTimer)}s`, 540, VIEW.height - 30);
      }
    }
    // Speed, bottom-right (driving) or controls hint (on foot).
    ctx.fillStyle = '#0d141d';
    ctx.fillRect(VIEW.width - 214, VIEW.height - 78, 200, 64);
    const car = state.cars.find((c) => c.id === p.carId);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    if (car) {
      ctx.fillText(`${Math.round(Math.abs(car.speed) * 0.18)} mph`, VIEW.width - 200, VIEW.height - 48);
      ctx.font = '12px sans-serif';
      ctx.fillText(`${car.name} · ${Math.round(car.health)}%`, VIEW.width - 200, VIEW.height - 28);
    } else {
      ctx.font = '12px sans-serif';
      ctx.fillText('WASD move · Shift run', VIEW.width - 200, VIEW.height - 52);
      ctx.fillText('E enter car · Space punch', VIEW.width - 200, VIEW.height - 34);
      ctx.fillText('Click shoot (with pistol)', VIEW.width - 200, VIEW.height - 18);
    }
    // Message feed.
    if (state.message && state.time - state.messageAt < 7) {
      ctx.fillStyle = '#0d141d';
      const w = Math.min(760, ctx.measureText(state.message).width + 28);
      ctx.fillRect(VIEW.width / 2 - w / 2, 84, w, 34);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.message, VIEW.width / 2, 106);
      ctx.textAlign = 'left';
    }
    drawMinimap(state);
  }

  function drawTitle(state, best) {
    drawCity(state, camera(state));
    ctx.fillStyle = 'rgba(8,12,20,0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2c200';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('PORT VELO', VIEW.width / 2, 220);
    ctx.fillStyle = '#ff5e8a';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('— NEON TIDE —', VIEW.width / 2, 268);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('An open-world crime story in the sun-soaked city of Port Velo.', VIEW.width / 2, 318);
    ctx.fillText('Steal cars. Outrun the VPD. Run five missions for Mara and Rico.', VIEW.width / 2, 346);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Press ENTER or click to start  ·  C to continue your save', VIEW.width / 2, 420);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px sans-serif';
    ctx.fillText('WASD / arrows — move & drive · E — enter / exit car · Space — punch · Click — shoot', VIEW.width / 2, 462);
    ctx.fillText('Shift — run · M — mute · P — pause · R — restart', VIEW.width / 2, 486);
    if (best > 0) {
      ctx.fillStyle = '#7dc23b';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`Best haul so far: $${best}`, VIEW.width / 2, 530);
    }
    ctx.textAlign = 'left';
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(8,12,20,0.7)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('PAUSED', VIEW.width / 2, 330);
    ctx.font = '18px sans-serif';
    ctx.fillText('P or Enter to resume · R to restart · S saves your game', VIEW.width / 2, 380);
    ctx.textAlign = 'left';
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(8,12,20,0.78)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    const wasted = state.over === 'wasted';
    ctx.fillStyle = wasted ? '#c23b2e' : '#4d8bff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(wasted ? 'WASTED' : 'BUSTED', VIEW.width / 2, 300);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText(state.message || '', VIEW.width / 2, 350);
    ctx.fillText(`Cash: $${state.player.cash} · Missions done: ${state.stats.missionsDone}`, VIEW.width / 2, 390);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Press ENTER to get back on the streets', VIEW.width / 2, 450);
    ctx.textAlign = 'left';
  }

  let state_time = 0;

  function draw(state, screen, best) {
    state_time = state.time;
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    if (screen === SCREEN_TITLE) { drawTitle(state, best); return; }
    if (screen === SCREEN_OVER) { drawCity(state, camera(state)); drawOver(state, best); return; }
    const cam = camera(state);
    drawCity(state, cam);
    // Pickups.
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      const x = pk.x - cam.x;
      const y = pk.y - cam.y;
      ctx.fillStyle = pk.kind === 'pistol' ? '#222' : pk.kind === 'cashbag' ? '#7dc23b' : '#f2c200';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'pistol' ? 'GUN' : pk.kind === 'cashbag' ? '$' : 'PKG', x, y + 3);
      ctx.textAlign = 'left';
    }
    drawMarker(state, cam);
    for (const c of state.cars) drawCar(c, cam);
    for (const pd of state.peds) drawPed(pd, cam);
    for (const b of state.bullets) {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(b.x - cam.x, b.y - cam.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    drawPlayer(state, cam);
    drawHUD(state);
    if (screen === SCREEN_PAUSED) drawPaused(state);
  }

  return { draw };
}
