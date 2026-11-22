'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { dayOfMomentFor, readerZone } from '@/lib/when'
import { refusalSentence } from '@/lib/refusal-words'
import { SAY_CUSTOMER, SAY_CLIENT, GROUP_WORDS, classifyBody, classifyFields, type Group } from '@/lib/counterparty'
import { Field, FormMessage, LoadingState, PageHead, RefusedState, Select } from '@/components/ui'

/**
 * Classify companies (record 110, A1). One page for the companies that
 * were loaded as clients: each row shows what this firm's own contracts
 * say about it, and two checkboxes, "Customer: pays us" and "Client:
 * where our people work". Each row is saved by itself. Nothing is ticked
 * for the reader and there is no button that applies every suggestion: a
 * person looks at each company and says what it is.
 *
 * A working surface: a dense list, one act per row.
 */

interface Row {
  id: string
  name: string
  groups: Group[]
  said: Group[]
  onContracts: Group[]
  needsClassifying: boolean
  suggestion: string
  classifiedAt: string | null
  classifiedByName: string | null
}

interface Read {
  sells: boolean
  says: string
  mayClassify: boolean
  entities: { id: string; name: string }[]
  companies: Row[]
}

type Saved = { tone: 'ok' | 'error'; says: string }

function ClassifyRow({ row, entity, hasEntities, onSaved }: { row: Row; entity: string; hasEntities: boolean; onSaved: () => void }) {
  // Nothing is ticked for a company nobody has classified: the contracts
  // suggest, and the person says. A classified company starts on what was said.
  const [customer, setCustomer] = useState(row.said.includes('CUSTOMER'))
  const [client, setClient] = useState(row.said.includes('CLIENT'))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)
  const needsEntity = classifyFields(hasEntities).includes('actingEntityId') && !entity
  const nothing = !customer && !client

  async function save() {
    setBusy(true)
    setSaved(null)
    try {
      const res = await fetch(`/api/companies/${row.id}/classify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classifyBody({ customer, client, actingEntityId: entity })),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaved({ tone: 'error', says: refusalSentence(body?.error?.message) || `${row.name} was not saved. Try again in a minute.` })
        return
      }
      setSaved({ tone: 'ok', says: body?.data?.message ?? 'Saved.' })
      onSaved()
    } catch {
      setSaved({ tone: 'error', says: `${row.name} was not saved. Check your connection and try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-b border-etyme-rule py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[15px] font-semibold text-etyme-ink break-words">{row.name}</p>
          <p className="text-[12px] leading-snug text-etyme-muted">Your contracts: {row.suggestion}</p>
          {row.classifiedAt && (
            <p className="text-[12px] leading-snug text-etyme-faint">
              {row.classifiedByName ?? 'Somebody at your firm'} said {row.said.filter((g) => g !== 'SUPPLIER').map((g) => GROUP_WORDS[g].toLowerCase()).join(' and ')}, {dayOfMomentFor(new Date(row.classifiedAt), readerZone())}.
            </p>
          )}
        </div>
        {/* At phone width the two boxes and Save stack under the name, one per line; side by side from a small tablet up. */}
        <div className="flex w-full flex-col items-start gap-y-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
          <label className="inline-flex items-center gap-2 text-[13px] text-etyme-ink">
            <input type="checkbox" checked={customer} onChange={(e) => setCustomer(e.target.checked)} />
            {SAY_CUSTOMER}
          </label>
          <label className="inline-flex items-center gap-2 text-[13px] text-etyme-ink">
            <input type="checkbox" checked={client} onChange={(e) => setClient(e.target.checked)} />
            {SAY_CLIENT}
          </label>
          <button type="button" className="btn-secondary text-[13px]" disabled={busy || nothing || needsEntity} onClick={save}>
            {busy ? 'Saving…' : row.classifiedAt ? 'Save change' : 'Save'}
          </button>
        </div>
      </div>
      {/* Never a greyed button without words. */}
      {nothing && <p className="mt-1 sm:text-right text-[12px] text-etyme-faint">Tick one or both to save.</p>}
      {!nothing && needsEntity && <p className="mt-1 sm:text-right text-[12px] text-etyme-faint">Choose the legal entity at the top of the page to save.</p>}
      {saved && <div className="mt-1 sm:text-right"><FormMessage tone={saved.tone}>{saved.says}</FormMessage></div>}
    </li>
  )
}

export default function ClassifyCompaniesPage() {
  const section = usePageSection('/dashboard/companies')
  const [read, setRead] = useState<Read | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [entity, setEntity] = useState('')
  // The rows as first read, so a row just saved stays where the person
  // saved it, with its sentence, until the page is opened again.
  const [rows, setRows] = useState<Row[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/companies/groups')
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRefused(refusalSentence(body?.error?.message) || 'Companies is not part of your seat. Ask your company’s owner if you need it.')
        return
      }
      setRead(body.data)
      setRows((before) => before ?? body.data.companies)
    } catch {
      setRefused('The list could not be read. Check your connection and open the page again.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (refused) return <RefusedState says={refused} />
  if (!read || !rows) return <LoadingState says="Opening your companies…" />

  const back = <Link href={'/dashboard/companies' as Route} className="btn-secondary">Back to Companies</Link>
  if (!read.sells) {
    return (
      <>
        <PageHead eyebrow={section} title="Classify companies" actions={back} />
        <RefusedState says="Your company buys from its suppliers and bills nobody, so it has no customers or end clients to name. Its suppliers are under Suppliers, and its own sites are under Settings, Sites." />
      </>
    )
  }
  if (!read.mayClassify) {
    return (
      <>
        <PageHead eyebrow={section} title="Classify companies" actions={back} />
        <RefusedState says="Classifying a company is for the Owner, an Admin or whoever manages who you trade with. Ask them to do it, or ask them for that access." />
      </>
    )
  }

  const hasEntities = read.entities.length > 0
  const waiting = rows.filter((r) => r.needsClassifying)
  const done = rows.filter((r) => !r.needsClassifying && r.classifiedAt)
  const stillWaiting = read.companies.filter((r) => r.needsClassifying).length

  return (
    <>
      <PageHead
        eyebrow={section}
        title="Classify companies"
        subtitle="Say what each company is to you. A customer pays you: your bill goes to it. A client is the end client, where your people work. A company can be both."
        actions={back}
      />
      <p className="mb-4 text-[12px] text-etyme-muted">{read.says}</p>

      {hasEntities && (
        <div className="mb-6 max-w-sm">
          <Field label="Done for" help="The legal entity these answers are recorded for.">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Choose a legal entity…</option>
              {read.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-1 font-serif text-[20px] text-etyme-ink">
          Needs classifying <span className="tabular-nums text-etyme-muted">({stillWaiting})</span>
        </h2>
        <p className="mb-2 max-w-2xl text-[13px] leading-relaxed text-etyme-muted">
          These companies were loaded as clients. None is counted as a customer or a client until you say so here. Each row is saved by itself, and each save is on the record with your name and the day.
        </p>
        {waiting.length === 0 ? (
          <p className="py-4 text-[14px] text-etyme-muted">No company is waiting to be classified.</p>
        ) : (
          <ul className="border-t border-etyme-rule">
            {waiting.map((r) => <ClassifyRow key={r.id} row={r} entity={entity} hasEntities={hasEntities} onSaved={load} />)}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-1 font-serif text-[20px] text-etyme-ink">
            Already classified <span className="tabular-nums text-etyme-muted">({done.length})</span>
          </h2>
          <p className="mb-2 text-[13px] text-etyme-muted">Change an answer and save the row. What kind of company it is never changes here.</p>
          <ul className="border-t border-etyme-rule">
            {done.map((r) => <ClassifyRow key={r.id} row={r} entity={entity} hasEntities={hasEntities} onSaved={load} />)}
          </ul>
        </section>
      )}
    </>
  )
}
