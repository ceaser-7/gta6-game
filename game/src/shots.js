// Porto Verde — staged screenshot scenes, driven by ?shot=<name> in the URL.
// Each scene puts the player, camera and UI where the shot needs them.
import { G } from './state.js';
import { talkTo } from './dialogue.js';
import { enterInterior } from './interiors.js';
import { RACE_ARCH, RACE_CPS } from './activities.js';
import { makeCar } from './vehicles.js';

export function applyShot(name) {
  G.shotMode = name;
  const p = G.player;
  if (name === 'talk') {
    // Mara at the Old Town market, facing Rosa, Rosa's dialog open
    const rosa = G.named.Rosa;
    p.pos.set(rosa.position.x + 2.2, 0, rosa.position.z + 2.5);
    p.yaw = Math.atan2(rosa.position.x - p.pos.x, rosa.position.z - p.pos.z);
    talkTo(rosa);
  } else if (name === 'interior') {
    // inside El Faro, near Tomas behind the counter
    enterInterior(G.rooms[0]);
    p.pos.set(600 - 1, 0, 600 + 1.5);
    p.yaw = Math.PI; // facing the counter (north)
  } else if (name === 'race') {
    // in a sports car at the Sunset Sprint arch, race running
    const car = makeCar('sports', 0xd8b93a);
    car.position.set(RACE_ARCH.x, 0, RACE_ARCH.z + 6);
    car.userData.heading = -Math.PI / 2;
    car.rotation.y = Math.PI / 2;
    G.scene.add(car); G.cars.push(car);
    p.car = car; p.onFoot = false;
    p.pos.set(car.position.x, 0, car.position.z);
    G.race.active = true; G.race.cp = 0; G.race.left = 85;
    G.race.next = { x: RACE_CPS[0][0], z: RACE_CPS[0][1] };
    G.race.rings[0].material.opacity = 1;
  } else if (name === 'coins') {
    // in the central park, a gold Verde Coin glinting ahead
    p.pos.set(-32, 0, 205);
    p.yaw = Math.PI; // facing north, toward the park and its coin
  }
  if (G.camTarget) G.camTarget.copy(p.pos);
}
