import assert from 'node:assert/strict';
import test from 'node:test';
import { defineSeriesModelTests } from './voronoi-series-model-suite.mjs';

defineSeriesModelTests(test, assert);
