import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd().endsWith('apps/desktop')
  ? join(process.cwd(), '..', '..')
  : process.cwd();

async function readRepo(path: string): Promise<string> {
  return readFile(join(repoRoot, path), 'utf8');
}

describe('Command palette accessibility and visible copy', () => {
  it('names the command results listbox controlled by the search input', async () => {
    const src = await readRepo('apps/desktop/src/renderer/command-palette.tsx');
    assert.match(
      src,
      /aria-controls="maka-palette-list"/,
      'palette input must keep its aria-controls link to the results list',
    );
    assert.match(
      src,
      /<div className="maka-palette-list" id="maka-palette-list" role="listbox" aria-label="命令面板结果">/,
      'palette results listbox must expose a name in the accessibility tree',
    );
  });

  it('keeps the primary command hints in Chinese product copy', async () => {
    const src = await readRepo('apps/desktop/src/renderer/command-palette.tsx');
    assert.match(src, /label: '新建对话',[^\n]*\n\s*hint: '开始新的会话',/);
    assert.doesNotMatch(src, /hint: 'New chat'/, 'visible command palette hints must not leak English fallback copy');
  });
});
