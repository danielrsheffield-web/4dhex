import assert from 'node:assert/strict';
import test from 'node:test';
import { defineModelTests } from './voronoi-model-suite.mjs';

defineModelTests(test, assert);
