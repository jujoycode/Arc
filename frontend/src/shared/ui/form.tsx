import { useId, useRef, type ReactNode } from 'react'
import { Label } from './label'
import { cn } from '@/shared/lib/cn'

export function formFieldId(name: string) { return `form-field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}` }

export interface FormControlProps { id: string; required: boolean; 'aria-label': string; 'aria-describedby'?: string; 'aria-invalid'?: true }

export function FormField({ name, label, required = false, description, error, fullWidth = false, children }: {
  name: string; label: string; required?: boolean; description?: string; error?: string; fullWidth?: boolean;
  children: (props: FormControlProps) => ReactNode;
}) {
  const id = formFieldId(name)
  const descriptionId = `${id}-description`, errorId = `${id}-error`
  const describedBy = [description ? descriptionId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
  return <div className={cn('arc-form-field', fullWidth && 'arc-form-field-wide')}>
    <Label htmlFor={id} className="arc-form-label">{label}<span className="arc-form-requirement" aria-hidden="true">{required ? '(필수)' : '(선택)'}</span></Label>
    {description && <p className="arc-form-help" id={descriptionId}>{description}</p>}
    {children({ id, required, 'aria-label': label, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
    {error && <p id={errorId} className="arc-field-error">{error}</p>}
  </div>
}

export function FormErrorSummary({ errors, message, title = '입력 내용을 확인해 주세요' }: { errors: Record<string, string>; message?: string; title?: string }) {
  const titleId = useId(), ref = useRef<HTMLDivElement>(null)
  const entries = Object.entries(errors)
  if (!entries.length && !message) return null
  return <div ref={ref} className="arc-form-error-summary" role="alert" tabIndex={-1} aria-labelledby={titleId}>
    <p id={titleId}><strong>{title}</strong></p>
    {message && <p>{message}</p>}
    {entries.length > 0 && <ul>{entries.map(([name, error]) => <li key={name}><a href={`#${formFieldId(name)}`} onClick={event => { event.preventDefault(); openAndFocus(document.getElementById(formFieldId(name))) }}>{error}</a></li>)}</ul>}
  </div>
}

export function focusFirstFormError(errors: Record<string, string>) {
  requestAnimationFrame(() => { const target = document.getElementById(formFieldId(Object.keys(errors)[0] ?? '')); openAndFocus(target) })
}

function openAndFocus(target: HTMLElement | null) {
  let ancestor = target?.parentElement
  while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement }
  target?.focus()
}
