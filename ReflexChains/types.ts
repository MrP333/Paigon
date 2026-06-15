export interface Target {
  x: number;
  y: number;
  index: number;
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
  myTimeMs: number;
  myScore: number;
  myHits: number;
  opponentTimeMs: number | null;
  opponentScore: number | null;
  opponentHits: number | null;
  winnerName: string;
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
