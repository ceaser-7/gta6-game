// Porto Verde — wanted system: pursuit, foot officers, roadblocks, lose-the-cops.
import * as THREE from '../vendor/three.module.min.js';
import { G, clamp, dist, rand, choice } from './state.js';
import { spawnCar, removeCar } from './cars.js';
import { collideCircle } from './city.js';
import { removeCop } from './player.js';

export function addWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.losTimer = 0;
  G.ui.updateHud && G.ui.updateHud();
}

function spawnCopCar() {
  const p = G.player;
  const a = rand(Math.PI * 2);
  const x = clamp(p.x + Math.sin(a) * 60, -440, 440);
  const z = clamp(p.z + Math.cos(a) * 60, -440, 440);
  const car = spawnCar('sedan', x, z, 0, { police: true, color: 0x1a2a4a });
  // light bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  bar.position.y = 1.55; car.mesh.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
  bar2.position.set(0.55, 1.55, 0); car.mesh.add(bar2);
  car.police = true;
  G.cops.push({ kind: 'car', car, health: 100 });
  return car;
}

function spawnFootCop() {
  const p = G.player;
  const a = rand(Math.PI * 2);
  const x = clamp(p.x + Math.sin(a) * 25, -440, 440);
  const z = clamp(p.z + Math.cos(a) * 25, -440, 440);
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.45), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
  body.position.y = 1.05; mesh.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8a880 }));
  head.position.y = 1.9; mesh.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x0a1428 }));
  cap.position.y = 2.1; mesh.add(cap);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = { kind: 'foot', mesh, x, z, yaw: 0, health: 100 };
  G.cops.push(cop);
  return cop;
}

function spawnRoadblock() {
  const p = G.player;
  const a = rand(Math.PI * 2);
  const x = clamp(p.x + Math.sin(a) * 45, -430, 430);
  const z = clamp(p.z + Math.cos(a) * 45, -430, 430);
  const car1 = spawnCar('sedan', x - 4, z, Math.PI / 2, { police: true, color: 0x1a2a4a });
  const car2 = spawnCar('sedan', x + 4, z, Math.PI / 2, { police: true, color: 0x1a2a4a });
  const block = { cars: [car1, car2], x, z, t: 30 };
  G.roadblocks.push(block);
  G.ui.toast && G.ui.toast('Roadblock ahead!');
  return block;
}

export function updatePolice(dt) {
  const p = G.player;
  if (G.wanted <= 0) {
    // clear cops gradually
    if (G.cops.length > 0 && Math.random() < dt * 0.5) {
      const c = G.cops.pop();
      if (c.kind === 'car') removeCar(c.car); else G.scene.remove(c.mesh);
    }
    if (G.roadblocks.length > 0 && Math.random() < dt * 0.5) {
      const b = G.roadblocks.pop();
      for (const car of b.cars) removeCar(car);
    }
    return;
  }
  // spawn to match wanted level
  const wantCars = G.wanted >= 2 ? Math.min(3, G.wanted - 1) : 0;
  const wantFoot = G.wanted >= 1 ? Math.min(4, G.wanted + 1) : 0;
  const cars = G.cops.filter(c => c.kind === 'car').length;
  const feet = G.cops.filter(c => c.kind === 'foot').length;
  if (cars < wantCars && Math.random() < dt * 0.8) spawnCopCar();
  if (feet < wantFoot && Math.random() < dt * 0.8) spawnFootCop();
  if (G.wanted >= 3 && G.roadblocks.length < 1 && Math.random() < dt * 0.15) spawnRoadblock();
  // line of sight: any cop within 45m and roughly facing the player
  let seen = false;
  for (const c of G.cops) {
    const cx = c.kind === 'car' ? c.car.x : c.x;
    const cz = c.kind === 'car' ? c.car.z : c.z;
    const d = dist(cx, cz, p.x, p.z);
    if (d < 45) { seen = true; break; }
  }
  if (seen) G.losTimer = 0;
  else {
    G.losTimer += dt;
    if (G.losTimer > 10) { G.wanted = Math.max(0, G.wanted - 1); G.losTimer = 0; G.ui.updateHud && G.ui.updateHud(); }
  }
  // pursuit behaviour
  for (const c of [...G.cops]) {
    if (c.kind === 'car') {
      const car = c.car;
      const dx = p.x - car.x, dz = p.z - car.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dd = want - car.yaw;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      car.yaw += clamp(dd, -2.2 * dt, 2.2 * dt);
      const targetSpeed = d > 8 ? 24 : 10;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
      const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
      const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
      const res = collideCircle(nx, nz, 1.6);
      car.x = res.x; car.z = res.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.yaw;
      // ram the player
      if (d < 3.2) {
        if (p.onFoot) { p.health -= 12 * dt * 10; hurtPlayer(); }
        else { car.speed *= 0.5; if (p.car) p.car.health -= 8 * dt * 10; }
      }
      if (car.health <= 0) { removeCar(car); const i = G.cops.indexOf(c); if (i >= 0) G.cops.splice(i, 1); }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d > 2.2) {
        const want = Math.atan2(dx, dz);
        c.yaw = want;
        const sp = 5.2;
        const nx = c.x + Math.sin(want) * sp * dt, nz = c.z + Math.cos(want) * sp * dt;
        const res = collideCircle(nx, nz, 0.6);
        c.x = res.x; c.z = res.z;
      } else if (p.onFoot) {
        // bust!
        p.health -= 20 * dt;
        hurtPlayer();
        if (p.health <= 0) { /* wasted handled by main loop */ }
      }
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.yaw;
    }
  }
  for (const b of [...G.roadblocks]) {
    b.t -= dt;
    if (b.t <= 0) {
      for (const car of b.cars) removeCar(car);
      const i = G.roadblocks.indexOf(b); if (i >= 0) G.roadblocks.splice(i, 1);
    }
  }
}

export function hurtPlayer() {
  G.ui.updateHud && G.ui.updateHud();
  if (G.player.health <= 0 && !G.over) {
    G.over = true;
    G.ui.wasted && G.ui.wasted();
  }
}

export function clearWanted() {
  G.wanted = 0; G.losTimer = 0;
  for (const c of [...G.cops]) { if (c.kind === 'car') removeCar(c.car); else G.scene.remove(c.mesh); }
  G.cops.length = 0;
  for (const b of [...G.roadblocks]) for (const car of b.cars) removeCar(car);
  G.roadblocks.length = 0;
  G.ui.updateHud && G.ui.updateHud();
}
