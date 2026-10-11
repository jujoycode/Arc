import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-[length:var(--arc-font-label)] leading-[var(--arc-line-height)] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-[length:var(--arc-focus-width)] focus-visible:outline-ring focus-visible:outline-offset-[var(--arc-focus-gap)] disabled:cursor-not-allowed disabled:border-[var(--arc-color-disabled-border)] disabled:bg-[var(--arc-color-disabled-surface)] disabled:text-[var(--arc-color-disabled-text)] aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:not-disabled:bg-[var(--arc-color-action-hover)] active:not-disabled:bg-[var(--arc-color-action-pressed)]",
        outline:
          "border-input bg-card text-foreground hover:not-disabled:bg-[var(--arc-color-action-neutral-hover)] active:not-disabled:bg-[var(--arc-color-action-neutral-pressed)] aria-expanded:bg-muted aria-pressed:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:not-disabled:bg-[var(--arc-color-action-secondary-hover)] active:not-disabled:bg-[var(--arc-color-action-neutral-pressed)] aria-expanded:bg-muted aria-pressed:bg-muted",
        ghost:
          "text-foreground hover:not-disabled:bg-[var(--arc-color-action-neutral-hover)] active:not-disabled:bg-[var(--arc-color-action-neutral-pressed)] aria-expanded:bg-muted aria-pressed:bg-muted",
        destructive:
          "border-destructive bg-[var(--arc-color-danger-surface)] text-destructive hover:not-disabled:bg-destructive hover:not-disabled:text-primary-foreground active:not-disabled:bg-[var(--arc-color-danger-pressed)] active:not-disabled:text-primary-foreground",
        link: "text-primary underline-offset-4 hover:not-disabled:underline active:not-disabled:text-[var(--arc-color-action-pressed)]",
      },
      size: {
        default: "h-[var(--arc-control-height)] gap-2 px-4",
        // Extra-small sizes are reserved for data-row actions, never form inputs.
        xs: "h-[var(--arc-control-height-dense)] gap-1 rounded-sm px-2 text-[length:var(--arc-font-meta)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--arc-control-height-small)] gap-2 px-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--arc-control-height-primary)] gap-2 px-4",
        icon: "size-[var(--arc-control-height)]",
        "icon-xs": "size-[var(--arc-control-height-dense)] rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[var(--arc-control-height-small)]",
        "icon-lg": "size-[var(--arc-control-height-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
