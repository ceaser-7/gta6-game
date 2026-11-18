// Save / Continue via localStorage.
import { G } from './state.js';

export function saveGame() {
  if (!G.player) return;
  try {
    const data = {
      cash: G.cash, respect: G.respect, debt: G.debt,
      coins: G.coins, coinsGot: G.coinsGot, chapter: G.chapter,
      day: G.day, timeOfDay: G.timeOfDay,
      weapon: G.weapon, ammo: G.ammo,
      weaponsUnlocked: G.weapons.map(w => !w.locked),
      px: G.player.pos.x, pz: G.player.pos.z, heading: G.player.heading,
      health: G.player.health,
    };
    localStorage.setItem(G.saveKey, JSON.stringify(data));
  } catch (e) { /* storage unavailable (e.g. file://) */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(G.saveKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function hasSave() {
  try { return !!localStorage.getItem(G.saveKey); } catch (e) { return false; }
}

export function applySave(d) {
  if (!d) return;
  G.cash = d.cash ?? 0; G.respect = d.respect ?? 0; G.debt = d.debt ?? 40000;
  G.coins = d.coins ?? 0; G.coinsGot = d.coinsGot ?? {};
  G.chapter = d.chapter ?? 0; G.day = d.day ?? 1; G.timeOfDay = d.timeOfDay ?? 18;
  G.weapon = d.weapon ?? 0;
  if (d.ammo) G.ammo = d.ammo;
  if (d.weaponsUnlocked) d.weaponsUnlocked.forEach((un, i) => { if (G.weapons[i]) G.weapons[i].locked = !un; });
  if (G.player) {
    G.player.pos.x = d.px ?? 0; G.player.pos.z = d.pz ?? 40;
    G.player.heading = d.heading ?? 0;
    G.player.health = d.health ?? 100;
    G.player.mesh.position.set(G.player.pos.x, 0, G.player.pos.z);
    G.player.mesh.rotation.y = G.player.heading;
  }
  // Hide collected coins
  for (const coin of G.world.coins) {
    if (G.coinsGot[coin.userData.coinIdx]) coin.visible = false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(G.saveKey); } catch (e) {}
}
