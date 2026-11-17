// Screenshot scenes: URL ?shot=<name> drops the game into a staged moment
// so the screenshots are real renders of the game in a lively state.
// One clear job: set up each named scene after the game has started.
import * as THREE from 'three';
import { updatePolice } from './police.js';
export function shotName() {
  return new URLSearchParams(location.search).get('shot');
}

export function setupShot(G, shot) {
  G.shotMode = true;
  G.nextBriefIn = 99999; // no mission briefings during a staged shot
  const p = G.player;
  if (shot === 'drive') {
    // in the teal car, Downtown, traffic around, mission objective on the HUD
    const car = G.playerStartCar;
    car.pos.set(60, 0, -108); car.angle = Math.PI / 2; car.speed = 14;
    p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
    p.group.visible = false;
    p.pos.set(60, 0, -108);
    G.camYaw = Math.PI / 2; G.camPitch = 0.32;
    G.hud.setObjective('Job 1 — The Pickup: pick up the package in Old Town');
    G.beacon.visible = true;
    G.beacon.position.set(-108, 0, 108);
  } else if (shot === 'chase') {
    // wanted 3, in a fast car on the north-south road, police already on the tail
    const car = G.playerStartCar;
    car.pos.set(-54, 0, 20); car.angle = 0; car.speed = 20; car.maxSpeed = 34;
    car.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0xe86a10 });
    p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
    p.group.visible = false;
    p.pos.set(-54, 0, 20);
    G.camYaw = 0; G.camPitch = 0.3;
    G.setWanted(3);
    updatePolice(G, 0); // force-spawn the pursuit cars now (setWanted only sets the number)
    // pull two police cars into the frame: one ahead-left, one flanking on the right
    for (let i = 0; i < 2; i++) {
      const pc = G.police[i];
      if (pc) { pc.pos.set(i ? -48 : -60, 0, i ? 16 : 42); pc.angle = 0; pc.speed = 18; }
    }
    G.hud.setObjective('Job 2 — The Getaway Car: lose the police, reach the Marina lockup!');
    G.beacon.visible = true;
    G.beacon.position.set(162, 0, 162);
  } else if (shot === 'foot') {
    // on foot in Old Town, pedestrians and traffic around, marker ahead
    p.pos.set(-100, 0, 96); p.yaw = Math.PI; p.onFoot = true; p.group.visible = true;
    p.group.position.copy(p.pos);
    G.camYaw = Math.PI; G.camPitch = 0.22;
    G.hud.setObjective('Job 1 — The Pickup: pick up the package in Old Town');
    G.beacon.visible = true;
    G.beacon.position.set(-108, 0, 108);
  }
}
