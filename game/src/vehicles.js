// Cars: their look, their arcade driving, and getting in and out of them.
// One clear job: build car meshes, drive the player's car, and handle stealing.
import * as THREE from 'three';
import { collideCircle } from './city.js';

// Muted, desaturated paint: v3's bright primaries read as toy cars.
const CAR_COLORS = [0x9e3b2e, 0x33567a, 0xb08d2e, 0xb0b0b0, 0x3f444a, 0x3f6b46, 0x5f4a6e, 0x2e6b66];

// Car body styles: same skeleton, different proportions and pace.
const CAR_TYPES = {
  sedan:  { bodyH: 0.55, bodyY: 0.62, bodyLen: 4.2, cabinH: 0.5, cabinY: 1.12, cabinLen: 2.0, wheelR: 0.36, maxSpeed: 30, accel: 16 },
  sports: { bodyH: 0.45, bodyY: 0.52, bodyLen: 4.6, cabinH: 0.42, cabinY: 1.0, cabinLen: 1.8, wheelR: 0.36, maxSpeed: 34, accel: 21, spoiler: true },
  suv:    { bodyH: 0.75, bodyY: 0.72, bodyLen: 4.4, cabinH: 0.7, cabinY: 1.38, cabinLen: 2.4, wheelR: 0.42, maxSpeed: 27, accel: 14 },
  van:    { bodyH: 1.3, bodyY: 0.95, bodyLen: 4.4, cabinH: 0, cabinY: 0, cabinLen: 0, wheelR: 0.4, maxSpeed: 24, accel: 12 },
  taxi:   { bodyH: 0.55, bodyY: 0.62, bodyLen: 4.2, cabinH: 0.5, cabinY: 1.12, cabinLen: 2.0, wheelR: 0.36, maxSpeed: 29, accel: 16, taxi: true },
};

// Car detail pass — from GPT-6.1 Sol (small fixed-design call, 2026-11-17, v4):
// side glass, sloped hood/deck, grille, skirts and door seams on the box body.
function addCarDetails(g, t, bodyMat, glassMat, darkMat) {
  const addBox = (w, h, d, mat, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = false;
    g.add(mesh);
  };
  const deckY = t.bodyY + t.bodyH / 2 + 0.02;
  if (t.cabinH !== 0) {
    for (const x of [-0.86, 0.86]) {
      addBox(0.04, t.cabinH * 0.7, t.cabinLen * 0.8, glassMat, x, t.cabinY, -0.25);
    }
    addBox(1.9, 0.1, 0.9, bodyMat, 0, deckY, t.bodyLen / 2 - 0.55, -0.12);
  }
  addBox(1.9, 0.1, 0.9, bodyMat, 0, deckY, -t.bodyLen / 2 + 0.55, 0.10);
  addBox(1.2, 0.16, 0.06, darkMat, 0, t.bodyY, t.bodyLen / 2 + 0.03);
  for (const side of [-1, 1]) {
    addBox(0.08, 0.12, t.bodyLen * 0.7, darkMat, side, 0.32, 0);
    addBox(0.02, t.bodyH * 0.8, 0.02, darkMat, side * 1.01, t.bodyY, 0.3);
  }
}

export function makeCarMesh(color, isPolice, type = 'sedan') {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  // car paint: Phong with a specular sheen so the body reads as metal, not plastic
  const bodyMat = new THREE.MeshPhongMaterial({ color: isPolice ? 0x14161a : (t.taxi ? 0xc99a26 : color), shininess: 60, specular: 0x555555 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x141e28, shininess: 90, specular: 0x888888 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, t.bodyH, t.bodyLen), bodyMat);
  body.position.y = t.bodyY; body.castShadow = true; g.add(body);
  addCarDetails(g, t, bodyMat, glassMat, darkMat);
  if (t.cabinH > 0) {
    // v4: painted cabin so the dark side-glass panels read as windows (v3's
    // all-glass cabin was one dark box); windshield + rear window in glass.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, t.cabinH, t.cabinLen), bodyMat);
    cabin.position.set(0, t.cabinY, -0.25); cabin.castShadow = true; g.add(cabin);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.5, t.cabinH * 0.75, 0.06), glassMat);
    shield.position.set(0, t.cabinY, -0.25 + t.cabinLen / 2 + 0.01); shield.rotation.x = -0.18; g.add(shield);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.5, t.cabinH * 0.75, 0.06), glassMat);
    rear.position.set(0, t.cabinY, -0.25 - t.cabinLen / 2 - 0.01); rear.rotation.x = 0.18; g.add(rear);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, t.cabinLen - 0.4), bodyMat);
    roof.position.set(0, t.cabinY + t.cabinH / 2 + 0.02, -0.25); g.add(roof);
  } else {
    // van: a windshield band and a sliding-door panel
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.1), glassMat);
    shield.position.set(0, 1.35, t.bodyLen / 2 - 0.15); g.add(shield);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 1.4), darkMat);
    door.position.set(1.01, 0.95, 0.2); g.add(door);
  }
  // bumpers, mirrors
  for (const z of [t.bodyLen / 2, -t.bodyLen / 2]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 0.3), darkMat);
    bumper.position.set(0, 0.42, z); g.add(bumper);
  }
  for (const s of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), darkMat);
    mirror.position.set(s * 1.02, 1.05, 0.75); g.add(mirror);
  }
  if (t.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe98a, emissiveIntensity: 0.5 }));
    sign.position.set(0, t.cabinY + t.cabinH / 2 + 0.14, -0.25); g.add(sign);
  }
  if (isPolice) {
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 2.2), doorMat);
      door.position.set(s * 1.01, 0.62, 0.1); g.add(door);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.45, -0.25); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    red.position.set(-0.32, 1.52, -0.25); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 }));
    blue.position.set(0.32, 1.52, -0.25); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  const wheelGeo = new THREE.CylinderGeometry(t.wheelR, t.wheelR, 0.26, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const hubGeo = new THREE.CircleGeometry(0.2, 10);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bec6 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, t.wheelR, wz);
    g.add(w); wheels.push(w);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.y = wx < 0 ? -Math.PI / 2 : Math.PI / 2;
    hub.position.set(wx + (wx < 0 ? -0.14 : 0.14), t.wheelR, wz);
    g.add(hub);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe98a, emissiveIntensity: 0.7 });
  const tailMatL = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x881111, emissiveIntensity: 0.6 });
  const tailMatR = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x881111, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), headMat);
    h.position.set(s * 0.62, 0.62, t.bodyLen / 2 + 0.02); g.add(h);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), s < 0 ? tailMatL : tailMatR);
    tl.position.set(s * 0.62, 0.62, -t.bodyLen / 2 - 0.02); g.add(tl);
  }
  g.userData.brakeL = tailMatL; g.userData.brakeR = tailMatR;
  // rear spoiler on sports cars (and the orange mission GT)
  if (t.spoiler || color === 0xe86a10) {
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), darkMat);
      strut.position.set(s * 0.6, 1.05, -1.95); g.add(strut);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.4), darkMat);
    wing.position.set(0, 1.18, -1.95); g.add(wing);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 1.9, 1); shadow.position.y = 0.02;
  g.add(shadow);
  g.userData.wheels = wheels;
  return g;
}

export function createCar(G, x, z, angle, color, opts = {}) {
  const type = opts.type || 'sedan';
  const tc = CAR_TYPES[type] || CAR_TYPES.sedan;
  const group = makeCarMesh(color, !!opts.isPolice, type);
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  G.scene.add(group);
  const car = {
    group, pos: group.position, angle, speed: 0, steer: 0,
    color, type, isPolice: !!opts.isPolice, isTraffic: !!opts.isTraffic,
    driver: opts.driver || null, health: 100, missionCar: !!opts.missionCar,
    maxSpeed: opts.maxSpeed || tc.maxSpeed, accel: opts.accel || tc.accel,
    targetSpeed: 0, stuck: 0, smokeTimer: 0,
  };
  G.cars.push(car);
  return car;
}

export function setBrakeLights(car, braking) {
  const u = car.group.userData;
  if (!u.brakeL || !u.brakeR) return;
  u.brakeL.emissiveIntensity = braking ? 2.4 : 0.6;
  u.brakeR.emissiveIntensity = braking ? 2.4 : 0.6;
}

// Skid marks: a reusable pool of fading dark quads dropped by the rear wheels.
export function createSkids(G) {
  G.skids = [];
  G.skidTimer = 0;
  G.skidIndex = 0;
  const geo = new THREE.PlaneGeometry(0.55, 1.3);
  for (let i = 0; i < 60; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.position.y = 0.03;
    G.scene.add(mesh);
    G.skids.push({ mesh, life: 0 });
  }
}

export function updateSkids(G, dt) {
  const car = G.player.car;
  if (!car) return;
  const handbraking = G.input.keys.has('Space') && Math.abs(car.speed) > 8;
  if (handbraking) {
    G.skidTimer += dt;
    if (G.skidTimer >= 0.06) {
      G.skidTimer = 0;
      const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
      const rx = Math.cos(car.angle), rz = -Math.sin(car.angle);
      for (const s of [-1, 1]) {
        const slot = G.skids[G.skidIndex];
        G.skidIndex = (G.skidIndex + 1) % G.skids.length;
        slot.mesh.position.set(
          car.pos.x + rx * s * 0.95 - fx * 1.35,
          0.03,
          car.pos.z + rz * s * 0.95 - fz * 1.35,
        );
        slot.mesh.rotation.z = car.angle;
        slot.life = 6;
        slot.mesh.visible = true;
        slot.mesh.material.opacity = 0.55;
      }
    }
  }
  for (const slot of G.skids) {
    if (slot.life <= 0) continue;
    slot.life -= dt;
    if (slot.life <= 0) { slot.mesh.visible = false; slot.mesh.material.opacity = 0; }
    else slot.mesh.material.opacity = 0.55 * (slot.life / 6);
  }
}

// Damage smoke: grey puffs from the engine of a hurt car.
export function createSmoke(G) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(120,120,120,0.85)');
  grad.addColorStop(1, 'rgba(120,120,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  G.smoke = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    s.scale.set(1, 1, 1);
    G.scene.add(s);
    G.smoke.push({ sprite: s, life: 0 });
  }
  G.smokeIndex = 0;
}

function emitSmoke(G, car) {
  if (!G.smoke) return;
  const slot = G.smoke[G.smokeIndex];
  G.smokeIndex = (G.smokeIndex + 1) % G.smoke.length;
  const f = carForward(car);
  slot.sprite.position.set(car.pos.x + f.x * 1.6, 1.2, car.pos.z + f.z * 1.6);
  slot.sprite.scale.set(1.2, 1.2, 1);
  slot.sprite.material.opacity = 0.7;
  slot.sprite.visible = true;
  slot.life = 1.1;
}

export function updateSmoke(G, dt) {
  if (!G.smoke) return;
  for (const slot of G.smoke) {
    if (slot.life <= 0) continue;
    slot.life -= dt;
    slot.sprite.position.y += dt * 1.6;
    const s = 1.2 + (1.1 - slot.life) * 1.4;
    slot.sprite.scale.set(s, s, 1);
    slot.sprite.material.opacity = Math.max(0, slot.life / 1.1) * 0.7;
    if (slot.life <= 0) slot.sprite.visible = false;
  }
}

export function carForward(car) {
  return { x: Math.sin(car.angle), z: Math.cos(car.angle) };
}

export function nearestCar(G, x, z, maxDist) {
  let best = null, bd = maxDist;
  for (const c of G.cars) {
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function updatePlayerCar(G, dt) {
  const car = G.player.car;
  if (!car) return;
  const k = G.input.keys;
  const fwd = k.has('KeyW') || k.has('ArrowUp');
  const back = k.has('KeyS') || k.has('ArrowDown');
  const left = k.has('KeyA') || k.has('ArrowLeft');
  const right = k.has('KeyD') || k.has('ArrowRight');
  const brake = k.has('Space');
  if (fwd) car.speed += car.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? 30 : 12) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  if (brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.steer = (left ? 1 : 0) + (right ? -1 : 0);
    car.angle += car.steer * 1.9 * dt * Math.sign(car.speed || 1);
  } else {
    const steerTarget = (left ? 1 : 0) + (right ? -1 : 0);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    const grip = Math.min(1, Math.abs(car.speed) / 8);
    car.angle += car.steer * 1.15 * grip * dt * Math.sign(car.speed || 1);
  }
  car.speed = Math.max(-9, Math.min(car.maxSpeed, car.speed));
  stepCar(G, car, dt, true);
  // v3 BUG FIX (critique #1): the player's world position froze at the spot where
  // they entered the car, so missions, the HUD distance, police and the shadow camera
  // all measured from a stale point while driving. Keep p.pos on the car.
  G.player.pos.set(car.pos.x, 0, car.pos.z);
  // brake lights: handbrake, or reversing while moving forward
  const braking = k.has('Space') || (back && car.speed > 0.5);
  setBrakeLights(car, braking);
  // camera yaw follows the car gently when driving
  let d = car.angle - G.camYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(car.speed) > 4) G.camYaw += d * Math.min(1, dt * 1.4);
  // engine note
  G.audio.engine(Math.abs(car.speed) / car.maxSpeed);
}

export function stepCar(G, car, dt, isPlayer) {
  const before = car.speed;
  const f = carForward(car);
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  const px = car.pos.x, pz = car.pos.z;
  collideCircle(G.city, car.pos, 1.7);
  if ((car.pos.x !== px || car.pos.z !== pz) && Math.abs(before) > 6) {
    car.speed *= 0.45;
    car.health -= 2;
    if (isPlayer) { G.audio.thud(); G.hud.flash(); }
  }
  // car vs car: simple circle push
  for (const o of G.cars) {
    if (o === car) continue;
    const dx = car.pos.x - o.pos.x, dz = car.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const nx = dx / d, nz = dz / d;
      car.pos.x += nx * push; car.pos.z += nz * push;
      o.pos.x -= nx * push; o.pos.z -= nz * push;
      const rel = Math.abs(car.speed - o.speed);
      if (rel > 8 && isPlayer) { o.health -= 6; G.audio.thud(); }
      car.speed *= 0.92;
    }
  }
  car.group.rotation.y = car.angle;
  // a hurt car smokes from the engine
  if (car.health < 40 && car.health > 0) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) { car.smokeTimer = 0.14; emitSmoke(G, car); }
  }
  // wheels spin + front wheels steer
  const spin = car.speed * dt * 1.6;
  const wheels = car.group.userData.wheels;
  for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x += spin;
    if (i < 2) wheels[i].rotation.y = car.steer * 0.4;
  }
}

export function tryEnterCar(G) {
  const p = G.player;
  const car = nearestCar(G, p.pos.x, p.pos.z, 3.6);
  if (!car) { G.hud.toast('No car close enough'); return; }
  if (car.isPolice && G.wanted < 2) G.addWanted(2, 'Stole a police cruiser!');
  if (car.isTraffic && car.driver === 'traffic') {
    car.driver = null;
    G.spawnFleeingPed(car.pos.x + 1.5, car.pos.z + 1.5);
    G.addWanted(1, 'Car stolen — the owner called it in!');
  }
  p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
  p.group.visible = false;
  G.audio.door();
  G.hud.toast(car.missionCar ? 'This is the one. Drive!' : 'In the car. Drive!');
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const side = Math.cos(car.angle) * 2.4;
  const sideZ = -Math.sin(car.angle) * 2.4;
  p.pos.set(car.pos.x + side, 0, car.pos.z + sideZ);
  collideCircle(G.city, p.pos, 0.6);
  p.car = null; p.onFoot = true; p.yaw = car.angle;
  car.driver = null; car.speed = Math.min(car.speed, 2);
  p.group.visible = true;
  p.group.position.copy(p.pos);
  G.audio.door();
}

export function randomTrafficColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}
