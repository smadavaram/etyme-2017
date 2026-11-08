'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { amount } from '@/lib/money-display'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import { refusalOf, refusedRead } from '@/lib/money/refused-read'
import { ListSurface, type Column } from '@/components/list-surface'
import { EmptyState, ErrorState, Field, Input, LoadingState, PageHead, RefusedState, SubmitButton } from '@/components/ui'
import { DefaultsPanel, type DefaultsRead } from './defaults-panel'

/**
 * What a recruiter earned, and the run that posted it.
 *
 * The commission run has existed since commissions were built and
 * nothing in the app reached it — the only way in was the API, and the
 * only way to read the result was the database. So this is both halves:
 * the earnings, per person per month, and the button that runs a period.
 *
 * A posting is the record. This reads postings rather than recomputing,
 * because what somebody was actually paid and what the rules say they
 * should have been are two different questions, and a page that answers
 * the second while claiming to answer the first is worse than no page.
 */

interface Earning {
  personId: string | null
  name: string
  period: string
  amountCents: number
  currency: string
  lines: { says: string; amountCents: number; order: string }[]
}

interface CommissionRow {
  id: string
  kindSays: string
  earnedBy: { id: string; name: string }
  person: { id: string; name: string } | null
  client: { id: string; name: string } | null
  termsSay: string
  amountCents: number | null
  currency: string | null
  state: 'ACCRUED' | 'POSTED' | 'WAITING' | 'NOTHING' | 'BLANK'
  says: string
}

const STATE_WORD: Record<CommissionRow['state'], string> = {
  ACCRUED: 'Earned, not yet run',
  POSTED: 'Posted',
  WAITING: 'Waiting on the bill being paid',
  NOTHING: 'Nothing earned',
  BLANK: 'No figure',
}

// Each figure in its own currency: a recruiter paid in rupees is never shown dollars.
const cash = (cents: number, currency: string) => amount(cents, currency)
const monthName = (p: string) =>
  new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function CommissionsPage() {
  const [earnings, setEarnings] = useState<Earning[]>([])
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [summary, setSummary] = useState('')
  const [mayRun, setMayRun] = useState(false)
  const [defaults, setDefaults] = useState<DefaultsRead | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** What the route said when it refused the read; null where it did not. */
  const [refusedSaid, setRefusedSaid] = useState<string | null>(null)
  const { company, loading: sessionLoading } = useSession()
  // The section this page sits under on the reader's own menu, and
  // nothing while that is not known yet — never a word typed by hand.
  const eyebrow = usePageSection('/dashboard/payroll/commissions')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payroll/commissions')
      // A refusal is not an empty list (sign-up walk, round four, #5).
      if (res.status === 403) {
        setRefusedSaid(refusalOf(res.status, await res.json().catch(() => null)))
        return
      }
      setRefusedSaid(null)
      const body = await readJson(res)
      setEarnings(body.data.earnings)
      setRows(body.data.rows ?? [])
      setSummary(body.data.summary)
      setMayRun(body.data.mayRun)
      setDefaults(body.data.defaults ?? null)
      setError(null)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function run() {
    setBusy(true)
    setSaid(null)
    try {
      const body = await readJson(await fetch('/api/payroll/commissions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ periodStart: from, periodEnd: to }),
      }))
      setSaid(body.data.says)
      await load()
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  const columns: Column<Earning>[] = useMemo(() => [
    { key: 'name', label: 'Who', render: (e) => <span className="text-etyme-ink">{e.name}</span>, sortValue: (e) => e.name },
    { key: 'period', label: 'Period', render: (e) => <span className="text-etyme-muted">{monthName(e.period)}</span>, sortValue: (e) => e.period },
    { key: 'lines', label: 'Placements', align: 'right', render: (e) => <span className="tabular-nums text-etyme-muted">{e.lines.length}</span>, sortValue: (e) => e.lines.length, hideOnMobile: true },
    { key: 'amountCents', label: 'Earned', align: 'right', render: (e) => <span className="tabular-nums">{cash(e.amountCents, e.currency)}</span>, sortValue: (e) => e.amountCents },
  ], [])

  // Money pages wait (sign-up walk, round three, #17): until the session
  // says whose company this is, no figure and no refusal naming a desk.
  if (!company) {
    return sessionLoading ? <LoadingState /> : <RefusedState says="These are a company’s books, and you are not signed in at a company." />
  }
  // Refused: the sentence and nothing else.
  const refused = refusedRead(refusedSaid, { what: 'Commissions', kind: company.kind, company: company.name })
  if (refused) {
    return <RefusedState says={refused} />
  }

  return (
    <div className="mx-auto max-w-[980px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={eyebrow}
        title="Commissions"
        subtitle={<>
          What each person earned on the placements they are on a commission agreement for.
          Read from what was actually posted, not recalculated — so this says what was paid,
          not what a rule thinks should have been.
        </>}
      />

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      {mayRun && (
        <form className="panel flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run() }}>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <SubmitButton pending={busy} pendingLabel="Running…" disabled={!from || !to}>
            Run the period
          </SubmitButton>
          <p className="text-[12px] text-etyme-muted">
            Posts once per person per period, under the cap. Running the same period twice
            adds nothing.
          </p>
        </form>
      )}

      {defaults && <DefaultsPanel key={JSON.stringify(defaults.set)} read={defaults} onSaved={setDefaults} />}

      {said && <div className="panel" role="status"><p className="text-[13px] text-etyme-ink">{said}</p></div>}
      {error && <ErrorState says={error} />}
      {loading && <LoadingState says="Opening commissions…" />}

      {!loading && rows.length > 0 && (
        <section className="panel space-y-2">
          <p className="lbl">Commissions on lines, this period</p>
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-etyme-rule pt-2 text-[13px] first:border-t-0 first:pt-0">
              <div>
                <p className="text-etyme-ink">{r.earnedBy.name} · {r.kindSays}{r.person ? ` · ${r.person.name}` : ''}{r.client ? ` at ${r.client.name}` : ''}</p>
                <p className="text-[12px] text-etyme-muted">{r.termsSay}. {r.says}</p>
              </div>
              <div className="text-right">
                <p className="tabular-nums text-etyme-ink">{r.amountCents == null ? '—' : amount(r.amountCents, r.currency ?? undefined)}</p>
                <p className="text-[11px] text-etyme-faint">{STATE_WORD[r.state]}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && earnings.length > 0 && (
        <ListSurface<Earning>
          name="commissions"
          defaultView="feed"
          columns={columns}
          data={earnings}
          rowKey={(e) => `${e.personId ?? 'none'}:${e.period}`}
          searchPlaceholder="Search by name…"
          searchFilter={(e, q) => e.name.toLowerCase().includes(q.toLowerCase())}
          exportName="commissions"
          emptyMessage="Nothing earned in this period."
          card={(e) => (
            <article className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-etyme-ink">{e.name}</p>
                  <p className="text-[12px] text-etyme-faint">{monthName(e.period)}</p>
                </div>
                <p className="font-serif text-[22px] tabular-nums text-etyme-ink">{cash(e.amountCents, e.currency)}</p>
              </div>
              <button
                onClick={() => setOpen(open === `${e.personId}:${e.period}` ? null : `${e.personId}:${e.period}`)}
                className="mt-2 text-[12px] text-etyme-muted hover:text-etyme-ink"
              >
                {open === `${e.personId}:${e.period}` ? 'Hide' : `What it came from (${e.lines.length})`}
              </button>
              {open === `${e.personId}:${e.period}` && (
                <div className="mt-2 space-y-1 border-t border-etyme-rule pt-2">
                  {e.lines.map((l, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="text-etyme-muted">{l.says || l.order}</span>
                      <span className="tabular-nums text-etyme-ink">{cash(l.amountCents, e.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}
        />
      )}

      {!loading && earnings.length === 0 && rows.length === 0 && !error && (
        <EmptyState
          says="Nothing posted yet."
          detail={mayRun ? 'Pick a period above and run it.' : 'Whoever runs payroll here can run a period.'}
        />
      )}
    </div>
  )
}
