'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { QueueTabs } from '../queue-tabs'

/**
 * Agent control (record 107, A5). The six agents, each "Not enabled",
 * its acts today, its meter as a count of actions and its cap "Not set".
 * No switch is drawn: in week 1 there is nothing for one to turn off.
 * Under them the firm's whole ledger, newest first, a page at a time.
 */

interface Data {
  lines: string[]
  agents: { key: string; name: string; state: string; actionsToday: number; meter: string; cap: string }[]
  ledger: { page: number; pages: number; total: number; rows: { id: string; at: string; summary: string; entityName: string | null; by: string; heldAs: string; href: string }[] }
}

function when(at: string) {
  return new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AgentControlPage() {
  const section = usePageSection('/dashboard/decisions')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/decision-items/agents?page=${page}`))
      setData(body.data); setErr(null)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [page])
  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHead eyebrow={section} title="Agent control" subtitle="What each agent may do, how much it did today, and every act on the record." />
      <QueueTabs current="agents" />
      {err && <ErrorState says={err} />}
      {!data && !err && <LoadingState says="Opening agent control…" />}
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
          <div className="mt-6">
            <Panel title="Audit ledger" subtitle={`${data.ledger.total} ${data.ledger.total === 1 ? 'act' : 'acts'} on the record, newest first.`}>
              {data.ledger.rows.length === 0 ? (
                <p className="text-[13px] text-etyme-muted py-2">Nothing has been done on the record yet.</p>
              ) : (
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-left text-[12px] text-etyme-muted border-b border-etyme-rule">
                      <th className="py-2 pr-3 font-normal">Time</th>
                      <th className="py-2 pr-3 font-normal">Action</th>
                      <th className="py-2 pr-3 font-normal">Entity</th>
                      <th className="py-2 pr-3 font-normal">Person or agent</th>
                      <th className="py-2 font-normal">Role held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ledger.rows.map((r) => (
                      <tr key={r.id} className="border-b border-etyme-rule last:border-0 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{when(r.at)}</td>
                        <td className="py-2 pr-3"><Link href={r.href as any} className="text-etyme-action hover:underline">{r.summary}</Link></td>
                        <td className="py-2 pr-3">{r.entityName ?? '—'}</td>
                        <td className="py-2 pr-3">{r.by}</td>
                        <td className="py-2">{r.heldAs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {data.ledger.pages > 1 && (
                <div className="mt-3 flex gap-3 items-center text-[13px]">
                  <button className="btn-secondary text-[13px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
                  <span className="text-etyme-muted">Page {data.ledger.page} of {data.ledger.pages}</span>
                  <button className="btn-secondary text-[13px]" disabled={page >= data.ledger.pages} onClick={() => setPage(page + 1)}>Older</button>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  )
}
