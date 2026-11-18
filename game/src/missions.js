// Porto Verde — the three missions: M1 The Tail ($400), M2 Getaway Car
// ($800), M3 Dragnet ($2,300). 240 s timers, road-based checkpoints,
// story beats at the boundaries. All original.
import { G, dist2, clamp, saveGame } from './util.js';
import { makeCar } from './vehicles.js';
import { playStory } from './story.js';
import { showCard, queueDialog } from './hud.js';

const M1_ROUTE = [
  { x: -384, z: -320 }, { x: 320, z: -320 },
  { x: 320, z: 320 }, { x: -384, z: 320 },
];
const M1_PICKUP = { x: 0, z: 320 };
const M1_DROP = { x: -320, z: -320 };
const M2_CAR = { x: 192, z: 256 };
const M2_DROP = { x: -320, z: -192 };
const M3_CPS = [{ x: 320, z: 320 }, { x: -320, z: 64 }, { x: 64, z: -320 }];
const M3_SAFE = { x: -64, z: 320 };
const PAYS = [400, 800, 2300];
const NAMES = ['The Tail', 'Getaway Car', 'Dragnet'];

export function startMission(n) {
  if (G.mission) return false;
  if (G.missionsDone[n]) return false;
  if (n === 0) {
    const van = makeCar('van', 0x6b4a2e);
    van.position.set(M1_ROUTE[0].x, 0, M1_ROUTE[0].z);
    van.rotation.y = Math.PI / 2;
    G.scene.add(van);
    G.mission = { n, phase: 'tail', timer: 240, van, routeIdx: 1, tailTime: 0, target: { ...M1_ROUTE[1], label: 'Follow the van' } };
    queueDialog('Rook', 'The Tail: follow the brown courier van. Stay 5 to 60 metres back. Do not spook it.');
  } else if (n === 1) {
    const car = makeCar('sports', 0xd8a920);
    car.position.set(M2_CAR.x, 0, M2_CAR.z);
    car.userData.parked = true; // stays put until Mara takes it.
    G.scene.add(car);
    G.cars.push(car);
    G.mission = { n, phase: 'steal', timer: 240, goldCar: car, target: { ...M2_CAR, label: 'Steal the gold car' } };
    queueDialog('Rook', 'Getaway Car: a gold sports car is parked uptown. Take it and bring it to the drop.');
  } else {
    G.wanted = 5;
    G.mission = { n, phase: 'cps', timer: 240, cpIdx: 0, target: { ...M3_CPS[0], label: 'Checkpoint 1/3' } };
    playStory('beforeM3');
    queueDialog('Rook', 'Dragnet: five stars from the start. Hit all three checkpoints, then the safehouse.');
  }
  return true;
}

export function missionInteract() {
  const m = G.mission;
  if (!m || !G.player) return null;
  const px = G.playerCar ? G.playerCar.position.x : G.player.position.x;
  const pz = G.playerCar ? G.playerCar.position.z : G.player.position.z;
  if (m.n === 0 && m.phase === 'pickup') {
    if (dist2(px, pz, M1_PICKUP.x, M1_PICKUP.z) < 5) return { x: M1_PICKUP.x, z: M1_PICKUP.z, label: 'Pick up the package', action: () => { m.phase = 'deliver'; m.target = { ...M1_DROP, label: 'Deliver the package' }; queueDialog('Mara', 'Package in hand. Now the drop.'); } };
  }
  if (m.n === 0 && m.phase === 'deliver') {
    if (dist2(px, pz, M1_DROP.x, M1_DROP.z) < 5) return { x: M1_DROP.x, z: M1_DROP.z, label: 'Deliver the package', action: () => completeMission() };
  }
  if (m.n === 1 && m.phase === 'steal') {
    if (dist2(px, pz, M2_CAR.x, M2_CAR.z) < 5) return { x: M2_CAR.x, z: M2_CAR.z, label: 'Take the gold car', action: () => { m.phase = 'deliver'; m.target = { ...M2_DROP, label: 'Deliver the gold car' }; queueDialog('Mara', 'Gold car is mine. Now the drop.'); } };
  }
  return null;
}

function completeMission() {
  const m = G.mission;
  if (!m) return;
  const pay = PAYS[m.n];
  G.money += pay;
  G.missionsDone[m.n] = true;
  showCard(`MISSION PASSED — ${NAMES[m.n]}`, `+$${pay}`);
  if (m.n === 0) { playStory('afterM1a'); playStory('afterM1b'); }
  if (m.n === 1) playStory('afterM2');
  if (m.n === 2) playStory('epilogue');
  if (m.van) { G.scene.remove(m.van); }
  if (m.goldCar && G.playerCar !== m.goldCar) { /* leave the car in the world */ }
  G.mission = null;
  G.wanted = Math.max(0, G.wanted - 2);
  saveGame();
}

function failMission() {
  const m = G.mission;
  if (!m) return;
  queueDialog('Rook', `${NAMES[m.n]} failed. The clock ran out. Come back when you are ready.`);
  if (m.van) G.scene.remove(m.van);
  G.mission = null;
}

export function missionTarget() {
  const m = G.mission;
  return m ? m.target : null;
}

export function updateMissions(dt) {
  const m = G.mission;
  if (!m) return;
  m.timer -= dt;
  if (m.timer <= 0) { failMission(); return; }
  const px = G.playerCar ? G.playerCar.position.x : (G.player ? G.player.position.x : 0);
  const pz = G.playerCar ? G.playerCar.position.z : (G.player ? G.player.position.z : 0);
  if (m.n === 0 && m.van) {
    const van = m.van;
    const d = dist2(px, pz, van.position.x, van.position.z);
    let speed = 12;
    if (d > 60) speed = 0;
    else if (d < 5) speed = 18;
    if (d >= 5 && d <= 60) m.tailTime += dt;
    if (m.phase === 'tail' && m.tailTime >= 20) {
      m.phase = 'pickup';
      m.target = { ...M1_PICKUP, label: 'Pick up the package' };
      queueDialog('Rook', 'Tail done. Pick up the package at the north road.');
    }
    if (m.phase === 'tail') {
      const wp = M1_ROUTE[m.routeIdx];
      const dx = wp.x - van.position.x, dz = wp.z - van.position.z;
      const dd = Math.sqrt(dx * dx + dz * dz);
      if (dd < 3) { m.routeIdx = (m.routeIdx + 1) % M1_ROUTE.length; }
      else {
        const step = Math.min(dd, speed * dt);
        van.position.x += (dx / dd) * step;
        van.position.z += (dz / dd) * step;
        van.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      }
      m.target = { x: van.position.x, z: van.position.z, label: `Follow the van (${Math.round(m.tailTime)}/20s)` };
    }
  }
  if (m.n === 1 && m.phase === 'deliver') {
    if (dist2(px, pz, M2_DROP.x, M2_DROP.z) < 12) completeMission();
  }
  if (m.n === 2) {
    if (m.phase === 'cps') {
      const cp = M3_CPS[m.cpIdx];
      if (dist2(px, pz, cp.x, cp.z) < 20) {
        m.cpIdx++;
        if (m.cpIdx >= M3_CPS.length) {
          m.phase = 'safe';
          m.target = { ...M3_SAFE, label: 'Reach the safehouse' };
          queueDialog('Mara', 'All checkpoints. Now the safehouse.');
        } else {
          m.target = { ...M3_CPS[m.cpIdx], label: `Checkpoint ${m.cpIdx + 1}/3` };
        }
      }
    } else if (m.phase === 'safe') {
      if (dist2(px, pz, M3_SAFE.x, M3_SAFE.z) < 16) completeMission();
    }
  }
}
