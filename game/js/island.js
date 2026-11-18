// Island world: terrain, beach ring, ocean, city grid, buildings, props, sky.
// Porto Verde is an ISLAND: city grid in the middle, sand ring, ocean on every side.
import * as THREE from 'three';
import { G, WORLD, DISTRICTS, clamp, rand, randi, pick } from './state.js';

let sun, moon, hemi, dirLight, ocean, oceanMat, skyDome, nightLights = [];
const tmpColor = new THREE.Color();

// ---- Ground texture: ocean, sand ring, city streets, parks, plaza ----
function groundTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const w2c = v => (v + WORLD.half) / (WORLD.half * 2) * S; // world -> canvas
  const sc = S / (WORLD.half * 2);
  // Ocean
  x.fillStyle = '#0b4a6b'; x.fillRect(0, 0, S, S);
  // Shallow water near shore
  x.fillStyle = '#12708a';
  x.beginPath(); x.arc(S / 2, S / 2, w2c(WORLD.beachOuter) - S / 2 + 40, 0, Math.PI * 2); x.fill();
  // Sand ring (island)
  x.fillStyle = '#d9c27a';
  x.beginPath(); x.arc(S / 2, S / 2, (WORLD.beachOuter - 0) * sc, 0, Math.PI * 2); x.fill();
  // Sand texture speckles
  x.fillStyle = 'rgba(180,150,90,.5)';
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(WORLD.beachInner, WORLD.beachOuter);
    x.fillRect(S / 2 + Math.cos(a) * r * sc, S / 2 + Math.sin(a) * r * sc, 2, 2);
  }
  // City ground
  x.fillStyle = '#3a3f46';
  x.fillRect(w2c(-WORLD.cityHalf), w2c(-WORLD.cityHalf), WORLD.cityHalf * 2 * sc, WORLD.cityHalf * 2 * sc);
  // Parks (green)
  const parks = [[-200, -200, 120, 120], [200, 200, 120, 120]];
  for (const [px, pz, pw, ph] of parks) {
    x.fillStyle = '#2a5a34'; x.fillRect(w2c(px - pw / 2), w2c(pz - ph / 2), pw * sc, ph * sc);
    x.fillStyle = '#3a7a44';
    for (let i = 0; i < 24; i++) x.fillRect(w2c(px - pw / 2) + Math.random() * pw * sc, w2c(pz - ph / 2) + Math.random() * ph * sc, 5, 5);
  }
  // Plaza (light stone)
  x.fillStyle = '#8a8578'; x.fillRect(w2c(-40), w2c(-40), 80 * sc, 80 * sc);
  x.fillStyle = '#6a9ab5'; x.beginPath(); x.arc(S / 2, S / 2, 10 * sc, 0, Math.PI * 2); x.fill();
  // Roads (grid)
  x.strokeStyle = '#22252a'; x.lineWidth = WORLD.roadW * sc;
  for (let i = -4; i <= 4; i++) {
    const p = w2c(i * WORLD.block);
    x.beginPath(); x.moveTo(p, w2c(-WORLD.cityHalf)); x.lineTo(p, w2c(WORLD.cityHalf)); x.stroke();
    x.beginPath(); x.moveTo(w2c(-WORLD.cityHalf), p); x.lineTo(w2c(WORLD.cityHalf), p); x.stroke();
  }
  // Road centre dashes
  x.strokeStyle = '#d8c832'; x.lineWidth = 2; x.setLineDash([10, 14]);
  for (let i = -4; i <= 4; i++) {
    const p = w2c(i * WORLD.block);
    x.beginPath(); x.moveTo(p, w2c(-WORLD.cityHalf)); x.lineTo(p, w2c(WORLD.cityHalf)); x.stroke();
    x.beginPath(); x.moveTo(w2c(-WORLD.cityHalf), p); x.lineTo(w2c(WORLD.cityHalf), p); x.stroke();
  }
  x.setLineDash([]);
  // Beach umbrellas (dots along the sand)
  x.fillStyle = '#e85a5a';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(WORLD.beachInner + 12, WORLD.beachOuter - 14);
    x.beginPath(); x.arc(S / 2 + Math.cos(a) * r * sc, S / 2 + Math.sin(a) * r * sc, 4, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBuilding(w, h, d, color, emissiveWin) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2; body.castShadow = false; g.add(body);
  // Roof rim
  const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }));
  rim.position.y = h + 0.25; g.add(rim);
  // Lit windows: emissive plane strips on the front/back
  if (emissiveWin) {
    const floors = Math.max(1, Math.floor(h / 7));
    const winMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd76a, emissiveIntensity: 0.9 });
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < Math.max(2, Math.floor(w / 6)); k++) {
        if (Math.random() < 0.45) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), winMat);
        win.position.set(-w / 2 + 3 + k * 6, 4 + f * 7, d / 2 + 0.06);
        g.add(win);
        const win2 = win.clone(); win2.position.z = -d / 2 - 0.06; win2.rotation.y = Math.PI; g.add(win2);
      }
    }
  }
  g.userData.winMat = null;
  return g;
}

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }));
  trunk.position.y = 3.5; g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 7.6, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 0.9; leaf.rotation.x = -Math.sin(a) * 0.9;
    g.add(leaf);
  }
  return g;
}

function makeNeonSign(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#0a0a12'; x.fillRect(0, 0, 256, 64);
  x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 16; x.fillStyle = color;
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3),
    new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.4 }));
  return m;
}

export function buildIsland() {
  const scene = G.scene;
  // Lights + sky
  hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a3a5a, 0.9); scene.add(hemi);
  dirLight = new THREE.DirectionalLight(0xffb060, 1.6);
  dirLight.position.set(-120, 180, 60); scene.add(dirLight);
  sun = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffc860, fog: false }));
  scene.add(sun);
  moon = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xd8e4ff, fog: false }));
  scene.add(moon);
  // Sky dome (big gradient sphere, backside)
  const skyGeo = new THREE.SphereGeometry(1400, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2a4a7a) }, mid: { value: new THREE.Color(0xff9a5a) }, bot: { value: new THREE.Color(0x1a2a4a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top,mid,bot; void main(){ float h=normalize(vP).y; vec3 c=h>0.15?mix(mid,top,smoothstep(0.15,0.7,h)):mix(bot,mid,smoothstep(-0.1,0.15,h)); gl_FragColor=vec4(c,1.0); }',
  });
  skyDome = new THREE.Mesh(skyGeo, skyMat); scene.add(skyDome);
  scene.fog = new THREE.Fog(0x8a6a5a, 500, 1300);

  // Ground (island + city + beach in one texture)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = false; scene.add(ground);

  // Ocean: animated translucent plane just above ground at the rim, below beach height
  oceanMat = new THREE.MeshStandardMaterial({ color: 0x0a5a8a, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.1 });
  ocean = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2), oceanMat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = 0.4; scene.add(ocean);

  // ---- Buildings ----
  // Blocks sit BETWEEN roads: roads run on multiples of 80, so block centres
  // are at i*80+40 (Sol fix — the old layout centred blocks ON the roads,
  // which put buildings in the driving lanes and wedged cars).
  const blocks = [];
  for (let i = -4; i <= 3; i++) for (let j = -4; j <= 3; j++) {
    const bx = i * WORLD.block + 40, bz = j * WORLD.block + 40;
    if (Math.abs(bx) <= 40 && Math.abs(bz) <= 40) continue; // plaza
    if (Math.abs(bx + 200) < 40 && Math.abs(bz + 200) < 40) continue; // park NW
    if (Math.abs(bx - 200) < 40 && Math.abs(bz - 200) < 40) continue; // park SE
    blocks.push([bx, bz]);
  }
  const downtown = (x, z) => Math.abs(x) < 120 && Math.abs(z) < 120;
  for (const [bx, bz] of blocks) {
    const n = randi(1, 3);
    for (let k = 0; k < n; k++) {
      const w = rand(14, 26), d = rand(14, 26);
      const h = downtown(bx, bz) ? rand(22, 70) : rand(8, 30);
      const ox = bx + rand(-18, 18), oz = bz + rand(-18, 18);
      const palette = downtown(bx, bz) ? [0x4a5a7a, 0x6a5a4a, 0x5a6a7a, 0x7a6a5a] : [0x8a7a5a, 0x7a8a6a, 0x9a8a7a, 0x6a7a8a];
      const b = makeBuilding(w, h, d, pick(palette), true);
      b.position.set(ox, 0, oz); b.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      scene.add(b);
      G.world.buildings.push(b);
      G.world.colliders.push({ x: ox, z: oz, hx: w / 2 + 1, hz: d / 2 + 1 });
    }
  }
  // 3 landmark towers (Downtown) — on block centres, clear of the roads.
  const towers = [
    { x: -40, z: -40, h: 110, c: 0x2a4a7a, name: 'Verde Spire' },
    { x: 40, z: -40, h: 95, c: 0x7a3a4a, name: 'Harbor Tower' },
    { x: 40, z: 60, h: 85, c: 0x3a6a5a, name: 'Sol Tower' },
  ];
  for (const t of towers) {
    const b = makeBuilding(26, t.h, 26, t.c, true);
    b.position.set(t.x, 0, t.z); scene.add(b);
    G.world.colliders.push({ x: t.x, z: t.z, hx: 14, hz: 14 });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
    tip.position.set(t.x, t.h + 3, t.z); scene.add(tip);
  }
  // Hospital (Northside) with red cross — in a block interior, off the roads.
  const hosp = makeBuilding(30, 18, 22, 0xd8d8d8, true);
  hosp.position.set(-120, 0, -200); scene.add(hosp);
  G.world.colliders.push({ x: -120, z: -200, hx: 16, hz: 12 });
  const cross = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 1),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1 }));
  cross.position.set(-120, 22, -188); scene.add(cross);
  // Safehouse (South Beach)
  const safe = makeBuilding(16, 9, 14, 0x7ab5a5, false);
  safe.position.set(120, 0, 280); scene.add(safe);
  G.world.colliders.push({ x: 120, z: 280, hx: 9, hz: 8 });
  // Interiors: El Faro (Old Town) + Sunray Garage (Northside) — off the roads.
  const faro = makeBuilding(24, 12, 18, 0xb56a3a, true);
  faro.position.set(-200, 0, 120); scene.add(faro);
  G.world.colliders.push({ x: -200, z: 120, hx: 13, hz: 10 });
  const garage = makeBuilding(28, 10, 20, 0x4a6a8a, true);
  garage.position.set(200, 0, -200); scene.add(garage);
  G.world.colliders.push({ x: 200, z: -200, hx: 15, hz: 11 });
  G.world.vendors = [
    { id: 'faro', name: 'El Faro', x: -200, z: 138, kind: 'food', who: 'rosa' },
    { id: 'garage', name: 'Sunray Garage', x: 200, z: -182, kind: 'repair', who: 'tomas' },
  ];

  // Neon signs + billboards
  const signs = [
    ['VERDE', 0xff5a8a, -40, 60, -26], ['NEON', 0x5affd8, 40, 50, -26],
    ['HOTEL', 0xffd75a, -200, 16, 132], ['24H', 0x5a8aff, 200, 14, -188],
    ['BAR', 0xff8a5a, 120, 12, 272], ['CASINO', 0xd85aff, 240, 18, 52],
  ];
  for (const [txt, col, sx, sy, sz] of signs) {
    const s = makeNeonSign(txt, '#' + col.toString(16).padStart(6, '0'));
    s.position.set(sx, sy, sz); scene.add(s);
  }
  // Billboards (canvas texture)
  for (const [bx, bz, ry] of [[-80, 160, 0], [80, -160, Math.PI], [200, -80, Math.PI / 2]]) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#12203a'; x2.fillRect(0, 0, 256, 128);
    x2.fillStyle = '#ffb020'; x2.font = 'bold 30px Arial'; x2.textAlign = 'center';
    x2.fillText('PORTO VERDE', 128, 56); x2.fillStyle = '#fff'; x2.font = '20px Arial';
    x2.fillText('Visit the island', 128, 92);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 14, 6),
      new THREE.MeshStandardMaterial({ color: 0x555555 }));
    pole.position.set(bx, 7, bz); scene.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(20, 10),
      new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7 }));
    board.position.set(bx, 18, bz); board.rotation.y = ry; scene.add(board);
    G.world.colliders.push({ x: bx, z: bz, hx: 1, hz: 1 });
  }

  // Fountain in the plaza
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.8 }));
  basin.position.set(0, 0.8, 0); scene.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a9ab5, roughness: 0.2, metalness: 0.3 }));
  water.position.set(0, 1.7, 0); scene.add(water);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a8578 }));
  spout.position.set(0, 4, 0); scene.add(spout);
  G.world.colliders.push({ x: 0, z: 0, hx: 10, hz: 10 });

  // Palms along the beach + parks
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(WORLD.beachInner + 8, WORLD.beachOuter - 12);
    const p = makePalm();
    p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    p.rotation.y = Math.random() * Math.PI * 2; scene.add(p);
  }
  for (let i = 0; i < 20; i++) {
    const p = makePalm();
    const park = Math.random() < 0.5 ? [-200, -200] : [200, 200];
    p.position.set(park[0] + rand(-50, 50), 0, park[1] + rand(-50, 50)); scene.add(p);
  }
  // Street lamps (emissive only — no per-lamp lights, for performance)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffd76a, emissiveIntensity: 1.6 });
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    if ((i + j) % 2) continue;
    const lx = i * WORLD.block + 8, lz = j * WORLD.block + 8;
    if (Math.abs(lx) > WORLD.cityHalf || Math.abs(lz) > WORLD.cityHalf) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 6), lampMat);
    pole.position.set(lx, 3.5, lz); scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), bulbMat);
    bulb.position.set(lx, 7.2, lz); scene.add(bulb);
    G.world.lamps.push(bulb);
  }

  // Verde Coins (20 collectibles) — beach, parks, streets, rooftops low
  const coinGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xaa7711, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 });
  const spots = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spots.push([Math.cos(a) * rand(340, 400), Math.sin(a) * rand(340, 400)]); }
  spots.push([-200, -200], [200, 200], [30, 30], [-200, 120], [200, -200], [120, 280], [240, 40], [-120, -200]);
  spots.slice(0, 20).forEach(([cx, cz], idx) => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    coin.position.set(cx, 1.6, cz); coin.userData.coinIdx = idx;
    scene.add(coin); G.world.coins.push(coin);
  });

  // Causeway bridge (Marina to a small islet) — decorative + drivable
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 120),
    new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.9 }));
  bridge.position.set(360, 1, 40); bridge.rotation.y = 0; scene.add(bridge);

  // Sol direction (city identity): hand-dress the opening corridor with a
  // distinctive landmark and street-prop clusters — not the whole map.
  // Lighthouse at the Marina (the opening route's landmark).
  const lh = new THREE.Group();
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.5, 26, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 }));
  lhBase.position.y = 13; lh.add(lhBase);
  const lhBand = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 3, 12),
    new THREE.MeshStandardMaterial({ color: 0xc23a3a, roughness: 0.8 }));
  lhBand.position.y = 20; lh.add(lhBand);
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
  lhTop.position.y = 28; lh.add(lhTop);
  const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe8a0, emissiveIntensity: 3 }));
  lhLamp.position.y = 28; lh.add(lhLamp);
  lh.position.set(300, 0, 40); scene.add(lh);
  G.world.colliders.push({ x: 300, z: 40, hx: 6, hz: 6 });
  // Street-prop clusters along the opening corridor (spawn -> plaza -> Marina).
  const propSpots = [[-8, 60], [8, 100], [-8, 160], [8, 200], [60, 40], [120, 40], [180, 40]];
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.95 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
  for (const [px, pz] of propSpots) {
    // Crates
    for (let k = 0; k < 3; k++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat);
      crate.position.set(px + rand(-2, 2), 0.7, pz + rand(-2, 2));
      crate.rotation.y = rand(0, Math.PI);
      scene.add(crate);
    }
    // Bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
    bench.position.set(px + 3, 0.5, pz);
    scene.add(bench);
  }

  // Sol direction: 6 real point lights max, no shadows — 2 at the plaza,
  // 4 beside primary neon signs. They switch on at night (see updateSky).
  const nightSpots = [[-12, 12], [12, -12], [-40, -26], [40, -16], [120, 272], [240, 52]];
  for (const [nx, nz] of nightSpots) {
    const pl = new THREE.PointLight(0xffc880, 0, 42, 1.6);
    pl.position.set(nx, 7, nz);
    scene.add(pl);
    nightLights.push(pl);
  }

  // Start the day/night lighting at golden hour
  updateSky();
}

// ---- Day/night: 240s cycle, opens at golden-hour sunset (18:00) ----
export function updateSky() {
  if (!dirLight) return;
  const t = (G.timeOfDay % 24) / 24; // 0..1
  // Sun elevation: peaks at noon (12), sets ~18-19, night 20-5
  const sunAngle = (t - 0.25) * Math.PI * 2; // noon = top
  const elev = Math.sin(sunAngle);
  const isDay = elev > -0.08;
  const warm = clamp(1 - Math.abs(elev) * 2.2, 0.25, 1);
  dirLight.intensity = isDay ? 0.6 + 1.2 * clamp(elev, 0, 1) : 0.40;
  dirLight.color.setHSL(0.08 + 0.02 * warm, 0.75, 0.55);
  dirLight.position.set(Math.cos(sunAngle) * 300, Math.max(30, elev * 300), 120);
  hemi.intensity = isDay ? 0.5 + 0.5 * clamp(elev, 0, 1) : 0.60;
  // Night point lights (Sol: 6 max, no shadows) — on at night, off by day.
  for (const pl of nightLights) pl.intensity = isDay ? 0 : 22;
  sun.visible = elev > -0.05;
  sun.position.set(Math.cos(sunAngle) * 1100, Math.max(20, elev * 900), 500);
  moon.visible = !isDay;
  moon.position.set(-Math.cos(sunAngle) * 1000, Math.max(60, -elev * 800), -400);
  const skyTop = new THREE.Color(), skyMid = new THREE.Color(), skyBot = new THREE.Color();
  if (isDay) {
    skyTop.setHSL(0.58, 0.6, 0.35 + 0.25 * clamp(elev, 0, 1));
    skyMid.setHSL(0.07, 0.85, 0.55 + 0.1 * warm);
    skyBot.setHSL(0.08, 0.5, 0.3);
  } else {
    skyTop.setHex(0x060a18); skyMid.setHex(0x0a1230); skyBot.setHex(0x05070f);
  }
  skyDome.material.uniforms.top.value.copy(skyTop);
  skyDome.material.uniforms.mid.value.copy(skyMid);
  skyDome.material.uniforms.bot.value.copy(skyBot);
  if (G.scene) G.scene.fog.color.copy(skyMid).lerp(new THREE.Color(0x0a0a14), isDay ? 0 : 0.5);
  // Ocean shimmer
  if (oceanMat) { oceanMat.color.setHSL(0.55, 0.7, isDay ? 0.32 : 0.12); oceanMat.opacity = isDay ? 0.85 : 0.92; }
}

export function animateOcean(t) {
  if (!ocean) return;
  ocean.position.y = 0.4 + Math.sin(t * 0.7) * 0.15;
  ocean.rotation.z = Math.sin(t * 0.3) * 0.002;
}
