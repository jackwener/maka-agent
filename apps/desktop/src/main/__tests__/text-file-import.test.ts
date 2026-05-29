import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAX_IMPORTED_TEXT_FILE_BYTES,
  MAX_IMPORTED_TEXT_FILE_CHARS,
  formatImportedTextFilePrompt,
  readTextFileForPromptImport,
} from '../text-file-import.js';

describe('text file context import', () => {
  it('formats a selected text file into a prompt fragment', async () => {
    await withTempDir(async (root) => {
      const filePath = join(root, 'notes.md');
      await writeFile(filePath, '# Notes\nUse the local context.\n', 'utf8');

      const result = await readTextFileForPromptImport(filePath);

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.name, 'notes.md');
      assert.equal(result.truncated, false);
      assert.match(result.prompt, /<local-text-file name="notes\.md">/);
      assert.match(result.prompt, /Use the local context\./);
    });
  });

  it('rejects oversize and binary-looking files', async () => {
    await withTempDir(async (root) => {
      const huge = join(root, 'huge.txt');
      const binary = join(root, 'binary.dat');
      await writeFile(huge, 'A'.repeat(MAX_IMPORTED_TEXT_FILE_BYTES + 1), 'utf8');
      await writeFile(binary, Buffer.from([0, 1, 2, 3, 4]));

      assert.deepEqual(await readTextFileForPromptImport(huge), { ok: false, reason: 'too-large' });
      assert.deepEqual(await readTextFileForPromptImport(binary), { ok: false, reason: 'binary' });
    });
  });

  it('truncates long text by character count and escapes filenames', () => {
    const prompt = formatImportedTextFilePrompt({
      name: 'a"b<.md',
      text: '你'.repeat(MAX_IMPORTED_TEXT_FILE_CHARS + 5).slice(0, MAX_IMPORTED_TEXT_FILE_CHARS),
      truncated: true,
    });

    assert.match(prompt, /文件内容过长/);
    assert.match(prompt, /name="a&quot;b&lt;\.md"/);
  });

  it('wires the import action into both Composer and first-run Quick Chat', async () => {
    const mainSource = await readFile(join(process.cwd(), 'src/renderer/main.tsx'), 'utf8');
    const onboardingSource = await readFile(join(process.cwd(), 'src/renderer/OnboardingHero.tsx'), 'utf8');
    const uiSource = await readFile(join(process.cwd(), '../../packages/ui/src/components.tsx'), 'utf8');

    assert.match(mainSource, /onImportTextFile=\{importTextFilePrompt\}/);
    assert.match(mainSource, /onImportTextFile=\{importTextFileIntoComposer\}/);
    assert.match(onboardingSource, /导入文本文件/);
    assert.match(uiSource, /aria-label="导入文本文件"/);
  });
});

async function withTempDir(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'maka-text-import-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
