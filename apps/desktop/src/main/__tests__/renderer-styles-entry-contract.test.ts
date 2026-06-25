import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { RENDERER_STYLES_ENTRY, stripCssComments } from './css-test-helpers.js';

describe('renderer styles entry contract', () => {
  it('keeps styles.css as an entry file without selector rule blocks', async () => {
    const src = stripCssComments(await readFile(RENDERER_STYLES_ENTRY, 'utf8'));
    const body = src
      .replace(/@theme\s+inline\s*\{[\s\S]*?\}/g, '')
      .replace(/@import\s+[^;]+;/g, '')
      .replace(/@source\s+[^;]+;/g, '')
      .trim();

    assert.equal(
      body,
      '',
      'styles.css must stay an entry file: only @import/@source plus @theme are allowed; move selector rules into styles/*.css.',
    );
  });
});
