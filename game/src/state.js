// Porto Verde — shared state, constants and small utilities.
// Every module imports G from here; main.js fills the runtime fields.
export const BOUND = 448;          // square city clamp (+/-)
export const PITCH = 64;           // block pitch (block 48 + road 16)
export const ROAD_HALF = 8;        // road half-width
export const BLOCK = 48;           // block size
export const DAY_LEN = 240;        // day/night cycle seconds
export const SAVE_KEY = 'porto-verde-save-v1';

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (x1, z1, x2, z2) => { const dx = x2 - x1, dz = z2 - z1; return dx * dx + dz * dz; };
export const dist = (x1, z1, x2, z2) => Math.sqrt(dist2(x1, z1, x2, z2));
export const angLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
// Road centre-lines: -448, -384, ..., 448 (15 each way)
export const roadLines = () => { const out = []; for (let k = 0; k <= 14; k++) out.push(-BOUND + PITCH * k); return out; };
export const nearestRoad = (v) => { const k = Math.round((v + BOUND) / PITCH); return clamp(-BOUND + PITCH * k, -BOUND, BOUND); };
export const onRoad = (x, z) => {
  for (let k = 0; k <= 14; k++) { const c = -BOUND + PITCH * k; if (Math.abs(x - c) <= ROAD_HALF || Math.abs(z - c) <= ROAD_HALF) return true; }
  return false;
};
export const randomRoadPoint = () => {
  const lines = roadLines();
  const x = choice(lines), z = choice(lines);
  // a point on a road: one coordinate on a line, the other anywhere along it
  return Math.random() < 0.5 ? { x, z: rand(-BOUND + 16, BOUND - 16) } : { x: rand(-BOUND + 16, BOUND - 16), z };
};

// Ped name roster (30) + numbered fallback so naming can never hang.
export const FIRST_NAMES = ['Vic','Rosa','Dario','Nico','Tomas','Lena','Mara','Rook','Iris','Felix','Carmen','Jules','Priya','Omar','Sofia','Marco','Ana','Leo','Mira','Kofi','Elena','Hugo','Nadia','Silas','Greta','Ravi','Luz','Emil','Tara','Boris'];
export const LAST_NAMES = ['Voss','Delgado','Marino','Costa','Reyes','Ferro','Lindqvist','Okafor','Moreau','Silva','Novak','Haddad','Kowalski','Tanaka','Meyer','Diallo','Petrov','Garcia','Weber','Nasser'];
export function pedName(i) {
  if (i < FIRST_NAMES.length) return `${FIRST_NAMES[i]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
  return `Vic ${i - FIRST_NAMES.length + 1}`;
}

export const G = {
  // runtime (filled by main.js)
  scene: null, camera: null, renderer: null, clock: 0, dt: 0,
  time: 0,               // game seconds since start
  dayT: 40,              // day/night cycle position (opens at golden-hour sunset)
  started: false, over: false,
  // player
  player: { x: 0, z: 120, yaw: 0, pitch: 0, health: 100, money: 200, onFoot: true, car: null, speed: 0, ammo: 12, mag: 12, run: false },
  // world
  cars: [], peds: [], traffic: [], cops: [], roadblocks: [],
  buildings: [], rooms: [], coins: [], coinGot: [],
  // systems
  wanted: 0, losTimer: 0,
  mission: null, missionNum: 0, missionsDone: [false, false, false],
  race: { active: false, cp: 0, t: 0, best: null, cooldown: 0 },
  interior: null, dialog: null, dialogQueue: [],
  streetEvent: null, eventTimer: 45,
  radio: 0, muted: false,
  // hooks filled by hud.js / main.js
  ui: {}, api: {},
  // stats
  stats: { shots: 0, punches: 0, talks: 0 },
};
