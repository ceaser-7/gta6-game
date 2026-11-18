// Shared game state for Porto Verde v2. Every module reads and mutates this one object.
export const G = {
  // three.js
  scene: null, camera: null, renderer: null, clock: null,
  // world
  world: { buildings: [], colliders: [], roads: [], lamps: [], coins: [], vendors: [], interiors: [], markers: [] },
  // player
  player: null, // { mesh, pos, heading, speed, onFoot, car, health }
  // gameplay
  cash: 0, respect: 0, debt: 40000, coins: 0, coinsTotal: 20, coinsGot: {},
  wanted: 0, wantedHeat: 0, losTimer: 0,
  day: 1, timeOfDay: 18.0, // hours, 18:00 = golden hour sunset
  chapter: 0, // 0-based index into CHAPTERS; 7 = debt cleared
  mission: null, // active mission runtime { stage, timer, objective, target, ... }
  weapon: 0, weapons: [], ammo: [], // weapons: [fists, pistol, smg, locked]
  // flags
  running: false, paused: false, mapOpen: false, inInterior: null,
  keys: {}, mouseDX: 0, camMode: 0, muted: false, volume: 0.7,
  radioStation: 0, radioSong: 0,
  // systems
  traffic: [], peds: [], police: [], heli: null, roadblocks: [],
  events: [], eventTimer: 50,
  skidmarks: [], tracers: [],
  saveKey: 'porto-verde-save-v2',
  // callbacks filled by modules
  toast: null, say: null, updateHUD: null, startMission: null,
};

// ---- World constants ----
// Island: city grid inside |x|,|z| <= 320; beach ring 320..430; ocean beyond 430.
export const WORLD = {
  half: 480,          // ocean plane half-size
  cityHalf: 320,      // city grid extent
  beachInner: 320,    // sand starts
  beachOuter: 430,    // sand ends, deep water
  block: 80,          // city block size
  roadW: 14,
};

// 4 districts, each with a centre, label, and building palette.
export const DISTRICTS = [
  { name: 'Downtown',   cx: 0,    cz: 0,    color: 0x3a4a6b, label: 'DOWNTOWN' },
  { name: 'Marina',     cx: 240,  cz: 40,   color: 0x2a6b7a, label: 'MARINA' },
  { name: 'Old Town',   cx: -240, cz: -40,  color: 0x8a6a3a, label: 'OLD TOWN' },
  { name: 'Northside',  cx: 0,    cz: -240, color: 0x3a6b4a, label: 'NORTHSIDE' },
  { name: 'South Beach',cx: 0,    cz: 260,  color: 0x7a6a2a, label: 'SOUTH BEACH' },
];

// 5 car types.
export const CAR_TYPES = [
  { name: 'Verde Sedan',   top: 26, accel: 14, color: 0x4a7ab5, len: 4.4 },
  { name: 'Coupe GT',      top: 32, accel: 17, color: 0xc23a3a, len: 4.2 },
  { name: 'City SUV',      top: 24, accel: 12, color: 0x3a8a4a, len: 4.8 },
  { name: 'Harbor Taxi',   top: 27, accel: 15, color: 0xe8c832, len: 4.4 },
  { name: 'Falcon Sport',  top: 38, accel: 20, color: 0x8a2a8a, len: 4.0 },
];

// 4 weapon slots.
export const WEAPONS = [
  { name: 'Fists',  mag: Infinity, reserve: Infinity, dmg: 25, rate: 0.35 },
  { name: 'Pistol', mag: 12, reserve: 60, dmg: 34, rate: 0.28 },
  { name: 'SMG',    mag: 30, reserve: 120, dmg: 18, rate: 0.09 },
  { name: 'Riot Shotgun', mag: 6, reserve: 24, dmg: 70, rate: 0.8, locked: true },
];

// Named crew.
export const CREW = {
  rook:  { name: 'Rook',  color: '#8a2a2a', initial: 'R', role: 'Creditor — Mara owes him $40,000' },
  lena:  { name: 'Lena',  color: '#2a6b8a', initial: 'L', role: 'Wheelwoman — crew contact, gives jobs' },
  tomas: { name: 'Tomas', color: '#4a6b2a', initial: 'T', role: 'Mechanic — Sunray Garage' },
  rosa:  { name: 'Rosa',  color: '#8a5a2a', initial: 'R', role: 'El Faro restaurant — food & health' },
  kessler: { name: 'Kessler', color: '#5a2a8a', initial: 'K', role: 'Rival boss — runs the Marina docks' },
};

// 7 story chapters.
export const CHAPTERS = [
  { name: 'First Errand',   pay: 400,  desc: 'Rook needs a package moved. Lena talks you through it.', kind: 'delivery' },
  { name: 'Tail the Van',   pay: 800,  desc: 'Follow Kessler’s van without being spotted.', kind: 'tail' },
  { name: 'The Pickup',     pay: 1200, desc: 'Collect the drop at the Marina — fast, before the heat arrives.', kind: 'delivery' },
  { name: 'Heat',           pay: 2000, desc: 'A takedown goes loud. Lose the cops.', kind: 'takedown' },
  { name: 'Sunset Sprint',  pay: 2500, desc: 'Race the coast road from South Beach to the Marina.', kind: 'race' },
  { name: 'The Drop',       pay: 3500, desc: 'Getaway run — carry the goods across the island with the police on you.', kind: 'getaway' },
  { name: 'Settling the Debt', pay: 5000, desc: 'Confront Rook at the docks. End the $40,000 debt.', kind: 'boss' },
];

// Radio: 3 stations, each with named songs (procedural WebAudio loops).
export const STATIONS = [
  { name: 'VERDE FM', songs: ['Golden Hour Drive', 'Palma Nights', 'Coastline Cruise'], scale: [0, 3, 5, 7, 10], bpm: 96, wave: 'triangle' },
  { name: 'BASSLINE 98', songs: ['Low Tide', 'Neon Static', 'Harbor Lights'], scale: [0, 3, 5, 6, 10], bpm: 122, wave: 'sawtooth' },
  { name: 'COAST 101', songs: ['Salt Air', 'Dune Drift', 'Marina Morning'], scale: [0, 2, 4, 7, 9], bpm: 80, wave: 'sine' },
];

// Pedestrian name roster (numbered fallback so it never exhausts).
export const PED_NAMES = ['Ana', 'Bruno', 'Carmen', 'Diego', 'Elena', 'Felix', 'Greta', 'Hugo', 'Ines', 'Jorge', 'Kira', 'Luis', 'Marta', 'Nico', 'Olga', 'Pablo', 'Rosa', 'Sergio', 'Tania', 'Umar', 'Vera', 'Walt', 'Yara', 'Zoe'];

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function fmtCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtClock(day, hours) {
  const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
  return 'Day ' + day + ' · ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function respectLevel(r) { return 1 + Math.floor(r / 100); }
