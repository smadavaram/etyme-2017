'use client'

import { readJson } from '@/lib/read-response'
import { desksOffered } from '@/lib/access-grant'
import { formatDay } from '@/lib/format-date'

import { useEffect, useState, useCallback } from 'react'
import { usePageSection } from '@/components/page-section'
import { Chip, EmptyState, ErrorState, Field, FormMessage, Input, Lbl, LoadingState, PageHead, Panel, RefusedState, Select, Stat, SubmitButton } from '@/components/ui'

/**
 * Who can do what here.
 *
 * Somebody signed in on your company's domain, got a Member seat, and sees
 * only their own pages and what is addressed to them. This is where a colleague decides what they may do — and the
 * screen leads with them, because a person sitting unable to work is more
 * urgent than a tidy list of everybody else.
 *
 * Every grant ends on a date. Renewing is a click; forgetting is safe.
 */

interface Waiting {
  contextId: string
  person: { id: string; name: string; primaryEmail: string }
  waitingDays: number
  /** The desk they will have when they come in, or null. */
  role: string | null
  roleId: string | null
  /**
   * "Invited today, not yet signed in · will have the AP Clerk desk", or
   * "joined 3 days ago". An invited person who never signed in waits here
   * whatever desk they were given, never under "Everyone with access".
   */
  said: string
}
interface Person {
  contextId: string
  person: { id: string; name: string; primaryEmail: string }
  role: string
  roleId: string
  /** The role, or "Member · give them a desk". */
  line: string
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

/** How long access runs, said the way somebody would say it. */
function until(iso: string | null): string {
  if (!iso) return 'no end date'
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (d < 0) return `ended ${Math.abs(d)} days ago`
  if (d === 0) return 'ends today'
  if (d <= 30) return `${d} days left`
  return `until ${formatDay(iso)}`
}

/**
 * Can they see it?
 *
 * etyme-market, 2026-09-17. A cross-domain line in etyme-regulatory's file,
 * on the precedent of c126c1c4 and f901e914: the sentence below named a real
 * company, which held this file out of the demo-names guard; renamed from the
 * sheet in docs/demo-names.md, nothing else touched.
 *
 * The question an administrator actually has, and the one no system
 * answers: somebody says "I cannot see the Talvern Medical contract", and
 * the only way to find out why is to read four sets of rules and guess.
 *
 * Paste the link they were on. It says why, in their terms, and what to
 * change — or that there is nothing to change, which is just as often the
 * answer and is worth saying out loud.
 */
/**
 * Answering "why can they not see this" reads `/api/why`, which asks for
 * the same permission inviting does — it names somebody else's role,
 * their account and their company's settings, which is not a thing to
 * hand to a stranger. A reader who does not hold it is told whose desk
 * it is rather than being given a picker and a 403.
 */
function CanTheySee({ people, mayAsk, whyNot }: { people: Person[]; mayAsk: boolean; whyNot: string | null }) {
  if (!mayAsk) {
    return (
      <section className="mb-10 pb-10 border-b border-etyme-rule">
        <h2 className="font-serif text-xl text-etyme-ink tracking-[-0.02em]">Can they see it?</h2>
        <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">{whyNot}</p>
      </section>
    )
  }
  return <CanTheySeeForm people={people} />
}

function CanTheySeeForm({ people }: { people: Person[] }) {
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
      setErr('Paste the link they were on — a contract, a consultant or an open job.')
      return
    }
    setAsking(true)
    try {
      const res = await fetch(`/api/why/${parsed.type}/${parsed.id}?person=${personId}`)
      const body = await readJson(res)
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
        <Select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          aria-label="Who"
          className="w-auto"
        >
          <option value="">Who?</option>
          {people.map((p) => (
            <option key={p.contextId} value={p.person.id}>
              {p.person.name} — {p.role}
            </option>
          ))}
        </Select>
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          aria-label="The link they were on"
          placeholder="Paste the link they were on"
          className="flex-1 min-w-[16rem] w-auto"
        />
        <SubmitButton
          type="button"
          onClick={ask}
          pending={asking}
          pendingLabel="Checking…"
          disabled={!personId || !ref.trim()}
        >
          Check
        </SubmitButton>
      </div>

      {err && <div className="mt-3"><FormMessage tone="error">{err}</FormMessage></div>}

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
  // The heading the reader's own menu puts over this page — Governance on
  // every firm's menu — never a "Settings" no menu has (sign-up walk,
  // round seven, problem 4). Nothing while the menu is not known.
  const section = usePageSection('/dashboard/access')
  const [data, setData] = useState<any>(null)
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // A refusal is not an error. It has no "Try again" — trying again
  // gives the same answer — and it is the route's own sentence.
  const [refused, setRefused] = useState<string | null>(null)
  const [granting, setGranting] = useState<string | null>(null)
  const [form, setForm] = useState({ roleId: '', days: '', reason: '' })
  const [invite, setInvite] = useState({ name: '', email: '', roleId: '' })
  const [inviting, setInviting] = useState(false)
  const [invited, setInvited] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  // Bring the team in by name: the account manager, HR, the contract
  // desk, finance. Each is emailed and seated with their role before
  // they sign in, so the client's Contacts page fills with the people
  // who work its account.
  async function sendInvite() {
    setInviting(true); setInvited(null)
    try {
      const res = await fetch('/api/access/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: invite.name.trim(), email: invite.email.trim(), roleId: invite.roleId || undefined }),
      })
      const j = await readJson(res)
      setInvited({ text: j.data.says ?? `${invite.email.trim()} has been invited.`, tone: 'ok' })
      setInvite({ name: '', email: '', roleId: '' })
      await load()
    } catch (e: any) {
      setInvited({ text: e.message, tone: 'error' })
    } finally {
      setInviting(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null); setRefused(null)
    try {
      const [ar, rr] = await Promise.all([
        fetch('/api/access'),
        fetch('/api/roles'),
      ])
      const a = await ar.json().catch(() => ({} as any))
      if (ar.status === 403) { setRefused(a.error?.message ?? 'This desk does not read the access register.'); return }
      if (a.error) throw new Error(a.error.message)
      const r = rr.ok ? await rr.json().catch(() => ({} as any)) : {}
      setData(a.data)
      setRoles(r?.data?.roles ?? [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function grant(contextId: string) {
    if (!form.roleId) { alert('Pick a desk'); return }
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
    let j: any
    try {
      j = await readJson(res)
    } catch (e: any) {
      // The server's own words where it sent any, and a sentence
      // rather than a parser error where it sent nothing.
      alert(e.message)
      return
    }
    const notes = j.data.notes?.length ? '\n\n' + j.data.notes.join('\n') : ''
    alert(j.data.message + notes)
    setGranting(null); setForm({ roleId: '', days: '', reason: '' })
    await load()
  }

  if (loading) return <LoadingState says="Reading who holds which desk…" />
  // A refusal is the route's sentence alone: no heading over it, no
  // counters and no forms, each of which the same route would refuse.
  if (refused) return (
    <RefusedState says={refused} />
  )
  // Anything else that broke is a fault, and a retry may change it.
  if (error) return (
    <div className="max-w-2xl">
      <ErrorState says={error} action={{ label: 'Try again', onClick: load }} />
    </div>
  )
  if (!data) return null

  const s = data.summary
  // Owner is offered only to an Owner; the route refuses the same.
  const pickable = desksOffered(roles, data.actorIsOwner === true)

  return (
    <div className="max-w-3xl">
      <PageHead
        eyebrow={section}
        title="Users & permissions"
        subtitle="Anyone signing in on your company’s email domain joins automatically as a Member. A Member sees their own pages and what is sent to them, and none of the firm’s pages, until somebody here gives them a desk."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Waiting" value={s.waiting} tone={s.waiting > 0 ? 'attention' : 'default'} />
        <Stat label="With access" value={s.withAccess} />
        <Stat label="Needs a decision" value={s.needsAttention} />
        <Stat label="Never used" value={s.dormant} sub="held but untouched" />
      </div>

      {/* Somebody sitting unable to work beats a tidy list of everybody else. */}
      {/* ── Invite a teammate ──
          Reading who holds what opened to the desks that audit it; the
          two acts on this page did not. A form the route will refuse is
          the button-that-lies one layer in, so a reader who cannot
          invite is told whose desk it is instead of being handed three
          boxes and a 403. */}
      <Panel title="Invite a teammate" className="mb-8">
        {data.canInvite === false ? (
          <p className="text-sm text-etyme-muted">{data.whyNotInvite}</p>
        ) : (
        <>
        <p className="text-sm text-etyme-muted mb-3">
          Name, email, and what they do here. They are emailed, and the seat is theirs the moment they sign in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_1fr_auto] gap-2 items-center">
          <Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Name" aria-label="Name" />
          <Input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="Work email" aria-label="Work email" />
          <Select value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })} aria-label="Role">
            <option value="">What they do here…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <SubmitButton type="button" onClick={sendInvite} pending={inviting} pendingLabel="Inviting…"
            disabled={!invite.email.includes('@')}>
            Invite
          </SubmitButton>
        </div>
        {invited && <div className="mt-2"><FormMessage tone={invited.tone === 'ok' ? 'ok' : 'error'}>{invited.text}</FormMessage></div>}
        </>
        )}
      </Panel>

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
                      {w.person.primaryEmail} · {w.said}
                    </div>
                  </div>
                  {data.canGrant === false ? (
                    <span className="max-w-[380px] text-xs text-etyme-muted shrink-0">{data.whyNotGrant}</span>
                  ) : (
                    <button
                      onClick={() => setGranting(granting === w.contextId ? null : w.contextId)}
                      className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 shrink-0">
                      {granting === w.contextId ? 'Cancel' : w.role ? 'Change desk' : 'Give them access'}
                    </button>
                  )}
                </div>

                {granting === w.contextId && (
                  <div className="mt-4 pt-4 border-t border-etyme-rule flex flex-col gap-3">
                    <Field label="What can they do?">
                      <Select value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>
                        <option value="">— pick a role —</option>
                        {pickable.filter(r => r.id !== w.roleId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                    </Field>
                    {/* etyme-market, 2026-09-17. A cross-domain line in
                        etyme-regulatory's file, on the precedent of c126c1c4
                        and f901e914: the placeholder below named a real
                        company on a live screen, and a trademark inside our
                        own product is a claim that they use it. Replaced from
                        the sheet in docs/demo-names.md. Nothing else in this
                        file was touched — who may grant what, and for how
                        long, is etyme-regulatory's and is unchanged. */}
                    <Field label="Why do they need it?" help="Whoever reviews this in six months is probably not you.">
                      <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                        placeholder="Joining the Talvern Medical delivery team" />
                    </Field>
                    <Field label="For how long?" help="Access ends on a date. Renewing takes a click.">
                      <Input value={form.days} onChange={e => setForm({ ...form, days: e.target.value })}
                        placeholder="leave blank for the usual" type="number"
                        className="w-40 tabular-nums" />
                    </Field>
                    <SubmitButton type="button" onClick={() => grant(w.contextId)} className="self-start">
                      Grant it
                    </SubmitButton>
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

      <CanTheySee
        people={data.people}
        mayAsk={data.canInvite !== false}
        whyNot={data.whyNotExplain}
      />

      <section>
        <h2 className="font-serif text-lg text-etyme-ink mb-3">Everyone with access</h2>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.people.length === 0 && (
            <EmptyState compact says="Nobody has access yet." />
          )}
          {data.people.map((p: Person) => (
            <div key={p.contextId} className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-etyme-ink">{p.person.name}</div>
                  <div className={`text-xs ${p.line !== p.role ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
                    {p.line}{p.reason ? <span className="text-etyme-muted">{` · ${p.reason}`}</span> : ''}
                  </div>
                </div>
                <div className="text-xs text-etyme-muted shrink-0 w-32 text-right">{until(p.expiresAt)}</div>
                <div className="w-24 text-right shrink-0">
                  <Chip tone={p.sensitivity === 'CRITICAL' ? 'attention' : 'passive'}>
                    {p.sensitivity.toLowerCase().replace('_', ' ')}
                  </Chip>
                </div>
                {/* Change desk, on every row. A desk given on arrival is
                    rarely the right one, and an owner with no way to
                    change it has a seat nobody can use. Hidden from a
                    reader the route would refuse, with the reason said
                    once above in "Waiting for access". */}
                {data.canGrant !== false && (
                  <button
                    onClick={() => {
                      setGranting(granting === p.contextId ? null : p.contextId)
                      setForm({ roleId: '', days: '', reason: '' })
                    }}
                    className="px-3 py-1.5 border border-etyme-rule rounded text-[13px] text-etyme-action hover:bg-etyme-action/5 shrink-0">
                    {granting === p.contextId ? 'Cancel' : 'Change desk'}
                  </button>
                )}
              </div>

              {granting === p.contextId && (
                <div className="mt-4 pt-4 border-t border-etyme-rule flex flex-col gap-3">
                  <Field label="New desk">
                    <Select value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>
                      <option value="">— pick a desk —</option>
                      {pickable.filter(r => r.id !== p.roleId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Why?" help="Whoever reviews this in six months is probably not you.">
                    <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                      placeholder="Runs the client's bills from this month" />
                  </Field>
                  <Field label="For how long?">
                    <Input value={form.days} onChange={e => setForm({ ...form, days: e.target.value })}
                      placeholder="leave blank for the usual" type="number"
                      className="w-40 tabular-nums" />
                  </Field>
                  <SubmitButton type="button" onClick={() => grant(p.contextId)} className="self-start">
                    Change desk
                  </SubmitButton>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
