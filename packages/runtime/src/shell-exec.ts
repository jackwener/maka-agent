// packages/runtime/src/shell-exec.ts
//
// Single shared shell runner for BOTH Bash paths — the in-process builtin Bash
// tool (builtin-tools.ts) and the Harbor/local isolated executor
// (headless/harbor-cell.ts).
//
// WHY THIS EXISTS: the builtin streamed via spawn with a memory-bounded tail,
// but the Harbor executor used execAsync({ maxBuffer }). A command whose output
// passed maxBuffer was KILLED mid-run and only its first maxBuffer bytes (the
// HEAD) were returned — so the benchmark path never delivered the recoverable,
// bounded TAIL the builtin did, and reported a wrong (killed) exit code. This
// module is the one place a shell command runs: it streams stdout/stderr into a
// BashTailBuffer (keeping only the last `maxRetainedChars` per stream) and lets
// the command run to completion regardless of output size.
//
// It is the dumb core: it always RESOLVES with { exitCode, stdout, stderr,
// timedOut, aborted }, rejecting only when the process cannot be spawned at all.
// Each caller maps that to its own contract — the builtin throws on
// timeout/abort/non-zero; the Harbor executor returns the result verbatim.

import { spawn } from 'node:child_process';
import { BashTailBuffer } from './bash-tail-buffer.js';

// Per-stream cap on the output RETAINED for the result (~1MB). The full stream
// is still delivered live via emitOutput; this only bounds what is kept to
// return. The tool layer (truncateToolOutput) trims this further to the model's
// budget. Shared so both Bash paths retain identically.
export const BASH_MAX_RETAINED_CHARS = 1024 * 1024;

export interface BoundedShellOptions {
  cwd: string;
  /** Hard wall-clock cap; the child is SIGTERM'd and `timedOut` is set. */
  timeoutMs: number;
  /** Per-stream retained-tail cap in characters. Defaults to BASH_MAX_RETAINED_CHARS. */
  maxRetainedChars?: number;
  /** Child environment. Defaults to the parent process env (spawn's default). */
  env?: NodeJS.ProcessEnv;
  /** Aborts the child (sets `aborted`). */
  abortSignal?: AbortSignal;
  /** Receives every raw chunk live, before tail-bounding. */
  emitOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

export interface BoundedShellResult {
  exitCode: number;
  /** Last `maxRetainedChars` of stdout (line-aligned; see BashTailBuffer). */
  stdout: string;
  /** Last `maxRetainedChars` of stderr. */
  stderr: string;
  /** The command exceeded timeoutMs and was killed. */
  timedOut: boolean;
  /** The abortSignal fired and the command was killed. */
  aborted: boolean;
}

/**
 * Run `command` in a shell, streaming output into a memory-bounded tail. Never
 * kills the command for producing too much output — it keeps only the last
 * `maxRetainedChars` per stream. Resolves with the result (including timeout /
 * abort flags); rejects only when the process cannot be spawned.
 */
export function runShellWithBoundedTail(
  command: string,
  options: BoundedShellOptions,
): Promise<BoundedShellResult> {
  const cap = options.maxRetainedChars ?? BASH_MAX_RETAINED_CHARS;
  return new Promise<BoundedShellResult>((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      env: options.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutBuf = new BashTailBuffer(cap);
    const stderrBuf = new BashTailBuffer(cap);
    let settled = false;

    const timer = setTimeout(() => finish({ timedOut: true }), options.timeoutMs);

    const abort = () => finish({ aborted: true });
    if (options.abortSignal) {
      if (options.abortSignal.aborted) abort();
      else options.abortSignal.addEventListener('abort', abort, { once: true });
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => append('stdout', chunk));
    child.stderr?.on('data', (chunk: string) => append('stderr', chunk));
    child.on('error', (error: Error) => {
      // The process could not be spawned at all (e.g. the shell binary is
      // missing). This is exceptional — reject so callers surface it.
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.on('close', (code, signal) => finish({ exitCode: code ?? (signal ? 128 : 1) }));

    function append(stream: 'stdout' | 'stderr', chunk: string): void {
      if (stream === 'stdout') stdoutBuf.push(chunk);
      else stderrBuf.push(chunk);
      options.emitOutput?.(stream, chunk);
    }

    // Settle once. On timeout/abort we kill and resolve immediately (with the
    // tail captured so far) rather than waiting for 'close', so a child that
    // ignores SIGTERM cannot hang the promise. A later 'close' is a no-op.
    function finish(outcome: { exitCode?: number; timedOut?: boolean; aborted?: boolean }): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome.timedOut || outcome.aborted) child.kill('SIGTERM');
      resolvePromise({
        exitCode: outcome.exitCode ?? (outcome.timedOut ? 124 : outcome.aborted ? 130 : 1),
        stdout: stdoutBuf.value(),
        stderr: stderrBuf.value(),
        timedOut: !!outcome.timedOut,
        aborted: !!outcome.aborted,
      });
    }

    function cleanup(): void {
      clearTimeout(timer);
      if (options.abortSignal) options.abortSignal.removeEventListener('abort', abort);
    }
  });
}
