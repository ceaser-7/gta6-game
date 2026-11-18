// Porto Verde — shared state, constants and helpers.
// Rebuilt from scratch in a recorded session for gta6-01 ("Make GTA 6").
// Original city, characters, names, story, art and sound. Nothing from Rockstar/GTA.

export const CFG = {
  BLOCK: 55, ROAD: 10, GRID: 14, SPAN: 900, HALF: 450, BOUND: 420,
  DAY_LEN: 240, // seconds per full day/night cycle; opens at golden-hour sunset
  SAVE_KEY: 'porto-verde-save-v1',
  MONEY_START: 200,
  HEALTH_MAX: 100,
  MAG: 12, // pistol magazine
  COIN_COUNT: 12,
  RACE_TIME: 90, RACE_CP: 5,
  TRAFFIC_N: 32, PED_N: 64,
};

// Road centre lines (13 roads each way) and block centres (14 blocks each way).
export const ROADS = [];
export const BLOCKS = [];
for (let k = 0; k < 13; k++) ROADS.push(-390 + k * 65);
for (let k = 0; k < 14; k++) BLOCKS.push(-422.5 + k * 65);

// Deterministic RNG (mulberry32) so the city is the same every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry32(20261117);
export const rand = (a = 1, b) => (b === undefined ? rng() * a : a + rng() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (x1, z1, x2, z2) => Math.hypot(x2 - x1, z2 - z1);
export const fmtClock = (s) => {
  const m = Math.floor(s / 60); const ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
};
export const fmtMoney = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;
// Angle lerp that takes the short way around.
export function angLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// District by quadrant. SW Old Town, NE Downtown, SE Marina, NW Northside.
export function districtAt(x, z) {
  if (x < 0 && z >= 0) return 'Old Town';
  if (x >= 0 && z < 0) return 'Downtown';
  if (x >= 0 && z >= 0) return 'Marina';
  return 'Northside';
}

// The one shared game state object. Modules import it and mutate it.
export const G = {
  scene: null, camera: null, renderer: null, clock: null,
  started: false, paused: false, over: false, busted: false,
  time: 0, dayT: 0, // dayT seconds into the 240s cycle; 0 = golden-hour sunset
  money: CFG.MONEY_START, health: CFG.HEALTH_MAX, wanted: 0,
  player: null, // { pos: Vector3, yaw, pitch, speed, onFoot, car, vel }
  cars: [], traffic: [], parked: [], police: [], officers: [],
  peds: [], named: {}, // Rosa, Dario, Nico
  buildings: [], // {x,z,hx,hz,h} for collision + line of sight
  colliders: [], // {x,z,hx,hz} boxes (buildings, props, room walls)
  coins: [], race: null, events: [], eventTimer: 50,
  mission: null, missionIdx: 0, missionsDone: [false, false, false],
  story: [], storyIdx: 0,
  dialog: null, dialogQueue: [],
  interior: null, // room object when inside, else null
  rooms: [],
  keys: {}, mouseDX: 0, mouseDY: 0,
  camTarget: null, camPos: null,
  headlight: null, sun: null, hemi: null, lamps: [],
  radio: null, muted: false, station: 0,
  hintUntil: 0, losTimer: 0, bustTimer: 0,
  raceBest: null, coinsGot: [],
  savePos: null, menuMode: true,
  shotMode: null, testMode: false,
  stats: { shots: 0, talks: 0 },
};
