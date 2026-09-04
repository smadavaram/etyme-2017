'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * What your suppliers are like to work with, and what they cost you if
 * they stop.
 *
 * Three sections, in the order a person should read them:
 *
 *   **Standing** — whose certificates have lapsed, who pays late, and who
 *   nobody has ever looked at. It warns and never blocks; the legal bar
 *   on lapsed cover lives in governance.
 *
 *   **The shape of the book** — one client, one supplier, one person. None
 *   of the three is a loss and none appears on a margin report, and
 *   together they decide whether a bad quarter is survivable.
 *
 *   **Scored** — the one thing no supplier could build about themselves
 *   and no client could get by asking, because every submission from every
 *   vendor passes through the same place. No overall grade: a single
 *   letter would be argued with by everybody who got a B and would hide
 *   which of the six is the problem.
 *
 * A decision surface throughout — prose, reasoning, and a blank wherever
 * the data cannot carry a number.
 */

interface Figure {
  value: number | null
  of: number
  says: string
}

interface Signal {
  code: string
  severity: 'NOTE' | 'WARN'
  says: string
}

interface Behaviour {
  settled: number
  open: number
  meanLateDays: number | null
  openOverdue: number
  openOverdueMaxDays: number | null
  says: string
}

interface RiskRow {
  counterpartyId: string
  name: string
  relationship: string
  status: string
  verdict: 'AT_RISK' | 'WATCH' | 'NOTHING_ON_RECORD' | 'CLEAR'
  signals: Signal[]
  insurance: { state: string; says: string }
  theyPayUs: Behaviour
  wePayThem: Behaviour
  ownerSays: string
  reviewBy: string
  cadenceDays: number
  reviewOverdueDays: number | null
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  unknowns: string[]
  says: string
}

interface Watchlist {
  rows: RiskRow[]
  atRisk: number
  watch: number
  nothingOnRecord: number
  clear: number
  reviewsOverdue: number
  says: string
}

interface Breach {
  severity: 'NOTE' | 'WARN'
  atOrAbovePct: number
  meaning: string
  ownerRole: string
  ownerName: string | null
  says: string
}

interface Part {
  dimension: 'CLIENT' | 'SUPPLIER' | 'PERSON'
  unit: 'MONEY' | 'PEOPLE'
  topSharePct: number | null
  topName: string | null
  topThreeSharePct: number | null
  counted: number
  breach: Breach | null
  says: string
  unknowns: string[]
}

interface Report {
  parts: Part[]
  worst: Part | null
  warnings: number
  notes: number
  silent: number
  says: string
}

const VERDICT_CHIP: Record<RiskRow['verdict'], { label: string; cls: string }> = {
  AT_RISK: { label: 'At risk', cls: 'chip chip--attention' },
  WATCH: { label: 'Watch', cls: 'chip chip--action' },
  NOTHING_ON_RECORD: { label: 'Nobody has looked', cls: 'chip chip--passive' },
  CLEAR: { label: 'Nothing outstanding', cls: 'chip chip--verified' },
}

const DIMENSION_WORD: Record<Part['dimension'], string> = {
  CLIENT: 'One client',
  SUPPLIER: 'One supplier',
  PERSON: 'One person',
}

interface Card {
  vendorName: string
  rank: number | null
  sent: number
  received: number
  answered: Figure
  firstReplyHours: Figure
  worthReading: Figure
  hired: Figure
  holdsThemUp: { code: string; count: number; says: string } | null
  asks: Figure
  enough: boolean
  summary: string
  unknowns: string[]
}

function Fig({ label, f, suffix = '%' }: { label: string; f: Figure; suffix?: string }) {
  return (
    <div>
      <p className="stat-label">{label}</p>
      <p className="stat-value tabular-nums">
        {f.value == null ? (
          <span className="text-etyme-faint">—</span>
        ) : (
          <>
            {f.value}
            <span className="text-[15px] text-etyme-faint">{suffix}</span>
          </>
        )}
      </p>
    </div>
  )
}

export default function ScorecardsPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState('')
  const [orderedBy, setOrderedBy] = useState('')
  const [windowDays, setWindowDays] = useState(365)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [list, setList] = useState<Watchlist | null>(null)
  const [riskNote, setRiskNote] = useState<string | null>(null)
  const [riskError, setRiskError] = useState<string | null>(null)
  const [openRisk, setOpenRisk] = useState<string | null>(null)

  const [report, setReport] = useState<Report | null>(null)
  const [shapeGaps, setShapeGaps] = useState<string[]>([])
  const [shapeError, setShapeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendors/scorecards')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setCards(body.data.suppliers)
      setSummary(body.data.summary)
      setOrderedBy(body.data.orderedBy)
      setWindowDays(body.data.windowDays)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Three endpoints, three independent failures. A denied permission on
  // one section must not blank the other two — the commonest way a screen
  // like this becomes useless is one 403 taking the page with it.
  const loadRisk = useCallback(async () => {
    try {
      const res = await fetch('/api/vendors/risk')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setList(body.data.watchlist)
      setRiskNote(body.data.note ?? null)
      setRiskError(null)
    } catch (err: any) {
      setRiskError(err.message)
    }
  }, [])

  const loadShape = useCallback(async () => {
    try {
      const res = await fetch('/api/vendors/concentration')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setReport(body.data.report)
      setShapeGaps(body.data.gaps ?? [])
      setShapeError(null)
    } catch (err: any) {
      setShapeError(err.message)
    }
  }, [])

  useEffect(() => { load(); loadRisk(); loadShape() }, [load, loadRisk, loadShape])

  return (
    <div className="mx-auto max-w-[860px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Governance</p>
        <h1 className="headline-serif text-[30px] leading-tight">
          Suppliers, and what they cost you if they stop
        </h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          Built from what actually happened here — not from who emails you
          most. None of your suppliers can work these out about themselves:
          they cannot see what the other eleven did with the same role.
        </p>
      </header>

      {/* ── Standing ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <p className="eyebrow">Standing</p>
          <h2 className="headline-serif text-[20px] leading-tight">Who is worth a look this month</h2>
          <p className="mt-1 max-w-[58ch] text-[12px] text-etyme-muted">
            Certificates, payment behaviour and whatever somebody last wrote
            in the register. It warns and never blocks — lapsed cover stops a
            placement through governance, which is a legal rule. This is
            commercial judgement, and it has a date on it.
          </p>
        </div>

        {riskError && (
          <div className="panel">
            <p className="text-[13px] text-etyme-attention">{riskError}</p>
          </div>
        )}

        {riskNote && (
          <div className="panel">
            <p className="text-[13px] text-etyme-muted">{riskNote}</p>
          </div>
        )}

        {list && list.rows.length > 0 && (
          <>
            <p className="text-[13px] text-etyme-ink">{list.says}</p>
            {list.rows.map((r) => (
              <article key={r.counterpartyId} className="panel">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-etyme-ink">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-etyme-faint">
                      {r.relationship.toLowerCase()} · {r.status.toLowerCase()}
                    </p>
                  </div>
                  <span className={VERDICT_CHIP[r.verdict].cls}>
                    {VERDICT_CHIP[r.verdict].label}
                  </span>
                </div>

                <p className="mt-3 text-[13px] text-etyme-ink">{r.says}</p>

                <div className="mt-3 flex flex-wrap gap-x-9 gap-y-3 border-t border-etyme-rule pt-3">
                  <div>
                    <p className="stat-label">They settle</p>
                    <p className="stat-value tabular-nums">
                      {r.theyPayUs.meanLateDays == null ? (
                        <span className="text-etyme-faint">—</span>
                      ) : (
                        <>
                          {r.theyPayUs.meanLateDays}
                          <span className="text-[15px] text-etyme-faint">d late</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="stat-label">Past due</p>
                    <p className="stat-value tabular-nums">
                      {r.theyPayUs.openOverdue === 0 ? (
                        <span className="text-etyme-faint">—</span>
                      ) : (
                        r.theyPayUs.openOverdue
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="stat-label">Look again</p>
                    <p className="stat-value tabular-nums">{r.reviewBy.slice(0, 10)}</p>
                  </div>
                  <div>
                    <p className="stat-label">Confidence</p>
                    <p className="stat-value">{r.confidence.toLowerCase()}</p>
                  </div>
                </div>

                <p className="mt-3 text-[12px] text-etyme-muted">{r.ownerSays}</p>

                <button
                  onClick={() => setOpenRisk(openRisk === r.counterpartyId ? null : r.counterpartyId)}
                  className="mt-3 text-[12px] text-etyme-muted underline"
                >
                  {openRisk === r.counterpartyId ? 'Less' : 'What this is built on'}
                </button>

                {openRisk === r.counterpartyId && (
                  <ul className="mt-3 space-y-1.5 border-t border-etyme-rule pt-3">
                    {r.signals.map((s, i) => (
                      <li
                        key={i}
                        className={
                          s.severity === 'WARN'
                            ? 'text-[12px] text-etyme-attention'
                            : 'text-[12px] text-etyme-muted'
                        }
                      >
                        {s.says}
                      </li>
                    ))}
                    <li className="text-[12px] text-etyme-muted">{r.insurance.says}</li>
                    <li className="text-[12px] text-etyme-muted">{r.theyPayUs.says}</li>
                    <li className="text-[12px] text-etyme-muted">{r.wePayThem.says}</li>
                    {/* Never omitted. A judgement built on a gap says so. */}
                    {r.unknowns.map((u, i) => (
                      <li key={`u${i}`} className="text-[12px] text-etyme-faint">{u}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </>
        )}
      </section>

      {/* ── The shape of the book ────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <p className="eyebrow">Concentration</p>
          <h2 className="headline-serif text-[20px] leading-tight">One client, one supplier, one person</h2>
          <p className="mt-1 max-w-[58ch] text-[12px] text-etyme-muted">
            None of these is a loss and none of them shows up on a margin
            report. Together they decide whether a bad quarter is survivable.
            Below a handful of names nothing is reported at all — a first
            client is a hundred per cent of the revenue, and that is
            arithmetic rather than a finding.
          </p>
        </div>

        {shapeError && (
          <div className="panel">
            <p className="text-[13px] text-etyme-attention">{shapeError}</p>
          </div>
        )}

        {report && (
          <>
            <p className="text-[13px] text-etyme-ink">{report.says}</p>
            {report.parts.map((p) => (
              <article key={p.dimension} className="panel">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="stat-label">{DIMENSION_WORD[p.dimension]}</p>
                    <p className="stat-value tabular-nums">
                      {p.topSharePct == null ? (
                        <span className="text-etyme-faint">—</span>
                      ) : (
                        <>
                          {p.topSharePct}
                          <span className="text-[15px] text-etyme-faint">%</span>
                        </>
                      )}
                    </p>
                  </div>
                  {p.breach && (
                    <span
                      className={
                        p.breach.severity === 'WARN'
                          ? 'chip chip--attention'
                          : 'chip chip--action'
                      }
                    >
                      over {p.breach.atOrAbovePct}%
                    </span>
                  )}
                  {p.unit === 'PEOPLE' && <span className="chip chip--passive">people, not money</span>}
                </div>

                <p className="mt-2 text-[13px] text-etyme-ink">{p.says}</p>

                {p.breach && (
                  <>
                    <p className="mt-2 text-[13px] text-etyme-attention">{p.breach.meaning}</p>
                    <p className="mt-1 text-[12px] text-etyme-muted">{p.breach.says}</p>
                  </>
                )}

                {p.unknowns.map((u, i) => (
                  <p key={i} className="mt-1 text-[12px] text-etyme-faint">{u}</p>
                ))}
              </article>
            ))}

            {shapeGaps.map((g, i) => (
              <p key={i} className="text-[12px] text-etyme-faint">{g}</p>
            ))}
          </>
        )}
      </section>

      <div>
        <p className="eyebrow">Scored</p>
        <h2 className="headline-serif text-[20px] leading-tight">What they are like to work with</h2>
      </div>

      <div className="border-b border-etyme-rule pb-4">
        <p className="text-[14px] text-etyme-ink">{summary}</p>
        <p className="mt-1 text-[12px] text-etyme-faint">
          Last {Math.round(windowDays / 30)} months. {orderedBy}
        </p>
      </div>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && cards.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing to score yet. Send a role to a supplier and this fills in.
          </p>
        </div>
      )}

      {cards.map((c) => (
        <article key={c.vendorName} className="panel">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-etyme-ink">
                {c.rank != null && (
                  <span className="mr-2 text-[12px] tabular-nums text-etyme-faint">
                    {c.rank}
                  </span>
                )}
                {c.vendorName}
              </p>
              <p className="mt-0.5 text-[13px] text-etyme-muted">{c.summary}</p>
            </div>
            {!c.enough && <span className="chip chip--passive">Too early</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-9 gap-y-3 border-t border-etyme-rule pt-4">
            <Fig label="Answered" f={c.answered} />
            <Fig label="First CV" f={c.firstReplyHours} suffix="h" />
            <Fig label="Worth reading" f={c.worthReading} />
            <Fig label="Hired" f={c.hired} />
          </div>

          {/* The actionable one. A percentage tells a procurement manager
              nothing they can raise on a call; this is the sentence they
              read out. */}
          {c.holdsThemUp && (
            <p className="mt-3 text-[13px] text-etyme-attention">{c.holdsThemUp.says}</p>
          )}

          <button
            onClick={() => setOpen(open === c.vendorName ? null : c.vendorName)}
            className="mt-3 text-[12px] text-etyme-muted underline"
          >
            {open === c.vendorName ? 'Less' : 'What each number means'}
          </button>

          {open === c.vendorName && (
            <ul className="mt-3 space-y-1.5 border-t border-etyme-rule pt-3">
              {[c.answered, c.firstReplyHours, c.worthReading, c.hired, c.asks].map((f, i) => (
                <li key={i} className="text-[12px] text-etyme-muted">
                  {f.says}
                </li>
              ))}
              {/* Never omitted. A number built on a gap should say so. */}
              {c.unknowns.map((u, i) => (
                <li key={`u${i}`} className="text-[12px] text-etyme-faint">
                  {u}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}
