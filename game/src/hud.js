// Porto Verde — HUD: money, wanted, health, minimap, dialogs, prompts, cards.
import { G, BOUND, clamp } from './state.js';
import { stationName } from './audio.js';
import { showNextBeat } from './story.js';

const $ = (id) => document.getElementById(id);
let mapCtx = null;

export function initHud() {
  const map = $('minimap');
  if (map) mapCtx = map.getContext('2d');
  G.ui.dialog = (who, line) => {
    G.dialog = { who, line };
    $('dialog-name').textContent = who;
    $('dialog-text').textContent = line;
    $('dialog').style.display = 'block';
  };
  G.ui.closeDialog = () => {
    G.dialog = null;
    $('dialog').style.display = 'none';
    showNextBeat();
  };
  G.ui.toast = (msg) => {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    t.dataset.until = String(G.time + 4);
  };
  G.ui.card = (title, sub) => {
    $('card-title').textContent = title;
    $('card-sub').textContent = sub;
    $('card').style.display = 'block';
    $('card').dataset.until = String(G.time + 3.5);
  };
  G.ui.brief = (title, text) => {
    $('brief-title').textContent = title;
    $('brief-text').textContent = text;
    $('brief').style.display = 'block';
    $('brief').dataset.until = String(G.time + 6);
  };
  G.ui.wasted = () => {
    $('wasted').style.display = 'flex';
    setTimeout(() => { location.reload(); }, 4000);
  };
  G.ui.drawFullMap = () => {
    const cv = $('fullmap');
    if (!cv) return;
    const c = cv.getContext('2d');
    const S = 560, R = S / 2;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#20242a'; c.fillRect(0, 0, S, S);
    const toMap = (x, z) => [R + (x / BOUND) * (R - 8), R + (z / BOUND) * (R - 8)];
    c.strokeStyle = '#3a3f47'; c.lineWidth = 4;
    for (let k = 0; k <= 14; k++) {
      const v = -BOUND + 64 * k;
      const [x1] = toMap(v, 0);
      c.beginPath(); c.moveTo(x1, 4); c.lineTo(x1, S - 4); c.stroke();
      const [, y1] = toMap(0, v);
      c.beginPath(); c.moveTo(4, y1); c.lineTo(S - 4, y1); c.stroke();
    }
    c.fillStyle = '#8a7a52';
    const [, by] = toMap(0, 416);
    c.fillRect(0, by, S, S - by);
    c.fillStyle = '#ffd34d';
    for (const coin of G.coins) {
      if (coin.got) continue;
      const [cx, cy] = toMap(coin.x, coin.z);
      c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill();
    }
    const m = G.mission;
    if (m && m.objective) {
      const [ox, oy] = toMap(m.objective.x, m.objective.z);
      c.fillStyle = '#ffd34d';
      c.beginPath(); c.arc(ox, oy, 10, 0, Math.PI * 2); c.fill();
    }
    const [rx, ry] = toMap(32, 32);
    c.fillStyle = '#ff8a3a';
    c.beginPath(); c.arc(rx, ry, 8, 0, Math.PI * 2); c.fill();
    const [px, py] = toMap(G.player.x, G.player.z);
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.fillText('PORTO VERDE — Tab to close', 12, 24);
  };
  G.ui.updateHud = updateHud;
}

export function updateHud() {
  const p = G.player;
  $('money').textContent = '$' + Math.floor(p.money).toLocaleString('en-US');
  $('health').textContent = '♥ ' + Math.max(0, Math.round(p.health));
  // wanted stars: filled red for active, dim for empty
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '<span class="star on">★</span>' : '<span class="star off">★</span>';
  $('wanted').innerHTML = stars;
  $('ammo').textContent = p.onFoot ? `▸ ${p.ammo}/12` : '';
  $('radio').textContent = G.muted ? '♪ MUTED' : `♪ ${stationName()}`;
  $('coins').textContent = `◉ Verde Coins ${G.coinGot.length}/12`;
  const r = G.race;
  $('race').textContent = r.active ? `🏁 SUNSET SPRINT — CP ${r.cp}/5 — ${Math.max(0, Math.ceil(r.t))}s` : '';
  $('speed').textContent = p.onFoot ? '' : `${Math.round(Math.abs(p.speed) * 3.6)} km/h`;
  // mission timer + objective distance
  const m = G.mission;
  if (m) {
    const mm = Math.floor(m.t / 60), ss = Math.floor(m.t % 60);
    $('mission').textContent = `${m.def.name} — ${mm}:${String(ss).padStart(2, '0')}`;
    const obj = m.objective;
    if (obj) {
      const d = Math.round(Math.hypot(p.x - obj.x, p.z - obj.z));
      $('objective').textContent = `◎ ${d}m`;
    } else $('objective').textContent = '';
  } else {
    $('mission').textContent = '';
    const next = nextMissionHint();
    $('objective').textContent = next;
  }
  // compass strip
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('compass').textContent = dirs[Math.round(deg / 45) % 8];
  drawMinimap();
  // timed overlays
  const t = $('toast');
  if (t.style.display === 'block' && G.time > Number(t.dataset.until || 0)) t.style.display = 'none';
  const c = $('card');
  if (c.style.display === 'block' && G.time > Number(c.dataset.until || 0)) c.style.display = 'none';
  const b = $('brief');
  if (b.style.display === 'block' && G.time > Number(b.dataset.until || 0)) b.style.display = 'none';
}

function nextMissionHint() {
  for (let i = 0; i < 3; i++) if (!G.missionsDone[i]) return `Next job: Rook's marker ${Math.round(Math.hypot(G.player.x - 32, G.player.z - 32))}m`;
  return 'All jobs done — the city is yours';
}

function drawMinimap() {
  if (!mapCtx) return;
  const c = mapCtx, S = 150, R = S / 2;
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#20242a'; c.fillRect(0, 0, S, S);
  const toMap = (x, z) => [R + (x / BOUND) * (R - 4), R + (z / BOUND) * (R - 4)];
  // roads
  c.strokeStyle = '#3a3f47'; c.lineWidth = 2;
  for (let k = 0; k <= 14; k++) {
    const v = -BOUND + 64 * k;
    const [x1] = toMap(v, 0);
    c.beginPath(); c.moveTo(x1, 2); c.lineTo(x1, S - 2); c.stroke();
    const [, y1] = toMap(0, v);
    c.beginPath(); c.moveTo(2, y1); c.lineTo(S - 2, y1); c.stroke();
  }
  // beach
  c.fillStyle = '#8a7a52';
  const [, by] = toMap(0, 416);
  c.fillRect(0, by, S, S - by);
  // coins
  c.fillStyle = '#ffd34d';
  for (const coin of G.coins) {
    if (coin.got) continue;
    const [cx, cy] = toMap(coin.x, coin.z);
    c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
  }
  // mission objective beacon
  const m = G.mission;
  if (m && m.objective) {
    const [ox, oy] = toMap(m.objective.x, m.objective.z);
    c.fillStyle = '#ffd34d';
    c.beginPath(); c.arc(ox, oy, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(ox, oy, 8 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2); c.stroke();
  }
  // Rook marker
  if (!m) {
    const [rx, ry] = toMap(32, 32);
    c.fillStyle = '#ff8a3a';
    c.beginPath(); c.arc(rx, ry, 4, 0, Math.PI * 2); c.fill();
  }
  // police blips
  c.fillStyle = '#4d8aff';
  for (const cop of G.cops) {
    const cx = cop.kind === 'car' ? cop.car.x : cop.x;
    const cz = cop.kind === 'car' ? cop.car.z : cop.z;
    const [mx, my] = toMap(cx, cz);
    c.beginPath(); c.arc(mx, my, 3, 0, Math.PI * 2); c.fill();
  }
  // player arrow
  const [px, py] = toMap(G.player.x, G.player.z);
  c.save();
  c.translate(px, py);
  c.rotate(G.player.yaw + Math.PI);
  c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
  c.restore();
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
  c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
}

export function setInteract(text) {
  const el = $('interact');
  if (!text) { el.style.display = 'none'; return; }
  el.textContent = text;
  el.style.display = 'block';
}
