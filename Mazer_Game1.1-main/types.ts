export type CellType = 0 | 1; // 0 = Path, 1 = Wall

export interface Coordinate {
  row: number;
  col: number;
}

export interface MazeData {
  grid: CellType[][];
  start: Coordinate;
  end: Coordinate;
  size: number;
  checkpoints: Coordinate[];
}

export enum GameState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PLAYING = 'PLAYING',
  WON = 'WON'
}