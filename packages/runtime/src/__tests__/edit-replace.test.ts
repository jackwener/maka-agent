import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeEditedSource, COMPUTE_EDITED_SOURCE_FN_SOURCE } from '../edit-replace.js';

describe('computeEditedSource (exact match)', () => {
  test('replaces the single occurrence and returns the new content', () => {
    assert.equal(
      computeEditedSource('hello world', 'world', 'Maka', 'a.txt'),
      'hello Maka',
    );
  });

  test('throws with the where label when old_string is not found', () => {
    assert.throws(
      () => computeEditedSource('hello', 'absent', 'x', 'src/a.txt'),
      /^Error: old_string not found in src\/a\.txt$/,
    );
  });

  test('throws with the match count when old_string is not unique', () => {
    assert.throws(
      () => computeEditedSource('a a a', 'a', 'b', 'b.txt'),
      /^Error: old_string is not unique in b\.txt \(3 matches\)$/,
    );
  });

  test('serialized source embeds standalone and reproduces the function', () => {
    assert.equal(typeof COMPUTE_EDITED_SOURCE_FN_SOURCE, 'string');
    // The isolated headless Edit tool runs this source inside `node -e`; verify
    // it parses to a function with identical behavior to the in-process one.
    const embedded = new Function(`return (${COMPUTE_EDITED_SOURCE_FN_SOURCE})`)() as typeof computeEditedSource;
    assert.equal(embedded('one two', 'two', 'three', 'x.txt'), 'one three');
    assert.throws(() => embedded('z', 'absent', 'x', 'x.txt'), /old_string not found in x\.txt/);
  });
});
