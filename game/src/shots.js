// Staged screenshot scenes (?shot=talk|interior|race|coins) + ?low test mode
// (640x360, no shadows) for headless runs. Scenes run after the game starts.
const PV_Shots = (() => {
  function params() { return new URLSearchParams(location.search); }
  function isLow() { return params().has('low'); }
  function shotName() { return params().get('shot'); }
  function placePlayer(x, z, heading) {
    const p = G.player;
    if (p.car) PV_Player.exitCar();
    p.x = x; p.z = z; p.heading = heading;
    p.mesh.position.set(x, 0, z);
    p.mesh.rotation.y = heading;
    G.yaw = heading;
    G.camTarget = p.mesh.position.clone();
  }
  function apply() {
    const shot = shotName();
    if (!shot) return;
    G.dayT = 18; // golden hour for every shot
    if (shot === 'talk') {
      placePlayer(-264, 250, Math.PI);
      const rosa = G.named.rosa;
      PV_Dialogue.talkTo(rosa);
    } else if (shot === 'interior') {
      PV_Interiors.enterRoom(G.rooms[0]);
      placePlayer(600, 601, Math.PI);
      const tomas = G.rooms[0].vendor;
      tomas.x = 596.5; tomas.z = 596.2;
      PV_Dialogue.showDialog('Tomas', 'Welcome to El Faro. Tacos are ten, coffee is five. Sit anywhere.');
    } else if (shot === 'race') {
      // put Mara in a car at the arch, race running
      const car = PV_Vehicles.makeCar('sports', -384, -176, 0, 0xc23a2e);
      car.driver = 'parked'; G.cars.push(car);
      placePlayer(-384, -176, 0);
      PV_Player.enterCar(car);
      G.race = { t: 83, cp: 1, start: G.time };
      PV_HUD.race(G.race);
    } else if (shot === 'coins') {
      placePlayer(64, 300, Math.PI);
      G.yaw = Math.PI;
    }
    PV_HUD.update();
  }
  return { isLow, shotName, apply };
})();
