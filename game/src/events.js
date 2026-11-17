// A living world: pedestrians with routines and things that happen on their
// own. Routine peds work a shift (market by day, the bar by night) and go home
// when their shift ends. Every minute or so a street event spawns nearby —
// a fender-bender with a complaining driver, or a police stop — and clears
// after a while. (Sol call S5g returned zero text, so the three small
// functions below are written here to the same fixed design.)
import * as THREE from 'three';
import { spawnPed } from './traffic.js';
import { createCar } from './vehicles.js';
import { randomSidewalkPoint } from './city.js';

// Dusk through night to dawn: the day cycle opens at sunset (dayT 0).
export function isNight(dayT) {
  return dayT >= 0.1 && dayT < 0.55;
}

// A road point near the player for a street event: on a street centreline
// (multiples of 54, lane offset 3.2), within 120 units, never within 25.
export function pickEvent(rng, px, pz) {
  const type = rng() < 0.6 ? 'fender' : 'stop';
  for (let tries = 0; tries < 12; tries++) {
    const street = (Math.floor(rng() * 15) - 7) * 54;
    const along = (rng() - 0.5) * 2 * 378;
    const lane = (rng() < 0.5 ? -1 : 1) * 3.2;
    const x = rng() < 0.5 ? street + lane : along;
    const z = rng() < 0.5 ? along : street + lane;
    const cx = Math.max(-400, Math.min(400, x));
    const cz = Math.max(-400, Math.min(400, z));
    if (Math.hypot(cx - px, cz - pz) > 25 && Math.hypot(cx - px, cz - pz) < 130) {
      return { type, x: cx, z: cz };
    }
  }
  return { type, x: px + 60, z: pz };
}

// Where a routine ped should be: home, work, or just walking.
export function routineTarget(ped, dayT) {
  if (!ped.routine) return 'walk';
  const night = isNight(dayT);
  if (ped.routine.shift === 'both') return 'walk';
  if (ped.routine.shift === 'day') return night ? 'home' : 'work';
  return night ? 'work' : 'home'; // night shift
}

export function createEvents(G) {
  G.eventTimer = 30; // first street event 30 s into the run
  G.activeEvent = null;
  // routine peds: 4 market workers (day shift, Old Town market) and
  // 4 night crowd (night shift, by the El Faro bar in Old Town)
  const market = { x: -264, z: 258 };
  const bar = { x: -54, z: 120 };
  for (let i = 0; i < 4; i++) {
    const home = randomSidewalkPoint(G.rng);
    const ped = spawnPed(G, home.x, home.z, null, { routine: { shift: 'day', home, work: { x: market.x + (G.rng() - 0.5) * 14, z: market.z + (G.rng() - 0.5) * 14 } } });
    ped.state = 'walk';
  }
  for (let i = 0; i < 4; i++) {
    const home = randomSidewalkPoint(G.rng);
    const ped = spawnPed(G, home.x, home.z, null, { routine: { shift: 'night', home, work: { x: bar.x + (G.rng() - 0.5) * 12, z: bar.z + (G.rng() - 0.5) * 12 } } });
    ped.state = 'walk';
  }
}

function makeOfficer(G, x, z) {
  const ped = spawnPed(G, x, z, null, { stand: true });
  ped.state = 'officer';
  ped.group.children[2].material = new THREE.MeshLambertMaterial({ color: 0x1c2f5e });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x101a30 }));
  cap.position.y = 1.52;
  ped.group.add(cap);
  return ped;
}

function spawnEvent(G) {
  const ev = pickEvent(G.rng, G.player.pos.x, G.player.pos.z);
  const cars = G.traffic.filter(c => c.driver === 'traffic');
  if (cars.length < 2) return;
  const active = { type: ev.type, timer: 40, cars: [], ped: null, officer: null, policeCar: null };
  if (ev.type === 'fender') {
    const a = cars[0], b = cars[1];
    a.driver = 'event'; b.driver = 'event';
    a.pos.set(ev.x, 0, ev.z); a.angle = G.rng() * Math.PI * 2; a.group.rotation.y = a.angle; a.speed = 0;
    b.pos.set(ev.x + 4, 0, ev.z + 2); b.angle = a.angle + 0.7; b.group.rotation.y = b.angle; b.speed = 0;
    active.cars = [a, b];
    const ped = spawnPed(G, ev.x + 2, ev.z - 3, null, { stand: true });
    ped.eventPed = true;
    active.ped = ped;
    G.hud.toast('A crash up ahead — traffic is backing up');
  } else {
    const a = cars[0];
    a.driver = 'event';
    a.pos.set(ev.x, 0, ev.z); a.angle = G.rng() * Math.PI * 2; a.group.rotation.y = a.angle; a.speed = 0;
    active.cars = [a];
    const pc = createCar(G, ev.x - 6, ev.z - 4, a.angle + 0.3, 0, { isPolice: true, driver: 'stop', maxSpeed: 0, accel: 0 });
    pc.speed = 0;
    active.policeCar = pc;
    const off = makeOfficer(G, ev.x + 2, ev.z + 2);
    off.eventPed = true;
    active.officer = off;
    G.hud.toast('Police stop ahead — keep driving');
  }
  G.activeEvent = active;
}

function clearEvent(G) {
  const active = G.activeEvent;
  if (!active) return;
  for (const car of active.cars) {
    // the player may have stolen an event car: leave it alone if so
    if (car.driver === 'event') car.driver = 'traffic';
  }
  if (active.policeCar) {
    G.scene.remove(active.policeCar.group);
    const i = G.cars.indexOf(active.policeCar);
    if (i >= 0) G.cars.splice(i, 1);
  }
  for (const ped of [active.ped, active.officer]) {
    if (!ped) continue;
    G.scene.remove(ped.group);
    const i = G.peds.indexOf(ped);
    if (i >= 0) G.peds.splice(i, 1);
  }
  G.activeEvent = null;
  G.eventTimer = 45 + G.rng() * 30;
}

export function updateEvents(G, dt) {
  if (G.state !== 'playing' || G.hud.dialogOpen) return;
  // --- routines: shift workers walk between home and work by time of day ---
  for (const ped of G.peds) {
    if (!ped.routine || ped.state === 'down' || ped.state === 'flee') continue;
    const where = routineTarget(ped, G.dayT);
    const dest = where === 'home' ? ped.routine.home : where === 'work' ? ped.routine.work : null;
    if (!dest) {
      if (ped.state === 'stand') { ped.state = 'walk'; ped.target = null; }
      continue;
    }
    const d = Math.hypot(ped.pos.x - dest.x, ped.pos.z - dest.z);
    if (d < 2) {
      ped.state = 'stand'; ped.target = null;
    } else if (ped.state === 'stand' || !ped.target) {
      ped.state = 'walk';
      ped.target = { x: dest.x, z: dest.z };
    }
  }
  // --- street events on a timer (never while the player is inside) ---
  if (G.interior) return;
  if (G.activeEvent) {
    G.activeEvent.timer -= dt;
    if (G.activeEvent.timer <= 0) clearEvent(G);
    return;
  }
  G.eventTimer -= dt;
  if (G.eventTimer <= 0) spawnEvent(G);
}
