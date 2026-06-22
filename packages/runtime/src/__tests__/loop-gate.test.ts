import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { z } from 'zod';
import type { SessionEvent } from '@maka/core/events';
import type { SessionHeader, StoredMessage } from '@maka/core/session';

import {
  ToolRuntime,
  formatLoopGateText,
  LOOP_GATE_IDENTICAL_THRESHOLD,
  type MakaTool,
} from '../tool-runtime.js';
import { PermissionEngine } from '../permission-engine.js';

// The loop-gate blocks a back-to-back run of byte-identical tool calls (same
// tool + same args). These tests drive ToolRuntime directly so the path resolves
// synchronously (no streaming, no permission parking).

function header(): SessionHeader {
  return {
    id: 'session-1',
    workspaceRoot: '/tmp/maka',
    cwd: '/tmp/maka',
    createdAt: 1,
    lastUsedAt: 1,
    name: 'Test',
    isFlagged: false,
    labels: [],
    isArchived: false,
    status: 'active',
    statusUpdatedAt: 1,
    hasUnread: false,
    backend: 'ai-sdk',
    llmConnectionSlug: 'c',
    connectionLocked: true,
    model: 'm',
    permissionMode: 'ask',
    schemaVersion: 1,
  };
}

interface Harness {
  runtime: ToolRuntime;
  pushed: SessionEvent[];
  impl: string[];
}

function makeHarness(): Harness {
  const appended: StoredMessage[] = [];
  const pushed: SessionEvent[] = [];
  const impl: string[] = [];
  const engine = new PermissionEngine({ newId: () => 'perm', now: () => 1 });
  let n = 0;
  const runtime = new ToolRuntime({
    sessionId: 'session-1',
    header: header(),
    connection: { providerType: 'openai', slug: 'c' } as never,
    modelId: 'm',
    appendMessage: async (m) => { appended.push(m); },
    permissionEngine: engine,
    newId: () => `id-${++n}`,
    now: () => 1,
    getPermissionPauseTarget: () => null,
  });
  return { runtime, pushed, impl };
}

function makeTool(name: string, impl: string[]): MakaTool {
  return {
    name,
    description: name,
    parameters: z.object({}).passthrough(),
    permissionRequired: false,
    impl: (args) => { impl.push(`${name}:${JSON.stringify(args)}`); return { ok: true }; },
  };
}

let callSeq = 0;
function call(h: Harness, t: MakaTool, args: unknown): Promise<unknown> {
  const exec = h.runtime.wrapToolExecute(t, 'turn-1', { push: (e) => h.pushed.push(e) });
  return exec(args, { toolCallId: `tc-${++callSeq}`, abortSignal: new AbortController().signal });
}

describe('loop-gate for repeated identical tool calls', () => {
  test('runs the first N-1 identical calls then blocks the Nth (and keeps blocking)', async () => {
    const h = makeHarness();
    const t = makeTool('Edit', h.impl);
    const args = { path: 'a.ts', old_string: 'x', new_string: 'y' };

    const results: unknown[] = [];
    for (let i = 0; i < LOOP_GATE_IDENTICAL_THRESHOLD; i++) results.push(await call(h, t, args));

    assert.equal(h.impl.length, LOOP_GATE_IDENTICAL_THRESHOLD - 1, 'only the calls before the gate ran');
    assert.deepEqual(results[LOOP_GATE_IDENTICAL_THRESHOLD - 1], { error: formatLoopGateText('Edit') });

    const again = await call(h, t, args);
    assert.deepEqual(again, { error: formatLoopGateText('Edit') }, 'further identical calls stay blocked');
    assert.equal(h.impl.length, LOOP_GATE_IDENTICAL_THRESHOLD - 1, 'no further impl runs');
  });

  test('a different tool or different args between identical calls breaks the streak', async () => {
    const h = makeHarness();
    const bash = makeTool('Bash', h.impl);
    const edit = makeTool('Edit', h.impl);
    const cmd = { command: 'npm test' };

    // Bash(cmd), Edit, Bash(cmd), Edit, Bash(cmd): three identical Bash calls but
    // never back-to-back — iterate-then-retry must not be gated.
    await call(h, bash, cmd);
    await call(h, edit, { path: 'a' });
    await call(h, bash, cmd);
    await call(h, edit, { path: 'a' });
    const last = await call(h, bash, cmd);

    assert.deepEqual(last, { ok: true }, 'the re-run after progress is not blocked');
    assert.equal(h.impl.length, 5, 'all five calls ran');
  });

  test('treats args as identical regardless of key order', async () => {
    const h = makeHarness();
    const t = makeTool('Write', h.impl);

    await call(h, t, { path: 'a', content: 'x' });
    await call(h, t, { content: 'x', path: 'a' }); // same canonical args, reordered keys
    const third = await call(h, t, { path: 'a', content: 'x' });

    assert.deepEqual(third, { error: formatLoopGateText('Write') });
    assert.equal(h.impl.length, 2);
  });

  test('the block is recoverable — a different call afterwards still runs', async () => {
    const h = makeHarness();
    const grep = makeTool('Grep', h.impl);
    const read = makeTool('Read', h.impl);
    const args = { pattern: 'foo' };

    for (let i = 0; i < LOOP_GATE_IDENTICAL_THRESHOLD; i++) await call(h, grep, args);
    assert.ok(
      h.pushed.some((e) => e.type === 'tool_result' && e.isError && e.toolUseId.startsWith('tc-')),
      'a synthetic error result is emitted for the blocked call',
    );

    await call(h, read, { path: 'x' });
    assert.ok(h.impl.includes('Read:{"path":"x"}'), 'a different call after a block runs normally');
  });

  test('a guard-rejected call between identical calls still breaks the streak', async () => {
    const h = makeHarness();
    const edit = makeTool('Edit', h.impl);
    const gated = makeTool('browser_click', h.impl);
    // browser_click is gated and not active this turn, so the availability guard
    // rejects it before it runs — but it is still a different call in the
    // sequence and must reset the identical-Edit streak.
    h.runtime.setGating({ gatedNames: new Set(['browser_click']), activeNames: () => new Set(['Edit']) });
    const args = { path: 'a.ts' };

    await call(h, edit, args); // Edit #1
    await call(h, edit, args); // Edit #2
    await call(h, gated, { sel: '#x' }); // rejected by the guard, not the loop-gate
    const third = await call(h, edit, args); // streak broken by the rejected call

    assert.deepEqual(third, { ok: true }, 'the repeat after a different (rejected) call is not gated');
    assert.equal(h.impl.length, 3, 'three Edits ran; the gated tool never executed');
    assert.ok(!h.impl.some((c) => c.startsWith('browser_click:')), 'the gated tool did not run');
  });
});
