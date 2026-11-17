// The HUD: stars, health, money, minimap, objectives, dialogue and screens.
// One clear job: show the player what is happening and take their menu clicks.
import * as THREE from 'three';
import { addTracer } from './combat.js';

export function createHud(G, callbacks) {
  const $ = id => document.getElementById(id);
  const hud = {
    el: $('hud'), stars: $('stars'), healthfill: $('healthfill'), money: $('money'),
    minimap: $('minimap'), objective: $('objective'), speedo: $('speedo'),
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
}

function drawMinimap(G) {
  const c = G.hud.minimap, g = c.getContext('2d');
  const S = 200, sc = S / 520, ox = S / 2, oz = S / 2;
  const X = x => ox + x * sc, Z = z => oz + z * sc;
  g.clearRect(0, 0, S, S);
  // water + sand
  g.fillStyle = '#1d6f8f';
  g.fillRect(0, 0, X(-216), S);
  g.fillRect(0, Z(216), S, S - Z(216));
  g.fillStyle = '#dcc491';
  g.fillRect(X(-216), Z(216), S - X(-216), Z(240) - Z(216));
  // blocks
  g.fillStyle = '#3a4148';
  for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) {
    g.fillRect(X(i * 54 + 11), Z(j * 54 + 11), (54 - 22) * sc, (54 - 22) * sc);
  }
  // park
  g.fillStyle = '#4c8a3f';
  g.fillRect(X(-16), Z(-16), 32 * sc, 32 * sc);
  // roads
  g.strokeStyle = '#6a7076'; g.lineWidth = 2;
  for (let i = -4; i <= 4; i++) {
    g.beginPath(); g.moveTo(X(i * 54), 0); g.lineTo(X(i * 54), S); g.stroke();
    g.beginPath(); g.moveTo(0, Z(i * 54)); g.lineTo(S, Z(i * 54)); g.stroke();
  }
  const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill(); };
  // mission beacon
  if (G.beacon && G.beacon.visible) {
    const pulse = 4 + Math.sin(G.time * 4) * 1.5;
    dot(G.beacon.position.x, G.beacon.position.z, pulse, '#ffd23e');
    g.strokeStyle = '#ffd23e'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(G.beacon.position.x), Z(G.beacon.position.z), pulse + 3, 0, Math.PI * 2); g.stroke();
  }
  // traffic + police
  for (const car of G.cars) {
    if (car.isPolice) dot(car.pos.x, car.pos.z, 3, Math.floor(G.time * 6) % 2 ? '#ff4444' : '#4488ff');
    else if (car.driver === 'traffic') dot(car.pos.x, car.pos.z, 2, 'rgba(255,255,255,0.75)');
  }
  // player arrow
  const p = G.player;
  const ang = p.onFoot ? p.yaw : p.car.angle;
  g.save();
  g.translate(X(p.pos.x), Z(p.pos.z));
  g.rotate(-ang + Math.PI);
  g.fillStyle = '#7dff9a';
  g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
  g.restore();
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
