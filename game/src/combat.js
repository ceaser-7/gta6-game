// Combat: a pistol, a punch, and the tracers that show where the shots went.
// One clear job: let the player fight, and make the police notice it.
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

export function createCombat(G) {
  G.tracers = [];
  G.lastShot = 0;
  G.lastWantedShot = -99;
}

export function addTracer(G, from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  G.scene.add(line);
  G.tracers.push({ line, life: 0.14 });
}

export function updateTracers(G, dt) {
  for (const t of [...G.tracers]) {
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.14) * 0.95;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      t.line.geometry.dispose(); t.line.material.dispose();
      G.tracers.splice(G.tracers.indexOf(t), 1);
    }
  }
}

function muzzlePos(G) {
  const p = G.player;
  if (p.onFoot) return new THREE.Vector3(p.pos.x, 1.4, p.pos.z);
  return new THREE.Vector3(p.car.pos.x, 1.2, p.car.pos.z);
}

function shootTargets(G) {
  const list = [];
  for (const b of G.city.buildingMeshes) list.push(b);
  for (const ped of G.peds) list.push(ped.group);
  for (const car of G.cars) list.push(car.group);
  return list;
}

export function shoot(G) {
  if (G.time - G.lastShot < 0.28) return;
  G.lastShot = G.time;
  const from = muzzlePos(G);
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  raycaster.set(from, dir);
  raycaster.far = 70;
  const hits = raycaster.intersectObjects(shootTargets(G), true);
  const end = hits.length ? hits[0].point.clone() : from.clone().add(dir.clone().multiplyScalar(60));
  addTracer(G, from, end, 0xffe08a);
  G.audio.shot(false);
  G.lastShotAt = { x: from.x, z: from.z };
  // the noise draws attention
  const nearPolice = G.police.some(c => Math.hypot(c.pos.x - from.x, c.pos.z - from.z) < 45) ||
    G.officers.some(o => Math.hypot(o.pos.x - from.x, o.pos.z - from.z) < 40);
  if (nearPolice && G.time - G.lastWantedShot > 2) {
    G.lastWantedShot = G.time;
    G.addWanted(1, 'Shots fired — the police are coming!');
  }
  if (!hits.length) return;
  // walk up the hit object to find whose it is
  let obj = hits[0].object, owner = null, kind = null;
  while (obj) {
    for (const ped of G.peds) if (ped.group === obj) { owner = ped; kind = 'ped'; break; }
    if (owner) break;
    for (const car of G.cars) if (car.group === obj) { owner = car; kind = 'car'; break; }
    if (owner) break;
    if (G.city.buildingMeshes.includes(obj)) { kind = 'building'; break; }
    obj = obj.parent;
  }
  if (kind === 'ped' && owner) {
    damagePed(G, owner, 34, from);
    if (G.time - G.lastWantedShot > 2) { G.lastWantedShot = G.time; G.addWanted(1, 'You shot someone!'); }
  } else if (kind === 'car' && owner) {
    owner.health -= 12;
    if (owner.isPolice) G.addWanted(1, 'You shot a police cruiser!');
    else if (owner.driver === 'traffic') G.addWanted(1, 'You shot at a car!');
    if (owner.health <= 0 && !owner.dead) {
      owner.dead = true;
      G.audio.thud();
      // a wrecked car stops and smokes; leave it where it is
      owner.speed = 0; owner.maxSpeed = 0;
    }
  }
}

export function damagePed(G, ped, amount, fromPos) {
  if (ped.state === 'down') return;
  ped.health = (ped.health ?? 100) - amount;
  // knockback away from the shooter
  const dx = ped.pos.x - fromPos.x, dz = ped.pos.z - fromPos.z;
  const len = Math.hypot(dx, dz) || 1;
  ped.pos.x += (dx / len) * 0.8; ped.pos.z += (dz / len) * 0.8;
  if (ped.health <= 0) {
    ped.state = 'down'; ped.downTimer = 5;
    ped.group.rotation.x = -Math.PI / 2 + 0.25;
    if (ped.state === 'officer' || G.officers.includes(ped)) {
      G.addWanted(1, 'You took down an officer!');
      G.officers.splice(G.officers.indexOf(ped), 1);
    } else {
      G.addWanted(1, 'You shot a pedestrian!');
    }
  } else {
    ped.state = 'flee'; ped.fleeTimer = 3;
    ped.fleeFrom = { x: fromPos.x, z: fromPos.z };
  }
}

export function punch(G) {
  const p = G.player;
  if (!p.onFoot) return;
  if (G.time - (G.lastPunch || -99) < 0.45) return;
  G.lastPunch = G.time;
  G.audio.punch();
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let best = null, bd = 2.4;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.pos.x - p.pos.x, dz = ped.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / d > 0.3) { bd = d; best = ped; }
  }
  if (!best) return;
  const isOfficer = G.officers.includes(best);
  damagePed(G, best, 30, p.pos);
  if (!isOfficer && best.state !== 'down') {
    best.state = 'flee'; best.fleeTimer = 3; best.fleeFrom = { x: p.pos.x, z: p.pos.z };
  }
  if (isOfficer && best.state !== 'down') {
    // the officer hits back
    G.hurtPlayer(6, best.pos);
  } else if (!isOfficer) {
    G.addWanted(1, 'Assault — someone called the police!');
  }
}
