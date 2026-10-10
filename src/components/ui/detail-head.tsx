'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePageSection } from '@/components/page-section'

/**
 * The head of a page about one thing — a placement, a week, an invoice.
 *
 * A way back to the list it came from; the eyebrow, which is the section
 * that list sits under on the reader's own menu, read through
 * `usePageSection` so it can never name a section the reader's menu does
 * not have (sign-up walk, round six, problem 6); the serif title; one
 * line under it; the chips that say how it stands; and its actions.
 *
 * No eyebrow is drawn while the session loads, or where the reader's
 * menu does not list the parent page — a blank is honest, a guess is not.
 */
export function DetailHead({ from, back, title, subtitle, meta, actions, children }: {
  /** The list this page hangs under, e.g. '/dashboard/contracts'. Decides the eyebrow. */
  from: string
  /** The way back. Usually the same list, in the menu's own word. */
  back?: { href: string; label: string }
  title: ReactNode
  subtitle?: ReactNode
  /** Chips, under the subtitle: the status first. */
  meta?: ReactNode
  actions?: ReactNode
  /** A line or two more under the subtitle — a warning, said once. */
  children?: ReactNode
}) {
  const section = usePageSection(from)
  return (
    <header className="mb-6 sm:mb-8">
      {back && (
        <Link
          href={back.href as any}
          className="mb-4 inline-flex items-center gap-1 rounded-nav text-[12.5px] text-etyme-action-press hover:underline"
        >
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {section && <p className="eyebrow">{section}</p>}
          <h1 className={`headline-serif text-[26px] leading-[1.15] text-etyme-ink sm:text-display ${section ? 'mt-2' : ''}`}>
            {title}
          </h1>
          {subtitle && <p className="mt-2 max-w-[620px] text-[14.5px] leading-relaxed text-etyme-muted">{subtitle}</p>}
          {children}
          {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
