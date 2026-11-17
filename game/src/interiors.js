// Interiors: places Mara can walk into. Two enterable rooms, built far from
// the city (the city is a solid box field — you cannot hollow a building):
// El Faro, a taco bar in Old Town, and Sunray Garage in Downtown. Each has a
// glowing doorway on the street, a vendor who talks, and something useful to
// do — buy a taco (+25 health, $10) or fix Lena's project car (+$100).
// Room layouts are from GPT-6.1 Sol (v5 call S5e, 2026-11-17), used verbatim;
// the room builder, enter/exit and the shop logic are built here.
import * as THREE from 'three';
import { spawnPed } from './traffic.js';
import { makeCarMesh } from './vehicles.js';
import { talkTo } from './dialogue.js';

const ROOMS = [
  {
    name: 'El Faro',
    door: { x: -54, z: 120 },
    size: { w: 14, d: 10 },
    furniture: [
      { kind: 'counter', x: 0, z: -3.5, ry: 0, colour: 0x6e4a2f },
      { kind: 'stool', x: -3, z: -2.2, ry: 0, colour: 0x8a2f2f },
      { kind: 'stool', x: 0, z: -2.2, ry: 0, colour: 0x8a2f2f },
      { kind: 'stool', x: 3, z: -2.2, ry: 0, colour: 0x8a2f2f },
      { kind: 'table', x: -4, z: 1, ry: 0, colour: 0x6e4a2f },
      { kind: 'table', x: 4, z: 1, ry: 0, colour: 0x6e4a2f },
      { kind: 'menu', x: 0, z: -4.6, ry: 0, colour: 0x1c222b },
      { kind: 'plant', x: -6, z: -4, ry: 0, colour: 0x3f8a4a },
      { kind: 'fridge', x: 6, z: -3.5, ry: 0, colour: 0xb8b8b8 }
    ]
  },
  {
    name: 'Sunray Garage',
    door: { x: 162, z: -108 },
    size: { w: 16, d: 12 },
    furniture: [
      { kind: 'workbench', x: -6, z: -4.5, ry: 0, colour: 0x5a4a3a },
      { kind: 'lift', x: 0, z: 0, ry: 0, colour: 0x2e4a6e },
      { kind: 'projectcar', x: 0, z: 0, ry: 0, colour: 0xe86a10 },
      { kind: 'tires', x: 6.5, z: -4.5, ry: 0, colour: 0x1a1a1a },
      { kind: 'tires', x: 6.5, z: 4.5, ry: 0, colour: 0x1a1a1a },
      { kind: 'toolbox', x: -6, z: 4.5, ry: 0, colour: 0xc23b2e },
      { kind: 'shelf', x: 6.5, z: 0, ry: 0, colour: 0x6e4a2f }
    ]
  }
];

// Remote room centres (far outside the city, off the ground plane) and the
// direction each street door faces (ry of the sign, and the exit yaw).
const ROOM_WORLD = [
  { cx: 600, cz: 600, faceRy: -Math.PI / 2 },   // El Faro: door faces west
  { cx: 600, cz: -600, faceRy: Math.PI },       // Sunray Garage: door faces south
];

function makeSignTexture(text, sub) {
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

function makeMenuTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#1c222b'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#ffd23e'; g.font = 'bold 28px Arial'; g.textAlign = 'center';
  g.fillText('EL FARO', 128, 36);
  g.fillStyle = '#ffffff'; g.font = '20px Arial'; g.textAlign = 'left';
  g.fillText('Tacos ......... $10', 24, 80);
  g.fillText('Coffee ........ $5', 24, 112);
  g.fillText('Soda .......... $4', 24, 144);
  g.fillStyle = '#9fd4e8'; g.font = '16px Arial'; g.textAlign = 'center';
  g.fillText('OPEN ALL DAY', 128, 176);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFurniture(kind, x, z, ry, colour) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, px = 0, py = 0, pz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m;
  };
  if (kind === 'counter') {
    box(4, 1.1, 1, colour, 0, 0.55, 0);
    box(4.2, 0.08, 1.2, 0x8a6a4a, 0, 1.14, 0);
  } else if (kind === 'stool') {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12), mat(colour));
    seat.position.y = 0.65; g.add(seat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.65, 8), mat(0x2c3138));
    pole.position.y = 0.32; g.add(pole);
  } else if (kind === 'table') {
    box(1.6, 0.08, 1.6, colour, 0, 0.75, 0);
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) box(0.08, 0.75, 0.08, 0x3a3f46, lx, 0.37, lz);
  } else if (kind === 'menu') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2),
      new THREE.MeshLambertMaterial({ map: makeMenuTexture(), emissive: 0xffffff, emissiveMap: makeMenuTexture(), emissiveIntensity: 0.35 }));
    m.position.set(0, 1.8, 0.05); g.add(m);
  } else if (kind === 'plant') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 10), mat(0x8a5a2e));
    pot.position.y = 0.25; g.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat(colour));
    bush.position.y = 0.85; bush.scale.y = 0.8; g.add(bush);
  } else if (kind === 'fridge') {
    box(1.2, 2, 1, colour, 0, 1, 0);
    box(0.08, 0.5, 0.06, 0x2c3138, -0.4, 1.1, 0.52);
  } else if (kind === 'workbench') {
    box(3, 0.12, 1, colour, 0, 0.95, 0);
    for (const [lx, lz] of [[-1.4, -0.4], [1.4, -0.4], [-1.4, 0.4], [1.4, 0.4]]) box(0.1, 0.95, 0.1, 0x3a3f46, lx, 0.47, lz);
    box(0.5, 0.2, 0.3, 0xc23b2e, -0.8, 1.1, 0);
    box(0.4, 0.15, 0.25, 0x2e6db8, 0.6, 1.08, 0.1);
  } else if (kind === 'lift') {
    for (const sx of [-1.4, 1.4]) box(0.3, 2.2, 0.3, colour, sx, 1.1, 0);
    box(3.2, 0.15, 1.5, colour, 0, 1.2, 0);
  } else if (kind === 'projectcar') {
    const car = makeCarMesh(colour, false, 'sports');
    car.position.y = 1.35; // on the lift platform
    g.add(car);
  } else if (kind === 'tires') {
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12), mat(colour));
      t.position.y = 0.13 + i * 0.26; g.add(t);
    }
  } else if (kind === 'toolbox') {
    box(0.8, 0.4, 0.4, colour, 0, 0.2, 0);
    box(0.3, 0.08, 0.05, 0x2c3138, 0, 0.44, 0);
  } else if (kind === 'shelf') {
    box(2, 0.08, 0.8, colour, 0, 1.2, 0);
    box(0.5, 0.4, 0.5, 0x2e6db8, -0.5, 1.45, 0);
    box(0.4, 0.3, 0.4, 0xc23b2e, 0.4, 1.4, 0);
    for (const sx of [-0.9, 0.9]) box(0.08, 1.2, 0.7, colour, sx, 0.6, 0);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

function buildRoom(G, roomDef, world) {
  const { cx, cz } = world;
  const { w, d } = roomDef.size;
  const g = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x9a8a76 });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2f });
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x4a4238 });
  // v5: 5 m ceiling, not 3.2 — the chase camera sits ~3-4.7 m up, and a low
  // ceiling would clip it out of the room whenever Mara looks up
  const t = 0.4, h = 5;
  // floor + ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), floorMat);
  floor.position.y = -0.1; floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), ceilMat);
  ceil.position.y = h + 0.1; g.add(ceil);
  // walls: north, east, west full; south split by the 2-unit door gap at centre
  const wall = (bw, bd, px, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), wallMat);
    m.position.set(px, h / 2, pz); m.castShadow = true; g.add(m); return m;
  };
  wall(w, t, 0, -d / 2);
  wall(t, d, w / 2, 0);
  wall(t, d, -w / 2, 0);
  wall((w - 2) / 2, t, -(w + 2) / 4, d / 2);
  wall((w - 2) / 2, t, (w + 2) / 4, d / 2);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2, h - 2.2, t), wallMat);
  lintel.position.set(0, 2.2 + (h - 2.2) / 2, d / 2); g.add(lintel);
  // warm interior light + two lamp globes
  const light = new THREE.PointLight(0xffd9a0, 50, 24, 1);
  light.position.set(0, 2.6, 0); g.add(light);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const lx of [-w / 4, w / 4]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
    lamp.position.set(lx, 2.9, 0); g.add(lamp);
  }
  // furniture (local coords, room centre = 0,0)
  for (const f of roomDef.furniture) g.add(buildFurniture(f.kind, f.x, f.z, f.ry, f.colour));
  // EXIT sign inside, above the door gap
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshLambertMaterial({ map: makeSignTexture('EXIT', null), emissive: 0xffffff, emissiveMap: makeSignTexture('EXIT', null), emissiveIntensity: 0.4 }));
  exitSign.position.set(0, 2.5, d / 2 - 0.25); exitSign.rotation.y = Math.PI; g.add(exitSign);
  g.position.set(cx, 0, cz);
  G.scene.add(g);
  // collision: wall segments as boxes + a bounds rect (world coords)
  const colliders = [
    { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2 - t, maxZ: cz - d / 2 + t },
    { minX: cx + w / 2 - t, maxX: cx + w / 2 + t, minZ: cz - d / 2, maxZ: cz + d / 2 },
    { minX: cx - w / 2 - t, maxX: cx - w / 2 + t, minZ: cz - d / 2, maxZ: cz + d / 2 },
    { minX: cx - w / 2, maxX: cx - 1, minZ: cz + d / 2 - t, maxZ: cz + d / 2 + t },
    { minX: cx + 1, maxX: cx + w / 2, minZ: cz + d / 2 - t, maxZ: cz + d / 2 + t },
  ];
  const city = {
    colliders,
    bounds: { minX: cx - w / 2 + 0.5, maxX: cx + w / 2 - 0.5, minZ: cz - d / 2 + 0.5, maxZ: cz + d / 2 - 0.5 },
  };
  return { group: g, city };
}

export function createInteriors(G) {
  G.interior = null;
  G.projectCarAt = -99;
  G.doorGlowMats = [];
  G.rooms = ROOMS.map((def, i) => {
    const world = ROOM_WORLD[i];
    const built = buildRoom(G, def, world);
    // glowing doorway + name sign on the street, facing the road
    const marker = new THREE.Group();
    const glowMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xffb52e, emissiveIntensity: 0.9 });
    G.doorGlowMats.push(glowMat);
    for (const sx of [-1.2, 1.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), glowMat);
      post.position.set(sx, 1.3, 0); marker.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.25, 0.25), glowMat);
    lintel.position.set(0, 2.6, 0); marker.add(lintel);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshLambertMaterial({ map: makeSignTexture(def.name.toUpperCase(), def.name === 'El Faro' ? 'TACOS — OPEN' : 'REPAIRS — OPEN'), emissive: 0xffffff, emissiveMap: makeSignTexture(def.name.toUpperCase(), def.name === 'El Faro' ? 'TACOS — OPEN' : 'REPAIRS — OPEN'), emissiveIntensity: 0.35 }));
    sign.position.set(0, 3.6, 0); marker.add(sign);
    marker.position.set(def.door.x, 0, def.door.z);
    marker.rotation.y = world.faceRy;
    G.scene.add(marker);
    return { def, world, ...built, marker };
  });
  // the vendors live inside their rooms (they never walk the streets).
  // Tomas stands at the WEST end of the counter so the counter's east end
  // is a clear buy spot (the vendor talk radius and the buy zone must not
  // overlap, or E would always talk instead of selling).
  const tomas = spawnPed(G, 597, 600 - 2.5, null, { name: 'Tomas', namedKey: 'tomas', kind: 'named', stand: true, interior: G.rooms[0] });
  tomas.yaw = 0; tomas.group.rotation.y = 0; // faces the counter (south)
  const lena = spawnPed(G, 600 - 4, -600 - 3, null, { name: 'Lena', namedKey: 'lena', kind: 'named', stand: true, interior: G.rooms[1] });
  lena.yaw = Math.PI / 2; lena.group.rotation.y = Math.PI / 2;
  G.rooms[0].vendor = tomas;
  G.rooms[1].vendor = lena;
}

export function enterInterior(G, room) {
  const { cx, cz } = room.world;
  const { d } = room.def.size;
  G.interior = { room, city: room.city };
  const p = G.player;
  p.pos.set(cx, 0, cz + d / 2 - 1.5);
  p.yaw = Math.PI; // facing north, into the room
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.yaw;
  G.camYaw = Math.PI;
  G.audio.door();
  G.hud.toast(`Welcome to ${room.def.name}`);
}

function exitInterior(G) {
  const room = G.interior.room;
  const { x, z } = room.def.door;
  const faceRy = room.world.faceRy;
  G.interior = null;
  const p = G.player;
  // step out of the door in the direction it faces (the sign's normal),
  // facing the same way, so the player lands on the street, not in a wall
  p.pos.set(x + Math.sin(faceRy) * 2, 0, z + Math.cos(faceRy) * 2);
  p.yaw = faceRy;
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.yaw;
  G.camYaw = p.yaw;
  G.audio.door();
  G.hud.toast('Back on the street');
}

// Outside, on foot, near a street door?
export function nearestDoor(G) {
  if (!G.player.onFoot || G.interior) return null;
  for (const room of G.rooms) {
    const d = Math.hypot(G.player.pos.x - room.def.door.x, G.player.pos.z - room.def.door.z);
    if (d < 2.5) return room;
  }
  return null;
}

export function tryEnterInterior(G) {
  const room = nearestDoor(G);
  if (!room) return false;
  enterInterior(G, room);
  return true;
}

function buyTaco(G) {
  if (G.player.health >= 100) { G.hud.toast("You're already full — save your money."); return true; }
  if (G.money < 10) { G.hud.toast("Tacos are $10 — you don't have enough."); return true; }
  G.money -= 10;
  G.player.health = Math.min(100, G.player.health + 25);
  G.audio.pickup();
  G.hud.toast('Taco! +25 health (-$10)');
  G.saveGame();
  return true;
}

function projectCarJob(G) {
  if (G.time - (G.projectCarAt || -99) < 60) {
    G.hud.toast("Come back later — the next job isn't ready yet.");
    return true;
  }
  G.projectCarAt = G.time;
  G.hud.showDialog('Lena', "That project car has been sitting for months. Get it running and I'll pay you $100.", () => {
    G.money += 100;
    G.hud.toast('Project car fixed — +$100');
    G.saveGame();
  });
  return true;
}

// Inside: E does the room's actions. Returns true when handled.
export function tryInteriorInteract(G) {
  if (!G.interior || !G.player.onFoot) return false;
  const room = G.interior.room;
  const { cx, cz } = room.world;
  const { w, d } = room.def.size;
  const p = G.player;
  const lx = p.pos.x - cx, lz = p.pos.z - cz;
  // 1. the exit: the door gap on the south wall
  if (Math.abs(lx) < 1.2 && lz > d / 2 - 2) { exitInterior(G); return true; }
  // 2. the vendor: talk
  const v = room.vendor;
  if (v && v.state !== 'down' && Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z) < 2.5) {
    return talkTo(G, v);
  }
  // 3. the room's job: the counter (El Faro) or the project car (Garage)
  if (room.def.name === 'El Faro') {
    if (Math.abs(lx) < 2.6 && Math.abs(lz + 3.5) < 1.6) return buyTaco(G);
  } else if (Math.hypot(lx, lz) < 2.8) {
    return projectCarJob(G);
  }
  return false;
}

// Nearest interactable inside, for the on-screen prompt.
export function interiorPrompt(G) {
  if (!G.interior || !G.player.onFoot) return '';
  const room = G.interior.room;
  const { cx, cz } = room.world;
  const { d } = room.def.size;
  const p = G.player;
  const lx = p.pos.x - cx, lz = p.pos.z - cz;
  if (Math.abs(lx) < 1.2 && lz > d / 2 - 2) return 'E — Leave';
  const v = room.vendor;
  if (v && v.state !== 'down' && Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z) < 2.5) return `E — Talk to ${v.name}`;
  if (room.def.name === 'El Faro') {
    if (Math.abs(lx) < 2.6 && Math.abs(lz + 3.5) < 1.6) return 'E — Buy a taco ($10, +25 health)';
  } else if (Math.hypot(lx, lz) < 2.8) {
    return 'E — Fix the project car ($100)';
  }
  return '';
}

export function updateInteriors(G, dt) {
  if (G.state !== 'playing') return;
  // door glow breathes so the entrances read from down the street
  const pulse = 0.7 + Math.sin(G.time * 2) * 0.3;
  for (const m of G.doorGlowMats) m.emissiveIntensity = pulse;
}
