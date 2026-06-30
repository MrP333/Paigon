// Mulberry32 seeded PRNG — identical across all clients given same seed
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

export type ObstacleType =
  | 'moving_wall'
  | 'rotating_barrier'
  | 'narrow_bridge'
  | 'bounce_pad'
  | 'spinning_beam';

export interface CourseObstacle {
  type: ObstacleType;
  id: string;
  zCenter: number;
  zRadius: number;
  xPos: number;
  params: {
    amplitude?: number;
    speed?: number;
    phase?: number;
    armLength?: number;
    numArms?: number;
    boostUp?: number;
    boostFwd?: number;
    bridgeWidth?: number;
  };
}

export interface TrackSection {
  zStart: number;
  zEnd: number;
  width: number;
}

export interface Checkpoint {
  z: number;
  index: number;
}

export interface GeneratedCourse {
  sections: TrackSection[];
  obstacles: CourseObstacle[];
  checkpoints: Checkpoint[];
  finishZ: number;
  totalLength: number;
}

const FINISH_Z           = 490;
const NORMAL_TRACK_WIDTH = 12;
const BEAM_X_RANGE       = 2.5;

const REGULAR_TYPES: ObstacleType[] = ['moving_wall', 'rotating_barrier', 'spinning_beam'];

export function generateCourse(roomCode: string): GeneratedCourse {
  const rng = mulberry32(seedFromCode(roomCode || 'SOLO_PRACTICE'));
  const obstacles: CourseObstacle[] = [];
  let idCounter = 0;

  // ── Seeded layout parameters ───────────────────────────────────────────────
  const numSlots   = 9 + Math.floor(rng() * 7);  // 9–15 obstacle slots
  const numBridges = rng() < 0.45 ? 1 : 2;       // ~45% chance of 1 bridge, ~55% of 2

  const ZONE_START = 40;
  const ZONE_END   = 455;
  const ZONE_LEN   = ZONE_END - ZONE_START;

  // ── Z positions: evenly spaced base + per-slot jitter ────────────────────
  const zPositions: number[] = [];
  for (let i = 0; i < numSlots; i++) {
    const base   = ZONE_START + ((i + 0.5) / numSlots) * ZONE_LEN;
    const jitter = (rng() - 0.5) * (ZONE_LEN / numSlots) * 0.5;
    zPositions.push(Math.round(base + jitter));
  }
  zPositions.sort((a, b) => a - b);

  // ── Bridge slot indices: first in first half, second in second half ───────
  const half = Math.floor(numSlots / 2);
  const b1   = 1 + Math.floor(rng() * (half - 1));                       // 1..half-1
  const b2   = half + Math.floor(rng() * Math.max(1, numSlots - 2 - half)); // half..numSlots-2
  const bridgeIdxSet = new Set<number>([b1, ...(numBridges === 2 ? [b2] : [])]);

  // ── Checkpoint z: 40–60% of course, seeded ───────────────────────────────
  const checkpointZ = Math.round(FINISH_Z * (0.40 + rng() * 0.20));

  // ── Place obstacles ────────────────────────────────────────────────────────
  const bridgeZCenters: number[] = [];

  for (let i = 0; i < numSlots; i++) {
    const zCenter = zPositions[i];
    const phase   = rng() * Math.PI * 2;
    let type: ObstacleType, zRadius: number, xPos = 0;
    let params: CourseObstacle['params'] = {};

    if (bridgeIdxSet.has(i)) {
      type    = 'narrow_bridge';
      params  = { bridgeWidth: 1.6 + rng() * 0.8 };
      zRadius = 28;
      bridgeZCenters.push(zCenter);
    } else {
      type = REGULAR_TYPES[Math.floor(rng() * REGULAR_TYPES.length)];
      switch (type) {
        case 'moving_wall':
          params  = { amplitude: 3.0 + rng() * 2.0, speed: 1.2 + rng() * 1.4, phase };
          zRadius = 0.4;
          break;
        case 'rotating_barrier':
          params  = { armLength: 4.2 + rng() * 1.0, numArms: 2, speed: 1.6 + rng() * 2.0, phase };
          zRadius = 5;
          xPos    = (rng() - 0.5) * 2 * BEAM_X_RANGE;
          break;
        case 'spinning_beam':
          params  = { armLength: 4.5 + rng() * 1.2, speed: 2.5 + rng() * 2.5, phase };
          zRadius = 0.5;
          xPos    = (rng() - 0.5) * 2 * BEAM_X_RANGE;
          break;
      }
    }

    obstacles.push({ type, id: `${type}_${idCounter++}`, zCenter, zRadius, xPos, params });
  }

  // ── Remove regular obstacles that overlap with bridge zones ──────────────
  const safeBridge = obstacles.filter(o => {
    if (o.type === 'narrow_bridge') return true;
    return !bridgeZCenters.some(bz => Math.abs(o.zCenter - bz) < 35);
  });
  obstacles.length = 0;
  obstacles.push(...safeBridge);

  // ── Bounce pad cluster: seeded position after checkpoint ──────────────────
  const padMin   = Math.min(checkpointZ + 10, 380);
  const padBaseZ = padMin + Math.floor(rng() * Math.min(35, 420 - padMin));
  const padCount = 2 + Math.floor(rng() * 3);
  const padXSlots = [-4, -2.5, -1, 0, 1, 2.5, 4];
  for (let i = padXSlots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [padXSlots[i], padXSlots[j]] = [padXSlots[j], padXSlots[i]];
  }
  for (let i = 0; i < padCount; i++) {
    obstacles.push({
      type: 'bounce_pad', id: `bounce_pad_${idCounter++}`,
      zCenter: padBaseZ + rng() * 10,
      zRadius: 1.5,
      xPos: padXSlots[i],
      params: { boostUp: 12 + rng() * 3, boostFwd: 6 + rng() * 3 },
    });
  }

  obstacles.sort((a, b) => a.zCenter - b.zCenter);

  // ── Track sections (narrow where bridges are) ──────────────────────────────
  const sections: TrackSection[] = [];
  const narrowObs = obstacles.filter(o => o.type === 'narrow_bridge');
  let cursor = 0;
  for (const nb of narrowObs) {
    const nbStart = nb.zCenter - nb.zRadius;
    const nbEnd   = nb.zCenter + nb.zRadius;
    if (cursor < nbStart) sections.push({ zStart: cursor, zEnd: nbStart, width: NORMAL_TRACK_WIDTH });
    sections.push({ zStart: nbStart, zEnd: nbEnd, width: nb.params.bridgeWidth ?? 2 });
    cursor = nbEnd;
  }
  if (cursor < FINISH_Z + 20) sections.push({ zStart: cursor, zEnd: FINISH_Z + 20, width: NORMAL_TRACK_WIDTH });

  // ── Checkpoints ────────────────────────────────────────────────────────────
  const checkpoints: Checkpoint[] = [
    { z: 0,           index: 0 },
    { z: checkpointZ, index: 1 },
  ];

  return { sections, obstacles, checkpoints, finishZ: FINISH_Z, totalLength: FINISH_Z };
}

export function getTrackWidth(course: GeneratedCourse, z: number): number {
  for (const s of course.sections) {
    if (z >= s.zStart && z <= s.zEnd) return s.width;
  }
  return 12;
}
