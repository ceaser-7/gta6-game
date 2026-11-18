// Porto Verde — boot, menu, input, game loop. Original open-world crime game.
import * as THREE from 'three';
import { G, saveGame, loadGame, clamp } from './util.js';
import { buildCity } from './city.js';
import { spawnTraffic, updateTraffic, updateSmoke, makeCar } from './vehicles.js';
import { spawnPeds, updatePeds, nearestPed } from './peds.js';
import { talkTo, updateDialogue } from './dialogue.js';
import { playStory } from './story.js';
import { startMission, updateMissions, missionInteract } from './missions.js';
import { buildActivities, updateActivities } from './activities.js';
import { buildInteriors, doorInteract, interiorInteract, updateInteriors, interiorPrompt, doorPrompt } from './interiors.js';
import { updateEvents } from './events.js';
import { initAudio, cycleStation, toggleMute } from './audio.js';
import { initHUD, updateHUD, closeDialog, toast, toggleBigMap, hideMenu, showMenu, setPrompt, setHint } from './hud.js';
import { buildLights, updateDayNight } from './daynight.js';
import { makePlayer, updatePlayer, updateCamera, nearestCar, enterCar, exitCar, handleShoot, handlePunch, handleReload, respawn, snapCamera } from './player.js';

const params = new URLSearchParams(location.search);
const low = params.has('low');
const noLoop = params.has('noloop');

const renderer = new THREE.WebGLRenderer({ antialias: !low });
renderer.setSize(low ? 640 : 1280, low ? 360 : 720);
renderer.shadowMap.enabled = !low;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(60, (low ? 640 : 1280) / (low ? 360 : 720), 0.1, 1200);
camera.position.set(0, 100, 300);
G.camera = camera;

buildLights();
buildCity();
spawnTraffic();
spawnPeds();
buildActivities();
buildInteriors();
makePlayer();
// Starter car: a teal sedan parked in front of the spawn.
const starter = makeCar('sedan');
starter.position.set(8, 0, 308);
starter.userData.stolen = true; // Mara's own car — no heat for taking it.
starter.userData.parked = true; // stays put until Mara takes it.
G.scene.add(starter);
G.cars.push(starter);
initHUD();

const save = loadGame();
showMenu(!!save);
document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));

function applySave(s) {
  if (!s) return;
  G.money = s.money ?? 250;
  G.health = s.health ?? 100;
  G.missionsDone = s.missionsDone || 0;
  for (const i of (s.coinGot || [])) {
    const c = G.coins[i];
    if (c) { c.taken = true; if (c.mesh) c.mesh.visible = false; }
  }
  G.coinGot = (s.coinGot || []).slice();
  if (s.x !== undefined) G.player.position.set(clamp(s.x, -440, 440), 0, clamp(s.z, -440, 440));
  if (s.dayT !== undefined) G.dayT = s.dayT;
}

function startGame(useSave) {
  initAudio();
  if (useSave) applySave(loadGame());
  hideMenu();
  G.started = true;
  snapCamera();
  setHint('Follow the gold marker — press 1 for Mission 1. Find Verde Coins. Talk to people. Stay out of trouble.');
  if (!useSave) playStory('intro');
  lockPointer();
}

function lockPointer() {
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { /* headless / no gesture */ });
  } catch (e) { /* pointer lock unavailable */ }
}

window.addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); if (G.started) toggleBigMap(); return; }
  if (!G.started) return;
  if (e.code === 'Enter') {
    if (G.dialog) closeDialog();
    else if (G.dead) respawn();
    return;
  }
  if (G.dialog || G.dead) return;
  if (e.code === 'KeyE') {
    const mi = missionInteract();
    if (mi) {
      mi.action();
      if (G.mission && G.mission.n === 1 && G.mission.phase === 'deliver' && G.mission.goldCar) {
        enterCar(G.mission.goldCar);
      }
      return;
    }
    if (G.playerCar) { exitCar(); return; }
    const ii = interiorInteract();
    if (ii) { ii.action(); return; }
    const di = doorInteract();
    if (di) { di.action(); return; }
    const ped = nearestPed(3);
    if (ped && talkTo(ped)) return;
    const car = nearestCar(4);
    if (car) enterCar(car);
  } else if (e.code === 'KeyQ') { cycleStation(); }
  else if (e.code === 'KeyM') { toggleMute(); }
  else if (e.code === 'KeyR') { handleReload(); }
  else if (e.code === 'KeyF') { handlePunch(); }
  else if (e.code === 'KeyH') { toast('Honk!'); }
  else if (e.code === 'Digit1') { startMission(0); }
  else if (e.code === 'Digit2') { startMission(1); }
  else if (e.code === 'Digit3') { startMission(2); }
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
renderer.domElement.addEventListener('click', () => {
  if (!G.started) return;
  if (document.pointerLockElement !== renderer.domElement) lockPointer();
  handleShoot();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement && !G.dialog) {
    G.yaw -= e.movementX * 0.0028;
  }
});

// Interact prompt (E) — recomputed each frame, cheap checks only.
function currentPrompt() {
  if (!G.started || G.dialog || G.dead) return '';
  const mi = missionInteract();
  if (mi) return 'E — ' + mi.label;
  if (G.playerCar) return 'E — Exit car';
  const ip = interiorPrompt();
  if (ip) return ip;
  const dp = doorPrompt();
  if (dp) return dp;
  if (nearestPed(3)) return 'E — Talk';
  if (nearestCar(4)) return 'E — Enter car';
  return '';
}

const clock = new THREE.Clock();
let orbitT = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!G.started) {
    orbitT += dt;
    camera.position.set(Math.sin(orbitT * 0.05) * 320, 140, Math.cos(orbitT * 0.05) * 320);
    camera.lookAt(0, 20, 0);
    updateDayNight(dt * 0.2);
    renderer.render(scene, camera);
    return;
  }
  G.time += dt;
  updatePlayer(dt);
  updateTraffic(dt);
  updateEvents(dt);
  updateMissions(dt);
  updateActivities(dt);
  updateDialogue(dt);
  updateInteriors(dt);
  updatePeds(dt);
  updateSmoke(dt);
  updateDayNight(dt);
  updateCamera(dt);
  setPrompt(currentPrompt());
  updateHUD(dt);
  renderer.render(scene, camera);
}
loop();
if (noLoop) { /* single frame rendered by the first loop() call */ }

// Test hooks for the headless smoke test (not part of gameplay).
window.PV = {
  G, ready: true,
  start(useSave = false) { startGame(useSave); },
  teleport(x, z) {
    if (G.playerCar) { G.playerCar.position.set(x, 0, z); }
    else { G.player.position.set(x, 0, z); }
    snapCamera();
  },
  setYaw(y) { G.yaw = y; },
  startMission,
  giveCar() {
    const car = makeCar('sedan');
    car.position.set(G.player.position.x + 4, 0, G.player.position.z);
    G.scene.add(car);
    G.cars.push(car);
    return car;
  },
  enterCar, exitCar, closeDialog, respawn, playStory,
  setDayT(t) { G.dayT = t; },
  state() {
    return {
      money: G.money, health: G.health, wanted: G.wanted,
      coins: G.coinGot.length, coinsTotal: 12,
      mission: G.mission ? { n: G.mission.n, phase: G.mission.phase, timer: Math.round(G.mission.timer) } : null,
      missionsDone: G.missionsDone,
      x: G.playerCar ? G.playerCar.position.x : G.player.position.x,
      z: G.playerCar ? G.playerCar.position.z : G.player.position.z,
      inCar: !!G.playerCar,
      interior: G.interior ? G.interior.kind : null,
      dialog: G.dialog,
      dead: G.dead, started: G.started,
      race: G.race ? { cpIdx: G.race.cpIdx, t: G.race.t } : null,
      raceBest: G.raceBest,
      save: !!localStorage.getItem('porto-verde-save-v1'),
    };
  },
};
