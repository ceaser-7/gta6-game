// Porto Verde — HUD: money, health, wanted, ammo, radio, coins, race,
// compass, speedo, circular minimap with blips + live-distance beacon,
// full-city map on Tab, dialogs, prompts, toasts, payout cards, WASTED.
import { G, fmtTime, dist2, clamp } from './util.js';
import { stationName } from './audio.js';

let el = {};
let cardT = 0;

export function initHUD() {
  const mk = (id, cls, parent) => {
    const d = document.createElement('div');
    d.id = id; d.className = cls;
    (parent || document.body).appendChild(d);
    return d;
  };
  el.hud = mk('hud', 'hud');
  el.money = mk('money', 'pill', el.hud);
  el.health = mk('health', 'pill', el.hud);
  el.wanted = mk('wanted', 'pill', el.hud);
  el.ammo = mk('ammo', 'pill', el.hud);
  el.radio = mk('radio', 'pill', el.hud);
  el.coins = mk('coins', 'pill', el.hud);
  el.race = mk('race', 'pill', el.hud);
  el.speedo = mk('speedo', 'pill', el.hud);
  el.compass = mk('compass', 'pill', el.hud);
  el.mission = mk('mission', 'pill', el.hud);
  el.beacon = mk('beacon', 'pill', el.hud);
  el.minimap = document.createElement('canvas');
  el.minimap.id = 'minimap'; el.minimap.width = 180; el.minimap.height = 180;
  document.body.appendChild(el.minimap);
  el.bigmap = document.createElement('canvas');
  el.bigmap.id = 'bigmap'; el.bigmap.width = 640; el.bigmap.height = 640;
  el.bigmap.style.display = 'none';
  document.body.appendChild(el.bigmap);
  el.dialog = mk('dialog', 'dialog');
  el.prompt = mk('prompt', 'prompt');
  el.toast = mk('toast', 'toast');
  el.card = mk('card', 'card');
  el.wasted = mk('wasted', 'wasted');
  el.hint = mk('hint', 'hint');
  el.menu = mk('menu', 'menu');
  el.menu.innerHTML = `<h1>PORTO VERDE</h1><p>A city that owes you nothing. A fixer who owns your debt.</p>
    <p class="sub">Mara Voss owes Rook $40,000. Three jobs and she is free.</p>
    <button id="btn-start">START</button> <button id="btn-continue" style="display:none">CONTINUE</button>
    <p class="controls">WASD move &nbsp;·&nbsp; Shift run &nbsp;·&nbsp; Mouse look &nbsp;·&nbsp; E enter car / talk / enter shops<br>
    F punch &nbsp;·&nbsp; R reload &nbsp;·&nbsp; H horn &nbsp;·&nbsp; Q radio &nbsp;·&nbsp; Tab map &nbsp;·&nbsp; M mute &nbsp;·&nbsp; 1/2/3 missions</p>
    <p class="controls">Talk to people. Find 12 Verde Coins. Race the Sunset Sprint. Eat at El Faro. Fix cars at Sunray.</p>`;
}

export function showDialog(name, text) {
  G.dialog = { name, text };
  el.dialog.style.display = 'block';
  el.dialog.innerHTML = `<b>${name}</b><p>${text}</p><span>ENTER to close</span>`;
}
export function queueDialog(name, text) {
  G.dialogQueue.push({ name, text });
  if (!G.dialog) nextDialog();
}
function nextDialog() {
  if (G.dialogQueue.length > 0) {
    const d = G.dialogQueue.shift();
    showDialog(d.name, d.text);
  } else {
    G.dialog = null;
    el.dialog.style.display = 'none';
  }
}
export function closeDialog() {
  if (!G.dialog) return;
  nextDialog();
}
export function toast(text) {
  el.toast.textContent = text;
  el.toast.style.display = 'block';
  G.toastT = 3;
}
export function showCard(title, sub) {
  el.card.innerHTML = `<b>${title}</b><p>${sub || ''}</p>`;
  el.card.style.display = 'block';
  cardT = 3.5;
}
export function showWasted() {
  el.wasted.style.display = 'block';
  el.wasted.innerHTML = '<h1>WASTED</h1><p>Mara is down. The city keeps moving.</p><p>Press ENTER to get back up.</p>';
}
export function hideWasted() { el.wasted.style.display = 'none'; }
export function setHint(text) {
  el.hint.textContent = text;
  el.hint.style.display = text ? 'block' : 'none';
  if (text) G.hintT = 15;
}
export function setPrompt(text) {
  el.prompt.textContent = text;
  el.prompt.style.display = text ? 'block' : 'none';
}

function drawMap(canvas, scale, showLabels) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width, C = S / 2;
  const w2s = (x, z) => [C + x * scale, C + z * scale];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(12,16,20,0.85)';
  ctx.beginPath(); ctx.arc(C, C, C, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a4148'; ctx.lineWidth = 1;
  // roads
  for (let i = 0; i <= 14; i++) {
    const r = -448 + i * 64;
    const [x1, y1] = w2s(r, -448), [x2, y2] = w2s(r, 448);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const [x3, y3] = w2s(-448, r), [x4, y4] = w2s(448, r);
    ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
  }
  // sea
  ctx.fillStyle = '#2e5d6b';
  const [sx] = w2s(448, 0);
  ctx.fillRect(sx, 0, S - sx, S);
  // mission / race target
  const target = G.mission ? G.mission.target : (G.race && G.race.cpIdx < 5 ? { x: [-384, -128, -128, 192, 192][G.race.cpIdx], z: [64, 64, -320, -320, 64][G.race.cpIdx] } : null);
  if (target) {
    const [tx, ty] = w2s(target.x, target.z);
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
  }
  // coins
  ctx.fillStyle = '#e8c33c';
  for (const c of G.coins) {
    if (c.taken) continue;
    const [cx, cy] = w2s(c.x, c.z);
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // police
  ctx.fillStyle = '#ff4444';
  for (const car of G.cars) {
    if (car.userData.type !== 'police') continue;
    const [cx, cy] = w2s(car.position.x, car.position.z);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // player
  const px = G.player ? G.player.position.x : G.spawn.x;
  const pz = G.player ? G.player.position.z : G.spawn.z;
  const [ppx, ppy] = w2s(px, pz);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(ppx, ppy - 6); ctx.lineTo(ppx + 4, ppy + 5); ctx.lineTo(ppx - 4, ppy + 5); ctx.closePath(); ctx.fill();
  if (showLabels) {
    ctx.fillStyle = '#e8e0cc'; ctx.font = '12px sans-serif';
    ctx.fillText('DOWNTOWN', ...w2s(-40, -8));
    ctx.fillText('OLD TOWN', ...w2s(-340, 240));
    ctx.fillText('MARINA', ...w2s(300, 240));
    ctx.fillText('UPTOWN', ...w2s(0, -340));
  }
}

export function updateHUD(dt) {
  el.money.textContent = `$${G.money}`;
  el.health.textContent = `♥ ${Math.round(G.health)}`;
  el.health.style.color = G.health < 30 ? '#ff6666' : '#e8e0cc';
  el.wanted.innerHTML = `<span style="color:#ff5555">${'★'.repeat(G.wanted)}</span><span style="color:rgba(232,224,204,0.35)">${'☆'.repeat(5 - G.wanted)}</span>`;
  el.ammo.textContent = `PISTOL ${G.ammo}/${G.ammoMax}`;
  el.radio.textContent = stationName();
  el.coins.textContent = `◉ Verde Coins ${G.coinGot.length}/12`;
  el.race.textContent = G.race ? `🏁 SPRINT CP ${G.race.cpIdx + 1}/5 — ${fmtTime(G.race.t)}` : '';
  el.race.style.display = G.race ? 'block' : 'none';
  const speed = G.playerCar ? Math.abs(G.playerCar.userData.speed) * 3.6 : 0;
  el.speedo.textContent = G.playerCar ? `${Math.round(speed)} km/h` : '';
  el.speedo.style.display = G.playerCar ? 'block' : 'none';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const deg = ((G.yaw * 180 / Math.PI) % 360 + 360) % 360;
  el.compass.textContent = dirs[Math.round(deg / 45) % 8] + ` ${Math.round(deg)}°`;
  const m = G.mission;
  el.mission.textContent = m ? `MISSION ${m.n + 1} — ${['The Tail', 'Getaway Car', 'Dragnet'][m.n]} — ${fmtTime(m.timer)}` : '';
  el.mission.style.display = m ? 'block' : 'none';
  const target = m ? m.target : null;
  if (target && G.player) {
    const px = G.playerCar ? G.playerCar.position.x : G.player.position.x;
    const pz = G.playerCar ? G.playerCar.position.z : G.player.position.z;
    const d = Math.round(dist2(px, pz, target.x, target.z));
    el.beacon.textContent = `${target.label} — ${d}m`;
    el.beacon.style.display = 'block';
  } else {
    el.beacon.style.display = 'none';
  }
  if (G.toastT > 0) {
    G.toastT -= dt;
    if (G.toastT <= 0) el.toast.style.display = 'none';
  }
  if (cardT > 0) {
    cardT -= dt;
    if (cardT <= 0) el.card.style.display = 'none';
  }
  if (G.hintT > 0) {
    G.hintT -= dt;
    if (G.hintT <= 0) el.hint.style.display = 'none';
  }
  drawMap(el.minimap, 180 / 896, false);
  if (el.bigmap.style.display !== 'none') drawMap(el.bigmap, 640 / 896, true);
}

export function toggleBigMap() {
  el.bigmap.style.display = el.bigmap.style.display === 'none' ? 'block' : 'none';
}
export function hideMenu() { el.menu.style.display = 'none'; }
export function showMenu(hasSave) {
  el.menu.style.display = 'block';
  const c = document.getElementById('btn-continue');
  if (c) c.style.display = hasSave ? 'inline-block' : 'none';
}
