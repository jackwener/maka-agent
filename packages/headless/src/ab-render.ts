import type {
  AbComparisonSummary,
  AbContextBudgetSummary,
  AbDecision,
} from './ab-types.js';

export function renderAbComparisonMarkdown(summary: AbComparisonSummary): string {
  const contextBudgetLine = renderContextBudgetLine(summary);
  const lines = [
    '# A/B Comparison',
    '',
    `- Baseline A: ${summary.baselineArmId}`,
    `- Candidate B: ${summary.candidateArmId}`,
    `- Evaluation tasks: ${summary.taskCount}`,
    `- Reps: ${summary.reps}`,
    `- Decision: ${decisionLabel(summary.decision)} (${summary.reason})`,
    `- Budget: ${summary.budgetMs !== undefined ? `${Math.round(summary.budgetMs / 1000)}s task budget` : 'not recorded'}`,
    `- Evaluation pass rate: A=${summary.baseline.passed}/${summary.baseline.valid} = ${rate(summary.baseline.passRate)}, B=${summary.candidate.passed}/${summary.candidate.valid} = ${rate(summary.candidate.passRate)}`,
    `- Task-level delta: mean=${rate(summary.taskLevel.meanPassRateDelta)}, median=${rate(summary.taskLevel.medianPassRateDelta)}, wins=${summary.taskLevel.wins}, losses=${summary.taskLevel.losses}, ties=${summary.taskLevel.ties}, sign_test_p=${rate(summary.taskLevel.signTestPValue)}, missing=${summary.taskLevel.missingTaskIds.length}`,
    `- Attempt-pair auxiliary: wins=${summary.pairedAttempts.wins}, losses=${summary.pairedAttempts.losses}, ties=${summary.pairedAttempts.ties}, missing=${summary.pairedAttempts.missingPairIds.length}`,
    `- Budget outcomes: A timed_out=${summary.baseline.budgetExhausted}, B timed_out=${summary.candidate.budgetExhausted}`,
    `- Infra outcomes: A infra_failed=${summary.baseline.infraFailed}, B infra_failed=${summary.candidate.infraFailed}; A plumbing_failed=${summary.baseline.plumbingFailed}, B plumbing_failed=${summary.candidate.plumbingFailed}`,
    ...(contextBudgetLine ? [contextBudgetLine] : []),
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

function decisionLabel(decision: AbDecision): string {
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

function renderContextBudgetLine(summary: AbComparisonSummary): string | undefined {
  if (!summary.baseline.contextBudget && !summary.candidate.contextBudget) return undefined;
  const baseline = contextBudgetOrZero(summary.baseline.contextBudget);
  const candidate = contextBudgetOrZero(summary.candidate.contextBudget);
  return `- Context budget: A activated=${baseline.activatedAttempts}/${baseline.diagnosticAttempts} pruned=${baseline.prunedToolResults} retrieved=${baseline.retrievedArchiveToolResults}, B activated=${candidate.activatedAttempts}/${candidate.diagnosticAttempts} pruned=${candidate.prunedToolResults} retrieved=${candidate.retrievedArchiveToolResults}`;
}

function contextBudgetOrZero(summary: AbContextBudgetSummary | undefined): AbContextBudgetSummary {
  return summary ?? {
    diagnosticAttempts: 0,
    activatedAttempts: 0,
    diagnosticEvents: 0,
    prunedToolResults: 0,
    archivePlaceholders: 0,
    archiveWriteFailures: 0,
    retrievedArchiveToolResults: 0,
    retrievedArchiveEstimatedTokens: 0,
    archiveRetrievalSkipped: 0,
    archiveRetrievalFailures: 0,
  };
}
