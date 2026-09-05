import { STORAGE_KEY, MAX_DIMENSION, createBoard, validateBoard } from './model.js';
import { BoardRenderer } from './renderer.js';

let cells = createBoard(3, 3);
let renderer = null;

try {
  renderer = new BoardRenderer(document.getElementById('board-canvas'), { interactiveCells: false });
} catch (error) {
  console.error('The 3D display requires WebGL.', error);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
  } catch (error) {
    console.warn('The board could not be saved. Current changes remain in memory.', error);
  }
}

function replaceBoard(nextCells, { save = true } = {}) {
  validateBoard(nextCells);
  // Keep our own copy so callers cannot silently change the displayed board.
  cells = nextCells.map((plane) => plane.map((row) => [...row]));
  renderer?.setBoard(cells);
  if (save) persist();
}

function readSavedBoard() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Browser storage is unavailable. The current board is still displayed.', error);
    return false;
  }
  if (raw === null) {
    replaceBoard(createBoard(3, 3));
    return true;
  }
  try {
    replaceBoard(JSON.parse(raw), { save: false });
    return true;
  } catch (error) {
    console.warn('The saved board is invalid. Current cells and saved data have not been changed.', error);
    return false;
  }
}

function setCell(x, y, z, value) {
  const { M, N } = validateBoard(cells);
  if (![x, y, z].every((coordinate, axis) =>
    Number.isInteger(coordinate) && coordinate >= 1 && coordinate <= (axis === 2 ? N : M))) {
    throw new Error('Cell coordinates must be integers within the board’s 1-based bounds.');
  }
  if (value !== -1 && value !== 0 && value !== 1) {
    throw new Error('A cell value must be -1, 0, or 1.');
  }
  cells[x - 1][y - 1][z - 1] = value;
  renderer?.setBoard(cells);
  persist();
}

window.addEventListener('storage', (event) => {
  if ((event.key === STORAGE_KEY || event.key === null) && event.storageArea === localStorage) {
    readSavedBoard();
  }
});

// Same-tab writes to localStorage do not fire a storage event. Call reload()
// afterward, or use setCells()/setCell() to save and render in one step.
window.voronoiBoard = Object.freeze({
  storageKey: STORAGE_KEY,
  maxDimension: MAX_DIMENSION,
  getCells: () => cells.map((plane) => plane.map((row) => [...row])),
  setCells: (nextCells) => replaceBoard(nextCells),
  setCell,
  reload: readSavedBoard,
});

renderer?.setBoard(cells);
readSavedBoard();
