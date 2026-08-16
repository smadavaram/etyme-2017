'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'

/**
 * Governance — what is about to go wrong, when, and whose job it is.
 *
 * Most workforce compliance software is a filing cabinet: it tells you what
 * happened and leaves you to notice what is coming. This is the other way
 * round. Every row is dated, owned, and says what to do.
 *
 * A client is not one person, so the console has three lenses:
 *
 *   Hiring managers   people ending, headcount, their own unit
 *   Procurement       supplier certificates, rates, vendor risk
 *   HR                co-employment, tenure, work authorisation
 *
 * Addendum E: enforcement BLOCKS where legally grounded and WARNS
 * everywhere else. A coming block is a deadline; a coming warning is a
 * heads-up. They are not drawn the same, because treating them alike is how
 * a team learns to ignore both.
 */

type Team = 'ALL' | 'HR' | 'PROCUREMENT' | 'HIRING_MANAGER'

interface HorizonItem {
  kind: string
  owner: Exclude<Team, 'ALL'> | 'LEGAL'
  severity: 'BLOCK' | 'WARN'
  date: string
  daysAway: number
  subject: { kind: 'PERSON' | 'VENDOR'; id: string; name: string }
  headline: string
  action: string | null
  actionable: boolean
}

const TEAMS: { key: Team; label: string; blurb: string }[] = [
  { key: 'ALL', label: 'Everything', blurb: 'Every consequence across the programme' },
  { key: 'HIRING_MANAGER', label: 'Hiring managers', blurb: 'People ending, headcount, who needs a decision' },
  { key: 'PROCUREMENT', label: 'Procurement', blurb: 'Supplier certificates, rates, vendor risk' },
  { key: 'HR', label: 'HR', blurb: 'Co-employment, tenure, work authorisation' },
]

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Stat({ label, value, tone = 'default', sub }: {
  label: string; value: string | number; tone?: 'default' | 'attention' | 'verified'; sub?: string
}) {
  const colour = tone === 'attention' ? 'text-etyme-attention'
    : tone === 'verified' ? 'text-etyme-verified' : 'text-etyme-ink'
  return (
    <div>
      <Lbl>{label}</Lbl>
      <div className={`font-serif text-3xl mt-1 tabular-nums ${colour}`}>{value}</div>
      {sub && <div className="text-xs text-etyme-muted mt-0.5">{sub}</div>}
    </div>
  )
}

/** How far off it is, in the words somebody would actually use. */
function when(days: number): string {
  if (days < 0) return `${Math.abs(days)} days ago`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 30) return `in ${days} days`
  if (days <= 60) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30)} months`
}

/**
 * Urgency bands rather than a flat list. A horizon read as one long table
 * puts a certificate lapsing next week beside one lapsing next quarter, and
 * the reader has to do the sorting the software should have done.
 */
const BANDS = [
  { key: 'now', label: 'Already past', test: (d: number) => d < 0 },
  { key: 'month', label: 'Within a month', test: (d: number) => d >= 0 && d <= 30 },
  { key: 'quarter', label: 'Next three months', test: (d: number) => d > 30 && d <= 90 },
  { key: 'later', label: 'Beyond three months', test: (d: number) => d > 90 },
]

function ItemRow({ item }: { item: HorizonItem }) {
  const blocking = item.severity === 'BLOCK'
  return (
    <div className={`border-l-2 pl-4 py-3 ${blocking ? 'border-etyme-attention' : 'border-etyme-rule'}`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-etyme-ink flex-1">{item.headline}</p>
        <span className={`text-xs tabular-nums shrink-0 ${blocking ? 'text-etyme-attention' : 'text-etyme-faint'}`}>
          {when(item.daysAway)}
        </span>
      </div>
      {item.action && (
        <p className="text-sm text-etyme-muted mt-1">{item.action}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] text-etyme-faint">
          {item.owner === 'HIRING_MANAGER' ? 'hiring manager' : item.owner.toLowerCase()}
        </span>
        {blocking && (
          <span className="text-[10px] uppercase tracking-[0.1em] text-etyme-attention">
            blocks when it lands
          </span>
        )}
      </div>
    </div>
  )
}

export default function GovernancePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [team, setTeam] = useState<Team>('ALL')
  const [days, setDays] = useState(120)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/governance/horizon?days=${days}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load the horizon')
      setData(json.data)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  const items: HorizonItem[] = useMemo(() => {
    if (!data) return []
    const base: HorizonItem[] = team === 'ALL' ? data.horizon : (data.byTeam[team] ?? [])
    const t = q.trim().toLowerCase()
    if (!t) return base
    return base.filter(i =>
      i.headline.toLowerCase().includes(t) || i.subject.name.toLowerCase().includes(t)
    )
  }, [data, team, q])

  const s = data?.summary

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Lbl>Governance</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">
          What is coming
        </h1>
        <p className="text-etyme-muted mt-2 max-w-2xl">
          Not what happened — what lands next, and whose decision it is. A cap
          reached in eleven weeks is a plan; the same cap reached on the day
          somebody asks for an extension is an argument.
        </p>
      </div>

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
          <Stat label="Already past" value={s.alreadyBreached}
            tone={s.alreadyBreached > 0 ? 'attention' : 'verified'}
            sub={s.alreadyBreached === 0 ? 'nothing overdue' : 'blocking now'} />
          <Stat label="Within a month" value={s.thisMonth}
            tone={s.thisMonth > 0 ? 'attention' : 'default'} />
          <Stat label="Will block" value={s.blocking} sub="legally grounded" />
          <Stat label="On the horizon" value={s.total} sub={`next ${data.windowDays} days`} />
        </div>
      )}

      {/* Team lenses. The same data, addressed to whoever owns it. */}
      <div className="flex flex-wrap gap-2 mb-2">
        {TEAMS.map(t => {
          const count = t.key === 'ALL' ? s?.total : s?.perTeam?.[t.key]
          const active = team === t.key
          return (
            <button key={t.key} onClick={() => setTeam(t.key)}
              className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                active
                  ? 'bg-etyme-ink text-white border-etyme-ink'
                  : 'border-etyme-rule text-etyme-muted hover:text-etyme-ink'
              }`}>
              {t.label}
              {count != null && (
                <span className={`ml-2 tabular-nums text-xs ${active ? 'text-white/70' : 'text-etyme-faint'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-etyme-muted mb-6">
        {TEAMS.find(t => t.key === team)?.blurb}
      </p>

      <div className="flex items-center gap-3 mb-6">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by person or vendor…"
          className="flex-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-surface text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action" />
        <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))}
          className="px-3 py-2 border border-etyme-rule rounded bg-etyme-surface text-sm text-etyme-ink focus:outline-none focus:border-etyme-action">
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={120}>120 days</option>
          <option value={365}>a year</option>
        </select>
      </div>

      {loading && <div className="text-etyme-muted py-12 text-center">Loading…</div>}

      {!loading && error && (
        <div className="border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
          <div className="text-etyme-attention font-medium">{error}</div>
          <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="border border-etyme-rule rounded-lg p-12 text-center">
          <p className="font-serif text-lg text-etyme-ink">
            {q ? 'Nothing matches that search' : 'Nothing on the horizon'}
          </p>
          <p className="text-sm text-etyme-muted mt-2 max-w-md mx-auto">
            {q
              ? 'Try another name.'
              : `No caps, certificates or endings land in the next ${data?.windowDays ?? 120} days for this team. Widen the window to look further out.`}
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-8">
          {BANDS.map(band => {
            const inBand = items.filter(i => band.test(i.daysAway))
            if (inBand.length === 0) return null
            return (
              <div key={band.key}>
                <div className="flex items-baseline gap-3 mb-3">
                  <h2 className="font-serif text-lg text-etyme-ink">{band.label}</h2>
                  <span className="text-xs text-etyme-faint tabular-nums">{inBand.length}</span>
                </div>
                <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
                  {inBand.map((item, idx) => (
                    <div key={`${item.kind}-${item.subject.id}-${idx}`} className="px-4">
                      <ItemRow item={item} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {data?.policy && (
        <p className="text-xs text-etyme-faint mt-8 pt-6 border-t border-etyme-rule">
          Measured against this client&apos;s own policy: {[8, 11, 18].includes(data.policy.tenureCapMonths) ? 'an' : 'a'}{' '}
          {data.policy.tenureCapMonths}-month
          tenure cap counted across every vendor, and a {data.policy.breakDays}-day break in
          service. Tenure follows the person, not the assignment.
        </p>
      )}
    </div>
  )
}
