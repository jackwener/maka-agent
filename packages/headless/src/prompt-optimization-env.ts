/**
 * Pure, testable env-string parsers for the RSI prompt-optimization CLI entry
 * (`harbor/run-prompt-optimization.mjs`). These live here rather than inline in the
 * `.mjs` so the parsing behaviour can be unit-tested without spawning the script
 * (which has top-level side effects). Each parser only turns the raw env string
 * (or undefined) into a number and delegates the invariant check to the shared
 * `numeric-guards`, so the CLI and the core API enforce the same contract and a
 * `NaN` can never slip through a later `!== undefined` check to disable a guard.
 */

import {
  assertFinitePositive,
  assertNonNegativeInt,
  assertPositiveInt,
  assertRatio,
} from './numeric-guards.js';

/** Parse a non-negative integer; throw on a non-integer or negative value. */
export function envNonNegativeInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  return assertNonNegativeInt(name, Number(raw));
}

/** Parse a positive integer (>= 1); throw on 0, negative, or non-integer. Used
 * for counts that are meaningless at 0 — e.g. full-run rounds, where 0 would make
 * a baseline-only run trivially pass the structural smoke (minimumRounds 0), and
 * max-concurrency, where a fractional value must fail loud rather than be floored.
 * Returns `fallback` (which may be undefined) when unset. A non-integer or
 * negative value reports as "non-negative integer"; 0 reports as "positive
 * integer" (the value that is the integer-but-not-allowed case). */
export function envPositiveInt(
  name: string,
  raw: string | undefined,
  fallback: number | undefined,
): number | undefined {
  if (raw === undefined || raw === '') return fallback;
  return assertPositiveInt(name, assertNonNegativeInt(name, Number(raw)));
}

/**
 * Parse a finite, strictly-positive number; throw on `NaN`, non-finite, or `<= 0`.
 * Used for guard knobs (cost ceiling, concurrency, duration cap) where a bare
 * `Number("abc")` would yield `NaN`, pass `!== undefined`, and disable the guard
 * (e.g. `cost >= NaN` is always false). Returns `fallback` when unset.
 */
export function envFinitePositiveNumber(
  name: string,
  raw: string | undefined,
  fallback: number | undefined,
): number | undefined {
  if (raw === undefined || raw === '') return fallback;
  return assertFinitePositive(name, Number(raw));
}

/** Parse a ratio in `(0, 1]`; throw on `NaN`, non-finite, or out-of-range.
 * Returns `fallback` (which may be undefined for an optional guard) when unset. */
export function envRatio(
  name: string,
  raw: string | undefined,
  fallback: number | undefined,
): number | undefined {
  if (raw === undefined || raw === '') return fallback;
  return assertRatio(name, Number(raw));
}

/**
 * Resolve a minimum-stable-task floor. An explicit raw count wins (validated as a
 * *positive* integer — `0` is rejected because the loop's guard is
 * `selectedTaskIds.length < floor`, so a floor of 0 can never trip and would
 * silently disable the stable-sample protection). Otherwise the floor scales with
 * the *actual* requested count — `ceil(requested * ratio)`, at least 1 — so a
 * severely shrunk sample fails loud instead of a flat default of 1 letting a
 * near-empty set still produce a "valid" conclusion. Cheap smokes pass `"1"`.
 */
export function resolveMinStable(
  name: string,
  requested: number,
  explicitRaw: string | undefined,
  ratio: number,
): number {
  if (explicitRaw !== undefined && explicitRaw !== '') {
    const explicit = envNonNegativeInt(name, explicitRaw, 1);
    if (explicit < 1) {
      throw new Error(`${name} must be a positive integer; a floor of 0 disables the stable-task guard (got "${explicitRaw}")`);
    }
    return explicit;
  }
  return Math.max(1, Math.ceil(requested * ratio));
}

/**
 * CLI exit code for a finished run: non-zero when the structural smoke did not
 * pass, so CI and shell callers don't treat a bad run as success.
 */
export function smokeExitCode(smokeStatus: string): number {
  return smokeStatus === 'pass' ? 0 : 1;
}
