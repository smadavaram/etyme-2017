'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FormMessage, SubmitButton } from '@/components/ui/form'
import type { WeekBillView } from '@/lib/money/week-bill'

/**
 * An approved week's bill section: "Bill this week" for the seat that
 * bills, and the bill's state afterwards (drafted, sent, paid). Draws
 * nothing where the reader's firm bills nothing on this week.
 */
export function BillThisWeek({ timesheetId }: { timesheetId: string }) {
  const [view, setView] = useState<WeekBillView | null>(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/invoices/week/${timesheetId}`)
        const body = await res.json().catch(() => ({}))
        if (live && res.ok) setView(body.data ?? null)
      } catch { /* nothing drawn */ }
    })()
    return () => { live = false }
  }, [timesheetId])

  async function press() {
    setBusy(true)
    setRefused(null)
    try {
      const res = await fetch(`/api/invoices/week/${timesheetId}`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setRefused(body.error?.message ?? 'The week could not be billed.'); return }
      setView(body.data?.week ?? null)
    } catch {
      setRefused('The server could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!view) return null
  return (
    <div className="card mt-3 space-y-2">
      <div className="lbl">Bill</div>
      {view.bill ? (
        <p className="text-[13px] text-etyme-ink">
          {view.bill.says}{' '}
          <Link href={`/dashboard/invoices/${view.bill.invoiceId}`} className="text-etyme-action hover:underline">Open the bill</Link>
        </p>
      ) : view.says ? (
        <p className="text-[13px] text-etyme-muted">{view.says}</p>
      ) : null}
      {view.mayBill && (
        <SubmitButton type="button" onClick={press} pending={busy} pendingLabel="Drafting the bill…">Bill this week</SubmitButton>
      )}
      {refused && <FormMessage tone="error">{refused}</FormMessage>}
    </div>
  )
}
