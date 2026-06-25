/**
 * Static-analysis contract for the native cursor convention.
 *
 * Native macOS / Windows reserve the pointing-hand cursor (`cursor: pointer`)
 * for hyperlinks; every other control uses the default arrow. Only the
 * link-styled in-app nav button (`.maka-markdown-link-internal`) may carry it.
 * The runtime look-and-feel (which element shows which cursor) is still
 * verified in a real window — this is the source bound.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { readRendererContractCss } from './contract-css-helpers.js';

const TOKENS_PATH = join(process.cwd(), 'src', 'renderer', 'maka-tokens.css');

/** Only the link-styled in-app nav button may carry the hand cursor. */
const CURSOR_POINTER_ALLOWLIST = ['.maka-markdown-link-internal'];

/**
 * Selectors of every rule that declares `cursor: pointer`, sorted. Comments are
 * stripped first; each hit walks back to the `{` that opens its rule and takes
 * the selector after the previous block boundary. Depth is ignored, so a
 * `cursor: pointer` hidden inside an at-rule (e.g. `@media`) is still caught.
 */
function selectorsWithHandCursor(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  const re = /cursor:\s*pointer/g;
  for (let m = re.exec(stripped); m; m = re.exec(stripped)) {
    const open = stripped.lastIndexOf('{', m.index);
    selectors.push(stripped.slice(0, open).split(/[{}]/).pop()?.trim() ?? '');
  }
  return selectors.sort();
}

describe('native cursor convention contract', () => {
  it('styles.css: cursor:pointer lives only on the link-styled nav button', async () => {
    const css = await readRendererContractCss();
    assert.deepEqual(
      selectorsWithHandCursor(css),
      [...CURSOR_POINTER_ALLOWLIST].sort(),
      'Only `.maka-markdown-link-internal` may carry `cursor: pointer` — it presents as a link, and native macOS reserves the hand for links while every other control uses the default arrow. Drop the declaration, or reuse the link class if the element genuinely is the in-app link button.',
    );
  });

  it('maka-tokens.css: defines no cursor:pointer', async () => {
    const css = await readFile(TOKENS_PATH, 'utf8');
    assert.deepEqual(
      selectorsWithHandCursor(css),
      [],
      'Design tokens must not set `cursor: pointer`; the hand cursor belongs only on the link-styled nav button in styles.css.',
    );
  });
});
