// Porto Verde — entry point: build the world, wire the systems, run the loop.
// One clear job: own the game state and the frame, and let every module do its job.
import * as THREE from 'three';
import { createCity, mulberry32 } from './city.js';
import { createPlayer, updatePlayerOnFoot, updateCamera } from './player.js';
import { updatePlayerCar, tryEnterCar, exitCar, createSkids, updateSkids, createSmoke, updateSmoke } from './vehicles.js';
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
// sky dome: gradient canvas texture on a big back-facing sphere + a sun disc.
// The gradient is redrawn by the day/night cycle (see dayNight / applyDayNight).
function createSky() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 24, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(42, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true, opacity: 0.95 }),
  );
  disc.position.set(120, 180, 80).normalize().multiplyScalar(1000);
  disc.lookAt(0, 0, 0);
  scene.add(disc);
  return { sky, disc, canvas: c, ctx: g, tex };
}
const skyParts = createSky();

// --- day / night cycle (240 s loop; opens at golden-hour sunset) ---
// Keyframes from GPT-6.1 Sol (single fixed-design call, 2026-11-17): t=0 sunset,
// 0.125 dusk, 0.25 night, 0.5 dawn, 0.75 noon. Written into the game here.
function dayNight(t) {
  t = ((t % 1) + 1) % 1;
  const frames = [
    { t: 0, sun: '#ff9b4a', intensity: 1.2, hemi: 0.55, lamps: 0.3,
      sky: ['#344d73', '#ad7f8e', '#ffbd7a', '#74585a'] },
    { t: 0.125, sun: '#b779a4', intensity: 0.35, hemi: 0.25, lamps: 0.85,
      sky: ['#10142c', '#493757', '#99606b', '#533c4d'] },
    { t: 0.25, sun: '#203b73', intensity: 0.06, hemi: 0.12, lamps: 1,
      sky: ['#01030a', '#08152f', '#172745', '#0e1426'] },
    { t: 0.5, sun: '#ffad65', intensity: 1.2, hemi: 0.55, lamps: 0.4,
      sky: ['#526d97', '#d19eaa', '#ffd2a1', '#96796e'] },
    { t: 0.75, sun: '#fff1d6', intensity: 1.5, hemi: 0.85, lamps: 0,
      sky: ['#398ed4', '#80c6ed', '#d1e8f4', '#8caab5'] },
  ];
  let i = 0;
  while (i < frames.length - 1 && t >= frames[i + 1].t) i++;
  const a = frames[i], b = frames[(i + 1) % frames.length];
  const end = i === frames.length - 1 ? 1 : b.t;
  let u = (t - a.t) / (end - a.t);
  u = u * u * (3 - 2 * u);
  const lerp = (x, y) => x + (y - x) * u;
  const lerpHex = (x, y) => {
    const p = parseInt(x.slice(1), 16), q = parseInt(y.slice(1), 16);
    return '#' + [16, 8, 0].map(shift =>
      Math.round(lerp((p >> shift) & 255, (q >> shift) & 255)).toString(16).padStart(2, '0')).join('');
  };
  const skyStops = a.sky.map((color, j) => lerpHex(color, b.sky[j]));
  return {
    sunElevDeg: Math.sin((t - 0.25) * 2 * Math.PI) * 65,
    sunAzDeg: 200 + t * 360,
    sunColor: lerpHex(a.sun, b.sun),
    sunIntensity: lerp(a.intensity, b.intensity),
    hemiIntensity: lerp(a.hemi, b.hemi),
    fogColor: skyStops[2],
    skyStops,
    lampGlow: lerp(a.lamps, b.lamps),
  };
}
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
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a4a3a, 0.95);
scene.add(hemi);

// Apply one day/night sample: sun position + colour, sky gradient, fog, lamps, neon.
let skyRedrawTimer = 0;
function applyDayNight(G, dn, dt) {
  const elev = dn.sunElevDeg * Math.PI / 180, az = dn.sunAzDeg * Math.PI / 180;
  const dir = new THREE.Vector3(
    Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
  G.sunDir = dir;
  G.sun.color.set(dn.sunColor);
  G.sun.intensity = dn.sunIntensity;
  hemi.intensity = dn.hemiIntensity;
  scene.fog.color.set(dn.fogColor);
  // sun disc: follow the sun; hide it below the horizon
  skyParts.disc.position.copy(dir).multiplyScalar(1000);
  skyParts.disc.lookAt(0, 0, 0);
  skyParts.disc.visible = dn.sunElevDeg > -4;
  skyParts.disc.material.color.set(dn.sunColor);
  // sky gradient: redraw at most every 0.25 s (cheap enough, smooth enough)
  skyRedrawTimer += dt;
  if (skyRedrawTimer > 0.25) {
    skyRedrawTimer = 0;
    const g = skyParts.ctx;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, dn.skyStops[0]);
    grad.addColorStop(0.45, dn.skyStops[1]);
    grad.addColorStop(0.62, dn.skyStops[2]);
    grad.addColorStop(1, dn.skyStops[3]);
    g.fillStyle = grad; g.fillRect(0, 0, 16, 512);
    skyParts.tex.needsUpdate = true;
  }
  // lamps + neon glow harder at night
  if (G.city.lampGlowMat) G.city.lampGlowMat.emissiveIntensity = 0.25 + dn.lampGlow * 1.6;
  for (const m of G.city.neonMats) m.emissiveIntensity = 0.3 + dn.lampGlow * 1.2;
}

const G = {
  scene, camera, renderer, sun, time: 0, dayT: 0, sunDir: null, state: 'menu', mapOpen: false,
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
createSmoke(G);
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
    G.showOver('WASTED', 'Mara went down. Porto Verde keeps moving without her — but the run is not over.', 'respawn');
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
  if (e.code === 'KeyQ') G.audio.nextStation();
  if (e.code === 'KeyH' && G.player.car) G.audio.horn();
  if (e.code === 'KeyR') G.reload && G.reload();
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
// manual clock (THREE.Clock is deprecated in r187)
let lastNow = performance.now();
let saveTimer = 0;
function updateSunShadow(G) {
  // keep the shadow camera centred on the player so shadows stay crisp
  const dir = G.sunDir || new THREE.Vector3(120, 180, 80).normalize();
  const p = G.player.pos;
  G.sun.position.set(p.x + dir.x * 320, Math.max(40, dir.y * 320), p.z + dir.z * 320);
  G.sun.target.position.set(p.x, 0, p.z);
  G.sun.target.updateMatrixWorld();
}
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
  lastNow = now;
  G.time += dt;
  // day/night: 240 s loop, opens at golden-hour sunset
  G.dayT = (G.time / 240) % 1;
  applyDayNight(G, dayNight(G.dayT), dt);
  updateSunShadow(G);
  // water scroll
  for (const m of G.city.waterMats) { m.map.offset.x += dt * 0.02; m.map.offset.y += dt * 0.008; }
  if (G.state === 'playing' && !G.hud.dialogOpen) {
    if (G.player.onFoot) { updatePlayerOnFoot(G, dt); G.audio.engine(0); }
    else { updatePlayerCar(G, dt); updateSkids(G, dt); }
    updateSmoke(G, dt);
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
