// The story: three jobs for Rook, and the debt that ends them.
// One clear job: brief each mission, watch its objectives, and pay or fail it.
import * as THREE from 'three';
import { createCar, stepCar } from './vehicles.js';
import { showPassed } from './hud.js';

const MISSIONS = [
  {
    name: 'Job 1 — The Pickup',
    brief: 'Mara. First job. A courier in a brown van is carrying the package to the Old Town market — tail him there. Stay close enough to keep him in sight, but do not crowd him or he will bolt. When he stops, grab the package and bring it to the Harbor warehouse. Four minutes, and do not dawdle.',
    who: 'Rook — fixer',
    reward: 400,
  },
  {
    name: 'Job 2 — The Getaway Car',
    brief: 'A client wants a Sunray GT, bright orange, parked in Downtown. Take it — quietly if you can — and bring it to the lockup in the Marina. The owner will call it in, so expect the Verde PD on your tail.',
    who: 'Rook — fixer',
    reward: 800,
  },
  {
    name: 'Job 3 — The Dragnet',
    brief: 'Last job, Mara. The PD knows your face and they are already rolling. Get to the beach hideout before they box you in. Make it there and the debt is paid — you walk away clean.',
    who: 'Rook — fixer',
    reward: 1500,
  },
];

const TARGETS = [
  { courier: { x: -54, z: -30 }, route: [[-54, 108], [-162, 108], [-162, 270], [-270, 270]], pickup: { x: -270, z: 270, label: 'Pick up the package' }, deliver: { x: -324, z: -270, label: 'Deliver to the Harbor warehouse' }, time: 240 },
  { car: { x: 270, z: -270, label: 'Steal the orange Sunray GT' }, deliver: { x: 270, z: 270, label: 'Deliver the car to the Marina lockup' }, time: 0 },
  { hideout: { x: 0, z: 400, label: 'Reach the beach hideout' }, time: 240 },
];

function makeBeacon() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  diamond.position.y = 6;
  g.add(beam, ring, diamond);
  g.userData = { diamond, ring };
  return g;
}

export function createMissions(G) {
  G.missionIndex = 0;
  G.mission = null;
  G.beacon = makeBeacon();
  G.beacon.visible = false;
  G.scene.add(G.beacon);
  G.missionCar = null;
  G.nextBriefIn = 2.5; // seconds after starting before the first briefing
}

export function startMission(G, index) {
  const def = MISSIONS[index];
  const t = TARGETS[index];
  const m = {
    index, name: def.name, reward: def.reward,
    stage: 'brief', timer: t.time, timeLeft: t.time,
    target: null, packageGot: false,
  };
  G.mission = m;
  G.hud.showDialog(def.who, def.brief, () => {
    m.stage = 'active';
    if (index === 0) {
      // stage 0: tail the courier's van to the market — stay close, don't spook him
      const courier = createCar(G, t.courier.x, t.courier.z, 0, 0, { type: 'van', driver: 'courier', maxSpeed: 12, accel: 8 });
      courier.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0x8a5a2e });
      G.courierCar = courier;
      m.tailCar = courier;
      m.tailWp = 0;
      m.tailRoute = t.route;
      m.stage = 'tail';
      m.target = { x: courier.pos.x, z: courier.pos.z };
      G.hud.setObjective(`${def.name}: Tail the courier to the Old Town market — stay close, don't spook him`);
      G.hud.toast('Follow the brown van');
    } else if (index === 1) {
      // park the getaway car in Downtown
      const car = createCar(G, t.car.x, t.car.z, 0.8, 0, { missionCar: true, maxSpeed: 34, accel: 20 });
      car.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0xe86a10 });
      G.missionCar = car;
      m.target = t.car; m.stage2 = t.deliver;
      G.hud.setObjective(`${def.name}: ${t.car.label}`);
    } else {
      m.target = t.hideout;
      G.setWanted(3);
      G.hud.setObjective(`${def.name}: ${t.hideout.label} — lose them or outrun them!`);
    }
    moveBeacon(G);
    G.saveGame();
  });
}

function moveBeacon(G) {
  const m = G.mission;
  if (!m || !m.target) { G.beacon.visible = false; return; }
  G.beacon.visible = true;
  G.beacon.position.set(m.target.x, 0, m.target.z);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  // beacon pulse
  if (G.beacon.visible) {
    G.beacon.userData.diamond.rotation.y += dt * 2;
    G.beacon.userData.diamond.position.y = 6 + Math.sin(G.time * 2.5) * 0.8;
    G.beacon.userData.ring.material.opacity = 0.5 + Math.sin(G.time * 3) * 0.3;
  }
  // time to brief the next mission?
  if (!m && G.missionIndex < 3 && G.state === 'playing' && !G.hud.dialogOpen) {
    G.nextBriefIn -= dt;
    if (G.nextBriefIn <= 0) startMission(G, G.missionIndex);
    return;
  }
  if (!m || m.stage !== 'active') {
    // tailing stage (Mission 1): drive the courier along his route to the market
    if (m && m.stage === 'tail' && m.tailCar) {
      const c = m.tailCar;
      const p = G.player;
      const pd = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      // too far: the courier waits for you; too close: he gets spooked and speeds up
      let cruise = 10;
      if (pd > 60) cruise = 0;
      else if (pd < 5) {
        cruise = 16;
        if (!m.spookShown) { m.spookShown = true; G.hud.toast('Too close — back off!'); }
      } else m.spookShown = false;
      const wp = m.tailRoute[m.tailWp];
      const dx = wp[0] - c.pos.x, dz = wp[1] - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 8) {
        m.tailWp++;
        if (m.tailWp >= m.tailRoute.length) {
          // courier arrived at the market: the package phase begins
          c.speed = 0;
          m.stage = 'active';
          m.target = TARGETS[0].pickup; m.stage2 = TARGETS[0].deliver;
          G.hud.setObjective(`${m.name}: ${TARGETS[0].pickup.label}`);
          G.hud.toast('The courier stopped — grab the package');
          moveBeacon(G);
          return;
        }
      } else {
        const want = Math.atan2(dx, dz);
        let d = want - c.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.angle += Math.max(-2 * dt, Math.min(2 * dt, d));
        c.speed += Math.max(-14 * dt, Math.min(10 * dt, cruise - c.speed));
        stepCar(G, c, dt, false);
      }
      // beacon + objective track the moving courier
      m.target = { x: c.pos.x, z: c.pos.z };
      moveBeacon(G);
    }
    return;
  }
  // timer
  if (m.timer > 0) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) { failMission(G, 'Out of time — Rook does not pay for late work.'); return; }
  }
  const p = G.player;
  const dist = (t) => Math.hypot(p.pos.x - t.x, p.pos.z - t.z);
  if (m.index === 0) {
    if (!m.packageGot) {
      if (dist(m.target) < 5) {
        G.hud.setObjective(`${m.name}: Package in hand — deliver it to the Harbor warehouse!`);
        m.target = m.stage2; moveBeacon(G);
        m.packageGot = true;
        G.audio.pickup();
        G.hud.toast('Package collected');
      }
    } else if (dist(m.target) < 8) {
      completeMission(G, 'Delivered. Clean work, Mara.');
    }
  } else if (m.index === 1) {
    if (!m.packageGot) {
      // stage 1 ends when the player is driving the mission car
      if (p.car && p.car.missionCar) {
        m.packageGot = true;
        m.target = m.stage2; moveBeacon(G);
        G.setWanted(2);
        G.hud.setObjective(`${m.name}: The GT is yours — lose the police and reach the Marina lockup!`);
        G.audio.pickup();
      }
    } else if (p.car && p.car.missionCar && dist(m.target) < 9) {
      completeMission(G, 'The client is happy. The GT is in the lockup.');
    }
  } else if (m.index === 2) {
    if (dist(m.target) < 9) {
      completeMission(G, 'You made it. The debt is paid — Porto Verde is yours now.');
    }
  }
  // HUD timer readout
  if (m.timer > 0) G.hud.setTimer(Math.ceil(m.timeLeft));
  else G.hud.setTimer(0);
}

export function tryMissionInteract(G) {
  const m = G.mission;
  if (!m || m.stage !== 'active' || m.index !== 0 || m.packageGot) return false;
  const p = G.player;
  if (Math.hypot(p.pos.x - m.target.x, p.pos.z - m.target.z) < 5) {
    // handled by updateMissions' proximity check; this is the E-press path
    return true;
  }
  return false;
}

function completeMission(G, line) {
  const m = G.mission;
  G.money += m.reward;
  G.setWanted(0);
  G.beacon.visible = false;
  G.hud.setObjective('');
  G.hud.setTimer(0);
  G.audio.success();
  showPassed(G, m.name, m.reward, line);
  G.hud.toast(`Job complete — +$${m.reward}`);
  G.missionIndex++;
  G.mission = null;
  G.nextBriefIn = 6;
  G.saveGame();
  if (G.missionIndex >= 3) {
    G.hud.showDialog('Rook — fixer', line + ' Three jobs, debt cleared. The city is open — drive it, Mara.', () => {});
  } else {
    G.hud.showDialog('Rook — fixer', line, () => {});
  }
}

export function failMission(G, reason) {
  const m = G.mission;
  G.beacon.visible = false;
  G.hud.setTimer(0);
  G.audio.fail();
  G.mission = null;
  G.nextBriefIn = 9999; // do not auto-brief; the retry flow restarts it
  G.showOver('JOB FAILED', reason + ' The job is still open — take it again.', true);
}
