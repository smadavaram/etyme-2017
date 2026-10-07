'use client'

/**
 * The frame the settings page draws its panels in, shared with the panels
 * that also appear at setup (week-panel, payroll-panel), so a panel looks
 * the same wherever it is drawn.
 */

import { formatDay } from '@/lib/format-date'

export function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

export function Panel({ title, subtitle, children, action }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-serif text-[19px] text-etyme-ink tracking-[-0.02em]">{title}</h2>
          {subtitle && <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-etyme-faint py-3">{children}</p>
}

/** "Last changed by Dana Whitfield on Oct 6, 2026", or that the defaults stand. */
export function setLine(setAt: string | null, setByName: string | null): string {
  if (!setAt) return 'Nobody has changed this yet. These are the defaults.'
  return `Last changed by ${setByName ?? 'somebody no longer here'} on ${formatDay(setAt)}.`
}
