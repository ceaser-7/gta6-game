// Porto Verde — interiors: two real rooms you walk into. El Faro taco bar
// (Tomas, taco $10/+25 health) and Sunray Garage (Lena, project car +$100).
// Doors sit on road centrelines so they are never blocked. All original.
import * as THREE from 'three';
import { G, dist2, clamp } from './util.js';
import { talkTo } from './dialogue.js';
import { playStory } from './story.js';
import { queueDialog, showDialog } from './hud.js';

function makeVendor(name, shirt, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.0, 8),
    new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 0.75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.5; g.add(head);
  return { mesh: g, name, talkAt: -99, x: 0, z: 0, interior: null };
}

function buildRoom(cx, cz, w, d, wallColor, floorColor) {
  const S = G.scene;
  const room = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color: floorColor }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.05, cz); room.add(floor);
  const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
  const mkWall = (x, z, ww, dd) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 3, dd), wallMat);
    wall.position.set(x, 1.5, z); room.add(wall);
  };
  mkWall(cx, cz - d / 2, w, 0.4);
  mkWall(cx, cz + d / 2, w, 0.4);
  mkWall(cx - w / 2, cz, 0.4, d);
  mkWall(cx + w / 2, cz, 0.4, d);
  const light = new THREE.PointLight(0xffd9a0, 12, 20);
  light.position.set(cx, 2.6, cz); room.add(light);
  S.add(room);
  return { cx, cz, w, d, bounds: { x0: cx - w / 2 + 0.5, z0: cz - d / 2 + 0.5, x1: cx + w / 2 - 0.5, z1: cz + d / 2 - 0.5 } };
}

export function buildInteriors() {
  // El Faro taco bar, room at (600,600), door on the road at (-64,120).
  const el = buildRoom(600, 600, 14, 10, 0x8a6b4a, 0x6b4a3a);
  el.name = 'El Faro';
  el.door = { x: -64, z: 120 };
  el.exitDir = { x: 0, z: 1 };
  // Counter along the west wall, Tomas behind it at the west end.
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a3428 }));
  counter.position.set(594.2, 0.55, 600); G.scene.add(counter);
  const tomas = makeVendor('Tomas', 0xd8d0c0, 0xb98a5e);
  tomas.mesh.position.set(593.4, 0, 598); tomas.x = 593.4; tomas.z = 598; tomas.interior = 'elfaro';
  G.scene.add(tomas.mesh);
  el.vendor = tomas;
  el.buySpot = { x: 596.2, z: 600 };
  // Tables + stools + menu board + plant + fridge.
  const tableMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  for (const [tx, tz] of [[600, 597], [604, 603], [600, 603]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 12), tableMat);
    t.position.set(tx, 0.9, tz); G.scene.add(t);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), tableMat);
    leg.position.set(tx, 0.45, tz); G.scene.add(leg);
    for (let i = 0; i < 3; i++) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8),
        new THREE.MeshLambertMaterial({ color: 0x7a2e2e }));
      const a = (i / 3) * Math.PI * 2;
      stool.position.set(tx + Math.cos(a) * 1.6, 0.25, tz + Math.sin(a) * 1.6); G.scene.add(stool);
    }
  }
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(5, 2),
    new THREE.MeshLambertMaterial({ color: 0x2e2a24, emissive: 0x332a1a, emissiveIntensity: 0.5 }));
  menu.position.set(600, 2.2, 595.2); G.scene.add(menu);
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1),
    new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
  fridge.position.set(606, 1.1, 596); G.scene.add(fridge);
  G.rooms.push(el);

  // Sunray Garage, room at (600,-600), door on the road at (192,-128).
  const sg = buildRoom(600, -600, 14, 10, 0x4a5560, 0x3a3f46);
  sg.name = 'Sunray Garage';
  sg.door = { x: 192, z: -128 };
  sg.exitDir = { x: 0, z: -1 };
  const bench = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
  bench.position.set(596, 0.5, -604.5); G.scene.add(bench);
  const lift = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 5),
    new THREE.MeshLambertMaterial({ color: 0x2e3236 }));
  lift.position.set(603, 0.2, -600); G.scene.add(lift);
  const project = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 1.9),
    new THREE.MeshLambertMaterial({ color: 0xc22e2e }));
  project.position.set(603, 0.9, -600); project.castShadow = true; G.scene.add(project);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.7),
    new THREE.MeshLambertMaterial({ color: 0x22282e }));
  cab.position.set(603, 1.5, -600); G.scene.add(cab);
  for (let i = 0; i < 4; i++) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.18, 8, 12),
      new THREE.MeshLambertMaterial({ color: 0x1c1e22 }));
    tire.position.set(594.5, 0.4 + i * 0.35, -596.5); tire.rotation.x = Math.PI / 2; G.scene.add(tire);
  }
  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xa83226 }));
  toolbox.position.set(596, 1.3, -604.5); G.scene.add(toolbox);
  const lena = makeVendor('Lena', 0x2e4a6b, 0xd9a986);
  lena.mesh.position.set(597.5, 0, -603.5); lena.x = 597.5; lena.z = -603.5; lena.interior = 'sunray';
  G.scene.add(lena.mesh);
  sg.vendor = lena;
  sg.fixSpot = { x: 603, z: -600 };
  G.rooms.push(sg);

  // Street doors: glowing doorway + name sign, on road centrelines.
  for (const room of G.rooms) {
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xffd98a, emissive: 0xffb347, emissiveIntensity: 0.8 });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), doorMat);
    door.position.set(room.door.x, 2, room.door.z);
    door.rotation.y = room.name === 'El Faro' ? 0 : Math.PI;
    G.scene.add(door);
    G.doors.push({ x: room.door.x, z: room.door.z, room });
  }
  G.fixCooldown = -99;
}

export function doorInteract() {
  if (G.interior || !G.player) return null;
  const px = G.player.position.x, pz = G.player.position.z;
  for (const d of G.doors) {
    if (dist2(px, pz, d.x, d.z) < 5) {
      return { x: d.x, z: d.z, label: `Enter ${d.room.name}`, action: () => enterInterior(d.room) };
    }
  }
  return null;
}

export function enterInterior(room) {
  G.interior = room;
  const px = room.cx, pz = room.cz;
  G.player.position.set(px, 0, pz);
  G.player.rotation.y = Math.PI;
  G.yaw = Math.PI;
  G.snapCam = true;
  showDialog(room.name, room.name === 'El Faro' ? 'Warm air, tacos, and Tomas behind the counter.' : 'Oil, metal, and the project car on the lift.');
  queueDialog('Hint', 'Press E near the counter or the car. Press E at the door to leave.');
}

export function exitInterior() {
  const room = G.interior;
  if (!room) return;
  G.interior = null;
  const ex = room.door.x + room.exitDir.x * 3, ez = room.door.z + room.exitDir.z * 3;
  G.player.position.set(ex, 0, ez);
  G.snapCam = true;
}

export function doorPrompt() {
  const d = doorInteract();
  return d ? `E — ${d.label}` : '';
}

export function interiorPrompt() {
  const i = interiorInteract();
  return i ? `E — ${i.label}` : '';
}

export function interiorInteract() {
  if (!G.interior || !G.player) return null;
  const room = G.interior;
  const px = G.player.position.x, pz = G.player.position.z;
  const v = room.vendor;
  if (v && dist2(px, pz, v.x, v.z) < 3) {
    return { x: v.x, z: v.z, label: `Talk to ${v.name}`, action: () => talkTo(v) };
  }
  if (room.name === 'El Faro' && dist2(px, pz, room.buySpot.x, room.buySpot.z) < 3) {
    return {
      x: room.buySpot.x, z: room.buySpot.z, label: 'Buy a taco — $10',
      action: () => {
        if (G.money < 10) { showDialog('Tomas', 'You are short. Come back with ten.'); return; }
        G.money -= 10;
        G.health = Math.min(100, G.health + 25);
        showDialog('Tomas', 'One taco. Eat well, Mara.');
      },
    };
  }
  if (room.name === 'Sunray Garage' && dist2(px, pz, room.fixSpot.x, room.fixSpot.z) < 3.5) {
    return {
      x: room.fixSpot.x, z: room.fixSpot.z, label: 'Fix the project car — +$100',
      action: () => {
        if (G.fixCooldown > 0) { showDialog('Lena', 'The lift is busy. Give it a minute.'); return; }
        G.fixCooldown = 60;
        G.money += 100;
        showDialog('Lena', 'Project car runs again. A hundred for your trouble.');
        playStory('projectCar');
      },
    };
  }
  // Exit: the door is at the room's south edge (El Faro) / north edge (Sunray).
  const exitX = room.cx, exitZ = room.name === 'El Faro' ? room.bounds.z1 - 0.6 : room.bounds.z0 + 0.6;
  if (dist2(px, pz, exitX, exitZ) < 3) {
    return { x: exitX, z: exitZ, label: `Leave ${room.name}`, action: () => exitInterior() };
  }
  return null;
}

export function updateInteriors(dt) {
  if (G.fixCooldown > 0) G.fixCooldown -= dt;
}
