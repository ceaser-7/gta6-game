// Porto Verde — missions: M1 The Tail ($400), M2 Getaway Car ($800), M3 Dragnet ($2,300).
import * as THREE from '../vendor/three.module.min.js';
import { G, dist, clamp } from './state.js';
import { spawnCar, removeCar } from './cars.js';
import { playStory } from './story.js';
import { addWanted, clearWanted } from './police.js';

export const ROOK_MARKER = { x: 32, z: 32 };
export const MISSION_DEFS = [
  { n: 1, name: 'The Tail', pay: 400, time: 240 },
  { n: 2, name: 'Getaway Car', pay: 800, time: 240 },
  { n: 3, name: 'Dragnet', pay: 2300, time: 240 },
];

let beacon = null;
export function makeBeacon() {
  beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  beacon.visible = false;
  G.scene.add(beacon);
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 16), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  marker.position.set(ROOK_MARKER.x, 0.3, ROOK_MARKER.z);
  G.scene.add(marker);
}
function setBeacon(x, z) {
  if (!beacon) return;
  beacon.visible = true;
  beacon.position.set(x, 30, z);
}
function hideBeacon() { if (beacon) beacon.visible = false; }

export function nextMissionNum() {
  for (let i = 0; i < 3; i++) if (!G.missionsDone[i]) return i + 1;
  return 0;
}

export function startMission(n) {
  if (G.mission) return false;
  const def = MISSION_DEFS[n - 1];
  const m = { n, def, phase: 'brief', t: def.time, tailT: 0, van: null, route: null, routeI: 0, objective: null };
  G.mission = m;
  G.missionNum = n;
  if (n === 1) playStory('intro');
  if (n === 3) playStory('beforeM3');
  G.ui.brief && G.ui.brief(def.name, n === 1 ? 'Tail the brown courier van. Stay 5–60 m back — do not get made.' : n === 2 ? 'Steal the gold sports car at the marina and bring it to Sunray Garage.' : 'Run 5 checkpoints, then reach the safehouse. The whole city is hunting you.');
  if (n === 1) beginTail(m);
  if (n === 2) { m.phase = 'steal'; m.objective = { x: 320, z: 192 }; setBeacon(320, 192); }
  if (n === 3) {
    m.phase = 'cps'; m.cpI = 0;
    m.cps = [{ x: -384, z: -320 }, { x: 0, z: -384 }, { x: 320, z: -192 }, { x: 192, z: 128 }, { x: -64, z: 320 }];
    m.safehouse = { x: 256, z: 256 };
    m.objective = m.cps[0];
    G.wanted = 5; G.ui.updateHud && G.ui.updateHud();
    setBeacon(m.cps[0].x, m.cps[0].z);
  }
  G.ui.updateHud && G.ui.updateHud();
  return true;
}

const VAN_ROUTE = [
  { x: -384, z: -320 }, { x: -384, z: 320 }, { x: 320, z: 320 }, { x: 320, z: -320 }, { x: -384, z: -320 },
];
function beginTail(m) {
  m.phase = 'tail';
  m.route = VAN_ROUTE; m.routeI = 1;
  const van = spawnCar('van', VAN_ROUTE[0].x, VAN_ROUTE[0].z, 0, { mission: true, color: 0x6a4a2a });
  van.speed = 0;
  m.van = van;
  m.objective = { x: van.x, z: van.z, label: 'van' };
  setBeacon(van.x, van.z);
}

function failMission(reason) {
  const m = G.mission;
  if (!m) return;
  cleanupMission(m);
  G.ui.card && G.ui.card('MISSION FAILED', reason);
  G.mission = null;
  hideBeacon();
  G.ui.updateHud && G.ui.updateHud();
}

function completeMission() {
  const m = G.mission;
  if (!m) return;
  const pay = m.def.pay;
  G.player.money += pay;
  G.missionsDone[m.n - 1] = true;
  cleanupMission(m);
  G.ui.card && G.ui.card('MISSION PASSED', `${m.def.name} — +$${pay}`);
  if (m.n === 1) playStory('afterM1');
  if (m.n === 2) playStory('afterM2');
  if (m.n === 3) { playStory('epilogue'); clearWanted(); }
  G.mission = null;
  hideBeacon();
  G.save && G.save();
  G.ui.updateHud && G.ui.updateHud();
}

function cleanupMission(m) {
  if (m.van) { removeCar(m.van); m.van = null; }
}

export function updateMissions(dt) {
  const m = G.mission;
  if (!m) return;
  m.t -= dt;
  if (m.t <= 0) { failMission('Time ran out'); return; }
  const p = G.player;
  if (m.n === 1) {
    const van = m.van;
    if (!van) return;
    const d = dist(p.x, p.z, van.x, van.z);
    if (m.phase === 'tail') {
      // van waits if the player falls >60 m behind, speeds up if <5 m
      let speed = 9;
      if (d > 60) speed = 0;
      else if (d < 5) speed = 14;
      const tgt = m.route[m.routeI];
      const dx = tgt.x - van.x, dz = tgt.z - van.z, dd = Math.hypot(dx, dz);
      if (dd < 6) { m.routeI = (m.routeI + 1) % m.route.length; }
      else {
        const want = Math.atan2(dx, dz);
        let ddy = want - van.yaw;
        while (ddy > Math.PI) ddy -= Math.PI * 2;
        while (ddy < -Math.PI) ddy += Math.PI * 2;
        van.yaw += clamp(ddy, -1.6 * dt, 1.6 * dt);
        van.x += Math.sin(van.yaw) * speed * dt;
        van.z += Math.cos(van.yaw) * speed * dt;
        van.mesh.position.set(van.x, 0, van.z);
        van.mesh.rotation.y = van.yaw;
      }
      if (d >= 8 && d <= 60) m.tailT += dt;
      if (m.tailT >= 45) {
        m.phase = 'pickup';
        m.objective = { x: -192, z: 192 };
        setBeacon(-192, 192);
        G.ui.toast && G.ui.toast('Tail done — pick up the package at the plaza.');
      }
      m.objective = { x: van.x, z: van.z, label: 'van' };
      if (m.phase === 'tail') setBeacon(van.x, van.z);
    } else if (m.phase === 'pickup') {
      if (dist(p.x, p.z, -192, 192) < 6) {
        m.phase = 'deliver';
        m.objective = { x: 256, z: 256 };
        setBeacon(256, 256);
        G.ui.toast && G.ui.toast('Package secured — deliver it to the safehouse.');
      }
    } else if (m.phase === 'deliver') {
      if (dist(p.x, p.z, 256, 256) < 8) completeMission();
    }
  } else if (m.n === 2) {
    if (m.phase === 'steal') {
      const gold = G.goldCar;
      if (gold && !p.onFoot && p.car === gold) {
        m.phase = 'deliver';
        m.objective = { x: 192, z: -128 };
        setBeacon(192, -128);
        addWanted(2);
        G.ui.toast && G.ui.toast('Gold car stolen — get it to Sunray Garage!');
      }
    } else if (m.phase === 'deliver') {
      if (p.car === G.goldCar && dist(p.x, p.z, 192, -128) < 10) completeMission();
    }
  } else if (m.n === 3) {
    if (m.phase === 'cps') {
      const cp = m.cps[m.cpI];
      if (cp && dist(p.x, p.z, cp.x, cp.z) < 20) {
        m.cpI++;
        if (m.cpI >= m.cps.length) {
          m.phase = 'safehouse';
          m.objective = m.safehouse;
          setBeacon(m.safehouse.x, m.safehouse.z);
          G.ui.toast && G.ui.toast('All checkpoints — reach the safehouse!');
        } else {
          m.objective = m.cps[m.cpI];
          setBeacon(m.objective.x, m.objective.z);
          G.ui.toast && G.ui.toast(`Checkpoint ${m.cpI}/${m.cps.length}`);
        }
      }
    } else if (m.phase === 'safehouse') {
      if (dist(p.x, p.z, m.safehouse.x, m.safehouse.z) < 16) completeMission();
    }
  }
  G.ui.updateHud && G.ui.updateHud();
}

export function missionObjective() {
  const m = G.mission;
  if (!m || !m.objective) return null;
  return m.objective;
}
