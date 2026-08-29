'use client'

import { useEffect, useMemo, useState } from 'react'
import { DataTable, type Column } from '@/components/data-table'
import { compact, amount } from '@/lib/money-display'

/**
 * Money owed to us.
 *
 * A working surface, not a decision surface. Nobody comes here to be
 * persuaded of anything — they come to find the four clients who have
 * gone quiet and get off the screen. So it is dense, tabular, sortable
 * and searchable, and the serif is used once at the top and nowhere in
 * a row.
 *
 * The order of the tabs is the order of the work. Customers first,
 * because a chase is a conversation with a company and not with an
 * invoice. Then the invoices themselves. Then the two queues that no
 * other screen in this product shows at all: short payments, which are
 * questions somebody has to answer, and cash we hold and cannot count.
 */

// ── Shapes, loosely — the route is the contract ──────────────────────

type Bucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'

const BUCKET_LABEL: Record<Bucket, string> = {
  CURRENT: 'Not yet due',
  D1_30: '1–30',
  D31_60: '31–60',
  D61_90: '61–90',
  D90_PLUS: '90+',
}

const BUCKET_COLOUR: Record<Bucket, string> = {
  CURRENT: 'var(--color-verified)',
  D1_30: 'var(--color-muted)',
  D31_60: 'var(--color-attention)',
  D61_90: 'var(--color-attention)',
  D90_PLUS: 'var(--color-danger, #B4413C)',
}

const SETTLEMENT_CHIP: Record<string, { chip: string; word: string }> = {
  SETTLED: { chip: 'chip--verified', word: 'settled' },
  OUTSTANDING: { chip: 'chip--passive', word: 'unpaid' },
  PART_PAID: { chip: 'chip--action', word: 'part paid' },
  SHORT_PAID: { chip: 'chip--attention', word: 'short paid' },
  OVERPAID: { chip: 'chip--attention', word: 'overpaid' },
}

const CREDIT_CHIP: Record<string, { chip: string; word: string }> = {
  NO_LIMIT_SET: { chip: 'chip--passive', word: 'no limit set' },
  WITHIN: { chip: 'chip--verified', word: 'within limit' },
  APPROACHING: { chip: 'chip--attention', word: 'near limit' },
  BREACHED: { chip: 'chip--attention', word: 'over limit' },
}

type Tab = 'customers' | 'invoices' | 'disputes' | 'unapplied' | 'reminders'

const TABS: { key: Tab; label: string }[] = [
  { key: 'customers', label: 'By customer' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'disputes', label: 'Short paid' },
  { key: 'unapplied', label: 'Cash we cannot place' },
  { key: 'reminders', label: 'What to send' },
]

export default function ArPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('customers')

  useEffect(() => {
    fetch('/api/ar')
      .then(async (r) => {
        const b = await r.json()
        if (r.status === 403) {
          setDenied(b.error?.message ?? 'You cannot see this.')
          return
        }
        if (!r.ok) throw new Error(b.error?.message ?? `HTTP ${r.status}`)
        setData(b.data)
        setCurrency(b.data.currencies[0]?.currency ?? null)
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
        <h1 className="headline-serif text-[30px] leading-tight">Money owed to us</h1>
        <p className="mt-2 max-w-[64ch] text-[13px] text-etyme-muted">
          Aged from the day each invoice fell due, so a client on sixty-day terms is
          not shown as late on day forty-five. A part payment is chased for the
          balance. A short payment is a question for a person, not arrears.
        </p>
      </header>

      {/* ── Denied ─────────────────────────────────────────────────── */}
      {denied && (
        <div className="panel">
          <p className="text-[13px] text-etyme-ink">{denied}</p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            Ask whoever manages roles here for <code>margin.read</code> if you need it.
          </p>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────── */}
      {loading && !denied && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">Reading the invoice book…</p>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{error}</p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            Nothing is shown rather than something approximate — a wrong receivable is
            worse than none.
          </p>
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────────────────── */}
      {!loading && !error && !denied && data?.source === 'NONE' && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">{data.note}</p>
        </div>
      )}

      {/* ── Partial — what could not be counted ────────────────────── */}
      {!loading && data?.gaps?.length > 0 && data.source !== 'NONE' && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="stat-label">What this screen cannot yet see</p>
          <ul className="mt-2 space-y-1">
            {data.gaps.map((g: string, i: number) => (
              <li key={i} className="text-[13px] text-etyme-muted">
                — {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Currency ───────────────────────────────────────────────── */}
      {data?.currencies?.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="stat-label">Books</span>
          {data.currencies.map((c: any) => (
            <button
              key={c.currency}
              onClick={() => setCurrency(c.currency)}
              className={`chip ${c.currency === currency ? 'chip--action' : 'chip--passive'}`}
            >
              {c.currency} · {compact(c.outstandingMinor, c.currency)}
            </button>
          ))}
          <span className="text-[11px] text-etyme-faint">
            Never added together — one book per currency.
          </span>
        </div>
      )}

      {book && (
        <>
          <StatRow book={book} />
          <AgeingBar book={book} />

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
                  {countFor(t.key, book)}
                </span>
              </button>
            ))}
          </nav>

          {tab === 'customers' && <Customers book={book} />}
          {tab === 'invoices' && <Invoices book={book} />}
          {tab === 'disputes' && <Disputes book={book} />}
          {tab === 'unapplied' && <Unapplied book={book} />}
          {tab === 'reminders' && <Reminders book={book} />}
        </>
      )}
    </div>
  )
}

function countFor(tab: Tab, book: any): number {
  switch (tab) {
    case 'customers': return book.customers.length
    case 'invoices': return book.invoices.length
    case 'disputes': return book.disputes.length
    case 'unapplied': return book.unapplied.length + book.unreconciled.length
    case 'reminders': return book.dunning.send.length
  }
}

// ── The five numbers ─────────────────────────────────────────────────

function StatRow({ book }: { book: any }) {
  const ccy = book.currency
  const ninety = book.buckets.D90_PLUS.minor

  return (
    <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
      <div>
        <p className="stat-label">Owed to us</p>
        <p className="stat-value tabular-nums">{compact(book.outstandingMinor, ccy)}</p>
      </div>
      <div>
        <p className="stat-label">Past due</p>
        <p
          className="stat-value tabular-nums"
          style={{ color: book.overdueMinor > 0 ? 'var(--color-attention)' : undefined }}
        >
          {compact(book.overdueMinor, ccy)}
        </p>
      </div>
      <div>
        <p className="stat-label">Over 90 days</p>
        <p
          className="stat-value tabular-nums"
          style={{ color: ninety > 0 ? 'var(--color-attention)' : undefined }}
        >
          {compact(ninety, ccy)}
        </p>
        <p className="mt-0.5 text-[11px] text-etyme-faint">
          {book.buckets.D90_PLUS.count} invoice{book.buckets.D90_PLUS.count === 1 ? '' : 's'}
        </p>
      </div>
      <div>
        <p className="stat-label">Days to get paid</p>
        <p className="stat-value tabular-nums">
          {book.dso.days == null ? '—' : book.dso.days}
        </p>
        <p className="mt-0.5 max-w-[34ch] text-[11px] text-etyme-faint">{book.dso.says}</p>
      </div>
      {book.unappliedMinor > 0 && (
        <div>
          <p className="stat-label">Cash we cannot place</p>
          <p className="stat-value tabular-nums" style={{ color: 'var(--color-attention)' }}>
            {compact(book.unappliedMinor, ccy)}
          </p>
        </div>
      )}
    </div>
  )
}

function AgeingBar({ book }: { book: any }) {
  const total = book.outstandingMinor
  if (total <= 0) return null
  const order: Bucket[] = ['CURRENT', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS']

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-etyme-canvas">
        {order.map((b) => {
          const share = book.buckets[b].minor / total
          if (share <= 0) return null
          return (
            <div
              key={b}
              title={`${BUCKET_LABEL[b]} — ${amount(book.buckets[b].minor, book.currency)}`}
              style={{ width: `${share * 100}%`, background: BUCKET_COLOUR[b] }}
            />
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {order.map((b) => (
          <span key={b} className="flex items-baseline gap-1.5 text-[11px] text-etyme-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: BUCKET_COLOUR[b] }}
            />
            {BUCKET_LABEL[b]}
            <span className="tabular-nums text-etyme-ink">
              {compact(book.buckets[b].minor, book.currency)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── By customer ──────────────────────────────────────────────────────

function Customers({ book }: { book: any }) {
  const ccy = book.currency

  const columns: Column<any>[] = [
    {
      key: 'customerName',
      label: 'Customer',
      render: (r) => (
        <div>
          <span className="font-medium text-etyme-ink">{r.customerName}</span>
          <p className="mt-0.5 max-w-[46ch] text-[11px] text-etyme-faint">{r.says}</p>
        </div>
      ),
    },
    {
      key: 'outstandingMinor',
      label: 'Owed',
      align: 'right',
      sortValue: (r) => r.outstandingMinor,
      render: (r) => (
        <span className="tabular-nums">{compact(r.outstandingMinor, ccy)}</span>
      ),
    },
    {
      key: 'overdueMinor',
      label: 'Past due',
      align: 'right',
      sortValue: (r) => r.overdueMinor,
      render: (r) => (
        <span
          className="tabular-nums"
          style={{ color: r.overdueMinor > 0 ? 'var(--color-attention)' : undefined }}
        >
          {compact(r.overdueMinor, ccy)}
        </span>
      ),
    },
    {
      key: 'oldestDaysOverdue',
      label: 'Oldest',
      align: 'right',
      sortValue: (r) => r.oldestDaysOverdue ?? -1,
      render: (r) => (
        <span className="tabular-nums">
          {r.oldestDaysOverdue == null ? '—' : `${r.oldestDaysOverdue}d`}
        </span>
      ),
    },
    {
      key: 'concentration',
      label: 'Shape',
      render: (r) =>
        r.concentration === 'NOTHING_OVERDUE' ? (
          <span className="text-etyme-faint">—</span>
        ) : (
          <span
            className={`chip ${r.concentration === 'ONE_BIG_INVOICE' ? 'chip--attention' : 'chip--passive'}`}
          >
            {r.concentration === 'ONE_BIG_INVOICE'
              ? `one invoice · ${Math.round((r.largestShareBps ?? 0) / 100)}%`
              : r.concentration === 'SPREAD_THIN'
                ? `${r.overdueCount} small`
                : `${r.overdueCount} mixed`}
          </span>
        ),
    },
    {
      key: 'exposure',
      label: 'Exposed',
      align: 'right',
      sortValue: (r) => r.exposure.minor,
      hideOnMobile: true,
      render: (r) => (
        <div>
          <span className="tabular-nums">{compact(r.exposure.minor, ccy)}</span>
          {!r.exposure.complete && (
            <span className="ml-1 text-[11px] text-etyme-faint">at least</span>
          )}
          <p className="mt-0.5 text-[11px] text-etyme-faint">
            {r.running} running · {compact(r.exposure.parts[2]?.minor ?? 0, ccy)} committed
          </p>
        </div>
      ),
    },
    {
      key: 'lastChased',
      label: 'Last chased',
      hideOnMobile: true,
      sortValue: (r) => (r.lastChased ? new Date(r.lastChased.sentAt).getTime() : 0),
      render: (r) =>
        r.lastChased ? (
          <div>
            <span className="text-[13px] text-etyme-ink">
              {STEP_WORD[r.lastChased.step] ?? r.lastChased.step}
            </span>
            <p className="mt-0.5 text-[11px] tabular-nums text-etyme-faint">
              {new Date(r.lastChased.sentAt).toISOString().slice(0, 10)}
            </p>
          </div>
        ) : (
          <span className="text-[11px] text-etyme-faint">never</span>
        ),
    },
    {
      key: 'credit',
      label: 'Limit',
      hideOnMobile: true,
      sortValue: (r) => r.credit.outcome,
      render: (r) => {
        const c = CREDIT_CHIP[r.credit.outcome] ?? CREDIT_CHIP.NO_LIMIT_SET
        return (
          <div>
            <span className={`chip ${c.chip}`}>{c.word}</span>
            {r.credit.limitMinor != null && (
              <p className="mt-0.5 text-[11px] tabular-nums text-etyme-faint">
                {compact(r.credit.limitMinor, ccy)}
                {r.credit.usedBps != null && ` · ${Math.round(r.credit.usedBps / 100)}% used`}
              </p>
            )}
            {r.credit.stale && (
              <p className="mt-0.5 text-[11px] text-etyme-attention">out of date</p>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-etyme-muted">
        Exposure is not the unpaid invoices. It is those plus work delivered and not
        yet billed plus what is committed for the rest of every running assignment —
        which is why a client owing a little can be the riskiest name on the list.
      </p>
      <DataTable
        columns={columns}
        data={book.customers}
        rowKey={(r) => r.customerId}
        searchPlaceholder="Search customers…"
        searchFilter={(r, q) => r.customerName.toLowerCase().includes(q)}
        emptyMessage="Nobody owes us anything."
        exportName="money-owed-by-customer"
        defaultPageSize={20}
      />
    </div>
  )
}

// ── Invoices ─────────────────────────────────────────────────────────

function Invoices({ book }: { book: any }) {
  const ccy = book.currency

  const columns: Column<any>[] = [
    {
      key: 'number',
      label: 'Invoice',
      render: (r) => (
        <div>
          <span className="font-medium text-etyme-ink">{r.number}</span>
          {r.billedVia && (
            <p className="mt-0.5 text-[11px] text-etyme-faint">billed via {r.billedVia}</p>
          )}
        </div>
      ),
    },
    { key: 'customerName', label: 'Customer' },
    {
      key: 'dueAt',
      label: 'Due',
      sortValue: (r) => new Date(r.dueAt).getTime(),
      render: (r) => (
        <span className="tabular-nums text-etyme-muted">
          {new Date(r.dueAt).toISOString().slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'daysOverdue',
      label: 'Age',
      align: 'right',
      sortValue: (r) => r.daysOverdue,
      render: (r) => (
        <span
          className="tabular-nums"
          style={{
            color:
              r.daysOverdue > 60
                ? 'var(--color-attention)'
                : r.daysOverdue > 0
                  ? 'var(--color-ink)'
                  : 'var(--color-faint)',
          }}
        >
          {r.daysOverdue > 0 ? `${r.daysOverdue}d` : BUCKET_LABEL.CURRENT}
        </span>
      ),
    },
    {
      key: 'totalMinor',
      label: 'Invoiced',
      align: 'right',
      sortValue: (r) => r.totalMinor,
      render: (r) => <span className="tabular-nums">{compact(r.totalMinor, ccy)}</span>,
    },
    {
      key: 'paidMinor',
      label: 'Received',
      align: 'right',
      sortValue: (r) => r.paidMinor,
      render: (r) => (
        <span className="tabular-nums text-etyme-muted">{compact(r.paidMinor, ccy)}</span>
      ),
    },
    {
      key: 'outstandingMinor',
      label: 'Still owed',
      align: 'right',
      sortValue: (r) => r.outstandingMinor,
      render: (r) => (
        <span
          className="tabular-nums"
          style={{ color: r.daysOverdue > 0 && r.outstandingMinor > 0 ? 'var(--color-attention)' : undefined }}
        >
          {compact(r.outstandingMinor, ccy)}
        </span>
      ),
    },
    {
      key: 'settlement',
      label: 'Standing',
      render: (r) => {
        const s = SETTLEMENT_CHIP[r.settlement] ?? SETTLEMENT_CHIP.OUTSTANDING
        return (
          <span className="flex flex-wrap items-center gap-1">
            <span className={`chip ${s.chip}`}>{s.word}</span>
            {r.receiptsDisagree && (
              <span className="chip chip--attention">receipts differ</span>
            )}
          </span>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={book.invoices}
      rowKey={(r) => r.id}
      searchPlaceholder="Search invoice number or customer…"
      searchFilter={(r, q) =>
        r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q)
      }
      emptyMessage="No invoices on the book."
      exportName="money-owed-by-invoice"
      defaultPageSize={50}
    />
  )
}

// ── Short payments ───────────────────────────────────────────────────

function Disputes({ book }: { book: any }) {
  if (book.disputes.length === 0) {
    return (
      <div className="panel">
        <p className="text-[13px] text-etyme-muted">
          Nobody has paid part of an invoice and stopped. When somebody does, it appears
          here rather than in the reminder queue — a shortfall is a question about the
          invoice, and a reminder answers a question nobody asked.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-etyme-muted">
        Each of these was paid, deliberately, short. That is a query about something on
        the invoice — a rate, an expense line, an hour somebody did not approve — and it
        is answered by a person. None of them are chased automatically.
      </p>
      {book.disputes.map((d: any) => (
        <article key={d.id} className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-etyme-ink">
              {d.customerName} · {d.number}
            </p>
            <span className="chip chip--attention tabular-nums">
              {compact(d.outstandingMinor, book.currency)} in question
            </span>
          </div>
          <p className="mt-2 text-[13px] text-etyme-ink">{d.says}</p>
          <div className="mt-3 flex flex-wrap gap-4 border-t border-etyme-rule pt-3 text-[11px] text-etyme-faint">
            <span className="tabular-nums">
              invoiced {amount(d.totalMinor, book.currency)}
            </span>
            <span className="tabular-nums">
              received {amount(d.paidMinor, book.currency)}
            </span>
            <span className="tabular-nums">{d.daysOverdue}d past due</span>
          </div>
        </article>
      ))}
    </div>
  )
}

// ── Cash we cannot place ─────────────────────────────────────────────

function Unapplied({ book }: { book: any }) {
  const nothing = book.unapplied.length === 0 && book.unreconciled.length === 0

  if (nothing) {
    return (
      <div className="panel">
        <p className="text-[13px] text-etyme-muted">
          Every receipt matches something owed. When one does not — money arrives beyond
          an invoice total, or the receipts and the invoice header disagree — it appears
          here. It is money we hold and cannot count, and most systems never show it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {book.unapplied.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] text-etyme-muted">
            More arrived than was asked for. Until somebody says what the excess was for,
            it cannot be counted as revenue and cannot be set against anything.
          </p>
          {book.unapplied.map((u: any) => (
            <article key={u.id} className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  {u.customerName} · {u.number}
                </p>
                <span className="chip chip--attention tabular-nums">
                  {compact(u.unappliedMinor, book.currency)} unplaced
                </span>
              </div>
              <p className="mt-2 text-[13px] text-etyme-ink">{u.says}</p>
              {u.lastPaymentAt && (
                <p className="mt-2 text-[11px] text-etyme-faint">
                  last receipt {new Date(u.lastPaymentAt).toISOString().slice(0, 10)}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {book.unreconciled.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] text-etyme-muted">
            The receipts and the invoice header disagree. One of the two is wrong and
            neither should be trusted until somebody looks.
          </p>
          {book.unreconciled.map((u: any) => (
            <article key={u.id} className="panel">
              <p className="text-[15px] font-semibold text-etyme-ink">
                {u.customerName} · {u.number}
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-[13px] text-etyme-muted">
                <span className="tabular-nums">
                  header says {amount(u.paidMinor, book.currency)}
                </span>
                <span className="tabular-nums">
                  receipts add to {amount(u.receiptsMinor, book.currency)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

// ── The ladder ───────────────────────────────────────────────────────

const STEP_WORD: Record<string, string> = {
  COURTESY: 'courtesy note',
  FIRST: 'first reminder',
  SECOND: 'second reminder',
  FINAL: 'final notice',
  ESCALATED: 'hand to a person',
}

function Reminders({ book }: { book: any }) {
  const { send, silent } = book.dunning
  const quiet = silent.filter((s: any) =>
    ['IN_DISPUTE', 'WITH_A_PERSON', 'NOT_WORTH_A_LETTER'].includes(s.reason)
  )

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function raise(clientCompanyId?: string) {
    setSending(true)
    setFailed(null)
    try {
      const res = await fetch('/api/ar/dunning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientCompanyId ? { clientCompanyId } : {}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setResult(body.data.note)
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-[13px] text-etyme-muted">
        Four letters and then a person. One message per customer listing every invoice,
        never one message per invoice — eight emails on the same morning is not eight
        times the pressure, it is one filter rule. Past sixty days nothing automated
        goes out at all.
      </p>

      {send.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={sending} onClick={() => raise()}>
            {sending ? 'Recording…' : `Send all ${send.length}`}
          </button>
          <span className="text-[11px] text-etyme-faint">
            Each letter is recorded, so the same rung will not go out again while an
            invoice it named is still open.
          </span>
        </div>
      )}

      {result && (
        <div className="panel" style={{ borderColor: 'var(--color-verified)' }}>
          <p className="text-[13px] text-etyme-ink">{result}</p>
          <p className="mt-1 text-[11px] text-etyme-faint">
            Reload to see the ladder with these suppressed.
          </p>
        </div>
      )}

      {failed && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{failed}</p>
        </div>
      )}

      {send.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing is due to be said today. Where a rung has already gone for this run of
            arrears it stays quiet until the next one falls due — repeating it is how a
            client learns to filter us.
          </p>
        </div>
      )}

      {send.map((a: any) => (
        <article
          key={a.customerId}
          className="panel"
          style={!a.automated ? { borderColor: 'var(--color-attention)' } : undefined}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-etyme-ink">{a.customerName}</p>
            <div className="flex items-center gap-2">
              <span className={`chip ${a.automated ? 'chip--action' : 'chip--attention'}`}>
                {STEP_WORD[a.step] ?? a.step}
              </span>
              <span className="chip chip--passive tabular-nums">
                {compact(a.amountMinor, a.currency)}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">{a.says}</p>
          <p className="mt-1 text-[13px] text-etyme-muted">{a.why}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-etyme-rule pt-3 text-[11px] text-etyme-faint">
            <span>{a.subject}</span>
            <span className="tabular-nums">
              {a.invoiceNumbers.slice(0, 6).join(', ')}
              {a.invoiceNumbers.length > 6 ? ` +${a.invoiceNumbers.length - 6} more` : ''}
            </span>
            <span className="tabular-nums">oldest {a.maxDaysOverdue}d</span>
            {a.automated && (
              <button
                className="ml-auto text-[11px] underline"
                style={{ color: 'var(--color-action)' }}
                disabled={sending}
                onClick={() => raise(a.customerId)}
              >
                Send this one
              </button>
            )}
          </div>
        </article>
      ))}

      {quiet.length > 0 && (
        <div className="panel">
          <p className="stat-label">Deliberately said nothing to</p>
          <ul className="mt-2 space-y-2">
            {quiet.map((s: any) => (
              <li key={s.customerId} className="text-[13px]">
                <span className="text-etyme-ink">{s.customerName}</span>{' '}
                <span className="text-etyme-muted">— {s.says}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
