import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, emptyBoard, canPlace, place, score, anyMove, previewClear, dealTray, revive, isEmpty, offerContinue, decodeSave, type Piece } from './logic.ts';

const dot: Piece = { cells: [[0, 0]], color: 1 };
const row8: Piece = { cells: [...Array(SIZE).keys()].map((c) => [0, c]), color: 1 };

test('cannot place off board or on filled cell', () => {
  const b = emptyBoard();
  assert.equal(canPlace(b, row8, 0, 1), false);
  place(b, dot, 3, 3);
  assert.equal(canPlace(b, dot, 3, 3), false);
  assert.equal(canPlace(b, dot, 3, 4), true);
});

test('full row and column clear together, crossing cell counted once on board', () => {
  const b = emptyBoard();
  for (let i = 0; i < SIZE; i++) { b[2][i] = 1; b[i][5] = 1; }
  b[2][5] = null;
  const { lines } = place(b, dot, 2, 5);
  assert.equal(lines, 2);
  assert.ok(b.every((line) => line.every((v) => v === null)));
});

test('score rewards multi-line and streaks', () => {
  assert.equal(score(3, 0, 0), 3);
  assert.equal(score(1, 1, 1), 11);
  assert.equal(score(1, 2, 1), 41);
  assert.equal(score(1, 1, 3), 31);
});

test('game over when nothing fits', () => {
  const b = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2) b[r][c] = 1;
  assert.equal(anyMove(b, [{ cells: [[0, 0], [0, 1]], color: 1 }]), false);
  assert.equal(anyMove(b, [dot]), true);
});

test('preview shows the line a drop would clear, without changing the board', () => {
  const b = emptyBoard();
  for (let c = 1; c < SIZE; c++) b[4][c] = 1;
  assert.equal(previewClear(b, dot, 4, 0).length, SIZE);
  assert.equal(previewClear(b, dot, 3, 0).length, 0);
  assert.equal(b[4][0], null);
});

test('dealt pieces fit on a nearly full board when any piece can', () => {
  const b = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) b[r][c] = 1;
  b[0][0] = null; // only a 1x1 fits
  for (const p of dealTray(b)) assert.equal(anyMove(b, [p]), true);
});

test('revive empties the 4 middle rows and leaves room for any shape', () => {
  const b = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) b[r][c] = 1;
  assert.equal(revive(b).length, 4 * SIZE);
  assert.ok(isEmpty(b) === false && b[2].every((v) => v === null) && b[5].every((v) => v === null));
  const big: Piece = { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], color: 1 };
  assert.equal(anyMove(b, [big]), true);
});

test('continue is offered only for runs worth saving', () => {
  assert.equal(offerContinue(150, 0), false);
  assert.equal(offerContinue(250, 0), true);
  assert.equal(offerContinue(300, 1000), false);
  assert.equal(offerContinue(600, 1000), true);
});

test('saved game round-trips and rejects junk', () => {
  const b = emptyBoard();
  b[3][4] = 7;
  const save = { board: b, tray: [dot, null, { cells: [[0, 0], [0, 4]], color: 2 }], points: 120, streak: 2, revived: true };
  assert.deepEqual(decodeSave(JSON.stringify(save)), save);
  assert.equal(decodeSave(null), null);
  assert.equal(decodeSave('{oops'), null);
  assert.equal(decodeSave(JSON.stringify({ ...save, board: b.slice(1) })), null);
  assert.equal(decodeSave(JSON.stringify({ ...save, tray: [null, null, null] })), null);
});
