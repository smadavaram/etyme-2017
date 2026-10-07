'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * "Finish setting up: your people, your team." — one line, on the
 * dashboard, with a link back.
 *
 * The founder, 2026-10-07: a company that skipped steps sees one line on
 * the dashboard linking back; one that finished never sees the steps
 * again. Drawn on the three consoles only — a reminder on every page is
 * nagging, not a reminder — and only for a seat that can finish setup:
 * `GET /api/onboarding/setup` answers null for everybody else, and for any
 * company that never began the five steps.
 */

const CONSOLES = new Set(['/dashboard', '/dashboard/program', '/dashboard/my-work'])

export function SetupReminder() {
  const pathname = usePathname()
  const onConsole = CONSOLES.has(pathname ?? '')
  const [line, setLine] = useState<{ says: string; href: string } | null>(null)

  useEffect(() => {
    if (!onConsole) return
    let live = true
    fetch('/api/onboarding/setup')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setLine(j?.data?.reminder ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [onConsole])

  if (!onConsole || !line) return null
  return (
    <div className="mb-5 px-4 py-2.5 rounded-lg border border-etyme-rule bg-etyme-surface text-[13px] text-etyme-ink flex items-center justify-between gap-3">
      <span>{line.says}</span>
      <Link href={line.href as any} className="text-etyme-action font-medium shrink-0 hover:underline">Finish setup</Link>
    </div>
  )
}
