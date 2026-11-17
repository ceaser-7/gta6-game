// Side activities: things to do beyond the three main jobs.
// (1) Verde Coins — 12 golden coins hidden around the city; collect them all
//     for a $500 bonus from Rook. (2) Sunset Sprint — a 5-checkpoint street
//     race around Downtown and Marina, 90 seconds, $300 + a time bonus.
// Coin spots + race route are from GPT-6.1 Sol (v5 calls S5c/S5d, 2026-11-17),
// used verbatim; the collect/race state machines are built here.
import * as THREE from 'three';
import { showPassed } from './hud.js';

const COIN_SPOTS = [
  { x: -369, z: -351, hint: "Harbor's southwest sidewalk" },
  { x: -261, z: -189, hint: "Along a quiet Harbor sidewalk" },
  { x: -99, z: -81, hint: "Near the Harbor's eastern edge" },
  { x: 9, z: -297, hint: "Downtown's southern sidewalk" },
  { x: 189, z: -135, hint: "In the heart of the plaza" },
  { x: 333, z: -243, hint: "Downtown's eastern sidewalk" },
  { x: -369, z: 81, hint: "Old Town's western sidewalk" },
  { x: -99, z: 189, hint: "An Old Town sidewalk north of the center" },
  { x: -243, z: 297, hint: "Inside Old Town's green park" },
  { x: 27, z: 27, hint: "In the park at the city's heart" },
  { x: 315, z: 189, hint: "Along a Marina block's east edge" },
  { x: 270, z: 400, hint: "On the Marina beach" }
];

const RACE = {
  name: 'Sunset Sprint',
  start: { x: 108, z: -162 },
  checkpoints: [
    { x: 324, z: -158.8, name: 'Ember Avenue' },
    { x: 320.8, z: 27, name: 'Gull Street' },
    { x: 324, z: 212.8, name: 'Marina Quay' },
    { x: 108, z: 212.8, name: 'Coral Row' },
    { x: 111.2, z: 27, name: 'Citrus Lane' }
  ],
  timeLimit: 90,
  reward: 300
};

function makeTextTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#101828'; g.fillRect(0, 0, 512, 128);
  g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd23e'; g.fillText(text, 256, sub ? 48 : 64);
  if (sub) { g.font = 'bold 26px Arial'; g.fillStyle = '#ffffff'; g.fillText(sub, 256, 96); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createActivities(G) {
  G.coinsCollected = new Set();
  G.coinsTotal = COIN_SPOTS.length;
  G.raceBest = null;
  G.race = null;
  G.raceCooldown = 0;
  // --- coins: spinning gold octahedrons on a ground ring ---
  const coinGeo = new THREE.OctahedronGeometry(0.7);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xa8821a, emissiveIntensity: 0.7 });
  const ringGeo = new THREE.RingGeometry(1.1, 1.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  G.coinMeshes = COIN_SPOTS.map((s, i) => {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.position.y = 1.1;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
    g.add(coin, ring);
    g.position.set(s.x, 0, s.z);
    G.scene.add(g);
    return { group: g, coin, spot: s, index: i };
  });
  // --- race start arch on the Downtown avenue + checkpoint rings ---
  const arch = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.5, 5, 0.5);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x1c222b });
  for (const sx of [-4.5, 4.5]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(sx, 2.5, 0); p.castShadow = true; arch.add(p);
  }
  const hoop = new THREE.Mesh(
    new THREE.TorusGeometry(4.5, 0.3, 10, 28),
    new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xa8821a, emissiveIntensity: 0.6 }),
  );
  hoop.position.y = 4.5; arch.add(hoop);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3),
    new THREE.MeshLambertMaterial({ map: makeTextTexture('SUNSET SPRINT', '5 CHECKPOINTS — 90 SECONDS'), emissive: 0xffffff, emissiveMap: makeTextTexture('SUNSET SPRINT', '5 CHECKPOINTS — 90 SECONDS'), emissiveIntensity: 0.3 }));
  sign.position.set(0, 7.2, 0); arch.add(sign);
  arch.position.set(RACE.start.x, 0, RACE.start.z);
  arch.rotation.y = Math.PI / 2; // the avenue runs east-west; the arch faces east
  G.scene.add(arch);
  G.raceArch = arch;
  // checkpoint rings: flat pads on the road, only the current one glows
  const cpGeo = new THREE.TorusGeometry(4, 0.35, 10, 28);
  G.raceRings = RACE.checkpoints.map((cp) => {
    const m = new THREE.Mesh(cpGeo, new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xa8821a, emissiveIntensity: 0.4 }));
    m.rotation.x = -Math.PI / 2; m.position.set(cp.x, 0.3, cp.z);
    m.visible = false;
    G.scene.add(m);
    return m;
  });
  // slim beacon pillar marking the current checkpoint
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 16, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 8;
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  diamond.position.y = 5;
  const beacon = new THREE.Group();
  beacon.add(beam, diamond);
  beacon.visible = false;
  beacon.userData = { diamond };
  G.scene.add(beacon);
  G.raceBeacon = beacon;
}

// Hide already-collected coins (save restore on Continue).
export function refreshCoinMeshes(G) {
  for (const c of G.coinMeshes) c.group.visible = !G.coinsCollected.has(c.index);
}

function collectCoin(G, c) {
  G.coinsCollected.add(c.index);
  c.group.visible = false;
  G.audio.pickup();
  const n = G.coinsCollected.size;
  G.hud.toast(`Verde Coin ${n}/${G.coinsTotal} — ${c.spot.hint}`);
  if (n >= G.coinsTotal) {
    G.money += 500;
    G.hud.showDialog('Rook — fixer', 'You found all twelve. That is the kind of eye I pay for. $500, on top of what you already earned.', () => {});
    G.hud.toast('All coins found — +$500');
  }
  G.saveGame();
}

function startRace(G) {
  G.race = { cp: 0, timeLeft: RACE.timeLimit, startedAt: G.time };
  G.raceRings.forEach((r, i) => { r.visible = i === 0; });
  moveRaceBeacon(G);
  G.hud.toast(`${RACE.name} — ${RACE.checkpoints.length} checkpoints, ${RACE.timeLimit} seconds!`);
  G.audio.pickup();
}

function moveRaceBeacon(G) {
  const r = G.race;
  if (!r) { G.raceBeacon.visible = false; return; }
  const cp = RACE.checkpoints[r.cp];
  G.raceBeacon.visible = true;
  G.raceBeacon.position.set(cp.x, 0, cp.z);
}

function completeRace(G) {
  const r = G.race;
  const bonus = Math.min(200, Math.floor(r.timeLeft) * 5);
  const total = RACE.reward + bonus;
  const secs = Math.round((G.time - r.startedAt) * 10) / 10;
  const isBest = G.raceBest === null || secs < G.raceBest;
  if (isBest) G.raceBest = secs;
  G.money += total;
  G.race = null;
  G.raceCooldown = 10;
  G.raceRings.forEach((ring) => { ring.visible = false; });
  moveRaceBeacon(G);
  G.audio.success();
  showPassed(G, RACE.name, total, `Finished in ${secs}s${isBest ? ' — new best time!' : ` (best ${G.raceBest}s)`}.`);
  G.hud.toast(`${RACE.name} complete — +$${total}`);
  G.saveGame();
}

function failRace(G) {
  G.race = null;
  G.raceCooldown = 10;
  G.raceRings.forEach((ring) => { ring.visible = false; });
  moveRaceBeacon(G);
  G.hud.toast('Out of time — the sprint resets. Drive through the arch to try again.');
}

export function updateActivities(G, dt) {
  if (G.state !== 'playing') return;
  const p = G.player;
  // --- coins: spin, bob, collect within 3 m (on foot or driving) ---
  for (const c of G.coinMeshes) {
    if (G.coinsCollected.has(c.index)) continue;
    c.coin.rotation.y += dt * 2;
    c.coin.position.y = 1.1 + Math.sin(G.time * 2 + c.index) * 0.25;
    if (Math.hypot(p.pos.x - c.spot.x, p.pos.z - c.spot.z) < 3) collectCoin(G, c);
  }
  // --- race ---
  if (G.raceCooldown > 0) G.raceCooldown -= dt;
  if (!G.race) {
    // start: drive through the arch (in a car only — it is a driving race)
    if (!p.onFoot && p.car && G.raceCooldown <= 0 && !G.hud.dialogOpen) {
      if (Math.hypot(p.pos.x - RACE.start.x, p.pos.z - RACE.start.z) < 5) startRace(G);
    }
    return;
  }
  const r = G.race;
  r.timeLeft -= dt;
  if (r.timeLeft <= 0) { failRace(G); return; }
  // beacon pulse
  G.raceBeacon.userData.diamond.rotation.y += dt * 2;
  G.raceBeacon.userData.diamond.position.y = 5 + Math.sin(G.time * 2.5) * 0.6;
  const cp = RACE.checkpoints[r.cp];
  if (Math.hypot(p.pos.x - cp.x, p.pos.z - cp.z) < 6) {
    G.audio.pickup();
    r.cp++;
    if (r.cp >= RACE.checkpoints.length) { completeRace(G); return; }
    G.raceRings.forEach((ring, i) => { ring.visible = i === r.cp; });
    moveRaceBeacon(G);
    G.hud.toast(`Checkpoint ${r.cp}/${RACE.checkpoints.length} — ${RACE.checkpoints[r.cp].name}`);
  }
}
