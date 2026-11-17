// The HUD: stars, health, money, minimap, compass, objectives, dialogue and screens.
// One clear job: show the player what is happening and take their menu clicks.
import * as THREE from 'three';
import { addTracer } from './combat.js';
import { PITCH, ROAD_HALF, HALF, BOUND, districtAt } from './city.js';

export function createHud(G, callbacks) {
  const $ = id => document.getElementById(id);
  const hud = {
    el: $('hud'), stars: $('stars'), healthfill: $('healthfill'), money: $('money'),
    minimap: $('minimap'), compass: $('compass'), bigmap: $('bigmap'), bigmapWrap: $('bigmapWrap'),
    objdist: $('objdist'), objective: $('objective'), speedo: $('speedo'),
    dialog: $('dialog'), toastEl: $('toast'), vignette: $('vignette'),
    menu: $('menu'), pause: $('pause'), over: $('over'),
    dialogOpen: false, dialogQueue: [], dialogDone: null, toastTimer: 0,
  };
  G.hud = hud;
  $('btnStart').addEventListener('click', () => callbacks.onStart());
  $('btnContinue').addEventListener('click', () => callbacks.onContinue());
  $('btnResume').addEventListener('click', () => callbacks.onResume());
  $('btnQuit').addEventListener('click', () => callbacks.onQuit());
  $('btnRetry').addEventListener('click', () => callbacks.onRetry());
  $('btnOverMenu').addEventListener('click', () => callbacks.onMenu());
  if (G.hasSave) $('btnContinue').style.display = '';
  hud.tracer = (from, to) => addTracer(G,
    new THREE.Vector3(from.x, 1.4, from.z),
    new THREE.Vector3(to.x, 1.2, to.z), 0xff4444);
  return hud;
}

export function updateHud(G) {
  const h = G.hud;
  // wanted stars
  let s = '';
  for (let i = 0; i < 5; i++) s += `<span class="${i < G.wanted ? '' : 'off'}">★</span>`;
  if (h.stars.innerHTML !== s) h.stars.innerHTML = s;
  // health
  const hp = Math.max(0, Math.round(G.player.health));
  h.healthfill.style.width = hp + '%';
  h.healthfill.style.background = hp > 50 ? 'linear-gradient(90deg,#37d67a,#a5e34d)' : hp > 25 ? 'linear-gradient(90deg,#e8a33a,#e8d23a)' : 'linear-gradient(90deg,#d63a37,#e86a3a)';
  h.money.textContent = '$' + G.money.toLocaleString('en-US');
  // speed
  if (G.player.car) {
    h.speedo.innerHTML = Math.round(Math.abs(G.player.car.speed) * 3.6) + ' <small>km/h</small>';
  } else {
    h.speedo.textContent = G.player.speed > 0 ? 'ON FOOT' : '';
  }
  // damage vignette
  h.vignette.classList.toggle('on', G.player.health < 35 && G.state === 'playing');
  drawMinimap(G);
  drawCompass(G);
  // objective distance readout
  const d = objectiveDistance(G);
  h.objdist.textContent = d === null ? '' : `◈ ${d}m to target`;
  // full-map overlay (Tab)
  if (G.mapOpen) {
    h.bigmapWrap.style.display = 'flex';
    drawBigMap(G);
  } else {
    h.bigmapWrap.style.display = 'none';
  }
}

// --- the minimap: a zoomed local view, north-up, centred on the player ---
function drawMinimap(G) {
  const c = G.hud.minimap, g = c.getContext('2d');
  const S = 200, VIEW = 280, sc = S / VIEW; // 280 world units across
  const p = G.player;
  const px = p.pos.x, pz = p.pos.z;
  const X = x => S / 2 + (x - px) * sc, Z = z => S / 2 + (z - pz) * sc;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
  // land base
  g.fillStyle = '#7d7468'; g.fillRect(0, 0, S, S);
  // water + sand, where the window overlaps them
  if (X(-HALF) > 0) { g.fillStyle = '#1d6f8f'; g.fillRect(0, 0, X(-HALF), S); }
  if (Z(HALF) < S) {
    g.fillStyle = '#1d6f8f'; g.fillRect(0, Z(HALF), S, S - Z(HALF));
    g.fillStyle = '#dcc491'; g.fillRect(0, Z(HALF), S, Z(HALF + 24) - Z(HALF));
  }
  // blocks in view: light grey with a darker outline so streets read
  const i0 = Math.floor((px - VIEW / 2 - 27) / PITCH), i1 = Math.floor((px + VIEW / 2 - 27) / PITCH);
  const j0 = Math.floor((pz - VIEW / 2 - 27) / PITCH), j1 = Math.floor((pz + VIEW / 2 - 27) / PITCH);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const cx = i * PITCH + 27, cz = j * PITCH + 27;
      const x0 = X(cx - 27 + ROAD_HALF), z0 = Z(cz - 27 + ROAD_HALF);
      const s = (54 - 2 * ROAD_HALF) * sc;
      let fill = '#8a929c';
      if (i === 0 && j === 0) fill = '#4c8a3f';
      else if (i === -5 && j === 5) fill = '#4c8a3f';
      else if (i === 3 && j === -3) fill = '#a89a7e';
      g.fillStyle = fill;
      g.fillRect(x0, z0, s, s);
      g.strokeStyle = '#5a616a'; g.lineWidth = 1;
      g.strokeRect(x0, z0, s, s);
    }
  }
  // roads: bright lines along every street in the window
  g.strokeStyle = '#d7dde3'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = -7; i <= 7; i++) {
    const c0 = i * PITCH;
    if (X(c0) > -10 && X(c0) < S + 10) { g.beginPath(); g.moveTo(X(c0), -5); g.lineTo(X(c0), S + 5); g.stroke(); }
    if (Z(c0) > -10 && Z(c0) < S + 10) { g.beginPath(); g.moveTo(-5, Z(c0)); g.lineTo(S + 5, Z(c0)); g.stroke(); }
  }
  const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill(); };
  // traffic + police
  for (const car of G.cars) {
    if (car.isPolice) dot(car.pos.x, car.pos.z, 4, Math.floor(G.time * 6) % 2 ? '#ff4444' : '#4488ff');
    else if (car.driver === 'traffic') dot(car.pos.x, car.pos.z, 2.5, 'rgba(255,255,255,0.9)');
  }
  // mission beacon: in-view dot + distance, or an edge arrow pointing at it
  if (G.beacon && G.beacon.visible) {
    const bx = G.beacon.position.x, bz = G.beacon.position.z;
    const dist = Math.round(Math.hypot(bx - px, bz - pz));
    const dx = X(bx) - S / 2, dz = Z(bz) - S / 2;
    const dc = Math.hypot(dx, dz);
    const label = dist + 'm';
    g.font = 'bold 12px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
    if (dc < 88) {
      const pulse = 5 + Math.sin(G.time * 4) * 1.5;
      dot(bx, bz, pulse, '#ffd23e');
      g.strokeStyle = '#ffd23e'; g.lineWidth = 2;
      g.beginPath(); g.arc(X(bx), Z(bz), pulse + 4, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.strokeText(label, X(bx) + 10, Z(bz));
      g.fillStyle = '#ffd23e'; g.fillText(label, X(bx) + 10, Z(bz));
    } else {
      // off-screen: yellow arrow on the circle edge pointing toward the beacon
      const ex = S / 2 + (dx / dc) * 86, ez = S / 2 + (dz / dc) * 86;
      const ang = Math.atan2(dz, dx);
      g.save();
      g.translate(ex, ez);
      g.rotate(ang + Math.PI / 2);
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(-7, 7); g.closePath(); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
      g.restore();
      const lx = Math.max(8, Math.min(S - 34, ex + 10)), ly = Math.max(10, Math.min(S - 10, ez));
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.strokeText(label, lx, ly);
      g.fillStyle = '#ffd23e'; g.fillText(label, lx, ly);
    }
  }
  // player arrow LAST, centred, big, bright, ringed
  const ang = p.onFoot ? p.yaw : p.car.angle;
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(-ang + Math.PI);
  g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#7dff9a';
  g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(-8, 9); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  g.restore();
  g.restore();
}

// --- compass strip: bearing ticks + objective marker, centred on the camera ---
function drawCompass(G) {
  const c = G.hud.compass, g = c.getContext('2d');
  const W = 260, H = 24, SPAN = 70 * Math.PI / 180; // visible ±70°
  g.clearRect(0, 0, W, H);
  const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const toX = bearing => W / 2 + (wrap(bearing - G.camYaw) / SPAN) * (W / 2);
  // bearing convention: yaw 0 = south (+z), PI/2 = east (+x), PI = north (-z), -PI/2 = west (-x)
  const cards = [[0, 'S'], [Math.PI / 2, 'E'], [Math.PI, 'N'], [-Math.PI / 2, 'W']];
  g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let deg = -180; deg <= 180; deg += 15) {
    const b = deg * Math.PI / 180;
    const x = toX(b);
    if (x < 2 || x > W - 2) continue;
    const isCard = cards.some(([cb]) => Math.abs(wrap(b - cb)) < 0.01);
    g.strokeStyle = isCard ? '#fff' : 'rgba(255,255,255,0.55)';
    g.lineWidth = isCard ? 2 : 1;
    g.beginPath(); g.moveTo(x, isCard ? 2 : 8); g.lineTo(x, isCard ? 12 : 12); g.stroke();
    if (isCard) {
      const label = cards.find(([cb]) => Math.abs(wrap(b - cb)) < 0.01)[1];
      g.fillStyle = '#fff';
      g.fillText(label, x, 18);
    }
  }
  // centre caret = where the camera looks
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2 - 5, -0); g.lineTo(W / 2, 5); g.lineTo(W / 2 + 5, 0); g.closePath(); g.fill();
  // objective diamond
  if (G.mission && G.mission.target) {
    const t = G.mission.target;
    const bearing = Math.atan2(t.x - G.player.pos.x, t.z - G.player.pos.z);
    const x = toX(bearing);
    if (x >= 6 && x <= W - 6) {
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 5, 10); g.lineTo(x, 16); g.lineTo(x - 5, 10); g.closePath(); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    }
  }
}

// --- full-city map overlay (Tab) ---
function drawBigMap(G) {
  const c = G.hud.bigmap, g = c.getContext('2d');
  const S = 560, sc = S / (2 * BOUND + 60);
  const X = x => S / 2 + x * sc, Z = z => S / 2 + z * sc;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#6a5f52'; g.fillRect(0, 0, S, S); // land tone for the outer ring
  // water + sand
  g.fillStyle = '#1d6f8f';
  g.fillRect(0, 0, X(-HALF), S);
  g.fillRect(0, Z(HALF), S, S - Z(HALF));
  g.fillStyle = '#dcc491';
  g.fillRect(X(-HALF), Z(HALF), S - X(-HALF), Z(HALF + 24) - Z(HALF));
  // blocks, district-tinted
  const halfBlocks = 7;
  for (let i = -halfBlocks; i < halfBlocks; i++) {
    for (let j = -halfBlocks; j < halfBlocks; j++) {
      const cx = i * PITCH + 27, cz = j * PITCH + 27;
      let fill = '#8a929c';
      if (i === 0 && j === 0) fill = '#4c8a3f';
      else if (i === -5 && j === 5) fill = '#4c8a3f';
      else if (i === 3 && j === -3) fill = '#a89a7e';
      else if (cx < 0 && cz < 0) fill = '#7e7468';
      else if (cx >= 0 && cz < 0) fill = '#8f8a80';
      else if (cx < 0 && cz >= 0) fill = '#a89a7e';
      else fill = '#93a08b';
      g.fillStyle = fill;
      g.fillRect(X(cx - 27 + ROAD_HALF), Z(cz - 27 + ROAD_HALF), (54 - 2 * ROAD_HALF) * sc, (54 - 2 * ROAD_HALF) * sc);
    }
  }
  // roads
  g.strokeStyle = '#d7dde3'; g.lineWidth = 2;
  for (let i = -7; i <= 7; i++) {
    g.beginPath(); g.moveTo(X(i * PITCH), 0); g.lineTo(X(i * PITCH), S); g.stroke();
    g.beginPath(); g.moveTo(0, Z(i * PITCH)); g.lineTo(S, Z(i * PITCH)); g.stroke();
  }
  // district labels
  g.font = 'bold 16px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText('HARBOR', X(-189), Z(-189));
  g.fillText('DOWNTOWN', X(189), Z(-189));
  g.fillText('OLD TOWN', X(-189), Z(189));
  g.fillText('MARINA', X(189), Z(189));
  g.font = 'bold 18px Arial'; g.textAlign = 'left';
  g.fillText('PORTO VERDE', 14, 24);
  const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill(); };
  for (const car of G.cars) {
    if (car.isPolice) dot(car.pos.x, car.pos.z, 5, Math.floor(G.time * 6) % 2 ? '#ff4444' : '#4488ff');
    else if (car.driver === 'traffic') dot(car.pos.x, car.pos.z, 3, 'rgba(255,255,255,0.9)');
  }
  if (G.beacon && G.beacon.visible) {
    const pulse = 6 + Math.sin(G.time * 4) * 2;
    dot(G.beacon.position.x, G.beacon.position.z, pulse, '#ffd23e');
    g.strokeStyle = '#ffd23e'; g.lineWidth = 2;
    g.beginPath(); g.arc(X(G.beacon.position.x), Z(G.beacon.position.z), pulse + 5, 0, Math.PI * 2); g.stroke();
  }
  const p = G.player;
  const ang = p.onFoot ? p.yaw : p.car.angle;
  g.save();
  g.translate(X(p.pos.x), Z(p.pos.z));
  g.rotate(-ang + Math.PI);
  g.fillStyle = '#7dff9a';
  g.beginPath(); g.moveTo(0, -15); g.lineTo(11, 12); g.lineTo(-11, 12); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  g.restore();
}

export function objectiveDistance(G) {
  if (!G.mission || !G.mission.target) return null;
  const t = G.mission.target;
  return Math.round(Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z));
}

export function setObjective(G, text) {
  G.hud.objective.textContent = text;
  G.objectiveText = text;
}

export function setTimer(G, seconds) {
  const h = G.hud;
  if (seconds > 0) {
    const m = Math.floor(seconds / 60), s = seconds % 60;
    h.objective.textContent = (G.objectiveText || '') + `   ⏱ ${m}:${String(s).padStart(2, '0')}`;
  } else {
    h.objective.textContent = G.objectiveText || '';
  }
}

export function showDialog(G, who, text, onDone) {
  const h = G.hud;
  h.dialogQueue.push({ who, text, onDone });
  if (!h.dialogOpen) nextDialog(G);
}

function nextDialog(G) {
  const h = G.hud;
  const d = h.dialogQueue.shift();
  if (!d) { h.dialogOpen = false; h.dialog.style.display = 'none'; return; }
  h.dialogOpen = true;
  h.dialog.querySelector('.who').textContent = d.who;
  h.dialog.querySelector('.text').textContent = d.text;
  h.dialogDone = d.onDone;
  h.dialog.style.display = 'block';
}

export function closeDialog(G) {
  const h = G.hud;
  if (!h.dialogOpen) return;
  const done = h.dialogDone;
  h.dialogDone = null;
  h.dialogOpen = false;
  h.dialog.style.display = 'none';
  if (done) done();
  nextDialog(G);
}

export function toast(G, text) {
  const h = G.hud;
  h.toastEl.textContent = text;
  h.toastEl.style.display = 'block';
  clearTimeout(h.toastTimer);
  h.toastTimer = setTimeout(() => { h.toastEl.style.display = 'none'; }, 2800);
}

export function flash(G) {
  const h = G.hud;
  h.vignette.classList.add('on');
  setTimeout(() => { if (G.player.health >= 35) h.vignette.classList.remove('on'); }, 180);
}
