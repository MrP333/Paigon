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
  speedCeilingAt, RunCourse, HazardRow, laneX,
} from './RunnerCourse';

/** 120Hz. Fine enough that a 0.18s lane change resolves smoothly. */
export const FIXED_DT = 1 / 120;

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

  // ── Steering ──
  if (input.steer !== 0) {
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

  const z0 = s.z;
  s.z += s.speed * dt;

  // ── Tokens crossed this step ──
  while (s.shardCursor < course.tokens.length && course.tokens[s.shardCursor].z <= s.z) {
    const tk = course.tokens[s.shardCursor];
    if (tk.z >= z0) {
      s.tokensSeen++;
      // Collected on lane overlap, same band as a hazard — so threading a gap
      // and taking the token are the same act of precision.
      if (Math.abs(s.lanePos - tk.lane) * LANE_W < HIT_DIST) { s.tokens++; ev.picked++; }
    }
    s.shardCursor++;
  }

  // ── Rows crossed this step ──
  while (s.rowCursor < course.rows.length && course.rows[s.rowCursor].z <= s.z) {
    const row = course.rows[s.rowCursor];
    if (row.z >= z0 && s.immuneS <= 0 && hits(row, s.lanePos)) {
      s.crashes++; ev.crashed = true;
      s.immuneS = CONTACT_IMMUNE_S;
      s.cleanS = 0;
      s.speed = Math.max(RESET_SPEED, s.speed * CONTACT_RETAIN);
    }
    s.rowCursor++;
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
