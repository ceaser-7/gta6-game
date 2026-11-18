// Porto Verde — the city: 14x14 blocks, 4 districts, parks, plaza, beach, signs.
import * as THREE from '../vendor/three.module.min.js';
import { G, BOUND, PITCH, BLOCK, ROAD_HALF, rand, randi, choice, clamp, nearestRoad } from './state.js';

export const BLOCK_CENTERS = [];
for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) BLOCK_CENTERS.push({ i, j, x: -416 + PITCH * i, z: -416 + PITCH * j });

function facadeTexture(base, lit) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  // grime band at the base
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 230, 128, 26);
  // shopfront band on the ground floor
  g.fillStyle = 'rgba(20,18,16,0.85)'; g.fillRect(6, 196, 116, 30);
  g.fillStyle = 'rgba(255,210,140,0.9)'; g.fillRect(10, 204, 40, 14);
  g.fillStyle = 'rgba(180,220,255,0.85)'; g.fillRect(60, 204, 56, 14);
  for (let r = 0; r < 6; r++) for (let col = 0; col < 4; col++) {
    const x = 10 + col * 30, y = 14 + r * 30;
    const on = Math.random() < lit;
    g.fillStyle = on ? (Math.random() < 0.6 ? '#ffd98a' : '#bcd8ff') : 'rgba(10,12,16,0.85)';
    g.fillRect(x, y, 20, 20);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, 20, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PALETTES = {
  oldtown: { base: ['#8a6f52', '#7d6450', '#96795a', '#6e5a44'], lit: 0.45, h: [10, 18] },
  downtown: { base: ['#5d6670', '#4c5560', '#6b7280', '#3f4750'], lit: 0.6, h: [26, 58] },
  marina: { base: ['#7a7f74', '#8a8474', '#6e7d84', '#94806a'], lit: 0.5, h: [14, 34] },
  market: { base: ['#946b4a', '#7a5c40', '#a07a52', '#5f6b52'], lit: 0.5, h: [10, 22] },
};
export function districtOf(x, z) {
  if (x < 0 && z < 0) return 'oldtown';
  if (x >= 0 && z < 0) return 'downtown';
  if (x >= 0 && z >= 0) return 'marina';
  return 'market';
}

const PARKS = [{ i: 3, j: 3 }, { i: 10, j: 10 }];
const PLAZA = [{ i: 6, j: 6 }, { i: 6, j: 7 }, { i: 7, j: 6 }, { i: 7, j: 7 }];
const BEACH_ROW = 13; // last row (z ~ 416) is sand, no buildings

function isPark(i, j) { return PARKS.some(p => p.i === i && p.j === j); }
function isPlaza(i, j) { return PLAZA.some(p => p.i === i && p.j === j); }

export function buildCity() {
  const scene = G.scene;
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2 + 64, BOUND * 2 + 64), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0); scene.add(ground);
  // asphalt roads: dark strips along every road line
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2e });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xcfc36a });
  for (let k = 0; k <= 14; k++) {
    const c = -BOUND + PITCH * k;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2, ROAD_HALF * 2), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0, c); scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, BOUND * 2), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0, 0); scene.add(v);
    // centre dashes
    for (let d = -BOUND + 32; d < BOUND; d += 64) {
      const dh = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.2), dashMat);
      dh.rotation.x = -Math.PI / 2; dh.position.set(d, 0.02, c); scene.add(dh);
      const dv = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 14), dashMat);
      dv.rotation.x = -Math.PI / 2; dv.position.set(c, 0.02, d); scene.add(dv);
    }
  }
  // beach strip along the south edge
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2, 48), new THREE.MeshLambertMaterial({ color: 0xc9b285 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.01, 424); scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2, 60), new THREE.MeshLambertMaterial({ color: 0x2a5d7a }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.2, 478); scene.add(sea);

  const texCache = {};
  const texFor = (d) => {
    const pal = PALETTES[d];
    const base = choice(pal.base);
    const key = d + base;
    if (!texCache[key]) texCache[key] = facadeTexture(base, pal.lit);
    return texCache[key];
  };
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2e2a26 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f6b3a });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a6b3f });
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0x8a8578 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });

  let buildingCount = 0;
  for (const b of BLOCK_CENTERS) {
    const d = districtOf(b.x, b.z);
    if (isPark(b.i, b.j)) {
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), grassMat);
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(b.x, 0.03, b.z); scene.add(lawn);
      for (let t = 0; t < 5; t++) {
        const tx = b.x + rand(-18, 18), tz = b.z + rand(-18, 18);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5, 6), trunkMat);
        trunk.position.set(tx, 2.5, tz); scene.add(trunk);
        const top = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 6), leafMat);
        top.position.set(tx, 6.5, tz); scene.add(top);
      }
      continue;
    }
    if (isPlaza(b.i, b.j)) {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), plazaMat);
      slab.rotation.x = -Math.PI / 2; slab.position.set(b.x, 0.03, b.z); scene.add(slab);
      continue;
    }
    if (b.j === BEACH_ROW) continue; // sand, no buildings
    const pal = PALETTES[d];
    const h = rand(pal.h[0], pal.h[1]);
    const w = rand(28, 40), dep = rand(28, 40);
    const tall = h > 34;
    const mat = tall && Math.random() < 0.4 ? glassMat : new THREE.MeshLambertMaterial({ map: texFor(d) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
    mesh.position.set(b.x + rand(-3, 3), h / 2, b.z + rand(-3, 3)); scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1, dep + 1), roofMat);
    roof.position.set(mesh.position.x, h + 0.5, mesh.position.z); scene.add(roof);
    if (tall) { // setback crown
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 6, dep * 0.55), mat);
      crown.position.set(mesh.position.x, h + 4, mesh.position.z); scene.add(crown);
    }
    G.buildings.push({ x0: mesh.position.x - w / 2 - 0.5, z0: mesh.position.z - dep / 2 - 0.5, x1: mesh.position.x + w / 2 + 0.5, z1: mesh.position.z + dep / 2 + 0.5, h });
    buildingCount++;
    // a second small building in some blocks
    if (Math.random() < 0.3) {
      const h2 = rand(8, 14), w2 = rand(12, 16), d2 = rand(12, 16);
      const ox = b.x + rand(-12, 12), oz = b.z + rand(-12, 12);
      if (Math.abs(ox - mesh.position.x) > w / 2 + w2 / 2 + 2 || Math.abs(oz - mesh.position.z) > dep / 2 + d2 / 2 + 2) {
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), new THREE.MeshLambertMaterial({ map: texFor(d) }));
        m2.position.set(ox, h2 / 2, oz); scene.add(m2);
        G.buildings.push({ x0: ox - w2 / 2 - 0.5, z0: oz - d2 / 2 - 0.5, x1: ox + w2 / 2 + 0.5, z1: oz + d2 / 2 + 0.5, h: h2 });
        buildingCount++;
      }
    }
  }
  // plaza fountain at the centre
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.6, 16), new THREE.MeshLambertMaterial({ color: 0x9a958a }));
  basin.position.set(0, 0.8, 0); scene.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.4, 16), new THREE.MeshLambertMaterial({ color: 0x4a90b8 }));
  water.position.set(0, 1.5, 0); scene.add(water);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 5, 8), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
  jet.position.set(0, 4, 0); scene.add(jet);
  // 3 landmark towers
  const landmarks = [{ x: -288, z: -288, h: 88, c: 0x7a6a52 }, { x: 288, z: -288, h: 96, c: 0x4a5a6a }, { x: 288, z: 288, h: 78, c: 0x6a5a4a }];
  for (const L of landmarks) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(26, L.h, 26), new THREE.MeshLambertMaterial({ color: L.c }));
    m.position.set(L.x, L.h / 2, L.z); scene.add(m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(10, 14, 4), new THREE.MeshLambertMaterial({ color: 0x2e2a26 }));
    tip.position.set(L.x, L.h + 7, L.z); tip.rotation.y = Math.PI / 4; scene.add(tip);
    G.buildings.push({ x0: L.x - 13.5, z0: L.z - 13.5, x1: L.x + 13.5, z1: L.z + 13.5, h: L.h });
  }
  // neon signs (emissive boxes on building faces, along roads)
  const neons = [
    { x: -320, z: -64, c: 0xff4d6d, t: 'VERDE' }, { x: 64, z: -320, c: 0x4dd8ff, t: 'HOTEL' },
    { x: 320, z: 64, c: 0xffd34d, t: 'CASINO' }, { x: -64, z: 320, c: 0x7dff8a, t: 'TACOS' },
    { x: 128, z: 192, c: 0xff8ad8, t: 'BAR' }, { x: -192, z: -192, c: 0x9ab8ff, t: 'CINEMA' },
  ];
  for (const n of neons) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 1), new THREE.MeshBasicMaterial({ color: n.c }));
    sign.position.set(n.x, 12, n.z); scene.add(sign);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(15, 4, 0.4), new THREE.MeshBasicMaterial({ color: n.c, transparent: true, opacity: 0.25 }));
    glow.position.set(n.x, 12, n.z); scene.add(glow);
  }
  // billboards
  for (const b of [{ x: -384, z: 0 }, { x: 0, z: -384 }, { x: 384, z: 256 }]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 14, 6), poleMat);
    post.position.set(b.x, 7, b.z); scene.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 0.6), new THREE.MeshLambertMaterial({ color: choice([0x8a2f2f, 0x2f5a8a, 0x8a7a2f]) }));
    board.position.set(b.x, 17, b.z); scene.add(board);
  }
  // lamps along roads (emissive heads only — no per-lamp lights)
  const lampGeo = new THREE.CylinderGeometry(0.25, 0.3, 7, 6);
  const headGeo = new THREE.SphereGeometry(0.7, 8, 6);
  for (let k = 0; k <= 14; k++) {
    const c = -BOUND + PITCH * k;
    for (let d = -BOUND + 64; d < BOUND; d += 128) {
      const pole = new THREE.Mesh(lampGeo, poleMat); pole.position.set(c + 9, 3.5, d); scene.add(pole);
      const head = new THREE.Mesh(headGeo, lampMat); head.position.set(c + 9, 7.2, d); scene.add(head);
      const pole2 = new THREE.Mesh(lampGeo, poleMat); pole2.position.set(d, 3.5, c + 9); scene.add(pole2);
      const head2 = new THREE.Mesh(headGeo, lampMat); head2.position.set(d, 7.2, c + 9); scene.add(head2);
    }
  }
  // market stalls near Rosa (-264, 256)
  const stallCols = [0xc96a3a, 0x3a7a4a, 0x8a3a5a, 0xc9a23a];
  for (let s = 0; s < 4; s++) {
    const sx = -288 + s * 12, sz = 240;
    const table = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 4), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    table.position.set(sx, 1, sz); scene.add(table);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 5), new THREE.MeshLambertMaterial({ color: stallCols[s] }));
    awn.position.set(sx, 4.4, sz); scene.add(awn);
    for (const [px, pz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 5), poleMat);
      leg.position.set(sx + px, 2.2, sz + pz); scene.add(leg);
    }
  }
  // palms along the beach
  for (let px = -400; px <= 400; px += 64) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), trunkMat);
    trunk.position.set(px, 4.5, 408); scene.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), leafMat);
    top.position.set(px, 9.5, 408); scene.add(top);
  }
  // hydrants, bins, bus stops (small props on sidewalks)
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xa83232 });
  const binMat = new THREE.MeshLambertMaterial({ color: 0x3a4a3a });
  for (let n = 0; n < 40; n++) {
    const p = { x: rand(-400, 400), z: rand(-400, 400) };
    const hx = nearestRoad(p.x), hz = nearestRoad(p.z);
    const onX = Math.abs(p.x - hx) < Math.abs(p.z - hz);
    const px = onX ? hx + 10 : p.x, pz = onX ? p.z : hz + 10;
    if (Math.random() < 0.5) {
      const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 8), hydMat);
      hyd.position.set(px, 0.7, pz); scene.add(hyd);
    } else {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.8, 8), binMat);
      bin.position.set(px, 0.9, pz); scene.add(bin);
    }
  }
  return buildingCount;
}

// Circle vs building AABBs + square city clamp. bounds may be a rect {x0,z0,x1,z1} for rooms.
export function collideCircle(x, z, r, bounds) {
  // room rect (object) or the main city (number = half-size, ignored here)
  if (bounds && typeof bounds === 'object') {
    x = clamp(x, bounds.x0 + r, bounds.x1 - r);
    z = clamp(z, bounds.z0 + r, bounds.z1 - r);
    return { x, z };
  }
  x = clamp(x, -BOUND + r, BOUND - r);
  z = clamp(z, -BOUND + r, BOUND - r);
  for (const b of G.buildings) {
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - b.x0 + r, pr = b.x1 - x + r, pt = z - b.z0 + r, pb = b.z1 - z + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x0 - r; else if (m === pr) x = b.x1 + r; else if (m === pt) z = b.z0 - r; else z = b.z1 + r;
      }
    }
  }
  return { x, z };
}

export function pointBlocked(x, z) {
  for (const b of G.buildings) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}
