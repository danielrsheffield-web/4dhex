# Hex

The 3D Voronoi viewer displays the truncated-octahedron cells of the lattice
`2 Z³ ∪ ((1, 1, 1) + 2 Z³)` in a canvas that fills the browser window.
Open it at **http://127.0.0.1:8000/voronoi/**,
or follow **3D Voronoi board** from the existing Hex menu.

## Run locally

Use Python 3.10 or newer. From the repository root:

```sh
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Python dependencies are declared in `requirements.txt`. The viewer's HTML,
JavaScript, and CSS are served by FastAPI at `/voronoi/`.
The renderer uses native WebGL; there are no JavaScript packages or CDN assets
to install or download.

Drag the board to orbit, scroll to zoom, and Shift-drag or right-drag to pan.
On touch screens, use one finger to orbit and two fingers to pan or pinch-zoom.
The page contains only the 3D display. Set cell colors and board dimensions
through the JavaScript API or the stored array described below.

## Board data

The browser's `localStorage` stores the board under **`hex.voronoi.cells`** as a
JSON-encoded, rectangular three-dimensional array with shape **M × M × N**.
Both M and N can be integers from 1 through 12; the default board is 3 × 3 × 3.
Every entry must be the number `1`, `-1`, or `0`:

| Value | Cell appearance |
| --- | --- |
| `1` | Blue |
| `-1` | Red |
| `0` | Transparent, with only black edges |

Board coordinates `(x, y, z)` are one-based. A cell reads its value from
`cells[x - 1][y - 1][z - 1]`, where `1 ≤ x, y ≤ M` and `1 ≤ z ≤ N`.
Its center in space is

```text
x(1, 1, 1) + y(1, -1, -1) + z(-1, -1, 1)
= (x + y - z, x - y - z, x - y + z).
```

Relative to each center, the exact Voronoi cell is the intersection of
`|X| ≤ 1`, `|Y| ≤ 1`, `|Z| ≤ 1`, and `|X| + |Y| + |Z| ≤ 1.5`. These bounds
give a truncated octahedron with six square faces and eight hexagonal faces.

## Change the board from JavaScript

After the viewer loads, use its browser API to update the display and storage:

```js
// Create a 3 × 3 × 2 board with two colored cells.
const cells = Array.from({ length: 3 }, () =>
  Array.from({ length: 3 }, () => Array(2).fill(0))
);
cells[0][0][0] = 1;  // Blue at board coordinate (1, 1, 1).
cells[2][1][1] = -1; // Red at board coordinate (3, 2, 2).
window.voronoiBoard.setCells(cells);

window.voronoiBoard.setCell(2, 2, 1, 1); // One-based coordinates.
const currentCells = window.voronoiBoard.getCells();
```

You can also write the array directly to `localStorage`:

```js
localStorage.setItem("hex.voronoi.cells", JSON.stringify(cells));
window.voronoiBoard.reload();
```

A direct `localStorage.setItem()` in the same tab requires `reload()` to refresh
the display. Changes in another tab on
the same origin refresh the viewer automatically through storage events.

Invalid stored data leaves the current board displayed, is not automatically
overwritten, and produces an error in the browser console. Storage failures
are also reported in the console. If browser storage is unavailable or a write
fails, board edits remain available in memory for the current page; they may
not survive a reload.

## Synchronized board series

Open **http://127.0.0.1:8000/voronoi/series/** for a display-only version that
shows one 3D board for each entry in `localStorage["hex.voronoi.series"]`.
The stored value is a JSON-encoded array of 3D arrays:

```js
// Three boards, each with its own 3D array.
const makeBoard = () => Array.from({ length: 3 }, () =>
  Array.from({ length: 3 }, () => Array(2).fill(0))
);
const boards = [makeBoard(), makeBoard(), makeBoard()];
boards[0][0][0][0] = 1;  // Blue cell (1, 1, 1) in the first board.
boards[1][0][0][0] = -1; // Red cell (1, 1, 1) in the second board.
boards[2][1][1][1] = 1;  // Blue cell (2, 2, 2) in the third board.

localStorage.setItem("hex.voronoi.series", JSON.stringify(boards));
// If the series page is already open in this tab:
window.voronoiSeries.reload();
```

The outer array length determines the number of representations. Boards appear
left to right, then top to bottom, in a grid that adapts to the window. Dragging
rotates all boards together around their own centers; zoom and pan are shared
too. The series uses one WebGL context, including when displaying more than
16 boards.

Each inner board uses the same M × M × depth format and color values described
above, with dimensions from 1 to 12. Different boards may have different
dimensions. The outer array may be empty, which gives an empty display. When
no series is saved, the viewer initializes three transparent 3 × 3 × 3 boards.
The single-board storage key is unaffected.

On the series page, you can also update storage and the display together:

```js
window.voronoiSeries.setBoards(boards);
const copy = window.voronoiSeries.getBoards();
window.voronoiSeries.resetView();
```

The camera orientation survives data updates. Storage updates from other tabs
refresh automatically. Invalid data leaves the last valid series displayed and
is reported in the browser console without overwriting storage. Failed saves
keep the current series in memory.

## Geometry tests

With Node.js 22 or newer:

```sh
node --experimental-default-type=module --test tests/voronoi-model.test.mjs
```

Alternatively, serve the repository root with `python3 -m http.server 8080`
and open `http://localhost:8080/tests/voronoi-model.test.html` in a browser.
Both runners use the same seven tests, covering topology, face orientation,
volume, shared neighbor faces, lattice coordinates, resizing, and validation.

The series model has seven additional tests for outer-array validation, mixed
board sizes, empty series, ordering, and independent copies. Run
`node --experimental-default-type=module --test tests/voronoi-series-model.test.mjs`
or open `http://localhost:8080/tests/voronoi-series-model.test.html` with the
same repository server.
