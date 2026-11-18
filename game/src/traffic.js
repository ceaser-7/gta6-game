// Porto Verde — traffic cars and pedestrians, named NPCs, day/night routines.
import * as THREE from '../vendor/three.module.min.js';
import { G, rand, randi, choice, clamp, pedName, nearestRoad, randomRoadPoint, dist } from './state.js';
import { spawnCar, CAR_TYPES } from './cars.js';
import { collideCircle } from './city.js';

const PED_COLORS = [0x8a5a3a, 0x3a5a8a, 0x5a8a3a, 0x8a3a5a, 0x6a6a6a, 0xc9a23a, 0x2f6a6a, 0x9a4a2f, 0x4a3a6a, 0x7a7a2f];

export function makePedMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8a880 }));
  head.position.y = 1.85; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.25), new THREE.MeshLambertMaterial({ color: 0x2a2a2e }));
  legL.position.set(-0.18, 0.3, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; g.add(legR);
  g.userData.legs = [legL, legR];
  return g;
}

export function spawnPed(x, z, opts = {}) {
  const mesh = makePedMesh(opts.color ?? choice(PED_COLORS));
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const ped = {
    mesh, x, z, yaw: rand(Math.PI * 2), speed: rand(1.2, 2.2),
    name: opts.name ?? pedName(G.peds.length),
    namedKey: opts.namedKey ?? null, kind: opts.kind ?? 'walker',
    target: null, talkAt: -99, routine: opts.routine ?? null, routineDest: null,
    eventPed: false, fleeing: false, home: null,
  };
  G.peds.push(ped);
  return ped;
}

export const NAMED_NPCS = [
  { key: 'rosa', name: 'Rosa', x: -264, z: 256, pitch: 'Old Town market' },
  { key: 'dario', name: 'Dario', x: 108, z: -150, pitch: 'Downtown' },
  { key: 'nico', name: 'Nico', x: 272, z: 400, pitch: 'the beach' },
];

export function spawnWorld() {
  // traffic cars on roads
  const types = Object.keys(CAR_TYPES);
  for (let i = 0; i < 32; i++) {
    const p = randomRoadPoint();
    const yaw = Math.random() < 0.5 ? 0 : Math.PI / 2;
    const car = spawnCar(choice(types), p.x, p.z, yaw + (Math.random() < 0.5 ? 0 : Math.PI));
    car.speed = rand(6, 11);
    car.target = randomRoadPoint();
    G.traffic.push(car);
  }
  // named NPCs at their pitches
  for (const n of NAMED_NPCS) {
    const ped = spawnPed(n.x, n.z, { name: n.name, namedKey: n.key, kind: 'named' });
    ped.target = null;
  }
  // routine peds: 4 day-shift market workers, 4 night-shift bar crowd
  for (let i = 0; i < 4; i++) {
    const p = spawnPed(rand(-280, -220), rand(220, 280), { kind: 'routine' });
    p.routine = { day: { x: -264, z: 252 }, night: { x: rand(-200, -100), z: rand(300, 380) } };
  }
  for (let i = 0; i < 4; i++) {
    const p = spawnPed(rand(80, 160), rand(-180, -120), { kind: 'routine' });
    p.routine = { day: { x: rand(60, 200), z: rand(-260, -180) }, night: { x: 128, z: -150 } };
  }
  // walkers
  for (let i = 0; i < 54; i++) {
    const p = randomRoadPoint();
    spawnPed(p.x + rand(-6, 6), p.z + rand(-6, 6));
  }
  // the player's starter car (parked, never driven by traffic)
  const starter = spawnCar('sedan', 8, 132, Math.PI, { parked: true, color: 0x4a6a8a });
  starter.parked = true;
  G.starterCar = starter;
  // the gold car for M2 (parked at the marina)
  const gold = spawnCar('sports', 320, 192, Math.PI / 2, { parked: true, mission: true, color: 0xd8b83a });
  G.goldCar = gold;
  // the project car inside Sunray Garage is placed by interiors.js
}

function pedWalkTarget(ped) {
  if (ped.kind === 'named') return null;
  if (ped.routine) {
    const night = G.dayT > 120; // second half of the cycle is night
    const dest = night ? ped.routine.night : ped.routine.day;
    if (!ped.routineDest || ped.routineDest.x !== dest.x || ped.routineDest.z !== dest.z) {
      ped.routineDest = dest; ped.target = { x: dest.x + rand(-6, 6), z: dest.z + rand(-6, 6) };
    }
    return ped.target;
  }
  if (!ped.target || dist(ped.x, ped.z, ped.target.x, ped.target.z) < 3) {
    ped.target = randomRoadPoint();
  }
  return ped.target;
}

export function updateTraffic(dt) {
  // traffic cars follow roads toward their target intersection
  for (const car of G.traffic) {
    if (car.parked || car.mission || car.police) continue;
    if (G.interior) continue;
    if (!car.target || dist(car.x, car.z, car.target.x, car.target.z) < 6) car.target = randomRoadPoint();
    const dx = car.target.x - car.x, dz = car.target.z - car.z;
    const want = Math.atan2(dx, dz);
    let d = want - car.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    car.yaw += clamp(d, -1.4 * dt, 1.4 * dt);
    // slow for a car ahead
    let slow = false;
    for (const o of G.cars) {
      if (o === car) continue;
      const ox = o.x - car.x, oz = o.z - car.z;
      const fwd = ox * Math.sin(car.yaw) + oz * Math.cos(car.yaw);
      if (fwd > 0 && fwd < 9 && Math.abs(ox * Math.cos(car.yaw) - oz * Math.sin(car.yaw)) < 2.4) { slow = true; break; }
    }
    const targetSpeed = slow ? 0 : rand(7, 10);
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const res = collideCircle(nx, nz, 1.6);
    car.x = res.x; car.z = res.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
  }
  // peds
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.interior) continue; // room vendors stand at their posts
    if (G.interior) continue; // street peds freeze while the player is inside
    if (ped.eventPed) continue; // street-event peds stand still
    const dPlayer = dist(ped.x, ped.z, p.x, p.z);
    if (G.wanted > 0 && dPlayer < 14 && ped.kind !== 'named') {
      // flee from the player when wanted
      ped.fleeing = true;
      const away = Math.atan2(ped.x - p.x, ped.z - p.z);
      ped.yaw = away;
      const nx = ped.x + Math.sin(away) * 4.5 * dt, nz = ped.z + Math.cos(away) * 4.5 * dt;
      const res = collideCircle(nx, nz, 0.6);
      ped.x = res.x; ped.z = res.z;
    } else {
      ped.fleeing = false;
      const tgt = pedWalkTarget(ped);
      if (tgt) {
        const dx = tgt.x - ped.x, dz = tgt.z - ped.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.5) {
          const want = Math.atan2(dx, dz);
          let dd = want - ped.yaw;
          while (dd > Math.PI) dd -= Math.PI * 2;
          while (dd < -Math.PI) dd += Math.PI * 2;
          ped.yaw += clamp(dd, -3 * dt, 3 * dt);
          const nx = ped.x + Math.sin(ped.yaw) * ped.speed * dt;
          const nz = ped.z + Math.cos(ped.yaw) * ped.speed * dt;
          const res = collideCircle(nx, nz, 0.6);
          ped.x = res.x; ped.z = res.z;
          const t = G.time * 8;
          ped.mesh.userData.legs[0].rotation.x = Math.sin(t) * 0.5;
          ped.mesh.userData.legs[1].rotation.x = -Math.sin(t) * 0.5;
        }
      }
    }
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.yaw;
  }
}
