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
