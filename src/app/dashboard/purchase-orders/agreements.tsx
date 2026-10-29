'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { firmsToPick, LINK_FIRST_SAYS, LINK_FIRST_HREF } from '@/lib/money/firm-picker'
import type { OrderTerms } from '@/lib/money/order-terms'
import { signOfferFor } from '@/lib/money/agreement-record'
import { Chip, Field, FormMessage, Input, Lbl, Panel, Select, SubmitButton, ErrorState } from '@/components/ui'

/**
 * A firm's agreements, on its Companies page, and the door to record one.
 *
 * Release walk, 2026-10-27: a sub-vendor could not record its agreement
 * with a prime on any screen. The agreements page is a client's tab, so a
 * supplier reached it only by typing its address, and it had no add
 * button. This lists every agreement the firm is a party to, either end
 * (the same read the client's page uses, GET /api/program/agreements),
 * and records a signed one through POST /api/contracts/agreements. The
 * other firm reads the same row on its own page.
 *
 * The firm on the other side is picked from this firm's Companies list,
 * read through the same route that page reads (lib/money/firm-picker), so
 * a firm linked from Companies is offered here. Where there is nobody, the
 * form says to link with the firm first, with the link.
 */

interface AgreementRow {
  id: string
  role: 'VENDOR' | 'CLIENT'
  counterparty: { id: string; name: string }
  terms: { paymentTermsDays: number; paymentTermsSays?: string; currency: string; signedAt: string | null }
  status?: string
  statusSays?: string
  signatures?: Array<{ party: string }>
  /** Where the list route actually puts them (GET /api/program/agreements). */
  signing?: { signatures?: Array<{ party: string }> }
}

/** Each side's signature on file, read where the list route puts them. */
function signedParties(a: AgreementRow): string[] {
  return (a.signing?.signatures ?? a.signatures ?? []).map((s) => s.party)
}

const FROM_WORDS: Record<string, string> = {
  PERIOD_END: 'the end of the work period',
  INVOICE_DATE: 'the invoice date',
  RECEIPT_DATE: 'the day the invoice is received',
  APPROVAL_DATE: 'the day the invoice is approved',
}

export function Agreements({ mayRecord, selfCompanyId }: { mayRecord: boolean; selfCompanyId: string }) {
  const [rows, setRows] = useState<AgreementRow[] | null>(null)
  const [readSaid, setReadSaid] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/program/agreements')
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        setReadSaid(body?.error?.message ?? 'Agreements could not be read.')
        setRows([])
        return
      }
      setReadSaid(null)
      setRows(body.data?.agreements ?? [])
    } catch {
      setReadSaid('Agreements could not be read.')
      setRows([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-[20px] text-etyme-ink">Agreements</h2>
        {mayRecord && (
          <button type="button" onClick={() => setAdding(!adding)} className="btn-secondary text-[13px]">
            {adding ? 'Cancel' : 'Record an agreement'}
          </button>
        )}
      </div>
      {flash && <div className="mb-4"><FormMessage tone="ok">{flash}</FormMessage></div>}
      {adding && (
        <RecordAgreement
          selfCompanyId={selfCompanyId}
          onRecorded={(says) => { setFlash(says); setAdding(false); load() }}
        />
      )}
      {readSaid && <p className="text-[13px] text-etyme-muted">{readSaid}</p>}
      {rows && rows.length === 0 && !readSaid && (
        <p className="text-[13px] text-etyme-muted">
          No agreements on file. Every bill and payment between two firms follows the agreement they signed, so record it once.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="panel">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-etyme-ink">
                  {a.counterparty.name}
                  <span className="ml-2 text-[12px] text-etyme-muted">
                    {a.role === 'VENDOR' ? 'you sell to them' : 'you buy from them'}
                    {' · '}net {a.terms.paymentTermsDays} · {a.terms.currency}
                  </span>
                </span>
                <Chip tone={a.terms.signedAt ? 'verified' : 'attention'}>
                  {a.terms.signedAt
                    ? 'Signed by both'
                    : signedParties(a).length === 1
                      ? 'One side signed'
                      : 'Not signed yet'}
                </Chip>
              </div>
              {!a.terms.signedAt && (
                <SignRow
                  row={a}
                  holdsTheDesk={mayRecord}
                  onSigned={(says) => { setFlash(says); load() }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecordAgreement({ onRecorded, selfCompanyId }: { onRecorded: (says: string) => void; selfCompanyId: string }) {
  const [firms, setFirms] = useState<{ id: string; name: string; kind: string }[] | null>(null)
  const [otherId, setOtherId] = useState('')
  const [direction, setDirection] = useState<'' | 'sell' | 'buy'>('')
  const [paymentTerms, setPaymentTerms] = useState('30')
  const [from, setFrom] = useState('')
  const [billFrequency, setBillFrequency] = useState<OrderTerms['frequency'] | ''>('')
  const [currency, setCurrency] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // The firms on this firm's Companies list, read the way that page
    // reads them, so a firm linked there is offered here (lib/money/firm-picker).
    fetch('/api/companies')
      .then((r) => r.json())
      .then((b) => setFirms(firmsToPick((b.data?.companies ?? []).map((c: any) => ({ id: c.id, name: c.name, kind: String(c.kind ?? '') })), selfCompanyId)))
      .catch(() => setFirms([]))
  }, [selfCompanyId])

  const other = firms?.find((f) => f.id === otherId) ?? null

  function pick(id: string) {
    setOtherId(id)
    const f = firms?.find((x) => x.id === id)
    // A client only buys, so an agreement with one is one this firm sells
    // under; anybody else, the person says which way it runs.
    if (f?.kind === 'CLIENT') setDirection('sell')
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/contracts/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otherCompanyId: otherId,
          callerSells: direction === 'sell',
          paymentTerms,
          paymentTermsFrom: from || undefined,
          billFrequency: billFrequency || undefined,
          currency: currency || undefined,
          effectiveDate: effectiveDate || undefined,
          expiresAt: expiresAt || undefined,
          executedFileUrl: fileUrl || undefined,
        }),
      })
      const body = await readJson(res)
      onRecorded(body.data.message)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={other ? `Your agreement with ${other.name}` : 'Record an agreement'} className="mb-4">
      {error && <div className="mb-3"><ErrorState says={error} /></div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="With">
          {firms && firms.length === 0 ? (
            <p className="text-[13px] text-etyme-muted py-2">
              Nobody to record an agreement with yet. <Link href={LINK_FIRST_HREF} className="text-etyme-action underline">{LINK_FIRST_SAYS}</Link>
            </p>
          ) : (
            <Select value={otherId} onChange={(e) => pick(e.target.value)}>
              <option value="">{firms ? 'Choose…' : 'Reading your companies…'}</option>
              {(firms ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Which way">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as any)}>
            <option value="">Choose…</option>
            <option value="sell">You sell to them</option>
            <option value="buy">You buy from them</option>
          </Select>
        </Field>
        <Field label="Net days">
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} type="number" min="0" max="180" />
        </Field>
        <Field label="Counted from">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">The end of the work period</option>
            {Object.entries(FROM_WORDS).filter(([k]) => k !== 'PERIOD_END').map(([k, v]) => (
              <option key={k} value={k}>{v[0].toUpperCase() + v.slice(1)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Billed">
          <Select value={billFrequency} onChange={(e) => setBillFrequency(e.target.value as OrderTerms['frequency'] | '')}>
            <option value="">The agreement does not say</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Every other week</option>
            <option value="SEMIMONTHLY">Twice a month</option>
            <option value="MONTHLY">Monthly</option>
          </Select>
        </Field>
        <Field label="Currency (blank: yours)">
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />
        </Field>
        <Field label="Starts (optional)">
          <Input value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} type="date" />
        </Field>
        <Field label="Runs out (optional)">
          <Input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="date" />
        </Field>
        <Field label="Link to the signed copy (optional)">
          <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…/msa-signed.pdf" />
        </Field>
      </div>
      <Lbl className="mt-3 block">Signatures</Lbl>
      <p className="text-[12px] text-etyme-muted">
        Each side&rsquo;s signature, the countersignature with it, is recorded on the agreement afterwards, by name and title.
      </p>
      <SubmitButton
        type="button"
        onClick={save}
        pending={busy}
        pendingLabel="Recording…"
        disabled={!otherId || !direction || paymentTerms === ''}
        className="mt-3"
      >
        Record it
      </SubmitButton>
    </Panel>
  )
}

const SIDE_WORDS: Record<'VENDOR' | 'CLIENT', string> = {
  VENDOR: 'The supplier’s side',
  CLIENT: 'The client’s side',
}

/**
 * Record a signature, and with the second one the countersignature, on
 * the agreement's own row, for the seat the signature route lets record
 * it (`signOfferFor` in lib/money/agreement-record). Name, title, the
 * date on the paper and how it was signed, as `AgreementSignature`
 * records each side.
 */
function SignRow({ row, holdsTheDesk, onSigned }: { row: AgreementRow; holdsTheDesk: boolean; onSigned: (says: string) => void }) {
  const offer = signOfferFor({
    role: row.role,
    counterpartyName: row.counterparty.name,
    signedParties: signedParties(row),
    holdsTheDesk,
    ended: row.status === 'TERMINATED',
  })
  const [open, setOpen] = useState(false)
  const [party, setParty] = useState<'' | 'VENDOR' | 'CLIENT'>('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signedAt, setSignedAt] = useState('')
  const [method, setMethod] = useState('WET_INK')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!offer.offer) {
    return offer.says ? <p className="text-[12px] text-etyme-muted mt-1.5">{offer.says}</p> : null
  }
  const side = party || offer.sides[0]

  async function sign() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/program/agreements/${row.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party: side, signerName, signerTitle, signedAt, method }),
      })
      const body = await readJson(res)
      setOpen(false)
      onSigned(body.data.says)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2">
      <p className="text-[12px] text-etyme-muted">{offer.says}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-[13px] mt-1.5">
          Record a signature
        </button>
      ) : (
        <div className="mt-2">
          {error && <div className="mb-2"><ErrorState says={error} /></div>}
          <div className="grid sm:grid-cols-2 gap-3">
            {offer.sides.length > 1 && (
              <Field label="Which side signed">
                <Select value={side} onChange={(e) => setParty(e.target.value as 'VENDOR' | 'CLIENT')}>
                  {offer.sides.map((p) => <option key={p} value={p}>{SIDE_WORDS[p]}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Who signed">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </Field>
            <Field label="Their title">
              <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
            </Field>
            <Field label="Date on the paper">
              <Input value={signedAt} onChange={(e) => setSignedAt(e.target.value)} type="date" />
            </Field>
            <Field label="How it was signed">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="WET_INK">On paper</option>
                <option value="ELECTRONIC">Electronically</option>
                <option value="COUNTERPART">In counterparts</option>
              </Select>
            </Field>
          </div>
          <SubmitButton
            type="button"
            onClick={sign}
            pending={busy}
            pendingLabel="Recording…"
            disabled={!signerName.trim() || !signerTitle.trim() || !signedAt}
            className="mt-3"
          >
            Record the signature
          </SubmitButton>
        </div>
      )}
    </div>
  )
}
