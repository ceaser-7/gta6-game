// Porto Verde — boot, input, camera, game loop, debug API.
(function () {
  const canvas = document.getElementById('c');
  const low = new URLSearchParams(location.search).has('low');
  G.low = low;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  G.renderer = renderer;
  G.canvas = canvas;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
  G.camTarget = new THREE.Vector3(0, 2, 300);

  // ---- build the world
  PV_City.build();
  PV_Vehicles.spawnTraffic(32);
  PV_Traffic.spawnPeds(58);
  PV_Interiors.build();
  PV_Activities.build();
  PV_Player.create(G.spawn.x, G.spawn.z);
  // starter car: teal sedan parked in front at spawn
  const starter = PV_Vehicles.makeCar('sedan', 0, 292, 0, 0x2e8a8a);
  starter.driver = 'parked';
  G.cars.push(starter);
  G.starterCar = starter;

  addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---- input
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') { e.preventDefault(); }
    G.keys[e.code] = true;
    if (e.code === 'Enter' && G.dialog) {
      PV_Dialogue.closeDialog();
      PV_HUD.nextDialog();
      return;
    }
    if (!G.started) return;
    if (e.code === 'KeyE') onInteract();
    if (e.code === 'KeyF') PV_Player.punch();
    if (e.code === 'KeyR') { G.ammo = G.ammoMax; PV_HUD.update(); PV_HUD.toast('Reloaded'); }
    if (e.code === 'KeyH') PV_Audio.honk();
    if (e.code === 'KeyQ') { PV_Audio.cycle(); PV_HUD.update(); }
    if (e.code === 'KeyM') { PV_Audio.setMuted(!G.muted); PV_HUD.update(); }
    if (e.code === 'Tab') {
      const bm = document.getElementById('bigmap');
      const show = bm.style.display !== 'flex';
      bm.style.display = show ? 'flex' : 'none';
      if (show) PV_HUD.drawBigMap();
    }
    if (e.code === 'Digit1') PV_Missions.startMission(0);
    if (e.code === 'Digit2') PV_Missions.startMission(1);
    if (e.code === 'Digit3') PV_Missions.startMission(2);
  });
  addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  canvas.addEventListener('click', () => {
    PV_Audio.unlock();
    if (G.started && !G.dialog) {
      canvas.requestPointerLock?.();
      PV_Player.shoot();
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      G.yaw -= e.movementX * 0.0028;
      G.pitch = clamp(G.pitch - e.movementY * 0.0022, -0.9, 0.6);
    }
  });
  function onInteract() {
    const p = G.player;
    if (!p || G.dialog) return;
    if (!p.onFoot) { PV_Player.exitCar(); return; }
    if (G.interior) {
      if (PV_Interiors.roomAction()) return;
      const room = G.interior;
      if (dist2(p.x, p.z, room.bounds.cx, room.bounds.z1 - 1) < 3) PV_Interiors.exitRoom();
      return;
    }
    const door = PV_Interiors.nearestDoor(p.x, p.z, 5);
    if (door) {
      const room = G.rooms.find((r) => r.key === door.room);
      if (room) PV_Interiors.enterRoom(room);
      return;
    }
    const ped = PV_Traffic.nearestPed(p.x, p.z, 3.5);
    if (ped) { PV_Dialogue.talkTo(ped); return; }
    const car = PV_Vehicles.nearestCar(p.x, p.z, 4.5);
    if (car) PV_Player.enterCar(car);
  }

  // ---- menu / start
  const saved = PV_Save.load();
  const playBtn = document.getElementById('play');
  if (saved) playBtn.textContent = 'CONTINUE';
  playBtn.addEventListener('click', () => startGame(!!saved));
  function startGame(cont) {
    document.getElementById('menu').style.display = 'none';
    G.started = true;
    if (cont) PV_Save.apply(saved);
    PV_Audio.unlock(); PV_Audio.start();
    if (!cont) PV_Story.play('intro');
    PV_HUD.hint('WASD move · E enter car / talk · 1/2/3 start a mission · Tab city map', 15);
    PV_HUD.update();
    PV_Shots.apply();
  }
  // auto-start for staged shots / headless runs
  if (new URLSearchParams(location.search).has('shot') || new URLSearchParams(location.search).has('autostart')) {
    startGame(!!saved);
  }

  // ---- camera
  function updateCamera(dt) {
    const p = G.player;
    const cam = G.camera;
    let dist = 9, height = 3.4;
    if (G.interior) { dist = 3.2; height = 2.0; }
    else if (p && !p.onFoot) { dist = 11; height = 4.2; }
    const cx = Math.sin(G.yaw), cz = Math.cos(G.yaw);
    const look = new THREE.Vector3(p.x, p.onFoot ? 1.6 : 1.4, p.z);
    const want = new THREE.Vector3(
      p.x - cx * dist * Math.cos(G.pitch),
      look.y + height + Math.sin(G.pitch) * dist,
      p.z - cz * dist * Math.cos(G.pitch));
    if (!G.camTarget) G.camTarget = want.clone();
    G.camTarget.lerp(want, Math.min(1, dt * 6));
    if (G.interior) {
      const b = G.interior.bounds;
      G.camTarget.x = clamp(G.camTarget.x, b.x0 + 0.5, b.x1 - 0.5);
      G.camTarget.z = clamp(G.camTarget.z, b.z0 + 0.5, b.z1 - 0.5);
      G.camTarget.y = clamp(G.camTarget.y, 1, 3.6);
    } else {
      G.camTarget.y = Math.max(G.camTarget.y, 1.2);
    }
    cam.position.copy(G.camTarget);
    cam.lookAt(look);
    // speed FOV kick
    const spd = p && p.car ? Math.abs(p.car.speed) : 0;
    const targetFov = 62 + clamp(spd / 46, 0, 1) * 10;
    if (Math.abs(cam.fov - targetFov) > 0.2) { cam.fov = lerp(cam.fov, targetFov, dt * 3); cam.updateProjectionMatrix(); }
  }

  // ---- interact prompt (nearest thing, refreshed each frame)
  function updateInteractPrompt() {
    const p = G.player;
    if (!p || !p.onFoot || G.dialog || !G.started) { PV_HUD.interact(null); return; }
    if (G.interior) {
      const room = G.interior;
      if (dist2(p.x, p.z, room.vendor.x, room.vendor.z) < 3.5) { PV_HUD.interact('E — Talk to ' + room.vendor.name); return; }
      if (room.key === 'faro' && dist2(p.x, p.z, room.buyAt.x, room.buyAt.z) < 2.5) { PV_HUD.interact('E — Buy a taco ($10)'); return; }
      if (room.key === 'garage' && dist2(p.x, p.z, room.fixAt.x, room.fixAt.z) < 3) { PV_HUD.interact('E — Fix the project car (+$100)'); return; }
      if (dist2(p.x, p.z, room.bounds.cx, room.bounds.z1 - 1) < 3) { PV_HUD.interact('E — Exit ' + room.name); return; }
      PV_HUD.interact(null); return;
    }
    const door = PV_Interiors.nearestDoor(p.x, p.z, 5);
    if (door) { PV_HUD.interact('E — Enter ' + door.name); return; }
    const ped = PV_Traffic.nearestPed(p.x, p.z, 3.5);
    if (ped) { PV_HUD.interact('E — Talk to ' + ped.name); return; }
    const car = PV_Vehicles.nearestCar(p.x, p.z, 4.5);
    if (car) { PV_HUD.interact('E — Enter car'); return; }
    PV_HUD.interact(null);
  }

  // ---- main loop
  const clock = new THREE.Clock();
  let saveT = 0, hudT = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (G.started && !G.over) {
      G.time += dt;
      G.dayT = (G.dayT + dt) % 240;
    }
    const night = PV_City.updateDayNight();
    if (G.started && !G.over) {
      PV_Player.update(dt);
      PV_Vehicles.updateTraffic(dt);
      PV_Traffic.updatePeds(dt);
      PV_Police.update(dt);
      PV_Missions.update(dt);
      PV_Activities.update(dt);
      PV_Events.update(dt);
      PV_Interiors.update(dt);
      PV_Dialogue.updateDialogue(dt);
      updateInteractPrompt();
      if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0) document.getElementById('hint').textContent = ''; }
      saveT += dt;
      if (saveT > 15) { saveT = 0; PV_Save.save(); }
    }
    hudT += dt;
    if (hudT > 0.15) {
      hudT = 0;
      if (G.started) { PV_HUD.update(); PV_HUD.compass(); PV_HUD.drawMinimap(document.getElementById('map')); }
    }
    if (!G.started) {
      // menu background: slow orbit over the city
      const a = G.time * 0.05 + 2.2;
      G.camera.position.set(Math.cos(a) * 320, 130, Math.sin(a) * 320);
      G.camera.lookAt(0, 10, 0);
      G.time += dt;
    } else {
      updateCamera(dt);
    }
    renderer.render(G.scene, G.camera);
  }
  loop();

  // ---- debug / test API (drives the game from CDP; part of the build)
  window.PV = {
    G,
    start: startGame,
    startMission: (i) => PV_Missions.startMission(i),
    teleport: (x, z) => {
      const p = G.player;
      if (p.car) PV_Player.exitCar();
      p.x = x; p.z = z; p.mesh.position.set(x, 0, z);
      G.camTarget = p.mesh.position.clone();
    },
    enterCar: (car) => PV_Player.enterCar(car),
    talkTo: (ped) => PV_Dialogue.talkTo(ped),
    setDayT: (t) => { G.dayT = t; },
    saveNow: () => PV_Save.save(),
    state: () => ({
      money: G.money, health: G.health, wanted: G.wanted,
      coins: G.coinGot.length, raceBest: G.raceBest,
      missionsDone: G.missionsDone.slice(),
      mission: G.mission ? { idx: G.mission.idx, phase: G.mission.phase, timer: G.mission.timer, tailTime: G.mission.tailTime } : null,
      interior: G.interior ? G.interior.key : null,
      dialog: G.dialog,
      player: G.player ? { x: G.player.x, z: G.player.z, onFoot: G.player.onFoot } : null,
      peds: G.peds.length, cars: G.cars.length,
      event: G.event ? G.event.kind : null,
      day: PV_City.isDay(),
    }),
  };
})();
