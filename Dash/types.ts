export interface Opponent { name: string; color: string; uid?: string; }

export interface PlayerResult {
  rank: number;
  name: string;
  color: string;
  finishTimeMs?: number;
  /** Parity's score. Null when that player's run failed validation. */
  tokens?: number | null;
  /** Set by the server on the row belonging to whoever receives this result. */
  you?: boolean;
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
  /** Parity scores on tokens. Null when the run failed server validation. */
  myTokens?: number | null;
  winnerName: string;
  players?: PlayerResult[];
  payoutCents?: number;
}
