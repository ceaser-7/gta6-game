// Vehicles: car models, driving physics, traffic AI.
import * as THREE from 'three';
import { G, WORLD, CAR_TYPES, clamp, lerp, rand, randi, pick } from './state.js';

export function makeCarMesh(type, opts = {}) {
  const g = new THREE.Group();
  const col = opts.color ?? type.color;
  const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.8 });
  const L = type.len, W = 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.75, L), bodyMat);
  body.position.y = 0.65; body.castShadow = false; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.65, L * 0.5), glassMat);
  cabin.position.set(0, 1.3, -L * 0.05); g.add(cabin);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wheels = [];
  for (const [wx, wz] of [[-W / 2, L * 0.32], [W / 2, L * 0.32], [-W / 2, -L * 0.32], [W / 2, -L * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w); wheels.push(w);
  }
  // Headlights (emissive) + taillights
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe8a0, emissiveIntensity: 1.8 });
  for (const hx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), hlMat);
    hl.position.set(hx, 0.7, L / 2 + 0.02); g.add(hl);
  }
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.2 });
  for (const hx of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), tlMat);
    tl.position.set(hx, 0.7, -L / 2 - 0.02); g.add(tl);
  }
  if (opts.police) {
    // Light bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.75, 0); g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
    r.position.set(-0.3, 1.78, 0); g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2020ff, emissive: 0x2020ff, emissiveIntensity: 2 }));
    b.position.set(0.3, 1.78, 0); g.add(b);
    g.userData.lightBar = [r, b];
  }
  // Damage smoke puff (hidden until damaged)
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.55 }));
  smoke.position.set(0, 1.4, L / 2 - 0.4); smoke.visible = false; g.add(smoke);
  g.userData.smoke = smoke;
  g.userData.wheels = wheels;
  g.userData.type = type;
  return g;
}

// A drivable/traffic car entity.
export function spawnCar(x, z, heading, typeIdx, opts = {}) {
  const type = CAR_TYPES[typeIdx ?? randi(0, CAR_TYPES.length - 1)];
  const mesh = makeCarMesh(type, opts);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    mesh, type, heading, speed: 0, condition: 100,
    traffic: !!opts.traffic, police: !!opts.police,
    targetSpeed: opts.traffic ? rand(8, 14) : 0,
    lane: opts.lane ?? 0, stuck: 0, skid: [],
  };
  return car;
}

function collideCircle(x, z, r) {
  // Building colliders (AABB)
  for (const c of G.world.colliders) {
    if (Math.abs(x - c.x) < c.hx + r && Math.abs(z - c.z) < c.hz + r) return c;
  }
  return null;
}
export function collideAt(x, z, r = 1) { return collideCircle(x, z, r); }

// Keep a position inside the island (beach edge = soft wall, ocean = blocked).
export function clampToIsland(x, z, margin = 6) {
  const r = Math.hypot(x, z), max = WORLD.beachOuter - margin;
  if (r > max) { const s = max / r; return [x * s, z * s]; }
  return [x, z];
}

export function updateTraffic(dt) {
  for (const car of G.traffic) {
    if (!car.traffic) continue;
    // Follow the road grid: drive along current heading, turn at intersections.
    car.speed = lerp(car.speed, car.targetSpeed, dt * 0.8);
    const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
    const hit = collideCircle(nx, nz, 2);
    const [cx, cz] = clampToIsland(nx, nz, 8);
    if (hit || (cx !== nx || cz !== nz)) {
      // Turn at intersection / obstacle: pick a new cardinal heading
      car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      car.stuck = 0;
    } else {
      car.mesh.position.x = nx; car.mesh.position.z = nz;
      // Snap to nearest road lane occasionally
      car.mesh.rotation.y = car.heading;
    }
    // Wheel spin
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2;
  }
}

// Player driving physics. Returns nothing; mutates car + player.
export function driveCar(car, dt, input) {
  const type = car.type;
  const fwd = input.forward ? 1 : 0, back = input.back ? 1 : 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const handbrake = input.handbrake;
  if (fwd) car.speed += type.accel * dt * (handbrake ? 0.5 : 1);
  else if (back) car.speed -= type.accel * 0.8 * dt;
  else car.speed = lerp(car.speed, 0, dt * 1.2);
  if (handbrake) car.speed = lerp(car.speed, 0, dt * 2.2);
  car.speed = clamp(car.speed, -10, type.top);
  // Steering scales with speed; handbrake gives drift
  const steerAmt = steer * (handbrake ? 2.2 : 1.4) * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.heading += steerAmt * dt * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.3 : 1);
  const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(nx, nz, 2);
  const [cx, cz] = clampToIsland(nx, nz, 6);
  if (hit) {
    car.speed *= 0.4;
    car.condition = Math.max(0, car.condition - Math.abs(car.speed) * 0.4);
    if (car.condition < 45) car.mesh.userData.smoke.visible = true;
    // Slide along the wall
    car.mesh.position.x += Math.sin(car.heading) * car.speed * dt * 0.3;
    car.mesh.position.z += Math.cos(car.heading) * car.speed * dt * 0.3;
  } else if (cx !== nx || cz !== nz) {
    car.speed *= 0.5; car.mesh.position.x = cx; car.mesh.position.z = cz;
  } else {
    car.mesh.position.x = nx; car.mesh.position.z = nz;
  }
  car.mesh.rotation.y = car.heading;
  // Skid marks when drifting
  if (handbrake && Math.abs(car.speed) > 8 && Math.abs(steer) > 0) {
    addSkid(car.mesh.position.x, car.mesh.position.z, car.heading);
  }
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2;
  // Headlight glow at night is handled by emissive materials already.
  return car;
}

const skidGeo = new THREE.PlaneGeometry(0.5, 1.6);
const skidMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false });
function addSkid(x, z, heading) {
  if (G.skidmarks.length > 220) {
    const old = G.skidmarks.shift(); G.scene.remove(old);
  }
  const m = new THREE.Mesh(skidGeo, skidMat);
  m.rotation.x = -Math.PI / 2; m.rotation.z = heading;
  m.position.set(x + rand(-0.7, 0.7), 0.06, z + rand(-0.7, 0.7));
  G.scene.add(m); G.skidmarks.push(m);
}

// Spawn the ambient traffic fleet.
export function spawnTraffic() {
  for (let i = 0; i < 32; i++) {
    const gx = randi(-4, 4) * WORLD.block, gz = randi(-4, 4) * WORLD.block;
    const heading = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const car = spawnCar(gx + rand(-4, 4), gz + rand(-4, 4), heading, null, { traffic: true });
    G.traffic.push(car);
  }
}
