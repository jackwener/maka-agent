"use client";

import { cn } from "../utils.js";
import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";

/**
 * Chat conversation-flow primitives (issue #332, PR1).
 *
 * `Message` is the per-turn row container; `Bubble` is the message body
 * surface. They retire the bespoke `.message.{role}` / `.maka-bubble-user`
 * shell CSS, moving the row/bubble *shell* onto the Tailwind substrate while
 * leaving Markdown prose (`.maka-bubble-assistant *`, maka-tokens.css) and the
 * turn machinery (summary / lineage / footer / markers — PR2) untouched.
 *
 * The row keeps the authored `.maka-message-row` base (centered reading column
 * + entrance fade/animation + the `data-maka-visual-smoke` disable). That base
 * lives in maka-tokens.css's `@layer components`, so the role utilities below
 * (utilities layer) win over its `margin: 0 auto` for the left-anchored
 * assistant/system rows. The neutral `--chat-user-bg` token path is preserved
 * verbatim — the user bubble is never switched to `primary`/`accent`.
 */

const messageVariants = cva("maka-message-row", {
  variants: {
    variant: {
      // `.message.user`: shrink-wrap column, body hugs the right edge. No
      // margin override — the row stays centered (its `margin: 0 auto`).
      user: "flex flex-col items-end gap-1.5",
      // `.message.assistant` / `.message.system`: left-anchor inside the
      // measure column (override the row's centering).
      assistant: "ml-0 mr-auto",
      system: "ml-0 mr-auto",
    },
  },
});

export interface MessageProps
  extends React.ComponentPropsWithoutRef<"article"> {
  // The chat role. Named `variant` (not `role`) so it never shadows the native
  // HTML/ARIA `role` attribute, which still flows through `...props`. Emitted
  // to the DOM as `data-role` — the hook the turn lineage/footer and system
  // `pre` rules anchor on.
  variant: "user" | "assistant" | "system";
}

export function Message({
  className,
  variant,
  ...props
}: MessageProps): React.ReactElement {
  return (
    // `{...props}` is spread first so the structural `data-*` hooks the
    // re-anchored selectors depend on always land last and can't be clobbered
    // by a consumer passing `data-slot` / `data-role`.
    <article
      {...props}
      data-slot="message"
      data-role={variant}
      className={cn(messageVariants({ variant }), className)}
    />
  );
}

const bubbleVariants = cva("", {
  variants: {
    variant: {
      // `.maka-bubble-user`: tinted, width-capped, right-anchored block.
      // Values are LITERAL (`rounded-[10px]`, `px-[14px] py-[10px]`), not the
      // design-system scale (`rounded-lg`, `px-3.5`): the retired CSS hardcoded
      // these pixels, so the literal is the faithful, self-evidently-equal
      // translation and immune to later scale/token re-tuning (the visual
      // refresh, not this governance pass, owns adopting the scale). Keeps the
      // neutral `--chat-user-bg` token path (never primary/accent).
      user: "max-w-[min(100%,640px)] whitespace-pre-wrap break-words rounded-[10px] bg-[var(--chat-user-bg)] px-[14px] py-[10px] leading-[1.6] text-[color:var(--chat-user-foreground,var(--foreground))]",
      // Assistant / system: open prose, no bubble. Typography stays authored
      // under `.maka-bubble-assistant` (Markdown prose, OUT of scope), so this
      // variant re-emits that class as the styling hook.
      assistant: "maka-bubble-assistant",
    },
  },
});

export interface BubbleProps extends React.ComponentPropsWithoutRef<"div"> {
  variant: VariantProps<typeof bubbleVariants>["variant"];
}

export function Bubble({
  className,
  variant,
  ...props
}: BubbleProps): React.ReactElement {
  return (
    <div
      {...props}
      data-slot="bubble"
      data-variant={variant}
      className={cn(bubbleVariants({ variant }), className)}
    />
  );
}

/**
 * `Marker` — the per-turn status / lineage / footer chrome (issue #332, PR2).
 *
 * Retires the bespoke `.maka-turn-summary*`, `.maka-turn-aborted-marker`,
 * `.maka-turn-failed-*`, `.maka-turn-lineage-*`, and `.maka-turn-footer*` shell
 * CSS (spread across `maka-tokens.css`, `styles/settings/models.css`, and the
 * re-anchored measure-column block in `styles/tool-output.css`), moving each
 * onto this one Tailwind substrate.
 *
 * Every value is a LITERAL arbitrary utility (`gap-[6px]`, `rounded-[999px]`,
 * `bg-[oklch(from_var(--foreground)_l_c_h_/_0.06)]`, `data-[kind=model]:…`),
 * never the semantic scale — the literal is the faithful, self-evidently-equal
 * translation of the retired pixels/tokens and is immune to later re-tuning
 * (the visual refresh, not this governance pass, owns adopting the scale). Each
 * leaf variant compiles 1:1 to the declarations it replaces, so the cva source
 * string IS the computed-style proof — the cascade contract asserts the exact
 * strings, no browser needed.
 *
 * The measure-column geometry the old `tool-output.css` re-anchor applied to
 * the summary / lineage rows / footer (`max-width:var(--maka-chat-measure)`,
 * `margin-right:auto`) is folded directly into those container variants here,
 * so the layout is location-independent instead of coupled to a
 * `[data-role="assistant"]` descendant selector.
 *
 * `markerVariants` is exported from THIS module (shadcn `buttonVariants` style)
 * so the lineage badge + footer action — which render as `UiButton` and can't
 * be wrapped — apply the shell via `className`; `Button` runs it through
 * `cn`/tailwind-merge last, so it wins over the button's own variant utilities.
 * It is intentionally kept OFF the `@maka/ui` package barrel (see `index.ts`):
 * the only consumers import it by relative path, so the variant table stays an
 * internal, freely-removable styling detail rather than public API.
 *
 * NOTE: `.maka-turn-thinking` (the committed-turn reasoning `<details>`) is
 * deliberately NOT migrated here. Its chrome lives in `summary::before` /
 * `::-webkit-details-marker` pseudo-elements and an `@starting-style` body fade
 * that don't reduce to leaf utilities (so the source-string == computed-style
 * proof wouldn't hold), and `maka-tokens.css` already documents an intended
 * Base UI Accordion path for it. It stays hand-written for that later effort.
 */
const markerVariants = cva("", {
  variants: {
    variant: {
      // `.maka-turn-summary` + the `tool-output.css` measure-column re-anchor:
      // one quiet caption line (model · tools · duration · tokens).
      summary:
        "flex w-full max-w-[var(--maka-chat-measure,680px)] flex-wrap items-center justify-start gap-[6px] mb-[2px] ml-0 mr-auto text-[color:var(--foreground-50)] [font-variant-numeric:tabular-nums]",
      // `.maka-turn-summary-chip` (+ `::before` middot, nested `code`, and the
      // `[data-kind]` / `[data-state]` / `[data-switched]` conditionals). The
      // call site keeps passing `data-kind` / `data-state` / `data-switched`,
      // which the literalized `data-[…]:` variants read.
      "summary-chip":
        "inline-flex items-center gap-[4px] text-[color:var(--foreground-50)] text-[12px] font-medium leading-[1.4]"
        + " [&:not(:first-child)]:before:content-['·'] [&:not(:first-child)]:before:mr-[4px] [&:not(:first-child)]:before:text-[color:var(--foreground-40)] [&:not(:first-child)]:before:font-normal"
        + " [&_code]:bg-transparent [&_code]:text-[color:inherit] [&_code]:[font-family:var(--font-mono)] [&_code]:text-[12px]"
        + " data-[kind=model]:[&_code]:text-[color:var(--foreground-60)] data-[kind=model]:[&_code]:font-semibold"
        + " data-[kind=tools]:text-[color:var(--foreground-50)]"
        + " data-[kind=duration]:[font-variant-numeric:tabular-nums]"
        + " data-[kind=tokens]:[font-variant-numeric:tabular-nums] data-[kind=tokens]:[font-family:var(--font-mono)] data-[kind=tokens]:text-[12px]"
        + " data-[state=in-progress]:text-[color:var(--accent)] data-[state=in-progress]:font-semibold"
        + " data-[kind=model]:data-[switched=true]:[&_code]:text-[color:var(--foreground-60)]",
      // `.maka-turn-summary-chip-switched` — the muted "切换" pill.
      "summary-switched":
        "ml-[4px] px-[6px] py-[1px] rounded-[999px] bg-[oklch(from_var(--foreground)_l_c_h_/_0.06)] text-[color:var(--foreground-60)] text-[11px] font-semibold",
      // `.maka-turn-aborted-marker` (+ its italic `em`) — dormant, muted.
      aborted:
        "inline-flex w-fit items-center gap-[4px] mx-0 mt-[2px] mb-[4px] px-[6px] py-[2px] rounded-[6px] bg-[var(--foreground-5)] text-[color:var(--foreground-60)] text-[12px] italic [&_em]:italic",
      // `.maka-turn-failed-banner` — fault state, destructive tone.
      "failed-banner":
        "inline-flex w-fit flex-wrap items-center gap-[6px] mx-0 mt-[2px] mb-[6px] px-[8px] py-[4px] rounded-[6px] border border-[oklch(from_var(--destructive)_l_c_h_/_0.28)] bg-[oklch(from_var(--destructive)_l_c_h_/_0.10)] text-[color:var(--destructive)] text-[12px]",
      // `.maka-turn-failed-icon`
      "failed-icon": "inline-flex items-center",
      // `.maka-turn-failed-recovery` (+ `::before` middot separator).
      "failed-recovery":
        "text-[color:var(--text-muted)] before:content-['·'] before:mr-[6px] before:text-[color:var(--border-strong)]",
      // `.maka-turn-lineage-row` + the measure-column re-anchor (forward row).
      "lineage-row":
        "flex w-full max-w-[var(--maka-chat-measure,680px)] flex-wrap items-center justify-start gap-[3px] mt-[2px] mb-[4px] ml-0 mr-auto opacity-[0.82]",
      // `.maka-turn-lineage-row.maka-turn-lineage-row-reverse` — same, but the
      // `-reverse` class bumps margin-top 2px → 4px.
      "lineage-row-reverse":
        "flex w-full max-w-[var(--maka-chat-measure,680px)] flex-wrap items-center justify-start gap-[3px] mt-[4px] mb-[4px] ml-0 mr-auto opacity-[0.82]",
      // `.maka-turn-lineage-badge` (UiButton) — tiny pill, `[data-direction]`
      // recolors it forward (info) / reverse (brand-deep).
      "lineage-badge":
        // `h-8` + `leading-[12px]` explicit for the same reason as
        // `footer-action` (UiButton `size="nav"`): preserves the 30px height and
        // the 4/3 line-height (9px font × 4/3 = 12px) that `size="sm"`'s `h-8` /
        // `text-xs` used to supply implicitly on `main`, so geometry lives in
        // the marker shell.
        "inline-flex items-center h-8 gap-[3px] px-[5px] py-[1px] rounded-[999px] [border:0] bg-[oklch(from_var(--foreground)_l_c_h_/_0.05)] text-[color:var(--foreground-48)] text-[9px] leading-[12px] [transition:background_150ms_var(--ease-out-strong),color_150ms_var(--ease-out-strong)]"
        + " hover:bg-[oklch(from_var(--foreground)_l_c_h_/_0.08)] hover:text-[color:var(--foreground)]"
        + " focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:2px]"
        + " data-[direction=forward]:bg-[oklch(from_var(--info)_l_c_h_/_0.06)] data-[direction=forward]:text-[oklch(from_var(--info-text)_calc(l_-_0.06)_c_h)]"
        + " data-[direction=reverse]:bg-[oklch(from_var(--brand-deep)_l_c_h_/_0.06)] data-[direction=reverse]:text-[oklch(from_var(--brand-deep)_calc(l_-_0.04)_c_h)]",
      // `.maka-turn-footer` (+ measure-column re-anchor) — quiet toolbar that
      // lifts to full opacity on hover / focus-within.
      footer:
        "flex w-full max-w-[var(--maka-chat-measure,680px)] flex-wrap items-center justify-start gap-[2px] mt-[2px] ml-0 mr-auto p-0 opacity-[0.72] hover:opacity-100 focus-within:opacity-100",
      // `.maka-turn-footer-action` (UiButton) — borderless ghost action. Also
      // reused by the user-message copy (`MessageCopyButton footerStyle`), so
      // it carries only the button look, never the footer's measure column.
      "footer-action":
        // `h-8` (→30px) + `leading-[16px]` are explicit because the call sites
        // pass `UiButton size="nav"` (the bare size whose docstring says the
        // consumer's className owns height/padding/font). On `main` both came
        // implicitly from `size="sm"` — its `h-8`, and `text-xs`'s 4/3
        // line-height ratio over the 12px font (12 × 4/3 = 16px exactly).
        // Folding them in keeps the exact pixels while the marker shell owns its
        // geometry (verified equal to `main` by computed style, headless electron).
        "inline-flex items-center gap-[6px] min-h-[28px] h-8 px-[8px] py-[4px] rounded-[8px] [border:0] bg-transparent text-[color:var(--foreground-50)] text-[12px] leading-[16px] [transition:background_120ms_ease,color_120ms_ease,opacity_120ms_ease]"
        + " [&:hover:not(:disabled)]:bg-[oklch(from_var(--foreground)_l_c_h_/_0.05)] [&:hover:not(:disabled)]:text-[color:var(--foreground)]"
        + " focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:2px]"
        + " disabled:opacity-[0.45] disabled:cursor-not-allowed aria-disabled:opacity-[0.45] aria-disabled:cursor-not-allowed"
        + " data-[pending=true]:opacity-[0.78] data-[pending=true]:cursor-progress"
        // Copy-in-progress sets BOTH `disabled` and `data-pending`. The plain
        // `data-[pending=true]:opacity-[0.78]` and `disabled:opacity-[0.45]`
        // utilities have equal specificity (0,2,0), so the pending value would
        // only win on Tailwind's source order. These combined-modifier guards
        // raise pending to (0,3,0) so it beats the disabled dim by specificity,
        // not order — keeping the in-progress 0.78 stable regardless of emit
        // sequence. (Both `disabled`/`aria-disabled` are always set together.)
        + " disabled:data-[pending=true]:opacity-[0.78] aria-disabled:data-[pending=true]:opacity-[0.78]"
        + " data-[copy-feedback=copied]:text-[color:var(--accent)] data-[copy-feedback=failed]:text-[color:var(--destructive)]",
    },
  },
});

export type MarkerVariant = NonNullable<
  VariantProps<typeof markerVariants>["variant"]
>;

export { markerVariants };

export interface MarkerProps extends React.ComponentPropsWithoutRef<"div"> {
  variant: MarkerVariant;
  // The summary chips and the failed-banner sub-spans were authored as inline
  // `<span>`s; the containers/markers as `<div>`s. Keep the original tag so the
  // migration is structurally identical (zero behavioral change).
  as?: "div" | "span";
}

export function Marker({
  className,
  variant,
  as: Tag = "div",
  ...props
}: MarkerProps): React.ReactElement {
  return (
    // `{...props}` first so the `data-slot` / `data-variant` hooks land last and
    // can't be clobbered by a consumer (mirrors Message / Bubble). The styling
    // `data-kind` / `data-state` / `data-direction` etc. flow through `...props`
    // and are read by the literalized `data-[…]:` variants above.
    <Tag
      {...props}
      data-slot="marker"
      data-variant={variant}
      className={cn(markerVariants({ variant }), className)}
    />
  );
}

/**
 * Tool live-output stream shell (issue #332, PR3).
 *
 * Retires the bespoke `.maka-tool-output-stream-*` shell CSS (the panel,
 * header, counts row, scrolling body, and chunk/tag spans in
 * `styles/tool-stream.css`), moving each onto this Tailwind substrate. Every
 * value is a LITERAL arbitrary utility that compiles 1:1 to the declaration it
 * replaces, so the cva source string IS the computed-style proof (the cascade
 * contract asserts the exact strings).
 *
 * The single consumer (`ToolOutputStream`) keeps its semantic tags
 * (`<header>` / `<pre>` / `<span>`) and applies these by `className` rather than
 * through a wrapper component — there is one call site, the tags differ, and the
 * literalize vehicle (this table) is what the test net asserts. `streamVariants`
 * is kept OFF the package barrel for the same reason as `markerVariants`: the
 * only consumer imports it by relative path, so the part set stays an internal,
 * freely-removable styling detail.
 *
 * The live pulse dot is NOT a part here — it moves onto the governed
 * `LiveIndicator` primitive below (animation can't be a leaf-literal, so it gets
 * a primitive + a single canonical keyframe instead of a per-feature one).
 */
const streamVariants = cva("", {
  variants: {
    part: {
      // `.maka-tool-output-stream` (+ the `[data-live="true"]` accent border /
      // inset ring while the tool is running). The call site keeps passing
      // `data-live`, which the literalized `data-[live=true]:` utilities read.
      container:
        "flex flex-col gap-[6px] my-[6px] mx-0 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--background)]"
        + " data-[live=true]:border-[oklch(from_var(--accent)_l_c_h_/_0.40)] data-[live=true]:[box-shadow:inset_0_0_0_1px_oklch(from_var(--accent)_l_c_h_/_0.06)]",
      // `.maka-tool-output-stream-header`
      header:
        "flex items-center justify-between gap-[12px] px-[10px] py-[6px] border-b border-[var(--border)] bg-[var(--foreground-3)] text-[0.72rem] uppercase tracking-[0.06em] text-[color:var(--foreground-50)]",
      // `.maka-tool-output-stream-label`
      label: "inline-flex items-center gap-[6px]",
      // `.maka-tool-output-stream-counts`
      counts: "inline-flex items-center gap-[10px]",
      // `.maka-tool-output-stream-counts span` (tabular-nums on every count) plus
      // the `[data-stream=stderr]` / `[data-redacted]` / `[data-truncated]`
      // recolors. The `已截断` pill (`data-truncated`) gets the warning chrome the
      // old `span[data-truncated="true"]` rule supplied; the inert
      // `.maka-tool-output-stream-truncated-tag` class (no rule of its own) is
      // dropped.
      count:
        "[font-variant-numeric:tabular-nums]"
        + " data-[stream=stderr]:text-[color:var(--destructive-text)]"
        + " data-[redacted=true]:text-[color:var(--warning-text,var(--info-text))]"
        + " data-[truncated=true]:rounded-[4px] data-[truncated=true]:border data-[truncated=true]:border-[oklch(from_var(--warning)_l_c_h_/_0.30)] data-[truncated=true]:bg-[oklch(from_var(--warning)_l_c_h_/_0.06)] data-[truncated=true]:px-[4px] data-[truncated=true]:text-[color:var(--warning-text,var(--info-text))] data-[truncated=true]:cursor-help",
      // `.maka-tool-output-stream-body` — the scrolling mono output `<pre>`.
      // `word-break:break-word` stays an arbitrary literal (Tailwind's
      // `break-words` is `overflow-wrap`, a different property).
      body:
        "m-0 max-h-[220px] overflow-y-auto whitespace-pre-wrap [word-break:break-word] px-[10px] py-[8px] [font-family:var(--font-mono)] text-[0.78rem] leading-[1.5] bg-[var(--background)] text-[color:var(--foreground-80)] [scroll-behavior:auto]",
      // `.maka-tool-output-stream-chunk` (`display:contents`; recolors stderr,
      // dims redacted). The call site keeps `data-stream` / `data-redacted`.
      chunk:
        "contents data-[stream=stderr]:text-[color:var(--destructive-text)] data-[redacted=true]:opacity-[0.65]",
      // `.maka-tool-output-stream-redacted-tag` — the inline `[已脱敏]` pill.
      "redacted-tag":
        "inline ml-[2px] rounded-[4px] px-[4px] tracking-[0.04em] text-[0.7rem] text-[color:var(--warning-text,var(--info-text))] bg-[oklch(from_var(--warning,var(--info))_l_c_h_/_0.10)]",
    },
  },
});

export { streamVariants };

/**
 * `LiveIndicator` — the pulsing "live" dot (issue #332, PR3).
 *
 * The governed home for the chat live-output dot, replacing the bespoke
 * `.maka-tool-output-stream-dot` + its per-feature `@keyframes`. The breath
 * itself is the one declaration that can't be a leaf-literal (a `@keyframes` is
 * a named global rule, not an element property, and `getComputedStyle` reads a
 * phase-dependent value — so it escapes the computed-style proof). It is pinned
 * instead by the canonical `@keyframes maka-pulse` in `maka-tokens.css` (the
 * shared motion home) plus the literal values here, verified by a keyframe
 * contract + before/after screenshots rather than the diff harness.
 *
 * It is kept INTERNAL (off the package barrel, applied by relative import like
 * `streamVariants`): the tool stream is its only consumer today. The duplicate
 * reasoning / composer / onboarding live dots can adopt it in a follow-up motion
 * pass — retiring their own `*-pulse` keyframes onto `maka-pulse` — and that is
 * when it would be promoted to a public export, not speculatively before a second
 * consumer exists. Reduced-motion suppression rides on the `motion-reduce:`
 * utilities (real-OS `prefers-reduced-motion: reduce`), mirroring the retired
 * dot's `@media` rule; the visual-smoke fixture freeze is handled by `base.css`.
 */
export function LiveIndicator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      {...props}
      data-slot="live-indicator"
      className={cn(
        "inline-block w-[6px] h-[6px] rounded-[50%] bg-[var(--accent)] [animation:maka-pulse_1.4s_ease-in-out_infinite] motion-reduce:[animation:none] motion-reduce:opacity-[0.8]",
        className,
      )}
    />
  );
}

/**
 * Tool-activity card shell (issue #332, PR3b).
 *
 * Retires the bespoke `ToolActivity` chrome — the inline section + count, the
 * `<details>` card (`.maka-tool` / `.toolItem`), the `<summary>` header row
 * (`.maka-tool-header` / `-name` / `-meta` / `-duration` / `-status-label` /
 * `-status-dot`), the body / intent, and the args `<pre>` override
 * (`.toolArgs`) — moving each onto this Tailwind substrate. The selectors lived
 * across `maka-tokens.css`'s `@layer components` and `styles/tool-output.css`.
 *
 * Every value is a LITERAL arbitrary utility that compiles 1:1 to the
 * declaration it replaces, so the cva source string IS the computed-style proof
 * (the cascade contract asserts the exact strings, no browser needed). Literals
 * over the semantic scale for the same reason as `markerVariants` / `streamVariants`:
 * the retired CSS hardcoded these pixels, so the literal is the faithful,
 * self-evidently-equal translation and is immune to later scale/token re-tuning
 * (the visual refresh, not this governance pass, owns adopting the scale).
 *
 * Three pieces escape the computed-style proof and are NOT in this table — they
 * stay a small named residue keyed on `[data-slot="tool"]` in maka-tokens.css,
 * pinned by the PR3b cascade contract (source strings + keyframe frames) rather
 * than the diff harness:
 *   1. the running status dot's `[animation:maka-tool-pulse…]` breath (the
 *      shorthand rides in the `dot` part here like `LiveIndicator`; only the
 *      `@keyframes maka-tool-pulse` stays in CSS — a keyframe is a global rule,
 *      not an element property, and `getComputedStyle` reads a phase-dependent
 *      value). The running dot's box-shadow RING is a leaf rest-state literal, so
 *      it stays here and IS diff-proven.
 *   2. the card mount entrance (`transition` + `@starting-style` opacity/translate)
 *      — `@starting-style` only applies on the first frame, so it has no at-rest
 *      computed style to diff. Kept verbatim as residue.
 *   3. the native `<summary>` marker reset (`::-webkit-details-marker` /
 *      `::marker`) — pseudo-elements with no leaf-utility form. Kept as residue.
 * (The reduced-motion / visual-smoke suppression both ride GLOBAL `*` rules in
 * maka-tokens.css / base.css, so — unlike `LiveIndicator`, a reusable primitive
 * that carries its own `motion-reduce:` guards — the dot and card need no
 * per-element motion utilities; the same global rules cover them as before.)
 *
 * The single consumer (`ToolActivity`) keeps its semantic tags and applies these
 * by `className`. `toolVariants` is kept OFF the package barrel for the same
 * reason as `markerVariants` / `streamVariants`: the only consumer imports it by
 * relative path, so the part set stays an internal, freely-removable styling
 * detail. The `<details>` card stays native HTML here — the eventual Base UI
 * Disclosure path (the intended convergence target for this card AND the
 * `.maka-turn-thinking` block) is a later structural pass, not this lift.
 *
 * NOTE: the args `<pre>` keeps the shared `.maka-code` inline-code base (used by
 * Markdown / artifact previews too — out of scope); the `args` part below is only
 * the `.toolArgs` override. The `ToolErrorBanner` (`Alert` + `.maka-tool-error*`)
 * is a separate concern on a different substrate and migrates in its own pass.
 */
// `waiting_permission` carries a literal underscore, which Tailwind reads as a
// SPACE in an arbitrary value (`[data-status="waiting permission"]` — never
// matches). The escape is `\_`, but a plain string literal makes the SCANNED
// source (`\\_`) disagree with cva's RUNTIME output (`\_`), so the emitted
// selector misses the class. `String.raw` keeps both at a single `\_`.
const WP_CARD_BORDER = String.raw`data-[status=waiting\_permission]:[border-color:oklch(from_var(--info)_l_c_h_/_0.4)]`;
const WP_DOT_BG = String.raw`data-[status=waiting\_permission]:bg-[var(--info)]`;

const toolVariants = cva("", {
  variants: {
    part: {
      // `.toolInline` — the inline section measure column.
      container: "w-[min(680px,100%)] mx-auto mt-[2px] mb-0 px-[16px] py-0",
      // `.toolInline > header` — the quiet "工具调用" caption row.
      "container-header":
        "flex items-center justify-between mb-[3px] text-[color:var(--foreground-50)] text-[10px]",
      // `.maka-tool-count` — the call-count pill.
      count:
        "inline-flex items-center justify-center min-w-[22px] h-[18px] px-[6px] py-0 rounded-[999px] bg-[var(--foreground-5)] text-[color:var(--foreground-60)] text-[11px] [font-variant-numeric:tabular-nums]",
      // `.maka-tool` (effective: the later `padding: 0` rule wins over `8px 12px`)
      // + `.toolItem` + the `[open]>summary` divider + the `[data-status]` border /
      // background / opacity swaps. `[border:…]` / `[border-color:…]` are arbitrary
      // so the status overrides touch only the color, never width/style. The mount
      // entrance (transition + `@starting-style`) and `<summary>` marker reset stay
      // a residue keyed on `[data-slot="tool"]` (see docstring).
      item:
        "[border:1px_solid_var(--border)] rounded-[10px] bg-[var(--foreground-2)] p-0 mt-[8px] [font-family:var(--font-mono)] text-[12.5px] text-[color:var(--foreground-80)] overflow-hidden [box-shadow:var(--shadow-minimal-flat)]"
        + " [&[open]>summary]:[border-bottom:1px_solid_var(--border)]"
        // `waiting_permission` border tint — see `WP_CARD_BORDER` above (String.raw).
        + " " + WP_CARD_BORDER
        + " data-[status=running]:[border-color:oklch(from_var(--accent)_l_c_h_/_0.4)]"
        + " data-[status=completed]:[border-color:var(--border)]"
        + " data-[status=errored]:[border-color:oklch(from_var(--destructive)_l_c_h_/_0.4)] data-[status=errored]:bg-[oklch(from_var(--destructive)_l_c_h_/_0.04)]"
        + " data-[status=interrupted]:[border-color:var(--border)] data-[status=interrupted]:bg-[var(--foreground-3)] data-[status=interrupted]:opacity-[0.7]",
      // `.maka-tool > summary` (list-style + padding) + `.maka-tool-header` (the
      // 8px · name · meta grid). Folded together since the summary IS the header.
      header:
        "list-none grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-[10px] px-[12px] py-[8px] text-[color:var(--foreground-70)]",
      // `.maka-tool-status-dot` (+ the `[data-status]` color swaps; running adds
      // the box-shadow ring + `maka-tool-pulse` breath — keyframe stays in CSS).
      dot:
        "w-[8px] h-[8px] rounded-[999px] bg-[var(--foreground-30)] [flex:0_0_auto]"
        // `waiting_permission` dot tint — see `WP_DOT_BG` above (String.raw).
        + " " + WP_DOT_BG
        + " data-[status=running]:bg-[var(--accent)] data-[status=running]:[box-shadow:0_0_0_3px_oklch(from_var(--accent)_l_c_h_/_0.15)] data-[status=running]:[animation:maka-tool-pulse_1.5s_ease-in-out_infinite]"
        + " data-[status=completed]:bg-[var(--success)]"
        + " data-[status=errored]:bg-[var(--destructive)]"
        + " data-[status=interrupted]:bg-[var(--foreground-30)]",
      // `.maka-tool-name` — the mono tool name, ellipsized.
      name:
        "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[color:var(--foreground)] font-medium [font-family:var(--font-mono)]",
      // `.maka-tool-meta` — duration + status-label cluster.
      meta:
        "inline-flex items-center gap-[8px] text-[color:var(--foreground-50)] text-[11px]",
      // `.maka-tool-duration`
      duration: "[font-variant-numeric:tabular-nums]",
      // `.maka-tool-status-label`
      "status-label": "text-[color:var(--foreground-60)]",
      // `.maka-tool-body`
      body: "px-[12px] pt-[10px] pb-[12px]",
      // `.maka-tool-intent`
      intent:
        "mx-0 mt-0 mb-[8px] text-[color:var(--foreground-60)] [font-family:var(--font-default)] text-[12px] leading-[1.4]",
      // `.toolArgs` — the override layered over the shared `.maka-code` base
      // (`.maka-code` stays in CSS; the call site keeps the class).
      args: "m-0 max-h-[110px] overflow-auto",
    },
  },
});

export { toolVariants };
