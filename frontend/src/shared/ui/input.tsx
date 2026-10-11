import * as React from "react"
import { cn } from "@/shared/lib/cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[var(--arc-control-height)] w-full min-w-0 rounded-lg border border-input bg-card px-[var(--arc-control-padding-inline)] py-2 text-[length:var(--arc-font-input)] leading-[var(--arc-line-height)] transition-colors outline-none file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-[length:var(--arc-font-label)] file:font-medium file:text-foreground placeholder:text-muted-foreground hover:not-disabled:not-read-only:border-foreground focus-visible:border-ring focus-visible:outline-[length:var(--arc-focus-width)] focus-visible:outline-ring focus-visible:outline-offset-[var(--arc-focus-gap)] disabled:cursor-not-allowed aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
