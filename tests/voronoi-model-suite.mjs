import {
  MAX_DIMENSION,
  STORAGE_KEY,
  countCells,
  createBoard,
  createCellGeometry,
  latticePoint,
  validateBoard,
} from '../app/voronoi/model.js';

export function defineModelTests(test, assert) {
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const subtract = (a, b) => a.map((value, i) => value - b[i]);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const pointSet = (points) => points.map((p) => p.join(',')).sort();
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);

  test('Voronoi cell has exact bounds and truncated-octahedron topology', () => {
    const { vertices, faces, edges } = createCellGeometry();
    assert.equal(vertices.length, 24);
    assert.equal(new Set(pointSet(vertices)).size, 24);
    assert.equal(faces.length, 14);
    assert.equal(faces.filter(({ indices }) => indices.length === 4).length, 6);
    assert.equal(faces.filter(({ indices }) => indices.length === 6).length, 8);
    assert.equal(edges.length, 36);
    assert.equal(vertices.length - edges.length + faces.length, 2);

    for (const vertex of vertices) {
      assert.deepEqual(vertex.map(Math.abs).sort((a, b) => a - b), [0, 0.5, 1]);
      assert.ok(vertex.every((value) => Math.abs(value) <= 1));
      assert.equal(vertex.reduce((sum, value) => sum + Math.abs(value), 0), 1.5);
    }
    const incidence = new Map();
    for (const { indices } of faces) {
      indices.forEach((index, position) => {
        const key = [index, indices[(position + 1) % indices.length]]
          .sort((a, b) => a - b).join(',');
        incidence.set(key, (incidence.get(key) ?? 0) + 1);
      });
    }
    for (const edge of edges) {
      assert.equal(incidence.get(edge.join(',')), 2, 'each boundary edge belongs to two faces');
      close(Math.hypot(...subtract(vertices[edge[0]], vertices[edge[1]])), Math.SQRT1_2);
    }
    for (let index = 0; index < vertices.length; index += 1) {
      assert.equal(edges.filter((edge) => edge.includes(index)).length, 3);
    }
  });

  test('every face is coplanar and outward CCW, and cell volume equals lattice covolume 4', () => {
    const { vertices, faces } = createCellGeometry();
    let volume = 0;
    for (const { indices, normal } of faces) {
      close(Math.hypot(...normal), 1);
      const distance = dot(vertices[indices[0]], normal);
      assert.ok(distance > 0);
      close(distance, indices.length === 4 ? 1 : Math.sqrt(3) / 2);
      for (let i = 0; i < indices.length; i += 1) {
        const a = vertices[indices[i]];
        const b = vertices[indices[(i + 1) % indices.length]];
        const c = vertices[indices[(i + 2) % indices.length]];
        close(dot(a, normal), distance);
        assert.ok(dot(cross(subtract(b, a), subtract(c, b)), normal) > 0);
      }
      for (const vertex of vertices) {
        assert.ok(dot(vertex, normal) <= distance + 1e-10);
      }
      const a = vertices[indices[0]];
      for (let i = 1; i < indices.length - 1; i += 1) {
        volume += dot(a, cross(vertices[indices[i]], vertices[indices[i + 1]])) / 6;
      }
    }
    close(volume, 4);
  });

  test('all fourteen lattice neighbors share an entire congruent face', () => {
    const { vertices, faces } = createCellGeometry();
    for (const face of faces) {
      // Square neighbors are +/-2 on one axis; hexagon neighbors are (+/-1,+/-1,+/-1).
      const offset = face.normal.map((value) =>
        Math.round(value * (face.indices.length === 4 ? 2 : Math.sqrt(3))),
      );
      const opposite = faces.find(({ normal }) => dot(normal, face.normal) < -1 + 1e-10);
      assert.ok(opposite);
      const shared = face.indices.map((index) => vertices[index]);
      const translated = opposite.indices.map((index) =>
        vertices[index].map((value, axis) => value + offset[axis]),
      );
      assert.deepEqual(pointSet(shared), pointSet(translated));
      const parity = offset.map((value) => ((value % 2) + 2) % 2);
      assert.ok(parity.every((value) => value === parity[0]));
    }
  });

  test('lattice coordinates follow the requested three basis vectors', () => {
    assert.deepEqual(latticePoint(1, 0, 0), [1, 1, 1]);
    assert.deepEqual(latticePoint(0, 1, 0), [1, -1, -1]);
    assert.deepEqual(latticePoint(0, 0, 1), [-1, -1, 1]);
    assert.deepEqual(latticePoint(1, 1, 1), [1, -1, 1]);
    assert.deepEqual(latticePoint(2, 3, 4), [1, -5, 3]);
    const points = [];
    for (let x = 1; x <= 4; x += 1) {
      for (let y = 1; y <= 4; y += 1) {
        for (let z = 1; z <= 3; z += 1) {
          const point = latticePoint(x, y, z);
          const parity = point.map((value) => ((value % 2) + 2) % 2);
          assert.ok(parity.every((value) => value === parity[0]));
          points.push(point);
        }
      }
    }
    assert.equal(new Set(pointSet(points)).size, 48);
  });

  test('boards use M × M × N independent arrays and exact color counts', () => {
    assert.equal(STORAGE_KEY, 'hex.voronoi.cells');
    const cells = createBoard(2, 3);
    assert.deepEqual(validateBoard(cells), { M: 2, N: 3 });
    assert.deepEqual(countCells(cells), { blue: 0, red: 0, transparent: 12, total: 12 });
    cells[0][0][0] = 1;
    cells[1][1][2] = -1;
    assert.equal(cells[0][1][0], 0);
    assert.equal(cells[1][0][0], 0);
    assert.deepEqual(countCells(cells), { blue: 1, red: 1, transparent: 10, total: 12 });
    assert.deepEqual(validateBoard(JSON.parse(JSON.stringify(cells))), { M: 2, N: 3 });
  });

  test('resizing preserves the overlapping cells without mutating the previous board', () => {
    const initial = createBoard(2, 3);
    initial[0][0][0] = 1;
    initial[1][1][2] = -1;
    const grown = createBoard(3, 4, initial);
    assert.equal(grown[0][0][0], 1);
    assert.equal(grown[1][1][2], -1);
    assert.equal(grown[2][2][3], 0);
    grown[0][0][0] = -1;
    assert.equal(initial[0][0][0], 1);
    assert.deepEqual(createBoard(1, 1, initial), [[[1]]]);
  });

  test('dimensions and malformed saved data are rejected', () => {
    for (const invalid of [0, -1, 1.5, '2', NaN, Infinity, MAX_DIMENSION + 1]) {
      assert.throws(() => createBoard(invalid, 1), /M must be an integer/);
      assert.throws(() => createBoard(1, invalid), /N must be an integer/);
    }
    assert.deepEqual(validateBoard(createBoard(MAX_DIMENSION, MAX_DIMENSION)), {
      M: MAX_DIMENSION, N: MAX_DIMENSION,
    });
    for (const invalid of [null, {}, '[]', [], [[0]], [[[]]], [[[0]], [[0]]], [[[0, 1], [0]]]]) {
      assert.throws(() => validateBoard(invalid));
    }
    for (const value of [2, -2, '1', true, null, undefined, NaN, Infinity]) {
      assert.throws(() => validateBoard([[[value]]]), /must be -1, 0, or 1/);
    }
    assert.throws(() => validateBoard([[new Array(1)]]), /must be -1, 0, or 1/);
    assert.throws(() => createBoard(1, 1, [[[7]]]), /must be -1, 0, or 1/);
    assert.throws(() => countCells([[[7]]]), /must be -1, 0, or 1/);
  });

}
