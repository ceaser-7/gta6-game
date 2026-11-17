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

// Facade texture — from GPT-6.1 Sol (small fixed-design call, 2026-11-17, v4):
// varied lit/dark windows, optional ground-floor shopfront band, grime streaks.
function makeFacadeTexture(rng, base, opts = {}) {
  const { lit = 0.28, floors = 6, cols = 6, groundFloor = false } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);

  const facadeHeight = groundFloor ? 228 : 256;
  const x0 = Math.floor((128 - (cols * 18 - 6)) / 2);
  const y0 = Math.floor((facadeHeight - (floors * 21 - 6)) / 2);
  for (let row = 0; row < floors; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = rng() < lit ? '#ffd98a' : (rng() < 0.5 ? '#232a33' : '#2e3844');
      ctx.fillRect(x0 + col * 18, y0 + row * 21, 12, 15);
    }
  }

  if (groundFloor) {
    ctx.fillStyle = '#1c222b';
    ctx.fillRect(0, 228, 128, 28);
    ctx.fillStyle = rng() < 0.5 ? '#7a3a2a' : '#2a4a3a';
    ctx.fillRect(0, 228, 128, 4);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(Math.floor(rng() * 126), 0, 3, 256);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 126, 254);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function makeGlassTexture(rng) {
  // a glass tower facade: vertical strips, many lit windows
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2c4a63'; g.fillRect(0, 0, 128, 256);
  for (let x = 6; x < 122; x += 14) {
    for (let y = 6; y < 250; y += 16) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? '#ffe9a8' : (rng() < 0.5 ? '#1d3247' : '#3a5a78');
      g.fillRect(x, y, 9, 11);
    }
  }
  g.fillStyle = 'rgba(10,18,28,0.55)';
  for (let x = 0; x < 128; x += 14) g.fillRect(x, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSignTexture(text, bg, fg, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; g.fillText(text, 256, sub ? 48 : 64);
  if (sub) {
    g.font = 'bold 26px Arial';
    g.fillStyle = '#ffffff';
    g.fillText(sub, 256, 96);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGroundTexture(rng) {
  // v4 rewrite (Sol returned zero text on this one, so it is built here to the
  // fixed design): asphalt is MID-GREY #4a4f55 — v3's #2d3138 rendered as a black
  // void — with noise, worn patches and brighter markings so roads read as roads.
  const S = 2048, W = GROUND; // world [-450, 450] -> [0, 2048]
  const px = v => (v + W / 2) / W * S;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  // base: muted warm concrete
  g.fillStyle = '#8d887a'; g.fillRect(0, 0, S, S);
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
  // roads: mid-grey asphalt, never near-black
  g.fillStyle = '#4a4f55';
  for (let i = -GRID_N / 2; i <= GRID_N / 2; i++) {
    const c0 = i * PITCH;
    g.fillRect(px(c0 - ROAD_HALF), 0, px(c0 + ROAD_HALF) - px(c0 - ROAD_HALF), S);
    g.fillRect(0, px(c0 - ROAD_HALF), S, px(c0 + ROAD_HALF) - px(c0 - ROAD_HALF));
  }
  // asphalt noise: light and dark speckle so the road has a surface
  for (let i = 0; i < 4000; i++) {
    const x = rng() * S, y = rng() * S;
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.fillRect(x, y, 2, 2);
  }
  // worn patches on the roads
  for (let i = 0; i < 24; i++) {
    const street = (Math.floor(rng() * (GRID_N + 1)) - GRID_N / 2) * PITCH;
    const along = (rng() - 0.5) * 2 * HALF;
    const w = 8 + rng() * 22, h = 5 + rng() * 10;
    g.fillStyle = 'rgba(0,0,0,0.10)';
    if (rng() < 0.5) g.fillRect(px(street - w / 2), px(along - h / 2), px(w) - px(0), px(h) - px(0));
    else g.fillRect(px(along - h / 2), px(street - w / 2), px(h) - px(0), px(w) - px(0));
  }
  // road edge lines (white) and centre dashes (yellow)
  g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 2;
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
      g.fillStyle = '#a89f8c'; g.fillRect(x0, z0, s, s); // sidewalk (inset by the road half-width so the roads stay visible)
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
  // v4: facades vary — Sol's makeFacadeTexture (muted bases, varied lit windows,
  // ground-floor shopfronts) on the front/back faces, a plainer few-window texture
  // on the sides, so buildings stop being the same grid on every face.
  const facadeBases = ['#b7a99a', '#a8b0b8', '#c0b49a', '#a89a8c', '#b0a89e', '#9aa5ad', '#c4b49c', '#8f9aa3'];
  const facadeMats = facadeBases.map(b =>
    new THREE.MeshLambertMaterial({ map: makeFacadeTexture(mulberry32(11 + facadeBases.indexOf(b) * 7), b, { lit: 0.28, floors: 6, cols: 6, groundFloor: facadeBases.indexOf(b) % 2 === 0 }) }));
  const sideMats = ['#a89a8c', '#9aa5ad', '#b0a89e', '#8f9aa3'].map((b, i) =>
    new THREE.MeshLambertMaterial({ map: makeFacadeTexture(mulberry32(91 + i * 13), b, { lit: 0.2, floors: 8, cols: 4, groundFloor: false }) }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2f });
  const balconyGeo = new THREE.BoxGeometry(3, 0.18, 1.2);
  const balconyMat = new THREE.MeshLambertMaterial({ color: 0x6a6258 });
  const awningGeo = new THREE.BoxGeometry(1, 0.12, 1.4);
  const awningMats = [new THREE.MeshLambertMaterial({ color: 0x7a3a2a }), new THREE.MeshLambertMaterial({ color: 0x2a4a3a })];
  const glassMat = new THREE.MeshLambertMaterial({ map: makeGlassTexture(mulberry32(77)), color: 0xd8e8f2 });
  city.neonMats = []; // emissive sign/billboard materials, glow harder at night
  city.lampGlowMat = null; // set below with the lamps
  const acGeo = new THREE.BoxGeometry(2.2, 1, 1.6);
  const towerGeo = new THREE.CylinderGeometry(1.6, 1.6, 3, 8);
  const towerRoofGeo = new THREE.ConeGeometry(1.9, 1.6, 8);

  function addBuilding(cx, cz, w, d, h, mat) {
    // mat is [sideMat, facadeMat] or a single material (glass towers)
    const mats = Array.isArray(mat)
      ? [mat[0], mat[0], roofMat, roofMat, mat[1], mat[1]]
      : mat;
    const m = new THREE.Mesh(boxGeo, mats);
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
    // balconies on low residential blocks: thin slabs on the front face
    if (h < 25 && h > 10 && rng() < 0.6) {
      const floors = Math.max(1, Math.floor(h / 7));
      for (let f = 0; f < floors; f++) {
        if (rng() < 0.5) continue;
        const bal = new THREE.Mesh(balconyGeo, balconyMat);
        bal.position.set(cx + (rng() - 0.5) * (w - 5), 4 + f * 7, cz + d / 2 + 0.6);
        bal.castShadow = true;
        scene.add(bal);
      }
    }
    // shop awning on the front of low street-facing buildings
    if (h < 20 && rng() < 0.4) {
      const awn = new THREE.Mesh(awningGeo, awningMats[Math.floor(rng() * awningMats.length)]);
      awn.scale.x = Math.max(3, w * 0.45);
      awn.position.set(cx, 3.4, cz + d / 2 + 0.6);
      awn.rotation.x = -0.35;
      scene.add(awn);
    }
    // tall towers step back as they rise: a smaller upper slab + a crown
    if (h >= 40) {
      const s1 = new THREE.Mesh(boxGeo, mats);
      s1.scale.set(w * 0.62, h * 0.32, d * 0.62);
      s1.position.set(cx, h + h * 0.16, cz);
      s1.castShadow = true; scene.add(s1);
      const s2 = new THREE.Mesh(boxGeo, mats);
      s2.scale.set(w * 0.36, h * 0.14, d * 0.36);
      s2.position.set(cx, h + h * 0.32 + h * 0.07, cz);
      s2.castShadow = true; scene.add(s2);
      // antenna mast on the tallest towers + a lit beacon on the very tallest
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), roofMat);
      mast.position.set(cx, h + h * 0.46 + 3.5, cz); scene.add(mast);
      if (h >= 80) {
        const bc = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff3344 }));
        bc.position.set(cx, h + h * 0.46 + 7.2, cz); scene.add(bc);
      }
    }
    // rooftop props: AC box on many roofs, a water tower on a few
    const r = rng();
    if (r < 0.4) {
      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(cx + (rng() - 0.5) * (w - 4), h + 1.3, cz + (rng() - 0.5) * (d - 4));
      ac.castShadow = true;
      scene.add(ac);
    } else if (r < 0.65) {
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
      const pair = [sideMats[Math.floor(rng() * sideMats.length)], facadeMats[Math.floor(rng() * facadeMats.length)]];
      const lmKey = `${i},${j}`;
      if (landmarks[lmKey]) {
        // the tallest tower is glass; the other two are setback towers
        addBuilding(cx, cz, 26, 26, landmarks[lmKey], lmKey === '4,-4' ? glassMat : pair);
        continue;
      }
      if (district === 'Downtown') {
        const h = 28 + rng() * 46;
        // one in four tall Downtown towers is glass
        const m2 = (h > 52 && rng() < 0.3) ? glassMat : pair;
        addBuilding(cx, cz, 20 + rng() * 8, 20 + rng() * 8, h, m2);
        if (rng() < 0.5) addBuilding(cx + (rng() < 0.5 ? -14 : 14), cz + (rng() < 0.5 ? -12 : 12), 8, 8, 10 + rng() * 8, pair);
      } else if (district === 'Harbor') {
        addBuilding(cx, cz, 26 + rng() * 4, 18 + rng() * 6, 9 + rng() * 7, pair);
      } else if (district === 'Old Town') {
        addBuilding(cx - 7, cz, 12, 20 + rng() * 6, 8 + rng() * 7, pair);
        addBuilding(cx + 9, cz + 2, 10, 16 + rng() * 6, 7 + rng() * 6, pair);
      } else {
        addBuilding(cx, cz, 18 + rng() * 8, 18 + rng() * 8, 12 + rng() * 16, pair);
      }
    }
  }

  // --- street lamps ---
  const lampPole = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const lampGlow = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9 });
  city.lampGlowMat = lampGlow;
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

  // --- neon signs + billboards (original ads only) ---
  // a sign plane on a building face; emissive so it glows at night
  function addSign(x, y, z, w, h, tex, ry) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
    city.neonMats.push(mat);
    return m;
  }
  const signs = [
    // [block i, block j, face +z/-z, text, bg, fg, sub]
    [2, -2, 1, 'VERDE', '#101828', '#ffd23e', 'HOTEL'],
    [4, -4, 1, 'SUNRAY', '#3a0d0d', '#ff6a3a', 'GT — DRIVE IT'],
    [1, -3, -1, 'COLA', '#7a1010', '#ffffff', 'PORTO VERDE'],
    [-2, -1, 1, '24H', '#0d3a2a', '#7dff9a', 'MARKET'],
    [3, -5, 1, 'MARINA', '#0d2a4a', '#9fd4e8', 'HOTEL & SPA'],
    [-1, 2, -1, 'TACOS', '#4a2a0d', '#ffd23e', 'EL FARO'],
  ];
  for (const [bi, bj, face, text, bg, fg, sub] of signs) {
    const cx = bi * PITCH + 27, cz = bj * PITCH + 27;
    const h = 14 + rng() * 10;
    addSign(cx, h, cz + face * 13.6, 16, 4, makeSignTexture(text, bg, fg, sub), face > 0 ? 0 : Math.PI);
  }
  // big billboards on tall Downtown buildings, facing the avenues
  const boards = [
    [0, -2, 0, 'PORTO VERDE', '#123f63', '#ffd23e', 'COLA — TASTE THE COAST'],
    [2, -4, Math.PI / 2, 'SUNRAY GT', '#1c1c22', '#ff6a3a', '0–100 IN 3.9s'],
    [-3, -2, 0, 'VERDE BANK', '#0d3a2a', '#ffffff', 'YOUR MONEY. YOUR CITY.'],
  ];
  for (const [bi, bj, ry, text, bg, fg, sub] of boards) {
    const cx = bi * PITCH + 27, cz = bj * PITCH + 27;
    const tex = makeSignTexture(text, bg, fg, sub);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5),
      new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }));
    m.position.set(cx + (ry === 0 ? 0 : 13.6), 26, cz + (ry === 0 ? 13.6 : 0));
    m.rotation.y = ry; scene.add(m);
    city.neonMats.push(m.material);
  }

  // --- street props: hydrants, bins, bus stops ---
  const hydGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.75, 8);
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const hydTopGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const binGeo = new THREE.BoxGeometry(0.7, 0.95, 0.7);
  const binMat = new THREE.MeshLambertMaterial({ color: 0x2e4a2e });
  const benchGeo = new THREE.BoxGeometry(2.2, 0.12, 0.6);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2f });
  const stopTex = makeSignTexture('BUS', '#123f63', '#ffffff', null);
  for (let i = -halfBlocks; i <= halfBlocks; i++) {
    for (let j = -halfBlocks; j <= halfBlocks; j++) {
      const r = rng();
      const x = i * PITCH + 10, z = j * PITCH + 10;
      if (r < 0.14) { // hydrant on a corner
        const h = new THREE.Mesh(hydGeo, hydMat);
        h.position.set(x, 0.38, z); h.castShadow = true; scene.add(h);
        const t = new THREE.Mesh(hydTopGeo, hydMat);
        t.position.set(x, 0.8, z); scene.add(t);
      } else if (r < 0.26) { // bin
        const b = new THREE.Mesh(binGeo, binMat);
        b.position.set(x, 0.48, z); b.castShadow = true; scene.add(b);
      } else if (r < 0.3) { // bus stop: bench + sign pole on the avenue edge
        const bench = new THREE.Mesh(benchGeo, benchMat);
        bench.position.set(x, 0.55, z); bench.castShadow = true; scene.add(bench);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), lampMat);
        pole.position.set(x + 1.4, 1.3, z); scene.add(pole);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8),
          new THREE.MeshLambertMaterial({ map: stopTex, emissive: 0xffffff, emissiveMap: stopTex, emissiveIntensity: 0.25 }));
        sign.position.set(x + 1.4, 2.5, z); scene.add(sign);
        city.neonMats.push(sign.material);
      }
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
