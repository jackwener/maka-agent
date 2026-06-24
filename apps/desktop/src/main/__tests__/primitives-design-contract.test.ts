/**
 * PR-FE-BUG-HUNT-13 (kenji aesthetic-audit reminder 4-6, findings #3 + #4):
 * lock the design-system escape hatches in drawer.tsx + tabs.tsx.
 *
 * Sibling of PR-FE-BUG-HUNT-12 (which locked `packages/ui/src/ui.tsx`).
 * Same approach: pin the EXACT escape-hatch count in each primitive,
 * fail when new ones creep in OR when stale allowlist entries point
 * at content that no longer exists.
 *
 * Self-review correction: initial draft missed the actual occurrence
 * counts. drawer.tsx has 3 `z-50` sites and 3 distinct
 * `transition-[<list>]` patterns; tabs.tsx has 2. The counts here are
 * derived from `grep -o ... | wc -l` against the current files.
 *
 * Why these aren't removed in this PR — same rationale as PR-FE-BUG-
 * HUNT-12: touching Base UI primitives risks visual breakage, each
 * tokenization needs design review.
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
      "drawer settle duration. Sits between --duration-emphasized and --duration-large; doesn't match any current token. Should eventually be tokenized.",
  },
  {
    pattern: 'transition-[transform,box-shadow,height,background-color]',
    count: 1,
    reason:
      'drawer popup base. Animates height because snap points (peek / half / full) drive variable height; transform: scaleY would distort children. Layout-property transition is intentional.',
  },
  {
    pattern: 'transition-[transform,box-shadow,height,background-color,margin,padding]',
    count: 1,
    reason:
      'drawer popup bottom-edge rule extends the base with `margin` + `padding` so the safe-area inset can settle smoothly. EVEN MORE layout-trigger than the base transition (height + margin + padding all trigger reflow). Tracked as a known higher-cost exception; refactor is a separate effort.',
  },
  {
    pattern: 'transition-[background-color,box-shadow]',
    count: 1,
    reason:
      'drawer-internal switch handle. Paint-only transition (no layout properties). Safe; allowlisted for completeness so the sweep test passes.',
  },
  {
    pattern: 'backdrop-blur-sm',
    count: 1,
    reason:
      'drawer backdrop scrim. Same blur kenji audit #6 wants to settle for the whole app; pending decision.',
  },
  {
    pattern: 'z-50',
    count: 3,
    reason:
      'drawer has 3 sibling overlay layers stacked at z-50: gesture-target wrapper (~line 81), backdrop scrim (~line 101), dismissable cushion overlay (~line 122). Same convention used in dialog/sheet/tooltip/select/popover; pending tokenization.',
  },
];

const TABS_ALLOWED: ReadonlyArray<{ pattern: string; count: number; reason: string }> = [
  {
    pattern: 'transition-[width,translate]',
    count: 1,
    reason:
      "tabs active-indicator animates width because tabs have variable label widths. Cleaner refactor is `translate + scaleX` with a measured base width, but that needs measurement infrastructure that isn't in place. Layout-property transition is acknowledged.",
  },
  {
    pattern: 'transition-[color,background-color,box-shadow]',
    count: 1,
    reason:
      'tabs trigger paint transition. No layout properties. Safe; allowlisted for completeness.',
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
      "tabs indicator easing. Generic Tailwind easing, not the project's canonical --ease-out-strong. Mismatch is small for this micro-motion but flagged for future review.",
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

  it('no unexpected `transition-[<bracketed-list>]` patterns crept into drawer.tsx', async () => {
    const src = await readFile(DRAWER_FILE, 'utf8');
    const found = new Set(src.match(/transition-\[[^\]]+\]/g) ?? []);
    const allowed = new Set(
      DRAWER_ALLOWED.filter((e) => e.pattern.startsWith('transition-[')).map((e) => e.pattern),
    );
    const unexpected = [...found].filter((m) => !allowed.has(m));
    assert.deepEqual(
      unexpected,
      [],
      `Found unexpected transition-[<bracketed>] patterns in drawer.tsx: ${JSON.stringify(unexpected)}. Add to DRAWER_ALLOWED with a justification, or refactor.`,
    );
  });

  it('no unexpected `transition-[<bracketed-list>]` patterns crept into tabs.tsx', async () => {
    const src = await readFile(TABS_FILE, 'utf8');
    const found = new Set(src.match(/transition-\[[^\]]+\]/g) ?? []);
    const allowed = new Set(
      TABS_ALLOWED.filter((e) => e.pattern.startsWith('transition-[')).map((e) => e.pattern),
    );
    const unexpected = [...found].filter((m) => !allowed.has(m));
    assert.deepEqual(
      unexpected,
      [],
      `Found unexpected transition-[<bracketed>] patterns in tabs.tsx: ${JSON.stringify(unexpected)}. Add to TABS_ALLOWED with a justification, or refactor.`,
    );
  });
});
