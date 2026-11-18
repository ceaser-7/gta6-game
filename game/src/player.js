// Porto Verde — Mara on foot and behind the wheel: movement, chase camera,
// driving, combat, and the wanted system (pursuit, officers, roadblocks,
// lose-the-cops, bust/wasted). All original.
import * as THREE from 'three';
import { G, clamp, lerp, rand, collideCircle, dist2, angDiff, saveGame } from './util.js';
import { losBlocked } from './city.js';
import { makeCar, makePoliceCar, puffSmoke } from './vehicles.js';
import { fleeFrom } from './peds.js';
import { showWasted, hideWasted, toast } from './hud.js';

let policeCars = [];
let officers = [];
let roadblock = [];
let loseT = 0;
let losCheckT = 0;
let flashT = 0;
let flashLight = null;
let flashMesh = null;
const skidMarks = [];
let snapCam = false;

export function snapCamera() { snapCam = true; }

export function makePlayer() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6b6b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.85, 8), jacket);
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.75, 8), pants);
  legs.position.y = 0.38; g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.62; g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.y = 1.66; g.add(hairM);
  // pistol in hand
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0x1c1e22 }));
  gun.position.set(0.3, 1.0, 0.15); g.add(gun);
  g.position.set(G.spawn.x, 0, G.spawn.z);
  G.scene.add(g);
  G.player = g;
  flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
  G.scene.add(flashMesh);
  flashLight = new THREE.PointLight(0xffe9a0, 0, 12);
  G.scene.add(flashLight);
  return g;
}

export function nearestCar(maxDist) {
  if (!G.player) return null;
  const px = G.player.position.x, pz = G.player.position.z;
  let best = null, bd = maxDist;
  for (const car of G.cars) {
    if (car.userData.type === 'police') continue;
    const d = dist2(px, pz, car.position.x, car.position.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(car) {
  if (!car || G.playerCar) return;
  G.playerCar = car;
  car.userData.speed = 0;
  G.player.visible = false;
  if (car.userData.type !== 'police' && G.wanted === 0 && car.userData.stolen !== true) {
    // Stealing a traffic car raises heat.
    car.userData.stolen = true;
    if (Math.random() < 0.7) raiseWanted(1);
  }
  snapCam = true;
}

export function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  G.playerCar = null;
  const side = { x: car.position.x + Math.cos(car.rotation.y + Math.PI / 2) * 2.5, z: car.position.z - Math.sin(car.rotation.y + Math.PI / 2) * 2.5 };
  const probe = { x: side.x, z: side.z };
  collideCircle(probe, 0.6);
  G.player.position.set(probe.x, 0, probe.z);
  G.player.visible = true;
  G.yaw = car.rotation.y + Math.PI / 2;
  snapCam = true;
}

export function raiseWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  loseT = 0;
}

function shoot() {
  if (G.ammo <= 0) return;
  G.ammo--;
  const origin = G.player.position;
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
  flashMesh.position.set(origin.x + fx * 0.8, 1.1, origin.z + fz * 0.8);
  flashMesh.material.opacity = 0.9;
  flashLight.position.copy(flashMesh.position);
  flashLight.intensity = 20;
  flashT = 0.08;
  fleeFrom(origin.x, origin.z);
  raiseWanted(1);
  // Hitscan: nearest ped or car in front within 40 m and a narrow cone.
  let best = null, bd = 40;
  for (const ped of G.peds) {
    if (G.interior && ped.interior !== G.interior) continue;
    const dx = ped.x - origin.x, dz = ped.z - origin.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 40 || d < 0.5) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot > 0.92 && d < bd) { bd = d; best = { kind: 'ped', obj: ped }; }
  }
  for (const car of G.cars) {
    const dx = car.position.x - origin.x, dz = car.position.z - origin.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 40 || d < 0.5) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot > 0.92 && d < bd) { bd = d; best = { kind: 'car', obj: car }; }
  }
  if (best) {
    if (best.kind === 'ped') {
      best.obj.fleeT = 6;
      toast(`${best.obj.name} goes down.`);
      G.scene.remove(best.obj.mesh);
      const i = G.peds.indexOf(best.obj);
      if (i >= 0) G.peds.splice(i, 1);
    } else {
      best.obj.userData.health -= 25;
      if (best.obj.userData.health < 55) puffSmoke(best.obj.position.x, 1.4, best.obj.position.z);
    }
  }
}

function punch() {
  if (!G.player) return;
  const px = G.player.position.x, pz = G.player.position.z;
  for (const ped of [...G.peds]) {
    if (dist2(px, pz, ped.x, ped.z) < 2.2) {
      ped.fleeT = 5;
      toast(`${ped.name} staggers back.`);
      return;
    }
  }
}

function bust() {
  if (G.dead) return;
  G.dead = true;
  showWasted();
}

export function respawn() {
  G.dead = false;
  hideWasted();
  G.health = 100;
  G.money = Math.max(0, G.money - 100);
  G.wanted = 0;
  clearPolice();
  if (G.playerCar) { G.playerCar = null; G.player.visible = true; }
  G.player.position.set(G.spawn.x, 0, G.spawn.z);
  G.yaw = 0;
  snapCam = true;
  saveGame();
}

function clearPolice() {
  for (const c of policeCars) G.scene.remove(c);
  for (const o of officers) G.scene.remove(o.mesh);
  for (const c of roadblock) G.scene.remove(c);
  policeCars = []; officers = []; roadblock = [];
  loseT = 0;
}

function spawnPoliceCar() {
  const car = makePoliceCar();
  const px = G.player ? G.player.position.x : 0;
  const pz = G.player ? G.player.position.z : 0;
  const a = rand(0, Math.PI * 2);
  car.position.set(clamp(px + Math.cos(a) * 90, -440, 440), 0, clamp(pz + Math.sin(a) * 90, -440, 440));
  car.userData.speed = 20;
  G.scene.add(car);
  policeCars.push(car);
  return car;
}

function spawnOfficer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.85, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
  body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 1.62; g.add(head);
  const px = G.player ? G.player.position.x : 0;
  const pz = G.player ? G.player.position.z : 0;
  g.position.set(clamp(px + rand(-40, 40), -440, 440), 0, clamp(pz + rand(-40, 40), -440, 440));
  G.scene.add(g);
  officers.push({ mesh: g, x: g.position.x, z: g.position.z });
}

function updatePolice(dt) {
  if (G.wanted <= 0) {
    if (policeCars.length > 0 || officers.length > 0 || roadblock.length > 0) clearPolice();
    return;
  }
  while (policeCars.length < G.wanted) spawnPoliceCar();
  while (policeCars.length > G.wanted) {
    const c = policeCars.pop();
    G.scene.remove(c);
  }
  if (G.wanted >= 2 && officers.length < 2) spawnOfficer();
  if (G.wanted < 2 && officers.length > 0) {
    for (const o of officers) G.scene.remove(o.mesh);
    officers = [];
  }
  // Roadblocks at 3+ stars: two police cars across the road ahead.
  if (G.wanted >= 3 && roadblock.length === 0) {
    const px = G.playerCar ? G.playerCar.position.x : G.player.position.x;
    const pz = G.playerCar ? G.playerCar.position.z : G.player.position.z;
    const heading = G.playerCar ? G.playerCar.rotation.y : G.yaw;
    const fx = Math.cos(heading), fz = -Math.sin(heading);
    for (const side of [-1, 1]) {
      const c = makePoliceCar();
      c.position.set(px + fx * 45 - fz * side * 4, 0, pz + fz * 45 + fx * side * 4);
      c.rotation.y = heading + Math.PI / 2;
      c.userData.speed = 0;
      G.scene.add(c);
      roadblock.push(c);
    }
    toast('Roadblock ahead!');
  }
  if (G.wanted < 3 && roadblock.length > 0) {
    for (const c of roadblock) G.scene.remove(c);
    roadblock = [];
  }
  const tx = G.playerCar ? G.playerCar.position.x : G.player.position.x;
  const tz = G.playerCar ? G.playerCar.position.z : G.player.position.z;
  // Chase cars.
  for (const car of policeCars) {
    const dx = tx - car.position.x, dz = tz - car.position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const want = Math.atan2(dx, dz) + Math.PI / 2;
    // Car forward is +X rotated by rotation.y: forward=(cos h, -sin h).
    // Desired heading so forward points at the player:
    const desired = Math.atan2(-dz, dx);
    let diff = angDiff(desired, car.rotation.y);
    car.rotation.y += clamp(diff, -2.2 * dt, 2.2 * dt);
    car.userData.speed = Math.min(30, car.userData.speed + 10 * dt);
    const fx = Math.cos(car.rotation.y), fz = -Math.sin(car.rotation.y);
    car.position.x += fx * car.userData.speed * dt;
    car.position.z += fz * car.userData.speed * dt;
    const probe = { x: car.position.x, z: car.position.z };
    collideCircle(probe, 2);
    car.position.x = probe.x; car.position.z = probe.z;
    if (d < 4) {
      if (G.playerCar) {
        G.playerCar.userData.health -= 8 * dt;
        G.playerCar.userData.speed *= (1 - dt);
        if (G.playerCar.userData.health < 55) puffSmoke(G.playerCar.position.x, 1.4, G.playerCar.position.z);
        if (G.playerCar.userData.health <= 0) { exitCar(); }
      } else if (d < 3) {
        bust();
      }
    }
  }
  // Foot officers.
  for (const o of officers) {
    const dx = tx - o.x, dz = tz - o.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.5) {
      o.x += (dx / d) * 4 * dt;
      o.z += (dz / d) * 4 * dt;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = Math.atan2(dx, dz);
    }
    if (d < 1.5 && !G.playerCar) bust();
  }
  // Lose-the-cops: no line of sight from any pursuer for a while.
  losCheckT -= dt;
  if (losCheckT <= 0) {
    losCheckT = 0.5;
    let seen = false;
    for (const car of policeCars) {
      if (!losBlocked(car.position.x, car.position.z, tx, tz)) { seen = true; break; }
    }
    if (!seen) for (const o of officers) {
      if (!losBlocked(o.x, o.z, tx, tz)) { seen = true; break; }
    }
    if (!seen) {
      loseT += 0.5;
      const need = 10 + G.wanted * 6;
      if (loseT >= need) {
        G.wanted = Math.max(0, G.wanted - 1);
        loseT = 0;
        toast('You lost them. Wanted down.');
      }
    } else {
      loseT = 0;
    }
  }
}

export function updatePlayer(dt) {
  if (flashT > 0) {
    flashT -= dt;
    if (flashT <= 0) { flashMesh.material.opacity = 0; flashLight.intensity = 0; }
  }
  if (G.dead) return;
  const keys = G.keys;
  if (G.playerCar) {
    const car = G.playerCar;
    const u = car.userData;
    const accel = (keys['KeyW'] || keys['ArrowUp'] ? 14 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -10 : 0);
    u.speed += accel * dt;
    u.speed *= Math.max(0, 1 - 0.6 * dt);
    u.speed = clamp(u.speed, -12, u.maxSpeed);
    const steer = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
    if (Math.abs(u.speed) > 0.5) car.rotation.y += steer * Math.sign(u.speed) * 1.6 * dt * Math.min(1, Math.abs(u.speed) / 10);
    const fx = Math.cos(car.rotation.y), fz = -Math.sin(car.rotation.y);
    const nx = car.position.x + fx * u.speed * dt;
    const nz = car.position.z + fz * u.speed * dt;
    const probe = { x: nx, z: nz };
    const before = { x: car.position.x, z: car.position.z };
    collideCircle(probe, 2.2);
    car.position.x = probe.x; car.position.z = probe.z;
    const hitWall = Math.abs(probe.x - nx) > 0.01 || Math.abs(probe.z - nz) > 0.01;
    if (hitWall && Math.abs(u.speed) > 10) {
      u.health -= 8;
      G.health = Math.max(0, G.health - 3);
      u.speed *= 0.4;
      if (u.health < 55) puffSmoke(car.position.x, 1.4, car.position.z);
    }
    // Car-car bumps.
    for (const other of G.cars) {
      if (other === car) continue;
      const d = dist2(car.position.x, car.position.z, other.position.x, other.position.z);
      if (d < 3.5 && d > 0.01) {
        u.speed *= 0.6;
        u.health -= 2;
      }
    }
    if (u.health <= 0) {
      toast('Your car is wrecked.');
      u.health = 100;
      exitCar();
    }
    // Skid marks when steering hard at speed.
    if (Math.abs(steer) > 0 && Math.abs(u.speed) > 15 && Math.random() < 0.5) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 }));
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = -car.rotation.y;
      mark.position.set(car.position.x - fx * 1.5, 0.13, car.position.z - fz * 1.5);
      G.scene.add(mark);
      skidMarks.push({ mesh: mark, life: 8 });
      if (skidMarks.length > 60) { const old = skidMarks.shift(); G.scene.remove(old.mesh); }
    }
    for (let i = skidMarks.length - 1; i >= 0; i--) {
      skidMarks[i].life -= dt;
      if (skidMarks[i].life <= 0) { G.scene.remove(skidMarks[i].mesh); skidMarks.splice(i, 1); }
    }
    // FOV kick with speed.
    const targetFov = 60 + Math.abs(u.speed) * 0.7;
    if (Math.abs(G.camera.fov - targetFov) > 0.5) {
      G.camera.fov = lerp(G.camera.fov, targetFov, dt * 3);
      G.camera.updateProjectionMatrix();
    }
  } else {
    // On foot.
    const fwd = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    const strafe = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
    const run = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = run ? 6 : 3.5;
    if (fwd !== 0 || strafe !== 0) {
      const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
      const rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
      let mx = fx * fwd + rx * strafe, mz = fz * fwd + rz * strafe;
      const ml = Math.sqrt(mx * mx + mz * mz) || 1;
      mx /= ml; mz /= ml;
      const probe = { x: G.player.position.x + mx * speed * dt, z: G.player.position.z + mz * speed * dt };
      collideCircle(probe, 0.6, G.interior ? G.interior.bounds : null);
      G.player.position.x = probe.x;
      G.player.position.z = probe.z;
      G.player.rotation.y = Math.atan2(mx, mz);
    }
    if (Math.abs(G.camera.fov - 60) > 0.5) {
      G.camera.fov = lerp(G.camera.fov, 60, dt * 3);
      G.camera.updateProjectionMatrix();
    }
  }
  updatePolice(dt);
  if (G.health <= 0 && !G.dead) bust();
}

export function updateCamera(dt) {
  const cam = G.camera;
  if (!cam) return;
  const anchor = G.playerCar || G.player;
  if (!anchor) return;
  let dist, height, lookY;
  if (G.interior) { dist = 3.2; height = 2.0; lookY = 1.2; }
  else if (G.playerCar) { dist = 10; height = 4; lookY = 1.2; }
  else { dist = 7; height = 3; lookY = 1.4; }
  const yaw = G.playerCar ? (G.playerCar.rotation.y + Math.PI / 2) : G.yaw;
  // Camera behind: for cars forward is +X rotated; yaw here is the view angle.
  const cx = anchor.position.x - Math.sin(yaw) * dist;
  const cz = anchor.position.z - Math.cos(yaw) * dist;
  const cy = height;
  if (snapCam || G.snapCam) {
    cam.position.set(cx, cy, cz);
    snapCam = false;
    G.snapCam = false;
  } else {
    cam.position.x = lerp(cam.position.x, cx, 1 - Math.pow(0.001, dt));
    cam.position.y = lerp(cam.position.y, cy, 1 - Math.pow(0.001, dt));
    cam.position.z = lerp(cam.position.z, cz, 1 - Math.pow(0.001, dt));
  }
  if (G.interior) {
    const b = G.interior.bounds;
    cam.position.x = clamp(cam.position.x, b.x0 + 0.5, b.x1 - 0.5);
    cam.position.z = clamp(cam.position.z, b.z0 + 0.5, b.z1 - 0.5);
    cam.position.y = clamp(cam.position.y, 1, 2.8);
  }
  cam.lookAt(anchor.position.x, lookY, anchor.position.z);
}

export function handleShoot() { if (!G.playerCar && !G.dialog && !G.dead) shoot(); }
export function handlePunch() { if (!G.playerCar && !G.dialog && !G.dead) punch(); }
export function handleReload() {
  if (G.playerCar) return;
  G.ammo = G.ammoMax;
}
