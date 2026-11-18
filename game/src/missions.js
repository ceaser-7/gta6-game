// Missions: M1 The Tail ($400), M2 The Getaway Car ($800), M3 The Dragnet ($2,300).
// Each has a 240s timer. Checkpoints and the safehouse sit ON roads / open
// ground, never inside buildings (generous radii: 20m checkpoints, 16m safehouse).
const PV_Missions = (() => {
  const VAN_ROUTE = [
    { x: -384, z: -320 }, { x: -384, z: 320 }, { x: 320, z: 320 },
    { x: 320, z: -320 }, { x: -384, z: -320 },
  ];
  const M3_CPS = [
    { x: 320, z: -320 }, { x: -320, z: -320 }, { x: -320, z: 320 }, { x: 320, z: 320 },
  ];
  const M3_SAFE = { x: 64, z: 64 };
  let beacon = null;
  function beaconMesh() {
    if (beacon) return beacon;
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    pillar.position.y = 30; g.add(pillar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; g.add(ring);
    const dia = new THREE.Mesh(new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    dia.position.y = 12; g.add(dia);
    g.visible = false;
    G.scene.add(g);
    beacon = g;
    return g;
  }
  function setBeacon(x, z, on) {
    const b = beaconMesh();
    b.visible = !!on;
    if (on) b.position.set(x, 0, z);
    G.beaconTarget = on ? { x, z } : null;
  }
  function startMission(idx) {
    if (G.mission) { PV_HUD.toast('Finish the current job first.'); return false; }
    if (G.missionsDone[idx]) { PV_HUD.toast('That job is already done.'); return false; }
    const m = { idx, timer: 240, phase: 'start' };
    if (idx === 0) {
      m.phase = 'tail'; m.tailTime = 0; m.vanWp = 0;
      m.van = PV_Vehicles.makeCar('van', VAN_ROUTE[0].x, VAN_ROUTE[0].z, 0, 0x6a4a2a);
      m.van.driver = 'mission'; G.cars.push(m.van);
      m.pickup = { x: -128, z: 128 }; m.deliver = { x: 256, z: -256 };
      PV_Dialogue.showDialog('Rook', 'Follow that brown courier van. Stay close, but not too close. When it stops, grab the package and bring it to the drop.');
      setBeacon(m.van.x, m.van.z, true);
      PV_HUD.mission('MISSION 1 — THE TAIL · follow the brown van · ' + fmtTime(m.timer));
    } else if (idx === 1) {
      m.phase = 'steal';
      m.gold = PV_Vehicles.makeCar('sports', 256, 192, Math.PI / 2, 0xd8b83a);
      m.gold.driver = 'parked'; m.gold.gold = true; G.cars.push(m.gold);
      m.deliver = { x: -320, z: 320 };
      PV_Dialogue.showDialog('Rook', 'A gold sports car is parked uptown. Take it — quietly — and bring it to the garage on the west side.');
      setBeacon(256, 192, true);
      PV_HUD.mission('MISSION 2 — THE GETAWAY CAR · steal the gold car · ' + fmtTime(m.timer));
    } else {
      m.phase = 'run'; m.cp = 0;
      G.wanted = 5; PV_Police.setWanted(5);
      PV_Story.play('beforeM3');
      setBeacon(M3_CPS[0].x, M3_CPS[0].z, true);
      PV_HUD.mission('MISSION 3 — THE DRAGNET · 5 stars · reach the safehouse · ' + fmtTime(m.timer));
    }
    G.mission = m;
    return true;
  }
  function failMission(why) {
    const m = G.mission;
    if (!m) return;
    if (m.van) { const i = G.cars.indexOf(m.van); if (i >= 0) G.cars.splice(i, 1); G.scene.remove(m.van.mesh); }
    if (m.gold && m.phase === 'steal') { const i = G.cars.indexOf(m.gold); if (i >= 0) G.cars.splice(i, 1); G.scene.remove(m.gold.mesh); }
    G.mission = null;
    setBeacon(0, 0, false);
    PV_HUD.mission(null);
    PV_HUD.toast('Mission failed — ' + why);
  }
  function completeMission() {
    const m = G.mission;
    if (!m) return;
    const pay = [400, 800, 2300][m.idx];
    G.money += pay;
    G.missionsDone[m.idx] = true;
    if (m.van) { const i = G.cars.indexOf(m.van); if (i >= 0) G.cars.splice(i, 1); G.scene.remove(m.van.mesh); }
    G.mission = null;
    setBeacon(0, 0, false);
    PV_HUD.mission(null);
    PV_HUD.missionCard('MISSION PASSED', '+$' + pay);
    PV_HUD.update();
    PV_Save.save();
    if (m.idx === 0) PV_Story.play('afterM1');
    if (m.idx === 1) PV_Story.play('afterM2');
    if (m.idx === 2) { PV_Story.play('epilogue'); G.wanted = 0; PV_Police.setWanted(0); }
  }
  function update(dt) {
    const m = G.mission;
    if (!m) return;
    m.timer -= dt;
    if (m.timer <= 0) { failMission('out of time'); return; }
    const p = G.player;
    if (m.idx === 0) {
      const van = m.van;
      // van drives its fixed route; waits if the player is >60m behind,
      // speeds up if the player is <5m behind.
      const wp = VAN_ROUTE[m.vanWp];
      const dWp = dist2(van.x, van.z, wp.x, wp.z);
      if (dWp < 6) m.vanWp = (m.vanWp + 1) % VAN_ROUTE.length;
      const pd = dist2(p.x, p.z, van.x, van.z);
      let vSpeed = 10;
      if (pd > 60) vSpeed = 0;
      else if (pd < 5) vSpeed = 16;
      const wantH = Math.atan2(wp.x - van.x, wp.z - van.z);
      van.heading += angDiff(wantH, van.heading) * Math.min(1, dt * 2);
      van.x += Math.sin(van.heading) * vSpeed * dt;
      van.z += Math.cos(van.heading) * vSpeed * dt;
      van.mesh.position.set(van.x, 0, van.z);
      van.mesh.rotation.y = van.heading;
      if (m.phase === 'tail') {
        if (pd >= 5 && pd <= 60) m.tailTime += dt;
        setBeacon(van.x, van.z, true);
        PV_HUD.mission('MISSION 1 — THE TAIL · stay 5–60m behind · ' + Math.floor(m.tailTime) + '/20s · ' + fmtTime(m.timer));
        if (m.tailTime >= 20) {
          m.phase = 'pickup';
          setBeacon(m.pickup.x, m.pickup.z, true);
          PV_HUD.toast('Tail done — grab the package at the pickup point.');
        }
      } else if (m.phase === 'pickup') {
        setBeacon(m.pickup.x, m.pickup.z, true);
        PV_HUD.mission('MISSION 1 — THE TAIL · pick up the package · ' + fmtTime(m.timer));
        if (dist2(p.x, p.z, m.pickup.x, m.pickup.z) < 6) {
          m.phase = 'deliver';
          setBeacon(m.deliver.x, m.deliver.z, true);
          PV_HUD.toast('Package secured — deliver it to the drop.');
        }
      } else if (m.phase === 'deliver') {
        setBeacon(m.deliver.x, m.deliver.z, true);
        PV_HUD.mission('MISSION 1 — THE TAIL · deliver the package · ' + fmtTime(m.timer));
        if (dist2(p.x, p.z, m.deliver.x, m.deliver.z) < 6) completeMission();
      }
    } else if (m.idx === 1) {
      if (m.phase === 'steal') {
        setBeacon(m.gold.x, m.gold.z, true);
        PV_HUD.mission('MISSION 2 — THE GETAWAY CAR · steal the gold car · ' + fmtTime(m.timer));
        if (p.car === m.gold) {
          m.phase = 'deliver';
          setBeacon(m.deliver.x, m.deliver.z, true);
          PV_HUD.toast('Gold car taken — get it to the garage.');
        }
      } else {
        setBeacon(m.deliver.x, m.deliver.z, true);
        PV_HUD.mission('MISSION 2 — THE GETAWAY CAR · deliver to the garage · ' + fmtTime(m.timer));
        if (p.car === m.gold && dist2(p.x, p.z, m.deliver.x, m.deliver.z) < 8) completeMission();
      }
    } else {
      if (m.cp < M3_CPS.length) {
        const cp = M3_CPS[m.cp];
        setBeacon(cp.x, cp.z, true);
        PV_HUD.mission('MISSION 3 — THE DRAGNET · checkpoint ' + (m.cp + 1) + '/' + M3_CPS.length + ' · ' + fmtTime(m.timer));
        if (dist2(p.x, p.z, cp.x, cp.z) < 20) {
          m.cp++;
          if (m.cp >= M3_CPS.length) {
            setBeacon(M3_SAFE.x, M3_SAFE.z, true);
            PV_HUD.toast('All checkpoints — reach the safehouse!');
          }
        }
      } else {
        setBeacon(M3_SAFE.x, M3_SAFE.z, true);
        PV_HUD.mission('MISSION 3 — THE DRAGNET · reach the safehouse · ' + fmtTime(m.timer));
        if (dist2(p.x, p.z, M3_SAFE.x, M3_SAFE.z) < 16) completeMission();
      }
    }
  }
  return { startMission, update, completeMission, failMission, M3_CPS, M3_SAFE, VAN_ROUTE };
})();
