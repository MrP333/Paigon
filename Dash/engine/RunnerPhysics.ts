/**
 * Runner simulation. Pure and fixed-timestep, so the same input sequence always
 * produces the same distance — on any machine, at any framerate, and on the
 * server replaying a submitted run.
 *
 * Nothing here reads the wall clock or Math.random. The caller accumulates real
 * time and pumps whole FIXED_DT steps; leftover time is carried, never scaled
 * into a step, because a variable dt would make the result framerate-dependent
 * and therefore unverifiable.
 */

import {
  LANES, LANE_W, BASE_SPEED, BOOST_SPEED, TOP_SPEED, BOOST_CAP_S,
  LANE_CHANGE_S, SHARD_BOOST_S, RACE_MS,
  RunCourse, HazardRow, laneX,
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

export const STUN_SPEED = 8;
/**
 * A crash costs about 55 units once the ramp back up is counted — a little over
 * 2% of a typical run. Deliberately bounded: one mistake must not decide the
 * race, or outcome variance starts to look like chance however deterministic
 * the course is. Ten mistakes, on the other hand, should lose it.
 */
export const CRASH_STUN_S = 1.5;
/** Grace after a hit so one row cannot be charged twice. */
export const CRASH_IMMUNE_S = 0.4;

/** How fast speed closes on its target. */
const ACCEL = 26;
const DECEL = 18;

export interface RunnerInput {
  /** -1 to move left, +1 right, 0 to hold. Edge-triggered by the caller. */
  steer: -1 | 0 | 1;
  /** Held to spend boost. Does nothing once the meter is empty. */
  throttle: boolean;
}

export interface RunnerState {
  z: number;
  speed: number;
  /** Continuous lane position; integral values are lane centres. */
  lanePos: number;
  laneTarget: number;
  boostS: number;
  stunS: number;
  immuneS: number;
  /** True on steps where boost was actually burning — for HUD and effects. */
  boosting: boolean;
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
    z: 0, speed: BASE_SPEED,
    lanePos: mid, laneTarget: mid,
    boostS: 0, stunS: 0, immuneS: 0, boosting: false,
    elapsedS: 0, shards: 0, crashes: 0,
    rowCursor: 0, shardCursor: 0,
    finished: false,
  };
}

/** World X of the player, following the track's sway. */
export function playerX(course: RunCourse, s: RunnerState): number {
  return laneX(course, 0, s.z) + s.lanePos * LANE_W;
}

/**
 * One fixed step. Returns what happened during it so the caller can fire sound
 * and visual effects without re-deriving them.
 */
export interface StepEvents { crashed: boolean; picked: number; }

export function step(
  course: RunCourse, s: RunnerState, input: RunnerInput,
): StepEvents {
  const ev: StepEvents = { crashed: false, picked: 0 };
  if (s.finished) return ev;

  const dt = FIXED_DT;
  s.elapsedS += dt;

  // ── Steering. Allowed while stunned: you have to be able to get clear. ──
  if (input.steer !== 0) {
    const want = Math.round(s.laneTarget) + input.steer;
    if (want >= 0 && want <= LANES - 1) s.laneTarget = want;
  }
  const laneStep = dt / LANE_CHANGE_S;
  if (s.lanePos < s.laneTarget) s.lanePos = Math.min(s.laneTarget, s.lanePos + laneStep);
  else if (s.lanePos > s.laneTarget) s.lanePos = Math.max(s.laneTarget, s.lanePos - laneStep);

  // ── Speed ──
  if (s.stunS > 0) {
    s.stunS = Math.max(0, s.stunS - dt);
    s.speed = STUN_SPEED;
  } else {
    const rate = BASE_SPEED > s.speed ? ACCEL : DECEL;
    const d = BASE_SPEED - s.speed;
    s.speed += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }
  if (s.immuneS > 0) s.immuneS = Math.max(0, s.immuneS - dt);

  // Boost burns only while asked for, so banking it through a tight stretch is
  // a live option rather than something the simulation does on the player's
  // behalf.
  let speed = s.speed;
  s.boosting = false;
  if (input.throttle && s.boostS > 0 && s.stunS <= 0) {
    s.boostS = Math.max(0, s.boostS - dt);
    speed += BOOST_SPEED;
    s.boosting = true;
  }
  // Hard ceiling, so no combination of effects can exceed what the course was
  // built to remain solvable at.
  if (speed > TOP_SPEED) speed = TOP_SPEED;

  const z0 = s.z;
  s.z += speed * dt;

  // ── Shards crossed this step ──
  while (s.shardCursor < course.shards.length && course.shards[s.shardCursor].z <= s.z) {
    const sh = course.shards[s.shardCursor];
    if (sh.z >= z0 && Math.abs(s.lanePos - sh.lane) * LANE_W < HIT_DIST) {
      s.shards++; ev.picked++;
      s.boostS = Math.min(s.boostS + SHARD_BOOST_S, BOOST_CAP_S);
    }
    s.shardCursor++;
  }

  // ── Rows crossed this step ──
  while (s.rowCursor < course.rows.length && course.rows[s.rowCursor].z <= s.z) {
    const row = course.rows[s.rowCursor];
    if (row.z >= z0 && s.immuneS <= 0 && hits(row, s.lanePos)) {
      s.crashes++; ev.crashed = true;
      s.stunS = CRASH_STUN_S;
      s.immuneS = CRASH_IMMUNE_S;
      // Losing the banked meter is the real cost of a crash: it scales with
      // how much you had saved, so it punishes the greedy line proportionally.
      s.boostS = 0;
      s.speed = STUN_SPEED;
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
