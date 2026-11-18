// Riots — a crowd event that erupts at high wanted level or after a gang
// clash. Pedestrians in the district switch to riot behaviour (running,
// shouting, throwing debris), cars stop, and police move in. The riot has
// a centre, a radius and a duration; it ends when the timer runs out.
// Written fresh for v3.
import * as THREE from 'three';
import { G, WORLD, DISTRICTS, rand, randi, pick } from './state.js';
import { syncPolice } from './police.js';
import { makePersonMesh } from './people.js';

const RIOT_RADIUS = 60;
const RIOT_DURATION = 45;
const RIOT_COOLDOWN = 120;
const RIOT_RUN_SPEED = 6.5;
const DEBRIS_EVERY = 0.4;

export function initRiots() {
  G.riot = { active: false, cx: 0, cz: 0, radius: RIOT_RADIUS, timer: 0, district: '', cooldown: 30, debris: [], stopped: [], throwIn: 0 };
  // Exposed on the shared state so the job board / debug console can
  // start one directly; the game itself triggers it from wanted / heat.
  G.startRiot = startRiot;
}

function nearestDistrict(x, z) {
  let best = DISTRICTS[0];
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = Math.hypot(x - d.cx, z - d.cz);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

export function startRiot(districtName) {
  if (!G.player || G.riot.active) return false;
  const d = districtName
    ? DISTRICTS.find(x => x.name === districtName) || nearestDistrict(G.player.pos.x, G.player.pos.z)
    : nearestDistrict(G.player.pos.x, G.player.pos.z);
  G.riot.active = true;
  G.riot.cx = d.cx;
  G.riot.cz = d.cz;
  G.riot.radius = RIOT_RADIUS;
  G.riot.timer = RIOT_DURATION;
  G.riot.district = d.name;
  // Police move in: raise the heat so units spawn near the player (who is
  // next to the riot centre) and the helicopter comes at wanted 4+.
  if (G.wanted < 3) G.wanted = 3;
  syncPolice();
  // A crowd gathers at once: spawn rioters at the centre so the riot is
  // visible the moment it erupts, not only when pedestrians wander in.
  // They disperse into ordinary pedestrians when the riot ends.
  for (let i = 0; i < 10; i++) {
    const x = d.cx + rand(-30, 30), z = d.cz + rand(-30, 30);
    const mesh = makePersonMesh(pick([0xc23a3a, 0x3a6ab5, 0x8a2a8a, 0xd8d8d8]), pick([0xc89878, 0x8a5a38, 0xe8b890, 0x6a3a22]));
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({ mesh, name: 'Rioter', heading: rand(0, Math.PI * 2), speed: rand(1.2, 2.4), state: 'riot', stateT: 999, home: [x, z], phase: rand(0, 6), dayJob: false });
  }
  // Cars inside the radius stop dead; remember their cruising speed.
  for (const car of G.traffic) {
    if (!car.traffic) continue;
    if (Math.hypot(car.mesh.position.x - d.cx, car.mesh.position.z - d.cz) < RIOT_RADIUS) {
      G.riot.stopped.push({ car, speed: car.targetSpeed });
      car.targetSpeed = 0;
    }
  }
  if (G.toast) G.toast('RIOT IN ' + d.name.toUpperCase() + ' — the streets are burning. Stay clear or wade in.');
  if (G.updateHUD) G.updateHUD();
  return true;
}

function endRiot() {
  const r = G.riot;
  // Pedestrians go back to their day.
  for (const p of G.peds) {
    if (p.state === 'riot') {
      p.state = 'walk';
      p.stateT = rand(2, 6);
      p.heading = rand(0, Math.PI * 2);
    }
  }
  // Cars roll again.
  for (const s of r.stopped) s.car.targetSpeed = s.speed;
  r.stopped = [];
  // Clear thrown debris.
  for (const d of r.debris) G.scene.remove(d.mesh);
  r.debris = [];
  r.active = false;
  r.cooldown = RIOT_COOLDOWN;
  if (G.toast) G.toast('The riot in ' + r.district + ' has dispersed.');
  if (G.updateHUD) G.updateHUD();
}

function throwDebris() {
  const rioters = G.peds.filter(p => p.state === 'riot');
  if (!rioters.length) return;
  const from = pick(rioters);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 })
  );
  const sx = from.mesh.position.x, sz = from.mesh.position.z;
  const tx = sx + rand(-16, 16), tz = sz + rand(-16, 16);
  mesh.position.set(sx, 1.2, sz);
  G.scene.add(mesh);
  G.riot.debris.push({ mesh, sx, sz, tx, tz, t: 0, dur: rand(0.7, 1.1) });
}

export function updateRiot(dt, t) {
  if (!G.riot || !G.running || !G.player) return;
  const r = G.riot;
  if (!r.active) {
    r.cooldown -= dt;
    // Spark: high wanted, or gang heat boiling over after a clash.
    const spark = (G.wanted >= 4 || (G.gangs && G.gangs.heat >= 4)) && r.cooldown <= 0;
    if (spark && Math.random() < dt * 0.06) startRiot();
    return;
  }
  r.timer -= dt;
  if (r.timer <= 0) { endRiot(); return; }
  // Pedestrians inside the radius join the riot: they run, shout, throw.
  for (const p of G.peds) {
    const d = Math.hypot(p.mesh.position.x - r.cx, p.mesh.position.z - r.cz);
    if (d < r.radius && p.state !== 'riot') {
      p.state = 'riot';
      p.stateT = 999;
      p.heading = rand(0, Math.PI * 2);
    }
    if (p.state === 'riot') {
      // Run in a random direction; bounce off the riot edge.
      const nx = p.mesh.position.x + Math.sin(p.heading) * RIOT_RUN_SPEED * dt;
      const nz = p.mesh.position.z + Math.cos(p.heading) * RIOT_RUN_SPEED * dt;
      const nd = Math.hypot(nx - r.cx, nz - r.cz);
      if (nd > r.radius) {
        p.heading += Math.PI / 2 + rand(-0.6, 0.6);
      } else {
        p.mesh.position.x = nx;
        p.mesh.position.z = nz;
        p.phase += dt * 9;
        p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.7;
        p.mesh.userData.legR.rotation.x = -Math.sin(p.phase) * 0.7;
        p.mesh.userData.armL.rotation.x = -Math.sin(p.phase) * 0.7;
        p.mesh.userData.armR.rotation.x = Math.sin(p.phase) * 0.7;
      }
      p.mesh.rotation.y = p.heading;
      if (Math.random() < dt * 0.12) p.heading += rand(-1.2, 1.2);
    }
  }
  // Thrown debris arcs through the crowd.
  r.throwIn -= dt;
  if (r.throwIn <= 0) {
    r.throwIn = DEBRIS_EVERY;
    throwDebris();
  }
  for (let i = r.debris.length - 1; i >= 0; i--) {
    const d = r.debris[i];
    d.t += dt;
    const k = Math.min(1, d.t / d.dur);
    d.mesh.position.x = d.sx + (d.tx - d.sx) * k;
    d.mesh.position.z = d.sz + (d.tz - d.sz) * k;
    d.mesh.position.y = 1.2 + Math.sin(k * Math.PI) * 4;
    d.mesh.rotation.x += dt * 6;
    if (k >= 1) {
      G.scene.remove(d.mesh);
      r.debris.splice(i, 1);
    }
  }
}
