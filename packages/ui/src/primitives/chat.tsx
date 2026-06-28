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

export type StreamPart = NonNullable<
  VariantProps<typeof streamVariants>["part"]
>;

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
 * This is the public, barrel-exported reuse surface: the duplicate reasoning /
 * composer / onboarding live dots are meant to adopt it in a follow-up motion
 * pass, retiring their own `*-pulse` keyframes onto `maka-pulse`. Reduced-motion
 * suppression rides on the `motion-reduce:` utilities (real-OS
 * `prefers-reduced-motion: reduce`), mirroring the retired dot's `@media` rule;
 * the visual-smoke fixture freeze is handled globally by `base.css`.
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
