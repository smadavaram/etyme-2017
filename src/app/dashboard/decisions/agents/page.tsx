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
 * Agent control (record 107, A5; record 112, chain 7). Each agent's real
 * switch, Off, Drafts only or On, changed by the Owner alone and read by
 * everybody else; its acts today against its daily cap ("3 of 10 today");
 * the tasks waiting for a yes and the ones running. Off is the kill
 * switch: it stops the next run and any send of a running task at once.
 * Under them the firm's whole ledger, newest first, a page at a time, for
 * the seats that read it; any other seat reads who does. A seat that
 * does not read payroll is told how many acts on payroll records it is
 * not shown. A seat the door refuses reads the door's sentence once and
 * nothing else.
 */

interface Data {
  lines: string[]
  canSwitch: boolean
  entities: { id: string; name: string }[]
  agents: { key: string; name: string; switchState: 'OFF' | 'DRAFT_ONLY' | 'ON'; state: string; dailyCap: number | null; actionsToday: number; meter: string; cap: string }[]
  tasks: { id: string; agentKey: string; kind: string; state: string; question: string; ownerName: string; decisionId: string; sent: number; escalationOf: string | null }[]
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
  const [saying, setSaying] = useState<string | null>(null)
  const [entity, setEntity] = useState('')

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

  async function change(agentKey: string, state: string, dailyCap?: number | null) {
    setSaying(null)
    try {
      await readJson(await fetch('/api/decision-items/agents', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentKey, state, ...(dailyCap !== undefined ? { dailyCap } : {}), actingEntityId: entity || null }),
      }))
      setSaying('Saved.'); await load()
    } catch (e: any) { setSaying(e.message) }
  }

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
                  <th className="py-2 pr-3 font-normal">Switch</th>
                  <th className="py-2 pr-3 font-normal">Actions today</th>
                  <th className="py-2 pr-3 font-normal">Meter</th>
                  <th className="py-2 font-normal">Cap</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.key} className="border-b border-etyme-rule last:border-0">
                    <td className="py-2 pr-3">{a.name}</td>
                    <td className="py-2 pr-3">
                      {data.canSwitch ? (
                        <select aria-label={`${a.name} switch`} className="input text-[13px]" value={a.switchState} onChange={(e) => change(a.key, e.target.value)}>
                          <option value="OFF">Off</option><option value="DRAFT_ONLY">Drafts only</option><option value="ON">On</option>
                        </select>
                      ) : <span className="text-etyme-muted">{a.state}</span>}
                    </td>
                    <td className="py-2 pr-3">{a.actionsToday}</td>
                    <td className="py-2 pr-3">{a.meter}</td>
                    <td className="py-2 text-etyme-muted">
                      {a.cap}
                      {data.canSwitch && (
                        <button className="ml-2 underline text-[12px]" onClick={() => {
                          const v = window.prompt('Most acts a day, or leave empty for no cap', a.dailyCap?.toString() ?? '')
                          if (v === null) return
                          change(a.key, a.switchState, v.trim() === '' ? null : Number(v))
                        }}>Set cap</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.canSwitch && data.entities.length > 0 && (
              <label className="mt-3 block text-[13px]">Change made for{' '}
                <select className="input text-[13px]" value={entity} onChange={(e) => setEntity(e.target.value)}>
                  <option value="">Choose a legal entity</option>
                  {data.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </label>
            )}
            {saying && <p className="mt-2 text-[13px] text-etyme-muted">{saying}</p>}
            <p className="mt-3 text-[13px] text-etyme-muted">Off stops the next run and any send of a running task at once. Drafts only prepares tasks and sends nothing, even after a yes. Only the Owner changes a switch.</p>
          </Panel>
          <div className="mt-6">
            <Panel title="Tasks" subtitle="Each asks for one yes. One yes releases the whole task; a new task asks again.">
              {data.tasks.length === 0 ? (
                <p className="text-[13px] text-etyme-muted py-2">No agent has a task open.</p>
              ) : (
                <ul className="text-[14px]">
                  {data.tasks.map((t) => (
                    <li key={t.id} className="py-2 border-b border-etyme-rule last:border-0">
                      <Link href={`/dashboard/decisions/${t.decisionId}`} className="underline">{t.question}</Link>
                      <span className="ml-2 text-etyme-muted text-[13px]">
                        {t.state === 'PROPOSED' ? `Waiting for a yes from ${t.ownerName}` : `Running, ${t.sent} sent`}{t.escalationOf ? ' · an escalation' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
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
