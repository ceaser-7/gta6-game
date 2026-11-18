// Porto Verde — side activities: 12 Verde Coins and the Sunset Sprint race.
// Coins sit on roads and open ground, never inside buildings. The race arch
// sits ON a road so a driver can find it. All original.
import * as THREE from 'three';
import { G, dist2, clamp, fmtTime, saveGame } from './util.js';
import { playStory } from './story.js';
import { showCard, queueDialog } from './hud.js';

const COIN_SPOTS = [
  { x: -384, z: 0 }, { x: -256, z: 192 }, { x: -128, z: -256 }, { x: 0, z: 320 },
  { x: 64, z: -64 }, { x: 128, z: 192 }, { x: 192, z: -320 }, { x: 256, z: 64 },
  { x: 320, z: -192 }, { x: 384, z: 256 }, { x: -64, z: 384 }, { x: 64, z: 128 },
];
const RACE_ARCH = { x: -384, z: -160 };
const RACE_CPS = [
  { x: -384, z: 64 }, { x: -128, z: 64 }, { x: -128, z: -320 },
  { x: 192, z: -320 }, { x: 192, z: 64 },
];
const RACE_TIME = 90;

let coinMat = null;
let archMesh = null;
let cpMeshes = [];

export function buildActivities() {
  coinMat = new THREE.MeshLambertMaterial({ color: 0xe8c33c, emissive: 0xa8840a, emissiveIntensity: 0.7 });
  COIN_SPOTS.forEach((spot, i) => {
    const coin = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.22, 8, 16), coinMat);
    coin.position.set(spot.x, 1.2, spot.z);
    coin.rotation.y = Math.PI / 2;
    G.scene.add(coin);
    G.coins.push({ mesh: coin, x: spot.x, z: spot.z, idx: i, taken: false });
  });
  // Race arch: two posts + a banner, ON the north-south road at x=-384.
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2e3236 });
  const bannerMat = new THREE.MeshLambertMaterial({ color: 0x4ecdc4, emissive: 0x2a7a74, emissiveIntensity: 0.5 });
  archMesh = new THREE.Group();
  for (const sx of [-6, 6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), postMat);
    post.position.set(sx, 3, 0); archMesh.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(12.6, 1.6, 0.5), bannerMat);
  banner.position.set(0, 6.4, 0); archMesh.add(banner);
  archMesh.position.set(RACE_ARCH.x, 0, RACE_ARCH.z);
  G.scene.add(archMesh);
  // Checkpoint rings (hidden until the race starts).
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  RACE_CPS.forEach((cp) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(4, 5, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cp.x, 0.3, cp.z);
    ring.visible = false;
    G.scene.add(ring);
    cpMeshes.push(ring);
  });
  G.race = null;
  G.raceCooldown = 0;
}

export function raceTarget() {
  if (!G.race) return null;
  if (G.race.cpIdx < RACE_CPS.length) {
    const cp = RACE_CPS[G.race.cpIdx];
    return { x: cp.x, z: cp.z, label: `Race CP ${G.race.cpIdx + 1}/5` };
  }
  return null;
}

export function updateActivities(dt) {
  // Coins: spin, bob, collect.
  const px = G.player ? G.player.position.x : 0;
  const pz = G.player ? G.player.position.z : 0;
  for (const coin of G.coins) {
    if (coin.taken) continue;
    coin.mesh.rotation.y += dt * 2;
    coin.mesh.position.y = 1.2 + Math.sin(G.time * 2 + coin.idx) * 0.15;
    if (dist2(px, pz, coin.x, coin.z) < 3) {
      coin.taken = true;
      coin.mesh.visible = false;
      G.coinGot.push(coin.idx);
      if (G.coinGot.length >= 12) {
        G.money += 500;
        showCard('ALL 12 VERDE COINS', '+$500');
        playStory('coins');
        saveGame();
      }
    }
  }
  // Race.
  G.raceCooldown = Math.max(0, (G.raceCooldown || 0) - dt);
  if (!G.race) {
    if (G.playerCar && G.raceCooldown <= 0 && dist2(px, pz, RACE_ARCH.x, RACE_ARCH.z) < 8) {
      G.race = { t: RACE_TIME, cpIdx: 0, elapsed: 0 };
      cpMeshes.forEach((r, i) => { r.visible = i === 0; });
      queueDialog('Race', 'Sunset Sprint! 90 seconds, 5 checkpoints. Go!');
    }
    return;
  }
  const race = G.race;
  race.t -= dt;
  race.elapsed += dt;
  if (race.t <= 0) {
    G.race = null;
    G.raceCooldown = 10;
    cpMeshes.forEach(r => { r.visible = false; });
    queueDialog('Race', 'Time up. The sprint will wait for you.');
    return;
  }
  const cp = RACE_CPS[race.cpIdx];
  if (cp && dist2(px, pz, cp.x, cp.z) < 12) {
    race.cpIdx++;
    cpMeshes.forEach((r, i) => { r.visible = i === race.cpIdx; });
    if (race.cpIdx >= RACE_CPS.length) {
      const bonus = Math.min(200, Math.round(race.t) * 5);
      const pay = 300 + bonus;
      G.money += pay;
      if (!G.raceBest || race.elapsed < G.raceBest) G.raceBest = Math.round(race.elapsed * 10) / 10;
      showCard('SUNSET SPRINT COMPLETE', `+$${pay}  (best ${G.raceBest}s)`);
      G.race = null;
      G.raceCooldown = 10;
      cpMeshes.forEach(r => { r.visible = false; });
      saveGame();
    }
  }
}

export function raceHudText() {
  if (!G.race) return '';
  const cp = RACE_CPS[G.race.cpIdx];
  return `SUNSET SPRINT — CP ${G.race.cpIdx + 1}/5 — ${fmtTime(G.race.t)}`;
}
