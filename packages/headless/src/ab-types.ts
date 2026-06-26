import type { FixedPromptTask, FixedPromptTaskWalEvent } from './fixed-prompt-controller.js';

export type AbExperimentKind = 'prompt' | 'tools' | 'provider' | 'runtime';

export interface AbArmSpec {
  id: string;
  kind: AbExperimentKind;
  fingerprint: string;
  metadata?: Record<string, unknown>;
}

export interface SummarizeAbComparisonInput {
  runId: string;
  roundId: string;
  baselineArmId: string;
  candidateArmId: string;
  evaluationTaskIds: readonly string[];
  baselineRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  candidateRuns: readonly (readonly FixedPromptTaskWalEvent[])[];
  budgetMs?: number;
}

export interface RunAbComparisonInput {
  runId: string;
  arms: readonly [AbArmSpec, AbArmSpec];
  evaluationTasks: readonly FixedPromptTask[];
  reps?: number;
  maxConcurrency?: number;
  budgetMs?: number;
  runArm: AbArmRunner;
}

export interface AbArmRunInput {
  runId: string;
  roundId: string;
  arm: AbArmSpec;
  task: FixedPromptTask;
  rep: number;
}

export type AbArmRunner = (input: AbArmRunInput) => Promise<FixedPromptTaskWalEvent>;

export type AbDecision =
  | 'candidate_better'
  | 'baseline_better'
  | 'inconclusive';

export interface AbArmSummary {
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
  contextBudget?: AbContextBudgetSummary;
}

export interface AbContextBudgetSummary {
  diagnosticAttempts: number;
  activatedAttempts: number;
  diagnosticEvents: number;
  prunedToolResults: number;
  archivePlaceholders: number;
  archiveWriteFailures: number;
  retrievedArchiveToolResults: number;
  retrievedArchiveEstimatedTokens: number;
  archiveRetrievalSkipped: number;
  archiveRetrievalFailures: number;
}

export interface AbTaskArmSummary {
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

export interface AbTaskComparison {
  taskId: string;
  baseline: AbTaskArmSummary;
  candidate: AbTaskArmSummary;
  passRateDelta: number | null;
  outcome: 'candidate_win' | 'baseline_win' | 'tie' | 'missing';
}

export interface AbTaskLevelSummary {
  comparableTasks: number;
  wins: number;
  losses: number;
  ties: number;
  signTestNonTieTasks: number;
  signTestPValue: number | null;
  missingTaskIds: string[];
  meanPassRateDelta: number | null;
  medianPassRateDelta: number | null;
  tasks: AbTaskComparison[];
}

export interface AbAttemptPairSummary {
  pairs: number;
  observedPairs: number;
  wins: number;
  losses: number;
  ties: number;
  missingPairIds: string[];
  budgetDiscordantPairIds: string[];
  infraOrPlumbingDiscordantPairIds: string[];
}

export interface AbComparisonSummary {
  runId: string;
  roundId: string;
  baselineArmId: string;
  candidateArmId: string;
  taskCount: number;
  reps: number;
  budgetMs?: number;
  decision: AbDecision;
  reason: string;
  baseline: AbArmSummary;
  candidate: AbArmSummary;
  taskLevel: AbTaskLevelSummary;
  pairedAttempts: AbAttemptPairSummary;
}

export interface AbRunManifestInput {
  experimentKind: AbExperimentKind;
  arms: readonly [AbArmSpec, AbArmSpec];
  taskBudgetSec: number;
  harborTimeoutMs: number;
  subjectFingerprint: string;
  taskSourceFingerprint: string;
  toolchainFingerprint: string;
  evaluationTaskIds: readonly string[];
  reps: number;
  candidateLimit: number | null;
  maxConcurrency: number;
  selectionMode?: 'explicit' | 'metadata';
  candidateTaskIds?: readonly string[];
  maxExpertTimeEstimateMin?: number | null;
  targetEvaluationTaskCount?: number | null;
}

export type AbRunManifest = AbRunManifestInput & {
  schemaVersion: 'maka.ab.run_manifest.v1';
  fingerprint: string;
  arms: [AbArmSpec, AbArmSpec];
  evaluationTaskIds: string[];
  candidateTaskIds?: string[];
};
