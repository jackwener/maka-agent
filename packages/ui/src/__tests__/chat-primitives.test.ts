import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bubble, Marker, markerVariants, Message } from '../primitives/chat.js';
import { buttonVariants, cn } from '../ui.js';

// The re-anchored renderer selectors key off the primitives' own `data-slot` /
// `data-role` / `data-variant`, so a consumer must never be able to clobber
// them. Both primitives are hook-free pure functions, so calling them directly
// and inspecting the returned element's props proves the structural hooks win
// over conflicting props — no DOM, no renderer needed.
test('Message keeps its own data-slot/data-role over conflicting props', () => {
  const el = Message({
    variant: 'assistant',
    'data-slot': 'spoofed',
    'data-role': 'user',
  } as never);
  const props = el.props as Record<string, unknown>;
  assert.equal(props['data-slot'], 'message');
  assert.equal(props['data-role'], 'assistant');
});

test('Bubble keeps its own data-slot/data-variant over conflicting props', () => {
  const el = Bubble({
    variant: 'user',
    'data-slot': 'spoofed',
    'data-variant': 'assistant',
  } as never);
  const props = el.props as Record<string, unknown>;
  assert.equal(props['data-slot'], 'bubble');
  assert.equal(props['data-variant'], 'user');
});

test('Marker keeps its own data-slot/data-variant but forwards the styling data-* hooks', () => {
  const el = Marker({
    variant: 'summary-chip',
    as: 'span',
    'data-slot': 'spoofed',
    'data-variant': 'aborted',
    // The literalized `data-[kind=…]:` variants read this off the element, so it
    // must flow through unchanged.
    'data-kind': 'model',
  } as never);
  const props = el.props as Record<string, unknown>;
  assert.equal(el.type, 'span');
  assert.equal(props['data-slot'], 'marker');
  assert.equal(props['data-variant'], 'summary-chip');
  assert.equal(props['data-kind'], 'model');
});

test('markerVariants resolves a leaf shell string the UiButton call sites can apply', () => {
  // The lineage badge + footer action render as UiButton and apply the shell via
  // className, so the cva must return a non-empty literal utility string.
  const footerAction = markerVariants({ variant: 'footer-action' });
  assert.match(footerAction, /min-h-\[28px\]/);
  assert.match(footerAction, /data-\[copy-feedback=copied\]:text-\[color:var\(--accent\)\]/);
  const lineageBadge = markerVariants({ variant: 'lineage-badge' });
  assert.match(lineageBadge, /rounded-\[999px\]/);
  assert.match(lineageBadge, /data-\[direction=forward\]:/);
});

// The footer action + lineage badge are the only NON-leaf marker call sites:
// they render as `UiButton variant="quiet" size="nav"`, so the real on-element
// class string is `cn(buttonVariants({ quiet, nav }), markerVariants(...))`.
// `nav` is the bare size (emits nothing), so the marker shell — including its
// own `h-8` height — fully owns the geometry; the only conflicts left to drop
// are `buttonVariants`' BASE/quiet utilities (`gap-2`, `rounded-md`,
// `text-muted-foreground`), not a `size` token. Unlike the pure-container
// variants, "source string == computed style" doesn't hold for free here, so
// this pins the merge resolution deterministically (no browser, no screenshot
// rasterization noise) — the exact regression risk PR2 introduced for these two.
test('footer-action merge drops the UiButton base shell so the retired footer pixels win', () => {
  const merged = cn(
    buttonVariants({ variant: 'quiet', size: 'nav' }),
    markerVariants({ variant: 'footer-action' }),
  );
  // The retired `.maka-turn-footer-action` declarations survive (incl. the now
  // explicit `h-8` height that `size="sm"` used to supply implicitly)…
  for (const win of [
    'gap-[6px]',
    'min-h-[28px]',
    'h-8',
    'leading-[16px]',
    'px-[8px]',
    'py-[4px]',
    'rounded-[8px]',
    'text-[color:var(--foreground-50)]',
    'text-[12px]',
  ]) {
    assert.ok(merged.includes(win), `footer pixel "${win}" must survive the merge`);
  }
  // …and the conflicting `buttonVariants` base/quiet utilities are dropped, so
  // they can't override the footer shell (rounded-md radius, gap-2 gap,
  // muted-foreground color).
  for (const dropped of ['rounded-md', 'gap-2', 'text-muted-foreground']) {
    assert.ok(
      !merged.split(/\s+/).includes(dropped),
      `conflicting UiButton utility "${dropped}" must be merged out of the footer action`,
    );
  }
});

test('lineage-badge merge drops the UiButton base shell so the retired badge pixels win', () => {
  const merged = cn(
    buttonVariants({ variant: 'quiet', size: 'nav' }),
    markerVariants({ variant: 'lineage-badge' }),
  );
  for (const win of [
    'h-8',
    'leading-[12px]',
    'gap-[3px]',
    'px-[5px]',
    'py-[1px]',
    'rounded-[999px]',
    'text-[color:var(--foreground-48)]',
    'text-[9px]',
  ]) {
    assert.ok(merged.includes(win), `lineage pixel "${win}" must survive the merge`);
  }
  for (const dropped of ['rounded-md', 'gap-2', 'text-muted-foreground']) {
    assert.ok(
      !merged.split(/\s+/).includes(dropped),
      `conflicting UiButton utility "${dropped}" must be merged out of the lineage badge`,
    );
  }
});
