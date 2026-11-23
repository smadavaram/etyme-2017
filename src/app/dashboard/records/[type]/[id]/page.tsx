'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { useFirstPageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { LedgerRows } from '@/components/ui/ledger-rows'
import { QUEUE_EYEBROW_HREFS } from '@/lib/decision-queue'
import { formatDay } from '@/lib/format-date'

/**
 * The record view (record 107, A6): one record on the firm's book, a link
 * to its own page, and its whole history from the record ledger. A record
 * of another company is refused in a sentence by the route. Its own key
 * fields sit above the history; an empty history says when the ledger
 * began. At phone width each history row stacks as lines.
 */

interface Data {
  name: string
  ownPage: { href: string; words: string }
  facts: { label: string; value: string }[]
  emptySays: string | null
  timeline: { id: string; at: string; summary: string; personName: string; entityName: string | null; heldAs: string; agentKey: string | null; by: string }[]
}

/** A calendar day (YYYY-MM-DD) written out; any other value as it is. */
const shown = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDay(new Date(`${v}T00:00:00Z`)) : v)

export default function RecordViewPage() {
  const section = useFirstPageSection(QUEUE_EYEBROW_HREFS)
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
      {data.facts.length > 0 && (
        <div className="mb-6">
          <Panel title="The record">
            <dl className="grid sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[14px]">
              {data.facts.map((f) => (
                <Fragment key={f.label}><dt className="text-etyme-muted">{f.label}</dt><dd className="tabular-nums">{shown(f.value)}</dd></Fragment>
              ))}
            </dl>
          </Panel>
        </div>
      )}
      <Panel title="History" subtitle="Every act on this record through the ledger, oldest first.">
        {data.timeline.length === 0 ? (
          <p className="text-[13px] text-etyme-muted py-2">{data.emptySays}</p>
        ) : (
          <LedgerRows rows={data.timeline.map((r) => ({ id: r.id, at: r.at, summary: r.summary, entityName: r.entityName, by: r.by, heldAs: r.heldAs }))} />
        )}
      </Panel>
    </>
  )
}
