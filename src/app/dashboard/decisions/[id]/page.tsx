'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { useFirstPageSection } from '@/components/page-section'
import { PageHead, Panel, ErrorState, LoadingState } from '@/components/ui'
import { Field, Input, Select, FormMessage } from '@/components/ui/form'
import { VERDICT_BUTTONS, QUEUE_EYEBROW_HREFS, onlyAcknowledged, proofParts, ageWords, decideBody, stateWords, type VerdictWord } from '@/lib/decision-queue'
import { ledgerWhen } from '@/components/ui/ledger-rows'

/**
 * One decision (record 107, A3 and A4). The question on top, the proof
 * under it, then exactly three buttons: Approve, Send back, Reject. Send
 * back and Reject need a one-line reason typed here. Once approved or
 * rejected the page says who decided, for which entity, in which role,
 * when, what and why.
 */

interface Item {
  id: string
  question: string
  proof: string | null
  /** Set for a seat that does not read the proof: who does, in a sentence. */
  proofHidden: string | null
  proofLinks: { recordType: string; recordId: string; label: string; name: string | null; href: string }[]
  state: string
  ownerName: string
  entityName: string | null
  ageDays: number
  sentBackReason: string | null
  sentBackBy: string | null
  decision: { verdict: string; personName: string; entityName: string | null; heldAs: string; at: string; reason: string | null } | null
  timeline: { id: string; summary: string; at: string; personName: string; entityName: string | null; heldAs: string }[]
  mayAct: boolean
  entities: { id: string; name: string }[]
}

const when = ledgerWhen

export default function DecisionItemPage() {
  const section = useFirstPageSection(QUEUE_EYEBROW_HREFS)
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [item, setItem] = useState<Item | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [entity, setEntity] = useState('')
  const [busy, setBusy] = useState<VerdictWord | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/decision-items/${id}`))
      setItem(body.data)
    } catch (e: any) {
      setLoadErr(e.message)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  async function decide(verdict: VerdictWord) {
    setBusy(verdict); setErr(null)
    try {
      await readJson(await fetch(`/api/decision-items/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decideBody(verdict, reason, entity)),
      }))
      if (verdict === 'SEND_BACK') { router.push('/dashboard/decisions' as any); return }
      setReason('')
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (loadErr) return <ErrorState says={loadErr} />
  if (!item) return <LoadingState says="Opening the decision…" />

  return (
    <>
      <PageHead
        eyebrow={section}
        title={item.question}
        subtitle={`${stateWords(item.state)} · owed by ${item.ownerName}${item.entityName ? ` · for ${item.entityName}` : ''} · ${ageWords(item.ageDays)}`}
        actions={<Link href={'/dashboard/decisions' as any} className="btn-secondary text-[13px]">Back to the queue</Link>}
      />

      <Panel title="Proof">
        {item.proofHidden && <p className="text-[14px] text-etyme-muted">{item.proofHidden}</p>}
        {item.proof && (
          <p className="text-[14px] text-etyme-ink whitespace-pre-line">
            {proofParts(item.proof).map((part, i) => part.href
              ? <Link key={i} href={part.href as any} className="text-etyme-action hover:underline">{part.text}</Link>
              : <span key={i}>{part.text}</span>)}
          </p>
        )}
        {item.proofLinks.some((l) => l.name) && (
          <ul className="mt-3 text-[14px]">
            {item.proofLinks.filter((l) => l.name).map((l) => (
              <li key={`${l.recordType}:${l.recordId}`} className="py-1">
                <span className="text-etyme-muted">{l.label}: </span>
                <Link href={l.href as any} className="text-etyme-action hover:underline">{l.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {item.state === 'OPEN' && item.sentBackReason && (
        <p className="mt-4 text-[14px] text-etyme-attention">Sent back{item.sentBackBy ? ` by ${item.sentBackBy}` : ''}: {item.sentBackReason}</p>
      )}

      {item.decision && (
        <div className="mt-5">
          <Panel title={`${stateWords(item.decision.verdict)} by ${item.decision.personName}`}>
            <dl className="grid sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[14px]">
              <dt className="text-etyme-muted">Decided by</dt><dd>{item.decision.personName}</dd>
              <dt className="text-etyme-muted">For</dt><dd>{item.decision.entityName ?? 'The firm (no legal entity on record)'}</dd>
              <dt className="text-etyme-muted">As</dt><dd>{item.decision.heldAs}</dd>
              <dt className="text-etyme-muted">When</dt><dd className="tabular-nums">{when(item.decision.at)}</dd>
              <dt className="text-etyme-muted">Decision</dt><dd>{stateWords(item.decision.verdict)}</dd>
              <dt className="text-etyme-muted">Reason</dt><dd>{item.decision.reason ?? 'None given'}</dd>
            </dl>
          </Panel>
        </div>
      )}

      {item.state === 'OPEN' && item.mayAct && (
        <div className="mt-5 grid gap-4 max-w-[620px]">
          {item.entities.length > 1 && (
            <Field label="The legal entity you decide for" id="dq-decide-entity">
              <Select id="dq-decide-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">Choose an entity</option>
                {item.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
          {!onlyAcknowledged(item.question) && (
            <Field label="Reason" help="One line. Needed to send it back or reject it." id="dq-reason">
              <Input id="dq-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          {err && <FormMessage tone="error">{err}</FormMessage>}
          <div className="flex flex-wrap gap-2">
            {onlyAcknowledged(item.question) ? (
              <button type="button" disabled={busy !== null} onClick={() => decide('APPROVE')} className="btn-primary text-[13px]">
                {busy === 'APPROVE' ? 'Saving…' : 'Done'}
              </button>
            ) : VERDICT_BUTTONS.map((b) => (
              <button key={b.verdict} type="button" disabled={busy !== null} onClick={() => decide(b.verdict)}
                className={b.verdict === 'APPROVE' ? 'btn-primary text-[13px]' : 'btn-secondary text-[13px]'}>
                {busy === b.verdict ? 'Saving…' : b.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {item.state === 'OPEN' && !item.mayAct && (
        <p className="mt-5 text-[14px] text-etyme-muted">Only {item.ownerName}, or the firm’s Owner or an Admin, decides this.</p>
      )}

      {!item.proofHidden && <div className="mt-8">
        <Panel title="History">
          <ul className="text-[13px]">
            {item.timeline.map((r) => (
              <li key={r.id} className="py-1 border-b border-etyme-rule last:border-0">
                <span className="tabular-nums text-etyme-muted">{when(r.at)}</span> · {r.summary} · {r.personName}, {r.heldAs}{r.entityName ? `, for ${r.entityName}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px]"><Link href={`/dashboard/records/DecisionItem/${item.id}` as any} className="text-etyme-action hover:underline">Open the record view</Link></p>
        </Panel>
      </div>}
    </>
  )
}
