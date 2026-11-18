// Pedestrians: named, varied, routines, chatting pairs, fleeing.
const PV_Traffic = (() => {
  const NAMES = ['Priya', 'Marcus', 'Elena', 'Tomas', 'Lena', 'Vic', 'Nadia', 'Omar', 'Sofia', 'Dario',
    'Rosa', 'Nico', 'Felix', 'Amara', 'Jonas', 'Mira', 'Carlos', 'Aisha', 'Leo', 'Ines',
    'Bruno', 'Kira', 'Hugo', 'Zara', 'Pablo', 'Nina', 'Oscar', 'Lila', 'Ravi', 'Greta'];
  const SHIRTS = [0xc25a4a, 0x4a6a8a, 0x5a8a4a, 0xd8c9a3, 0x8a5a7a, 0x3a3a3a, 0xe8e8e8, 0x7a5a2e, 0x4a7a6a, 0x9a4a3a];
  const SKINS = [0xc9a184, 0x8a5a3a, 0xe8c39a, 0x6a4632, 0xd8a878];
  const PANTS = [0x2e3a4a, 0x3a3a3a, 0x5a4a3a, 0x4a3a5a, 0x6a6a6a];
  function pedMesh(shirt, pants, skin, h) {
    const g = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
    const pm = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    const km = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
    const hairM = new THREE.MeshStandardMaterial({ color: pick([0x1a1a1a, 0x4a2e1a, 0x8a8a8a, 0x2e1a0a]), roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.28), sm);
    body.position.y = 0.95; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), km);
    head.position.y = 1.5; head.castShadow = true; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, 1.2), hairM);
    hair.position.y = 1.53; g.add(hair);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.13), sm);
      arm.position.set(s * 0.33, 0.98, 0); g.add(arm);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), pm);
      leg.position.set(s * 0.13, 0.31, 0); g.add(leg);
    }
    g.scale.setScalar(h);
    g.userData = { body, head };
    return g;
  }
  function makePed(x, z, opts = {}) {
    const h = opts.h ?? rand(0.92, 1.08);
    const mesh = pedMesh(opts.shirt ?? pick(SHIRTS), opts.pants ?? pick(PANTS), opts.skin ?? pick(SKINS), h);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const ped = {
      mesh, x, z, heading: rand(0, Math.PI * 2), speed: rand(1.2, 2.2),
      target: null, state: opts.state ?? 'walk', name: opts.name ?? null,
      kind: opts.kind ?? 'walker', talkAt: -99, routine: opts.routine ?? null,
      routineDay: null, home: null, eventPed: false, standT: 0, fleeT: 0,
    };
    G.peds.push(ped);
    return ped;
  }
  function namePeds() {
    // Every ped gets a name; the roster cannot run out (numbered fallback).
    for (let i = 0; i < G.peds.length; i++) {
      const p = G.peds[i];
      if (!p.name) p.name = i < NAMES.length ? NAMES[i] : 'Vic ' + (i - NAMES.length + 2);
    }
  }
  function spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const p = roadLane();
      makePed(p.x + rand(-4, 4), p.z + rand(-4, 4));
    }
    // chatting pairs: two peds standing close, facing each other
    for (let i = 0; i < 8; i++) {
      const p = roadLane();
      const a = makePed(p.x, p.z, { state: 'stand' });
      const b = makePed(p.x + 1.2, p.z + 0.4, { state: 'stand' });
      a.heading = Math.atan2(b.x - a.x, b.z - a.z);
      b.heading = Math.atan2(a.x - b.x, a.z - b.z);
      a.standT = rand(20, 60); b.standT = a.standT;
    }
    // named street NPCs at fixed pitches
    G.named.rosa = makePed(-264, 258, { name: 'Rosa', kind: 'named', state: 'stand', h: 1.0 });
    G.named.dario = makePed(108, -150, { name: 'Dario', kind: 'named', state: 'stand', h: 1.04 });
    G.named.nico = makePed(420, 200, { name: 'Nico', kind: 'named', state: 'stand', h: 0.98 });
    // routines: 4 day-shift market workers, 4 night-shift bar crowd.
    // Home points are far from the work point, so the shift flip is visible.
    const market = { x: -264, z: 258 };
    const bar = { x: 160, z: -96 };
    for (let i = 0; i < 4; i++) {
      const p = makePed(market.x + rand(-14, 14), market.z + rand(-8, 8), { kind: 'routine' });
      p.routine = { day: { ...market, x: market.x + rand(-10, 10), z: market.z + rand(-6, 6) }, night: { x: rand(-380, -100), z: rand(-380, -100) }, shift: 'day' };
      p.routineDay = 'day';
    }
    for (let i = 0; i < 4; i++) {
      const p = makePed(bar.x + rand(-10, 10), bar.z + rand(-8, 8), { kind: 'routine' });
      p.routine = { day: { x: rand(100, 380), z: rand(100, 380) }, night: { ...bar, x: bar.x + rand(-8, 8), z: bar.z + rand(-6, 6) }, shift: 'night' };
      p.routineDay = 'night';
    }
    namePeds();
    G.stats.peds = G.peds.length;
  }
  function roadLane() {
    const k = randi(0, 14);
    const along = rand(-420, 420);
    const c = -448 + k * 64;
    return Math.random() < 0.5 ? { x: along, z: c + rand(-5, 5) } : { x: c + rand(-5, 5), z: along };
  }
  function walkTarget(p) {
    const lane = roadLane();
    return { x: lane.x, z: lane.z };
  }
  function updatePeds(dt) {
    const px = G.player ? G.player.x : 0, pz = G.player ? G.player.z : 0;
    const day = PV_City.isDay();
    for (const p of G.peds) {
      if (p.eventPed && G.event && G.event.cleared) { p.eventPed = false; p.state = 'walk'; }
      if (p.state === 'stand' && p.kind !== 'named' && p.kind !== 'routine') {
        p.standT -= dt;
        if (p.standT <= 0) { p.state = 'walk'; p.target = walkTarget(p); }
      } else if (p.kind === 'routine' && p.routine) {
        const want = day ? p.routine.day : p.routine.night;
        if (!p.target || p.routineDay !== (day ? 'day' : 'night')) {
          p.routineDay = day ? 'day' : 'night';
          p.target = { x: want.x + rand(-3, 3), z: want.z + rand(-3, 3) };
          p.state = 'walk';
        }
        if (p.target && dist2(p.x, p.z, p.target.x, p.target.z) < 2) { p.state = 'stand'; p.standT = 30; }
      } else if (p.state === 'walk' || p.state === 'flee') {
        if (p.state === 'flee') {
          p.fleeT -= dt;
          if (p.fleeT <= 0) p.state = 'walk';
        }
        if (!p.target) p.target = walkTarget(p);
        const d = dist2(p.x, p.z, p.target.x, p.target.z);
        if (d < 2) { p.target = walkTarget(p); }
        const sp = p.state === 'flee' ? 5.5 : p.speed;
        const wantH = Math.atan2(p.target.x - p.x, p.target.z - p.z);
        p.heading += angDiff(wantH, p.heading) * Math.min(1, dt * 4);
        p.x += Math.sin(p.heading) * sp * dt;
        p.z += Math.cos(p.heading) * sp * dt;
        // keep peds out of buildings
        const before = { x: p.x, z: p.z };
        collideCircle(p, 0.6);
        if (Math.abs(p.x - before.x) > 0.01 || Math.abs(p.z - before.z) > 0.01) p.target = walkTarget(p);
      }
      // flee from gunfire / high wanted
      if (G.wanted >= 2 && p.state !== 'flee' && dist2(p.x, p.z, px, pz) < 25 && Math.random() < dt * 0.3) {
        p.state = 'flee'; p.fleeT = 4;
        p.target = { x: p.x + (p.x - px) * 2, z: p.z + (p.z - pz) * 2 };
      }
      // walk bob
      const moving = p.state === 'walk' || p.state === 'flee';
      p.mesh.position.set(p.x, moving ? Math.abs(Math.sin(G.time * 8 + p.x)) * 0.05 : 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }
  function nearestPed(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of G.peds) {
      if (p.eventPed) continue;
      const d = dist2(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  return { spawnPeds, updatePeds, nearestPed, NAMES, pedMesh, makePed };
})();
