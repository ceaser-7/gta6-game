// Living world: street events every 45-75s (fender-bender or police stop).
const PV_Events = (() => {
  function spawnEvent() {
    const kind = Math.random() < 0.6 ? 'fender' : 'stop';
    // pick a road spot
    const k = randi(0, 14), along = rand(-380, 380);
    const horiz = Math.random() < 0.5;
    const c = -448 + k * 64;
    const x = horiz ? along : c, z = horiz ? c : along;
    const heading = horiz ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const cars = [];
    if (kind === 'fender') {
      const c1 = PV_Vehicles.makeCar('sedan', x, z, heading, 0x8a3a3a);
      const c2 = PV_Vehicles.makeCar('suv', x + Math.sin(heading) * 5, z + Math.cos(heading) * 5, heading + 0.5, 0x3a5a8a);
      c1.driver = 'event'; c2.driver = 'event';
      cars.push(c1, c2);
    } else {
      const c1 = PV_Vehicles.makeCar('sedan', x, z, heading, 0x2e2e2e);
      c1.driver = 'event'; cars.push(c1);
    }
    for (const c of cars) G.cars.push(c);
    // a driver ped standing by
    const ped = PV_Traffic.makePed(x + 3, z + 2, { state: 'stand' });
    ped.eventPed = true; ped.standT = 45;
    G.event = { kind, cars, ped, t: 40, cleared: false };
    PV_HUD.toast(kind === 'fender' ? 'Street event: fender-bender ahead' : 'Street event: police stop ahead');
  }
  function clearEvent() {
    const e = G.event;
    if (!e) return;
    e.cleared = true;
    for (const c of e.cars) {
      // if the player stole an event car, it is not restored
      if (c.driver === 'player') continue;
      const i = G.cars.indexOf(c);
      if (i >= 0) G.cars.splice(i, 1);
      G.scene.remove(c.mesh);
    }
    if (e.ped) {
      const i = G.peds.indexOf(e.ped);
      if (i >= 0) G.peds.splice(i, 1);
      G.scene.remove(e.ped.mesh);
    }
    G.event = null;
    G.eventT = rand(45, 75);
  }
  function update(dt) {
    if (G.event) {
      G.event.t -= dt;
      if (G.event.t <= 0) clearEvent();
      return;
    }
    if (!G.started || G.over) return;
    G.eventT -= dt;
    if (G.eventT <= 0) spawnEvent();
  }
  return { update, spawnEvent, clearEvent };
})();
