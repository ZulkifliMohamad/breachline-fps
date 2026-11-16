// Synthesised sound effects. No audio files are shipped: every sound is built
// from oscillators and filtered noise in the Web Audio API, so the game stays
// fully offline and the dossier carries no binary assets.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return true;
  }

  function noiseBuffer(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || muted) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!ensure() || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shot(kind) {
      // Rifle: crack + body. SMG: shorter crack. Marksman: deep boom.
      if (kind === 'dmr') {
        burst(0.22, 900, 0.9);
        tone(120, 0.18, 0.5, 'sine', 45);
      } else if (kind === 'smg') {
        burst(0.09, 2400, 0.55);
        tone(190, 0.07, 0.25, 'square', 90);
      } else if (kind === 'pistol') {
        burst(0.1, 1800, 0.6);
        tone(160, 0.08, 0.3, 'square', 70);
      } else {
        burst(0.13, 1600, 0.8);
        tone(150, 0.11, 0.4, 'sawtooth', 60);
      }
    },
    distantShot() {
      burst(0.16, 500, 0.25);
    },
    dryFire() {
      tone(1400, 0.03, 0.15, 'square');
    },
    reload() {
      tone(900, 0.04, 0.2, 'square');
      setTimeout(() => tone(650, 0.04, 0.2, 'square'), 260);
      setTimeout(() => tone(1100, 0.05, 0.25, 'square'), 1500);
    },
    hit(kill) {
      tone(kill ? 1560 : 1240, 0.07, 0.3, 'sine');
      if (kill) setTimeout(() => tone(1560, 0.09, 0.3, 'sine'), 90);
    },
    hurt() {
      tone(220, 0.16, 0.4, 'sawtooth', 110);
      burst(0.1, 700, 0.25);
    },
    plantBeep() {
      tone(1180, 0.09, 0.3, 'square');
    },
    defuseBeep() {
      tone(880, 0.09, 0.3, 'square');
    },
    explosion() {
      burst(1.1, 320, 1.0);
      tone(70, 0.9, 0.8, 'sine', 28);
      burst(0.4, 2400, 0.35, 'highpass');
    },
    grenadePin() {
      tone(1500, 0.03, 0.2, 'square');
      setTimeout(() => tone(1100, 0.03, 0.2, 'square'), 80);
    },
    roundWin() {
      [523, 659, 784].forEach((freq, i) => setTimeout(() => tone(freq, 0.22, 0.3, 'triangle'), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((freq, i) => setTimeout(() => tone(freq, 0.26, 0.3, 'triangle'), i * 150));
    },
    buy() {
      tone(990, 0.06, 0.25, 'sine');
      setTimeout(() => tone(1320, 0.08, 0.25, 'sine'), 70);
    },
    denied() {
      tone(220, 0.12, 0.3, 'square');
    },
  };
}
