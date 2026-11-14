// Pure game rules: no Phaser here, so they can be tested with plain Node.
export const SIZE = 8;

export type Cell = [row: number, col: number];
export type Piece = { cells: Cell[]; color: number };
export type Board = (number | null)[][]; // color per cell, null = empty

const SHAPES: Cell[][] = [
  [[0, 0]],
  [[0, 0], [0, 1]], [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 1], [1, 1], [2, 1], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [0, 2], [1, 0], [1, 1]],
];

export const COLORS = [0xff5c8a, 0xffb340, 0x7ed957, 0x4fc3f7, 0xb388ff, 0xff7f50];

export const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

export function randomPiece(rand = Math.random, shapes = SHAPES): Piece {
  return {
    cells: shapes[Math.floor(rand() * shapes.length)],
    color: COLORS[Math.floor(rand() * COLORS.length)],
  };
}

export function canPlace(board: Board, piece: Piece, row: number, col: number): boolean {
  return piece.cells.every(([r, c]) => {
    const R = row + r, C = col + c;
    return R >= 0 && R < SIZE && C >= 0 && C < SIZE && board[R][C] === null;
  });
}

/** Rows and columns that are completely filled. */
export function fullLines(board: Board) {
  const rows = [...Array(SIZE).keys()].filter((r) => board[r].every((v) => v !== null));
  const cols = [...Array(SIZE).keys()].filter((c) => board.every((line) => line[c] !== null));
  const cells: Cell[] = [];
  for (const r of rows) for (let c = 0; c < SIZE; c++) cells.push([r, c]);
  for (const c of cols) for (let r = 0; r < SIZE; r++) cells.push([r, c]);
  return { lines: rows.length + cols.length, cells };
}

/** Cells that would clear if the piece were dropped here (board is not changed). */
export function previewClear(board: Board, piece: Piece, row: number, col: number): Cell[] {
  const copy = board.map((line) => [...line]);
  for (const [r, c] of piece.cells) copy[row + r][col + c] = piece.color;
  return fullLines(copy).cells;
}

/** Places the piece, clears full rows/columns. Returns lines cleared and the cleared cells. */
export function place(board: Board, piece: Piece, row: number, col: number) {
  for (const [r, c] of piece.cells) board[row + r][col + c] = piece.color;
  const { lines, cells } = fullLines(board);
  for (const [r, c] of cells) board[r][c] = null;
  return { lines, cleared: cells };
}

export const isEmpty = (board: Board) => board.every((line) => line.every((v) => v === null));

/** Three new pieces; each one fits somewhere on the current board when possible. */
export function dealTray(board: Board, rand = Math.random): Piece[] {
  // shortcut: each piece fits alone, not all three in sequence; upgrade if players call deaths unfair
  const fits = SHAPES.filter((cells) => anyMove(board, [{ cells, color: 0 }]));
  return [0, 1, 2].map(() => randomPiece(rand, fits.length ? fits : SHAPES));
}

/** Second chance: empties the 4 middle rows. Returns the cleared (previously filled) cells. */
export function revive(board: Board): Cell[] {
  const cleared: Cell[] = [];
  for (let r = 2; r < 6; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== null) cleared.push([r, c]);
    board[r][c] = null;
  }
  return cleared;
}

export const PERFECT_BONUS = 300; // emptying the whole board

/** Points for one move; streak = how many moves in a row (including this one) cleared lines. */
export function score(cellsPlaced: number, lines: number, streak: number): number {
  if (lines === 0) return cellsPlaced;
  return cellsPlaced + lines * lines * 10 * Math.max(1, streak);
}

export function anyMove(board: Board, pieces: Piece[]): boolean {
  return pieces.some((p) =>
    [...Array(SIZE * SIZE).keys()].some((i) => canPlace(board, p, Math.floor(i / SIZE), i % SIZE)),
  );
}

/** Continue-by-video is a special chance (portal rule): only for runs worth saving. */
export const offerContinue = (points: number, best: number) => points >= 200 && points >= best * 0.5;

export type Save = { board: Board; tray: (Piece | null)[]; points: number; streak: number; revived: boolean };

/** Reads a saved game; anything malformed (old version, hand-edited storage) counts as no save. */
export function decodeSave(raw: string | null): Save | null {
  try {
    const s = JSON.parse(raw ?? '');
    const cellOk = (v: unknown) => v === null || typeof v === 'number';
    const boardOk = Array.isArray(s.board) && s.board.length === SIZE
      && s.board.every((l: unknown) => Array.isArray(l) && l.length === SIZE && l.every(cellOk));
    const pieceOk = (p: Piece | null) => p === null || (typeof p.color === 'number' && Array.isArray(p.cells) && p.cells.length > 0
      && p.cells.every((c) => Array.isArray(c) && c.length === 2 && c.every((n) => Number.isInteger(n) && n >= 0 && n < 5)));
    const trayOk = Array.isArray(s.tray) && s.tray.length === 3 && s.tray.every(pieceOk) && s.tray.some((p: Piece | null) => p);
    if (!boardOk || !trayOk || !Number.isFinite(s.points) || !Number.isFinite(s.streak)) return null;
    return { board: s.board, tray: s.tray, points: s.points, streak: s.streak, revived: !!s.revived };
  } catch {
    return null;
  }
}
