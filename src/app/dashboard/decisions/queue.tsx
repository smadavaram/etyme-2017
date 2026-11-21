'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, Input, Select, Textarea, SubmitButton, FormMessage } from '@/components/ui/form'
import { Panel } from '@/components/ui'
import { ageWords, openBody, type OpenTyped } from '@/lib/decision-queue'

/**
 * The decision queue (record 107, A2): the firm's decisions, oldest first,
 * each a question, its owner, its age in days and the acting entity. A
 * row opens the item (A3). "Decided" finds the closed ones. The Owner or
 * an Admin opens a decision with the form below the list.
 */

interface Row {
  id: string
  question: string
  ownerName: string
  entityName: string | null
  ageDays: number
  state: string
  sentBackReason: string | null
  sentBackBy: string | null
  decidedBy: string | null
}

interface QueueData {
  items: Row[]
  mayOpen: boolean
  people: { id: string; name: string }[]
  entities: { id: string; name: string }[]
  proofTypes: { type: string; label: string }[]
}

export function DecisionQueue() {
  const [which, setWhich] = useState<'open' | 'decided'>('open')
  const [data, setData] = useState<QueueData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/decision-items?state=${which}`))
      setData(body.data); setErr(null)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [which])
  useEffect(() => { load() }, [load])

  return (
    <section className="mb-10" aria-label="Decision queue">
      <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Which decisions">
        {(['open', 'decided'] as const).map((w) => (
          <button key={w} onClick={() => setWhich(w)} aria-pressed={which === w}
            className={`px-3 py-1 rounded text-[13px] ${which === w ? 'bg-etyme-sunk text-etyme-ink' : 'text-etyme-muted hover:text-etyme-ink'}`}>
            {w === 'open' ? 'Open' : 'Decided'}
          </button>
        ))}
      </div>
      {err && <FormMessage tone="error">{err}</FormMessage>}
      {!data && !err && <p className="text-[13px] text-etyme-muted">Opening the decision queue…</p>}
      {data && data.items.length === 0 && (
        <p className="text-[14px] text-etyme-muted py-3">
          {which === 'open' ? 'Nothing is waiting on a decision. A decision appears here when the Owner or an Admin opens one.' : 'Nothing has been decided here yet.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <table className="w-full text-[14px] tabular-nums">
          <thead>
            <tr className="text-left text-[12px] text-etyme-muted border-b border-etyme-rule">
              <th className="py-2 pr-3 font-normal">Question</th>
              <th className="py-2 pr-3 font-normal">Owner</th>
              <th className="py-2 pr-3 font-normal">Age</th>
              <th className="py-2 font-normal">Entity</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id} className="border-b border-etyme-rule align-top">
                <td className="py-3 pr-3">
                  <Link href={`/dashboard/decisions/${r.id}` as any} className="text-etyme-ink hover:underline">{r.question}</Link>
                  {r.state === 'OPEN' && r.sentBackReason && (
                    <p className="mt-1 text-[13px] text-etyme-attention">Sent back{r.sentBackBy ? ` by ${r.sentBackBy}` : ''}: {r.sentBackReason}</p>
                  )}
                  {r.state !== 'OPEN' && (
                    <p className="mt-1 text-[13px] text-etyme-muted">{r.state === 'APPROVED' ? 'Approved' : 'Rejected'}{r.decidedBy ? ` by ${r.decidedBy}` : ''}</p>
                  )}
                </td>
                <td className="py-3 pr-3">{r.ownerName}</td>
                <td className="py-3 pr-3 whitespace-nowrap">{ageWords(r.ageDays)}</td>
                <td className="py-3">{r.entityName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data?.mayOpen && <OpenDecisionForm data={data} onOpened={load} />}
    </section>
  )
}

/** Today as YYYY-MM-DD, the form's latest day. */
function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function OpenDecisionForm({ data, onOpened }: { data: QueueData; onOpened: () => void }) {
  const blank: OpenTyped = { question: '', ownerPersonId: '', openedOn: todayIso(), actingEntityId: '', proof: '', proofLinks: [] }
  const [f, setF] = useState<OpenTyped>(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [linkType, setLinkType] = useState('')
  const [linkQuery, setLinkQuery] = useState('')
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const hasEntities = data.entities.length > 0

  useEffect(() => {
    if (!linkType) { setChoices([]); return }
    let gone = false
    fetch(`/api/decision-items/records?type=${encodeURIComponent(linkType)}&q=${encodeURIComponent(linkQuery)}`)
      .then((r) => readJson(r))
      .then((b) => { if (!gone) setChoices(b.data.records) })
      .catch((e) => { if (!gone) setErr(e.message) })
    return () => { gone = true }
  }, [linkType, linkQuery])

  function addLink(recordId: string) {
    const r = choices.find((c) => c.id === recordId)
    if (!r || f.proofLinks.some((l) => l.recordType === linkType && l.recordId === recordId)) return
    setF({ ...f, proofLinks: [...f.proofLinks, { recordType: linkType, recordId }] })
    setNames({ ...names, [`${linkType}:${recordId}`]: r.name })
  }

  async function open() {
    setBusy(true); setErr(null); setNote(null)
    try {
      const body = await readJson(await fetch('/api/decision-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(openBody(f)),
      }))
      setNote(body.data.message)
      setF(blank); setNames({})
      onOpened()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8">
      <Panel title="Open a decision" subtitle="Write it as one question with one proposed course. The reason line on the item carries the rest.">
        <div className="grid gap-4">
          <Field label="Question" id="dq-question">
            <Input id="dq-question" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} placeholder="Approve the renewal of the supplier agreement for another year?" />
          </Field>
          <Field label="Who owes this decision" id="dq-owner">
            <Select id="dq-owner" value={f.ownerPersonId} onChange={(e) => setF({ ...f, ownerPersonId: e.target.value })}>
              <option value="">Choose a person</option>
              {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="The day it opened" help="Today, or the day it was first asked." id="dq-opened">
            <Input id="dq-opened" type="date" max={todayIso()} value={f.openedOn} onChange={(e) => setF({ ...f, openedOn: e.target.value })} />
          </Field>
          {hasEntities && (
            <Field label="The legal entity it is for" id="dq-entity">
              <Select id="dq-entity" value={f.actingEntityId} onChange={(e) => setF({ ...f, actingEntityId: e.target.value })}>
                <option value="">Choose an entity</option>
                {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="What shows it is owed" id="dq-proof">
            <Textarea id="dq-proof" rows={3} value={f.proof} onChange={(e) => setF({ ...f, proof: e.target.value })} />
          </Field>
          <div>
            <p className="text-[13px] text-etyme-ink mb-2">Records that prove it</p>
            {f.proofLinks.length > 0 && (
              <ul className="mb-2 text-[13px]">
                {f.proofLinks.map((l) => (
                  <li key={`${l.recordType}:${l.recordId}`} className="flex gap-2 items-center">
                    <span>{names[`${l.recordType}:${l.recordId}`] ?? l.recordId}</span>
                    <button type="button" className="text-etyme-muted hover:text-etyme-ink"
                      onClick={() => setF({ ...f, proofLinks: f.proofLinks.filter((x) => x !== l) })}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <Select aria-label="Kind of record" value={linkType} onChange={(e) => { setLinkType(e.target.value); setLinkQuery('') }}>
                <option value="">Kind of record</option>
                {data.proofTypes.map((p) => <option key={p.type} value={p.type}>{p.label}</option>)}
              </Select>
              <Input aria-label="Find the record" placeholder="Type to find it" value={linkQuery} disabled={!linkType} onChange={(e) => setLinkQuery(e.target.value)} />
              <Select aria-label="The record" value="" disabled={!linkType} onChange={(e) => addLink(e.target.value)}>
                <option value="">{linkType ? (choices.length ? 'Choose the record' : 'Nothing matches') : 'Choose a kind first'}</option>
                {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </div>
          {err && <FormMessage tone="error">{err}</FormMessage>}
          {note && <FormMessage tone="ok">{note}</FormMessage>}
          <div>
            <SubmitButton type="button" pending={busy} pendingLabel="Opening…" onClick={open}>Open the decision</SubmitButton>
          </div>
        </div>
      </Panel>
    </div>
  )
}
