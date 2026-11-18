// Shared state + helpers for Porto Verde. Loaded first; every other module
// reads G at call time, never at load time.
const G = {
  scene: null, camera: null, renderer: null, canvas: null,
  time: 0, dayT: 0, dayLen: 240, started: false, over: false, dead: false,
  money: 200, health: 100, wanted: 0, ammo: 12, ammoMax: 12,
  player: null, cars: [], peds: [], coins: [], coinGot: [],
  raceBest: null, missionsDone: [false, false, false],
  mission: null, dialog: null, dialogQueue: [], toastT: 0,
  interior: null, keys: {}, mouseDX: 0, mouseDY: 0,
  yaw: 0, pitch: -0.18, camTarget: null,
  low: false, shot: null, hintT: 0,
  eventT: 50, event: null, muted: false, radio: 0,
  bounds: 448, spawn: { x: 0, z: 300 },
  colliders: [], // {x,z,hx,hz} building footprints
  rooms: [], doors: [], named: {},
  sun: null, hemi: null, lampMat: null, headlight: null,
  traffic: null, city: null, minimap: null, bigmap: null,
  stats: { peds: 0, cars: 0, buildings: 0 },
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
// Deterministic-ish hash for stable per-building variation.
function hash2(x, z) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

// Circle vs building AABB colliders + city bounds. rect is an optional
// room bounds {x0,z0,x1,z1}; the main city is a SQUARE grid (-448..448),
// so the city clamp is a square clamp — a radial clamp would cut off the
// corners (e.g. the M1 van route at (-384,-320) is radius 500 from centre).
function collideCircle(p, r, rect) {
  for (const c of G.colliders) {
    const cx = clamp(p.x, c.x - c.hx, c.x + c.hx);
    const cz = clamp(p.z, c.z - c.hz, c.z + c.hz);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
    } else if (d2 <= 0.0001) {
      // centre inside the box: push out along the smallest penetration axis
      const px = c.hx + r - Math.abs(p.x - c.x), pz = c.hz + r - Math.abs(p.z - c.z);
      if (px < pz) p.x = c.x + (p.x >= c.x ? c.hx + r : -(c.hx + r));
      else p.z = c.z + (p.z >= c.z ? c.hz + r : -(c.hz + r));
    }
  }
  if (rect) {
    p.x = clamp(p.x, rect.x0 + r, rect.x1 - r);
    p.z = clamp(p.z, rect.z0 + r, rect.z1 - r);
  } else {
    const max = G.bounds - r;
    p.x = clamp(p.x, -max, max);
    p.z = clamp(p.z, -max, max);
  }
}
function hitBuilding(p, r) {
  for (const c of G.colliders) {
    if (Math.abs(p.x - c.x) < c.hx + r && Math.abs(p.z - c.z) < c.hz + r) return true;
  }
  return false;
}
function onRoad(x, z) {
  // Roads run on the grid lines: block pitch 64, road half-width 7.
  const px = ((x + 448) % 64 + 64) % 64, pz = ((z + 448) % 64 + 64) % 64;
  return px < 13 || px > 51 || pz < 13 || pz > 51;
}
function roadPoint(x, z) {
  // Snap a point onto the nearest road centreline.
  const gx = Math.round((x + 448) / 64) * 64 - 448;
  const gz = Math.round((z + 448) / 64) * 64 - 448;
  return Math.abs(x - gx) < Math.abs(z - gz) ? { x: gx, z } : { x, z: gz };
}
