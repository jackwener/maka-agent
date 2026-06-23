import type { Config } from './contracts.js';
import {
  runFixedPromptController,
  type FixedPromptTask,
  type FixedPromptTaskWalEvent,
  type HarborTaskRunner,
} from './fixed-prompt-controller.js';
import { assertPositiveInt } from './numeric-guards.js';
import {
  decidePromptAcceptance,
  promptAcceptanceNoiseBand,
  summarizePromptAcceptancePartition,
  type PromptAcceptanceResult,
} from './prompt-acceptance-policy.js';

export interface PromptAbConcurrencyCalibrationPlanInput {
  tasks: readonly FixedPromptTask[];
  taskDurationsMs?: Readonly<Record<string, number>>;
  samplesPerBucket?: number;
  concurrencyLevels?: readonly number[];
  repsPerLevel?: number;
}

export interface PromptAbConcurrencyCalibrationTrial {
  concurrency: number;
  rep: number;
  task: FixedPromptTask;
}

export interface PromptAbConcurrencyCalibrationPlan {
  sampleTasks: FixedPromptTask[];
  concurrencyLevels: number[];
  repsPerLevel: number;
  trials: PromptAbConcurrencyCalibrationTrial[];
}

export interface RunPromptAbConcurrencyCalibrationInput extends PromptAbConcurrencyCalibrationPlanInput {
  runId: string;
  config: Config;
  systemPromptPath: string;
  resultsJsonlPath: string;
  maxInfraFailureRate?: number;
  harborRunner: HarborTaskRunner;
  now?: () => number;
  newId?: () => string;
}

export interface PromptAbConcurrencyLevelSummary {
  concurrency: number;
  attempts: number;
  completed: number;
  infraFailed: number;
  plumbingFailed: number;
  totalCostUsd: number;
  meanDurationMs: number | null;
  maxDurationMs: number | null;
}

export interface PromptAbConcurrencyCalibrationResult {
  runId: string;
  sampleTaskIds: string[];
  levels: PromptAbConcurrencyLevelSummary[];
  recommendedConcurrency: number;
}

export interface SummarizePromptAbComparisonInput {
  runId: string;
  roundId: string;
  baselinePromptId: string;
  candidatePromptId: string;
  heldInTaskIds: readonly string[];
  heldOutTaskIds: readonly string[];
  baselineHeldInRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  baselineHeldOutRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  candidateHeldInRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  candidateHeldOutRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  heldInPassRateNoiseBand?: number;
  heldOutPassRateNoiseBand?: number;
}

export interface RunPromptAbComparisonInput {
  runId: string;
  config: Config;
  baselinePromptPath: string;
  candidatePromptPath: string;
  resultsJsonlPath: string;
  heldInTasks: readonly FixedPromptTask[];
  heldOutTasks: readonly FixedPromptTask[];
  reps?: number;
  maxConcurrency?: number;
  heldInPassRateNoiseBand?: number;
  heldOutPassRateNoiseBand?: number;
  harborRunner: HarborTaskRunner;
  now?: () => number;
  newId?: () => string;
}

export interface PromptAbPairedPartitionSummary {
  pairs: number;
  observedPairs: number;
  wins: number;
  losses: number;
  ties: number;
  winTaskIds: string[];
  lossTaskIds: string[];
  missingPairIds: string[];
}

export interface PromptAbComparisonSummary {
  runId: string;
  roundId: string;
  baselinePromptId: string;
  candidatePromptId: string;
  heldInReps: number;
  heldOutReps: number;
  heldInPassRateNoiseBand: number;
  heldOutPassRateNoiseBand: number;
  acceptance: PromptAcceptanceResult;
  paired: {
    heldIn: PromptAbPairedPartitionSummary;
    heldOut: PromptAbPairedPartitionSummary;
    overall: PromptAbPairedPartitionSummary;
  };
}

export function planPromptAbConcurrencyCalibration(
  input: PromptAbConcurrencyCalibrationPlanInput,
): PromptAbConcurrencyCalibrationPlan {
  const samplesPerBucket = input.samplesPerBucket ?? 2;
  const repsPerLevel = input.repsPerLevel ?? 1;
  assertPositiveInt('samplesPerBucket', samplesPerBucket);
  assertPositiveInt('repsPerLevel', repsPerLevel);
  const concurrencyLevels = [...(input.concurrencyLevels ?? [1, 2, 4, 8, 12, 16])];
  for (const level of concurrencyLevels) assertPositiveInt('concurrencyLevel', level);

  const sampleTasks = representativeTasks(input.tasks, input.taskDurationsMs ?? {}, samplesPerBucket);
  const trials: PromptAbConcurrencyCalibrationTrial[] = [];
  for (const concurrency of concurrencyLevels) {
    for (let rep = 0; rep < repsPerLevel; rep += 1) {
      for (const task of sampleTasks) {
        trials.push({ concurrency, rep, task });
      }
    }
  }

  return { sampleTasks, concurrencyLevels, repsPerLevel, trials };
}

export async function runPromptAbConcurrencyCalibration(
  input: RunPromptAbConcurrencyCalibrationInput,
): Promise<PromptAbConcurrencyCalibrationResult> {
  const maxInfraFailureRate = input.maxInfraFailureRate ?? 0;
  assertZeroToOne('maxInfraFailureRate', maxInfraFailureRate);
  const plan = planPromptAbConcurrencyCalibration(input);
  const levels: PromptAbConcurrencyLevelSummary[] = [];

  for (const concurrency of plan.concurrencyLevels) {
    const events: FixedPromptTaskWalEvent[] = [];
    for (let rep = 0; rep < plan.repsPerLevel; rep += 1) {
      const roundId = calibrationRoundId(concurrency, rep);
      const result = await runFixedPromptController({
        runId: input.runId,
        roundId,
        config: input.config,
        systemPromptPath: input.systemPromptPath,
        resultsJsonlPath: input.resultsJsonlPath,
        resultsTsvPath: `${input.resultsJsonlPath}.${roundId}.tsv`,
        tasks: plan.sampleTasks,
        maxConcurrency: concurrency,
        harborRunner: input.harborRunner,
        ...(input.now ? { now: input.now } : {}),
        ...(input.newId ? { newId: input.newId } : {}),
      });
      events.push(...result.events);
    }
    levels.push(summarizeConcurrencyLevel(concurrency, events));
  }

  const passing = levels.filter((level) => level.attempts > 0 && level.infraFailed / level.attempts <= maxInfraFailureRate);
  const recommendedConcurrency = passing.at(-1)?.concurrency ?? plan.concurrencyLevels[0] ?? 1;
  return {
    runId: input.runId,
    sampleTaskIds: plan.sampleTasks.map((task) => task.id),
    levels,
    recommendedConcurrency,
  };
}

export function summarizePromptAbComparison(input: SummarizePromptAbComparisonInput): PromptAbComparisonSummary {
  assertSameRunCount('held-in', input.baselineHeldInRuns, input.candidateHeldInRuns);
  assertSameRunCount('held-out', input.baselineHeldOutRuns, input.candidateHeldOutRuns);
  const baselineHeldIn = virtualizeRuns(input.baselineHeldInRuns);
  const baselineHeldOut = virtualizeRuns(input.baselineHeldOutRuns);
  const candidateHeldIn = virtualizeRuns(input.candidateHeldInRuns);
  const candidateHeldOut = virtualizeRuns(input.candidateHeldOutRuns);
  const virtualHeldInTaskIds = virtualTaskIds(input.heldInTaskIds, input.baselineHeldInRuns.length);
  const virtualHeldOutTaskIds = virtualTaskIds(input.heldOutTaskIds, input.baselineHeldOutRuns.length);
  const baselineHeldInSummary = summarizePromptAcceptancePartition(baselineHeldIn, virtualHeldInTaskIds);
  const baselineHeldOutSummary = summarizePromptAcceptancePartition(baselineHeldOut, virtualHeldOutTaskIds);
  const heldInPassRateNoiseBand = input.heldInPassRateNoiseBand ?? promptAcceptanceNoiseBand({
    sampleSize: baselineHeldInSummary.eligible,
    passRate: baselineHeldInSummary.passEligibleRate,
    baselineRunCount: 1,
  });
  const heldOutPassRateNoiseBand = input.heldOutPassRateNoiseBand ?? promptAcceptanceNoiseBand({
    sampleSize: baselineHeldOutSummary.eligible,
    passRate: baselineHeldOutSummary.passEligibleRate,
    baselineRunCount: 1,
  });
  const acceptance = decidePromptAcceptance({
    runId: input.runId,
    roundId: input.roundId,
    candidateCommitSha: input.candidatePromptId,
    previousLastKeptCommitSha: input.baselinePromptId,
    originalCommitSha: input.baselinePromptId,
    heldInTaskIds: virtualHeldInTaskIds,
    heldOutTaskIds: virtualHeldOutTaskIds,
    previousHeldInReferencePassEligibleRate: baselineHeldInSummary.passEligibleRate,
    originalHeldOutPassEligibleRate: baselineHeldOutSummary.passEligibleRate,
    heldInPassRateNoiseBand,
    heldOutPassRateNoiseBand,
    originalEvents: baselineHeldOut,
    lastKeptEvents: baselineHeldIn,
    candidateEvents: [...candidateHeldIn, ...candidateHeldOut],
    rewardHackScan: { decision: 'clean' },
  });
  const heldIn = pairedPartitionSummary(input.baselineHeldInRuns, input.candidateHeldInRuns, input.heldInTaskIds);
  const heldOut = pairedPartitionSummary(input.baselineHeldOutRuns, input.candidateHeldOutRuns, input.heldOutTaskIds);
  return {
    runId: input.runId,
    roundId: input.roundId,
    baselinePromptId: input.baselinePromptId,
    candidatePromptId: input.candidatePromptId,
    heldInReps: input.baselineHeldInRuns.length,
    heldOutReps: input.baselineHeldOutRuns.length,
    heldInPassRateNoiseBand,
    heldOutPassRateNoiseBand,
    acceptance,
    paired: {
      heldIn,
      heldOut,
      overall: combinePairedSummaries(heldIn, heldOut),
    },
  };
}

export async function runPromptAbComparison(input: RunPromptAbComparisonInput): Promise<PromptAbComparisonSummary> {
  const reps = input.reps ?? 3;
  assertPositiveInt('reps', reps);
  if (input.maxConcurrency !== undefined) assertPositiveInt('maxConcurrency', input.maxConcurrency);
  const baselineHeldInRuns: FixedPromptTaskWalEvent[][] = [];
  const baselineHeldOutRuns: FixedPromptTaskWalEvent[][] = [];
  const candidateHeldInRuns: FixedPromptTaskWalEvent[][] = [];
  const candidateHeldOutRuns: FixedPromptTaskWalEvent[][] = [];
  for (let rep = 0; rep < reps; rep += 1) {
    baselineHeldInRuns.push(await runComparisonPartition({
      ...input,
      promptPath: input.baselinePromptPath,
      promptLabel: 'baseline',
      partitionLabel: 'held-in',
      tasks: input.heldInTasks,
      rep,
    }));
    baselineHeldOutRuns.push(await runComparisonPartition({
      ...input,
      promptPath: input.baselinePromptPath,
      promptLabel: 'baseline',
      partitionLabel: 'held-out',
      tasks: input.heldOutTasks,
      rep,
    }));
    candidateHeldInRuns.push(await runComparisonPartition({
      ...input,
      promptPath: input.candidatePromptPath,
      promptLabel: 'candidate',
      partitionLabel: 'held-in',
      tasks: input.heldInTasks,
      rep,
    }));
    candidateHeldOutRuns.push(await runComparisonPartition({
      ...input,
      promptPath: input.candidatePromptPath,
      promptLabel: 'candidate',
      partitionLabel: 'held-out',
      tasks: input.heldOutTasks,
      rep,
    }));
  }

  return summarizePromptAbComparison({
    runId: input.runId,
    roundId: 'ab-summary',
    baselinePromptId: 'maka-baseline',
    candidatePromptId: 'opencode-default',
    heldInTaskIds: input.heldInTasks.map((task) => task.id),
    heldOutTaskIds: input.heldOutTasks.map((task) => task.id),
    baselineHeldInRuns,
    baselineHeldOutRuns,
    candidateHeldInRuns,
    candidateHeldOutRuns,
    ...(input.heldInPassRateNoiseBand !== undefined ? { heldInPassRateNoiseBand: input.heldInPassRateNoiseBand } : {}),
    ...(input.heldOutPassRateNoiseBand !== undefined ? { heldOutPassRateNoiseBand: input.heldOutPassRateNoiseBand } : {}),
  });
}

export function renderPromptAbComparisonMarkdown(summary: PromptAbComparisonSummary): string {
  const lines = [
    '# Prompt A/B Comparison',
    '',
    `- baseline: ${summary.baselinePromptId}`,
    `- candidate: ${summary.candidatePromptId}`,
    `- reps: held-in=${summary.heldInReps}, held-out=${summary.heldOutReps}`,
    `- decision: ${summary.acceptance.decision} (${summary.acceptance.reason})`,
    `- held-in pass_eligible_rate: baseline=${rate(summary.acceptance.metrics.lastKept.heldIn.passEligibleRate)}, candidate=${rate(summary.acceptance.metrics.candidate.heldIn.passEligibleRate)}, noise=${rate(summary.heldInPassRateNoiseBand)}`,
    `- held-out pass_eligible_rate: baseline=${rate(summary.acceptance.metrics.original.heldOut.passEligibleRate)}, candidate=${rate(summary.acceptance.metrics.candidate.heldOut.passEligibleRate)}, noise=${rate(summary.heldOutPassRateNoiseBand)}`,
    `- paired held-in: ${pairedLine(summary.paired.heldIn)}`,
    `- paired held-out: ${pairedLine(summary.paired.heldOut)}`,
    `- paired overall: ${pairedLine(summary.paired.overall)}`,
    '',
  ];
  if (summary.paired.overall.lossTaskIds.length > 0) {
    lines.push('## losses', '', ...summary.paired.overall.lossTaskIds.map((taskId) => `- ${taskId}`), '');
  }
  if (summary.paired.overall.missingPairIds.length > 0) {
    lines.push('## missing pairs', '', ...summary.paired.overall.missingPairIds.map((taskId) => `- ${taskId}`), '');
  }
  return `${lines.join('\n')}\n`;
}

function representativeTasks(
  tasks: readonly FixedPromptTask[],
  taskDurationsMs: Readonly<Record<string, number>>,
  samplesPerBucket: number,
): FixedPromptTask[] {
  const sorted = [...tasks].sort((a, b) => {
    const durationDelta = durationFor(a, taskDurationsMs) - durationFor(b, taskDurationsMs);
    return durationDelta === 0 ? a.id.localeCompare(b.id) : durationDelta;
  });
  const buckets: FixedPromptTask[][] = [[], [], []];
  sorted.forEach((task, index) => {
    const bucket = Math.min(2, Math.floor(index * 3 / Math.max(1, sorted.length)));
    buckets[bucket]!.push(task);
  });

  const selected = new Map<string, FixedPromptTask>();
  for (const bucket of buckets) {
    for (const task of bucket.slice(0, samplesPerBucket)) {
      selected.set(task.id, task);
    }
  }
  return [...selected.values()];
}

function durationFor(task: FixedPromptTask, taskDurationsMs: Readonly<Record<string, number>>): number {
  const duration = taskDurationsMs[task.id];
  return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
    ? duration
    : Number.MAX_SAFE_INTEGER;
}

function calibrationRoundId(concurrency: number, rep: number): string {
  return `calibration-c${concurrency}-r${rep}`;
}

function summarizeConcurrencyLevel(
  concurrency: number,
  events: readonly FixedPromptTaskWalEvent[],
): PromptAbConcurrencyLevelSummary {
  const timed = events.filter((event) => event.type !== 'task_infra_failed');
  const durations = timed.map((event) => event.durationMs);
  return {
    concurrency,
    attempts: events.length,
    completed: events.filter((event) => event.type === 'task_completed').length,
    infraFailed: events.filter((event) => event.type === 'task_infra_failed').length,
    plumbingFailed: events.filter((event) => event.type === 'task_plumbing_failed').length,
    totalCostUsd: sum(timed.map((event) => event.tokenSummary.costUsd)),
    meanDurationMs: durations.length > 0 ? sum(durations) / durations.length : null,
    maxDurationMs: durations.length > 0 ? Math.max(...durations) : null,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function assertZeroToOne(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number in [0, 1] (got ${String(value)})`);
  }
  return value;
}

function assertSameRunCount(
  partitionName: string,
  baselineRuns: readonly unknown[],
  candidateRuns: readonly unknown[],
): void {
  if (baselineRuns.length !== candidateRuns.length) {
    throw new Error(`${partitionName} baseline and candidate runs must have the same rep count`);
  }
}

async function runComparisonPartition(
  input: RunPromptAbComparisonInput & {
    promptPath: string;
    promptLabel: string;
    partitionLabel: string;
    tasks: readonly FixedPromptTask[];
    rep: number;
  },
): Promise<FixedPromptTaskWalEvent[]> {
  const roundId = `ab-${input.promptLabel}-${input.partitionLabel}-r${input.rep}`;
  const result = await runFixedPromptController({
    runId: input.runId,
    roundId,
    config: input.config,
    systemPromptPath: input.promptPath,
    resultsJsonlPath: input.resultsJsonlPath,
    resultsTsvPath: `${input.resultsJsonlPath}.${roundId}.tsv`,
    tasks: input.tasks,
    harborRunner: input.harborRunner,
    ...(input.maxConcurrency !== undefined ? { maxConcurrency: input.maxConcurrency } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.newId ? { newId: input.newId } : {}),
  });
  return result.events;
}

function virtualizeRuns(runs: readonly (readonly FixedPromptTaskWalEvent[])[]): FixedPromptTaskWalEvent[] {
  return runs.flatMap((events, rep) => events.map((event) => ({
    ...event,
    taskId: virtualTaskId(event.taskId, rep),
    roundId: `${event.roundId}-r${rep}`,
  })));
}

function pairedLine(summary: PromptAbPairedPartitionSummary): string {
  return [
    `wins=${summary.wins}`,
    `losses=${summary.losses}`,
    `ties=${summary.ties}`,
    `missing=${summary.missingPairIds.length}`,
  ].join(', ');
}

function rate(value: number | null): string {
  if (value === null) return 'null';
  return String(Math.round(value * 10_000) / 10_000);
}

function virtualTaskIds(taskIds: readonly string[], reps: number): string[] {
  const ids: string[] = [];
  for (let rep = 0; rep < reps; rep += 1) {
    for (const taskId of taskIds) ids.push(virtualTaskId(taskId, rep));
  }
  return ids;
}

function virtualTaskId(taskId: string, rep: number): string {
  return `${taskId}#r${rep}`;
}

function pairedPartitionSummary(
  baselineRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  candidateRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  taskIds: readonly string[],
): PromptAbPairedPartitionSummary {
  const winTaskIds: string[] = [];
  const lossTaskIds: string[] = [];
  const missingPairIds: string[] = [];
  let observedPairs = 0;
  let ties = 0;
  for (let rep = 0; rep < baselineRuns.length; rep += 1) {
    const baselineByTask = new Map((baselineRuns[rep] ?? []).map((event) => [event.taskId, event]));
    const candidateByTask = new Map((candidateRuns[rep] ?? []).map((event) => [event.taskId, event]));
    for (const taskId of taskIds) {
      const pairId = virtualTaskId(taskId, rep);
      const baseline = baselineByTask.get(taskId);
      const candidate = candidateByTask.get(taskId);
      if (!baseline || !candidate) {
        missingPairIds.push(pairId);
        continue;
      }
      observedPairs += 1;
      if (candidate.passed === baseline.passed) {
        ties += 1;
      } else if (candidate.passed) {
        winTaskIds.push(pairId);
      } else {
        lossTaskIds.push(pairId);
      }
    }
  }
  return {
    pairs: taskIds.length * baselineRuns.length,
    observedPairs,
    wins: winTaskIds.length,
    losses: lossTaskIds.length,
    ties,
    winTaskIds,
    lossTaskIds,
    missingPairIds,
  };
}

function combinePairedSummaries(
  heldIn: PromptAbPairedPartitionSummary,
  heldOut: PromptAbPairedPartitionSummary,
): PromptAbPairedPartitionSummary {
  return {
    pairs: heldIn.pairs + heldOut.pairs,
    observedPairs: heldIn.observedPairs + heldOut.observedPairs,
    wins: heldIn.wins + heldOut.wins,
    losses: heldIn.losses + heldOut.losses,
    ties: heldIn.ties + heldOut.ties,
    winTaskIds: [...heldIn.winTaskIds, ...heldOut.winTaskIds],
    lossTaskIds: [...heldIn.lossTaskIds, ...heldOut.lossTaskIds],
    missingPairIds: [...heldIn.missingPairIds, ...heldOut.missingPairIds],
  };
}
