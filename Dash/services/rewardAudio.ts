/** Short reward tones. Unlock from a click. Not wired to course generation. */

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, peak: number, slide = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Pitch climbs with the clean streak. That rise is the collect feedback. */
export function playToken(streak: number) {
  const f = 460 + Math.min(streak, 18) * 32;
  tone(f, 0.11, 'triangle', 0.06, 1.5);
}

export function playMilestone(streak: number) {
  const f = 520 + Math.min(streak, 20) * 18;
  tone(f, 0.16, 'sawtooth', 0.045, 1);
  tone(f * 1.5, 0.2, 'triangle', 0.04, 1.2);
}

export function playContact() {
  tone(180, 0.16, 'sine', 0.07, 0.45);
}

export function playGate() {
  tone(150, 0.08, 'sine', 0.07, 0.55);
  tone(620, 0.06, 'triangle', 0.045, 1.35);
}

export function playFinish() {
  tone(523, 0.18, 'triangle', 0.06, 1);
  window.setTimeout(() => tone(659, 0.18, 'triangle', 0.06, 1), 90);
  window.setTimeout(() => tone(784, 0.28, 'triangle', 0.07, 1.25), 180);
}
