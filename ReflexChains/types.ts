export interface Target {
  x: number;
  y: number;
  index: number;
  ringMs: number;
  isDecoy: boolean;
}

export interface Opponent { name: string; color: string; }

export interface PlayerResult {
  rank: number;
  name: string;
  color: string;
  score: number;
  hits: number;
  timeMs: number;
  won: boolean;
}

export interface GameConfig {
  roomCode: string;
  playerName: string;
  playerColor: string;
  opponentName: string;
  opponentColor: string;
  opponents?: Opponent[];
  stakeId: string;
  entryCents?: number;
  payoutCents: number;
  solo?: boolean;
}

export interface ResultData {
  won: boolean;
  myTimeMs: number;
  myScore: number;
  myHits: number;
  opponentTimeMs: number | null;
  opponentScore: number | null;
  opponentHits: number | null;
  winnerName: string;
  players?: PlayerResult[];
}

export interface HitRecord {
  targetIndex: number;
  reactionMs: number;
}

export interface CanvasEffect {
  x: number;
  y: number;
  type: 'hit' | 'miss' | 'decoy' | 'early';
  startTime: number;
}
