// Port Velo — the screenshot scenes behind ?shot=start|drive|chase|mission.
// Each one plays the real rules forward from a fresh world, steered by the
// autopilot, so the frame is what a short game really looks like and the same
// seed always gives the same frame. The loop never steps a staged scene.
import { STEP } from './config.js';
import { EVENT_MISSION } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { autopilotTo, driveInput } from './bot.js';

const SAMPLE = STEP;

/** Step the world with an input function for `seconds` of game time. */
function playFor(world, seconds, inputFn) {
  const steps = Math.round(seconds / SAMPLE);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events |= world.step(SAMPLE, inputFn(world.state, i * SAMPLE));
    if (world.state.over) break;
  }
  return events;
}

function idleInput() {
  return { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, aimWorld: null };
}

export function stageShot(name, world) {
  const s = world.state;
  world.reset();
  if (name === 'start') {
    // Title over a living city: traffic and pedestrians move for 6 seconds.
    playFor(world, 6, idleInput);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'drive') {
    // M1 in progress: steal the marina coupe, drive it down the avenue.
    const marina = s.city.places.marina;
    const hideout = s.city.places.hideout;
    playFor(world, 40, (st) => autopilotTo(st, marina.x, marina.y));
    playFor(world, 14, (st) => autopilotTo(st, hideout.x, hideout.y));
    return { screen: SCREEN_PLAY, best: 250 };
  }
  if (name === 'chase') {
    // Wanted 3, police on the tail, mid-pursuit on the Neon Strip.
    world.addWanted(3);
    const strip = s.city.places.strip;
    playFor(world, 30, (st) => autopilotTo(st, strip.x, strip.y));
    playFor(world, 10, (st) => autopilotTo(st, s.city.places.downtown.x, s.city.places.downtown.y));
    return { screen: SCREEN_PLAY, best: 400 };
  }
  if (name === 'mission') {
    // The Take, mid-robbery: two bags grabbed, cops closing in, heading home.
    // The heat is cooled between legs so the staged frame shows the mission
    // in progress, not a bust — the driving and the grabs are all real play.
    const coolOff = () => {
      const st = world.state;
      st.wanted = 0;
      st.heat = 0;
      st.cars = st.cars.filter((c) => c.kind !== 'police');
      st.peds = st.peds.filter((pd) => !pd.cop);
      st.player.health = 100;
      st.over = null;
      const car = st.cars.find((c) => c.id === st.player.carId);
      if (car) car.health = 100;
    };
    world.startMission(3);
    const P = s.city.places;
    // Stage the getaway car: the player starts already behind the wheel of
    // the red sedan (no steal, no heat — the chase scene covers the wanted
    // system). Everything after this is real driving and real bag grabs.
    const sedan = s.cars.find((c) => c.kind === 'parked' && c.color === '#c23b2e');
    if (sedan) {
      s.player.x = sedan.x;
      s.player.y = sedan.y;
      s.player.onFoot = false;
      s.player.carId = sedan.id;
      sedan.kind = 'stolen';
    }
    playFor(world, 45, (st) => autopilotTo(st, P.downtown.x, P.downtown.y));
    coolOff();
    playFor(world, 45, (st) => autopilotTo(st, P.bank.x, P.bank.y));
    coolOff();
    playFor(world, 30, (st) => autopilotTo(st, P.hideout.x, P.hideout.y));
    return { screen: SCREEN_PLAY, best: 800 };
  }
  // Any other name is the title.
  playFor(world, 6, idleInput);
  return { screen: SCREEN_TITLE, best: 0 };
}

export { driveInput };
