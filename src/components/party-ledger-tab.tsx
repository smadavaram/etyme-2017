'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Panel, ErrorState, LoadingState } from '@/components/ui'
import { formatDay } from '@/lib/format-date'
import { PartyLetters } from '@/components/party-letters'
import type { LetterPanel } from '@/lib/party-ledger/lines'

/**
 * The Ledger tab (record 134): one party's activity, money and documents as
 * the route reads them from the one record. A line opens its record; a
 * plugin's line is a plain link out to the plugin's own site and draws
 * nothing of the plugin. This component imports no plugin component.
 */

interface Line { kind: string; says: string; when: string | null; href: string; plugin: string | null; source: { type: string; id: string } }
interface Ledger { subject: { name: string }; activity: Line[]; money: Line[]; documents: Line[]; notes: string[]; letters: LetterPanel | null }

const SECTIONS: { key: 'activity' | 'money' | 'documents'; title: string; empty: string }[] = [
  { key: 'activity', title: 'Activity', empty: 'Nothing on your book yet: no jobs, applications, placements or timesheets.' },
  { key: 'money', title: 'Money', empty: 'No bills, invoice receipts or rates you may read yet.' },
  { key: 'documents', title: 'Documents', empty: 'No contracts, papers or certificates on file yet.' },
]

export function PartyLedgerTab({ kind, id }: { kind: 'person' | 'company'; id: string }) {
  const [data, setData] = useState<Ledger | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [again, setAgain] = useState(0)
  useEffect(() => {
    fetch(`/api/party-ledger/${kind}/${encodeURIComponent(id)}`).then((r) => readJson(r)).then((b) => setData(b.data)).catch((e) => setErr(e.message))
  }, [kind, id, again])
  if (err) return <ErrorState says={err} />
  if (!data) return <LoadingState says="Reading the ledger…" />
  return (
    <div className="space-y-6">
      {data.notes.map((n) => <p key={n} className="text-[13px] text-etyme-muted">{n}</p>)}
      {data.letters && <PartyLetters name={data.subject.name} letters={data.letters} onAsked={() => setAgain((n) => n + 1)} />}
      {SECTIONS.map((s) => (
        <Panel key={s.key} title={s.title}>
          {data[s.key].length === 0 ? <p className="text-[13px] text-etyme-muted py-2">{s.empty}</p> : (
            <table className="w-full text-[13px]">
              <tbody>
                {data[s.key].map((l, i) => (
                  <tr key={`${l.source.type}-${l.source.id}-${i}`} className="border-t border-etyme-rule">
                    <td className="py-1.5 pr-3 tabular-nums text-etyme-faint whitespace-nowrap">{l.when ? formatDay(new Date(l.when)) : ''}</td>
                    <td className="py-1.5 pr-3 text-etyme-muted">{l.kind}</td>
                    <td className="py-1.5 pr-3">{l.says}</td>
                    <td className="py-1.5 text-right">
                      {l.plugin
                        ? <a href={l.href} className="text-etyme-action-text">Open on its own site</a>
                        : <Link href={l.href as any} className="text-etyme-action-text">Open</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      ))}
    </div>
  )
}
