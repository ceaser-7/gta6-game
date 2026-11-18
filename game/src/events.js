// Porto Verde — living world: street events every 45–75s (a fender-bender or
// a police stop), lasting ~40s, then clearing. If you steal an event car it
// is not restored.
import * as THREE from 'three';
import { G, rand, pick, clamp, dist2 } from './state.js';
import { makeCar } from './vehicles.js';
import { makePed } from './peds.js';

export function updateEvents(dt) {
  G.eventTimer -= dt;
  if (G.eventTimer <= 0) {
    spawnEvent();
    G.eventTimer = rand(45, 75);
  }
  for (let i = G.events.length - 1; i >= 0; i--) {
    const ev = G.events[i];
    ev.left -= dt;
    if (ev.left <= 0) {
      // clear: remove the event's cars/peds unless the player took a car
      for (const car of ev.cars) {
        if (G.player.car === car) continue; // stolen: not restored
        G.scene.remove(car);
        const ci = G.cars.indexOf(car); if (ci >= 0) G.cars.splice(ci, 1);
      }
      for (const ped of ev.peds) {
        G.scene.remove(ped);
        const pi = G.peds.indexOf(ped); if (pi >= 0) G.peds.splice(pi, 1);
      }
      G.events.splice(i, 1);
    }
  }
}

function spawnEvent() {
  const kind = rand() < 0.6 ? 'fender' : 'stop';
  const p = G.player;
  // a spot on a road near the player: pick an axis, put the event on a road line
  const roads = [-390, -325, -260, -195, -130, -65, 0, 65, 130, 195, 260, 325, 390];
  const road = pick(roads);
  const along = clamp((Math.random() < 0.5 ? p.pos.x : p.pos.z) + rand(-80, 80), -400, 400);
  const onX = Math.random() < 0.5;
  const cx = onX ? along : road;
  const cz = onX ? road : along;
  const ev = { kind, left: 40, cars: [], peds: [] };
  if (kind === 'fender') {
    const c1 = makeCar('sedan', 0x7a2e2e);
    c1.position.set(cx, 0, cz); c1.rotation.y = rand(0, Math.PI * 2);
    const c2 = makeCar('suv', 0x2e4a7a);
    c2.position.set(cx + 3.5, 0, cz + 1.5); c2.rotation.y = c1.rotation.y + 0.4;
    G.scene.add(c1); G.scene.add(c2);
    ev.cars.push(c1, c2); G.cars.push(c1, c2);
    const driver = makePed('Ruben', { kind: 'event', speed: 0 });
    driver.position.set(cx + 1.5, 0, cz + 3);
    driver.userData.state = 'stand';
    G.scene.add(driver); ev.peds.push(driver); G.peds.push(driver);
  } else {
    const pc = makeCar('police', 0x1c1c22);
    pc.position.set(cx, 0, cz); pc.rotation.y = rand(0, Math.PI * 2);
    const c2 = makeCar('sedan', 0x9a9a9a);
    c2.position.set(cx + 4, 0, cz + 2); c2.rotation.y = pc.rotation.y + 0.3;
    G.scene.add(pc); G.scene.add(c2);
    ev.cars.push(pc, c2); G.cars.push(pc, c2);
    const officer = makePed('Officer', { kind: 'event', shirt: 0x1c1c22, speed: 0 });
    officer.position.set(cx + 2, 0, cz + 3);
    officer.userData.state = 'stand';
    G.scene.add(officer); ev.peds.push(officer); G.peds.push(officer);
  }
  G.events.push(ev);
}
