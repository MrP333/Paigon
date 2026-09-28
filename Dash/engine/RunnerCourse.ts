/**
 * Seeded course generator for the lane runner.
 *
 * Every player in a lobby is handed the same room code, generates the same
 * course, and runs it for the same 90 seconds. Nothing here consults Math.random
 * or the clock, so the server can regenerate an identical course from the room
 * code alone and check a reported distance against what the course actually
 * permits.
 *
 * The central invariant is RECOVERABILITY: from any lane, at the speed the game
 * resets you to after contact, some open lane in the next row is always
 * reachable. However badly a run is going, the next row is never a trap. Speed
 * above reset is earned by clean riding, and the risk of carrying it is the
 * player's. See `auditCourse`, which re-derives this from the emitted course and
 * is run over hundreds of seeds in the tests.
 */

// ── Tuning ────────────────────────────────────────────────────────────────────

export const LANES  = 3;
export const LANE_W = 3.2;

/**
 * Speed is earned by riding clean and lost on contact — there is no throttle and
 * no meter. Two earlier designs died to measurement before this one:
 *
 * Throttle moving speed between 18 and 36 was strictly dominant. Against bots at
 * reaction latencies 0.10s-0.50s, holding it won by 78-101% every time, because
 * doubling speed dwarfs any bearable crash penalty. A key that is always correct
 * to hold is not a decision.
 *
 * A spendable boost meter fixed that but was a resource to babysit, which does
 * not belong in this game.
 *
 * What is left is a thermostat. Clean running charges speed; contact drops it.
 * The course's own spacing sets a clearable ceiling that declines as the ramp
 * tightens, so every player oscillates around the speed where their reaction
 * gives out — which is exactly their skill — and distance covered measures it.
 * Nothing to manage, no score to max out.
 */
/** Speed dropped to after contact, and the speed the run opens at. */
export const RESET_SPEED = 20;
/**
 * Absolute bound, for server sanity checks only — the thermostat, not this,
 * is what actually limits a run. Set high enough not to bind: a 0.50s player
 * peaks around 67 regardless, and only near-perfect play approaches it. An
 * earlier value of 70 was being hit by everybody, which reintroduced exactly
 * the ceiling Momentum exists to avoid.
 */
export const SPEED_CAP = 110;

export const RACE_MS = 90_000;

/** Seconds to slide one lane across. */
export const LANE_CHANGE_S = 0.18;
/** Sighting-to-input allowance folded into the reachability test. */
export const REACT_MARGIN_S = 0.25;

/**
 * How far ahead a hazard is legible. Fixed in units, so reaction time is
 * LEAD / speed and shrinks as you charge: 1.4s at reset speed, 0.86s at the
 * clearable ceiling. Going faster is always the player buying distance with
 * thinking time.
 */
export const TELEGRAPH_LEAD = 28;

/** One lane change, decided and completed. The unit everything is sized against. */
export const SAFE_WINDOW_S = LANE_CHANGE_S + REACT_MARGIN_S;

/**
 * Tightest hazard spacing the ramp will produce, and the number that sets where
 * the thermostat settles.
 *
 * The hard fairness floor is RESET_SPEED * SAFE_WINDOW_S = 8.6 units: below that
 * a player could crash and be unable to clear the very next row, which would be
 * a genuine trap. 14 sits well clear of it — at reset speed every row gives 0.7s,
 * so recovery is always possible.
 *
 * The gameplay consequence is the ceiling it implies: 14 / 0.43 = 32.5 u/s is
 * the fastest the tightest rows can be cleared at. Charge past that and the late
 * course starts taking hits off you. Since the ramp closes spacing from 48 down
 * to 14, the clearable ceiling falls throughout the run while your speed climbs,
 * and where those two cross is the race.
 */
export const MIN_GAP = 14;
/** Opening spacing, before the difficulty ramp closes it down. */
export const EASY_GAP = 48;
/** Clear run-up so the first hazard is never a surprise. */
export const START_CLEAR = 60;

/** Generated past the furthest anyone could travel, with headroom. */
export const COURSE_LEN = Math.ceil(SPEED_CAP * (RACE_MS / 1000) * 1.12);

/**
 * Where the difficulty ramp tops out. Deliberately far short of COURSE_LEN,
 * which is a generation bound rather than a distance anyone reaches: tying the
 * ramp to it stretched full difficulty out past 6900 units when even a perfect
 * run stops around 5000, so the tightest rows were never encountered and the
 * thermostat had nothing to push back against.
 *
 * Ramping by distance rather than by time also means going fast brings the hard
 * section closer, so speed is its own counterweight.
 */
export const RAMP_FULL_Z = 3000;

/** Collecting a shard adds this directly to speed — charge, not currency. */
export const SHARD_SPEED = 1.5;

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
  return smoothstep(START_CLEAR, RAMP_FULL_Z, z);
}

/**
 * Can a player in lane `from` reach lane `to` across `gap` units at RESET_SPEED?
 * Reset rather than current speed, because that is the only speed the game hands
 * you. Everything above it you charged up yourself, and the risk comes with it.
 */
export function reachable(from: number, to: number, gap: number): boolean {
  const need = Math.abs(from - to) * LANE_CHANGE_S + REACT_MARGIN_S;
  return gap / RESET_SPEED >= need;
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
  /** Reaction window the tightest row gives at reset speed. Must clear SAFE_WINDOW_S. */
  tightestWindowS: number;
  /** Fastest the tightest row can be cleared at — where the thermostat caps out. */
  clearableCeiling: number;
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
    tightestWindowS: (minGap === Infinity ? 0 : minGap) / RESET_SPEED,
    clearableCeiling: (minGap === Infinity ? 0 : minGap) / SAFE_WINDOW_S,
  };
}
