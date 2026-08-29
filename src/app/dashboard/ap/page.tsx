'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, type Column } from '@/components/data-table'
import { compact, amount } from '@/lib/money-display'

/**
 * Who is financing whom.
 *
 * ── Why this screen is not "accounts payable" ────────────────────────
 *
 * An AP screen is a list of bills to pay, and every accounting package
 * already has one. This is the other question, and nothing has it: a
 * client pays us at day 75 against sixty-day terms, we pay our sub at
 * day 30 from receipt of the bill, and the difference is forty-five days
 * of our own cash funding somebody else's work. Nobody invoices us for
 * that and no report shows it, because every party in a chain can see
 * its own hop and nothing else.
 *
 * So the screen leads with the comparison rather than the list. Days to
 * be paid beside days to pay, and then the chains underneath.
 *
 * ── A decision surface at the top, a working surface below ───────────
 *
 * The float figures are a decision surface: three numbers, prose, and a
 * sentence saying which way the money runs. Somebody reads it, decides
 * whether to renegotiate terms, and leaves.
 *
 * The hops are a working surface: dense, sortable, searchable, one row
 * per obligation. Somebody finds the supplier they were arguing about
 * and gets off the screen.
 */

type Tab = 'chains' | 'hops' | 'clause' | 'exceptions' | 'runs'

const TABS: { key: Tab; label: string }[] = [
  { key: 'chains', label: 'Who is financing whom' },
  { key: 'hops', label: 'Every hop' },
  { key: 'clause', label: 'Pay when paid' },
  { key: 'exceptions', label: 'Bills that did not match' },
  { key: 'runs', label: 'Payment runs' },
]

const STATE_CHIP: Record<string, { chip: string; word: string }> = {
  SETTLED: { chip: 'chip--verified', word: 'settled' },
  OUTSTANDING: { chip: 'chip--passive', word: 'open' },
  UNKNOWABLE: { chip: 'chip--attention', word: 'no dates' },
}

export default function ApPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('chains')

  useEffect(() => {
    fetch('/api/ap')
      .then(async (r) => {
        const b = await r.json()
        if (r.status === 403) {
          setDenied(b.error?.message ?? 'You cannot see this.')
          return
        }
        if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
        setData(b.data)
        setCurrency(b.data.currencies?.[0]?.currency ?? null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const book = useMemo(
    () => data?.currencies?.find((c: any) => c.currency === currency) ?? null,
    [data, currency]
  )

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Operate</p>
        <h1 className="headline-serif text-[30px] leading-tight">Who is financing whom</h1>
        <p className="mt-2 max-w-[64ch] text-[13px] text-etyme-muted">
          Being late is actual against agreed. Float is your cash out against your cash
          in — and a firm can be perfectly on time on every hop and still fund four
          months of somebody else&rsquo;s work. Only the second one explains a
          working-capital problem, and only laying the hops end to end produces it.
        </p>
      </header>

      {denied && (
        <div className="panel">
          <p className="text-[13px] text-etyme-ink">{denied}</p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            Ask whoever manages roles here for <code>margin.read</code> if you need it.
          </p>
        </div>
      )}

      {loading && !denied && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">Laying the hops end to end…</p>
        </div>
      )}

      {error && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{error}</p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            Nothing is shown rather than something approximate. A wrong float figure is
            worse than none, because nobody audits a number that looks reasonable.
          </p>
        </div>
      )}

      {!loading && !error && !denied && data?.source === 'NONE' && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">{data.note}</p>
        </div>
      )}

      {!loading && data?.gaps?.length > 0 && data.source !== 'NONE' && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="stat-label">What this screen cannot see</p>
          <ul className="mt-2 space-y-1">
            {data.gaps.map((g: string, i: number) => (
              <li key={i} className="text-[13px] text-etyme-muted">— {g}</li>
            ))}
          </ul>
        </div>
      )}

      {data?.currencies?.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="stat-label">Books</span>
          {data.currencies.map((c: any) => (
            <button
              key={c.currency}
              onClick={() => setCurrency(c.currency)}
              className={`chip ${c.currency === currency ? 'chip--action' : 'chip--passive'}`}
            >
              {c.currency} · {compact(c.payableMinor, c.currency)}
            </button>
          ))}
          <span className="text-[11px] text-etyme-faint">
            Never added together — one book per currency.
          </span>
        </div>
      )}

      {book && (
        <>
          <Mirror book={book} />

          <nav className="flex flex-wrap gap-1 border-b border-etyme-rule">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors"
                style={{
                  borderColor: tab === t.key ? 'var(--color-action)' : 'transparent',
                  color: tab === t.key ? 'var(--color-action)' : 'var(--color-muted)',
                }}
              >
                {t.label}
                <span className="ml-1.5 text-[11px] tabular-nums text-etyme-faint">
                  {t.key === 'chains'
                    ? (data.chains?.length ?? 0)
                    : t.key === 'clause'
                      ? (data.payWhenPaid?.length ?? 0)
                      : t.key === 'exceptions' || t.key === 'runs'
                        ? ''
                        : (data.hops?.filter((h: any) => h.currency === book.currency).length ?? 0)}
                </span>
              </button>
            ))}
          </nav>

          {tab === 'chains' && <Chains data={data} book={book} />}
          {tab === 'hops' && <Hops data={data} book={book} />}
          {tab === 'clause' && <Clause data={data} book={book} />}
          {tab === 'exceptions' && <Exceptions />}
          {tab === 'runs' && <PaymentRuns currency={book.currency} />}
        </>
      )}
    </div>
  )
}

// ── The comparison that makes the numbers mean something ─────────────

function Mirror({ book }: { book: any }) {
  const ccy = book.currency
  const m = book.mirror

  return (
    <section className="space-y-4 border-b border-etyme-rule pb-5">
      <div className="flex flex-wrap items-baseline gap-8">
        <div>
          <p className="stat-label">Days to get paid</p>
          <p className="stat-value tabular-nums">{book.dso?.days ?? '—'}</p>
          <p className="mt-0.5 max-w-[30ch] text-[11px] text-etyme-faint">
            {book.dso?.says ?? 'Nothing on the receivable side to count back through.'}
          </p>
        </div>
        <div>
          <p className="stat-label">Days to pay</p>
          <p className="stat-value tabular-nums">{book.dpo.days ?? '—'}</p>
          <p className="mt-0.5 max-w-[30ch] text-[11px] text-etyme-faint">{book.dpo.says}</p>
        </div>
        <div>
          <p className="stat-label">We owe</p>
          <p className="stat-value tabular-nums">{compact(book.payableMinor, ccy)}</p>
          <p className="mt-0.5 text-[11px] text-etyme-faint">
            {book.billCount} bill{book.billCount === 1 ? '' : 's'} · {compact(book.overdueMinor, ccy)} past due
          </p>
        </div>
        <div>
          <p className="stat-label">Owed to us</p>
          <p className="stat-value tabular-nums">
            {book.receivableMinor == null ? '—' : compact(book.receivableMinor, ccy)}
          </p>
        </div>
      </div>

      <p
        className="max-w-[72ch] text-[13px]"
        style={{
          color:
            m.direction === 'FINANCING' ? 'var(--color-attention)' : 'var(--color-ink)',
        }}
      >
        {m.says}
      </p>

      <p className="max-w-[72ch] text-[11px] text-etyme-faint">
        Both figures are counted back through real months rather than divided by an
        average, so growth does not move them. The textbook ratio reads{' '}
        {book.dpo.naiveDays ?? '—'} days on the paying side, which is what a spreadsheet
        would have said.
      </p>
    </section>
  )
}

// ── Chains ───────────────────────────────────────────────────────────

function Chains({ data }: { data: any; book: any }) {
  const chains = data.chains ?? []

  if (chains.length === 0) {
    return (
      <div className="panel">
        <p className="text-[13px] text-etyme-muted">
          No supplier bill here can be tied to the client invoice that funds it, so there
          is no chain to lay out. A bill needs a buy contract, and that buy contract needs
          a linked sell contract — without both, a cost has no revenue beside it and a
          float figure would be invented rather than measured.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="max-w-[72ch] text-[13px] text-etyme-muted">
        One chain per supplier bill we can trace back to the client invoice funding it.
        The gap between paying out and being paid in is the number nobody has, because
        each party can only see its own hop.
      </p>

      {chains.map((c: any) => (
        <article key={c.billId} className="panel space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-etyme-ink">
              {c.clientName} → {data.us} → {c.vendorName}
            </p>
            <div className="flex items-center gap-2">
              <span className="chip chip--passive tabular-nums">{c.invoiceNumber}</span>
              <span className="chip chip--passive tabular-nums">{c.billNumber}</span>
            </div>
          </div>

          <p className="text-[13px] text-etyme-ink">{c.float.says}</p>

          {c.float.parties?.length > 0 && (
            <ol className="space-y-1.5 border-t border-etyme-rule pt-3">
              {c.float.parties.map((p: any) => (
                <li key={p.partyName} className="flex flex-wrap items-baseline gap-3 text-[13px]">
                  <span className="min-w-[10rem] font-medium text-etyme-ink">{p.partyName}</span>
                  <span
                    className="tabular-nums"
                    style={{
                      color:
                        p.direction === 'FINANCING'
                          ? 'var(--color-attention)'
                          : 'var(--color-muted)',
                    }}
                  >
                    {p.daysFinanced == null
                      ? '—'
                      : p.daysFinanced > 0
                        ? `funds ${p.daysFinanced}d`
                        : p.daysFinanced < 0
                          ? `held ${-p.daysFinanced}d`
                          : 'flat'}
                  </span>
                  <span className="text-etyme-muted">{p.says}</span>
                </li>
              ))}
            </ol>
          )}

          {c.float.gaps?.length > 0 && (
            <ul className="space-y-1 border-t border-etyme-rule pt-3">
              {c.float.gaps.map((g: string, i: number) => (
                <li key={i} className="text-[11px] text-etyme-muted">— {g}</li>
              ))}
            </ul>
          )}

          <div className="border-t border-etyme-rule pt-3 space-y-1">
            {c.pairingInferred && (
              <p className="text-[11px] text-etyme-attention">{c.pairingSays}</p>
            )}
            <p className="text-[11px] text-etyme-faint">{c.beyond.says}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

// ── Every hop ────────────────────────────────────────────────────────

function Hops({ data, book }: { data: any; book: any }) {
  const rows = (data.hops ?? []).filter((h: any) => h.currency === book.currency)

  const columns: Column<any>[] = [
    {
      key: 'side',
      label: 'Way',
      render: (r) => (
        <span className={`chip ${r.side === 'IN' ? 'chip--verified' : 'chip--passive'}`}>
          {r.side === 'IN' ? 'in' : 'out'}
        </span>
      ),
      sortValue: (r) => r.side,
    },
    {
      key: 'who',
      label: 'From → to',
      render: (r) => (
        <span className="text-etyme-ink">
          {r.payerName} → {r.payeeName}
        </span>
      ),
      sortValue: (r) => r.payerName,
    },
    {
      key: 'amountMinor',
      label: 'Amount',
      align: 'right',
      sortValue: (r) => r.amountMinor,
      render: (r) => <span className="tabular-nums">{compact(r.amountMinor, r.currency)}</span>,
    },
    {
      key: 'agreedDays',
      label: 'Agreed',
      align: 'right',
      hideOnMobile: true,
      sortValue: (r) => r.agreedDays ?? -1,
      render: (r) => (
        <span className="tabular-nums text-etyme-muted">
          {r.agreedDays == null ? '—' : `${r.agreedDays}d`}
        </span>
      ),
    },
    {
      key: 'actualDays',
      label: 'Actual',
      align: 'right',
      sortValue: (r) => r.actualDays ?? r.elapsedDays ?? -1,
      render: (r) => (
        <span className="tabular-nums">
          {r.actualDays != null
            ? `${r.actualDays}d`
            : r.elapsedDays != null
              ? `${r.elapsedDays}d so far`
              : '—'}
        </span>
      ),
    },
    {
      key: 'lateDays',
      label: 'Late',
      align: 'right',
      sortValue: (r) => r.lateDays ?? r.overdueDays ?? 0,
      render: (r) => {
        const late = r.lateDays ?? r.overdueDays ?? null
        return (
          <span
            className="tabular-nums"
            style={{ color: late != null && late > 0 ? 'var(--color-attention)' : undefined }}
          >
            {late == null ? '—' : late > 0 ? `${late}d` : late < 0 ? `${-late}d early` : 'on time'}
          </span>
        )
      },
    },
    {
      key: 'state',
      label: 'State',
      hideOnMobile: true,
      sortValue: (r) => r.state,
      render: (r) => {
        const c = STATE_CHIP[r.state] ?? STATE_CHIP.UNKNOWABLE
        return <span className={`chip ${c.chip}`}>{c.word}</span>
      },
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-8">
        <p className="max-w-[36ch] text-[13px] text-etyme-muted">
          <span className="stat-label block">Money in</span>
          {book.in.says}
        </p>
        <p className="max-w-[36ch] text-[13px] text-etyme-muted">
          <span className="stat-label block">Money out</span>
          {book.out.says}
        </p>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        searchPlaceholder="Search parties…"
        searchFilter={(r, q) =>
          r.payerName.toLowerCase().includes(q) || r.payeeName.toLowerCase().includes(q)
        }
        emptyMessage="No hops in this currency."
        exportName="payment-hops"
        defaultPageSize={25}
      />
    </div>
  )
}

// ── Pay when paid ────────────────────────────────────────────────────

function Clause({ data }: { data: any; book: any }) {
  const flags = data.payWhenPaid ?? []

  if (flags.length === 0) {
    return (
      <div className="panel">
        <p className="text-[13px] text-etyme-muted">
          No obligation here is written as conditional on somebody else paying first. That
          is worth knowing: it means the wait stops where it started rather than travelling
          downwards.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[72ch] text-[13px] text-etyme-muted">
        A pay-when-paid clause moves the float one layer down. Between companies it is
        ordinary and enforceable. Against a worker it is generally unenforceable and it is
        the clause that decides whose rent waits on a client&rsquo;s payment run — which is
        why those are listed apart rather than in the same column.
      </p>
      {flags.map((f: any) => (
        <article
          key={f.hopId}
          className="panel"
          style={
            f.severity === 'WARN' ? { borderColor: 'var(--color-attention)' } : undefined
          }
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[14px] font-medium text-etyme-ink">
              {f.payerName} → {f.payeeName}
            </p>
            <div className="flex items-center gap-2">
              <span className={`chip ${f.severity === 'WARN' ? 'chip--attention' : 'chip--passive'}`}>
                {f.enforceability === 'AGAINST_A_PERSON' ? 'against a person' : 'between companies'}
              </span>
              <span className="chip chip--passive tabular-nums">
                {amount(f.amountMinor, f.currency)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-etyme-muted">{f.says}</p>
        </article>
      ))}
    </div>
  )
}

// ── Bills that did not match ─────────────────────────────────────────
//
// The three-way match had forty-two tests and was never called from bill
// intake, so a sub-vendor could bill hours nobody accepted against a
// purchase order with no room left and it went straight in. It runs now,
// on the way in and again here.
//
// Every open bill is re-matched against what is true NOW rather than
// against a verdict stored on Tuesday — a purchase order gets topped up,
// a timesheet is accepted late, and a stored verdict is a claim about
// facts that have since changed.

const CHECK_WORD: Record<string, string> = {
  RECEIPT: 'nobody accepted the hours',
  DUPLICATE: 'billed twice',
  QUANTITY: 'hours disagree',
  PRICE: 'rate disagrees',
  EXTENSION: 'the arithmetic',
  PERIOD: 'wrong period',
  CONTRACT_PERIOD: 'not a period the contract bills',
  HEADER_TOTAL: 'header against lines',
  PO_REQUIRED: 'no purchase order',
  PO_STATUS: 'purchase order closed or expired',
  PO_BALANCE: 'past the ceiling',
}

function Exceptions() {
  const [data, setData] = useState<any>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ap/bills')
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
        setData(b.data)
      })
      .catch((e) => setFailed(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="panel">
        <p className="text-[13px] text-etyme-muted">Re-matching every open bill…</p>
      </div>
    )
  }
  if (failed) {
    return (
      <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
        <p className="text-[13px] text-etyme-attention">{failed}</p>
      </div>
    )
  }

  const rows: any[] = data?.exceptions ?? []

  return (
    <div className="space-y-3">
      <p className="max-w-[70ch] text-[13px] text-etyme-muted">{data?.note}</p>

      {rows.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            All {data?.open ?? 0} open bills match the purchase order and the hours
            somebody here accepted for pay. That is the client&rsquo;s approval and ours
            being two different numbers, and both agreeing with the bill.
          </p>
        </div>
      )}

      {rows.map((e) => (
        <article
          key={e.id}
          className="panel"
          style={
            e.hardFailures.length > 0 ? { borderColor: 'var(--color-attention)' } : undefined
          }
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-etyme-ink">
              {e.counterparty} · {e.reference}
            </p>
            <div className="flex items-center gap-2">
              {e.hardFailures.map((c: string) => (
                <span key={c} className="chip chip--attention">
                  {CHECK_WORD[c] ?? c}
                </span>
              ))}
              {e.waivableFailures.map((c: string) => (
                <span key={c} className="chip chip--passive">
                  {CHECK_WORD[c] ?? c}
                </span>
              ))}
              <span className="chip chip--passive tabular-nums">
                {compact(e.amountCents, e.currency)}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">{e.says}</p>

          <ul className="mt-3 space-y-1 border-t border-etyme-rule pt-3">
            {e.checks
              .filter((c: any) => c.outcome !== 'PASS')
              .map((c: any) => (
                <li key={c.code} className="text-[11px] text-etyme-muted">
                  <span className="text-etyme-ink">{CHECK_WORD[c.code] ?? c.code}</span> — {c.reason}
                </li>
              ))}
          </ul>

          <p className="mt-2 text-[11px] text-etyme-faint tabular-nums">
            arrived {e.ageDays}d ago
            {e.poAfter && ` · ${compact(e.poAfter.remainingCents, e.currency)} left on the PO after it`}
          </p>
        </article>
      ))}
    </div>
  )
}

// ── Payment runs ─────────────────────────────────────────────────────
//
// How money actually leaves: one currency, one day, one file to the bank,
// one remittance advice per supplier. Everything else on this screen
// measures `paidAt` and until now nothing set it except a clerk typing a
// date one bill at a time.

function PaymentRuns({ currency }: { currency: string }) {
  const [data, setData] = useState<any>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payOn, setPayOn] = useState(() => new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    setFailed(null)
    try {
      const r = await fetch(
        `/api/ap/payment-runs?currency=${encodeURIComponent(currency)}&scheduledFor=${payOn}`
      )
      const b = await r.json()
      if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
      setData(b.data)
    } catch (e: any) {
      setFailed(e.message)
    }
  }, [currency, payOn])

  useEffect(() => {
    void load()
  }, [load])

  async function assemble() {
    setBusy(true)
    setFailed(null)
    try {
      const r = await fetch('/api/ap/payment-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, scheduledFor: payOn }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
      setSaid(b.data.note)
      await load()
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function move(id: string, action: 'approve' | 'pay' | 'cancel') {
    setBusy(true)
    setFailed(null)
    try {
      const r = await fetch('/api/ap/payment-runs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
      setSaid(b.data.note)
      await load()
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  const proposed = data?.proposed
  const advice: any[] = data?.advice ?? []
  const runs: any[] = data?.runs ?? []

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-[13px] text-etyme-muted">{data?.note}</p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="stat-label">Paying on</span>
        <input
          type="date"
          className="rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]"
          value={payOn}
          onChange={(e) => setPayOn(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={busy || !proposed || proposed.lines.length === 0}
          onClick={assemble}
        >
          {busy ? 'Working…' : 'Assemble a draft run'}
        </button>
        <span className="text-[11px] text-etyme-faint">
          It releases nothing. Somebody other than you has to approve it.
        </span>
      </div>

      {said && (
        <div className="panel" style={{ borderColor: 'var(--color-verified)' }}>
          <p className="text-[13px] text-etyme-ink">{said}</p>
        </div>
      )}
      {failed && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{failed}</p>
        </div>
      )}

      {proposed && (
        <div className="panel">
          <p className="stat-label">What would go</p>
          <p className="mt-2 text-[15px] text-etyme-ink">{proposed.says}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-8 border-t border-etyme-rule pt-3">
            <div>
              <p className="stat-label">Total</p>
              <p className="stat-value tabular-nums">
                {compact(proposed.totalCents, proposed.currency)}
              </p>
            </div>
            <div>
              <p className="stat-label">Suppliers</p>
              <p className="stat-value tabular-nums">{proposed.vendors}</p>
            </div>
            <div>
              <p className="stat-label">Bills</p>
              <p className="stat-value tabular-nums">{proposed.lines.length}</p>
            </div>
          </div>
        </div>
      )}

      {proposed?.excluded?.length > 0 && (
        <div className="panel">
          <p className="stat-label">Looked at and left out</p>
          <ul className="mt-2 space-y-2">
            {proposed.excluded.map((e: any) => (
              <li key={e.billId} className="text-[13px]">
                <span className="text-etyme-ink">
                  {e.vendorName} · {e.number}
                </span>{' '}
                <span className="text-etyme-muted">— {e.says}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-etyme-faint">
            A bill that silently misses a run is a supplier who telephones, and &ldquo;it
            was not picked up&rdquo; is not an answer anybody can act on.
          </p>
        </div>
      )}

      {advice.length > 0 && (
        <div className="panel">
          <p className="stat-label">Remittance advice</p>
          {advice.map((a: any) => (
            <pre
              key={a.vendorCompanyId}
              className="mt-3 overflow-x-auto whitespace-pre-wrap border-t border-etyme-rule pt-3 text-[11px] text-etyme-muted"
              style={{ fontFamily: 'IBM Plex Mono, monospace' }}
            >
              {a.text}
            </pre>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-3">
          <p className="stat-label">Runs</p>
          {runs.map((r: any) => (
            <article key={r.id} className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  {r.currency} {compact(r.totalCents, r.currency)} · {r._count.items} bill
                  {r._count.items === 1 ? '' : 's'}
                </p>
                <span
                  className={`chip ${
                    r.status === 'PAID'
                      ? 'chip--verified'
                      : r.status === 'APPROVED'
                        ? 'chip--action'
                        : r.status === 'CANCELLED'
                          ? 'chip--passive'
                          : 'chip--attention'
                  }`}
                >
                  {r.status.toLowerCase()}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-etyme-faint">
                <span className="tabular-nums">
                  scheduled {new Date(r.scheduledFor).toISOString().slice(0, 10)}
                </span>
                {r.createdBy && <span>assembled by {r.createdBy.name}</span>}
                {r.approvedBy && <span>approved by {r.approvedBy.name}</span>}
                {r.paidAt && (
                  <span className="tabular-nums">
                    paid {new Date(r.paidAt).toISOString().slice(0, 10)}
                  </span>
                )}
              </div>
              {r.status !== 'PAID' && r.status !== 'CANCELLED' && (
                <div className="mt-3 flex flex-wrap gap-3 border-t border-etyme-rule pt-3">
                  {r.status === 'DRAFT' && (
                    <button
                      className="text-[13px] underline"
                      style={{ color: 'var(--color-action)' }}
                      disabled={busy}
                      onClick={() => move(r.id, 'approve')}
                    >
                      Approve it
                    </button>
                  )}
                  {r.status === 'APPROVED' && (
                    <button
                      className="text-[13px] underline"
                      style={{ color: 'var(--color-action)' }}
                      disabled={busy}
                      onClick={() => move(r.id, 'pay')}
                    >
                      Mark it paid
                    </button>
                  )}
                  <button
                    className="text-[13px] underline text-etyme-muted"
                    disabled={busy}
                    onClick={() => move(r.id, 'cancel')}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
