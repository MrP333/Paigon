/**
 * Seeded course generator for the lane runner.
 *
 * Every player in a lobby is handed the same room code, generates the same
 * course, and runs it for the same 90 seconds. Nothing here consults Math.random
 * or the clock, so the server can regenerate an identical course from the room
 * code alone and check a reported distance against what the course actually
 * permits.
 *
 * The central invariant is SOLVABILITY AT BASE SPEED: from any lane a player can
 * legally occupy, some open lane in the next hazard row is reachable at the
 * speed the game moves you along at. Nobody is ever forced into a gap they
 * cannot make. Boost is the one way to exceed that speed, it is opt-in, and its
 * risk belongs to whoever spends it. See `auditCourse`, which re-derives this
 * from the emitted course and is run over hundreds of seeds in the tests.
 */

// ── Tuning ────────────────────────────────────────────────────────────────────

export const LANES  = 3;
export const LANE_W = 3.2;

/**
 * Base speed is not under the player's control, and that is a correction to an
 * earlier design rather than an oversight.
 *
 * Throttle originally moved speed between 18 and 36. Measured against bots with
 * human reaction latencies from 0.10s to 0.50s, holding it won by 78-101% in
 * every single case — a player crashing 6.8 times a run still beat a clean
 * cruiser, because doubling your speed dwarfs any bearable crash penalty.
 * Breaking even would have needed ~244 units per crash, about 5.7 seconds of
 * stun, which is nobody's idea of a good time. A throttle that is always
 * correct to hold is not a decision; it is a key you tape down.
 *
 * So speed is fixed and the throttle spends BOOST from a meter that shards
 * refill. That makes it a question of *where* to spend rather than whether —
 * burn it on an open stretch, or gamble it into a tight one where the window
 * drops below what a lane change costs and a crash takes the whole meter.
 */
export const BASE_SPEED  = 32;
export const BOOST_SPEED = 10;
export const TOP_SPEED   = BASE_SPEED + BOOST_SPEED;
/** Seconds of boost the meter holds. Roughly seven shards to fill from empty. */
export const BOOST_CAP_S = 4.0;

export const RACE_MS = 90_000;

/** Seconds to slide one lane across. */
export const LANE_CHANGE_S = 0.18;
/** Sighting-to-input allowance folded into the reachability test. */
export const REACT_MARGIN_S = 0.25;

/**
 * How far ahead a hazard is legible. Fixed in units, deliberately: at BASE_SPEED
 * that is 0.88s of thinking time and at TOP_SPEED it is 0.67s. Spending boost is
 * the player choosing where on that scale to live.
 */
export const TELEGRAPH_LEAD = 28;

/**
 * Tightest hazard spacing the ramp will produce. Derived from BASE_SPEED, not
 * TOP_SPEED, and that distinction is the whole design.
 *
 * One lane change needs LANE_CHANGE_S + REACT_MARGIN_S = 0.43s, so at 32 u/s
 * the floor is 13.8 units. The course is therefore always clearable at base
 * speed — nobody is ever forced into a gap they cannot make.
 *
 * Boosting is a different matter. At 42 u/s the tightest rows give 0.33s, which
 * is under what a lane change costs, so spending boost into a late tight stretch
 * will put you into a wall. That is not the course being unfair: base speed
 * always works, the telegraph shows the stretch coming, and pressing the key is
 * the player's own call. Deriving the floor from TOP_SPEED instead made every
 * window a comfortable 0.61s and flattened the difference between a 0.15s and a
 * 0.45s reaction to 2.6% — no game left in it.
 */
export const MIN_GAP = 14;
/** Opening spacing, before the difficulty ramp closes it down. */
export const EASY_GAP = 48;
/** Clear run-up so the first hazard is never a surprise. */
export const START_CLEAR = 60;

/** Generated past the furthest anyone could travel, with headroom. */
export const COURSE_LEN = Math.ceil(TOP_SPEED * (RACE_MS / 1000) * 1.1);

export const SHARD_BOOST_S = 0.6;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Purely cosmetic — every kind blocks its lane identically. */
export type HazardKind = 'wall' | 'barrier' | 'beam' | 'gate';

export interface HazardRow {
  z: number;
  /** Lane indices 0..LANES-1 that are impassable. Never all of them. */
  blocked: number[];
  kind: HazardKind;
}

export interface Shard {
  z: number;
  lane: number;
}

export interface RunCourse {
  code: string;
  rows: HazardRow[];
  shards: Shard[];
  /** Lateral sway of the track centre; lanes are laid out either side of it. */
  sway: [number, number, number];
  length: number;
}

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
// Same pair the rest of the platform uses, so behaviour is familiar and a CJS
// mirror for the server is a copy rather than a translation.

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromCode(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) {
    h = Math.imul(31, h) + code.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/**
 * Track centre at a given depth. Three incommensurate sines so the sway never
 * visibly repeats over a 90 second run, all three phased by the seed so two
 * courses do not merely differ in obstacles while sharing a silhouette.
 */
export function trackCenter(course: RunCourse, z: number): number {
  const [a, b, c] = course.sway;
  return (
    Math.sin(z * 0.0115 + a) * 7.5 +
    Math.sin(z * 0.0044 + b) * 11 +
    Math.sin(z * 0.0281 + c) * 2.2
  );
}

/** World X of a lane centre. Lanes ride the sway; never assume x = 0. */
export function laneX(course: RunCourse, lane: number, z: number): number {
  return trackCenter(course, z) + (lane - (LANES - 1) / 2) * LANE_W;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 0 at the start line, 1 once the course is at full difficulty. */
export function rampAt(z: number): number {
  return smoothstep(START_CLEAR, COURSE_LEN * 0.78, z);
}

/**
 * Can a player in lane `from` reach lane `to` across `gap` units at BASE_SPEED?
 * Base rather than top, because that is the speed the game guarantees: boost is
 * opt-in and its risk belongs to whoever spends it.
 */
export function reachable(from: number, to: number, gap: number): boolean {
  const need = Math.abs(from - to) * LANE_CHANGE_S + REACT_MARGIN_S;
  return gap / BASE_SPEED >= need;
}

function openLanes(blocked: number[]): number[] {
  const out: number[] = [];
  for (let l = 0; l < LANES; l++) if (!blocked.includes(l)) out.push(l);
  return out;
}

/** Every lane in `prevOpen` must have somewhere legal to go. */
function rowIsFair(prevOpen: number[], nextOpen: number[], gap: number): boolean {
  if (nextOpen.length === 0) return false;
  return prevOpen.every(a => nextOpen.some(b => reachable(a, b, gap)));
}

// ── Generation ────────────────────────────────────────────────────────────────

const KINDS: HazardKind[] = ['wall', 'barrier', 'beam', 'gate'];

export function generateRun(code: string): RunCourse {
  const rng = mulberry32(seedFromCode(code || 'SOLO_PRACTICE'));

  const course: RunCourse = {
    code,
    rows: [],
    shards: [],
    sway: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
    length: COURSE_LEN,
  };

  let z = START_CLEAR;
  let prevOpen = [0, 1, 2];

  while (z < COURSE_LEN) {
    const ramp = rampAt(z);
    // Spacing closes as the run goes on; jitter keeps it from feeling metronomic.
    const base = EASY_GAP + (MIN_GAP - EASY_GAP) * ramp;
    const gap  = Math.max(MIN_GAP, base * (0.85 + rng() * 0.3));
    z += gap;
    if (z >= COURSE_LEN) break;

    // Two blocked lanes only once the player has had time to settle in, and
    // only when the spacing can still be cleared from wherever they are.
    const wantTwo = rng() < ramp * 0.55;
    const candidates = buildCandidates(wantTwo, rng);

    let chosen: number[] | null = null;
    for (const blocked of candidates) {
      if (rowIsFair(prevOpen, openLanes(blocked), gap)) { chosen = blocked; break; }
    }
    // Fall back to a single blocked lane, then to a free row, rather than ever
    // emitting something unclearable.
    if (!chosen) {
      for (let l = 0; l < LANES; l++) {
        if (rowIsFair(prevOpen, openLanes([l]), gap)) { chosen = [l]; break; }
      }
    }
    if (!chosen) continue;

    const row: HazardRow = { z, blocked: chosen, kind: KINDS[Math.floor(rng() * KINDS.length)] };
    course.rows.push(row);

    const nowOpen = openLanes(chosen);
    placeShards(course, rng, z, gap, nowOpen, prevOpen);
    prevOpen = nowOpen;
  }

  return course;
}

/** Blocked-lane options in a seeded order, widest-first when two are wanted. */
function buildCandidates(wantTwo: boolean, rng: () => number): number[][] {
  const singles = [[0], [1], [2]];
  const pairs   = [[0, 1], [1, 2], [0, 2]];
  const shuffle = (xs: number[][]) =>
    xs.map(v => ({ v, k: rng() })).sort((a, b) => a.k - b.k).map(o => o.v);
  return wantTwo ? [...shuffle(pairs), ...shuffle(singles)] : [...shuffle(singles), ...shuffle(pairs)];
}

/**
 * Shards pay out boost, and the point of them is to make the player choose.
 *
 * The obvious placement — mid-gap, in a lane off the racing line — does not
 * work here, and the reason is worth recording. Late-game gaps run about 20
 * units and a single lane change at TOP_SPEED needs 18.5, so a shard half a gap
 * back leaves 7-13 units to divert into. Two thirds of shards came out
 * physically uncollectable that way: not a risk, just scenery.
 *
 * So a shard goes in a lane that is already open at the row it precedes, which
 * makes it reachable by the same guarantee that makes the row fair. Where a row
 * leaves two lanes open, both are safe right now and the shard decides which one
 * is worth taking — the cost is paid in where that leaves you for the row after,
 * not in an impossible sidestep. Placement is still verified rather than
 * assumed, and a shard that fails the check is dropped.
 */
function placeShards(
  course: RunCourse, rng: () => number,
  rowZ: number, gap: number, nowOpen: number[], prevOpen: number[],
) {
  if (rng() > 0.5) return;

  // Prefer an open lane that was NOT open last row — that one costs a move.
  const risky = nowOpen.filter(l => !prevOpen.includes(l));
  const pool  = risky.length ? risky : nowOpen;
  const lane  = pool[Math.floor(rng() * pool.length)];

  // Sits just ahead of the row so it reads as part of threading the gap.
  const z = rowZ - gap * 0.18;
  const reach = z - (rowZ - gap);
  if (!prevOpen.some(l => reachable(l, lane, reach))) return;

  course.shards.push({ z, lane });
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface CourseAudit {
  rows: number;
  shards: number;
  fullyBlocked: number;
  /** Rows a player could be forced into with nowhere reachable to go. */
  unreachable: number;
  minGap: number;
  /** Tightest reaction window the course can present, in seconds at TOP_SPEED. */
  tightestWindowS: number;
}

/**
 * Independent check of the properties the generator is supposed to guarantee.
 * Deliberately re-derives them from the emitted course rather than trusting the
 * construction path, so a future change to generation cannot quietly weaken it.
 */
export function auditCourse(course: RunCourse): CourseAudit {
  let fullyBlocked = 0, unreachable = 0;
  let minGap = Infinity;

  let prevOpen = [0, 1, 2];
  let prevZ = START_CLEAR;

  for (const row of course.rows) {
    const open = openLanes(row.blocked);
    const gap  = row.z - prevZ;
    if (open.length === 0) fullyBlocked++;
    if (!rowIsFair(prevOpen, open, gap)) unreachable++;
    if (gap < minGap) minGap = gap;
    prevOpen = open;
    prevZ = row.z;
  }

  return {
    rows: course.rows.length,
    shards: course.shards.length,
    fullyBlocked,
    unreachable,
    minGap: minGap === Infinity ? 0 : minGap,
    tightestWindowS: (minGap === Infinity ? 0 : minGap) / TOP_SPEED,
  };
}
