// Porto Verde — missions and story: three jobs for fixer Rook, eight story beats.
// Mara Voss, getaway driver, owes a debt. All dialogue written fresh here.
import * as THREE from 'three';
import { G, CFG, rand, pick, clamp, dist2, fmtMoney } from './state.js';
import { queueDialog, showCard, showWasted, setMission } from './hud.js';
import { makeCar } from './vehicles.js';

export const MISSION_NAMES = ['The Tail', 'The Getaway Car', 'The Dragnet'];
export const MISSION_PAY = [400, 800, 2300];

const BEATS = {
  intro: [
    ['Rook', "Mara. You owe me forty thousand, and I am done waiting. Three jobs. Do them right and we are square."],
    ['Mara', "Three jobs. Then I am done with you, Rook. For good."],
  ],
  afterM1: [
    ['Rook', "The debt still stands at $40,000. Two jobs left. Do not make me come looking for you."],
    ['Mara', "I am worn out from taking the fall for that botched job. I will finish, but you do not own me."],
  ],
  afterM2: [
    ['Rook', "That car belonged to a collector. He will pay double to get it back. You did well, Mara."],
    ['Mara', "One more job and I am free. Tell me the last one is not a trap."],
  ],
  beforeM3: [
    ['Rook', "Last job, Mara. The police know your face now. Five stars the moment you start the engine."],
    ['Mara', "Then I drive like I have nothing to lose. Because I do not."],
  ],
  epilogue: [
    ['Rook', "Forty thousand, paid in full. You are a free woman, Mara Voss."],
    ['Mara', "Free. And I am keeping the keys. Porto Verde is mine to drive now."],
  ],
  coins: [
    ['Rook', "You found all twelve. That is the kind of eye I pay for."],
  ],
  projectCar: [
    ['Lena', "She purrs now. That old project car has another ten years in her. Thanks, Mara."],
  ],
};

export function playStory(key) {
  for (const [speaker, line] of BEATS[key]) queueDialog(speaker, line);
}

// The courier van's fixed route (a loop around Downtown and the Marina).
const VAN_ROUTE = [
  [108, -162], [260, -162], [260, 130], [130, 260], [-130, 260], [-260, 130], [-260, -130], [0, -260],
];
const DROP_POINTS = {
  pickup: [-195, 195], deliver: [292, -65],
  m2car: [0, -260], m2drop: [162, -108],
  m3cps: [[-292, -292], [292, 292], [-32, -292]], safehouse: [-264, 258],
};

export function startMission(i) {
  if (G.mission || G.missionsDone[i]) return false;
  const m = { idx: i, timer: 240, target: null, phase: '', tailTime: 0, cp: 0, van: null, vanWp: 0, car: null };
  G.mission = m;
  if (i === 0) {
    m.phase = 'tail';
    m.van = makeCar('van', 0x6b4a2e);
    m.van.position.set(108, 0, -162);
    m.van.userData.van = true;
    G.scene.add(m.van); G.cars.push(m.van);
    m.target = { x: 108, z: -162, label: 'Follow the van' };
    queueDialog('Rook', "Job one. A brown courier van runs the same route every day. Follow it. Do not crowd it, do not lose it.");
    setMission('M1 The Tail — follow the brown van (stay 5–60m)');
  } else if (i === 1) {
    m.phase = 'getcar';
    m.car = makeCar('sports', 0xd8b93a);
    m.car.position.set(DROP_POINTS.m2car[0], 0, DROP_POINTS.m2car[1]);
    G.scene.add(m.car); G.cars.push(m.car);
    m.target = { x: DROP_POINTS.m2car[0], z: DROP_POINTS.m2car[1], label: 'Get the gold car' };
    queueDialog('Rook', "Job two. A gold sports car is parked uptown. It belongs to a collector. Take it to Sunray Garage, and do not scratch it.");
    setMission('M2 The Getaway Car — steal the gold car');
  } else {
    m.phase = 'cps';
    G.wanted = 5;
    m.cp = 0;
    m.target = { x: DROP_POINTS.m3cps[0][0], z: DROP_POINTS.m3cps[0][1], label: 'Checkpoint 1' };
    playStory('beforeM3');
    queueDialog('Rook', "Job three. Three checkpoints, then the safehouse. The whole city is looking for you. Drive.");
    setMission('M3 The Dragnet — hit 3 checkpoints, then the safehouse');
  }
  return true;
}

function failMission(reason) {
  const m = G.mission;
  if (m && m.van) { G.scene.remove(m.van); const ci = G.cars.indexOf(m.van); if (ci >= 0) G.cars.splice(ci, 1); }
  if (m && m.car && m.idx === 1 && m.phase === 'getcar') { /* leave the gold car parked */ }
  G.mission = null;
  setMission(`Mission failed — ${reason}. Press N to retry.`);
  showWasted('MISSION FAILED', reason);
  G.over = true;
}

function completeMission() {
  const m = G.mission;
  const pay = MISSION_PAY[m.idx];
  G.money += pay;
  G.missionsDone[m.idx] = true;
  if (m.van) { G.scene.remove(m.van); const ci = G.cars.indexOf(m.van); if (ci >= 0) G.cars.splice(ci, 1); }
  G.mission = null;
  G.wanted = 0;
  showCard('MISSION PASSED', `${MISSION_NAMES[m.idx]}  •  +${fmtMoney(pay)}`);
  setMission('');
  if (m.idx === 0) playStory('afterM1');
  if (m.idx === 1) playStory('afterM2');
  if (m.idx === 2) playStory('epilogue');
  G.missionIdx = Math.min(2, m.idx + 1);
}

function nearTarget(d) { return dist2(G.player.pos.x, G.player.pos.z, G.mission.target.x, G.mission.target.z) < d; }

export function updateMissions(dt) {
  const m = G.mission;
  if (!m) {
    if (!G.missionsDone.every(Boolean)) {
      const next = G.missionsDone.findIndex(d => !d);
      setMission(`Press N — start Mission ${next + 1}: ${MISSION_NAMES[next]} (${fmtMoney(MISSION_PAY[next])})`);
    } else {
      setMission('All jobs done. Porto Verde is yours, Mara.');
    }
    return;
  }
  m.timer -= dt;
  if (m.timer <= 0) { failMission('Out of time.'); return; }
  const p = G.player;
  if (m.idx === 0) {
    if (m.phase === 'tail') {
      // move the van along its route; wait if the player is far, hurry if crowded
      const wp = VAN_ROUTE[m.vanWp];
      const dx = wp[0] - m.van.position.x, dz = wp[1] - m.van.position.z;
      const wd = Math.hypot(dx, dz);
      if (wd < 6) m.vanWp = (m.vanWp + 1) % VAN_ROUTE.length;
      const pd = dist2(p.pos.x, p.pos.z, m.van.position.x, m.van.position.z);
      let vSpeed = 10;
      if (pd > 60) vSpeed = 2; // waits for you
      else if (pd < 5) vSpeed = 15; // speeds up when crowded
      m.van.position.x += (dx / (wd || 1)) * vSpeed * dt;
      m.van.position.z += (dz / (wd || 1)) * vSpeed * dt;
      m.van.rotation.y = -Math.atan2(dz, dx);
      m.van.userData.heading = Math.atan2(dz, dx);
      m.target = { x: m.van.position.x, z: m.van.position.z, label: 'Follow the van' };
      if (p.car && pd >= 5 && pd <= 60) {
        m.tailTime += dt;
        setMission(`M1 The Tail — stay on the van  ${Math.floor(m.tailTime)}/15s  (${Math.round(pd)}m)`);
        if (m.tailTime >= 15) {
          m.phase = 'pickup';
          m.target = { x: DROP_POINTS.pickup[0], z: DROP_POINTS.pickup[1], label: 'Pick up the package' };
          queueDialog('Rook', "Good. Now pick up the package at the market and drop it at the Marina.");
          setMission('M1 The Tail — pick up the package');
        }
      } else {
        setMission(`M1 The Tail — follow the van (stay 5–60m, ${Math.round(pd)}m)`);
      }
    } else if (m.phase === 'pickup') {
      if (nearTarget(10)) {
        m.phase = 'deliver';
        m.target = { x: DROP_POINTS.deliver[0], z: DROP_POINTS.deliver[1], label: 'Deliver the package' };
        setMission('M1 The Tail — deliver the package');
      }
    } else if (m.phase === 'deliver') {
      if (nearTarget(10)) completeMission();
    }
  } else if (m.idx === 1) {
    if (m.phase === 'getcar') {
      if (p.car === m.car) {
        m.phase = 'deliver';
        G.wanted = Math.max(G.wanted, 2);
        m.target = { x: DROP_POINTS.m2drop[0], z: DROP_POINTS.m2drop[1], label: 'Sunray Garage' };
        setMission('M2 The Getaway Car — lose the heat, reach Sunray Garage');
      }
    } else if (m.phase === 'deliver') {
      if (p.car === m.car && nearTarget(12)) completeMission();
      else if (p.car !== m.car) setMission('M2 — get back in the gold car!');
    }
  } else {
    if (m.phase === 'cps') {
      const cp = DROP_POINTS.m3cps[m.cp];
      // generous radius: two of the checkpoint spots sit inside buildings, so
      // a car teleported/driven there gets pushed out by collision; the
      // objective is to reach the area, not an exact point.
      if (nearTarget(20)) {
        m.cp++;
        if (m.cp >= DROP_POINTS.m3cps.length) {
          m.phase = 'safehouse';
          m.target = { x: DROP_POINTS.safehouse[0], z: DROP_POINTS.safehouse[1], label: 'Safehouse' };
          setMission('M3 The Dragnet — reach the safehouse');
        } else {
          m.target = { x: DROP_POINTS.m3cps[m.cp][0], z: DROP_POINTS.m3cps[m.cp][1], label: `Checkpoint ${m.cp + 1}` };
          setMission(`M3 The Dragnet — checkpoint ${m.cp + 1}/3`);
        }
      }
    } else if (m.phase === 'safehouse') {
      if (nearTarget(16)) completeMission();
    }
  }
}
