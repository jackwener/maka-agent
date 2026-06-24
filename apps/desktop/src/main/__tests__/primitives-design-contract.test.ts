/**
 * PR-FE-BUG-HUNT-13 (kenji aesthetic-audit reminder 4-6, findings #3 + #4):
 * lock the design-system escape hatches in drawer.tsx + tabs.tsx.
 *
 * Sibling of PR-FE-BUG-HUNT-12 (which locked `packages/ui/src/ui.tsx`).
 * Same approach: pin the EXACT escape-hatch count in each primitive,
 * fail when new ones creep in OR when stale allowlist entries point
 * at content that no longer exists.
 *
 * Why these aren't removed in this PR:
 *
 * - drawer.tsx has 2 sites of `cubic-bezier(0.32,0.72,0,1)` + 2 sites
 *   of `duration-450` + a `transition-[transform,box-shadow,height,
 *   background-color]` block. Animating `height` is layout-trigger
 *   and would normally fail the motion contract — but drawer height
 *   is computed from snap points (peek / half / full), and a
 *   `transform: scaleY` would distort children. Layout-property
 *   transition is intentional. The raw cubic-bezier curve should
 *   eventually move to a `--ease-drawer` token; that's a follow-up.
 *
 * - tabs.tsx has 1 site of `transition-[width,translate] duration-200
 *   ease-in-out` on the active-tab indicator. Animating `width` is
 *   layout-trigger; the cleaner pattern is `transform: scaleX` with
 *   an offset. That refactor is a follow-up — the contract just locks
 *   the perimeter so a fifth or sixth bare site can't slip in.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const DRAWER_FILE = resolve(REPO_ROOT, 'packages/ui/src/primitives/drawer.tsx');
const TABS_FILE = resolve(REPO_ROOT, 'packages/ui/src/primitives/tabs.tsx');

const DRAWER_ALLOWED: ReadonlyArray<{ pattern: string; count: number; reason: string }> = [
  {
    pattern: 'cubic-bezier(0.32,0.72,0,1)',
    count: 2,
    reason:
      'iOS-style drawer settle curve. Used on both the backdrop opacity transition and the popup transform transition. Should eventually move to --ease-drawer token in maka-tokens.css.',
  },
  {
    pattern: 'duration-450',
    count: 2,
    reason:
      'drawer settle duration. Sits between --duration-emphasized and --duration-large; doesn\'t match any current token. Should eventually be tokenized.',
  },
  {
    pattern: 'transition-[transform,box-shadow,height,background-color]',
    count: 1,
    reason:
      'drawer popup needs to animate height because snap points (peek / half / full) drive variable height; transform: scaleY would distort children. Layout-property transition is intentional here.',
  },
  {
    pattern: 'backdrop-blur-sm',
    count: 1,
    reason:
      'drawer backdrop scrim. Same blur token kenji audit #6 wants to settle for the whole app; pending decision.',
  },
  {
    pattern: 'z-50',
    count: 1,
    reason:
      'drawer backdrop overlay layer. Same z-50 convention used in dialog/sheet/tooltip/select/popover; pending tokenization.',
  },
];

const TABS_ALLOWED: ReadonlyArray<{ pattern: string; count: number; reason: string }> = [
  {
    pattern: 'transition-[width,translate]',
    count: 1,
    reason:
      'active-tab indicator animates width because tabs have variable label widths. Cleaner refactor is `translate + scaleX` with a measured base width, but that needs measurement infrastructure that isn\'t in place. Layout-property transition is acknowledged.',
  },
  {
    pattern: 'duration-200',
    count: 1,
    reason:
      'tabs indicator settle duration. Matches --duration-base (200ms) by value but uses the bare Tailwind utility; could tokenize.',
  },
  {
    pattern: 'ease-in-out',
    count: 1,
    reason:
      'tabs indicator easing. Generic Tailwind easing, not the project\'s canonical --ease-out-strong. Mismatch is small for this micro-motion but flagged for future review.',
  },
];

function countOccurrences(src: string, pattern: string): number {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  return (src.match(regex) ?? []).length;
}

describe('PR-FE-BUG-HUNT-13 drawer.tsx + tabs.tsx design contract', () => {
  it('drawer.tsx escape hatches match the allowlist exactly', async () => {
    const src = await readFile(DRAWER_FILE, 'utf8');
    for (const entry of DRAWER_ALLOWED) {
      assert.equal(
        countOccurrences(src, entry.pattern),
        entry.count,
        `Expected ${entry.count} occurrences of \`${entry.pattern}\` in drawer.tsx, got a different count. Either tokenize the new site or bump the count in DRAWER_ALLOWED with a justification.`,
      );
    }
  });

  it('tabs.tsx escape hatches match the allowlist exactly', async () => {
    const src = await readFile(TABS_FILE, 'utf8');
    for (const entry of TABS_ALLOWED) {
      assert.equal(
        countOccurrences(src, entry.pattern),
        entry.count,
        `Expected ${entry.count} occurrences of \`${entry.pattern}\` in tabs.tsx, got a different count. Either tokenize the new site or bump the count in TABS_ALLOWED with a justification.`,
      );
    }
  });

  it('no unexpected `transition-[<layout-prop>...]` patterns crept into drawer.tsx beyond the allowlisted one', async () => {
    const src = await readFile(DRAWER_FILE, 'utf8');
    // Find every `transition-[...]` bracketed token-list and verify
    // the only one is the allowlisted full string.
    const matches = src.match(/transition-\[[^\]]+\]/g) ?? [];
    const allowedFull = DRAWER_ALLOWED.find((e) => e.pattern.startsWith('transition-['))!.pattern;
    for (const match of matches) {
      assert.equal(
        match,
        allowedFull,
        `Found unexpected \`${match}\` in drawer.tsx. The only allowlisted transition is \`${allowedFull}\`. Add the new one to DRAWER_ALLOWED with a justification or refactor it out.`,
      );
    }
  });

  it('no unexpected `transition-[<layout-prop>...]` patterns crept into tabs.tsx beyond the allowlisted one', async () => {
    const src = await readFile(TABS_FILE, 'utf8');
    const matches = src.match(/transition-\[[^\]]+\]/g) ?? [];
    const allowedFull = TABS_ALLOWED.find((e) => e.pattern.startsWith('transition-['))!.pattern;
    for (const match of matches) {
      assert.equal(
        match,
        allowedFull,
        `Found unexpected \`${match}\` in tabs.tsx. The only allowlisted transition is \`${allowedFull}\`. Add the new one to TABS_ALLOWED with a justification or refactor it out.`,
      );
    }
  });
});
