// Porto Verde — the city itself: procedural streets, blocks, buildings, props.
// One clear job: build the static city, own its collision and its road/sidewalk queries.
import * as THREE from 'three';

export const PITCH = 54;          // street centreline spacing
export const ROAD_HALF = 7;       // half road width
export const WALK = 4;            // sidewalk width
export const HALF = 216;          // last street centreline
export const BOUND = 258;         // playable edge (water / city limit)

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

function makeGroundTexture() {
  const S = 1024, W = 540; // world [-270, 270] -> [0, 1024]
  const px = v => (v + W / 2) / W * S;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  // base: warm concrete
  g.fillStyle = '#8d8a7c'; g.fillRect(0, 0, S, S);
  // water: west strip and south strip
  g.fillStyle = '#1d6f8f';
  g.fillRect(0, 0, px(-216), S);
  g.fillRect(0, px(216), S, S - px(216));
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * px(-216), y = Math.random() * S;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y); g.stroke();
  }
  // sand beach along the south edge
  g.fillStyle = '#dcc491';
  g.fillRect(px(-216), px(216), S - px(-216), px(240) - px(216));
  // roads
  g.fillStyle = '#2d3138';
  for (let i = -4; i <= 4; i++) {
    const c0 = i * PITCH;
    g.fillRect(px(c0 - ROAD_HALF), 0, px(c0 + ROAD_HALF) - px(c0 - ROAD_HALF), S);
    g.fillRect(0, px(c0 - ROAD_HALF), S, px(c0 + ROAD_HALF) - px(c0 - ROAD_HALF));
  }
  // centre dashes
  g.fillStyle = '#e8c33a';
  for (let i = -4; i <= 4; i++) {
    const c0 = i * PITCH;
    for (let d = -260; d < 260; d += 16) {
      g.fillRect(px(c0) - 1.5, px(d), 3, 8);
      g.fillRect(px(d), px(c0) - 1.5, 8, 3);
    }
  }
  // blocks: sidewalk ring + interior, coloured by district
  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const cx = i * PITCH + 27, cz = j * PITCH + 27;
      const x0 = px(cx - 27 + ROAD_HALF), z0 = px(cz - 27 + ROAD_HALF), s = px(cx + 27 - ROAD_HALF) - x0;
      g.fillStyle = '#b3ab97'; g.fillRect(x0, z0, s, s); // sidewalk (inset by the road half-width so the roads stay visible)
      let inner = '#9a938a';
      if (i === 0 && j === 0) inner = '#5d8a4a';           // central park
      else if (cx < 0 && cz < 0) inner = '#7e7468';          // Harbor: concrete yards
      else if (cx >= 0 && cz < 0) inner = '#8f8a80';         // Downtown: grey
      else if (cx < 0 && cz >= 0) inner = '#a89a7e';         // Old Town: warm tile
      else inner = '#93a08b';                                 // Marina: pale green
      g.fillStyle = inner;
      const m = px(WALK) - px(0); // sidewalk ring width; interior stays the 32-unit block core
      g.fillRect(x0 + m, z0 + m, s - 2 * m, s - 2 * m);
      // crosswalks at the block's corners
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [wx, wz] of [[cx - 27, cz - 27], [cx + 27, cz - 27], [cx - 27, cz + 27], [cx + 27, cz + 27]]) {
        for (let k = -2; k <= 2; k++) {
          g.fillRect(px(wx + k * 2.4) - 1, px(wz) - 5, 2, 10);
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
  const city = { colliders: [], buildingMeshes: [], bounds: BOUND, rng };

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(540, 540),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);
  city.ground = ground;

  // --- buildings ---
  const winTex = [
    makeWindowTexture(mulberry32(11), '#cbb9a0'),
    makeWindowTexture(mulberry32(23), '#a8b4c4'),
    makeWindowTexture(mulberry32(37), '#d8c49a'),
  ];
  const tints = [0xffffff, 0xf2e2c8, 0xd8c2b0, 0xb9c4cc, 0xe0b090];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const materials = winTex.map((t, i) => new THREE.MeshLambertMaterial({ map: t, color: tints[i % tints.length] }));

  function addBuilding(cx, cz, w, d, h, mat) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    scene.add(m);
    city.buildingMeshes.push(m);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.8, d + 0.6);
    roof.position.set(cx, h + 0.4, cz);
    scene.add(roof);
    city.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }

  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const cx = i * PITCH + 27, cz = j * PITCH + 27;
      if (i === 0 && j === 0) continue; // central park
      const district = districtAt(cx, cz);
      const mat = materials[Math.floor(rng() * materials.length)];
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
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * PITCH + 9, z = j * PITCH + 9;
      const pole = new THREE.Mesh(lampPole, lampMat);
      pole.position.set(x, 3, z); scene.add(pole);
      const head = new THREE.Mesh(lampHead, lampGlow);
      head.position.set(x, 6.2, z); scene.add(head);
    }
  }

  // --- palms (Marina + park) and park trees ---
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondGeo = new THREE.ConeGeometry(1.6, 0.5, 5);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4c8a3f });
  const leafGeo = new THREE.SphereGeometry(1.6, 8, 6);
  function addPalm(x, z) {
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 2.5, z); t.rotation.z = (rng() - 0.5) * 0.2; scene.add(t);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      const a = (k / 5) * Math.PI * 2;
      f.position.set(x + Math.cos(a) * 1.1, 5.1, z + Math.sin(a) * 1.1);
      f.rotation.z = Math.cos(a) * 1.1; f.rotation.x = -Math.sin(a) * 1.1;
      scene.add(f);
    }
  }
  for (let k = 0; k < 26; k++) {
    const x = 20 + rng() * 190, z = 20 + rng() * 190; // Marina quadrant
    if (!isRoad(x, z)) addPalm(x, z);
  }
  for (let k = 0; k < 10; k++) {
    const x = (rng() - 0.5) * 44, z = (rng() - 0.5) * 44; // central park
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 2.5, z); scene.add(t);
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(x, 6, z); l.scale.y = 0.8; scene.add(l);
  }

  // --- harbour containers ---
  const contCols = [0xb8452e, 0x2e6db8, 0x3f8a4a, 0xd8a02e];
  const contGeo = new THREE.BoxGeometry(6, 2.6, 2.6);
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Mesh(contGeo, new THREE.MeshLambertMaterial({ color: contCols[k % 4] }));
    m.position.set(-232 + (k % 7) * 7, 1.3 + Math.floor(k / 7) * 2.7, -180 + Math.floor(rng() * 8) * 18);
    m.rotation.y = (rng() - 0.5) * 0.1;
    scene.add(m);
  }

  // --- drifting clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  city.clouds = [];
  for (let k = 0; k < 8; k++) {
    const cl = new THREE.Group();
    for (let p = 0; p < 3; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 6, 8, 6), cloudMat);
      s.position.set(p * 8 - 8, rng() * 2, rng() * 4 - 2); s.scale.y = 0.45;
      cl.add(s);
    }
    cl.position.set((rng() - 0.5) * 500, 90 + rng() * 30, (rng() - 0.5) * 500);
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
  const street = (Math.floor(rng() * 9) - 4) * PITCH;
  if (rng() < 0.5) return { x: street + lane, z: along, angle: along > 0 ? 0 : Math.PI };
  return { x: along, z: street + lane, angle: along > 0 ? -Math.PI / 2 : Math.PI / 2 };
}

export function randomSidewalkPoint(rng) {
  const i = Math.floor(rng() * 8) - 4, j = Math.floor(rng() * 8) - 4;
  const cx = i * PITCH + 27, cz = j * PITCH + 27;
  const side = Math.floor(rng() * 4);
  const t = (rng() - 0.5) * 30;
  if (side === 0) return { x: cx + t, z: cz - 20 };
  if (side === 1) return { x: cx + t, z: cz + 20 };
  if (side === 2) return { x: cx - 20, z: cz + t };
  return { x: cx + 20, z: cz + t };
}
