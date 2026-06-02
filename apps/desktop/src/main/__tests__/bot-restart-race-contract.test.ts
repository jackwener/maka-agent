/**
 * Source-grounded contract for PR-BOT-RESTART-RACE-0 (WAWQAQ msg
 * 23c079a9 round 6). Pins two restart-flow fixes so future edits
 * can't silently regress them.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd(), '..', '..');
const SETTINGS_MODAL = resolve(
  REPO_ROOT, 'apps', 'desktop', 'src', 'renderer', 'settings', 'SettingsModal.tsx',
);

describe('Bot restart flow contract (PR-BOT-RESTART-RACE-0)', () => {
  it('restart button stays mounted while a restart is in-flight', async () => {
    const src = await readFile(SETTINGS_MODAL, 'utf8');
    // The condition gating the restart button must include
    // `restarting` so the button doesn't unmount when the bridge's
    // running flag transiently flips false during reconcileOne.
    // Without this, `disabled={restarting}` does nothing because
    // the whole control is gone before the user sees feedback.
    assert.match(
      src,
      /support === 'runtime' && \(selectedStatus\?\.running\s*\|\|\s*restarting\)/,
      'restart button visibility must OR with `restarting` so it persists through the bridge stop→start cycle',
    );
  });

  it('restart error toast falls back to actionable copy when message is empty', async () => {
    const src = await readFile(SETTINGS_MODAL, 'utf8');
    // Some bridges throw `new Error()` with no message; a blank
    // detail panel is worse than a generic next-step hint. The
    // restart catch must guard against empty / whitespace-only
    // error messages.
    const restartCatch = src.match(/async function restartChannel\(\)[\s\S]*?\n  \}/);
    assert.ok(restartCatch, 'restartChannel must exist');
    assert.match(
      restartCatch[0],
      /raw\.trim\(\)\s*\|\|\s*['"]未知错误[^'"]*['"]/,
      'restart catch must fall back when error.message is empty / whitespace',
    );
  });
});
