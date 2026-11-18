// Porto Verde — pedestrians: named roster, named street NPCs, chatting pairs,
// day/night shift routines, fleeing. Everyone has a name.
import * as THREE from 'three';
import { G, CFG, ROADS, rng, rand, randi, pick, clamp, dist2 } from './state.js';

export const NAMES = ['Vic', 'Mara', 'Tomas', 'Lena', 'Rosa', 'Dario', 'Nico', 'Priya', 'Jonas', 'Aisha',
  'Carlos', 'Mina', 'Oscar', 'Ivy', 'Ruben', 'Sana', 'Diego', 'Faye', 'Kofi', 'Luz',
  'Marco', 'Nadia', 'Owen', 'Pia', 'Quinn', 'Rita', 'Sam', 'Tara', 'Umar', 'Vera'];
const SHIRTS = [0x8a4a3a, 0x3a5a7a, 0x4a6b3a, 0x7a6b2e, 0x5a4a6b, 0x6b6b6b, 0x2e6b6b, 0x9a5a2e, 0x3a3a4a, 0x7a2e4a];
const PANTS = [0x2e2e3a, 0x3a3a3a, 0x4a3a2e, 0x2e3a4a, 0x1e1e26];
const SKINS = [0xd8a878, 0xc98e5f, 0x8a5a3a, 0xe8b88a, 0x6b4226, 0xf0c8a0];

export function makePed(name, opts = {}) {
  const g = new THREE.Group();
  const h = opts.height || rand(1.62, 1.92);
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt || pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants || pick(PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin || pick(SKINS) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
  torso.position.y = 0.95; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.45; head.castShadow = true; g.add(head);
  // hair / cap
  if (rng() < 0.5) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, 1.4),
      new THREE.MeshLambertMaterial({ color: pick([0x1a1a1a, 0x3a2a1a, 0x6b6b6b, 0x8a5a2e]) }));
    hair.position.y = 1.48; g.add(hair);
  } else {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: pick([0x2e4a7a, 0x7a2e2e, 0x3a5a3a, 0xd8b93a]) }));
    cap.position.y = 1.58; g.add(cap);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), pants);
  legL.position.set(-0.14, 0.31, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), shirt);
  armL.position.set(-0.33, 0.95, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.33; g.add(armR);
  g.scale.set(1, h / 1.75, 1);
  g.userData = {
    name, height: h, legL, legR, armL, armR,
    speed: opts.speed || rand(1.1, 1.9), target: null, state: 'walk',
    talkAt: -99, kind: opts.kind || 'walker', home: null, shift: null,
    fleeT: 0, chatPartner: null, phase: rand(0, Math.PI * 2),
  };
  return g;
}

export function spawnPeds() {
  const usedNames = new Set();
  const uniqueName = () => {
    // The roster has 30 names but the city needs ~61; once the pool is
    // exhausted, reuse a name with a number suffix (a bare do/while here
    // would spin forever once every name was taken).
    if (usedNames.size >= NAMES.length) {
      const base = pick(NAMES);
      let k = 2, n;
      do { n = base + ' ' + k; k++; } while (usedNames.has(n));
      usedNames.add(n); return n;
    }
    let n; do { n = pick(NAMES); } while (usedNames.has(n));
    usedNames.add(n); return n;
  };
  // named street NPCs at fixed pitches
  const namedDefs = [
    { key: 'Rosa', x: -264, z: 258, shirt: 0xc9563c, kind: 'named' },
    { key: 'Dario', x: 108, z: -150, shirt: 0x3a5a7a, kind: 'named' },
    { key: 'Nico', x: 270, z: 395, shirt: 0x2e6b6b, kind: 'named' },
  ];
  for (const d of namedDefs) {
    const ped = makePed(d.key, { kind: d.kind, shirt: d.shirt, speed: 0 });
    ped.position.set(d.x, 0, d.z);
    ped.userData.state = 'stand'; ped.userData.home = { x: d.x, z: d.z };
    G.scene.add(ped); G.peds.push(ped); G.named[d.key] = ped;
  }
  // chatting pairs (stand facing each other)
  for (let i = 0; i < 8; i++) {
    const bx = pick(ROADS) + pick([-9, 9]); const bz = rand(-380, 380);
    const a = makePed(uniqueName(), { kind: 'chat', speed: 0 });
    const b = makePed(uniqueName(), { kind: 'chat', speed: 0 });
    a.position.set(bx, 0, bz); b.position.set(bx + 1.1, 0, bz + 0.4);
    a.lookAt(b.position.x, 0, b.position.z); b.lookAt(a.position.x, 0, a.position.z);
    a.userData.state = 'stand'; b.userData.state = 'stand';
    a.userData.chatPartner = b; b.userData.chatPartner = a;
    G.scene.add(a); G.scene.add(b); G.peds.push(a, b);
  }
  // day-shift market workers (market by day, home at night)
  for (let i = 0; i < 4; i++) {
    const ped = makePed(uniqueName(), { kind: 'routine', shirt: 0x7fb069 });
    ped.position.set(-264 + rand(-30, 30), 0, 258 + rand(-20, 20));
    ped.userData.routine = {
      day: { x: -264 + rand(-25, 25), z: 258 + rand(-18, 18) },
      night: { x: rand(-350, -150), z: rand(150, 350) },
    };
    ped.userData.state = 'walk';
    G.scene.add(ped); G.peds.push(ped);
  }
  // night-shift bar crowd (home by day, bar at night)
  for (let i = 0; i < 4; i++) {
    const ped = makePed(uniqueName(), { kind: 'routine', shirt: 0x4a4a5a });
    ped.position.set(rand(-100, 100), 0, rand(50, 150));
    ped.userData.routine = {
      day: { x: rand(-300, 300), z: rand(-300, 300) },
      night: { x: -54 + rand(-20, 20), z: 120 + rand(-12, 12) },
    };
    ped.userData.state = 'walk';
    G.scene.add(ped); G.peds.push(ped);
  }
  // general walkers
  const remaining = CFG.PED_N - G.peds.length;
  for (let i = 0; i < remaining; i++) {
    const ped = makePed(uniqueName());
    ped.position.set(rand(-400, 400), 0, rand(-400, 400));
    G.scene.add(ped); G.peds.push(ped);
  }
}

function isDay() { return G.dayT < 120; } // first half of the 240s cycle is day

function pickSidewalkTarget(ped) {
  // a point on a sidewalk near a road
  const road = pick(ROADS);
  const along = rand(-400, 400);
  const side = pick([-8, 8]);
  if (rng() < 0.5) return { x: along, z: road + side };
  return { x: road + side, z: along };
}

export function updatePeds(dt) {
  const p = G.player;
  const day = isDay();
  for (const ped of G.peds) {
    const u = ped.userData;
    // named NPCs, chatting pairs, vendors, event drivers and officers stand
    // where they are (officers are driven by the wanted system, not the walker)
    if (u.kind === 'named' || u.kind === 'chat' || u.kind === 'vendor' || u.kind === 'event' || u.kind === 'officer') {
      ped.rotation.y += Math.sin(G.time * 0.8 + u.phase) * 0.001;
      continue;
    }
    // fleeing from gunfire or a fast car
    if (u.fleeT > 0) {
      u.fleeT -= dt;
      const dx = ped.position.x - p.pos.x, dz = ped.position.z - p.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.position.x += (dx / d) * 3.4 * dt;
      ped.position.z += (dz / d) * 3.4 * dt;
      ped.rotation.y = Math.atan2(dx, dz);
      swing(ped, dt, 3.4);
      continue;
    }
    // routines: re-target when the shift destination changes
    if (u.kind === 'routine' && u.routine) {
      const dest = day ? u.routine.day : u.routine.night;
      if (!u.target || u.target.kind !== (day ? 'day' : 'night')) {
        u.target = { ...dest, kind: day ? 'day' : 'night' };
        u.state = 'walk';
      }
    }
    if (u.state === 'stand') {
      if (rng() < dt * 0.02) { u.state = 'walk'; u.target = pickSidewalkTarget(ped); }
      continue;
    }
    if (!u.target) { u.target = pickSidewalkTarget(ped); }
    const dx = u.target.x - ped.position.x, dz = u.target.z - ped.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      if (rng() < 0.4) { u.state = 'stand'; }
      else u.target = pickSidewalkTarget(ped);
      continue;
    }
    const sp = u.speed;
    ped.position.x += (dx / d) * sp * dt;
    ped.position.z += (dz / d) * sp * dt;
    ped.rotation.y = Math.atan2(dx, dz);
    swing(ped, dt, sp);
  }
}

function swing(ped, dt, speed) {
  const u = ped.userData;
  const s = Math.sin(G.time * 8 * (speed / 1.5) + u.phase) * 0.5;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7;
}

// Every ped within radius of the player runs away (gunfire, car).
export function scarePeds(x, z, radius) {
  for (const ped of G.peds) {
    if (ped.userData.kind === 'named') continue;
    if (dist2(x, z, ped.position.x, ped.position.z) < radius) {
      ped.userData.fleeT = rand(2, 4);
      ped.userData.state = 'walk';
    }
  }
}

export function nearestPed(x, z, maxD) {
  let best = null, bd = maxD;
  for (const ped of G.peds) {
    const d = dist2(x, z, ped.position.x, ped.position.z);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}
