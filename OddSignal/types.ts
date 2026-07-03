export interface Opponent { name: string; color: string; }

export interface PlayerResult {
  rank: number;
  name: string;
  color: string;
  score: number;
  correct: number;
  attempted: number;
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
  myScore: number;
  myCorrect: number;
  myAttempted: number;
  myTotalMs: number;
  opponentScore: number | null;
  opponentCorrect: number | null;
  winnerName: string;
  players?: PlayerResult[];
}
