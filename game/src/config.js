// Port Velo — Neon Tide. Constants for the whole game: world size, speeds,
// wanted tuning, mission timing. One place to tune the feel.
export const STEP = 1 / 60;
export const WORLD = { width: 3600, height: 2600 };
export const VIEW = { width: 1280, height: 720 };
export const SAVE_KEY = 'portvelo-save-v1';
export const BEST_KEY = 'portvelo-best-v1';

export const PLAYER = {
  radius: 11,
  walk: 170,
  run: 265,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
  shootCooldown: 0.28,
  bulletSpeed: 720,
  bulletDamage: 34,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 420,
  brake: 700,
  maxSpeed: 560,
  reverseMax: 180,
  turn: 2.6,
  drag: 0.55,
  health: 100,
};

export const TRAFFIC = { count: 26, speed: 150 };
export const PEDS = { count: 42, speed: 55 };
export const POLICE = { max: 6, speed: 470, ramDamage: 3 };

export const WANTED = {
  decayDelay: 14, // seconds with no crime and no cop sight before stars fall
  decayStep: 8, // seconds per star once decaying
  layLowBoost: 3, // decay runs this much faster inside a lay-low alley
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killPed: 2,
  ramCop: 2,
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'M1 · First Wheels',
    brief: 'Mara needs wheels. Steal the yellow coupe parked at the Marina and bring it to the Hideout.',
    reward: 250,
  },
  {
    id: 'courier',
    name: 'M2 · Courier Run',
    brief: 'Two drops, one clock. Pick up the package at the Market, then deliver to the Pier and the Plaza before the timer runs out.',
    reward: 400,
    timeLimit: 150,
  },
  {
    id: 'heat',
    name: 'M3 · Heat',
    brief: 'The Velo PD is on you. Lose the 2-star heat — break line of sight and cool off in the alleys, or just outrun them for 45 seconds.',
    reward: 350,
    survive: 45,
  },
  {
    id: 'the-take',
    name: 'M4 · The Take',
    brief: 'Three cash bags stashed around Downtown. Grab them all and get back to the Hideout — the cops will not wait.',
    reward: 800,
  },
  {
    id: 'neon-tide',
    name: 'M5 · Neon Tide',
    brief: 'Rival crew boss Rico is fleeing in the black sedan. Ram his car until it smokes, then escape to the Pier. End this.',
    reward: 1500,
  },
];

export const DISTRICTS = [
  { name: 'MARINA', x: 240, y: 200, w: 620, h: 300 },
  { name: 'DOWNTOWN', x: 1200, y: 240, w: 900, h: 620 },
  { name: 'MARKET ROW', x: 240, y: 900, w: 700, h: 420 },
  { name: 'OLD TOWN', x: 1200, y: 1100, w: 800, h: 500 },
  { name: 'THE PIER', x: 2400, y: 1900, w: 1000, h: 420 },
  { name: 'NEON STRIP', x: 2400, y: 300, w: 900, h: 500 },
];
