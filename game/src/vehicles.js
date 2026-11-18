// Porto Verde — cars: five types, detailed bodies, traffic that drives the
// road grid, damage smoke, police cars. All original.
import * as THREE from 'three';
import { G, CFG, ROADS, rand, randi, pick, clamp } from './util.js';

const COLORS = {
  sedan: [0x7a2e2e, 0x2e4a6b, 0x5a5a5a, 0x3a6b4a, 0x8a7a3a],
  sports: [0xc22e2e, 0xe8a020, 0x2e6bc2, 0x8a2e6b],
  suv: [0x4a4a52, 0x6b4a2e, 0x2e5a4a, 0x3a3a4a],
  van: [0x8a6b3a, 0x5a6b7a, 0x7a7a7a, 0x6b5a8a],
  taxi: [0xe8c33c],
};
const SIZES = {
  sedan: { len: 4.4, wid: 1.9, hgt: 0.7, maxSpeed: 26 },
  sports: { len: 4.2, wid: 1.9, hgt: 0.6, maxSpeed: 34 },
  suv: { len: 4.8, wid: 2.1, hgt: 0.9, maxSpeed: 24 },
  van: { len: 5.2, wid: 2.1, hgt: 1.1, maxSpeed: 20 },
  taxi: { len: 4.4, wid: 1.9, hgt: 0.7, maxSpeed: 26 },
};

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(120,120,120,0.7)');
  grad.addColorStop(1, 'rgba(120,120,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
let smokeTex = null;
const smokes = [];

export function puffSmoke(x, y, z) {
  if (!smokeTex) smokeTex = smokeTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.6, depthWrite: false }));
  s.position.set(x + rand(-0.5, 0.5), y, z + rand(-0.5, 0.5));
  s.scale.set(1.5, 1.5, 1);
  s.userData.life = 1.2;
  G.scene.add(s);
  smokes.push(s);
  if (smokes.length > 40) { const old = smokes.shift(); G.scene.remove(old); }
}
export function updateSmoke(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.userData.life -= dt;
    s.position.y += dt * 2;
    s.material.opacity = Math.max(0, s.userData.life * 0.5);
    s.scale.setScalar(s.scale.x + dt * 1.5);
    if (s.userData.life <= 0) { G.scene.remove(s); smokes.splice(i, 1); }
  }
}

export function makeCar(type, colorHex) {
  const size = SIZES[type];
  const color = colorHex !== undefined ? colorHex : pick(COLORS[type]);
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x22282e });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(size.len, size.hgt, size.wid), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  // sloped hood + deck: thin angled panels
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, size.wid * 0.92), bodyMat);
  hood.position.set(size.len / 2 - 0.45, 0.95, 0); hood.rotation.z = -0.18; g.add(hood);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, size.wid * 0.92), bodyMat);
  deck.position.set(-size.len / 2 + 0.45, 0.95, 0); deck.rotation.z = 0.18; g.add(deck);
  const cabinH = type === 'van' ? 1.0 : 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(size.len * (type === 'van' ? 0.85 : 0.52), cabinH, size.wid * 0.85), glassMat);
  cabin.position.set(type === 'van' ? -0.2 : -0.2, 0.9 + cabinH / 2, 0); cabin.castShadow = true; g.add(cabin);
  // side glass strips
  const side = new THREE.Mesh(new THREE.BoxGeometry(size.len * 0.5, 0.3, size.wid * 0.87), glassMat);
  side.position.set(-0.2, 1.05, 0); g.add(side);
  // grille + bumpers
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, size.wid * 0.6), darkMat);
  grille.position.set(size.len / 2 + 0.02, 0.5, 0); g.add(grille);
  for (const sx of [size.len / 2 + 0.05, -size.len / 2 - 0.05]) {
    const bump = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, size.wid * 0.95), darkMat);
    bump.position.set(sx, 0.42, 0); g.add(bump);
  }
  // headlights + brake lights
  const hlMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.5 });
  for (const sz of [-size.wid * 0.32, size.wid * 0.32]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.3), hlMat);
    hl.position.set(size.len / 2 + 0.03, 0.62, sz); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0xa02020, emissive: 0x881111, emissiveIntensity: 0.4 }));
    tl.position.set(-size.len / 2 - 0.03, 0.62, sz); g.add(tl);
  }
  // mirrors
  for (const sz of [-size.wid / 2 - 0.08, size.wid / 2 + 0.08]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), darkMat);
    m.position.set(size.len * 0.2, 1.0, sz); g.add(m);
  }
  // wheels + hubcaps
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.27, 8);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
  for (const [wx, wz] of [[size.len * 0.32, size.wid / 2], [size.len * 0.32, -size.wid / 2], [-size.len * 0.32, size.wid / 2], [-size.len * 0.32, -size.wid / 2]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.x = Math.PI / 2; w.position.set(wx, 0.35, wz); g.add(w);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2; hub.position.set(wx, 0.35, wz); g.add(hub);
  }
  if (type === 'sports') {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, size.wid * 0.9), darkMat);
    sp.position.set(-size.len / 2 + 0.1, 1.15, 0); g.add(sp);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe970, emissiveIntensity: 0.6 }));
    sign.position.set(-0.2, 1.55, 0); g.add(sign);
  }
  g.userData = { type, len: size.len, wid: size.wid, maxSpeed: size.maxSpeed, speed: 0, health: 100, heading: 0, axis: 'x', line: 0, dir: 1, smokeT: 0 };
  return g;
}

export function makePoliceCar() {
  const car = makeCar('sedan', 0x1a1d22);
  const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xff2222, emissiveIntensity: 0.9 }));
  barR.position.set(-0.2, 1.5, -0.35); car.add(barR);
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x2222cc, emissive: 0x2222ff, emissiveIntensity: 0.9 }));
  barB.position.set(-0.2, 1.5, 0.35); car.add(barB);
  car.userData.type = 'police';
  car.userData.maxSpeed = 30;
  return car;
}

export function spawnTraffic() {
  const types = ['sedan', 'sports', 'suv', 'van', 'taxi'];
  for (let i = 0; i < 32; i++) {
    const type = pick(types);
    const car = makeCar(type);
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const line = pick(ROADS);
    const pos = rand(-420, 420);
    car.userData.axis = axis;
    car.userData.line = line;
    car.userData.dir = Math.random() < 0.5 ? 1 : -1;
    car.userData.speed = rand(8, 14);
    if (axis === 'x') { car.position.set(pos, 0, line); car.rotation.y = car.userData.dir > 0 ? 0 : Math.PI; }
    else { car.position.set(line, 0, pos); car.rotation.y = car.userData.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    car.userData.heading = car.rotation.y;
    G.scene.add(car);
    G.cars.push(car);
  }
  G.stats.cars = G.cars.length;
}

function nearestRoadLine(v) {
  let best = ROADS[0], bd = 1e9;
  for (const r of ROADS) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return { line: best, dist: bd };
}

export function updateTraffic(dt) {
  if (G.interior) return;
  const px = G.player ? G.player.position.x : 0;
  const pz = G.player ? G.player.position.z : 0;
  for (const car of G.cars) {
    const u = car.userData;
    if (u.type === 'police') continue;
    if (u.parked || car === G.playerCar) continue;
    // slow for a car ahead on the same line
    let target = rand(8, 14);
    for (const other of G.cars) {
      if (other === car || other.userData.axis !== u.axis || other.userData.line !== u.line) continue;
      const along = u.axis === 'x' ? (other.position.x - car.position.x) * u.dir : (other.position.z - car.position.z) * u.dir;
      if (along > 0 && along < 9) { target = Math.min(target, Math.max(0, other.userData.speed * 0.9)); break; }
    }
    u.speed += clamp(target - u.speed, -8 * dt, 4 * dt);
    const step = u.speed * u.dir * dt;
    if (u.axis === 'x') {
      car.position.x += step;
      const near = nearestRoadLine(car.position.x);
      if (near.dist < 2 && Math.random() < 0.012) {
        u.axis = 'z'; u.line = near.line; u.dir = Math.random() < 0.5 ? 1 : -1;
        car.position.x = near.line;
        car.rotation.y = u.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      if (car.position.x > 440 || car.position.x < -440) { u.dir *= -1; car.rotation.y += Math.PI; }
    } else {
      car.position.z += step;
      const near = nearestRoadLine(car.position.z);
      if (near.dist < 2 && Math.random() < 0.012) {
        u.axis = 'x'; u.line = near.line; u.dir = Math.random() < 0.5 ? 1 : -1;
        car.position.z = near.line;
        car.rotation.y = u.dir > 0 ? 0 : Math.PI;
      }
      if (car.position.z > 440 || car.position.z < -440) { u.dir *= -1; car.rotation.y += Math.PI; }
    }
    // respawn far cars near the player so the streets stay busy
    const dx = car.position.x - px, dz = car.position.z - pz;
    if (dx * dx + dz * dz > 500 * 500) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = pick(ROADS);
      const pos = (axis === 'x' ? px : pz) + rand(-120, 120);
      u.axis = axis; u.line = line; u.dir = Math.random() < 0.5 ? 1 : -1;
      if (axis === 'x') { car.position.set(clamp(pos, -440, 440), 0, line); car.rotation.y = u.dir > 0 ? 0 : Math.PI; }
      else { car.position.set(line, 0, clamp(pos, -440, 440)); car.rotation.y = u.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
    // damage smoke
    if (u.health < 55) {
      u.smokeT -= dt;
      if (u.smokeT <= 0) { u.smokeT = 0.25; puffSmoke(car.position.x, 1.4, car.position.z); }
    }
  }
  updateSmoke(dt);
}
