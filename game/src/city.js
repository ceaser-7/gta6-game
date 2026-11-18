// Porto Verde — the city: 14x14 blocks, 4 districts, parks, plaza, towers,
// neon, billboards, props, collision and line of sight. All procedural, all original.
import * as THREE from 'three';
import { G, CFG, ROADS, BLOCKS, rng, rand, randi, pick, clamp, districtAt } from './state.js';

const PALETTE = ['#8a7f72', '#7d7468', '#9a8f80', '#6f6a63', '#a89a86', '#84796b', '#5f6b72', '#74655a'];
const GLASS = ['#3d5a66', '#46586b', '#4a5d5a', '#37424e'];
const ROOFS = ['#4a4440', '#555049', '#3f3a36', '#5c564e'];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Facade: muted base, window grid, some lit windows, shopfront band at the base.
function facadeTex(base, lit, shop) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical grime
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      g.fillRect(rng() * w, 0, 2 + rng() * 6, h);
    }
    const cols = 5, rows = 8, cw = w / cols, rh = (h - 40) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.2, y = 6 + r * rh + rh * 0.18;
      const litWin = rng() < lit;
      g.fillStyle = litWin ? '#ffd98a' : (rng() < 0.5 ? '#2b3138' : '#3a4148');
      g.fillRect(x, y, cw * 0.6, rh * 0.6);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x, y, cw * 0.6, 3);
    }
    if (shop) {
      g.fillStyle = '#20242a'; g.fillRect(0, h - 40, w, 40);
      g.fillStyle = pick(['#c9a227', '#7fb069', '#d1603d', '#4a90a4']);
      g.fillRect(0, h - 44, w, 4);
      g.fillStyle = '#e8e0cc'; g.font = 'bold 13px sans-serif';
      g.fillText(pick(['CAFE', 'TACOS', 'MARKET', 'BAR', 'SHOP', 'GARAGE']), 10, h - 16);
    }
    // setback ledge lines
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, w, 4); g.fillRect(0, h - 46, w, 2);
  });
}

function roadTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4f55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
    for (let i = 0; i < 12; i++) { // patches
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(rng() * w, rng() * h, 20 + rng() * 30, 12 + rng() * 20);
    }
    g.fillStyle = '#d8d2c0'; g.fillRect(6, 0, 3, h); g.fillRect(w - 9, 0, 3, h);
    g.fillStyle = '#e8c33c';
    for (let y = 0; y < h; y += 42) g.fillRect(w / 2 - 2, y, 4, 22);
  });
}

function grassTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5d7a4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      g.fillRect(rng() * w, rng() * h, 2, 3);
    }
  });
}

function signTex(text, fg, bg) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 34px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
  });
}

export const facades = [];
export const glassMats = [];
let roadMat, grassMat, plazaMat;

export function buildCity() {
  const S = G.scene;
  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.SPAN + 260, CFG.SPAN + 260),
    new THREE.MeshLambertMaterial({ color: 0x6d6a58 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; S.add(ground);
  // sea strip on the east edge (Marina beach)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(140, CFG.SPAN + 260),
    new THREE.MeshLambertMaterial({ color: 0x2e5d6b }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(CFG.HALF + 70, 0.05, 0); S.add(sea);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(26, CFG.SPAN),
    new THREE.MeshLambertMaterial({ color: 0xc9b48a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(CFG.HALF + 2, 0.08, 0); S.add(sand);

  roadMat = new THREE.MeshLambertMaterial({ map: roadTex() });
  grassMat = new THREE.MeshLambertMaterial({ map: grassTex() });
  plazaMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  for (let i = 0; i < 8; i++) {
    facades.push(new THREE.MeshLambertMaterial({ map: facadeTex(PALETTE[i], 0.22, i % 3 === 0) }));
    glassMats.push(new THREE.MeshLambertMaterial({ map: facadeTex(GLASS[i % 4], 0.45, false), color: 0xbfd4dd }));
  }
  const roofMat = ROOFS.map(c => new THREE.MeshLambertMaterial({ color: c }));
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0x333333, emissive: 0xffd98a, emissiveIntensity: 0.9 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3236 });

  // roads: full-length strips both ways
  for (const r of ROADS) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CFG.SPAN, CFG.ROAD), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.1, r); h.receiveShadow = true; S.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CFG.ROAD, CFG.SPAN), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, 0.11, 0); v.receiveShadow = true; S.add(v);
  }
  // road intersections (fill the crossing squares)
  for (const rx of ROADS) for (const rz of ROADS) {
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(CFG.ROAD, CFG.ROAD),
      new THREE.MeshLambertMaterial({ color: 0x4a4f55 }));
    sq.rotation.x = -Math.PI / 2; sq.position.set(rx, 0.12, rz); S.add(sq);
  }

  // parks: central park + north park. plaza at the centre.
  const parks = [
    { x: -32, z: 195, w: 110, d: 90 },   // central park
    { x: -227, z: -227, w: 100, d: 100 }, // north park
  ];
  for (const p of parks) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), grassMat);
    g.rotation.x = -Math.PI / 2; g.position.set(p.x, 0.15, p.z); g.receiveShadow = true; S.add(g);
    for (let i = 0; i < 9; i++) addTree(p.x + rand(-p.w / 2 + 8, p.w / 2 - 8), p.z + rand(-p.d / 2 + 8, p.d / 2 - 8));
    for (let i = 0; i < 3; i++) addBench(p.x + rand(-40, 40), p.z + rand(-30, 30));
  }
  // plaza with fountain
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), plazaMat);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.16, 0); plaza.receiveShadow = true; S.add(plaza);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 1.6, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a8578 }));
  fountain.position.set(0, 0.8, 0); S.add(fountain);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x3d7a8c }));
  water.position.set(0, 1.6, 0); S.add(water);
  G.colliders.push({ x: 0, z: 0, hx: 11, hz: 11 });

  // buildings: one or two per block, skipped on parks/plaza/beach edge
  const skipBlock = (bx, bz) => {
    for (const p of parks) if (Math.abs(bx - p.x) < p.w / 2 + 20 && Math.abs(bz - p.z) < p.d / 2 + 20) return true;
    if (Math.abs(bx) < 80 && Math.abs(bz) < 80) return true; // plaza
    if (bx > 380) return true; // beach strip
    return false;
  };
  const towerSpots = [[-32, -292], [227, 32], [162, 292]];
  for (const [tx, tz] of towerSpots) addTower(tx, tz);
  let nBuildings = 0;
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (skipBlock(bx, bz)) continue;
    if (towerSpots.some(([tx, tz]) => Math.abs(bx - tx) < 40 && Math.abs(bz - tz) < 40)) continue;
    const n = rng() < 0.55 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const w = rand(18, 38), d = rand(18, 38);
      const x = bx + (n === 1 ? 0 : (i === 0 ? -w / 4 : w / 4)) + rand(-4, 4);
      const z = bz + (n === 1 ? 0 : (i === 0 ? -d / 4 : d / 4)) + rand(-4, 4);
      const h = districtAt(x, z) === 'Downtown' ? rand(16, 46) : rand(8, 26);
      const glass = rng() < 0.25;
      addBuilding(x, z, w, h, d, glass, roofMat);
      nBuildings++;
    }
  }
  G.stats.buildings = nBuildings + 3;

  // neon signs (emissive, on building faces)
  const neons = [
    { t: 'VERDE', c: '#ff5d8f', x: -65, z: -195, y: 22, ry: 0 },
    { t: 'EL FARO', c: '#ffb347', x: -54, z: 108, y: 9, ry: Math.PI / 2 },
    { t: 'SUNRAY', c: '#7fe0ff', x: 162, z: -120, y: 9, ry: -Math.PI / 2 },
    { t: 'MARINA', c: '#7dffb0', x: 292, z: 195, y: 18, ry: Math.PI / 2 },
    { t: 'COAST', c: '#c9a2ff', x: 32, z: 292, y: 20, ry: 0 },
    { t: 'ROOK', c: '#ffd24a', x: -195, z: -32, y: 16, ry: Math.PI },
  ];
  for (const n of neons) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTex(n.t, n.c, '#11131a') }));
    m.position.set(n.x, n.y, n.z); m.rotation.y = n.ry; S.add(m);
  }
  // billboards
  const boards = [
    { t: 'PORTO VERDE', c: '#ff8c42', x: -260, z: -32, ry: Math.PI / 2 },
    { t: 'SUNSET SPRINT', c: '#4ecdc4', x: 97, z: -227, ry: 0 },
    { t: 'EL FARO TACOS', c: '#ffd24a', x: 227, z: 130, ry: -Math.PI / 2 },
  ];
  for (const b of boards) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 14, 8), poleMat);
    pole.position.set(b.x, 7, b.z); S.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 9),
      new THREE.MeshLambertMaterial({ map: signTex(b.t, b.c, '#1c2430'), emissive: 0x222222 }));
    board.position.set(b.x, 17, b.z); board.rotation.y = b.ry; S.add(board);
    G.colliders.push({ x: b.x, z: b.z, hx: 1.2, hz: 1.2 });
  }
  // street props: hydrants, bins, bus stops, lamps, palms along avenues
  for (let i = 0; i < 40; i++) {
    const x = pick(ROADS) + pick([-8, 8]); const z = rand(-400, 400);
    if (rng() < 0.5) addHydrant(x, z); else addBin(x, z);
  }
  for (const [sx, sz, ry] of [[-130, 65, 0], [130, -65, Math.PI], [65, 227, 0], [-65, -227, Math.PI]]) addBusStop(sx, sz, ry);
  for (const r of ROADS) {
    for (let z = -390; z <= 390; z += 130) addLamp(r + 7, z);
    for (let x = -390; x <= 390; x += 130) addLamp(x, r + 7);
  }
  for (let i = 0; i < 26; i++) addPalm(pick(BLOCKS), pick(BLOCKS));
  // market stalls (Old Town market around Rosa)
  for (let i = 0; i < 6; i++) addStall(-264 + rand(-24, 24), 258 + rand(-18, 18));

  function addBuilding(x, z, w, h, d, glass, roofs) {
    const mat = glass ? pick(glassMats) : pick(facades);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; S.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.8, d * 0.96), pick(roofs));
    roof.position.set(x, h + 0.4, z); S.add(roof);
    if (rng() < 0.4) { // rooftop props
      const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 2.4), poleMat);
      ac.position.set(x + rand(-w / 4, w / 4), h + 1.4, z + rand(-d / 4, d / 4)); S.add(ac);
    }
    if (rng() < 0.3) { // antenna
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), poleMat);
      a.position.set(x + w / 3, h + 3.5, z - d / 3); S.add(a);
    }
    if (rng() < 0.45) { // balcony / awning strip
      const aw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.5, 3),
        new THREE.MeshLambertMaterial({ color: pick(['#7a4a3a', '#3a5a4a', '#4a4a5a']) }));
      aw.position.set(x, 4.4, z + d / 2 + 1.2); S.add(aw);
    }
    G.buildings.push({ x, z, hx: w / 2, hz: d / 2, h });
    G.colliders.push({ x, z, hx: w / 2, hz: d / 2 });
  }
  function addTower(x, z) {
    const h = rand(62, 88);
    const glass = pick(glassMats);
    const t = new THREE.Mesh(new THREE.BoxGeometry(26, h, 26), glass);
    t.position.set(x, h / 2, z); t.castShadow = true; S.add(t);
    // setback crown
    const crown = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 18), pick(facades));
    crown.position.set(x, h + 4, z); S.add(crown);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 6), poleMat);
    tip.position.set(x, h + 12, z); S.add(tip);
    G.buildings.push({ x, z, hx: 13, hz: 13, h });
    G.colliders.push({ x, z, hx: 13, hz: 13 });
  }
  function addTree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
    trunk.position.set(x, 2, z); S.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(rand(2.6, 3.8), 10, 8),
      new THREE.MeshLambertMaterial({ color: pick([0x4a6b35, 0x557a3a, 0x3f6030]) }));
    top.position.set(x, 5.4, z); S.add(top);
    G.colliders.push({ x, z, hx: 0.9, hz: 0.9 });
  }
  function addPalm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 7, 8),
      new THREE.MeshLambertMaterial({ color: 0x6b543a }));
    trunk.position.set(x, 3.5, z); trunk.rotation.z = rand(-0.08, 0.08); S.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4),
        new THREE.MeshLambertMaterial({ color: 0x3f7a3a }));
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.6, 7.2, z + Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1; S.add(leaf);
    }
  }
  function addBench(x, z) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    b.position.set(x, 0.9, z); S.add(b);
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 1.2), poleMat);
    l1.position.set(x - 1.4, 0.45, z); S.add(l1);
    const l2 = l1.clone(); l2.position.x = x + 1.4; S.add(l2);
    G.colliders.push({ x, z, hx: 1.8, hz: 0.7 });
  }
  function addHydrant(x, z) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: 0xa83226 }));
    h.position.set(x, 0.55, z); S.add(h);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x8c2a20 }));
    top.position.set(x, 1.2, z); S.add(top);
    G.colliders.push({ x, z, hx: 0.6, hz: 0.6 });
  }
  function addBin(x, z) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 1.3, 8),
      new THREE.MeshLambertMaterial({ color: 0x2f4a3a }));
    b.position.set(x, 0.65, z); S.add(b);
    G.colliders.push({ x, z, hx: 0.8, hz: 0.8 });
  }
  function addBusStop(x, z, ry) {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x3a5a6b }));
    roof.position.y = 2.8; g.add(roof);
    for (const px of [-2.8, 2.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 6), poleMat);
      post.position.set(px, 1.4, -0.9); g.add(post);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    bench.position.set(0, 0.8, -0.6); g.add(bench);
    g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    G.colliders.push({ x, z, hx: 3, hz: 1.4 });
  }
  function addLamp(x, z) {
    // Emissive head only — no real light per lamp (hundreds of PointLights
    // would make the forward renderer unusable). Night readability comes
    // from the headlight, the sun/hemi and the interior lights.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6), poleMat);
    pole.position.set(x, 3.25, z); S.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), lampHeadMat);
    head.position.set(x, 6.5, z); S.add(head);
    G.lamps.push({ mat: lampHeadMat });
  }
  function addStall(x, z) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 3),
      new THREE.MeshLambertMaterial({ color: pick(['#c9563c', '#4a90a4', '#c9a227']) }));
    top.position.set(x, 2.4, z); S.add(top);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x6b543a }));
    counter.position.set(x, 0.5, z); S.add(counter);
    for (let i = 0; i < 5; i++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
        new THREE.MeshLambertMaterial({ color: pick([0xe07840, 0x7fb069, 0xd1603d, 0xe8c33c]) }));
      fruit.position.set(x + rand(-1.4, 1.4), 1.15, z + rand(-0.9, 0.9)); S.add(fruit);
    }
    G.colliders.push({ x, z, hx: 1.9, hz: 1.3 });
  }
}

// Push a circle (pos.x, pos.z, radius r) out of every collider it overlaps.
// bounds: a number (clamp |x|,|z| <= bounds) or a rect {x0,z0,x1,z1} (clamp inside).
export function collideCircle(pos, r, bounds) {
  for (const c of G.colliders) {
    const nx = clamp(pos.x, c.x - c.hx, c.x + c.hx);
    const nz = clamp(pos.z, c.z - c.hz, c.z + c.hz);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest axis
        const px = c.hx + r - Math.abs(pos.x - c.x);
        const pz = c.hz + r - Math.abs(pos.z - c.z);
        if (px < pz) pos.x = c.x + (pos.x > c.x ? c.hx + r : -(c.hx + r));
        else pos.z = c.z + (pos.z > c.z ? c.hz + r : -(c.hz + r));
      }
    }
  }
  if (bounds !== undefined && bounds !== null) {
    if (typeof bounds === 'number') {
      pos.x = clamp(pos.x, -bounds + r, bounds - r);
      pos.z = clamp(pos.z, -bounds + r, bounds - r);
    } else {
      pos.x = clamp(pos.x, bounds.x0 + r, bounds.x1 - r);
      pos.z = clamp(pos.z, bounds.z0 + r, bounds.z1 - r);
    }
  }
}

// 2D segment vs building AABBs — true when a building blocks the line of sight.
export function losBlocked(x1, z1, x2, z2) {
  for (const b of G.buildings) {
    const dx = x2 - x1, dz = z2 - z1;
    let t0 = 0, t1 = 1;
    const slab = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
      let a = (lo - p) / d, c = (hi - p) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      return t0 <= t1;
    };
    if (slab(x1, dx, b.x - b.hx, b.x + b.hx) && slab(z1, dz, b.z - b.hz, b.z + b.hz)) return true;
  }
  return false;
}
