const MUTE_KEY = 'paigon_muted';
let muted = localStorage.getItem(MUTE_KEY) === 'true';

let ctx: AudioContext | null = null;
const ac = (): AudioContext => {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

const tone = (freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) => {
  if (muted) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.012);
};

const noise = (dur: number, gainVal: number, lpFreq: number, delay = 0) => {
  if (muted) return;
  const c   = ac();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / len * 1.8);
  const src  = c.createBufferSource();
  const filt = c.createBiquadFilter();
  const g    = c.createGain();
  src.buffer = buf;
  filt.type  = 'lowpass';
  filt.frequency.value = lpFreq;
  src.connect(filt); filt.connect(g); g.connect(c.destination);
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(gainVal, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.start(t0); src.stop(t0 + dur + 0.02);
};

export const NmlSounds = {
  // Short rifle crack when tower fires
  shoot: () => {
    noise(0.05, 0.18, 1200);
    tone(160, 0.06, 'square', 0.08, 0.01);
  },

  // Body hit
  hit: () => {
    tone(130, 0.12, 'square', 0.30);
    tone(90,  0.08, 'square', 0.18, 0.03);
    noise(0.1, 0.25, 400, 0.01);
  },

  // Artillery incoming warning — three rising beeps
  artWarning: () => {
    [0, 0.22, 0.44].forEach(d => tone(780 + d * 200, 0.12, 'sine', 0.22, d));
  },

  // Artillery explosion — deep boom + rumble
  explosion: () => {
    tone(55, 0.55, 'sine', 0.45);
    tone(38, 0.40, 'sine', 0.30, 0.06);
    noise(0.6, 0.55, 280);
  },

  // Victory — deep ascending arpeggio
  win: () => {
    [[261, 0], [329, 0.15], [392, 0.30], [523, 0.46]].forEach(
      ([f, d]) => tone(f, 0.45, 'sine', 0.28, d),
    );
  },

  // KIA — descending diminuendo
  die: () => {
    [440, 330, 220, 165].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.16));
  },

  toggleMute: () => {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, String(muted));
  },
  isMuted: () => muted,
};
