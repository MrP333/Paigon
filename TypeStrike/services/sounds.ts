/**
 * Synthesised audio. No asset files, so this adds nothing to the bundle and
 * cannot fail to load mid-match.
 *
 * The mute flag is shared with every other Paigon game through one localStorage
 * key, so muting in one game stays muted in the next.
 */
const MUTE_KEY = 'paigon_muted';
let muted = localStorage.getItem(MUTE_KEY) === 'true';

let ctx: AudioContext | null = null;
const ac = (): AudioContext => {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  // Browsers start the context suspended until a gesture; games always have one.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

const tone = (
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
  endFreq?: number,
) => {
  if (muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.type = type;
    const t0 = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq !== undefined) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.01);
  } catch { /* audio is never worth breaking a match over */ }
};

/** Short burst of filtered noise — used for impacts, which pure tones do badly. */
const noise = (dur: number, gain: number, freq = 900) => {
  if (muted) return;
  try {
    const c = ac();
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filt); filt.connect(g); g.connect(c.destination);
    src.start();
  } catch { /* ignore */ }
};

export const Sounds = {
  /** Correct character. Deliberately quiet — this fires many times a second. */
  key:   () => tone(760, 0.035, 'square', 0.055),
  /** Wrong character; you must backspace before advancing. */
  error: () => { tone(190, 0.13, 'sawtooth', 0.15); noise(0.07, 0.06, 350); },
  /** Error cleared, typing can resume. */
  clear: () => tone(520, 0.07, 'sine', 0.11),
  tick: () => tone(370, 0.09, 'triangle', 0.26),
  go: () => { tone(620, 0.16, 'square', 0.24); tone(930, 0.28, 'sine', 0.2, 0.07); },
  finish: () => [[660, 0], [880, 0.1], [1180, 0.2]].forEach(([f, d]) => tone(f, 0.34, 'sine', 0.22, d)),

  toggleMute: () => {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, String(muted));
    return muted;
  },
  isMuted: () => muted,
};
