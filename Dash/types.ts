export interface Opponent { name: string; color: string; uid?: string; }

export interface PlayerResult {
  rank: number;
  name: string;
  color: string;
  finishTimeMs: number;
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
  myFinishTimeMs: number;
  winnerName: string;
  players?: PlayerResult[];
  payoutCents?: number;
}
