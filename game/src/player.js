// Porto Verde — the player: on foot, driving, camera, combat.
import * as THREE from '../vendor/three.module.min.js';
import { G, clamp, lerp } from './state.js';
import { collideCircle } from './city.js';
import { driveCar, nearestCar, damageCar } from './cars.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.45), new THREE.MeshLambertMaterial({ color: 0x8a2f2f }));
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8a880 }));
  head.position.y = 1.9; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.98; hair.scale.set(1, 0.7, 1); g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.28), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  legL.position.set(-0.19, 0.31, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.19; g.add(legR);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), new THREE.MeshLambertMaterial({ color: 0x8a2f2f }));
  armR.position.set(0.5, 1.35, 0.1); g.add(armR);
  g.userData = { legL, legR, armR };
  G.playerMesh = g;
  G.scene.add(g);
  return g;
}

export function updatePlayer(dt, input) {
  const p = G.player;
  if (!p.onFoot) {
    // driving
    const speed = driveCar(p.car, input, dt);
    p.speed = speed;
    p.x = p.car.x; p.z = p.car.z; p.yaw = p.car.yaw;
    if (G.playerMesh) G.playerMesh.visible = false;
    return;
  }
  if (G.playerMesh) G.playerMesh.visible = !G.hidePlayer;
  const run = input.run ? 8.5 : 4.6;
  const fwd = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let mx = (sin * fwd + cos * strafe) * run;
  let mz = (cos * fwd - sin * strafe) * run;
  const len = Math.hypot(mx, mz);
  if (len > run) { mx = mx / len * run; mz = mz / len * run; }
  const bounds = G.interior ? G.interior.bounds : null;
  const res = collideCircle(p.x + mx * dt, p.z + mz * dt, 0.7, bounds);
  p.x = res.x; p.z = res.z;
  // face movement direction
  if (len > 0.5) {
    const want = Math.atan2(mx, mz);
    let d = want - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += clamp(d, -8 * dt, 8 * dt);
  }
  p.speed = len;
  if (G.playerMesh) {
    G.playerMesh.position.set(p.x, 0, p.z);
    G.playerMesh.rotation.y = p.yaw;
    const t = G.time * (len > 0.5 ? 9 : 0);
    G.playerMesh.userData.legL.rotation.x = Math.sin(t) * 0.55;
    G.playerMesh.userData.legR.rotation.x = -Math.sin(t) * 0.55;
  }
}

// Third-person camera: chase behind the player/car, clamped inside rooms.
export function updateCamera(dt) {
  const p = G.player;
  const cam = G.camera;
  const inRoom = !!G.interior;
  const dist = p.onFoot ? (inRoom ? 3.2 : 6.5) : 9.5;
  const height = p.onFoot ? (inRoom ? 2.0 : 2.8) : 3.6;
  const cy = p.yaw + Math.PI; // behind
  const tx = p.x + Math.sin(cy) * dist;
  const tz = p.z + Math.cos(cy) * dist;
  const ty = height;
  if (!G.camPos) G.camPos = { x: tx, y: ty, z: tz };
  const k = Math.min(1, dt * 6);
  G.camPos.x = lerp(G.camPos.x, tx, k);
  G.camPos.y = lerp(G.camPos.y, ty, k);
  G.camPos.z = lerp(G.camPos.z, tz, k);
  if (inRoom) {
    const b = G.interior.bounds;
    G.camPos.x = clamp(G.camPos.x, b.x0 + 0.6, b.x1 - 0.6);
    G.camPos.z = clamp(G.camPos.z, b.z0 + 0.6, b.z1 - 0.6);
    G.camPos.y = Math.min(G.camPos.y, 3.4);
  }
  cam.position.set(G.camPos.x, G.camPos.y, G.camPos.z);
  cam.lookAt(p.x, p.onFoot ? 1.6 : 1.2, p.z);
  // speed FOV kick while driving
  const targetFov = p.onFoot ? 62 : 62 + clamp(Math.abs(p.speed) / 36, 0, 1) * 10;
  if (Math.abs(cam.fov - targetFov) > 0.1) {
    cam.fov = lerp(cam.fov, targetFov, Math.min(1, dt * 4));
    cam.updateProjectionMatrix();
  }
}

export function snapCamera() {
  const p = G.player;
  const dist = p.onFoot ? 6.5 : 9.5;
  const cy = p.yaw + Math.PI;
  G.camPos = { x: p.x + Math.sin(cy) * dist, y: p.onFoot ? 2.8 : 3.6, z: p.z + Math.cos(cy) * dist };
}

export function enterCar(car) {
  const p = G.player;
  p.onFoot = false; p.car = car; car.stolen = true; car.parked = false;
  if (car.driver) car.driver = null;
  p.x = car.x; p.z = car.z; p.yaw = car.yaw;
  G.ui.toast && G.ui.toast('In the car — drive with WASD');
}

export function exitCar() {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  const bx = car.x + Math.cos(car.yaw) * 2.2, bz = car.z - Math.sin(car.yaw) * 2.2;
  const res = collideCircle(bx, bz, 0.7);
  p.x = res.x; p.z = res.z; p.yaw = car.yaw;
  p.onFoot = true; p.car = null;
  snapCamera();
}

export function shoot() {
  const p = G.player;
  if (p.ammo <= 0) { G.ui.toast && G.ui.toast('Magazine empty — R to reload'); return; }
  p.ammo--; G.stats.shots++;
  // muzzle flash
  if (G.muzzle) { G.muzzle.position.set(p.x, 1.5, p.z); G.muzzle.visible = true; setTimeout(() => { if (G.muzzle) G.muzzle.visible = false; }, 60); }
  // hit the nearest ped / cop in a forward cone
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let best = null, bd = 60;
  const tryHit = (list, isCop) => {
    for (const e of list) {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.5 || d > 55) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.92) continue;
      if (d < bd) { bd = d; best = { e, isCop }; }
    }
  };
  tryHit(G.peds, false); tryHit(G.cops, true);
  if (best) {
    if (best.isCop) { best.e.health -= 34; if (best.e.health <= 0) removeCop(best.e); }
    else { best.e.fleeing = true; }
    G.wanted = Math.min(5, G.wanted + 1);
  }
  G.ui.updateHud && G.ui.updateHud();
}

export function punch() {
  const p = G.player;
  G.stats.punches++;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  for (const ped of G.peds) {
    const dx = ped.x - p.x, dz = ped.z - p.z, d = Math.hypot(dx, dz);
    if (d < 2.2 && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.5) {
      ped.fleeing = true;
      ped.x += fx * 1.5; ped.z += fz * 1.5;
      G.wanted = Math.min(5, G.wanted + 1);
      G.ui.toast && G.ui.toast(`${ped.name}: "Hey! Watch it!"`);
      break;
    }
  }
  G.ui.updateHud && G.ui.updateHud();
}

export function removeCop(cop) {
  G.scene.remove(cop.mesh);
  const i = G.cops.indexOf(cop); if (i >= 0) G.cops.splice(i, 1);
}
