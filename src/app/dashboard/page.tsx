'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session-provider'
import { consoleHome } from '@/lib/console-home'
import { landingFor, mayOpen } from '@/lib/nav-table'
import { deskOf } from '@/components/shell/sidebar-props'
import { refusalSentence } from '@/lib/refusal-words'
import { hasPermission } from '@/lib/permissions'
import { formatDay, formatDayLong } from '@/lib/format-date'
import { amount, compact } from '@/lib/money-display'
import {
  NOT_YOURS_TODAY, queueRowView, benchSays, lastDaySays, weeksByPerson,
  type QueueRowIn, type QueueRowView, type TodayReads,
} from '@/lib/today-page'

/**
 * A selling firm's Today — a supplier's, an integrator's, an MSP's own
 * book.
 *
 * The founder, 2026-10-19 ("Nine links, no flip, and every first screen
 * names a person"): *a firm's Today page reads what a firm asks on a
 * Tuesday: billing this month, signed and not yet billed, rolling off in
 * 30 days, on the bench, each with the names.* So the page is a headline
 * with the names in it (the decision queue's own sentence, `data.says`
 * from GET /api/decisions, word for word), one line of the picture, the
 * four figures with the names under each, then what is the reader's to
 * decide beside who is where and what is billed.
 *
 * Every figure is read from the service that computes it, once, on the
 * server (GET /api/today): billing and the unbilled weeks are money's
 * `firmTuesday`, rolling off is supply's `releasing`, the bench is
 * supply's `benchSpell`, and the unpaid bills are the receivable book.
 * Nothing on this page adds, multiplies or estimates.
 *
 * Gone, on the founder's word: the submissions target, what a submission
 * costs, the pipeline estimate and its bars, the 160-hour revenue guess,
 * and the log of what the system did — which lives on the ledger, one
 * link at the bottom.
 */

// ── Types ────────────────────────────────────────────

interface CurrencyTotal {
  currency: string
  amountMinor: number | null
  pricedMinor: number
  count: number
  unpriced: number
}

interface TodayData {
  asOf: string
  company: { name: string; kind: string }
  reads: TodayReads
  picture: string
  billing: { totals: CurrencyTotal[]; people: number; names: string[]; basis: string; unpriced: string[] } | null
  signed: {
    count: number
    onDrafts: number
    totals: CurrencyTotal[]
    unpriced: string[]
    byClient: {
      client: string
      weeks: number
      totals: CurrencyTotal[]
      people: { personName: string }[]
      drafts: { invoiceId: string; number: string }[]
    }[]
  } | null
  rollingOff: { contractId: string; personId: string; name: string; client: string | null; days: number; lastDay: string; started: boolean }[] | null
  bench: { personId: string; name: string; since: string }[] | null
  whoIsWhere: { client: string; people: { personId: string; name: string }[]; totals: CurrencyTotal[] | null }[] | null
  unpaid: { invoiceId: string; number: string; client: string; currency: string; outstandingMinor: number; dueOn: string; daysOverdue: number }[] | null
}

interface Queue {
  says: string
  welcome: string | null
  total: number
  rows: QueueRowIn[]
}

/** How many unpaid bills the page lists before pointing at Accounts receivable. */
const UNPAID_SHOWN = 6

// ── Helpers ──────────────────────────────────────────

/** "Ravi Subramanian, Omar Haddad and 3 more". */
function namesLine(names: readonly string[], shown = 4): string {
  const unique = [...new Set(names)]
  if (unique.length <= shown) return unique.join(', ')
  return `${unique.slice(0, shown).join(', ')} and ${unique.length - shown} more`
}

/**
 * A figure's value per currency. A currency with a row that has no
 * amount has no whole, and says so rather than printing the part as if
 * it were the total.
 */
function totalValues(totals: readonly CurrencyTotal[]): { value: string; note: string | null }[] {
  return totals.map((t) =>
    t.amountMinor != null
      ? { value: compact(t.amountMinor, t.currency), note: null }
      : {
          value: '—',
          note:
            `${amount(t.pricedMinor, t.currency)} on what can be priced; ` +
            `${t.unpriced} of ${t.count} cannot be priced yet, so there is no total.`,
        }
  )
}

/** "$21,120" beside a client, or nothing where it cannot be said. */
function clientFigure(totals: readonly CurrencyTotal[] | null): string | null {
  if (!totals || totals.length === 0) return null
  return totals.map((t) => (t.amountMinor != null ? `${compact(t.amountMinor, t.currency)} a month` : 'no monthly figure')).join(' · ')
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message ?? `The server answered ${res.status}.`)
  return body
}

// ── Page ─────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const session = useSession()
  // Whose dashboard this is.
  //
  // This page is the seller's own book. Three kinds of reader have no
  // business on it, found on the browser walk of 2026-09-21: an
  // integrator was once sent to a client's program, a consultant typing
  // the bare URL got the vendor console, and a one-person corporation got
  // a bench of strangers. The answer is `lib/console-home`, which the
  // sidebar's own link and the demo door read too, so the three doors
  // cannot disagree.
  const [sendingOn, setSendingOn] = useState(true)

  useEffect(() => {
    if (session.loading) return
    const home = consoleHome({
      kind: session.company?.kind ?? null,
      isConsultant: session.contextType === 'CONSULTANT',
      seated: Boolean(session.seat),
      worker: deskOf(session).worker,
      permissions: deskOf(session).permissions,
    })
    // Anybody whose console is not this page goes where signing in and
    // the demo door send them, through the one function the three doors
    // share (`landingFor` in lib/nav-table).
    if (home.href !== '/dashboard') {
      router.replace(landingFor({
        kind: session.company?.kind ?? null,
        isConsultant: session.contextType === 'CONSULTANT',
        seated: Boolean(session.seat),
        worker: deskOf(session).worker,
        permissions: deskOf(session).permissions,
      }) as any)
      return
    }
    setSendingOn(false)
  }, [router, session])

  const [today, setToday] = useState<TodayData | null>(null)
  const [queue, setQueue] = useState<Queue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<{ key: string; text: string } | null>(null)

  const permissions = session.permissions
  const kind = session.company?.kind ?? null
  const words = { kind: session.company?.kind, company: session.company?.name }

  // Two reads, both on the server: the queue the Ask Etyme mark and the
  // greeting also read, and the firm's Today. Nothing else is asked.
  const fetchDashboard = useCallback(async () => {
    setError(null)
    try {
      const [q, t] = await Promise.all([
        fetch('/api/decisions').then(readJson),
        fetch('/api/today').then(readJson),
      ])
      setQueue({
        says: typeof q?.data?.says === 'string' ? q.data.says : 'Nothing needs you today.',
        welcome: typeof q?.data?.welcome === 'string' ? q.data.welcome : null,
        total: q?.data?.decisions?.length ?? 0,
        rows: (q?.data?.decisions ?? []) as QueueRowIn[],
      })
      setToday(t.data as TodayData)
    } catch (err: any) {
      setError(refusalSentence(err.message, words) || 'Today could not be read just now.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.company?.kind, session.company?.name])

  // Nothing is asked until we know this reader stays here: a client, a
  // consultant or a one-person firm is sent to its own console first.
  useEffect(() => {
    if (sendingOn) return
    fetchDashboard()
  }, [sendingOn, fetchDashboard])

  /** One POST through a route that already does the act, then read the page again. */
  async function act(key: string, url: string) {
    setBusy(key)
    setSaid(null)
    try {
      await readJson(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
      await fetchDashboard()
    } catch (err: any) {
      setSaid({ key, text: refusalSentence(err.message, words) || 'That did not go through. Nothing was changed.' })
    } finally {
      setBusy(null)
    }
  }

  // Held until we know whose dashboard this is, so a client never sees a
  // frame of the seller's before being sent to their own.
  if (sendingOn || loading) {
    return (
      <div className="animate-fade-in py-20 text-center text-etyme-muted">
        Reading today…
      </div>
    )
  }

  if (error || !today || !queue) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <p className="text-etyme-ink font-medium mb-2">Today could not be read</p>
        <p className="text-sm text-etyme-muted mb-4">{error}</p>
        <button onClick={() => { setLoading(true); fetchDashboard() }} className="btn-secondary">
          Try again
        </button>
      </div>
    )
  }

  const t = today
  const rolling = new Map((t.rollingOff ?? []).map((r) => [r.contractId, { ...r }]))
  const rows = queue.rows.map((r) => queueRowView(r, rolling, { terminate: hasPermission(permissions ?? [], 'assignments.terminate') }))
  // Send is the route's answer for this seat, read off /api/today, not the session's.
  const mayIssue = t.reads.send === true
  const ledger = mayOpen('/dashboard/twin', permissions)

  // A program office places nobody, so with no book of its own it reads
  // that it has no program yet (sign-up walk, round three, item 15).
  const hasBook =
    (t.whoIsWhere?.length ?? 0) > 0 || (t.signed?.count ?? 0) > 0 || (t.rollingOff?.length ?? 0) > 0 || (t.unpaid?.length ?? 0) > 0
  if (kind === 'MSP' && !hasBook) return <ProgramOfficeWithoutProgram t={t} queue={queue} rows={rows} officeName={session.company?.name ?? 'Your firm'} ledger={ledger} />

  return (
    <div className="animate-fade-in">
      {/* The headline: one sentence with the names in it. */}
      <div className="mb-8">
        <div className="eyebrow mb-2">Today · {formatDayLong(t.asOf, { weekday: true, year: false })}</div>
        <h1 className="headline-serif text-heading text-etyme-ink mb-2 max-w-3xl">{queue.says}</h1>
        {queue.welcome && queue.total === 0 && (
          <p className="text-body text-etyme-ink max-w-xl mb-1">{queue.welcome}</p>
        )}
        <p className="text-body text-etyme-muted max-w-2xl">{t.picture}</p>
      </div>

      {/* Four figures, each with the names under it. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Figure
          label="Billing this month"
          denied={t.billing ? null : NOT_YOURS_TODAY.billing}
          values={t.billing ? totalValues(t.billing.totals) : []}
          empty={t.billing && t.billing.people === 0 ? 'Nobody is on site today, so nothing is billing.' : null}
          lines={t.billing ? [
            `${t.billing.people} ${t.billing.people === 1 ? 'person' : 'people'} on site, at current rates`,
            namesLine(t.billing.names),
            ...t.billing.unpriced.slice(0, 2),
          ] : []}
          note={t.billing && t.billing.people > 0 ? t.billing.basis : null}
        />
        <Figure
          label="Signed, not yet billed"
          denied={t.signed ? null : NOT_YOURS_TODAY.bills}
          values={t.signed ? totalValues(t.signed.totals) : []}
          empty={t.signed && t.signed.count === 0 ? 'Every week a client signed is on a bill.' : null}
          lines={t.signed ? [
            `${t.signed.count} ${t.signed.count === 1 ? 'week' : 'weeks'}`,
            weeksByPerson(t.signed.byClient.flatMap((g) => g.people)),
            t.signed.onDrafts > 0 ? `${t.signed.onDrafts} on bills drafted, waiting for you` : '',
            ...t.signed.unpriced.slice(0, 2),
          ].filter(Boolean) : []}
        />
        <Figure
          label="Rolling off in 30 days"
          denied={t.rollingOff ? null : NOT_YOURS_TODAY.people}
          values={t.rollingOff ? [{ value: String(t.rollingOff.length), note: null }] : []}
          empty={t.rollingOff && t.rollingOff.length === 0 ? 'Nobody’s placement ends in the next 30 days.' : null}
          lines={(t.rollingOff ?? []).slice(0, 4).map((r) => lastDaySays(r, t.asOf))
            .concat((t.rollingOff?.length ?? 0) > 4 ? [`and ${(t.rollingOff?.length ?? 0) - 4} more`] : [])}
        />
        <Figure
          label="On the bench"
          denied={t.bench ? null : NOT_YOURS_TODAY.bench}
          values={t.bench ? [{ value: String(t.bench.length), note: null }] : []}
          empty={t.bench && t.bench.length === 0 ? 'Nobody on the bench yet.' : null}
          lines={(t.bench ?? []).slice(0, 4).map((b) => benchSays(b, t.asOf))
            .concat((t.bench?.length ?? 0) > 4 ? [`and ${(t.bench?.length ?? 0) - 4} more`] : [])}
        />
      </div>

      {/* Two columns from the large breakpoint up; one, stacked, on a phone. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Decide rows={rows} busy={busy} said={said} onAct={act} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <WhoIsWhere t={t} />
          <Bills t={t} mayIssue={mayIssue} busy={busy} said={said} onAct={act} />
        </div>
      </div>

      {ledger && (
        <p className="mt-8 text-[13px]">
          <Link href="/dashboard/twin" className="text-etyme-action hover:underline">
            Everything Etyme did, in the ledger
          </Link>
        </p>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────

/** "Yours to decide": the queue by name, a plain button where one route does the act, Look otherwise. */
function Decide({ rows, busy, said, onAct }: {
  rows: QueueRowView[]
  busy: string | null
  said: { key: string; text: string } | null
  onAct: (key: string, url: string) => void
}) {
  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="headline-serif text-[18px] text-etyme-ink">Yours to decide</h2>
        <Link href="/dashboard/decisions" className="text-[12px] text-etyme-action hover:underline">See all</Link>
      </div>
      {rows.length === 0 && (
        <p className="py-6 text-center text-[13px] text-etyme-muted">Nothing is waiting on you.</p>
      )}
      <div>
        {rows.slice(0, 8).map((r) => (
          <div key={r.key} className="py-3 border-b border-etyme-rule last:border-b-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-etyme-ink">{r.who}</div>
                <div className="text-[12px] text-etyme-muted mt-0.5">{r.says}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.act ? (
                  <>
                    <button className="btn-primary" disabled={busy === r.key} onClick={() => onAct(r.key, r.act!.url)}>
                      {busy === r.key ? r.act.busy : r.act.label}
                    </button>
                    <Link href={r.href as any} className="btn-secondary">Look</Link>
                  </>
                ) : (
                  <Link href={r.href as any} className="btn-secondary">Look</Link>
                )}
              </div>
            </div>
            {said?.key === r.key && <p className="mt-2 text-[12px] text-etyme-ink">{said.text}</p>}
          </div>
        ))}
      </div>
      {rows.length > 8 && (
        <p className="mt-3 text-[12px] text-etyme-muted">
          And {rows.length - 8} more. <Link href="/dashboard/decisions" className="text-etyme-action hover:underline">See all</Link>
        </p>
      )}
    </div>
  )
}

/** "Who is where": the firm's people by client, the monthly figure beside each, and Our bench last. */
function WhoIsWhere({ t }: { t: TodayData }) {
  return (
    <div className="panel">
      <h2 className="headline-serif text-[18px] text-etyme-ink mb-4">Who is where</h2>
      {!t.whoIsWhere && <p className="text-[12px] text-etyme-muted">{NOT_YOURS_TODAY.people}</p>}
      {t.whoIsWhere && t.whoIsWhere.length === 0 && (
        <p className="text-[12px] text-etyme-muted">Nobody is on a client’s site today.</p>
      )}
      <div className="space-y-3">
        {(t.whoIsWhere ?? []).map((g) => (
          <div key={g.client} className="border-b border-etyme-rule pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[13px] font-medium text-etyme-ink">{g.client}</div>
              {clientFigure(g.totals) && (
                <div className="text-[12px] text-etyme-ink tabular-nums shrink-0">{clientFigure(g.totals)}</div>
              )}
            </div>
            <div className="text-[12px] text-etyme-muted mt-0.5">{g.people.map((p) => p.name).join(', ')}</div>
          </div>
        ))}
        {t.bench && (
          <div className="pt-1">
            <div className="text-[13px] font-medium text-etyme-ink">Our bench</div>
            <div className="text-[12px] text-etyme-muted mt-0.5">
              {t.bench.length === 0 ? 'Nobody on the bench yet.' : t.bench.map((b) => benchSays(b, t.asOf)).join(' · ')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** "Bills": the weeks signed and not yet billed by client, Send where a draft holds them, then what was sent and is unpaid. */
function Bills({ t, mayIssue, busy, said, onAct }: {
  t: TodayData
  mayIssue: boolean
  busy: string | null
  said: { key: string; text: string } | null
  onAct: (key: string, url: string) => void
}) {
  const unpaid = t.unpaid ?? []
  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="headline-serif text-[18px] text-etyme-ink">Bills</h2>
        {t.signed && (
          <Link href="/dashboard/invoices" className="text-[12px] text-etyme-action hover:underline">Open bills</Link>
        )}
      </div>
      {!t.signed && <p className="text-[12px] text-etyme-muted">{NOT_YOURS_TODAY.bills}</p>}
      {t.signed && (
        <>
          <div className="stat-label mb-2">Signed, not yet billed</div>
          {t.signed.byClient.length === 0 && (
            <p className="text-[12px] text-etyme-muted mb-3">Every week a client signed is on a bill.</p>
          )}
          <div className="space-y-3 mb-5">
            {t.signed.byClient.map((g) => (
              <div key={g.client} className="border-b border-etyme-rule pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[13px] font-medium text-etyme-ink">{g.client}</div>
                  <div className="text-[12px] text-etyme-ink tabular-nums shrink-0">
                    {totalValues(g.totals).map((v) => v.value).join(' · ')}
                  </div>
                </div>
                <div className="text-[12px] text-etyme-muted mt-0.5">{weeksByPerson(g.people)}</div>
                {g.drafts.map((d) => {
                  const key = `send-${d.invoiceId}`
                  return (
                    <div key={d.invoiceId} className="mt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-etyme-muted">Bill {d.number} is drafted.</span>
                        {mayIssue ? (
                          <button className="btn-primary" disabled={busy === key} onClick={() => onAct(key, `/api/invoices/${d.invoiceId}/submit`)}>
                            {busy === key ? 'Sending…' : 'Send'}
                          </button>
                        ) : (
                          <Link href="/dashboard/invoices" className="btn-secondary">Look</Link>
                        )}
                      </div>
                      {said?.key === key && <p className="mt-1 text-[12px] text-etyme-ink">{said.text}</p>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="stat-label mb-2">Sent, not yet paid</div>
          {unpaid.length === 0 && <p className="text-[12px] text-etyme-muted">Every bill sent has been paid.</p>}
          <div className="space-y-2">
            {unpaid.slice(0, UNPAID_SHOWN).map((b) => (
              <div key={b.invoiceId} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] text-etyme-ink">{b.client}</div>
                  <div className="text-[12px] text-etyme-muted">
                    Bill {b.number} · {b.daysOverdue > 0
                      ? `was due ${formatDay(b.dueOn)}, ${b.daysOverdue} ${b.daysOverdue === 1 ? 'day' : 'days'} late`
                      : `due ${formatDay(b.dueOn)}`}
                  </div>
                </div>
                <div className="text-[12px] text-etyme-ink tabular-nums shrink-0">{amount(b.outstandingMinor, b.currency)}</div>
              </div>
            ))}
          </div>
          {unpaid.length > UNPAID_SHOWN && (
            <p className="mt-3 text-[12px] text-etyme-muted">
              And {unpaid.length - UNPAID_SHOWN} more.{' '}
              <Link href="/dashboard/ar" className="text-etyme-action hover:underline">Open accounts receivable</Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** One of the four figures: the label, the value, and the names under it. */
function Figure({ label, values, lines, note = null, empty = null, denied = null }: {
  label: string
  values: { value: string; note: string | null }[]
  lines: string[]
  note?: string | null
  /** Where there is nothing to count, the sentence that says so in place of a zero. */
  empty?: string | null
  /** Where the part is not this seat's to read, the sentence that says so. */
  denied?: string | null
}) {
  return (
    <div className="panel">
      <div className="stat-label mb-2">{label}</div>
      {denied ? (
        <p className="text-[12px] text-etyme-muted">{denied}</p>
      ) : empty ? (
        <p className="text-[13px] text-etyme-muted">{empty}</p>
      ) : (
        <>
          {values.map((v, i) => (
            <div key={i}>
              <div className="stat-value text-etyme-ink tabular-nums">{v.value}</div>
              {v.note && <p className="text-[11px] text-etyme-muted mt-1">{v.note}</p>}
            </div>
          ))}
          <div className="mt-1 space-y-0.5">
            {lines.filter(Boolean).map((l, i) => (
              <p key={i} className="text-[12px] text-etyme-muted">{l}</p>
            ))}
          </div>
          {note && <p className="text-[11px] text-etyme-faint mt-2">{note}</p>}
        </>
      )}
    </div>
  )
}

/**
 * A program office's Today before any client has granted it a seat.
 *
 * Its work is the programs it runs, every one read through a seat a
 * client granted, so with no seat and no book of its own there is
 * nothing to count, and the page says that in sentences rather than
 * drawing zeros. Nothing here is money.
 */
function ProgramOfficeWithoutProgram({ t, queue, rows, officeName, ledger }: {
  t: TodayData
  queue: Queue
  rows: QueueRowView[]
  officeName: string
  ledger: boolean
}) {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <div className="eyebrow mb-2">Today · {formatDayLong(t.asOf, { weekday: true, year: false })}</div>
        <h1 className="headline-serif text-heading text-etyme-ink mb-2">{queue.says}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="panel">
            <h2 className="headline-serif text-[18px] text-etyme-ink mb-3">No program yet</h2>
            <ul className="space-y-2 text-[13px] text-etyme-ink">
              <li>{officeName} does not run a client&rsquo;s program yet.</li>
              <li>A client grants you a seat in its program. You then act under its rules, and every read is logged.</li>
              <li>Ask an owner or the program manager at the client to grant {officeName} a seat.</li>
              <li className="text-etyme-muted">Once they do, this page opens on their program: the people on site, the suppliers, the hours waiting and the decisions.</li>
            </ul>
          </div>
        </div>
        <div className="lg:col-span-2">
          {rows.length > 0 && (
            <div className="panel">
              <h2 className="headline-serif text-[18px] text-etyme-ink mb-4">Yours to decide</h2>
              {rows.map((r) => (
                <Link key={r.key} href={r.href as any} className="block py-3 border-b border-etyme-rule last:border-b-0">
                  <div className="text-[13px] font-medium text-etyme-ink">{r.who}</div>
                  <div className="text-[12px] text-etyme-muted mt-0.5">{r.says}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {ledger && (
        <p className="mt-8 text-[13px]">
          <Link href="/dashboard/twin" className="text-etyme-action hover:underline">
            Everything Etyme did, in the ledger
          </Link>
        </p>
      )}
    </div>
  )
}
