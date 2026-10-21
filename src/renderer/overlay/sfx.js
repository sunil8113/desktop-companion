// Sound effects, synthesised with Web Audio so no audio files are needed.
// Exposes window.Sfx: thunder(src?), thwip(), whoosh().
(function () {
  let ac = null;

  function audio() {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  // White noise, or brown noise (integrated white noise: deeper, rumbly).
  function noise(ctx, seconds, brown) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        } else {
          data[i] = white;
        }
      }
    }
    return buffer;
  }

  function output(ctx, volume) {
    const master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    return master;
  }

  function synthThunder(volume = 0.9) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);

    // 1. Crack: a sharp burst of bright noise.
    const crack = ctx.createBufferSource();
    crack.buffer = noise(ctx, 0.5, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, t0);
    crackGain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.004);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    crack.connect(hp).connect(crackGain).connect(master);
    crack.start(t0);
    crack.stop(t0 + 0.5);

    // 2. Rumble: brown noise, darkening over time, with irregular swells.
    const duration = 3.6;
    const rumble = ctx.createBufferSource();
    rumble.buffer = noise(ctx, duration, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(1400, t0);
    lp.frequency.exponentialRampToValueAtTime(130, t0 + 1.8);
    const rumbleGain = ctx.createGain();
    const g = rumbleGain.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(1.0, t0 + 0.05);
    g.linearRampToValueAtTime(0.55, t0 + 0.35);
    g.linearRampToValueAtTime(0.9, t0 + 0.6);
    g.linearRampToValueAtTime(0.45, t0 + 1.1);
    g.linearRampToValueAtTime(0.65, t0 + 1.5);
    g.exponentialRampToValueAtTime(0.001, t0 + duration);
    rumble.connect(lp).connect(rumbleGain).connect(master);
    rumble.start(t0);
    rumble.stop(t0 + duration);

    // 3. Sub boom you feel more than hear.
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(58, t0);
    boom.frequency.exponentialRampToValueAtTime(32, t0 + 1.0);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.0001, t0);
    boomGain.gain.exponentialRampToValueAtTime(0.7, t0 + 0.02);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
    boom.connect(boomGain).connect(master);
    boom.start(t0);
    boom.stop(t0 + 1.3);
  }

  // Custom thunder recording if provided, otherwise the synthesised one.
  function thunder(src) {
    if (!src) return synthThunder();
    const el = new Audio(src);
    el.volume = 0.9;
    el.play().catch(() => synthThunder());
  }

  // Web shooter: a fast, falling "thwip" of filtered noise plus a tiny chirp.
  function thwip(volume = 0.7) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);

    const hiss = ctx.createBufferSource();
    hiss.buffer = noise(ctx, 0.25, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(4200, t0);
    bp.frequency.exponentialRampToValueAtTime(1100, t0 + 0.14);
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.0001, t0);
    hissGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.008);
    hissGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    hiss.connect(bp).connect(hissGain).connect(master);
    hiss.start(t0);
    hiss.stop(t0 + 0.25);

    const chirp = ctx.createOscillator();
    chirp.type = 'triangle';
    chirp.frequency.setValueAtTime(1300, t0);
    chirp.frequency.exponentialRampToValueAtTime(320, t0 + 0.09);
    const chirpGain = ctx.createGain();
    chirpGain.gain.setValueAtTime(0.0001, t0);
    chirpGain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.005);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    chirp.connect(chirpGain).connect(master);
    chirp.start(t0);
    chirp.stop(t0 + 0.12);
  }

  // Air rushing past during a swing.
  function whoosh(duration = 0.9, volume = 0.5) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);
    const air = ctx.createBufferSource();
    air.buffer = noise(ctx, duration, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(350, t0);
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + duration * 0.45);
    bp.frequency.exponentialRampToValueAtTime(450, t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.6, t0 + duration * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    air.connect(bp).connect(gain).connect(master);
    air.start(t0);
    air.stop(t0 + duration);
  }

  window.Sfx = { thunder, thwip, whoosh };
})();
