// Porto Verde — interiors: two real rooms you walk into (El Faro taco bar and
// Sunray Garage), built far from the city so the city stays a solid box field.
// Doors on the street glow; E enters, E exits. Camera stays inside the room.
import * as THREE from 'three';
import { G, rand, dist2 } from './state.js';
import { makePed } from './peds.js';
import { queueDialog, showToast } from './hud.js';
import { talkTo } from './dialogue.js';

const ROOM_W = 14, ROOM_D = 10;

function roomShell(group, floorColor, wallColor) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshLambertMaterial({ color: floorColor }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; group.add(floor);
  const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
  const mkWall = (w, h, x, z, ry) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), wallMat);
    wall.position.set(x, h / 2, z); wall.rotation.y = ry; group.add(wall);
  };
  mkWall(ROOM_W, 4, 0, -ROOM_D / 2, 0);
  mkWall(ROOM_W, 4, 0, ROOM_D / 2, 0);
  mkWall(ROOM_D, 4, -ROOM_W / 2, 0, Math.PI / 2);
  mkWall(ROOM_D, 4, ROOM_W / 2, 0, Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshLambertMaterial({ color: 0x8a7f72 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 4; group.add(ceil);
}

function menuBoard(group, lines) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#20242a'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#e8e0cc'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
  lines.forEach((ln, i) => g.fillText(ln, 128, 34 + i * 30));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.8),
    new THREE.MeshLambertMaterial({ map: tex }));
  board.position.set(0, 2.6, -ROOM_D / 2 + 0.25); group.add(board);
}

export function buildInteriors() {
  // --- El Faro taco bar, room at (600,600), door on the street at (-54,120) ---
  const faro = new THREE.Group(); faro.position.set(600, 0, 600);
  roomShell(faro, 0x9a7a52, 0xc9a06a);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
  counter.position.set(-1.5, 0.55, -3.6); faro.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x3a2e22 }));
  counterTop.position.set(-1.5, 1.15, -3.6); faro.add(counterTop);
  for (let i = 0; i < 4; i++) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 10),
      new THREE.MeshLambertMaterial({ color: 0x8a2e2e }));
    stool.position.set(-4.5 + i * 2, 0.35, -1.8); faro.add(stool);
  }
  menuBoard(faro, ['EL FARO', 'Tacos $10', 'Coffee $5', 'Soda $4']);
  // tables
  for (const [tx, tz] of [[3, 0], [-3, 2], [3, 3]]) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0x4a3a2e }));
    table.position.set(tx, 0.85, tz); faro.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8),
      new THREE.MeshLambertMaterial({ color: 0x2e2e2e }));
    leg.position.set(tx, 0.42, tz); faro.add(leg);
  }
  // fridge + plant
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1),
    new THREE.MeshLambertMaterial({ color: 0xb8bcc0 }));
  fridge.position.set(6, 1.2, -4); faro.add(fridge);
  const plant = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 8),
    new THREE.MeshLambertMaterial({ color: 0x3f7a3a }));
  plant.position.set(-6, 0.9, -4); faro.add(plant);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
  pot.position.set(-6, 0.25, -4); faro.add(pot);
  const warm = new THREE.PointLight(0xffc070, 1.4, 18, 1.4);
  warm.position.set(0, 3.2, 0); faro.add(warm);
  // Tomas at the counter's west end; the buy spot is the east end
  const tomas = makePed('Tomas', { kind: 'vendor', shirt: 0xe8e0cc, speed: 0 });
  tomas.position.set(600 - 4.5, 0, 600 - 3.2);
  tomas.userData.state = 'stand';
  G.scene.add(tomas); G.peds.push(tomas);
  const elFaro = {
    name: 'El Faro', kind: 'taco', cx: 600, cz: 600,
    bounds: { x0: 600 - ROOM_W / 2 + 0.5, z0: 600 - ROOM_D / 2 + 0.5, x1: 600 + ROOM_W / 2 - 0.5, z1: 600 + ROOM_D / 2 - 0.5 },
    door: { x: -54, z: 120, face: 1 }, vendor: tomas, group: faro,
    buySpot: { x: 600 + 1.5, z: 600 - 2.6 },
  };
  G.scene.add(faro); G.rooms.push(elFaro);

  // --- Sunray Garage, room at (600,-600), door on the street at (162,-108) ---
  const sun = new THREE.Group(); sun.position.set(600, 0, -600);
  roomShell(sun, 0x5a5a5e, 0x7a7568);
  // lift + project car
  const lift = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
  lift.position.set(0, 0.25, 0); sun.add(lift);
  const project = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.9),
    new THREE.MeshPhongMaterial({ color: 0x7a2e2e, shininess: 80 }));
  pBody.position.y = 0.8; project.add(pBody);
  const pCab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.7),
    new THREE.MeshPhongMaterial({ color: 0x1a2733, shininess: 120 }));
  pCab.position.set(-0.2, 1.4, 0); project.add(pCab);
  for (const [wx, wz] of [[1.4, 0.85], [1.4, -0.85], [-1.4, 0.85], [-1.4, -0.85]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12),
      new THREE.MeshLambertMaterial({ color: 0x141414 }));
    w.rotation.x = Math.PI / 2; w.position.set(wx, 0.36, wz); project.add(w);
  }
  project.position.set(0, 0.5, 0); sun.add(project);
  // workbench + toolbox + tire stacks + shelf
  const bench = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
  bench.position.set(-3, 0.45, -4); sun.add(bench);
  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xcc2222 }));
  toolbox.position.set(-3, 1.15, -4); sun.add(toolbox);
  for (let i = 0; i < 4; i++) {
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.2, 8, 14),
      new THREE.MeshLambertMaterial({ color: 0x141414 }));
    tyre.rotation.x = Math.PI / 2; tyre.position.set(5.5, 0.2 + i * 0.42, -3.5); sun.add(tyre);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1),
    new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
  shelf.position.set(4, 2, 4.2); sun.add(shelf);
  const cool = new THREE.PointLight(0xbfd4ff, 1.2, 18, 1.4);
  cool.position.set(0, 3.2, 0); sun.add(cool);
  const lena = makePed('Lena', { kind: 'vendor', shirt: 0x4a90a4, speed: 0 });
  lena.position.set(597, 0, -603.2); // near the workbench (room local -3, -3.2)
  lena.userData.state = 'stand';
  G.scene.add(lena); G.peds.push(lena);
  const sunray = {
    name: 'Sunray Garage', kind: 'garage', cx: 600, cz: -600,
    bounds: { x0: 600 - ROOM_W / 2 + 0.5, z0: -600 - ROOM_D / 2 + 0.5, x1: 600 + ROOM_W / 2 - 0.5, z1: -600 + ROOM_D / 2 - 0.5 },
    door: { x: 162, z: -108, face: 1 }, vendor: lena, group: sun,
    project, fixAt: -99,
  };
  G.scene.add(sun); G.rooms.push(sunray);

  // street doors: glowing doorway + name sign
  for (const room of G.rooms) {
    const door = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.4, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2e3236, emissive: 0xffc070, emissiveIntensity: 0.35 }));
    frame.position.y = 2.2; door.add(frame);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.8),
      new THREE.MeshBasicMaterial({ color: 0xffd98a }));
    glow.position.set(0, 2, 0.25); door.add(glow);
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#11131a'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffd24a'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(room.name.toUpperCase(), 128, 33);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1),
      new THREE.MeshLambertMaterial({ map: tex }));
    sign.position.set(0, 5, 0.25); door.add(sign);
    door.position.set(room.door.x, 0, room.door.z);
    G.scene.add(door);
    room.doorMesh = door;
  }
}

export function enterInterior(room) {
  G.interior = room;
  const p = G.player;
  // step 3m inside, facing the room
  p.pos.set(room.cx, 0, room.cz + (room.cz > 0 ? -3 : 3));
  p.yaw = room.cz > 0 ? Math.PI : 0;
  if (G.camTarget) G.camTarget.copy(p.pos);
  p.car = null;
  queueDialog(room.kind === 'taco' ? 'Tomas' : 'Lena',
    room.kind === 'taco'
      ? "Welcome to El Faro. Tacos are ten, coffee five, soda four. The menu is on the wall."
      : "Sunray Garage. I fix what the city breaks. That project car on the lift is mine, unless you want to help.");
}

export function exitInterior() {
  const room = G.interior;
  if (!room) return;
  G.interior = null;
  const p = G.player;
  p.pos.set(room.door.x, 0, room.door.z + room.door.face * 2);
  p.yaw = room.door.face > 0 ? 0 : Math.PI;
  if (G.camTarget) G.camTarget.copy(p.pos);
}

// The current interior interaction for the E key: {label, action} or null.
export function interiorInteract() {
  const room = G.interior;
  if (!room) return null;
  const p = G.player;
  const v = room.vendor;
  const dv = dist2(p.pos.x, p.pos.z, v.position.x, v.position.z);
  if (dv < 2.6) return { label: `E — Talk to ${v.userData.name}`, action: () => talkTo(v) };
  if (room.kind === 'taco') {
    const db = dist2(p.pos.x, p.pos.z, room.buySpot.x, room.buySpot.z);
    if (db < 2.2) {
      return {
        label: 'E — Buy a taco ($10, +25 health)',
        action: () => {
          if (G.money < 10) { showToast('Not enough money for a taco.'); return; }
          if (G.health >= 100) { showToast('You are already full.'); return; }
          G.money -= 10; G.health = Math.min(100, G.health + 25);
          showToast('Taco eaten. +25 health.');
          if (window.PV && window.PV.sfx) window.PV.sfx('coin');
        },
      };
    }
  }
  if (room.kind === 'garage') {
    const dp = dist2(p.pos.x, p.pos.z, room.cx, room.cz);
    if (dp < 3.5) {
      return {
        label: 'E — Fix the project car (+$100)',
        action: () => {
          if (G.time - room.fixAt < 60) { showToast('The project car is already fixed. Come back later.'); return; }
          room.fixAt = G.time;
          G.money += 100;
          showToast('Project car fixed. +$100.');
          queueDialog('Lena', "She purrs now. That old project car has another ten years in her. Thanks, Mara.");
          if (window.PV && window.PV.sfx) window.PV.sfx('coin');
        },
      };
    }
  }
  return { label: 'E — Exit', action: () => exitInterior() };
}

// Nearest street door to the player (for the E prompt outside).
export function nearestDoor(x, z, maxD) {
  let best = null, bd = maxD;
  for (const room of G.rooms) {
    const d = dist2(x, z, room.door.x, room.door.z);
    if (d < bd) { bd = d; best = room; }
  }
  return best;
}
