'use client'

import { useEffect, useMemo, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, Input, Select, FormMessage, Lbl } from '@/components/ui'
import { amount, rate as rateWords } from '@/lib/money-display'
import { withBooks, type Books } from '@/lib/money/books-view'
import { lineFromWeek, linesAgainstTotal, lineAmount, toMinor, toTyped } from '@/lib/money/receipt-screen'
import { CHECK_NAME, type MatchCode } from '@/lib/three-way-match'
import { formatDay } from '@/lib/format-date'

/**
 * Record an invoice receipt — what a supplier sent, typed in by the firm
 * that pays it.
 *
 * Picked, never typed where it can be picked: the supplier, the buy line,
 * and for each line of the supplier's invoice the week this firm
 * accepted (hours accepted and the agreed rate beside it), the expense
 * approved on the line, or the milestone accepted on its order. The clerk
 * then types what the supplier's invoice states. "Check it" runs the same
 * check that saving runs, and writes nothing; the result is said in the
 * check's own sentences before anybody saves.
 */

type Kind = 'HOURS' | 'EXPENSE' | 'MILESTONE'

interface Line {
  key: number
  kind: Kind
  /** The week, expense or milestone picked. */
  ref: string
  hours: string
  rate: string
  amount: string
}

interface Check { code: string; name?: string; outcome: string; reason: string; overridable?: boolean }

const todayIso = () => new Date().toISOString().slice(0, 10)

export function ReceiptForm({ books, onSaved, onClose }: {
  books: Books
  onSaved: (note: string, id: string) => void
  onClose: () => void
}) {
  const [suppliers, setSuppliers] = useState<any[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [supplierId, setSupplierId] = useState('')
  const [buyId, setBuyId] = useState('')
  const [options, setOptions] = useState<any | null>(null)
  const [number, setNumber] = useState('')
  const [receivedAt, setReceivedAt] = useState(todayIso)
  const [dueAt, setDueAt] = useState('')
  const [withLines, setWithLines] = useState(true)
  const [lines, setLines] = useState<Line[]>([])
  const [total, setTotal] = useState('')
  const [totalTyped, setTotalTyped] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; says: string; checks: Check[]; wouldBe?: string } | null>(null)

  useEffect(() => {
    fetch(withBooks('/api/ap/receipts/options', books))
      .then(async (r) => setSuppliers((await readJson(r)).data.suppliers))
      .catch((e) => setFailed(e.message))
  }, [books])

  const supplier = suppliers?.find((s) => s.id === supplierId) ?? null
  const line = supplier?.lines.find((l: any) => l.buyContractId === buyId) ?? null
  const currency: string = line?.currency ?? 'USD'

  useEffect(() => {
    setOptions(null)
    setLines([])
    setResult(null)
    if (!buyId) return
    fetch(withBooks(`/api/ap/receipts/options?buyContractId=${encodeURIComponent(buyId)}`, books))
      .then(async (r) => setOptions((await readJson(r)).data))
      .catch((e) => setFailed(e.message))
  }, [buyId, books])

  const lineMinors = lines.map((l) => toMinor(l.amount, currency) ?? 0)
  const sum = lineMinors.reduce((n, x) => n + x, 0)
  // The total follows the lines until somebody types one of their own.
  useEffect(() => {
    if (withLines && !totalTyped) setTotal(lines.length ? toTyped(sum, currency) : '')
  }, [sum, lines.length, withLines, totalTyped, currency])

  const totalMinor = toMinor(total, currency)
  const disagree = withLines ? linesAgainstTotal(lineMinors, totalMinor, currency) : null

  const nextKey = useMemo(() => () => Math.max(0, ...lines.map((l) => l.key)) + 1, [lines])
  const add = (kind: Kind) => {
    setResult(null)
    setLines((ls) => [...ls, { key: nextKey(), kind, ref: '', hours: '', rate: '', amount: '' }])
  }
  const change = (key: number, patch: Partial<Line>) => {
    setResult(null)
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l
      const next = { ...l, ...patch }
      // A week's amount follows its hours and rate as they are typed.
      if (next.kind === 'HOURS' && ('hours' in patch || 'rate' in patch)) {
        const h = Number(next.hours)
        const r = toMinor(next.rate, currency)
        if (Number.isFinite(h) && h > 0 && r != null) next.amount = toTyped(lineAmount(h, r), currency)
      }
      return next
    }))
  }
  const pick = (l: Line, ref: string) => {
    if (l.kind === 'HOURS') {
      const w = options?.weeks.find((x: any) => x.timesheetId === ref)
      const filled = w ? lineFromWeek(w) : null
      change(l.key, filled
        ? { ref, hours: String(filled.hours), rate: toTyped(filled.rateMinor, currency), amount: toTyped(filled.amountMinor, currency) }
        : { ref })
    } else {
      const list = l.kind === 'EXPENSE' ? options?.expenses : options?.milestones
      const s = list?.find((x: any) => x.id === ref)
      change(l.key, { ref, amount: s ? toTyped(s.amountMinor, currency) : '' })
    }
  }

  function body(preview: boolean) {
    const out: Record<string, unknown> = {
      vendorCompanyId: supplierId,
      buyContractId: buyId || null,
      number: number.trim(),
      currency,
      total: totalMinor == null ? null : Number(toTyped(totalMinor, currency)),
      receivedAt: receivedAt ? new Date(`${receivedAt}T12:00:00Z`).toISOString() : undefined,
      dueAt: dueAt ? new Date(`${dueAt}T12:00:00Z`).toISOString() : undefined,
      preview,
    }
    if (withLines) {
      out.lines = lines.map((l) =>
        l.kind === 'HOURS'
          ? { timesheetId: l.ref || null, hours: Number(l.hours), rateCents: toMinor(l.rate, currency), amountCents: toMinor(l.amount, currency) }
          : l.kind === 'EXPENSE'
            ? { expenseId: l.ref || null, amountCents: toMinor(l.amount, currency) }
            : { milestoneId: l.ref || null, amountCents: toMinor(l.amount, currency) }
      )
    } else {
      out.periodStart = periodStart ? new Date(`${periodStart}T00:00:00Z`).toISOString() : undefined
      out.periodEnd = periodEnd ? new Date(`${periodEnd}T00:00:00Z`).toISOString() : undefined
    }
    return out
  }

  async function send(preview: boolean) {
    setBusy(true)
    setResult(null)
    try {
      const r = await fetch(withBooks('/api/ap/bills', books), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body(preview)),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) {
        setResult({ ok: false, says: b.error?.message ?? `The check could not be run (${r.status}).`, checks: b.error?.checks ?? [] })
        return
      }
      if (preview) {
        setResult({ ok: b.data.wouldBe !== 'DISPUTED', says: b.data.note, checks: b.data.match.checks, wouldBe: b.data.wouldBe })
      } else {
        onSaved(b.data.note, b.data.bill.id)
      }
    } catch (e: any) {
      setResult({ ok: false, says: e.message, checks: [] })
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <div className="panel"><FormMessage tone="error">{failed}</FormMessage></div>
  if (!suppliers) return <div className="panel"><p className="text-[13px] text-etyme-muted">Reading your suppliers and buy lines…</p></div>

  const ready = supplierId && number.trim() && dueAt && totalMinor != null && totalMinor > 0 && (!withLines || (lines.length > 0 && lines.every((l) => l.ref)))

  return (
    <section className="panel space-y-4" aria-label="Record an invoice receipt">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[18px] text-etyme-ink">Record an invoice receipt</h2>
        <button type="button" className="text-[13px] text-etyme-muted underline" onClick={onClose}>Close</button>
      </div>
      <p className="max-w-[70ch] text-[13px] text-etyme-muted">
        Type in what the supplier&rsquo;s invoice states. Each line is checked against what you accepted: the
        hours on a week, the amount you accepted on an expense, or an accepted milestone.
      </p>

      {suppliers.length === 0 && (
        <p className="text-[13px] text-etyme-ink">
          There is no buy line with a supplier on it here, so there is nothing an invoice receipt could be for.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Supplier">
          <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setBuyId('') }}>
            <option value="">Choose the supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Buy line" help={line?.netDays != null ? `Agreed terms: net ${line.netDays} days.` : undefined}>
          <Select value={buyId} onChange={(e) => setBuyId(e.target.value)} disabled={!supplier}>
            <option value="">Choose the buy line</option>
            {supplier?.lines.map((l: any) => (
              <option key={l.buyContractId} value={l.buyContractId}>
                {l.people.join(', ') || 'Nobody named'}
                {l.rateMinor != null ? ` · ${rateWords(l.rateMinor, l.currency)}` : ''}
                {l.orderNumber ? ` · order ${l.orderNumber}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="The supplier’s invoice number">
          <Input value={number} onChange={(e) => { setNumber(e.target.value); setResult(null) }} placeholder="As printed on their invoice" />
        </Field>
        <Field label="Received">
          <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </Field>
        <Field label="Due" help="The due date on the supplier’s invoice.">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="How the invoice is typed in">
        <button type="button" className={`chip ${withLines ? 'chip--action' : 'chip--passive'}`} onClick={() => { setWithLines(true); setResult(null) }}>
          With its lines
        </button>
        <button type="button" className={`chip ${!withLines ? 'chip--action' : 'chip--passive'}`} onClick={() => { setWithLines(false); setResult(null) }}>
          A total only
        </button>
      </div>

      {withLines && buyId && !options && <p className="text-[13px] text-etyme-muted">Reading what you accepted on this buy line…</p>}

      {withLines && options && (
        <div className="space-y-3">
          {options.waitingSays && (
            <p className="text-[13px] text-etyme-attention">{options.waitingSays}</p>
          )}
          {lines.map((l, i) => (
            <LineRow key={l.key} n={i + 1} line={l} options={options} currency={currency}
              onPick={(ref) => pick(l, ref)} onChange={(p) => change(l.key, p)}
              onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="text-[13px] text-etyme-action underline" onClick={() => add('HOURS')}
              disabled={options.weeks.length === 0}>Add a week</button>
            <button type="button" className="text-[13px] text-etyme-action underline" onClick={() => add('EXPENSE')}
              disabled={options.expenses.length === 0}>Add an expense</button>
            <button type="button" className="text-[13px] text-etyme-action underline" onClick={() => add('MILESTONE')}
              disabled={options.milestones.length === 0}>Add a milestone</button>
          </div>
          {options.weeks.length === 0 && (
            <p className="text-[11px] text-etyme-faint">No week on this buy line has been accepted in the last six months.</p>
          )}
        </div>
      )}

      {!withLines && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Period from">
            <Input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setResult(null) }} />
          </Field>
          <Field label="Period to">
            <Input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setResult(null) }} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`Total (${currency})`} help={withLines ? 'Follows the lines until you type the invoice’s own total.' : 'Checked against the hours you accepted in the period, at the agreed rate, exactly.'}>
          <Input inputMode="decimal" value={total} onChange={(e) => { setTotal(e.target.value); setTotalTyped(true); setResult(null) }} />
        </Field>
      </div>
      {disagree && <p className="text-[13px] text-etyme-attention">{disagree}</p>}

      {result && (
        <div className="space-y-2 border-t border-etyme-rule pt-3">
          <Lbl>{result.wouldBe ? (result.ok ? 'The check passes' : 'The check holds it') : 'The check refuses it'}</Lbl>
          <p className={`text-[13px] ${result.ok ? 'text-etyme-ink' : 'text-etyme-attention'}`}>{result.says}</p>
          {result.checks.length > 0 && (
            <ul className="space-y-1">
              {result.checks.map((c) => (
                <li key={c.code} className="text-[12px]">
                  <span className={`chip ${c.outcome === 'FAIL' ? 'chip--attention' : c.outcome === 'OVERRIDDEN' ? 'chip--action' : 'chip--verified'}`}>
                    {c.outcome === 'FAIL' ? 'fails' : c.outcome === 'OVERRIDDEN' ? 'waived' : 'passes'}
                  </span>{' '}
                  <span className="text-etyme-ink">{c.name ?? CHECK_NAME[c.code as MatchCode] ?? c.code}</span>
                  <span className="text-etyme-muted"> — {c.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-etyme-rule pt-3">
        <button type="button" className="btn-secondary" disabled={!ready || busy} onClick={() => send(true)}>
          {busy ? 'Checking…' : 'Check it'}
        </button>
        <button type="button" className="btn-primary" disabled={!ready || busy || !result || (!result.wouldBe)} onClick={() => send(false)}>
          {result?.wouldBe === 'DISPUTED' ? 'Record it as held' : 'Record it'}
        </button>
        <span className="text-[11px] text-etyme-faint">Check it first; saving runs the same check again.</span>
      </div>
    </section>
  )
}

function LineRow({ n, line, options, currency, onPick, onChange, onRemove }: {
  n: number
  line: Line
  options: any
  currency: string
  onPick: (ref: string) => void
  onChange: (p: Partial<Line>) => void
  onRemove: () => void
}) {
  const label = line.kind === 'HOURS' ? 'Week' : line.kind === 'EXPENSE' ? 'Accepted expense' : 'Accepted milestone'
  const week = line.kind === 'HOURS' ? options.weeks.find((w: any) => w.timesheetId === line.ref) : null
  return (
    <div className="rounded border border-etyme-rule p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="stat-label">Line {n}</span>
        <button type="button" className="text-[12px] text-etyme-muted underline" onClick={onRemove}>Remove</button>
      </div>
      <Field label={label}>
        <Select value={line.ref} onChange={(e) => onPick(e.target.value)}>
          <option value="">Choose</option>
          {line.kind === 'HOURS' && options.weeks.map((w: any) => (
            <option key={w.timesheetId} value={w.timesheetId} disabled={!!w.heldBy || w.rateMinor == null}>
              {w.personName} · week of {formatDay(new Date(`${w.weekOf}T00:00:00Z`))} · {w.hoursAccepted} h accepted
              {w.rateMinor != null ? ` at ${rateWords(w.rateMinor, currency)}` : ''}
              {w.heldBy ? ` · already on ${w.heldBy}` : ''}
            </option>
          ))}
          {line.kind === 'EXPENSE' && options.expenses.map((x: any) => (
            <option key={x.id} value={x.id} disabled={!!x.heldBy}>
              {x.says} · {amount(x.amountMinor, currency)} approved{x.heldBy ? ` · already on ${x.heldBy}` : ''}
            </option>
          ))}
          {line.kind === 'MILESTONE' && options.milestones.map((x: any) => (
            <option key={x.id} value={x.id} disabled={!!x.heldBy}>
              {x.says} · {amount(x.amountMinor, currency)} agreed{x.heldBy ? ` · already on ${x.heldBy}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {week && (
        <p className="text-[12px] text-etyme-muted">
          You accepted {week.hoursAccepted} hours on this week
          {week.rateMinor != null ? <>, and the agreed rate on those days is {rateWords(week.rateMinor, currency)}</> : null}.
          {week.says ? <> {week.says}</> : null}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {line.kind === 'HOURS' && (
          <>
            <Field label="Hours on the invoice">
              <Input inputMode="decimal" value={line.hours} onChange={(e) => onChange({ hours: e.target.value })} />
            </Field>
            <Field label={`Rate on the invoice (${currency} an hour)`}>
              <Input inputMode="decimal" value={line.rate} onChange={(e) => onChange({ rate: e.target.value })} />
            </Field>
          </>
        )}
        <Field label={`Amount on the invoice (${currency})`}>
          <Input inputMode="decimal" value={line.amount} onChange={(e) => onChange({ amount: e.target.value })} />
        </Field>
      </div>
    </div>
  )
}
