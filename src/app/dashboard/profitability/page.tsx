'use client'

import { readJson } from '@/lib/read-response'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import { refusalOf, refusedRead } from '@/lib/money/refused-read'
import { Chip, EmptyState, ErrorState, FilterChips, Lbl, LoadingState, PageHead, RefusedState, Stat, type ChipTone } from '@/components/ui'

import { useEffect, useState, useCallback } from 'react'

/**
 * What placements actually made.
 *
 * Not (bill rate − pay rate) × hours. The client approved forty and the
 * employer accepted thirty-eight, and the margin is neither rate times
 * one of those numbers. Every figure here comes from the work ledger.
 *
 * Three views because they tell three different stories, and the second
 * two contradict the first often enough to be worth the tabs: a
 * placement can look fine while the consultant loses money over a year
 * on bench time, and a client can look profitable while owing more than
 * they have ever paid.
 *
 * ── Two figures, two labels ──────────────────────────────────────────
 *
 * **Agreed** is the rate spread — bill rate less the pay rate of the buy
 * line that funds the placement, per hour, with no hours in it. It exists
 * the moment a placement is awarded.
 *
 * **Earned** is what the work actually made — the hours the client
 * approved against the hours the employer accepted, burden, commission,
 * expenses, and on the candidate view the bench. It exists once hours are
 * signed.
 *
 * They are different numbers and both belong here. Until 2026-09-26 only
 * the second was on this page and it was grouped by master contract, so a
 * firm that had not tagged anything read an empty page while Reports
 * computed a margin from the same placements two clicks away. Neither
 * figure is ever printed under the other's name.
 */

type By = 'order' | 'contract' | 'candidate' | 'customer'
type Scope = 'all' | 'live'

const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${Math.abs(Math.round(c / 100)).toLocaleString('en-US')}`

const TONE: Record<string, ChipTone> = {
  LOSS: 'attention',
  THIN: 'passive',
  FINE: 'verified',
  // Not a grade. A placement with no buy contract behind it has no
  // margin to grade, and saying "no cost on record" is the point.
  UNKNOWN: 'passive',
  // Also not a grade. A placement with no hours in the ledger was chipped
  // THIN until 2026-09-26 — a firm told its placements were marginal on
  // the strength of no data at all.
  NOTHING_YET: 'passive',
  NO_RATE: 'passive',
}

/** "1 placement" and "2 placements". A count nobody can read is a count nobody checks. */
const plural = (n: number, one: string, many?: string) =>
  `${n} ${n === 1 ? one : many ?? `${one}s`}`

const CHIP_SAYS: Record<string, string> = {
  UNKNOWN: 'no cost on record',
  NOTHING_YET: 'nothing billed yet',
  NO_RATE: 'no rate',
}

// A posted result and a contract-derived one name their margin
// differently. Reading both here rather than in five places stops a
// blank appearing on the screen because the wrong field was asked for.
const marginOf = (r: any) => (r?.grossCents ?? r?.marginCents ?? 0) as number
const pctOf = (r: any) => (r?.grossPct ?? r?.marginPct ?? null) as number | null

export default function ProfitabilityPage() {
  const [by, setBy] = useState<By>('order')
  // Everything to date by default. Profitability is a historical question
  // and a live-only default hides a placement that ran ten months and lost
  // money, which is the one it is most important to see.
  const [scope, setScope] = useState<Scope>('all')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** What the route said when it refused the read; null where it did not. */
  const [refusedSaid, setRefusedSaid] = useState<string | null>(null)
  const { company, loading: sessionLoading } = useSession()
  // The section this page sits under on the reader's own menu, and
  // nothing while that is not known yet — never a word typed by hand.
  const eyebrow = usePageSection('/dashboard/profitability')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/profitability?by=${by}&scope=${scope}`)
      // A refusal is not an empty book (sign-up walk, round four, #5).
      if (res.status === 403) {
        setRefusedSaid(refusalOf(res.status, await res.json().catch(() => null)))
        setData(null)
        return
      }
      setRefusedSaid(null)
      const body = await readJson(res)
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [by, scope])

  useEffect(() => { load() }, [load])

  // Money pages wait (sign-up walk, round three, #17): until the session
  // says whose company this is, no figure and no refusal naming a desk.
  if (!company) {
    return sessionLoading ? <LoadingState /> : <RefusedState says="These are a company’s books, and you are not signed in at a company." />
  }
  // Refused: the sentence and nothing else — no tab, no figure.
  const refused = refusedRead(refusedSaid, { what: 'Profitability', kind: company.kind, company: company.name })
  if (refused) {
    return <RefusedState says={refused} />
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={eyebrow}
        title="Profitability"
        subtitle={<>
          From what was actually approved and accepted, not from a rate card.
          Employer burden, commission and expenses are counted — and on the
          candidate view, so is the bench.
        </>}
      />

      <FilterChips<By>
        label="Profitability by"
        options={(['order', 'contract', 'candidate', 'customer'] as By[]).map((t) => ({ key: t, label: `By ${t}` }))}
        value={by}
        onChange={setBy}
        end={
          /* Whether finished work is in the figure is a real decision and
             never a silent default, so it sits beside the tabs and the
             sentence under the numbers repeats the answer. */
          <FilterChips<Scope>
            label="Which work"
            options={[{ key: 'all', label: 'To date' }, { key: 'live', label: 'Running now' }]}
            value={scope}
            onChange={setScope}
          />
        }
      />

      {loading && <LoadingState says="Adding up what placements made…" />}

      {error && <ErrorState says={error} />}

      {/* ── What the two sides agreed ─────────────────────────────
          The rate spread, which exists from the day a placement is
          awarded. On its own line, labeled, above the earned figures —
          because a firm with nothing in the hours ledger yet still has a
          margin on its placements, and reading only "nothing billed" is
          how this page said nothing while Reports said 10.1%. */}
      {data?.agreed && (
        <div className="panel">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Agreed spread"
              value={data.agreed.pct == null ? null : `${data.agreed.pct}%`}
              sub="on the rates, not the hours"
            />
            {data.agreed.billRateCents != null && (
              <Stat
                label="Bill rate, blended"
                value={<>{money(data.agreed.billRateCents)}<span className="text-[13px] text-etyme-faint">/hr</span></>}
                sub={<>
                  {data.agreed.placements} placement{data.agreed.placements === 1 ? '' : 's'}
                  {data.agreed.currency ? ` · ${data.agreed.currency}` : ''}
                </>}
              />
            )}
            {data.agreed.payRateCents != null && (
              <Stat
                label="Pay rate, blended"
                value={<>{money(data.agreed.payRateCents)}<span className="text-[13px] text-etyme-faint">/hr</span></>}
              />
            )}
          </div>
          <p className="mt-2 text-[13px] text-etyme-ink">{data.agreed.says}</p>
          {/* Where there is no figure, the reason — never a bare dash. */}
          {data.agreed.refusedBecause && (
            <p className="mt-1 text-[13px] text-etyme-attention">{data.agreed.refusedBecause}</p>
          )}
          {data.unlinked > 0 && (
            <p className="mt-1 text-[13px] text-etyme-attention">
              {data.unlinked} placement{data.unlinked === 1 ? '' : 's'} with no buy line behind
              {data.unlinked === 1 ? ' it' : ' them'}. Until one is linked there is no margin on
              {data.unlinked === 1 ? ' it' : ' them'}, not a perfect one.
            </p>
          )}
          {data.multiLinked?.length > 0 && (
            <p className="mt-1 text-[13px] text-etyme-muted">
              {data.multiLinked.length} placement{data.multiLinked.length === 1 ? '' : 's'} bought
              from more than one supplier over its life. The rate shown is the one paying today.
            </p>
          )}
        </div>
      )}

      {data?.overall && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* The heading is the route's one word (REVENUE_HEADING in
                lib/money/margin): whether it is renamed is the founder's
                call, and the three figures under it stand either way. */}
            <Stat
              label={data.labels?.revenue ?? 'Billed'}
              value={money(data.overall.revenueCents)}
              sub={<>
                hours signed on both sides
                {data.billing && (
                  <ul className="mt-1 space-y-0.5 text-[11px] tabular-nums text-etyme-muted">
                    <li>{money(data.billing.acceptedNotBilledCents)} accepted, not yet billed</li>
                    <li>{money(data.billing.billedCents)} billed</li>
                    <li>{money(data.billing.collectedCents)} collected</li>
                  </ul>
                )}
              </>}
            />
            <Stat
              label="Earned margin"
              value={money(marginOf(data.overall))}
              tone={marginOf(data.overall) < 0 ? 'attention' : 'verified'}
            />
            <Stat
              label="Rate"
              value={pctOf(data.overall) == null ? null : `${pctOf(data.overall)}%`}
            />

            {/* Earned and settled are two different numbers and they
                disagree for months at a time. One says whether the work is
                worth doing, the other whether the bank account agrees yet.
                The old sheet carried this by hand in a "diff" column. */}
            {data.overall.cashCents != null && (
              <Stat
                label="In the bank"
                value={money(data.overall.cashCents)}
                tone={data.overall.cashCents < 0 ? 'attention' : 'default'}
              />
            )}
          </div>
          {(data.unpriced > 0 || data.breaches > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {/* A placement nobody can price is a different problem from
                  one priced too thin, so it is counted separately. */}
              {data.unpriced > 0 && (
                <Chip tone="passive">{data.unpriced} with no buy contract</Chip>
              )}
              {data.breaches > 0 && (
                <Chip tone="attention">{data.breaches} below the agreed floor</Chip>
              )}
            </div>
          )}
        </div>
      )}

      {data?.overall?.cashSays && (
        <p className="text-[13px] text-etyme-muted">{data.overall.cashSays}</p>
      )}

      {data?.note && <p className="text-[13px] text-etyme-muted">{data.note}</p>}

      {/* ── The order, before anything has posted ──────────────────
          The pair — a sell line and the buy line that funds it — read
          under its master contract where the company tagged it to one,
          and as the placement it is where nobody did. Tagging is the
          company's choice and a firm that has tagged nothing has
          placements, not an empty page. */}
      {data?.by === 'order' && data.source === 'PAIRS' &&
        data.rows.map((r: any) => (
          <article key={r.masterContractId ?? r.name} className="panel">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-etyme-ink">{r.name}</p>
                {r.code ? (
                  <p className="font-mono text-[11px] text-etyme-faint">{r.code}</p>
                ) : (
                  <p className="text-[11px] text-etyme-faint">
                    {r.placements.length} placement{r.placements.length === 1 ? '' : 's'} · not on a
                    master contract, which is nobody's problem
                  </p>
                )}
              </div>
              <span className="tabular-nums text-[13px] text-etyme-muted">
                {r.agreed.pct == null ? '—' : `${r.agreed.pct}%`}
              </span>
            </div>

            <p className="mt-2 text-[13px] text-etyme-ink">{r.agreed.says}</p>
            {r.agreed.refusedBecause && (
              <p className="mt-1 text-[13px] text-etyme-attention">{r.agreed.refusedBecause}</p>
            )}

            <div className="mt-3 border-t border-etyme-rule pt-3">
              <Lbl>Who is on it</Lbl>
              <ul className="mt-1 space-y-2">
                {r.placements.map((pl: any) => (
                  <li key={pl.sellContractId} className="text-[13px]">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-etyme-ink">
                        {pl.person.name}
                        <span className="text-etyme-faint">
                          {' · '}
                          {pl.client.name}
                          {pl.vendorName ? ` · via ${pl.vendorName}` : pl.contractType ? ` · ${pl.contractType}` : ''}
                          {pl.live ? '' : ' · finished'}
                        </span>
                      </span>
                      <span className="tabular-nums text-etyme-muted">
                        {pl.agreed.pct == null ? '—' : `${pl.agreed.pct}%`}
                      </span>
                    </div>
                    {/* A placement with no buy line says so on its own row
                        rather than being dropped from the list. */}
                    <p
                      className={`mt-0.5 text-[11px] ${
                        pl.agreed.refusedBecause ? 'text-etyme-attention' : 'text-etyme-faint'
                      }`}
                    >
                      {pl.agreed.says}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}

      {/* ── The order ──────────────────────────────────────────────
          Everything that happened on one piece of work, from the
          postings themselves. Contracts on either side no longer have
          to pair up for this to add. */}
      {data?.by === 'order' && data.source === 'POSTINGS' &&
        data.rows.map((r: any) => (
          <article key={r.orderId} className="panel">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-etyme-ink">{r.name}</p>
                <p className="font-mono text-[11px] text-etyme-faint">{r.code}</p>
              </div>
              {r.standing?.overBudget && (
                <Chip tone="attention">over budget</Chip>
              )}
            </div>

            <p className="mt-2 text-[13px] text-etyme-ink">{r.result.says}</p>
            <p className="mt-1 text-[13px] text-etyme-muted">{r.result.cashSays}</p>
            {r.standing?.budgetCents != null && (
              <p className="mt-1 text-[13px] text-etyme-muted">{r.standing.says}</p>
            )}
            {r.allocatedOverhead && r.allocatedOverhead.amountCents !== 0 && (
              <p className="mt-1 text-[13px] text-etyme-muted">{r.allocatedOverhead.says}</p>
            )}

            {/* The two questions the spreadsheet could not answer, on
                the same postings, without reshaping anything. */}
            {r.people.length > 0 && (
              <div className="mt-3 border-t border-etyme-rule pt-3">
                <Lbl>Who is on it</Lbl>
                <ul className="mt-1 space-y-1">
                  {r.people.map((p: any) => (
                    <li key={p.key} className="flex justify-between gap-4 text-[13px]">
                      <span className="text-etyme-ink">{p.label}</span>
                      <span className="tabular-nums text-etyme-muted">
                        {money(p.revenueCents)} billed · {money(p.grossCents)}
                        {p.grossPct == null ? '' : ` · ${p.grossPct}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CloseOrder row={r} onDone={load} />

            {r.months.length > 0 && (
              <div className="mt-3 overflow-x-auto border-t border-etyme-rule pt-3">
                <Lbl>By month</Lbl>
                <table className="mt-1 w-full text-[12px]">
                  <tbody>
                    {r.months.map((m: any) => (
                      <tr key={m.key}>
                        <td className="py-0.5 pr-4 text-etyme-muted">{m.label}</td>
                        <td className="py-0.5 pr-4 text-right tabular-nums text-etyme-ink">
                          {money(m.revenueCents)}
                        </td>
                        <td
                          className="py-0.5 text-right tabular-nums"
                          style={{ color: m.grossCents < 0 ? 'var(--color-attention)' : 'var(--color-muted)' }}
                        >
                          {money(m.grossCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ))}

      {/* A slice of the same postings, by person or by customer. */}
      {data?.source === 'POSTINGS' && data.by !== 'order' &&
        data.rows.map((r: any) => (
          <article key={r.key} className="panel">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[15px] font-semibold text-etyme-ink">{r.label}</p>
              <p className="tabular-nums text-[13px] text-etyme-muted">
                {r.grossPct == null ? '—' : `${r.grossPct}%`}
              </p>
            </div>
            <p className="mt-2 text-[13px] text-etyme-ink">{r.says}</p>
          </article>
        ))}

      {/* ── One row, three shapes ──────────────────────────────────
          Every branch below asks `data.by` and never the local `by`.
          They are not the same thing for one render: clicking a tab sets
          `by` at once and the rows arrive a moment later, so for that
          moment the screen holds candidate rows and a flag saying
          customer. Reading `by` there took `r.client.name` off a row that
          has no client and threw — a click from By candidate to By
          customer put "Something broke" on the page every time. The route
          returns `by` in its own payload precisely so the screen can tell
          which rows it is holding, and now it asks. */}
      {data?.source !== 'POSTINGS' && data?.source !== 'PAIRS' && data?.rows?.map((r: any, i: number) => (
        <article key={i} className="panel">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-etyme-ink">
                {data.by === 'customer' ? r.client?.name : r.person?.name}
              </p>
              <p className="text-[12px] text-etyme-faint">
                {data.by === 'contract' && `${r.client?.name} · ${r.contractType}${r.vendorName ? ` · via ${r.vendorName}` : ''}${r.live ? '' : ' · finished'}`}
                {data.by === 'candidate' && `${plural(r.contracts, 'assignment')} · ${plural(r.idleDays, 'idle day')}`}
                {data.by === 'customer' && `${plural(r.contracts, 'placement')} · ${plural(r.people, 'person', 'people')}`}
              </p>
            </div>
            {r.health && (
              <Chip tone={TONE[r.health]}>
                {CHIP_SAYS[r.health] ?? r.health.toLowerCase()}
              </Chip>
            )}
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">
            {data.by === 'candidate' ? r.netSays : (r.profit?.says ?? r.says)}
          </p>

          {/* The bench, and the case where every assignment made money and
              the year did not. */}
          {data.by === 'candidate' && r.profitableOnPaperOnly && (
            <p className="mt-1 text-[13px] text-etyme-attention">
              Profitable on paper only.
            </p>
          )}

          {data.by === 'customer' && (
            <p
              className={`mt-1 text-[13px] ${r.marginOnPaperOnly ? 'text-etyme-attention' : 'text-etyme-muted'}`}
            >
              {r.cashSays}
            </p>
          )}

          {/* The rate the two sides agreed, on the row. A placement with
              nothing in the hours ledger has no earned margin and does have
              a margin, and "Nothing billed yet." on its own reads as though
              the placement were not happening. */}
          {data.by === 'contract' && r.agreed && (
            <p
              className={`mt-1 text-[13px] ${
                r.agreed.refusedBecause ? 'text-etyme-attention' : 'text-etyme-muted'
              }`}
            >
              {r.agreed.says}
            </p>
          )}

          {r.floorBreach && (
            <p className="mt-1 text-[13px] text-etyme-attention">{r.floorBreach}</p>
          )}

          {/* Never presented as measured when it is assumed. */}
          {(r.profit?.assumptions ?? r.assumptions ?? []).length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-etyme-rule pt-3">
              {(r.profit?.assumptions ?? r.assumptions).map((a: string, j: number) => (
                <li key={j} className="text-[11px] text-etyme-faint">{a}</li>
              ))}
            </ul>
          )}
        </article>
      ))}

      {!loading && data && data.rows?.length === 0 && (
        /* "Nothing to add up yet" on a firm with two linked placements
           and an 18.3% margin was the screen lying about itself. The
           empty state now only speaks when the book is genuinely
           empty, and says which question came back empty. */
        <EmptyState says={
            data.agreed?.placements > 0
              ? `Nothing has been billed on ${
                  data.agreed.placements === 1 ? 'this placement' : 'these placements'
                } yet, so there is no earned margin to add up. What was agreed is above.`
              : scope === 'live'
                ? 'Nothing is running right now. Ask for everything to date to see what has finished.'
                : 'No placements on the record yet. One appears when a candidate is awarded.'
        } />
      )}
    </div>
  )
}

// ── Settlement and close ─────────────────────────────────────────────
//
// An order is a temporary pot. It opens when work starts, it accumulates,
// and at the end its balance has to go somewhere — because a project that
// has finished should not still be carrying a result nobody owns.
//
// Three states and they are not decoration. OPEN takes everything.
// LOCKED takes corrections and no new work, which is the state a finance
// team actually operates in for the fortnight after a month end and which
// most systems make people fake by leaving the period open. SETTLED takes
// nothing at all, because its balance has left the building.
//
// The settlement itself is always a PAIR of postings — the amount out of
// the order and the same amount into where it went. Writing only the
// first makes money disappear from the group's books.

function CloseOrder({ row, onDone }: { row: any; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const status: string = row.status ?? 'OPEN'
  const settled = status === 'SETTLED' || status === 'CLOSED'

  async function call(body: Record<string, unknown>) {
    setBusy(true)
    setFailed(null)
    try {
      const res = await fetch('/api/profitability/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectOrderId: row.orderId, ...body }),
      })
      const b = await readJson(res)
      return b.data
    } catch (e: any) {
      setFailed(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 border-t border-etyme-rule pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={settled ? 'verified' : status === 'LOCKED' ? 'attention' : 'passive'}>
          {status.toLowerCase()}
        </Chip>
        {row.settlesTo ? (
          <span className="text-[11px] text-etyme-faint">
            settles to {row.settlesTo.code} · {row.settlesTo.name}
          </span>
        ) : (
          <span className="text-[11px] text-etyme-attention">
            no cost center — this order cannot be settled until one is set
          </span>
        )}

        {!settled && (
          <>
            <button
              className="text-[11px] underline"
              style={{ color: 'var(--color-action)' }}
              disabled={busy}
              onClick={async () => {
                const d = await call({ action: status === 'LOCKED' ? 'unlock' : 'lock' })
                if (d) {
                  setSaid(d.note)
                  onDone()
                }
              }}
            >
              {status === 'LOCKED' ? 'Reopen the month' : 'Lock the month'}
            </button>

            {row.settlesTo && (
              <button
                className="text-[11px] underline"
                style={{ color: 'var(--color-action)' }}
                disabled={busy}
                onClick={async () => {
                  const d = await call({ action: 'settle', dryRun: true })
                  if (d) setPreview(d)
                }}
              >
                Show what settling would do
              </button>
            )}
          </>
        )}

        {settled && row.settledAt && (
          <span className="text-[11px] text-etyme-faint tabular-nums">
            settled {String(row.settledAt).slice(0, 10)}
          </span>
        )}
      </div>

      {preview && (
        <div className="panel mt-3">
          <Lbl>Two postings, equal and opposite</Lbl>
          <p className="mt-2 text-[13px] text-etyme-ink">{preview.note}</p>
          <ul className="mt-2 space-y-1">
            {preview.postings.map((p: any) => (
              <li key={p.leg} className="flex justify-between gap-4 text-[13px]">
                <span className="text-etyme-muted">{p.says}</span>
                <span className="tabular-nums text-etyme-ink">{money(p.amountCents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-etyme-rule pt-3">
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                const d = await call({ action: 'settle' })
                if (d) {
                  setSaid(d.note)
                  setPreview(null)
                  onDone()
                }
              }}
            >
              Settle it
            </button>
            <button
              className="text-[11px] underline text-etyme-muted"
              onClick={() => setPreview(null)}
            >
              Not yet
            </button>
            <span className="text-[11px] text-etyme-faint">
              Nothing posts here afterwards. A correction goes to an open order rather
              than changing a period that has already been reported.
            </span>
          </div>
        </div>
      )}

      {said && <p className="mt-2 text-[11px] text-etyme-muted">{said}</p>}
      {failed && <p className="mt-2 text-[11px] text-etyme-attention">{failed}</p>}
    </div>
  )
}
