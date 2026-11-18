// Audio: 3 procedural radio stations (WebAudio), engine hum, horn, sirens, gunfire.
import { G, STATIONS } from './state.js';

let ctx = null, master = null, musicGain = null, sfxGain = null;
let musicTimer = null, step = 0, nextNoteTime = 0;
let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;

export function initAudio() {
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = G.volume; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(master);
  } catch (e) { ctx = null; }
}
export function setVolume(v) {
  G.volume = v;
  if (master) master.gain.value = v;
}
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

// ---- Radio: a simple step sequencer per station ----
function noteFreq(scale, degree, base = 220) {
  const n = scale[degree % scale.length] + 12 * Math.floor(degree / scale.length);
  return base * Math.pow(2, n / 12);
}
function playNote(freq, time, dur, wave, gainVal) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = wave; o.frequency.value = freq;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gainVal, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  o.connect(g); g.connect(musicGain);
  o.start(time); o.stop(time + dur + 0.05);
}
function scheduleMusic() {
  if (!ctx || G.muted) return;
  const st = STATIONS[G.radioStation];
  const spb = 60 / st.bpm / 2; // eighth notes
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const s = step % 16;
    // Bass on beats
    if (s % 4 === 0) playNote(noteFreq(st.scale, [0, 0, 2, 3][Math.floor(step / 16) % 4] || 0, 110), nextNoteTime, spb * 3.5, 'sine', 0.5);
    // Melody: sparse pentatonic
    if ((s === 2 || s === 6 || s === 10 || s === 14) && Math.random() < 0.8) {
      const deg = [0, 2, 4, 3, 1, 4, 2, 0][Math.floor(step / 4) % 8];
      playNote(noteFreq(st.scale, deg, 440), nextNoteTime, spb * 1.8, st.wave, 0.22);
    }
    // Hat tick
    if (s % 2 === 1) playNote(6000 + Math.random() * 2000, nextNoteTime, 0.03, 'square', 0.03);
    nextNoteTime += spb; step++;
  }
}
export function startRadio() {
  if (!ctx) return;
  resumeAudio();
  if (musicTimer) return;
  nextNoteTime = ctx.currentTime + 0.1; step = 0;
  musicTimer = setInterval(scheduleMusic, 120);
}
export function stopRadio() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
export function changeStation() {
  G.radioStation = (G.radioStation + 1) % STATIONS.length;
  G.radioSong = (G.radioSong + 1) % STATIONS[G.radioStation].songs.length;
  step = 0;
  if (G.updateHUD) G.updateHUD();
}
export function toggleMute() {
  G.muted = !G.muted;
  if (master) master.gain.value = G.muted ? 0 : G.volume;
  return G.muted;
}

// ---- SFX ----
function blip(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
  if (!ctx || G.muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
export function sfxHorn() { blip(330, 0.35, 'sawtooth', 0.25); blip(415, 0.35, 'sawtooth', 0.2); }
export function sfxShot() { blip(180, 0.12, 'square', 0.4, 60); }
export function sfxPunch() { blip(120, 0.1, 'sine', 0.35, 50); }
export function sfxCoin() { blip(880, 0.1, 'sine', 0.25); setTimeout(() => blip(1320, 0.18, 'sine', 0.25), 90); }
export function sfxClick() { blip(700, 0.05, 'square', 0.15); }
export function sfxCrash() { blip(90, 0.3, 'sawtooth', 0.4, 40); }
export function sfxSirenStart() {
  if (!ctx || sirenOsc) return;
  sirenOsc = ctx.createOscillator(); sirenGain = ctx.createGain();
  sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
  sirenGain.gain.value = 0.0;
  sirenOsc.connect(sirenGain); sirenGain.connect(sfxGain); sirenOsc.start();
}
export function sfxSiren(on) {
  if (!ctx) return;
  if (on && !sirenOsc) sfxSirenStart();
  if (!sirenOsc) return;
  const t = ctx.currentTime;
  if (on) {
    sirenGain.gain.setTargetAtTime(0.05, t, 0.5);
    sirenOsc.frequency.setTargetAtTime(700, t, 0.4);
    // wail: LFO via periodic toggle
    if (!sirenOsc._wail) {
      sirenOsc._wail = setInterval(() => {
        if (sirenOsc) sirenOsc.frequency.setTargetAtTime(sirenOsc.frequency.value > 800 ? 650 : 950, ctx.currentTime, 0.5);
      }, 900);
    }
  } else {
    sirenGain.gain.setTargetAtTime(0, t, 0.3);
    if (sirenOsc._wail) { clearInterval(sirenOsc._wail); sirenOsc._wail = null; }
  }
}
// Engine hum tied to speed.
export function engineSound(speed, top) {
  if (!ctx) return;
  if (!engineOsc) {
    engineOsc = ctx.createOscillator(); engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
    engineGain.gain.value = 0;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500;
    engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(sfxGain);
    engineOsc.start();
  }
  const t = ctx.currentTime, frac = Math.abs(speed) / Math.max(1, top);
  engineOsc.frequency.setTargetAtTime(55 + frac * 160, t, 0.08);
  engineGain.gain.setTargetAtTime(G.muted ? 0 : 0.05 + frac * 0.06, t, 0.1);
}
