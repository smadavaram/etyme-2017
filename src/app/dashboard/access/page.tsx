'use client'

import { readJson, statusMeans } from '@/lib/read-response'
import { desksOffered, INVITE_ADDRESS_MISSING, looksLikeAddress, type InviteForm } from '@/lib/access-grant'
import { formatDay } from '@/lib/format-date'
import { GiveAccess } from '@/components/settings/give-access'
import {
  ACT_LABEL, ASKS, WITHDRAW_LABEL, lifecycleBody, nameWithAddress, daysUntilEndDay, tomorrowField,
  type LifecycleAction, type RowOffer,
} from '@/app/api/access/row-acts'

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

/** The sign-in address, or null where there is none to show (the shared sample's, or none at all). */
interface Waiting {
  contextId: string
  person: { id: string; name: string; primaryEmail: string | null }
  waitingDays: number
  /** The desk they will have when they come in, or null. */
  role: string | null
  roleId: string | null
  /**
   * "Invited today, not yet signed in · will have the AP Clerk role", or
   * "joined 3 days ago". An invited person who never signed in waits here
   * whatever desk they were given, never under "Everyone with access".
   */
  said: string
  /** The day this seat ends, set before they arrive, or null. */
  expiresAt?: string | null
  acts?: RowOffer
}
interface Person {
  contextId: string
  person: { id: string; name: string; primaryEmail: string | null }
  role: string
  roleId: string
  /** The role, or "Member · give them a role". */
  line: string
  sensitivity: string
  expiresAt: string | null
  lastUsedAt: string | null
  reason: string | null
  /** Why the seat is paused, where it is. */
  pausedReason?: string | null
  acts?: RowOffer
}
interface Finding {
  contextId: string
  personName: string
  personEmail?: string | null
  roleName: string
  finding: string
  detail: string
  suggestion: string | null
}

/** When access ends, as a day through the shared formatter: "ends Mar 3, 2027", or "no end date". */
function until(iso: string | null | undefined): string {
  if (!iso) return 'no end date'
  return new Date(iso).getTime() < Date.now() ? `ended ${formatDay(iso)}` : `ends ${formatDay(iso)}`
}

/**
 * The sign-in address under a name. A long address is cut with an
 * ellipsis at phone width and shown whole on hover or a long press, so the
 * role line under it stays on the screen. Nothing at all where there is
 * no address.
 */
function Address({ email }: { email: string | null | undefined }) {
  if (!email) return null
  return (
    <div className="text-xs text-etyme-muted truncate select-all" title={email}>{email}</div>
  )
}

/** What a row can be asked to do on this page: the three lifecycle acts, and withdrawing an invitation. */
type RowAction = LifecycleAction | 'withdraw'

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

/**
 * A route's answer, read here rather than through `readJson`, which keeps
 * a refusal's sentence and drops its link: the Owner refusal on Change
 * role carries `href` to Settings → Owners, and the page shows it.
 */
interface Said { contextId: string; text: string; tone: 'ok' | 'error'; href?: string | null; notes?: string[] }

interface Read { ok: boolean; data?: any; text: string; href: string | null; endInstead?: boolean; field?: string | null }

async function postAndRead(url: string, body: unknown): Promise<Read> {
  return sendAndRead(url, 'POST', body)
}

async function sendAndRead(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<Read> {
  let res: Response
  try {
    res = await fetch(url, body === undefined
      ? { method }
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    return { ok: false, text: 'That did not reach Etyme. Check the connection and press again.', href: null }
  }
  const raw = await res.text().catch(() => '')
  let j: any = null
  try { j = raw ? JSON.parse(raw) : null } catch { j = null }
  if (res.ok && j?.data) return { ok: true, data: j.data, text: j.data.message ?? j.data.says ?? 'Done.', href: null }
  return {
    ok: false,
    text: j?.error?.message ?? statusMeans(res.status),
    href: typeof j?.error?.href === 'string' ? j.error.href : null,
    endInstead: j?.error?.endInstead === true,
    field: typeof j?.error?.field === 'string' ? j.error.field : null,
  }
}

/** The answer under a row: the route's own sentence, and its link where it sent one. */
function RowSaid({ said }: { said: Said }) {
  return (
    <div className="mt-3">
      <FormMessage tone={said.tone}>
        {said.text}
        {said.notes?.length ? said.notes.map((n) => <span key={n} className="block mt-1">{n}</span>) : null}
        {said.href && (
          <a href={said.href} className="block mt-1 text-etyme-action underline">
            {said.href === '/dashboard/settings/owners' ? 'Open Settings → Owners' : 'Open it'}
          </a>
        )}
      </FormMessage>
    </div>
  )
}

/**
 * Pause, Reinstate and End on one row, each drawn only where the register
 * says the route would take it. Pause and End ask for the reason in a
 * field on the page; Reinstate asks nothing. A waiting row draws Withdraw
 * invitation in their place, and End access only once withdrawing was
 * refused because the person has history (`keptEnd`).
 */
function RowActs({ contextId, acts, open, onOpen, keptEnd }: {
  contextId: string
  acts: RowOffer | undefined
  open: RowAction | null
  onOpen: (contextId: string, action: RowAction | null) => void
  keptEnd: boolean
}) {
  if (!acts) return null
  const offered: RowAction[] = []
  if (acts.withdraw) offered.push('withdraw')
  if (acts.pause) offered.push('suspend')
  if (acts.reinstate) offered.push('reinstate')
  if (acts.end || (acts.endInstead && keptEnd)) offered.push('revoke')
  if (offered.length === 0) return null
  return (
    <>
      {offered.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onOpen(contextId, open === a ? null : a)}
          className={`px-3 py-1.5 border border-etyme-rule rounded text-[13px] shrink-0 hover:bg-etyme-action/5 ${a === 'revoke' || a === 'withdraw' ? 'text-etyme-danger' : 'text-etyme-action'}`}>
          {open === a ? 'Cancel' : a === 'withdraw' ? WITHDRAW_LABEL : ACT_LABEL[a]}
        </button>
      ))}
    </>
  )
}

function ActForm({ action, acts, name, email, reason, setReason, pending, onSubmit }: {
  action: RowAction
  acts: RowOffer | undefined
  name: string
  /** Said beside the name, so the form names which person (founder, 2026-11-12). */
  email: string | null | undefined
  reason: string
  setReason: (v: string) => void
  pending: boolean
  onSubmit: () => void
}) {
  const who = nameWithAddress(name, email)
  const says = action === 'suspend' ? acts?.pauseSays ?? []
    : action === 'revoke' ? acts?.endSays ?? []
      : action === 'withdraw' ? acts?.withdrawSays ?? [] : []
  return (
    <div className="mt-4 pt-4 border-t border-etyme-rule flex flex-col gap-3">
      {says.length > 0 && (
        <ul className="text-[13px] text-etyme-muted list-disc pl-5 space-y-0.5">
          {says.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      {action === 'withdraw' && (
        <p className="text-[13px] text-etyme-ink break-words">Withdraw the invitation to {who}?</p>
      )}
      {action !== 'withdraw' && ASKS[action].includes('reason') && (
        <Field
          label={action === 'suspend' ? `Why is ${who} being paused?` : `Why is ${who}’s access ending?`}
          help={action === 'suspend' ? 'They are told this, and somebody will ask later.' : 'It goes on the record with your name.'}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason"
            placeholder={action === 'suspend' ? 'On leave until March' : 'Left the company on Friday'} />
        </Field>
      )}
      {action === 'reinstate' && <p className="text-[13px] text-etyme-ink break-words">Put {who} back with the role they had.</p>}
      <SubmitButton type="button" onClick={onSubmit} pending={pending} pendingLabel="Saving…" className="self-start">
        {action === 'reinstate' ? `Reinstate ${name}` : action === 'suspend' ? `Pause ${name}` : action === 'withdraw' ? 'Withdraw it' : `End ${name}’s access`}
      </SubmitButton>
    </div>
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
  // "Ends on" is a calendar day; the route takes days, worked out on Grant.
  const [form, setForm] = useState({ roleId: '', endsOn: '', reason: '' })
  const [endsOnError, setEndsOnError] = useState<string | null>(null)
  const [invite, setInvite] = useState({ name: '', email: '', roleId: '' })
  const [inviting, setInviting] = useState(false)
  const [invited, setInvited] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  // What is wrong with the address, beside its box, after Invite is pressed.
  const [addressError, setAddressError] = useState<string | null>(null)
  // Pause, Reinstate, End or Withdraw open on one row, with its reason field.
  const [acting, setActing] = useState<{ contextId: string; action: RowAction } | null>(null)
  // Waiting rows whose withdraw was refused on history: End access is drawn there.
  const [keptEnd, setKeptEnd] = useState<Set<string>>(new Set())
  const [actReason, setActReason] = useState('')
  const [actPending, setActPending] = useState(false)
  // The route's own sentence under the row it was about. Kept outside
  // the data, so it stays on the page after the register is read again.
  const [said, setSaid] = useState<Said | null>(null)

  // Bring the team in by name: the account manager, HR, the contract
  // desk, finance. Each is emailed and seated with their role before
  // they sign in, so the client's Contacts page fills with the people
  // who work its account.
  async function sendInvite() {
    // Never a greyed button with no words: the press says what is missing, beside the box.
    if (!looksLikeAddress(invite.email)) { setAddressError(INVITE_ADDRESS_MISSING); setInvited(null); return }
    setAddressError(null)
    setInviting(true); setInvited(null)
    try {
      const r = await sendAndRead('/api/access/invite', 'POST', {
        name: invite.name.trim(), email: invite.email.trim(), roleId: invite.roleId || undefined,
      })
      if (!r.ok) {
        // A refusal about the address is said beside the address box.
        if (r.field === 'email') setAddressError(r.text)
        else setInvited({ text: r.text, tone: 'error' })
        return
      }
      setInvited({ text: r.data?.says ?? `${invite.email.trim()} has been invited.`, tone: 'ok' })
      setInvite({ name: '', email: '', roleId: '' })
      await load()
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
      if (ar.status === 403) { setRefused(a.error?.message ?? 'Your role does not read the access register.'); return }
      if (a.error) throw new Error(a.error.message)
      const r = rr.ok ? await rr.json().catch(() => ({} as any)) : {}
      setData(a.data)
      setRoles(r?.data?.roles ?? [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function grant(contextId: string) {
    if (!form.roleId) { setSaid({ contextId, text: 'Pick a role first.', tone: 'error' }); return }
    let days: number | null = null
    if (form.endsOn) {
      const d = daysUntilEndDay(form.endsOn)
      if ('says' in d) { setEndsOnError(d.says); return }
      days = d.days
    }
    setEndsOnError(null)
    const r = await postAndRead('/api/access', {
      contextId,
      roleId: form.roleId,
      days,
      reason: form.reason,
    })
    if (!r.ok) { setSaid({ contextId, text: r.text, tone: 'error', href: r.href }); return }
    setSaid({ contextId, text: r.text, tone: 'ok', notes: r.data?.notes ?? [] })
    setGranting(null); setForm({ roleId: '', endsOn: '', reason: '' })
    await load()
  }

  function openAct(contextId: string, action: RowAction | null) {
    setActing(action ? { contextId, action } : null)
    setActReason('')
    setGranting(null)
    if (said?.contextId === contextId) setSaid(null)
  }

  async function act(contextId: string, action: RowAction) {
    setActPending(true)
    try {
      const r = action === 'withdraw'
        ? await sendAndRead(`/api/access/${contextId}`, 'DELETE')
        : await postAndRead(`/api/access/${contextId}`, lifecycleBody(action, { reason: actReason }))
      setSaid({ contextId, text: r.text, tone: r.ok ? 'ok' : 'error', href: r.href })
      // Refused because they have history: the sentence says to end their
      // access, and End access stays on the row to do it.
      if (!r.ok && r.endInstead) {
        setKeptEnd((k) => new Set(k).add(contextId))
        setActing(null)
      }
      if (r.ok) {
        setActing(null); setActReason('')
        await load()
      }
    } finally {
      setActPending(false)
    }
  }

  if (loading) return <LoadingState says="Reading who holds which role…" />
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
        subtitle="Anyone signing in on your company’s email domain joins automatically as a Member. A Member sees their own pages and what is sent to them, and none of the firm’s pages, until somebody here gives them a role."
      />

      {/* ── Invite a teammate ──
          First, before the figures (founder, 2026-11-12): on a phone the
          four figures stacked one per row pushed the form below the fold.
          Reading who holds what opened to the desks that audit it; the
          two acts on this page did not. A form the route will refuse is
          the button-that-lies one layer in, so a reader who cannot
          invite is told whose role it is instead of being handed three
          boxes and a 403. The label and the line under the address follow
          the company's sign-in mode, sent only to a reader who may invite. */}
      <Panel title="Invite a teammate" className="mb-8">
        {data.canInvite === false ? (
          <p className="text-sm text-etyme-muted">{data.whyNotInvite}</p>
        ) : (
        <>
        <p className="text-sm text-etyme-muted mb-3">
          Name, email, and what they do here. Where email can be sent from here, they get a link by email; the seat is theirs the moment they sign in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_1fr_auto] gap-3 items-start">
          <Field label="Name (optional)">
            <Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Name (optional)" />
          </Field>
          <Field label={(data.invite as InviteForm | undefined)?.emailLabel ?? 'Email address'}
            help={(data.invite as InviteForm | undefined)?.hint}
            error={addressError}>
            <Input value={invite.email} type="email" autoComplete="off"
              onChange={(e) => { setInvite({ ...invite, email: e.target.value }); if (addressError) setAddressError(null) }}
              placeholder="name@example.com" />
          </Field>
          <Field label="What they do here">
            <Select value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })}>
              <option value="">Pick a role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          {/* Always pressable: a missing or half address is said beside the box. */}
          <SubmitButton type="button" onClick={sendInvite} pending={inviting} pendingLabel="Inviting…" className="sm:mt-[22px] self-start">
            Invite
          </SubmitButton>
        </div>
        {invited && <div className="mt-2"><FormMessage tone={invited.tone === 'ok' ? 'ok' : 'error'}>{invited.text}</FormMessage></div>}
        </>
        )}
      </Panel>

      {/* Somebody sitting unable to work beats a tidy list of everybody else. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Waiting" value={s.waiting} tone={s.waiting > 0 ? 'attention' : 'default'} />
        <Stat label="With access" value={s.withAccess} />
        <Stat label="Needs a decision" value={s.needsAttention} />
        <Stat label="Never used" value={s.dormant} sub="held but untouched" />
      </div>

      {data.waitingForAccess.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-etyme-ink mb-3">Waiting for access</h2>
          <div className="bg-etyme-surface border border-etyme-attention/30 rounded-lg divide-y divide-etyme-rule">
            {data.waitingForAccess.map((w: Waiting) => (
              <div key={w.contextId} className="p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex-1 min-w-[12rem]">
                    <div className="text-etyme-ink">{w.person.name}</div>
                    <Address email={w.person.primaryEmail} />
                    <div className="text-xs text-etyme-muted">{w.said} · {until(w.expiresAt)}</div>
                  </div>
                  {data.canGrant === false ? (
                    <span className="max-w-[380px] text-xs text-etyme-muted shrink-0">{data.whyNotGrant}</span>
                  ) : (
                    <button
                      onClick={() => { setGranting(granting === w.contextId ? null : w.contextId); setActing(null) }}
                      className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 shrink-0">
                      {granting === w.contextId ? 'Cancel' : w.role ? 'Change role' : 'Give them access'}
                    </button>
                  )}
                  <RowActs contextId={w.contextId} acts={w.acts} keptEnd={keptEnd.has(w.contextId)}
                    open={acting?.contextId === w.contextId ? acting.action : null} onOpen={openAct} />
                </div>

                {acting?.contextId === w.contextId && (
                  <ActForm action={acting.action} acts={w.acts} name={w.person.name} email={w.person.primaryEmail}
                    reason={actReason} setReason={setActReason} pending={actPending}
                    onSubmit={() => act(w.contextId, acting.action)} />
                )}

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
                    <Field label="Ends on" help="Leave it empty for the usual length. Renewing takes a click." error={endsOnError}>
                      <Input value={form.endsOn} onChange={e => { setForm({ ...form, endsOn: e.target.value }); setEndsOnError(null) }}
                        type="date" min={tomorrowField()} className="w-48 tabular-nums" />
                    </Field>
                    <SubmitButton type="button" onClick={() => grant(w.contextId)} className="self-start">
                      Grant it
                    </SubmitButton>
                  </div>
                )}
                {said?.contextId === w.contextId && <RowSaid said={said} />}
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
                  <span className="text-etyme-ink min-w-0">
                    {r.personName} <span className="text-etyme-muted">· {r.roleName}</span>
                    <Address email={r.personEmail} />
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
        {/* A seat that was ended leaves the register, so its sentence is said here. */}
        {said && !data.people.some((p: Person) => p.contextId === said.contextId)
          && !data.waitingForAccess.some((w: Waiting) => w.contextId === said.contextId)
          && <div className="mb-3"><RowSaid said={said} /></div>}
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {data.people.length === 0 && (
            <EmptyState compact says="Nobody has access yet." />
          )}
          {data.people.map((p: Person) => (
            <div key={p.contextId} className="p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex-1 min-w-[12rem]">
                  <div className="text-etyme-ink">{p.person.name}</div>
                  <Address email={p.person.primaryEmail} />
                  <div className={`text-xs ${p.line !== p.role ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
                    {p.line}{p.reason ? <span className="text-etyme-muted">{` · ${p.reason}`}</span> : ''}
                  </div>
                  {p.acts?.state === 'SUSPENDED' && (
                    <div className="text-xs text-etyme-attention mt-0.5">
                      Paused{p.pausedReason ? `: ${p.pausedReason}` : ''}
                    </div>
                  )}
                </div>
                <div className="text-xs text-etyme-muted shrink-0 sm:w-36 sm:text-right">{until(p.expiresAt)}</div>
                <div className="sm:w-24 sm:text-right shrink-0">
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
                      setForm({ roleId: '', endsOn: '', reason: '' })
                      setActing(null)
                    }}
                    className="px-3 py-1.5 border border-etyme-rule rounded text-[13px] text-etyme-action hover:bg-etyme-action/5 shrink-0">
                    {granting === p.contextId ? 'Cancel' : 'Change role'}
                  </button>
                )}
                <RowActs contextId={p.contextId} acts={p.acts} keptEnd={keptEnd.has(p.contextId)}
                  open={acting?.contextId === p.contextId ? acting.action : null} onOpen={openAct} />
              </div>

              {acting?.contextId === p.contextId && (
                <ActForm action={acting.action} acts={p.acts} name={p.person.name} email={p.person.primaryEmail}
                  reason={actReason} setReason={setActReason} pending={actPending}
                  onSubmit={() => act(p.contextId, acting.action)} />
              )}

              {granting === p.contextId && (
                <div className="mt-4 pt-4 border-t border-etyme-rule flex flex-col gap-3">
                  <Field label="New role">
                    <Select value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>
                      <option value="">— pick a role —</option>
                      {pickable.filter(r => r.id !== p.roleId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Why?" help="Whoever reviews this in six months is probably not you.">
                    <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                      placeholder="Runs the client's bills from this month" />
                  </Field>
                  <Field label="Ends on" help="Leave it empty for the usual length." error={endsOnError}>
                    <Input value={form.endsOn} onChange={e => { setForm({ ...form, endsOn: e.target.value }); setEndsOnError(null) }}
                      type="date" min={tomorrowField()} className="w-48 tabular-nums" />
                  </Field>
                  <SubmitButton type="button" onClick={() => grant(p.contextId)} className="self-start">
                    Change role
                  </SubmitButton>
                </div>
              )}
              {said?.contextId === p.contextId && <RowSaid said={said} />}
            </div>
          ))}
        </div>
      </section>

      {/* One more thing than a role allows, by team, by role or for the
          whole company (the founder, 2026-11-08). The component draws
          the form only where this seat may grant, and the list for any
          seat that may read it. */}
      <div className="mt-8"><GiveAccess /></div>
    </div>
  )
}
