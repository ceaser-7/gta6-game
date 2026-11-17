// Mara Voss on foot: her body, her walk, and the third-person camera.
// One clear job: move the player when she is on foot, and keep the camera behind her.
import * as THREE from 'three';
import { collideCircle } from './city.js';

const SKIN = 0xc98d64, JACKET = 0x1f6f6b, PANTS = 0x2c3242, HAIR = 0x20140e;

export function createPlayer(scene) {
  // Mara Voss, rebuilt for v4: realistic proportions, round head, shoes, hands,
  // a collar and a pistol in her right hand. Built to the fixed design Sol was
  // given (sol-player-prompt.txt) — Sol returned zero text on it, so it is built
  // here by hand. Total height ~1.76, not a box figure.
  const group = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(SKIN), jacket = mat(JACKET), pants = mat(PANTS), hair = mat(HAIR);
  const shoeMat = mat(0x1a1a1a), gunMat = mat(0x14161a);

  const legGeo = new THREE.BoxGeometry(0.2, 0.85, 0.22);
  legGeo.translate(0, -0.425, 0); // pivot at the hip
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.13, 0.85, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.13, 0.85, 0);
  const shoeGeo = new THREE.BoxGeometry(0.22, 0.1, 0.34);
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.82, 0.06);
    leg.add(shoe);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.55, 0.3), jacket);
  torso.position.y = 1.15;
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.32), jacket);
  collar.position.y = 1.44;
  const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.17);
  armGeo.translate(0, -0.3, 0); // pivot at the shoulder
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.36, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.36, 1.38, 0);
  const handGeo = new THREE.BoxGeometry(0.13, 0.12, 0.15);
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(handGeo, skin);
    hand.position.set(0, -0.6, 0);
    arm.add(hand);
  }
  // her pistol, in the right hand
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.28), gunMat);
  gun.position.set(0, -0.62, 0.1);
  armR.add(gun);
  // round head, not a box: skin sphere + hair cap + ponytail
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), skin);
  head.scale.y = 1.15;
  head.position.y = 1.6;
  const hairM = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairM.position.y = 1.62;
  const ponytail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), hair);
  ponytail.position.set(0, 1.45, -0.18);
  for (const m of [legL, legR, torso, collar, armL, armR, head, hairM, ponytail]) m.castShadow = true;
  group.add(legL, legR, torso, collar, armL, armR, head, hairM, ponytail);

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
  // v4: closer cameras — Mara and the cars read bigger on screen (v3: 7.5/11)
  const dist = G.player.onFoot ? 6.5 : 10;
  const height = G.player.onFoot ? 2.8 : 4.0;
  // smooth the orbit target toward the player
  if (!G.camTarget) G.camTarget = new THREE.Vector3().copy(target);
  G.camTarget.lerp(new THREE.Vector3(target.x, target.y + 1.2, target.z), Math.min(1, dt * 8));
  const cx = G.camTarget.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = G.camTarget.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = G.camTarget.y + height * 0.5 + Math.sin(G.camPitch) * dist;
  cam.position.set(cx, cy, cz);
  cam.lookAt(G.camTarget.x, G.camTarget.y + 0.4, G.camTarget.z);
}
