// Sound: everything is synthesised with WebAudio — no audio files at all.
// One clear job: engine, sirens, shots, pickups and a little music, all generated.
export function createAudio(G) {
  const A = {
    ctx: null, master: null, muted: false, musicTimer: null, musicStep: 0,
    engineOsc: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null, sirenPhase: 0,
  };
  G.audio = A;

  function ensure() {
    if (!A.ctx) {
      try {
        A.ctx = new (window.AudioContext || window.webkitAudioContext)();
        A.master = A.ctx.createGain();
        A.master.gain.value = 0.55;
        A.master.connect(A.ctx.destination);
        // engine: sawtooth through a lowpass
        A.engineOsc = A.ctx.createOscillator();
        A.engineOsc.type = 'sawtooth'; A.engineOsc.frequency.value = 50;
        A.engineFilter = A.ctx.createBiquadFilter();
        A.engineFilter.type = 'lowpass'; A.engineFilter.frequency.value = 500;
        A.engineGain = A.ctx.createGain(); A.engineGain.gain.value = 0;
        A.engineOsc.connect(A.engineFilter); A.engineFilter.connect(A.engineGain); A.engineGain.connect(A.master);
        A.engineOsc.start();
        // siren: square wave, two tones
        A.sirenOsc = A.ctx.createOscillator();
        A.sirenOsc.type = 'square'; A.sirenOsc.frequency.value = 720;
        A.sirenGain = A.ctx.createGain(); A.sirenGain.gain.value = 0;
        A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
        A.sirenOsc.start();
      } catch (e) { /* audio unavailable: the game stays silent */ }
    }
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    return !!A.ctx;
  }
  A.ensure = ensure;
  A.resume = ensure;

  function noiseBuffer(dur) {
    const buf = A.ctx.createBuffer(1, A.ctx.sampleRate * dur, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || A.muted) return;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, A.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + dur);
    o.connect(g); g.connect(A.master);
    o.start(); o.stop(A.ctx.currentTime + dur);
  }
  function noise(dur, filterFreq, vol) {
    if (!ensure() || A.muted) return;
    const src = A.ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = A.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filterFreq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start();
  }
  A.engine = level => {
    if (!ensure()) return;
    const t = A.ctx.currentTime;
    A.engineOsc.frequency.setTargetAtTime(42 + level * 130, t, 0.06);
    A.engineFilter.frequency.setTargetAtTime(320 + level * 900, t, 0.08);
    A.engineGain.gain.setTargetAtTime(A.muted ? 0 : level * 0.11, t, 0.08);
  };
  A.siren = level => {
    if (!ensure()) return;
    const t = A.ctx.currentTime;
    A.sirenPhase += 1;
    if (A.sirenPhase % 24 === 0) {
      A.sirenOsc.frequency.setTargetAtTime(A.sirenOsc.frequency.value > 800 ? 700 : 950, t, 0.02);
    }
    A.sirenGain.gain.setTargetAtTime(A.muted ? 0 : level * 0.05, t, 0.1);
  };
  A.shot = distant => {
    noise(distant ? 0.12 : 0.18, distant ? 900 : 1600, distant ? 0.12 : 0.5);
    blip(160, 0.12, 'sine', 0.35, 55);
  };
  A.punch = () => { noise(0.09, 300, 0.5); blip(120, 0.1, 'sine', 0.3, 60); };
  A.thud = () => { blip(90, 0.22, 'sine', 0.5, 40); noise(0.12, 220, 0.25); };
  A.door = () => { blip(220, 0.06, 'square', 0.12); setTimeout(() => blip(140, 0.1, 'sine', 0.25, 70), 60); };
  A.pickup = () => { blip(660, 0.1, 'sine', 0.3); setTimeout(() => blip(880, 0.16, 'sine', 0.3), 90); };
  A.click = () => blip(520, 0.05, 'square', 0.1);
  A.success = () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 110)); };
  A.fail = () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.28), i * 140)); };
  A.setMuted = m => {
    A.muted = m;
    if (A.master) A.master.gain.value = m ? 0 : 0.55;
  };
  // a slow, warm bassline: Am – F – C – G, one note a bar, plus a soft tick
  const BASS = [110, 87.3, 130.8, 98];
  A.startMusic = () => {
    if (!ensure() || A.musicTimer) return;
    A.musicTimer = setInterval(() => {
      if (A.muted || !A.ctx) return;
      const bar = BASS[A.musicStep % 4];
      blip(bar, 1.6, 'triangle', 0.12);
      blip(bar * 2, 1.2, 'sine', 0.05);
      if (A.musicStep % 2 === 1) noise(0.03, 6000, 0.03);
      A.musicStep++;
    }, 480);
  };
  return A;
}
