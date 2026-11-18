// Porto Verde — pedestrians: named street NPCs, day/night shift routines,
// walkers, chatting pairs, fleeing. Every ped has a name; the roster can
// never run out (numbered fallback). All original.
import * as THREE from 'three';
import { G, ROADS, rand, randi, pick, clamp, collideCircle, dist2, roadPoint } from './util.js';

const NAMES = [
  'Vic', 'Priya', 'Marco', 'Lena', 'Tomas', 'Ana', 'Dario', 'Rosa', 'Nico', 'Sofia',
  'Felix', 'Mara', 'Rook', 'Elena', 'Carlos', 'Yuki', 'Omar', 'Ivy', 'Hugo', 'Nina',
  'Diego', 'Mia', 'Leo', 'Zoe', 'Sam', 'Rita', 'Ken', 'Lola', 'Max', 'June',
  'Oscar', 'Tara', 'Ben', 'Cleo', 'Ray', 'Iris', 'Cole', 'Ada', 'Jay', 'Noor',
];
let vicN = 0;
const usedNames = new Set();
export function uniqueName() {
  const free = NAMES.filter(n => !usedNames.has(n));
  if (free.length > 0) {
    const n = pick(free);
    usedNames.add(n);
    return n;
  }
  vicN++;
  return `Vic ${vicN}`;
}

const SKINS = [0xd9a986, 0xb98a5e, 0x8a5a3a, 0xe8c39a, 0x6b4426];
const SHIRTS = [0x7a2e2e, 0x2e4a6b, 0x3a6b4a, 0x8a7a3a, 0x5a4a7a, 0x4a7a6b, 0xa05a2e, 0x6b6b6b];
const PANTS = [0x2e3440, 0x4a3a2e, 0x3a4a5a, 0x5a5a5a];

function makePedMesh(name, opts = {}) {
  const g = new THREE.Group();
  const h = opts.height || rand(1.6, 1.9);
  const shirt = opts.shirt || pick(SHIRTS);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, h * 0.55, 8),
    new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = h * 0.42; body.castShadow = true; g.add(body);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, h * 0.32, 8),
    new THREE.MeshLambertMaterial({ color: opts.pants || pick(PANTS) }));
  legs.position.y = h * 0.16; g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: opts.skin || pick(SKINS) }));
  head.position.y = h * 0.82; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: opts.hair || pick([0x1a1a1a, 0x4a2e1a, 0x8a8a8a, 0x2e1a0a]) }));
  hair.position.y = h * 0.86; g.add(hair);
  g.userData.height = h;
  return g;
}

function randomRoadPoint() {
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const line = pick(ROADS);
  const pos = rand(-420, 420);
  return axis === 'x' ? { x: pos, z: line + pick([-9, 9]) } : { x: line + pick([-9, 9]), z: pos };
}

export function addPed(name, x, z, kind, opts = {}) {
  const mesh = makePedMesh(name, opts);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const ped = {
    mesh, name, kind: kind || 'walker',
    x, z, target: randomRoadPoint(), speed: rand(0.9, 1.5),
    talkAt: -99, routine: opts.routine || null, home: opts.home || null,
    chatting: opts.chatting || null, fleeT: 0, bob: Math.random() * 10,
  };
  mesh.userData.ped = ped;
  G.peds.push(ped);
  return ped;
}

export function spawnPeds() {
  // Named street NPCs (fixed pitches).
  const rosa = addPed('Rosa', -264, 258, 'named', { shirt: 0xc9563c, height: 1.65 });
  const dario = addPed('Dario', 108, -150, 'named', { shirt: 0x2e4a6b, height: 1.85 });
  const nico = addPed('Nico', 270, 395, 'named', { shirt: 0x4a7a6b, height: 1.75 });
  G.named = { Rosa: rosa, Dario: dario, Nico: nico };
  // Day-shift market workers: market by day, home at night.
  const market = { x: -264, z: 258 };
  const homes = [{ x: -320, z: 320 }, { x: -200, z: 320 }, { x: -352, z: 192 }, { x: -160, z: 192 }];
  for (let i = 0; i < 4; i++) {
    const p = addPed(uniqueName(), homes[i].x, homes[i].z, 'routine', {
      routine: { day: market, night: homes[i] }, home: homes[i],
    });
    p.target = market;
  }
  // Night-shift bar crowd: bar by night, home by day.
  const bar = { x: 32, z: 32 };
  const barHomes = [{ x: 96, z: -64 }, { x: -64, z: 96 }, { x: 160, z: 96 }, { x: -96, z: -160 }];
  for (let i = 0; i < 4; i++) {
    const p = addPed(uniqueName(), barHomes[i].x, barHomes[i].z, 'routine', {
      routine: { day: barHomes[i], night: bar }, home: barHomes[i],
    });
    p.target = barHomes[i];
  }
  // Chatting pairs (4 pairs standing together).
  const pairSpots = [[-32, 96], [128, 224], [-224, -96], [224, -224]];
  for (const [sx, sz] of pairSpots) {
    const a = addPed(uniqueName(), sx - 0.8, sz, 'chatting');
    const b = addPed(uniqueName(), sx + 0.8, sz, 'chatting');
    a.chatting = b; b.chatting = a;
    a.mesh.rotation.y = Math.PI / 2; b.mesh.rotation.y = -Math.PI / 2;
  }
  // Walkers.
  for (let i = 0; i < 44; i++) {
    const p = randomRoadPoint();
    addPed(uniqueName(), p.x, p.z, 'walker');
  }
  G.stats.peds = G.peds.length;
}

export function isDay() {
  // dayT 0..1 over the 240 s cycle; sun is up for the first half.
  return G.dayT < 0.5;
}

export function updatePeds(dt) {
  if (G.interior) return;
  const day = isDay();
  for (const ped of G.peds) {
    const m = ped.mesh;
    if (ped.kind === 'named' || ped.kind === 'chatting') {
      ped.bob += dt;
      m.position.y = Math.abs(Math.sin(ped.bob * 1.4)) * 0.04;
      continue;
    }
    if (ped.kind === 'routine' && ped.routine) {
      const dest = day ? ped.routine.day : ped.routine.night;
      if (Math.abs(ped.target.x - dest.x) > 1 || Math.abs(ped.target.z - dest.z) > 1) ped.target = { ...dest };
    }
    let tx = ped.target.x, tz = ped.target.z, speed = ped.speed;
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      speed = 3.2;
      const dx = ped.x - (G.shotX || 0), dz = ped.z - (G.shotZ || 0);
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      tx = ped.x + (dx / d) * 20; tz = ped.z + (dz / d) * 20;
    }
    const dx = tx - ped.x, dz = tz - ped.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.5) {
      if (ped.kind === 'routine') { ped.target = ped.target; }
      else ped.target = randomRoadPoint();
    } else {
      const step = Math.min(d, speed * dt);
      const nx = ped.x + (dx / d) * step, nz = ped.z + (dz / d) * step;
      const probe = { x: nx, z: nz };
      collideCircle(probe, 0.5);
      ped.x = probe.x; ped.z = probe.z;
      m.position.set(ped.x, 0, ped.z);
      m.rotation.y = Math.atan2(dx, dz);
      ped.bob += dt * 6;
      m.position.y = Math.abs(Math.sin(ped.bob)) * 0.05;
    }
  }
}

export function fleeFrom(x, z) {
  G.shotX = x; G.shotZ = z;
  for (const ped of G.peds) {
    if (dist2(ped.x, ped.z, x, z) < 30) ped.fleeT = 4;
  }
}

export function nearestPed(maxDist) {
  if (!G.player) return null;
  const px = G.player.position.x, pz = G.player.position.z;
  let best = null, bd = maxDist;
  for (const ped of G.peds) {
    if (G.interior && ped.interior !== G.interior) continue;
    const d = dist2(ped.x, ped.z, px, pz);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}
