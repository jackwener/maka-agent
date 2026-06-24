"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "../utils.js";
import type React from "react";

export function Accordion({
  className,
  ...props
}: AccordionPrimitive.Root.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Root
      className={cn("flex flex-col", className)}
      data-slot="accordion"
      {...props}
    />
  );
}

export function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Item
      className={cn(className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

export function AccordionHeader({
  className,
  ...props
}: AccordionPrimitive.Header.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Header
      className={cn("m-0", className)}
      data-slot="accordion-header"
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  ...props
}: AccordionPrimitive.Trigger.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Trigger
      className={cn(
        "group flex w-full cursor-pointer select-none items-center outline-none",
        className,
      )}
      data-slot="accordion-trigger"
      {...props}
    />
  );
}

export function AccordionPanel({
  className,
  ...props
}: AccordionPrimitive.Panel.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Panel
      className={cn("overflow-hidden", className)}
      data-slot="accordion-panel"
      {...props}
    />
  );
}

export { AccordionPrimitive };
