// Porto Verde — save: localStorage (key porto-verde-save-v1). Persists money,
// health, coins, best race time, missions done and the player's position.
import { G, CFG } from './state.js';

export function saveGame() {
  try {
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({
      money: G.money, health: G.health,
      coinsGot: G.coinsGot, raceBest: G.raceBest,
      missionsDone: G.missionsDone, missionIdx: G.missionIdx,
      pos: { x: G.player.pos.x, z: G.player.pos.z },
      dayT: G.dayT,
    }));
  } catch (e) { /* storage unavailable: the game still runs */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function applySave(s) {
  if (!s) return;
  G.money = s.money ?? CFG.MONEY_START;
  G.health = s.health ?? CFG.HEALTH_MAX;
  G.coinsGot = s.coinsGot || [];
  G.raceBest = s.raceBest ?? null;
  G.missionsDone = s.missionsDone || [false, false, false];
  G.missionIdx = s.missionIdx || 0;
  if (s.dayT !== undefined) G.dayT = s.dayT;
  // restore collected coins
  for (const idx of G.coinsGot) {
    const coin = G.coins[idx];
    if (coin) { coin.got = true; coin.mesh.visible = false; }
  }
  if (s.pos) G.savePos = s.pos;
}
