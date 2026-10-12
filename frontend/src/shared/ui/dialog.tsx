"use client"

import * as React from "react"
import { cn } from "@/shared/lib/cn"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from '@/shared/ui/button'
import { XIcon } from "lucide-react"

const DialogModalContext = React.createContext(true)

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogModalContext value={props.modal ?? true}><DialogPrimitive.Root data-slot="dialog" {...props} /></DialogModalContext>
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onFocusCapture,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const modal = React.useContext(DialogModalContext)
  const openers = React.useRef(new WeakMap<HTMLElement, HTMLElement>())

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-3rem)] max-h-[calc(100dvh-3rem)] overflow-y-auto scroll-py-6 -translate-x-1/2 -translate-y-1/2 gap-6 rounded-2xl bg-popover p-6 text-[length:var(--arc-font-body)] leading-[var(--arc-line-height)] text-popover-foreground shadow-[var(--arc-shadow-dialog)] ring-1 ring-border duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
        onOpenAutoFocus={event => {
          const content = event.target
          const opener = document.activeElement
          // Capture before Radix or the caller moves focus; each opening may use a different control.
          if (content instanceof HTMLElement && opener instanceof HTMLElement &&
            opener !== document.body && opener !== document.documentElement && !content.contains(opener)) {
            openers.current.set(content, opener)
          }
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={event => {
          onCloseAutoFocus?.(event)
          const content = event.target
          if (!(content instanceof HTMLElement)) return
          const opener = openers.current.get(content)
          openers.current.delete(content)
          if (event.defaultPrevented || !modal) return
          const active = document.activeElement
          // Navigation may already have chosen a destination outside this modal.
          if (active instanceof HTMLElement && active !== document.body &&
            active !== document.documentElement && !content.contains(active) && active !== opener) {
            event.preventDefault()
          } else if (opener?.isConnected) {
            event.preventDefault()
            opener.focus({ preventScroll: true })
          }
        }}
        onFocusCapture={event => {
          onFocusCapture?.(event)
          if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return
          const control = event.target
          const body = control.closest<HTMLElement>('.ticket-dialog-body') ?? event.currentTarget
          if (!event.currentTarget.contains(body) || body.scrollHeight <= body.clientHeight ||
            !['auto', 'scroll'].includes(getComputedStyle(body).overflowY)) return
          const rect = control.getBoundingClientRect(), bounds = body.getBoundingClientRect()
          const style = getComputedStyle(control)
          const outline = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset))
          const actions = body.querySelector<HTMLElement>('.arc-form-actions')
          const stickyActions = actions && ['sticky', 'fixed'].includes(getComputedStyle(actions).position)
          const bottom = stickyActions && !actions.contains(control) ? Math.min(bounds.bottom, actions.getBoundingClientRect().top) : bounds.bottom
          // Reveal clipped native focus and Radix wraps in the actual dialog scroll owner.
          if (rect.top - outline < bounds.top || rect.bottom + outline > bottom) {
            control.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
          }
        }}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">닫기</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-12", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-2xl border-t bg-muted px-6 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">닫기</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-[19px] leading-[var(--arc-line-height)] font-bold",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[length:var(--arc-font-body)] text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
