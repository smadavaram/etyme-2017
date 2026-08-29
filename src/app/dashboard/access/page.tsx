'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Who can do what here.
 *
 * Somebody signed in on your company's domain, got a seat, and can see
 * nothing. This is where a colleague decides what they may do — and the
 * screen leads with them, because a person sitting unable to work is more
 * urgent than a tidy list of everybody else.
 *
 * Every grant ends on a date. Renewing is a click; forgetting is safe.
 */

interface Waiting {
  contextId: string
  person: { id: string; name: string; primaryEmail: string }
  waitingDays: number
}
interface Person {
  contextId: string
  person: { id: string; name: string; primaryEmail: string }
  role: string
  sensitivity: string
  expiresAt: string | null
  lastUsedAt: string | null
  reason: string | null
}
interface Finding {
  contextId: string
  personName: string
  roleName: string
  finding: string
  detail: string
  suggestion: string | null
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Chip({ children, tone = 'passive' }: {
  children: React.ReactNode
  tone?: 'attention' | 'verified' | 'action' | 'passive'
}) {
  const tones = {
    attention: 'bg-etyme-attention/10 text-etyme-attention',
    verified: 'bg-etyme-verified/10 text-etyme-verified',
    action: 'bg-etyme-action/10 text-etyme-action',
    passive: 'bg-etyme-rule/50 text-etyme-muted',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

/** How long access runs, said the way somebody would say it. */
function until(iso: string | null): string {
  if (!iso) return 'no end date'
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (d < 0) return `ended ${Math.abs(d)} days ago`
  if (d === 0) return 'ends today'
  if (d <= 30) return `${d} days left`
  return `until ${iso.slice(0, 10)}`
}

/**
 * Can they see it?
 *
 * The question an administrator actually has, and the one no system
 * answers: somebody says "I cannot see the Nike contract", and the only
 * way to find out why is to read four sets of rules and guess.
 *
 * Paste the link they were on. It says why, in their terms, and what to
 * change — or that there is nothing to change, which is just as often the
 * answer and is worth saying out loud.
 */
function CanTheySee({ people }: { people: Person[] }) {
  const [personId, setPersonId] = useState('')
  const [ref, setRef] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // A URL, or a bare id. Somebody debugging access has a link in their
  // hand, not an identifier.
  function readRef(raw: string): { type: string; id: string } | null {
    const v = raw.trim()
    const known: Record<string, string> = {
      contracts: 'contract',
      consultants: 'consultant',
      requirements: 'requirement',
    }
    const m = v.match(/\/(contracts|consultants|requirements)\/([A-Za-z0-9_-]+)/)
    if (m) return { type: known[m[1]], id: m[2] }
    const q = v.match(/[?&]id=([A-Za-z0-9_-]+)/)
    if (q) {
      const t = Object.keys(known).find((k) => v.includes(`/${k}`))
      if (t) return { type: known[t], id: q[1] }
    }
    return null
  }

  async function ask() {
    const parsed = readRef(ref)
    setErr(null)
    setAnswer(null)
    if (!parsed) {
      setErr('Paste the link they were on — a contract, a consultant or an open role.')
      return
    }
    setAsking(true)
    try {
      const res = await fetch(`/api/why/${parsed.type}/${parsed.id}?person=${personId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setAnswer(body.data)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setAsking(false)
    }
  }

  return (
    <section className="mb-10 pb-10 border-b border-etyme-rule">
      <h2 className="font-serif text-xl text-etyme-ink tracking-[-0.02em]">Can they see it?</h2>
      <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">
        Somebody says they cannot see something. Pick them, paste the link they were on, and
        this says why — and which of the two things to change.
      </p>

      <div className="flex flex-wrap gap-2 mt-4">
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm"
        >
          <option value="">Who?</option>
          {people.map((p) => (
            <option key={p.contextId} value={p.person.id}>
              {p.person.name} — {p.role}
            </option>
          ))}
        </select>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Paste the link they were on"
          className="flex-1 min-w-[16rem] px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm"
        />
        <button
          onClick={ask}
          disabled={asking || !personId || !ref.trim()}
          className="px-3 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
        >
          {asking ? 'Checking…' : 'Check'}
        </button>
      </div>

      {err && <p className="text-[13px] text-etyme-attention mt-3">{err}</p>}

      {answer && (
        <div className="mt-4 bg-etyme-surface border border-etyme-rule rounded-lg p-4">
          <div className="flex items-baseline gap-2">
            <Chip tone={answer.visible ? 'verified' : 'attention'}>
              {answer.visible ? 'can see it' : 'cannot see it'}
            </Chip>
            <span className="text-[13px] text-etyme-muted">{answer.subject}</span>
          </div>

          <p className="text-[15px] text-etyme-ink mt-3">{answer.because}</p>
          {answer.fix && <p className="text-[14px] text-etyme-muted mt-1.5">{answer.fix}</p>}

          {/* The working, not just the verdict. An administrator who cannot
              see which rule decided is left trusting a black box. */}
          <div className="mt-4 pt-3 border-t border-etyme-rule space-y-1.5">
            {answer.checks.map((c: any) => (
              <div key={c.rule} className="flex gap-2 text-[13px]">
                <span className={c.passed ? 'text-etyme-verified' : 'text-etyme-attention'}>
                  {c.passed ? '✓' : '✗'}
                </span>
                <span className="text-etyme-muted">{c.said}</span>
              </div>
            ))}
          </div>

          {answer.visible && answer.hidden.length > 0 && (
            <div className="mt-4 pt-3 border-t border-etyme-rule">
              <Lbl>Hidden from them on it</Lbl>
              <div className="mt-1.5 space-y-1">
                {answer.hidden.map((h: any) => (
                  <div key={h.field} className="text-[13px] text-etyme-muted">
                    <span className="text-etyme-ink">{h.field}</span> — {h.because}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function AccessPage() {
  const [data, setData] = useState<any>(null)
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granting, setGranting] = useState<string | null>(null)
  const [form, setForm] = useState({ roleId: '', days: '', reason: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [a, r] = await Promise.all([
        fetch('/api/access').then(x => x.json()),
        fetch('/api/roles').then(x => x.json()).catch(() => ({})),
      ])
      if (a.error) throw new Error(a.error.message)
      setData(a.data)
      setRoles(r?.data?.roles ?? [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function grant(contextId: string) {
    if (!form.roleId) { alert('Pick a role'); return }
    const res = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId,
        roleId: form.roleId,
        days: form.days ? parseInt(form.days, 10) : null,
        reason: form.reason,
      }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error?.message ?? 'Could not grant that'); return }
    const notes = j.data.notes?.length ? '\n\n' + j.data.notes.join('\n') : ''
    alert(j.data.message + notes)
    setGranting(null); setForm({ roleId: '', days: '', reason: '' })
    await load()
  }

  if (loading) return <div className="text-etyme-muted py-12 text-center">Loading…</div>
  if (error) return (
    <div className="max-w-2xl border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
      <div className="text-etyme-attention font-medium">{error}</div>
      <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
    </div>
  )
  if (!data) return null

  const s = data.summary
  const field = 'px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink focus:outline-none focus:border-etyme-action'

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <Lbl>Settings</Lbl>
        <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Who can do what</h1>
        <p className="text-etyme-muted mt-2 max-w-2xl">
          Anyone signing in on your company&apos;s email domain joins automatically and
          can see nothing until somebody here decides what they may do.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
        <div>
          <Lbl>Waiting on you</Lbl>
          <div className={`font-serif text-3xl mt-1 tabular-nums ${s.waiting > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {s.waiting}
          </div>
        </div>
        <div>
          <Lbl>With access</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.withAccess}</div>
        </div>
        <div>
          <Lbl>Needs a decision</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.needsAttention}</div>
        </div>
        <div>
          <Lbl>Never used</Lbl>
          <div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.dormant}</div>
          <div className="text-xs text-etyme-muted">held but untouched</div>
        </div>
      </div>

      {/* Somebody sitting unable to work beats a tidy list of everybody else. */}
      {data.waitingForAccess.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-etyme-ink mb-3">Waiting for access</h2>
          <div className="bg-etyme-surface border border-etyme-attention/30 rounded-lg divide-y divide-etyme-rule">
            {data.waitingForAccess.map((w: Waiting) => (
              <div key={w.contextId} className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-etyme-ink">{w.person.name}</div>
                    <div className="text-xs text-etyme-muted">
                      {w.person.primaryEmail} · joined {w.waitingDays === 0 ? 'today' : `${w.waitingDays} days ago`}
                    </div>
                  </div>
                  <button
                    onClick={() => setGranting(granting === w.contextId ? null : w.contextId)}
                    className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 shrink-0">
                    {granting === w.contextId ? 'Cancel' : 'Give them access'}
                  </button>
                </div>

                {granting === w.contextId && (
                  <div className="mt-4 pt-4 border-t border-etyme-rule flex flex-col gap-3">
                    <label className="block">
                      <Lbl>What can they do?</Lbl>
                      <select value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}
                        className={`${field} w-full mt-1`}>
                        <option value="">— pick a role —</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <Lbl>Why do they need it?</Lbl>
                      <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                        placeholder="Joining the Terumo delivery team"
                        className={`${field} w-full mt-1`} />
                      <p className="text-xs text-etyme-muted mt-1">
                        Whoever reviews this in six months is probably not you.
                      </p>
                    </label>
                    <label className="block">
                      <Lbl>For how long?</Lbl>
                      <input value={form.days} onChange={e => setForm({ ...form, days: e.target.value })}
                        placeholder="leave blank for the usual" type="number"
                        className={`${field} w-40 mt-1 tabular-nums`} />
                      <p className="text-xs text-etyme-muted mt-1">
                        Access ends on a date. Renewing takes a click.
                      </p>
                    </label>
                    <button onClick={() => grant(w.contextId)}
                      className="self-start px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
                      Grant it
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Only what needs a decision. A review listing everybody is a review
          nobody reads. */}
      {data.review.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-etyme-ink mb-3">Worth a look</h2>
          <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
            {data.review.map((r: Finding) => (
              <div key={r.contextId + r.finding} className={`p-4 border-l-2 ${
                r.finding === 'EXPIRED' || r.finding === 'DORMANT'
                  ? 'border-etyme-attention' : 'border-etyme-rule'
              }`}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-etyme-ink">
                    {r.personName} <span className="text-etyme-muted">· {r.roleName}</span>
                  </span>
                  <Chip tone={r.finding === 'EXPIRED' || r.finding === 'DORMANT' ? 'attention' : 'passive'}>
                    {r.finding.toLowerCase()}
                  </Chip>
                </div>
                <p className="text-sm text-etyme-muted mt-0.5">{r.detail}</p>
                {r.suggestion && <p className="text-sm text-etyme-ink mt-1">{r.suggestion}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <CanTheySee people={data.people} />

      <section>
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Everyone with access</h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.people.length === 0 && (
            <div className="p-6 text-center text-sm text-etyme-muted">Nobody has access yet.</div>
          )}
          {data.people.map((p: Person) => (
            <div key={p.contextId} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-etyme-ink">{p.person.name}</div>
                <div className="text-xs text-etyme-muted">
                  {p.role}{p.reason ? ` · ${p.reason}` : ''}
                </div>
              </div>
              <div className="text-xs text-etyme-muted shrink-0 w-32 text-right">{until(p.expiresAt)}</div>
              <div className="w-24 text-right shrink-0">
                <Chip tone={p.sensitivity === 'CRITICAL' ? 'attention' : 'passive'}>
                  {p.sensitivity.toLowerCase().replace('_', ' ')}
                </Chip>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
