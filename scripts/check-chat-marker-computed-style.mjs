#!/usr/bin/env node
/**
 * Zero-visual proof for the chat `Marker` migration (#332 / PR2 #337).
 *
 * #332 requires the governance pass to be "locked by computed-style /
 * cascade contract tests + before/after screenshots". The cascade
 * contract tests (apps/desktop/.../chat-marker-cascade-contract.test.ts,
 * packages/ui/.../chat-primitives.test.ts) assert the source strings.
 * This script is the rendered half: a re-runnable before/after check that
 * loads the REAL built renderer CSS from both `main` and the PR branch
 * into a headless window and diffs `getComputedStyle` for the migrated
 * chrome. It is the deterministic equivalent of a before/after screenshot
 * for the resting surface — `scripts/diff-screenshots.mjs` documents why
 * byte/pixel image diffs are too jittery to gate on (font rasterization
 * drifts ~70/88 PNGs between runs); computed style does not.
 *
 * What this renders + diffs `main` vs head: the resting box / typography /
 * color / transition style of all 9 migrated families, plus the footer
 * action across resting / pending / copy-pending / copied / failed —
 * including `main`'s old pending `secondary` variant vs the new always-
 * `quiet` shell, which proves that variant switch was visually inert (the
 * reason this PR drops it). The DOM mirrors `TurnView` nesting (chips in a
 * summary, actions in a footer, badges in a lineage row) so positional
 * pseudo-classes and inheritance resolve as in production.
 *
 * What is NOT rendered here, and why — locked by the cascade contract's
 * exact source-string literals instead (each a LEAF literalization where
 * source == computed holds by construction):
 *   - `:hover` / `:focus-visible` / `:focus-within`: a headless
 *     (`show: false`) window has no live pointer/focus, and NEITHER the
 *     DevTools `CSS.forcePseudoState` protocol NOR a synthetic
 *     `sendInputEvent` mouse-move changes what `getComputedStyle` returns
 *     here (verified: resting == "hovered"). So these can't be rendered in
 *     this harness. Their NON-leaf merge winner is instead a deterministic
 *     specificity fact: the marker's `[&:hover:not(:disabled)]` (0,3,0)
 *     outranks UiButton quiet's `hover:bg-muted` (0,2,0), exactly as the
 *     retired `.maka-turn-footer-action:hover:not(:disabled)` did on main.
 *   - the `::before` middot pseudo-elements (summary-chip / failed-recovery):
 *     Tailwind compiles `before:content-['·']` through a `--tw-content`
 *     registered `@property`, which `getComputedStyle(el, '::before')` reads
 *     back as `content: none` in this isolated-CSS harness — a rendered
 *     probe would be a misleading green.
 * So this is a rendered proof of the RESTING surface, not a complete
 * screenshot equivalent. (Buttons may also read the UA `buttonface`
 * background here identically on both sides; the diff is what's asserted,
 * not absolute production fidelity for that one property.)
 *
 * Usage (run from repo root, needs Electron + both built CSS bundles):
 *
 *   # 1. Build THIS branch's renderer CSS:
 *   npm --workspace @maka/desktop run build:renderer
 *   cp apps/desktop/dist/renderer/assets/*.css /tmp/head.css
 *   # 2. Build the @maka/ui dist this script imports the cva tables from:
 *   npm --workspace @maka/ui run build
 *   # 3. Build `main`'s renderer CSS the same way from a clean checkout of
 *   #    the 6 migrated files, save to /tmp/main.css, restore HEAD.
 *   # 4. Diff:
 *   npx electron scripts/check-chat-marker-computed-style.mjs /tmp/main.css /tmp/head.css
 *
 * Exits 0 when every element is identical across both bundles, non-zero
 * (with a per-property diff dump) otherwise.
 */

import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { buttonVariants, cn } = await import(pathToFileURL(resolve(REPO_ROOT, 'packages/ui/dist/ui.js')).href);
const { markerVariants } = await import(pathToFileURL(resolve(REPO_ROOT, 'packages/ui/dist/primitives/chat.js')).href);

const mainCssPath = process.argv[2] && resolve(process.argv[2]);
const headCssPath = process.argv[3] && resolve(process.argv[3]);
if (!mainCssPath || !headCssPath || !existsSync(mainCssPath) || !existsSync(headCssPath)) {
  console.error('usage: npx electron scripts/check-chat-marker-computed-style.mjs <main.css> <head.css>');
  console.error('(see the file header for how to build the two renderer CSS bundles)');
  process.exit(2);
}

const bv = (variant, size) => buttonVariants({ variant, size });
const mv = (v) => markerVariants({ variant: v });
const pair = (m, h) => ({ main: m, head: h });
// `main` class (UiButton sm + bespoke, or pure bespoke) vs head class
// (UiButton nav + marker, or pure marker). The footer action is `quiet` in
// EVERY head state — the inert pending `secondary` branch is dropped — so
// its head column is always `quiet`, matched against `main`'s pending-time
// `secondary` to prove that switch was pixel-equal.
const fa = (variant) => pair(cn(bv(variant, 'sm'), 'maka-turn-footer-action'), cn(bv('quiet', 'nav'), mv('footer-action')));
const lb = pair(cn(bv('quiet', 'sm'), 'maka-turn-lineage-badge'), cn(bv('quiet', 'nav'), mv('lineage-badge')));

// DOM tree mirroring TurnView nesting.
const TREE = (side) => {
  const C = (p) => p[side];
  const el = (tag, id, p, attrs, kids = '') => `<${tag} id="${id}" class="${C(p)}" ${attrs}>${kids}</${tag}>`;
  const action = (id, p, attrs) => el('button', id, p, `${attrs} type="button"`, '<svg width="11" height="11"></svg><span>复制中…</span>');
  const chip = (id) => el('span', id, pair('maka-turn-summary-chip', mv('summary-chip')), 'data-kind="model"', '<span>x</span>');
  return [
    el('div', 'summary', pair('maka-turn-summary', mv('summary')), '', chip('summary-chip-1') + chip('summary-chip-2')),
    el('div', 'footer', pair('maka-turn-footer', mv('footer')), 'role="toolbar"',
      action('footer-rest', fa('quiet'), '') +
      action('footer-pending', fa('secondary'), 'data-pending="true" aria-busy="true"') +
      action('footer-copy-pending', fa('secondary'), 'data-pending="true" data-copy-feedback="pending" aria-busy="true" disabled aria-disabled="true"') +
      action('footer-copied', fa('quiet'), 'data-copy-feedback="copied"') +
      action('footer-failed', fa('quiet'), 'data-copy-feedback="failed"')),
    el('div', 'lineage-row', pair('maka-turn-lineage-row', mv('lineage-row')), '',
      action('lineage-fwd', lb, 'data-direction="forward"') + action('lineage-rev', lb, 'data-direction="reverse"')),
    el('div', 'aborted', pair('maka-turn-aborted-marker', mv('aborted')), '', '<span>x</span>'),
    el('div', 'failed-banner', pair('maka-turn-failed-banner', mv('failed-banner')), '',
      '<span>x</span>' + el('span', 'failed-recovery', pair('maka-turn-failed-recovery', mv('failed-recovery')), '', '<span>x</span>')),
  ].join('\n');
};

const PROPS = ['display', 'height', 'minHeight', 'width', 'maxWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderTopStyle', 'borderTopLeftRadius', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'columnGap', 'color', 'backgroundColor', 'opacity', 'transition', 'justifyContent', 'alignItems', 'flexWrap', 'fontVariantNumeric', 'whiteSpace', 'textAlign', 'cursor'];
const IDS = ['summary', 'summary-chip-1', 'summary-chip-2', 'footer', 'footer-rest', 'footer-pending', 'footer-copy-pending', 'footer-copied', 'footer-failed', 'lineage-row', 'lineage-fwd', 'lineage-rev', 'aborted', 'failed-banner', 'failed-recovery'];

function pageHtml(cssPath, side) {
  return `<!doctype html><html><head><meta charset="utf8"><link rel="stylesheet" href="${pathToFileURL(cssPath).href}"></head>
<body style="background:#fff"><div data-slot="message" data-role="assistant"><div class="maka-turn" style="width:680px">${TREE(side)}</div></div></body></html>`;
}

async function read(win, cssPath, side) {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml(cssPath, side)));
  return win.webContents.executeJavaScript(`(${JSON.stringify(IDS)}).reduce((acc, id) => {
    const cs = getComputedStyle(document.getElementById(id));
    const o = {}; for (const p of ${JSON.stringify(PROPS)}) o[p] = cs[p];
    acc[id] = o; return acc;
  }, {})`);
}

app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { sandbox: false } });
  const main = await read(win, mainCssPath, 'main');
  const head = await read(win, headCssPath, 'head');
  let total = 0;
  for (const id of IDS) {
    const diffs = PROPS.filter((p) => main[id][p] !== head[id][p]).map((p) => `${p}: main=${JSON.stringify(main[id][p])} head=${JSON.stringify(head[id][p])}`);
    total += diffs.length;
    if (diffs.length === 0) console.log(`  ok ${id}: ${PROPS.length}/${PROPS.length} identical`);
    else { console.log(`  XX ${id}: ${diffs.length} DIFF`); for (const d of diffs) console.log(`       ${d}`); }
  }
  console.log(`\n${IDS.length} resting element/state rows x ${PROPS.length} properties — TOTAL DIFFS: ${total}`);
  app.exit(total === 0 ? 0 : 1);
});
