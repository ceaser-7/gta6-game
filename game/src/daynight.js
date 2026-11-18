// Porto Verde — day/night: a 240s cycle that opens at golden-hour sunset.
// Sun, sky, fog and lamps are keyframed; a real headlight keeps the streets
// readable at night. Day is dayT < 120 (the peds' routines use the same split).
import * as THREE from 'three';
import { G, CFG, clamp, lerp } from './state.js';

let sunLight, skyTop;
const DAY_SKY = new THREE.Color(0x87b5d6);
const SUNSET_SKY = new THREE.Color(0xff9a5c);
const NIGHT_SKY = new THREE.Color(0x141a2a);
const DAY_FOG = new THREE.Color(0xa8c4d6);
const SUNSET_FOG = new THREE.Color(0xe8a06a);
const NIGHT_FOG = new THREE.Color(0x0e1420);
const tmpColor = new THREE.Color();

export function initDayNight() {
  sunLight = new THREE.DirectionalLight(0xffe0b0, 1.6);
  if (!G.lowMode) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
  }
  sunLight.shadow.camera.left = -260; sunLight.shadow.camera.right = 260;
  sunLight.shadow.camera.top = 260; sunLight.shadow.camera.bottom = -260;
  sunLight.shadow.camera.far = 900;
  G.scene.add(sunLight);
  G.sun = sunLight;
  const hemi = new THREE.HemisphereLight(0xbfd4e6, 0x5a4a3a, 0.9);
  G.scene.add(hemi);
  G.hemi = hemi;
  G.scene.fog = new THREE.Fog(0xe8a06a, 120, 700);
  G.scene.background = new THREE.Color(0xff9a5c);
  // headlight: a spotlight that follows the player's car
  const head = new THREE.SpotLight(0xfff2c0, 0, 60, 0.55, 0.5, 1.2);
  G.scene.add(head); G.scene.add(head.target);
  G.headlight = head;
}

export function updateDayNight(dt) {
  G.dayT = (G.dayT + dt) % CFG.DAY_LEN;
  const u = G.dayT / CFG.DAY_LEN;
  // sun elevation: high at midday (dayT 60), 0 at sunset (120) and dawn (0/240), low at night
  const elev = 70 * Math.sin(u * Math.PI * 2);
  const azim = (u * Math.PI * 2) + Math.PI / 2;
  const sunDir = new THREE.Vector3(
    Math.cos(azim) * Math.cos(elev * Math.PI / 180),
    Math.sin(elev * Math.PI / 180),
    Math.sin(azim) * Math.cos(elev * Math.PI / 180));
  sunLight.position.copy(sunDir).multiplyScalar(400);
  sunLight.target.position.set(0, 0, 0);
  // sky + fog: day -> sunset -> night by elevation
  if (elev > 12) {
    tmpColor.copy(DAY_SKY); G.scene.background.copy(tmpColor);
    G.scene.fog.color.copy(DAY_FOG);
    sunLight.intensity = 1.6; sunLight.color.setHex(0xfff2d8);
    G.hemi.intensity = 0.9;
  } else if (elev > -2) {
    const t = clamp((12 - elev) / 14, 0, 1); // 0 day, 1 sunset
    tmpColor.copy(DAY_SKY).lerp(SUNSET_SKY, t); G.scene.background.copy(tmpColor);
    G.scene.fog.color.copy(DAY_FOG).lerp(SUNSET_FOG, t);
    sunLight.intensity = lerp(1.6, 1.1, t); sunLight.color.setHex(0xffb070);
    G.hemi.intensity = lerp(0.9, 0.55, t);
  } else {
    const t = clamp((-2 - elev) / 20, 0, 1); // 0 dusk, 1 deep night
    tmpColor.copy(SUNSET_SKY).lerp(NIGHT_SKY, t); G.scene.background.copy(tmpColor);
    G.scene.fog.color.copy(SUNSET_FOG).lerp(NIGHT_FOG, t);
    sunLight.intensity = lerp(0.5, 0.12, t); sunLight.color.setHex(0x8aa0c0);
    G.hemi.intensity = lerp(0.55, 0.25, t);
  }
  // lamp heads glow at night (emissive only; no per-lamp light)
  const night = elev < 5;
  for (const lamp of G.lamps) {
    lamp.mat.emissiveIntensity = night ? 1.2 : 0.15;
  }
  // headlight follows the player's car at night
  const head = G.headlight;
  const car = G.player.car;
  if (car && night) {
    head.intensity = 3.2;
    const h = car.userData.heading;
    head.position.set(car.position.x + Math.cos(h) * 2, 1.1, car.position.z + Math.sin(h) * 2);
    head.target.position.set(car.position.x + Math.cos(h) * 30, 0.4, car.position.z + Math.sin(h) * 30);
  } else {
    head.intensity = 0;
  }
}
