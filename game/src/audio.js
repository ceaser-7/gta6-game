// Porto Verde — radio: 3 WebAudio synth stations, Q cycles, M mutes.
import { G } from './state.js';

export const STATIONS = [
  { name: 'VERDE FM', bpm: 96, root: 110, scale: [0, 3, 5, 7, 10], wave: 'triangle', bass: 55 },
  { name: 'BASSLINE 98', bpm: 122, root: 98, scale: [0, 0, 3, 5, 7, 10], wave: 'sawtooth', bass: 49 },
  { name: 'COAST 101', bpm: 80, root: 130.8, scale: [0, 2, 4, 7, 9], wave: 'sine', bass: 65.4 },
];

let ctx = null, master = null, stepTimer = null, step = 0, noiseBuf = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    startSequencer();
  } catch (e) { /* audio unavailable: the game plays on silently */ }
}

function note(freq, t, dur, wave, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function hat(t) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 6000;
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + 0.06);
}

function startSequencer() {
  const tick = () => {
    if (!ctx || G.muted) { stepTimer = setTimeout(tick, 120); return; }
    const st = STATIONS[G.radio];
    const spb = 60 / st.bpm / 2; // eighth notes
    const t = ctx.currentTime + 0.05;
    const s = step % 16;
    // bass on beats
    if (s % 4 === 0) note(st.bass * (s === 12 ? 1.5 : 1), t, spb * 1.8, 'sine', 0.5);
    // lead riff from the station's scale
    const scale = st.scale;
    const deg = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 1, 2, 0, 3][s];
    if (s % 2 === 0) {
      const semis = scale[deg % scale.length] + 12 * Math.floor(deg / scale.length);
      note(st.root * Math.pow(2, semis / 12), t, spb * 0.9, st.wave, 0.22);
    }
    if (s % 4 === 2) hat(t);
    step++;
    stepTimer = setTimeout(tick, spb * 1000);
  };
  tick();
}

export function cycleStation() {
  G.radio = (G.radio + 1) % STATIONS.length;
  G.ui.toast && G.ui.toast(`Radio: ${STATIONS[G.radio].name}`);
  G.ui.updateHud && G.ui.updateHud();
}

export function toggleMute() {
  G.muted = !G.muted;
  if (master) master.gain.value = G.muted ? 0 : 0.14;
  G.ui.updateHud && G.ui.updateHud();
}

export function honk() {
  if (!ctx || G.muted) return;
  const t = ctx.currentTime;
  for (const f of [370, 466]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.36);
  }
}

export function stationName() { return STATIONS[G.radio].name; }
