import { latticePoint } from './model.js';
import { BoardRenderer } from './renderer.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** A canvas-only series, using one WebGL context and one shared camera. */
export class BoardSeriesRenderer extends BoardRenderer {
  constructor(canvas) {
    super(canvas, { interactiveCells: false });
    this.boards = [];
    this.columns = 1;
    this.rows = 1;
    this.zoomLevel = 1;
    // Screen-space offsets in units of each viewport's half-height.
    this.panOffset = [0, 0];
  }

  /** Accept validated M × M × depth boards in display order. */
  setBoards(values) {
    const faceVerticesPerCell = this.geometry.faces.reduce((sum, face) => sum + (face.indices.length - 2) * 3, 0);
    const edgeVerticesPerCell = this.geometry.edges.length * 2;
    const cells = [];
    let faceStart = 0;
    let edgeStart = 0;
    this.boards = values.map((board) => {
      const dimensions = [board.length, board[0].length, board[0][0].length];
      const center = latticePoint(...dimensions.map((size) => (size + 1) / 2));
      let faceCount = 0;
      let edgeCount = 0;
      for (let x = 0; x < dimensions[0]; x++) {
        for (let y = 0; y < dimensions[1]; y++) {
          for (let z = 0; z < dimensions[2]; z++) {
            const value = board[x][y][z];
            const localCenter = latticePoint(x + 1, y + 1, z + 1).map((v, axis) => v - center[axis]);
            cells.push({ coords: [x + 1, y + 1, z + 1], center: localCenter, value });
            if (value !== 0) faceCount += faceVerticesPerCell;
            edgeCount += edgeVerticesPerCell;
          }
        }
      }

      // A sphere enclosing the extreme cells keeps the board inside its own
      // viewport at every rotation, including after responsive layout changes.
      let radius = 1;
      for (const x of [1, dimensions[0]]) {
        for (const y of [1, dimensions[1]]) {
          for (const z of [1, dimensions[2]]) {
            const corner = latticePoint(x, y, z).map((value, axis) => value - center[axis]);
            for (const vertex of this.geometry.vertices) {
              radius = Math.max(radius, Math.hypot(...vertex.map((value, axis) => value + corner[axis])));
            }
          }
        }
      }
      const item = { dimensions, radius, faceStart, faceCount, edgeStart, edgeCount };
      faceStart += faceCount;
      edgeStart += edgeCount;
      return item;
    });
    this.cells = cells;
    this.layer = null;
    // Reuse the existing mesh/shading builder. Upload only when data changes;
    // every subsequent camera movement draws ranges from these same buffers.
    this.rebuildBuffers();
  }

  resetView() {
    this.yaw = -0.95;
    this.pitch = 0.6;
    this.zoomLevel = 1;
    this.panOffset = [0, 0];
    this.requestRender();
  }

  getViewState() {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoomLevel, pan: [...this.panOffset] };
  }

  zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomLevel = clamp(this.zoomLevel * factor, 0.2, 12);
    this.requestRender();
  }

  pan(dx, dy) {
    this.ensureSize();
    const viewportHeight = Math.max(1, this.canvas.clientHeight / this.rows);
    this.panOffset[0] += 2 * dx / viewportHeight;
    this.panOffset[1] -= 2 * dy / viewportHeight;
    this.requestRender();
  }

  ensureSize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    // Maximize the diameter available to each board; when layouts fit equally
    // well, prefer the one with fewer unused positions.
    const count = this.boards.length;
    let bestSize = 0;
    let bestUnused = Infinity;
    this.columns = 1;
    this.rows = 1;
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns);
      const size = Math.min(width / columns, height / rows);
      const unused = columns * rows - count;
      if (size > bestSize || (size === bestSize && unused < bestUnused)) {
        bestSize = size;
        bestUnused = unused;
        this.columns = columns;
        this.rows = rows;
      }
    }
  }

  render() {
    if (this.destroyed || this.contextLost) return;
    this.ensureSize();
    const gl = this.gl;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.enable(gl.SCISSOR_TEST);
    const { right, up } = this.basis();

    for (let index = 0; index < this.boards.length; index++) {
      const board = this.boards[index];
      const column = index % this.columns;
      const row = Math.floor(index / this.columns);
      const left = Math.round(column * this.canvas.width / this.columns);
      const top = Math.round(row * this.canvas.height / this.rows);
      const width = Math.round((column + 1) * this.canvas.width / this.columns) - left;
      const height = Math.round((row + 1) * this.canvas.height / this.rows) - top;
      if (width === 0 || height === 0) continue;
      const bottom = this.canvas.height - top - height;
      gl.viewport(left, bottom, width, height);
      gl.scissor(left, bottom, width, height);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const aspect = width / height;
      const halfHeight = board.radius * 1.12 * Math.max(1, 1 / aspect) / this.zoomLevel;
      const target = right.map((value, axis) => -(value * this.panOffset[0] + up[axis] * this.panOffset[1]) * halfHeight);
      gl.uniformMatrix4fv(this.matrixUniform, false, this.matrix({ target, radius: board.radius, halfHeight, aspect }));
      this.drawBuffers(board);
    }
    gl.disable(gl.SCISSOR_TEST);
  }
}
