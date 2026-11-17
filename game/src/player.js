// Mara Voss on foot: her body, her walk, and the third-person camera.
// One clear job: move the player when she is on foot, and keep the camera behind her.
import * as THREE from 'three';
import { collideCircle } from './city.js';

const SKIN = 0xc98d64, JACKET = 0x1f6f6b, PANTS = 0x2c3242, HAIR = 0x20140e;

export function createPlayer(scene) {
  const group = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(SKIN), jacket = mat(JACKET), pants = mat(PANTS), hair = mat(HAIR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), pants);
  legL.position.set(-0.14, 0.28, 0); legL.geometry.translate(0, -0.27, 0);
  const legR = legL.clone(); legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.32), jacket);
  torso.position.y = 0.86;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), jacket);
  armL.position.set(-0.38, 1.05, 0); armL.geometry.translate(0, -0.27, 0);
  const armR = armL.clone(); armR.position.x = 0.38;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
  head.position.y = 1.36;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.36), hair);
  hairM.position.y = 1.56;
  const ponytail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), hair);
  ponytail.position.set(0, 1.42, -0.22);
  group.add(legL, legR, torso, armL, armR, head, hairM, ponytail);

  // soft blob shadow so she reads on the ground
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  group.add(shadow);

  group.position.set(-40, 0, 30);
  scene.add(group);
  return {
    group, legL, legR, armL, armR,
    pos: group.position, yaw: 0, speed: 0, walkPhase: 0,
    onFoot: true, car: null, health: 100, lastHurt: -99,
  };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const k = G.input.keys;
  let fx = 0, fz = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
  const run = k.has('ShiftLeft') || k.has('ShiftRight');
  const target = run ? 10.5 : 6;
  if (fx !== 0 || fz !== 0) {
    // camera-relative: forward is where the camera looks on the ground plane
    // (camera look direction is (sin yaw, cos yaw); right is (-cos yaw, sin yaw))
    const cy = G.camYaw;
    const sx = Math.sin(cy), cz = Math.cos(cy);
    const mx = sx * -fz + (-cz) * fx;
    const mz = cz * -fz + sx * fx;
    const len = Math.hypot(mx, mz) || 1;
    p.speed = target;
    p.pos.x += (mx / len) * target * dt;
    p.pos.z += (mz / len) * target * dt;
    const wantYaw = Math.atan2(mx / len, mz / len);
    let d = wantYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * Math.min(1, dt * 12);
    p.walkPhase += dt * target * 1.6;
  } else {
    p.speed = 0;
    p.walkPhase += dt * 2;
  }
  collideCircle(G.city, p.pos, 0.6);
  const swing = p.speed > 0 ? Math.sin(p.walkPhase) * 0.55 : 0;
  p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.8; p.armR.rotation.x = swing * 0.8;
  p.group.rotation.y = p.yaw;
  // slow health regen out of trouble
  if (G.time - p.lastHurt > 8 && p.health < 100) p.health = Math.min(100, p.health + 6 * dt);
}

export function updateCamera(G, dt) {
  const cam = G.camera;
  const target = G.player.onFoot ? G.player.pos : (G.player.car ? G.player.car.pos : G.player.pos);
  const dist = G.player.onFoot ? 7.5 : 11;
  const height = G.player.onFoot ? 3.2 : 4.5;
  // smooth the orbit target toward the player
  if (!G.camTarget) G.camTarget = new THREE.Vector3().copy(target);
  G.camTarget.lerp(new THREE.Vector3(target.x, target.y + 1.2, target.z), Math.min(1, dt * 8));
  const cx = G.camTarget.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = G.camTarget.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = G.camTarget.y + height * 0.5 + Math.sin(G.camPitch) * dist;
  cam.position.set(cx, cy, cz);
  cam.lookAt(G.camTarget.x, G.camTarget.y + 0.4, G.camTarget.z);
}
