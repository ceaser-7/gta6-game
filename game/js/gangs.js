// Gangsters — rival crews holding turf. Three territories, each with
// a hideout and members who patrol, guard, and turn hostile when the
// player flashes a weapon on their turf or crowds them. Gang heat
// 0-5 rises while crews are hostile and cools when you lay low.
import * as THREE from 'three';
import { G, clamp, rand, pick } from './state.js';
import { makePersonMesh } from './people.js';

const TURF_R = 90;
const HIDEOUT_R = 25;
const PROVOKE_D = 3.2;
const HIT_D = 2.6;
const PATROL_SPEED = 2.2;
const HUNT_SPEED = 5.6;
const HIT_DPS = 12;
const HEAT_RISE = 0.2;
const HEAT_COOL = 0.12;

const TERRITORIES = [
  { name: 'The Docks', cx: 240, cz: 40, color: 0x4db8e8, css: '#4db8e8', hideout: [262, 62] },
  { name: 'Old Town', cx: -200, cz: -40, color: 0xff6a5a, css: '#ff6a5a', hideout: [-222, -62] },
  { name: 'Northside', cx: 0, cz: -240, color: 0x8aff6a, css: '#8aff6a', hideout: [22, -262] },
];

function randomPointIn(t) {
  const a = rand(0, Math.PI * 2);
  const r = Math.sqrt(Math.random()) * (TURF_R - 12);
  return [t.cx + Math.cos(a) * r, t.cz + Math.sin(a) * r];
}

function spawnMember(t) {
  const [x, z] = randomPointIn(t);
  const mesh = makePersonMesh(t.color, pick([0xc89878, 0x8a5a38, 0xe8b890, 0x6a3a22]));
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  // Floating diamond above the head (territory colour, red when hostile).
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    new THREE.MeshBasicMaterial({ color: t.color })
  );
  gem.position.set(x, 2.3, z);
  G.scene.add(gem);
  const [ax, az] = randomPointIn(t);
  const [bx, bz] = randomPointIn(t);
  const m = {
    territory: t, mesh, gem,
    state: 'patrol', wpA: [ax, az], wpB: [bx, bz], wpTarget: 'A',
    heading: rand(0, Math.PI * 2), phase: rand(0, 6), speed: PATROL_SPEED,
  };
  mesh.position.set(x, 0, z);
  G.gangs.members.push(m);
  return m;
}

function removeMember(m) {
  G.scene.remove(m.mesh);
  G.scene.remove(m.gem);
  G.gangs.members = G.gangs.members.filter(x => x !== m);
}

export function initGangs() {
  G.gangs = { territories: TERRITORIES, members: [], heat: 0 };
  for (const t of TERRITORIES) {
    for (let i = 0; i < 3; i++) spawnMember(t);
  }
}

function inTerritory(t, x, z) {
  return Math.hypot(x - t.cx, z - t.cz) < TURF_R;
}

function setHostile(m) {
  if (m.state === 'hostile') return;
  m.state = 'hostile';
  m.gem.material.color.setHex(0xff2020);
}

function setCalm(m) {
  if (m.state === 'patrol') return;
  m.state = 'patrol';
  m.gem.material.color.setHex(m.territory.color);
  const [ax, az] = randomPointIn(m.territory);
  const [bx, bz] = randomPointIn(m.territory);
  m.wpA = [ax, az];
  m.wpB = [bx, bz];
  m.wpTarget = 'A';
}

function moveMember(m, tx, tz, speed, dt) {
  const dx = tx - m.mesh.position.x;
  const dz = tz - m.mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return d;
  m.heading = Math.atan2(dx, dz);
  m.mesh.position.x += Math.sin(m.heading) * speed * dt;
  m.mesh.position.z += Math.cos(m.heading) * speed * dt;
  m.mesh.rotation.y = m.heading;
  m.phase += dt * 7;
  m.mesh.userData.legL.rotation.x = Math.sin(m.phase) * 0.55;
  m.mesh.userData.legR.rotation.x = -Math.sin(m.phase) * 0.55;
  m.mesh.userData.armL.rotation.x = -Math.sin(m.phase) * 0.45;
  m.mesh.userData.armR.rotation.x = Math.sin(m.phase) * 0.45;
  return d;
}

export function updateGangs(dt, t) {
  const gangs = G.gangs;
  if (!gangs || !G.player) return;
  const p = G.player;
  const px = p.pos.x;
  const pz = p.pos.z;
  const heat = gangs.heat;

  // Turf warning: a one-off toast the first time you step into a territory.
  let currentTurf = null;
  for (const terr of TERRITORIES) {
    if (inTerritory(terr, px, pz)) { currentTurf = terr; break; }
  }
  if (currentTurf && gangs.lastTurf !== currentTurf.name) {
    gangs.lastTurf = currentTurf.name;
    if (G.toast) G.toast('You are in ' + currentTurf.name + ' turf — the crew is watching.');
  } else if (!currentTurf) {
    gangs.lastTurf = null;
  }

  // Provocations: weapon out on turf, crowding a member, or the hideout
  // while its crew is already hostile.
  for (const m of gangs.members) {
    if (m.state === 'patrol') {
      const onTurf = inTerritory(m.territory, px, pz);
      const d = Math.hypot(px - m.mesh.position.x, pz - m.mesh.position.z);
      if ((onTurf && G.weapon > 0) || d < PROVOKE_D) setHostile(m);
    }
  }
  for (const terr of TERRITORIES) {
    const crew = gangs.members.filter(m => m.territory === terr);
    const anyHostile = crew.some(m => m.state === 'hostile');
    if (!anyHostile) continue;
    const [hx, hz] = terr.hideout;
    if (Math.hypot(px - hx, pz - hz) < HIDEOUT_R) {
      for (const m of crew) setHostile(m);
    }
  }
  // Heat 3+: every crew hunts the player anywhere.
  if (heat >= 3) {
    for (const m of gangs.members) setHostile(m);
  }

  // Heat rises while a crew is hostile on its turf; cools while you lay
  // low far from every member.
  let hostileOnTurf = false;
  let nearestD = Infinity;
  for (const m of gangs.members) {
    const d = Math.hypot(px - m.mesh.position.x, pz - m.mesh.position.z);
    if (d < nearestD) nearestD = d;
    if (m.state === 'hostile' && inTerritory(m.territory, px, pz)) hostileOnTurf = true;
  }
  if (hostileOnTurf) gangs.heat = clamp(gangs.heat + HEAT_RISE * dt, 0, 5);
  else if (nearestD > 40) gangs.heat = clamp(gangs.heat - HEAT_COOL * dt, 0, 5);
  if (gangs.heat <= 0) {
    for (const m of gangs.members) setCalm(m);
  }

  // Reinforcements at heat 3+: each territory grows to 5 members.
  for (const terr of TERRITORIES) {
    const crew = gangs.members.filter(m => m.territory === terr);
    const want = gangs.heat >= 3 ? 5 : 3;
    if (crew.length < want) spawnMember(terr);
    else if (crew.length > want) {
      const calm = crew.find(m => m.state === 'patrol');
      if (calm) removeMember(calm);
    }
  }

  // Move every member; hostile ones converge and hit up close.
  for (const m of gangs.members) {
    const onTurf = inTerritory(m.territory, px, pz);
    const hunting = m.state === 'hostile' && (onTurf || gangs.heat >= 3);
    if (m.state === 'hostile' && !hunting) {
      setCalm(m);
      continue;
    }
    if (hunting) {
      const d = moveMember(m, px, pz, HUNT_SPEED, dt);
      if (d < HIT_D && !p.car) {
        p.health -= HIT_DPS * dt;
      }
    } else {
      const target = m.wpTarget === 'A' ? m.wpA : m.wpB;
      const d = moveMember(m, target[0], target[1], PATROL_SPEED, dt);
      if (d < 3) m.wpTarget = m.wpTarget === 'A' ? 'B' : 'A';
    }
    // Diamond bobs above the head and spins.
    m.gem.position.set(m.mesh.position.x, 2.3 + Math.sin(t * 2 + m.phase) * 0.15, m.mesh.position.z);
    m.gem.rotation.y += dt * 1.5;
  }
}

// ---- Map data ----
export function gangTerritories() {
  return TERRITORIES.map(t => ({
    name: t.name, cx: t.cx, cz: t.cz, r: TURF_R, color: t.css,
    hideout: t.hideout,
  }));
}

export function gangMemberDots() {
  if (!G.gangs) return [];
  return G.gangs.members.map(m => ({
    x: m.mesh.position.x, z: m.mesh.position.z,
    color: m.state === 'hostile' ? '#ff2020' : m.territory.css,
    hostile: m.state === 'hostile',
  }));
}
