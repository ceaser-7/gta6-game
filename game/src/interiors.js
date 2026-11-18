// Interiors: two real rooms you enter with E — El Faro taco bar and Sunray Garage.
// Rooms are built far from the city (the city is a solid box field); a glowing
// doorway + sign on the street marks each one.
const PV_Interiors = (() => {
  function buildRoom(cx, cz, w, d, wallCol, floorCol) {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.9 });
    const floorMat = new THREE.MeshStandardMaterial({ color: floorCol, roughness: 0.7 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.05, cz); floor.receiveShadow = true;
    g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x2a241e, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, 4, cz); g.add(ceil);
    // walls (north/south/east/west), door gap on the south wall handled by caller via doorX
    const mkWall = (ww, hh, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.4), wallMat);
      m.position.set(x, hh / 2, z); m.rotation.y = ry; m.castShadow = true; g.add(m);
      return m;
    };
    mkWall(w, 4, cx, cz - d / 2, 0);
    mkWall(w / 2 - 1.2, 4, cx - w / 4 - 0.6, cz + d / 2, 0);
    mkWall(w / 2 - 1.2, 4, cx + w / 4 + 0.6, cz + d / 2, 0);
    mkWall(0.4, 4, cx - w / 2, cz, 0);
    mkWall(0.4, 4, cx + w / 2, cz, 0);
    // warm point light (one per room only)
    const light = new THREE.PointLight(0xffc27a, 40, 22, 1.6);
    light.position.set(cx, 3.2, cz); g.add(light);
    G.scene.add(g);
    return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, cx, cz };
  }
  function signTex(text, fg, bg) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
    g.fillStyle = fg; g.font = 'bold 30px Verdana'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function build() {
    // ---- El Faro taco bar: door at (-54,120) on the street, room at (600,600)
    const faro = buildRoom(600, 600, 16, 12, 0x8a5a3a, 0x6a4a30);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.7 });
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0x8a2e2e, roughness: 0.6 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 1.4), counterMat);
    counter.position.set(600, 0.55, 597); counter.castShadow = true; G.scene.add(counter);
    for (let s = 0; s < 4; s++) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 10), stoolMat);
      stool.position.set(597 + s * 2, 0.45, 599); G.scene.add(stool);
    }
    for (const [tx, tz] of [[596, 603], [604, 603]]) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 12), counterMat);
      table.position.set(tx, 0.9, tz); G.scene.add(table);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), counterMat);
      leg.position.set(tx, 0.45, tz); G.scene.add(leg);
    }
    // menu board
    const menu = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.2),
      new THREE.MeshStandardMaterial({ map: signTex('TACOS $10 · COFFEE $5 · SODA $4', '#ffe27a', '#2e2018'), emissive: 0xffffff, emissiveIntensity: 0.3 }));
    menu.position.set(600, 2.6, 594.2); G.scene.add(menu);
    // fridge + plant
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xb8c4c8, roughness: 0.4, metalness: 0.5 }));
    fridge.position.set(606.5, 1.3, 594.8); G.scene.add(fridge);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 1 }));
    plant.position.set(593.5, 0.8, 594.8); G.scene.add(plant);
    const tomas = PV_Traffic.makePed(596.5, 596.2, { name: 'Tomas', kind: 'named', state: 'stand', h: 1.02 });
    tomas.interior = 'faro';
    // ---- Sunray Garage: door at (162,-108), room at (600,-600)
    const garage = buildRoom(600, -600, 18, 14, 0x5a5a60, 0x3a3d42);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 1.6), new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.8 }));
    bench.position.set(595, 0.5, -606); bench.castShadow = true; G.scene.add(bench);
    // project car on a lift
    const proj = PV_Vehicles.makeCar('sports', 602, -600, Math.PI / 2, 0xd8d8d8);
    proj.mesh.position.y = 1.2; proj.driver = 'parked';
    const lift = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.6, metalness: 0.6 }));
    lift.position.set(602, 0.9, -600); G.scene.add(lift);
    // tire stacks + toolbox + shelf
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
    for (const [tx, tz] of [[593, -594], [607, -594]]) {
      for (let t = 0; t < 3; t++) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 12), tireMat);
        tire.position.set(tx, 0.2 + t * 0.42, tz); G.scene.add(tire);
      }
    }
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.5, metalness: 0.4 }));
    toolbox.position.set(595, 1.4, -606); G.scene.add(toolbox);
    const lena = PV_Traffic.makePed(597, -603, { name: 'Lena', kind: 'named', state: 'stand', h: 1.0 });
    lena.interior = 'garage';
    // ---- doors on the street (glowing doorway + sign)
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, emissive: 0xffc95e, emissiveIntensity: 0.5, roughness: 0.8 });
    const mkDoor = (x, z, name, tex) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4, 4.5, 0.6), doorMat);
      frame.position.set(x, 2.25, z); frame.castShadow = true; G.scene.add(frame);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 0.3),
        new THREE.MeshStandardMaterial({ map: signTex(name, '#ffffff', '#8a2e2e'), emissive: 0xffffff, emissiveIntensity: 0.35 }));
      sign.position.set(x, 5, z); G.scene.add(sign);
      G.doors.push({ x, z, name, room: tex, exit: { x: x + (name === 'EL FARO' ? 0 : 0), z: z + 4 } });
    };
    mkDoor(-64, 120, 'EL FARO', 'faro');
    mkDoor(192, -128, 'SUNRAY GARAGE', 'garage');
    G.rooms = [
      { key: 'faro', name: 'El Faro', bounds: faro, door: { x: -64, z: 120 }, vendor: tomas, enter: { x: 600, z: 603 }, buyAt: { x: 603, z: 597 } },
      { key: 'garage', name: 'Sunray Garage', bounds: garage, door: { x: 192, z: -128 }, vendor: lena, enter: { x: 600, z: -597 }, fixAt: { x: 602, z: -600 } },
    ];
    G.rooms[0].buyCooldown = -99;
    G.rooms[1].fixCooldown = -99;
  }
  function nearestDoor(x, z, maxD) {
    let best = null, bd = maxD;
    for (const d of G.doors) {
      const dd = dist2(x, z, d.x, d.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  function enterRoom(room) {
    G.interior = room;
    const p = G.player;
    p.x = room.enter.x; p.z = room.enter.z;
    p.mesh.position.set(p.x, 0, p.z);
    G.camTarget = p.mesh.position.clone();
    PV_HUD.toast('Entered ' + room.name);
  }
  function exitRoom() {
    const room = G.interior;
    if (!room) return;
    const p = G.player;
    p.x = room.door.x; p.z = room.door.z + 4;
    p.mesh.position.set(p.x, 0, p.z);
    G.camTarget = p.mesh.position.clone();
    G.interior = null;
    PV_HUD.toast('Back on the street');
  }
  function roomAction() {
    // Inside a room: E near the vendor talks, near the counter buys/fixes.
    const room = G.interior, p = G.player;
    if (!room) return false;
    const v = room.vendor;
    if (dist2(p.x, p.z, v.x, v.z) < 3.5) {
      PV_Dialogue.talkTo(v);
      return true;
    }
    if (room.key === 'faro' && dist2(p.x, p.z, room.buyAt.x, room.buyAt.z) < 2.5) {
      if (G.money < 10) { PV_HUD.toast('Not enough cash for a taco.'); return true; }
      G.money -= 10; G.health = Math.min(100, G.health + 25);
      PV_HUD.toast('Taco -$10 · health +25');
      PV_HUD.update();
      return true;
    }
    if (room.key === 'garage' && dist2(p.x, p.z, room.fixAt.x, room.fixAt.z) < 3) {
      if (G.time - room.fixCooldown < 60) { PV_HUD.toast('The project car is already fixed. Come back later.'); return true; }
      room.fixCooldown = G.time;
      G.money += 100;
      PV_Story.play('projectCar');
      PV_HUD.toast('Project car fixed · +$100');
      PV_HUD.update();
      return true;
    }
    return false;
  }
  function update(dt) {
    // interior peds stand still; keep their meshes in the room
    for (const room of G.rooms) {
      const v = room.vendor;
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
    }
  }
  return { build, nearestDoor, enterRoom, exitRoom, roomAction, update };
})();
