import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, TOKENS_FILE, readAllRendererCss, stripCssComments } from './css-test-helpers.js';

/**
 * Zero-visual governance contract for issue #332 PR3 — the tool live-output
 * stream (`ToolOutputStream`) moved onto the `@maka/ui` chat substrate: the
 * panel/header/counts/body/chunk shell onto the `streamVariants` literalize
 * table, and the pulsing "live" dot onto the governed `LiveIndicator` primitive.
 *
 * The shell halves of "zero visual change" are locked the same way as PR2: the
 * bespoke `.maka-tool-output-stream-*` selectors are retired and each literal
 * compiles 1:1 to the declaration it replaced. The dot is the exception — an
 * animation can't be a leaf-literal and `getComputedStyle` reads a phase-
 * dependent value, so its breath is pinned by the canonical `@keyframes
 * maka-pulse` (frames asserted below) plus the literals in `chat.tsx`, verified
 * by before/after screenshots rather than the computed-style diff harness.
 */
describe('chat tool-output stream migration contract (#332 PR3)', () => {
  it('retires the bespoke stream shell selectors + the per-feature pulse keyframe', async () => {
    const css = stripCssComments(await readAllRendererCss());
    for (const selector of [
      '.maka-tool-output-stream',
      '.maka-tool-output-stream-header',
      '.maka-tool-output-stream-label',
      '.maka-tool-output-stream-dot',
      '.maka-tool-output-stream-counts',
      '.maka-tool-output-stream-body',
      '.maka-tool-output-stream-chunk',
      '.maka-tool-output-stream-redacted-tag',
      '.maka-tool-output-stream-truncated-tag',
      // the dot's per-feature breath is retired onto the shared `maka-pulse`.
      '@keyframes maka-tool-output-stream-pulse',
    ]) {
      assert.ok(
        !css.includes(selector),
        `retired stream selector "${selector}" still present in renderer CSS`,
      );
    }
  });

  it('keeps the governed canonical pulse keyframe with the retired dot frames', async () => {
    const tokens = stripCssComments(await readFile(TOKENS_FILE, 'utf8'));
    assert.ok(
      tokens.includes('@keyframes maka-pulse'),
      'canonical `@keyframes maka-pulse` must live in maka-tokens.css (the shared motion home)',
    );
    // The frames mirror the retired `maka-tool-output-stream-pulse` exactly
    // (rest opacity 0.55, scale 1 → 1.1). This is the dot's zero-visual proof —
    // it can't be machine-diffed, so the values are pinned here.
    const pulse = tokens.slice(
      tokens.indexOf('@keyframes maka-pulse'),
      tokens.indexOf('@keyframes maka-pulse') + 220,
    );
    for (const frame of [
      'opacity: 0.55',
      'transform: scale(1)',
      'opacity: 1',
      'transform: scale(1.1)',
    ]) {
      assert.ok(pulse.includes(frame), `maka-pulse must pin the retired dot frame "${frame}"`);
    }
  });

  it('pins the stream parts + live indicator to the retired stream pixels/tokens', async () => {
    const rawSrc = await readFile(
      resolve(REPO_ROOT, 'packages', 'ui', 'src', 'primitives', 'chat.tsx'),
      'utf8',
    );
    // Strip comments so the assertions reflect real classNames, not prose.
    const chatSrc = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const streamBlock = chatSrc.slice(chatSrc.indexOf('streamVariants'));
    // Each fragment is a LITERAL arbitrary utility that compiles 1:1 to the
    // declaration it replaces on a leaf element — asserting the source string is
    // equivalent to asserting the computed style. Values mirror the retired
    // `.maka-tool-output-stream-*` rules exactly (pixels, rem, oklch relative-
    // color tints, var() tokens) and never the semantic scale.
    for (const literal of [
      // container shell + the live accent ring (data-variant so it only paints
      // while running, like the retired `[data-live="true"]` selector).
      'rounded-[8px] border border-[var(--border)] bg-[var(--background)]',
      'data-[live=true]:border-[oklch(from_var(--accent)_l_c_h_/_0.40)]',
      'data-[live=true]:[box-shadow:inset_0_0_0_1px_oklch(from_var(--accent)_l_c_h_/_0.06)]',
      // header
      'border-b border-[var(--border)] bg-[var(--foreground-3)]',
      'text-[0.72rem] uppercase tracking-[0.06em]',
      // counts + every count `data-[…]` conditional is pinned.
      '[font-variant-numeric:tabular-nums]',
      'data-[stream=stderr]:text-[color:var(--destructive-text)]',
      'data-[redacted=true]:text-[color:var(--warning-text,var(--info-text))]',
      'data-[truncated=true]:bg-[oklch(from_var(--warning)_l_c_h_/_0.06)]',
      'data-[truncated=true]:cursor-help',
      // body — `word-break:break-word` stays literal (Tailwind `break-words` is
      // the different `overflow-wrap` property).
      'max-h-[220px] overflow-y-auto whitespace-pre-wrap [word-break:break-word]',
      '[font-family:var(--font-mono)] text-[0.78rem] leading-[1.5]',
      '[scroll-behavior:auto]',
      // chunk + redacted tag
      'contents data-[stream=stderr]:text-[color:var(--destructive-text)] data-[redacted=true]:opacity-[0.65]',
      'bg-[oklch(from_var(--warning,var(--info))_l_c_h_/_0.10)]',
    ]) {
      assert.ok(
        streamBlock.includes(literal),
        `streamVariants must carry the literal "${literal}" mirroring the retired stream CSS`,
      );
    }
    // The live indicator's animation reference + reduced-motion fallback — the
    // one part that escapes the diff harness, pinned here.
    const liveBlock = chatSrc.slice(chatSrc.indexOf('function LiveIndicator'));
    for (const literal of [
      'w-[6px] h-[6px] rounded-[50%] bg-[var(--accent)]',
      '[animation:maka-pulse_1.4s_ease-in-out_infinite]',
      'motion-reduce:[animation:none] motion-reduce:opacity-[0.8]',
    ]) {
      assert.ok(
        liveBlock.includes(literal),
        `LiveIndicator must carry the literal "${literal}" mirroring the retired dot`,
      );
    }
    // Never the semantic scale, a primary/accent recolor, or Tailwind's built-in
    // `animate-pulse` (a different opacity-only keyframe).
    for (const banned of ['rounded-lg', 'rounded-md', 'bg-primary', 'animate-pulse']) {
      assert.ok(
        !streamBlock.includes(banned),
        `stream/live variants must stay literal, not "${banned}"`,
      );
    }
  });
});
