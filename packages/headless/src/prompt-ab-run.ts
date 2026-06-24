import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Config } from './contracts.js';
import {
  runFixedPromptController,
  type FixedPromptTask,
  type FixedPromptTaskWalEvent,
  type HarborTaskRunner,
} from './fixed-prompt-controller.js';
import { assertPositiveInt } from './numeric-guards.js';

export interface SummarizePromptAbComparisonInput {
  runId: string;
  roundId: string;
  baselinePromptId: string;
  candidatePromptId: string;
  evaluationTaskIds: readonly string[];
  baselineRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  candidateRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  budgetMs?: number;
}

export interface RunPromptAbComparisonInput {
  runId: string;
  config: Config;
  baselinePromptPath: string;
  candidatePromptPath: string;
  candidatePromptId?: string;
  resultsJsonlPath: string;
  evaluationTasks: readonly FixedPromptTask[];
  reps?: number;
  maxConcurrency?: number;
  resumeFingerprint?: string;
  budgetMs?: number;
  harborRunner: HarborTaskRunner;
  now?: () => number;
  newId?: () => string;
}

export type PromptAbDecision =
  | 'candidate_better'
  | 'baseline_better'
  | 'inconclusive';

export interface PromptAbArmSummary {
  attempts: number;
  observed: number;
  valid: number;
  passed: number;
  passRate: number | null;
  completed: number;
  budgetExhausted: number;
  infraFailed: number;
  plumbingFailed: number;
  missing: number;
  coverageRate: number;
  totalCostUsd: number;
  meanDurationMs: number | null;
}

export interface PromptAbTaskArmSummary {
  observed: number;
  valid: number;
  passed: number;
  passRate: number | null;
  completed: number;
  budgetExhausted: number;
  infraFailed: number;
  plumbingFailed: number;
  missing: number;
}

export interface PromptAbTaskComparison {
  taskId: string;
  baseline: PromptAbTaskArmSummary;
  candidate: PromptAbTaskArmSummary;
  passRateDelta: number | null;
  outcome: 'candidate_win' | 'baseline_win' | 'tie' | 'missing';
}

export interface PromptAbTaskLevelSummary {
  comparableTasks: number;
  wins: number;
  losses: number;
  ties: number;
  signTestNonTieTasks: number;
  signTestPValue: number | null;
  missingTaskIds: string[];
  meanPassRateDelta: number | null;
  medianPassRateDelta: number | null;
  tasks: PromptAbTaskComparison[];
}

export interface PromptAbAttemptPairSummary {
  pairs: number;
  observedPairs: number;
  wins: number;
  losses: number;
  ties: number;
  missingPairIds: string[];
  budgetDiscordantPairIds: string[];
  infraOrPlumbingDiscordantPairIds: string[];
}

export interface PromptAbComparisonSummary {
  runId: string;
  roundId: string;
  baselinePromptId: string;
  candidatePromptId: string;
  taskCount: number;
  reps: number;
  budgetMs?: number;
  decision: PromptAbDecision;
  reason: string;
  baseline: PromptAbArmSummary;
  candidate: PromptAbArmSummary;
  taskLevel: PromptAbTaskLevelSummary;
  pairedAttempts: PromptAbAttemptPairSummary;
}

export interface PromptAbMetadataFilterInput {
  tasks: readonly FixedPromptTask[];
  maxExpertTimeEstimateMin?: number;
}

export interface PromptAbMetadataFilterResult {
  maxExpertTimeEstimateMin: number;
  candidateTaskCount: number;
  selectedTaskIds: string[];
  selectedTasks: FixedPromptTask[];
  rejected: {
    longExpertEstimateTaskIds: string[];
    missingExpertEstimateTaskIds: string[];
  };
}

export interface PromptAbCandidateTaskLimitResult {
  limit: number | null;
  inputTaskCount: number;
  selectedTaskIds: string[];
  selectedTasks: FixedPromptTask[];
  truncatedTaskIds: string[];
}

export interface PromptAbRunManifestInput {
  baselinePromptHash: string;
  candidatePromptHash: string;
  provider: string;
  baseUrl: string;
  model: string;
  taskBudgetSec: number;
  harborTimeoutMs: number;
  subjectFingerprint: string;
  taskSourceFingerprint: string;
  evaluationTaskIds: readonly string[];
  reps: number;
  candidateLimit: number | null;
  maxConcurrency: number;
  selectionMode?: 'explicit' | 'metadata';
  candidateTaskIds?: readonly string[];
  maxExpertTimeEstimateMin?: number | null;
  targetEvaluationTaskCount?: number | null;
}

export type PromptAbRunManifest = PromptAbRunManifestInput & {
  schemaVersion: 'maka.prompt_ab.run_manifest.v1';
  fingerprint: string;
  evaluationTaskIds: string[];
  candidateTaskIds?: string[];
};

export function filterPromptAbCandidateTasksByMetadata(
  input: PromptAbMetadataFilterInput,
): PromptAbMetadataFilterResult {
  const maxExpertTimeEstimateMin = input.maxExpertTimeEstimateMin ?? 30;
  if (!Number.isFinite(maxExpertTimeEstimateMin) || maxExpertTimeEstimateMin <= 0) {
    throw new Error(`maxExpertTimeEstimateMin must be positive (got ${String(maxExpertTimeEstimateMin)})`);
  }
  const selectedTasks: FixedPromptTask[] = [];
  const longExpertEstimateTaskIds: string[] = [];
  const missingExpertEstimateTaskIds: string[] = [];
  for (const task of input.tasks) {
    const expertTimeEstimateMin = task.metadata?.expertTimeEstimateMin;
    if (expertTimeEstimateMin === undefined) {
      missingExpertEstimateTaskIds.push(task.id);
    } else if (expertTimeEstimateMin > maxExpertTimeEstimateMin) {
      longExpertEstimateTaskIds.push(task.id);
    } else {
      selectedTasks.push(task);
    }
  }
  return {
    maxExpertTimeEstimateMin,
    candidateTaskCount: input.tasks.length,
    selectedTaskIds: selectedTasks.map((task) => task.id),
    selectedTasks,
    rejected: {
      longExpertEstimateTaskIds,
      missingExpertEstimateTaskIds,
    },
  };
}

export function limitPromptAbCandidateTasks(
  tasks: readonly FixedPromptTask[],
  limit: number | undefined,
): PromptAbCandidateTaskLimitResult {
  const selectedTasks = limit === undefined ? [...tasks] : tasks.slice(0, limit);
  return {
    limit: limit ?? null,
    inputTaskCount: tasks.length,
    selectedTaskIds: selectedTasks.map((task) => task.id),
    selectedTasks,
    truncatedTaskIds: tasks.slice(selectedTasks.length).map((task) => task.id),
  };
}

export function buildPromptAbRunManifest(input: PromptAbRunManifestInput): PromptAbRunManifest {
  const manifestWithoutFingerprint = withoutUndefined({
    schemaVersion: 'maka.prompt_ab.run_manifest.v1' as const,
    baselinePromptHash: input.baselinePromptHash,
    candidatePromptHash: input.candidatePromptHash,
    provider: input.provider,
    baseUrl: input.baseUrl,
    model: input.model,
    taskBudgetSec: input.taskBudgetSec,
    harborTimeoutMs: input.harborTimeoutMs,
    subjectFingerprint: input.subjectFingerprint,
    taskSourceFingerprint: input.taskSourceFingerprint,
    evaluationTaskIds: [...input.evaluationTaskIds],
    reps: input.reps,
    candidateLimit: input.candidateLimit,
    maxConcurrency: input.maxConcurrency,
    selectionMode: input.selectionMode,
    candidateTaskIds: input.candidateTaskIds ? [...input.candidateTaskIds] : undefined,
    maxExpertTimeEstimateMin: input.maxExpertTimeEstimateMin,
    targetEvaluationTaskCount: input.targetEvaluationTaskCount,
  });
  return {
    ...manifestWithoutFingerprint,
    fingerprint: `sha256:${createHash('sha256').update(canonicalJson(manifestWithoutFingerprint)).digest('hex')}`,
  };
}

export async function ensurePromptAbRunManifest(
  path: string,
  manifest: PromptAbRunManifest,
): Promise<PromptAbRunManifest> {
  let raw: string | undefined;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (raw === undefined) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }
  const existing = JSON.parse(raw) as PromptAbRunManifest;
  if (existing.fingerprint !== manifest.fingerprint) {
    throw new Error(
      `prompt A/B run manifest does not match existing run id: existing ${existing.fingerprint ?? 'missing'}, current ${manifest.fingerprint}. Use a new MAKA_PROMPT_AB_RUN_ID or restore the original run config.`,
    );
  }
  return existing;
}

export function summarizePromptAbComparison(input: SummarizePromptAbComparisonInput): PromptAbComparisonSummary {
  assertSameRunCount(input.baselineRuns, input.candidateRuns);
  const reps = input.baselineRuns.length;
  const taskIds = [...input.evaluationTaskIds];
  const baseline = summarizeArm(input.baselineRuns, taskIds, reps);
  const candidate = summarizeArm(input.candidateRuns, taskIds, reps);
  const taskLevel = summarizeTasks(input.baselineRuns, input.candidateRuns, taskIds, reps);
  const pairedAttempts = summarizeAttemptPairs(input.baselineRuns, input.candidateRuns, taskIds);
  const { decision, reason } = decide(taskLevel, baseline, candidate, pairedAttempts);

  return {
    runId: input.runId,
    roundId: input.roundId,
    baselinePromptId: input.baselinePromptId,
    candidatePromptId: input.candidatePromptId,
    taskCount: taskIds.length,
    reps,
    ...(input.budgetMs !== undefined ? { budgetMs: input.budgetMs } : {}),
    decision,
    reason,
    baseline,
    candidate,
    taskLevel,
    pairedAttempts,
  };
}

export async function runPromptAbComparison(input: RunPromptAbComparisonInput): Promise<PromptAbComparisonSummary> {
  const reps = input.reps ?? 3;
  assertPositiveInt('reps', reps);
  const maxConcurrency = input.maxConcurrency !== undefined ? assertPositiveInt('maxConcurrency', input.maxConcurrency) : 1;
  const baselineRuns: FixedPromptTaskWalEvent[][] = Array.from({ length: reps }, () => []);
  const candidateRuns: FixedPromptTaskWalEvent[][] = Array.from({ length: reps }, () => []);
  const pairs: { rep: number; taskIndex: number; task: FixedPromptTask }[] = [];
  for (let rep = 0; rep < reps; rep += 1) {
    input.evaluationTasks.forEach((task, taskIndex) => pairs.push({ rep, taskIndex, task }));
  }

  let nextPairIndex = 0;
  const active = new Map<number, Promise<{
    pairIndex: number;
    rep: number;
    baseline: FixedPromptTaskWalEvent;
    candidate: FixedPromptTaskWalEvent;
  }>>();
  const launchReadyPairs = () => {
    while (active.size < maxConcurrency && nextPairIndex < pairs.length) {
      const pairIndex = nextPairIndex;
      const pair = pairs[nextPairIndex++]!;
      active.set(pairIndex, runComparisonPair(input, pair).then((result) => ({ pairIndex, ...result })));
    }
  };

  launchReadyPairs();
  while (active.size > 0) {
    const result = await Promise.race(active.values());
    active.delete(result.pairIndex);
    baselineRuns[result.rep]!.push(result.baseline);
    candidateRuns[result.rep]!.push(result.candidate);
    launchReadyPairs();
  }
  const taskOrder = new Map(input.evaluationTasks.map((task, index) => [task.id, index]));
  for (const run of [...baselineRuns, ...candidateRuns]) {
    run.sort((a, b) => (taskOrder.get(a.taskId) ?? 0) - (taskOrder.get(b.taskId) ?? 0));
  }

  return summarizePromptAbComparison({
    runId: input.runId,
    roundId: 'ab-summary',
    baselinePromptId: 'maka-baseline',
    candidatePromptId: input.candidatePromptId ?? 'candidate',
    evaluationTaskIds: input.evaluationTasks.map((task) => task.id),
    baselineRuns,
    candidateRuns,
    ...(input.budgetMs !== undefined ? { budgetMs: input.budgetMs } : {}),
  });
}

export function renderPromptAbComparisonMarkdown(summary: PromptAbComparisonSummary): string {
  const lines = [
    '# Prompt A/B Comparison',
    '',
    `- Baseline A: ${summary.baselinePromptId}`,
    `- Candidate B: ${summary.candidatePromptId}`,
    `- Evaluation tasks: ${summary.taskCount}`,
    `- Reps: ${summary.reps}`,
    `- Decision: ${decisionLabel(summary.decision)} (${summary.reason})`,
    `- Budget: ${summary.budgetMs !== undefined ? `${Math.round(summary.budgetMs / 1000)}s task budget` : 'not recorded'}`,
    `- Evaluation pass rate: A=${summary.baseline.passed}/${summary.baseline.valid} = ${rate(summary.baseline.passRate)}, B=${summary.candidate.passed}/${summary.candidate.valid} = ${rate(summary.candidate.passRate)}`,
    `- Task-level delta: mean=${rate(summary.taskLevel.meanPassRateDelta)}, median=${rate(summary.taskLevel.medianPassRateDelta)}, wins=${summary.taskLevel.wins}, losses=${summary.taskLevel.losses}, ties=${summary.taskLevel.ties}, sign_test_p=${rate(summary.taskLevel.signTestPValue)}, missing=${summary.taskLevel.missingTaskIds.length}`,
    `- Attempt-pair auxiliary: wins=${summary.pairedAttempts.wins}, losses=${summary.pairedAttempts.losses}, ties=${summary.pairedAttempts.ties}, missing=${summary.pairedAttempts.missingPairIds.length}`,
    `- Budget outcomes: A timed_out=${summary.baseline.budgetExhausted}, B timed_out=${summary.candidate.budgetExhausted}`,
    `- Infra outcomes: A infra_failed=${summary.baseline.infraFailed}, B infra_failed=${summary.candidate.infraFailed}; A plumbing_failed=${summary.baseline.plumbingFailed}, B plumbing_failed=${summary.candidate.plumbingFailed}`,
    '',
    '## Limitation',
    '',
    'This result is scoped to the recorded task budget. Timeouts are budget outcomes, not infrastructure failures; improvements that only appear with longer trajectories require a separate long-task sensitivity slice.',
    '',
  ];
  if (summary.taskLevel.missingTaskIds.length > 0) {
    lines.push('## Missing Tasks', '', ...summary.taskLevel.missingTaskIds.map((taskId) => `- ${taskId}`), '');
  }
  const losses = summary.taskLevel.tasks.filter((task) => task.outcome === 'baseline_win');
  if (losses.length > 0) {
    lines.push('## B Losses', '', ...losses.map((task) => `- ${task.taskId}: delta=${rate(task.passRateDelta)}`), '');
  }
  return `${lines.join('\n')}\n`;
}

function summarizeArm(
  runs: readonly (readonly FixedPromptTaskWalEvent[])[],
  taskIds: readonly string[],
  reps: number,
): PromptAbArmSummary {
  const attempts = taskIds.length * reps;
  const events = taskIds.flatMap((taskId) => runs.map((run) => run.find((event) => event.taskId === taskId)));
  const observed = events.filter((event): event is FixedPromptTaskWalEvent => event !== undefined);
  const valid = observed.filter(isValidBudgetedOutcome);
  const passed = valid.filter((event) => event.passed).length;
  const durations = valid
    .filter((event) => event.type !== 'task_budget_exhausted')
    .map((event) => event.durationMs);
  return {
    attempts,
    observed: observed.length,
    valid: valid.length,
    passed,
    passRate: valid.length > 0 ? passed / valid.length : null,
    completed: observed.filter((event) => event.type === 'task_completed').length,
    budgetExhausted: observed.filter((event) => event.type === 'task_budget_exhausted').length,
    infraFailed: observed.filter((event) => event.type === 'task_infra_failed').length,
    plumbingFailed: observed.filter((event) => event.type === 'task_plumbing_failed').length,
    missing: attempts - observed.length,
    coverageRate: attempts > 0 ? valid.length / attempts : 1,
    totalCostUsd: sum(valid.filter((event) => event.type !== 'task_budget_exhausted').map((event) => event.tokenSummary.costUsd)),
    meanDurationMs: durations.length > 0 ? sum(durations) / durations.length : null,
  };
}

function summarizeTasks(
  baselineRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  candidateRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  taskIds: readonly string[],
  reps: number,
): PromptAbTaskLevelSummary {
  const tasks = taskIds.map((taskId) => summarizeTask(taskId, baselineRuns, candidateRuns, reps));
  const comparable = tasks.filter((task) => task.passRateDelta !== null);
  const deltas = comparable.map((task) => task.passRateDelta as number);
  const wins = comparable.filter((task) => task.outcome === 'candidate_win').length;
  const losses = comparable.filter((task) => task.outcome === 'baseline_win').length;
  const ties = comparable.filter((task) => task.outcome === 'tie').length;
  const signTestNonTieTasks = wins + losses;
  return {
    comparableTasks: comparable.length,
    wins,
    losses,
    ties,
    signTestNonTieTasks,
    signTestPValue: signTestNonTieTasks > 0 ? exactTwoSidedSignTestPValue(signTestNonTieTasks, Math.max(wins, losses)) : null,
    missingTaskIds: tasks.filter((task) => task.outcome === 'missing').map((task) => task.taskId),
    meanPassRateDelta: deltas.length > 0 ? sum(deltas) / deltas.length : null,
    medianPassRateDelta: median(deltas),
    tasks,
  };
}

function summarizeTask(
  taskId: string,
  baselineRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  candidateRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  reps: number,
): PromptAbTaskComparison {
  const baseline = summarizeTaskArm(taskId, baselineRuns, reps);
  const candidate = summarizeTaskArm(taskId, candidateRuns, reps);
  const passRateDelta = baseline.passRate !== null && candidate.passRate !== null
    ? candidate.passRate - baseline.passRate
    : null;
  let outcome: PromptAbTaskComparison['outcome'] = 'missing';
  if (passRateDelta !== null) {
    outcome = passRateDelta > 0 ? 'candidate_win' : passRateDelta < 0 ? 'baseline_win' : 'tie';
  }
  return { taskId, baseline, candidate, passRateDelta, outcome };
}

function summarizeTaskArm(
  taskId: string,
  runs: readonly (readonly FixedPromptTaskWalEvent[])[],
  reps: number,
): PromptAbTaskArmSummary {
  const observed = runs
    .map((run) => run.find((event) => event.taskId === taskId))
    .filter((event): event is FixedPromptTaskWalEvent => event !== undefined);
  const valid = observed.filter(isValidBudgetedOutcome);
  const passed = valid.filter((event) => event.passed).length;
  return {
    observed: observed.length,
    valid: valid.length,
    passed,
    passRate: valid.length > 0 ? passed / valid.length : null,
    completed: observed.filter((event) => event.type === 'task_completed').length,
    budgetExhausted: observed.filter((event) => event.type === 'task_budget_exhausted').length,
    infraFailed: observed.filter((event) => event.type === 'task_infra_failed').length,
    plumbingFailed: observed.filter((event) => event.type === 'task_plumbing_failed').length,
    missing: reps - observed.length,
  };
}

function summarizeAttemptPairs(
  baselineRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  candidateRuns: readonly (readonly FixedPromptTaskWalEvent[])[],
  taskIds: readonly string[],
): PromptAbAttemptPairSummary {
  const missingPairIds: string[] = [];
  const budgetDiscordantPairIds: string[] = [];
  const infraOrPlumbingDiscordantPairIds: string[] = [];
  let observedPairs = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (let rep = 0; rep < baselineRuns.length; rep += 1) {
    const baselineByTask = new Map((baselineRuns[rep] ?? []).map((event) => [event.taskId, event]));
    const candidateByTask = new Map((candidateRuns[rep] ?? []).map((event) => [event.taskId, event]));
    for (const taskId of taskIds) {
      const pairId = `${taskId}#r${rep}`;
      const baseline = baselineByTask.get(taskId);
      const candidate = candidateByTask.get(taskId);
      if (!baseline || !candidate) {
        missingPairIds.push(pairId);
        continue;
      }
      if (isBudgetExhaustedOutcome(baseline) !== isBudgetExhaustedOutcome(candidate)) {
        budgetDiscordantPairIds.push(pairId);
      }
      if (isInfraOrPlumbingOutcome(baseline) !== isInfraOrPlumbingOutcome(candidate)) {
        infraOrPlumbingDiscordantPairIds.push(pairId);
      }
      if (!isValidBudgetedOutcome(baseline) || !isValidBudgetedOutcome(candidate)) {
        missingPairIds.push(pairId);
        continue;
      }
      observedPairs += 1;
      if (candidate.passed === baseline.passed) {
        ties += 1;
      } else if (candidate.passed) {
        wins += 1;
      } else {
        losses += 1;
      }
    }
  }
  return {
    pairs: taskIds.length * baselineRuns.length,
    observedPairs,
    wins,
    losses,
    ties,
    missingPairIds,
    budgetDiscordantPairIds,
    infraOrPlumbingDiscordantPairIds,
  };
}

function decide(
  taskLevel: PromptAbTaskLevelSummary,
  baseline: PromptAbArmSummary,
  candidate: PromptAbArmSummary,
  pairedAttempts: PromptAbAttemptPairSummary,
): { decision: PromptAbDecision; reason: string } {
  const coverage = Math.min(baseline.coverageRate, candidate.coverageRate);
  if (coverage < 0.9) return { decision: 'inconclusive', reason: 'low_effective_coverage' };
  if (pairedAttempts.budgetDiscordantPairIds.length > 0) {
    return { decision: 'inconclusive', reason: 'asymmetric_budget_exhaustion' };
  }
  if (pairedAttempts.infraOrPlumbingDiscordantPairIds.length > 0) {
    return { decision: 'inconclusive', reason: 'asymmetric_infra_or_plumbing' };
  }
  const meanDelta = taskLevel.meanPassRateDelta ?? 0;
  if (taskLevel.signTestPValue === null || taskLevel.signTestPValue > 0.05) {
    return { decision: 'inconclusive', reason: 'sign_test_not_significant' };
  }
  if (taskLevel.wins > taskLevel.losses && meanDelta > 0) {
    return { decision: 'candidate_better', reason: 'task_level_sign_test_p<=0.05' };
  }
  if (taskLevel.losses > taskLevel.wins && meanDelta < 0) {
    return { decision: 'baseline_better', reason: 'task_level_sign_test_p<=0.05' };
  }
  return { decision: 'inconclusive', reason: 'sign_test_direction_mismatch' };
}

async function runComparisonPair(
  input: RunPromptAbComparisonInput,
  pair: { rep: number; taskIndex: number; task: FixedPromptTask },
): Promise<{ rep: number; baseline: FixedPromptTaskWalEvent; candidate: FixedPromptTaskWalEvent }> {
  let baseline: FixedPromptTaskWalEvent | undefined;
  let candidate: FixedPromptTaskWalEvent | undefined;
  const runBaseline = async () => {
    baseline = await runComparisonTaskArm({
      input,
      task: pair.task,
      promptPath: input.baselinePromptPath,
      promptLabel: 'baseline',
      rep: pair.rep,
    });
  };
  const runCandidate = async () => {
    candidate = await runComparisonTaskArm({
      input,
      task: pair.task,
      promptPath: input.candidatePromptPath,
      promptLabel: 'candidate',
      rep: pair.rep,
    });
  };
  if ((pair.rep + pair.taskIndex) % 2 === 0) {
    await runBaseline();
    await runCandidate();
  } else {
    await runCandidate();
    await runBaseline();
  }
  if (!baseline || !candidate) throw new Error(`prompt A/B pair did not produce both arms for ${pair.task.id} rep ${pair.rep}`);
  return { rep: pair.rep, baseline, candidate };
}

async function runComparisonTaskArm(input: {
  input: RunPromptAbComparisonInput;
  task: FixedPromptTask;
  promptPath: string;
  promptLabel: string;
  rep: number;
}): Promise<FixedPromptTaskWalEvent> {
  const roundId = `ab-${input.promptLabel}-r${input.rep}-${roundIdTaskSuffix(input.task.id)}`;
  const result = await runFixedPromptController({
    runId: input.input.runId,
    roundId,
    config: input.input.config,
    systemPromptPath: input.promptPath,
    resultsJsonlPath: input.input.resultsJsonlPath,
    resultsTsvPath: `${input.input.resultsJsonlPath}.${roundId}.tsv`,
    tasks: [input.task],
    ...(input.input.resumeFingerprint ? { resumeFingerprint: input.input.resumeFingerprint } : {}),
    harborRunner: input.input.harborRunner,
    ...(input.input.now ? { now: input.input.now } : {}),
    ...(input.input.newId ? { newId: input.input.newId } : {}),
  });
  const event = result.events.find((candidate) => candidate.taskId === input.task.id);
  if (!event) throw new Error(`prompt A/B arm ${roundId} produced no event for ${input.task.id}`);
  return event;
}

function roundIdTaskSuffix(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'task';
}

function isValidBudgetedOutcome(
  event: FixedPromptTaskWalEvent,
): event is Extract<FixedPromptTaskWalEvent, { type: 'task_completed' | 'task_budget_exhausted' }> {
  return event.type === 'task_completed' || event.type === 'task_budget_exhausted';
}

function isBudgetExhaustedOutcome(event: FixedPromptTaskWalEvent): boolean {
  return event.type === 'task_budget_exhausted';
}

function isInfraOrPlumbingOutcome(event: FixedPromptTaskWalEvent): boolean {
  return event.type === 'task_infra_failed' || event.type === 'task_plumbing_failed';
}

function decisionLabel(decision: PromptAbDecision): string {
  switch (decision) {
    case 'candidate_better':
      return 'B better';
    case 'baseline_better':
      return 'A better';
    case 'inconclusive':
      return 'inconclusive';
  }
}

function rate(value: number | null): string {
  if (value === null) return 'null';
  return String(Math.round(value * 10_000) / 10_000);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function exactTwoSidedSignTestPValue(nonTieTasks: number, majorityWins: number): number {
  if (nonTieTasks <= 0) return 1;
  const minorityWins = Math.min(majorityWins, nonTieTasks - majorityWins);
  let tail = 0;
  for (let wins = 0; wins <= minorityWins; wins += 1) {
    tail += binomialProbability(nonTieTasks, wins, 0.5);
  }
  return Math.min(1, tail * 2);
}

function binomialProbability(n: number, k: number, p: number): number {
  let combinations = 1;
  for (let i = 1; i <= k; i += 1) {
    combinations *= (n - k + i) / i;
  }
  return combinations * p ** k * (1 - p) ** (n - k);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT';
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function assertSameRunCount(
  baselineRuns: readonly unknown[],
  candidateRuns: readonly unknown[],
): void {
  if (baselineRuns.length !== candidateRuns.length) {
    throw new Error('baseline and candidate runs must have the same rep count');
  }
}
