// WebAudio synth radio: three stations, no audio files, no network.
// Created lazily on the first user gesture; every call is guarded so a
// headless run without audio never throws.
const PV_Audio = (() => {
  let ctx = null, master = null, timer = null, step = 0;
  const STATIONS = ['VERDE FM', 'BASSLINE 98', 'COAST 101'];
  // [bass midi, chord midi[], lead midi, tempo steps, waveform]
  const PATTERNS = [
    { bass: [45, 45, 48, 43], chord: [57, 60, 64], lead: [69, 72, 76, 74, 72, 69], wave: 'triangle', bpm: 96 },
    { bass: [36, 36, 39, 41], chord: [48, 51, 55], lead: [60, 63, 67, 65, 63, 60], wave: 'sawtooth', bpm: 112 },
    { bass: [41, 43, 45, 43], chord: [53, 57, 60], lead: [65, 69, 72, 71, 69, 65], wave: 'sine', bpm: 80 },
  ];
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = G.muted ? 0 : 0.16;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }
  function note(freq, t, dur, type, vol) {
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }
  function tick() {
    if (!ctx || G.muted) return;
    const p = PATTERNS[G.radio];
    const spb = 60 / p.bpm / 2, t = ctx.currentTime + 0.05;
    const i = step % 8;
    note(midi(p.bass[Math.floor(i / 2) % 4]), t, spb * 1.8, 'sine', 0.5);
    if (i % 2 === 0) note(midi(p.chord[(i / 2) % 3]), t, spb, p.wave, 0.12);
    if (i % 4 === 2) note(midi(p.lead[Math.floor(step / 4) % p.lead.length]), t, spb * 1.4, p.wave, 0.16);
    step++;
  }
  return {
    stations: STATIONS,
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    start() {
      if (!ensure() || timer) return;
      timer = setInterval(tick, 60 / PATTERNS[G.radio].bpm * 500);
    },
    cycle() {
      G.radio = (G.radio + 1) % STATIONS.length;
      step = 0;
      if (timer) { clearInterval(timer); timer = null; }
      this.start();
    },
    setMuted(m) { G.muted = m; if (master) master.gain.value = m ? 0 : 0.16; },
    name() { return STATIONS[G.radio]; },
    honk() {
      if (!ensure() || G.muted) return;
      try {
        const t = ctx.currentTime;
        for (const [at, dur] of [[0, 0.18], [0.22, 0.18]]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square'; o.frequency.value = 370;
          g.gain.setValueAtTime(0.0001, t + at);
          g.gain.exponentialRampToValueAtTime(0.25, t + at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
          o.connect(g); g.connect(master);
          o.start(t + at); o.stop(t + at + dur + 0.05);
        }
      } catch (e) {}
    },
  };
})();
