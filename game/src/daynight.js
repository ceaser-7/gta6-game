// Porto Verde — day and night: a 240 s cycle opening at golden-hour sunset,
// sun/fog/sky keyframes, lamp glow, and a real headlight at night.
import * as THREE from 'three';
import { G, lerp, clamp } from './util.js';

let headlight = null;
let headTarget = null;

export function buildLights() {
  G.hemi = new THREE.HemisphereLight(0xbfd4e6, 0x4a4238, 0.9);
  G.scene.add(G.hemi);
  G.sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  G.sun.position.set(200, 180, 100);
  G.sun.castShadow = true;
  G.sun.shadow.mapSize.set(1024, 1024);
  G.sun.shadow.camera.left = -500; G.sun.shadow.camera.right = 500;
  G.sun.shadow.camera.top = 500; G.sun.shadow.camera.bottom = -500;
  G.scene.add(G.sun);
  G.scene.add(G.sun.target);
  headlight = new THREE.SpotLight(0xffe9b0, 0, 60, 0.5, 0.4, 1.2);
  headTarget = new THREE.Object3D();
  G.scene.add(headTarget);
  headlight.target = headTarget;
  G.scene.add(headlight);
  G.headlight = headlight;
}

export function updateDayNight(dt) {
  G.dayT = (G.dayT + dt / G.dayLen) % 1;
  const t = G.dayT;
  // elevation: 1 at noon (0.25), 0 at sunset (0.5), -1 at midnight (0.75).
  const elev = Math.sin(t * Math.PI * 2);
  const sunA = t * Math.PI * 2;
  const sx = Math.cos(sunA) * 400, sy = elev * 350, sz = 150;
  G.sun.position.set(sx, Math.max(20, sy), sz);
  const day = clamp(elev * 2 + 0.35, 0.06, 1);
  const golden = clamp(1 - Math.abs(elev) * 3, 0, 1);
  const sunCol = new THREE.Color(0xfff2d0).lerp(new THREE.Color(0xff9a4a), golden * 0.8);
  G.sun.color.copy(sunCol);
  G.sun.intensity = 0.25 + day * 1.5;
  G.hemi.intensity = 0.25 + day * 0.7;
  // Sky + fog: day blue, sunset orange, night dark.
  const skyDay = new THREE.Color(0x87b5d6);
  const skySet = new THREE.Color(0xe88a4a);
  const skyNight = new THREE.Color(0x0e1420);
  const sky = skyDay.clone().lerp(skySet, golden * 0.9).lerp(skyNight, clamp(1 - day, 0, 1));
  G.scene.background = sky;
  G.scene.fog = new THREE.Fog(sky.getHex(), 300, 900);
  if (G.lampMat) G.lampMat.emissiveIntensity = clamp(1 - day, 0, 1) * 1.2 + 0.15;
  // Headlight at night, aimed ahead of the player (or their car).
  const night = elev < 0.08;
  const anchor = G.playerCar || G.player;
  if (anchor && night) {
    headlight.intensity = 60;
    const fwd = G.playerCar
      ? { x: Math.sin(G.playerCar.rotation.y), z: Math.cos(G.playerCar.rotation.y) }
      : { x: Math.sin(G.yaw), z: Math.cos(G.yaw) };
    headlight.position.set(anchor.position.x, 2, anchor.position.z);
    headTarget.position.set(anchor.position.x + fwd.x * 20, 0.5, anchor.position.z + fwd.z * 20);
  } else {
    headlight.intensity = 0;
  }
}
