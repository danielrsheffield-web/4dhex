import { MAX_DIMENSION, createBoard } from '../app/voronoi/model.js';
import {
  SERIES_STORAGE_KEY,
  cloneSeries,
  createDefaultSeries,
  validateSeries,
} from '../app/voronoi/series-model.js';

export function defineSeriesModelTests(test, assert) {
  test('series storage key and empty series are supported', () => {
    assert.equal(SERIES_STORAGE_KEY, 'hex.voronoi.series');
    const empty = [];
    assert.deepEqual(validateSeries(empty), []);
    const cloned = cloneSeries(empty);
    assert.deepEqual(cloned, []);
    assert.ok(cloned !== empty);
  });

  test('series preserves length, board order, different dimensions, and color values', () => {
    const boards = [createBoard(2, 3), [[[1, 0, -1]]], createBoard(3, 1)];
    boards[0][1][0][2] = -1;
    boards[2][2][1][0] = 1;
    const expected = JSON.parse(JSON.stringify(boards));
    assert.deepEqual(validateSeries(boards), [
      { M: 2, N: 3 }, { M: 1, N: 3 }, { M: 3, N: 1 },
    ]);
    assert.deepEqual(cloneSeries(boards), expected);
    assert.deepEqual(boards, expected);
    assert.equal(validateSeries([[[[0]]]]).length, 1);
    // The number of boards is independent of the maximum dimension of each board.
    const longSeries = Array.from({ length: MAX_DIMENSION + 1 }, () => [[[0]]]);
    assert.equal(validateSeries(longSeries).length, MAX_DIMENSION + 1);
  });

  test('non-array series inputs and sparse outer arrays are rejected', () => {
    for (const invalid of [undefined, null, {}, '[]', 0, true, { length: 1 }]) {
      assert.throws(() => validateSeries(invalid), /series must be an array/);
      assert.throws(() => cloneSeries(invalid), /series must be an array/);
    }
    assert.throws(() => validateSeries(new Array(1)), /Board at index 0:/);
    const sparse = [createBoard(1, 1)];
    sparse.length = 2;
    assert.throws(() => validateSeries(sparse), /Board at index 1:/);
  });

  test('malformed boards identify their zero-based series index', () => {
    const valid = [[[0]]];
    for (const invalid of [null, {}, '[]', [], [[0]], [[[]]], [[[0]], [[0]]]]) {
      assert.throws(() => validateSeries([valid, invalid]), /Board at index 1:/);
      assert.throws(() => cloneSeries([valid, valid, invalid]), /Board at index 2:/);
    }
    assert.throws(
      () => validateSeries([valid, [[[2]]]]),
      /Board at index 1: Cell \(1, 1, 1\) must be -1, 0, or 1/,
    );
    const ragged = createBoard(2, 2);
    ragged[1][0].pop();
    assert.throws(() => validateSeries([ragged]), /Board at index 0: Row \(2, 1\)/);
  });

  test('each board retains the existing dimension and exact numeric color constraints', () => {
    const largest = createBoard(MAX_DIMENSION, MAX_DIMENSION);
    assert.deepEqual(validateSeries([largest]), [{ M: MAX_DIMENSION, N: MAX_DIMENSION }]);
    assert.throws(
      () => validateSeries([Array.from({ length: MAX_DIMENSION + 1 }, () => [[0]])]),
      /Board at index 0: M must be an integer/,
    );
    assert.throws(
      () => validateSeries([[[Array(MAX_DIMENSION + 1).fill(0)]]]),
      /Board at index 0: N must be an integer/,
    );
    for (const value of [2, -2, '1', true, null, undefined, NaN, Infinity]) {
      assert.throws(() => validateSeries([[[[value]]]]), /Board at index 0: Cell/);
    }
    assert.throws(() => validateSeries([[[new Array(1)]]]), /Board at index 0: Cell/);
  });

  test('default series contains three independent transparent 3 × 3 × 3 boards', () => {
    const boards = createDefaultSeries();
    assert.equal(boards.length, 3);
    assert.deepEqual(validateSeries(boards), Array.from({ length: 3 }, () => ({ M: 3, N: 3 })));
    assert.ok(boards.flat(3).every((value) => value === 0));
    boards[0][0][0][0] = 1;
    assert.equal(boards[0][0][1][0], 0);
    assert.equal(boards[0][1][0][0], 0);
    assert.equal(boards[1][0][0][0], 0);
    assert.equal(boards[2][0][0][0], 0);
    assert.equal(createDefaultSeries()[0][0][0][0], 0);
  });

  test('cloning separates all nested arrays and removes source aliasing between boards', () => {
    const board = createBoard(2, 2);
    board[0][0][0] = 1;
    board[1][1][1] = -1;
    const source = [board, board];
    const cloned = cloneSeries(source);
    assert.deepEqual(cloned, source);
    assert.ok(cloned !== source);
    assert.ok(cloned[0] !== cloned[1]);
    for (let index = 0; index < source.length; index += 1) {
      assert.ok(cloned[index] !== source[index]);
      for (let x = 0; x < board.length; x += 1) {
        assert.ok(cloned[index][x] !== source[index][x]);
        for (let y = 0; y < board[x].length; y += 1) {
          assert.ok(cloned[index][x][y] !== source[index][x][y]);
        }
      }
    }
    cloned[0][0][0][0] = -1;
    assert.equal(source[0][0][0][0], 1);
    assert.equal(cloned[1][0][0][0], 1);
    source[1][1][1][1] = 1;
    assert.equal(cloned[1][1][1][1], -1);
  });
}
