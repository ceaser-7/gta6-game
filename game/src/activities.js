// Side activities: 12 hidden Verde Coins + the Sunset Sprint timed race.
const PV_Activities = (() => {
  // Coin spots: all on roads (road centrelines) or open ground (beach) —
  // never inside a building block, or the player gets pushed out by collision.
  const SPOTS = [
    { x: -384, z: 0 }, { x: 0, z: -384 }, { x: 320, z: 96 }, { x: -320, z: -96 },
    { x: 64, z: -320 }, { x: -64, z: 320 }, { x: 192, z: 192 }, { x: -192, z: -192 },
    { x: 128, z: -128 }, { x: 256, z: 0 }, { x: -256, z: 64 }, { x: 416, z: 64 },
  ];
  // Race route: a loop on road centrelines. The start arch sits ON the
  // north-south road at x=-384 (a real road), so a driver finds it by driving.
  const RACE = {
    arch: { x: -384, z: -160 },
    cps: [
      { x: -384, z: 224 }, { x: 0, z: 320 }, { x: 320, z: 320 },
      { x: 320, z: -224 }, { x: -128, z: -320 },
    ],
  };
  let coinMeshes = [], archMesh = null, cpMeshes = [];
  function build() {
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xa87800, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.3 });
    const geo = new THREE.TorusGeometry(0.9, 0.28, 10, 20);
    for (let i = 0; i < SPOTS.length; i++) {
      const m = new THREE.Mesh(geo, gold);
      m.position.set(SPOTS[i].x, 1.4, SPOTS[i].z);
      G.scene.add(m);
      coinMeshes.push(m);
      G.coins.push({ x: SPOTS[i].x, z: SPOTS[i].z, mesh: m, got: false, idx: i });
    }
    // race arch: two posts + beam across the road at x=-384
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1c2430, emissive: 0xffd23e, emissiveIntensity: 0.5, roughness: 0.6 });
    archMesh = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.8), archMat);
      post.position.set(-384 + s * 5, 3, -160); archMesh.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 1), archMat);
    beam.position.set(-384, 6, -160); archMesh.add(beam);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0.9 }));
    flag.position.set(-384, 4.6, -160); archMesh.add(flag);
    G.scene.add(archMesh);
    // checkpoint rings
    const ringGeo = new THREE.TorusGeometry(6, 0.5, 8, 24);
    for (const cp of RACE.cps) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xff8a3d, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 }));
      m.position.set(cp.x, 2.5, cp.z);
      m.rotation.y = Math.PI / 2;
      m.visible = false;
      G.scene.add(m);
      cpMeshes.push(m);
    }
  }
  function update(dt) {
    // spin coins, collect within 3 m
    for (const c of G.coins) {
      if (c.got) continue;
      c.mesh.rotation.y += dt * 2.5;
      c.mesh.position.y = 1.4 + Math.sin(G.time * 2 + c.idx) * 0.25;
      if (G.player && dist2(G.player.x, G.player.z, c.x, c.z) < 3) {
        c.got = true; c.mesh.visible = false;
        G.coinGot.push(c.idx);
        PV_HUD.toast('Verde Coin ' + G.coinGot.length + '/12');
        PV_HUD.update();
        if (G.coinGot.length === 12) {
          G.money += 500;
          PV_Story.play('coins');
          PV_HUD.toast('All 12 coins · +$500');
        }
      }
    }
    // race
    const r = G.race;
    if (r) {
      r.t -= dt;
      if (r.t <= 0) { endRace(false); return; }
      const cp = RACE.cps[r.cp];
      if (cp && G.player && dist2(G.player.x, G.player.z, cp.x, cp.z) < 8) {
        cpMeshes[r.cp].visible = false;
        r.cp++;
        if (r.cp >= RACE.cps.length) { endRace(true); return; }
        cpMeshes[r.cp].visible = true;
        PV_HUD.toast('Checkpoint ' + r.cp + '/5');
      }
      PV_HUD.race(r);
    } else if (G.player && !G.player.onFoot && G.player.car) {
      // drive through the arch to start
      const p = G.player;
      if (dist2(p.x, p.z, RACE.arch.x, RACE.arch.z) < 8 && G.time - (G.raceCooldown || -99) > 10) {
        G.race = { t: 90, cp: 0, start: G.time };
        cpMeshes[0].visible = true;
        PV_HUD.toast('Sunset Sprint started — 90s, 5 checkpoints!');
      }
    }
  }
  function endRace(done) {
    const r = G.race;
    G.race = null;
    for (const m of cpMeshes) m.visible = false;
    PV_HUD.race(null);
    G.raceCooldown = G.time;
    if (!done) { PV_HUD.toast('Sunset Sprint — time up!'); return; }
    const elapsed = G.time - r.start;
    const bonus = Math.min(200, Math.max(0, Math.floor((90 - elapsed)) * 5));
    const pay = 300 + bonus;
    G.money += pay;
    if (!G.raceBest || elapsed < G.raceBest) G.raceBest = Math.round(elapsed * 10) / 10;
    PV_HUD.toast('Sunset Sprint finished · +$' + pay + ' · best ' + G.raceBest + 's');
    PV_HUD.update();
    PV_Save.save();
  }
  function resetCoins() {
    for (const c of G.coins) { c.got = false; c.mesh.visible = true; }
    G.coinGot = [];
  }
  return { build, update, resetCoins, RACE, SPOTS };
})();
