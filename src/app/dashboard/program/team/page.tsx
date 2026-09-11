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
  teams: { id: string; name: string; kind: string; parentId: string | null }[]
  people: {
    contextId: string
    person: { id: string; name: string; primaryEmail: string }
    role: { id: string; name: string } | null
    approves: number
    owns: number
  }[]
}

const cash = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/**
 * What the route sent, with whatever it left out.
 *
 * The page read `team.warnings.length` and four `.map`s straight off the
 * body. A payload missing one list — an older deploy, a section the
 * caller may not read — took the whole screen down rather than the
 * section, and the reader saw a stack trace instead of a programme.
 */
function asTeam(data: any): Team | null {
  if (!data?.company?.name) return null
  return {
    company: data.company,
    lead: data.lead ?? null,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    approvers: Array.isArray(data.approvers) ? data.approvers : [],
    budgets: Array.isArray(data.budgets) ? data.budgets : [],
    teams: Array.isArray(data.teams) ? data.teams : [],
    people: Array.isArray(data.people) ? data.people : [],
  }
}

export default function ProgramTeamPage() {
  const [team, setTeam] = useState<Team | null>(null)
  /** Why the page cannot be read at all — a refusal, in the words the
   *  route used. Kept apart from `error`, which is one action going
   *  wrong and must not take the screen away from somebody mid-edit. */
  const [unreadable, setUnreadable] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ name: '', approverId: '', threshold: '', teamId: '' })

  const reload = async () => {
    const res = await fetch('/api/program/team')
    // Throws a sentence on a refusal or an empty body; the caller says
    // where it goes. Reading it without catching was what put a Next
    // error overlay in front of the AP clerk.
    const body = await readJson(res)
    const next = asTeam(body?.data)
    if (!next) throw new Error('The programme team came back without a company on it.')
    setTeam(next)
  }

  /**
   * Adding somebody to the chain.
   *
   * A blank threshold means "anything a check routes" — which is the lead,
   * not a rule with no effect. Said in the form rather than left to be
   * discovered, because an empty box usually means nothing happens.
   */
  async function addRule(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.name.trim() || !draft.approverId) {
      setError('A rule needs a name and somebody to approve it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/approval-rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          approverId: draft.approverId,
          thresholdDollars: draft.threshold.trim() === '' ? null : Number(draft.threshold),
          orgUnitId: draft.teamId || null,
        }),
      })
      const body = await readJson(res)
      // The route refuses a chain that would leave one person approving
      // their own work. Its words, not mine — it knows why.
      if (!res.ok) throw new Error(body?.error?.message ?? 'That rule was refused.')
      setDraft({ name: '', approverId: '', threshold: '', teamId: '' })
      setAdding(false)
      await reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeRule(id: string, who: string) {
    const why = window.prompt(`Why is ${who} coming off the chain?`)
    if (why === null) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/settings/approval-rules?id=${encodeURIComponent(id)}&reason=${encodeURIComponent(why.trim())}`,
        { method: 'DELETE' }
      )
      const body = await readJson(res)
      if (!res.ok) throw new Error(body?.error?.message ?? 'That could not be removed.')
      await reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        await reload()
      } catch (err: any) {
        if (!live) return
        setUnreadable(err?.message ?? 'The programme team could not be read.')
      }
    })()
    return () => { live = false }
  }, [])

  if (unreadable) {
    return (
      <div className="animate-fade-in">
        <div className="panel py-16 text-center">
          <p className="text-sm text-etyme-muted">{unreadable}</p>
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
                <th className="lbl pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {team.approvers.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-etyme-muted">
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
                  <td className="py-2 text-right">
                    <button
                      onClick={() => removeRule(a.id, a.approver.name)}
                      disabled={busy}
                      className="text-[12px] text-etyme-faint hover:text-etyme-danger"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="mt-3 text-[13px] text-etyme-danger">{error}</p>
        )}

        {!adding ? (
          <button onClick={() => setAdding(true)} className="mt-4 btn-secondary text-[13px]">
            Add an approver
          </button>
        ) : (
          <form onSubmit={addRule} className="mt-4 card grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="lbl">What to call it</div>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Technology — over $80k"
                className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2 py-1.5 text-[13px]
                           text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-action focus:outline-none"
              />
            </label>
            <label className="block">
              <div className="lbl">Who approves</div>
              <select
                value={draft.approverId}
                onChange={(e) => setDraft({ ...draft, approverId: e.target.value })}
                className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2 py-1.5 text-[13px] text-etyme-ink"
              >
                <option value="">— pick somebody —</option>
                {team.people.map((p) => (
                  <option key={p.person.id} value={p.person.id}>{p.person.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="lbl">Asked when it is over ($ a year)</div>
              <input
                type="number" min="0" step="1000"
                value={draft.threshold}
                onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
                placeholder="80000"
                className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2 py-1.5 text-[13px]
                           tabular-nums text-etyme-ink placeholder:text-etyme-faint focus:border-etyme-action focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-etyme-muted">
                Leave it blank to make them the lead — asked whenever a check
                routes something and no threshold catches it.
              </p>
            </label>
            <label className="block">
              <div className="lbl">Which team</div>
              <select
                value={draft.teamId}
                onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
                className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2 py-1.5 text-[13px] text-etyme-ink"
              >
                <option value="">Everywhere</option>
                {team.teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-etyme-muted">
                A rule on a team is responsible for everything beneath it too.
              </p>
            </label>
            <div className="flex items-center gap-2 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn-primary text-[13px]">
                {busy ? 'Adding…' : 'Add'}
              </button>
              <button type="button" onClick={() => { setAdding(false); setError(null) }}
                className="text-[13px] text-etyme-muted hover:text-etyme-ink">
                Cancel
              </button>
            </div>
          </form>
        )}
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
