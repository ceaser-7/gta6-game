// Porto Verde — save: localStorage, key porto-verde-save-v1.
import { G, SAVE_KEY, clamp } from './state.js';

export function saveGame() {
  const p = G.player;
  const data = {
    money: Math.floor(p.money),
    health: Math.round(p.health),
    coinGot: [...G.coinGot],
    raceBest: G.race.best,
    missionsDone: [...G.missionsDone],
    x: Math.round(p.x), z: Math.round(p.z), dayT: Math.round(G.dayT),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  return data;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function applySave(data) {
  if (!data) return false;
  const p = G.player;
  p.money = data.money ?? 200;
  p.health = data.health ?? 100;
  G.coinGot = [...(data.coinGot ?? [])];
  for (const coin of G.coins) {
    if (G.coinGot.includes(coin.i)) { coin.got = true; G.scene.remove(coin.mesh); }
  }
  G.race.best = data.raceBest ?? null;
  G.missionsDone = [...(data.missionsDone ?? [false, false, false])];
  p.x = clamp(data.x ?? 0, -440, 440);
  p.z = clamp(data.z ?? 120, -440, 440);
  G.dayT = clamp(data.dayT ?? 40, 0, 240);
  return true;
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
