// Gangsters — rival crews holding turf on the island.
// Three territories, each with its own colours, a hideout, and members who
// patrol, guard, and turn hostile when the player pushes into their turf
// with a weapon out or crowds one of them. Attacking gangsters raises gang
// heat; high heat means more gangsters, and they hunt the player anywhere.
// Laying low cools it down. Written fresh for v3.
import * as THREE from 'three';
import { G, WORLD, clamp, rand, randi, pick } from './state.js';
import { makePersonMesh } from './people.js';

const TERRITORIES = [
  { id: 'docks',     name: 'The Docks',  cx: 240,  cz: 40,   r: 90, color: 0x2a6b8a, css: '#4db8e8', hideout: [262, 62],  label: 'DOCKS' },
  { id: 'oldtown',   name: 'Old Town',   cx: -200, cz: -40,  r: 90, color: 0x8a2a2a, css: '#ff6a5a', hideout: [-222, -62], label: 'OLD TOWN' },
  { id: 'northside', name: 'Northside',  cx: 0,    cz: -240, r: 90, color: 0x4a8a2a, css: '#8aff6a', hideout: [22, -262],  label: 'NORTHSIDE' },
];

const PATROL_SPEED = 2.2;   // walking a route
const CHASE_SPEED = 5.6;    // converging on the player
const HIT_RANGE = 2.6;      // close enough to land a hit
const HIT_DPS = 12;         // damage per second inside HIT_RANGE
const CROWD_RANGE = 3.2;    // getting this close to a member provokes it
const HEAT_MAX = 5;
const HUNT_HEAT = 3;        // at this heat, gangsters hunt anywhere
const HEAT_RISE = 0.10;     // per second while a member is hostile in turf
const HEAT_COOL = 0.05;     // per second while laying low outside turf
const BASE_CREW = 3;        // members per territory at heat 0
const MAX_CREW = 5;         // members per territory at max heat

function territoryAt(x, z) {
  for (const t of TERRITORIES) {
    if (Math.hypot(x - t.cx, z - t.cz) < t.r) return t;
  }
  return null;
}

function makeMember(territory, x, z) {
  const mesh = makePersonMesh(territory.color, 0xc89878);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  // A floating diamond in the gang colour, so a gangster reads as one.
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42),
    new THREE.MeshStandardMaterial({ color: territory.color, emissive: territory.color, emissiveIntensity: 1.4 })
  );
  gem.position.y = 2.25;
  mesh.add(gem);
  // Two patrol waypoints inside the territory.
  const wp = [];
  for (let i = 0; i < 2; i++) {
    const a = rand(0, Math.PI * 2), r = rand(15, territory.r - 15);
    wp.push([territory.cx + Math.cos(a) * r, territory.cz + Math.sin(a) * r]);
  }
  return {
    mesh, gem, territory, waypoints: wp, wpIdx: 0,
    state: 'patrol', heading: rand(0, Math.PI * 2), speed: PATROL_SPEED, phase: rand(0, 6),
  };
}

function spawnMember(territory) {
  const a = rand(0, Math.PI * 2), r = rand(10, territory.r - 20);
  const m = makeMember(territory, territory.cx + Math.cos(a) * r, territory.cz + Math.sin(a) * r);
  G.gangs.members.push(m);
  return m;
}

export function initGangs() {
  G.gangs = { territories: TERRITORIES, members: [], heat: 0 };
  for (const t of TERRITORIES) {
    for (let i = 0; i < BASE_CREW; i++) spawnMember(t);
  }
}

function moveToward(m, tx, tz, speed, dt) {
  const dx = tx - m.mesh.position.x, dz = tz - m.mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return true;
  const vx = dx / d, vz = dz / d;
  m.mesh.position.x += vx * speed * dt;
  m.mesh.position.z += vz * speed * dt;
  m.heading = Math.atan2(vx, vz);
  m.mesh.rotation.y = m.heading;
  m.phase += dt * 8;
  m.mesh.userData.legL.rotation.x = Math.sin(m.phase) * 0.6;
  m.mesh.userData.legR.rotation.x = -Math.sin(m.phase) * 0.6;
  return false;
}

export function updateGangs(dt, t) {
  if (!G.gangs || !G.running || !G.player) return;
  const g = G.gangs;
  const p = G.player;
  const turf = territoryAt(p.pos.x, p.pos.z);
  const weaponOut = G.weapon > 0;
  let anyHostile = false;

  // Reinforce at high heat: one extra member per territory per heat point
  // above the hunt threshold, up to the cap.
  if (g.heat >= HUNT_HEAT) {
    for (const terr of TERRITORIES) {
      const want = Math.min(MAX_CREW, BASE_CREW + Math.floor(g.heat - HUNT_HEAT) + 1);
      const have = g.members.filter(m => m.territory === terr).length;
      if (have < want) spawnMember(terr);
    }
  }

  for (const m of g.members) {
    const inHomeTurf = turf && turf.id === m.territory.id;
    const nearPlayer = Math.hypot(p.pos.x - m.mesh.position.x, p.pos.z - m.mesh.position.z);
    // Provocations: weapon out on their turf, or crowding a member.
    if ((inHomeTurf && weaponOut) || nearPlayer < CROWD_RANGE) {
      if (m.state !== 'hostile') {
        m.state = 'hostile';
        if (nearPlayer < CROWD_RANGE && g.heat < HEAT_MAX) g.heat = Math.min(HEAT_MAX, g.heat + 0.5);
      }
    }
    // Hideout: stepping into a hideout's radius while its crew is hostile
    // brings the whole crew down on the player.
    const hd = Math.hypot(p.pos.x - m.territory.hideout[0], p.pos.z - m.territory.hideout[1]);
    if (hd < 25 && m.state === 'hostile') {
      for (const other of g.members) {
        if (other.territory === m.territory) other.state = 'hostile';
      }
    }
    // Hunt at high heat, even outside the turf.
    const hunting = g.heat >= HUNT_HEAT;
    if (m.state === 'hostile' || hunting) {
      anyHostile = true;
      moveToward(m, p.pos.x, p.pos.z, CHASE_SPEED, dt);
      if (nearPlayer < HIT_RANGE) {
        p.health -= HIT_DPS * dt;
        if (G.toast && Math.random() < dt * 0.5) G.toast('A ' + m.territory.name + ' gangster is beating on you!');
      }
    } else {
      // Patrol: walk the waypoints, idle briefly at each one.
      const wp = m.waypoints[m.wpIdx];
      if (moveToward(m, wp[0], wp[1], PATROL_SPEED, dt)) {
        m.wpIdx = (m.wpIdx + 1) % m.waypoints.length;
      }
    }
    // The diamond bobs and spins so the crew reads at a glance.
    m.gem.rotation.y += dt * 2;
    m.gem.position.y = 2.25 + Math.sin(t * 2 + m.phase) * 0.12;
  }

  // Heat: rises while a member is hostile on turf, cools while laying low.
  if (anyHostile && turf) {
    g.heat = Math.min(HEAT_MAX, g.heat + HEAT_RISE * dt);
  } else if (!turf && !anyHostile) {
    g.heat = Math.max(0, g.heat - HEAT_COOL * dt);
  }
  // Calm down a crew that has lost the player entirely.
  if (g.heat <= 0) {
    for (const m of g.members) {
      if (m.state === 'hostile') m.state = 'patrol';
    }
  }
}

// ---- Map / HUD helpers ----
export function gangTerritories() {
  if (!G.gangs) return [];
  return G.gangs.territories.map(t => ({ cx: t.cx, cz: t.cz, r: t.r, color: t.css, label: t.label, hx: t.hideout[0], hz: t.hideout[1] }));
}

export function gangMemberDots() {
  if (!G.gangs) return [];
  return G.gangs.members.map(m => ({
    x: m.mesh.position.x, z: m.mesh.position.z,
    color: m.state === 'hostile' ? '#ff2020' : m.territory.css,
  }));
}
