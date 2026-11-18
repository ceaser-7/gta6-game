// Porto Verde — radio: three WebAudio synth stations (VERDE FM, BASSLINE 98,
// COAST 101). Small step sequencer, no audio files. Q cycles, M mutes.
import { G } from './util.js';

const STATIONS = [
  { name: 'VERDE FM', bpm: 100, bass: [45, 45, 48, 43, 45, 45, 50, 48], chords: [[57, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60]], lead: [69, 72, 76, 72, 69, 67, 64, 67] },
  { name: 'BASSLINE 98', bpm: 122, bass: [41, 41, 44, 41, 46, 44, 41, 39], chords: [[53, 56, 60], [53, 56, 60], [51, 55, 58], [53, 56, 60]], lead: [65, 68, 72, 68, 65, 63, 60, 63] },
  { name: 'COAST 101', bpm: 82, bass: [48, 43, 45, 43, 48, 43, 50, 45], chords: [[60, 64, 67], [58, 62, 65], [60, 64, 67], [55, 59, 62]], lead: [72, 76, 79, 76, 72, 71, 67, 71] },
];

let ctx = null, master = null, noiseBuf = null, step = 0, nextT = 0, timer = null;

function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function note(type, freq, t, dur, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function hat(t, vol) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 6000;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + 0.06);
}

function schedule() {
  if (!ctx || G.muted) return;
  const st = STATIONS[G.radio];
  const spb = 60 / st.bpm / 2; // eighth notes
  while (nextT < ctx.currentTime + 0.15) {
    const s = step % 8;
    const t = nextT;
    note('triangle', midi(st.bass[s]), t, spb * 0.9, 0.5);
    if (s % 2 === 0) {
      for (const m of st.chords[(s / 2) | 0]) note('sawtooth', midi(m), t, spb * 1.8, 0.06);
    }
    if (s % 4 === 2) note('sine', midi(st.lead[s]), t, spb * 1.5, 0.12);
    if (s % 2 === 1) hat(t, 0.08);
    nextT += spb;
    step++;
  }
}

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 40);
  } catch (e) { /* audio unavailable */ }
}

export function stationName() { return STATIONS[G.radio].name; }
export function cycleStation() {
  G.radio = (G.radio + 1) % STATIONS.length;
  step = 0;
}
export function toggleMute() {
  G.muted = !G.muted;
  if (master) master.gain.value = G.muted ? 0 : 0.5;
}
