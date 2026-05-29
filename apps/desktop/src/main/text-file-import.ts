import { basename } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

export const MAX_IMPORTED_TEXT_FILE_BYTES = 200_000;
export const MAX_IMPORTED_TEXT_FILE_CHARS = 20_000;

export type TextFileImportFailureReason =
  | 'missing'
  | 'too-large'
  | 'binary'
  | 'read-failed';

export type TextFileImportResult =
  | {
      ok: true;
      name: string;
      bytes: number;
      truncated: boolean;
      prompt: string;
    }
  | {
      ok: false;
      reason: TextFileImportFailureReason;
    };

export async function readTextFileForPromptImport(filePath: string): Promise<TextFileImportResult> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (!fileStat.isFile()) return { ok: false, reason: 'missing' };
  if (fileStat.size > MAX_IMPORTED_TEXT_FILE_BYTES) return { ok: false, reason: 'too-large' };

  let raw: Buffer;
  try {
    raw = await readFile(filePath);
  } catch {
    return { ok: false, reason: 'read-failed' };
  }
  if (looksBinary(raw)) return { ok: false, reason: 'binary' };

  const cleaned = raw.toString('utf8').replace(/\u0000/g, '').trim();
  if (!cleaned) return { ok: false, reason: 'binary' };

  const chars = Array.from(cleaned);
  const truncated = chars.length > MAX_IMPORTED_TEXT_FILE_CHARS;
  const text = truncated ? chars.slice(0, MAX_IMPORTED_TEXT_FILE_CHARS).join('') : cleaned;
  const name = basename(filePath);
  return {
    ok: true,
    name,
    bytes: fileStat.size,
    truncated,
    prompt: formatImportedTextFilePrompt({ name, text, truncated }),
  };
}

export function formatImportedTextFilePrompt(input: { name: string; text: string; truncated: boolean }): string {
  return [
    `请结合下面导入的本地文本文件 "${input.name}" 回答。`,
    input.truncated ? '文件内容过长，下面只包含前一部分。' : '',
    '',
    `<local-text-file name="${escapeXmlAttr(input.name)}">`,
    input.text,
    '</local-text-file>',
  ].filter(Boolean).join('\n');
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.02;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
