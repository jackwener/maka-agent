import {
  appendFixedPromptWalEvent,
  FIXED_PROMPT_WAL_SCHEMA_VERSION,
  type FixedPromptWalEvent,
  type FixedPromptTaskWalEvent,
  type PromptCandidateDecisionEvent,
} from './fixed-prompt-controller.js';

export type PromptAcceptanceDecision = 'keep' | 'discard';

export type PromptAcceptanceReason =
  | 'held_in_improved'
  | 'held_in_within_noise'
  | 'held_in_regressed'
  | 'coverage_regressed'
  | 'held_out_regressed';

export interface PromptAcceptancePartitionSummary {
  taskCount: number;
  observed: number;
  eligible: number;
  scored: number;
  passed: number;
  passEligibleRate: number | null;
  coverageRate: number | null;
  unscoredTaskIds: string[];
  missingTaskIds: string[];
}

export interface PromptAcceptanceMetrics {
  original: {
    heldOut: PromptAcceptancePartitionSummary;
  };
  lastKept: {
    heldIn: PromptAcceptancePartitionSummary;
  };
  candidate: {
    heldIn: PromptAcceptancePartitionSummary;
    heldOut: PromptAcceptancePartitionSummary;
  };
}

export interface PromptAcceptanceBaselineRun {
  heldInEvents: readonly FixedPromptTaskWalEvent[];
  heldOutEvents: readonly FixedPromptTaskWalEvent[];
}

export interface PromptAcceptanceBaselinePartition {
  taskCount: number;
  baselineRunCount: number;
  meanPassEligibleRate: number | null;
  observedSpread: number;
  noiseBand: number;
}

export interface PromptAcceptanceBaseline {
  heldIn: PromptAcceptanceBaselinePartition & {
    referencePassEligibleRate: number | null;
  };
  heldOut: PromptAcceptanceBaselinePartition & {
    originalPassEligibleRate: number | null;
  };
}

export interface CalibratePromptAcceptanceBaselineInput {
  heldInTaskIds: readonly string[];
  heldOutTaskIds: readonly string[];
  baselineRuns: readonly PromptAcceptanceBaselineRun[];
  zScore?: number;
}

export interface PromptAcceptanceNoiseBandInput {
  sampleSize: number;
  passRate: number | null;
  baselineRunCount: number;
  observedSpread?: number;
  zScore?: number;
}

export interface DecidePromptAcceptanceInput {
  runId: string;
  roundId: string;
  candidateCommitSha: string;
  previousLastKeptCommitSha: string;
  originalCommitSha: string;
  heldInTaskIds: readonly string[];
  heldOutTaskIds: readonly string[];
  passRateNoiseBand: number;
  coverageNoiseBand: number;
  originalEvents: readonly FixedPromptTaskWalEvent[];
  lastKeptEvents: readonly FixedPromptTaskWalEvent[];
  candidateEvents: readonly FixedPromptTaskWalEvent[];
}

export interface PromptAcceptanceResult {
  runId: string;
  roundId: string;
  decision: PromptAcceptanceDecision;
  reason: PromptAcceptanceReason;
  candidateCommitSha: string;
  previousLastKeptCommitSha: string;
  lastKeptCommitSha: string;
  originalCommitSha: string;
  metrics: PromptAcceptanceMetrics;
}

export interface AppendPromptAcceptanceDecisionInput {
  resultsJsonlPath: string;
  id: string;
  ts: number;
  result: PromptAcceptanceResult;
}

export interface PromptAcceptanceState {
  lastKeptCommitSha: string;
  decisions: Array<{
    roundId: string;
    decision: PromptAcceptanceDecision;
    candidateCommitSha: string;
  }>;
}

export function calibratePromptAcceptanceBaseline(
  input: CalibratePromptAcceptanceBaselineInput,
): PromptAcceptanceBaseline {
  const heldIn = calibratePartitionBaseline(
    input.baselineRuns.map((run) => summarizePromptAcceptancePartition(run.heldInEvents, input.heldInTaskIds)),
    input.zScore,
  );
  const heldOut = calibratePartitionBaseline(
    input.baselineRuns.map((run) => summarizePromptAcceptancePartition(run.heldOutEvents, input.heldOutTaskIds)),
    input.zScore,
  );
  return {
    heldIn: {
      ...heldIn,
      referencePassEligibleRate: heldIn.meanPassEligibleRate,
    },
    heldOut: {
      ...heldOut,
      originalPassEligibleRate: heldOut.meanPassEligibleRate,
    },
  };
}

export function promptAcceptanceNoiseBand(input: PromptAcceptanceNoiseBandInput): number {
  const observedSpread = input.observedSpread ?? 0;
  if (input.sampleSize <= 0 || input.passRate === null || input.baselineRunCount <= 0) {
    return observedSpread;
  }
  const zScore = input.zScore ?? 1.96;
  const wilson = wilsonHalfWidth(input.sampleSize, input.passRate, zScore);
  const differenceWidth = wilson * Math.sqrt(1 + 1 / input.baselineRunCount);
  return Math.max(differenceWidth, observedSpread);
}

export function decidePromptAcceptance(input: DecidePromptAcceptanceInput): PromptAcceptanceResult {
  const metrics: PromptAcceptanceMetrics = {
    original: {
      heldOut: summarizePromptAcceptancePartition(input.originalEvents, input.heldOutTaskIds),
    },
    lastKept: {
      heldIn: summarizePromptAcceptancePartition(input.lastKeptEvents, input.heldInTaskIds),
    },
    candidate: {
      heldIn: summarizePromptAcceptancePartition(input.candidateEvents, input.heldInTaskIds),
      heldOut: summarizePromptAcceptancePartition(input.candidateEvents, input.heldOutTaskIds),
    },
  };
  const reason = acceptanceReason(metrics, input.passRateNoiseBand, input.coverageNoiseBand);
  const decision: PromptAcceptanceDecision = reason === 'held_in_improved' ? 'keep' : 'discard';
  return {
    runId: input.runId,
    roundId: input.roundId,
    decision,
    reason,
    candidateCommitSha: input.candidateCommitSha,
    previousLastKeptCommitSha: input.previousLastKeptCommitSha,
    lastKeptCommitSha: decision === 'keep' ? input.candidateCommitSha : input.previousLastKeptCommitSha,
    originalCommitSha: input.originalCommitSha,
    metrics,
  };
}

function calibratePartitionBaseline(
  summaries: readonly PromptAcceptancePartitionSummary[],
  zScore: number | undefined,
): PromptAcceptanceBaselinePartition {
  const passRates = summaries
    .map((summary) => summary.passEligibleRate)
    .filter((rate): rate is number => rate !== null);
  const meanPassEligibleRate = mean(passRates);
  const observedSpread = meanPassEligibleRate === null
    ? 0
    : Math.max(0, ...passRates.map((rate) => Math.abs(rate - meanPassEligibleRate)));
  const sampleSize = Math.max(0, ...summaries.map((summary) => summary.eligible));
  return {
    taskCount: Math.max(0, ...summaries.map((summary) => summary.taskCount)),
    baselineRunCount: summaries.length,
    meanPassEligibleRate,
    observedSpread,
    noiseBand: promptAcceptanceNoiseBand({
      sampleSize,
      passRate: meanPassEligibleRate,
      baselineRunCount: summaries.length,
      observedSpread,
      zScore,
    }),
  };
}

function wilsonHalfWidth(sampleSize: number, passRate: number, zScore: number): number {
  const z2 = zScore * zScore;
  const denominator = 1 + z2 / sampleSize;
  const inner = passRate * (1 - passRate) / sampleSize + z2 / (4 * sampleSize * sampleSize);
  return zScore * Math.sqrt(inner) / denominator;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function appendPromptAcceptanceDecision(
  input: AppendPromptAcceptanceDecisionInput,
): Promise<PromptCandidateDecisionEvent> {
  const event = promptCandidateDecisionEvent(input);
  await appendFixedPromptWalEvent(input.resultsJsonlPath, event);
  return event;
}

export function promptAcceptanceStateFromWal(
  events: readonly FixedPromptWalEvent[],
  initialLastKeptCommitSha: string,
): PromptAcceptanceState {
  const decisions: PromptAcceptanceState['decisions'] = [];
  let lastKeptCommitSha = initialLastKeptCommitSha;
  for (const event of events) {
    if (event.type !== 'prompt_candidate_decided') continue;
    lastKeptCommitSha = event.lastKeptCommitSha;
    decisions.push({
      roundId: event.roundId,
      decision: event.decision,
      candidateCommitSha: event.candidateCommitSha,
    });
  }
  return { lastKeptCommitSha, decisions };
}

export function summarizePromptAcceptancePartition(
  events: readonly FixedPromptTaskWalEvent[],
  taskIds: readonly string[],
): PromptAcceptancePartitionSummary {
  const byTask = new Map(events.map((event) => [event.taskId, event]));
  const selected = taskIds.map((taskId) => byTask.get(taskId));
  const observed = selected.filter((event): event is FixedPromptTaskWalEvent => event !== undefined);
  const eligible = observed.filter((event) => event.eligible);
  const scored = observed.filter((event) => event.scored);
  const passed = observed.filter((event) => event.passed);
  return {
    taskCount: taskIds.length,
    observed: observed.length,
    eligible: eligible.length,
    scored: scored.length,
    passed: passed.length,
    passEligibleRate: eligible.length > 0 ? passed.length / eligible.length : null,
    coverageRate: taskIds.length > 0 ? scored.length / taskIds.length : null,
    unscoredTaskIds: taskIds.filter((taskId) => {
      const event = byTask.get(taskId);
      return event !== undefined && !event.scored;
    }),
    missingTaskIds: taskIds.filter((taskId) => !byTask.has(taskId)),
  };
}

function promptCandidateDecisionEvent(
  input: AppendPromptAcceptanceDecisionInput,
): PromptCandidateDecisionEvent {
  return {
    schemaVersion: FIXED_PROMPT_WAL_SCHEMA_VERSION,
    type: 'prompt_candidate_decided',
    id: input.id,
    ts: input.ts,
    runId: input.result.runId,
    roundId: input.result.roundId,
    decision: input.result.decision,
    reason: input.result.reason,
    candidateCommitSha: input.result.candidateCommitSha,
    previousLastKeptCommitSha: input.result.previousLastKeptCommitSha,
    lastKeptCommitSha: input.result.lastKeptCommitSha,
    originalCommitSha: input.result.originalCommitSha,
    metrics: input.result.metrics,
  };
}

function acceptanceReason(
  metrics: PromptAcceptanceMetrics,
  passRateNoiseBand: number,
  coverageNoiseBand: number,
): PromptAcceptanceReason {
  const heldInCandidate = metrics.candidate.heldIn;
  const heldInReference = metrics.lastKept.heldIn;
  const heldOutCandidate = metrics.candidate.heldOut;
  const heldOutReference = metrics.original.heldOut;

  if (regressed(heldInCandidate.coverageRate, heldInReference.coverageRate, coverageNoiseBand)) {
    return 'coverage_regressed';
  }
  if (regressed(heldOutCandidate.coverageRate, heldOutReference.coverageRate, coverageNoiseBand)) {
    return 'coverage_regressed';
  }
  if (regressed(heldOutCandidate.passEligibleRate, heldOutReference.passEligibleRate, passRateNoiseBand)) {
    return 'held_out_regressed';
  }
  if (improved(heldInCandidate.passEligibleRate, heldInReference.passEligibleRate, passRateNoiseBand)) {
    return 'held_in_improved';
  }
  if (regressed(heldInCandidate.passEligibleRate, heldInReference.passEligibleRate, passRateNoiseBand)) {
    return 'held_in_regressed';
  }
  return 'held_in_within_noise';
}

function improved(candidate: number | null, reference: number | null, noiseBand: number): boolean {
  return candidate !== null && reference !== null && candidate > reference + noiseBand;
}

function regressed(candidate: number | null, reference: number | null, noiseBand: number): boolean {
  return reference !== null && (candidate === null || candidate < reference - noiseBand);
}
