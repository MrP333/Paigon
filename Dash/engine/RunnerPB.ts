/**
 * Per-course personal bests, kept in the browser.
 *
 * The seed IS the level, so a best is only meaningful against the course it
 * was set on — keyed by room code, never pooled. Storing the input trace
 * alongside the score is what makes the ghost possible: the simulation is
 * deterministic, so replaying the trace reproduces that exact run.
 *
 * Browser storage is unreliable by design here. It can be empty, it can throw
 * in a private window, and it never reaches the server. Nothing may depend on
 * it: a PB is a personal curiosity, and the cash result comes from the replay
 * the server does. Every access is wrapped accordingly.
 */

const KEY_PREFIX = 'parity_pb_';
/** Traces are ~1KB; a cap stops a heavy player filling their own quota. */
const MAX_COURSES = 40;

export interface PersonalBest {
  tokens: number;
  streak: number;
  contacts: number;
  reactionMs: number | null;
  /** The run itself, as [step, direction] pairs. Replayed for the ghost. */
  trace: [number, number][];
  at: number;
}

export function loadPB(code: string): PersonalBest | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + code);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.tokens !== 'number' || !Array.isArray(v?.trace)) return null;
    return v as PersonalBest;
  } catch {
    return null;
  }
}

/** Returns true when this run beat the stored best. */
export function savePB(code: string, pb: PersonalBest): boolean {
  const prev = loadPB(code);
  if (prev && prev.tokens >= pb.tokens) return false;
  try {
    localStorage.setItem(KEY_PREFIX + code, JSON.stringify(pb));
    pruneOldest();
    return true;
  } catch {
    // Quota, private mode, blocked storage — the run still counted, the
    // player just does not get a ghost next time.
    return false;
  }
}

function pruneOldest(): void {
  try {
    const keys: { k: string; at: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      let at = 0;
      try { at = JSON.parse(localStorage.getItem(k) || '{}')?.at ?? 0; } catch { /* drop it */ }
      keys.push({ k, at });
    }
    if (keys.length <= MAX_COURSES) return;
    keys.sort((a, b) => a.at - b.at);
    for (const { k } of keys.slice(0, keys.length - MAX_COURSES)) localStorage.removeItem(k);
  } catch { /* nothing here is load-bearing */ }
}
