export interface GameConfig {
  roomCode: string;
  playerName: string;
  playerColor: string;
  opponentName: string;
  opponentColor: string;
  opponents?: { name: string; color: string }[];
  stakeId: string;
  entryCents?: number;
  payoutCents: number;
  solo?: boolean;
}

export interface ResultData {
  won: boolean;
  myWpm: number;
  myAccuracy: number;
  myFinishMs: number | null;
  players: Array<{
    rank: number;
    name: string;
    color: string;
    wpm: number;
    accuracy: number;
    finishMs: number | null;
    won: boolean;
    isMe?: boolean;
  }>;
}
