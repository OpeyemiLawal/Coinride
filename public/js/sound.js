const Sound = (() => {
  let ctx = null;
  let enabled = true;

  // Engine state
  let engineNodes = null;

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      enabled = false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function pause() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }


  function toggle() {
    enabled = !enabled;
    if (!enabled) engineStop();
    return enabled;
  }

  let masterCompressor = null;

  // Helper to create a master limiter/compressor for clean mixing
  function getMasterNode() {
    if (!ctx) return null;
    if (masterCompressor) return masterCompressor;
    // Create a dynamics compressor to prevent clipping and make sounds punchier
    masterCompressor = ctx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-12, ctx.currentTime);
    masterCompressor.knee.setValueAtTime(4, ctx.currentTime);
    masterCompressor.ratio.setValueAtTime(12, ctx.currentTime);
    masterCompressor.attack.setValueAtTime(0.003, ctx.currentTime);
    masterCompressor.release.setValueAtTime(0.08, ctx.currentTime);
    masterCompressor.connect(ctx.destination);
    return masterCompressor;
  }

  function isEnabled() { return enabled; }

  function click() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();

    // High frequency tick
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    
    osc.connect(gain);
    gain.connect(dest);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  function jump() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();

    // Professional retro-sci-fi warm bubble jump
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    
    // Detuned slightly for richness
    osc1.frequency.setValueAtTime(160, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.18);
    osc2.frequency.setValueAtTime(162, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(425, ctx.currentTime + 0.18);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.22);
    osc2.stop(ctx.currentTime + 0.22);
  }

  function crash() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();
    engineStop();

    const now = ctx.currentTime;
    const dur = 0.5;

    // 1. Deep impact boom
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(100, now);
    subOsc.frequency.linearRampToValueAtTime(20, now + dur);
    subGain.gain.setValueAtTime(0.25, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    subOsc.connect(subGain);
    subGain.connect(dest);

    // 2. Filtered noise explosion
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(600, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(40, now + dur);
    noiseFilter.Q.setValueAtTime(2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);

    subOsc.start(now);
    subOsc.stop(now + dur);
    noise.start(now);
  }

  function nitro() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();
    const now = ctx.currentTime;
    const dur = 0.4;

    // Jet / rocket thruster swoosh using bandpass filtered white noise
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + dur);
    filter.Q.setValueAtTime(3, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Warm high-resonance synth layer
    const synth = ctx.createOscillator();
    synth.type = 'sawtooth';
    synth.frequency.setValueAtTime(120, now);
    synth.frequency.exponentialRampToValueAtTime(440, now + dur);
    
    const synthFilter = ctx.createBiquadFilter();
    synthFilter.type = 'lowpass';
    synthFilter.frequency.setValueAtTime(200, now);
    synthFilter.frequency.exponentialRampToValueAtTime(1000, now + dur);

    const synthGain = ctx.createGain();
    synthGain.gain.setValueAtTime(0.08, now);
    synthGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    synth.connect(synthFilter);
    synthFilter.connect(synthGain);
    synthGain.connect(dest);

    noise.start(now);
    synth.start(now);
    synth.stop(now + dur);
  }

  function victory() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();
    engineStop();

    // Play a modern arpeggiated major 9th chord (C - E - G - B - D) with delay effect
    const notes = [130.81, 164.81, 196.00, 246.94, 293.66]; // C3, E3, G3, B3, D4
    notes.forEach((freq, i) => {
      const now = ctx.currentTime + i * 0.08;
      
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 2, now); // Pitch it up one octave for chime
      
      sub.type = 'sine';
      sub.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.4);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.5);
      sub.stop(now + 0.5);
    });
  }

  function predHit() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();

    // Clean resonant bell chime (additive synth)
    const now = ctx.currentTime;
    const freqs = [659.25, 987.77, 1318.51]; // E5, B5, E6 (perfect fifths)
    
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      
      gain.gain.setValueAtTime(0.08 / (idx + 1), now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.5);
      
      osc.connect(gain);
      gain.connect(dest);
      
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.5);
    });
  }

  function predMiss() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();

    // Analogue synth style pitch drop with filter sweep
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(65, now + 0.45);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 0.45);
    filter.Q.setValueAtTime(5, now);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  function coinPickup() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();

    // Classic spark chime arpeggio
    const now = ctx.currentTime;
    const notes = [987.77, 1318.51]; // B5 then E6 (rising perfect fourth)

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.06, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.15);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.15);
    });
  }

  function flip() {
    if (!enabled || !ctx) return;
    resume();
    const dest = getMasterNode();
    const now = ctx.currentTime;
    const dur = 0.35;

    // 1. Fast frequency pitch sweep (rising sci-fi zip/whoosh)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + dur);

    oscGain.gain.setValueAtTime(0.12, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(oscGain);
    oscGain.connect(dest);

    // 2. Air whoosh overlay (sweeping bandpass filtered noise)
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(2000, now + dur);
    filter.Q.setValueAtTime(4, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);

    osc.start(now);
    osc.stop(now + dur);
    noise.start(now);
  }

  // ─────────────────────────────────────────────────────────
  // CONTINUOUS ENGINE SOUND (Futuristic Hover Engine hum)
  // ─────────────────────────────────────────────────────────

  function engineStart() {
    if (!enabled || !ctx) return;
    if (engineNodes) engineStop();
    resume();
    const dest = getMasterNode();

    // 1. Soft deep triangle sub-hum
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(55, ctx.currentTime); // A1

    // 2. Detuned sawtooths for futuristic warmth
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, ctx.currentTime);
    osc2.frequency.setValueAtTime(110.5, ctx.currentTime);

    // Cascaded filter to create a warm, thick 24dB low-pass roll off
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, ctx.currentTime);
    filter.Q.setValueAtTime(3, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.04, ctx.currentTime);

    // Sub oscillator gain
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.06, ctx.currentTime);

    // LFO to modulate filter frequency for organic hover "breathing"
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5, ctx.currentTime); // 5Hz breathing
    lfoGain.gain.setValueAtTime(35, ctx.currentTime); // Modulate by +/- 35Hz

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    sub.connect(subGain);
    subGain.connect(masterGain);
    filter.connect(masterGain);
    masterGain.connect(dest);

    osc1.start();
    osc2.start();
    sub.start();
    lfo.start();

    engineNodes = { osc1, osc2, sub, lfo, masterGain, filter, subGain, lfoGain };
  }

  function engineUpdate(speed, nitro) {
    if (!enabled || !engineNodes || !ctx) return;
    const now = ctx.currentTime;
    
    // Map speed (0 to 50) to smooth motor frequency range
    const normSpeed = Math.min(50, Math.max(0, Math.abs(speed))) / 50;
    const targetBaseFreq = 50 + normSpeed * 110; // 50Hz to 160Hz base
    const nitroBoost = nitro ? 1.35 : 1.0;

    // Apply smooth linear ramp to prevent any digital clicking
    engineNodes.sub.frequency.setTargetAtTime(targetBaseFreq * 0.5 * nitroBoost, now, 0.05);
    engineNodes.osc1.frequency.setTargetAtTime(targetBaseFreq * nitroBoost, now, 0.05);
    engineNodes.osc2.frequency.setTargetAtTime((targetBaseFreq + 0.6) * nitroBoost, now, 0.05);

    // Filter frequency opens up as you go faster
    const targetFilterFreq = 140 + normSpeed * 380 + (nitro ? 200 : 0);
    engineNodes.filter.frequency.setTargetAtTime(targetFilterFreq, now, 0.06);

    // Modulate LFO frequency based on engine speed (engine vibrations speed up)
    engineNodes.lfo.frequency.setTargetAtTime(4 + normSpeed * 12, now, 0.08);

    // Dynamic volume matching the engine power
    const targetVol = 0.035 + normSpeed * 0.08 + (nitro ? 0.02 : 0);
    engineNodes.masterGain.gain.setTargetAtTime(targetVol, now, 0.05);
  }

  function engineStop() {
    if (!engineNodes) return;
    try {
      engineNodes.osc1.stop();
      engineNodes.osc2.stop();
      engineNodes.sub.stop();
      engineNodes.lfo.stop();
    } catch (_) {}
    engineNodes = null;
  }

  return {
    init, toggle, isEnabled,
    click, jump, crash, nitro, victory, predHit, predMiss, coinPickup, flip,
    engineStart, engineUpdate, engineStop, pause, resume,
  };
})();

