// Port Velo — synthesised sound. No audio files: a WebAudio bassline loop for
// the neon-night drive, a siren when wanted, and one-shots for punches,
// gunshots, pickups, mission bells and crashes. Everything is guarded so a
// browser without audio (or with it blocked) just plays silent.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let sirenOsc = null;
  let sirenGain = null;
  let engineOsc = null;
  let engineGain = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    try {
      const t0 = ac.currentTime + when;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  // A slow minor-key bassline: A1 – C2 – E2 – G1, one note per beat.
  const BASSLINE = [55, 65.41, 82.41, 49];
  let beat = 0;
  function startMusic() {
    if (musicTimer || muted) return;
    const ac = ensure();
    if (!ac) return;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const f = BASSLINE[beat % BASSLINE.length];
      tone(f, 0.5, 'triangle', 0.12);
      if (beat % 2 === 0) tone(f * 2, 0.18, 'sine', 0.05);
      beat += 1;
    }, 420);
  }

  function stopMusic() {
    if (musicTimer) { window.clearInterval(musicTimer); musicTimer = null; }
  }

  function setSiren(on) {
    if (muted || !on) {
      if (sirenOsc) { try { sirenOsc.stop(); } catch { /* already stopped */ } sirenOsc = null; }
      return;
    }
    const ac = ensure();
    if (!ac || sirenOsc) return;
    try {
      sirenOsc = ac.createOscillator();
      sirenGain = ac.createGain();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.setValueAtTime(700, ac.currentTime);
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 0.6;
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain.gain.value = 0.03;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ac.destination);
      sirenOsc.start();
      lfo.start();
    } catch {
      sirenOsc = null;
    }
  }

  function setEngine(on, speed01) {
    if (muted || !on) {
      if (engineOsc) { try { engineOsc.stop(); } catch { /* already stopped */ } engineOsc = null; }
      return;
    }
    const ac = ensure();
    if (!ac) return;
    if (!engineOsc) {
      try {
        engineOsc = ac.createOscillator();
        engineGain = ac.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.02;
        engineOsc.connect(engineGain);
        engineGain.connect(ac.destination);
        engineOsc.start();
      } catch {
        engineOsc = null;
      }
    }
    if (engineOsc) engineOsc.frequency.setValueAtTime(50 + speed01 * 140, ac.currentTime);
  }

  return {
    unlock() { ensure(); startMusic(); },
    toggleMute() {
      muted = !muted;
      if (muted) { stopMusic(); setSiren(false); setEngine(false, 0); }
      else startMusic();
      return muted;
    },
    get muted() { return muted; },
    punch() { tone(120, 0.12, 'square', 0.15, 0, 60); },
    shoot() { tone(900, 0.1, 'square', 0.2, 0, 120); tone(180, 0.08, 'sawtooth', 0.1); },
    pickup() { tone(660, 0.1, 'sine', 0.15); tone(990, 0.16, 'sine', 0.15, 0.09); },
    mission() { tone(523, 0.14, 'sine', 0.18); tone(659, 0.14, 'sine', 0.18, 0.12); tone(784, 0.3, 'sine', 0.2, 0.24); },
    crash() { tone(90, 0.25, 'sawtooth', 0.2, 0, 40); },
    siren(on) { setSiren(on); },
    engine(on, speed01) { setEngine(on, speed01); },
    busted() { tone(220, 0.5, 'sawtooth', 0.2, 0, 110); },
  };
}
