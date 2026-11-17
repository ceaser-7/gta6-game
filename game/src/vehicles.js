// Cars: their look, their arcade driving, and getting in and out of them.
// One clear job: build car meshes, drive the player's car, and handle stealing.
import * as THREE from 'three';
import { collideCircle } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6db8, 0xe0b02e, 0xd8d8d8, 0x4a4f55, 0x3f8a4a, 0x7a4a9e, 0x2e8a8a];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x14161a : color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.2), bodyMat);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), glassMat);
  cabin.position.set(0, 1.12, -0.25); g.add(cabin);
  if (isPolice) {
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 2.2), doorMat);
      door.position.set(s * 1.01, 0.62, 0.1); g.add(door);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.45, -0.25); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    red.position.set(-0.32, 1.52, -0.25); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 }));
    blue.position.set(0.32, 1.52, -0.25); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe98a, emissiveIntensity: 0.7 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), headMat);
    h.position.set(s * 0.62, 0.62, 2.12); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x881111, emissiveIntensity: 0.6 }));
    t.position.set(s * 0.62, 0.62, -2.12); g.add(t);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 1.9, 1); shadow.position.y = 0.02;
  g.add(shadow);
  g.userData.wheels = wheels;
  return g;
}

export function createCar(G, x, z, angle, color, opts = {}) {
  const group = makeCarMesh(color, !!opts.isPolice);
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  G.scene.add(group);
  const car = {
    group, pos: group.position, angle, speed: 0, steer: 0,
    color, isPolice: !!opts.isPolice, isTraffic: !!opts.isTraffic,
    driver: opts.driver || null, health: 100, missionCar: !!opts.missionCar,
    maxSpeed: opts.maxSpeed || 30, accel: opts.accel || 16,
    targetSpeed: 0, stuck: 0,
  };
  G.cars.push(car);
  return car;
}

export function carForward(car) {
  return { x: Math.sin(car.angle), z: Math.cos(car.angle) };
}

export function nearestCar(G, x, z, maxDist) {
  let best = null, bd = maxDist;
  for (const c of G.cars) {
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function updatePlayerCar(G, dt) {
  const car = G.player.car;
  if (!car) return;
  const k = G.input.keys;
  const fwd = k.has('KeyW') || k.has('ArrowUp');
  const back = k.has('KeyS') || k.has('ArrowDown');
  const left = k.has('KeyA') || k.has('ArrowLeft');
  const right = k.has('KeyD') || k.has('ArrowRight');
  const brake = k.has('Space');
  if (fwd) car.speed += car.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? 30 : 12) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  if (brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.steer = (left ? 1 : 0) + (right ? -1 : 0);
    car.angle += car.steer * 1.9 * dt * Math.sign(car.speed || 1);
  } else {
    const steerTarget = (left ? 1 : 0) + (right ? -1 : 0);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    const grip = Math.min(1, Math.abs(car.speed) / 8);
    car.angle += car.steer * 1.15 * grip * dt * Math.sign(car.speed || 1);
  }
  car.speed = Math.max(-9, Math.min(car.maxSpeed, car.speed));
  stepCar(G, car, dt, true);
  // camera yaw follows the car gently when driving
  let d = car.angle - G.camYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(car.speed) > 4) G.camYaw += d * Math.min(1, dt * 1.4);
  // engine note
  G.audio.engine(Math.abs(car.speed) / car.maxSpeed);
}

export function stepCar(G, car, dt, isPlayer) {
  const before = car.speed;
  const f = carForward(car);
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  const px = car.pos.x, pz = car.pos.z;
  collideCircle(G.city, car.pos, 1.7);
  if ((car.pos.x !== px || car.pos.z !== pz) && Math.abs(before) > 6) {
    car.speed *= 0.45;
    car.health -= 2;
    if (isPlayer) { G.audio.thud(); G.hud.flash(); }
  }
  // car vs car: simple circle push
  for (const o of G.cars) {
    if (o === car) continue;
    const dx = car.pos.x - o.pos.x, dz = car.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const nx = dx / d, nz = dz / d;
      car.pos.x += nx * push; car.pos.z += nz * push;
      o.pos.x -= nx * push; o.pos.z -= nz * push;
      const rel = Math.abs(car.speed - o.speed);
      if (rel > 8 && isPlayer) { o.health -= 6; G.audio.thud(); }
      car.speed *= 0.92;
    }
  }
  car.group.rotation.y = car.angle;
  // wheels spin + front wheels steer
  const spin = car.speed * dt * 1.6;
  const wheels = car.group.userData.wheels;
  for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x += spin;
    if (i < 2) wheels[i].rotation.y = car.steer * 0.4;
  }
}

export function tryEnterCar(G) {
  const p = G.player;
  const car = nearestCar(G, p.pos.x, p.pos.z, 3.6);
  if (!car) { G.hud.toast('No car close enough'); return; }
  if (car.isPolice && G.wanted < 2) G.addWanted(2, 'Stole a police cruiser!');
  if (car.isTraffic && car.driver === 'traffic') {
    car.driver = null;
    G.spawnFleeingPed(car.pos.x + 1.5, car.pos.z + 1.5);
    G.addWanted(1, 'Car stolen — the owner called it in!');
  }
  p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
  p.group.visible = false;
  G.audio.door();
  G.hud.toast(car.missionCar ? 'This is the one. Drive!' : 'In the car. Drive!');
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const side = Math.cos(car.angle) * 2.4;
  const sideZ = -Math.sin(car.angle) * 2.4;
  p.pos.set(car.pos.x + side, 0, car.pos.z + sideZ);
  collideCircle(G.city, p.pos, 0.6);
  p.car = null; p.onFoot = true; p.yaw = car.angle;
  car.driver = null; car.speed = Math.min(car.speed, 2);
  p.group.visible = true;
  p.group.position.copy(p.pos);
  G.audio.door();
}

export function randomTrafficColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}
