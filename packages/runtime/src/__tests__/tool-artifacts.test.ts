import { describe, test } from 'node:test';
import {
  deriveToolArtifactCandidates,
  extractStdoutRedirectPath,
  recordToolArtifactsSafely,
} from '../tool-artifacts.js';
import { expect } from '../test-helpers.js';

describe('deriveToolArtifactCandidates', () => {
  test('Write derives a file-backed candidate from structured result path', () => {
    const [candidate] = deriveToolArtifactCandidates({
      toolName: 'Write',
      cwd: '/workspace/maka',
      args: { path: 'docs/report.html', content: '<h1>Report</h1>' },
      result: { ok: true, path: '/workspace/maka/docs/report.html', bytes: 15 },
    });

    expect(candidate).toEqual({
      kind: 'html',
      name: 'report.html',
      mimeType: 'text/html',
      source: 'tool_result',
      summary: 'Write tool output',
      sourcePath: '/workspace/maka/docs/report.html',
    });
  });

  test('Edit derives a diff candidate from structured edit args', () => {
    const [candidate] = deriveToolArtifactCandidates({
      toolName: 'Edit',
      cwd: '/workspace/maka',
      args: { path: 'src/main.ts', old_string: 'const a = 1;', new_string: 'const a = 2;' },
      result: { ok: true, path: '/workspace/maka/src/main.ts', replacements: 1 },
    });

    expect(candidate?.kind).toBe('diff');
    expect(candidate?.name).toBe('main.ts.diff');
    expect(candidate?.mimeType).toBe('text/x-diff');
    expect(typeof candidate?.content === 'string' && candidate.content.includes('-const a = 1;')).toBe(true);
    expect(typeof candidate?.content === 'string' && candidate.content.includes('+const a = 2;')).toBe(true);
  });

  test('Bash derives only explicit stdout redirects and does not scan stdout/stderr text', () => {
    const [candidate] = deriveToolArtifactCandidates({
      toolName: 'Bash',
      cwd: '/workspace/maka',
      args: { command: 'npm run build > "reports/build.log" 2>&1' },
      result: { stdout: 'wrote /tmp/guessed.html', stderr: 'see report.pdf' },
    });

    expect(candidate?.sourcePath).toBe('/workspace/maka/reports/build.log');
    expect(candidate?.kind).toBe('file');

    expect(deriveToolArtifactCandidates({
      toolName: 'Bash',
      cwd: '/workspace/maka',
      args: { command: 'echo "wrote reports/build.log"' },
      result: { stdout: 'reports/build.log' },
    })).toEqual([]);
  });

  test('extractStdoutRedirectPath ignores stderr and fd redirects', () => {
    expect(extractStdoutRedirectPath('echo ok > out.txt')).toBe('out.txt');
    expect(extractStdoutRedirectPath('echo ok >> ./out.txt')).toBe('./out.txt');
    expect(extractStdoutRedirectPath('echo ok 2> err.log')).toBe(null);
    expect(extractStdoutRedirectPath('echo ok >&2')).toBe(null);
  });
});

describe('recordToolArtifactsSafely', () => {
  test('recorder failure emits a generalized warning and never throws', async () => {
    const warnings: string[] = [];
    await recordToolArtifactsSafely(
      {
        sessionId: 'session-1',
        turnId: 'turn-1',
        toolUseId: 'tool-1',
        toolName: 'Write',
        cwd: '/workspace/maka',
        args: { path: 'secret.txt' },
        result: { ok: true, path: '/workspace/maka/secret.txt' },
      },
      async () => {
        throw new Error('EACCES: sk-secret-token-should-not-leak');
      },
      (message) => warnings.push(message),
    );

    expect(warnings.length).toBe(1);
    expect(warnings[0]?.includes('Artifact recorder skipped:')).toBe(true);
    expect(warnings[0]?.includes('sk-secret-token-should-not-leak')).toBe(false);
  });
});
