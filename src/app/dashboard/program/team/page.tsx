'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'

/**
 * The programme team — who approves, who leads, who owns which budget.
 *
 * Three facts kept in three places: users under Setup, approval rules
 * under Settings, cost centres somewhere else again. Setting a programme
 * up meant visiting all three and holding the result in your head, and
 * "who signs off on Engineering's contractors" had no screen that
 * answered it.
 *
 * A decision surface, in CLAUDE.md's sense: a handful of people, read in
 * order, with prose rather than density. Nobody manages forty approvers.
 */

interface Team {
  company: { id: string; name: string }
  lead: { ruleId: string; personId: string; name: string } | null
  warnings: string[]
  approvers: {
    id: string; name: string; rank: number
    approver: { id: string; name: string }
    department: { id: string; name: string } | null
    thresholdDollars: number | null
    isLead: boolean
  }[]
  budgets: {
    id: string; code: string; name: string
    owner: { id: string; name: string } | null
    department: { id: string; name: string } | null
    plan: { period: string; approvedHeads: number; annualBudget: number } | null
  }[]
  people: {
    contextId: string
    person: { id: string; name: string; primaryEmail: string }
    role: { id: string; name: string } | null
    approves: number
    owns: number
  }[]
}

const cash = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function ProgramTeamPage() {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const res = await fetch('/api/program/team')
      const body = await readJson(res)
      if (!live) return
      if (!res.ok) setError(body?.error?.message ?? 'The programme team could not be read.')
      else setTeam(body.data)
    })()
    return () => { live = false }
  }, [])

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="panel py-16 text-center">
          <p className="text-sm text-etyme-danger">{error}</p>
        </div>
      </div>
    )
  }
  if (!team) {
    return (
      <div className="animate-fade-in">
        <div className="panel py-16 text-center">
          <p className="text-body-sm text-etyme-muted">Reading the programme team…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="page-head">
        <div className="eyebrow">{team.company.name}</div>
        <h1 className="headline-serif text-heading text-etyme-ink">Programme team</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-etyme-muted">
          Who approves what, who catches anything that routes, and who is
          answerable for each budget.
        </p>
      </div>

      {team.warnings.length > 0 && (
        <div className="card mb-6 border-etyme-attention/40 bg-etyme-attention/5">
          <div className="lbl mb-2 text-etyme-attention">Worth fixing</div>
          <ul className="space-y-1">
            {team.warnings.map((w) => (
              <li key={w} className="text-[13px] text-etyme-ink">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Who approves ── */}
      <section className="panel mb-6">
        <h2 className="headline-serif text-[17px] text-etyme-ink">Who approves</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">
          Ranks are asked in order — rank 1 before rank 2 — so a chain never
          troubles three people with something the first would refuse. Most
          requisitions match none of these and clear themselves.
        </p>
        <div className="mt-4 overflow-scroll-x">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-etyme-rule text-left">
                <th className="lbl pb-2">Rank</th>
                <th className="lbl pb-2">Who</th>
                <th className="lbl pb-2">Asked when</th>
                <th className="lbl pb-2">Department</th>
              </tr>
            </thead>
            <tbody>
              {team.approvers.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-etyme-muted">
                  Nobody approves anything, so every requisition clears itself.
                </td></tr>
              )}
              {team.approvers.map((a) => (
                <tr key={a.id} className="border-b border-etyme-rule/60">
                  <td className="py-2 tabular-nums text-etyme-muted">{a.rank}</td>
                  <td className="py-2 text-etyme-ink">
                    {a.approver.name}
                    {/* A real space, not only a margin. Spacing that
                        exists in CSS alone flattens to "VP, Harlowlead"
                        for a screen reader or a copy-paste. */}
                    {a.isLead && <> <span className="chip chip--action">lead</span></>}
                  </td>
                  <td className="py-2 text-etyme-muted">
                    {a.thresholdDollars === null
                      ? 'anything a check routes'
                      : `over ${cash(a.thresholdDollars)} a year`}
                  </td>
                  <td className="py-2 text-etyme-muted">{a.department?.name ?? 'everywhere'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Whose money ── */}
      <section className="panel mb-6">
        <h2 className="headline-serif text-[17px] text-etyme-ink">Whose budget</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">
          A requisition charged to a budget nobody owns has nobody to ask
          about it, so it goes for approval instead.
        </p>
        <div className="mt-4 overflow-scroll-x">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-etyme-rule text-left">
                <th className="lbl pb-2">Code</th>
                <th className="lbl pb-2">Answerable</th>
                <th className="lbl pb-2 text-right">Heads</th>
                <th className="lbl pb-2 text-right">Plan</th>
              </tr>
            </thead>
            <tbody>
              {team.budgets.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-etyme-muted">
                  No budgets yet, so nothing can be charged to one.
                </td></tr>
              )}
              {team.budgets.map((b) => (
                <tr key={b.id} className="border-b border-etyme-rule/60">
                  <td className="py-2 text-etyme-ink">
                    {b.code}
                    <div className="text-[11px] text-etyme-faint">{b.name}</div>
                  </td>
                  <td className="py-2">
                    {b.owner
                      ? <span className="text-etyme-ink">{b.owner.name}</span>
                      : <span className="text-etyme-attention">nobody</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-etyme-muted">
                    {b.plan?.approvedHeads ?? '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums text-etyme-muted">
                    {b.plan ? cash(b.plan.annualBudget) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Everybody with a seat ── */}
      <section className="panel">
        <h2 className="headline-serif text-[17px] text-etyme-ink">Everybody with a seat</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">
          What each person does on the programme, rather than what the
          permission table calls them.
        </p>
        <ul className="mt-4 space-y-2">
          {team.people.map((p) => (
            <li key={p.contextId} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[14px] text-etyme-ink">{p.person.name}</span>
                <span className="ml-2 text-[12px] text-etyme-faint">{p.role?.name ?? 'no role'}</span>
              </div>
              <div className="flex items-center gap-2">
                {p.person.id === team.lead?.personId && (
                  <span className="chip chip--action">lead approver</span>
                )}
                {p.approves > 0 && (
                  <span className="chip chip--passive">
                    approves {p.approves === 1 ? '1 rule' : `${p.approves} rules`}
                  </span>
                )}
                {p.owns > 0 && (
                  <span className="chip chip--passive">
                    {p.owns === 1 ? '1 budget' : `${p.owns} budgets`}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-etyme-muted">
          Seats and roles are granted under{' '}
          <Link href="/dashboard/access" className="text-etyme-action hover:underline">
            Users &amp; permissions
          </Link>.
        </p>
      </section>
    </div>
  )
}
