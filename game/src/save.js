// Save: localStorage key porto-verde-save-v1.
const PV_Save = (() => {
  const KEY = 'porto-verde-save-v1';
  function save() {
    try {
      const p = G.player;
      localStorage.setItem(KEY, JSON.stringify({
        money: G.money, health: G.health,
        coinsGot: G.coinGot.slice(), raceBest: G.raceBest,
        missionsDone: G.missionsDone.slice(),
        x: p ? p.x : G.spawn.x, z: p ? p.z : G.spawn.z,
      }));
    } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function has() { return !!load(); }
  function apply(s) {
    if (!s) return;
    G.money = s.money ?? 200;
    G.health = s.health ?? 100;
    G.coinGot = (s.coinsGot ?? []).slice();
    G.raceBest = s.raceBest ?? null;
    G.missionsDone = (s.missionsDone ?? [false, false, false]).slice();
    for (const c of G.coins) c.got = G.coinGot.includes(c.idx);
    for (const c of G.coins) c.mesh.visible = !c.got;
    if (s.x !== undefined && Math.abs(s.x) < 440 && Math.abs(s.z) < 440) {
      G.spawn = { x: s.x, z: s.z };
    }
  }
  return { save, load, has, apply };
})();
