// Side Jobs — repeatable street work between story missions.
// Written fresh for the v3 top-up: taxi fares, courier deliveries,
// vigilante busts. A job is a small state machine (available -> active
// -> done/failed); the board always holds one of each kind.
import * as THREE from 'three';
import { G, PED_NAMES, clamp, rand, randi, pick } from './state.js';
import { SPOTS } from './missions.js';
import { makePersonMesh } from './people.js';
import { spawnCar, clampToIsland } from './vehicles.js';

// Kind colours (hex for 3D, css for the DOM).
export const JOB_KINDS = {
  taxi: { color: 0xffd76a, css: '#ffd76a', label: 'Taxi Fare' },
  courier: { color: 0x4dd0e1, css: '#4dd0e1', label: 'Courier Delivery' },
  vigilante: { color: 0xff5a5a, css: '#ff5a5a', label: 'Vigilante' },
};

const PICKUP_R = 6;
const DROP_R = 8;
const VIGIL_NEAR = 14;
const VIGIL_RAM = 4;
const BOARD_SIZE = 3;
const REFILL_DELAY = 8;

// Spots a pickup may sit on (no interior/vendor doors).
const JOB_SPOTS = Object.entries(SPOTS).filter(([k]) => k !== 'faro' && k !== 'garage');

function spotPair() {
  for (let tries = 0; tries < 12; tries++) {
    const [ak, a] = pick(JOB_SPOTS);
    const [bk, b] = pick(JOB_SPOTS);
    if (ak === bk) continue;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 80) continue;
    return { fromKey: ak, from: a, toKey: bk, to: b, dist: d };
  }
  return { fromKey: 'plaza', from: SPOTS.plaza, toKey: 'marina', to: SPOTS.marina, dist: Math.hypot(240, 40) };
}

function makeMarker(colorHex) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 40, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 20;
  g.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.2),
    new THREE.MeshBasicMaterial({ color: colorHex })
  );
  gem.position.y = 4;
  g.add(gem);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.35, 8, 24),
    new THREE.MeshBasicMaterial({ color: colorHex })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
  g.userData.gem = gem;
  return g;
}

function buildJob(kind) {
  const pair = spotPair();
  const id = ++G.sideJobs.seq;
  const job = {
    id, kind,
    fromKey: pair.fromKey, toKey: pair.toKey,
    pickup: [pair.from[0], pair.from[1]],
    dest: [pair.to[0], pair.to[1]],
    fromName: pair.from[2], toName: pair.to[2],
    dist: pair.dist,
    reward: 0, respect: 0, timer: 0, limit: 0,
    stage: 'pickup', bust: 0,
    marker: null, standee: null, targetCar: null,
  };
  if (kind === 'taxi') {
    job.passenger = pick(PED_NAMES);
    job.reward = 80 + Math.min(60, Math.round(pair.dist / 8));
    job.respect = 8;
    job.label = 'Taxi Fare — ' + job.passenger + ' to ' + pair.to[2];
  } else if (kind === 'courier') {
    job.reward = 70 + Math.min(40, Math.round(pair.dist / 10));
    job.respect = 6;
    job.label = 'Courier Delivery — package to ' + pair.to[2];
  } else {
    job.reward = 150;
    job.respect = 12;
    job.limit = 75;
    job.label = 'Vigilante — bust the runner at ' + pair.from[2];
  }
  return job;
}

function placeStandee(job) {
  // A waiting figure (taxi passenger) or a package (courier) at the pickup.
  if (job.kind === 'taxi') {
    const m = makePersonMesh(pick([0xc23a3a, 0x3a6ab5, 0x3a8a4a, 0xe8c832, 0x8a2a8a, 0xd8d8d8]));
    m.position.set(job.pickup[0], 0, job.pickup[1]);
    m.rotation.y = rand(0, Math.PI * 2);
    G.scene.add(m);
    job.standee = m;
  } else if (job.kind === 'courier') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.9, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 })
    );
    box.position.set(job.pickup[0], 0.45, job.pickup[1]);
    G.scene.add(box);
    job.standee = box;
  }
}

function clearStandee(job) {
  if (job.standee) {
    G.scene.remove(job.standee);
    job.standee = null;
  }
}

function clearMarker(job) {
  if (job.marker) {
    G.scene.remove(job.marker);
    job.marker = null;
  }
}

function dropTargetCar(job) {
  if (job.targetCar) {
    G.scene.remove(job.targetCar.mesh);
    job.targetCar = null;
  }
}

function refillBoard() {
  const sj = G.sideJobs;
  const have = new Set(sj.available.map(j => j.kind));
  for (const kind of ['taxi', 'courier', 'vigilante']) {
    if (!have.has(kind) && sj.available.length < BOARD_SIZE) {
      sj.available.push(buildJob(kind));
    }
  }
  while (sj.available.length < BOARD_SIZE) {
    sj.available.push(buildJob(pick(['taxi', 'courier', 'vigilante'])));
  }
}

export function initSideJobs() {
  G.sideJobs = { available: [], active: null, boardOpen: false, respawnIn: 0, seq: 0 };
  refillBoard();
  // Job board click delegation (accept / abandon / close).
  const board = document.getElementById('jobBoard');
  if (board) {
    board.addEventListener('click', e => {
      const acc = e.target.closest('[data-accept]');
      if (acc) { acceptSideJob(+acc.dataset.accept); return; }
      const ab = e.target.closest('[data-abandon]');
      if (ab) { abandonJob(); return; }
      if (e.target.closest('[data-close]')) toggleJobBoard();
    });
  }
}

function startJob(job) {
  const sj = G.sideJobs;
  const p = G.player;
  sj.active = job;
  if (job.kind === 'vigilante') {
    job.timer = job.limit;
    job.stage = 'chase';
    // The runner waits by the pickup, then flees once the job starts.
    const car = spawnCar(job.pickup[0] + rand(-6, 6), job.pickup[1] + rand(-6, 6), rand(0, Math.PI * 2), 1, {});
    car.traffic = false;
    car.fleeSpeed = 17;
    job.targetCar = car;
    job.marker = makeMarker(JOB_KINDS.vigilante.color);
    job.marker.position.set(job.targetCar.mesh.position.x, 0, job.targetCar.mesh.position.z);
    G.scene.add(job.marker);
    if (G.toast) G.toast('Vigilante — stay close to bust the runner, or ram them!');
  } else {
    const d1 = Math.hypot(p.pos.x - job.pickup[0], p.pos.z - job.pickup[1]);
    job.limit = Math.round((d1 + job.dist) / 12) + 20;
    job.timer = job.limit;
    job.stage = 'pickup';
    placeStandee(job);
    job.marker = makeMarker(JOB_KINDS[job.kind].color);
    job.marker.position.set(job.pickup[0], 0, job.pickup[1]);
    G.scene.add(job.marker);
    if (G.toast) G.toast(job.label + ' — ' + job.limit + 's. Get to the pickup!');
  }
  renderJobBoard();
  if (G.updateHUD) G.updateHUD();
}

export function acceptSideJob(id) {
  const sj = G.sideJobs;
  if (!sj || sj.active) return false;
  const idx = sj.available.findIndex(j => j.id === id);
  if (idx < 0) return false;
  const job = sj.available.splice(idx, 1)[0];
  // Refill immediately so there are always three to pick from.
  refillBoard();
  startJob(job);
  return true;
}

export function nearestSideJob(maxD) {
  const sj = G.sideJobs;
  if (!sj || sj.active) return null;
  const p = G.player;
  let best = null;
  let bd = maxD;
  for (const j of sj.available) {
    const d = Math.hypot(p.pos.x - j.pickup[0], p.pos.z - j.pickup[1]);
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

export function acceptNearestSideJob() {
  const job = nearestSideJob(PICKUP_R);
  if (job) return acceptSideJob(job.id);
  return false;
}

function endJob(pay, respect, bonus, msg) {
  const sj = G.sideJobs;
  const job = sj.active;
  if (!job) return;
  clearMarker(job);
  clearStandee(job);
  dropTargetCar(job);
  sj.active = null;
  sj.respawnIn = REFILL_DELAY;
  if (pay > 0) {
    G.cash += pay + bonus;
    G.respect += respect;
    if (G.toast) G.toast(msg + ' +$' + (pay + bonus) + ' · +' + respect + ' Respect');
  } else if (G.toast) {
    G.toast(msg);
  }
  renderJobBoard();
  if (G.updateHUD) G.updateHUD();
  if (G.saveGame) G.saveGame();
}

function completeJob() {
  const job = G.sideJobs.active;
  if (!job) return;
  let bonus = 0;
  if (job.kind === 'taxi') bonus = Math.min(40, Math.round(job.timer));
  else if (job.kind === 'courier') bonus = Math.min(50, Math.round(job.timer * 1.5));
  const label = job.kind === 'vigilante' ? 'Runner busted!' : job.label.split(' — ')[0] + ' complete!';
  endJob(job.reward, job.respect, bonus, label);
}

function failJob(reason) {
  endJob(0, 0, 0, 'Side job failed — ' + reason + '.');
}

export function abandonJob() {
  if (!G.sideJobs.active) return;
  endJob(0, 0, 0, 'Side job abandoned.');
}

// ---- Per-frame logic ----
export function updateSideJobs(dt, t) {
  const sj = G.sideJobs;
  if (!sj || !G.player) return;
  // Refill the board a few seconds after a job ends.
  if (!sj.active && sj.available.length < BOARD_SIZE) {
    sj.respawnIn -= dt;
    if (sj.respawnIn <= 0) refillBoard();
  }
  const job = sj.active;
  if (!job) return;
  const p = G.player;
  job.timer -= dt;
  if (job.timer <= 0) {
    failJob('time ran out');
    return;
  }
  // Keep the open board's active-job timer counting down live.
  if (sj.boardOpen) {
    sj.boardTick = (sj.boardTick || 0) + dt;
    if (sj.boardTick >= 1) {
      sj.boardTick = 0;
      renderJobBoard();
    }
  }
  // Marker spin + bob, and a pulse when the player is close to the goal.
  if (job.marker) {
    const gem = job.marker.userData.gem;
    if (gem) {
      gem.rotation.y += dt * 2.2;
      gem.position.y = 4 + Math.sin(t * 2) * 0.4;
      const goal = job.kind === 'vigilante' && job.targetCar
        ? [job.targetCar.mesh.position.x, job.targetCar.mesh.position.z]
        : job.stage === 'deliver' ? job.dest : job.pickup;
      const gd = Math.hypot(p.pos.x - goal[0], p.pos.z - goal[1]);
      const pulse = gd < 15 ? 1 + Math.sin(t * 6) * 0.25 : 1;
      gem.scale.set(pulse, pulse, pulse);
    }
  }
  if (job.kind === 'vigilante') {
    const car = job.targetCar;
    if (!car) { failJob('the runner vanished'); return; }
    // Flee: drive away from the player at 17 m/s.
    const dx = car.mesh.position.x - p.pos.x;
    const dz = car.mesh.position.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    car.heading = Math.atan2(dx / d, dz / d);
    const nx = car.mesh.position.x + Math.sin(car.heading) * car.fleeSpeed * dt;
    const nz = car.mesh.position.z + Math.cos(car.heading) * car.fleeSpeed * dt;
    const [cx, cz] = clampToIsland(nx, nz, 10);
    car.mesh.position.x = cx;
    car.mesh.position.z = cz;
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.fleeSpeed * dt * 2;
    // Marker rides the target car.
    if (job.marker) job.marker.position.set(cx, 0, cz);
    // Bust: close = build fast, ram = instant, far = slow decay.
    if (d < VIGIL_RAM) {
      job.bust = 1;
    } else if (d < VIGIL_NEAR) {
      job.bust = Math.min(1, job.bust + dt / 1.5);
    } else {
      job.bust = Math.max(0, job.bust - dt * 0.2);
    }
    if (job.bust >= 1) { completeJob(); return; }
    return;
  }
  // Taxi / courier: pickup stage, then deliver stage.
  if (job.stage === 'pickup') {
    const d = Math.hypot(p.pos.x - job.pickup[0], p.pos.z - job.pickup[1]);
    if (d < PICKUP_R) {
      job.stage = 'deliver';
      clearStandee(job);
      if (job.marker) job.marker.position.set(job.dest[0], 0, job.dest[1]);
      if (G.toast) G.toast(job.kind === 'taxi' ? job.passenger + ' is in — drive to ' + job.toName + '!' : 'Package collected — deliver to ' + job.toName + '!');
    }
  } else {
    const d = Math.hypot(p.pos.x - job.dest[0], p.pos.z - job.dest[1]);
    if (d < DROP_R) { completeJob(); return; }
  }
}

// ---- Map / minimap targets ----
export function sideJobTargets() {
  const sj = G.sideJobs;
  if (!sj) return [];
  const out = [];
  for (const j of sj.available) {
    out.push({ x: j.pickup[0], z: j.pickup[1], color: JOB_KINDS[j.kind].css, big: false, label: JOB_KINDS[j.kind].label });
  }
  const a = sj.active;
  if (a) {
    let x = a.pickup[0];
    let z = a.pickup[1];
    if (a.kind === 'vigilante' && a.targetCar) {
      x = a.targetCar.mesh.position.x;
      z = a.targetCar.mesh.position.z;
    } else if (a.stage === 'deliver') {
      x = a.dest[0];
      z = a.dest[1];
    }
    out.push({ x, z, color: JOB_KINDS[a.kind].css, big: true, label: a.label });
  }
  return out;
}

// ---- Job board UI ----
export function toggleJobBoard() {
  const sj = G.sideJobs;
  if (!sj) return;
  sj.boardOpen = !sj.boardOpen;
  const el = document.getElementById('jobBoard');
  if (el) el.classList.toggle('hidden', !sj.boardOpen);
  if (sj.boardOpen) renderJobBoard();
}

export function renderJobBoard() {
  const sj = G.sideJobs;
  if (!sj) return;
  const act = document.getElementById('jobBoardActive');
  const list = document.getElementById('jobBoardList');
  if (!act || !list) return;
  const a = sj.active;
  if (a) {
    const obj = a.kind === 'vigilante'
      ? 'Bust the runner — bust ' + Math.round(a.bust * 100) + '%'
      : a.stage === 'pickup' ? 'Pick up at ' + a.fromName : 'Deliver to ' + a.toName;
    act.innerHTML = '<div class="jb-active"><div class="t">' + a.label + '</div><div class="s">' + obj + '</div><div class="s">⏱ ' + Math.ceil(a.timer) + 's left · $' + a.reward + ' · +' + a.respect + ' Respect</div><button class="btn" data-abandon="1">Abandon job</button></div>';
  } else {
    act.innerHTML = '<div class="jb-none">No active job. Pick one below — or walk to a marker and press E.</div>';
  }
  list.innerHTML = sj.available.map(j => {
    const kind = JOB_KINDS[j.kind];
    const route = j.kind === 'vigilante' ? j.fromName + ' · 75s limit' : j.fromName + ' → ' + j.toName + ' · ' + Math.round(j.dist) + 'm';
    return '<div class="jb-job"><div class="t"><span class="dot" style="background:' + kind.css + '"></span>' + kind.label + '</div>' +
      '<div class="s">' + route + '</div>' +
      '<div class="s">$' + j.reward + ' · +' + j.respect + ' Respect</div>' +
      '<button class="btn" data-accept="' + j.id + '">Accept</button></div>';
  }).join('');
}
