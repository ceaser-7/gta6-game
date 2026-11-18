// People: the player (Mara Voss), pedestrians with day/night routines, NPC dialogue bank.
import * as THREE from 'three';
import { G, WORLD, PED_NAMES, clamp, rand, randi, pick } from './state.js';

export function makePersonMesh(shirtColor, skinColor = 0xc89878) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.95 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), skin);
  head.position.y = 1.62; g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt);
  torso.position.y = 1.08; g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pants);
  legL.position.set(-0.16, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), shirt);
  armL.position.set(-0.42, 1.1, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPlayer() {
  // Mara Voss: teal jacket, dark hair.
  const mesh = makePersonMesh(0x2a7a7a, 0xc89878);
  mesh.position.set(0, 0, 40);
  G.scene.add(mesh);
  G.player = {
    mesh, heading: 0, speed: 0, onFoot: true, car: null,
    health: 100, pos: mesh.position, walkPhase: 0,
  };
  return G.player;
}

export function spawnPeds() {
  const colors = [0xc23a3a, 0x3a6ab5, 0x3a8a4a, 0xe8c832, 0x8a2a8a, 0xd8d8d8, 0x5a5a5a, 0xff8a3a];
  for (let i = 0; i < 64; i++) {
    const mesh = makePersonMesh(pick(colors), pick([0xc89878, 0x8a5a38, 0xe8b890, 0x6a3a22]));
    const x = rand(-WORLD.cityHalf + 10, WORLD.cityHalf - 10);
    const z = rand(-WORLD.cityHalf + 10, WORLD.cityHalf - 10);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, name: PED_NAMES[i % PED_NAMES.length] + (i >= PED_NAMES.length ? ' ' + (Math.floor(i / PED_NAMES.length) + 1) : ''),
      heading: rand(0, Math.PI * 2), speed: rand(1.2, 2.4),
      state: Math.random() < 0.5 ? 'walk' : 'idle',
      stateT: rand(2, 8), home: [x, z], phase: rand(0, 6),
      dayJob: Math.random() < 0.6, // day routine vs night routine
    });
  }
}

// Pedestrian update: walk the sidewalks, idle in parks, head home at night.
export function updatePeds(dt) {
  const night = G.timeOfDay >= 20 || G.timeOfDay < 6;
  for (const p of G.peds) {
    p.stateT -= dt;
    if (p.stateT <= 0) {
      p.state = pick(['walk', 'walk', 'idle']);
      p.stateT = rand(3, 9);
      if (p.state === 'walk') p.heading = rand(0, Math.PI * 2);
    }
    if (p.state === 'walk') {
      // At night, drift toward home; by day, wander.
      if (night) {
        const dx = p.home[0] - p.mesh.position.x, dz = p.home[1] - p.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 8) p.heading = Math.atan2(dx, dz);
      }
      const nx = p.mesh.position.x + Math.sin(p.heading) * p.speed * dt;
      const nz = p.mesh.position.z + Math.cos(p.heading) * p.speed * dt;
      if (Math.abs(nx) < WORLD.cityHalf - 6 && Math.abs(nz) < WORLD.cityHalf - 6) {
        p.mesh.position.x = nx; p.mesh.position.z = nz;
        p.phase += dt * 6;
        p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.5;
        p.mesh.userData.legR.rotation.x = -Math.sin(p.phase) * 0.5;
        p.mesh.userData.armL.rotation.x = -Math.sin(p.phase) * 0.4;
        p.mesh.userData.armR.rotation.x = Math.sin(p.phase) * 0.4;
      } else {
        p.heading += Math.PI / 2;
      }
      p.mesh.rotation.y = p.heading;
    } else {
      p.mesh.userData.legL.rotation.x *= 0.9;
      p.mesh.userData.legR.rotation.x *= 0.9;
    }
  }
}

// ---- Dialogue bank: NPC barks + crew lines ----
export const BARKS = [
  'Beautiful day on the island, huh?', 'The tide is coming in fast tonight.',
  'Rook’s people were asking about you.', 'Have you seen the new tower downtown?',
  'Traffic on the causeway is a nightmare.', 'I heard the Sprint is this weekend.',
  'El Faro has the best tacos in Porto Verde.', 'Don’t speed past the Marina — cops love it there.',
  'My cousin drives a taxi. He knows everything.', 'The beach is the best part of this city.',
  'Kessler’s men run the docks now.', 'Sunray Garage fixed my car in an hour.',
  'Golden hour here is unreal.', 'Watch out for the roadblocks after dark.',
];
export const CREW_LINES = {
  lena: [
    'Mara. Rook wants his money. I got you work — follow the gold marker.',
    'Drive smooth, talk less. The cops here remember faces.',
    'You’re the best wheelwoman on this island. Prove it.',
    'One job at a time. We’ll get your debt down.',
  ],
  rook: [
    'Forty thousand, Mara. Every job knocks it down. Don’t make me come find you.',
    'You drive. I collect. That’s the arrangement.',
    'The debt doesn’t sleep. Neither do I.',
    'Finish the jobs and we’re square. Fail, and the island gets small.',
  ],
  tomas: [
    'Bring the car in, I’ll make it sing again. A hundred bucks.',
    'You drive it like you stole it. Oh — you did.',
    'Engine’s fine. It’s the driver that worries me.',
  ],
  rosa: [
    'Taco, ten bucks. Best on the island, and it’ll fix you right up.',
    'You look hungry, Mara. Sit. Eat. Then go be reckless.',
    'Rook’s men don’t eat here. You’re safe at my counter.',
  ],
  kessler: [
    'This island has one boss, Mara, and it isn’t Rook.',
    'You’re in my waters now. The Marina belongs to me.',
  ],
};
export function bark() { return pick(BARKS); }
export function crewLine(who) { return pick(CREW_LINES[who] || BARKS); }
