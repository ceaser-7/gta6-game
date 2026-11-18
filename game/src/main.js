// Porto Verde — entry: boot, menu, input, game loop, debug API.
import * as THREE from '../vendor/three.module.min.js';
import { G, DAY_LEN, clamp, rand } from './state.js';
import { buildCity } from './city.js';
import { makePlayerMesh, updatePlayer, updateCamera, snapCamera, enterCar, exitCar, shoot, punch } from './player.js';
import { spawnWorld, updateTraffic } from './traffic.js';
import { updatePolice, addWanted } from './police.js';
import { updateMissions, startMission, nextMissionNum, makeBeacon, ROOK_MARKER } from './missions.js';
import { updateDialogue, talkTo } from './dialogue.js';
import { buildCoins, updateCoins, buildRace, updateRace } from './activities.js';
import { buildInteriors, nearestDoor, enterInterior, exitInterior, roomAction } from './interiors.js';
import { updateEvents } from './events.js';
import { initAudio, cycleStation, toggleMute, honk } from './audio.js';
import { initHud, setInteract } from './hud.js';
import { saveGame, loadSave, applySave, hasSave } from './save.js';
import { stageShot } from './shots.js';
import { nearestCar } from './cars.js';
import { dist } from './state.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8a35a);
scene.fog = new THREE.Fog(0xe8a35a, 120, 900);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
G.scene = scene; G.camera = camera; G.renderer = renderer;
G.snapCamera = snapCamera;
G.save = saveGame;

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffd0a0, 1.1);
sun.position.set(200, 180, 100);
scene.add(sun);
const moon = new THREE.DirectionalLight(0x8aa8ff, 0.25);
moon.position.set(-150, 200, -100);
scene.add(moon);
// headlight spotlight (car headlight; a torch-like cone on foot)
const headlight = new THREE.SpotLight(0xfff2c0, 0, 60, 0.5, 0.4, 1.2);
scene.add(headlight);
headlight.target = new THREE.Object3D();
scene.add(headlight.target);
// muzzle flash
const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 }));
muzzle.scale.set(1.6, 1.6, 1); muzzle.visible = false;
scene.add(muzzle);
G.muzzle = muzzle;

buildCity();
buildCoins();
buildRace();
buildInteriors();
spawnWorld();
makeBeacon();
makePlayerMesh();
initHud();

const SKY_DAY = new THREE.Color(0x87a8c8);
const SKY_SUNSET = new THREE.Color(0xe8a35a);
const SKY_NIGHT = new THREE.Color(0x0a0e1a);

function updateSky() {
  const dayF = clamp(Math.sin((G.dayT / DAY_LEN) * Math.PI * 2), 0, 1);
  let sky;
  if (dayF > 0.55) sky = SKY_DAY.clone().lerp(SKY_SUNSET, (1 - dayF) * 1.6);
  else if (dayF > 0.15) sky = SKY_SUNSET.clone().lerp(SKY_NIGHT, (0.55 - dayF) * 1.8);
  else sky = SKY_NIGHT;
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sun.intensity = 0.15 + dayF * 1.1;
  sun.color.setHex(dayF > 0.4 ? 0xfff2d0 : 0xffb070);
  ambient.intensity = 0.25 + dayF * 0.45;
  moon.intensity = dayF < 0.2 ? 0.35 : 0.05;
  // headlight at night
  const night = dayF < 0.25;
  const p = G.player;
  headlight.intensity = night ? (p.onFoot ? 30 : 90) : 0;
  if (night) {
    headlight.position.set(p.x, p.onFoot ? 1.8 : 1.2, p.z);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    headlight.target.position.set(p.x + fx * 20, 0.5, p.z + fz * 20);
  }
}

// ---- input ----
const keys = {};
const input = { fwd: false, back: false, left: false, right: false, run: false, handbrake: false };
function syncInput() {
  input.fwd = !!(keys['KeyW'] || keys['ArrowUp']);
  input.back = !!(keys['KeyS'] || keys['ArrowDown']);
  input.left = !!(keys['KeyA'] || keys['ArrowLeft']);
  input.right = !!(keys['KeyD'] || keys['ArrowRight']);
  input.run = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  input.handbrake = !!keys['Space'];
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); toggleMap(); return; }
  keys[e.code] = true;
  syncInput();
  if (!G.started) return;
  if (e.code === 'Enter' && G.dialog) { G.ui.closeDialog(); return; }
  if (e.code === 'KeyE') onInteract();
  if (e.code === 'KeyF' && G.player.onFoot && !G.dialog) punch();
  if (e.code === 'KeyR' && G.player.onFoot && !G.dialog) { G.player.ammo = 12; G.ui.toast && G.ui.toast('Reloaded'); G.ui.updateHud && G.ui.updateHud(); }
  if (e.code === 'KeyQ') cycleStation();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyH') honk();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; syncInput(); });
canvas.addEventListener('click', () => {
  if (!G.started) return;
  canvas.requestPointerLock && canvas.requestPointerLock().catch(() => {});
  if (!G.dialog && G.player.onFoot) shoot();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || !G.started) return;
  G.player.yaw -= e.movementX * 0.0022;
  G.player.pitch = clamp(G.player.pitch - e.movementY * 0.002, -0.5, 0.4);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let mapOpen = false;
function toggleMap() {
  mapOpen = !mapOpen;
  const el = document.getElementById('map-overlay');
  el.style.display = mapOpen ? 'flex' : 'none';
  if (mapOpen && G.ui.drawFullMap) G.ui.drawFullMap();
}

function nearestPed(x, z, maxD) {
  let best = null, bd = maxD * maxD;
  for (const ped of G.peds) {
    if (ped.interior && !G.interior) continue;
    if (G.interior && ped.interior !== true) continue;
    const dx = ped.x - x, dz = ped.z - z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = ped; }
  }
  return best;
}

function onInteract() {
  if (G.dialog) return;
  const p = G.player;
  if (G.interior) {
    // near the door wall? leave. else room action (talk / buy / fix).
    const room = G.interior;
    if (p.z > room.bounds.z1 - 2.5) { exitInterior(); return; }
    roomAction();
    return;
  }
  if (!p.onFoot) { exitCar(); return; }
  const door = nearestDoor(p.x, p.z);
  if (door) { enterInterior(door); return; }
  const ped = nearestPed(p.x, p.z, 3);
  if (ped) { talkTo(ped); return; }
  const car = nearestCar(p.x, p.z, 4.5);
  if (car) { enterCar(car); if (car !== G.starterCar) addWanted(1); return; }
  if (dist(p.x, p.z, ROOK_MARKER.x, ROOK_MARKER.z) < 5) {
    const n = nextMissionNum();
    if (n > 0) startMission(n);
    else G.ui.toast && G.ui.toast('All jobs done — the city is yours');
  }
}

function updateInteractPrompt() {
  if (!G.started || G.dialog) { setInteract(null); return; }
  const p = G.player;
  if (G.interior) {
    const room = G.interior;
    if (p.z > room.bounds.z1 - 2.5) { setInteract('E — Leave ' + room.name); return; }
    if (room.id === 'elfaro' && room.buySpot && dist(p.x, p.z, room.buySpot.x, room.buySpot.z) < 3) { setInteract('E — Buy taco ($10, +25 health)'); return; }
    if (room.id === 'sunray' && room.fixSpot && dist(p.x, p.z, room.fixSpot.x, room.fixSpot.z) < 4) { setInteract('E — Fix project car (+$100)'); return; }
    const ped = nearestPed(p.x, p.z, 3);
    if (ped) { setInteract('E — Talk to ' + ped.name); return; }
    setInteract(null); return;
  }
  if (!p.onFoot) { setInteract('E — Exit car'); return; }
  const door = nearestDoor(p.x, p.z);
  if (door) { setInteract('E — Enter ' + door.name); return; }
  const ped = nearestPed(p.x, p.z, 3);
  if (ped) { setInteract('E — Talk to ' + ped.name); return; }
  const car = nearestCar(p.x, p.z, 4.5);
  if (car) { setInteract('E — Enter car'); return; }
  if (dist(p.x, p.z, ROOK_MARKER.x, ROOK_MARKER.z) < 5) {
    const n = nextMissionNum();
    setInteract(n > 0 ? `E — Start job ${n}` : 'All jobs done');
    return;
  }
  setInteract(null);
}

// ---- menu ----
const menu = document.getElementById('menu');
const btnStart = document.getElementById('btn-start');
const btnContinue = document.getElementById('btn-continue');
if (!hasSave()) btnContinue.style.display = 'none';
btnStart.addEventListener('click', () => startGame(false));
btnContinue.addEventListener('click', () => startGame(true));

function startGame(useSave) {
  initAudio();
  menu.style.display = 'none';
  G.started = true;
  if (useSave) {
    const data = loadSave();
    if (data) { applySave(data); G.ui.toast && G.ui.toast('Save loaded — welcome back, Mara'); }
  }
  G.player.x = G.player.x || 0;
  snapCamera();
  G.ui.updateHud && G.ui.updateHud();
  saveGame();
}

// ---- main loop ----
let last = performance.now();
let menuAngle = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.dt = dt;
  if (!G.started) {
    // orbiting menu camera over the city
    menuAngle += dt * 0.05;
    camera.position.set(Math.cos(menuAngle) * 320, 130, Math.sin(menuAngle) * 320);
    camera.lookAt(0, 0, 0);
    G.time += dt;
    renderer.render(scene, camera);
    return;
  }
  if (G.over) { renderer.render(scene, camera); return; }
  G.time += dt;
  G.dayT = (G.dayT + dt) % DAY_LEN;
  updateSky();
  updatePlayer(dt, input);
  updateEvents(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updateMissions(dt);
  updateCoins(dt);
  updateRace(dt);
  updateDialogue(dt);
  updateInteractPrompt();
  updateCamera(dt);
  G.ui.updateHud && G.ui.updateHud();
  if (G.player.health <= 0 && !G.over) {
    G.over = true;
    G.ui.wasted && G.ui.wasted();
  }
  renderer.render(scene, camera);
}
updateSky();
requestAnimationFrame(loop);

// ---- debug / test API ----
window.PV = {
  ready: true, G,
  teleport(x, z) { const p = G.player; p.x = x; p.z = z; if (p.car) { p.car.x = x; p.car.z = z; p.car.mesh.position.set(x, 0, z); } snapCamera(); },
  teleportCar(x, z) { const p = G.player; if (p.car) { p.car.x = x; p.car.z = z; p.car.mesh.position.set(x, 0, z); } p.x = x; p.z = z; snapCamera(); },
  startMission(n) { return startMission(n); },
  startGame(useSave) { startGame(useSave); },
  shot(name) { stageShot(name); },
  closeDialog() { G.ui.closeDialog(); },
  enterNearestCar() { const c = nearestCar(G.player.x, G.player.z, 30); if (c) enterCar(c); return !!c; },
  state() {
    const p = G.player;
    return { x: Math.round(p.x), z: Math.round(p.z), money: Math.floor(p.money), health: Math.round(p.health), wanted: G.wanted, coins: G.coinGot.length, race: { active: G.race.active, cp: G.race.cp, t: Math.round(G.race.t), best: G.race.best }, mission: G.mission ? { n: G.mission.n, phase: G.mission.phase, t: Math.round(G.mission.t) } : null, missionsDone: [...G.missionsDone], interior: G.interior ? G.interior.id : null, dialog: G.dialog ? G.dialog.who : null, event: G.streetEvent ? G.streetEvent.kind : null, started: G.started, over: G.over };
  },
};
