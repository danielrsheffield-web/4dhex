import { createBoard, validateBoard } from './model.js';

export const SERIES_STORAGE_KEY = 'hex.voronoi.series';

/** Validate boards[index][x - 1][y - 1][z - 1], preserving series order. */
export function validateSeries(boards) {
  if (!Array.isArray(boards)) {
    throw new Error('The series must be an array of three-dimensional boards.');
  }
  const dimensions = [];
  for (let index = 0; index < boards.length; index += 1) {
    try {
      dimensions.push(validateBoard(boards[index]));
    } catch (error) {
      throw new Error(`Board at index ${index}: ${error.message}`);
    }
  }
  return dimensions;
}

/** Return a validated copy with independent arrays at every level. */
export function cloneSeries(boards) {
  validateSeries(boards);
  return boards.map((board) => board.map((layer) => layer.map((row) => [...row])));
}

export function createDefaultSeries() {
  return Array.from({ length: 3 }, () => createBoard(3, 3));
}
