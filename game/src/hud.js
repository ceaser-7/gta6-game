// HUD: money/health/wanted/coins/speed/ammo/radio, circular minimap with
// blips + live-distance beacon, compass, dialog box, mission card, WASTED.
const PV_HUD = (() => {
  const $ = (id) => document.getElementById(id);
  let toastTimer = null;
  function update() {
    $('money').firstChild.textContent = '$' + Math.floor(G.money) + ' ';
    $('health').textContent = 'Health ' + Math.max(0, Math.floor(G.health));
    $('wanted').textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
    $('coins').textContent = '◉ Verde Coins ' + G.coinGot.length + '/12';
    $('ammo').textContent = 'PISTOL ' + G.ammo + '/' + G.ammoMax;
    $('radio').textContent = PV_Audio.name() + (G.muted ? ' (muted)' : '');
    const p = G.player;
    if (p && !p.onFoot && p.car) {
      $('speed').innerHTML = Math.round(Math.abs(p.car.speed) * 3.6) + ' <small>km/h</small>';
    } else {
      $('speed').innerHTML = Math.round((p ? p.speed : 0) * 3.6) + ' <small>km/h</small>';
    }
  }
  function compass() {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(((-G.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
    $('compass').textContent = '◈ ' + dirs[idx] + '  ·  ' + (G.beaconTarget ? Math.round(dist2(G.player.x, G.player.z, G.beaconTarget.x, G.beaconTarget.z)) + 'm to target' : 'Porto Verde');
  }
  function drawMinimap(canvas) {
    const g = canvas.getContext('2d');
    const W = canvas.width, C = W / 2, S = W / 900;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#10151d'; g.fillRect(0, 0, W, W);
    // zoomed local view: 280-unit window centred on the player
    const p = G.player;
    const px = p ? p.x : 0, pz = p ? p.z : 0;
    const view = 280, sc = W / view;
    const toX = (x) => C + (x - px) * sc, toZ = (z) => C + (z - pz) * sc;
    // roads
    g.strokeStyle = '#3f444b'; g.lineWidth = 10 * sc;
    for (let k = 0; k <= 14; k++) {
      const c = -448 + k * 64;
      g.beginPath(); g.moveTo(toX(c), toZ(-448)); g.lineTo(toX(c), toZ(448)); g.stroke();
      g.beginPath(); g.moveTo(toX(-448), toZ(c)); g.lineTo(toX(448), toZ(c)); g.stroke();
    }
    // parks
    g.fillStyle = '#4a6b3f';
    for (const [pi, pj] of [[6, 6], [7, 6], [6, 7], [7, 7], [2, 3], [3, 3]]) {
      g.fillRect(toX(-416 + pi * 64) - 26 * sc, toZ(-416 + pj * 64) - 26 * sc, 52 * sc, 52 * sc);
    }
    // coins
    g.fillStyle = '#ffd23e';
    for (const c of G.coins) if (!c.got) { g.beginPath(); g.arc(toX(c.x), toZ(c.z), 3, 0, Math.PI * 2); g.fill(); }
    // mission beacon
    if (G.beaconTarget) {
      const bx = toX(G.beaconTarget.x), bz = toZ(G.beaconTarget.z);
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(bx, bz, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 11px Verdana'; g.textAlign = 'center';
      g.fillText(Math.round(dist2(px, pz, G.beaconTarget.x, G.beaconTarget.z)) + 'm', bx, bz - 10);
      // edge arrow when off-screen
      if (bx < 8 || bx > W - 8 || bz < 8 || bz > W - 8) {
        const a = Math.atan2(bz - C, bx - C);
        g.fillStyle = '#ffd23e';
        g.beginPath();
        g.moveTo(C + Math.cos(a) * (C - 12), C + Math.sin(a) * (C - 12));
        g.lineTo(C + Math.cos(a + 2.6) * 14 + Math.cos(a) * (C - 12), C + Math.sin(a + 2.6) * 14 + Math.sin(a) * (C - 12));
        g.lineTo(C + Math.cos(a - 2.6) * 14 + Math.cos(a) * (C - 12), C + Math.sin(a - 2.6) * 14 + Math.sin(a) * (C - 12));
        g.fill();
      }
    }
    // police blips
    g.fillStyle = '#4a8aff';
    for (const car of G.cars) {
      if (car.driver === 'cop') { g.beginPath(); g.arc(toX(car.x), toZ(car.z), 3.5, 0, Math.PI * 2); g.fill(); }
    }
    // player car blip
    if (p && p.car) {
      g.fillStyle = '#9fe6a0';
      g.beginPath(); g.arc(toX(p.car.x), toZ(p.car.z), 4, 0, Math.PI * 2); g.fill();
    }
    // player arrow (ringed)
    g.save();
    g.translate(C, C); g.rotate(Math.PI - (p ? p.heading : 0));
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill();
    g.strokeStyle = '#ffd23e'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.restore();
    // compass ring ticks
    g.fillStyle = '#eaf2ff'; g.font = '10px Verdana'; g.textAlign = 'center';
    g.fillText('N', C, 12);
  }
  function drawBigMap() {
    const canvas = $('bigmapc');
    const g = canvas.getContext('2d');
    const W = 640, S = W / 900;
    g.fillStyle = '#10151d'; g.fillRect(0, 0, W, W);
    const toX = (x) => (x + 448) * S, toZ = (z) => (z + 448) * S;
    g.strokeStyle = '#3f444b'; g.lineWidth = 8;
    for (let k = 0; k <= 14; k++) {
      const c = -448 + k * 64;
      g.beginPath(); g.moveTo(toX(c), 0); g.lineTo(toX(c), W); g.stroke();
      g.beginPath(); g.moveTo(0, toZ(c)); g.lineTo(W, toZ(c)); g.stroke();
    }
    g.fillStyle = '#4a6b3f';
    for (const [pi, pj] of [[6, 6], [7, 6], [6, 7], [7, 7], [2, 3], [3, 3]]) {
      g.fillRect(toX(-416 + pi * 64) - 26 * S, toZ(-416 + pj * 64) - 26 * S, 52 * S, 52 * S);
    }
    g.fillStyle = '#c9b285'; g.fillRect(toX(400), 0, 48 * S, W);
    g.fillStyle = '#ffd23e';
    for (const c of G.coins) if (!c.got) { g.beginPath(); g.arc(toX(c.x), toZ(c.z), 4, 0, Math.PI * 2); g.fill(); }
    if (G.beaconTarget) {
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(toX(G.beaconTarget.x), toZ(G.beaconTarget.z), 8, 0, Math.PI * 2); g.fill();
    }
    const p = G.player;
    if (p) {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(toX(p.x), toZ(p.z), 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffd23e'; g.lineWidth = 2;
      g.beginPath(); g.arc(toX(p.x), toZ(p.z), 10, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#eaf2ff'; g.font = '14px Verdana'; g.textAlign = 'left';
    g.fillText('PORTO VERDE — Tab to close', 12, 24);
  }
  function showDialog(who, line) {
    $('dialog').style.display = 'block';
    $('dialog').querySelector('.who').textContent = who;
    $('dialog').querySelector('.line').textContent = line;
  }
  function hideDialog() { $('dialog').style.display = 'none'; }
  function nextDialog() {
    if (G.dialog) return;
    const d = G.dialogQueue.shift();
    if (d) PV_Dialogue.showDialog(d.who, d.line);
  }
  function toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg; el.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms || 3500);
  }
  function mission(text) {
    const el = $('mission');
    if (!text) { el.style.display = 'none'; return; }
    el.textContent = text; el.style.display = 'block';
  }
  function missionCard(title, sub) {
    const el = $('mission');
    el.innerHTML = '<b style="font-size:20px;color:#9fe6a0">' + title + '</b><br>' + sub;
    el.style.display = 'block';
    setTimeout(() => { if (!G.mission) el.style.display = 'none'; }, 4000);
  }
  function race(r) {
    const el = $('race');
    if (!r) { el.textContent = ''; return; }
    el.textContent = '🏁 SUNSET SPRINT — CP ' + r.cp + '/5 — ' + fmtTime(r.t);
  }
  function showWasted(text) {
    $('wasted').querySelector('div').textContent = text || 'WASTED';
    $('wasted').style.display = 'flex';
  }
  function hideWasted() { $('wasted').style.display = 'none'; }
  function hint(text, hold) {
    $('hint').textContent = text;
    G.hintT = hold || 15;
  }
  function interact(text) {
    const el = $('interact');
    if (!text) { el.style.display = 'none'; return; }
    el.textContent = text; el.style.display = 'block';
  }
  return { update, compass, drawMinimap, drawBigMap, showDialog, hideDialog, nextDialog, toast, mission, missionCard, race, showWasted, hideWasted, hint, interact };
})();
