import { createHash } from 'node:crypto';
import type { ModelMessage } from 'ai';
import type { RuntimeEvent } from '@maka/core/runtime-event';
import type { ContextBudgetDiagnostic } from '@maka/core/usage-stats/types';
import {
  activeFullCompactCoverageFromEntries,
  buildActiveFullCompactBlockFromSummary,
  buildActiveFullCompactSourceIndex,
  buildDeterministicActiveFullCompactSummary,
  selectActiveFullCompactCoveredSpan,
  validateActiveFullCompactBlockForSourceIndex,
  type ActiveFullCompactArchiveRef,
  type ActiveFullCompactCoverage,
  type ActiveFullCompactPolicy,
  type ActiveFullCompactSourceEntry,
  type ActiveFullCompactSourceIndex,
  type ActiveFullCompactSourceRef,
  type ActiveFullCompactValidationResult,
} from './active-full-compact.js';
import { compactionDecisionDiagnosticPatch } from './compaction-boundary.js';
import { estimateTokens } from './context-budget.js';
import type { CompactSummaryResult, NormalizedAiSdkUsage } from './model-adapter.js';

const DEFAULT_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_SUMMARY_TOKENS = 768;
const DEFAULT_MIN_SAVINGS_TOKENS = 256;
const DEFAULT_MIN_SAVINGS_RATIO = 0.05;
const PRIVATE_VERIFIER_PATTERN = /\b(hidden|private|official)\s+(verifier|evaluation|eval|test|assertion|oracle)\b/i;
const SUMMARY_FIELD_LABELS = {
  objective: ['current_objective', 'current objective'],
  nextAction: ['next_action', 'next action'],
} as const;

export interface SemanticCompactPolicy {
  enabled: boolean;
  mode?: 'off' | 'validate_only' | 'prepare_step_dry_run' | 'replace';
  minStepNumber?: number;
  highWaterRatio?: number;
  forceRatio?: number;
  targetRatio?: number;
  maxActiveEstimatedTokens?: number;
  minRecentMessages?: number;
  minRecentToolPairs?: number;
  maxSummaryEstimatedTokens?: number;
  minSavingsTokens?: number;
  minSavingsRatio?: number;
  maxCompactCallTokens?: number;
  summarizerModel?: string;
  timeoutMs?: number;
  archiveRequired?: boolean;
  benchmarkStateCards?: boolean;
  promptVersion?: string;
  highWaterName?: string;
}

export interface SemanticCompactSummaryRequest {
  system: string;
  messages: readonly ModelMessage[];
  maxOutputTokens: number;
  abortSignal?: AbortSignal;
}

export type SemanticCompactSummarizer = (
  request: SemanticCompactSummaryRequest,
) => Promise<CompactSummaryResult> | CompactSummaryResult;

export interface SemanticCompactStateCard {
  kind: 'process' | 'vm' | 'artifact' | 'command' | 'constraint' | 'verifier' | 'next_action' | 'generic';
  text: string;
  sourceIds: string[];
}

export interface SemanticCompactBlock {
  kind: 'maka.semantic_compact_block';
  version: 1;
  blockId: string;
  sessionId: string;
  turnId: string;
  runId?: string;
  invocationId?: string;
  createdAt: number;
  highWaterName: string;
  highWaterSeq: number;
  trigger: {
    reason: 'high_water' | 'force_ratio' | 'predictive_growth' | 'reactive_prompt_too_long' | 'manual_test';
    stepNumber?: number;
    estimatedTokensBefore?: number;
    thresholdTokens?: number;
  };
  coverage: ActiveFullCompactCoverage;
  sourceRefs: ActiveFullCompactSourceRef[];
  archiveRefs?: ActiveFullCompactArchiveRef[];
  preservedTail: {
    messageIndexes: number[];
    toolCallIds: string[];
    sourceIds: string[];
  };
  summary: {
    promptVersion: string;
    text: string;
    limitations?: string[];
    nextAction?: string;
  };
  stateCards?: SemanticCompactStateCard[];
  requestShapeHashBefore?: string;
  requestShapeHashAfter?: string;
  preActiveContextEstimatedTokens: number;
  postReplacementEstimatedTokens: number;
  estimatedTokensSavedSigned: number;
  compactCallUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
  providerRequestId?: string;
  acceptance: {
    decision: 'accepted' | 'rejected' | 'dry_run';
    reason?: string;
    validationReasons?: string[];
  };
}

export type SemanticCompactDecision = 'unchanged' | 'replaced' | 'failedOpen';

export interface SemanticCompactRewriteInput {
  sessionId: string;
  turnId: string;
  runId?: string;
  invocationId?: string;
  messages: readonly ModelMessage[];
  policy: SemanticCompactPolicy | undefined;
  runtimeEvents?: readonly RuntimeEvent[];
  stepNumber: number;
  now?: number;
  charsPerToken?: number;
  requestShapeHashBefore?: string;
  requestShapeHashForMessages?: (messages: readonly ModelMessage[]) => string;
  summarizer: SemanticCompactSummarizer;
  abortSignal?: AbortSignal;
}

export interface SemanticCompactRewriteResult {
  messages: ModelMessage[];
  decision: SemanticCompactDecision;
  reason?: string;
  diagnosticPatch: Partial<ContextBudgetDiagnostic>;
  block?: SemanticCompactBlock;
  validation?: ActiveFullCompactValidationResult;
}

export async function rewriteSemanticCompactInMessages(
  input: SemanticCompactRewriteInput,
): Promise<SemanticCompactRewriteResult> {
  const messages = [...input.messages];
  const policy = input.policy;
  const charsPerToken = input.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  if (policy?.enabled !== true || policy.mode === 'off') {
    return unchanged(messages, 'disabled');
  }

  const index = buildActiveFullCompactSourceIndex({
    sessionId: input.sessionId,
    turnId: input.turnId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.invocationId ? { invocationId: input.invocationId } : {}),
    messages,
    runtimeEvents: input.runtimeEvents,
    stepNumber: input.stepNumber,
    charsPerToken,
  });
  const selectionPolicy = policyForSemanticSelection(policy, messages);
  const selection = selectActiveFullCompactCoveredSpan(index, selectionPolicy);
  if (selection.decision !== 'selected') {
    const decision = selection.decision === 'failedOpen' ? 'failedOpen' : 'unchanged';
    return {
      messages,
      decision,
      reason: selection.reason,
      diagnosticPatch: semanticCompactDecisionDiagnosticPatch({
        decision,
        reason: selection.reason,
        estimatedTokensBefore: index.estimatedTokens,
        estimatedTokensAfter: index.estimatedTokens,
        skippedReasonCounts: selection.skippedReasonCounts,
      }),
    };
  }

  const validationBlock = buildActiveFullCompactBlockFromSummary({
    sessionId: input.sessionId,
    turnId: input.turnId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.invocationId ? { invocationId: input.invocationId } : {}),
    entries: selection.entries,
    summary: {
      schemaVersion: 1,
      text: 'Semantic compact source validation block.',
      nextActions: ['Continue from semantic compact summary and preserved recent tail.'],
    },
    highWaterName: policy.highWaterName ?? 'semantic-compact-high-water',
    highWaterSeq: input.stepNumber,
    trigger: {
      reason: 'high_water',
      stepNumber: input.stepNumber,
      estimatedTokensBefore: index.estimatedTokens,
      ...(policy.maxActiveEstimatedTokens !== undefined
        ? { thresholdTokens: Math.floor(policy.maxActiveEstimatedTokens * finiteRatio(policy.highWaterRatio, 0.8)) }
        : {}),
    },
    now: input.now,
    charsPerToken,
    requestShapeHashBefore: input.requestShapeHashBefore ?? input.requestShapeHashForMessages?.(messages),
    preActiveContextEstimatedTokens: index.estimatedTokens,
  });
  const validation = validateActiveFullCompactBlockForSourceIndex(validationBlock, index, {
    sessionId: input.sessionId,
    turnId: input.turnId,
    archiveRequired: policy.archiveRequired,
    charsPerToken,
  });
  if (!validation.valid) {
    return {
      messages,
      decision: 'failedOpen',
      validation,
      diagnosticPatch: semanticCompactDecisionDiagnosticPatch({
        decision: 'failedOpen',
        boundaryIds: [validationBlock.blockId],
        coverage: validationBlock.coverage,
        estimatedTokensBefore: index.estimatedTokens,
        estimatedTokensAfter: index.estimatedTokens,
        failOpenReason: validation.reasons[0] ?? 'coverage_miss',
        validationReasonCounts: validation.reasonCounts,
      }),
    };
  }

  const stateCards = buildSemanticStateCards({
    selection,
    messages,
    runtimeEvents: input.runtimeEvents,
    policy,
    charsPerToken,
  });
  let summary: CompactSummaryResult;
  try {
    summary = await callSummarizerWithTimeout(input.summarizer, {
      system: semanticCompactSystemPrompt(policy),
      messages: buildSummarizerMessages({
        selection,
        messages,
        index,
        stateCards,
        policy,
        charsPerToken,
      }),
      maxOutputTokens: Math.floor(policy.maxCompactCallTokens ?? policy.maxSummaryEstimatedTokens ?? DEFAULT_MAX_SUMMARY_TOKENS),
      abortSignal: input.abortSignal,
    }, policy.timeoutMs);
  } catch {
    return rejected(messages, index, 'summarizer_failed');
  }

  const compactCallUsage = summary.usage ? compactUsage(summary.usage) : undefined;
  const summaryText = normalizeSummaryText(summary.text);
  if (!summaryText) return rejected(messages, index, 'summary_missing', compactCallUsage);
  const maxSummaryTokens = Math.floor(policy.maxSummaryEstimatedTokens ?? DEFAULT_MAX_SUMMARY_TOKENS);
  if (estimateTokens(summaryText.length, charsPerToken) > maxSummaryTokens) {
    return rejected(messages, index, 'summary_too_large', compactCallUsage);
  }
  const summaryContractReason = semanticSummaryContractRejectionReason(summaryText);
  if (summaryContractReason) return rejected(messages, index, summaryContractReason, compactCallUsage);
  if (newPrivateVerifierSurface(summaryText, selectedSourceText(selection, messages))) {
    return rejected(messages, index, 'private_verifier_surface', compactCallUsage);
  }

  const requestShapeHashBefore = input.requestShapeHashBefore ?? input.requestShapeHashForMessages?.(messages);
  const block = buildSemanticCompactBlock({
    input,
    index,
    selection,
    summaryText,
    stateCards,
    usage: summary.usage,
    finishReason: summary.finishReason,
    providerRequestId: summary.providerRequestId,
    requestShapeHashBefore,
    charsPerToken,
  });
  const replacementMessage = semanticCompactBlockToModelMessage(block);
  const replacementMessages = [
    ...messages.slice(0, selection.startMessageIndex),
    replacementMessage,
    ...messages.slice(selection.endMessageIndex + 1),
  ];
  const requestShapeHashAfter = input.requestShapeHashForMessages?.(replacementMessages);
  if (requestShapeHashAfter) block.requestShapeHashAfter = requestShapeHashAfter;
  block.postReplacementEstimatedTokens = estimatePostReplacementTokens(index, selection.estimatedTokens, renderSemanticCompactBlock(block), charsPerToken);
  block.estimatedTokensSavedSigned = index.estimatedTokens - block.postReplacementEstimatedTokens;

  const economicsReason = semanticSavingsRejectionReason(block, policy);
  if (economicsReason) {
    block.acceptance = { decision: 'rejected', reason: economicsReason };
    return {
      messages,
      decision: 'unchanged',
      reason: economicsReason,
      block,
      validation,
      diagnosticPatch: semanticCompactDecisionDiagnosticPatch({
        decision: 'unchanged',
        boundaryIds: [block.blockId],
        coverage: block.coverage,
        estimatedTokensBefore: index.estimatedTokens,
        estimatedTokensAfter: block.postReplacementEstimatedTokens,
        estimatedTokensSaved: block.estimatedTokensSavedSigned,
        compactCallUsage: block.compactCallUsage,
        reason: economicsReason,
        validationReasonCounts: validation.reasonCounts,
      }),
    };
  }

  if (policy.mode === 'validate_only' || policy.mode === 'prepare_step_dry_run') {
    block.acceptance = { decision: 'dry_run', reason: policy.mode };
    return {
      messages,
      decision: 'unchanged',
      reason: policy.mode,
      block,
      validation,
      diagnosticPatch: semanticCompactDecisionDiagnosticPatch({
        decision: 'unchanged',
        boundaryIds: [block.blockId],
        coverage: block.coverage,
        estimatedTokensBefore: index.estimatedTokens,
        estimatedTokensAfter: block.postReplacementEstimatedTokens,
        estimatedTokensSaved: block.estimatedTokensSavedSigned,
        compactCallUsage: block.compactCallUsage,
        reason: policy.mode,
        validationReasonCounts: validation.reasonCounts,
      }),
    };
  }

  block.acceptance = { decision: 'accepted' };
  return {
    messages: replacementMessages,
    decision: 'replaced',
    block,
    validation,
    diagnosticPatch: {
      ...semanticCompactDecisionDiagnosticPatch({
        decision: 'replaced',
        boundaryIds: [block.blockId],
        coverage: block.coverage,
        estimatedTokensBefore: index.estimatedTokens,
        estimatedTokensAfter: block.postReplacementEstimatedTokens,
        estimatedTokensSaved: block.estimatedTokensSavedSigned,
        compactCallUsage: block.compactCallUsage,
        validationReasonCounts: validation.reasonCounts,
      }),
      ...(requestShapeHashBefore && requestShapeHashAfter
        ? {
            highWaterRequestShapeHashBefore: requestShapeHashBefore,
            highWaterRequestShapeHashAfter: requestShapeHashAfter,
          }
        : {}),
    },
  };
}

export function semanticCompactBlockToModelMessage(block: SemanticCompactBlock): ModelMessage {
  return {
    role: 'user',
    content: renderSemanticCompactBlock(block),
  } as ModelMessage;
}

export function renderSemanticCompactBlock(block: SemanticCompactBlock): string {
  const archiveLines = (block.archiveRefs ?? []).slice(0, 12).map((ref) =>
    `- ${ref.artifactId} tool=${ref.toolName ?? 'unknown'} call=${ref.toolCallId ?? 'unknown'} sha256=${ref.bodySha256.slice(0, 16)}`
  );
  const stateLines = (block.stateCards ?? []).map((card) =>
    `- ${card.kind}: ${singleLine(card.text)}`
  );
  return [
    `<maka_semantic_compact_block id="${escapeAttribute(block.blockId)}" high_water="${escapeAttribute(block.highWaterName)}" seq="${block.highWaterSeq}" version="${block.version}">`,
    'summary:',
    block.summary.text,
    stateLines.length > 0 ? 'restoration_state_cards:' : '',
    ...stateLines,
    archiveLines.length > 0 ? 'archives:' : '',
    ...archiveLines,
    `coverage: ${block.coverage.providerMessageSourceIds.length} provider source entries, ${block.coverage.toolCallIds.length} tool calls, ${block.coverage.bodySha256.length} source hashes retained in durable compact block.`,
    `preserved_tail: messages=${block.preservedTail.messageIndexes.join(',') || 'none'} toolCalls=${block.preservedTail.toolCallIds.join(',') || 'none'}`,
    'instructions: Continue from this semantic summary plus the exact preserved recent messages that follow it. Use archive refs for raw evidence recovery when needed.',
    '</maka_semantic_compact_block>',
  ].filter((line) => line !== '').join('\n');
}

function policyForSemanticSelection(
  policy: SemanticCompactPolicy,
  messages: readonly ModelMessage[],
): ActiveFullCompactPolicy {
  const minRecentMessages = Math.max(
    Math.floor(policy.minRecentMessages ?? 1),
    recentMessageCountForToolPairs(messages, Math.floor(policy.minRecentToolPairs ?? 0)),
  );
  return {
    enabled: true,
    minStepNumber: policy.minStepNumber,
    highWaterRatio: policy.highWaterRatio,
    forceRatio: policy.forceRatio,
    targetRatio: policy.targetRatio,
    maxActiveEstimatedTokens: policy.maxActiveEstimatedTokens,
    minRecentMessages,
    minRecentToolPairs: policy.minRecentToolPairs,
    maxSummaryEstimatedTokens: policy.maxSummaryEstimatedTokens,
    archiveRequired: policy.archiveRequired,
    highWaterName: policy.highWaterName,
  };
}

function recentMessageCountForToolPairs(messages: readonly ModelMessage[], minPairs: number): number {
  if (minPairs <= 0) return 0;
  const retained = new Set<number>();
  const callsById = new Map<string, number>();
  const resultsById = new Map<string, number>();
  messages.forEach((message, index) => {
    for (const id of messageToolCallIds(message)) callsById.set(id, index);
    for (const id of messageToolResultIds(message)) resultsById.set(id, index);
  });
  let pairs = 0;
  for (let index = messages.length - 1; index >= 0 && pairs < minPairs; index -= 1) {
    for (const id of messageToolResultIds(messages[index]!)) {
      const callIndex = callsById.get(id);
      const resultIndex = resultsById.get(id);
      if (callIndex === undefined || resultIndex === undefined) continue;
      retained.add(callIndex);
      retained.add(resultIndex);
      pairs += 1;
      if (pairs >= minPairs) break;
    }
  }
  if (retained.size === 0) return 0;
  return messages.length - Math.min(...retained);
}

function messageToolCallIds(message: ModelMessage): string[] {
  const content = (message as { content?: unknown }).content;
  const parts = Array.isArray(content) ? content : [];
  return parts
    .map((part) => isRecord(part) && part.type === 'tool-call' ? part.toolCallId ?? part.tool_call_id : undefined)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function messageToolResultIds(message: ModelMessage): string[] {
  if ((message as { role?: string }).role !== 'tool') return [];
  const content = (message as { content?: unknown }).content;
  const parts = Array.isArray(content) ? content : [];
  return parts
    .map((part) => isRecord(part) && part.type === 'tool-result' ? part.toolCallId ?? part.tool_call_id : undefined)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function buildSummarizerMessages(input: {
  selection: Extract<ReturnType<typeof selectActiveFullCompactCoveredSpan>, { decision: 'selected' }>;
  messages: readonly ModelMessage[];
  index: ActiveFullCompactSourceIndex;
  stateCards: readonly SemanticCompactStateCard[];
  policy: SemanticCompactPolicy;
  charsPerToken: number;
}): ModelMessage[] {
  const sourceManifest = {
    providerMessageSourceIds: input.selection.coverage.providerMessageSourceIds,
    toolCallIds: input.selection.coverage.toolCallIds,
    contentKinds: input.selection.coverage.contentKinds,
    archiveRefs: input.selection.entries.map((entry) => entry.archiveRef?.artifactId).filter(Boolean),
  };
  const request = [
    'Create a concise semantic compact summary for the Maka agent to continue this same task.',
    'Return structured plain text with these exact labels: current_objective:, user_constraints:, important_files_and_artifacts:, commands_and_results:, errors_and_fixes:, failed_hypotheses:, operational_state:, public_verification_state:, remaining_work:, next_action:, archive_refs_to_reread_if_needed:.',
    'The current_objective and next_action fields are required and must be non-empty.',
    'Use only the public provider-visible messages above, source manifest, archive placeholders, and restoration hints.',
    'Do not invent command results, file contents, process state, credentials, verifier results, or hidden/private evaluation facts.',
    'Preserve objective, constraints, decisions, failed attempts, commands/results that matter, files/artifacts, active process/build state, and exact next action.',
    `Keep the answer under ${input.policy.maxSummaryEstimatedTokens ?? DEFAULT_MAX_SUMMARY_TOKENS} estimated tokens.`,
    `source_manifest: ${JSON.stringify(sourceManifest)}`,
    `restoration_hints: ${JSON.stringify(input.stateCards)}`,
  ].join('\n');
  return [
    ...input.messages.slice(input.selection.startMessageIndex, input.selection.endMessageIndex + 1),
    { role: 'user', content: request } as ModelMessage,
  ];
}

function semanticCompactSystemPrompt(policy: SemanticCompactPolicy): string {
  return [
    'You compress a Maka agent session for current-turn context compaction.',
    'No tools are available. Return only concise structured summary text.',
    'Do not include hidden/private verifier material unless it was explicitly present in public provider-visible input.',
    `Prompt version: ${policy.promptVersion ?? 'maka-semantic-compact-v1'}.`,
  ].join('\n');
}

function buildSemanticStateCards(input: {
  selection: Extract<ReturnType<typeof selectActiveFullCompactCoveredSpan>, { decision: 'selected' }>;
  messages: readonly ModelMessage[];
  runtimeEvents?: readonly RuntimeEvent[];
  policy: SemanticCompactPolicy;
  charsPerToken: number;
}): SemanticCompactStateCard[] {
  if (input.policy.benchmarkStateCards === false) return [];
  const deterministic = buildDeterministicActiveFullCompactSummary({
    selection: input.selection,
    messages: input.messages,
    runtimeEvents: input.runtimeEvents,
    maxSummaryEstimatedTokens: Math.min(input.policy.maxSummaryEstimatedTokens ?? DEFAULT_MAX_SUMMARY_TOKENS, 384),
    charsPerToken: input.charsPerToken,
  });
  const allSourceIds = input.selection.entries.map((entry) => entry.sourceId);
  const cards: SemanticCompactStateCard[] = [];
  for (const text of deterministic.processState ?? []) cards.push({ kind: 'process', text, sourceIds: allSourceIds });
  for (const text of deterministic.vmState ?? []) cards.push({ kind: 'vm', text, sourceIds: allSourceIds });
  for (const text of deterministic.artifactPaths ?? []) cards.push({ kind: 'artifact', text, sourceIds: allSourceIds });
  for (const command of deterministic.commandsTried ?? []) {
    cards.push({ kind: 'command', text: `${command.command}: ${command.outcome}`, sourceIds: command.sourceIds ?? allSourceIds });
  }
  for (const text of deterministic.constraints ?? []) cards.push({ kind: 'constraint', text, sourceIds: allSourceIds });
  if (deterministic.latestVerifierFailure) {
    cards.push({ kind: 'verifier', text: deterministic.latestVerifierFailure, sourceIds: allSourceIds });
  }
  for (const text of deterministic.nextActions ?? []) cards.push({ kind: 'next_action', text, sourceIds: allSourceIds });
  return cards.slice(0, 16);
}

function buildSemanticCompactBlock(input: {
  input: SemanticCompactRewriteInput;
  index: ActiveFullCompactSourceIndex;
  selection: Extract<ReturnType<typeof selectActiveFullCompactCoveredSpan>, { decision: 'selected' }>;
  summaryText: string;
  stateCards: readonly SemanticCompactStateCard[];
  usage?: NormalizedAiSdkUsage;
  finishReason?: string;
  providerRequestId?: string;
  requestShapeHashBefore?: string;
  charsPerToken: number;
}): SemanticCompactBlock {
  const policy = input.input.policy!;
  const archiveRefs = uniqueArchiveRefs(input.selection.entries.map((entry) => entry.archiveRef).filter(isArchiveRef));
  const sourceRefs = input.selection.entries.map((entry): ActiveFullCompactSourceRef => ({
    kind: entry.archiveRef ? 'active_archive_placeholder' : entry.runtimeEventId ? 'runtime_event' : 'provider_message',
    sourceId: entry.sourceId,
    messageIndex: entry.messageIndex,
    ...(entry.partIndex !== undefined ? { partIndex: entry.partIndex } : {}),
    sessionId: input.input.sessionId,
    turnId: entry.turnId,
    ...(entry.runtimeEventId ? { runtimeEventId: entry.runtimeEventId } : {}),
    ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
    ...(entry.toolName ? { toolName: entry.toolName } : {}),
    contentKind: entry.contentKind,
    bodySha256: entry.bodySha256,
    ...(entry.archiveRef ? { archiveRef: entry.archiveRef } : {}),
  }));
  const preservedTailIndexes = preservedTailMessageIndexes(input.index, input.selection);
  const preservedTailEntries = input.index.entries.filter((entry) => preservedTailIndexes.includes(entry.messageIndex));
  const draft = {
    sessionId: input.input.sessionId,
    turnId: input.input.turnId,
    coverage: activeFullCompactCoverageFromEntries(input.selection.entries),
    summaryText: input.summaryText,
    highWaterSeq: input.input.stepNumber,
  };
  const nextAction = extractSummaryField(input.summaryText, SUMMARY_FIELD_LABELS.nextAction);
  const block: SemanticCompactBlock = {
    kind: 'maka.semantic_compact_block',
    version: 1,
    blockId: `semcompact-${sha256(stableStringify(draft)).slice(0, 32)}`,
    sessionId: input.input.sessionId,
    turnId: input.input.turnId,
    ...(input.input.runId ? { runId: input.input.runId } : {}),
    ...(input.input.invocationId ? { invocationId: input.input.invocationId } : {}),
    createdAt: input.input.now ?? Date.now(),
    highWaterName: policy.highWaterName ?? 'semantic-compact-high-water',
    highWaterSeq: input.input.stepNumber,
    trigger: {
      reason: 'high_water',
      stepNumber: input.input.stepNumber,
      estimatedTokensBefore: input.index.estimatedTokens,
      ...(policy.maxActiveEstimatedTokens !== undefined
        ? { thresholdTokens: Math.floor(policy.maxActiveEstimatedTokens * finiteRatio(policy.highWaterRatio, 0.8)) }
        : {}),
    },
    coverage: activeFullCompactCoverageFromEntries(input.selection.entries),
    sourceRefs,
    ...(archiveRefs.length > 0 ? { archiveRefs } : {}),
    preservedTail: {
      messageIndexes: preservedTailIndexes,
      toolCallIds: uniqueSorted(preservedTailEntries.map((entry) => entry.toolCallId).filter(nonEmpty)),
      sourceIds: uniqueSorted(preservedTailEntries.map((entry) => entry.sourceId)),
    },
    summary: {
      promptVersion: policy.promptVersion ?? 'maka-semantic-compact-v1',
      text: input.summaryText,
      limitations: ['LLM semantic compact summary is bounded by public provider-visible context and deterministic restoration cards.'],
      ...(nextAction !== undefined ? { nextAction } : {}),
    },
    ...(input.stateCards.length > 0 ? { stateCards: [...input.stateCards] } : {}),
    ...(input.requestShapeHashBefore ? { requestShapeHashBefore: input.requestShapeHashBefore } : {}),
    preActiveContextEstimatedTokens: input.index.estimatedTokens,
    postReplacementEstimatedTokens: input.index.estimatedTokens,
    estimatedTokensSavedSigned: 0,
    ...(input.usage ? { compactCallUsage: compactUsage(input.usage) } : {}),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
    ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
    acceptance: { decision: 'rejected', reason: 'pending_acceptance' },
  };
  block.postReplacementEstimatedTokens = estimatePostReplacementTokens(
    input.index,
    input.selection.estimatedTokens,
    renderSemanticCompactBlock(block),
    input.charsPerToken,
  );
  block.estimatedTokensSavedSigned = input.index.estimatedTokens - block.postReplacementEstimatedTokens;
  return block;
}

function semanticSavingsRejectionReason(block: SemanticCompactBlock, policy: SemanticCompactPolicy): string | undefined {
  const minSavingsTokens = Math.max(0, Math.floor(policy.minSavingsTokens ?? DEFAULT_MIN_SAVINGS_TOKENS));
  if (block.estimatedTokensSavedSigned < minSavingsTokens) return 'below_min_savings_tokens';
  const minSavingsRatio = Math.max(0, policy.minSavingsRatio ?? DEFAULT_MIN_SAVINGS_RATIO);
  const savingsRatio = block.preActiveContextEstimatedTokens > 0
    ? block.estimatedTokensSavedSigned / block.preActiveContextEstimatedTokens
    : 0;
  if (savingsRatio < minSavingsRatio) return 'below_min_savings_ratio';
  return undefined;
}

function semanticCompactDecisionDiagnosticPatch(input: {
  decision: 'unchanged' | 'replaced' | 'failedOpen';
  boundaryIds?: readonly string[];
  coverage?: ActiveFullCompactCoverage;
  estimatedTokensBefore?: number;
  estimatedTokensAfter?: number;
  estimatedTokensSaved?: number;
  compactCallUsage?: SemanticCompactBlock['compactCallUsage'];
  reason?: string;
  failOpenReason?: string;
  skippedReasonCounts?: Readonly<Record<string, number>>;
  validationReasonCounts?: Readonly<Record<string, number>>;
}): Partial<ContextBudgetDiagnostic> {
  return {
    semanticCompactEnabled: true,
    ...compactionDecisionDiagnosticPatch({
      stage: 'activeStep',
      sourceKind: 'providerMessages',
      boundaryKind: 'semanticCompact',
      decision: input.decision,
      ...(input.boundaryIds ? { boundaryIds: input.boundaryIds } : {}),
      ...(input.coverage ? {
        coverage: {
          turnIds: input.coverage.turnIds,
          runtimeEventIds: input.coverage.runtimeEventIds,
          toolCallIds: input.coverage.toolCallIds,
          contentKinds: input.coverage.contentKinds,
          bodySha256: input.coverage.bodySha256,
        },
      } : {}),
      ...(input.estimatedTokensBefore !== undefined ? { estimatedTokensBefore: input.estimatedTokensBefore } : {}),
      ...(input.estimatedTokensAfter !== undefined ? { estimatedTokensAfter: input.estimatedTokensAfter } : {}),
      ...(input.estimatedTokensSaved !== undefined ? { estimatedTokensSaved: input.estimatedTokensSaved } : {}),
      ...(input.compactCallUsage ? { compactCallUsage: input.compactCallUsage } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.failOpenReason ? { failOpenReason: input.failOpenReason } : {}),
      ...(input.skippedReasonCounts ? { skippedReasonCounts: input.skippedReasonCounts } : {}),
      ...(input.validationReasonCounts ? { validationReasonCounts: input.validationReasonCounts } : {}),
    }),
  };
}

async function callSummarizerWithTimeout(
  summarizer: SemanticCompactSummarizer,
  request: SemanticCompactSummaryRequest,
  timeoutMs: number | undefined,
): Promise<CompactSummaryResult> {
  if (!timeoutMs || timeoutMs <= 0) return Promise.resolve(summarizer(request));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('semantic compact summarizer timeout')), timeoutMs);
  const parentAbort = () => controller.abort(request.abortSignal?.reason);
  request.abortSignal?.addEventListener('abort', parentAbort, { once: true });
  try {
    return await Promise.resolve(summarizer({ ...request, abortSignal: controller.signal }));
  } finally {
    clearTimeout(timer);
    request.abortSignal?.removeEventListener('abort', parentAbort);
  }
}

function estimatePostReplacementTokens(
  index: ActiveFullCompactSourceIndex,
  selectedTokens: number,
  renderedReplacement: string,
  charsPerToken: number,
): number {
  return Math.max(0, index.estimatedTokens - selectedTokens + estimateTokens(renderedReplacement.length, charsPerToken));
}

function preservedTailMessageIndexes(
  index: ActiveFullCompactSourceIndex,
  selection: { endMessageIndex: number },
): number[] {
  const indexes = new Set<number>();
  for (let cursor = selection.endMessageIndex + 1; cursor < index.providerMessageCount; cursor += 1) {
    indexes.add(cursor);
  }
  return [...indexes].sort((a, b) => a - b);
}

function selectedSourceText(
  selection: { startMessageIndex: number; endMessageIndex: number },
  messages: readonly ModelMessage[],
): string {
  return stableStringify(messages.slice(selection.startMessageIndex, selection.endMessageIndex + 1));
}

function normalizeSummaryText(text: string): string {
  return text.trim().replace(/\n{4,}/g, '\n\n\n');
}

function semanticSummaryContractRejectionReason(summaryText: string): string | undefined {
  if (!extractSummaryField(summaryText, SUMMARY_FIELD_LABELS.objective)) {
    return 'summary_missing_current_objective';
  }
  if (!extractSummaryField(summaryText, SUMMARY_FIELD_LABELS.nextAction)) {
    return 'summary_missing_next_action';
  }
  return undefined;
}

function extractSummaryField(summaryText: string, labels: readonly string[]): string | undefined {
  const lines = summaryText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_ ]{0,64})\s*:\s*(.*)$/);
    if (!match) continue;
    const label = match[1]!.trim().toLowerCase().replace(/\s+/g, ' ');
    const wanted = labels.map((value) => value.toLowerCase().replace(/_/g, ' '));
    if (!wanted.includes(label.replace(/_/g, ' '))) continue;
    const inlineValue = match[2]!.trim();
    if (inlineValue.length > 0) return inlineValue;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\s*[A-Za-z_][A-Za-z0-9_ ]{0,64}\s*:/.test(lines[cursor]!)) break;
      const continuation = lines[cursor]!.trim();
      if (continuation.length > 0) return continuation;
    }
  }
  return undefined;
}

function newPrivateVerifierSurface(summaryText: string, publicSourceText: string): boolean {
  return PRIVATE_VERIFIER_PATTERN.test(summaryText) && !PRIVATE_VERIFIER_PATTERN.test(publicSourceText);
}

function rejected(
  messages: ModelMessage[],
  index: ActiveFullCompactSourceIndex,
  reason: string,
  compactCallUsage?: SemanticCompactBlock['compactCallUsage'],
): SemanticCompactRewriteResult {
  return {
    messages,
    decision: 'unchanged',
    reason,
    diagnosticPatch: semanticCompactDecisionDiagnosticPatch({
      decision: 'unchanged',
      reason,
      estimatedTokensBefore: index.estimatedTokens,
      estimatedTokensAfter: index.estimatedTokens,
      estimatedTokensSaved: 0,
      ...(compactCallUsage ? { compactCallUsage } : {}),
    }),
  };
}

function unchanged(messages: ModelMessage[], reason: string): SemanticCompactRewriteResult {
  return {
    messages,
    decision: 'unchanged',
    reason,
    diagnosticPatch: semanticCompactDecisionDiagnosticPatch({
      decision: 'unchanged',
      reason,
    }),
  };
}

function compactUsage(usage: NormalizedAiSdkUsage): NonNullable<SemanticCompactBlock['compactCallUsage']> {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadInputTokens: usage.cacheHitInputTokens,
    cacheWriteInputTokens: usage.cacheWriteInputTokens,
    totalTokens: usage.totalTokens,
  };
}

function uniqueArchiveRefs(refs: readonly ActiveFullCompactArchiveRef[]): ActiveFullCompactArchiveRef[] {
  const seen = new Set<string>();
  const out: ActiveFullCompactArchiveRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.artifactId}:${ref.bodySha256}:${ref.toolCallId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function isArchiveRef(value: unknown): value is ActiveFullCompactArchiveRef {
  return isRecord(value)
    && (value.kind === 'toolResult' || value.kind === 'compactSource')
    && typeof value.artifactId === 'string'
    && typeof value.bodySha256 === 'string';
}

function finiteRatio(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(0, Math.min(1, value));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])]),
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
