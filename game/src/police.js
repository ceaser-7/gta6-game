// Police: wanted 0-5 stars, pursuit cars + foot officers, roadblocks at 3+,
// bust/wasted, lose-the-cops by breaking line of sight.
const PV_Police = (() => {
  let cops = [], officers = [], roadblocks = [], loseT = 0, bustT = 0, spawnT = 0;
  function setWanted(n) {
    G.wanted = clamp(n, 0, 5);
    PV_HUD.update();
  }
  function raiseWanted(n) { setWanted(Math.min(5, G.wanted + n)); }
  function spawnCop() {
    const p = G.player;
    const a = rand(0, Math.PI * 2);
    const x = clamp(p.x + Math.sin(a) * 60, -420, 420);
    const z = clamp(p.z + Math.cos(a) * 60, -420, 420);
    const car = PV_Vehicles.makeCar('sedan', x, z, Math.atan2(p.x - x, p.z - z), 0x1a1a1a);
    car.driver = 'cop';
    // police light bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2020, emissiveIntensity: 1.2 }));
    bar.position.set(0, 1.55, -0.1);
    car.mesh.add(bar);
    car.lightBar = bar;
    G.cars.push(car);
    cops.push(car);
    return car;
  }
  function spawnOfficer() {
    const p = G.player;
    const a = rand(0, Math.PI * 2);
    const o = PV_Traffic.makePed(clamp(p.x + Math.sin(a) * 25, -420, 420), clamp(p.z + Math.cos(a) * 25, -420, 420),
      { shirt: 0x1a2a4a, pants: 0x1a1a1a, skin: 0xc9a184, state: 'walk', name: 'Officer' });
    o.kind = 'officer';
    officers.push(o);
    return o;
  }
  function spawnRoadblock() {
    const p = G.player;
    // a roadblock ahead of the player on their current road
    const ahead = { x: p.x + Math.sin(p.heading || 0) * 40, z: p.z + Math.cos(p.heading || 0) * 40 };
    const rp = roadPoint(ahead.x, ahead.z);
    const cars = [];
    for (const s of [-1, 1]) {
      const c = PV_Vehicles.makeCar('sedan', rp.x + s * 3, rp.z, 0, 0x1a1a1a);
      c.driver = 'roadblock';
      cars.push(c); G.cars.push(c); roadblocks.push(c);
    }
    const o = spawnOfficer();
    o.x = rp.x; o.z = rp.z + 4; o.target = null;
    PV_HUD.toast('Police roadblock ahead!');
  }
  function losBlocked() {
    // line of sight to the nearest cop: blocked if a building sits between
    const p = G.player;
    for (const c of cops) {
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 80) continue;
      let blocked = false;
      for (let t = 0.1; t < 1; t += 0.1) {
        if (hitBuilding({ x: p.x + dx * t, z: p.z + dz * t }, 1)) { blocked = true; break; }
      }
      if (!blocked) return false;
    }
    return cops.length > 0;
  }
  function update(dt) {
    const p = G.player;
    if (!p || !G.started || G.over) return;
    const want = G.wanted;
    // spawn pursuit to match wanted level
    spawnT -= dt;
    if (want > 0 && cops.length < want && spawnT <= 0) { spawnCop(); spawnT = 3; }
    if (want >= 3 && officers.length < want - 2 && spawnT <= 0) { spawnOfficer(); spawnT = 4; }
    if (want >= 3 && roadblocks.length === 0 && Math.random() < dt * 0.05) spawnRoadblock();
    // lose-the-cops: break line of sight to drop a star (10s low, longer high)
    const need = [0, 10, 10, 20, 30, 40][want] || 0;
    if (want > 0 && losBlocked()) {
      loseT += dt;
      if (loseT >= need) { setWanted(want - 1); loseT = 0; PV_HUD.toast('You lost them — wanted down to ' + G.wanted + ' star' + (G.wanted === 1 ? '' : 's')); }
    } else loseT = 0;
    // cop cars chase
    for (let i = cops.length - 1; i >= 0; i--) {
      const c = cops[i];
      const d = dist2(c.x, c.z, p.x, p.z);
      const wantH = Math.atan2(p.x - c.x, p.z - c.z);
      c.heading += angDiff(wantH, c.heading) * Math.min(1, dt * 2.5);
      const target = Math.min(38, 20 + want * 3);
      c.speed = lerp(c.speed, d > 6 ? target : 0, dt);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      if (c.lightBar) c.lightBar.material.emissive.setHex(Math.floor(G.time * 4) % 2 ? 0xff2020 : 0x2020ff);
      // ram the player: bust if on foot and close, damage if driving
      if (d < 3.5) {
        if (p.onFoot) {
          bustT += dt;
          if (bustT > 1.5) { bust(); return; }
        } else {
          G.health -= 20 * dt;
          if (G.health <= 0) { PV_Player.wasted(); return; }
        }
      }
      // despawn far cops when wanted drops
      if (want === 0) { G.cars.splice(G.cars.indexOf(c), 1); G.scene.remove(c.mesh); cops.splice(i, 1); }
    }
    // foot officers chase on foot
    for (let i = officers.length - 1; i >= 0; i--) {
      const o = officers[i];
      const d = dist2(o.x, o.z, p.x, p.z);
      o.target = { x: p.x, z: p.z };
      const wantH = Math.atan2(p.x - o.x, p.z - o.z);
      o.heading += angDiff(wantH, o.heading) * Math.min(1, dt * 3);
      o.x += Math.sin(o.heading) * 4.5 * dt;
      o.z += Math.cos(o.heading) * 4.5 * dt;
      collideCircle(o, 0.6);
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = o.heading;
      if (d < 2 && p.onFoot) {
        bustT += dt;
        if (bustT > 1) { bust(); return; }
      }
      if (want === 0) { G.peds.splice(G.peds.indexOf(o), 1); G.scene.remove(o.mesh); officers.splice(i, 1); }
    }
    if (want === 0) {
      for (const c of roadblocks) { G.cars.splice(G.cars.indexOf(c), 1); G.scene.remove(c.mesh); }
      roadblocks = [];
    }
  }
  function bust() {
    G.over = true;
    PV_HUD.showWasted('BUSTED');
    setTimeout(() => { PV_Player.respawn(); }, 2500);
  }
  function clearAll() {
    for (const c of cops) { G.cars.splice(G.cars.indexOf(c), 1); G.scene.remove(c.mesh); }
    for (const o of officers) { G.peds.splice(G.peds.indexOf(o), 1); G.scene.remove(o.mesh); }
    for (const c of roadblocks) { G.cars.splice(G.cars.indexOf(c), 1); G.scene.remove(c.mesh); }
    cops = []; officers = []; roadblocks = []; bustT = 0; loseT = 0;
  }
  return { update, setWanted, raiseWanted, bust, clearAll, spawnCop };
})();
