// Weapons: 4 slots (fists, pistol 12-round mag, SMG, locked shotgun), switching, firing.
import * as THREE from 'three';
import { G, WEAPONS, clamp, dist2 } from './state.js';
import { sfxShot, sfxPunch } from './audio.js';
import { addWanted } from './police.js';

let lastShot = 0;

export function initWeapons() {
  G.weapons = WEAPONS.map(w => ({ ...w, locked: !!w.locked }));
  G.ammo = WEAPONS.map(w => ({ mag: w.mag === Infinity ? Infinity : w.mag, reserve: w.reserve }));
  G.weapon = 0;
}

export function switchWeapon(i) {
  if (i < 0 || i > 3) return;
  if (G.weapons[i].locked) {
    if (G.toast) G.toast(G.weapons[i].name + ' is locked — finish Chapter 4 to unlock it.');
    return;
  }
  G.weapon = i;
  if (G.updateHUD) G.updateHUD();
}

export function reloadWeapon() {
  const w = G.weapons[G.weapon], a = G.ammo[G.weapon];
  if (!w || w.mag === Infinity || a.mag === w.mag || a.reserve <= 0) return;
  const need = w.mag - a.mag, take = Math.min(need, a.reserve);
  a.mag += take; a.reserve -= take;
  if (G.updateHUD) G.updateHUD();
}

// Punch: melee in front of the player. Hits peds/police/takedown targets.
export function punch() {
  if (!G.player || !G.player.onFoot) return;
  sfxPunch();
  const p = G.player, px = p.pos.x, pz = p.pos.z;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  // Takedown target (mission)
  if (G.mission && G.mission.stages[G.mission.stage] && G.mission.stages[G.mission.stage].takedown) {
    const d = Math.hypot(px - G.mission.target[0], pz - G.mission.target[1]);
    if (d < 16) {
      G.mission.takedownLeft = 0;
      if (G.toast) G.toast('Lookout down!');
      addWanted(2);
      return;
    }
  }
  // Shove a nearby pedestrian
  for (const ped of G.peds) {
    const dx = ped.mesh.position.x - px, dz = ped.mesh.position.z - pz;
    if (dx * dx + dz * dz < 6) {
      ped.mesh.position.x += fx * 3; ped.mesh.position.z += fz * 3;
      ped.state = 'walk'; ped.heading = Math.atan2(dx, dz);
      addWanted(1);
      return;
    }
  }
}

// Fire the current weapon (hitscan). Returns true if fired.
export function fireWeapon() {
  if (!G.player) return false;
  const now = performance.now() / 1000;
  const w = G.weapons[G.weapon], a = G.ammo[G.weapon];
  if (!w || now - lastShot < w.rate) return false;
  if (w.mag !== Infinity && a.mag <= 0) { reloadWeapon(); return false; }
  lastShot = now;
  if (w.mag !== Infinity) a.mag--;
  sfxShot();
  addWanted(1);
  const p = G.player;
  const ox = p.pos.x, oz = p.pos.z;
  const oy = p.onFoot ? 1.4 : 1.2;
  // Aim: forward from player/camera
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const range = 60;
  const ex = ox + fx * range, ez = oz + fz * range;
  // Tracer line
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(ox, oy, oz), new THREE.Vector3(ex, oy, ez),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.tracers.push({ line, t: 0.09 });
  // Hit check: peds near the line, police, takedown target
  const hitR = 3;
  for (const ped of G.peds) {
    const dx = ped.mesh.position.x - ox, dz = ped.mesh.position.z - oz;
    const along = dx * fx + dz * fz;
    if (along > 0 && along < range) {
      const perp = Math.abs(dx * fz - dz * fx);
      if (perp < hitR) {
        ped.mesh.position.x += fx * 4; ped.mesh.position.z += fz * 4;
        ped.state = 'walk'; ped.heading = Math.atan2(dx, dz);
        break;
      }
    }
  }
  for (const u of G.police) {
    const dx = u.mesh.position.x - ox, dz = u.mesh.position.z - oz;
    const along = dx * fx + dz * fz;
    if (along > 0 && along < range) {
      const perp = Math.abs(dx * fz - dz * fx);
      if (perp < 3.5) {
        u.speed *= 0.4;
        u.mesh.userData.smoke.visible = true;
        addWanted(1);
        break;
      }
    }
  }
  if (G.mission && G.mission.stages[G.mission.stage] && G.mission.stages[G.mission.stage].takedown) {
    const d = Math.hypot(ox - G.mission.target[0], oz - G.mission.target[1]);
    if (d < 40) {
      G.mission.takedownLeft = 0;
      if (G.toast) G.toast('Target down!');
      addWanted(2);
    }
  }
  if (G.updateHUD) G.updateHUD();
  return true;
}

export function updateTracers(dt) {
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.t -= dt;
    if (t.t <= 0) { G.scene.remove(t.line); G.tracers.splice(i, 1); }
  }
}
