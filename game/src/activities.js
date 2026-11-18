// Porto Verde — side activities: 12 hidden Verde Coins and the Sunset Sprint
// timed race (90s, 5 checkpoints, ~990-unit loop around Downtown and the Marina).
import * as THREE from 'three';
import { G, CFG, rand, dist2, fmtClock, fmtMoney } from './state.js';
import { queueDialog, showCard } from './hud.js';
import { playStory } from './missions.js';

export const COIN_SPOTS = [
  [-32, 195], [40, 40], [430, 100], [-240, 280], [300, 250], [-227, -200],
  [130, -130], [-300, 100], [-100, -300], [400, 350], [0, -60], [350, -50],
];
export const RACE_ARCH = { x: 108, z: -162 };
export const RACE_CPS = [
  [260, -162], [260, 130], [65, 260], [-130, 130], [108, -162],
];

export function buildActivities() {
  const coinGeo = new THREE.TorusGeometry(0.9, 0.28, 10, 20);
  const coinMat = new THREE.MeshPhongMaterial({ color: 0xffd24a, shininess: 100, emissive: 0x8a6d1a, emissiveIntensity: 0.6 });
  for (let i = 0; i < COIN_SPOTS.length; i++) {
    const [x, z] = COIN_SPOTS[i];
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(x, 1.4, z);
    mesh.rotation.y = Math.PI / 2;
    G.scene.add(mesh);
    G.coins.push({ x, z, mesh, got: false, idx: i });
  }
  // race arch: two pillars and a banner
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x2e3236 });
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), pillarMat);
    pillar.position.set(RACE_ARCH.x + s * 5, 3.5, RACE_ARCH.z);
    G.scene.add(pillar);
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x11131a, emissive: 0x4ecdc4, emissiveIntensity: 0.35 }));
  banner.position.set(RACE_ARCH.x, 6.2, RACE_ARCH.z);
  G.scene.add(banner);
  // checkpoint rings (hidden until the race starts)
  const ringGeo = new THREE.TorusGeometry(5, 0.35, 8, 24);
  G.race = { active: false, cp: 0, left: CFG.RACE_TIME, next: null, rings: [], cooldown: 0, startedAt: 0 };
  for (let i = 0; i < RACE_CPS.length; i++) {
    const [x, z] = RACE_CPS[i];
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshLambertMaterial({
      color: 0xffd24a, emissive: 0x8a6d1a, emissiveIntensity: 0.8, transparent: true, opacity: 0.25,
    }));
    ring.position.set(x, 2.2, z);
    ring.rotation.y = Math.PI / 2;
    G.scene.add(ring);
    G.race.rings.push(ring);
  }
}

export function updateActivities(dt) {
  const p = G.player;
  // coins: spin, collect within 3m
  for (const coin of G.coins) {
    if (coin.got) continue;
    coin.mesh.rotation.y += dt * 2.2;
    coin.mesh.position.y = 1.4 + Math.sin(G.time * 2 + coin.idx) * 0.25;
    if (dist2(p.pos.x, p.pos.z, coin.x, coin.z) < 3) {
      coin.got = true;
      coin.mesh.visible = false;
      G.coinsGot.push(coin.idx);
      if (window.PV && window.PV.sfx) window.PV.sfx('coin');
      if (G.coinsGot.length >= CFG.COIN_COUNT) {
        G.money += 500;
        showCard('ALL COINS FOUND', '+$500  •  Rook is impressed');
        playStory('coins');
      }
    }
  }
  // race
  const r = G.race;
  if (r.cooldown > 0) r.cooldown -= dt;
  if (!r.active) {
    if (r.cooldown <= 0 && p.car && dist2(p.pos.x, p.pos.z, RACE_ARCH.x, RACE_ARCH.z) < 6) {
      r.active = true; r.cp = 0; r.left = CFG.RACE_TIME; r.startedAt = G.time;
      r.next = { x: RACE_CPS[0][0], z: RACE_CPS[0][1] };
      r.rings[0].material.opacity = 1;
      queueDialog('Rook', "Sunset Sprint. Five checkpoints, ninety seconds. Show me what that car can do.");
    }
    return;
  }
  r.left -= dt;
  const cp = RACE_CPS[r.cp];
  if (dist2(p.pos.x, p.pos.z, cp[0], cp[1]) < 10) {
    r.rings[r.cp].material.opacity = 0.15;
    r.cp++;
    if (r.cp >= RACE_CPS.length) {
      const used = CFG.RACE_TIME - r.left;
      const bonus = Math.min(200, Math.floor(Math.max(0, r.left)) * 5);
      const pay = 300 + bonus;
      G.money += pay;
      r.active = false; r.cooldown = 10;
      if (!G.raceBest || used < G.raceBest) G.raceBest = Math.round(used * 10) / 10;
      showCard('SUNSET SPRINT — FINISHED', `+${fmtMoney(pay)}  •  ${fmtClock(used)}  •  best ${fmtClock(G.raceBest)}`);
      if (window.PV && window.PV.save) window.PV.save();
    } else {
      r.next = { x: RACE_CPS[r.cp][0], z: RACE_CPS[r.cp][1] };
      r.rings[r.cp].material.opacity = 1;
    }
  }
  if (r.left <= 0) {
    r.active = false; r.cooldown = 10;
    for (const ring of r.rings) ring.material.opacity = 0.25;
    showCard('SUNSET SPRINT — TIME UP', 'Drive through the arch to try again');
  }
}
