// Porto Verde — the city itself: procedural streets, blocks, buildings, props.
// One clear job: build the static city, own its collision and its road/sidewalk queries.
import * as THREE from 'three';

export const PITCH = 54;          // street centreline spacing
export const ROAD_HALF = 7;       // half road width
export const WALK = 4;            // sidewalk width
export const GRID_N = 14;         // blocks per side (v1: 8)
export const HALF = (GRID_N / 2) * PITCH; // last street centreline: 378
export const BOUND = HALF + 42;   // playable edge (water / city limit): 420
export const GROUND = 900;        // ground plane size

// Seeded random so the city is identical every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWindowTexture(rng, hue) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = hue; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#20242c' : '#2c3442');
      g.fillRect(x, y, 11, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeWaveTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a7fa8'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  for (let i = -4; i < 10; i++) {
    g.beginPath(); g.moveTo(i * 16, 128); g.lineTo(i * 16 + 64, 0); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let i = -4; i < 10; i++) {
    g.beginPath(); g.moveTo(i * 16 + 8, 128); g.lineTo(i * 16 + 72, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeGroundTexture(rng) {
  const S = 2048, W = GROUND; // world [-450, 450] -> [0, 2048]
  const px = v => (v + W / 2) / W * S;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  // base: warm concrete
  g.fillStyle = '#8d8a7c'; g.fillRect(0, 0, S, S);
  // water: west strip and south strip
  g.fillStyle = '#1d6f8f';
  g.fillRect(0, 0, px(-HALF), S);
  g.fillRect(0, px(HALF), S, S - px(HALF));
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const x = rng() * px(-HALF), y = rng() * S;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y); g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const x = px(-HALF) + rng() * (S - px(-HALF)), y = px(HALF) + rng() * (S - px(HALF));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y); g.stroke();
  }
  // sand beach along the south edge
  g.fillStyle = '#dcc491';
  g.fillRect(px(-HALF), px(HALF), S - px(-HALF), px(HALF + 24) - px(HALF));
  // roads
  g.fillStyle = '#2d3138';
  for (let i = -GRID_N / 2; i <= GRID_N / 2; i++) {
    const c0 = i * PITCH;
    g.fillRect(px(c0 - ROAD_HALF), 0, px(c0 + ROAD_HALF) - px(c0 - ROAD_HALF), S);
    g.fillRect(0, px(c0 - ROAD_HALF), S, px(c0 + ROAD_HALF) - px(c0 - ROAD_HALF));
  }
  // road edge lines (white) and centre dashes (yellow)
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5;
  for (let i = -GRID_N / 2; i <= GRID_N / 2; i++) {
    const c0 = i * PITCH;
    for (const off of [-ROAD_HALF + 0.8, ROAD_HALF - 0.8]) {
      g.beginPath(); g.moveTo(px(c0 + off), 0); g.lineTo(px(c0 + off), S); g.stroke();
      g.beginPath(); g.moveTo(0, px(c0 + off)); g.lineTo(S, px(c0 + off)); g.stroke();
    }
  }
  g.fillStyle = '#e8c33a';
  for (let i = -GRID_N / 2; i <= GRID_N / 2; i++) {
    const c0 = i * PITCH;
    for (let d = -440; d < 440; d += 16) {
      g.fillRect(px(c0) - 1.5, px(d), 3, 8);
      g.fillRect(px(d), px(c0) - 1.5, 8, 3);
    }
  }
  // blocks: sidewalk ring + interior, coloured by district
  const halfBlocks = GRID_N / 2;
  for (let i = -halfBlocks; i < halfBlocks; i++) {
    for (let j = -halfBlocks; j < halfBlocks; j++) {
      const cx = i * PITCH + 27, cz = j * PITCH + 27;
      const x0 = px(cx - 27 + ROAD_HALF), z0 = px(cz - 27 + ROAD_HALF), s = px(cx + 27 - ROAD_HALF) - x0;
      g.fillStyle = '#b3ab97'; g.fillRect(x0, z0, s, s); // sidewalk (inset by the road half-width so the roads stay visible)
      let inner = '#9a938a';
      if (i === 0 && j === 0) inner = '#5d8a4a';           // central park
      else if (i === -5 && j === 5) inner = '#5d8a4a';      // riverside park
      else if (i === 3 && j === -3) inner = '#b0a894';      // downtown plaza
      else if (cx < 0 && cz < 0) inner = '#7e7468';          // Harbor: concrete yards
      else if (cx >= 0 && cz < 0) inner = '#8f8a80';         // Downtown: grey
      else if (cx < 0 && cz >= 0) inner = '#a89a7e';         // Old Town: warm tile
      else inner = '#93a08b';                                 // Marina: pale green
      g.fillStyle = inner;
      const m = px(WALK) - px(0); // sidewalk ring width; interior stays the 32-unit block core
      g.fillRect(x0 + m, z0 + m, s - 2 * m, s - 2 * m);
      // subtle sidewalk tile grid
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
      for (let t = 1; t < 4; t++) {
        g.beginPath(); g.moveTo(x0 + (s * t) / 4, z0); g.lineTo(x0 + (s * t) / 4, z0 + s); g.stroke();
        g.beginPath(); g.moveTo(x0, z0 + (s * t) / 4); g.lineTo(x0 + s, z0 + (s * t) / 4); g.stroke();
      }
      // crosswalks (zebra stripes, both directions) at the block's corners
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [wx, wz] of [[cx - 27, cz - 27], [cx + 27, cz - 27], [cx - 27, cz + 27], [cx + 27, cz + 27]]) {
        for (let k = -2; k <= 2; k++) {
          g.fillRect(px(wx + k * 2.4) - 1, px(wz) - 5, 2, 10);
          g.fillRect(px(wx) - 5, px(wz + k * 2.4) - 1, 10, 2);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function districtAt(x, z) {
  if (x < 0 && z < 0) return 'Harbor';
  if (x >= 0 && z < 0) return 'Downtown';
  if (x < 0 && z >= 0) return 'Old Town';
  return 'Marina';
}

export function isRoad(x, z) {
  const rx = Math.abs(((x + HALF) % PITCH + PITCH) % PITCH - 27);
  const rz = Math.abs(((z + HALF) % PITCH + PITCH) % PITCH - 27);
  return rx > 27 - ROAD_HALF || rz > 27 - ROAD_HALF;
}

export function createCity(scene) {
  const rng = mulberry32(20261117);
  const city = { colliders: [], buildingMeshes: [], bounds: BOUND, rng, waterMats: [] };

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(mulberry32(99)) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  city.ground = ground;

  // --- animated water planes over the west and south strips ---
  const waveTex = makeWaveTexture();
  const mkWater = (w, h, x, z, rx, ry) => {
    const tex = waveTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(rx, ry);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.55, color: 0x9fd4e8 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    scene.add(m);
    city.waterMats.push(mat);
    return m;
  };
  mkWater(72, GROUND, -HALF - 36, 0, 4, 48);            // west strip
  mkWater(GROUND - 72, 72, 36, HALF + 36, 48, 4);        // south strip

  // --- buildings ---
  const winTex = [
    makeWindowTexture(mulberry32(11), '#cbb9a0'),
    makeWindowTexture(mulberry32(23), '#a8b4c4'),
    makeWindowTexture(mulberry32(37), '#d8c49a'),
    makeWindowTexture(mulberry32(51), '#b9a58e'),
  ];
  const tints = [0xffffff, 0xf2e2c8, 0xd8c2b0, 0xb9c4cc, 0xe0b090, 0xc9d4de];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2f });
  const materials = winTex.map((t, i) => new THREE.MeshLambertMaterial({ map: t, color: tints[i % tints.length] }));
  const acGeo = new THREE.BoxGeometry(2.2, 1, 1.6);
  const towerGeo = new THREE.CylinderGeometry(1.6, 1.6, 3, 8);
  const towerRoofGeo = new THREE.ConeGeometry(1.9, 1.6, 8);

  function addBuilding(cx, cz, w, d, h, mat) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    city.buildingMeshes.push(m);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.8, d + 0.6);
    roof.position.set(cx, h + 0.4, cz);
    roof.castShadow = true;
    scene.add(roof);
    city.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    // rooftop props: AC box on many roofs, a water tower on a few
    const r = rng();
    if (r < 0.45) {
      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(cx + (rng() - 0.5) * (w - 4), h + 1.3, cz + (rng() - 0.5) * (d - 4));
      ac.castShadow = true;
      scene.add(ac);
    } else if (r < 0.6) {
      const tw = new THREE.Mesh(towerGeo, towerMat);
      tw.position.set(cx, h + 2.3, cz);
      tw.castShadow = true;
      scene.add(tw);
      const tr = new THREE.Mesh(towerRoofGeo, towerMat);
      tr.position.set(cx, h + 4.6, cz);
      scene.add(tr);
    }
    return m;
  }

  // landmark towers: three tall Downtown blocks
  const landmarks = { '2,-2': 96, '4,-4': 108, '3,-5': 88 };
  const halfBlocks = GRID_N / 2;
  for (let i = -halfBlocks; i < halfBlocks; i++) {
    for (let j = -halfBlocks; j < halfBlocks; j++) {
      const cx = i * PITCH + 27, cz = j * PITCH + 27;
      if ((i === 0 && j === 0) || (i === -5 && j === 5) || (i === 3 && j === -3)) continue; // parks + plaza
      const district = districtAt(cx, cz);
      const mat = materials[Math.floor(rng() * materials.length)];
      const lmKey = `${i},${j}`;
      if (landmarks[lmKey]) {
        addBuilding(cx, cz, 26, 26, landmarks[lmKey], materials[1]);
        continue;
      }
      if (district === 'Downtown') {
        const h = 28 + rng() * 46;
        addBuilding(cx, cz, 20 + rng() * 8, 20 + rng() * 8, h, mat);
        if (rng() < 0.5) addBuilding(cx + (rng() < 0.5 ? -14 : 14), cz + (rng() < 0.5 ? -12 : 12), 8, 8, 10 + rng() * 8, mat);
      } else if (district === 'Harbor') {
        addBuilding(cx, cz, 26 + rng() * 4, 18 + rng() * 6, 9 + rng() * 7, mat);
      } else if (district === 'Old Town') {
        addBuilding(cx - 7, cz, 12, 20 + rng() * 6, 8 + rng() * 7, mat);
        addBuilding(cx + 9, cz + 2, 10, 16 + rng() * 6, 7 + rng() * 6, mat);
      } else {
        addBuilding(cx, cz, 18 + rng() * 8, 18 + rng() * 8, 12 + rng() * 16, mat);
      }
    }
  }

  // --- street lamps ---
  const lampPole = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const lampGlow = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9 });
  const lampHead = new THREE.SphereGeometry(0.35, 8, 6);
  for (let i = -halfBlocks; i <= halfBlocks; i++) {
    for (let j = -halfBlocks; j <= halfBlocks; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * PITCH + 9, z = j * PITCH + 9;
      const pole = new THREE.Mesh(lampPole, lampMat);
      pole.position.set(x, 3, z); scene.add(pole);
      const head = new THREE.Mesh(lampHead, lampGlow);
      head.position.set(x, 6.2, z); scene.add(head);
    }
  }

  // --- palms (Marina + beach) and park trees ---
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondGeo = new THREE.ConeGeometry(2.2, 1.2, 6);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4c8a3f });
  const leafGeo = new THREE.SphereGeometry(1.6, 8, 6);
  function addPalm(x, z) {
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 2.5, z); t.rotation.z = (rng() - 0.5) * 0.2; scene.add(t);
    const f = new THREE.Mesh(frondGeo, frondMat);
    f.position.set(x, 5.4, z); scene.add(f);
  }
  for (let k = 0; k < 40; k++) {
    const x = 20 + rng() * 350, z = 20 + rng() * 350; // Marina quadrant
    if (!isRoad(x, z)) addPalm(x, z);
  }
  for (let k = 0; k < 12; k++) { // beach palms
    addPalm(-350 + k * 62 + rng() * 20, HALF + 12 + rng() * 8);
  }
  function addTree(x, z) {
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 2.5, z); scene.add(t);
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(x, 6, z); l.scale.y = 0.8; scene.add(l);
  }
  for (let k = 0; k < 10; k++) { // central park
    addTree((rng() - 0.5) * 44, (rng() - 0.5) * 44);
  }
  for (let k = 0; k < 8; k++) { // riverside park (block -5,5: centre -243, 297)
    addTree(-243 + (rng() - 0.5) * 40, 297 + (rng() - 0.5) * 40);
  }

  // --- beach umbrellas ---
  const umbPoleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6);
  const umbPoleMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const umbTopGeo = new THREE.ConeGeometry(1.8, 0.9, 8);
  const umbCols = [0xe84a4a, 0x2e6db8, 0xe8a02e, 0x3f8a4a];
  for (let k = 0; k < 8; k++) {
    const x = -320 + k * 88 + rng() * 30, z = HALF + 14 + rng() * 6;
    const p = new THREE.Mesh(umbPoleGeo, umbPoleMat);
    p.position.set(x, 1.2, z); scene.add(p);
    const top = new THREE.Mesh(umbTopGeo, new THREE.MeshLambertMaterial({ color: umbCols[k % 4] }));
    top.position.set(x, 2.8, z); scene.add(top);
  }

  // --- harbour containers ---
  const contCols = [0xb8452e, 0x2e6db8, 0x3f8a4a, 0xd8a02e];
  const contGeo = new THREE.BoxGeometry(6, 2.6, 2.6);
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Mesh(contGeo, new THREE.MeshLambertMaterial({ color: contCols[k % 4] }));
    m.position.set(-HALF - 14 + (k % 7) * 7, 1.3 + Math.floor(k / 7) * 2.7, -330 + Math.floor(rng() * 8) * 18);
    m.rotation.y = (rng() - 0.5) * 0.1;
    scene.add(m);
  }

  // --- drifting clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  city.clouds = [];
  for (let k = 0; k < 12; k++) {
    const cl = new THREE.Group();
    for (let p = 0; p < 3; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 6, 8, 6), cloudMat);
      s.position.set(p * 8 - 8, rng() * 2, rng() * 4 - 2); s.scale.y = 0.45;
      cl.add(s);
    }
    cl.position.set((rng() - 0.5) * 900, 90 + rng() * 30, (rng() - 0.5) * 900);
    scene.add(cl); city.clouds.push(cl);
  }

  return city;
}

// Push a circle {x, z} with radius r out of buildings and the map bounds.
export function collideCircle(city, p, r) {
  for (const b of city.colliders) {
    const nx = Math.max(b.minX - r, Math.min(p.x, b.maxX + r));
    const nz = Math.max(b.minZ - r, Math.min(p.z, b.maxZ + r));
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
    } else if (d2 <= 0.0001) {
      // centre inside the expanded box: push out along the smallest axis
      const pl = p.x - (b.minX - r), pr = (b.maxX + r) - p.x;
      const pt = p.z - (b.minZ - r), pb = (b.maxZ + r) - p.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) p.x = b.minX - r; else if (m === pr) p.x = b.maxX + r;
      else if (m === pt) p.z = b.minZ - r; else p.z = b.maxZ + r;
    }
  }
  p.x = Math.max(-BOUND, Math.min(BOUND, p.x));
  p.z = Math.max(-BOUND, Math.min(BOUND + 8, p.z));
}

export function randomRoadPoint(rng) {
  const along = (rng() - 0.5) * 2 * HALF;
  const lane = (rng() < 0.5 ? -1 : 1) * 3.2;
  const street = (Math.floor(rng() * (GRID_N + 1)) - GRID_N / 2) * PITCH;
  if (rng() < 0.5) return { x: street + lane, z: along, angle: along > 0 ? 0 : Math.PI };
  return { x: along, z: street + lane, angle: along > 0 ? -Math.PI / 2 : Math.PI / 2 };
}

export function randomSidewalkPoint(rng) {
  const i = Math.floor(rng() * GRID_N) - GRID_N / 2, j = Math.floor(rng() * GRID_N) - GRID_N / 2;
  const cx = i * PITCH + 27, cz = j * PITCH + 27;
  const side = Math.floor(rng() * 4);
  const t = (rng() - 0.5) * 30;
  if (side === 0) return { x: cx + t, z: cz - 20 };
  if (side === 1) return { x: cx + t, z: cz + 20 };
  if (side === 2) return { x: cx - 20, z: cz + t };
  return { x: cx + 20, z: cz + t };
}
