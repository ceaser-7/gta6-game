// Porto Verde — entry point: build the world, wire the systems, run the loop.
// One clear job: own the game state and the frame, and let every module do its job.
import * as THREE from 'three';
import { createCity, mulberry32 } from './city.js';
import { createPlayer, updatePlayerOnFoot, updateCamera } from './player.js';
import { updatePlayerCar, tryEnterCar, exitCar, createSkids, updateSkids } from './vehicles.js';
import { createTraffic, updateTraffic, spawnFleeingPed } from './traffic.js';
import { updatePolice } from './police.js';
import { createMissions, updateMissions, failMission } from './missions.js';
import { createCombat, shoot, punch, updateTracers, updateMuzzle } from './combat.js';
import { createHud, updateHud, setObjective, setTimer, showDialog, closeDialog, toast, flash } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { shotName, setupShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// sky dome: gradient canvas texture on a big back-facing sphere + a sun disc
function createSky() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2f6fb8');
  grad.addColorStop(0.45, '#7fb8e0');
  grad.addColorStop(0.62, '#cfe6f2');
  grad.addColorStop(1, '#e8b07a');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 24, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const sunDir = new THREE.Vector3(120, 180, 80).normalize();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(42, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true, opacity: 0.95 }),
  );
  disc.position.copy(sunDir).multiplyScalar(1000);
  disc.lookAt(0, 0, 0);
  scene.add(disc);
  return sky;
}
createSky();
scene.fog = new THREE.Fog(0x9fc4e0, 300, 1200);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);

const sun = new THREE.DirectionalLight(0xffe0b3, 1.5);
sun.position.set(120, 180, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x5a4a3a, 0.95));

const G = {
  scene, camera, renderer, sun, time: 0, state: 'menu', mapOpen: false,
  input: { keys: new Set() },
  camYaw: 0, camPitch: 0.28, camTarget: null, shake: 0,
  money: 0, wanted: 0, cars: [], peds: [], police: [], officers: [],
  rng: mulberry32(1337), objectiveText: '', lastShotAt: null, lastShot: 0,
  hasSave: hasSave(), overMode: 'respawn', shotMode: false,
};
G.city = createCity(scene);
G.player = createPlayer(scene);
G.player.health = 100;
createTraffic(G);
createMissions(G);
createCombat(G);
createAudio(G);
createSkids(G);
G.saveGame = () => saveGame(G);
G.spawnFleeingPed = (x, z) => spawnFleeingPed(G, x, z);

// --- cross-cutting helpers (owned here, used by the modules) ---
G.setWanted = n => { G.wanted = Math.max(0, Math.min(5, n)); };
G.addWanted = (n, reason) => {
  if (n <= 0) return;
  G.setWanted(G.wanted + n);
  if (reason) toast(G, reason);
};
G.hurtPlayer = (amount, fromPos) => {
  if (G.state !== 'playing') return;
  const p = G.player;
  p.health -= amount;
  p.lastHurt = G.time;
  G.shake = Math.min(0.7, G.shake + 0.35);
  flash(G);
  G.audio.thud();
  if (fromPos && p.onFoot) {
    const dx = p.pos.x - fromPos.x, dz = p.pos.z - fromPos.z;
    const len = Math.hypot(dx, dz) || 1;
    p.pos.x += (dx / len) * 0.9; p.pos.z += (dz / len) * 0.9;
  }
  if (p.health <= 0) {
    p.health = 0;
    G.audio.fail();
    G.showOver('FLATLINED', 'Mara went down. Porto Verde keeps moving without her — but the run is not over.', 'respawn');
  }
};
G.doBusted = reason => {
  G.money = Math.max(0, Math.floor(G.money * 0.9));
  G.setWanted(0);
  if (G.mission) failMission(G, reason);
  else G.showOver('BUSTED', reason + ' The PD took 10% of your cash as a "fine".', 'respawn');
};
G.showOver = (title, text, mode) => {
  G.state = 'over';
  G.overMode = mode;
  document.exitPointerLock?.();
  document.getElementById('overTitle').textContent = title;
  document.getElementById('overText').textContent = text;
  document.getElementById('over').style.display = 'flex';
  G.audio.engine(0);
};
G.hud = null;
createHud(G, {
  onStart: () => startGame(true),
  onContinue: () => startGame(false),
  onResume: () => { G.state = 'playing'; document.getElementById('pause').style.display = 'none'; },
  onQuit: () => { G.saveGame(); toMenu(); },
  onRetry: () => retry(),
  onMenu: () => toMenu(),
});
G.hud.setObjective = t => setObjective(G, t);
G.hud.setTimer = s => setTimer(G, s);
G.hud.showDialog = (w, t, d) => showDialog(G, w, t, d);
G.hud.toast = t => toast(G, t);
G.hud.flash = () => flash(G);

function toMenu() {
  G.state = 'menu';
  document.getElementById('over').style.display = 'none';
  document.getElementById('pause').style.display = 'none';
  document.getElementById('menu').style.display = 'flex';
  document.getElementById('hud').classList.remove('on');
  document.getElementById('btnContinue').style.display = G.hasSave ? '' : 'none';
  G.audio.engine(0); G.audio.siren(0);
}

function startGame(fresh) {
  const save = fresh ? null : loadSave();
  if (fresh) { clearSave(); G.hasSave = false; }
  G.money = save ? save.money : 0;
  G.missionIndex = save ? save.missionIndex : 0;
  G.mission = null;
  G.nextBriefIn = 2.5;
  G.player.health = save ? save.health : 100;
  G.setWanted(0);
  if (save) G.player.pos.set(save.pos.x, 0, save.pos.z);
  else G.player.pos.set(-54, 0, 30);
  if (G.player.car) { G.player.car.driver = null; G.player.car = null; }
  G.player.onFoot = true;
  G.player.group.visible = true;
  G.player.group.position.copy(G.player.pos);
  document.getElementById('menu').style.display = 'none';
  document.getElementById('over').style.display = 'none';
  document.getElementById('hud').classList.add('on');
  G.state = 'playing';
  G.audio.ensure(); G.audio.startMusic();
  G.hud.setObjective('');
  G.saveGame();
}

function retry() {
  document.getElementById('over').style.display = 'none';
  const p = G.player;
  if (p.car) { p.car.driver = null; p.car = null; }
  p.onFoot = true; p.group.visible = true;
  p.health = 100;
  p.pos.set(-54, 0, 30);
  p.group.position.copy(p.pos);
  G.setWanted(0);
  G.mission = null;
  G.nextBriefIn = G.overMode === 'mission' ? 0.8 : 99999;
  G.state = 'playing';
  G.hud.setObjective('');
  G.saveGame();
}

// --- input ---
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    if (G.state === 'playing') G.mapOpen = !G.mapOpen;
    return;
  }
  G.input.keys.add(e.code);
  G.audio.ensure();
  if (e.code === 'Enter' && G.hud.dialogOpen) { closeDialog(G); return; }
  if (G.state !== 'playing') return;
  if (e.code === 'KeyE') {
    if (G.player.onFoot) tryEnterCar(G);
    else exitCar(G);
  }
  if (e.code === 'KeyF') punch(G);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    G.state = 'paused';
    document.getElementById('pause').style.display = 'flex';
    document.exitPointerLock?.();
  }
  if (e.code === 'KeyM') G.audio.setMuted(!G.audio.muted);
});
window.addEventListener('keyup', e => G.input.keys.delete(e.code));
canvas.addEventListener('click', () => {
  G.audio.ensure();
  if (G.state === 'playing' && !G.hud.dialogOpen) canvas.requestPointerLock?.();
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  G.camYaw -= e.movementX * 0.0028;
  G.camPitch = Math.max(-0.1, Math.min(0.9, G.camPitch + e.movementY * 0.0022));
});
canvas.addEventListener('mousedown', e => {
  if (G.state === 'playing' && !G.hud.dialogOpen && e.button === 0) shoot(G);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- the frame ---
const clock = new THREE.Clock();
let saveTimer = 0;
const sunDir = new THREE.Vector3(120, 180, 80).normalize();
function updateSunShadow(G) {
  // keep the shadow camera centred on the player so shadows stay crisp
  const p = G.player.pos;
  G.sun.position.set(p.x + sunDir.x * 320, sunDir.y * 320, p.z + sunDir.z * 320);
  G.sun.target.position.set(p.x, 0, p.z);
  G.sun.target.updateMatrixWorld();
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  G.time += dt;
  updateSunShadow(G);
  // water scroll
  for (const m of G.city.waterMats) { m.map.offset.x += dt * 0.02; m.map.offset.y += dt * 0.008; }
  if (G.state === 'playing' && !G.hud.dialogOpen) {
    if (G.player.onFoot) { updatePlayerOnFoot(G, dt); G.audio.engine(0); }
    else { updatePlayerCar(G, dt); updateSkids(G, dt); }
    updateCamera(G, dt);
    // speed FOV kick: wider view at speed, eases back when slow
    const targetFov = G.player.car ? 62 + Math.min(9, Math.abs(G.player.car.speed) * 0.3) : 62;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 1.4);
      camera.position.x += (Math.random() - 0.5) * G.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * G.shake * 0.5;
    }
    updateTraffic(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    // a wrecked player car strands the player on foot
    if (G.player.car && G.player.car.health <= 0) {
      toast(G, 'The car is wrecked!');
      exitCar(G);
    }
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; G.saveGame(); }
  }
  updateTracers(G, dt);
  updateMuzzle(G, dt);
  for (const c of G.city.clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > 300) c.position.x = -300;
  }
  renderer.render(scene, camera);
  if (G.state === 'playing') updateHud(G);
}

// --- shot mode: staged scenes for screenshots ---
const shot = shotName();
if (shot && shot !== 'start') {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').classList.add('on');
  G.state = 'playing';
  setupShot(G, shot);
  G.audio.setMuted(true);
}
animate();
