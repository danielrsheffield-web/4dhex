import { createCellGeometry, latticePoint } from './model.js';

const TAU = Math.PI * 2;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => { const n = Math.hypot(...a) || 1; return a.map((v) => v / n); };
const sameCell = (a, b) => a === b || Boolean(a && b && a.every((v, i) => v === b[i]));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function multiply(a, b) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return result;
}

function compileProgram(gl) {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(vertex, `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uMatrix;
    varying vec3 vColor;
    void main() { gl_Position = uMatrix * vec4(aPosition, 1.0); vColor = aColor; }
  `);
  gl.shaderSource(fragment, `
    precision mediump float;
    varying vec3 vColor;
    void main() { gl_FragColor = vec4(vColor, 1.0); }
  `);
  const program = gl.createProgram();
  try {
    for (const shader of [vertex, fragment]) {
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'The 3D shader could not compile.');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'The 3D renderer could not initialize.');
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

/** Native, on-demand WebGL rendering of the unscaled BCC Voronoi cells. */
export class BoardRenderer {
  constructor(canvas, { interactiveCells = true, onSelect = () => {}, onHover = () => {}, onViewChange = () => {} } = {}) {
    this.canvas = canvas;
    this.interactiveCells = interactiveCells;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onViewChange = onViewChange;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL is unavailable. Enable hardware acceleration to display this board.');
    this.gl = gl;
    this.geometry = createCellGeometry();
    this.planes = this.geometry.faces.map((face) => ({ normal: face.normal, distance: dot(face.normal, this.geometry.vertices[face.indices[0]]) }));
    this.program = compileProgram(gl);
    this.positionAttribute = gl.getAttribLocation(this.program, 'aPosition');
    this.colorAttribute = gl.getAttribLocation(this.program, 'aColor');
    this.matrixUniform = gl.getUniformLocation(this.program, 'uMatrix');
    this.faceBuffer = gl.createBuffer();
    this.edgeBuffer = gl.createBuffer();
    this.highlightBuffer = gl.createBuffer();
    this.faceCount = 0;
    this.edgeCount = 0;
    this.cells = [];
    this.visibleCells = [];
    this.dimensions = [];
    this.layer = null;
    this.selection = null;
    this.hover = null;
    this.target = [0, 0, 0];
    this.center = [0, 0, 0];
    this.radius = 4;
    this.halfHeight = 5;
    this.yaw = -0.95;
    this.pitch = 0.6;
    this.fitPoints = this.geometry.vertices;
    this.pointers = new Map();
    this.frame = null;
    this.destroyed = false;
    this.needsFit = true;
    this.autoFit = true;
    this.listeners = [];
    this.maxLineWidth = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)[1];
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(canvas);
    this.requestRender();
  }

  listen(target, event, callback, options) {
    target.addEventListener(event, callback, options);
    this.listeners.push(() => target.removeEventListener(event, callback, options));
  }

  bindEvents() {
    const canvas = this.canvas;
    this.listen(canvas, 'contextmenu', (event) => event.preventDefault());
    this.listen(canvas, 'pointerdown', (event) => {
      if (event.button > 2) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      this.gestureStart = { x: event.clientX, y: event.clientY };
      this.dragged = this.pointers.size > 1;
      this.panGesture = event.button === 1 || event.button === 2 || event.shiftKey;
      this.setHover(null);
    });
    this.listen(canvas, 'pointermove', (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) {
        if (this.interactiveCells) this.setHover(this.pick(event.clientX, event.clientY));
        return;
      }
      const current = { x: event.clientX, y: event.clientY };
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      if (this.pointers.size > 1) {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)[1];
        const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
        const newDistance = Math.hypot(current.x - other.x, current.y - other.y);
        if (oldDistance > 0 && newDistance > 0) this.zoom(newDistance / oldDistance);
        this.pan(dx * 0.5, dy * 0.5);
        this.dragged = true;
      } else {
        if (Math.hypot(current.x - this.gestureStart.x, current.y - this.gestureStart.y) > 4) this.dragged = true;
        if (this.dragged) {
          if (this.panGesture || event.shiftKey) this.pan(dx, dy);
          else {
            this.yaw = (this.yaw - dx * 0.006) % TAU;
            this.pitch = clamp(this.pitch + dy * 0.006, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015);
            this.onViewChange('custom');
            this.requestRender();
          }
        }
      }
      this.pointers.set(event.pointerId, current);
    });
    const endPointer = (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const isClick = event.type === 'pointerup' && !this.dragged && !this.panGesture && this.pointers.size === 1;
      this.pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (this.interactiveCells && isClick) this.onSelect(this.pick(event.clientX, event.clientY));
      // A remaining finger may orbit, but releasing a pinch must never select a cell.
      this.dragged = true;
    };
    this.listen(canvas, 'pointerup', endPointer);
    this.listen(canvas, 'pointercancel', endPointer);
    this.listen(canvas, 'lostpointercapture', (event) => this.pointers.delete(event.pointerId));
    this.listen(canvas, 'pointerleave', () => { if (!this.pointers.size) this.setHover(null); });
    this.listen(canvas, 'wheel', (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      this.zoom(Math.exp(-clamp(event.deltaY * unit, -250, 250) * 0.0015));
    }, { passive: false });
    this.listen(window, 'resize', () => this.requestRender());
    this.listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
    });
    this.listen(canvas, 'webglcontextrestored', () => {
      this.contextLost = false;
      this.program = compileProgram(this.gl);
      this.positionAttribute = this.gl.getAttribLocation(this.program, 'aPosition');
      this.colorAttribute = this.gl.getAttribLocation(this.program, 'aColor');
      this.matrixUniform = this.gl.getUniformLocation(this.program, 'uMatrix');
      this.faceBuffer = this.gl.createBuffer();
      this.edgeBuffer = this.gl.createBuffer();
      this.highlightBuffer = this.gl.createBuffer();
      this.rebuildBuffers();
    });
  }

  setBoard(values) {
    const dimensions = [values.length, values[0]?.length || 0, values[0]?.[0]?.length || 0];
    const changedDimensions = !sameCell(dimensions, this.dimensions);
    this.dimensions = dimensions;
    this.cells = [];
    for (let x = 0; x < dimensions[0]; x++) {
      for (let y = 0; y < dimensions[1]; y++) {
        for (let z = 0; z < dimensions[2]; z++) {
          this.cells.push({ coords: [x + 1, y + 1, z + 1], center: latticePoint(x + 1, y + 1, z + 1), value: values[x][y][z] });
        }
      }
    }
    this.center = dimensions.every(Boolean) ? latticePoint(...dimensions.map((n) => (n + 1) / 2)) : [0, 0, 0];
    this.fitPoints = [];
    for (const x of [1, dimensions[0]]) {
      for (const y of [1, dimensions[1]]) {
        for (const z of [1, dimensions[2]]) {
          const center = latticePoint(x, y, z);
          for (const vertex of this.geometry.vertices) this.fitPoints.push(vertex.map((value, axis) => value + center[axis]));
        }
      }
    }
    this.radius = Math.max(1, ...this.fitPoints.map((point) => Math.hypot(...point.map((v, i) => v - this.center[i]))));
    if (this.layer > dimensions[2]) this.layer = null;
    if (this.selection && !this.cells.some((cell) => sameCell(cell.coords, this.selection))) this.selection = null;
    if (changedDimensions) this.resetView();
    this.rebuildBuffers();
  }

  setLayer(z) {
    this.layer = z == null ? null : Number(z);
    this.setHover(null);
    this.rebuildBuffers();
  }

  setSelection(coords) {
    this.selection = coords ? [...coords] : null;
    this.requestRender();
  }

  setHover(coords) {
    if (!this.interactiveCells) coords = null;
    if (sameCell(coords, this.hover)) return;
    this.hover = coords;
    this.canvas.style.cursor = coords ? 'pointer' : 'grab';
    this.onHover(coords);
    this.requestRender();
  }

  resetView() {
    this.target = [...this.center];
    this.yaw = -0.95;
    this.pitch = 0.6;
    this.needsFit = true;
    this.autoFit = true;
    this.onViewChange('isometric');
    this.requestRender();
  }

  setView(view) {
    this.target = [...this.center];
    if (view === 'top') { this.yaw = -Math.PI / 2; this.pitch = Math.PI / 2 - 0.0001; }
    else if (view === 'front') { this.yaw = -Math.PI / 2; this.pitch = 0; }
    else { this.yaw = -0.95; this.pitch = 0.6; view = 'isometric'; }
    this.needsFit = true;
    this.autoFit = true;
    this.onViewChange(view);
    this.requestRender();
  }

  zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.ensureSize();
    this.halfHeight = clamp(this.halfHeight / factor, Math.min(0.65, this.radius * 0.1), this.radius * 5);
    this.needsFit = false;
    this.autoFit = false;
    this.requestRender();
  }

  basis() {
    const direction = [Math.cos(this.pitch) * Math.cos(this.yaw), Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch)];
    const right = normalize(cross([0, 0, 1], direction));
    const up = cross(direction, right);
    return { direction, right, up };
  }

  pan(dx, dy) {
    this.autoFit = false;
    const { right, up } = this.basis();
    const units = 2 * this.halfHeight / Math.max(1, this.canvas.clientHeight);
    this.target = this.target.map((value, i) => value + (-right[i] * dx + up[i] * dy) * units);
    this.requestRender();
  }

  rebuildBuffers() {
    if (this.contextLost || this.destroyed) return;
    const faces = [];
    const edges = [];
    const light = normalize([-0.35, -0.65, 1]);
    this.visibleCells = this.cells.filter((cell) => this.layer === null || cell.coords[2] === this.layer);
    for (const cell of this.visibleCells) {
      const vertices = this.geometry.vertices.map((vertex) => vertex.map((v, i) => v + cell.center[i]));
      if (cell.value === 1 || cell.value === -1) {
        const color = cell.value === 1 ? [40 / 255, 99 / 255, 223 / 255] : [223 / 255, 81 / 255, 80 / 255];
        for (const face of this.geometry.faces) {
          const shade = 0.7 + 0.3 * Math.max(0, dot(face.normal, light));
          const shaded = color.map((v) => v * shade);
          for (let i = 1; i < face.indices.length - 1; i++) {
            for (const index of [face.indices[0], face.indices[i], face.indices[i + 1]]) faces.push(...vertices[index], ...shaded);
          }
        }
      }
      for (const edge of this.geometry.edges) for (const index of edge) edges.push(...vertices[index]);
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(faces), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edges), gl.STATIC_DRAW);
    this.faceCount = faces.length / 6;
    this.edgeCount = edges.length / 3;
    this.requestRender();
  }

  ensureSize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      if (this.autoFit) this.needsFit = true;
    }
    this.aspect = width / height;
    if (this.needsFit) {
      const { right, up } = this.basis();
      let horizontal = 0;
      let vertical = 0;
      for (const point of this.fitPoints) {
        const relative = point.map((value, i) => value - this.center[i]);
        horizontal = Math.max(horizontal, Math.abs(dot(relative, right)));
        vertical = Math.max(vertical, Math.abs(dot(relative, up)));
      }
      this.halfHeight = Math.max(1, vertical, horizontal / this.aspect) * 1.18;
      this.needsFit = false;
    }
  }

  matrix() {
    const { direction, right, up } = this.basis();
    const distance = this.radius * 12 + 100;
    const eye = this.target.map((value, i) => value + direction[i] * distance);
    const view = new Float32Array([
      right[0], up[0], direction[0], 0,
      right[1], up[1], direction[1], 0,
      right[2], up[2], direction[2], 0,
      -dot(right, eye), -dot(up, eye), -dot(direction, eye), 1,
    ]);
    const near = 0.01;
    const far = distance * 2;
    const projection = new Float32Array([
      1 / (this.halfHeight * this.aspect), 0, 0, 0,
      0, 1 / this.halfHeight, 0, 0,
      0, 0, -2 / (far - near), 0,
      0, 0, -(far + near) / (far - near), 1,
    ]);
    return multiply(projection, view);
  }

  requestRender() {
    if (this.frame !== null || this.destroyed || this.contextLost) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    if (this.destroyed || this.contextLost) return;
    this.ensureSize();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    // Both orientations remain visible when a transparent neighbor exposes a face.
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.matrixUniform, false, this.matrix());
    gl.enableVertexAttribArray(this.positionAttribute);
    if (this.faceCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuffer);
      gl.vertexAttribPointer(this.positionAttribute, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(this.colorAttribute);
      gl.vertexAttribPointer(this.colorAttribute, 3, gl.FLOAT, false, 24, 12);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, this.faceCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffer);
    gl.vertexAttribPointer(this.positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(this.colorAttribute);
    gl.vertexAttrib3f(this.colorAttribute, 0, 0, 0);
    gl.lineWidth(1);
    gl.drawArrays(gl.LINES, 0, this.edgeCount);
    if (this.interactiveCells) {
      if (this.hover && !sameCell(this.hover, this.selection)) this.drawHighlight(this.hover, [0.31, 0.4, 0.53]);
      if (this.selection) this.drawHighlight(this.selection, [0.94, 0.55, 0.12]);
    }
  }

  drawHighlight(coords, color) {
    if (this.layer !== null && coords[2] !== this.layer) return;
    const center = latticePoint(...coords);
    const vertices = [];
    for (const edge of this.geometry.edges) {
      for (const index of edge) vertices.push(...this.geometry.vertices[index].map((v, i) => v + center[i]));
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this.positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttrib3f(this.colorAttribute, ...color);
    gl.lineWidth(Math.min(this.maxLineWidth, 2));
    gl.drawArrays(gl.LINES, 0, vertices.length / 3);
  }

  pick(clientX, clientY) {
    if (this.destroyed || this.contextLost || !this.visibleCells.length) return null;
    this.ensureSize();
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const screenX = ((clientX - rect.left) / rect.width * 2 - 1) * this.halfHeight * this.aspect;
    const screenY = (1 - (clientY - rect.top) / rect.height * 2) * this.halfHeight;
    const { direction, right, up } = this.basis();
    const origin = this.target.map((v, i) => v + right[i] * screenX + up[i] * screenY + direction[i] * (this.radius * 12 + 100));
    const ray = direction.map((v) => -v);
    let closest = Infinity;
    let result = null;
    for (const cell of this.visibleCells) {
      const localOrigin = origin.map((v, i) => v - cell.center[i]);
      let enter = 0;
      let leave = closest;
      for (const plane of this.planes) {
        const denominator = dot(plane.normal, ray);
        const numerator = plane.distance - dot(plane.normal, localOrigin);
        if (Math.abs(denominator) < 1e-8) {
          if (numerator < -1e-7) { leave = -1; break; }
        } else {
          const t = numerator / denominator;
          if (denominator < 0) enter = Math.max(enter, t);
          else leave = Math.min(leave, t);
          if (enter > leave + 1e-7) break;
        }
      }
      if (leave >= enter - 1e-7 && enter < closest) {
        closest = enter;
        result = cell.coords;
      }
    }
    return result ? [...result] : null;
  }

  destroy() {
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const remove of this.listeners) remove();
    for (const buffer of [this.faceBuffer, this.edgeBuffer, this.highlightBuffer]) this.gl.deleteBuffer(buffer);
    this.gl.deleteProgram(this.program);
  }
}
