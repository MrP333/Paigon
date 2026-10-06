/**
 * Runner simulation. Pure and fixed-timestep, so the same input sequence always
 * produces the same distance — on any machine, at any framerate, and on the
 * server replaying a submitted run.
 *
 * Nothing here reads the wall clock or Math.random. The caller accumulates real
 * time and pumps whole FIXED_DT steps; leftover time is carried, never scaled
 * into a step, because a variable dt would make the result framerate-dependent
 * and therefore unverifiable.
 *
 * The only input is which lane to be in. Speed charges while clean and drops on
 * contact, so it is an output of how well the run is going rather than something
 * the player operates.
 */

import {
  LANES, LANE_W, LANE_CHANGE_S, RESET_SPEED, RACE_MS,
  speedCeilingAt, RunCourse, HazardRow, laneX, closedLaneAt,
} from './RunnerCourse';

/** 120Hz. Fine enough that a 0.18s lane change resolves smoothly. */
export const FIXED_DT = 1 / 120;

/** One bucket per whole u/s, covering the full range speed can reach. */
export const SPEED_BUCKETS = 128;

/** Half-width of the player, for the collision band. */
export const PLAYER_HALF = 0.85;
/**
 * Collide when the player's band overlaps a blocked lane's. Lane centres are
 * LANE_W apart, so sitting square in a neighbouring lane clears by 0.75 units —
 * roughly a quarter of a lane of slack before a drift starts to clip.
 */
export const HIT_DIST = LANE_W / 2 + PLAYER_HALF;

/** Speed gained per second of clean running. */
export const CHARGE_RATE = 1.8;
/**
 * Fraction of speed kept through a hit. Raised from 0.55 now that the score is
 * tokens rather than distance: contact no longer has to carry the whole job of
 * separating players, and a penalty that large was making two unlucky hits
 * outweigh a 50ms reaction advantage.
 */
export const CONTACT_RETAIN = 0.78;
/** Grace after contact, so one row cannot be charged twice. */
export const CONTACT_IMMUNE_S = 0.35;

export interface RunnerInput {
  /** -1 to move left, +1 right, 0 to hold. Edge-triggered by the caller. */
  steer: -1 | 0 | 1;
}

export interface RunnerState {
  z: number;
  speed: number;
  /** Continuous lane position; integral values are lane centres. */
  lanePos: number;
  laneTarget: number;
  immuneS: number;
  /** Seconds since the last contact — what the speed charge is built from. */
  cleanS: number;
  /** Tokens collected. This is the score. */
  tokens: number;
  /** Tokens gone past, taken or not — the denominator for accuracy. */
  tokensSeen: number;
  /** Longest clean stretch of the run, in seconds. For the HUD and results. */
  bestCleanS: number;
  elapsedS: number;
  shards: number;
  crashes: number;
  /**
   * Display-only run stats. Never scored, never sent for validation — the
   * server derives the cash number (tokens) from the replay, and a stat it
   * cannot reproduce must not decide money. If combo is ever promoted into
   * the cash score, it has to move into server/runner.cjs first.
   */
  streak: number;
  bestStreak: number;
  /**
   * Tokens at the end of each band: 0-25s, 25-60s, 60-90s. The money score is
   * their sum — these exist so the result can show the shape of a run, and so
   * the published tiebreak (token count at 60s) is derivable rather than
   * asserted. All three come out of the replay, so the server computes the
   * same numbers from the same trace.
   */
  bands: [number, number, number];
  /** Step index of the most recent token. Final tiebreak. */
  lastTokenStep: number;
  /**
   * Display metrics. None of these pay — the money score is the raw token
   * count — but all are derived from the replay, so the server reproduces the
   * same numbers from the same trace rather than taking the client's word.
   *
   *  safeSeen/safeTook   tokens on a lane that was still open at the next row,
   *                      i.e. a line you could have held. The ratio is how much
   *                      of the available line you actually took.
   *  greedSeen/greedTook tokens on a trail that dead-ends into a blocked lane.
   *                      The ratio is how much you squeezed out before bailing.
   *  speedHist/tokenHist time spent and tokens taken, bucketed by whole u/s.
   *                      Kept as histograms because the "top quarter of your
   *                      own speed" threshold is not knowable until the run is
   *                      over, and storing per-token speeds would be hundreds
   *                      of entries to ship and replay.
   */
  safeSeen: number; safeTook: number;
  greedSeen: number; greedTook: number;
  speedHist: number[]; tokenHist: number[];
  /** Steps between a row becoming current and the first input after it. */
  reactionSamples: number[];
  pendingRowStep: number;
  stepNo: number;
  /** Index of the next row that has not been tested yet. */
  rowCursor: number;
  shardCursor: number;
  finished: boolean;
}

export function initialState(): RunnerState {
  const mid = (LANES - 1) / 2;
  return {
    z: 0, speed: RESET_SPEED,
    lanePos: mid, laneTarget: mid,
    immuneS: 0, cleanS: 0, bestCleanS: 0,
    tokens: 0, tokensSeen: 0,
    streak: 0, bestStreak: 0, bands: [0, 0, 0], lastTokenStep: -1,
    safeSeen: 0, safeTook: 0, greedSeen: 0, greedTook: 0,
    speedHist: new Array(SPEED_BUCKETS).fill(0), tokenHist: new Array(SPEED_BUCKETS).fill(0),
    reactionSamples: [], pendingRowStep: -1, stepNo: 0,
    elapsedS: 0, shards: 0, crashes: 0,
    rowCursor: 0, shardCursor: 0,
    finished: false,
  };
}

/** World X of the player, following the track's sway. */
export function playerX(course: RunCourse, s: RunnerState): number {
  return laneX(course, 0, s.z) + s.lanePos * LANE_W;
}

export interface StepEvents { crashed: boolean; picked: number; }

export function step(
  course: RunCourse, s: RunnerState, input: RunnerInput,
): StepEvents {
  const ev: StepEvents = { crashed: false, picked: 0 };
  if (s.finished) return ev;

  const dt = FIXED_DT;
  s.elapsedS += dt;
  s.stepNo++;
  // First input after a new row became current is that row's reaction sample.
  if (input.steer !== 0 && s.pendingRowStep >= 0) {
    s.reactionSamples.push((s.stepNo - s.pendingRowStep) * FIXED_DT);
    s.pendingRowStep = -1;
  }

  // ── Steering ──
  // A lane change is a commitment: once a move is in flight, further input is
  // ignored until it lands. Without this you can retarget halfway across and
  // a lane change stops costing anything, which is what makes the 0.18s a
  // real price rather than a visual.
  const moveInFlight = s.lanePos !== s.laneTarget;
  if (input.steer !== 0 && !moveInFlight) {
    const want = Math.round(s.laneTarget) + input.steer;
    if (want >= 0 && want <= LANES - 1) s.laneTarget = want;
  }
  const laneStep = dt / LANE_CHANGE_S;
  if (s.lanePos < s.laneTarget) s.lanePos = Math.min(s.laneTarget, s.lanePos + laneStep);
  else if (s.lanePos > s.laneTarget) s.lanePos = Math.max(s.laneTarget, s.lanePos - laneStep);

  // ── Charge, clamped to what the course ahead can actually be cleared at ──
  s.cleanS += dt;
  if (s.cleanS > s.bestCleanS) s.bestCleanS = s.cleanS;
  const ceiling = speedCeilingAt(course, s.z, s.rowCursor);
  s.speed = Math.min(ceiling, s.speed + CHARGE_RATE * dt);
  if (s.immuneS > 0) s.immuneS = Math.max(0, s.immuneS - dt);

  const bucket = Math.min(SPEED_BUCKETS - 1, Math.max(0, Math.floor(s.speed)));
  s.speedHist[bucket]++;

  const z0 = s.z;
  s.z += s.speed * dt;

  // ── Tokens crossed this step ──
  while (s.shardCursor < course.tokens.length && course.tokens[s.shardCursor].z <= s.z) {
    const tk = course.tokens[s.shardCursor];
    if (tk.z >= z0) {
      s.tokensSeen++;
      if (tk.doomed) s.greedSeen++; else s.safeSeen++;
      // Collected on lane overlap, same band as a hazard — so threading a gap
      // and taking the token are the same act of precision.
      if (Math.abs(s.lanePos - tk.lane) * LANE_W < HIT_DIST) {
        s.tokens++; ev.picked++;
        if (tk.doomed) s.greedTook++; else s.safeTook++;
        s.tokenHist[bucket]++;
        s.lastTokenStep = s.stepNo;
        s.bands[s.elapsedS < 25 ? 0 : s.elapsedS < 60 ? 1 : 2]++;
        s.streak++;
        if (s.streak > s.bestStreak) s.bestStreak = s.streak;
      }
      // Missing a token does NOT break the streak. A third of trails dead-end
      // into a blocked lane, so leaving the line is often the only correct
      // play — breaking combo for it would punish reading the course right.
      // Only contact breaks it.
    }
    s.shardCursor++;
  }

  // ── Rows crossed this step ──
  while (s.rowCursor < course.rows.length && course.rows[s.rowCursor].z <= s.z) {
    const row = course.rows[s.rowCursor];
    if (row.z >= z0 && s.immuneS <= 0 && hits(row, s.lanePos)) {
      s.crashes++; ev.crashed = true;
      s.streak = 0;
      s.immuneS = CONTACT_IMMUNE_S;
      s.cleanS = 0;
      s.speed = Math.max(RESET_SPEED, s.speed * CONTACT_RETAIN);
    }
    s.rowCursor++;
    s.pendingRowStep = s.stepNo;
  }

  // ── Sitting in a lane that is shut ──
  // Charged on the same terms as a row, immunity included, so holding a closed
  // lane costs a hit every CONTACT_IMMUNE_S rather than every step. The
  // generator guarantees you were never forced in, so staying is a choice.
  const closed = closedLaneAt(course, s.z);
  if (closed >= 0 && s.immuneS <= 0 &&
      Math.abs(s.lanePos - closed) * LANE_W < HIT_DIST) {
    s.crashes++; ev.crashed = true;
    s.streak = 0;
    s.immuneS = CONTACT_IMMUNE_S;
    s.cleanS = 0;
    s.speed = Math.max(RESET_SPEED, s.speed * CONTACT_RETAIN);
  }

  if (s.elapsedS * 1000 >= RACE_MS) s.finished = true;
  return ev;
}

export function hits(row: HazardRow, lanePos: number): boolean {
  return row.blocked.some(l => Math.abs(lanePos - l) * LANE_W < HIT_DIST);
}

/** Lanes that are safe to be sitting in when this row arrives. */
export function safeLanes(row: HazardRow): number[] {
  const out: number[] = [];
  for (let l = 0; l < LANES; l++) if (!hits(row, l)) out.push(l);
  return out;
}

/**
 * The player's effective reaction, as the median delay between a row becoming
 * the current target and their first input after it. Median rather than mean
 * because the distribution has a long tail — a single hesitation should not
 * move the number.
 *
 * Display only. Derived from the trace, so the server could reproduce it, but
 * nothing depends on it and it is not part of the result.
 */
export function estimateReaction(s: RunnerState): number | null {
  const xs = s.reactionSamples.filter(v => v > 0 && v < 2).sort((a, b) => a - b);
  if (xs.length < 8) return null;
  return xs[xs.length >> 1];
}

/**
 * Tokens taken while running in the top quarter of this run's own speed.
 *
 * The threshold is per-run on purpose: a player who never got above 30 u/s
 * should still be measured against their own ceiling, not against someone
 * else's. Computed by time, so it is the speed you spent a quarter of the
 * race at or above — not a quarter of the range, which a single fast burst
 * would skew.
 */
export function ceilingTokens(s: RunnerState): { took: number; threshold: number } {
  const total = s.speedHist.reduce((a, b) => a + b, 0);
  if (!total) return { took: 0, threshold: 0 };
  let acc = 0, threshold = 0;
  for (let i = s.speedHist.length - 1; i >= 0; i--) {
    acc += s.speedHist[i];
    if (acc >= total * 0.25) { threshold = i; break; }
  }
  let took = 0;
  for (let i = threshold; i < s.tokenHist.length; i++) took += s.tokenHist[i];
  return { took, threshold };
}
