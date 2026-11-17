// The Verde PD: wanted stars, pursuit cars, foot officers, and getting busted.
// One clear job: turn the wanted level into police that chase, ram and arrest.
import * as THREE from 'three';
import { createCar, stepCar } from './vehicles.js';
import { randomRoadPoint, randomSidewalkPoint, collideCircle, HALF, PITCH } from './city.js';
import { spawnPed } from './traffic.js';

function spawnPoliceCar(G) {
  const rng = G.rng;
  // spawn on a road roughly 70 units from the player
  let x = 0, z = 0;
  for (let tries = 0; tries < 12; tries++) {
    const a = rng() * Math.PI * 2;
    const d = 60 + rng() * 40;
    x = G.player.pos.x + Math.cos(a) * d;
    z = G.player.pos.z + Math.sin(a) * d;
    x = Math.max(-HALF, Math.min(HALF, x));
    z = Math.max(-HALF, Math.min(HALF, z));
    if (Math.abs(x) > 10 || Math.abs(z) > 10) break;
  }
  const rp = randomRoadPoint(rng);
  const car = createCar(G, rp.x, rp.z, rp.angle, 0, {
    isPolice: true, driver: 'police',
    maxSpeed: 13 + G.wanted * 2.4, accel: 20,
  });
  car.cruise = car.maxSpeed;
  return car;
}

function spawnOfficer(G, x, z) {
  // no position given: near the player, as before
  if (x === undefined) {
    const a = G.rng() * Math.PI * 2;
    x = G.player.pos.x + Math.cos(a) * 18;
    z = G.player.pos.z + Math.sin(a) * 18;
  }
  const ped = spawnPed(G, x, z);
  ped.state = 'officer'; ped.health = 50; ped.shootTimer = 1 + G.rng();
  // dark uniform: recolour the torso (child 2) and add a cap
  ped.group.children[2].material = new THREE.MeshLambertMaterial({ color: 0x1c2f5e });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x101a30 }));
  cap.position.y = 1.52; ped.group.add(cap);
  G.officers.push(ped);
  return ped;
}

function spawnRoadblock(G) {
  // two cruisers parked across the road ahead of the player + one officer
  const p = G.player;
  const heading = p.onFoot ? G.camYaw : p.car.angle;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  let ax = p.pos.x + fx * 85, az = p.pos.z + fz * 85;
  if (Math.abs(fx) > Math.abs(fz)) az = Math.round(az / PITCH) * PITCH; // travelling east-west: snap z to a street
  else ax = Math.round(ax / PITCH) * PITCH;
  ax = Math.max(-HALF, Math.min(HALF, ax));
  az = Math.max(-HALF, Math.min(HALF, az));
  const cars = [];
  for (const s of [-1, 1]) {
    const car = createCar(G, ax - fz * s * 3.5, az + fx * s * 3.5, heading + Math.PI / 2 + s * 0.4, 0, { isPolice: true, driver: 'roadblock' });
    car.speed = 0; car.maxSpeed = 0;
    cars.push(car);
  }
  const off = spawnOfficer(G, ax + fx * 4, az + fz * 4);
  off.roadblock = true; // holds the block; the officer trim leaves it alone
  G.roadblock = { cars, officer: off, x: ax, z: az };
  G.hud.toast('Roadblock ahead!');
}

function removeRoadblock(G) {
  if (!G.roadblock) return;
  for (const car of G.roadblock.cars) {
    G.scene.remove(car.group);
    const i = G.cars.indexOf(car);
    if (i >= 0) G.cars.splice(i, 1);
  }
  const off = G.roadblock.officer;
  if (off) {
    G.scene.remove(off.group);
    const pi = G.peds.indexOf(off);
    if (pi >= 0) G.peds.splice(pi, 1);
    const oi = G.officers.indexOf(off);
    if (oi >= 0) G.officers.splice(oi, 1);
  }
  G.roadblock = null;
}

export function updatePolice(G, dt) {
  if (!G.police) { G.police = []; G.officers = []; G.bustTimer = 0; G.decayTimer = 0; }
  // --- match the number of pursuit cars to the wanted level ---
  const want = Math.min(G.wanted, 4);
  while (G.police.length < want) G.police.push(spawnPoliceCar(G));
  while (G.police.length > want) {
    const car = G.police.pop();
    G.scene.remove(car.group);
    G.cars.splice(G.cars.indexOf(car), 1);
  }
  // --- foot officers at wanted 2+ ---
  const wantOfficers = G.wanted >= 2 ? Math.min(2, G.wanted - 1) : 0;
  while (G.officers.length < wantOfficers) spawnOfficer(G);
  while (G.officers.length > wantOfficers) {
    // remove the newest patrol officer, never a roadblock guard
    let idx = G.officers.length - 1;
    while (idx >= 0 && G.officers[idx].roadblock) idx--;
    if (idx < 0) break;
    const o = G.officers.splice(idx, 1)[0];
    G.scene.remove(o.group);
    G.peds.splice(G.peds.indexOf(o), 1);
  }
  // --- police cars chase ---
  const target = G.player.onFoot ? G.player.pos : G.player.car.pos;
  const targetSpeed = G.player.onFoot ? 0 : G.player.car.speed;
  let nearest = 1e9;
  for (const car of G.police) {
    const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    nearest = Math.min(nearest, dist);
    // aim slightly ahead of a moving target
    const lead = Math.min(1.2, dist / 40);
    const tx = target.x + (G.player.onFoot ? 0 : Math.sin(G.player.car.angle) * targetSpeed * lead);
    const tz = target.z + (G.player.onFoot ? 0 : Math.cos(G.player.car.angle) * targetSpeed * lead);
    const want2 = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    let d = want2 - car.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
    let cruise = car.cruise;
    if (Math.abs(d) > 0.7) cruise *= 0.5;
    car.speed += Math.max(-20 * dt, Math.min(18 * dt, cruise - car.speed));
    stepCar(G, car, dt, false);
    // ram the player: damage on hard contact
    const pd = Math.hypot(car.pos.x - G.player.pos.x, car.pos.z - G.player.pos.z);
    if (pd < 2.6 && Math.abs(car.speed) > 4) {
      if (G.player.onFoot) {
        G.hurtPlayer(22, car.pos);
        G.bustTimer += 1.2;
      } else {
        G.player.car.health -= 6;
        G.hurtPlayer(3, car.pos);
        G.shake = 0.5;
        G.audio.thud();
      }
      car.speed *= 0.4;
    }
    // flashing light bar
    const blink = Math.floor(G.time * 6) % 2 === 0;
    if (car.group.userData.lightRed) {
      car.group.userData.lightRed.material.emissiveIntensity = blink ? 1.6 : 0.15;
      car.group.userData.lightBlue.material.emissiveIntensity = blink ? 0.15 : 1.6;
    }
  }
  // --- officers walk up and shoot ---
  for (const o of [...G.officers]) {
    if (o.state === 'down') continue;
    const dx = G.player.pos.x - o.pos.x, dz = G.player.pos.z - o.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!o.roadblock && dist > 30) {
      o.pos.x += (dx / dist) * 3.4 * dt;
      o.pos.z += (dz / dist) * 3.4 * dt;
    }
    o.yaw = Math.atan2(dx, dz);
    o.group.rotation.y = o.yaw;
    o.walkPhase += dt * 8;
    o.group.userData.legL.rotation.x = Math.sin(o.walkPhase) * 0.5;
    o.group.userData.legR.rotation.x = -Math.sin(o.walkPhase) * 0.5;
    collideCircle(G.city, o.pos, 0.5);
    o.shootTimer -= dt;
    if (o.shootTimer <= 0 && dist < 28 && G.player.health > 0) {
      o.shootTimer = 1.4 + G.rng() * 0.8;
      G.audio.shot(true);
      // inaccurate: 45% hit chance, worse at range
      if (G.rng() < Math.max(0.15, 0.5 - dist * 0.012)) {
        G.hurtPlayer(4 + Math.floor(G.rng() * 4), o.pos);
      }
      G.hud.tracer(o.pos, G.player.pos);
    }
  }
  // --- busting: cornered on foot or boxed in while driving ---
  const playerSlow = G.player.onFoot ? G.player.speed < 1.5 : Math.abs(G.player.car ? G.player.car.speed : 0) < 3;
  if (G.wanted > 0 && nearest < (G.player.onFoot ? 3.2 : 4.5) && playerSlow) {
    G.bustTimer += dt;
    if (G.bustTimer > 0.8) G.hud.toast('The police are closing in — RUN!');
    if (G.bustTimer > 2.6) { G.doBusted('The Verde PD boxed you in.'); return; }
  } else {
    G.bustTimer = Math.max(0, G.bustTimer - dt * 2);
  }
  // --- wanted decays when the player is clear of the police ---
  if (G.wanted > 0) {
    if (nearest > 95) {
      G.decayTimer += dt;
      if (G.decayTimer > 12) { G.decayTimer = 0; G.setWanted(G.wanted - 1); }
    } else G.decayTimer = 0;
  }
  // --- roadblocks at 3+ stars: a block forms ahead, reforms as you drive on ---
  if (G.wanted >= 3) {
    if (!G.roadblock) spawnRoadblock(G);
    else if (Math.hypot(G.player.pos.x - G.roadblock.x, G.player.pos.z - G.roadblock.z) > 160) {
      removeRoadblock(G);
      spawnRoadblock(G);
    }
  } else if (G.roadblock) removeRoadblock(G);
  // --- losing the cops: out of sight for a while, and the heat drops ---
  let nearestOfficer = 1e9;
  for (const o of G.officers) {
    nearestOfficer = Math.min(nearestOfficer, Math.hypot(o.pos.x - G.player.pos.x, o.pos.z - G.player.pos.z));
  }
  if (G.wanted > 0 && nearest > 70 && nearestOfficer > 40) {
    G.hiddenTimer = (G.hiddenTimer || 0) + dt;
    if (G.hiddenTimer > 6 && !G.losingShown) { G.losingShown = true; G.hud.toast('You are losing them — stay out of sight!'); }
    if (G.hiddenTimer > 10) {
      G.hiddenTimer = 0; G.losingShown = false;
      G.setWanted(G.wanted - 1);
      if (G.wanted === 0) G.hud.toast('You lost them.');
    }
  } else { G.hiddenTimer = 0; G.losingShown = false; }
  // --- siren volume by nearest police ---
  G.audio.siren(G.wanted > 0 ? Math.max(0, 1 - nearest / 120) : 0);
}
