import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  planPromptAbConcurrencyCalibration,
  renderPromptAbComparisonMarkdown,
  runPromptAbComparison,
  runPromptAbConcurrencyCalibration,
  summarizePromptAbComparison,
} from '../prompt-ab-run.js';
import type { Config } from '../contracts.js';
import {
  FIXED_PROMPT_WAL_SCHEMA_VERSION,
  hashSystemPrompt,
  type FixedPromptTask,
  type FixedPromptTaskCompletedEvent,
  type HarborTaskRunOutput,
} from '../fixed-prompt-controller.js';
import { tokenSummary } from './helpers/cell-output-fixtures.js';

const config: Config = {
  id: 'cfg-ab',
  backend: 'fake',
  llmConnectionSlug: 'fake',
  model: 'fake-model',
};

describe('planPromptAbConcurrencyCalibration', () => {
  test('builds deterministic calibration trials from duration buckets', () => {
    const tasks: FixedPromptTask[] = [
      { id: 'slow-b', path: '/tasks/slow-b' },
      { id: 'fast-a', path: '/tasks/fast-a' },
      { id: 'mid-a', path: '/tasks/mid-a' },
      { id: 'slow-a', path: '/tasks/slow-a' },
      { id: 'fast-b', path: '/tasks/fast-b' },
      { id: 'mid-b', path: '/tasks/mid-b' },
    ];

    const plan = planPromptAbConcurrencyCalibration({
      tasks,
      taskDurationsMs: {
        'fast-a': 10,
        'fast-b': 20,
        'mid-a': 100,
        'mid-b': 120,
        'slow-a': 1_000,
        'slow-b': 1_200,
      },
      samplesPerBucket: 1,
      concurrencyLevels: [1, 2, 4],
      repsPerLevel: 2,
    });

    assert.deepEqual(plan.sampleTasks.map((task) => task.id), ['fast-a', 'mid-a', 'slow-a']);
    assert.deepEqual(plan.concurrencyLevels, [1, 2, 4]);
    assert.deepEqual(
      plan.trials.map((trial) => `${trial.concurrency}:${trial.rep}:${trial.task.id}`),
      [
        '1:0:fast-a',
        '1:0:mid-a',
        '1:0:slow-a',
        '1:1:fast-a',
        '1:1:mid-a',
        '1:1:slow-a',
        '2:0:fast-a',
        '2:0:mid-a',
        '2:0:slow-a',
        '2:1:fast-a',
        '2:1:mid-a',
        '2:1:slow-a',
        '4:0:fast-a',
        '4:0:mid-a',
        '4:0:slow-a',
        '4:1:fast-a',
        '4:1:mid-a',
        '4:1:slow-a',
      ],
    );
  });
});

describe('runPromptAbConcurrencyCalibration', () => {
  test('runs planned levels and recommends the highest level within the infra threshold', async () => {
    await withDir(async (dir) => {
      const systemPromptPath = join(dir, 'system_prompt.md');
      const resultsJsonlPath = join(dir, 'results.jsonl');
      await writeFile(systemPromptPath, 'baseline prompt\n', 'utf8');

      const calls: string[] = [];
      const result = await runPromptAbConcurrencyCalibration({
        runId: 'ab-run',
        config,
        systemPromptPath,
        resultsJsonlPath,
        tasks: [
          { id: 'fast', path: '/tasks/fast' },
          { id: 'mid', path: '/tasks/mid' },
          { id: 'slow', path: '/tasks/slow' },
        ],
        taskDurationsMs: { fast: 10, mid: 100, slow: 1_000 },
        samplesPerBucket: 1,
        concurrencyLevels: [1, 2, 4],
        maxInfraFailureRate: 0,
        harborRunner: async ({ roundId, task, systemPrompt }) => {
          calls.push(`${roundId}:${task.id}`);
          if (roundId.startsWith('calibration-c4-') && task.id === 'slow') {
            throw new Error('docker exhausted');
          }
          return harborOutput({
            taskId: task.id,
            durationMs: task.id === 'slow' ? 1_000 : 100,
            promptHash: hashSystemPrompt(systemPrompt),
          });
        },
        now: () => 100,
        newId: idFactory(),
      });

      assert.equal(result.recommendedConcurrency, 2);
      assert.deepEqual(result.sampleTaskIds, ['fast', 'mid', 'slow']);
      assert.deepEqual(
        result.levels.map((level) => ({
          concurrency: level.concurrency,
          attempts: level.attempts,
          infraFailed: level.infraFailed,
          completed: level.completed,
        })),
        [
          { concurrency: 1, attempts: 3, infraFailed: 0, completed: 3 },
          { concurrency: 2, attempts: 3, infraFailed: 0, completed: 3 },
          { concurrency: 4, attempts: 3, infraFailed: 1, completed: 2 },
        ],
      );
      assert.deepEqual(calls, [
        'calibration-c1-r0:fast',
        'calibration-c1-r0:mid',
        'calibration-c1-r0:slow',
        'calibration-c2-r0:fast',
        'calibration-c2-r0:mid',
        'calibration-c2-r0:slow',
        'calibration-c4-r0:fast',
        'calibration-c4-r0:mid',
        'calibration-c4-r0:slow',
        'calibration-c4-r0:slow',
      ]);

      const walLines = (await readFile(resultsJsonlPath, 'utf8')).trimEnd().split('\n');
      assert.equal(walLines.length, 9);
      assert.match(walLines.at(-1) ?? '', /"type":"task_infra_failed"/);
    });
  });
});

describe('summarizePromptAbComparison', () => {
  test('uses task plus rep as the acceptance sample and reports paired wins', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'opencode-default',
      heldInTaskIds: ['t1', 't2'],
      heldOutTaskIds: ['h1'],
      baselineHeldInRuns: [
        [completed('t1', false), completed('t2', false)],
        [completed('t1', false), completed('t2', true)],
      ],
      baselineHeldOutRuns: [
        [completed('h1', true)],
        [completed('h1', true)],
      ],
      candidateHeldInRuns: [
        [completed('t1', true), completed('t2', true)],
        [completed('t1', true), completed('t2', true)],
      ],
      candidateHeldOutRuns: [
        [completed('h1', true)],
        [completed('h1', true)],
      ],
      heldInPassRateNoiseBand: 0.2,
      heldOutPassRateNoiseBand: 0.1,
    });

    assert.equal(result.acceptance.decision, 'keep');
    assert.equal(result.acceptance.reason, 'held_in_improved');
    assert.equal(result.acceptance.metrics.lastKept.heldIn.taskCount, 4);
    assert.equal(result.acceptance.metrics.candidate.heldIn.passEligibleRate, 1);
    assert.equal(result.paired.heldIn.wins, 3);
    assert.equal(result.paired.heldIn.losses, 0);
    assert.equal(result.paired.heldIn.ties, 1);
    assert.deepEqual(result.paired.heldIn.winTaskIds, ['t1#r0', 't2#r0', 't1#r1']);
    assert.match(renderPromptAbComparisonMarkdown(result), /decision: keep \(held_in_improved\)/);
    assert.match(renderPromptAbComparisonMarkdown(result), /held-in pass_eligible_rate: baseline=0.25, candidate=1, noise=0.2/);
    assert.match(renderPromptAbComparisonMarkdown(result), /paired held-in: wins=3, losses=0, ties=1, missing=0/);
  });
});

describe('runPromptAbComparison', () => {
  test('runs baseline and candidate prompts across reps before summarizing', async () => {
    await withDir(async (dir) => {
      const baselinePromptPath = join(dir, 'baseline.md');
      const candidatePromptPath = join(dir, 'candidate.md');
      await writeFile(baselinePromptPath, 'A prompt\n', 'utf8');
      await writeFile(candidatePromptPath, 'B prompt\n', 'utf8');
      const calls: string[] = [];

      const result = await runPromptAbComparison({
        runId: 'ab-run',
        config,
        baselinePromptPath,
        candidatePromptPath,
        resultsJsonlPath: join(dir, 'results.jsonl'),
        heldInTasks: [{ id: 't1', path: '/tasks/t1' }],
        heldOutTasks: [{ id: 'h1', path: '/tasks/h1' }],
        reps: 2,
        maxConcurrency: 4,
        heldInPassRateNoiseBand: 0,
        heldOutPassRateNoiseBand: 0,
        harborRunner: async ({ roundId, task, systemPrompt }) => {
          calls.push(`${roundId}:${task.id}`);
          const isCandidate = systemPrompt.startsWith('B prompt');
          return harborOutput({
            taskId: task.id,
            promptHash: hashSystemPrompt(systemPrompt),
            reward: isCandidate || task.id === 'h1' ? 1 : 0,
          });
        },
        now: () => 100,
        newId: idFactory(),
      });

      assert.equal(result.acceptance.decision, 'keep');
      assert.equal(result.paired.overall.wins, 2);
      assert.deepEqual(calls, [
        'ab-baseline-held-in-r0:t1',
        'ab-baseline-held-out-r0:h1',
        'ab-candidate-held-in-r0:t1',
        'ab-candidate-held-out-r0:h1',
        'ab-baseline-held-in-r1:t1',
        'ab-baseline-held-out-r1:h1',
        'ab-candidate-held-in-r1:t1',
        'ab-candidate-held-out-r1:h1',
      ]);
    });
  });
});

function harborOutput(input: {
  taskId: string;
  durationMs?: number;
  promptHash: string;
  reward?: number;
}): HarborTaskRunOutput {
  return {
    harbor: { reward: input.reward ?? 1 },
    cell: {
      schemaVersion: 1,
      status: 'completed',
      promptHash: input.promptHash,
      tokenSummary: tokenSummary({ input: 4, output: 6, reasoning: 0, total: 10, costUsd: 0.01 }),
      toolSummary: {
        providerVisibleToolCount: 1,
        actualToolCalls: 1,
        actualToolNames: ['Bash'],
        actualToolCallCounts: { Bash: 1 },
      },
      steps: 1,
      durationMs: input.durationMs ?? 100,
      startedAt: 0,
      finishedAt: input.durationMs ?? 100,
      runtimeEventsPath: `/logs/${input.taskId}/runtime-events.jsonl`,
      runtimeRefs: {
        invocationId: `inv-${input.taskId}`,
        sessionId: `session-${input.taskId}`,
        runId: `run-${input.taskId}`,
        turnId: `turn-${input.taskId}`,
      },
    },
  };
}

function completed(taskId: string, passed: boolean): FixedPromptTaskCompletedEvent {
  return {
    schemaVersion: FIXED_PROMPT_WAL_SCHEMA_VERSION,
    type: 'task_completed',
    id: `event-${taskId}-${passed ? 'pass' : 'fail'}`,
    ts: 0,
    runId: 'run',
    roundId: 'round',
    taskId,
    status: 'completed',
    passed,
    scored: true,
    eligible: true,
    errorClass: passed ? undefined : 'verification_failed',
    promptHash: 'hash',
    tokenSummary: tokenSummary({ input: 1, output: 1, reasoning: 0, total: 2, costUsd: 0.01 }),
    steps: 1,
    durationMs: 100,
    runtimeEventsPath: `/logs/${taskId}/runtime-events.jsonl`,
    harbor: { reward: passed ? 1 : 0 },
  };
}

function idFactory(): () => string {
  let next = 0;
  return () => `id-${next++}`;
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'maka-prompt-ab-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
