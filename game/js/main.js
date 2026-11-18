// Porto Verde v3 — main entry, written fresh.
// Boots the renderer, wires every system, runs the loop, and hosts the
// v3 economy (properties, garage upgrades, respray, ammo vendor, side race)
// plus the screenshot staging hooks (photoCam, heliLow, addWanted).
import * as THREE from 'three';
import { G, WORLD, CAR_TYPES, STATIONS, clamp, lerp, rand, randi, pick, fmtCash } from './state.js';
import { startChapter, updateMissions, SPOTS } from './missions.js';
import { addWanted, syncPolice, updatePolice, policeTouchingPlayer } from './police.js';
import { makeCarMesh, spawnCar, spawnTraffic, spawnRaceCars, driveCar, updateTraffic, clampToIsland, collideAt } from './vehicles.js';
import { createPlayer, spawnPeds, updatePeds, bark, crewLine } from './people.js';
import { initWeapons, switchWeapon, reloadWeapon, punch, fireWeapon, updateTracers } from './weapons.js';
import { initAudio, startRadio, changeStation, toggleMute, setVolume, sfxHorn, sfxCoin, sfxClick, sfxCrash, sfxSiren, engineSound } from './audio.js';
import { updateHUD, drawFullMap, toast, say, setHint } from './hud.js';
import { saveGame, loadGame, applySave, hasSave, clearSave } from './save.js';
import { buildIsland, updateSky, animateOcean } from './island.js';
import { initSideJobs, updateSideJobs, nearestSideJob, acceptNearestSideJob, toggleJobBoard } from './sidejobs.js';
import { initGangs, updateGangs } from './gangs.js';
import { initRiots, updateRiot } from './riots.js';

const $ = id => document.getElementById(id);
let renderer;
let clock;
let camYaw = 0;
let camPitch = 0.32;
let camDist = 9;
let tailVanMesh = null;
let headlight = null;
let lastSave = 0;
let interior = null;
let wastedAt = 0;
let dead = false;
let flashSprite = null;
let flashTimer = 0;

// ---- Callbacks the modules expect ----
G.toast = toast;
G.say = say;
G.updateHUD = updateHUD;
G.saveGame = saveGame;
G.addWanted = addWanted;
G.showPassed = (title, sub) => {
  $('passedTitle').textContent = title;
  $('passedSub').textContent = sub;
  $('passed').classList.remove('hidden');
  setTimeout(() => $('passed').classList.add('hidden'), 3000);
};
G.spawnTailVanMesh = van => {
  if (tailVanMesh) G.scene.remove(tailVanMesh);
  tailVanMesh = makeCarMesh({ name: 'Van', top: 20, accel: 10, color: 0x5a5a6a, len: 5 }, {});
  tailVanMesh.position.set(van.x, 0, van.z);
  G.scene.add(tailVanMesh);
};
G.moveTailVanMesh = van => {
  if (!tailVanMesh) return;
  tailVanMesh.position.set(van.x, 0, van.z);
  tailVanMesh.rotation.y = van.heading;
};

function boot() {
  const container = $('game');
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
  G.camera.position.set(0, 8, 48);
  G.clock = new THREE.Clock();
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  buildIsland();
  createPlayer();
  spawnTraffic();
  spawnRaceCars();
  initSideJobs();
  initGangs();
  initRiots();
  spawnPeds();
  initWeapons();
  initAudio();
  buildInteriors();
  headlight = new THREE.SpotLight(0xffe8b0, 0, 60, 0.5, 0.4, 1.2);
  G.scene.add(headlight);
  G.scene.add(headlight.target);

  wireInput();
  window.__PV = G;
  G.running = false;
  animate();
}

// ---- Interiors: two small rooms placed off-island (hidden), teleported into ----
function buildInteriorRoom(cx, cz, kind, who) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.05, cz);
  g.add(floor);
  const mkWall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    g.add(m);
  };
  mkWall(16, 5, 0.5, cx, 2.5, cz - 6);
  mkWall(16, 5, 0.5, cx, 2.5, cz + 6);
  mkWall(0.5, 5, 12, cx - 8, 2.5, cz);
  mkWall(0.5, 5, 12, cx + 8, 2.5, cz);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2018 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, 5, cz);
  g.add(ceil);
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(6, 1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7 })
  );
  counter.position.set(cx, 0.55, cz - 3.5);
  g.add(counter);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffd76a, emissiveIntensity: 2 })
  );
  lamp.position.set(cx, 4.2, cz);
  g.add(lamp);
  const roomLight = new THREE.PointLight(0xffd9a0, 30, 18, 1.4);
  roomLight.position.set(cx, 4, cz - 1);
  g.add(roomLight);
  const vendor = makeVendorMesh(who);
  vendor.position.set(cx, 0, cz - 4.6);
  g.add(vendor);
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    new THREE.MeshStandardMaterial({ color: 0x7dff9b, emissive: 0x2a8a4a, emissiveIntensity: 0.8 })
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(cx, 0.08, cz + 5);
  g.add(mat);
  G.scene.add(g);
  return { group: g, cx, cz, kind, who, vendor, exitX: cx, exitZ: cz + 5 };
}

function makeVendorMesh(who) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: who === 'rosa' ? 0xb56a3a : 0x4a6a8a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), skin);
  head.position.y = 1.62;
  g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt);
  torso.position.y = 1.08;
  g.add(torso);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a2d3a })
  );
  legs.position.y = 0.35;
  g.add(legs);
  return g;
}

function buildInteriors() {
  G._rooms = {
    faro: buildInteriorRoom(800, 800, 'food', 'rosa'),
    garage: buildInteriorRoom(840, 800, 'repair', 'tomas'),
  };
}

// ---- Input ----
function wireInput() {
  const keyMap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run', Space: 'handbrake',
  };
  window.addEventListener('keydown', e => {
    if (e.code === 'Tab') { e.preventDefault(); toggleMap(); return; }
    if (e.code === 'Space') e.preventDefault();
    if (keyMap[e.code]) G.keys[keyMap[e.code]] = true;
    if (e.repeat) return;
    if (!G.running || G.paused) return;
    switch (e.code) {
      case 'KeyE': contextAction(); break;
      case 'KeyF': punch(); break;
      case 'Digit1': switchWeapon(0); break;
      case 'Digit2': switchWeapon(1); break;
      case 'Digit3': switchWeapon(2); break;
      case 'Digit4': switchWeapon(3); break;
      case 'KeyR': reloadWeapon(); break;
      case 'KeyJ': toggleJobBoard(); break;
      case 'KeyQ': changeStation(); break;
      case 'KeyM': toggleMute(); break;
      case 'KeyH': sfxHorn(); break;
      case 'KeyV': G.camMode = (G.camMode + 1) % 2; break;
      case 'Escape': closeMap(); pauseGame(); break;
    }
  });
  window.addEventListener('keyup', e => {
    if (keyMap[e.code]) G.keys[keyMap[e.code]] = false;
  });
  let dragging = false;
  let lx = 0;
  let ly = 0;
  let moved = 0;
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true;
    lx = e.clientX; ly = e.clientY; moved = 0;
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    camYaw -= dx * 0.005;
    camPitch = clamp(camPitch + dy * 0.003, 0.05, 1.1);
  });
  window.addEventListener('mouseup', () => {
    if (dragging && moved < 6 && G.running && !G.paused) {
      if (fireWeapon()) spawnMuzzleFlash();
    }
    dragging = false;
  });
  $('btnContinue').addEventListener('click', () => { sfxClick(); startGame(true); });
  $('btnNew').addEventListener('click', () => { sfxClick(); clearSave(); startGame(false); });
  $('btnHow').addEventListener('click', () => { $('menu').classList.add('hidden'); $('howto').classList.remove('hidden'); });
  $('btnHowBack').addEventListener('click', () => { $('howto').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  $('btnSettings').addEventListener('click', () => { $('menu').classList.add('hidden'); $('settings').classList.remove('hidden'); });
  $('btnSettingsBack').addEventListener('click', () => { $('settings').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  $('closeMapBtn').addEventListener('click', () => closeMap());
  $('volSlider').addEventListener('input', e => {
    const v = +e.target.value;
    $('volVal').textContent = v;
    setVolume(v / 100);
  });
  if (!hasSave()) $('btnContinue').style.display = 'none';
}

function startGame(continueSave) {
  $('menu').classList.add('hidden');
  $('howto').classList.add('hidden');
  $('settings').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (continueSave) {
    const d = loadGame();
    if (d) applySave(d);
  } else {
    G.cash = 0; G.respect = 0; G.debt = 40000; G.coins = 0; G.coinsGot = {};
    G.chapter = 0; G.day = 1; G.timeOfDay = 18; G.wanted = 0;
    G.player.pos.set(0, 0, 40);
    G.player.heading = 0;
  }
  G.running = true;
  G.paused = false;
  startRadio();
  if (!G.mission && G.chapter < 7) startChapter(G.chapter);
  toast('Welcome to Porto Verde. Follow the gold marker.');
  say('lena', crewLine('lena'));
  updateHUD();
}

function pauseGame() {
  if (!G.running) return;
  G.paused = !G.paused;
  if (G.paused) {
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
  } else {
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }
}

function toggleMap() {
  if (!G.running) return;
  if (G.mapOpen) closeMap();
  else {
    G.mapOpen = true;
    $('fullMap').classList.remove('hidden');
    drawFullMap();
  }
}

function closeMap() {
  G.mapOpen = false;
  $('fullMap').classList.add('hidden');
}

// ---- Muzzle flash (a Sprite, so it reads in a still) ----
function spawnMuzzleFlash() {
  const p = G.player;
  if (!p) return;
  if (flashSprite) {
    G.scene.remove(flashSprite);
    flashSprite = null;
  }
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const cx = cv.getContext('2d');
  const grad = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.4, 'rgba(255,200,80,0.9)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  flashSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  flashSprite.scale.set(3.2, 3.2, 1);
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const oy = p.onFoot ? 1.4 : 1.2;
  flashSprite.position.set(p.pos.x + fx * 1.2, oy, p.pos.z + fz * 1.2);
  G.scene.add(flashSprite);
  flashTimer = 0.5;
}

function updateFlash(dt) {
  if (!flashSprite) return;
  flashTimer -= dt;
  if (flashTimer <= 0) {
    G.scene.remove(flashSprite);
    flashSprite = null;
  }
}

// ---- v3 economy: properties, garage upgrades, respray, ammo, side race ----
function nearestProp(maxD) {
  const p = G.player;
  let best = null;
  let bd = maxD;
  for (const def of (G.propertyDefs || [])) {
    const d = Math.hypot(p.pos.x - def.x, p.pos.z - def.z);
    if (d < bd) { bd = d; best = def; }
  }
  return best;
}

function nearestService(maxD) {
  const p = G.player;
  let best = null;
  let bd = maxD;
  for (const def of (G.serviceDefs || [])) {
    const d = Math.hypot(p.pos.x - def.x, p.pos.z - def.z);
    if (d < bd) { bd = d; best = def; }
  }
  return best;
}

function buyProperty(def) {
  if ((G.properties || []).includes(def.id)) {
    toast(def.name + ' is already yours — it pays $' + def.income + ' a day.');
    return;
  }
  if (G.cash < def.price) {
    toast('Not enough cash — ' + def.name + ' is $' + def.price.toLocaleString() + '.');
    return;
  }
  G.cash -= def.price;
  G.properties.push(def.id);
  toast('You bought ' + def.name + ' for $' + def.price.toLocaleString() + ' — it pays $' + def.income + ' a day.');
  updateHUD();
  saveGame();
}

function buyGarageUp() {
  // Buy the next unowned upgrade in order (tires -> brakes -> chassis).
  const defs = G.garageDefs || [];
  const next = defs.find(d => !(G.garageUpgrades || {})[d.id]);
  if (!next) {
    toast('All garage upgrades installed.');
    return;
  }
  if (G.cash < next.price) {
    toast('Not enough cash — ' + next.name + ' is $' + next.price.toLocaleString() + '.');
    return;
  }
  G.cash -= next.price;
  G.garageUpgrades[next.id] = true;
  // Real driving effect: retune the player's current car (a private copy
  // of its type, so traffic cars are untouched).
  const car = G.player && G.player.car;
  if (car) {
    car.type = {
      ...car.type,
      accel: car.type.accel * next.accelMul,
      top: car.type.top * next.topMul,
    };
  }
  toast('Installed ' + next.name + ' — $' + next.price.toLocaleString() + '. Your car is quicker now.');
  updateHUD();
  saveGame();
}

function doRespray() {
  const car = G.player && G.player.car;
  if (!car) {
    toast('You need to be in a car for a respray.');
    return;
  }
  const price = 150;
  if (G.cash < price) {
    toast('Not enough cash — a respray is $150.');
    return;
  }
  const colors = G.paintColors || [0xff2a7a];
  const cur = car.mesh.userData.bodyMat ? car.mesh.userData.bodyMat.color.getHex() : 0;
  let idx = colors.findIndex(c => c === cur);
  idx = (idx + 1) % colors.length;
  G.cash -= price;
  if (car.mesh.userData.bodyMat) {
    car.mesh.userData.bodyMat.color.setHex(colors[idx]);
  }
  toast('Resprayed — $150. Fresh paint.');
  updateHUD();
  saveGame();
}

function buyAmmo() {
  const price = 30;
  if (G.cash < price) {
    toast('Not enough cash — pistol ammo is $30.');
    return;
  }
  G.cash -= price;
  G.ammo[1].reserve += 12;
  toast('Pistol ammo +12 — $30.');
  updateHUD();
  saveGame();
}

// Street races: three repeatable timed checkpoint runs. Each def has its
// checkpoints, time limit, payout, Respect, and the best-time field on G.
const RACE_DEFS = {
  coast: { name: 'Coastline Sprint', points: [[240, 40], [0, 0], [40, -200], [-200, -40], [0, 260]], timer: 120, pay: 200, respect: 10, bestKey: 'raceBest' },
  harbour: { name: 'Harbour Loop', points: [[300, 120], [360, 40], [280, 80], [240, 40], [160, 120], [240, 160]], timer: 150, pay: 250, respect: 12, bestKey: 'raceBestHarbour' },
  night: { name: 'Night Sprint', points: [[0, 120], [0, -40], [80, -120], [-80, -120], [-120, 40], [0, 120]], timer: 120, pay: 250, respect: 12, bestKey: 'raceBestNight', night: true },
};
function startSideRace(key) {
  if (G.sideRace) {
    toast('Race already running — reach the next checkpoint.');
    return;
  }
  if (!G.player.car) {
    toast('You need a car to race.');
    return;
  }
  const def = RACE_DEFS[key] || RACE_DEFS.coast;
  if (def.night) G.timeOfDay = 22;
  G.sideRace = { def, points: def.points, idx: 0, timer: def.timer, elapsed: 0 };
  toast(def.name + ' — ' + def.points.length + ' checkpoints, ' + def.timer + 's. Go!');
  updateHUD();
}

function updateSideRace(dt) {
  const r = G.sideRace;
  if (!r || !G.player) return;
  const def = r.def;
  r.timer -= dt;
  r.elapsed += dt;
  if (r.timer <= 0) {
    G.sideRace = null;
    toast(def.name + ' failed — out of time.');
    updateHUD();
    return;
  }
  const [tx, tz] = r.points[r.idx];
  const d = Math.hypot(G.player.pos.x - tx, G.player.pos.z - tz);
  if (d < 16) {
    r.idx++;
    if (r.idx >= r.points.length) {
      const t = r.elapsed;
      G.sideRace = null;
      G.cash += def.pay;
      G.respect += def.respect;
      if (G[def.bestKey] === null || t < G[def.bestKey]) G[def.bestKey] = t;
      toast(def.name + ' won! +$' + def.pay + ' · +' + def.respect + ' Respect · Best ' + t.toFixed(1) + 's');
      updateHUD();
      saveGame();
    } else {
      toast('Checkpoint ' + r.idx + '/' + r.points.length + ' — keep going!');
    }
  }
}

// ---- Context action (E): car, talk, interiors, properties, services ----
function nearestCar(maxD) {
  let best = null;
  let bd = maxD;
  for (const c of G.traffic) {
    const d = Math.hypot(c.mesh.position.x - G.player.pos.x, c.mesh.position.z - G.player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function contextAction() {
  if (!G.player || dead) return;
  const p = G.player;
  const px = p.pos.x;
  const pz = p.pos.z;
  // Inside an interior.
  if (interior) {
    const r = interior;
    const dv = Math.hypot(px - r.cx, pz - (r.cz - 4.6));
    const de = Math.hypot(px - r.exitX, pz - r.exitZ);
    if (dv < 4) {
      if (r.kind === 'food') {
        if (G.cash >= 10) {
          G.cash -= 10;
          p.health = Math.min(100, p.health + 25);
          toast('Taco — $10. Health +25.');
          say('rosa', crewLine('rosa'));
        } else toast('Not enough cash — a taco is $10.');
      } else {
        if (G.cash >= 100) {
          G.cash -= 100;
          if (p.car) {
            p.car.condition = 100;
            p.car.mesh.userData.smoke.visible = false;
          }
          toast('Car repaired — $100.');
          say('tomas', crewLine('tomas'));
        } else toast('Not enough cash — a repair is $100.');
      }
      updateHUD();
      return;
    }
    if (de < 3) { leaveInterior(); return; }
    return;
  }
  // Near a property or a service -> use whichever is closer (they can
  // sit near each other in Old Town / the Marina, so distance decides).
  const prop = nearestProp(30);
  const svc = nearestService(30);
  const propD = prop ? Math.hypot(px - prop.x, pz - prop.z) : Infinity;
  const svcD = svc ? Math.hypot(px - svc.x, pz - svc.z) : Infinity;
  if (prop && propD <= svcD) { buyProperty(prop); return; }
  if (svc) {
    if (svc.kind === 'respray') { doRespray(); return; }
    if (svc.kind === 'ammo') { buyAmmo(); return; }
    if (svc.kind === 'race') { startSideRace(svc.race); return; }
    if (svc.kind === 'garage') { buyGarageUp(); return; }
  }
  if (prop) { buyProperty(prop); return; }
  // Near a side-job pickup -> take the job (E accepts it).
  if (acceptNearestSideJob()) return;
  // Near a vendor door -> enter interior.
  for (const v of G.world.vendors) {
    const d = Math.hypot(px - v.x, pz - v.z);
    if (d < 6) { enterInterior(v); return; }
  }
  // Near a pedestrian -> talk.
  for (const ped of G.peds) {
    const d = Math.hypot(ped.mesh.position.x - px, ped.mesh.position.z - pz);
    if (d < 4) { say(ped.name, bark()); return; }
  }
  // In a car -> exit; on foot near a car -> enter/steal.
  if (!p.onFoot && p.car) { exitCar(); return; }
  const car = nearestCar(5);
  if (car) {
    p.car = car;
    p.onFoot = false;
    car.traffic = false;
    p.mesh.visible = false;
    G.traffic = G.traffic.filter(c => c !== car);
    // Apply owned garage upgrades to this car (private type copy).
    const ups = G.garageDefs || [];
    let accelMul = 1;
    let topMul = 1;
    for (const u of ups) {
      if ((G.garageUpgrades || {})[u.id]) {
        accelMul *= u.accelMul;
        topMul *= u.topMul;
      }
    }
    if (accelMul !== 1 || topMul !== 1) {
      car.type = { ...car.type, accel: car.type.accel * accelMul, top: car.type.top * topMul };
    }
    toast('You took the ' + car.type.name + '.');
    if (G.wanted < 1 && Math.random() < 0.4) addWanted(1);
    updateHUD();
  }
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  p.mesh.visible = true;
  p.pos.x = car.mesh.position.x + Math.sin(car.heading + Math.PI / 2) * 3;
  p.pos.z = car.mesh.position.z + Math.cos(car.heading + Math.PI / 2) * 3;
  p.mesh.position.set(p.pos.x, 0, p.pos.z);
  p.heading = car.heading;
  p.car = null;
  p.onFoot = true;
  car.traffic = true;
  G.traffic.push(car);
  updateHUD();
}

function enterInterior(v) {
  const room = v.id === 'faro' ? G._rooms.faro : G._rooms.garage;
  interior = room;
  G.inInterior = v.id;
  $('fade').style.opacity = 1;
  setTimeout(() => {
    G.player.pos.set(room.cx, 0, room.cz + 4);
    G.player.mesh.position.set(room.cx, 0, room.cz + 4);
    G.player.heading = Math.PI;
    $('fade').style.opacity = 0;
    say(v.who, crewLine(v.who));
    setHint(v.kind === 'food' ? 'E: Buy taco ($10, +25 health) · walk to the green mat and press E to leave' : 'E: Repair car ($100) · walk to the green mat and press E to leave');
  }, 450);
}

function leaveInterior() {
  const v = G.world.vendors.find(vv => vv.id === G.inInterior);
  $('fade').style.opacity = 1;
  setTimeout(() => {
    if (v) {
      G.player.pos.set(v.x, 0, v.z + 6);
      G.player.mesh.position.set(v.x, 0, v.z + 6);
    }
    $('fade').style.opacity = 0;
    interior = null;
    G.inInterior = null;
    setHint('');
  }, 450);
}

// ---- Wasted ----
function wasted() {
  if (dead) return;
  dead = true;
  wastedAt = performance.now();
  $('wasted').classList.remove('hidden');
  G.wanted = 0;
  syncPolice();
  setTimeout(() => {
    $('wasted').classList.add('hidden');
    G.cash = Math.max(0, G.cash - 200);
    G.player.health = 100;
    if (G.player.car) {
      G.player.car = null;
      G.player.onFoot = true;
      G.player.mesh.visible = true;
    }
    G.player.pos.set(-120, 0, -180);
    G.player.mesh.position.set(-120, 0, -180);
    dead = false;
    toast('You woke up at the hospital. -$200.');
    updateHUD();
    saveGame();
  }, 2400);
}

// ---- Street events ----
function streetEvent() {
  const ev = pick([
    'A street race is forming at South Beach!',
    'A vendor is giving out free samples at the Plaza.',
    'Police are setting up a checkpoint on the causeway.',
    'A crowd is gathering around a street performer in Old Town.',
    'Someone left a Verde Coin near the Marina…',
    'A taxi pile-up is blocking Downtown — drive around.',
  ]);
  toast('📻 ' + ev, 4200);
  if (ev.includes('Verde Coin')) {
    const coin = G.world.coins.find(c => !c.visible && !G.coinsGot[c.userData.coinIdx]);
    if (coin) {
      coin.position.set(240 + rand(-20, 20), 1.6, 40 + rand(-20, 20));
      coin.visible = true;
    }
  }
}

// ---- Main loop ----
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(G.clock.getDelta(), 0.05);
  const t = G.clock.elapsedTime;
  if (!G.running || G.paused || G.mapOpen || (G.sideJobs && G.sideJobs.boardOpen)) {
    renderer.render(G.scene, G.camera);
    return;
  }
  G.frames = (G.frames || 0) + 1;
  // Day/night: 240s per full day.
  G.timeOfDay += dt * (24 / 240);
  if (G.timeOfDay >= 24) { G.timeOfDay -= 24; G.day++; }
  // Property income: once a day, at dawn.
  if (G.timeOfDay < 6 && G._lastIncomeDay !== G.day) {
    G._lastIncomeDay = G.day;
    let income = 0;
    for (const id of (G.properties || [])) {
      const def = (G.propertyDefs || []).find(d => d.id === id);
      if (def) income += def.income;
    }
    if (income > 0) {
      G.cash += income;
      toast('Property income +$' + income + ' (Marina Loft / Old Town).');
    }
  }
  updateSky();
  animateOcean(t);
  const p = G.player;
  const input = {
    forward: !!G.keys.forward, back: !!G.keys.back,
    left: !!G.keys.left, right: !!G.keys.right,
    handbrake: !!G.keys.handbrake,
  };
  if (!dead) {
    if (p.onFoot) {
      const run = G.keys.run ? 1.8 : 1;
      const sp = 7 * run;
      let mx = 0;
      let mz = 0;
      if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
      if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
      if (input.left) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
      if (input.right) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01) {
        mx /= ml; mz /= ml;
        p.heading = Math.atan2(mx, mz);
        const nx = p.pos.x + mx * sp * dt;
        const nz = p.pos.z + mz * sp * dt;
        if (!collideAt(nx, nz, 0.8)) {
          const [cx, cz] = clampToIsland(nx, nz, 5);
          p.pos.x = cx; p.pos.z = cz;
        }
        p.speed = sp;
        p.walkPhase += dt * 10;
        p.mesh.userData.legL.rotation.x = Math.sin(p.walkPhase) * 0.6;
        p.mesh.userData.legR.rotation.x = -Math.sin(p.walkPhase) * 0.6;
        p.mesh.userData.armL.rotation.x = -Math.sin(p.walkPhase) * 0.5;
        p.mesh.userData.armR.rotation.x = Math.sin(p.walkPhase) * 0.5;
      } else {
        p.speed = 0;
        p.mesh.userData.legL.rotation.x *= 0.85;
        p.mesh.userData.legR.rotation.x *= 0.85;
      }
      p.mesh.position.set(p.pos.x, 0, p.pos.z);
      p.mesh.rotation.y = p.heading;
    } else if (p.car) {
      driveCar(p.car, dt, input);
      p.pos.x = p.car.mesh.position.x;
      p.pos.z = p.car.mesh.position.z;
      p.heading = p.car.heading;
      engineSound(p.car.speed, p.car.type.top);
      if (p.car.condition <= 0) {
        p.car.condition = 0;
        sfxCrash();
        p.car.speed = 0;
      }
    }
  }
  // Camera: third-person chase. Yaw follows the heading (eased).
  const isCar = !p.onFoot && p.car;
  const targetHeading = p.heading;
  let dh = targetHeading - camYaw;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const alpha = isCar ? 1 - Math.pow(0.9, 60 * dt) : 1 - Math.pow(0.95, 60 * dt);
  camYaw += dh * alpha;
  const camTarget = p.onFoot ? p.pos : (p.car ? p.car.mesh.position : p.pos);
  const inRoom = !!interior;
  const dist = inRoom ? 4.0 : (isCar ? (G.camMode === 0 ? 6.0 : 4.0) : 7.0);
  const camH = 3.0;
  const lookH = inRoom ? 1.5 : 1.4;
  let cx = camTarget.x - Math.sin(camYaw) * dist;
  let cz = camTarget.z - Math.cos(camYaw) * dist;
  let cy = camH;
  if (inRoom && G._rooms) {
    const room = interior;
    cx = clamp(cx, room.cx - 8 + 0.4, room.cx + 8 - 0.4);
    cz = clamp(cz, room.cz - 6 + 0.4, room.cz + 6 - 0.4);
  }
  // Screenshot staging: a fixed photo camera overrides the chase cam.
  if (G.photoCam) {
    G.camera.position.set(G.photoCam.pos[0], G.photoCam.pos[1], G.photoCam.pos[2]);
    G.camera.lookAt(G.photoCam.look[0], G.photoCam.look[1], G.photoCam.look[2]);
  } else {
    G.camera.position.set(
      lerp(G.camera.position.x, cx, 0.18),
      lerp(G.camera.position.y, cy, 0.18),
      lerp(G.camera.position.z, cz, 0.18)
    );
    if (G.camera.position.distanceTo(new THREE.Vector3(cx, cy, cz)) > 30) {
      G.camera.position.set(cx, cy, cz);
    }
    G.camera.lookAt(camTarget.x, lookH, camTarget.z);
  }
  // Speed FOV kick (base 55, up to 63).
  const spd = p.car ? Math.abs(p.car.speed) : p.speed;
  const targetFov = 55 + clamp(spd / 38, 0, 1) * 8;
  if (Math.abs(G.camera.fov - targetFov) > 0.2) {
    G.camera.fov = lerp(G.camera.fov, targetFov, 0.08);
    G.camera.updateProjectionMatrix();
  }
  // Headlight at night.
  const night = G.timeOfDay >= 20 || G.timeOfDay < 6;
  if (headlight) {
    headlight.intensity = night ? 2.2 : 0;
    headlight.position.set(camTarget.x, 2, camTarget.z);
    headlight.target.position.set(camTarget.x + Math.sin(p.heading) * 20, 0, camTarget.z + Math.cos(p.heading) * 20);
  }
  // Coins.
  for (const coin of G.world.coins) {
    if (!coin.visible || G.coinsGot[coin.userData.coinIdx]) continue;
    coin.rotation.y += dt * 2;
    coin.position.y = 1.6 + Math.sin(t * 2 + coin.userData.coinIdx) * 0.3;
    if (Math.hypot(p.pos.x - coin.position.x, p.pos.z - coin.position.z) < 3) {
      coin.visible = false;
      G.coinsGot[coin.userData.coinIdx] = true;
      G.coins++;
      G.cash += 25;
      G.respect += 5;
      sfxCoin();
      toast('Verde Coin! ' + G.coins + '/' + G.coinsTotal + ' · +$25');
      updateHUD();
      saveGame();
    }
  }
  // Street events.
  G.eventTimer -= dt;
  if (G.eventTimer <= 0) {
    G.eventTimer = rand(45, 75);
    streetEvent();
  }
  // Police contact damage.
  if (policeTouchingPlayer() && !dead) {
    p.health -= 18 * dt;
    if (p.health <= 0) {
      p.health = 0;
      wasted();
    }
  }
  sfxSiren(G.wanted > 0);
  // Systems.
  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateMissions(dt);
  updateTracers(dt);
  updateSideRace(dt);
  updateSideJobs(dt, t);
  updateGangs(dt, t);
  updateRiot(dt, t);
  // A gang hit can drop the player to 0 health — main.js owns wasted.
  if (G.player.health <= 0 && !dead) {
    G.player.health = 0;
    wasted();
  }
  updateFlash(dt);
  // Context hint.
  if (!interior) {
    let hint = '';
    if (!p.onFoot) {
      hint = 'E: Exit car · Space: Handbrake · V: Camera · H: Horn';
    } else {
      const car = nearestCar(5);
      const nearVendor = G.world.vendors.some(v => Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < 6);
      const nearProp = nearestProp(30);
      const nearSvc = nearestService(30);
      const nearJob = nearestSideJob(6);
      if (nearProp) hint = 'E: Buy ' + nearProp.name + ' ($' + nearProp.price.toLocaleString() + ')';
      else if (nearSvc) hint = 'E: ' + nearSvc.name;
      else if (nearJob) hint = 'E: Accept ' + nearJob.label + ' ($' + nearJob.reward + ') · J: Job board';
      else if (nearVendor) hint = 'E: Enter ' + (G.world.vendors.find(v => Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < 6) || {}).name;
      else if (car) hint = 'E: Enter ' + car.type.name + ' · F: Punch · 1-4: Weapons';
      else hint = 'WASD: Move · E: Interact · Tab: Island map';
    }
    setHint(hint);
  }
  // Autosave.
  if (t - lastSave > 20) {
    lastSave = t;
    saveGame();
  }
  updateHUD();
  renderer.render(G.scene, G.camera);
}

boot();
