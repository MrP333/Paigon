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

export interface RoundResult {
  correct: boolean;
  reactionMs: number;
}

export interface ResultData {
  won: boolean;
  myScore: number;
  myCorrect: number;
  myTotalMs: number;
  roundResults: RoundResult[];
  opponentScore: number | null;
  opponentCorrect: number | null;
  winnerName: string;
}
