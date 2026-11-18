// Porto Verde — cars: five types, traffic on the road grid, police pursuit,
// roadblocks, damage smoke, brake lights, skid marks. All original models.
import * as THREE from 'three';
import { G, CFG, ROADS, rng, rand, randi, pick, clamp, lerp, dist2 } from './state.js';

const PAINTS = [0x7a2e2e, 0x2e4a7a, 0x3a5a3a, 0x8a7a2e, 0x5a4a6b, 0x6b6b6b, 0x2e6b6b, 0x9a9a9a, 0x4a2e1a, 0x1a1a1a];
const GLASS_MAT = new THREE.MeshPhongMaterial({ color: 0x1a2733, shininess: 120, specular: 0x88aacc });
const TYRE_MAT = new THREE.MeshLambertMaterial({ color: 0x141414 });
const HUB_MAT = new THREE.MeshPhongMaterial({ color: 0xb8bcc0, shininess: 90 });
const LIGHT_MAT = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
const TAIL_MAT = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xaa0000, emissiveIntensity: 0.5 });

export function makeCar(type, colorHex) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 70, specular: 0x555555 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x222222 });
  let len = 4.4, wid = 1.9, bodyH = 0.75, cabH = 0.62, cabL = 2.2, cabZ = -0.2;
  if (type === 'sports') { len = 4.5; wid = 1.95; bodyH = 0.62; cabH = 0.5; cabL = 1.9; cabZ = -0.3; }
  if (type === 'suv') { len = 4.7; wid = 2.0; bodyH = 0.95; cabH = 0.8; cabL = 2.6; cabZ = -0.1; }
  if (type === 'van') { len = 5.2; wid = 2.05; bodyH = 1.35; cabH = 1.1; cabL = 3.4; cabZ = 0.2; }
  if (type === 'taxi') { len = 4.4; wid = 1.9; bodyH = 0.75; cabH = 0.62; cabL = 2.2; cabZ = -0.2; }
  // lower body
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, bodyH, wid), paint);
  body.position.y = 0.55 + bodyH / 2 - 0.35; body.castShadow = true; g.add(body);
  // sloped hood and deck (wedges via rotated boxes)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, wid - 0.15), paint);
  hood.position.set(len / 2 - 0.55, 0.55 + bodyH - 0.28, 0); hood.rotation.z = -0.16; g.add(hood);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, wid - 0.15), paint);
  deck.position.set(-len / 2 + 0.45, 0.55 + bodyH - 0.28, 0); deck.rotation.z = 0.14; g.add(deck);
  // cabin + side glass
  const cab = new THREE.Mesh(new THREE.BoxGeometry(cabL, cabH, wid - 0.25), GLASS_MAT);
  cab.position.set(cabZ, 0.55 + bodyH + cabH / 2 - 0.12, 0); cab.castShadow = true; g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(cabL * 0.9, 0.08, wid - 0.3), paint);
  roof.position.set(cabZ, 0.55 + bodyH + cabH - 0.08, 0); g.add(roof);
  // grille + bumpers
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, wid * 0.6), trim);
  grille.position.set(len / 2 + 0.02, 0.55, 0); g.add(grille);
  for (const s of [1, -1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, wid + 0.05), trim);
    bumper.position.set(s * (len / 2 + 0.05), 0.42, 0); g.add(bumper);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(len * 0.7, 0.14, 0.06), trim);
    skirt.position.set(0, 0.32, s * (wid / 2)); g.add(skirt);
  }
  // headlights + taillights
  for (const s of [1, -1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.42), LIGHT_MAT);
    hl.position.set(len / 2 + 0.03, 0.72, s * (wid / 2 - 0.3)); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.4), TAIL_MAT.clone());
    tl.position.set(-len / 2 - 0.03, 0.72, s * (wid / 2 - 0.3)); g.add(tl);
    if (!g.userData.tails) g.userData.tails = [];
    g.userData.tails.push(tl);
    // mirrors
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), trim);
    mir.position.set(cabZ + cabL / 2 - 0.2, 0.55 + bodyH + 0.15, s * (wid / 2 + 0.05)); g.add(mir);
  }
  // wheels with hubcaps
  const wheels = [];
  for (const [wx, wz] of [[len / 2 - 0.95, wid / 2 - 0.08], [len / 2 - 0.95, -wid / 2 + 0.08], [-len / 2 + 0.95, wid / 2 - 0.08], [-len / 2 + 0.95, -wid / 2 + 0.08]]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), TYRE_MAT);
    tyre.rotation.x = Math.PI / 2; wheel.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10), HUB_MAT);
    hub.rotation.x = Math.PI / 2; wheel.add(hub);
    wheel.position.set(wx, 0.38, wz); g.add(wheel); wheels.push(wheel);
  }
  if (type === 'sports') { // spoiler
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, wid * 0.85), trim);
    sp.position.set(-len / 2 + 0.15, 0.55 + bodyH + 0.28, 0); g.add(sp);
    for (const s of [1, -1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), trim);
      strut.position.set(-len / 2 + 0.15, 0.55 + bodyH + 0.12, s * (wid / 2 - 0.35)); g.add(strut);
    }
  }
  if (type === 'taxi') { // roof sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0xa8842a, emissiveIntensity: 0.5 }));
    sign.position.set(cabZ, 0.55 + bodyH + cabH + 0.1, 0); g.add(sign);
    g.traverse((o) => { if (o.material === paint) o.material = new THREE.MeshPhongMaterial({ color: 0xd8b93a, shininess: 70, specular: 0x555555 }); });
  }
  if (type === 'police') {
    g.traverse((o) => { if (o.material === paint) o.material = new THREE.MeshPhongMaterial({ color: 0x1c1c22, shininess: 70 }); });
    const band = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.3, wid + 0.02),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    band.position.set(0, 0.85, 0); g.add(band);
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 1.5 }));
    r.position.x = -0.25; bar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x0033cc, emissive: 0x0044ff, emissiveIntensity: 1.5 }));
    b.position.x = 0.25; bar.add(b);
    bar.position.set(cabZ, 0.55 + bodyH + cabH + 0.05, 0); g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData = { ...g.userData, type, wheels, len, wid, speed: 0, heading: 0, health: 100, smoke: null };
  return g;
}

// A smoke puff sprite for a damaged car (created lazily).
function ensureSmoke(car) {
  if (car.userData.smoke) return car.userData.smoke;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(120,120,120,0.85)'); grad.addColorStop(1, 'rgba(120,120,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.2, 2.2, 1); sp.position.set(-0.5, 1.6, 0);
  car.add(sp); car.userData.smoke = sp; return sp;
}

// --- traffic ---
export function spawnTraffic() {
  const types = ['sedan', 'sedan', 'sports', 'suv', 'van', 'taxi', 'sedan', 'suv'];
  for (let i = 0; i < CFG.TRAFFIC_N; i++) {
    const type = pick(types);
    const car = makeCar(type, pick(PAINTS));
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = pick(ROADS);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = rand(-400, 400);
    placeOnRoad(car, axis, road, dir, along);
    car.userData.traffic = { axis, road, dir, speed: rand(8, 13), targetSpeed: rand(8, 13) };
    G.scene.add(car); G.traffic.push(car); G.cars.push(car);
  }
  // parked cars along road edges
  for (let i = 0; i < 16; i++) {
    const car = makeCar(pick(['sedan', 'suv', 'van']), pick(PAINTS));
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = pick(ROADS);
    const along = rand(-400, 400);
    const side = rng() < 0.5 ? 1 : -1;
    placeOnRoad(car, axis, road, side, along, side * 5.2);
    car.userData.parked = true;
    G.scene.add(car); G.parked.push(car); G.cars.push(car);
  }
}

function placeOnRoad(car, axis, road, dir, along, lateral) {
  const off = lateral !== undefined ? lateral : (dir > 0 ? 2.2 : -2.2);
  if (axis === 'x') {
    car.position.set(along, 0, road + off);
    car.rotation.y = dir > 0 ? 0 : Math.PI;
  } else {
    car.position.set(road + (dir > 0 ? -2.2 : 2.2), 0, along);
    car.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  car.userData.heading = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
}

function roadCoord(v) { // nearest road centreline to v
  let best = ROADS[0], bd = 1e9;
  for (const r of ROADS) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = r; } }
  return best;
}

export function updateTraffic(dt) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (const car of G.traffic) {
    const t = car.userData.traffic;
    // car ahead on the same road+direction: slow down
    let want = t.targetSpeed;
    for (const other of G.traffic) {
      if (other === car) continue;
      const o = other.userData.traffic;
      if (o.axis !== t.axis || o.road !== t.road || o.dir !== t.dir) continue;
      const ahead = t.axis === 'x' ? (other.position.x - car.position.x) * t.dir : (other.position.z - car.position.z) * t.dir;
      if (ahead > 0 && ahead < 13) { want = Math.min(want, Math.max(0, (ahead - 7) * 0.8)); break; }
    }
    t.speed = lerp(t.speed, want, Math.min(1, dt * 1.5));
    const step = t.speed * dt * t.dir;
    if (t.axis === 'x') car.position.x += step; else car.position.z += step;
    // reached an intersection: maybe turn
    const along = t.axis === 'x' ? car.position.x : car.position.z;
    const nearest = roadCoord(t.axis === 'x' ? car.position.z : car.position.x);
    const cross = t.axis === 'x' ? car.position.z : car.position.x;
    if (Math.abs(cross - nearest) < 2 && rng() < dt * 0.12) {
      const turn = rng();
      if (turn < 0.3) { // turn onto the crossing road
        const newAxis = t.axis === 'x' ? 'z' : 'x';
        const newDir = rng() < 0.5 ? 1 : -1;
        const newRoad = roadCoord(t.axis === 'x' ? car.position.x : car.position.z);
        t.axis = newAxis; t.road = newRoad; t.dir = newDir;
        placeOnRoad(car, newAxis, newRoad, newDir, along);
      }
    }
    // out of the city or too far from the player: respawn near the player
    if (Math.abs(car.position.x) > 430 || Math.abs(car.position.z) > 430 || dist2(car.position.x, car.position.z, px, pz) > 300) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const road = roadCoord(axis === 'x' ? pz : px) + pick([-65, 0, 65]);
      const dir = rng() < 0.5 ? 1 : -1;
      const along = (axis === 'x' ? px : pz) + rand(-120, 120);
      placeOnRoad(car, axis, clamp(road, -390, 390), dir, clamp(along, -400, 400));
      t.axis = axis; t.road = clamp(road, -390, 390); t.dir = dir; t.speed = rand(8, 13);
    }
    // wheels spin
    const spin = t.speed * dt * 2.4;
    for (const w of car.userData.wheels) w.rotation.z += spin * (t.axis === 'x' ? t.dir : t.dir);
  }
}

// --- police ---
export function spawnPoliceCar(nearX, nearZ) {
  const car = makeCar('police', 0x1c1c22);
  const a = rand(0, Math.PI * 2);
  car.position.set(nearX + Math.cos(a) * 40, 0, nearZ + Math.sin(a) * 40);
  car.userData.police = { speed: 0, targetSpeed: 24 };
  G.scene.add(car); G.police.push(car); G.cars.push(car);
  return car;
}

export function updatePolice(dt) {
  const p = G.player;
  for (const car of G.police) {
    const t = car.userData.police;
    const dx = p.pos.x - car.position.x, dz = p.pos.z - car.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dz, dx);
    let dh = wantHeading - car.userData.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.userData.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    t.speed = lerp(t.speed, t.targetSpeed, Math.min(1, dt));
    car.position.x += Math.cos(car.userData.heading) * t.speed * dt;
    car.position.z += Math.sin(car.userData.heading) * t.speed * dt;
    car.rotation.y = -car.userData.heading;
    // flash the light bar
    if (car.userData.lightBar) {
      const on = Math.floor(G.time * 6) % 2 === 0;
      car.userData.lightBar.children[0].material.emissiveIntensity = on ? 2.2 : 0.2;
      car.userData.lightBar.children[1].material.emissiveIntensity = on ? 0.2 : 2.2;
    }
    // ramming the player's car slows it
    if (p.car && d < 4.5) {
      p.car.userData.speed *= 0.94;
      car.userData.health -= 0.2;
    }
    if (car.userData.health < 40) {
      const sp = ensureSmoke(car);
      sp.material.opacity = clamp((40 - car.userData.health) / 40, 0.15, 0.8);
      sp.position.y = 1.6 + Math.sin(G.time * 5) * 0.3;
    }
  }
  // despawn far police when wanted is 0
  if (G.wanted === 0) {
    for (let i = G.police.length - 1; i >= 0; i--) {
      const car = G.police[i];
      if (dist2(car.position.x, car.position.z, p.pos.x, p.pos.z) > 240) {
        G.scene.remove(car);
        G.police.splice(i, 1);
        const ci = G.cars.indexOf(car); if (ci >= 0) G.cars.splice(ci, 1);
      }
    }
  }
}

// Find the nearest drivable car to a point (for E to enter).
export function nearestCar(x, z, maxD) {
  let best = null, bd = maxD;
  for (const car of G.cars) {
    if (car.userData.traffic && car.userData.traffic.speed > 2) continue; // don't grab a moving car
    if (car.userData.police) continue;
    const d = dist2(x, z, car.position.x, car.position.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
