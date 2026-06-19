import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import {
  appendFixedPromptWalEvent,
  hashSystemPrompt,
  type PromptCandidateCommittedEvent,
} from './fixed-prompt-controller.js';

export interface TrajectoryDigest {
  taskId: string;
  errorClass?: string;
  summary: string;
}

export interface MetaAgentPromptInput {
  runId: string;
  roundId: string;
  program: string;
  currentSystemPrompt: string;
  resultsTsv: string;
  heldInDigests: readonly TrajectoryDigest[];
}

export interface MetaAgentPromptResult {
  systemPrompt: string;
  summary: string;
}

export type MetaAgent = (input: MetaAgentPromptInput) => Promise<MetaAgentPromptResult>;

export interface PromptCandidateGit {
  changedFiles(): Promise<readonly string[]>;
  commit(message: string): Promise<string>;
}

export interface RunPromptCandidateRoundInput {
  runId: string;
  roundId: string;
  programPath: string;
  systemPromptPath: string;
  resultsTsvPath: string;
  resultsJsonlPath: string;
  heldInDigests: readonly TrajectoryDigest[];
  heldOutDigests?: readonly TrajectoryDigest[];
  metaAgent: MetaAgent;
  git: PromptCandidateGit;
  now?: () => number;
  newId?: () => string;
}

export interface PromptCandidateRoundResult {
  systemPrompt: string;
  summary: string;
  commitSha: string;
}

export async function runPromptCandidateRound(
  input: RunPromptCandidateRoundInput,
): Promise<PromptCandidateRoundResult> {
  const now = input.now ?? Date.now;
  const newId = input.newId ?? randomId;
  const program = await readFile(input.programPath, 'utf8');
  const currentSystemPrompt = await readFile(input.systemPromptPath, 'utf8');
  const resultsTsv = await readFile(input.resultsTsvPath, 'utf8');
  const result = await input.metaAgent({
    runId: input.runId,
    roundId: input.roundId,
    program,
    currentSystemPrompt,
    resultsTsv,
    heldInDigests: input.heldInDigests,
  });

  await writeFile(input.systemPromptPath, result.systemPrompt, 'utf8');
  assertOnlySystemPromptChanged(await input.git.changedFiles(), input.systemPromptPath);
  const commitSha = await input.git.commit(`candidate prompt ${input.roundId}`);
  await appendFixedPromptWalEvent(input.resultsJsonlPath, promptCandidateCommittedEvent({
    runId: input.runId,
    roundId: input.roundId,
    id: newId(),
    ts: now(),
    commitSha,
    summary: result.summary,
    systemPrompt: result.systemPrompt,
  }));
  return {
    systemPrompt: result.systemPrompt,
    summary: result.summary,
    commitSha,
  };
}

function promptCandidateCommittedEvent(input: {
  runId: string;
  roundId: string;
  id: string;
  ts: number;
  commitSha: string;
  summary: string;
  systemPrompt: string;
}): PromptCandidateCommittedEvent {
  return {
    schemaVersion: 1,
    type: 'prompt_candidate_committed',
    id: input.id,
    ts: input.ts,
    runId: input.runId,
    roundId: input.roundId,
    commitSha: input.commitSha,
    summary: input.summary,
    promptHash: hashSystemPrompt(input.systemPrompt),
  };
}

export function assertOnlySystemPromptChanged(
  changedFiles: readonly string[],
  systemPromptPath: string,
): void {
  const allowed = new Set([
    normalizeChangedPath(systemPromptPath),
    basename(systemPromptPath),
    'system_prompt.md',
  ]);
  const unexpected = changedFiles.filter((file) => !allowed.has(normalizeChangedPath(file)));
  if (unexpected.length > 0) {
    throw new Error(`only system_prompt.md may change; unexpected files: ${unexpected.join(', ')}`);
  }
}

function normalizeChangedPath(path: string): string {
  const cwdRelative = relative(process.cwd(), path);
  const normalized = (cwdRelative && !cwdRelative.startsWith('..') ? cwdRelative : path).split('\\').join('/');
  return stripLeadingDotSlash(normalized);
}

function stripLeadingDotSlash(path: string): string {
  let current = path;
  while (current.startsWith('./')) current = current.slice(2);
  return current;
}

function randomId(): string {
  return randomUUID();
}
