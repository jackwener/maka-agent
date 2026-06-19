import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { hashSystemPrompt } from '../fixed-prompt-controller.js';
import {
  runPromptCandidateRound,
  type MetaAgentPromptInput,
  type MetaAgentPromptResult,
} from '../prompt-candidate-loop.js';

describe('prompt candidate loop', () => {
  test('passes only program, results TSV, and held-in digests to the meta-agent', async () => {
    await withDir(async (dir) => {
      const programPath = join(dir, 'program.md');
      const systemPromptPath = join(dir, 'system_prompt.md');
      const resultsTsvPath = join(dir, 'results.tsv');
      const resultsJsonlPath = join(dir, 'results.jsonl');
      await writeFile(programPath, 'Improve the prompt conservatively.\n', 'utf8');
      await writeFile(systemPromptPath, 'original prompt\n', 'utf8');
      await writeFile(resultsTsvPath, 'task_id\tpassed\ntask-a\tfalse\n', 'utf8');

      let seenInput: MetaAgentPromptInput | undefined;
      await runPromptCandidateRound({
        runId: 'run-1',
        roundId: 'round-1',
        programPath,
        systemPromptPath,
        resultsTsvPath,
        resultsJsonlPath,
        heldInDigests: [
          {
            taskId: 'task-a',
            errorClass: 'verification_failed',
            summary: 'last command missed the requested output',
          },
        ],
        heldOutDigests: [
          {
            taskId: 'held-out-secret',
            errorClass: 'verification_failed',
            summary: 'do not leak this held-out trajectory',
          },
        ],
        metaAgent: async (input): Promise<MetaAgentPromptResult> => {
          seenInput = input;
          return { systemPrompt: 'candidate prompt\n', summary: 'tightened output instruction' };
        },
        git: gitNoop(),
        now: () => 100,
        newId: idFactory(),
      });

      assert.ok(seenInput);
      assert.equal(seenInput.program, 'Improve the prompt conservatively.\n');
      assert.equal(seenInput.resultsTsv, 'task_id\tpassed\ntask-a\tfalse\n');
      assert.equal(seenInput.currentSystemPrompt, 'original prompt\n');
      assert.deepEqual(seenInput.heldInDigests.map((digest) => digest.taskId), ['task-a']);
      assert.equal(JSON.stringify(seenInput).includes('held-out-secret'), false);
      assert.equal(JSON.stringify(seenInput).includes('do not leak'), false);
      assert.equal(await readFile(systemPromptPath, 'utf8'), 'candidate prompt\n');

      const events = (await readFile(resultsJsonlPath, 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(events, [
        {
          schemaVersion: 1,
          type: 'prompt_candidate_committed',
          id: 'id-1',
          ts: 100,
          runId: 'run-1',
          roundId: 'round-1',
          commitSha: 'commit-1',
          summary: 'tightened output instruction',
          promptHash: hashSystemPrompt('candidate prompt\n'),
        },
      ]);
    });
  });

  test('fails closed when the prompt edit changes files outside system_prompt.md', async () => {
    await withDir(async (dir) => {
      const programPath = join(dir, 'program.md');
      const systemPromptPath = join(dir, 'system_prompt.md');
      const resultsTsvPath = join(dir, 'results.tsv');
      await writeFile(programPath, 'Improve the prompt conservatively.\n', 'utf8');
      await writeFile(systemPromptPath, 'original prompt\n', 'utf8');
      await writeFile(resultsTsvPath, 'task_id\tpassed\ntask-a\tfalse\n', 'utf8');

      let committed = false;
      await assert.rejects(
        runPromptCandidateRound({
          runId: 'run-1',
          roundId: 'round-1',
          programPath,
          systemPromptPath,
          resultsTsvPath,
          resultsJsonlPath: join(dir, 'results.jsonl'),
          heldInDigests: [],
          heldOutDigests: [],
          metaAgent: async () => ({ systemPrompt: 'candidate prompt\n', summary: 'changed prompt' }),
          git: {
            changedFiles: async () => ['system_prompt.md', 'program.md'],
            commit: async () => {
              committed = true;
              return 'commit-1';
            },
          },
          now: () => 100,
          newId: idFactory(),
        }),
        /only system_prompt.md may change/,
      );

      assert.equal(committed, false);
    });
  });
});

function gitNoop() {
  return {
    changedFiles: async () => ['system_prompt.md'],
    commit: async () => 'commit-1',
  };
}

function idFactory(): () => string {
  let i = 0;
  return () => `id-${++i}`;
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'maka-prompt-candidate-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
