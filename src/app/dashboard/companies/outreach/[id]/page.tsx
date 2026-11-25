'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useParams } from 'next/navigation'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { ErrorState, LoadingState, PageHead, Panel, Stat } from '@/components/ui'

/**
 * One outreach batch: where it stands, and per contact whether the letter
 * went, was answered, was unsubscribed or bounced. Sent and bounced are
 * counted from the mail sent. There is no open rate: a letter has no
 * tracking in it.
 */

interface View {
  id: string; state: string; subject: string | null; audience: string | null; offer: string | null; closedReason: string | null
  card: { id: string; state: string } | null; stopped: string | null
  counts: { contacts: number; sent: number; interested: number; unsubscribed: number; bounced: number; waiting: number }
  rows: { id: string; name: string; email: string; companyName: string; times: number; interested: boolean; unsubscribed: boolean; bounced: boolean; says: string }[]
  held: { companyName: string; says: string }[]
}

const STATE: Record<string, string> = {
  PROPOSED: 'Waiting for a yes on its card.', APPROVED: 'Approved. The letters go on the next run.', RUNNING: 'Sending.',
  DONE: 'Finished.', STOPPED: 'Stopped.', REFUSED: 'Not approved. Nothing was sent.',
}

export default function OutreachBatchPage() {
  const { id } = useParams<{ id: string }>()
  const eyebrow = usePageSection('/dashboard/companies/outreach')
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try { const out = await readJson(await fetch(`/api/outreach/batches/${id}`)); if (live) setView(out.data) }
      catch (err: any) { if (live) setError(err.message) }
    })()
    return () => { live = false }
  }, [id])

  if (error) return <ErrorState says={error} />
  if (!view) return <LoadingState />
  const c = view.counts
  return (
    <div>
      <PageHead
        eyebrow={eyebrow}
        title={view.subject ?? 'Outreach batch'}
        subtitle={`${view.audience ?? ''}${view.offer ? ` · ${view.offer}` : ''}. ${STATE[view.state] ?? ''}${view.closedReason ? ` ${view.closedReason}` : ''}`.trim()}
        actions={<Link className="text-[13px] text-etyme-action" href={'/dashboard/companies/outreach' as Route}>All batches</Link>}
      />
      {view.stopped && <p className="mb-4 text-[13px] text-etyme-attention">{view.stopped}</p>}
      {view.state === 'PROPOSED' && view.card && (
        <p className="mb-4 text-[13px] text-etyme-muted">The one yes is on a card for the Account Manager, or the Owner. <Link className="text-etyme-action" href={'/dashboard' as Route}>Open the decisions</Link>.</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <Stat label="Contacts" value={c.contacts} />
        <Stat label="Sent" value={c.sent} />
        <Stat label="Interested" value={c.interested} />
        <Stat label="Unsubscribed" value={c.unsubscribed} />
        <Stat label="Bounced" value={c.bounced} />
      </div>
      {c.waiting > 0 && <p className="mt-3 text-[13px] text-etyme-muted">{c.waiting} {c.waiting === 1 ? 'letter is' : 'letters are'} waiting. {c.waiting === 1 ? 'It goes' : 'They go'} on the next run, within the agent’s daily cap.</p>}
      <Panel className="mt-4">
        <h2 className="headline-serif text-[20px]">Contacts</h2>
        <ul className="mt-2 divide-y divide-etyme-rule text-[13px]">
          {view.rows.map((r) => (
            <li key={r.id} className="py-2">
              <p><span className="text-etyme-ink">{r.name}</span> <span className="text-etyme-muted">at {r.companyName} · {r.email}</span></p>
              <p className="text-etyme-muted">{r.says}</p>
            </li>
          ))}
        </ul>
        {view.held.length > 0 && (
          <>
            <h3 className="mt-5 text-[13px] font-medium text-etyme-ink">Held, not written to: {view.held.length}</h3>
            <ul className="mt-1 space-y-1 text-[13px] text-etyme-muted">{view.held.map((h) => <li key={h.companyName + h.says}>{h.says}</li>)}</ul>
          </>
        )}
      </Panel>
    </div>
  )
}
