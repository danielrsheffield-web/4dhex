/** Exact BCC Voronoi geometry and the board's persisted data format. */
export const STORAGE_KEY = 'hex.voronoi.cells';
export const MAX_DIMENSION = 12;

/** x, y and z are the coefficients of the three lattice basis vectors. */
export function latticePoint(x, y, z) {
  return [x + y - z, x - y - z, x - y + z];
}

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (vector) => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
};

/**
 * The cell centered at the origin is the intersection of |axis| <= 1 and
 * |X| + |Y| + |Z| <= 3/2. Every vertex is a signed permutation of (0, 1/2, 1).
 * Faces wind counterclockwise when viewed from outside the solid.
 */
export function createCellGeometry() {
  const vertices = [];
  for (let zeroAxis = 0; zeroAxis < 3; zeroAxis += 1) {
    const remaining = [0, 1, 2].filter((axis) => axis !== zeroAxis);
    for (const longAxis of remaining) {
      const shortAxis = remaining.find((axis) => axis !== longAxis);
      for (const longSign of [-1, 1]) {
        for (const shortSign of [-1, 1]) {
          const vertex = [0, 0, 0];
          vertex[longAxis] = longSign;
          vertex[shortAxis] = shortSign / 2;
          vertices.push(vertex);
        }
      }
    }
  }

  const planes = [];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const sign of [-1, 1]) {
      const normal = [0, 0, 0];
      normal[axis] = sign;
      planes.push({ normal, distance: 1 });
    }
  }
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        planes.push({ normal: [x, y, z], distance: 1.5 });
      }
    }
  }

  const faces = planes.map((plane) => {
    const indices = vertices
      .map((vertex, index) => ({ vertex, index }))
      .filter(({ vertex }) => dot(plane.normal, vertex) === plane.distance)
      .map(({ index }) => index);
    const center = [0, 1, 2].map((axis) =>
      indices.reduce((sum, index) => sum + vertices[index][axis], 0) / indices.length,
    );
    const normal = normalize(plane.normal);
    const u = normalize(subtract(vertices[indices[0]], center));
    const v = cross(normal, u);
    const angle = (index) => {
      const offset = subtract(vertices[index], center);
      return Math.atan2(dot(offset, v), dot(offset, u));
    };
    indices.sort((a, b) => angle(a) - angle(b));
    return { indices, normal };
  });

  // Use polygon boundaries, never triangulation diagonals, for the wireframe.
  const edgeMap = new Map();
  for (const { indices } of faces) {
    indices.forEach((index, position) => {
      const next = indices[(position + 1) % indices.length];
      const edge = index < next ? [index, next] : [next, index];
      edgeMap.set(edge.join(','), edge);
    });
  }
  return { vertices, faces, edges: [...edgeMap.values()] };
}

function validateDimension(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
    throw new Error(`${name} must be an integer from 1 to ${MAX_DIMENSION}.`);
  }
}

/** Validate cells[x - 1][y - 1][z - 1], returning its M and N dimensions. */
export function validateBoard(cells) {
  if (!Array.isArray(cells)) {
    throw new Error('The board must be a three-dimensional array.');
  }
  const M = cells.length;
  validateDimension(M, 'M');
  if (!Array.isArray(cells[0]) || !Array.isArray(cells[0][0])) {
    throw new Error('The board must be a rectangular M × M × N array.');
  }
  const N = cells[0][0].length;
  validateDimension(N, 'N');
  for (let x = 0; x < M; x += 1) {
    if (!Array.isArray(cells[x]) || cells[x].length !== M) {
      throw new Error(`Layer ${x + 1} must contain exactly ${M} rows (M × M × N).`);
    }
    for (let y = 0; y < M; y += 1) {
      if (!Array.isArray(cells[x][y]) || cells[x][y].length !== N) {
        throw new Error(`Row (${x + 1}, ${y + 1}) must contain exactly ${N} cells.`);
      }
      for (let z = 0; z < N; z += 1) {
        const value = cells[x][y][z];
        if (value !== -1 && value !== 0 && value !== 1) {
          throw new Error(`Cell (${x + 1}, ${y + 1}, ${z + 1}) must be -1, 0, or 1.`);
        }
      }
    }
  }
  return { M, N };
}

/** Make independent rows and preserve the overlap when resizing a board. */
export function createBoard(M, N, previous = null) {
  validateDimension(M, 'M');
  validateDimension(N, 'N');
  if (previous !== null) validateBoard(previous);
  return Array.from({ length: M }, (_, x) =>
    Array.from({ length: M }, (_, y) =>
      Array.from({ length: N }, (_, z) => previous?.[x]?.[y]?.[z] ?? 0),
    ),
  );
}

export function countCells(cells) {
  const { M, N } = validateBoard(cells);
  const counts = { blue: 0, red: 0, transparent: 0, total: M * M * N };
  for (const layer of cells) {
    for (const row of layer) {
      for (const value of row) {
        if (value === 1) counts.blue += 1;
        else if (value === -1) counts.red += 1;
        else counts.transparent += 1;
      }
    }
  }
  return counts;
}
