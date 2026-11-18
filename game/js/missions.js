// Porto Verde missions — seven story chapters, written fresh for v3.
// Kinds: delivery (checkpoints), tail (follow without being spotted),
// takedown, race (timed checkpoints), getaway (lose the cops), boss.
import * as THREE from 'three';
import { G, CHAPTERS, CREW, clamp, dist2, rand } from './state.js';
import { addWanted } from './police.js';

// Waypoints across the island (x, z, label).
export const SPOTS = {
  plaza: [0, 0, 'Plaza'],
  marina: [240, 40, 'Marina Docks'],
  oldtown: [-200, -40, 'Old Town'],
  northside: [40, -200, 'Northside'],
  southbeach: [-40, 260, 'South Beach'],
  faro: [-200, 120, 'El Faro'],
  garage: [200, -200, 'Sunray Garage'],
  safehouse: [120, 280, 'Safehouse'],
  causeway: [360, 40, 'Causeway'],
  hospital: [-120, -200, 'Hospital'],
  tower: [40, -40, 'Harbor Tower'],
};

// Chapter scripts. Each step: { text, at:[x,z], r, timer?, say?, tail?, takedown?, getaway?, wanted?, pursuitHalfway?, race? }
function scriptFor(idx) {
  switch (idx) {
    case 0: return [
      { text: 'Deliver the package to the Marina docks — fast', at: SPOTS.marina, r: 12, timer: 60, pursuitHalfway: true, say: ['lena', 'Rook’s package goes to the Marina docks. Sixty seconds, Mara — and the cops will notice you halfway there.'] },
    ];
    case 1: return [
      { text: 'Find Kessler’s van at the Marina — stay back', at: SPOTS.marina, r: 20, say: ['lena', 'Kessler’s van leaves the docks at dusk. Tail it. If he spots you, it’s over.'] },
      { text: 'Tail the van to Northside (keep 25–60m)', at: SPOTS.northside, r: 30, tail: true },
      { text: 'Report back at the Safehouse', at: SPOTS.safehouse, r: 12, say: ['lena', 'He’s moving product through Northside. Rook will want to hear this.'] },
    ];
    case 2: return [
      { text: 'Collect the drop at the Causeway', at: SPOTS.causeway, r: 12, timer: 240, say: ['rook', 'The drop is on the Causeway. Two hundred and forty seconds, Mara. Move.'] },
      { text: 'Deliver to the Harbor Tower before time runs out', at: SPOTS.tower, r: 12, timer: 240 },
    ];
    case 3: return [
      { text: 'Confront Kessler’s lookout in Old Town', at: SPOTS.oldtown, r: 14, say: ['kessler', 'You’re in my waters now, Mara. My lookout will teach you that.'] },
      { text: 'Take down the lookout (punch or shoot)', at: SPOTS.oldtown, r: 14, takedown: true },
      { text: 'Lose the cops — break line of sight', at: SPOTS.plaza, r: 40, getaway: true, say: ['lena', 'It went loud. Lose them. Break line of sight and stay gone.'] },
    ];
    case 4: return [
      { text: 'Get to the race start at South Beach', at: SPOTS.southbeach, r: 14, say: ['lena', 'Sunset Sprint. Coast road, five checkpoints, ninety seconds. Win it.'] },
      { text: 'Race checkpoint 1/5 — Marina', at: SPOTS.marina, r: 16, race: true, timer: 90 },
      { text: 'Race checkpoint 2/5 — Plaza', at: SPOTS.plaza, r: 16, race: true },
      { text: 'Race checkpoint 3/5 — Northside', at: SPOTS.northside, r: 16, race: true },
      { text: 'Race checkpoint 4/5 — Old Town', at: SPOTS.oldtown, r: 16, race: true },
      { text: 'Final checkpoint — South Beach finish', at: SPOTS.southbeach, r: 16, race: true },
    ];
    case 5: return [
      { text: 'Grab the goods at the Safehouse', at: SPOTS.safehouse, r: 12, say: ['rook', 'The goods are at your safehouse. The whole island’s police will be on you. Drive.'] },
      { text: 'Getaway — cross to the Marina with the police on you', at: SPOTS.marina, r: 14, getaway: true, wanted: 3 },
      { text: 'Lose the cops, then reach the Causeway', at: SPOTS.causeway, r: 14, getaway: true },
    ];
    case 6: return [
      { text: 'Meet Rook at the Marina docks', at: SPOTS.marina, r: 14, say: ['rook', 'Forty thousand, Mara. Tonight it ends — one way or another.'] },
      { text: 'Face Kessler’s crew at the docks (take them down)', at: SPOTS.marina, r: 20, takedown: true, say: ['kessler', 'Rook sent a driver to do a boss’s job? Pathetic.'] },
      { text: 'Confront Rook — end the debt', at: SPOTS.marina, r: 14, say: ['rook', 'You did it, Mara. The debt is clear. Porto Verde is yours now.'] },
    ];
  }
  return [];
}

function spawnTailVan() {
  if (G.mission.tailTarget) return;
  const van = { x: 240, z: 40, heading: Math.PI, speed: 9, route: [[240, 40], [240, -240], [-240, -240], [-240, 40]], leg: 0 };
  G.mission.tailTarget = van;
  if (G.spawnTailVanMesh) G.spawnTailVanMesh(van);
}

export function startChapter(idx) {
  const ch = CHAPTERS[idx];
  if (!ch) return;
  G.chapter = idx;
  const stages = scriptFor(idx);
  G.mission = {
    chapter: idx, stages, stage: 0, timer: stages[0].timer || 0,
    target: stages[0].at, radius: stages[0].r || 12,
    takedownLeft: stages[0].takedown ? 1 : 0,
    tailTarget: null, tailDist: 0, tailSeen: 0,
    done: false, startedAt: performance.now(),
  };
  if (stages[0].say && G.say) G.say(stages[0].say[0], stages[0].say[1]);
  if (G.toast) G.toast('Chapter ' + (idx + 1) + ' — ' + ch.name + ' · $' + ch.pay);
  if (stages[0].tail || (stages[1] && stages[1].tail)) spawnTailVan();
  updateMissionMarker();
}

export function advanceStage() {
  const m = G.mission;
  if (!m) return;
  m.stage++;
  if (m.stage >= m.stages.length) { completeChapter(); return; }
  const s = m.stages[m.stage];
  m.target = s.at;
  m.radius = s.r || 12;
  m.timer = s.timer || 0;
  m.takedownLeft = s.takedown ? 1 : 0;
  if (s.say && G.say) G.say(s.say[0], s.say[1]);
  if (s.wanted) addWanted(s.wanted);
  if (s.tail) spawnTailVan();
  updateMissionMarker();
}

export function completeChapter() {
  const m = G.mission;
  if (!m) return;
  const ch = CHAPTERS[m.chapter];
  G.cash += ch.pay;
  G.respect += 25 + m.chapter * 5;
  G.debt = Math.max(0, G.debt - ch.pay);
  const cleared = m.chapter === 6;
  m.done = true;
  if (G.showPassed) G.showPassed(ch.name, 'Paid $' + ch.pay + ' · Debt now $' + G.debt.toLocaleString() + (cleared ? ' — DEBT CLEARED!' : ''));
  if (G.saveGame) G.saveGame();
  // Unlock the shotgun after chapter 4.
  if (m.chapter === 3 && G.weapons && G.weapons[3]) {
    G.weapons[3].locked = false;
    if (G.toast) setTimeout(() => G.toast && G.toast('New weapon unlocked: Riot Shotgun (press 4)'), 2600);
  }
  const next = m.chapter + 1;
  G.mission = null;
  if (next < CHAPTERS.length) {
    setTimeout(() => startChapter(next), 2800);
  } else if (G.toast) {
    setTimeout(() => G.toast && G.toast('All seven jobs done. Porto Verde is yours, Mara.'), 3000);
  }
  updateMissionMarker();
}

export function failChapter(reason) {
  if (!G.mission) return;
  const idx = G.mission.chapter;
  if (G.toast) G.toast('Job failed — ' + reason + '. Restarting the chapter…');
  setTimeout(() => startChapter(idx), 1800);
  G.mission = null;
  updateMissionMarker();
}

export function updateMissionMarker() {
  // The gold objective marker in the world (a beacon column + ring).
  if (G.missionMarker) {
    G.scene.remove(G.missionMarker);
    G.missionMarker = null;
  }
  if (!G.mission) return;
  const tx = G.mission.target[0];
  const tz = G.mission.target[1];
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 30;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6, 0.5, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffb020 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  g.add(ring);
  g.position.set(tx, 0, tz);
  G.scene.add(g);
  G.missionMarker = g;
}

// Per-frame mission logic.
export function updateMissions(dt) {
  const m = G.mission;
  if (!m || !G.player) return;
  const s = m.stages[m.stage];
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) { failChapter('time ran out'); return; }
  }
  // Halfway pursuit (Chapter 1): gentle one-star heat once the player is close.
  if (s.pursuitHalfway && !m.pursuitTriggered) {
    const dHalf = Math.hypot(px - m.target[0], pz - m.target[1]);
    if (dHalf < 150) {
      m.pursuitTriggered = true;
      addWanted(1);
      if (G.toast) G.toast('A patrol spotted you — lose them after the drop!');
    }
  }
  // Tailing stage.
  if (s.tail && m.tailTarget) {
    const v = m.tailTarget;
    const tgt = v.route[v.leg];
    const dx = tgt[0] - v.x;
    const dz = tgt[1] - v.z;
    const d = Math.hypot(dx, dz);
    if (d < 8) {
      v.leg = (v.leg + 1) % v.route.length;
    } else {
      v.heading = Math.atan2(dx, dz);
      v.x += Math.sin(v.heading) * v.speed * dt;
      v.z += Math.cos(v.heading) * v.speed * dt;
    }
    if (G.moveTailVanMesh) G.moveTailVanMesh(v);
    const pd = Math.hypot(px - v.x, pz - v.z);
    m.tailDist = pd;
    if (pd > 60) {
      m.tailSeen += dt;
      if (m.tailSeen > 8) { failChapter('you lost the van'); return; }
    } else if (pd < 25) {
      m.tailSeen += dt;
      if (m.tailSeen > 5) { failChapter('the van spotted you'); return; }
      if (G.toast && Math.floor(m.tailSeen) !== Math.floor(m.tailSeen - dt)) G.toast('Too close — back off!');
    } else {
      m.tailSeen = Math.max(0, m.tailSeen - dt);
    }
    if (v.leg === 2 && d < 12) { advanceStage(); return; }
    return;
  }
  // Takedown stage: completed by combat (weapons set takedownLeft to 0).
  if (s.takedown) {
    if (m.takedownLeft <= 0) { advanceStage(); return; }
    return;
  }
  // Arrival: reach the target radius.
  const d2 = dist2(px, pz, m.target[0], m.target[1]);
  if (d2 < m.radius * m.radius) {
    if (s.getaway && G.wanted > 0 && m.stage < m.stages.length - 1) {
      if (G.wanted <= 2) { advanceStage(); return; }
      return;
    }
    advanceStage();
  }
}
