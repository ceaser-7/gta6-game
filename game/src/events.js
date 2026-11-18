// Porto Verde — living world: street events (fender-bender / police stop).
import * as THREE from '../vendor/three.module.min.js';
import { G, rand, choice, dist } from './state.js';
import { spawnCar, removeCar } from './cars.js';
import { spawnPed } from './traffic.js';

export function updateEvents(dt) {
  if (G.interior) return;
  if (G.streetEvent) {
    G.streetEvent.t -= dt;
    if (G.streetEvent.t <= 0) clearEvent();
    return;
  }
  G.eventTimer -= dt;
  if (G.eventTimer > 0) return;
  G.eventTimer = rand(45, 75);
  spawnEvent();
}

function spawnEvent() {
  const p = G.player;
  const a = rand(Math.PI * 2);
  const x = Math.max(-400, Math.min(400, p.x + Math.sin(a) * rand(30, 60)));
  const z = Math.max(-400, Math.min(400, p.z + Math.cos(a) * rand(30, 60)));
  const kind = Math.random() < 0.6 ? 'fender' : 'stop';
  const cars = [];
  const peds = [];
  if (kind === 'fender') {
    cars.push(spawnCar('sedan', x - 3, z, 0.3, { parked: true }));
    cars.push(spawnCar('suv', x + 3, z + 2, -0.4, { parked: true }));
    const d = spawnPed(x, z + 5, { name: 'Vic ' + (G.peds.length + 1) });
    d.eventPed = true; peds.push(d);
    G.ui.toast && G.ui.toast('A fender-bender up ahead — two drivers arguing.');
  } else {
    const cop = spawnCar('sedan', x, z, 0, { parked: true, police: true, color: 0x1a2a4a });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bar.position.y = 1.55; cop.mesh.add(bar);
    cars.push(cop);
    const d = spawnPed(x + 3, z + 3, { name: 'Vic ' + (G.peds.length + 1) });
    d.eventPed = true; peds.push(d);
    G.ui.toast && G.ui.toast('A police stop up ahead — an officer is questioning a driver.');
  }
  G.streetEvent = { kind, cars, peds, t: 40 };
}

function clearEvent() {
  const ev = G.streetEvent;
  if (!ev) return;
  for (const car of ev.cars) {
    // a stolen event car is not restored
    if (!car.stolen) removeCar(car);
  }
  for (const ped of ev.peds) {
    G.scene.remove(ped.mesh);
    const i = G.peds.indexOf(ped); if (i >= 0) G.peds.splice(i, 1);
  }
  G.streetEvent = null;
}
