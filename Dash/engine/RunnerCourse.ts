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
 * How far ahead hazards are drawn. This is the real visibility horizon and the
 * client renders to it — an earlier value of 28 was never wired to anything,
 * so both the code comments and the design reasoning built on it described a
 * telegraph that did not exist. Reaction budget is LEAD / speed: 6.5s at reset
 * speed, 2.8s at the clearable ceiling.
 *
 * Changing this changes how much planning is possible, so it is a gameplay
 * number, not a draw-distance number.
 */
export const TELEGRAPH_LEAD = 130;

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

/**
 * The window the speed cap holds rows to, and the single most sensitive number
 * in the game.
 *
 * It must sit at what an EXCELLENT human can do, not an average one. Capping to
 * SAFE_WINDOW_S * 1.3 = 0.56s made every row comfortable for everybody, nobody
 * was ever challenged, and head-to-head collapsed to a coin flip at 50.7%.
 * Capping too high the other way is what produced unclearable rows in the first
 * place.
 *
 * A lane change takes LANE_CHANGE_S = 0.18s of travel, so this is that plus the
 * reaction of a very good player. Anyone slower crashes at the cap, the
 * thermostat drops them, and they settle at a speed that IS achievable for them
 * — which is the whole point. Nothing is impossible for a human; plenty is
 * impossible for a human going too fast for their own reactions.
 */
export const CEILING_WINDOW_S = 0.30;

/** How far ahead the speed cap looks for the tightest upcoming row. */
export const CEILING_LOOKAHEAD = 70;

/**
 * Fastest the course permits at this depth, given what is coming up.
 *
 * This is the fix for the game's biggest problem. Speed used to charge past
 * what the spacing could support: at a 0.15s reaction a player ended up taking
 * 37% of rows at a speed that could not clear them, and the better the player
 * the worse it got, because charging higher bought more impossible rows.
 * Whether you ate one of those depended on where you happened to be rather than
 * on how you played, which turned skill into noise — measured signal-to-noise
 * was 0.6, and the weaker of two players won 36% of the time.
 *
 * Capping here means nothing is ever unclearable. It also means distance is
 * nearly the same for everyone, which is why tokens rather than distance are
 * what the run is scored on.
 */
export function speedCeilingAt(course: RunCourse, z: number, fromRow = 0): number {
  let minGap = Infinity;
  for (let i = fromRow; i < course.rows.length; i++) {
    const r = course.rows[i];
    if (r.z < z) continue;
    if (r.z > z + CEILING_LOOKAHEAD) break;
    if (r.gap < minGap) minGap = r.gap;
  }
  if (minGap === Infinity) return SPEED_CAP;
  return Math.min(SPEED_CAP, minGap / CEILING_WINDOW_S);
}

// ── Lane closures ─────────────────────────────────────────────────────────────

/**
 * Closures are measured in DISTANCE, never in seconds, and that is the whole
 * point of them.
 *
 * A closure timed in seconds would cover more ground for a fast player than a
 * slow one, so two people in the same lobby would be running physically
 * different courses — the one thing a head-to-head contest cannot survive. As a
 * stretch of track, everyone meets the identical closure and going fast simply
 * means spending less time inside it, which is the trade speed already carries.
 *
 * Length is kept well under what it could be. At a typical 38 u/s a run covers
 * ~3450 units, so 150-250 units is four to six seconds: an event, not the
 * default state. A 10-second closure with a 3-second break would have left a
 * lane shut for roughly 77% of the race and quietly turned Dash into a two-lane
 * game.
 */
export const CLOSURE_MIN_LEN = 120;
export const CLOSURE_MAX_LEN = 180;
/** Open track between closures. Deliberately longer than the closures. */
export const CLOSURE_OPEN_MIN = 600;
export const CLOSURE_OPEN_MAX = 1000;
/** No closures until the player has settled in. */
export const CLOSURE_START_Z = 400;
/**
 * How far ahead of a closure the generator already treats the lane as shut.
 *
 * Without this the generator could emit a row at z-10 that blocks the other two
 * lanes, forcing the player into the very lane that closes at z — contact with
 * nothing they could have done. Collision still only starts at z0; this only
 * constrains what the generator is allowed to build in the run-up.
 */
export const CLOSURE_LEAD = 80;

export interface Closure {
  /** Collision starts here. */
  z0: number;
  z1: number;
  lane: number;
}

/** The lane shut at `z`, or -1. Closures are sorted and never overlap. */
export function closedLaneAt(course: RunCourse, z: number): number {
  for (const c of course.closures) {
    if (z < c.z0) break;
    if (z <= c.z1) return c.lane;
  }
  return -1;
}

/** As above, but including the run-up the generator must respect. */
export function closedForGenAt(course: RunCourse, z: number): number {
  for (const c of course.closures) {
    if (z < c.z0 - CLOSURE_LEAD) break;
    if (z <= c.z1) return c.lane;
  }
  return -1;
}

/**
 * Closures come off their own PRNG stream, seeded apart from the row stream.
 * Sharing one would shift every row and token in the game the moment a closure
 * constant changed, and there would be no way to tell a real regression from
 * the course simply being different.
 */
function generateClosures(code: string): Closure[] {
  const rng = mulberry32(seedFromCode(code || 'SOLO_PRACTICE') ^ 0x5bf03635);
  const out: Closure[] = [];
  let z = CLOSURE_START_Z + rng() * (CLOSURE_OPEN_MAX - CLOSURE_OPEN_MIN);
  let last = -1;
  while (z < COURSE_LEN) {
    const len = CLOSURE_MIN_LEN + rng() * (CLOSURE_MAX_LEN - CLOSURE_MIN_LEN);
    // OUTER LANES ONLY, and this is a fairness rule rather than a taste one.
    //
    // Shutting the middle lane splits the track into two corridors that cannot
    // reach each other, because crossing the shut lane is itself contact.
    // rowIsFair only asks whether a lane change FITS IN THE TIME, never whether
    // the path crosses something closed, so it happily certified rows whose only
    // open lane sat on the far side of the closure: a guaranteed hit decided by
    // which side you happened to be on, which is luck. Measured at 34% of rows
    // inside a closure. Outer-only leaves two adjacent lanes, always mutually
    // reachable, and the flaw cannot occur.
    const lane = rng() < 0.5 ? 0 : LANES - 1;
    out.push({ z0: z, z1: z + len, lane });
    last = lane;
    z += len + CLOSURE_OPEN_MIN + rng() * (CLOSURE_OPEN_MAX - CLOSURE_OPEN_MIN);
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** Purely cosmetic — every kind blocks its lane identically. */
export type HazardKind = 'wall' | 'barrier' | 'beam' | 'gate';

export interface HazardRow {
  z: number;
  /** Lane indices 0..LANES-1 that are impassable. Never all of them. */
  blocked: number[];
  kind: HazardKind;
  /** Distance back to the previous row — the window this row gives you. */
  gap: number;
}

export interface Token {
  z: number;
  lane: number;
  /**
   * This trail runs into a lane that is blocked at the row ahead. Purely a
   * rendering hint — collection and scoring never read it — but it has to be
   * generated rather than derived on the client, so every player is warned at
   * exactly the same moment.
   */
  doomed?: boolean;
}

/** Distance between tokens along a trail. */
export const TOKEN_SPACING = 4;

export interface RunCourse {
  code: string;
  rows: HazardRow[];
  tokens: Token[];
  /** Lanes shut over a stretch. Sorted by z0, never overlapping. */
  closures: Closure[];
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

function openLanes(blocked: number[], closed = -1): number[] {
  const out: number[] = [];
  for (let l = 0; l < LANES; l++) {
    if (l === closed) continue;
    if (!blocked.includes(l)) out.push(l);
  }
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
    tokens: [],
    sway: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
    length: COURSE_LEN,
    closures: generateClosures(code),
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

    // A lane already shut here leaves two to play with, so a row may take at
    // most one of them. Blocking the shut lane as well is not a harder row, it
    // is the same row drawn twice. The rng calls above happen either way, so
    // the stream — and therefore every course outside a closure — is unchanged.
    const closed = closedForGenAt(course, z);

    let chosen: number[] | null = null;
    for (const blocked of candidates) {
      if (closed >= 0 && blocked.includes(closed)) continue;
      if (rowIsFair(prevOpen, openLanes(blocked, closed), gap)) { chosen = blocked; break; }
    }
    // Fall back to a single blocked lane, then to a free row, rather than ever
    // emitting something unclearable.
    if (!chosen) {
      for (let l = 0; l < LANES; l++) {
        if (l === closed) continue;
        if (rowIsFair(prevOpen, openLanes([l], closed), gap)) { chosen = [l]; break; }
      }
    }
    if (!chosen) continue;

    const row: HazardRow = { z, blocked: chosen, kind: KINDS[Math.floor(rng() * KINDS.length)], gap };
    course.rows.push(row);

    // Tokens follow the open set, so a shut lane is never baited with a trail
    // the player cannot collect.
    const nowOpen = openLanes(chosen, closed);
    placeTokens(course, rng, z - gap, z, nowOpen, closed);
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
 * Tokens are what a run is scored on, and they are laid as TRAILS between rows
 * rather than one per row.
 *
 * The reason is statistical, not decorative. With one token per open lane a run
 * turned on about 155 scoring events, and noise from ordinary misreads was
 * comparable to the gap between skill levels — the better player won only 74%
 * of the time. Noise averages down with the square root of the number of
 * independent events, so laying tokens every few units raises the count to
 * roughly 850 and pulls the signal clear of it.
 *
 * Each stretch between two rows gets a trail in ONE lane. Two thirds of the
 * time that lane is open at the row ahead, so following it is compatible with
 * surviving; the rest of the time it is blocked ahead, so the trail runs out
 * and you have to leave it. That is the decision the score is made of.
 */
function placeTokens(
  course: RunCourse, rng: () => number,
  prevZ: number, rowZ: number, nowOpen: number[], closed = -1,
) {
  if (prevZ <= 0) return;
  // A temptation trail may dead-end into a BLOCKED ROW, never into a SHUT LANE.
  // The whole mechanic rests on being able to ride the trail and bail before
  // the row — that is why a doomed trail stops short. A closed lane offers no
  // such out: entering it is contact on the spot, so a trail laid there is bait
  // with no skill in it.
  const blockedAhead = [0, 1, 2].filter(l => l !== closed && !nowOpen.includes(l));
  const temptation = blockedAhead.length > 0 && rng() < 0.22;
  const lane = temptation
    ? blockedAhead[Math.floor(rng() * blockedAhead.length)]
    : nowOpen[Math.floor(rng() * nowOpen.length)];

  // A trail that dead-ends stops short of the row, so it reads as running out
  // rather than as luring you into something you could not see.
  const end = temptation ? rowZ - TOKEN_SPACING * 1.6 : rowZ;
  for (let z = prevZ + TOKEN_SPACING; z < end; z += TOKEN_SPACING) {
    course.tokens.push(temptation ? { z, lane, doomed: true } : { z, lane });
  }
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface CourseAudit {
  rows: number;
  tokens: number;
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
    tokens: course.tokens.length,
    fullyBlocked,
    unreachable,
    minGap: minGap === Infinity ? 0 : minGap,
    tightestWindowS: (minGap === Infinity ? 0 : minGap) / RESET_SPEED,
    clearableCeiling: (minGap === Infinity ? 0 : minGap) / SAFE_WINDOW_S,
  };
}
