// Porto Verde island — world building, written fresh for v3.
// Builds the ground, beach ring, ocean, roads, buildings, lamps,
// lighthouse, causeway, billboard, palms, coins and service spots.
import * as THREE from 'three';
import { G, WORLD, DISTRICTS, clamp, rand, randi, pick } from './state.js';

// Module-level handles kept for the sky / ocean animators.
let seaSheet = null;
let skyDome = null;
let sunLight = null;
let hemiLight = null;
let sunBall = null;
let moonBall = null;
let nightLamps = [];

// A canvas texture with a lit-window grid, reused by every building.
function facadeTexture(baseColor) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  const lit = ['#ffd76a', '#9fd8ff', '#fff2c0', '#ffb020'];
  const dark = '#1a2233';
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 10 + col * 22;
      const y = 12 + row * 20;
      ctx.fillStyle = Math.random() < 0.55 ? pick(lit) : dark;
      ctx.fillRect(x, y, 14, 12);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundAndSea() {
  // Deep water far below everything, so the ocean never shows void.
  const deep = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.half + 40, 48),
    new THREE.MeshStandardMaterial({ color: 0x06283f, roughness: 0.9, metalness: 0.05 })
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -0.35;
  G.scene.add(deep);

  // Sand disc: the beach. Tan, so the ring reads as sand at sunset.
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.beachOuter, 48),
    new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1.0, metalness: 0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.05;
  G.scene.add(sand);

  // Ocean ring over the deep water only (425-480). The sand stays tan.
  const seaRing = new THREE.Mesh(
    new THREE.RingGeometry(425, WORLD.half, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a6a9a, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.92 })
  );
  seaRing.rotation.x = -Math.PI / 2;
  seaRing.position.y = 0.02;
  G.scene.add(seaRing);

  // A second, larger ocean sheet that gently bobs (the animated one).
  seaSheet = new THREE.Mesh(
    new THREE.RingGeometry(428, WORLD.half + 30, 48),
    new THREE.MeshStandardMaterial({ color: 0x2a7ab5, roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.55 })
  );
  seaSheet.rotation.x = -Math.PI / 2;
  seaSheet.position.y = 0.06;
  G.scene.add(seaSheet);

  // City ground: a circle (not a square) so no corner juts into the sea.
  const city = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.cityHalf, 48),
    new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.95, metalness: 0 })
  );
  city.rotation.x = -Math.PI / 2;
  city.position.y = 0.08;
  G.scene.add(city);

  // Sky dome (a big inverted sphere whose colour we shift by time of day).
  skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x87b5d9, side: THREE.BackSide, fog: false })
  );
  G.scene.add(skyDome);
}

function roadGrid() {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.9 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const half = WORLD.cityHalf;
  const step = WORLD.block;
  // Each road is cut to the circle's chord at its offset, so no road
  // overhangs the city edge onto the sand.
  for (let c = -half; c <= half; c += step) {
    const chord = Math.sqrt(Math.max(0, half * half - c * c)) * 2;
    if (chord < 40) continue;
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadW, chord), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.12, 0);
    G.scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(chord, WORLD.roadW), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.12, c);
    G.scene.add(ew);
    for (let d = -chord / 2 + 20; d < chord / 2; d += 40) {
      const dashNS = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 8), lineMat);
      dashNS.rotation.x = -Math.PI / 2;
      dashNS.position.set(c, 0.14, d);
      G.scene.add(dashNS);
      const dashEW = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.6), lineMat);
      dashEW.rotation.x = -Math.PI / 2;
      dashEW.position.set(d, 0.14, c);
      G.scene.add(dashEW);
    }
  }
  G.world.roads.push({ kind: 'grid', step: WORLD.block });
}

function districtAt(x, z) {
  let best = DISTRICTS[0];
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const dd = (x - d.cx) * (x - d.cx) + (z - d.cz) * (z - d.cz);
    if (dd < bestD) { bestD = dd; best = d; }
  }
  return best;
}

function putBuilding(x, z, w, d, h, district) {
  const tex = facadeTexture('#' + district.color.toString(16).padStart(6, '0'));
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, h / 2 + 0.1, z);
  G.scene.add(mesh);
  G.world.buildings.push(mesh);
  G.world.colliders.push({ x, z, hx: w / 2 + 0.5, hz: d / 2 + 0.5 });
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.9 })
  );
  roof.position.set(x, h + 0.3, z);
  G.scene.add(roof);
  return mesh;
}

function buildBlocks() {
  const half = WORLD.cityHalf;
  const step = WORLD.block;
  const roadHalf = WORLD.roadW / 2;
  for (let gx = -half + step / 2; gx < half; gx += step) {
    for (let gz = -half + step / 2; gz < half; gz += step) {
      if (Math.abs(gx) < 30 && Math.abs(gz) < 30) continue; // plaza
      if (gx > 200 && Math.abs(gz - 40) < 60) continue; // marina apron
      const district = districtAt(gx, gz);
      const n = randi(1, 2);
      for (let i = 0; i < n; i++) {
        const w = rand(18, 30);
        const d = rand(18, 30);
        const h = rand(12, 46);
        const ox = gx + rand(-14, 14);
        const oz = gz + rand(-14, 14);
        const cx = clamp(ox, -half + roadHalf + w / 2, half - roadHalf - w / 2);
        const cz = clamp(oz, -half + roadHalf + d / 2, half - roadHalf - d / 2);
        putBuilding(cx, cz, w, d, h, district);
      }
    }
  }
  // Three landmark towers in Downtown.
  const towers = [
    { x: -40, z: -40, h: 110, c: 0x2a4a7a },
    { x: 40, z: -40, h: 95, c: 0x7a3a4a },
    { x: 40, z: 60, h: 85, c: 0x3a6a5a },
  ];
  for (const t of towers) {
    const b = putBuilding(t.x, t.z, 26, 26, t.h, { color: t.c });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
    tip.position.set(t.x, t.h + 3, t.z);
    G.scene.add(tip);
  }
  // Hospital (Northside) with a red cross.
  putBuilding(-120, -200, 30, 22, 18, { color: 0xd8d8d8 });
  const cross = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 1),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1 }));
  cross.position.set(-120, 22, -188);
  G.scene.add(cross);
  // Safehouse (South Beach).
  putBuilding(120, 280, 16, 14, 9, { color: 0x7ab5a5 });
  // Interiors: El Faro (Old Town) + Sunray Garage (Northside).
  putBuilding(-200, 120, 24, 18, 12, { color: 0xb56a3a });
  putBuilding(200, -200, 28, 20, 10, { color: 0x4a6a8a });
  G.world.vendors = [
    { id: 'faro', name: 'El Faro', x: -200, z: 138, kind: 'food', who: 'rosa' },
    { id: 'garage', name: 'Sunray Garage', x: 200, z: -182, kind: 'repair', who: 'tomas' },
  ];
}

function streetLamps() {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe8a0, emissiveIntensity: 2.2 });
  const half = WORLD.cityHalf;
  const step = WORLD.block;
  for (let c = -half; c <= half; c += step) {
    for (let d = -half + 40; d < half; d += 80) {
      for (const [lx, lz] of [[c + 9, d], [c - 9, d + 40]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 8), poleMat);
        pole.position.set(lx, 3.5, lz);
        G.scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), bulbMat);
        bulb.position.set(lx, 7.1, lz);
        G.scene.add(bulb);
        G.world.lamps.push({ x: lx, z: lz });
      }
    }
  }
}

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 })
  );
  trunk.position.y = 3.5;
  g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 7.6, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 0.9;
    leaf.rotation.x = -Math.sin(a) * 0.9;
    g.add(leaf);
  }
  return g;
}

function beachPalms() {
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(WORLD.beachInner + 8, WORLD.beachOuter - 12);
    const p = makePalm();
    p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    p.rotation.y = Math.random() * Math.PI * 2;
    G.scene.add(p);
  }
  for (let i = 0; i < 20; i++) {
    const p = makePalm();
    const park = Math.random() < 0.5 ? [-200, -200] : [200, 200];
    p.position.set(park[0] + rand(-50, 50), 0, park[1] + rand(-50, 50));
    G.scene.add(p);
  }
}

function neonSignMesh(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#0a0a12';
  x.fillRect(0, 0, 256, 64);
  x.font = 'bold 34px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = 16;
  x.fillStyle = color;
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.4 })
  );
}

function billboardsAndSigns() {
  // Neon shop signs around the city.
  const signs = [
    ['VERDE', '#ff5a8a', -40, 60, -26],
    ['NEON', '#5affd8', 40, 50, -26],
    ['HOTEL', '#ffd75a', -200, 16, 132],
    ['24H', '#5a8aff', 200, 14, -188],
    ['BAR', '#ff8a5a', 120, 12, 272],
    ['CASINO', '#d85aff', 240, 18, 52],
  ];
  for (const [txt, col, sx, sy, sz] of signs) {
    const s = neonSignMesh(txt, col);
    s.position.set(sx, sy, sz);
    G.scene.add(s);
  }
  // The big beach billboard: SUNSET BEACH / PORTO VERDE (v3 cover shot).
  const bc = document.createElement('canvas');
  bc.width = 512; bc.height = 256;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#12081f';
  bx.fillRect(0, 0, 512, 256);
  bx.textAlign = 'center';
  bx.shadowColor = '#ff5aff';
  bx.shadowBlur = 22;
  bx.fillStyle = '#ff5aff';
  bx.font = 'bold 64px Arial';
  bx.fillText('SUNSET BEACH', 256, 96);
  bx.shadowColor = '#ffb020';
  bx.fillStyle = '#ffb020';
  bx.font = 'bold 52px Arial';
  bx.fillText('PORTO VERDE', 256, 182);
  const bt = new THREE.CanvasTexture(bc);
  bt.colorSpace = THREE.SRGBColorSpace;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 16, 6),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
  );
  pole.position.set(0, 8, 372);
  G.scene.add(pole);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 13),
    new THREE.MeshStandardMaterial({ map: bt, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 1.1 })
  );
  board.position.set(0, 22, 372);
  G.scene.add(board);
  G.world.colliders.push({ x: 0, z: 372, hx: 1.5, hz: 1.5 });
  // A few generic promo boards.
  for (const [px, pz, ry] of [[-80, 160, 0], [80, -160, Math.PI], [200, -80, Math.PI / 2]]) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#12203a';
    x2.fillRect(0, 0, 256, 128);
    x2.fillStyle = '#ffb020';
    x2.font = 'bold 30px Arial';
    x2.textAlign = 'center';
    x2.fillText('PORTO VERDE', 128, 56);
    x2.fillStyle = '#fff';
    x2.font = '20px Arial';
    x2.fillText('Visit the island', 128, 92);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 14, 6),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    post.position.set(px, 7, pz);
    G.scene.add(post);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 10),
      new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7 })
    );
    panel.position.set(px, 18, pz);
    panel.rotation.y = ry;
    G.scene.add(panel);
    G.world.colliders.push({ x: px, z: pz, hx: 1, hz: 1 });
  }
}

function lighthouseAndBridge() {
  // Lighthouse at the Marina — the opening route's landmark.
  const lh = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 5.5, 26, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 })
  );
  base.position.y = 13;
  lh.add(base);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, 3, 12),
    new THREE.MeshStandardMaterial({ color: 0xc23a3a, roughness: 0.8 })
  );
  band.position.y = 20;
  lh.add(band);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })
  );
  cap.position.y = 28;
  lh.add(cap);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe8a0, emissiveIntensity: 3 })
  );
  lamp.position.y = 28;
  lh.add(lamp);
  lh.position.set(300, 0, 40);
  G.scene.add(lh);
  G.world.colliders.push({ x: 300, z: 40, hx: 6, hz: 6 });
  // Causeway bridge out to the Marina islet.
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 120),
    new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.9 })
  );
  bridge.position.set(360, 1, 40);
  G.scene.add(bridge);
  // Fountain in the central plaza.
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 10, 1.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.8 })
  );
  basin.position.set(0, 0.8, 0);
  G.scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a9ab5, roughness: 0.2, metalness: 0.3 })
  );
  water.position.set(0, 1.7, 0);
  G.scene.add(water);
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1.6, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a8578 })
  );
  spout.position.set(0, 4, 0);
  G.scene.add(spout);
  G.world.colliders.push({ x: 0, z: 0, hx: 10, hz: 10 });
}

function scatterCoins() {
  const coinGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xaa7711, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 });
  const spots = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spots.push([Math.cos(a) * rand(340, 400), Math.sin(a) * rand(340, 400)]);
  }
  spots.push([-200, -200], [200, 200], [30, 30], [-200, 120], [200, -200], [120, 280], [240, 40], [-120, -200]);
  spots.slice(0, 20).forEach(([cx, cz], idx) => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    coin.position.set(cx, 1.6, cz);
    coin.userData.coinIdx = idx;
    G.scene.add(coin);
    G.world.coins.push(coin);
  });
}

function serviceSpots() {
  // v3 economy: properties + services, each a visible marker on the map.
  // A marker is a small coloured pillar + a floating label sprite.
  const defs = [
    { id: 'marina-loft', name: 'Marina Loft', x: 268, z: 92, color: 0x7dff9b, kind: 'property', price: 4000 },
    { id: 'old-town-courtyard', name: 'Old Town Courtyard', x: -240, z: -90, color: 0x7dff9b, kind: 'property', price: 6000 },
    { id: 'paints', name: 'Prism Paints', x: -260, z: -76, color: 0xff5aff, kind: 'respray', price: 150 },
    { id: 'sprint', name: 'Coastline Sprint', x: 280, z: 80, color: 0xff7bff, kind: 'race', price: 0 },
    { id: 'arms', name: 'Iron Pier Arms', x: 80, z: -120, color: 0x9fd8ff, kind: 'ammo', price: 0 },
    { id: 'garageup', name: 'Sunray Upgrades', x: 182, z: -200, color: 0xffb020, kind: 'garage', price: 0 },
  ];
  for (const d of defs) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 6, 10),
      new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.9, roughness: 0.4 })
    );
    pillar.position.set(d.x, 3, d.z);
    G.scene.add(pillar);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 10, 8),
      new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 2 })
    );
    orb.position.set(d.x, 7.2, d.z);
    G.scene.add(orb);
    G.world.markers.push({ id: d.id, name: d.name, x: d.x, z: d.z, kind: d.kind, price: d.price, color: d.color });
  }
  // Keep the v3 property/service lists on the shared state for the HUD + main.
  // properties is the list of OWNED property ids (strings); the definitions
  // live in propertyDefs. Same split for garage upgrades.
  G.propertyDefs = [
    { id: 'marina-loft', name: 'Marina Loft', x: 268, z: 92, price: 4000, income: 120 },
    { id: 'old-town-courtyard', name: 'Old Town Courtyard', x: -240, z: -90, price: 6000, income: 200 },
  ];
  G.properties = [];
  G.garageDefs = [
    { id: 'tires', name: 'Road-Grip Tires', price: 1800, accelMul: 1.15, topMul: 1.06 },
    { id: 'brakes', name: 'Sport Brakes', price: 2200, accelMul: 1.10, topMul: 1.04 },
    { id: 'chassis', name: 'Chassis Bracing', price: 2800, accelMul: 1.08, topMul: 1.10 },
  ];
  G.garageUpgrades = { tires: false, brakes: false, chassis: false };
  G.serviceDefs = [
    { id: 'paints', name: 'Prism Paints', x: -260, z: -76, price: 150, kind: 'respray' },
    { id: 'sprint', name: 'Coastline Sprint', x: 280, z: 80, price: 0, kind: 'race' },
    { id: 'arms', name: 'Iron Pier Arms', x: 80, z: -120, price: 0, kind: 'ammo' },
    { id: 'garageup', name: 'Sunray Upgrades', x: 182, z: -200, price: 0, kind: 'garage' },
  ];
  G.paintColors = [0xff2a7a, 0x2aff7a, 0x2a7aff, 0xffd72a, 0xff7a2a, 0xe8e8e8];
  G.sideRace = null;
  G.raceBest = null;
}

export function buildIsland() {
  const scene = G.scene;
  hemiLight = new THREE.HemisphereLight(0xffd9a0, 0x2a3a5a, 0.9);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffb060, 1.6);
  sunLight.position.set(-120, 180, 60);
  scene.add(sunLight);
  sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(18, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffc860, fog: false })
  );
  scene.add(sunBall);
  moonBall = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xd8e4ff, fog: false })
  );
  scene.add(moonBall);
  groundAndSea();
  roadGrid();
  buildBlocks();
  streetLamps();
  beachPalms();
  billboardsAndSigns();
  lighthouseAndBridge();
  scatterCoins();
  serviceSpots();
  // A few night point lights (6 max, no shadows) beside neon signs.
  const nightSpots = [[-12, 12], [12, -12], [-40, -26], [40, -16], [120, 272], [240, 52]];
  for (const [nx, nz] of nightSpots) {
    const pl = new THREE.PointLight(0xffc880, 0, 42, 1.6);
    pl.position.set(nx, 7, nz);
    scene.add(pl);
    nightLamps.push(pl);
  }
  scene.fog = new THREE.Fog(0x8a6a5a, 500, 1300);
  updateSky();
}

// Day/night: 240s cycle, opens at golden-hour sunset (18:00).
export function updateSky() {
  if (!sunLight) return;
  const t = (G.timeOfDay % 24) / 24;
  const sunAngle = (t - 0.25) * Math.PI * 2;
  const elev = Math.sin(sunAngle);
  const isDay = elev > -0.08;
  const warm = clamp(1 - Math.abs(elev) * 2.2, 0.25, 1);
  sunLight.intensity = isDay ? 0.6 + 1.2 * clamp(elev, 0, 1) : 0.4;
  sunLight.color.setHSL(0.08 + 0.02 * warm, 0.75, 0.55);
  sunLight.position.set(Math.cos(sunAngle) * 300, Math.max(30, elev * 300), 120);
  hemiLight.intensity = isDay ? 0.5 + 0.5 * clamp(elev, 0, 1) : 0.6;
  for (const pl of nightLamps) pl.intensity = isDay ? 0 : 22;
  sunBall.visible = elev > -0.05;
  sunBall.position.set(Math.cos(sunAngle) * 1100, Math.max(20, elev * 900), 500);
  moonBall.visible = !isDay;
  moonBall.position.set(-Math.cos(sunAngle) * 1000, Math.max(60, -elev * 800), -400);
  const skyTop = new THREE.Color();
  const skyMid = new THREE.Color();
  const skyBot = new THREE.Color();
  if (isDay) {
    skyTop.setHSL(0.58, 0.6, 0.35 + 0.25 * clamp(elev, 0, 1));
    skyMid.setHSL(0.07, 0.85, 0.55 + 0.1 * warm);
    skyBot.setHSL(0.08, 0.5, 0.3);
  } else {
    skyTop.setHex(0x060a18);
    skyMid.setHex(0x0a1230);
    skyBot.setHex(0x05070f);
  }
  skyDome.material.color.copy(skyMid);
  if (G.scene) G.scene.fog.color.copy(skyMid).lerp(new THREE.Color(0x0a0a14), isDay ? 0 : 0.5);
}

export function animateOcean(t) {
  if (!seaSheet) return;
  seaSheet.position.y = 0.06 + Math.sin(t * 0.7) * 0.15;
  seaSheet.rotation.z = Math.sin(t * 0.3) * 0.002;
}
