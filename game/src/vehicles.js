// Cars: 5 types, detailed bodies, traffic AI, the player's starter car.
const PV_Vehicles = (() => {
  const TYPES = {
    sedan: { len: 4.4, wid: 1.9, h: 1.35, color: 0x3a5a8a, accel: 16, top: 34 },
    sports: { len: 4.2, wid: 1.85, h: 1.15, color: 0xc23a2e, accel: 24, top: 46, spoiler: true },
    suv: { len: 4.8, wid: 2.05, h: 1.7, color: 0x4a5a3a, accel: 13, top: 30 },
    van: { len: 5.2, wid: 2.1, h: 2.1, color: 0x8a6a3a, accel: 11, top: 27 },
    taxi: { len: 4.4, wid: 1.9, h: 1.4, color: 0xe8c33d, accel: 16, top: 33, taxi: true },
  };
  const COLORS = [0x3a5a8a, 0x8a3a3a, 0x4a5a3a, 0x6a6a6a, 0x2e3a4a, 0x7a5a2e, 0x5a2e4a, 0x3a6a5a];
  function carMesh(type, color) {
    const T = TYPES[type];
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.15, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.8 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.9 });
    const L = T.len, W = T.wid, H = T.h;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.55, L * 0.72), paint);
    body.position.y = H * 0.42; body.castShadow = true; g.add(body);
    // sloped hood + deck
    const hood = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, H * 0.28, L * 0.2), paint);
    hood.position.set(0, H * 0.62, L * 0.42); hood.rotation.x = 0.18; g.add(hood);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, H * 0.28, L * 0.16), paint);
    deck.position.set(0, H * 0.62, -L * 0.42); deck.rotation.x = -0.18; g.add(deck);
    // cabin + side glass
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, H * 0.5, L * 0.42), glass);
    cab.position.set(0, H * 0.9, -L * 0.05); cab.castShadow = true; g.add(cab);
    const cabTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.08, L * 0.4), paint);
    cabTop.position.set(0, H * 1.16, -L * 0.05); g.add(cabTop);
    // bumpers, grille, skirts, seams
    const fb = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.22, 0.25), chrome);
    fb.position.set(0, H * 0.28, L * 0.5); g.add(fb);
    const rb = fb.clone(); rb.position.z = -L * 0.5; g.add(rb);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.16, 0.1), dark);
    grille.position.set(0, H * 0.5, L * 0.51); g.add(grille);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, 0.12, L * 0.6), dark);
    skirt.position.set(0, H * 0.16, 0); g.add(skirt);
    // mirrors
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.28), dark);
      m.position.set(s * (W / 2 + 0.08), H * 0.85, L * 0.18); g.add(m);
    }
    // wheels + hubcaps
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10);
    for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx * (W / 2 - 0.05), 0.36, wz * L * 0.32);
      w.castShadow = true; g.add(w);
      const hub = new THREE.Mesh(hubGeo, chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(w.position); g.add(hub);
    }
    // headlights + brake lights
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), hlMat);
      hl.position.set(s * W * 0.32, H * 0.55, L * 0.51); g.add(hl);
    }
    const brakeMat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff2020, emissiveIntensity: 0.2 });
    for (const s of [-1, 1]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), brakeMat);
      br.position.set(s * W * 0.32, H * 0.55, -L * 0.51); g.add(br);
    }
    g.userData.brakeMat = brakeMat;
    if (T.spoiler) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.08, 0.4), dark);
      sp.position.set(0, H * 1.05, -L * 0.48); g.add(sp);
    }
    if (T.taxi) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd23e, emissiveIntensity: 0.8 }));
      sign.position.set(0, H * 1.28, -L * 0.05); g.add(sign);
    }
    g.userData.type = type;
    return g;
  }
  function makeCar(type, x, z, heading, color) {
    const mesh = carMesh(type, color ?? pick(COLORS));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    G.scene.add(mesh);
    const car = {
      mesh, type, heading, speed: 0, x, z,
      len: TYPES[type].len, wid: TYPES[type].wid,
      accel: TYPES[type].accel, top: TYPES[type].top,
      driver: null, // ped object or 'player'
      target: null, speedTarget: 8, stuck: 0, smoke: null, wanted: false,
    };
    return car;
  }
  function roadLane() {
    // pick a road centreline + lane offset
    const k = randi(0, 14);
    const along = rand(-420, 420);
    const horiz = Math.random() < 0.5;
    const c = -448 + k * 64;
    return horiz ? { x: along, z: c + (Math.random() < 0.5 ? -3 : 3), heading: Math.random() < 0.5 ? 0 : Math.PI }
      : { x: c + (Math.random() < 0.5 ? -3 : 3), z: along, heading: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }
  function spawnTraffic(n) {
    const types = ['sedan', 'sedan', 'suv', 'van', 'taxi', 'sports'];
    for (let i = 0; i < n; i++) {
      const p = roadLane();
      const car = makeCar(pick(types), p.x, p.z, p.heading);
      car.driver = 'traffic';
      car.speedTarget = rand(6, 11);
      G.cars.push(car);
    }
    G.stats.cars = G.cars.length;
  }
  function updateTraffic(dt) {
    for (const car of G.cars) {
      if (car.driver === 'player') continue;
      if (car.driver === 'mission') continue;
      // simple follow-the-road driver: keep heading, slow near other cars
      let want = car.speedTarget;
      for (const o of G.cars) {
        if (o === car) continue;
        const dx = o.x - car.x, dz = o.z - car.z;
        const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
        const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
        if (fwd > 0 && fwd < 12 && side < 3) { want = 0; break; }
      }
      car.speed = lerp(car.speed, want, dt * 0.8);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // turn at intersections, stay in the city
      if (Math.abs(car.x) > 440 || Math.abs(car.z) > 440) {
        car.heading += Math.PI / 2;
        car.x = clamp(car.x, -440, 440); car.z = clamp(car.z, -440, 440);
      }
      const rp = roadPoint(car.x, car.z);
      if (Math.abs(car.x - rp.x) > 6 || Math.abs(car.z - rp.z) > 6) {
        // drifted off the road line (after a turn): steer back gently
        const wantH = Math.abs(car.x - rp.x) > Math.abs(car.z - rp.z)
          ? (car.z < rp.z ? 0 : Math.PI) : (car.x < rp.x ? Math.PI / 2 : -Math.PI / 2);
        car.heading += angDiff(wantH, car.heading) * dt * 0.5;
      }
      // occasional 90-degree turn at an intersection
      if (Math.random() < dt * 0.02 && onRoad(car.x, car.z)) {
        const nearInt = Math.abs(((car.x + 448) % 64 + 64) % 64 - 0) < 8 || Math.abs(((car.z + 448) % 64 + 64) % 64 - 0) < 8;
        if (nearInt) car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.mesh.userData.brakeMat.emissiveIntensity = car.speed < want - 0.5 ? 1.2 : 0.2;
    }
  }
  function nearestCar(x, z, maxD) {
    let best = null, bd = maxD;
    for (const car of G.cars) {
      if (car.driver === 'player') continue;
      const d = dist2(x, z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }
  return { makeCar, spawnTraffic, updateTraffic, nearestCar, TYPES };
})();
