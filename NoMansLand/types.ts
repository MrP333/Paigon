export interface Vec2 { x: number; y: number; }

export type GamePhase = 'playing' | 'victory' | 'dead';

export interface PlayerState {
  pos: Vec2;
  health: number;
  maxHealth: number;
  isCrawling: boolean;
  isSprinting: boolean;
  inCrater: boolean;
  inWire: boolean;
}

export interface Tower {
  x: number;
  aimX: number;
  targetAimX: number;
  aimTimer: number;
  fireTimer: number;
  fireInterval: number;
  sweepRange: number;
}

export interface Bullet {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  life: number;
  active: boolean;
}

export type ObstacleKind = 'tankWreck' | 'sandbag' | 'barbedWire';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  gapX?: number;
  gapW?: number;
}

export interface Crater {
  x: number;
  y: number;
  r: number;
}

export interface ArtilleryStrike {
  x: number;
  y: number;
  detonateAt: number;
  warnDuration: number;
}

export interface ArtilleryStatus {
  phase: 'none' | 'warning' | 'blast';
  x: number;
  y: number;
  progress: number;
  blastRadius: number;
}

export interface Effect {
  type: 'dirt' | 'smoke' | 'flash' | 'blood';
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  cameraY: number;
  distancePct: number;
}

export interface InputCommands {
  dx: number;
  dy: number;
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
