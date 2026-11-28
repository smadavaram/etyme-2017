'use client'

import type { ReactNode } from 'react'

/**
 * The row of filter chips every list draws under its search: one word
 * each, a count beside it, one pressed at a time. Learned once, read the
 * same on every list (CLAUDE.md, "The same five questions on every list").
 *
 * The pressed chip is ink on cream, the prototype's own pill; a chip
 * whose meaning is a warning (Blocked) is clay when pressed. A chip with
 * nothing behind it is not offered — leave it out of `options`.
 */
export interface FilterOption<K extends string> {
  key: K
  label: ReactNode
  count?: number
  /** Pressed in clay rather than ink: the filter shows something wrong. */
  warn?: boolean
}

export function FilterChips<K extends string>({ options, value, onChange, label = 'Filter', end }: {
  options: FilterOption<K>[]
  value: K
  onChange: (k: K) => void
  /** What the row filters, for a screen reader. */
  label?: string
  /** At the right end of the row — a place picker, say. */
  end?: ReactNode
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-[12.5px] transition-colors ${
              on
                ? o.warn ? 'border-etyme-attention bg-etyme-attention font-medium text-white' : 'border-etyme-ink bg-etyme-ink font-medium text-etyme-canvas'
                : 'border-etyme-rule bg-etyme-surface text-etyme-muted hover:border-etyme-faint hover:text-etyme-ink'
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className="tabular-nums opacity-70">{o.count}</span>}
          </button>
        )
      })}
      {end && <div className="ml-auto">{end}</div>}
    </div>
  )
}
