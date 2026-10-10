'use client'

/**
 * The frame the settings page draws its panels in, shared with the panels
 * that also appear at setup (week-panel, payroll-panel), so a panel looks
 * the same wherever it is drawn. Since 2026-10-09 it is the shared
 * `Panel` and `Lbl` (components/ui/surface), spaced for a stack.
 */

import { formatDay } from '@/lib/format-date'
import { Lbl as SharedLbl, Panel as SharedPanel } from '@/components/ui/surface'

export function Lbl({ children }: { children: React.ReactNode }) {
  return <SharedLbl>{children}</SharedLbl>
}

/** The shared `Panel`, spaced for a page of panels stacked one under another. */
export function Panel({ title, subtitle, children, action }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <SharedPanel title={title} subtitle={subtitle} action={action} className="mb-5">
      {children}
    </SharedPanel>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-etyme-muted py-3">{children}</p>
}

/** "Last changed by Dana Whitfield on Oct 6, 2026", or that the defaults stand. */
export function setLine(setAt: string | null, setByName: string | null): string {
  if (!setAt) return 'Nobody has changed this yet. These are the defaults.'
  return `Last changed by ${setByName ?? 'somebody no longer here'} on ${formatDay(setAt)}.`
}
