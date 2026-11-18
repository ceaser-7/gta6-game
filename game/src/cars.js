// Porto Verde — cars: 5 types, arcade driving, damage smoke, horn.
import * as THREE from '../vendor/three.module.min.js';
import { G, clamp, rand, choice } from './state.js';
import { collideCircle } from './city.js';

export const CAR_TYPES = {
  sedan: { len: 4.4, wid: 1.9, h: 1.35, top: 26, accel: 14, col: 0x7a8a9a },
  sports: { len: 4.2, wid: 1.9, h: 1.1, top: 36, accel: 20, col: 0xb03030 },
  suv: { len: 4.8, wid: 2.0, h: 1.7, top: 24, accel: 12, col: 0x3a4a3a },
  van: { len: 5.2, wid: 2.1, h: 2.1, top: 20, accel: 9, col: 0x8a6a3a },
  taxi: { len: 4.4, wid: 1.9, h: 1.35, top: 27, accel: 15, col: 0xd8b83a },
};

export function makeCarMesh(type, color) {
  const t = CAR_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: color ?? t.col });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, t.h * 0.55, t.len), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabinH = type === 'van' ? t.h * 0.55 : t.h * 0.45;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.85, cabinH, t.len * (type === 'van' ? 0.9 : 0.5)), type === 'van' ? bodyMat : darkMat);
  cabin.position.set(0, t.h * 0.55 + cabinH / 2, type === 'van' ? 0 : -t.len * 0.08); g.add(cabin);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [wx, wz] of [[-t.wid / 2, t.len * 0.32], [t.wid / 2, t.len * 0.32], [-t.wid / 2, -t.len * 0.32], [t.wid / 2, -t.len * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w);
  }
  // headlights + taillights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  hl.position.set(-t.wid * 0.3, 0.62, t.len / 2 + 0.02); g.add(hl);
  const hl2 = hl.clone(); hl2.position.x = t.wid * 0.3; g.add(hl2);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  tl.position.set(-t.wid * 0.3, 0.62, -t.len / 2 - 0.02); g.add(tl);
  const tl2 = tl.clone(); tl2.position.x = t.wid * 0.3; g.add(tl2);
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, t.h + 0.35, 0); g.add(sign);
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.9, 0.08, 0.5), darkMat);
    spoiler.position.set(0, t.h * 0.75, -t.len / 2 + 0.2); g.add(spoiler);
  }
  return g;
}

export function spawnCar(type, x, z, yaw, opts = {}) {
  const mesh = makeCarMesh(type, opts.color);
  mesh.position.set(x, 0, z); mesh.rotation.y = yaw;
  G.scene.add(mesh);
  const car = {
    type, mesh, x, z, yaw, speed: 0, health: 100, smoke: null,
    parked: !!opts.parked, mission: !!opts.mission, police: !!opts.police,
    driver: opts.driver ?? null, target: null, waitT: 0, stolen: false,
    skid: [],
  };
  G.cars.push(car);
  return car;
}

export function removeCar(car) {
  G.scene.remove(car.mesh);
  const i = G.cars.indexOf(car); if (i >= 0) G.cars.splice(i, 1);
  if (car.smoke) { G.scene.remove(car.smoke); car.smoke = null; }
}

// Arcade driving for the player's car. input: {fwd, back, left, right, handbrake}
export function driveCar(car, input, dt) {
  const t = CAR_TYPES[car.type];
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  if (input.fwd) car.speed += t.accel * dt;
  if (input.back) car.speed -= t.accel * 0.8 * dt;
  if (!input.fwd && !input.back) car.speed *= Math.max(0, 1 - 1.4 * dt);
  if (input.handbrake) car.speed *= Math.max(0, 1 - 4 * dt);
  car.speed = clamp(car.speed, -10, t.top);
  const turn = steer * clamp(Math.abs(car.speed) / 8, 0, 1) * 1.9 * dt * dir;
  car.yaw += turn;
  const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
  const res = collideCircle(nx, nz, 1.6);
  if (res.x !== nx || res.z !== nz) {
    car.speed *= 0.4;
    if (Math.abs(car.speed) > 6) damageCar(car, 4);
  }
  car.x = res.x; car.z = res.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  // body roll + pitch
  car.mesh.rotation.z = -steer * 0.03 * clamp(Math.abs(car.speed) / 10, 0, 1);
  car.mesh.rotation.x = clamp(-car.speed * 0.0015, -0.03, 0.03);
  if (car.health < 45 && !car.smoke) {
    car.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x666666, transparent: true, opacity: 0.55 }));
    car.smoke.scale.set(2.5, 2.5, 1); car.smoke.position.y = 2; car.mesh.add(car.smoke);
  }
  if (car.smoke) car.smoke.material.opacity = 0.35 + Math.random() * 0.3;
  return car.speed;
}

export function damageCar(car, n) {
  car.health = Math.max(0, car.health - n);
  return car.health;
}

export function nearestCar(x, z, maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of G.cars) {
    const dx = c.x - x, dz = c.z - z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = c; }
  }
  return best;
}
