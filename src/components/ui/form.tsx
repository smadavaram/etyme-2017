'use client'

import {
  createContext, useContext, useId,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'

/**
 * One way to draw a form: a field, its label, a help line, an error line,
 * and a submit that says what it is doing.
 *
 * `Field` owns the ids. The input inside it — `Input`, `Select` or
 * `Textarea` — reads them, so the label is tied to the input, the help
 * and the error lines are read with it, and an invalid field says so to
 * a screen reader. A page never writes `htmlFor` or `aria-describedby`
 * by hand, which is how they come to point at nothing.
 *
 * Validation stays the route's. The error line shows the route's own
 * sentence (`lib/form-save` keeps it); this only draws it under the
 * field it is about.
 */

interface FieldIds {
  id: string
  helpId: string | undefined
  errorId: string | undefined
  invalid: boolean
}

const FieldContext = createContext<FieldIds | null>(null)

/** The ids an input inside a `Field` takes, or nothing outside one. */
function useFieldProps() {
  const f = useContext(FieldContext)
  if (!f) return {}
  const describedBy = [f.helpId, f.errorId].filter(Boolean).join(' ') || undefined
  return {
    id: f.id,
    'aria-describedby': describedBy,
    'aria-invalid': f.invalid ? (true as const) : undefined,
  }
}

export function Field({ label, help, error, children, className = '' }: {
  /** What the field is, in the reader's words. Required: a field with no
   *  label is a field a screen reader calls "edit text". */
  label: ReactNode
  /** One line under the field: what goes in it, or what it is used for. */
  help?: ReactNode
  /** The route's sentence about this field. Drawn in place of nothing. */
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  const base = useId()
  const ids: FieldIds = {
    id: `${base}-input`,
    helpId: help ? `${base}-help` : undefined,
    errorId: error ? `${base}-error` : undefined,
    invalid: Boolean(error),
  }
  return (
    <FieldContext.Provider value={ids}>
      <div className={`block ${className}`}>
        <label htmlFor={ids.id} className="mb-1.5 block text-[12px] font-medium text-etyme-ink">
          {label}
        </label>
        {children}
        {help && <p id={ids.helpId} className="mt-1.5 text-[12px] leading-relaxed text-etyme-muted">{help}</p>}
        {error && (
          <p id={ids.errorId} role="alert" className="mt-1.5 text-[12px] leading-relaxed text-etyme-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...useFieldProps()} {...props} className={`input ${className}`} />
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...useFieldProps()} {...props} className={`input pr-8 ${className}`}>
      {children}
    </select>
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...useFieldProps()} {...props} className={`input min-h-[88px] ${className}`} />
}

/**
 * A checkbox with its words beside it, the whole line clickable.
 * Not inside a `Field`: the words are its label.
 */
export function Check({ label, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={`inline-flex items-center gap-2 text-[13px] text-etyme-ink ${props.disabled ? 'opacity-60' : 'cursor-pointer'} ${className}`}>
      <input type="checkbox" {...props} className="h-4 w-4 rounded-box border-etyme-rule accent-etyme-action" />
      {label}
    </label>
  )
}

/**
 * The button that sends the form.
 *
 * While the send is out it says what it is doing ("Inviting…") and
 * cannot be pressed again, so one click is one invitation. `pending`
 * is the page's own flag; the button only draws it.
 */
export function SubmitButton({ pending = false, pendingLabel, children, disabled, tone = 'primary', className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & {
    pending?: boolean
    /** What it says while waiting. Defaults to the label with an ellipsis. */
    pendingLabel?: ReactNode
    tone?: 'primary' | 'secondary'
  }) {
  return (
    <button
      type={props.type ?? 'submit'}
      {...props}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`${tone === 'primary' ? 'btn-primary' : 'btn-secondary'} inline-flex items-center justify-center gap-2 ${className}`}
    >
      {pending && (
        <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
      )}
      {pending ? (pendingLabel ?? <>{children}…</>) : children}
    </button>
  )
}

/**
 * What the send came back with, said once under the form: the route's
 * sentence for a refusal, its "Saved." for a success. A refusal is
 * announced; a success is spoken politely.
 */
export function FormMessage({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return tone === 'error'
    ? <p role="alert" className="text-[13px] leading-relaxed text-etyme-danger">{children}</p>
    : <p role="status" className="text-[13px] leading-relaxed text-etyme-verified">{children}</p>
}
