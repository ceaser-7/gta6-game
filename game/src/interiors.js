// Porto Verde — interiors: El Faro taco bar and Sunray Garage. Rooms sit far from
// the city (the city is a solid box field); doors sit ON road centrelines.
import * as THREE from '../vendor/three.module.min.js';
import { G, clamp, dist } from './state.js';
import { spawnCar } from './cars.js';
import { playStory } from './story.js';

export const INTERIORS = [
  { id: 'elfaro', name: 'El Faro', door: { x: -64, z: 120 }, room: { x: 600, z: 600 }, vendor: 'Tomas', vendorPos: { x: -6, z: -3 } },
  { id: 'sunray', name: 'Sunray Garage', door: { x: 192, z: -128 }, room: { x: 600, z: -600 }, vendor: 'Lena', vendorPos: { x: -6, z: 3 } },
];

function buildRoom(def) {
  const { x: rx, z: rz } = def.room;
  const W = 16, D = 12, H = 5;
  const group = new THREE.Group();
  const floorMat = new THREE.MeshLambertMaterial({ color: def.id === 'elfaro' ? 0x8a6a4a : 0x4a4a4a });
  const wallMat = new THREE.MeshLambertMaterial({ color: def.id === 'elfaro' ? 0xc9a06a : 0x6a6a6a });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(rx, 0.05, rz); group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: 0x3a3230 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(rx, H, rz); group.add(ceil);
  const mkWall = (w, h, d, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(px, py, pz); group.add(m);
  };
  mkWall(W, H, 0.6, rx, H / 2, rz - D / 2); // north
  mkWall(W, H, 0.6, rx, H / 2, rz + D / 2); // south (door wall)
  mkWall(0.6, H, D, rx - W / 2, H / 2, rz); // west
  mkWall(0.6, H, D, rx + W / 2, H / 2, rz); // east
  const light = new THREE.PointLight(def.id === 'elfaro' ? 0xffc880 : 0xcfe8ff, 60, 22);
  light.position.set(rx, H - 0.8, rz); group.add(light);
  G.scene.add(group);
  return { x0: rx - W / 2, z0: rz - D / 2, x1: rx + W / 2, z1: rz + D / 2 };
}

export function buildInteriors() {
  for (const def of INTERIORS) {
    const bounds = buildRoom(def);
    const room = { ...def, bounds, fixCooldown: -99 };
    G.rooms.push(room);
    // glowing doorway + name sign on the street
    const door = new THREE.Mesh(new THREE.BoxGeometry(3, 4.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    door.position.set(def.door.x, 2.2, def.door.z); G.scene.add(door);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 0.4), new THREE.MeshBasicMaterial({ color: def.id === 'elfaro' ? 0xff8a3a : 0x4db8ff }));
    sign.position.set(def.door.x, 5.2, def.door.z); G.scene.add(sign);
    if (def.id === 'elfaro') {
      const { x: rx, z: rz } = def.room;
      // counter, stools, tables, menu board, plant, fridge
      const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 2), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
      counter.position.set(rx, 0.7, rz - 3); G.scene.add(counter);
      const menu = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), new THREE.MeshBasicMaterial({ color: 0x2a2018 }));
      menu.position.set(rx, 3.2, rz - 5.6); G.scene.add(menu);
      for (let s = 0; s < 3; s++) {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0x8a2f2f }));
        stool.position.set(rx - 3 + s * 3, 0.4, rz - 1); G.scene.add(stool);
      }
      for (const [tx, tz] of [[-5, 3], [5, 3]]) {
        const table = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.15, 10), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
        table.position.set(rx + tx, 0.9, rz + tz); G.scene.add(table);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        leg.position.set(rx + tx, 0.45, rz + tz); G.scene.add(leg);
      }
      const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 1.2), new THREE.MeshLambertMaterial({ color: 0xb8c8d8 }));
      fridge.position.set(rx + 7, 1.5, rz - 4.5); G.scene.add(fridge);
      // Tomas behind the counter's west end
      room.vendorPed = { name: 'Tomas', namedKey: 'tomas', kind: 'named', talkAt: -99, target: null, x: rx + def.vendorPos.x, z: rz + def.vendorPos.z, mesh: null };
      room.buySpot = { x: rx + 3, z: rz - 1.5 };
    } else {
      const { x: rx, z: rz } = def.room;
      // workbench, lift, project car, tire stacks, toolbox, shelf
      const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 2), new THREE.MeshLambertMaterial({ color: 0x5a4a3a }));
      bench.position.set(rx - 4, 0.55, rz - 4); G.scene.add(bench);
      const lift = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x8a2f2f }));
      lift.position.set(rx + 2, 0.2, rz + 1); G.scene.add(lift);
      const proj = spawnCar('sports', rx + 2, rz + 1, Math.PI / 2, { parked: true, mission: true, color: 0x6a2f6a });
      proj.mesh.position.y = 0.6;
      room.projectCar = proj;
      for (let t = 0; t < 3; t++) {
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.25, 8, 16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        tire.rotation.x = Math.PI / 2; tire.position.set(rx - 7, 0.3 + t * 0.5, rz + 4); G.scene.add(tire);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 4), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
      shelf.position.set(rx + 7.4, 1.5, rz - 2); G.scene.add(shelf);
      room.vendorPed = { name: 'Lena', namedKey: 'lena', kind: 'named', talkAt: -99, target: null, x: rx + def.vendorPos.x, z: rz + def.vendorPos.z, mesh: null };
      room.fixSpot = { x: rx + 2, z: rz + 1 };
    }
    // vendor ped mesh inside the room
    const vm = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), new THREE.MeshLambertMaterial({ color: def.id === 'elfaro' ? 0xc9a23a : 0x3a6a8a }));
    body.position.y = 1.05; vm.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8a880 }));
    head.position.y = 1.85; vm.add(head);
    vm.position.set(room.vendorPed.x, 0, room.vendorPed.z);
    G.scene.add(vm);
    room.vendorPed.mesh = vm;
    room.vendorPed.interior = true;
    G.peds.push(room.vendorPed);
  }
}

export function nearestDoor(x, z) {
  for (const r of G.rooms) {
    if (dist(x, z, r.door.x, r.door.z) < 5) return r;
  }
  return null;
}

export function enterInterior(room) {
  const p = G.player;
  G.interior = room;
  // step 3 m deep into the room from the south wall
  p.x = room.room.x; p.z = room.bounds.z1 - 3;
  p.yaw = Math.PI; // face into the room
  p.onFoot = true; p.car = null;
  if (G.playerMesh) G.playerMesh.visible = true;
  G.ui.toast && G.ui.toast(`${room.name} — E to leave`);
  if (G.snapCamera) G.snapCamera();
}

export function exitInterior() {
  const room = G.interior;
  if (!room) return;
  const p = G.player;
  G.interior = null;
  // step out onto the street, south of the door
  p.x = room.door.x; p.z = room.door.z + 3;
  p.yaw = 0;
  if (G.snapCamera) G.snapCamera();
  G.ui.toast && G.ui.toast('Back on the street');
}

// Room action: buy a taco / fix the project car / talk to the vendor.
export function roomAction() {
  const room = G.interior;
  if (!room) return false;
  const p = G.player;
  // near the vendor? talk.
  if (dist(p.x, p.z, room.vendorPed.x, room.vendorPed.z) < 3) {
    G.ui.dialog && G.ui.dialog(room.vendorPed.name, room.id === 'elfaro'
      ? 'Tacos, coffee, soda. The menu is on the wall, the prices are honest.'
      : 'I can fix anything with four wheels and a bad attitude.');
    return true;
  }
  if (room.id === 'elfaro' && room.buySpot && dist(p.x, p.z, room.buySpot.x, room.buySpot.z) < 3) {
    if (p.money < 10) { G.ui.toast && G.ui.toast('Not enough cash for a taco ($10)'); return true; }
    if (p.health >= 100) { G.ui.toast && G.ui.toast('Already at full health'); return true; }
    p.money -= 10; p.health = clamp(p.health + 25, 0, 100);
    G.ui.card && G.ui.card('TACO +25 HEALTH', '-$10');
    playStory('taco');
    G.save && G.save();
    G.ui.updateHud && G.ui.updateHud();
    return true;
  }
  if (room.id === 'sunray' && room.fixSpot && dist(p.x, p.z, room.fixSpot.x, room.fixSpot.z) < 4) {
    if (G.time - room.fixCooldown < 60) { G.ui.toast && G.ui.toast('The project car was just fixed — come back later'); return true; }
    room.fixCooldown = G.time;
    p.money += 100;
    G.ui.card && G.ui.card('PROJECT CAR FIXED', '+$100');
    playStory('garage');
    G.save && G.save();
    G.ui.updateHud && G.ui.updateHud();
    return true;
  }
  return false;
}
