export interface Vec3 { x: number; y: number; z: number; }

export type GamePhase = 'playing' | 'victory' | 'dead';

export interface PlayerState {
  pos: Vec3;
  health: number;
  maxHealth: number;
  isCrawling: boolean;
  isSprinting: boolean;
  inCrater: boolean;
  inWire: boolean;
  hitFlash: number;  // seconds remaining for hit flash
}

export interface Tower {
  x: number;
  y: number;
  z: number;
  aimX: number;          // current aim X in world space
  targetAimX: number;
  aimTimer: number;
  fireTimer: number;
  fireInterval: number;
  sweepRange: number;
}

export interface Bullet {
  pos: Vec3;
  prev: Vec3;
  vel: Vec3;
  life: number;
  active: boolean;
}

export type ObstacleKind = 'tankWreck' | 'sandbag' | 'barbedWire';

export interface Obstacle {
  kind: ObstacleKind;
  pos: Vec3;           // world-space centre
  halfX: number;       // AABB half-extents
  halfY: number;
  halfZ: number;
  rotation: number;    // visual Y-rotation only
  gapX?: number;       // barbedWire: left edge of gap in world X
  gapW?: number;
}

export interface Crater {
  x: number;
  z: number;
  r: number;
}

export interface ArtilleryStrike {
  x: number;
  z: number;
  detonateAt: number;
  warnDuration: number;
}

export interface ArtilleryStatus {
  phase: 'none' | 'warning' | 'blast';
  x: number;
  z: number;
  progress: number;
  blastRadius: number;
}

export interface Effect {
  type: 'dirt' | 'blood' | 'explosion';
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface WorldState {
  phase: GamePhase;
  timer: number;
  player: PlayerState;
  bullets: Bullet[];
  obstacles: Obstacle[];
  craters: Crater[];
  artillerySchedule: ArtilleryStrike[];
  artilleryStatus: ArtilleryStatus;
  effects: Effect[];
  distancePct: number;
}

export interface InputCommands {
  dx: number;   // –1 left, +1 right
  dz: number;   // –1 forward (toward bunker), +1 backward
  crawl: boolean;
  sprint: boolean;
}

export interface GameConfig {
  roomCode: string;
  playerName: string;
  playerColor: string;
  opponentName: string;
  opponentColor: string;
  stakeId: string;
  payoutCents: number;
  solo?: boolean;
}

export interface ResultData {
  won: boolean;
  draw: boolean;
  myTimeMs: number | null;
  opponentTimeMs: number | null;
  winnerName: string;
}
