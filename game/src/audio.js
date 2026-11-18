// Porto Verde — sound: three WebAudio synth radio stations (VERDE FM, BASSLINE 98,
// COAST 101), engine hum, horn, gunshot, coin. Q cycles station, M mutes.
// All synthesis, no audio files, no network.
import { G } from './state.js';

let ctx = null, master = null, radioGain = null, engineOsc = null, engineGain = null;
let schedTimer = null, step = 0, nextTime = 0;

// Frequencies (Hz). Chords are [root, third, fifth].
const STATIONS = [
  { name: 'VERDE FM', bpm: 100, wave: 'triangle', chords: [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]], bass: [110, 87.3, 130.8, 98], lead: [440, 523.3, 659.3, 587.3, 523.3, 440, 392, 523.3] },
  { name: 'BASSLINE 98', bpm: 122, wave: 'sawtooth', chords: [[110, 130.8, 164.8], [98, 116.5, 146.8], [123.5, 146.8, 185], [110, 130.8, 164.8]], bass: [55, 49, 61.7, 55], lead: [220, 261.6, 220, 196, 220, 293.7, 261.6, 220] },
  { name: 'COAST 101', bpm: 82, wave: 'sine', chords: [[261.6, 329.6, 392, 493.9], [220, 277.2, 329.6, 415.3], [196, 246.9, 293.7, 369.9], [246.9, 311.1, 370, 466.2]], bass: [130.8, 110, 98, 123.5], lead: [523.3, 587.3, 659.3, 587.3, 523.3, 493.9, 440, 523.3] },
];

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = G.muted ? 0 : 0.5; master.connect(ctx.destination);
    radioGain = ctx.createGain(); radioGain.gain.value = 0.32; radioGain.connect(master);
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
    engineGain = ctx.createGain(); engineGain.gain.value = 0; engineOsc.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
    nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(schedule, 90);
  } catch (e) { ctx = null; }
}

function note(freq, t, dur, type, vol, dest) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || radioGain);
  o.start(t); o.stop(t + dur + 0.05);
}

function schedule() {
  if (!ctx || G.muted) return;
  const st = STATIONS[G.station];
  const stepDur = 60 / st.bpm / 2; // eighth notes
  while (nextTime < ctx.currentTime + 0.35) {
    const bar = Math.floor(step / 8) % 4;
    const s8 = step % 8;
    if (s8 === 0) { // chord pad at the bar start
      for (const f of st.chords[bar]) note(f, nextTime, stepDur * 7, 'sine', 0.05);
    }
    if (s8 % 2 === 0) note(st.bass[bar] * (s8 === 6 ? 1.5 : 1), nextTime, stepDur * 1.8, 'triangle', 0.16);
    const lead = st.lead[(step * 3 + bar) % st.lead.length];
    if (s8 % 2 === 1) note(lead, nextTime, stepDur * 1.4, st.wave, 0.07);
    step++;
    nextTime += stepDur;
  }
}

export function setStation(i) {
  G.station = ((i % 3) + 3) % 3;
  step = 0;
  if (ctx) nextTime = ctx.currentTime + 0.05;
}
export function toggleMute() {
  G.muted = !G.muted;
  if (master) master.gain.value = G.muted ? 0 : 0.5;
}
export function setEngine(speed, active) {
  if (!ctx || !engineOsc) return;
  const target = active ? 0.05 + Math.min(0.12, Math.abs(speed) * 0.004) : 0;
  engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
  engineOsc.frequency.setTargetAtTime(45 + Math.abs(speed) * 3.2, ctx.currentTime, 0.1);
}

export function sfx(name) {
  if (!ctx || G.muted) return;
  const t = ctx.currentTime;
  if (name === 'coin') { note(880, t, 0.12, 'sine', 0.25, master); note(1318, t + 0.09, 0.18, 'sine', 0.25, master); }
  if (name === 'horn') {
    note(370, t, 0.4, 'square', 0.12, master); note(466, t, 0.4, 'square', 0.12, master);
  }
  if (name === 'shot') {
    const len = ctx.sampleRate * 0.16;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  if (name === 'click') note(660, t, 0.06, 'sine', 0.15, master);
}
