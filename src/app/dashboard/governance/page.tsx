'use client'

import { readJson } from '@/lib/read-response'
import { mayTryAgain } from './says'
import { usePageSection } from '@/components/page-section'
import { EmptyState, ErrorState, FilterChips, Input, LoadingState, PageHead, RefusedState, Select, Stat } from '@/components/ui'

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
 *   HR                co-employment, tenure, work authorization
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
  { key: 'ALL', label: 'Everything', blurb: 'Every consequence across the program' },
  { key: 'HIRING_MANAGER', label: 'Hiring managers', blurb: 'People ending, headcount, who needs a decision' },
  { key: 'PROCUREMENT', label: 'Procurement', blurb: 'Supplier certificates, rates, vendor risk' },
  { key: 'HR', label: 'HR', blurb: 'Co-employment, tenure, work authorization' },
]

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
  // The section on the reader's own menu; nothing while it is not known.
  const section = usePageSection('/dashboard/governance')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The status behind the error, so a refusal is not offered a retry.
  // 0 where the server could not be reached at all.
  const [status, setStatus] = useState(0)
  const [team, setTeam] = useState<Team>('ALL')
  const [days, setDays] = useState(120)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setStatus(0)
      const res = await fetch(`/api/governance/horizon?days=${days}`)
      setStatus(res.status)
      const json = await readJson(res)
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

  // A refusal is the whole page: the route's sentence alone. Not the
  // heading, the team lenses, the search or the window — each would offer
  // to filter an answer the reader was not given. A failure that is not a
  // refusal keeps the heading and is offered a retry, because one could
  // change the answer.
  if (!loading && error) return (
    mayTryAgain(status) ? (
      <div className="max-w-4xl">
        <PageHead eyebrow={section} title="What is coming" />
        <ErrorState says={error} action={{ label: 'Try again', onClick: load }} />
      </div>
    ) : <RefusedState says={error} />
  )

  return (
    <div className="max-w-4xl">
      <PageHead
        eyebrow={section}
        title="What is coming"
        subtitle="Not what happened — what lands next, and whose decision it is. A time limit reached in eleven weeks is a plan; the same limit reached on the day somebody asks for an extension is an argument."
      />

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-8">
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
      <div className="mb-2">
        <FilterChips
          label="Whose decision"
          value={team}
          onChange={setTeam}
          options={TEAMS.map(t => ({
            key: t.key,
            label: t.label,
            count: (t.key === 'ALL' ? s?.total : s?.perTeam?.[t.key]) ?? undefined,
          }))}
        />
      </div>
      <p className="text-sm text-etyme-muted mb-6">
        {TEAMS.find(t => t.key === team)?.blurb}
      </p>

      <div className="flex items-center gap-3 mb-6">
        <Input value={q} onChange={e => setQ(e.target.value)}
          aria-label="Search by person or vendor"
          placeholder="Search by person or vendor…"
          className="flex-1" />
        <Select value={days} onChange={e => setDays(parseInt(e.target.value, 10))}
          aria-label="How far ahead" className="w-auto">
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={120}>120 days</option>
          <option value={365}>a year</option>
        </Select>
      </div>

      {loading && <LoadingState says="Reading what lands next…" />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          says={q ? 'Nothing matches that search.' : 'Nothing on the horizon.'}
          detail={q
            ? 'Try another name.'
            : `No time limits, certificates or endings land in the next ${data?.windowDays ?? 120} days for this team. Widen the window to look further out.`}
        />
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
          time limit counted across every vendor, and a {data.policy.breakDays}-day break in
          service. Tenure follows the person, not the assignment.
        </p>
      )}
    </div>
  )
}
