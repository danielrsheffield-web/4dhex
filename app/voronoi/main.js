import { STORAGE_KEY, MAX_DIMENSION, createBoard, validateBoard, countCells, latticePoint } from './model.js';
import { BoardRenderer } from './renderer.js';

const $ = (id) => document.getElementById(id);
const brushButtons = [...document.querySelectorAll('[data-brush]')];
const colorButtons = [...document.querySelectorAll('[data-value]')];
const viewButtons = [...document.querySelectorAll('[data-view]')];
let cells = createBoard(3, 3);
let dimensions = { M: 3, N: 3 };
let selected = null;
let brush = 'inspect';
let renderer = null;
let currentLayer = null;
let invalidSavedData = false;

function notice(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function storageStatus(message, error = false) {
  $('save-status').dataset.state = error ? 'error' : 'saved';
  $('save-status').lastElementChild.textContent = message;
}

function persist() {
  invalidSavedData = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
    storageStatus('Saved locally');
    notice();
  } catch {
    storageStatus('Memory only', true);
    notice('Browser storage is unavailable or full. Your board still works in this tab; download the array from Edit array to keep a copy.');
  }
}

function inBounds(coords) {
  return coords?.length === 3 && coords.every((v, i) => Number.isInteger(v) && v >= 1 && v <= (i === 2 ? dimensions.N : dimensions.M));
}

function updateInspector() {
  colorButtons.forEach((button) => { button.disabled = !selected; });
  if (!selected) {
    $('selected-state').textContent = 'No selection';
    $('cell-position').textContent = 'Click a cell or enter its coordinates.';
    return;
  }
  selected.forEach((coordinate, index) => { $(`cell-${'xyz'[index]}`).value = coordinate; });
  const [x, y, z] = selected;
  const value = cells[x - 1][y - 1][z - 1];
  $('selected-state').textContent = value === 1 ? 'Blue · 1' : value === -1 ? 'Red · −1' : 'Transparent · 0';
  $('cell-position').textContent = `Center in ℝ³: (${latticePoint(x, y, z).join(', ')})`;
}

function updateCounts() {
  const counts = countCells(cells);
  for (const key of ['blue', 'red', 'transparent']) $(`${key}-count`).textContent = counts[key];
  const visible = currentLayer === null ? counts.total : dimensions.M ** 2;
  $('visible-count').textContent = `${visible} ${visible === 1 ? 'CELL' : 'CELLS'}${currentLayer === null ? '' : ` / z = ${currentLayer}`}`;
}

function updateLayer() {
  currentLayer = $('slice-enabled').checked ? Number($('layer-range').value) : null;
  $('layer-range').disabled = currentLayer === null;
  $('layer-value').value = currentLayer === null ? 'All' : currentLayer;
  if (selected && currentLayer !== null && selected[2] !== currentLayer) selectCell(null);
  renderer?.setLayer(currentLayer);
  $('hover-label').hidden = true;
  updateCounts();
}

function refreshBoard({ resetView = false } = {}) {
  dimensions = validateBoard(cells);
  $('dimension-m').value = dimensions.M;
  $('dimension-n').value = dimensions.N;
  $('board-size').textContent = `${dimensions.M} × ${dimensions.M} × ${dimensions.N}`;
  for (const axis of 'xyz') {
    const input = $(`cell-${axis}`);
    input.max = axis === 'z' ? dimensions.N : dimensions.M;
    input.value = Math.min(Number(input.value) || 1, Number(input.max));
  }
  $('layer-range').max = dimensions.N;
  $('layer-range').value = Math.min(Number($('layer-range').value), dimensions.N);
  if (!inBounds(selected)) selected = null;
  renderer?.setBoard(cells);
  renderer?.setSelection(selected);
  if (resetView) resetCamera();
  updateLayer();
  updateInspector();
}

function replaceBoard(nextCells, { save = true, resetView = false } = {}) {
  const nextDimensions = validateBoard(nextCells);
  const resized = nextDimensions.M !== dimensions.M || nextDimensions.N !== dimensions.N;
  // Own a copy so callers cannot silently mutate the displayed board.
  cells = nextCells.map((plane) => plane.map((row) => [...row]));
  refreshBoard({ resetView: resetView || resized });
  if (save) persist();
}

function readSavedBoard() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    storageStatus('Memory only', true);
    notice('Browser storage is unavailable. Changes stay in this tab; use Edit array to download a copy.');
    return false;
  }
  if (raw === null) {
    replaceBoard(createBoard(3, 3));
    return true;
  }
  try {
    replaceBoard(JSON.parse(raw), { save: false });
    invalidSavedData = false;
    storageStatus('Saved locally');
    notice();
    return true;
  } catch (error) {
    invalidSavedData = true;
    storageStatus('Invalid saved data', true);
    notice(`Saved board could not be loaded: ${error.message} The current board is still shown. Saved data has not been changed; use Edit array to correct it.`);
    return false;
  }
}

function selectCell(coords) {
  selected = inBounds(coords) ? [...coords] : null;
  renderer?.setSelection(selected);
  updateInspector();
}

function setCell(x, y, z, value) {
  if (!inBounds([x, y, z])) throw new Error('Cell coordinates must be integers within the board’s 1-based bounds.');
  if (value !== -1 && value !== 0 && value !== 1) throw new Error('A cell value must be -1, 0, or 1.');
  cells[x - 1][y - 1][z - 1] = value;
  renderer?.setBoard(cells);
  renderer?.setSelection(selected);
  updateCounts();
  updateInspector();
  persist();
}

function setBrush(nextBrush) {
  brush = nextBrush;
  brushButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.brush === brush)));
  $('active-tool').textContent = { inspect: '⌖ Inspect mode', 1: '● Paint blue', '-1': '● Paint red', 0: '□ Clear cells' }[brush];
}

function showView(view) {
  viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  $('view-label').textContent = `ORTHOGRAPHIC / ${{ isometric: '3D', top: 'TOP', front: 'FRONT', custom: 'ORBIT' }[view] || 'ORBIT'}`;
}

function resetCamera() {
  renderer?.resetView();
  showView('isometric');
}

try {
  renderer = new BoardRenderer($('board-canvas'), {
    onSelect(coords) {
      selectCell(coords);
      if (selected && brush !== 'inspect') setCell(...selected, Number(brush));
    },
    onHover(coords) {
      $('hover-label').hidden = !coords;
      if (coords) $('hover-label').textContent = `CELL (${coords.join(', ')})`;
    },
    onViewChange(view) { showView(view); },
  });
} catch (error) {
  $('canvas-error').hidden = false;
  $('canvas-error').textContent = `The 3D viewer needs WebGL. Enable hardware acceleration or try another browser. You can still edit the board using coordinates or the array editor. (${error.message})`;
}

$('dimensions-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    replaceBoard(createBoard(Number($('dimension-m').value), Number($('dimension-n').value), cells));
  } catch (error) { notice(error.message); }
});

brushButtons.forEach((button) => button.addEventListener('click', () => setBrush(button.dataset.brush)));
colorButtons.forEach((button) => button.addEventListener('click', () => {
  if (selected) setCell(...selected, Number(button.dataset.value));
}));

$('select-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const coords = [...'xyz'].map((axis) => Number($(`cell-${axis}`).value));
  if (!inBounds(coords)) return;
  if (currentLayer !== null && currentLayer !== coords[2]) {
    $('layer-range').value = coords[2];
    updateLayer();
  }
  selectCell(coords);
});

$('slice-enabled').addEventListener('change', updateLayer);
$('layer-range').addEventListener('input', updateLayer);
viewButtons.forEach((button) => button.addEventListener('click', () => {
  renderer?.setView(button.dataset.view);
  showView(button.dataset.view);
}));
$('zoom-in').addEventListener('click', () => renderer?.zoom(1.2));
$('zoom-out').addEventListener('click', () => renderer?.zoom(1 / 1.2));
$('reset-view').addEventListener('click', resetCamera);
$('clear-board').addEventListener('click', () => replaceBoard(createBoard(dimensions.M, dimensions.N)));
$('reload-data').addEventListener('click', readSavedBoard);

$('edit-data').addEventListener('click', () => {
  let raw = null;
  // Prefer current edits even if a storage write failed. Only read raw storage
  // when the user needs to repair malformed saved data that could not be loaded.
  try { if (invalidSavedData) raw = localStorage.getItem(STORAGE_KEY); } catch { /* The current array can still be edited. */ }
  try { $('array-data').value = JSON.stringify(raw === null ? cells : JSON.parse(raw), null, 2); }
  catch { $('array-data').value = raw; }
  $('array-error').textContent = '';
  $('data-dialog').showModal();
});
$('close-data').addEventListener('click', () => $('data-dialog').close());
$('apply-data').addEventListener('click', () => {
  try {
    replaceBoard(JSON.parse($('array-data').value));
    $('data-dialog').close();
  } catch (error) { $('array-error').textContent = error.message; }
});
$('download-data').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(cells, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `voronoi-${dimensions.M}x${dimensions.M}x${dimensions.N}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

window.addEventListener('storage', (event) => {
  if ((event.key === STORAGE_KEY || event.key === null) && event.storageArea === localStorage) readSavedBoard();
});

// The storage event only fires in OTHER tabs. Call reload() after writing
// localStorage directly in this tab, or use setCells()/setCell() to save and render.
window.voronoiBoard = Object.freeze({
  storageKey: STORAGE_KEY,
  maxDimension: MAX_DIMENSION,
  getCells: () => cells.map((plane) => plane.map((row) => [...row])),
  setCells: (nextCells) => replaceBoard(nextCells),
  setCell,
  reload: readSavedBoard,
});

refreshBoard({ resetView: true });
readSavedBoard();
