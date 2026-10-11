import * as React from "react"
import { cn } from "@/shared/lib/cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-lg border border-input bg-card px-[var(--arc-control-padding-inline)] py-2 text-[length:var(--arc-font-input)] leading-[var(--arc-line-height)] transition-colors outline-none placeholder:text-muted-foreground hover:not-disabled:not-read-only:border-foreground focus-visible:border-ring focus-visible:outline-[length:var(--arc-focus-width)] focus-visible:outline-ring focus-visible:outline-offset-[var(--arc-focus-gap)] disabled:cursor-not-allowed aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
