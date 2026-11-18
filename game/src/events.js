// Porto Verde — street events: fender-benders and police stops that appear
// on the road near the player, last ~40 s, then clear. All original.
import { G, rand, pick, roadPoint } from './util.js';
import { makeCar, makePoliceCar } from './vehicles.js';
import { addPed } from './peds.js';
import { toast } from './hud.js';

export function updateEvents(dt) {
  if (G.interior) return;
  if (G.event) {
    G.event.t -= dt;
    if (G.event.t <= 0) clearEvent();
    return;
  }
  G.eventT -= dt;
  if (G.eventT > 0) return;
  G.eventT = rand(45, 75);
  spawnEvent();
}

function nearPlayerRoad() {
  const px = G.player ? G.player.position.x : 0;
  const pz = G.player ? G.player.position.z : 0;
  const p = roadPoint(px + rand(-100, 100), pz + rand(-100, 100));
  return { x: Math.max(-420, Math.min(420, p.x)), z: Math.max(-420, Math.min(420, p.z)) };
}

function spawnEvent() {
  const kind = Math.random() < 0.6 ? 'fender' : 'stop';
  const spot = nearPlayerRoad();
  const cars = [], peds = [];
  if (kind === 'fender') {
    const c1 = makeCar('sedan');
    c1.position.set(spot.x, 0, spot.z); c1.rotation.y = rand(0, Math.PI * 2);
    const c2 = makeCar('suv');
    c2.position.set(spot.x + 3, 0, spot.z + 2); c2.rotation.y = c1.rotation.y + 0.4;
    G.scene.add(c1); G.scene.add(c2);
    cars.push(c1, c2);
    const d = addPed('Vic', spot.x + 2, spot.z + 4, 'event');
    peds.push(d);
    toast('A fender-bender up ahead. Two drivers are arguing.');
  } else {
    const pc = makePoliceCar();
    pc.position.set(spot.x, 0, spot.z); pc.rotation.y = rand(0, Math.PI * 2);
    const c = makeCar('sedan');
    c.position.set(spot.x + 4, 0, spot.z + 1); c.rotation.y = pc.rotation.y;
    G.scene.add(pc); G.scene.add(c);
    cars.push(pc, c);
    const d = addPed('Vic', spot.x + 2, spot.z + 3, 'event');
    peds.push(d);
    toast('A police stop up ahead. Best keep driving.');
  }
  G.event = { kind, cars, peds, t: 40, x: spot.x, z: spot.z };
}

function clearEvent() {
  const ev = G.event;
  if (!ev) return;
  for (const car of ev.cars) {
    if (G.playerCar === car) continue;
    G.scene.remove(car);
    const i = G.cars.indexOf(car);
    if (i >= 0) G.cars.splice(i, 1);
  }
  for (const ped of ev.peds) {
    G.scene.remove(ped.mesh);
    const i = G.peds.indexOf(ped);
    if (i >= 0) G.peds.splice(i, 1);
  }
  G.event = null;
}
