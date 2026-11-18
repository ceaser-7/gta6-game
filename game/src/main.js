// Porto Verde — main: bootstrap, game loop, player (on foot + driving),
// camera, input, wanted/police, combat, bust/wasted, menu, test hooks.
// All original. The recorded rebuild of the v5 feature set.
import * as THREE from 'three';
import { G, CFG, ROADS, rand, clamp, lerp, angLerp, dist2, fmtMoney } from './state.js';
import { buildCity, collideCircle, losBlocked } from './city.js';
import { makeCar, spawnTraffic, updateTraffic, spawnPoliceCar, updatePolice, nearestCar } from './vehicles.js';
import { spawnPeds, updatePeds, scarePeds, nearestPed, makePed } from './peds.js';
import { talkTo, updateDialogue } from './dialogue.js';
import { startMission, updateMissions, playStory, MISSION_NAMES, MISSION_PAY } from './missions.js';
import { buildActivities, updateActivities } from './activities.js';
import { buildInteriors, enterInterior, exitInterior, interiorInteract, nearestDoor } from './interiors.js';
import { updateEvents } from './events.js';
import { initDayNight, updateDayNight } from './daynight.js';
import { initAudio, setStation, toggleMute, setEngine, sfx } from './audio.js';
import { saveGame, loadGame, applySave } from './save.js';
import { initHUD, updateHUD, showDialog, closeDialog, queueDialog, showToast, showCard, showWasted, hideWasted, showMenu, hideMenu, setInteract, setHint, setMission } from './hud.js';
import { applyShot } from './shots.js';

const SPAWN = { x: 0, z: 60 };
let renderer, muzzleLight, muzzleTimer = 0, skidGroup, skidMats = [];
let policeTimer = 0, officerTimer = 0, roadblockTimer = 0, roadblock = null;
let saveTimer = 0;

function buildPlayerMesh() {
  const g = makePed('Mara', { kind: 'player', shirt: 0x8a2e2e, height: 1.74 });
  // ponytail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x2a1a12 }));
  tail.position.set(0, 1.32, -0.24); g.add(tail);
  // jacket: a slightly larger torso overlay
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x5a1f1f }));
  jacket.position.y = 1.0; g.add(jacket);
  return g;
}

function init() {
  const params = new URLSearchParams(location.search);
  G.lowMode = params.has('low'); // headless test mode: cheap rendering so CDP stays responsive
  // headless init progress: written to document.title so --dump-dom can read it
  const prog = (s) => { document.title = 'PV:' + s; };
  window.__pvProg = prog;
  try {
  const canvas = document.getElementById('game');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.lowMode });
  renderer.setPixelRatio(G.lowMode ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(G.lowMode ? 640 : window.innerWidth, G.lowMode ? 360 : window.innerHeight);
  renderer.shadowMap.enabled = !G.lowMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(0xff9a5c);
  G.camera = new THREE.PerspectiveCamera(62, G.lowMode ? 640 / 360 : window.innerWidth / window.innerHeight, 0.1, 1200);
  G.clock = new THREE.Clock();
  G.camTarget = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  G.camPos = new THREE.Vector3(SPAWN.x, 8, SPAWN.z + 14);

  prog('city');
  buildCity();
  prog('daynight');
  initDayNight();
  G.dayT = 115; // open at golden-hour sunset
  prog('traffic');
  spawnTraffic();
  prog('peds');
  spawnPeds();
  prog('activities');
  buildActivities();
  prog('interiors');
  buildInteriors();
  prog('hud');
  initHUD();
  prog('player');

  // the player
  const mesh = buildPlayerMesh();
  mesh.position.set(SPAWN.x, 0, SPAWN.z);
  G.scene.add(mesh);
  G.player = {
    mesh, pos: mesh.position, yaw: Math.PI, pitch: -0.12,
    vel: new THREE.Vector3(), onFoot: true, car: null, ammo: CFG.MAG,
    punchT: 0,
  };
  // starter car: a teal sedan parked at spawn (entering it is not stealing)
  const starter = makeCar('sedan', 0x2e8a8a);
  starter.position.set(SPAWN.x + 4, 0, SPAWN.z + 6);
  starter.userData.starter = true;
  G.scene.add(starter); G.cars.push(starter); G.parked.push(starter);

  muzzleLight = new THREE.PointLight(0xffc070, 0, 18, 1.5);
  G.scene.add(muzzleLight);
  skidGroup = new THREE.Group(); G.scene.add(skidGroup);

  // menu: orbit the city until the player starts
  G.menuMode = true;
  showMenu(!!loadGame());

  // input
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('resize', onResize);
  canvas.addEventListener('click', () => {
    if (G.started && !G.over && !document.pointerLockElement) canvas.requestPointerLock();
    if (G.over) respawn();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      G.player.yaw -= e.movementX * 0.0026;
      G.player.pitch = clamp(G.player.pitch - e.movementY * 0.0022, -0.55, 0.35);
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && G.started && !G.over && !G.dialog && G.player.onFoot) shoot();
  });
  document.getElementById('wasted').addEventListener('click', () => { if (G.over) respawn(); });

  // shot mode: auto-start and stage the scene
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    G.testMode = true;
    startGame(false);
    applyShot(shot);
  }
  // start the loop (unless ?noloop — headless init check only)
  if (!params.has('noloop')) renderer.setAnimationLoop(tick);
  prog('ready');
  } catch (e) { document.title = 'PV:ERROR:' + (e && e.message ? e.message : e); }
}

function onResize() {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
  if (e.code === 'Tab') { e.preventDefault(); toggleMap(); return; }
  G.keys[e.code] = true;
  if (!G.started || G.over) return;
  if (e.code === 'Enter' && G.dialog) { closeDialog(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'KeyQ') { setStation(G.station + 1); return; }
  if (e.code === 'KeyN' && !G.mission) {
    const next = G.missionsDone.findIndex(d => !d);
    if (next >= 0) startMission(next);
    return;
  }
  if (e.code === 'KeyE') { doInteract(); return; }
  if (e.code === 'KeyR' && G.player.onFoot) { G.player.ammo = CFG.MAG; return; }
  if (e.code === 'KeyH' && G.player.car) { sfx('horn'); return; }
  if (e.code === 'KeyF' && G.player.onFoot) { punch(); return; }
}

function toggleMap() {
  const m = document.getElementById('map');
  m.style.display = m.style.display === 'block' ? 'none' : 'block';
}

function doInteract() {
  if (G.dialog) return;
  const p = G.player;
  if (p.car) { exitCar(); return; }
  if (G.interior) {
    const it = interiorInteract();
    if (it) it.action();
    return;
  }
  // street door first, then talk, then car
  const door = nearestDoor(p.pos.x, p.pos.z, 3.5);
  if (door) { enterInterior(door); return; }
  const ped = nearestPed(p.pos.x, p.pos.z, 2.8);
  if (ped && ped.userData.kind !== 'event') { talkTo(ped); return; }
  const car = nearestCar(p.pos.x, p.pos.z, 4.5);
  if (car) enterCar(car);
}

function enterCar(car) {
  const p = G.player;
  p.car = car; p.onFoot = false;
  p.mesh.visible = false;
  p.pos.copy(car.position);
  if (!car.userData.starter && !car.userData.van) {
    G.wanted = Math.min(5, G.wanted + 1); // stealing
    showToast('You stole a car. The police are on their way.');
  }
  car.userData.speed = 0;
  setHint('W/S drive • A/D steer • E exit • H horn • Q radio', 8);
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  p.car = null; p.onFoot = true;
  const h = car.userData.heading;
  p.pos.set(car.position.x + Math.cos(h + Math.PI / 2) * 2.4, 0, car.position.z + Math.sin(h + Math.PI / 2) * 2.4);
  p.yaw = Math.PI / 2 - h; // player yaw is measured from +z; car heading from +x
  p.mesh.visible = true;
  p.mesh.position.copy(p.pos);
}

function punch() {
  const p = G.player;
  p.punchT = 0.35;
  scarePeds(p.pos.x, p.pos.z, 6);
  const ped = nearestPed(p.pos.x, p.pos.z, 2.2);
  if (ped) {
    ped.userData.fleeT = 3;
    G.wanted = Math.min(5, G.wanted + 1);
  }
}

function shoot() {
  const p = G.player;
  if (p.ammo <= 0) { sfx('click'); return; }
  p.ammo--;
  sfx('shot');
  muzzleLight.position.copy(p.pos).y = 1.5;
  muzzleLight.intensity = 6;
  muzzleTimer = 0.06;
  // hitscan: nearest ped/car in front within 60m (forward is (sin yaw, cos yaw))
  const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  let best = null, bd = 60;
  for (const ped of G.peds) {
    const dx = ped.position.x - p.pos.x, dz = ped.position.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 60 || d < 1) continue;
    const dot = (dx * fwd.x + dz * fwd.z) / d;
    if (dot > 0.92 && d < bd) { bd = d; best = { kind: 'ped', obj: ped }; }
  }
  for (const car of G.cars) {
    if (car === p.car) continue;
    const dx = car.position.x - p.pos.x, dz = car.position.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 60 || d < 1) continue;
    const dot = (dx * fwd.x + dz * fwd.z) / d;
    if (dot > 0.9 && d < bd) { bd = d; best = { kind: 'car', obj: car }; }
  }
  if (best) {
    if (best.kind === 'ped') {
      best.obj.userData.fleeT = 0;
      best.obj.rotation.x = -Math.PI / 2; // falls
      best.obj.userData.state = 'stand';
      setTimeout(() => { G.scene.remove(best.obj); const i = G.peds.indexOf(best.obj); if (i >= 0) G.peds.splice(i, 1); }, 8000);
    } else {
      best.obj.userData.health -= 12;
    }
  }
  scarePeds(p.pos.x, p.pos.z, 40);
  // a witness raises the heat
  let witness = false;
  for (const ped of G.peds) if (dist2(p.pos.x, p.pos.z, ped.position.x, ped.position.z) < 40) { witness = true; break; }
  if (!witness) for (const car of G.police) if (dist2(p.pos.x, p.pos.z, car.position.x, car.position.z) < 60) { witness = true; break; }
  if (witness) G.wanted = Math.min(5, G.wanted + 1);
}

function respawn() {
  hideWasted();
  G.over = false; G.busted = false;
  G.health = CFG.HEALTH_MAX;
  G.wanted = 0;
  G.player.pos.set(SPAWN.x, 0, SPAWN.z);
  G.player.yaw = Math.PI;
  G.player.car = null; G.player.onFoot = true;
  G.player.mesh.visible = true;
  G.player.mesh.position.copy(G.player.pos);
  if (G.camTarget) G.camTarget.copy(G.player.pos);
  G.mission = null;
  setMission('');
}

function updatePlayer(dt) {
  const p = G.player;
  const k = G.keys;
  if (p.car) {
    const car = p.car;
    const u = car.userData;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 0.7 : 0);
    const steer = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
    const maxSpeed = u.type === 'sports' ? 38 : u.type === 'van' ? 26 : 32;
    const target = fwd * maxSpeed;
    u.speed = lerp(u.speed, target, Math.min(1, dt * (fwd !== 0 ? 1.1 : 2.2)));
    if (Math.abs(u.speed) > 0.5) {
      u.heading += steer * dt * 1.9 * Math.sign(u.speed) * clamp(1.2 - Math.abs(u.speed) / 40, 0.35, 1);
      // skid marks on hard steering at speed
      if (Math.abs(steer) > 0.5 && Math.abs(u.speed) > 14 && Math.random() < dt * 20) dropSkid(car);
    }
    car.position.x += Math.cos(u.heading) * u.speed * dt;
    car.position.z += Math.sin(u.heading) * u.speed * dt;
    car.rotation.y = -u.heading;
    const before = { x: car.position.x, z: car.position.z };
    collideCircle(car.position, 1.5, CFG.BOUND);
    if (Math.abs(car.position.x - before.x) > 0.01 || Math.abs(car.position.z - before.z) > 0.01) {
      u.speed *= 0.55; // hit something
      u.health -= 1.5;
    }
    // brake lights
    for (const tl of u.tails || []) tl.material.emissiveIntensity = (k.KeyS || k.ArrowDown) ? 2.2 : 0.5;
    // wheels
    for (const w of u.wheels) w.rotation.z += u.speed * dt * 2.4;
    // smoke when wrecked
    if (u.health < 40) {
      const sp = car.userData.smoke || makeSmoke(car);
      sp.material.opacity = clamp((40 - u.health) / 40, 0.15, 0.8);
      if (u.health <= 0) u.speed = lerp(u.speed, 0, Math.min(1, dt * 2));
    }
    p.pos.copy(car.position);
    setEngine(u.speed, true);
    // running over a ped raises the heat
    for (const ped of G.peds) {
      if (dist2(car.position.x, car.position.z, ped.position.x, ped.position.z) < 1.6 && Math.abs(u.speed) > 3) {
        ped.rotation.x = -Math.PI / 2; ped.userData.state = 'stand';
        G.wanted = Math.min(5, G.wanted + 1);
        setTimeout(() => { G.scene.remove(ped); const i = G.peds.indexOf(ped); if (i >= 0) G.peds.splice(i, 1); }, 8000);
      }
    }
  } else {
    // on foot
    const run = k.ShiftLeft || k.ShiftRight;
    const speed = run ? 7 : 4;
    let mx = 0, mz = 0;
    const fwdX = Math.sin(p.yaw), fwdZ = Math.cos(p.yaw);
    const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
    if (k.KeyW || k.ArrowUp) { mx += fwdX; mz += fwdZ; }
    if (k.KeyS || k.ArrowDown) { mx -= fwdX; mz -= fwdZ; }
    if (k.KeyD || k.ArrowRight) { mx += rightX; mz += rightZ; }
    if (k.KeyA || k.ArrowLeft) { mx -= rightX; mz -= rightZ; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx /= ml; mz /= ml;
      p.vel.x = lerp(p.vel.x, mx * speed, Math.min(1, dt * 10));
      p.vel.z = lerp(p.vel.z, mz * speed, Math.min(1, dt * 10));
    } else {
      p.vel.x = lerp(p.vel.x, 0, Math.min(1, dt * 10));
      p.vel.z = lerp(p.vel.z, 0, Math.min(1, dt * 10));
    }
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    collideCircle(p.pos, 0.6, G.interior ? G.interior.bounds : CFG.BOUND);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    // walk swing
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const u = p.mesh.userData;
    const s = Math.sin(G.time * 9) * clamp(sp / 4, 0, 1) * 0.55;
    u.legL.rotation.x = s; u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7;
    if (p.punchT > 0) {
      p.punchT -= dt;
      u.armR.rotation.x = -1.6 + Math.sin(p.punchT * 20) * 0.4;
    }
    setEngine(0, false);
  }
  // muzzle flash decay
  if (muzzleTimer > 0) { muzzleTimer -= dt; if (muzzleTimer <= 0) muzzleLight.intensity = 0; }
}

function makeSmoke(car) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(120,120,120,0.85)'); grad.addColorStop(1, 'rgba(120,120,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.2, 2.2, 1); sp.position.set(-0.5, 1.6, 0);
  car.add(sp); car.userData.smoke = sp; return sp;
}

function dropSkid(car) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.4),
    new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -car.userData.heading;
  const h = car.userData.heading;
  m.position.set(car.position.x - Math.cos(h) * 1.5, 0.13, car.position.z - Math.sin(h) * 1.5);
  skidGroup.add(m);
  skidMats.push({ mesh: m, life: 14 });
  if (skidMats.length > 60) {
    const old = skidMats.shift();
    skidGroup.remove(old.mesh);
  }
}

function updateCamera(dt) {
  const p = G.player;
  if (G.menuMode) {
    const t = G.time * 0.05;
    G.camera.position.set(Math.cos(t) * 260, 130, Math.sin(t) * 260);
    G.camera.lookAt(0, 10, 0);
    return;
  }
  const target = p.car ? p.car.position : p.pos;
  G.camTarget.lerp(new THREE.Vector3(target.x, 0, target.z), Math.min(1, dt * 6));
  // view yaw: on foot it is the player's yaw; driving, the car's heading (converted)
  const viewYaw = p.car ? (Math.PI / 2 - p.car.userData.heading) : p.yaw;
  const dist = G.interior ? 3.4 : (p.car ? 10.5 : 6.5);
  const height = G.interior ? 2.1 : (p.car ? 4.2 : 2.6);
  const backX = -Math.sin(viewYaw) * dist * Math.cos(p.pitch);
  const backZ = -Math.cos(viewYaw) * dist * Math.cos(p.pitch);
  const want = new THREE.Vector3(
    G.camTarget.x + backX,
    height - p.pitch * 6,
    G.camTarget.z + backZ);
  if (G.interior) {
    // clamp the camera inside the room
    const b = G.interior.bounds;
    want.x = clamp(want.x, b.x0 + 0.6, b.x1 - 0.6);
    want.z = clamp(want.z, b.z0 + 0.6, b.z1 - 0.6);
    want.y = clamp(want.y, 1.2, 3.6);
  }
  G.camPos.lerp(want, Math.min(1, dt * 8));
  G.camera.position.copy(G.camPos);
  const look = new THREE.Vector3(G.camTarget.x, 1.6, G.camTarget.z);
  if (p.car) look.y = 1.2;
  G.camera.lookAt(look);
  // sun follows the player for shadows
  if (G.sun) {
    G.sun.position.set(target.x + 200, 260, target.z + 120);
    G.sun.target.position.set(target.x, 0, target.z);
    G.sun.target.updateMatrixWorld();
  }
  // speed FOV kick
  const speed = p.car ? Math.abs(p.car.userData.speed) : 0;
  const fov = 62 + clamp(speed / 38, 0, 1) * 10;
  if (Math.abs(G.camera.fov - fov) > 0.1) {
    G.camera.fov = lerp(G.camera.fov, fov, Math.min(1, dt * 4));
    G.camera.updateProjectionMatrix();
  }
}

function updateWanted(dt) {
  // keep the police count near the wanted level
  if (G.wanted > 0) {
    policeTimer -= dt;
    if (G.police.length < G.wanted && policeTimer <= 0) {
      spawnPoliceCar(G.player.pos.x, G.player.pos.z);
      policeTimer = 4;
    }
    // foot officers when wanted >= 2 and the player is on foot
    if (G.wanted >= 2 && G.player.onFoot) {
      officerTimer -= dt;
      if (G.officers.length < 2 && officerTimer <= 0) {
        const off = makePed('Officer', { kind: 'officer', shirt: 0x1c1c22, speed: 5 });
        const a = rand(0, Math.PI * 2);
        off.position.set(G.player.pos.x + Math.cos(a) * 30, 0, G.player.pos.z + Math.sin(a) * 30);
        G.scene.add(off); G.officers.push(off); G.peds.push(off);
        officerTimer = 6;
      }
    }
    // roadblocks at 3+ stars
    if (G.wanted >= 3) {
      roadblockTimer -= dt;
      if (!roadblock && roadblockTimer <= 0) {
        const p = G.player;
        const road = Math.abs(p.pos.x) > Math.abs(p.pos.z) ? 'z' : 'x';
        const ahead = 60;
        const bx = p.pos.x + (road === 'x' ? 0 : Math.sign(p.pos.x || 1) * ahead);
        const bz = p.pos.z + (road === 'z' ? 0 : Math.sign(p.pos.z || 1) * ahead);
        const cars = [];
        for (const s of [-1, 1]) {
          const c = makeCar('police', 0x1c1c22);
          c.position.set(bx + s * 3, 0, bz + s * 3);
          G.scene.add(c); cars.push(c); G.cars.push(c);
        }
        roadblock = { cars, x: bx, z: bz, left: 30 };
        roadblockTimer = 25;
      }
    }
  }
  if (roadblock) {
    roadblock.left -= dt;
    if (roadblock.left <= 0 || dist2(G.player.pos.x, G.player.pos.z, roadblock.x, roadblock.z) > 150) {
      for (const c of roadblock.cars) {
        G.scene.remove(c);
        const ci = G.cars.indexOf(c); if (ci >= 0) G.cars.splice(ci, 1);
      }
      roadblock = null;
    }
  }
  // officers chase; bust if one stays close for 2s
  const p = G.player;
  for (let i = G.officers.length - 1; i >= 0; i--) {
    const off = G.officers[i];
    const dx = p.pos.x - off.position.x, dz = p.pos.z - off.position.z;
    const d = Math.hypot(dx, dz) || 1;
    off.position.x += (dx / d) * 5 * dt;
    off.position.z += (dz / d) * 5 * dt;
    off.rotation.y = Math.atan2(dx, dz);
    if (p.car) { // officers give up when you drive away
      if (d > 80) {
        G.scene.remove(off); G.officers.splice(i, 1);
        const pi = G.peds.indexOf(off); if (pi >= 0) G.peds.splice(pi, 1);
      }
      continue;
    }
    if (d < 2) {
      G.bustTimer += dt;
      if (G.bustTimer > 2) {
        G.money = Math.max(0, G.money - 200);
        showWasted('BUSTED', 'The police caught you. -$200.');
        G.over = true; G.busted = true;
        return;
      }
    } else G.bustTimer = 0;
  }
  // lose the cops: no police/officer with line of sight for a while -> -1 star
  if (G.wanted > 0) {
    let seen = false;
    for (const car of G.police) {
      const d = dist2(p.pos.x, p.pos.z, car.position.x, car.position.z);
      if (d < 90 && !losBlocked(p.pos.x, p.pos.z, car.position.x, car.position.z)) { seen = true; break; }
    }
    if (!seen) for (const off of G.officers) {
      const d = dist2(p.pos.x, p.pos.z, off.position.x, off.position.z);
      if (d < 60 && !losBlocked(p.pos.x, p.pos.z, off.position.x, off.position.z)) { seen = true; break; }
    }
    if (seen) G.losTimer = 0;
    else {
      G.losTimer += dt;
      const need = G.wanted <= 2 ? 10 : G.wanted === 3 ? 20 : 30;
      if (G.losTimer >= need) {
        G.wanted--;
        G.losTimer = 0;
        showToast('You lost the cops. Wanted level down.');
      }
    }
  } else G.losTimer = 0;
  // health
  if (G.health <= 0 && !G.over) {
    showWasted('WASTED', 'Mara is down. The city moves on.');
    G.over = true;
  }
}

function updateInteractPrompt() {
  if (!G.started || G.over || G.dialog) { setInteract(null); return; }
  const p = G.player;
  if (p.car) { setInteract('E — Exit car'); return; }
  if (G.interior) {
    const it = interiorInteract();
    setInteract(it ? it.label : null);
    return;
  }
  const door = nearestDoor(p.pos.x, p.pos.z, 3.5);
  if (door) { setInteract(`E — Enter ${door.name}`); return; }
  const ped = nearestPed(p.pos.x, p.pos.z, 2.8);
  if (ped && ped.userData.kind !== 'event') { setInteract(`E — Talk to ${ped.userData.name}`); return; }
  const car = nearestCar(p.pos.x, p.pos.z, 4.5);
  if (car) { setInteract(car.userData.starter ? 'E — Get in car' : 'E — Steal car'); return; }
  setInteract(null);
}

function tick() {
  const dt = Math.min(G.clock.getDelta(), 0.05);
  if (!G.started) { G.time += dt; updateDayNight(dt); updateCamera(dt); renderer.render(G.scene, G.camera); return; }
  if (G.over) { updateHUD(dt); renderer.render(G.scene, G.camera); return; }
  G.time += dt;
  updateDayNight(dt);
  updateEvents(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updatePeds(dt);
  updateMissions(dt);
  updateActivities(dt);
  updateDialogue(dt);
  updatePlayer(dt);
  updateWanted(dt);
  updateInteractPrompt();
  // skid marks fade
  for (let i = skidMats.length - 1; i >= 0; i--) {
    skidMats[i].life -= dt;
    if (skidMats[i].life <= 0) {
      skidGroup.remove(skidMats[i].mesh);
      skidMats.splice(i, 1);
    }
  }
  updateCamera(dt);
  updateHUD(dt);
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 10; saveGame(); }
  renderer.render(G.scene, G.camera);
}

function startGame(useSave) {
  initAudio();
  hideMenu();
  G.started = true;
  G.menuMode = false;
  if (useSave) {
    const s = loadGame();
    if (s) {
      applySave(s);
      if (G.savePos) {
        G.player.pos.set(G.savePos.x, 0, G.savePos.z);
        G.player.mesh.position.copy(G.player.pos);
        G.camTarget.copy(G.player.pos);
      }
      showToast('Welcome back, Mara.');
    }
  } else {
    G.money = CFG.MONEY_START; G.health = CFG.HEALTH_MAX;
    playStory('intro');
  }
  setHint('WASD move • mouse look • E enter car / talk / enter shops • Q radio • H horn • Tab map • N start mission', 15);
  setMission('');
  if (G.camTarget) G.camTarget.copy(G.player.pos);
}

// test + debug hooks (used by the headless play-test; harmless in the real game)
window.PV = {
  G, startGame, save: saveGame, sfx, talkTo, startMission, doInteract,
  enterInterior, exitInterior, interiorInteract,
  teleport(x, z) { G.player.pos.set(x, 0, z); G.player.mesh.position.copy(G.player.pos); if (G.camTarget) G.camTarget.copy(G.player.pos); },
  giveCar(type) {
    const car = makeCar(type || 'sedan', 0x2e8a8a);
    car.position.set(G.player.pos.x + 3, 0, G.player.pos.z + 3);
    G.scene.add(car); G.cars.push(car); G.parked.push(car);
    return car;
  },
  enterCar(car) { enterCar(car); },
  setDayT(t) { G.dayT = t; },
  setWanted(n) { G.wanted = n; },
  state() {
    return {
      money: G.money, health: G.health, wanted: G.wanted,
      pos: [G.player.pos.x, G.player.pos.z], onFoot: G.player.onFoot,
      ammo: G.player.ammo, interior: G.interior ? G.interior.name : null,
      dialog: G.dialog, mission: G.mission ? { idx: G.mission.idx, phase: G.mission.phase, timer: G.mission.timer } : null,
      coinsGot: G.coinsGot.length, raceBest: G.raceBest,
      race: G.race ? { active: G.race.active, cp: G.race.cp, left: G.race.left } : null,
      events: G.events.length, peds: G.peds.length, traffic: G.traffic.length, police: G.police.length,
      dayT: G.dayT, missionsDone: G.missionsDone,
    };
  },
};

init();
