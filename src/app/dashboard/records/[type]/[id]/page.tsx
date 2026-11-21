'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'

/**
 * The record view (record 107, A6): one record on the firm's book, a link
 * to its own page, and its whole history from the record ledger. A record
 * of another company is refused in a sentence by the route.
 */

interface Data {
  name: string
  ownPage: { href: string; words: string }
  timeline: { id: string; at: string; summary: string; personName: string; entityName: string | null; heldAs: string; agentKey: string | null }[]
}

function when(at: string) {
  return new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function RecordViewPage() {
  const section = usePageSection('/dashboard/decisions')
  const { type, id } = useParams<{ type: string; id: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/records/${encodeURIComponent(type)}/${encodeURIComponent(id)}`).then((r) => readJson(r))
      .then((b) => setData(b.data))
      .catch((e) => setErr(e.message))
  }, [type, id])

  if (err) return <ErrorState says={err} />
  if (!data) return <LoadingState says="Opening the record…" />
  return (
    <>
      <PageHead
        eyebrow={section}
        title={data.name}
        actions={<Link href={data.ownPage.href as any} className="btn-secondary text-[13px]">{data.ownPage.words}</Link>}
      />
      <Panel title="History" subtitle="Every act on this record, oldest first.">
        {data.timeline.length === 0 ? (
          <p className="text-[13px] text-etyme-muted py-2">Nothing has been done on this record through the ledger yet.</p>
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
              {data.timeline.map((r) => (
                <tr key={r.id} className="border-b border-etyme-rule last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{when(r.at)}</td>
                  <td className="py-2 pr-3">{r.summary}</td>
                  <td className="py-2 pr-3">{r.entityName ?? '—'}</td>
                  <td className="py-2 pr-3">{r.agentKey ? `${r.agentKey} for ${r.personName}` : r.personName}</td>
                  <td className="py-2">{r.heldAs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
