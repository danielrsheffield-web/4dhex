import { MAX_DIMENSION } from './model.js';
import { SERIES_STORAGE_KEY, cloneSeries, createDefaultSeries } from './series-model.js';
import { BoardSeriesRenderer } from './series-renderer.js';

let boards = createDefaultSeries();
let renderer = null;

try {
  renderer = new BoardSeriesRenderer(document.getElementById('board-canvas'));
} catch (error) {
  console.error('The 3D board series requires WebGL.', error);
}

function persist() {
  try {
    localStorage.setItem(SERIES_STORAGE_KEY, JSON.stringify(boards));
  } catch (error) {
    console.warn('The board series could not be saved. Current changes remain in memory.', error);
  }
}

function replaceBoards(nextBoards, { save = true } = {}) {
  // Validate the complete series before replacing any currently displayed board.
  const next = cloneSeries(nextBoards);
  renderer?.setBoards(next);
  boards = next;
  if (save) persist();
}

function readSavedSeries() {
  let raw;
  try {
    raw = localStorage.getItem(SERIES_STORAGE_KEY);
  } catch (error) {
    console.warn('Browser storage is unavailable. The current series is still displayed.', error);
    return false;
  }
  if (raw === null) {
    replaceBoards(createDefaultSeries());
    return true;
  }
  try {
    replaceBoards(JSON.parse(raw), { save: false });
    return true;
  } catch (error) {
    console.warn('The saved series is invalid. Current boards and saved data have not been changed.', error);
    return false;
  }
}

window.addEventListener('storage', (event) => {
  if ((event.key === SERIES_STORAGE_KEY || event.key === null) && event.storageArea === localStorage) {
    readSavedSeries();
  }
});

// Direct writes in this tab require reload(); writes in another tab refresh
// automatically. setBoards() updates storage and the display together.
window.voronoiSeries = Object.freeze({
  storageKey: SERIES_STORAGE_KEY,
  maxDimension: MAX_DIMENSION,
  getBoards: () => cloneSeries(boards),
  setBoards: (nextBoards) => replaceBoards(nextBoards),
  reload: readSavedSeries,
  resetView: () => renderer?.resetView(),
});

renderer?.setBoards(boards);
readSavedSeries();
