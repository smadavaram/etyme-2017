'use client'

import { useEffect, useState } from 'react'

interface DraftRowView { person: string; hours: number; overtimeHours: number; grossPay: string; currency: string; held: string[] }
interface DraftView { id: string; period: string; people: number; totalGross: string; rows: DraftRowView[] }

/**
 * What the payroll agent has prepared for periods that have ended: the
 * people, hours and gross the run would hold, and each week held with its
 * reason. It is a draft and says so. Nothing on this panel runs, approves or
 * pays anything: the run below stays a person's act, through its own gates.
 */
export default function PayrollDrafts() {
  const [label, setLabel] = useState('')
  const [drafts, setDrafts] = useState<DraftView[]>([])

  useEffect(() => {
    fetch('/api/payroll/drafts')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b?.data) return
        setLabel(b.data.label)
        setDrafts(b.data.drafts)
      })
      .catch(() => {})
  }, [])

  if (drafts.length === 0) return null
  return (
    <section aria-label="Payroll drafts" className="mb-4 rounded border border-etyme-rule bg-etyme-surface p-3">
      {drafts.map((d) => (
        <div key={d.id} className="mb-3 last:mb-0">
          <p className="text-[12.5px] text-etyme-muted">{label}</p>
          <p className="text-[13px] font-medium">
            {d.period}: {d.people} {d.people === 1 ? 'person' : 'people'}, total gross {d.totalGross}
          </p>
          <ul className="mt-1 text-[12.5px]">
            {d.rows.map((r, i) => (
              <li key={`${r.person}-${i}`}>
                {r.person}: {r.hours} hours, {r.grossPay}
                {r.held.map((h, j) => (
                  <span key={j} className="block text-etyme-attention">{h}</span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
