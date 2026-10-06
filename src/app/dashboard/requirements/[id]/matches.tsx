'use client'

import { useEffect, useState } from 'react'
import { confidenceWords } from './confidence-words'
import { readJson } from '@/lib/read-response'
import { range } from '@/lib/money-display'
import { submitFields } from '@/lib/bench-filter'

/**
 * The matches on one job request, grouped the way they rank.
 *
 * Decided 2026-09-30: matching brings available bench to a job request,
 * your own people first, then your suppliers', then the other firms you
 * work with — and, on a client's own job request, suggestions from firms
 * that are not a supplier yet. Every row keeps its reasons (factors,
 * basis, confidence, unknowns), one line by default and the reasoning on
 * click.
 *
 * Every row has exactly one action, chosen by the server
 * (`actionFor` in `lib/match-pool`), so this screen cannot draw a button
 * the door behind it would refuse:
 *
 *   SUBMIT      a firm that sells adds the person to the application,
 *               through `/api/submissions`, with its own firm and a real
 *               rate — the one on the listing, the one it last billed its
 *               own employee at, or one it types. Never a placeholder.
 *   ASK         a buyer asks the firm to put them forward
 *   ASK_TO_ADD  a suggestion: ask to add the firm as a supplier
 */

export interface MatchFactor {
  label: string
  value: number
  weight: number
  detail?: string
}

export type Reach = 'OWN' | 'PANEL' | 'TRADING' | 'SUGGESTION'

export type MatchAction =
  | { kind: 'SUBMIT'; fromCompanyId: string; rate: number | null; offeredBy: string | null; payRate: number | null; as: string; says: string }
  | { kind: 'ASK'; toCompanyId: string; toName: string; says: string }
  | { kind: 'ASK_TO_ADD'; firmId: string; firmName: string; says: string }
  | { kind: 'NONE'; says: string }

export interface MatchRow {
  id: string
  score: number
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  factors: MatchFactor[]
  basis: string
  unknowns: string | null
  reach: Reach
  reachWord: string
  employee: boolean
  standing: string | null
  firm: { id: string; name: string }
  rate: { min: number | null; max: number | null } | null
  consultant: {
    id: string | null
    personId: string | null
    name: string | null
    headline: string | null
    skills: string[]
    location: string | null
    workAuth: string | null
    availability: string | null
  }
  action: MatchAction
  asked: { stage: string; at: string } | null
  /**
   * Where this client asked the supplier for this person already: when,
   * and whether "Ask again" is offered yet (three days on). Null where it
   * has not asked. From the route (`api/requirements/[id]/matches/asked`).
   */
  askedFor?: { at: string; mayAskAgain: boolean; againFrom: string | null; says: string } | null
  computedAt: string
}

export interface MatchViewerInfo {
  companyId: string
  buyer: boolean
  raiser: boolean
  suggests: boolean
  mayAskToAdd: boolean
}

const ORDER: Reach[] = ['OWN', 'PANEL', 'TRADING', 'SUGGESTION']

const STAGE_WORD: Record<string, string> = {
  LEAD: 'with the department lead',
  PROCUREMENT: 'with Procurement',
  HR: 'with HR',
  FINANCE: 'with Finance',
}


function formatAvail(date: string | null): string {
  if (!date) return 'Free date not on record'
  const d = new Date(date)
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'Free now'
  if (days <= 14) return `Free in ${days} days`
  return `Free from ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function groupSays(reach: Reach, v: MatchViewerInfo): string {
  switch (reach) {
    case 'OWN':
      return v.buyer ? 'People your own company holds.' : 'Your own bench and your own employees between projects.'
    case 'PANEL':
      return v.buyer
        ? 'Offered by firms you already buy from. Ask the firm, and the submission and the rate come from them.'
        : 'Offered to you by firms you buy from. You put them forward in your name.'
    case 'TRADING':
      return 'Offered by other firms you already work with.'
    case 'SUGGESTION':
      return 'From firms that are not your supplier yet. You see the firm, the skills, when they are free and why they fit — never the person’s name, contact or rate. The one thing to do is ask to add the firm.'
  }
}

export function MatchList({
  requirementId,
  requirementSkills,
  matches,
  viewer,
  onChanged,
}: {
  requirementId: string
  requirementSkills: string[]
  matches: MatchRow[]
  viewer: MatchViewerInfo
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<{ id: string; text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rates, setRates] = useState<Record<string, string>>({})
  // What the supplier charges, where the person comes through one.
  const [pays, setPays] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<MatchRow | null>(null)
  // Asked in this sitting, before the list is read again — the button
  // goes the moment the ask does.
  const [askedNow, setAskedNow] = useState<Record<string, NonNullable<MatchRow['askedFor']>>>({})

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function submit(m: MatchRow) {
    if (m.action.kind !== 'SUBMIT' || !m.consultant.personId) return
    const fields = submitFields(m.action, { bill: rates[m.id], pay: pays[m.id] }, { person: m.consultant.name ?? 'this person', firm: m.firm.name })
    if (!fields.ok) {
      setFlash({ id: m.id, text: fields.says, bad: true })
      return
    }
    setBusy(m.id)
    setFlash(null)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId,
          personIds: [m.consultant.personId],
          // Cents, as Submission.rate is.
          rate: fields.rate,
          fromCompanyId: m.action.fromCompanyId,
          ...(m.action.offeredBy ? { offeredBy: m.action.offeredBy, payRate: fields.payRate } : {}),
        }),
      })
      const body = await readJson(res)
      const r = body.data?.results?.[0]
      if (r?.status === 'created') {
        setFlash({ id: m.id, text: `${m.consultant.name} is on the application.${r.warning ? ` ${r.warning}` : ''}`, bad: false })
        onChanged()
      } else {
        setFlash({ id: m.id, text: r?.error ?? 'Not submitted.', bad: true })
      }
    } catch (e: any) {
      setFlash({ id: m.id, text: e.message, bad: true })
    } finally {
      setBusy(null)
    }
  }

  async function ask(m: MatchRow) {
    setBusy(m.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/requirements/${requirementId}/matches/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: m.id }),
      })
      const body = await readJson(res)
      setFlash({ id: m.id, text: body.data?.says ?? 'Asked.', bad: false })
      if (body.data?.askedFor) setAskedNow((a) => ({ ...a, [m.id]: body.data.askedFor }))
      onChanged()
    } catch (e: any) {
      setFlash({ id: m.id, text: e.message, bad: true })
    } finally {
      setBusy(null)
    }
  }

  const groups = ORDER.map((reach) => ({ reach, rows: matches.filter((m) => m.reach === reach) })).filter((g) => g.rows.length > 0)

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.reach} aria-label={g.rows[0].reachWord}>
          <h3 className="text-[14px] font-semibold text-etyme-ink">
            {g.rows[0].reachWord} <span className="text-etyme-faint font-normal tabular-nums">· {g.rows.length}</span>
          </h3>
          <p className="text-[12px] text-etyme-muted mb-2 max-w-[70ch]">{groupSays(g.reach, viewer)}</p>
          <div className="space-y-2">
            {g.rows.map((m) => {
              const open = expanded.has(m.id)
              const conf = confidenceWords(m.confidence, m.unknowns)
              const suggestion = m.reach === 'SUGGESTION'
              const title = m.consultant.name ?? `A consultant at ${m.firm.name}`
              return (
                <div key={m.id} className="panel">
                  <div className="flex flex-wrap items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-serif text-[16px] tabular-nums ${
                          m.score >= 80 ? 'bg-etyme-verified/10 text-etyme-verified'
                          : m.score >= 60 ? 'bg-etyme-action/10 text-etyme-action'
                          : m.score >= 40 ? 'bg-etyme-attention/10 text-etyme-attention'
                          : 'bg-etyme-canvas text-etyme-muted'
                        }`}
                      >
                        {m.score}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-etyme-ink">{title}</span>
                          <span className={`chip text-[9px] ${conf.cls}`}>{conf.text}</span>
                          {m.employee && <span className="chip chip--action text-[9px]">Your employee</span>}
                          {suggestion && <span className="chip chip--attention text-[9px]">Not your supplier yet</span>}
                        </span>
                        <span className="block text-[11px] text-etyme-muted">
                          {m.reach === 'OWN' ? (m.standing ?? m.consultant.headline ?? m.consultant.skills.slice(0, 3).join(' · ')) : `Through ${m.firm.name}`}
                          {' · '}{formatAvail(m.consultant.availability)}
                          {m.consultant.location ? ` · ${m.consultant.location}` : ''}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {m.consultant.skills.slice(0, 6).map((s) => {
                            const hit = requirementSkills.some((rs) => rs.toLowerCase() === s.toLowerCase())
                            return (
                              <span key={s} className={`chip text-[9px] ${hit ? 'chip--verified' : 'chip--passive'}`}>{s}</span>
                            )
                          })}
                        </span>
                      </span>
                    </button>

                    {/* The one action on the row. */}
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      {m.action.kind === 'SUBMIT' && (
                        <>
                          {/* Two prices where a supplier stands between: what it
                              charges you, from its listing where it said, and what
                              you bill. */}
                          {m.action.offeredBy && (
                            <label className="flex items-center gap-1 text-[12px] text-etyme-muted">
                              {m.firm.name} charges you $
                              <input
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                aria-label={`What ${m.firm.name} charges you an hour for ${title}`}
                                value={pays[m.id] ?? (m.action.payRate != null ? String(Math.round(m.action.payRate / 100)) : '')}
                                placeholder="rate"
                                onChange={(e) => setPays((r) => ({ ...r, [m.id]: e.target.value }))}
                                className="w-20 rounded-md border border-etyme-rule bg-etyme-surface px-2 py-1 text-[12px] tabular-nums text-etyme-ink"
                              />
                              /hr
                            </label>
                          )}
                          <label className="flex items-center gap-1 text-[12px] text-etyme-muted">
                            {m.action.offeredBy ? 'You bill $' : '$'}
                            <input
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              aria-label={`Hourly rate for ${title}`}
                              value={rates[m.id] ?? (m.action.rate != null ? String(Math.round(m.action.rate / 100)) : '')}
                              placeholder="rate"
                              onChange={(e) => setRates((r) => ({ ...r, [m.id]: e.target.value }))}
                              className="w-20 rounded-md border border-etyme-rule bg-etyme-surface px-2 py-1 text-[12px] tabular-nums text-etyme-ink"
                            />
                            /hr
                          </label>
                          <button
                            type="button"
                            className="btn-primary text-[12px] px-3 py-1.5"
                            disabled={busy === m.id}
                            onClick={() => submit(m)}
                          >
                            {busy === m.id ? 'Adding…' : 'Add to application'}
                          </button>
                        </>
                      )}
                      {m.action.kind === 'ASK' && (() => {
                        const asked = askedNow[m.id] ?? m.askedFor ?? null
                        const label = m.action.kind === 'ASK' ? `Ask ${m.action.toName} to submit` : ''
                        return (
                          <>
                            {asked && (
                              <span className="chip chip--passive text-[10px]" title={asked.againFrom ? `You can ask again from ${new Date(asked.againFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : undefined}>
                                {asked.says}
                              </span>
                            )}
                            {(!asked || asked.mayAskAgain) && (
                              <button
                                type="button"
                                className={asked ? 'btn-secondary text-[12px] px-3 py-1.5' : 'btn-primary text-[12px] px-3 py-1.5'}
                                disabled={busy === m.id}
                                onClick={() => ask(m)}
                              >
                                {busy === m.id ? 'Asking…' : asked ? 'Ask again' : label}
                              </button>
                            )}
                          </>
                        )
                      })()}
                      {m.action.kind === 'ASK_TO_ADD' && (
                        m.asked ? (
                          <span className="chip chip--passive text-[10px]">
                            Asked to add — {STAGE_WORD[m.asked.stage] ?? 'in onboarding'}
                          </span>
                        ) : viewer.mayAskToAdd ? (
                          <button
                            type="button"
                            className="btn-secondary text-[12px] px-3 py-1.5"
                            onClick={() => setAdding(m)}
                          >
                            Ask to add this firm
                          </button>
                        ) : (
                          <span className="text-[11px] text-etyme-muted max-w-[28ch]">
                            Adding a supplier is for the hiring manager or the program office.
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-etyme-muted">{m.action.says}</p>
                  {flash?.id === m.id && (
                    <p className={`mt-1 text-[12px] ${flash.bad ? 'text-etyme-danger' : 'text-etyme-verified'}`} role="status">
                      {flash.text}
                    </p>
                  )}

                  {open && (
                    <div className="mt-4 pt-4 border-t border-etyme-rule">
                      <div className="eyebrow mb-2">Why they fit</div>
                      <div className="space-y-2 mb-4">
                        {m.factors.map((f, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-[120px] text-[11px] text-etyme-muted truncate">{f.label}</div>
                            <div className="flex-1 h-[6px] bg-etyme-rule/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  f.value >= 80 ? 'bg-etyme-verified/60' : f.value >= 50 ? 'bg-etyme-action/60' : 'bg-etyme-attention/60'
                                }`}
                                style={{ width: `${f.value}%` }}
                              />
                            </div>
                            <div className="w-8 text-right text-[11px] font-medium text-etyme-ink tabular-nums">{f.value}</div>
                            {f.detail && <div className="hidden md:block w-[220px] text-[11px] text-etyme-faint truncate">{f.detail}</div>}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="eyebrow mb-1">Basis</div>
                          <p className="text-[12px] text-etyme-muted leading-relaxed">{m.basis}</p>
                        </div>
                        {m.unknowns && (
                          <div>
                            <div className="eyebrow mb-1">Unknowns</div>
                            <p className="text-[12px] text-etyme-muted leading-relaxed">{m.unknowns}</p>
                          </div>
                        )}
                      </div>
                      {m.rate && (m.rate.min != null || m.rate.max != null) && (
                        <p className="mt-3 text-[12px] text-etyme-muted">
                          {m.firm.id === viewer.companyId ? 'Your listing' : `${m.firm.name}'s listing`}: {range(m.rate.min, m.rate.max)}
                        </p>
                      )}
                      <p className="text-[10px] text-etyme-faint mt-3">
                        Computed {new Date(m.computedAt).toLocaleString('en-US')}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {adding && (
        <AddFirmDialog
          requirementId={requirementId}
          match={adding}
          onClose={() => setAdding(null)}
          onDone={(text) => {
            setFlash({ id: adding.id, text, bad: false })
            setAdding(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

// ── Ask to add this firm ──────────────────────────────────────────────

interface Way {
  comesInAs: 'PRIME_VENDOR' | 'SUB_UNDER_MSP' | 'SUB_UNDER_PRIME'
  says: string
  under?: { id: string | null; name: string }[]
}

const WAY_WORD: Record<Way['comesInAs'], string> = {
  PRIME_VENDOR: 'As a prime vendor',
  SUB_UNDER_MSP: 'Under your program office',
  SUB_UNDER_PRIME: 'Under one of your prime vendors',
}

export function AddFirmDialog({
  requirementId,
  match,
  onClose,
  onDone,
}: {
  requirementId: string
  match: MatchRow
  onClose: () => void
  onDone: (says: string) => void
}) {
  const [info, setInfo] = useState<{ firm: { name: string }; says: string; ways: Way[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [way, setWay] = useState<Way['comesInAs']>('PRIME_VENDOR')
  const [under, setUnder] = useState<string>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/requirements/${requirementId}/matches/add-firm?matchId=${encodeURIComponent(match.id)}`)
      .then(readJson)
      .then((b) => setInfo(b.data))
      .catch((e: any) => setLoadError(e.message))
  }, [requirementId, match.id])

  const chosen = info?.ways.find((w) => w.comesInAs === way)
  const options = chosen?.under ?? []

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/requirements/${requirementId}/matches/add-firm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.id,
          comesInAs: way,
          underCompanyId: way === 'PRIME_VENDOR' ? null : under || null,
          reason: reason || undefined,
        }),
      })
      const body = await readJson(res)
      onDone(body.data?.says ?? 'Asked.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-firm-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-etyme-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-etyme-rule px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Suggested from matching</p>
            <h2 id="add-firm-title" className="headline-serif text-[20px] text-etyme-ink">
              Ask to add {match.firm.name}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-etyme-faint hover:text-etyme-ink text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loadError && <p className="text-[12px] text-etyme-danger">{loadError}</p>}
          {!info && !loadError && <p className="text-[12px] text-etyme-muted">Loading…</p>}
          {info && (
            <>
              <p className="text-[13px] text-etyme-muted">{info.says}</p>
              <fieldset className="space-y-2">
                <legend className="text-[12px] font-medium text-etyme-ink mb-1">How would {match.firm.name} work for you?</legend>
                {info.ways.map((w) => (
                  <label
                    key={w.comesInAs}
                    className={`block rounded-lg border px-3 py-2 cursor-pointer ${way === w.comesInAs ? 'border-etyme-action bg-etyme-action/5' : 'border-etyme-rule'}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="comesInAs"
                        checked={way === w.comesInAs}
                        onChange={() => {
                          setWay(w.comesInAs)
                          setUnder(w.under && w.under[0]?.id ? w.under[0].id : '')
                        }}
                      />
                      <span className="text-[13px] font-medium text-etyme-ink">{WAY_WORD[w.comesInAs]}</span>
                    </span>
                    <span className="block text-[12px] text-etyme-muted ml-6">{w.says}</span>
                  </label>
                ))}
              </fieldset>

              {way !== 'PRIME_VENDOR' && (
                <label className="block text-[12px] text-etyme-ink">
                  {way === 'SUB_UNDER_PRIME' ? 'Which prime vendor' : 'Which program office'}
                  {options.length === 0 ? (
                    <span className="block mt-1 text-[12px] text-etyme-muted">
                      You have no prime vendor to put them under yet. Add them as a prime vendor, or under a program office.
                    </span>
                  ) : (
                    <select
                      value={under}
                      onChange={(e) => setUnder(e.target.value)}
                      className="mt-1 w-full rounded-md border border-etyme-rule bg-etyme-surface px-3 py-2 text-[13px]"
                    >
                      {options.map((o) => (
                        <option key={o.id ?? 'etyme'} value={o.id ?? ''}>{o.name}</option>
                      ))}
                    </select>
                  )}
                </label>
              )}

              <label className="block text-[12px] text-etyme-ink">
                Anything the desks should know <span className="text-etyme-faint">(optional)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-etyme-rule bg-etyme-surface px-3 py-2 text-[13px]"
                />
              </label>

              <p className="text-[11px] text-etyme-faint">
                The request walks your supplier onboarding: department lead or program office, then Procurement, HR and Finance.
                The person&apos;s name and rate stay with {match.firm.name} until it is approved.
              </p>
              {error && <p className="text-[12px] text-etyme-danger" role="alert">{error}</p>}
            </>
          )}
        </div>

        <div className="border-t border-etyme-rule px-5 py-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-[12px]">Cancel</button>
          <button
            type="button"
            onClick={send}
            disabled={busy || !info || (way === 'SUB_UNDER_PRIME' && !under)}
            className="btn-primary text-[12px] disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Ask to add this firm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── The matches on a job request, as one section ──────────────────────

/**
 * Matches for this job, read and run from wherever the job request is.
 *
 * A client's Job requests menu opens `/dashboard/requisitions/[id]`, and
 * until 2026-09-30 the matches lived only on `/dashboard/requirements/[id]`,
 * which nothing on a client's menu linked to — a tester reached them by
 * typing the address. One section, used by both pages, so a client
 * reaches the matches from its own job request in one click and both
 * pages cannot drift into two versions of the same list.
 */
export function JobMatches({
  requirementId,
  requirementSkills,
  mayRun,
}: {
  requirementId: string
  requirementSkills: string[]
  /** Whether this reader may run matching here — the route says the same. */
  mayRun: boolean
}) {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [viewer, setViewer] = useState<MatchViewerInfo | null>(null)
  const [basis, setBasis] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ text: string; bad: boolean } | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`/api/requirements/${requirementId}/matches`)
      if (res.ok) {
        const body = await res.json()
        setMatches(body.data?.matches ?? [])
        setViewer(body.data?.viewer ?? null)
        setBasis(body.data?.basis ?? null)
      }
    } catch {
      // The section says there are no matches; the job request still reads.
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementId])

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch(`/api/requirements/${requirementId}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, forceRefresh: matches.length > 0 }),
      })
      const body = await readJson(res)
      setResult({ text: body.data?.message ?? `${body.data?.matchCount ?? 0} matches found`, bad: false })
      await load()
    } catch (e: any) {
      setResult({ text: e.message, bad: true })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="mb-8" aria-labelledby="job-matches">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 id="job-matches" className="font-serif text-lg text-etyme-ink">Matches for this job</h2>
        {mayRun && (
          <button type="button" onClick={run} disabled={running} className="btn-secondary text-[12px] px-3 py-1.5">
            {running ? 'Matching…' : matches.length > 0 ? 'Match again' : 'Find matches'}
          </button>
        )}
      </div>
      <p className="text-[12px] text-etyme-muted max-w-[75ch] mb-3">
        {viewer?.buyer
          ? 'Available people from your suppliers first, then from other firms you work with, then suggestions. Open a row to see why it fits.'
          : 'Your own people first, then the people your suppliers and partners offered you. Open a row to see why it fits.'}
        {basis ? ` ${basis}` : ''}
      </p>
      {result && (
        <p className={`mb-3 text-[12px] ${result.bad ? 'text-etyme-danger' : 'text-etyme-verified'}`} role="status">
          {result.text}
        </p>
      )}
      {!loaded ? (
        <p className="text-[12px] text-etyme-muted">Reading the matches…</p>
      ) : matches.length === 0 || !viewer ? (
        <div className="panel text-center py-8">
          <p className="text-sm text-etyme-ink font-medium mb-1">No matches yet</p>
          <p className="text-xs text-etyme-muted">
            {mayRun ? 'Check who is available before this goes to anyone new.' : 'Nobody has run matching on this job yet.'}
          </p>
        </div>
      ) : (
        <MatchList
          requirementId={requirementId}
          requirementSkills={requirementSkills}
          matches={matches}
          viewer={viewer}
          onChanged={load}
        />
      )}
    </section>
  )
}
