// Port Velo — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. Screens: title, play, paused,
// over (wasted / busted). The save lives in localStorage; S saves, C
// continues, R restarts. Mute with M.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRIME, EVENT_MISSION, EVENT_PICKUP, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SAVE, ACTION_SHOOT, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit.
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.snapshot()));
    return true;
  } catch {
    return false;
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let sirenOn = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) world.reset();
    world.state.started = true;
    world.state.over = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Follow the yellow marker — Mara is waiting.');
  }

  function continueGame() {
    const snap = loadSave();
    if (!snap) {
      announce('No save yet — press Enter to start a new game.');
      return;
    }
    world.reset();
    world.restore(snap);
    world.state.started = true;
    world.state.over = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Continued — $${world.state.player.cash} in the pocket, mission ${world.state.missionIndex + 1} of 5.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    const cash = world.state.player.cash;
    if (cash > best) { best = cash; saveBest(best); }
    audio.busted();
    announce(world.state.over === 'wasted' ? 'Wasted.' : 'Busted.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) {
      announce(saveGame() ? 'Game saved.' : 'Save failed — storage is off.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame(true);
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE) continueGame();
      else if (actions & ACTION_CONFIRM) startGame(true);
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startGame(true);
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The city lives behind the title: traffic and pedestrians move.
      world.step(STEP, { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, aimWorld: null });
      return;
    }
    const actions = input.takeActions();
    const held = input.read(actions);
    // Mouse aim: convert the canvas point to world coordinates.
    const camX = Math.max(0, Math.min(3600 - VIEW.width, world.state.player.x - VIEW.width / 2));
    const camY = Math.max(0, Math.min(2600 - VIEW.height, world.state.player.y - VIEW.height / 2));
    held.aimWorld = { x: input.mouse.x + camX, y: input.mouse.y + camY };
    held.enter = Boolean(actions & ACTION_ENTER);
    held.shoot = Boolean(actions & ACTION_SHOOT) || input.mouse.down;
    held.punch = input.spacePunch();
    const events = world.step(STEP, held);
    if (events & EVENT_MISSION) audio.mission();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRIME) audio.crash();
    if (world.state.over) endGame();
    // Siren + engine hum follow the live state.
    const wantSiren = world.state.wanted > 0 && screen === SCREEN_PLAY;
    if (wantSiren !== sirenOn) { sirenOn = wantSiren; audio.siren(wantSiren); }
    const car = world.state.cars.find((c) => c.id === world.state.player.carId);
    audio.engine(Boolean(car) && screen === SCREEN_PLAY, car ? Math.abs(car.speed) / 560 : 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Autosave every 20 seconds of play, so a crash never costs a mission.
  window.setInterval(() => {
    if (screen === SCREEN_PLAY && world.state.started) saveGame();
  }, 20000);

  announce('Port Velo — Neon Tide. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
