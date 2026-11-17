// Screenshot scenes: URL ?shot=<name> drops the game into a staged moment
// so the screenshots are real renders of the game in a lively state.
// One clear job: set up each named scene after the game has started.
import * as THREE from 'three';
import { updatePolice } from './police.js';
import { createCar } from './vehicles.js';
import { enterInterior } from './interiors.js';
export function shotName() {
  return new URLSearchParams(location.search).get('shot');
}

export function setupShot(G, shot) {
  G.shotMode = true;
  G.nextBriefIn = 99999; // no mission briefings during a staged shot
  const p = G.player;
  if (shot === 'drive') {
    // in the teal car on a Downtown avenue, tall towers around, objective on the HUD
    const car = G.playerStartCar;
    car.pos.set(108, 0, -162); car.angle = Math.PI / 2; car.speed = 14;
    p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
    p.group.visible = false;
    p.pos.set(108, 0, -162);
    G.camYaw = Math.PI / 2; G.camPitch = 0.32;
    G.hud.setObjective('Job 2 — The Getaway Car: steal the orange Sunray GT');
    G.beacon.visible = true;
    G.beacon.position.set(270, 0, -270);
  } else if (shot === 'chase') {
    // wanted 3, in the orange GT (sports) on the north-south avenue, police already on the tail,
    // Downtown towers + neon ahead, golden hour — the cover shot
    const car = createCar(G, 54, 100, Math.PI, 0, { type: 'sports', maxSpeed: 34, accel: 21 });
    car.group.children[0].material.color.set(0xe86a10);
    car.pos.set(54, 0, 100); car.angle = Math.PI; car.speed = 20; car.maxSpeed = 34;
    p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
    p.group.visible = false;
    p.pos.set(54, 0, 100);
    G.camYaw = Math.PI; G.camPitch = 0.3;
    G.setWanted(3);
    updatePolice(G, 0); // force-spawn the pursuit cars now (setWanted only sets the number)
    // pull two police cars into the frame ahead: a roadblock forming up the avenue
    for (let i = 0; i < 2; i++) {
      const pc = G.police[i];
      if (pc) { pc.pos.set(i ? 66 : 46, 0, i ? 84 : 60); pc.angle = Math.PI; pc.speed = 18; }
    }
    G.hud.setObjective('Job 2 — The Getaway Car: lose the police, reach the Marina lockup!');
    G.beacon.visible = true;
    G.beacon.position.set(270, 0, 270);
  } else if (shot === 'foot') {
    // on foot on the Old Town sidewalk near the market, pedestrians and traffic around
    p.pos.set(-266, 0, 262); p.yaw = -0.46; p.onFoot = true; p.group.visible = true;
    p.group.position.copy(p.pos);
    G.camYaw = -0.46; G.camPitch = 0.22;
    G.hud.setObjective('Job 1 — The Pickup: pick up the package in Old Town');
    G.beacon.visible = true;
    G.beacon.position.set(-270, 0, 270);
  } else if (shot === 'talk') {
    // v5: Mara talking to Rosa at the Old Town market — the city talks back
    p.pos.set(-264, 0, 254); p.yaw = 0.35; p.onFoot = true; p.group.visible = true;
    p.group.position.copy(p.pos);
    G.camYaw = 0.35; G.camPitch = 0.24;
    G.hud.setObjective('Talk to people — they gossip, warn you, and point you at work');
    G.hud.showDialog('Rosa', 'Morning, Mara, these oranges are sweeter than they look.', () => {});
  } else if (shot === 'interior') {
    // v5: inside El Faro, the taco bar — Tomas behind the counter, menu on the wall
    enterInterior(G, G.rooms[0]);
    G.camPitch = 0.25;
    G.hud.setObjective('El Faro — tacos, coffee, and a seat at the bar');
  } else if (shot === 'race') {
    // v5: at the Sunset Sprint start arch on the Downtown avenue, engine running
    const car = G.playerStartCar;
    car.pos.set(108, 0, -162); car.angle = Math.PI / 2; car.speed = 0;
    p.car = car; p.onFoot = false; car.driver = 'player'; car.isTraffic = false;
    p.group.visible = false;
    p.pos.set(108, 0, -162);
    G.camYaw = Math.PI / 2; G.camPitch = 0.3;
    G.hud.setObjective('Sunset Sprint — drive through the arch to start the race');
  } else if (shot === 'coins') {
    // v5: Mara on foot in the central park, a Verde Coin glinting ahead
    p.pos.set(27, 0, 20); p.yaw = 0; p.onFoot = true; p.group.visible = true;
    p.group.position.copy(p.pos);
    G.camYaw = 0; G.camPitch = 0.24;
    G.hud.setObjective('Verde Coins — twelve hidden around the city. Find them all.');
  }
}
