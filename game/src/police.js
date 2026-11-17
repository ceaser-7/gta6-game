// The Verde PD: wanted stars, pursuit cars, foot officers, and getting busted.
// One clear job: turn the wanted level into police that chase, ram and arrest.
import * as THREE from 'three';
import { createCar, stepCar } from './vehicles.js';
import { randomRoadPoint, randomSidewalkPoint, collideCircle, HALF } from './city.js';
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

function spawnOfficer(G) {
  const p = randomSidewalkPoint(G.rng);
  // put the officer near the player instead
  const a = G.rng() * Math.PI * 2;
  const x = G.player.pos.x + Math.cos(a) * 18, z = G.player.pos.z + Math.sin(a) * 18;
  const ped = spawnPed(G, x, z);
  ped.state = 'officer'; ped.health = 50; ped.shootTimer = 1 + G.rng();
  // dark uniform: recolour the torso (child 2) and add a cap
  ped.group.children[2].material = new THREE.MeshLambertMaterial({ color: 0x1c2f5e });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x101a30 }));
  cap.position.y = 1.52; ped.group.add(cap);
  G.officers.push(ped);
  return ped;
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
    const o = G.officers.pop();
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
    if (dist > 30) {
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
  // --- siren volume by nearest police ---
  G.audio.siren(G.wanted > 0 ? Math.max(0, 1 - nearest / 120) : 0);
}
