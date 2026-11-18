// Side Jobs — repeatable street work between story missions.
// Three kinds: Taxi Fare, Courier Delivery, Vigilante takedown.
// Each job is a small state machine: available -> active -> done / failed.
// A job's timer starts when it is accepted, so the player pays for the
// drive to the pickup as well as the run itself — the clock is tight
// enough that a careless drive fails. Written fresh for v3.
import * as THREE from 'three';
import { G, WORLD, clamp, rand, randi, pick, dist2, fmtCash, PED_NAMES } from './state.js';
import { SPOTS } from './missions.js';
import { spawnCar, clampToIsland } from './vehicles.js';

// Named spots a job can use. The two interior/vendor spots (El Faro,
// Sunray Garage) are left out so a job pickup never sits on a shop door.
const JOB_SPOTS = ['plaza', 'marina', 'oldtown', 'northside', 'southbeach', 'safehouse', 'causeway', 'hospital', 'tower'];

const KINDS = {
  taxi:      { label: 'Taxi Fare',        color: 0xffd76a, css: '#ffd76a', base: 80,  respect: 8 },
  courier:   { label: 'Courier Delivery', color: 0x4dd0e1, css: '#4dd0e1', base: 70,  respect: 6 },
  vigilante: { label: 'Vigilante',        color: 0xff5a5a, css: '#ff5a5a', base: 150, respect: 12 },
};

const BOARD_SIZE = 3;      // jobs on the board at a time
const RESPAWN_DELAY = 8;   // seconds after a job ends before a replacement appears
const PICKUP_R = 6;        // accept radius at a pickup point
const DROP_R = 8;          // complete radius at a destination
const VIG_CLOSE = 14;      // stay inside this range to build the bust meter
const VIG_RAM = 4;         // ramming the target busts it at once
const VIG_BUST_TIME = 1.5; // seconds inside VIG_CLOSE to bust — the chase is the challenge, not the hold
const VIG_LIMIT = 75;      // vigilante time limit (seconds)
const VIG_SPEED = 17;      // flee-car speed (m/s)

// ---- 3D marker: a spinning diamond over a light beam ----
function makeJobMarker(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), mat);
  gem.position.y = 3.2;
  g.add(gem);
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 34, 10, 1, true), beamMat);
  beam.position.y = 17;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.1, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  g.userData.gem = gem;
  g.userData.beam = beam;
  return g;
}

function spotPoint(key) {
  const s = SPOTS[key];
  return { x: s[0], z: s[1], name: s[2] };
}

function farSpot(fromKey) {
  // A different spot, at least 80m away, so the run is a real drive.
  let key = pick(JOB_SPOTS);
  let guard = 0;
  while ((key === fromKey || Math.hypot(SPOTS[key][0] - SPOTS[fromKey][0], SPOTS[key][1] - SPOTS[fromKey][1]) < 80) && guard++ < 20) {
    key = pick(JOB_SPOTS);
  }
  return spotPoint(key);
}

function makeJob(kind) {
  const k = KINDS[kind];
  const id = 'sj' + (++G.sideJobs.seq) + '-' + kind;
  const pickupKey = pick(JOB_SPOTS);
  const pickup = spotPoint(pickupKey);
  const job = {
    id, kind, label: k.label, color: k.color, css: k.css,
    state: 'available', phase: 'pickup',
    pickup, dest: null, reward: k.base, respect: k.respect,
    timer: 0, limit: 0, bust: 0, target: null, marker: null,
    passenger: '', dist: 0,
  };
  if (kind === 'taxi') {
    job.dest = farSpot(pickupKey);
    job.passenger = pick(PED_NAMES);
    job.dist = Math.round(Math.hypot(job.dest.x - pickup.x, job.dest.z - pickup.z));
    job.reward = k.base + Math.min(60, Math.round(job.dist / 10));
  } else if (kind === 'courier') {
    job.dest = farSpot(pickupKey);
    job.dist = Math.round(Math.hypot(job.dest.x - pickup.x, job.dest.z - pickup.z));
    job.reward = k.base + Math.min(40, Math.round(job.dist / 12));
  } else {
    // Vigilante: the target waits near the pickup spot, then runs.
    job.dest = null;
    job.dist = 0;
    job.reward = k.base;
  }
  job.marker = makeJobMarker(k.color);
  job.marker.position.set(pickup.x, 0, pickup.z);
  G.scene.add(job.marker);
  return job;
}

function dropJob(job) {
  if (job.marker) {
    G.scene.remove(job.marker);
    job.marker = null;
  }
  if (job.target) {
    G.scene.remove(job.target.mesh);
    job.target = null;
  }
}

function refillBoard() {
  const kinds = ['taxi', 'taxi', 'courier', 'courier', 'vigilante'];
  // Guarantee variety: one of each kind on the board when refilling, so
  // the player always has a real choice (and a Vigilante to chase).
  const present = new Set(G.sideJobs.available.map(j => j.kind));
  for (const k of ['taxi', 'courier', 'vigilante']) {
    if (G.sideJobs.available.length >= BOARD_SIZE) break;
    if (!present.has(k)) {
      G.sideJobs.available.push(makeJob(k));
      present.add(k);
    }
  }
  while (G.sideJobs.available.length < BOARD_SIZE) {
    G.sideJobs.available.push(makeJob(pick(kinds)));
  }
}

export function initSideJobs() {
  G.sideJobs = { available: [], active: null, boardOpen: false, respawnIn: 0, seq: 0 };
  refillBoard();
  const board = document.getElementById('jobBoard');
  if (board) {
    board.addEventListener('click', e => {
      const acc = e.target.closest('[data-accept]');
      if (acc) { acceptSideJob(acc.getAttribute('data-accept')); return; }
      const ab = e.target.closest('[data-abandon]');
      if (ab) abandonSideJob();
      if (e.target.id === 'closeJobBoardBtn') toggleJobBoard();
    });
  }
  renderJobBoard();
}

// ---- Accept / abandon ----
export function acceptSideJob(id) {
  if (!G.sideJobs || G.sideJobs.active) return false;
  const i = G.sideJobs.available.findIndex(j => j.id === id);
  if (i < 0) return false;
  const job = G.sideJobs.available.splice(i, 1)[0];
  // Refill the board at once, so the player always has three jobs to pick
  // from — the replacement does not wait for the respawn timer.
  refillBoard();
  return startJob(job);
}

export function acceptNearestSideJob() {
  const job = nearestSideJob(PICKUP_R);
  if (!job) return false;
  return acceptSideJob(job.id);
}

export function nearestSideJob(maxD) {
  if (!G.sideJobs || !G.player) return null;
  let best = null;
  let bd = maxD;
  for (const j of G.sideJobs.available) {
    const d = Math.hypot(G.player.pos.x - j.pickup.x, G.player.pos.z - j.pickup.z);
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

function startJob(job) {
  const p = G.player;
  job.state = 'active';
  job.phase = 'pickup';
  if (job.kind === 'vigilante') {
    // The target car waits near the pickup, then flees when the job starts.
    const tx = clamp(job.pickup.x + rand(-30, 30), -WORLD.cityHalf + 10, WORLD.cityHalf - 10);
    const tz = clamp(job.pickup.z + rand(-30, 30), -WORLD.cityHalf + 10, WORLD.cityHalf - 10);
    job.target = spawnCar(tx, tz, rand(0, Math.PI * 2), randi(0, 3), {});
    job.target.traffic = false;
    job.limit = VIG_LIMIT;
    job.timer = VIG_LIMIT;
    job.bust = 0;
    job.marker.position.set(tx, 0, tz);
    if (G.toast) G.toast('Vigilante: run down the fleeing car — stay close to bust it, or ram it.');
  } else {
    const leg1 = Math.hypot(p.pos.x - job.pickup.x, p.pos.z - job.pickup.z);
    const leg2 = job.dist;
    // Clock covers both legs; ~12 m/s effective speed + a flat allowance.
    // A car does it comfortably, on foot it is a scramble.
    job.limit = Math.round((leg1 + leg2) / 12) + 20;
    job.timer = job.limit;
    job.marker.position.set(job.pickup.x, 0, job.pickup.z);
    if (job.kind === 'taxi') {
      if (G.toast) G.toast(job.label + ': pick up ' + job.passenger + ' at ' + job.pickup.name + ' — ' + job.limit + 's.');
    } else {
      if (G.toast) G.toast(job.label + ': collect the package at ' + job.pickup.name + ' — ' + job.limit + 's.');
    }
  }
  G.sideJobs.active = job;
  G.sideJobs.respawnIn = RESPAWN_DELAY;
  if (G.updateHUD) G.updateHUD();
  renderJobBoard();
  return true;
}

export function abandonSideJob() {
  const job = G.sideJobs && G.sideJobs.active;
  if (!job) return false;
  dropJob(job);
  G.sideJobs.active = null;
  G.sideJobs.respawnIn = RESPAWN_DELAY;
  if (G.toast) G.toast('Side job abandoned — no pay, no respect.');
  if (G.updateHUD) G.updateHUD();
  renderJobBoard();
  return true;
}

function completeJob(job, bonus, note) {
  const pay = job.reward + bonus;
  G.cash += pay;
  G.respect += job.respect;
  dropJob(job);
  G.sideJobs.active = null;
  G.sideJobs.respawnIn = RESPAWN_DELAY;
  if (G.toast) G.toast(job.label + ' complete! +$' + pay + ' · +' + job.respect + ' Respect' + (note ? ' — ' + note : ''));
  if (G.updateHUD) G.updateHUD();
  renderJobBoard();
}

function failJob(job, why) {
  dropJob(job);
  G.sideJobs.active = null;
  G.sideJobs.respawnIn = RESPAWN_DELAY;
  if (G.toast) G.toast(job.label + ' failed — ' + why + '.');
  if (G.updateHUD) G.updateHUD();
  renderJobBoard();
}

// ---- Job board (J) ----
export function toggleJobBoard() {
  if (!G.sideJobs) return;
  G.sideJobs.boardOpen = !G.sideJobs.boardOpen;
  const el = document.getElementById('jobBoard');
  if (el) el.classList.toggle('hidden', !G.sideJobs.boardOpen);
  if (G.sideJobs.boardOpen) renderJobBoard();
}

export function renderJobBoard() {
  const list = document.getElementById('jobBoardList');
  const act = document.getElementById('jobBoardActive');
  if (!list || !G.sideJobs) return;
  const p = G.player;
  const distTo = j => p ? Math.round(Math.hypot(p.pos.x - j.pickup.x, p.pos.z - j.pickup.z)) + 'm away' : '';
  list.innerHTML = G.sideJobs.available.map(j => {
    const where = j.kind === 'vigilante'
      ? 'Target near ' + j.pickup.name
      : j.pickup.name + ' → ' + (j.dest ? j.dest.name : '');
    return '<div class="job"><div class="t" style="color:' + j.css + '">' + j.label + '</div>' +
      '<div class="s">' + where + ' · ' + distTo(j) + '</div>' +
      '<div class="p">$' + j.reward + ' · +' + j.respect + ' Respect</div>' +
      '<button class="btn" data-accept="' + j.id + '">Accept this job</button></div>';
  }).join('') || '<div class="s">No jobs right now — check back soon.</div>';
  if (act) {
    const a = G.sideJobs.active;
    act.innerHTML = a
      ? '<div class="job active"><div class="t" style="color:' + a.css + '">ACTIVE — ' + a.label + '</div>' +
        '<div class="s">' + jobObjectiveText(a) + ' · ' + Math.ceil(a.timer) + 's left</div>' +
        '<button class="btn" data-abandon="1">Abandon job</button></div>'
      : '<div class="s">No active side job.</div>';
  }
}

function jobObjectiveText(job) {
  if (job.kind === 'vigilante') return 'Bust the fleeing car';
  if (job.phase === 'pickup') return 'Go to ' + job.pickup.name;
  return 'Deliver to ' + job.dest.name;
}

// ---- Map / HUD helpers (read by hud.js, no import cycle: state lives on G) ----
export function sideJobTargets() {
  if (!G.sideJobs) return [];
  const out = [];
  for (const j of G.sideJobs.available) {
    out.push({ x: j.pickup.x, z: j.pickup.z, color: j.css, big: false });
  }
  const a = G.sideJobs.active;
  if (a) {
    if (a.kind === 'vigilante' && a.target) {
      out.push({ x: a.target.mesh.position.x, z: a.target.mesh.position.z, color: a.css, big: true });
    } else if (a.phase === 'pickup') {
      out.push({ x: a.pickup.x, z: a.pickup.z, color: a.css, big: true });
    } else if (a.dest) {
      out.push({ x: a.dest.x, z: a.dest.z, color: a.css, big: true });
    }
  }
  return out;
}

// ---- Per-frame update ----
export function updateSideJobs(dt, t) {
  if (!G.sideJobs || !G.running || !G.player) return;
  const sj = G.sideJobs;
  // Replacement jobs.
  if (sj.available.length < BOARD_SIZE) {
    sj.respawnIn -= dt;
    if (sj.respawnIn <= 0) {
      refillBoard();
      renderJobBoard();
    }
  }
  // Marker animation (spin + bob) for every live marker.
  const spin = (m) => {
    if (!m) return;
    m.userData.gem.rotation.y += dt * 2.2;
    m.userData.gem.position.y = 3.2 + Math.sin(t * 2.4) * 0.45;
  };
  for (const j of sj.available) spin(j.marker);
  const job = sj.active;
  if (!job) return;
  spin(job.marker);
  // Wasted mid-job: the job fails.
  if (G.player.health <= 0) { failJob(job, 'you were wasted'); return; }
  job.timer -= dt;
  if (job.timer <= 0) { failJob(job, 'out of time'); return; }
  const p = G.player;
  const px = p.pos.x, pz = p.pos.z;
  if (job.kind === 'vigilante') {
    const car = job.target;
    if (!car) { failJob(job, 'target lost'); return; }
    // Flee: straight away from the player, with a wobble so it is not a rail.
    const dx = car.mesh.position.x - px, dz = car.mesh.position.z - pz;
    const d = Math.hypot(dx, dz) || 1;
    const wx = Math.sin(t * 0.9) * 0.35, wz = Math.cos(t * 0.7) * 0.35;
    let mx = dx / d + wx, mz = dz / d + wz;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const nx = car.mesh.position.x + mx * VIG_SPEED * dt;
    const nz = car.mesh.position.z + mz * VIG_SPEED * dt;
    const [cx, cz] = clampToIsland(nx, nz, 10);
    car.mesh.position.x = cx; car.mesh.position.z = cz;
    car.heading = Math.atan2(mx, mz);
    car.mesh.rotation.y = car.heading;
    car.speed = VIG_SPEED;
    job.marker.position.set(cx, 0, cz);
    const pd = Math.hypot(px - cx, pz - cz);
    if (pd < VIG_RAM) {
      job.bust = 1;
    } else if (pd < VIG_CLOSE) {
      job.bust += dt / VIG_BUST_TIME;
    } else {
      job.bust = Math.max(0, job.bust - dt * 0.25);
    }
    if (job.bust >= 1) {
      completeJob(job, 0, 'target busted');
      return;
    }
    return;
  }
  // Taxi / Courier: pickup, then dropoff.
  if (job.phase === 'pickup') {
    const d = Math.hypot(px - job.pickup.x, pz - job.pickup.z);
    if (d < PICKUP_R) {
      job.phase = 'dropoff';
      job.marker.position.set(job.dest.x, 0, job.dest.z);
      if (G.toast) {
        if (job.kind === 'taxi') G.toast(job.passenger + ' is in — take them to ' + job.dest.name + '.');
        else G.toast('Package collected — deliver to ' + job.dest.name + '.');
      }
      if (G.updateHUD) G.updateHUD();
    }
  } else {
    const d = Math.hypot(px - job.dest.x, pz - job.dest.z);
    if (d < DROP_R) {
      // Time bonus: what is left on the clock, capped.
      const bonus = job.kind === 'taxi'
        ? Math.min(40, Math.round(job.timer))
        : Math.min(50, Math.round(job.timer * 1.5));
      completeJob(job, bonus, job.kind === 'taxi' ? 'smooth ride' : 'fast delivery');
    }
  }
}
