// Porto Verde — staged screenshot scenes (talk / interior / race / coins).
// Called by the test harness through window.PV.shot(name). Each shot first
// clears every stale overlay (cards, briefs, toasts, dialogs) and any interior
// or race state, so the frame shows only what the shot stages.
import { G } from './state.js';
import { enterInterior } from './interiors.js';

function clearOverlays() {
  G.dialog = null;
  G.dialogQueue = [];
  G.interior = null;
  G.race.active = false;
  G.hidePlayer = false;
  for (const id of ['card', 'brief', 'toast', 'dialog']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}

export function stageShot(name) {
  const p = G.player;
  clearOverlays();
  if (name === 'talk') {
    // Rosa's dialog at the Old Town market, bright afternoon, Mara facing her.
    p.onFoot = true; p.car = null;
    p.x = -260; p.z = 250; p.yaw = -0.59;
    G.dayT = 60;
    const rosa = G.peds.find((ped) => ped.namedKey === 'rosa');
    if (rosa) { rosa.x = -264; rosa.z = 256; rosa.mesh.position.set(-264, 0, 256); }
    if (G.playerMesh) G.playerMesh.visible = true;
    if (G.snapCamera) G.snapCamera();
    G.ui.dialog && G.ui.dialog('Rosa', 'Morning, Mara. The oranges are sweeter than they look.');
  } else if (name === 'interior') {
    // Inside El Faro: Mara at the south end facing the counter and Tomas.
    const room = G.rooms.find((r) => r.id === 'elfaro');
    if (room) {
      enterInterior(room);
      // stand at the counter's east end, facing Tomas, Mara hidden so she
      // does not block him from the camera
      p.x = room.room.x - 2; p.z = room.bounds.z1 - 7.5; p.yaw = -1.93;
      G.hidePlayer = true;
      if (G.snapCamera) G.snapCamera();
      G.ui.dialog && G.ui.dialog('Tomas', 'Tacos, coffee, soda. The menu is on the wall, the prices are honest.');
    }
  } else if (name === 'race') {
    // At the start arch, in the car, race HUD live.
    const car = G.starterCar;
    p.x = -384; p.z = -140; p.yaw = Math.PI;
    if (car) {
      car.x = -384; car.z = -140; car.yaw = Math.PI;
      car.mesh.position.set(-384, 0, -140); car.mesh.rotation.y = Math.PI;
      p.onFoot = false; p.car = car;
    }
    if (G.playerMesh) G.playerMesh.visible = false;
    G.race.active = true; G.race.cp = 1; G.race.t = 82;
    if (G.snapCamera) G.snapCamera();
  } else if (name === 'coins') {
    // Night street, headlight on, a coin ahead.
    p.onFoot = true; p.car = null;
    p.x = 60; p.z = -380; p.yaw = 0;
    G.dayT = 200;
    const coin = G.coins.find((c) => !c.got);
    if (coin) { coin.x = 64; coin.z = -360; coin.mesh.position.set(64, 1.2, -360); }
    if (G.playerMesh) G.playerMesh.visible = true;
    if (G.snapCamera) G.snapCamera();
  }
  G.ui.updateHud && G.ui.updateHud();
}
