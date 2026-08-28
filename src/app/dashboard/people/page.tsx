'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * One person, however many suppliers are selling them.
 *
 * A client with twelve vendors does not have twelve consultants called
 * Rohan Menon. They have one, and twelve different stories about him.
 * This is the merged record — and the rate spread on it is the line no
 * client has ever been able to see.
 *
 * Ordered by what needs a person looking at it: barred first, then past
 * the tenure cap, then the ones several suppliers are competing over. A
 * register sorted by name is a phone book.
 */

interface Offer {
  vendorName: string
  rateCents: number | null
  submittedAt: string
  roleTitle: string
  cleared: boolean | null
  state: string
}

interface Row {
  personId: string
  name: string
  vendors: number
  vendorNames: string[]
  spread: { lowCents: number; highCents: number; gapCents: number; says: string | null } | null
  monthsHere: number
  headroomMonths: number | null
  barred: boolean
  state: string
  roles: string[]
  offers: Offer[]
  stints: { months: number; endedAt: string | null; vendorName: string }[]
  says: string
  unknowns: string[]
}

function money(cents: number | null): string {
  if (cents == null) return '—'
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

const TONE: Record<string, string> = {
  BARRED: 'chip--attention',
  PLACED: 'chip--verified',
  OFFERED: 'chip--verified',
  INTERVIEWING: 'chip--action',
  SUBMITTED: 'chip--passive',
  REJECTED: 'chip--passive',
}

export default function PeoplePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/people')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setRows(body.data.people)
      setSummary(body.data.summary)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-[860px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Program</p>
        <h1 className="headline-serif text-[30px] leading-tight">One person, one entry</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          Everyone who has been put in front of you, merged across suppliers.
          Every fact here sits in a different vendor&rsquo;s system and none of
          them can see the others.
        </p>
      </header>

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nobody yet. This fills in as suppliers put people forward.
          </p>
        </div>
      )}

      {rows.map((r) => (
        <article key={r.personId} className="panel">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-etyme-ink">{r.name}</p>
              <p className="text-[12px] text-etyme-faint">
                {r.vendorNames.join(' · ')}
                {r.roles.length > 0 && ` — ${r.roles.join(', ')}`}
              </p>
            </div>
            <span className={`chip ${TONE[r.state] ?? 'chip--passive'}`}>
              {r.state.toLowerCase()}
            </span>
          </div>

          <p
            className={`mt-2 text-[13px] ${
              r.barred || (r.headroomMonths != null && r.headroomMonths <= 0)
                ? 'text-etyme-attention'
                : 'text-etyme-muted'
            }`}
          >
            {r.says}
          </p>

          <button
            onClick={() => setOpen(open === r.personId ? null : r.personId)}
            className="mt-3 text-[12px] text-etyme-muted underline"
          >
            {open === r.personId ? 'Less' : `Every submission (${r.offers.length})`}
          </button>

          {open === r.personId && (
            <div className="mt-3 space-y-3 border-t border-etyme-rule pt-3">
              <table className="w-full text-[12px]">
                <tbody>
                  {r.offers.map((o, i) => (
                    <tr key={i} className="border-b border-etyme-rule last:border-0">
                      <td className="py-1.5 pr-3 text-etyme-ink">{o.vendorName}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-etyme-ink">
                        {money(o.rateCents)}
                      </td>
                      <td className="py-1.5 pr-3 text-etyme-muted">{o.roleTitle}</td>
                      <td className="py-1.5 pr-3 text-etyme-faint">
                        {new Date(o.submittedAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short',
                        })}
                      </td>
                      <td className="py-1.5 text-right text-etyme-faint">
                        {o.cleared === null ? 'not screened' : o.cleared ? 'cleared' : 'held back'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Time here, through whoever. The only place it exists. */}
              {r.stints.length > 0 && (
                <div>
                  <p className="stat-label">Worked here before</p>
                  <ul className="mt-1.5 space-y-1">
                    {r.stints.map((s, i) => (
                      <li key={i} className="text-[12px] text-etyme-muted">
                        {s.months} months through {s.vendorName}
                        {s.endedAt &&
                          `, finishing ${new Date(s.endedAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.unknowns.length > 0 && (
                <ul className="space-y-1">
                  {r.unknowns.map((u, i) => (
                    <li key={i} className="text-[11px] text-etyme-faint">{u}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
