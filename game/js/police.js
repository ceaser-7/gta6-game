// Police: wanted 0–5 stars, pursuit units with callsigns, roadblocks, helicopter.
import * as THREE from 'three';
import { G, WORLD, clamp, lerp, rand, randi, pick } from './state.js';
import { spawnCar, collideAt, clampToIsland } from './vehicles.js';

const CALLSIGNS = ['UNIT 7', 'UNIT 12', 'UNIT 19', 'UNIT 23', 'UNIT 31', 'UNIT 44', 'UNIT 58', 'UNIT 63'];
const BEHAVIOURS = ['PURSUIT', 'RAMMING', 'ROADBLOCK', 'SEARCH'];

// Raise wanted by n stars (clamped 0..5). Returns new level.
export function addWanted(n) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.wantedHeat = 1;
  if (G.wanted > before && G.toast) G.toast('Wanted level ' + G.wanted + ' — the police are coming!');
  syncPolice();
  return G.wanted;
}

// Sol direction: pursuit speed interpolates 0.85x the player's top speed nearby
// to <=1.05x far away, respecting acceleration (no instant catch-up boosts).
export function getPursuitTargetSpeed(u, d) {
  const top = (G.player && G.player.car) ? G.player.car.type.top : 26;
  const near = 0.85 * top, far = 1.05 * top;
  return lerp(near, far, clamp(d / 80, 0, 1));
}

function policeType() { return { name: 'Interceptor', top: 34, accel: 19, color: 0x1a1a2a, len: 4.4 }; }

// Spawn/despawn police units to match the wanted level.
export function syncPolice() {
  const want = G.wanted === 0 ? 0 : 1 + G.wanted; // 2..6 units
  while (G.police.length < want) {
    const a = rand(0, Math.PI * 2), r = rand(60, 120);
    const px = G.player.pos.x + Math.cos(a) * r, pz = G.player.pos.z + Math.sin(a) * r;
    const [cx, cz] = clampToIsland(px, pz, 20);
    const car = spawnCar(cx, cz, 0, 0, { police: true });
    car.type = policeType();
    car.callsign = CALLSIGNS[G.police.length % CALLSIGNS.length];
    car.behaviour = pick(BEHAVIOURS.slice(0, 2));
    car.mesh.userData.lightBar = car.mesh.userData.lightBar || null;
    G.police.push(car);
  }
  while (G.police.length > want) {
    const c = G.police.pop();
    G.scene.remove(c.mesh);
  }
  // Helicopter at wanted 4+
  if (G.wanted >= 4 && !G.heli) spawnHeli();
  if (G.wanted < 4 && G.heli) { G.scene.remove(G.heli.mesh); G.heli = null; }
  // Roadblocks at wanted 3+
  if (G.wanted >= 3 && G.roadblocks.length === 0) spawnRoadblocks();
  if (G.wanted < 3 && G.roadblocks.length) {
    for (const rb of G.roadblocks) G.scene.remove(rb);
    G.roadblocks = [];
  }
}

function spawnHeli() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.4, metalness: 0.5 }));
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x1a2a3a }));
  tail.position.set(0, 0.3, -4.5); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rotor.position.y = 1; g.add(rotor);
  const spot = new THREE.Mesh(new THREE.ConeGeometry(3, 18, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  spot.position.y = -9; spot.rotation.x = Math.PI; g.add(spot);
  g.userData.rotor = rotor;
  g.position.set(G.player.pos.x + 20, 55, G.player.pos.z + 20);
  G.scene.add(g);
  G.heli = { mesh: g, phase: 0 };
}

function spawnRoadblocks() {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of dirs) {
    const bx = G.player.pos.x + dx * 55, bz = G.player.pos.z + dz * 55;
    const [cx, cz] = clampToIsland(bx, bz, 30);
    const car = spawnCar(cx, cz, Math.atan2(dx, dz), 0, { police: true });
    car.type = policeType();
    car.callsign = 'BLOCK';
    car.behaviour = 'ROADBLOCK';
    G.police.push(car);
    const rb = car.mesh;
    G.roadblocks.push(rb);
    // Barrier
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xaa5500, emissiveIntensity: 0.6 }));
    barrier.position.set(cx + dx * 6, 0.6, cz + dz * 6);
    barrier.rotation.y = Math.atan2(dx, dz);
    G.scene.add(barrier); G.roadblocks.push(barrier);
  }
}

// Police AI: chase, ram, block. Returns true if a unit is touching the player.
export function updatePolice(dt) {
  if (!G.player) return;
  const px = G.player.pos.x, pz = G.player.pos.z;
  const playerSpeed = G.player.onFoot ? 0 : Math.abs(G.player.car ? G.player.car.speed : 0);
  let touching = false;
  for (const u of G.police) {
    const dx = px - u.mesh.position.x, dz = pz - u.mesh.position.z;
    const d = Math.hypot(dx, dz);
    u.dist = d;
    // Behaviour switching
    if (u.behaviour === 'ROADBLOCK') {
      // Hold position, face the player
      u.mesh.rotation.y = Math.atan2(dx, dz);
      if (d < 60) u.behaviour = 'PURSUIT';
      continue;
    }
    if (d < 12 && u.behaviour !== 'RAMMING') u.behaviour = 'RAMMING';
    if (d > 40 && u.behaviour === 'RAMMING') u.behaviour = 'PURSUIT';
    // Steer toward the player (with a little wobble)
    const wantHeading = Math.atan2(dx, dz) + Math.sin(G.timeOfDay * 2 + u.mesh.position.x) * 0.06;
    let dh = wantHeading - u.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    u.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    // Sol: speed scales with the player's car (0.85x nearby -> 1.05x far), eased in.
    const base = getPursuitTargetSpeed(u, d);
    const target = u.behaviour === 'RAMMING' ? base * 1.05 : base;
    u.speed = lerp(u.speed, Math.min(target, d * 0.9 + 6), dt * 1.2);
    const nx = u.mesh.position.x + Math.sin(u.heading) * u.speed * dt;
    const nz = u.mesh.position.z + Math.cos(u.heading) * u.speed * dt;
    if (!collideAt(nx, nz, 2)) {
      const [cx, cz] = clampToIsland(nx, nz, 8);
      u.mesh.position.x = cx; u.mesh.position.z = cz;
    } else {
      u.speed *= 0.5;
    }
    u.mesh.rotation.y = u.heading;
    for (const w of u.mesh.userData.wheels) w.rotation.x += u.speed * dt * 2;
    // Flash the light bar
    if (u.mesh.userData.lightBar) {
      const on = Math.floor(G.timeOfDay * 8) % 2 === 0;
      u.mesh.userData.lightBar[0].material.emissiveIntensity = on ? 2.5 : 0.2;
      u.mesh.userData.lightBar[1].material.emissiveIntensity = on ? 0.2 : 2.5;
    }
    if (d < 4.5) touching = true;
  }
  // Helicopter follows overhead
  if (G.heli) {
    G.heli.phase += dt;
    const h = G.heli.mesh;
    h.position.x = lerp(h.position.x, px + Math.sin(G.heli.phase * 0.4) * 15, dt * 0.7);
    h.position.z = lerp(h.position.z, pz + Math.cos(G.heli.phase * 0.4) * 15, dt * 0.7);
    h.position.y = 55 + Math.sin(G.heli.phase) * 2;
    h.userData.rotor.rotation.y += dt * 22;
    h.rotation.y = Math.atan2(px - h.position.x, pz - h.position.z);
  }
  // Lose-the-cops: break line of sight (distance + no unit near) for ~10s
  if (G.wanted > 0) {
    const nearest = G.police.length ? Math.min(...G.police.map(u => u.dist ?? 999)) : 999;
    if (nearest > 70 && playerSpeed < 6) {
      G.losTimer += dt;
      if (G.losTimer > 10) {
        G.wanted = 0; G.losTimer = 0;
        if (G.toast) G.toast('You lost the cops. Wanted level cleared.');
        syncPolice();
      }
    } else {
      G.losTimer = Math.max(0, G.losTimer - dt * 2);
    }
    // Wanted slowly decays heat when hiding
    G.wantedHeat = Math.max(0, G.wantedHeat - dt * 0.02);
  }
}

// Busted / wasted handling is in main.js; this just reports contact damage.
export function policeTouchingPlayer() {
  if (!G.player || G.wanted === 0) return false;
  for (const u of G.police) if ((u.dist ?? 999) < 4.5) return true;
  return false;
}
