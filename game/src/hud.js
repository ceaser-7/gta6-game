// Porto Verde — HUD: circular minimap with blips and a live-distance beacon,
// compass, speedo, wanted stars, money/health, dialogs, cards, menu, full map.
import * as THREE from 'three';
import { G, CFG, ROADS, clamp, dist2, fmtClock, fmtMoney } from './state.js';

let el = {};
let mapBg = null; // pre-rendered city backdrop for the minimap
let fullMapBg = null;
let toastTimer = 0, cardTimer = 0;

export function initHUD() {
  el = {
    hud: document.getElementById('hud'),
    money: document.getElementById('money'),
    health: document.getElementById('healthfill'),
    stars: document.getElementById('stars'),
    ammo: document.getElementById('ammo'),
    speed: document.getElementById('speed'),
    radio: document.getElementById('radio'),
    coins: document.getElementById('coins'),
    race: document.getElementById('race'),
    district: document.getElementById('district'),
    hint: document.getElementById('hint'),
    interact: document.getElementById('interact'),
    dialog: document.getElementById('dialog'),
    dialogName: document.getElementById('dialog-name'),
    dialogText: document.getElementById('dialog-text'),
    toast: document.getElementById('toast'),
    card: document.getElementById('card'),
    cardTitle: document.getElementById('card-title'),
    cardSub: document.getElementById('card-sub'),
    wasted: document.getElementById('wasted'),
    wastedTitle: document.getElementById('wasted-title'),
    wastedSub: document.getElementById('wasted-sub'),
    menu: document.getElementById('menu'),
    menuTitle: document.getElementById('menu-title'),
    map: document.getElementById('map'),
    mapCanvas: document.getElementById('map-canvas'),
    compass: document.getElementById('compass'),
    mission: document.getElementById('mission'),
    minimap: document.getElementById('minimap'),
  };
  buildMapBackgrounds();
  document.getElementById('btn-new').addEventListener('click', () => window.PV.startGame(false));
  document.getElementById('btn-continue').addEventListener('click', () => window.PV.startGame(true));
}

function buildMapBackgrounds() {
  // minimap backdrop: 900 units -> 360 px, north up, city centred
  mapBg = document.createElement('canvas'); mapBg.width = mapBg.height = 360;
  const g = mapBg.getContext('2d');
  const s = 360 / 900, ox = 180, oy = 180;
  const X = (x) => ox + x * s, Z = (z) => oy + z * s;
  g.fillStyle = '#20242a'; g.fillRect(0, 0, 360, 360);
  g.fillStyle = '#5d7a4a';
  g.fillRect(X(-87), Z(150), 110 * s, 90 * s); g.fillRect(X(-277), Z(-277), 100 * s, 100 * s);
  g.fillStyle = '#9a938a'; g.fillRect(X(-60), Z(-60), 120 * s, 120 * s);
  g.fillStyle = '#2e5d6b'; g.fillRect(X(450), Z(-450), 40 * s, 900 * s);
  g.fillStyle = '#c9b48a'; g.fillRect(X(450), Z(-450), 10 * s, 900 * s);
  g.strokeStyle = '#565b63'; g.lineWidth = 10 * s;
  for (const r of ROADS) {
    g.beginPath(); g.moveTo(X(-450), Z(r)); g.lineTo(X(450), Z(r)); g.stroke();
    g.beginPath(); g.moveTo(X(r), Z(-450)); g.lineTo(X(r), Z(450)); g.stroke();
  }
  g.fillStyle = '#3a3f47';
  for (const b of G.buildings) g.fillRect(X(b.x - b.hx), Z(b.z - b.hz), b.hx * 2 * s, b.hz * 2 * s);
  // full map: same drawing at 640px
  fullMapBg = document.createElement('canvas'); fullMapBg.width = fullMapBg.height = 640;
  const f = fullMapBg.getContext('2d');
  const fs = 640 / 900, fox = 320, foy = 320;
  const FX = (x) => fox + x * fs, FZ = (z) => foy + z * fs;
  f.fillStyle = '#20242a'; f.fillRect(0, 0, 640, 640);
  f.fillStyle = '#5d7a4a';
  f.fillRect(FX(-87), FZ(150), 110 * fs, 90 * fs); f.fillRect(FX(-277), FZ(-277), 100 * fs, 100 * fs);
  f.fillStyle = '#9a938a'; f.fillRect(FX(-60), FZ(-60), 120 * fs, 120 * fs);
  f.fillStyle = '#2e5d6b'; f.fillRect(FX(450), FZ(-450), 40 * fs, 900 * fs);
  f.strokeStyle = '#565b63'; f.lineWidth = 10 * fs;
  for (const r of ROADS) {
    f.beginPath(); f.moveTo(FX(-450), FZ(r)); f.lineTo(FX(450), FZ(r)); f.stroke();
    f.beginPath(); f.moveTo(FX(r), FZ(-450)); f.lineTo(FX(r), FZ(450)); f.stroke();
  }
  f.fillStyle = '#3a3f47';
  for (const b of G.buildings) f.fillRect(FX(b.x - b.hx), FZ(b.z - b.hz), b.hx * 2 * fs, b.hz * 2 * fs);
  f.fillStyle = '#c9b48a'; f.font = 'bold 15px sans-serif';
  f.fillText('OLD TOWN', FX(-300), FZ(300)); f.fillText('DOWNTOWN', FX(120), FZ(-200));
  f.fillText('MARINA', FX(220), FZ(300)); f.fillText('NORTHSIDE', FX(-300), FZ(-300));
  f.fillText('BEACH', FX(380), FZ(380));
}

export function showDialog(speaker, line) {
  G.dialog = { speaker, line };
  el.dialogName.textContent = speaker;
  el.dialogText.textContent = line;
  el.dialog.style.display = 'block';
}
export function closeDialog() {
  G.dialog = null;
  el.dialog.style.display = 'none';
  const next = G.dialogQueue.shift();
  if (next) showDialog(next.speaker, next.line);
}
export function queueDialog(speaker, line) {
  if (!G.dialog) showDialog(speaker, line);
  else G.dialogQueue.push({ speaker, line });
}
export function showToast(text) {
  el.toast.textContent = text;
  el.toast.style.display = 'block';
  toastTimer = 4;
}
export function showCard(title, sub) {
  el.cardTitle.textContent = title;
  el.cardSub.textContent = sub || '';
  el.card.style.display = 'block';
  cardTimer = 3.5;
}
export function showWasted(title, sub) {
  el.wastedTitle.textContent = title;
  el.wastedSub.textContent = sub || '';
  el.wasted.style.display = 'flex';
}
export function hideWasted() { el.wasted.style.display = 'none'; }
export function showMenu(hasSave) {
  el.menu.style.display = 'flex';
  document.getElementById('btn-continue').style.display = hasSave ? 'block' : 'none';
  el.menuTitle.textContent = 'PORTO VERDE';
}
export function hideMenu() { el.menu.style.display = 'none'; }
export function setInteract(text) {
  if (text) { el.interact.textContent = text; el.interact.style.display = 'block'; }
  else el.interact.style.display = 'none';
}
export function setHint(text, secs) {
  el.hint.textContent = text;
  el.hint.style.display = 'block';
  G.hintUntil = G.time + (secs || 15);
}
export function setMission(text) {
  el.mission.textContent = text;
  el.mission.style.display = text ? 'block' : 'none';
}

// Mission target for the beacon: {x, z, label} or null.
export function missionTarget() {
  if (G.mission) return G.mission.target;
  if (G.race && G.race.active) return { x: G.race.next.x, z: G.race.next.z, label: 'Race' };
  return null;
}

function drawMinimap() {
  const c = el.minimap, g = c.getContext('2d');
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2;
  const view = 280; // units across the minimap
  const s = W / view;
  const px = G.player.pos.x, pz = G.player.pos.z;
  g.save();
  g.beginPath(); g.arc(cx, cy, cx - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#20242a'; g.fillRect(0, 0, W, H);
  // backdrop window centred on the player: draw the 360px city map scaled so 1 unit = s px
  g.drawImage(mapBg, cx - (px + 450) * (360 / 900) * s, cy - (pz + 450) * (360 / 900) * s, 360 * s, 360 * s);
  // coins
  g.fillStyle = '#ffd24a';
  for (const coin of G.coins) {
    if (coin.got) continue;
    g.beginPath(); g.arc(cx + (coin.x - px) * s, cy + (coin.z - pz) * s, 3, 0, Math.PI * 2); g.fill();
  }
  // police blips
  for (const car of G.police) {
    g.fillStyle = '#4d8dff';
    g.beginPath(); g.arc(cx + (car.position.x - px) * s, cy + (car.position.z - pz) * s, 4, 0, Math.PI * 2); g.fill();
  }
  // traffic blips
  g.fillStyle = '#9aa0a8';
  for (const car of G.traffic) {
    g.fillRect(cx + (car.position.x - px) * s - 1.5, cy + (car.position.z - pz) * s - 1.5, 3, 3);
  }
  // mission beacon
  const t = missionTarget();
  if (t) {
    const dx = t.x - px, dz = t.z - pz;
    const d = Math.hypot(dx, dz);
    const bx = cx + clamp(dx * s, -cx + 8, cx - 8);
    const by = cy + clamp(dz * s, -cy + 8, cy - 8);
    g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.stroke();
    g.fillStyle = '#ffd24a';
    g.save(); g.translate(bx, by); g.rotate(Math.atan2(dz, dx));
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.restore();
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    g.fillText(`${Math.round(d)}m`, bx, by - 10);
    g.fillText(`◈ ${Math.round(d)}m to target`, cx, H - 8);
  }
  // player arrow (heading = player yaw)
  const yaw = G.player.car ? G.player.car.userData.heading : G.player.yaw;
  g.save(); g.translate(cx, cy); g.rotate(Math.atan2(Math.sin(yaw), Math.cos(yaw)) + Math.PI / 2);
  // arrow points along heading: heading 0 = +x (east); canvas x right = east, y down = south
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 1.5; g.stroke();
  g.restore();
  g.restore();
  // ring
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, cx - 2, 0, Math.PI * 2); g.stroke();
}

function drawFullMap() {
  const c = el.mapCanvas, g = c.getContext('2d');
  g.drawImage(fullMapBg, 0, 0);
  const s = 640 / 900;
  const px = G.player.pos.x, pz = G.player.pos.z;
  const X = (x) => 320 + x * s, Z = (z) => 320 + z * s;
  g.fillStyle = '#ffd24a';
  for (const coin of G.coins) if (!coin.got) { g.beginPath(); g.arc(X(coin.x), Z(coin.z), 4, 0, Math.PI * 2); g.fill(); }
  const t = missionTarget();
  if (t) {
    g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(px), Z(pz)); g.lineTo(X(t.x), Z(t.z)); g.stroke();
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(X(t.x), Z(t.z) - 10); g.lineTo(X(t.x) + 8, Z(t.z)); g.lineTo(X(t.x), Z(t.z) + 10); g.lineTo(X(t.x) - 8, Z(t.z)); g.closePath(); g.fill();
  }
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(X(px), Z(pz), 7, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#ffd24a'; g.font = 'bold 13px sans-serif';
  g.fillText('YOU', X(px) + 10, Z(pz) - 8);
}

export function updateHUD(dt) {
  if (!G.started) return;
  el.money.textContent = fmtMoney(G.money);
  el.health.style.width = `${clamp(G.health, 0, 100)}%`;
  el.stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
  el.stars.style.color = G.wanted > 0 ? '#ff5040' : '#888';
  el.ammo.textContent = G.player.car ? `—` : `PISTOL ${G.player.ammo}/${CFG.MAG}`;
  const kmh = G.player.car ? Math.abs(G.player.car.userData.speed) * 3.6 : Math.hypot(G.player.vel.x, G.player.vel.z) * 3.6;
  el.speed.textContent = `${Math.round(kmh)} km/h`;
  el.radio.textContent = G.muted ? 'MUTED (M)' : ['♪ VERDE FM', '♪ BASSLINE 98', '♪ COAST 101'][G.station];
  el.coins.textContent = `◉ Verde Coins ${G.coinsGot.length}/${CFG.COIN_COUNT}`;
  el.coins.style.display = 'block';
  if (G.race && G.race.active) {
    el.race.textContent = `🏁 SUNSET SPRINT — CP ${G.race.cp}/${CFG.RACE_CP} — ${fmtClock(Math.max(0, G.race.left))}`;
    el.race.style.display = 'block';
  } else el.race.style.display = 'none';
  el.district.textContent = G.interior ? G.interior.name : districtOf(G.player.pos.x, G.player.pos.z);
  if (G.time > G.hintUntil) el.hint.style.display = 'none';
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.style.display = 'none'; }
  if (cardTimer > 0) { cardTimer -= dt; if (cardTimer <= 0) el.card.style.display = 'none'; }
  // compass strip
  const yaw = G.player.car ? G.player.car.userData.heading : G.player.yaw;
  const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  el.compass.textContent = `${dirs[Math.round(deg / 45) % 8]}  ${Math.round(deg)}°`;
  drawMinimap();
  if (el.map.style.display === 'block') drawFullMap();
}

function districtOf(x, z) {
  if (x < 0 && z >= 0) return 'Old Town';
  if (x >= 0 && z < 0) return 'Downtown';
  if (x >= 0 && z >= 0) return 'Marina';
  return 'Northside';
}
