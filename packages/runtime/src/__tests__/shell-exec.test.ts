import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runShellWithBoundedTail } from '../shell-exec.js';

const base = (over: Record<string, unknown> = {}) => ({ cwd: process.cwd(), timeoutMs: 30_000, ...over });

describe('runShellWithBoundedTail', () => {
  test('returns full small output and exit 0 without throwing', async () => {
    const r = await runShellWithBoundedTail("printf 'hello\\nworld\\n'", base());
    assert.deepEqual(
      { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut, aborted: r.aborted },
      { exitCode: 0, stdout: 'hello\nworld\n', stderr: '', timedOut: false, aborted: false },
    );
  });

  test('keeps only the bounded, line-aligned TAIL of large output (never killed by size)', async () => {
    const r = await runShellWithBoundedTail(
      "printf 'HEADMARK\\n'; seq 1 50; printf 'TAILMARK\\n'",
      base({ maxRetainedChars: 12 }),
    );
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes('TAILMARK'), 'tail retained');
    assert.ok(!r.stdout.includes('HEADMARK'), 'head dropped — it is a tail');
    assert.ok(r.stdout.length <= 12, `tail bounded to cap, got ${r.stdout.length}`);
  });

  test('captures stderr and a non-zero exit code as data (does not reject)', async () => {
    const r = await runShellWithBoundedTail("printf 'oops\\n' >&2; exit 3", base());
    assert.equal(r.exitCode, 3);
    assert.equal(r.stderr, 'oops\n');
    assert.equal(r.stdout, '');
  });

  test('times out a slow command, kills it, and reports timedOut', async () => {
    const r = await runShellWithBoundedTail('sleep 5', base({ timeoutMs: 150 }));
    assert.equal(r.timedOut, true);
    assert.equal(r.exitCode, 124);
  });

  test('emits every chunk live via emitOutput', async () => {
    const seen: Array<[string, string]> = [];
    await runShellWithBoundedTail(
      "printf 'aaa'; printf 'bbb' >&2",
      base({ emitOutput: (s: 'stdout' | 'stderr', c: string) => seen.push([s, c]) }),
    );
    assert.ok(seen.some(([s, c]) => s === 'stdout' && c.includes('aaa')));
    assert.ok(seen.some(([s, c]) => s === 'stderr' && c.includes('bbb')));
  });
});
