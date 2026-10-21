// Sound effects, synthesised with Web Audio so no audio files are needed.
// Exposes window.Sfx: thunder(src?), thwip(), whoosh(), zap(), jet(), chime(), thunk(), splash().
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

  // Electric crackle for the speedster: buzzing bright noise bursts over a rising zap.
  function zap(volume = 0.45) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);

    const fizz = ctx.createBufferSource();
    fizz.buffer = noise(ctx, 0.4, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const fizzGain = ctx.createGain();
    fizzGain.gain.setValueAtTime(0.0001, t0);
    for (let i = 0; i < 8; i++) {
      const at = t0 + i * 0.045;
      fizzGain.gain.setValueAtTime(0.0001, at);
      fizzGain.gain.exponentialRampToValueAtTime(0.9 - i * 0.09, at + 0.006);
      fizzGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    }
    fizz.connect(hp).connect(fizzGain).connect(master);
    fizz.start(t0);
    fizz.stop(t0 + 0.4);

    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.setValueAtTime(180, t0);
    buzz.frequency.exponentialRampToValueAtTime(900, t0 + 0.3);
    const buzzGain = ctx.createGain();
    buzzGain.gain.setValueAtTime(0.0001, t0);
    buzzGain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
    buzzGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.34);
    buzz.connect(buzzGain).connect(master);
    buzz.start(t0);
    buzz.stop(t0 + 0.36);
  }

  // Jet thrusters: a roar of rumbly and hissing noise that swells and dies away.
  function jet(duration = 1.2, volume = 0.6) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);
    for (const [brown, type, freq, level] of [
      [true, 'lowpass', 500, 1.0],
      [false, 'bandpass', 2200, 0.35],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx, duration, brown);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(level, t0 + 0.12);
      gain.gain.setValueAtTime(level, t0 + duration * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      src.connect(filter).connect(gain).connect(master);
      src.start(t0);
      src.stop(t0 + duration);
    }
  }

  // Magic portal: a shimmering chord with tremolo that rings out.
  function chime(volume = 0.4) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.75; // wobbles between 0.5 and 1
    tremolo.connect(depth).connect(shimmer.gain);
    shimmer.connect(master);
    tremolo.start(t0);
    tremolo.stop(t0 + 1.6);
    [523.25, 783.99, 1046.5, 1567.98].forEach((freq, i) => {
      const at = t0 + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.5 / (i + 1), at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
      osc.connect(gain).connect(shimmer);
      osc.start(at);
      osc.stop(at + 1.5);
    });
  }

  // An arrow (or grapple) biting into something: a woody knock with a click.
  function thunk(volume = 0.7) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);
    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(220, t0);
    knock.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(0.0001, t0);
    knockGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.004);
    knockGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    knock.connect(knockGain).connect(master);
    knock.start(t0);
    knock.stop(t0 + 0.2);

    const click = ctx.createBufferSource();
    click.buffer = noise(ctx, 0.05, false);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.5, t0);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.03);
    click.connect(clickGain).connect(master);
    click.start(t0);
    click.stop(t0 + 0.05);
  }

  // Water: a gushing rush of filtered noise and a few rising bubble blips.
  function splash(duration = 0.9, volume = 0.55) {
    const ctx = audio();
    const t0 = ctx.currentTime + 0.01;
    const master = output(ctx, volume);

    const rush = ctx.createBufferSource();
    rush.buffer = noise(ctx, duration, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(600, t0);
    bp.frequency.exponentialRampToValueAtTime(2000, t0 + duration * 0.3);
    bp.frequency.exponentialRampToValueAtTime(500, t0 + duration);
    const rushGain = ctx.createGain();
    rushGain.gain.setValueAtTime(0.0001, t0);
    rushGain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.05);
    rushGain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    rush.connect(bp).connect(rushGain).connect(master);
    rush.start(t0);
    rush.stop(t0 + duration);

    for (let i = 0; i < 6; i++) {
      const at = t0 + 0.05 + Math.random() * duration * 0.7;
      const blip = ctx.createOscillator();
      blip.type = 'sine';
      const f = 400 + Math.random() * 500;
      blip.frequency.setValueAtTime(f, at);
      blip.frequency.exponentialRampToValueAtTime(f * 2.2, at + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      blip.connect(g).connect(master);
      blip.start(at);
      blip.stop(at + 0.08);
    }
  }

  window.Sfx = { thunder, thwip, whoosh, zap, jet, chime, thunk, splash };
})();
