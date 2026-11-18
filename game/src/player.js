// Mara Voss: on-foot movement, driving, combat, wasted/respawn.
const PV_Player = (() => {
  function buildMara() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x7a2e2e, roughness: 0.8 });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x2e3a4a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.7 });
    const hairM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), jacket);
    body.position.y = 0.95; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skin);
    head.position.y = 1.52; head.castShadow = true; g.add(head);
    const pony = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.55, 8), hairM);
    pony.position.set(0, 1.35, -0.22); pony.rotation.x = 0.3; g.add(pony);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, 1.1), hairM);
    hair.position.y = 1.55; g.add(hair);
    const limbs = {};
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), jacket);
      arm.geometry.translate(0, -0.31, 0);
      arm.position.set(s * 0.34, 1.28, 0); g.add(arm); limbs[s < 0 ? 'armL' : 'armR'] = arm;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), jeans);
      leg.geometry.translate(0, -0.31, 0);
      leg.position.set(s * 0.14, 0.62, 0); g.add(leg); limbs[s < 0 ? 'legL' : 'legR'] = leg;
    }
    g.userData.limbs = limbs;
    return g;
  }
  function create(x, z) {
    const mesh = buildMara();
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const p = {
      mesh, x, z, heading: 0, speed: 0, onFoot: true, car: null,
      walkPhase: 0, shootT: 0, punchT: 0, muzzle: null,
    };
    // muzzle flash
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 }));
    flash.position.set(0, 1.3, 0.6);
    mesh.add(flash);
    p.muzzle = flash;
    G.player = p;
    return p;
  }
  function enterCar(car) {
    const p = G.player;
    if (!car || car.driver === 'player') return;
    if (car.driver && car.driver !== 'parked' && car.driver !== 'traffic' && car.driver !== 'event') return;
    if (car.driver === 'traffic' || car.driver === 'event') PV_Police.raiseWanted(1);
    if (car.gold) PV_HUD.toast('Stolen! The gold car is hot.');
    car.driver = 'player';
    p.car = car; p.onFoot = false;
    p.mesh.visible = false;
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    car.speed = 0;
    PV_Audio.unlock();
  }
  function exitCar() {
    const p = G.player;
    if (!p.car) return;
    const car = p.car;
    car.driver = 'parked'; car.speed = 0;
    p.car = null; p.onFoot = true;
    p.x = car.x + Math.cos(car.heading) * 2.5;
    p.z = car.z - Math.sin(car.heading) * 2.5;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    p.heading = car.heading;
  }
  function shoot() {
    const p = G.player;
    if (G.ammo <= 0 || p.shootT > 0) return;
    p.shootT = 0.25;
    G.ammo--;
    p.muzzle.material.opacity = 1;
    setTimeout(() => { p.muzzle.material.opacity = 0; }, 60);
    // hit the nearest ped or cop car in front
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let best = null, bd = 40;
    for (const ped of G.peds) {
      const dx = ped.x - p.x, dz = ped.z - p.z;
      const fwd = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (fwd > 0 && fwd < bd && side < 1.5) { bd = fwd; best = ped; }
    }
    if (best) {
      best.state = 'flee'; best.fleeT = 6;
      best.target = { x: best.x + (best.x - p.x) * 2, z: best.z + (best.z - p.z) * 2 };
      PV_Police.raiseWanted(1);
    }
    PV_HUD.update();
  }
  function punch() {
    const p = G.player;
    if (p.punchT > 0) return;
    p.punchT = 0.4;
    const ped = PV_Traffic.nearestPed(p.x + Math.sin(p.heading) * 1.5, p.z + Math.cos(p.heading) * 1.5, 2);
    if (ped) {
      ped.state = 'flee'; ped.fleeT = 5;
      ped.target = { x: ped.x + (ped.x - p.x) * 3, z: ped.z + (ped.z - p.z) * 3 };
      PV_Police.raiseWanted(1);
    }
  }
  function wasted() {
    G.over = true;
    PV_HUD.showWasted('WASTED');
    setTimeout(() => { respawn(); }, 2500);
  }
  function respawn() {
    const p = G.player;
    G.over = false;
    G.health = 100; G.wanted = 0; G.ammo = G.ammoMax;
    PV_Police.clearAll();
    PV_Police.setWanted(0);
    if (p.car) { p.car.driver = 'parked'; p.car = null; p.onFoot = true; p.mesh.visible = true; }
    p.x = G.spawn.x; p.z = G.spawn.z;
    p.mesh.position.set(p.x, 0, p.z);
    G.camTarget = p.mesh.position.clone();
    PV_HUD.hideWasted();
    PV_HUD.update();
    PV_HUD.toast('You woke up at the safehouse. The city is still yours.');
  }
  function update(dt) {
    const p = G.player;
    if (!p || !G.started || G.over) return;
    p.shootT = Math.max(0, p.shootT - dt);
    p.punchT = Math.max(0, p.punchT - dt);
    const k = G.keys;
    if (p.onFoot) {
      const run = k['ShiftLeft'] || k['ShiftRight'] ? 7 : 4;
      let mx = 0, mz = 0;
      if (k['KeyW'] || k['ArrowUp']) mz += 1;
      if (k['KeyS'] || k['ArrowDown']) mz -= 1;
      if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
      if (k['KeyD'] || k['ArrowRight']) mx += 1;
      if (mx || mz) {
        const len = Math.hypot(mx, mz);
        const cx = Math.sin(G.yaw), cz = Math.cos(G.yaw);
        const rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
        const dx = (cx * mz + rx * mx) / len, dz = (cz * mz + rz * mx) / len;
        p.heading = Math.atan2(dx, dz);
        p.x += dx * run * dt; p.z += dz * run * dt;
        p.walkPhase += dt * run * 1.6;
        p.speed = run;
      } else p.speed = 0;
      const rect = G.interior ? G.interior.bounds : null;
      collideCircle(p, 0.6, rect);
      // limbs swing
      const sw = p.speed > 0 ? Math.sin(p.walkPhase) * 0.5 : 0;
      const L = p.mesh.userData.limbs;
      L.armL.rotation.x = sw; L.armR.rotation.x = -sw;
      L.legL.rotation.x = -sw; L.legR.rotation.x = sw;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    } else {
      const car = p.car;
      const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
      const steer = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
      car.speed += fwd * car.accel * dt;
      car.speed -= car.speed * 0.9 * dt;
      if (Math.abs(car.speed) < 0.2 && !fwd) car.speed = 0;
      car.speed = clamp(car.speed, -12, car.top);
      const spd = Math.abs(car.speed);
      car.heading += steer * clamp(spd / 12, 0, 1) * 1.9 * dt * (car.speed >= 0 ? 1 : -1);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      collideCircle(car, 1.4);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.mesh.userData.brakeMat.emissiveIntensity = (k['KeyS'] || k['ArrowDown']) ? 1.4 : 0.2;
      p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = spd;
      // damage smoke when slow-crashed into a building (rough proxy: hard stop)
      if (Math.abs(car.speed) < 1 && fwd && hitBuilding({ x: car.x + Math.sin(car.heading) * 2, z: car.z + Math.cos(car.heading) * 2 }, 0.5)) {
        G.health = Math.max(0, G.health - 2 * dt);
        if (G.health <= 0) wasted();
      }
      if (spd > 20 && Math.abs(steer) > 0.5 && Math.random() < dt * 8) {
        const skid = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.4),
          new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 }));
        skid.rotation.x = -Math.PI / 2; skid.rotation.z = car.heading;
        skid.position.set(car.x - Math.sin(car.heading) * 1.4, 0.03, car.z - Math.cos(car.heading) * 1.4);
        G.scene.add(skid);
        setTimeout(() => G.scene.remove(skid), 12000);
      }
    }
  }
  return { create, enterCar, exitCar, shoot, punch, wasted, respawn, update };
})();
