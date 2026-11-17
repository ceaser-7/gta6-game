// Traffic and pedestrians: the city alive around the player.
// One clear job: drive the background cars along the streets and walk the
// pedestrians along the sidewalks, and react when the player hits one.
import * as THREE from 'three';
import { createCar, stepCar, carForward } from './vehicles.js';
import { randomRoadPoint, randomSidewalkPoint, collideCircle, HALF, PITCH } from './city.js';
import { mulberry32 } from './city.js';

const SHIRTS = [0xb8b8b8, 0x3a6db0, 0xa84a28, 0x4a8a52, 0xb08d2e, 0x7a4a8a, 0x222831, 0xb86a7e, 0x2e7a7a, 0xa89e8c];

// v5: every pedestrian has a name, so Mara can talk to them. Named faces
// (Rosa, Dario, Nico, Tomas, Lena) are spawned with an explicit name.
const PED_NAMES = ['Ana', 'Ben', 'Carla', 'Elena', 'Felix', 'Gloria', 'Hugo', 'Ines', 'Jorge', 'Kira', 'Luis', 'Marta', 'Olga', 'Pablo', 'Sara', 'Uma', 'Vera', 'Will', 'Ximena', 'Yusuf', 'Zara', 'Noor', 'Omar', 'Petra', 'Ruth', 'Sam', 'Tara', 'Vic', 'Wren', 'Yara'];

function makePedMesh(shirt) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), mat(0x2c3242));
  legL.position.set(-0.12, 0.25, 0); legL.geometry.translate(0, -0.25, 0);
  const legR = legL.clone(); legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.58, 0.3), mat(shirt));
  torso.position.y = 0.8;
  // v4: round heads, like Mara — box heads read as toys
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat(0xc98d64));
  head.scale.y = 1.1;
  head.position.y = 1.28;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1c1410));
  hair.position.y = 1.3;
  g.add(legL, legR, torso, head, hair);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  g.add(shadow);
  g.userData = { legL, legR };
  return g;
}

export function spawnPed(G, x, z, fleeFrom, opts = {}) {
  const rng = G.rng;
  const group = makePedMesh(SHIRTS[Math.floor(rng() * SHIRTS.length)]);
  group.position.set(x, 0, z);
  group.scale.setScalar(0.92 + rng() * 0.16); // varied heights
  G.scene.add(group);
  const ped = {
    group, pos: group.position, yaw: rng() * Math.PI * 2,
    speed: 1.4 + rng() * 1.1, state: opts.stand ? 'stand' : 'walk', target: null,
    walkPhase: rng() * 6, downTimer: 0, fleeTimer: 0, fleeFrom: null,
    // v5: identity + routine, so peds can talk, work shifts and live indoors
    name: opts.name || PED_NAMES[Math.floor(rng() * PED_NAMES.length)],
    kind: opts.kind || (opts.stand ? 'stander' : 'walker'),
    namedKey: opts.namedKey || null,
    talkAt: 0,
    interior: opts.interior || null,
    routine: opts.routine || null,
    eventPed: false,
  };
  if (fleeFrom) { ped.state = 'flee'; ped.fleeTimer = 3; ped.fleeFrom = fleeFrom; }
  G.peds.push(ped);
  return ped;
}

export function spawnFleeingPed(G, x, z) {
  return spawnPed(G, x, z, { x, z });
}

function pickPedTarget(G, ped) {
  const p = randomSidewalkPoint(G.rng);
  ped.target = { x: p.x, z: p.z };
}

export function spawnTrafficCar(G) {
  const rng = G.rng;
  const rp = randomRoadPoint(rng);
  const types = ['sedan', 'sedan', 'sedan', 'suv', 'van', 'taxi', 'sports'];
  const type = types[Math.floor(rng() * types.length)];
  const car = createCar(G, rp.x, rp.z, rp.angle, 0, { isTraffic: true, driver: 'traffic', type, maxSpeed: 8 + rng() * 4, accel: 8 });
  // colour it properly (createCar takes a colour; re-colour the paint — mutate
  // the shared body material so the cabin, hood, deck and roof match the body;
  // v4 bug: replacing children[0].material left the cabin black)
  car.group.children[0].material.color.set([0x9e3b2e, 0x33567a, 0xb08d2e, 0xb0b0b0, 0x3f444a, 0x3f6b46][Math.floor(rng() * 6)]);
  car.cruise = car.maxSpeed;
  car.wp = nextWaypoint(G, car);
  return car;
}

function nextWaypoint(G, car) {
  // nearest intersection, then a neighbouring one
  const ix = Math.round(car.pos.x / PITCH) * PITCH;
  const iz = Math.round(car.pos.z / PITCH) * PITCH;
  const opts = [];
  if (ix + PITCH <= HALF) opts.push([ix + PITCH, iz]);
  if (ix - PITCH >= -HALF) opts.push([ix - PITCH, iz]);
  if (iz + PITCH <= HALF) opts.push([ix, iz + PITCH]);
  if (iz - PITCH >= -HALF) opts.push([ix, iz - PITCH]);
  const [wx, wz] = opts[Math.floor(G.rng() * opts.length)];
  // drive on the right-hand side of the road: offset perpendicular to travel
  const dx = wx - car.pos.x, dz = wz - car.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const rx = dz / len, rz = -dx / len;
  return { x: wx + rx * 3.2, z: wz + rz * 3.2 };
}

export function createTraffic(G) {
  G.peds = []; G.traffic = [];
  // v4: busier streets (v3: 18 cars / 28 peds over a 900-unit map felt empty),
  // with a share spawned near the player start so the opening streets are alive.
  for (let i = 0; i < 24; i++) G.traffic.push(spawnTrafficCar(G));
  for (let i = 0; i < 36; i++) {
    const p = randomSidewalkPoint(G.rng);
    spawnPed(G, p.x, p.z);
  }
  for (let i = 0; i < 8; i++) { // extra traffic near the start (-54, 30)
    const rp = nearPlayerRoadPoint(G.rng, -54, 30, 160);
    const car = createCar(G, rp.x, rp.z, rp.angle, 0, { isTraffic: true, driver: 'traffic', type: 'sedan', maxSpeed: 8 + G.rng() * 4, accel: 8 });
    car.group.children[0].material.color.set([0x9e3b2e, 0x33567a, 0xb08d2e, 0xb0b0b0, 0x3f444a, 0x3f6b46][Math.floor(G.rng() * 6)]);
    car.cruise = car.maxSpeed;
    car.wp = nextWaypoint(G, car);
    G.traffic.push(car);
  }
  for (let i = 0; i < 10; i++) { // extra peds near the start
    const p = nearPlayerSidewalkPoint(G.rng, -54, 30, 160);
    spawnPed(G, p.x, p.z);
  }
  // parked cars the player can steal, spread across the bigger city
  const parkedSpots = [
    [-40, -100, 0.4], [120, 30, 1.2], [-120, 90, -0.6], [60, -160, 2.4],
    [-160, -30, 0.9], [160, 140, -1.4], [-20, 160, 0.2], [100, -90, 1.8],
    [-270, 200, 0.7], [270, -200, -0.9], [-320, -200, 1.5], [320, 200, -0.3],
    [30, -320, 2.0], [-30, 320, -1.1], [220, 60, 0.5], [-220, -60, -1.8],
  ];
  G.parked = [];
  const parkedTypes = ['sedan', 'suv', 'sports', 'van', 'taxi'];
  for (let si = 0; si < parkedSpots.length; si++) {
    const [x, z, a] = parkedSpots[si];
    const car = createCar(G, x, z, a, 0, { type: parkedTypes[si % parkedTypes.length], maxSpeed: 30, accel: 16 });
    car.group.children[0].material.color.set([0x9e3b2e, 0x33567a, 0xb08d2e, 0xb0b0b0, 0x3f6b46, 0x5f4a6e][G.parked.length % 6]);
    G.parked.push(car);
  }
  // pedestrians standing in chatting pairs on corners (they idle, no target)
  const standSpots = [
    [-44, 20], [118, 40], [-110, 100], [70, -150], [-150, -20], [170, 150], [-10, 170], [110, -80],
  ];
  for (const [sx, sz] of standSpots) {
    const a = spawnPed(G, sx, sz, null, { stand: true });
    const b = spawnPed(G, sx + 1.1, sz + 0.4, null, { stand: true });
    a.yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    b.yaw = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    a.group.rotation.y = a.yaw; b.group.rotation.y = b.yaw;
  }
  // the player's starting car, parked on the road just ahead of the spawn
  const start = createCar(G, -54, 38, 0, 0, { maxSpeed: 32, accel: 18 });
  start.group.children[0].material.color.set(0x1f6f6b);
  G.playerStartCar = start;
}

// A road / sidewalk point near (x, z): rejection-sample the uniform helpers.
function nearPlayerRoadPoint(rng, x, z, radius) {
  for (let i = 0; i < 24; i++) {
    const p = randomRoadPoint(rng);
    if (Math.hypot(p.x - x, p.z - z) < radius) return p;
  }
  return randomRoadPoint(rng);
}

function nearPlayerSidewalkPoint(rng, x, z, radius) {
  for (let i = 0; i < 24; i++) {
    const p = randomSidewalkPoint(rng);
    if (Math.hypot(p.x - x, p.z - z) < radius) return p;
  }
  return randomSidewalkPoint(rng);
}

export function updateTraffic(G, dt) {
  const rng = G.rng;
  // --- traffic cars ---
  for (const car of [...G.traffic]) {
    if (car.driver !== 'traffic') continue;
    const dx = car.wp.x - car.pos.x, dz = car.wp.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { car.wp = nextWaypoint(G, car); continue; }
    const want = Math.atan2(dx, dz);
    let d = want - car.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    car.angle += Math.max(-1.9 * dt, Math.min(1.9 * dt, d));
    // slow for a sharp turn or a car ahead
    let target = car.cruise;
    if (Math.abs(d) > 0.6) target *= 0.45;
    for (const o of G.cars) {
      if (o === car) continue;
      const ox = o.pos.x - car.pos.x, oz = o.pos.z - car.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 9) {
        const f = carForward(car);
        if ((ox * f.x + oz * f.z) / od > 0.85 && o.speed < car.speed) target = Math.min(target, o.speed + 1);
      }
    }
    car.speed += Math.max(-14 * dt, Math.min(10 * dt, target - car.speed));
    stepCar(G, car, dt, false);
    // keep the action near the player: respawn far cars close by.
    // v5: not while the player is inside — the player is 600 units away,
    // so every car would reshuffle every frame while she is indoors.
    const pd = Math.hypot(car.pos.x - G.player.pos.x, car.pos.z - G.player.pos.z);
    if (!G.interior && pd > 300) {
      const rp = randomRoadPoint(rng);
      car.pos.set(rp.x, 0, rp.z); car.angle = rp.angle; car.speed = 0;
      car.wp = nextWaypoint(G, car);
    }
  }
  // --- pedestrians ---
  for (const ped of [...G.peds]) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      ped.group.rotation.x = Math.max(0, ped.group.rotation.x - dt * 2);
      if (ped.downTimer <= 0) {
        G.scene.remove(ped.group);
        G.peds.splice(G.peds.indexOf(ped), 1);
        const p = randomSidewalkPoint(rng);
        spawnPed(G, p.x, p.z);
      }
      continue;
    }
    let speed = ped.speed;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      speed = 5.2;
      const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      ped.pos.x += (dx / len) * speed * dt;
      ped.pos.z += (dz / len) * speed * dt;
      ped.yaw = Math.atan2(dx / len, dz / len);
      if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.target = null; }
    } else if (ped.state === 'stand') {
      // chatting on the corner: stays put, idle sway (legs handled below)
      ped.walkPhase += dt * 1.2;
    } else {
      if (!ped.target) pickPedTarget(G, ped);
      const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) { ped.target = null; continue; }
      ped.pos.x += (dx / dist) * speed * dt;
      ped.pos.z += (dz / dist) * speed * dt;
      ped.yaw = Math.atan2(dx / dist, dz / dist);
    }
    // v5: interior NPCs (Tomas, Lena) live in rooms 600 units away — the city
    // collider would clamp them back to the map, and street scares do not
    // reach them through the walls. They stand, sway, and nothing else.
    if (!ped.interior) collideCircle(G.city, ped.pos, 0.5);
    ped.walkPhase += dt * speed * 3;
    const swing = ped.state === 'stand' ? 0 : Math.sin(ped.walkPhase) * 0.5;
    ped.group.userData.legL.rotation.x = swing;
    ped.group.userData.legR.rotation.x = -swing;
    ped.group.rotation.y = ped.state === 'stand'
      ? ped.yaw + Math.sin(ped.walkPhase * 0.5) * 0.15 : ped.yaw;
    // a fast car or a gunshot nearby makes them flee
    if (!ped.interior) {
      for (const car of G.cars) {
        if (Math.abs(car.speed) < 5) continue;
        const d = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
        if (d < 7) { ped.state = 'flee'; ped.fleeTimer = 2.5; ped.fleeFrom = { x: car.pos.x, z: car.pos.z }; }
      }
      if (G.lastShotAt && G.time - G.lastShotAt < 0.4) {
        const d = Math.hypot(G.lastShot.x - ped.pos.x, G.lastShot.z - ped.pos.z);
        if (d < 22) { ped.state = 'flee'; ped.fleeTimer = 3; ped.fleeFrom = { x: G.lastShot.x, z: G.lastShot.z }; }
      }
    }
  }
  // --- keep the streets busy: top up stolen traffic cars ---
  const active = G.traffic.filter(c => c.driver === 'traffic').length;
  for (let i = active; i < 24; i++) G.traffic.push(spawnTrafficCar(G));
  // --- cars hitting pedestrians ---
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 3) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
      if (d < 1.6) {
        ped.state = 'down'; ped.downTimer = 4;
        ped.group.rotation.x = -Math.PI / 2 + 0.25;
        if (car.driver === 'player') G.addWanted(2, 'You ran someone over!');
        else if (Math.hypot(car.pos.x - G.player.pos.x, car.pos.z - G.player.pos.z) < 25) {
          G.hud.toast('A pedestrian was hit nearby');
        }
      }
    }
  }
}
