// Porto Verde — shared state, helpers, collision, save. All original.
export const CFG = { SPAN: 896, HALF: 448, ROAD: 14, BLOCK: 64, BOUND: 448, DAYLEN: 240 };
export const ROADS = [];
for (let i = 0; i <= 14; i++) ROADS.push(-448 + i * 64);
export const BLOCKS = [];
for (let i = 0; i < 14; i++) BLOCKS.push(-416 + i * 64);

export const G = {
  scene: null, camera: null, renderer: null,
  time: 0, dayT: 0.45, dayLen: 240, started: false, over: false, dead: false,
  money: 200, health: 100, wanted: 0, ammo: 12, ammoMax: 12,
  player: null, playerCar: null, cars: [], peds: [], coins: [], coinGot: [],
  raceBest: null, missionsDone: [false, false, false],
  mission: null, dialog: null, dialogQueue: [], toastT: 0,
  interior: null, keys: {}, mouseDX: 0, mouseDY: 0,
  yaw: 0, pitch: -0.18, camTarget: null,
  low: false, hintT: 0, eventT: 50, event: null, muted: false, radio: 0,
  bounds: 448, spawn: { x: 0, z: 300 },
  colliders: [], buildings: [], rooms: [], doors: [], named: {}, lamps: [],
  sun: null, hemi: null, lampMat: null, headlight: null,
  traffic: null, city: null, minimap: null, bigmap: null,
  stats: { peds: 0, cars: 0, buildings: 0 },
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
export function hash2(x, z) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

export function collideCircle(p, r, rect) {
  for (const c of G.colliders) {
    const cx = clamp(p.x, c.x - c.hx, c.x + c.hx);
    const cz = clamp(p.z, c.z - c.hz, c.z + c.hz);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
    } else if (d2 <= 0.0001) {
      const px = c.hx + r - Math.abs(p.x - c.x), pz = c.hz + r - Math.abs(p.z - c.z);
      if (px < pz) p.x = c.x + (p.x >= c.x ? c.hx + r : -(c.hx + r));
      else p.z = c.z + (p.z >= c.z ? c.hz + r : -(c.hz + r));
    }
  }
  if (rect) {
    p.x = clamp(p.x, rect.x0 + r, rect.x1 - r);
    p.z = clamp(p.z, rect.z0 + r, rect.z1 - r);
  } else {
    // Square city bounds: the city is a square grid, so a radial clamp
    // breaks routes whose corners sit past the radius.
    p.x = clamp(p.x, -G.bounds + r, G.bounds - r);
    p.z = clamp(p.z, -G.bounds + r, G.bounds - r);
  }
}

export function onRoad(x, z) {
  const px = ((x + 448) % 64 + 64) % 64, pz = ((z + 448) % 64 + 64) % 64;
  return px < 13 || px > 51 || pz < 13 || pz > 51;
}

export function roadPoint(x, z) {
  const gx = Math.round((x + 448) / 64) * 64 - 448;
  const gz = Math.round((z + 448) / 64) * 64 - 448;
  return Math.abs(x - gx) < Math.abs(z - gz) ? { x: gx, z } : { x, z: gz };
}

export function districtAt(x, z) {
  if (Math.abs(x) < 192 && Math.abs(z) < 192) return 'Downtown';
  if (x > 256) return 'Marina';
  if (x < -192) return 'Old Town';
  return 'Uptown';
}

const SAVE_KEY = 'porto-verde-save-v1';
export function saveGame() {
  try {
    const px = G.player ? G.player.position.x : G.spawn.x;
    const pz = G.player ? G.player.position.z : G.spawn.z;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, health: G.health, coinGot: G.coinGot, raceBest: G.raceBest, missionsDone: G.missionsDone, x: px, z: pz, dayT: G.dayT }));
  } catch (e) { /* storage unavailable */ }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
