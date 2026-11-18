// HUD: mission card, cash/respect/clock/stars, circular minimap with coastline,
// full-screen island map (Tab), dialogue boxes, toasts, menus.
import { G, WORLD, DISTRICTS, CHAPTERS, CREW, STATIONS, fmtCash, fmtClock, respectLevel } from './state.js';

const $ = id => document.getElementById(id);
let toastTimer = null, dlgTimer = null;

// ---- Minimap (circular canvas): coastline + water + city + markers ----
const MM = { size: 190, range: 520 };
export function drawMinimap() {
  const c = $('minimap'); if (!c || !G.player) return;
  const x = c.getContext('2d'), S = MM.size, R = MM.range;
  const px = G.player.pos.x, pz = G.player.pos.z;
  const toMM = (wx, wz) => [S / 2 + (wx - px) / R * S / 2, S / 2 + (wz - pz) / R * S / 2];
  // Water
  x.fillStyle = '#0b4a6b'; x.fillRect(0, 0, S, S);
  // Island (sand) — circle centred on the island centre
  const [icx, icy] = toMM(0, 0);
  x.fillStyle = '#d9c27a';
  x.beginPath(); x.arc(icx, icy, WORLD.beachOuter / R * S / 2, 0, Math.PI * 2); x.fill();
  // City ground
  x.fillStyle = '#3a3f46';
  const [c0x, c0y] = toMM(-WORLD.cityHalf, -WORLD.cityHalf);
  x.fillRect(c0x, c0y, WORLD.cityHalf * 2 / R * S / 2, WORLD.cityHalf * 2 / R * S / 2);
  // Parks
  x.fillStyle = '#2a5a34';
  for (const [pkx, pkz] of [[-200, -200], [200, 200]]) {
    const [a, b] = toMM(pkx - 60, pkz - 60);
    x.fillRect(a, b, 120 / R * S / 2, 120 / R * S / 2);
  }
  // Roads
  x.strokeStyle = '#22252a'; x.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    const [a1, b1] = toMM(i * WORLD.block, -WORLD.cityHalf), [a2, b2] = toMM(i * WORLD.block, WORLD.cityHalf);
    x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
    const [c1, d1] = toMM(-WORLD.cityHalf, i * WORLD.block), [c2, d2] = toMM(WORLD.cityHalf, i * WORLD.block);
    x.beginPath(); x.moveTo(c1, d1); x.lineTo(c2, d2); x.stroke();
  }
  // Coastline highlight
  x.strokeStyle = '#fff'; x.lineWidth = 2;
  x.beginPath(); x.arc(icx, icy, WORLD.beachOuter / R * S / 2, 0, Math.PI * 2); x.stroke();
  // Safehouse
  const [sx, sy] = toMM(120, 280);
  x.fillStyle = '#7dff9b'; x.fillRect(sx - 3, sy - 3, 6, 6);
  // Coins
  x.fillStyle = '#ffd76a';
  for (const coin of G.world.coins) {
    if (G.coinsGot[coin.userData.coinIdx]) continue;
    const [kx, ky] = toMM(coin.position.x, coin.position.z);
    if (kx < -5 || kx > S + 5 || ky < -5 || ky > S + 5) continue;
    x.beginPath(); x.arc(kx, ky, 2.5, 0, Math.PI * 2); x.fill();
  }
  // Mission target (gold)
  if (G.mission) {
    const [tx, ty] = toMM(G.mission.target[0], G.mission.target[1]);
    x.fillStyle = '#ffb020';
    x.beginPath(); x.arc(tx, ty, 5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(tx, ty, 7, 0, Math.PI * 2); x.stroke();
  }
  // Police (red)
  x.fillStyle = '#ff5a5a';
  for (const u of G.police) {
    const [ux, uy] = toMM(u.mesh.position.x, u.mesh.position.z);
    x.beginPath(); x.arc(ux, uy, 3.5, 0, Math.PI * 2); x.fill();
  }
  // Player (white arrow, heading up)
  x.save();
  x.translate(S / 2, S / 2); x.rotate(G.player.heading);
  x.fillStyle = '#fff';
  x.beginPath(); x.moveTo(0, -8); x.lineTo(5, 6); x.lineTo(-5, 6); x.closePath(); x.fill();
  x.restore();
  // North indicator
  x.fillStyle = '#fff'; x.font = 'bold 11px Arial'; x.textAlign = 'center';
  x.fillText('N', S / 2, 13);
}

// ---- Full map (Tab) ----
export function drawFullMap() {
  const c = $('mapCanvas'); if (!c || !G.player) return;
  const x = c.getContext('2d'), S = 900, R = WORLD.half * 2;
  const toM = (wx, wz) => [(wx + WORLD.half) / R * S, (wz + WORLD.half) / R * S];
  x.fillStyle = '#0b4a6b'; x.fillRect(0, 0, S, S);
  // Shallow water + sand
  x.fillStyle = '#12708a';
  x.beginPath(); x.arc(S / 2, S / 2, WORLD.beachOuter / R * S + 30, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#d9c27a';
  x.beginPath(); x.arc(S / 2, S / 2, WORLD.beachOuter / R * S, 0, Math.PI * 2); x.fill();
  // City
  const [c0x, c0y] = toM(-WORLD.cityHalf, -WORLD.cityHalf);
  x.fillStyle = '#3a3f46'; x.fillRect(c0x, c0y, WORLD.cityHalf * 2 / R * S, WORLD.cityHalf * 2 / R * S);
  // Parks
  x.fillStyle = '#2a5a34';
  for (const [pkx, pkz] of [[-200, -200], [200, 200]]) {
    const [a, b] = toM(pkx - 60, pkz - 60);
    x.fillRect(a, b, 120 / R * S, 120 / R * S);
  }
  // Plaza
  x.fillStyle = '#8a8578';
  const [plx, ply] = toM(-40, -40); x.fillRect(plx, ply, 80 / R * S, 80 / R * S);
  // Roads
  x.strokeStyle = '#22252a'; x.lineWidth = 8;
  for (let i = -4; i <= 4; i++) {
    const [a1, b1] = toM(i * WORLD.block, -WORLD.cityHalf), [a2, b2] = toM(i * WORLD.block, WORLD.cityHalf);
    x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
    const [cc1, d1] = toM(-WORLD.cityHalf, i * WORLD.block), [cc2, d2] = toM(WORLD.cityHalf, i * WORLD.block);
    x.beginPath(); x.moveTo(cc1, d1); x.lineTo(cc2, d2); x.stroke();
  }
  // Causeway
  x.strokeStyle = '#4a4f55'; x.lineWidth = 10;
  x.beginPath(); x.moveTo(...toM(320, 40)); x.lineTo(...toM(430, 40)); x.stroke();
  // District labels
  x.fillStyle = '#fff'; x.font = 'bold 20px Arial'; x.textAlign = 'center';
  x.shadowColor = '#000'; x.shadowBlur = 4;
  for (const d of DISTRICTS) {
    const [lx, ly] = toM(d.cx, d.cz);
    x.fillText(d.label, lx, ly);
  }
  x.shadowBlur = 0;
  // Legend markers
  const mark = (wx, wz, color, r = 8) => {
    const [mx, my] = toM(wx, wz);
    x.fillStyle = color; x.beginPath(); x.arc(mx, my, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
  };
  mark(120, 280, '#7dff9b');            // safehouse
  mark(-120, -200, '#ff8c8c');          // hospital
  mark(240, 40, '#ff7bff');             // race (Marina)
  mark(0, 260, '#ff7bff', 6);           // race start (South Beach)
  mark(-240, 80, '#9fd8ff');            // weapons (El Faro area)
  if (G.mission) mark(G.mission.target[0], G.mission.target[1], '#ffb020', 11);
  x.fillStyle = '#ffd76a';
  for (const coin of G.world.coins) {
    if (G.coinsGot[coin.userData.coinIdx]) continue;
    const [kx, ky] = toM(coin.position.x, coin.position.z);
    x.beginPath(); x.arc(kx, ky, 4, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#ff5a5a';
  for (const u of G.police) { const [ux, uy] = toM(u.mesh.position.x, u.mesh.position.z); x.beginPath(); x.arc(ux, uy, 5, 0, Math.PI * 2); x.fill(); }
  // Player
  const [ppx, ppy] = toM(G.player.pos.x, G.player.pos.z);
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(ppx, ppy, 9, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke();
  // Job list + GPS
  const jl = $('jobList');
  if (jl) {
    jl.innerHTML = CHAPTERS.map((ch, i) => {
      const state = i < G.chapter ? 'done ✓' : i === G.chapter ? 'IN PROGRESS' : 'LOCKED';
      const cls = i < G.chapter ? 'done' : i === G.chapter ? 'active' : 'locked';
      return '<div class="job ' + cls + '"><div class="t">Ch ' + (i + 1) + ' — ' + ch.name + '</div><div class="p">$' + ch.pay + '</div><div class="s">' + ch.desc + ' · ' + state + '</div></div>';
    }).join('');
  }
  const gps = $('gps');
  if (gps && G.mission) {
    const d = Math.hypot(G.player.pos.x - G.mission.target[0], G.player.pos.z - G.mission.target[1]);
    gps.textContent = 'GPS: ' + Math.round(d) + 'm to objective — ' + (G.mission.stages[G.mission.stage] ? G.mission.stages[G.mission.stage].text : '');
  } else if (gps) gps.textContent = 'GPS: no active job — see Lena at the Plaza.';
}

// ---- HUD text ----
export function updateHUD() {
  if (!G.player) return;
  $('cash').textContent = fmtCash(G.cash) + (G.debt > 0 ? ' · Debt $' + G.debt.toLocaleString() : ' · DEBT CLEAR');
  $('respect').textContent = 'Respect ' + G.respect + ' · Level ' + respectLevel(G.respect);
  $('clock').textContent = fmtClock(G.day, G.timeOfDay);
  // Stars
  let stars = '';
  for (let i = 0; i < 5; i++) stars += '<span class="' + (i < G.wanted ? 'on' : 'off') + '">★</span>';
  $('stars').innerHTML = stars;
  // Mission card
  if (G.mission) {
    const ch = CHAPTERS[G.mission.chapter], s = G.mission.stages[G.mission.stage];
    $('mcChapter').textContent = 'Chapter ' + (G.mission.chapter + 1) + ' — ' + ch.name + ' · $' + ch.pay;
    $('mcObjective').textContent = s ? s.text : '';
    $('mcStage').textContent = 'Stage ' + (G.mission.stage + 1) + '/' + G.mission.stages.length;
    const nxt = G.mission.stages[G.mission.stage + 1];
    $('mcNext').textContent = nxt ? 'NEXT: ' + nxt.text : 'NEXT: Finish the job';
    $('missionTimer').textContent = G.mission.timer > 0 ? Math.ceil(G.mission.timer) + 's' : '';
  } else if (G.chapter >= CHAPTERS.length) {
    $('mcChapter').textContent = 'Debt cleared — Porto Verde is yours';
    $('mcObjective').textContent = 'Free roam. Collect coins, build respect.';
    $('mcStage').textContent = 'All 7 jobs complete';
    $('mcNext').textContent = '';
    $('missionTimer').textContent = '';
  } else {
    $('mcChapter').textContent = 'No active job';
    $('mcObjective').textContent = 'Head to the Plaza — Lena has work.';
    $('mcStage').textContent = '';
    $('mcNext').textContent = '';
    $('missionTimer').textContent = '';
  }
  // Coins
  $('coinCount').textContent = G.coins + '/' + G.coinsTotal;
  // Speed / car / ammo
  const car = G.player.car;
  if (car) {
    $('speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    $('carName').textContent = car.type.name;
    $('carCond').textContent = 'Condition ' + Math.round(car.condition) + '%';
  } else {
    $('speed').textContent = Math.round(G.player.speed * 3.6);
    $('carName').textContent = 'On foot — Mara Voss';
    $('carCond').textContent = 'Health ' + Math.round(G.player.health) + '%';
  }
  const w = G.weapons[G.weapon];
  $('weaponName').textContent = (G.weapon + 1) + ' · ' + w.name + (w.locked ? ' (locked)' : '');
  const a = G.ammo[G.weapon];
  $('ammoCount').textContent = w.mag === Infinity ? '∞' : a.mag + ' / ' + a.reserve;
  // Radio
  const station = STATIONS[G.radioStation];
  $('radioStation').textContent = station.name;
  $('radioSong').textContent = station.songs[G.radioSong % station.songs.length];
  // Police panel
  const panel = $('policePanel');
  if (G.wanted > 0 && G.police.length) {
    panel.classList.remove('hidden');
    $('policeUnits').innerHTML = G.police.map(u =>
      '<div class="unit"><span>' + (u.callsign || 'UNIT') + '</span><span>' + Math.round(u.dist || 0) + 'm</span><span class="beh">' + (u.behaviour || 'PURSUIT') + '</span></div>'
    ).join('') + (G.heli ? '<div class="unit"><span>HELI 1</span><span>—</span><span class="beh">AIRSUPPORT</span></div>' : '');
  } else panel.classList.add('hidden');
  drawMinimap();
}

// ---- Toast / dialogue ----
export function toast(msg, ms = 3200) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
export function say(who, line, ms = 4200) {
  const c = CREW[who] || { name: who, color: '#555', initial: '?' };
  $('portrait').textContent = c.initial;
  $('portrait').style.background = c.color;
  $('dlgWho').textContent = c.name + ' — ' + (c.role || '');
  $('dlgLine').textContent = line;
  $('dialogue').classList.remove('hidden');
  if (dlgTimer) clearTimeout(dlgTimer);
  dlgTimer = setTimeout(() => $('dialogue').classList.add('hidden'), ms);
}
export function setHint(text) { $('hint').textContent = text || ''; }
