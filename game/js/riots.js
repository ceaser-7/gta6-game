// Riots — a crowd event that erupts at high wanted level or after a
// gang clash. A mob gathers in the nearest district, cars stop, the
// police move in, and it disperses after 45 seconds.
import * as THREE from 'three';
import { G, DISTRICTS, clamp, rand, pick } from './state.js';
import { makePersonMesh } from './people.js';
import { syncPolice } from './police.js';

const RIOT_R = 60;
const RIOT_LEN = 45;
const COOLDOWN = 120;
const RIOTERS = 10;
const RIOT_SPEED = 6.5;
const TRIGGER_PER_SEC = 0.06;

const RIOT_COLORS = [0xc23a3a, 0x3a6ab5, 0x3a8a4a, 0xe8c832, 0x8a2a8a, 0xd8d8d8, 0x5a5a5a, 0xff8a3a];

function nearestDistrict(x, z) {
  let best = DISTRICTS[0];
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (x - d.cx) * (x - d.cx) + (z - d.cz) * (z - d.cz);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

export function initRiots() {
  G.riot = { active: false, cx: 0, cz: 0, radius: RIOT_R, timer: 0, district: '', cooldown: 0, debris: [], stopped: [], spawned: [], throwIn: 0 };
  G.startRiot = startRiot;
}

function spawnRioter(cx, cz) {
  const mesh = makePersonMesh(pick(RIOT_COLORS), pick([0xc89878, 0x8a5a38, 0xe8b890, 0x6a3a22]));
  const a = rand(0, Math.PI * 2);
  const r = rand(2, 20);
  mesh.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
  G.scene.add(mesh);
  const p = {
    mesh, name: 'Rioter', heading: rand(0, Math.PI * 2), speed: RIOT_SPEED,
    state: 'riot', stateT: 999, home: [cx, cz], phase: rand(0, 6),
    dayJob: true, isRioter: true,
  };
  G.peds.push(p);
  G.riot.spawned.push(p);
  return p;
}

export function startRiot(districtName) {
  const riot = G.riot;
  if (!riot || riot.active || !G.player) return false;
  let d = null;
  if (districtName) d = DISTRICTS.find(x => x.name === districtName) || null;
  if (!d) d = nearestDistrict(G.player.pos.x, G.player.pos.z);
  riot.active = true;
  riot.cx = d.cx;
  riot.cz = d.cz;
  riot.district = d.name;
  riot.timer = RIOT_LEN;
  riot.throwIn = 0.5;
  riot.spawned = [];
  // Police move in: wanted at least 3.
  if (G.wanted < 3) G.wanted = 3;
  syncPolice();
  // Ten rioters appear at the centre at once.
  for (let i = 0; i < RIOTERS; i++) spawnRioter(d.cx, d.cz);
  // Cars inside the radius stop dead (cruising speed remembered).
  riot.stopped = [];
  for (const car of G.traffic) {
    const dd = Math.hypot(car.mesh.position.x - d.cx, car.mesh.position.z - d.cz);
    if (dd < RIOT_R) {
      riot.stopped.push({ car, speed: car.targetSpeed });
      car.targetSpeed = 0;
      car.speed = 0;
    }
  }
  if (G.toast) G.toast('RIOT IN ' + d.name.toUpperCase() + ' — the streets are burning.');
  return true;
}

function throwDebris(riot, t) {
  if (!riot.spawned.length) return;
  const from = pick(riot.spawned);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.45, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 })
  );
  box.position.set(from.mesh.position.x, 1.6, from.mesh.position.z);
  const a = rand(0, Math.PI * 2);
  const v = rand(5, 9);
  G.scene.add(box);
  riot.debris.push({ mesh: box, vx: Math.cos(a) * v, vy: rand(4, 7), vz: Math.sin(a) * v });
}

function endRiot() {
  const riot = G.riot;
  // Spawned rioters disperse (removed); bystanders go back to walking.
  for (const p of riot.spawned) {
    G.scene.remove(p.mesh);
    G.peds = G.peds.filter(x => x !== p);
  }
  riot.spawned = [];
  for (const p of G.peds) {
    if (p.state === 'riot') {
      p.state = 'walk';
      p.stateT = rand(2, 5);
    }
  }
  // Cars roll again.
  for (const s of riot.stopped) {
    s.car.targetSpeed = s.speed;
  }
  riot.stopped = [];
  // Debris cleared.
  for (const d of riot.debris) G.scene.remove(d.mesh);
  riot.debris = [];
  riot.active = false;
  riot.cooldown = COOLDOWN;
  if (G.toast) G.toast('The riot in ' + riot.district + ' has dispersed.');
}

function moveRioter(p, riot, dt) {
  // Run in a random direction; bounce off the riot edge.
  const dx = p.mesh.position.x - riot.cx;
  const dz = p.mesh.position.z - riot.cz;
  const d = Math.hypot(dx, dz);
  if (d > riot.radius - 4) {
    // Turn back toward the centre.
    p.heading = Math.atan2(-dx, -dz) + rand(-0.5, 0.5);
  } else if (Math.random() < dt * 0.4) {
    p.heading += rand(-1.2, 1.2);
  }
  const nx = p.mesh.position.x + Math.sin(p.heading) * RIOT_SPEED * dt;
  const nz = p.mesh.position.z + Math.cos(p.heading) * RIOT_SPEED * dt;
  p.mesh.position.x = nx;
  p.mesh.position.z = nz;
  p.mesh.rotation.y = p.heading;
  // Flailing arms and legs.
  p.phase += dt * 14;
  p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.9;
  p.mesh.userData.legR.rotation.x = -Math.sin(p.phase) * 0.9;
  p.mesh.userData.armL.rotation.x = Math.sin(p.phase * 1.3) * 1.2;
  p.mesh.userData.armR.rotation.x = -Math.sin(p.phase * 1.3) * 1.2;
}

export function updateRiot(dt, t) {
  const riot = G.riot;
  if (!riot) return;
  if (!riot.active) {
    // Cooldown ticks down; a riot may spark when the heat is high.
    if (riot.cooldown > 0) riot.cooldown -= dt;
    if (riot.cooldown <= 0 && G.player) {
      const heat = (G.gangs && G.gangs.heat) || 0;
      if ((G.wanted >= 4 || heat >= 4) && Math.random() < TRIGGER_PER_SEC * dt) {
        startRiot();
      }
    }
    return;
  }
  riot.timer -= dt;
  if (riot.timer <= 0) {
    endRiot();
    return;
  }
  // The mob grows as the riot goes on: two more rioters every 10s, up to 16.
  riot.growIn = (riot.growIn ?? 10) - dt;
  if (riot.growIn <= 0) {
    riot.growIn = 10;
    if (riot.spawned.length < 16) {
      spawnRioter(riot.cx, riot.cz);
      spawnRioter(riot.cx, riot.cz);
    }
  }
  // Bystanders inside the radius join the mob.
  for (const p of G.peds) {
    if (p.isRioter) continue;
    const d = Math.hypot(p.mesh.position.x - riot.cx, p.mesh.position.z - riot.cz);
    if (d < riot.radius) {
      p.state = 'riot';
      p.stateT = 999;
    } else if (p.state === 'riot') {
      p.state = 'walk';
      p.stateT = rand(2, 5);
    }
  }
  // Every rioter runs and flails.
  for (const p of G.peds) {
    if (p.state === 'riot') moveRioter(p, riot, dt);
  }
  // Occasionally someone hurls debris.
  riot.throwIn -= dt;
  if (riot.throwIn <= 0) {
    riot.throwIn = rand(0.5, 1.4);
    throwDebris(riot, t);
  }
  // Debris arcs and vanishes on landing.
  for (let i = riot.debris.length - 1; i >= 0; i--) {
    const d = riot.debris[i];
    d.vy -= 9.8 * dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.position.z += d.vz * dt;
    d.mesh.rotation.x += dt * 6;
    d.mesh.rotation.z += dt * 4;
    if (d.mesh.position.y <= 0.25) {
      G.scene.remove(d.mesh);
      riot.debris.splice(i, 1);
    }
  }
}
