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
  // radio: three synth stations, Q cycles them. All generated, no files.
  const STATIONS = [
    { name: 'VERDE FM', bass: [110, 87.3, 130.8, 98], step: 480, tick: true, drive: false },
    { name: 'BASSLINE 98', bass: [55, 55, 65.4, 49], step: 300, tick: true, drive: true },
    { name: 'COAST 101', bass: [130.8, 164.8, 196, 146.8], step: 640, tick: false, drive: false },
  ];
  A.station = 0;
  A.stationName = () => STATIONS[A.station].name;
  A.startMusic = () => {
    if (!ensure()) return;
    if (A.musicTimer) clearInterval(A.musicTimer);
    const st = STATIONS[A.station];
    A.musicTimer = setInterval(() => {
      if (A.muted || !A.ctx) return;
      const bar = st.bass[A.musicStep % st.bass.length];
      blip(bar, st.step / 300, 'triangle', st.drive ? 0.16 : 0.12);
      blip(bar * 2, st.step / 400, 'sine', 0.05);
      if (st.tick) noise(0.03, 6000, 0.03);
      if (st.drive && A.musicStep % 2 === 0) noise(0.05, 1200, 0.06);
      A.musicStep++;
    }, st.step);
  };
  A.nextStation = () => {
    A.station = (A.station + 1) % STATIONS.length;
    A.musicStep = 0;
    A.startMusic();
    if (G.hud) G.hud.toast('📻 ' + STATIONS[A.station].name);
  };
  A.horn = () => {
    if (!ensure() || A.muted) return;
    const o1 = A.ctx.createOscillator(), o2 = A.ctx.createOscillator(), g = A.ctx.createGain();
    o1.type = 'square'; o1.frequency.value = 370;
    o2.type = 'square'; o2.frequency.value = 440;
    g.gain.setValueAtTime(0.14, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.4);
    o1.connect(g); o2.connect(g); g.connect(A.master);
    o1.start(); o2.start(); o1.stop(A.ctx.currentTime + 0.4); o2.stop(A.ctx.currentTime + 0.4);
  };
  return A;
}
