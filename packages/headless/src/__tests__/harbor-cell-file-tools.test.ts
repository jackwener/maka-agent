import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarborCellLocalToolExecutor } from '../harbor-cell.js';
import { buildIsolatedHeadlessTools } from '../tools.js';

// Real local executor (actual child processes). Regression guard for the
// bounded-tail change: Read/Glob/Grep run through the SAME executor.exec as Bash,
// so when Bash's bounded tail was (briefly) the default exec semantics, a large
// file or result was silently head-dropped to a tail. Read must return the FULL
// file, head-first — only Bash opts into a bounded tail.

const toolCtx = (cwd: string) => ({
  sessionId: 's',
  turnId: 't',
  cwd,
  toolCallId: 'tool-1',
  abortSignal: new AbortController().signal,
  emitOutput: () => {},
});

function tool(tools: ReturnType<typeof buildIsolatedHeadlessTools>, name: string) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} not found`);
  return found;
}

describe('Harbor local executor file tools (real spawn)', () => {
  test('Read returns the head of the file under its byte budget, not a bounded tail (P1 regression)', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'maka-harbor-read-'));
    // ~1.2MB across many lines, far past Read's ~50KB byte budget. HEAD_MARKER is
    // line 1, TAIL_MARKER the last line. Head-first Read returns the first
    // budget-worth of lines (HEAD_MARKER present, TAIL_MARKER not yet reached) plus
    // a continuation hint; a bounded tail would keep the END and drop HEAD_MARKER.
    const filler = Array.from({ length: 1500 }, (_, i) => `line${i + 1}:` + 'a'.repeat(800)).join('\n');
    const body = 'HEAD_MARKER\n' + filler + '\nTAIL_MARKER\n'; // 1502 lines, ~1.2MB
    await writeFile(join(cwd, 'big.txt'), body, 'utf8');
    const tools = buildIsolatedHeadlessTools(createHarborCellLocalToolExecutor());

    const result = (await tool(tools, 'Read').impl({ path: 'big.txt' }, toolCtx(cwd))) as { content: string };

    assert.ok(result.content.includes('HEAD_MARKER'), 'head retained — Read is not tail-bounded');
    assert.ok(!result.content.includes('TAIL_MARKER'), 'tail beyond the byte budget is not returned');
    assert.ok(result.content.length < 64 * 1024, 'output bounded by the ~50KB byte budget, not the full ~1.2MB file');
    assert.ok(/pass offset=\d+ to read more/.test(result.content), 'continuation hint tells the model how to resume');
    // (Glob/Grep share the same command-backed executor.exec with no boundedTail
    //  flag — see the "only Bash opts into bounded-tail" contract test — so this
    //  full-output guarantee covers them too without generating MBs of matches.)
  });
});
