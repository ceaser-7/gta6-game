// Saving: the player's progress lives in localStorage, nothing leaves the machine.
// One clear job: save, load, and forget a Porto Verde run.
const KEY = 'porto-verde-save-v1';

export function saveGame(G) {
  try {
    const data = {
      money: G.money,
      missionIndex: G.missionIndex,
      health: Math.round(G.player.health),
      pos: { x: Math.round(G.player.pos.x), z: Math.round(G.player.pos.z) },
      onFoot: G.player.onFoot,
      time: Math.round(G.time),
      savedAt: Date.now(),
      // v5: side-activity progress
      coins: G.coinsCollected ? [...G.coinsCollected] : [],
      raceBest: G.raceBest ?? null,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable: the run just does not persist */ }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.missionIndex !== 'number') return null;
    return d;
  } catch (e) { return null; }
}

export function hasSave() {
  return !!loadSave();
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
