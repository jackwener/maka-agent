"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../utils.js";

/**
 * Card-style radio primitive for "pick one of N richly-laid-out options"
 * surfaces — Settings → 外观 theme picker (3 vertically-stacked preview
 * tiles), palette picker (round swatches + label), provider model
 * "default" picker, etc.
 *
 * Why a separate primitive (not the existing dot-style `Radio`):
 *   - Each card has rich body content (preview mocks, swatches,
 *     descriptions). It needs to be the FULL clickable target, not a
 *     small leading indicator.
 *   - Earlier attempts to route the card through the shared `Button`
 *     primitive baked in `h-9 inline-flex bg-primary text-white`
 *     utilities that collapsed each card to a 36px black pill (WAWQAQ
 *     msg `5f75daf6`, reverted in commit b40d097). The contract test
 *     locked the regression by pinning native `<button role="radio">`.
 *   - `ChoiceCard` keeps Base UI's `Radio.Root` semantics (proper
 *     `data-checked`, keyboard arrow-nav, focus management), but
 *     applies **no** layout/background utilities of its own. Every
 *     visual decision (size, swatch grid, hover/checked treatment)
 *     lives in the caller's `className` so the existing
 *     `.settingsThemeOption*` / `.settingsPaletteOption*` rules keep
 *     working unchanged.
 *
 * Selected-state hook: Base UI sets `data-checked` on the rendered
 * button when the value matches. CSS rules can target
 * `.settingsThemeOption[data-checked]`. The legacy `data-active` /
 * `aria-checked` selectors at call sites can be retired together
 * with the migration.
 */
export type ChoiceCardGroupProps<T extends string> = Omit<
  ComponentPropsWithoutRef<typeof BaseRadioGroup>,
  "value" | "onValueChange" | "defaultValue"
> & {
  value: T;
  onValueChange(value: T): void;
};

export const ChoiceCardGroup = forwardRef<HTMLDivElement, ChoiceCardGroupProps<string>>(
  function ChoiceCardGroup({ value, onValueChange, className, ...props }, ref) {
    return (
      <BaseRadioGroup
        ref={ref}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onValueChange(next);
        }}
        className={className}
        {...props}
      />
    );
  },
) as <T extends string>(
  props: ChoiceCardGroupProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => ReactNode;

export type ChoiceCardProps = Omit<
  ComponentPropsWithoutRef<typeof BaseRadio.Root>,
  "value"
> & {
  value: string;
};

export const ChoiceCard = forwardRef<HTMLButtonElement, ChoiceCardProps>(
  function ChoiceCard({ className, ...props }, ref) {
    return (
      <BaseRadio.Root
        ref={ref}
        // Intentionally no `h-*`, `bg-*`, `text-*` defaults — the
        // caller's `className` owns the card's visual contract. See
        // the regression note at the top of this file.
        className={cn(className)}
        {...props}
      />
    );
  },
);
