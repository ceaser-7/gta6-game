// Porto Verde HUD — mission card, cash/stars/clock, circular minimap,
// full island map (Tab) with a 12-entry legend and a stats panel,
// dialogue boxes, toasts. Written fresh for v3.
import { G, WORLD, DISTRICTS, CHAPTERS, CREW, STATIONS, fmtCash, fmtClock, respectLevel } from './state.js';
import { sideJobTargets } from './sidejobs.js';
import { gangTerritories, gangMemberDots } from './gangs.js';

const $ = id => document.getElementById(id);
let toastTimer = null;
let dlgTimer = null;

// ---- Minimap (circular canvas): coastline + water + city + markers ----
const MM = { size: 190, range: 520 };
export function drawMinimap() {
  const c = $('minimap');
  if (!c || !G.player) return;
  const x = c.getContext('2d');
  const S = MM.size;
  const R = MM.range;
  const px = G.player.pos.x;
  const pz = G.player.pos.z;
  const toMM = (wx, wz) => [S / 2 + (wx - px) / R * S / 2, S / 2 + (wz - pz) / R * S / 2];
  // Water.
  x.fillStyle = '#0b4a6b';
  x.fillRect(0, 0, S, S);
  // Island sand circle centred on the island centre.
  const [icx, icy] = toMM(0, 0);
  x.fillStyle = '#d9c27a';
  x.beginPath();
  x.arc(icx, icy, WORLD.beachOuter / R * S / 2, 0, Math.PI * 2);
  x.fill();
  // City ground.
  x.fillStyle = '#3a3f46';
  const [c0x, c0y] = toMM(-WORLD.cityHalf, -WORLD.cityHalf);
  x.fillRect(c0x, c0y, WORLD.cityHalf * 2 / R * S / 2, WORLD.cityHalf * 2 / R * S / 2);
  // Parks.
  x.fillStyle = '#2a5a34';
  for (const [pkx, pkz] of [[-200, -200], [200, 200]]) {
    const [a, b] = toMM(pkx - 60, pkz - 60);
    x.fillRect(a, b, 120 / R * S / 2, 120 / R * S / 2);
  }
  // Roads.
  x.strokeStyle = '#22252a';
  x.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    const [a1, b1] = toMM(i * WORLD.block, -WORLD.cityHalf);
    const [a2, b2] = toMM(i * WORLD.block, WORLD.cityHalf);
    x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
    const [c1, d1] = toMM(-WORLD.cityHalf, i * WORLD.block);
    const [c2, d2] = toMM(WORLD.cityHalf, i * WORLD.block);
    x.beginPath(); x.moveTo(c1, d1); x.lineTo(c2, d2); x.stroke();
  }
  // Coastline highlight.
  x.strokeStyle = '#fff';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(icx, icy, WORLD.beachOuter / R * S / 2, 0, Math.PI * 2);
  x.stroke();
  // Safehouse.
  const [sx, sy] = toMM(120, 280);
  x.fillStyle = '#7dff9b';
  x.fillRect(sx - 3, sy - 3, 6, 6);
  // Coins.
  x.fillStyle = '#ffd76a';
  for (const coin of G.world.coins) {
    if (G.coinsGot[coin.userData.coinIdx]) continue;
    const [kx, ky] = toMM(coin.position.x, coin.position.z);
    if (kx < -5 || kx > S + 5 || ky < -5 || ky > S + 5) continue;
    x.beginPath();
    x.arc(kx, ky, 2.5, 0, Math.PI * 2);
    x.fill();
  }
  // Mission target (gold).
  if (G.mission) {
    const [tx, ty] = toMM(G.mission.target[0], G.mission.target[1]);
    x.fillStyle = '#ffb020';
    x.beginPath();
    x.arc(tx, ty, 5, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(tx, ty, 7, 0, Math.PI * 2);
    x.stroke();
  }
  // Police (red).
  x.fillStyle = '#ff5a5a';
  for (const u of G.police) {
    const [ux, uy] = toMM(u.mesh.position.x, u.mesh.position.z);
    x.beginPath();
    x.arc(ux, uy, 3.5, 0, Math.PI * 2);
    x.fill();
  }
  // Gang territories (translucent rings) + hideouts + member dots.
  for (const terr of gangTerritories()) {
    const [tx, ty] = toMM(terr.cx, terr.cz);
    const tr = terr.r / R * S / 2;
    x.fillStyle = terr.color + '22';
    x.beginPath();
    x.arc(tx, ty, tr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = terr.color;
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(tx, ty, tr, 0, Math.PI * 2);
    x.stroke();
    const [hx, hy] = toMM(terr.hideout[0], terr.hideout[1]);
    x.fillStyle = terr.color;
    x.fillRect(hx - 3, hy - 3, 6, 6);
  }
  for (const m of gangMemberDots()) {
    const [mx, my] = toMM(m.x, m.z);
    x.fillStyle = m.color;
    x.beginPath();
    x.arc(mx, my, m.hostile ? 3.5 : 2.5, 0, Math.PI * 2);
    x.fill();
  }
  // Side-job markers (kind colour; active objective bigger + ringed).
  for (const j of sideJobTargets()) {
    const [jx, jy] = toMM(j.x, j.z);
    x.fillStyle = j.color;
    x.beginPath();
    x.arc(jx, jy, j.big ? 6 : 3.5, 0, Math.PI * 2);
    x.fill();
    if (j.big) {
      x.strokeStyle = '#fff';
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(jx, jy, 8.5, 0, Math.PI * 2);
      x.stroke();
    }
  }
  // Riot centre (red dot).
  if (G.riot && G.riot.active) {
    const [rx, ry] = toMM(G.riot.cx, G.riot.cz);
    x.fillStyle = '#ff2020';
    x.beginPath();
    x.arc(rx, ry, 6, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(rx, ry, 9, 0, Math.PI * 2);
    x.stroke();
  }
  // Player arrow (heading up).
  x.save();
  x.translate(S / 2, S / 2);
  x.rotate(G.player.heading);
  x.fillStyle = '#fff';
  x.beginPath();
  x.moveTo(0, -8); x.lineTo(5, 6); x.lineTo(-5, 6); x.closePath();
  x.fill();
  x.restore();
  // North indicator.
  x.fillStyle = '#fff';
  x.font = 'bold 11px Arial';
  x.textAlign = 'center';
  x.fillText('N', S / 2, 13);
}

// ---- Full map (Tab) ----
const LEGEND = [
  ['#ffffff', 'You are here'],
  ['#ffb020', 'Job objective'],
  ['#7dff9b', 'Safehouse'],
  ['#ff5a5a', 'Police'],
  ['#9fd8ff', 'Weapons / Ammo'],
  ['#ff7bff', 'Race start'],
  ['#ff8c8c', 'Hospital'],
  ['#ffd76a', 'Verde Coin'],
  ['#00e676', 'Property (buy / owned)'],
  ['#ff9800', 'Garage upgrades'],
  ['#ff5aff', 'Respray (Prism Paints)'],
  ['#4dd0e1', 'Lighthouse / Marina'],
];

function buildLegend() {
  const legend = document.querySelector('#fullMap .legend');
  if (!legend) return;
  legend.innerHTML = LEGEND.map(([color, label]) =>
    '<div><span class="dot" style="background:' + color + '"></span>' + label + '</div>'
  ).join('');
  // Stats panel (Properties x/2, Garage x/3) — appended once to the map side.
  let stats = $('mapStats');
  if (!stats) {
    stats = document.createElement('div');
    stats.id = 'mapStats';
    stats.style.cssText = 'margin-top:10px;padding:8px 10px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(255,255,255,.05);font-size:13px;line-height:1.6';
    const side = $('mapSide');
    if (side) side.appendChild(stats);
  }
}

function refreshMapStats() {
  const stats = $('mapStats');
  if (!stats) return;
  const defs = G.propertyDefs || [];
  const owned = defs.filter(p => (G.properties || []).includes(p.id)).length;
  const ups = G.garageDefs || [];
  const bought = ups.filter(u => (G.garageUpgrades || {})[u.id]).length;
  stats.innerHTML = '<b style="color:#ffb020">Properties</b> ' + owned + '/' + defs.length +
    ' &nbsp;·&nbsp; <b style="color:#ffb020">Garage</b> ' + bought + '/' + ups.length +
    '<br><span style="color:#c8c8c8">' +
    defs.map(p => ((G.properties || []).includes(p.id) ? '✓ ' : '○ ') + p.name + ' $' + p.price.toLocaleString()).join('<br>') +
    '<br>' +
    ups.map(u => ((G.garageUpgrades || {})[u.id] ? '✓ ' : '○ ') + u.name + ' $' + u.price.toLocaleString()).join('<br>') +
    '</span>';
}

export function drawFullMap() {
  buildLegend();
  refreshMapStats();
  const c = $('mapCanvas');
  if (!c || !G.player) return;
  const x = c.getContext('2d');
  const S = 900;
  const R = WORLD.half * 2;
  const toM = (wx, wz) => [(wx + WORLD.half) / R * S, (wz + WORLD.half) / R * S];
  x.fillStyle = '#0b4a6b';
  x.fillRect(0, 0, S, S);
  // Shallow water + sand.
  x.fillStyle = '#12708a';
  x.beginPath();
  x.arc(S / 2, S / 2, WORLD.beachOuter / R * S + 30, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#d9c27a';
  x.beginPath();
  x.arc(S / 2, S / 2, WORLD.beachOuter / R * S, 0, Math.PI * 2);
  x.fill();
  // City.
  const [c0x, c0y] = toM(-WORLD.cityHalf, -WORLD.cityHalf);
  x.fillStyle = '#3a3f46';
  x.fillRect(c0x, c0y, WORLD.cityHalf * 2 / R * S, WORLD.cityHalf * 2 / R * S);
  // Parks.
  x.fillStyle = '#2a5a34';
  for (const [pkx, pkz] of [[-200, -200], [200, 200]]) {
    const [a, b] = toM(pkx - 60, pkz - 60);
    x.fillRect(a, b, 120 / R * S, 120 / R * S);
  }
  // Plaza.
  x.fillStyle = '#8a8578';
  const [plx, ply] = toM(-40, -40);
  x.fillRect(plx, ply, 80 / R * S, 80 / R * S);
  // Roads.
  x.strokeStyle = '#22252a';
  x.lineWidth = 8;
  for (let i = -4; i <= 4; i++) {
    const [a1, b1] = toM(i * WORLD.block, -WORLD.cityHalf);
    const [a2, b2] = toM(i * WORLD.block, WORLD.cityHalf);
    x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
    const [cc1, d1] = toM(-WORLD.cityHalf, i * WORLD.block);
    const [cc2, d2] = toM(WORLD.cityHalf, i * WORLD.block);
    x.beginPath(); x.moveTo(cc1, d1); x.lineTo(cc2, d2); x.stroke();
  }
  // Causeway.
  x.strokeStyle = '#4a4f55';
  x.lineWidth = 10;
  x.beginPath();
  x.moveTo(...toM(320, 40));
  x.lineTo(...toM(430, 40));
  x.stroke();
  // District labels.
  x.fillStyle = '#fff';
  x.font = 'bold 20px Arial';
  x.textAlign = 'center';
  x.shadowColor = '#000';
  x.shadowBlur = 4;
  for (const d of DISTRICTS) {
    const [lx, ly] = toM(d.cx, d.cz);
    x.fillText(d.label, lx, ly);
  }
  x.shadowBlur = 0;
  // Markers.
  const mark = (wx, wz, color, r = 8) => {
    const [mx, my] = toM(wx, wz);
    x.fillStyle = color;
    x.beginPath();
    x.arc(mx, my, r, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 2;
    x.stroke();
  };
  mark(120, 280, '#7dff9b');      // safehouse
  mark(-120, -200, '#ff8c8c');    // hospital
  mark(240, 40, '#ff7bff');       // race (Marina)
  mark(0, 300, '#ff7bff', 6);     // race start (Coastline Sprint)
  mark(-200, 120, '#9fd8ff');     // weapons (El Faro area)
  mark(300, 40, '#4dd0e1');       // lighthouse / Marina
  // v3: properties (green = owned, hollow = for sale) + services.
  for (const p of (G.propertyDefs || [])) {
    const owned = (G.properties || []).includes(p.id);
    const [mx, my] = toM(p.x, p.z);
    if (owned) {
      x.fillStyle = '#00e676';
      x.beginPath(); x.arc(mx, my, 8, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
    } else {
      x.strokeStyle = '#00e676';
      x.lineWidth = 3;
      x.beginPath(); x.arc(mx, my, 8, 0, Math.PI * 2); x.stroke();
    }
  }
  for (const s of (G.serviceDefs || [])) {
    const col = s.kind === 'respray' ? '#ff5aff' : s.kind === 'race' ? '#ff7bff' : s.kind === 'garage' ? '#ff9800' : '#9fd8ff';
    mark(s.x, s.z, col, 6);
  }
  mark(200, -160, '#ff9800', 7); // Sunray Upgrades
  if (G.mission) mark(G.mission.target[0], G.mission.target[1], '#ffb020', 11);
  x.fillStyle = '#ffd76a';
  for (const coin of G.world.coins) {
    if (G.coinsGot[coin.userData.coinIdx]) continue;
    const [kx, ky] = toM(coin.position.x, coin.position.z);
    x.beginPath();
    x.arc(kx, ky, 4, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#ff5a5a';
  for (const u of G.police) {
    const [ux, uy] = toM(u.mesh.position.x, u.mesh.position.z);
    x.beginPath();
    x.arc(ux, uy, 5, 0, Math.PI * 2);
    x.fill();
  }
  // Gang territories (translucent) + hideouts + member dots.
  for (const terr of gangTerritories()) {
    const [tx, ty] = toM(terr.cx, terr.cz);
    const tr = terr.r / R * S;
    x.fillStyle = terr.color + '22';
    x.beginPath();
    x.arc(tx, ty, tr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = terr.color;
    x.lineWidth = 2;
    x.beginPath();
    x.arc(tx, ty, tr, 0, Math.PI * 2);
    x.stroke();
    const [hx, hy] = toM(terr.hideout[0], terr.hideout[1]);
    x.fillStyle = terr.color;
    x.fillRect(hx - 5, hy - 5, 10, 10);
    x.fillStyle = '#fff';
    x.font = 'bold 13px Arial';
    x.textAlign = 'center';
    x.fillText(terr.name.toUpperCase() + ' TURF', tx, ty - tr - 8);
  }
  for (const m of gangMemberDots()) {
    const [mx, my] = toM(m.x, m.z);
    x.fillStyle = m.color;
    x.beginPath();
    x.arc(mx, my, m.hostile ? 5 : 3.5, 0, Math.PI * 2);
    x.fill();
  }
  // Side-job markers (kind colour; active objective bigger + ringed).
  for (const j of sideJobTargets()) {
    const [jx, jy] = toM(j.x, j.z);
    x.fillStyle = j.color;
    x.beginPath();
    x.arc(jx, jy, j.big ? 9 : 5, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(jx, jy, j.big ? 12 : 7, 0, Math.PI * 2);
    x.stroke();
  }
  // Riot centre (red dot + label).
  if (G.riot && G.riot.active) {
    const [rx, ry] = toM(G.riot.cx, G.riot.cz);
    x.fillStyle = '#ff2020';
    x.beginPath();
    x.arc(rx, ry, 10, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(rx, ry, 14, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#ff2020';
    x.font = 'bold 18px Arial';
    x.textAlign = 'center';
    x.fillText('RIOT', rx, ry - 20);
  }
  // Player.
  const [ppx, ppy] = toM(G.player.pos.x, G.player.pos.z);
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(ppx, ppy, 9, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#000';
  x.lineWidth = 2;
  x.stroke();
  // Job list + GPS.
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
  } else if (gps) {
    gps.textContent = 'GPS: no active job — see Lena at the Plaza.';
  }
}

// ---- HUD text ----
export function updateHUD() {
  if (!G.player) return;
  $('cash').textContent = fmtCash(G.cash) + (G.debt > 0 ? ' · Debt $' + G.debt.toLocaleString() : ' · DEBT CLEAR');
  $('respect').textContent = 'Respect ' + G.respect + ' · Level ' + respectLevel(G.respect);
  $('clock').textContent = fmtClock(G.day, G.timeOfDay);
  let stars = '';
  for (let i = 0; i < 5; i++) {
    stars += '<span class="' + (i < G.wanted ? 'on' : 'off') + '">★</span>';
  }
  $('stars').innerHTML = stars;
  if (G.mission) {
    const ch = CHAPTERS[G.mission.chapter];
    const s = G.mission.stages[G.mission.stage];
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
  $('coinCount').textContent = G.coins + '/' + G.coinsTotal;
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
  const station = STATIONS[G.radioStation];
  $('radioStation').textContent = station.name;
  $('radioSong').textContent = station.songs[G.radioSong % station.songs.length];
  const panel = $('policePanel');
  if (G.wanted > 0 && G.police.length) {
    panel.classList.remove('hidden');
    $('policeUnits').innerHTML = G.police.map(u =>
      '<div class="unit"><span>' + (u.callsign || 'UNIT') + '</span><span>' + Math.round(u.dist || 0) + 'm</span><span class="beh">' + (u.behaviour || 'PURSUIT') + '</span></div>'
    ).join('') + (G.heli ? '<div class="unit"><span>HELI 1</span><span>—</span><span class="beh">AIRSUPPORT</span></div>' : '');
  } else {
    panel.classList.add('hidden');
  }
  // Side-job panel: active job, or how many jobs are on the board.
  const sjCard = $('sjCard');
  if (sjCard) {
    const sj = G.sideJobs;
    if (sj && sj.active) {
      const a = sj.active;
      const obj = a.kind === 'vigilante'
        ? 'Bust the runner — ' + Math.round(a.bust * 100) + '%'
        : a.stage === 'pickup' ? 'Pick up at ' + a.fromName : 'Deliver to ' + a.toName;
      const tx = a.kind === 'vigilante' && a.targetCar ? a.targetCar.mesh.position.x : (a.stage === 'pickup' ? a.pickup[0] : a.dest[0]);
      const tz = a.kind === 'vigilante' && a.targetCar ? a.targetCar.mesh.position.z : (a.stage === 'pickup' ? a.pickup[1] : a.dest[1]);
      const d = Math.hypot(G.player.pos.x - tx, G.player.pos.z - tz);
      $('sjTitle').textContent = a.label;
      $('sjObj').textContent = obj;
      $('sjMeta').textContent = Math.round(d) + 'm · $' + a.reward + ' · +' + a.respect + ' Respect';
      $('sjTimer').textContent = Math.ceil(a.timer) + 's';
    } else if (sj) {
      $('sjTitle').textContent = 'Side Jobs';
      $('sjObj').textContent = sj.available.length + ' jobs on the board — press J';
      $('sjMeta').textContent = 'Taxi · Courier · Vigilante';
      $('sjTimer').textContent = '';
    }
  }
  // Gang heat indicator (only when heat > 0.2, red at 3+).
  const gh = $('gangHeat');
  if (gh) {
    const heat = (G.gangs && G.gangs.heat) || 0;
    if (heat > 0.2) {
      gh.classList.remove('hidden');
      gh.textContent = 'GANG HEAT ' + '▲'.repeat(Math.max(1, Math.round(heat)));
      gh.style.color = heat >= 3 ? '#ff5a5a' : '#ffd76a';
    } else {
      gh.classList.add('hidden');
    }
  }
  drawMinimap();
}

// ---- Toast / dialogue ----
export function toast(msg, ms = 3200) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
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

export function setHint(text) {
  $('hint').textContent = text || '';
}
