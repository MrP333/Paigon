import { MazeData, Coordinate, CellType } from "../types";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const generateMaze = async (size: number = 15, seed: number = 12345): Promise<MazeData> => {
  const rand = mulberry32(seed);

  const grid: CellType[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 1)
  );

  const start: Coordinate = { row: 1, col: 1 };
  const end: Coordinate = { row: size - 2, col: size - 2 };
  const checkpoints: Coordinate[] = [];

  const carve = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) grid[r][c] = 0;
  };

  // 1) Main path
  for (let r = 1; r <= Math.floor(size / 2); r++) carve(r, 1);
  for (let c = 1; c < size - 1; c++) carve(Math.floor(size / 2), c);
  for (let r = Math.floor(size / 2); r < size - 1; r++) carve(r, size - 2);

  // 2) Dead end A
  for (let c = 1; c < size - 4; c++) carve(2, c);
  for (let r = 2; r < size - 6; r++) carve(r, size - 5);
  checkpoints.push({ row: size - 7, col: size - 5 });
  carve(size - 7, size - 5);

  // 3) Dead end B
  for (let r = 1; r < size - 4; r++) carve(r, 2);
  for (let c = 2; c < size - 6; c++) carve(size - 5, c);
  checkpoints.push({ row: size - 5, col: size - 7 });
  carve(size - 5, size - 7);

  // 4) Seeded organic noise
  for (let i = 0; i < 20; i++) {
    const r = Math.floor(rand() * (size - 2)) + 1;
    const c = Math.floor(rand() * (size - 2)) + 1;
    if (grid[r][c] === 1) {
      let neighbors = 0;
      if (grid[r - 1][c] === 0) neighbors++;
      if (grid[r + 1][c] === 0) neighbors++;
      if (grid[r][c - 1] === 0) neighbors++;
      if (grid[r][c + 1] === 0) neighbors++;
      if (neighbors === 1) grid[r][c] = 0;
    }
  }

  // 5) Entrance/exit holes
  carve(start.row, 0);
  carve(start.row, start.col);

  carve(end.row, size - 1);
  carve(end.row, end.col);

  checkpoints.forEach(cp => carve(cp.row, cp.col));

  return { grid, start, end, size, checkpoints };
};
