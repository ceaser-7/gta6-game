// Porto Verde — side activities: 12 Verde Coins and the Sunset Sprint race.
import * as THREE from '../vendor/three.module.min.js';
import { G, dist, clamp } from './state.js';
import { playStory } from './story.js';

// 12 coin spots: all on roads, sidewalks, parks or the plaza — never inside a building.
export const COIN_SPOTS = [
  { x: -384, z: 96 }, { x: -256, z: -224 }, { x: -128, z: 320 }, { x: 0, z: 0 },
  { x: 64, z: -384 }, { x: 192, z: 128 }, { x: 256, z: -64 }, { x: 320, z: 256 },
  { x: -224, z: -224 }, { x: 224, z: 224 }, { x: -64, z: -320 }, { x: 128, z: 384 },
];

export function buildCoins() {
  const geo = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  for (let i = 0; i < COIN_SPOTS.length; i++) {
    const s = COIN_SPOTS[i];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(s.x, 1.2, s.z);
    G.scene.add(mesh);
    G.coins.push({ i, x: s.x, z: s.z, mesh, got: false });
  }
}

export function updateCoins(dt) {
  const p = G.player;
  for (const c of G.coins) {
    if (c.got) continue;
    c.mesh.rotation.z += dt * 2;
    c.mesh.position.y = 1.2 + Math.sin(G.time * 3 + c.i) * 0.25;
    if (dist(p.x, p.z, c.x, c.z) < 3) {
      c.got = true;
      G.coinGot.push(c.i);
      G.scene.remove(c.mesh);
      G.ui.toast && G.ui.toast(`Verde Coin ${G.coinGot.length}/12`);
      if (G.coinGot.length >= 12) {
        p.money += 500;
        G.ui.card && G.ui.card('ALL 12 VERDE COINS', '+$500');
        playStory('coins');
        G.save && G.save();
      }
      G.ui.updateHud && G.ui.updateHud();
    }
  }
}

// Sunset Sprint: start arch ON the north-south road at x=-384, z=-160.
export const RACE_START = { x: -384, z: -160 };
export const RACE_CPS = [
  { x: -384, z: -320 }, { x: -192, z: -384 }, { x: 0, z: -384 },
  { x: 192, z: -256 }, { x: -384, z: -160 },
];
const RACE_TIME = 90;

let archMesh = null, cpMeshes = [];

export function buildRace() {
  const scene = G.scene;
  // start arch: two posts + a beam over the road
  const postMat = new THREE.MeshLambertMaterial({ color: 0xffd34d });
  const g = new THREE.Group();
  for (const sx of [-8, 8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 8), postMat);
    post.position.set(sx, 3.5, 0); g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17, 1.4, 1.2), postMat);
  beam.position.set(0, 7.2, 0); g.add(beam);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 0.3), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  flag.position.set(0, 6.2, 0); g.add(flag);
  g.position.set(RACE_START.x, 0, RACE_START.z);
  scene.add(g);
  archMesh = g;
  // checkpoint rings
  const ringGeo = new THREE.TorusGeometry(5, 0.5, 8, 24);
  for (let i = 0; i < RACE_CPS.length; i++) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.4 }));
    ring.position.set(RACE_CPS[i].x, 2.5, RACE_CPS[i].z);
    ring.visible = false;
    scene.add(ring);
    cpMeshes.push(ring);
  }
}

export function updateRace(dt) {
  const r = G.race;
  const p = G.player;
  if (r.cooldown > 0) r.cooldown -= dt;
  if (!r.active) {
    // start when the player drives through the arch
    if (!p.onFoot && r.cooldown <= 0 && dist(p.x, p.z, RACE_START.x, RACE_START.z) < 7) {
      r.active = true; r.cp = 0; r.t = RACE_TIME;
      cpMeshes[0].visible = true;
      cpMeshes[0].material.opacity = 0.95;
      G.ui.toast && G.ui.toast('SUNSET SPRINT — 90 seconds, 5 checkpoints!');
      G.ui.updateHud && G.ui.updateHud();
    }
    return;
  }
  r.t -= dt;
  const cp = RACE_CPS[r.cp];
  if (cp && dist(p.x, p.z, cp.x, cp.z) < 8) {
    cpMeshes[r.cp].visible = false;
    r.cp++;
    if (r.cp >= RACE_CPS.length) {
      const bonus = Math.min(200, Math.floor(r.t) * 5);
      const pay = 300 + bonus;
      p.money += pay;
      const best = r.t;
      if (r.best === null || best > r.best) r.best = best;
      G.ui.card && G.ui.card('SUNSET SPRINT FINISHED', `+$${pay} (${Math.floor(best)}s left)`);
      r.active = false; r.cooldown = 10;
      G.save && G.save();
      G.ui.updateHud && G.ui.updateHud();
      return;
    }
    cpMeshes[r.cp].visible = true;
    cpMeshes[r.cp].material.opacity = 0.95;
    G.ui.toast && G.ui.toast(`Checkpoint ${r.cp}/${RACE_CPS.length}`);
  }
  if (r.t <= 0) {
    r.active = false; r.cooldown = 10;
    for (const m of cpMeshes) m.visible = false;
    G.ui.toast && G.ui.toast('Race over — time up. Drive through the arch to try again.');
    G.ui.updateHud && G.ui.updateHud();
  }
  G.ui.updateHud && G.ui.updateHud();
}

export function resetActivities() {
  for (const c of G.coins) { c.got = false; G.scene.add(c.mesh); }
  G.coinGot = [];
  G.race.best = null;
}
