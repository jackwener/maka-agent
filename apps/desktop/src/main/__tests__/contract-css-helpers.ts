import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readAllRendererCss } from './css-test-helpers.js';

export const CONTRACT_REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
export const CONTRACT_RENDERER_ROOT = resolve(CONTRACT_REPO_ROOT, 'apps', 'desktop', 'src', 'renderer');
export const CONTRACT_STYLES_ENTRY = resolve(CONTRACT_RENDERER_ROOT, 'styles.css');

export async function readRendererContractCss(): Promise<string> {
  try {
    return await readAllRendererCss();
  } catch {
    // Pre-split branches only have styles.css.
    return readFile(CONTRACT_STYLES_ENTRY, 'utf8');
  }
}
