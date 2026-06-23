import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assertFinitePositive,
  assertNonNegativeInt,
  assertPositiveInt,
  assertRatio,
} from '../numeric-guards.js';

describe('assertPositiveInt', () => {
  test('returns the value for an integer >= 1', () => {
    assert.equal(assertPositiveInt('N', 1), 1);
    assert.equal(assertPositiveInt('N', 42), 42);
  });

  test('throws on 0, negative, fractional, or NaN', () => {
    assert.throws(() => assertPositiveInt('N', 0), /N must be a positive integer/);
    assert.throws(() => assertPositiveInt('N', -1), /N must be a positive integer/);
    assert.throws(() => assertPositiveInt('N', 1.5), /N must be a positive integer/);
    assert.throws(() => assertPositiveInt('N', NaN), /N must be a positive integer/);
  });
});

describe('assertNonNegativeInt', () => {
  test('returns the value for an integer >= 0', () => {
    assert.equal(assertNonNegativeInt('N', 0), 0);
    assert.equal(assertNonNegativeInt('N', 5), 5);
  });

  test('throws on negative, fractional, or NaN', () => {
    assert.throws(() => assertNonNegativeInt('N', -1), /N must be a non-negative integer/);
    assert.throws(() => assertNonNegativeInt('N', 2.5), /N must be a non-negative integer/);
    assert.throws(() => assertNonNegativeInt('N', NaN), /N must be a non-negative integer/);
  });
});

describe('assertFinitePositive', () => {
  test('returns the value for a finite positive number', () => {
    assert.equal(assertFinitePositive('N', 0.5), 0.5);
    assert.equal(assertFinitePositive('N', 30), 30);
  });

  test('throws on 0, negative, NaN, or non-finite', () => {
    assert.throws(() => assertFinitePositive('N', 0), /N must be a finite positive number/);
    assert.throws(() => assertFinitePositive('N', -5), /N must be a finite positive number/);
    assert.throws(() => assertFinitePositive('N', NaN), /N must be a finite positive number/);
    assert.throws(() => assertFinitePositive('N', Infinity), /N must be a finite positive number/);
  });
});

describe('assertRatio', () => {
  test('returns the value for a number in (0, 1]', () => {
    assert.equal(assertRatio('R', 1), 1);
    assert.equal(assertRatio('R', 0.25), 0.25);
  });

  test('throws outside (0, 1], on NaN, or non-finite', () => {
    assert.throws(() => assertRatio('R', 0), /R must be a number in \(0, 1\]/);
    assert.throws(() => assertRatio('R', 1.5), /R must be a number in \(0, 1\]/);
    assert.throws(() => assertRatio('R', NaN), /R must be a number in \(0, 1\]/);
    assert.throws(() => assertRatio('R', Infinity), /R must be a number in \(0, 1\]/);
  });
});
