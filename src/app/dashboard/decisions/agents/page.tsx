'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { readJson, isRefusal } from '@/lib/read-response'
import { useFirstPageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState, RefusedState } from '@/components/ui'
import { QueueTabs } from '../queue-tabs'
import { LedgerRows } from '@/components/ui/ledger-rows'
import { QUEUE_EYEBROW_HREFS } from '@/lib/decision-queue'

/**
 * Agent control (record 107, A5). The six agents, each "Not enabled",
 * its acts today, its meter as a count of actions and its cap "Not set".
 * No switch is drawn: in week 1 there is nothing for one to turn off.
 * Under them the firm's whole ledger, newest first, a page at a time, for
 * the seats that read it; any other seat reads who does. A seat that
 * does not read payroll is told how many acts on payroll records it is
 * not shown. A seat the door refuses reads the door's sentence once and
 * nothing else.
 */

interface Data {
  lines: string[]
  agents: { key: string; name: string; state: string; actionsToday: number; meter: string; cap: string }[]
  /** Set for a seat that does not read the firm's ledger: who does, in a sentence. */
  ledgerHidden: string | null
  ledger: null | { page: number; pages: number; total: number; payrollHidden: string | null; rows: { id: string; at: string; summary: string; entityName: string | null; by: string; heldAs: string; href: string }[] }
}

export default function AgentControlPage() {
  const section = useFirstPageSection(QUEUE_EYEBROW_HREFS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/decision-items/agents?page=${page}`))
      setData(body.data); setErr(null)
    } catch (e: any) {
      if (isRefusal(e)) { setRefused(e.message); return }
      setErr(e.message)
    }
  }, [page])
  useEffect(() => { load() }, [load])

  if (refused) return <RefusedState says={refused} />
  if (!data && !err) return <LoadingState says="Opening agent control…" />

  return (
    <>
      <PageHead eyebrow={section} title="Agent control" subtitle="What each agent may do, how much it did today, and every act on the record." />
      <QueueTabs current="agents" />
      {err && <ErrorState says={err} />}
      {data && (
        <>
          <ul className="mb-5 text-[14px] text-etyme-ink">
            {data.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <Panel title="Agents">
            <table className="w-full text-[14px] tabular-nums">
              <thead>
                <tr className="text-left text-[12px] text-etyme-muted border-b border-etyme-rule">
                  <th className="py-2 pr-3 font-normal">Agent</th>
                  <th className="py-2 pr-3 font-normal">State</th>
                  <th className="py-2 pr-3 font-normal">Actions today</th>
                  <th className="py-2 pr-3 font-normal">Meter</th>
                  <th className="py-2 font-normal">Cap</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.key} className="border-b border-etyme-rule last:border-0">
                    <td className="py-2 pr-3">{a.name}</td>
                    <td className="py-2 pr-3 text-etyme-muted">{a.state}</td>
                    <td className="py-2 pr-3">{a.actionsToday}</td>
                    <td className="py-2 pr-3">{a.meter}</td>
                    <td className="py-2 text-etyme-muted">{a.cap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {data.ledgerHidden && <p className="mt-6 text-[13px] text-etyme-muted">{data.ledgerHidden}</p>}
          {data.ledger && (
          <div className="mt-6">
            <Panel title="Audit ledger" subtitle={`${data.ledger.total} ${data.ledger.total === 1 ? 'act' : 'acts'} on the record, newest first.`}>
              {data.ledger.rows.length === 0 ? (
                <p className="text-[13px] text-etyme-muted py-2">Nothing has been done on the record yet.</p>
              ) : (
                <LedgerRows rows={data.ledger.rows} />
              )}
              {data.ledger.payrollHidden && <p className="mt-3 text-[13px] text-etyme-muted">{data.ledger.payrollHidden}</p>}
              {data.ledger.pages > 1 && (
                <div className="mt-3 flex gap-3 items-center text-[13px]">
                  <button className="btn-secondary text-[13px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
                  <span className="text-etyme-muted">Page {data.ledger.page} of {data.ledger.pages}</span>
                  <button className="btn-secondary text-[13px]" disabled={page >= data.ledger.pages} onClick={() => setPage(page + 1)}>Older</button>
                </div>
              )}
            </Panel>
          </div>
          )}
        </>
      )}
    </>
  )
}
