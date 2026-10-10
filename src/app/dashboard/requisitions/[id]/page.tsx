'use client'

import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { Thread, OWN_NOTES_ON_A_ROLE, toSupplierAboutRole } from '@/components/thread'
import { suppliersOnRole } from '@/lib/threads'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { compact as money } from '@/lib/money-display'
import {
  Chain, DecideModal, EditRequisition, clearedForSentence, deskOf, myRow, whoFor,
} from '../chain'
import { mayEdit } from '@/lib/requisition-stage'
import { useSession } from '@/components/session-provider'
import { jobListWord } from '../../requirements/words'
import { hasPermission } from '@/lib/permissions'
import { refusedBy } from '@/app/dashboard/program/own-refusal'
import { JobMatches } from '../../requirements/[id]/matches'
import { jobFacts, day, checkedSays, withoutRepeat, filledSays, stillOpen } from '../facts'
import { submissionStatusWord } from '../../submissions/words'
import { Lbl, Chip, RefusedState, LoadingState, ErrorState, EmptyState } from '@/components/ui'
import { DetailHead } from '@/components/ui/detail-head'

/**
 * One requisition, worked end to end.
 *
 * The list said what exists; this is where a requisition is actually
 * filled. Four moments, in the order they happen:
 *
 *   approval      cleared itself, or waiting on a named person
 *   distribution  which vendors were asked, at what band
 *   responses     who is working it, who declined, who went quiet
 *   candidates    who was put forward, and who gets the job
 *
 * The quiet vendors get their own count. A requisition with three silent
 * suppliers looks identical to one with three working it, and the client
 * finds out the difference the week the role was supposed to start.
 */

interface Band { payMin: number | null; payMax: number | null }
interface Invitation {
  id: string
  vendor: { id: string; name: string }
  band: Band
  status: string
  expiresAt: string
  message: string | null
  submittedCount: number
}
interface FitFactor { label: string; value: number; weight: number; detail: string }
interface Fit {
  score: number
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  factors: FitFactor[]
  basis: string
  unknowns: string | null
}
interface Candidate {
  id: string
  fit: Fit
  person: { id: string; name: string; headline: string | null; skills: string[] }
  vendor: { id: string; name: string }
  rate: number
  /** The rate the award agreed, once placed — not what the supplier asked. */
  placedRate?: number | null
  kind: string
  status: string
  submittedAt: string
  /** The line the award wrote for this person, once placed. */
  contractId?: string | null
  /** Whether this reader may place them — the award route's own answer. */
  award?: { open: boolean; says: string }
}

/**
 * A heading over a flush list. Not the shared Panel: these rows carry
 * their own padding and dividers edge to edge, and the shared one pads
 * its body, which would double every row's inset.
 */
function ListSection({ title, count, children }: {
  title: string; count?: number; children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="font-serif text-lg text-etyme-ink">{title}</h2>
        {count != null && <span className="text-xs text-etyme-faint tabular-nums">{count}</span>}
      </div>
      <div className="bg-etyme-surface border border-etyme-rule rounded-lg">{children}</div>
    </section>
  )
}


/**
 * The score, and everything behind it on click.
 *
 * CLAUDE.md wants progressive explanation and forbids a bare number. The
 * confidence label sits next to the score rather than under the fold,
 * because a 74 the system is unsure about must not read like a 74 it is
 * certain of.
 */
function Why({ fit }: { fit: Fit }) {
  const [open, setOpen] = useState(false)
  const tone = fit.score >= 75 ? 'text-etyme-verified'
    : fit.score >= 45 ? 'text-etyme-ink' : 'text-etyme-attention'
  const conf = fit.confidence === 'HIGH' ? 'confident'
    : fit.confidence === 'MODERATE' ? 'some gaps' : 'thin data'

  return (
    <div className="text-right">
      <button onClick={() => setOpen(o => !o)} className="group">
        <div className={`font-serif text-2xl tabular-nums ${tone}`}>{fit.score}</div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-etyme-faint group-hover:text-etyme-action">
          {conf} · why
        </div>
      </button>
      {open && (
        <div className="mt-3 text-left border-l-2 border-etyme-rule pl-4 space-y-2 w-full">
          {fit.factors.map(f => (
            <div key={f.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-etyme-ink">{f.label}</span>
                <span className="text-xs tabular-nums text-etyme-muted">{f.value}</span>
              </div>
              <div className="h-1 bg-etyme-rule rounded mt-0.5">
                <div className="h-1 bg-etyme-action/50 rounded" style={{ width: `${f.value}%` }} />
              </div>
              <p className="text-xs text-etyme-muted mt-0.5">{f.detail}</p>
            </div>
          ))}
          <p className="text-xs text-etyme-faint pt-1">Based on {fit.basis}.</p>
          {fit.unknowns && (
            <p className="text-xs text-etyme-attention">Could not judge: {fit.unknowns}.</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The two kinds of conversation on a requisition.
 *
 * `Conversation` has carried `topic: 'REQUIREMENT'` with a `topicId`
 * since the model existed and nothing created one, so the argument about
 * a role — "can we take the rate to 130?", "Priya's notice is four
 * weeks" — happened in email and was gone by the time anybody asked why
 * the band moved.
 *
 * Discussion is the client's own people only, and that is the API's
 * decision rather than this screen's: a thread with no other company on
 * it is read by the company that made it. Suppliers is one thread per
 * firm on the role, opened from here and answered from theirs — demand
 * opens, supply answers (src/lib/threads.ts), which is how the 2017
 * build kept hiring managers from being cold-messaged and is kept
 * because the demand side still wants it that way.
 *
 * Both are made by the first message, not by the requisition. A row of
 * empty threads on every requisition ever raised is noise nobody reads.
 */
function Discussion({ requisitionId, title }: { requisitionId: string; title: string }) {
  const [count, setCount] = useState<number>(0)
  return (
    <ListSection title="Discussion" count={count > 0 ? count : undefined}>
      <Thread
        topic="REQUIREMENT"
        topicId={requisitionId}
        title={title}
        withCompany={null}
        canOpen
        words={OWN_NOTES_ON_A_ROLE}
        onChanged={setCount}
      />
    </ListSection>
  )
}

/**
 * Writing to one supplier at a time about this role.
 *
 * Only the firms actually on the deal are offered — invited, cleared by
 * Procurement, or already submitting — because the route refuses anybody
 * else in the same words. Whoever is hiring or runs the program may
 * open one; the AP clerk reads.
 */
function SupplierThreads({ requisitionId, title, suppliers, canOpen }: {
  requisitionId: string
  title: string
  suppliers: { id: string; name: string }[]
  canOpen: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  // Which suppliers already have a thread, so the chip can say so before
  // it is clicked.
  useEffect(() => {
    let live = true
    fetch(`/api/conversations?topic=REQUIREMENT&topicId=${requisitionId}`)
      .then(readJson)
      .then((j) => {
        if (!live) return
        const next: Record<string, number> = {}
        for (const c of j?.data?.conversations ?? []) {
          if (c.otherCompany?.id) next[c.otherCompany.id] = c.messageCount
        }
        setCounts(next)
      })
      .catch(() => {})
    return () => { live = false }
  }, [requisitionId])

  const current = suppliers.find((f) => f.id === open) ?? null

  return (
    <ListSection title="Suppliers" count={suppliers.length > 0 ? suppliers.length : undefined}>
      {suppliers.length === 0 ? (
        <p className="p-4 text-sm text-etyme-muted">
          Nobody is on this job yet. Send it to suppliers and you can write to each of them here.
        </p>
      ) : (
        <>
          <div className="p-4 flex flex-wrap gap-2 border-b border-etyme-rule">
            {suppliers.map((f) => (
              <button
                key={f.id}
                onClick={() => setOpen(open === f.id ? null : f.id)}
                aria-pressed={open === f.id}
                className={`px-3 py-1 rounded text-sm border transition-colors ${
                  open === f.id
                    ? 'bg-etyme-action text-white border-etyme-action'
                    : 'bg-etyme-raised text-etyme-ink border-etyme-rule hover:border-etyme-action'
                }`}
              >
                {f.name}
                {counts[f.id] > 0 && (
                  <span className={`ml-1.5 text-xs tabular-nums ${open === f.id ? 'text-white/80' : 'text-etyme-muted'}`}>
                    {counts[f.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {current ? (
            <Thread
              key={current.id}
              topic="REQUIREMENT"
              topicId={requisitionId}
              title={title}
              withCompany={current}
              canOpen={canOpen}
              words={toSupplierAboutRole(current.name)}
              onChanged={(n) => setCounts((c) => ({ ...c, [current.id]: n }))}
            />
          ) : (
            <p className="p-4 text-sm text-etyme-muted">
              Pick a supplier to read what has been said, or to ask them something. They answer on the same thread; they cannot start one.
            </p>
          )}
        </>
      )}
    </ListSection>
  )
}

// ── Sending it to vendors ──────────────────────────────────

function DistributePanel({ reqId, billMax, invited, clearedIds, suppliers, onSent }: {
  reqId: string
  billMax: number | null
  invited: Set<string>
  /** The suppliers Procurement's yes named. Empty = every approved one. */
  clearedIds: string[]
  /**
   * This client's own suppliers — its register (`/api/suppliers`), the
   * firms it buys from directly — and nobody else.
   *
   * It read the whole company directory, filtered by kind, so Northbend
   * was offered Techpeple: a firm it reaches only through Computer
   * Systems, whose name is Computer Systems' to keep. A firm below a
   * prime is never on a client's register, so it is never offered here;
   * the release route refuses it as well.
   */
  suppliers: { companyId: string; name: string; blocked?: boolean }[]
  onSent: () => void
}) {
  const vendors = suppliers.filter(v => !v.blocked).map(v => ({ id: v.companyId, name: v.name }))
  const [picked, setPicked] = useState<Record<string, { on: boolean; min: string; max: string }>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Procurement's yes is a ceiling on this list, not a suggestion. The
  // release route refuses a vendor outside it, so offering one here would
  // be offering a choice the server throws away.
  const cleared = new Set(clearedIds)
  const available = vendors
    .filter(v => !invited.has(v.id))
    .filter(v => cleared.size === 0 || cleared.has(v.id))

  async function send() {
    const chosen = Object.entries(picked).filter(([, v]) => v.on)
    if (chosen.length === 0) { setError('Pick at least one supplier.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/requisitions/${reqId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendors: chosen.map(([id, v]) => ({
            companyId: id,
            // Entered in dollars, stored in cents like every other rate.
            payMin: v.min ? Math.round(parseFloat(v.min) * 100) : null,
            payMax: v.max ? Math.round(parseFloat(v.max) * 100) : null,
          })),
        }),
      })
      const j = await readJson(res)
      setPicked({})
      onSent()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (available.length === 0) {
    return (
      <div className="p-4 text-sm text-etyme-muted">
        {vendors.length === 0 ? 'No suppliers on file yet. Add one from Suppliers first.' : 'Every supplier you can send this to has already been asked.'}
      </div>
    )
  }

  const field = 'w-20 px-2 py-1 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink tabular-nums focus:outline-none focus:border-etyme-action'

  return (
    <div className="p-4">
      <p className="text-sm text-etyme-muted mb-3">
        Each supplier gets its own pay range and cannot see anyone else&apos;s.
        {billMax != null && ` Your ceiling is ${money(billMax)}/hr.`}
        {cleared.size > 0 && ' Only the suppliers Procurement cleared are listed.'}
      </p>
      <div className="divide-y divide-etyme-rule">
        {available.map(v => {
          const p = picked[v.id] ?? { on: false, min: '', max: '' }
          return (
            <div key={v.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox" checked={p.on}
                onChange={e => setPicked({ ...picked, [v.id]: { ...p, on: e.target.checked } })}
                className="accent-etyme-action"
              />
              <span className="flex-1 text-sm text-etyme-ink">{v.name}</span>
              <input value={p.min} placeholder="min"
                onChange={e => setPicked({ ...picked, [v.id]: { ...p, min: e.target.value } })}
                className={field} />
              <input value={p.max} placeholder="max"
                onChange={e => setPicked({ ...picked, [v.id]: { ...p, max: e.target.value } })}
                className={field} />
              <span className="text-xs text-etyme-faint w-8">/hr</span>
            </div>
          )
        })}
      </div>
      {error && <div className="mt-3 text-sm text-etyme-attention">{error}</div>}
      <button onClick={send} disabled={busy}
        className="mt-4 px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {busy ? 'Sending…' : 'Send to the suppliers ticked'}
      </button>
    </div>
  )
}

// ── The job itself ─────────────────────────────────────────

/** The check, in the reader's word — never the engine's code. */
const CHECK_WORD: Record<string, string> = {
  HEADCOUNT_PLAN: 'Headcount',
  BUDGET: 'Budget',
  RATE_BAND: 'Rate',
  COST_CENTER: 'Cost center',
  DURATION: 'Length',
  VALUE: 'What it is worth',
}
const DESK_WORD: Record<string, string> = {
  ROLE: 'HR — the job',
  SOURCING: 'Procurement — the suppliers',
  FINAL: 'The lead — the money',
}

/**
 * What the approval checked the job against, desk by desk, with the
 * facts in each sentence — and whether this is the record of the
 * decision or the checks run again on today's plan.
 */
function CheckedAgainst({ checked, approvalState }: {
  checked: { basis: 'RECORDED' | 'NOW'; at: string; checks: any[] } | null
  approvalState: string
}) {
  if (!checked || checked.checks.length === 0) return null
  const says = checkedSays(checked, approvalState)
  const stages = ['ROLE', 'SOURCING', 'FINAL'].filter((st) => checked.checks.some((c) => c.stage === st))
  return (
    <div className="mt-4 pt-3 border-t border-etyme-rule">
      <Lbl>What it was checked against</Lbl>
      <p className="text-xs text-etyme-muted mt-1 mb-3">
        {says.intro}
      </p>
      <div className="space-y-3">
        {stages.map((st) => (
          <div key={st}>
            <div className="text-xs font-medium text-etyme-ink">{DESK_WORD[st] ?? st}</div>
            <ul className="mt-1 space-y-1">
              {checked.checks.filter((c) => c.stage === st).map((c, i) => (
                <li key={`${c.code}-${i}`} className="flex gap-2 text-sm">
                  <span className={`shrink-0 w-4 ${c.outcome === 'PASS' ? 'text-etyme-verified' : 'text-etyme-attention'}`}>
                    {c.outcome === 'PASS' ? '✓' : '!'}
                  </span>
                  <span className="text-etyme-muted">
                    <span className="text-etyme-ink">{CHECK_WORD[c.code] ?? 'Check'}:</span> {c.reason}
                    {c.outcome === 'ROUTE' && <span className="text-etyme-attention">{says.routeSuffix}</span>}
                    {c.outcome === 'BLOCK' && <span className="text-etyme-attention"> — stops it</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function RequisitionDetail() {
  const section = usePageSection('/dashboard/requisitions')
  const params = useParams()
  const id = String(params?.id ?? '')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // A refusal is drawn alone, with no "Try again" under it: a retry cannot
  // give somebody a desk (round five, #14).
  const [refused, setRefused] = useState<string | null>(null)
  /** Who is reading — so only your own row offers you a decision. */
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  // Editors: the manager it is for, whoever raised it, the program
  // office. The approvers ask for changes instead. Same rule as the
  // route; a button that would only refuse is not offered.
  const { permissions, company } = useSession()
  const [editing, setEditing] = useState(false)
  /** The desks for this unit, for placing rows and for naming people. */
  const [team, setTeam] = useState<any | null>(null)
  const [suppliers, setSuppliers] = useState<{ companyId: string; name: string; blocked?: boolean }[]>([])
  const [deciding, setDeciding] = useState<'approve' | 'reject' | 'changes' | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/requisitions/${id}`)
      const no = await refusedBy(res, 'This job request')
      if (no) { setRefused(no); return }
      const j = await readJson(res)
      setData(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  // Read once, all optional: without them the page still shows the
  // requisition, it just offers fewer decisions.
  useEffect(() => {
    fetch('/api/me').then(r => r.json())
      .then(j => { const p = j?.data?.person; if (p?.id) setMe({ id: p.id, name: p.name }) })
      .catch(() => {})
    fetch('/api/program/team').then(r => r.json())
      .then(j => { if (j?.data?.company) setTeam(j.data) })
      .catch(() => {})
    fetch('/api/suppliers').then(r => r.json())
      .then(j => setSuppliers(
        (j?.data?.suppliers ?? []).map((s: any) => ({ companyId: s.companyId, name: s.name, blocked: !!s.blocked }))
      ))
      .catch(() => {})
  }, [])


  async function award(c: Candidate) {
    const rate = window.prompt(
      `Place ${c.person.name}. Rate in dollars per hour:`,
      String(Math.round(c.rate / 100))
    )
    if (rate === null) return
    const cents = Math.round(parseFloat(rate) * 100)
    if (!Number.isFinite(cents) || cents <= 0) { alert('That is not a rate'); return }

    const res = await fetch(`/api/submissions/${c.id}/award`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rate: cents }),
    })
    // A safe parse rather than readJson: this branch needs the
    // error object itself (lists the failed checks), and readJson throws an
    // Error, which would lose it. An empty body must still
    // not produce a parser error on screen.
    const j = await res.json().catch(() => ({}) as any)
    if (!res.ok) {
      const checks = (j.error?.checks ?? []).map((x: any) => `· ${x.reason}`).join('\n')
      alert(`${j.error?.message ?? 'Could not place them'}${checks ? '\n\n' + checks : ''}`)
      return
    }
    // One paragraph, each thing once: who was placed, what the award
    // stood down and called off, and any note (`awardSaid`).
    alert(j.data.message)
    await load()
  }

  if (loading) return <LoadingState says="Opening the job request…" />
  if (refused) return <RefusedState says={refused} />
  if (error) return (
    <div className="max-w-3xl">
      <ErrorState says={error} action={{ label: 'Try again', onClick: load }} />
    </div>
  )
  if (!data) return null

  const r = data.requisition
  const s = data.summary
  const approved = r.approvalState === 'APPROVED' || r.approvalState === 'AUTO_APPROVED'
  const invitedIds = new Set<string>(data.invitations.map((i: Invitation) => i.vendor.id))

  // The desks for this requisition's own unit. Used to place an approval
  // under the right heading where the row does not carry its stage, and
  // to know whether the row in play is the sourcing desk's.
  const unitId =
    r.orgUnit?.id
    ?? (team?.budgets ?? []).find((b: any) => b.id === r.costCenter?.id)?.department?.id
    ?? null
  const deskIds = (() => {
    const d = (team?.desks ?? []).find((x: any) => x.unit.id === unitId)
    return {
      hrPersonId: d?.hr?.person?.id ?? null,
      procurementPersonId: d?.procurement?.person?.id ?? null,
    }
  })()
  // Only your own row, at the rank in play — the rule the route enforces.
  const mine = myRow(data.approvals, me?.id ?? null)
  const mineIsSourcing = mine ? deskOf(mine, deskIds) === 'SOURCING' : false
  const supplierNames: Record<string, string> = Object.fromEntries(
    suppliers.map(v => [v.companyId, v.name])
  )
  const clearedFor = clearedForSentence(r.clearedSupplierIds, supplierNames)
  const filled = filledSays(r, data.candidates)
  const jobOpen = stillOpen(r)

  return (
    <div className="max-w-3xl">
      {/* Back only to a list the reader's own menu has (round seven, #12).
          The heading is the list's section on the reader's own menu,
          which DetailHead reads and leaves out while the menu loads. A
          code is not a heading: the team, where there is one, is the
          subtitle; the cost center is a fact below, in words. */}
      <DetailHead
        from="/dashboard/requisitions"
        back={section ? { href: '/dashboard/requisitions', label: jobListWord(company?.kind).plural } : undefined}
        title={r.title}
        subtitle={r.orgUnit?.name ? `Job request · ${r.orgUnit.name}` : undefined}
        actions={mayEdit(r) &&
          (me?.id === r.owner?.id || me?.id === r.raisedBy?.id || hasPermission(permissions, 'governance.write')) ? (
          <button type="button" onClick={() => setEditing(true)} className="btn-secondary">
            Edit
          </button>
        ) : undefined}
      >
        {/* Whose need it is, then who typed it — said twice only when
            they are two different people. */}
        {whoFor(r) && <p className="mt-2 text-[14px] text-etyme-muted">{whoFor(r)}</p>}
      </DetailHead>
      {editing && (
        <EditRequisition req={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      )}

      <div className="mb-8">

        {/* Over, said first. A filled job that still offered "Send to
            suppliers" read as a job still to fill. */}
        {filled && (
          <div className="mt-4 px-4 py-3 rounded-lg border border-etyme-verified/30 bg-etyme-verified/5 text-sm text-etyme-ink">
            {filled}
          </div>
        )}

        {/* The job itself, before anything about its approval. */}
        <section aria-label="The job" className="mt-6 bg-etyme-surface border border-etyme-rule rounded-lg p-4">
          <Lbl>The work</Lbl>
          <div className="mt-1 text-sm text-etyme-ink whitespace-pre-line max-w-prose">
            {r.description ?? 'Nobody has described the work yet. Edit the job request and say what the person will do day to day.'}
          </div>

          <div className="mt-4">
            <Lbl>Skills it needs</Lbl>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(r.skills ?? []).length > 0
                ? (r.skills as string[]).map((sk: string) => <Chip key={sk}>{sk}</Chip>)
                : <span className="text-sm text-etyme-muted">Not stated</span>}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {jobFacts(r).map((f) => (
              <div key={f.label} className="flex gap-3 text-sm">
                <dt className="w-32 shrink-0 text-etyme-muted">{f.label}</dt>
                <dd className={f.value === 'Not stated' ? 'text-etyme-faint' : 'text-etyme-ink'}>{f.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4">
            <Lbl>Why it is needed</Lbl>
            <p className={`mt-1 text-sm ${r.justification ? 'text-etyme-ink' : 'text-etyme-faint'}`}>
              {r.justification ?? 'Not stated'}
            </p>
          </div>
        </section>

        {/* Who is interviewing. Named on the requirement, so every round
            starts with them rather than being retyped per round. */}
        {(r.interviewers ?? []).length > 0 && (
          <div className="mt-4">
            <Lbl>Who is interviewing</Lbl>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(r.interviewers as string[]).map((n: string) => (
                <Chip key={n}>{n}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Who is working it is a question about an open job. On a filled
          one "Suppliers working it 0" read as a job nobody was working,
          under a sentence saying it was filled; only the count of people
          put forward stays. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
        {jobOpen && (
          <>
            <div><Lbl>Suppliers asked</Lbl><div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.invited}</div></div>
            <div><Lbl>Suppliers working it</Lbl><div className="font-serif text-3xl mt-1 tabular-nums text-etyme-verified">{s.accepted}</div></div>
            <div>
              <Lbl>Not answered</Lbl>
              <div className={`font-serif text-3xl mt-1 tabular-nums ${s.silent > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{s.silent}</div>
              <div className="text-xs text-etyme-muted">asked, and nobody sent yet</div>
            </div>
          </>
        )}
        <div><Lbl>Candidates</Lbl><div className="font-serif text-3xl mt-1 tabular-nums text-etyme-ink">{s.candidates}</div></div>
      </div>

      {/* 1 — Approval, read by desk */}
      <ListSection title="Approval">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              {r.approvalState === 'AUTO_APPROVED' && <Chip tone="verified">Cleared automatically</Chip>}
              {r.approvalState === 'APPROVED' && <Chip tone="verified">Approved</Chip>}
              {r.approvalState === 'PENDING_APPROVAL' && <Chip tone="attention">Awaiting approval</Chip>}
              {r.approvalState === 'CHANGES_REQUESTED' && <Chip tone="attention">Sent back for changes</Chip>}
              {r.approvalState === 'REJECTED' && <Chip tone="attention">Rejected</Chip>}
              {r.approvalState === 'DRAFT' && <Chip>Draft</Chip>}
            </div>
            {/* Only the row that is actually yours. The old buttons showed
                on anybody's pending approval and returned a 403 the person
                reading it could do nothing about. */}
            {mine && (
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button onClick={() => setDeciding('approve')}
                  className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                  {mineIsSourcing ? 'Approve and name suppliers' : 'Approve'}
                </button>
                {/* The middle answer: a reviewer who wants the rate moved
                    should not have to refuse the whole requisition. */}
                <button onClick={() => setDeciding('changes')}
                  className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">
                  Send back with a reason
                </button>
                <button onClick={() => setDeciding('reject')}
                  className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-attention hover:border-etyme-attention">
                  Reject
                </button>
              </div>
            )}
            {data.waitingOn && !mine && (
              <div className="text-xs text-etyme-muted shrink-0">{data.waitingOn}</div>
            )}
          </div>

          {data.approvals.length === 0 ? (
            <p className="mt-3 text-sm text-etyme-muted">
              {r.approvalState === 'AUTO_APPROVED'
                ? 'Cleared the moment it was raised — inside plan, inside budget, inside the going rate. No desk was needed.'
                : 'Not sent for approval yet. Nobody has been asked to look at this.'}
            </p>
          ) : (
            <Chain
              approvals={data.approvals}
              desks={deskIds}
              alreadySaid={(data.checked?.checks ?? []).filter((c: any) => c.outcome !== 'PASS').map((c: any) => c.reason)}
            />
          )}

          <CheckedAgainst checked={data.checked ?? null} approvalState={r.approvalState} />

          {clearedFor && (
            <p className="mt-4 pt-3 border-t border-etyme-rule text-sm text-etyme-muted">
              {clearedFor}. Only these suppliers may be sent it.
            </p>
          )}
        </div>
      </ListSection>

      {/* 2 — Distribution. Not drawn at all on a filled job: the sentence
          at the top already says who filled it, and a "Send to suppliers"
          box under it read as a job still to fill. */}
      {r.status !== 'FILLED' && (
      <ListSection title="Send to suppliers">
        {!jobOpen
          ? <div className="p-4 text-sm text-etyme-muted">
              {r.status === 'CANCELLED'
                  ? 'Called off, so it goes to no more suppliers.'
                  : 'Put away, so it goes to no more suppliers.'}
            </div>
          : approved
          ? <DistributePanel reqId={id} billMax={r.billMax} invited={invitedIds}
              clearedIds={r.clearedSupplierIds ?? []} suppliers={suppliers} onSent={load} />
          : <div className="p-4 text-sm text-etyme-muted">
              {/* The column's own value, lower-cased, was not a sentence:
                  "This requisition is changes requested." A refusal says
                  what is missing and what to do about it. */}
              {r.approvalState === 'PENDING_APPROVAL'
                ? 'Still with the desks above. Suppliers see it once every one of them has said yes.'
                : r.approvalState === 'CHANGES_REQUESTED'
                  ? 'Sent back for changes. Edit it and it goes round again — to the desk that asked, not back to the start.'
                  : r.approvalState === 'REJECTED'
                    ? 'This was rejected, so it goes to no supplier. Raising a fresh one is the way back.'
                    : 'Not sent for approval yet. Suppliers see it once it has been through the desks.'}
            </div>}
      </ListSection>
      )}

      {/* 3 — Responses */}
      {data.invitations.length > 0 && (
        <ListSection title="Who was asked" count={data.invitations.length}>
          <div className="divide-y divide-etyme-rule">
            {data.invitations.map((i: Invitation) => (
              <div key={i.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-etyme-ink">{i.vendor.name}</div>
                  <div className="text-xs text-etyme-muted tabular-nums">
                    {money(i.band.payMin)}–{money(i.band.payMax)}/hr · closes {day(i.expiresAt)}
                  </div>
                </div>
                <div className="text-xs text-etyme-muted tabular-nums w-20 text-right">
                  {i.submittedCount} put forward
                </div>
                <div className="w-24 text-right shrink-0">
                  {i.status === 'ACCEPTED' && <Chip tone="verified">Working it</Chip>}
                  {i.status === 'DECLINED' && <Chip>Declined</Chip>}
                  {i.status === 'EXPIRED' && <Chip>Closed</Chip>}
                  {i.status === 'SENT' && i.submittedCount > 0 && <Chip tone="verified">Working it</Chip>}
                  {i.status === 'SENT' && i.submittedCount === 0 && <Chip tone="attention">No answer yet</Chip>}
                </div>
              </div>
            ))}
          </div>
        </ListSection>
      )}

      {/* 4 — Candidates */}
      <ListSection title="Candidates" count={data.candidates.length}>
        {data.candidates.length === 0 ? (
          <EmptyState
            compact
            says={s.invited === 0
              ? 'Nobody has been asked yet.'
              : 'Asked, but nobody has been put forward yet.'}
          />
        ) : (
          <div className="divide-y divide-etyme-rule">
            {[...data.candidates]
              .sort((a: Candidate, b: Candidate) => b.fit.score - a.fit.score)
              .map((c: Candidate) => (
              <div key={c.id} className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-etyme-ink">{c.person.name}</div>
                  <div className="text-xs text-etyme-muted">
                    {c.person.headline ?? c.person.skills.slice(0, 3).join(', ')} · via {c.vendor.name}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-serif text-lg text-etyme-ink tabular-nums">
                      {money(c.placedRate ?? c.rate)}<span className="text-xs text-etyme-muted font-sans">/hr</span>
                    </span>
                    {c.placedRate != null && c.placedRate !== c.rate && (
                      <span className="text-xs text-etyme-muted">placed at this rate · asked {money(c.rate)}</span>
                    )}
                    <Chip tone={
                      c.status === 'PLACED' ? 'verified'
                      : c.status === 'NOT_SELECTED' ? 'passive' : 'action'
                    }>
                      {submissionStatusWord(c.status)}
                    </Chip>
                    {c.contractId ? (
                      <Link href={`/dashboard/placements/${c.contractId}` as any}
                        className="text-xs text-etyme-action hover:underline">
                        Placement →
                      </Link>
                    ) : c.award?.open && s.remaining > 0 ? (
                      /* Placing is the award, and the route said whether
                         this desk may do it for this candidate — the same
                         answer it gives on the click. A refusal the route
                         makes and the screen does not is a button that
                         lies. */
                      <button onClick={() => award(c)} title={c.award.says}
                        className="px-3 py-1 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                        Place
                      </button>
                    ) : !hasPermission(permissions, 'requirements.write') &&
                        c.status !== 'PLACED' && c.status !== 'NOT_SELECTED' && s.remaining > 0 ? (
                      <span className="text-xs text-etyme-muted">
                        Placing is the hiring manager&rsquo;s call.
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 w-56"><Why fit={c.fit} /></div>
              </div>
            ))}
          </div>
        )}
      </ListSection>

      {/* 4b — Who is available, before anybody new is asked. The same
          section the matches page draws (`JobMatches`), here because this
          is the page a client's Job requests menu opens: the matches had
          no door from it. */}
      {jobOpen && <div id="matches">
        <JobMatches
          requirementId={id}
          requirementSkills={r.skills ?? []}
          mayRun={
            hasPermission(permissions, 'requirements.write') &&
            (r.status === 'OPEN' || r.status === 'DRAFT') &&
            mayEdit(r)
          }
        />
      </div>}

      {/* 5 — The argument about the role, kept with the role */}
      <Discussion requisitionId={id} title={r.title} />

      {/* 6 — What was said to each supplier, and what they said back */}
      <SupplierThreads
        requisitionId={id}
        title={r.title}
        suppliers={suppliersOnRole({
          invited: data.invitations.map((i: Invitation) => i.vendor),
          submittedFrom: data.candidates.map((c: any) => c.vendor).filter(Boolean),
          cleared: (r.clearedSupplierIds ?? [])
            .filter((sid: string) => supplierNames[sid])
            .map((sid: string) => ({ id: sid, name: supplierNames[sid] })),
        })}
        canOpen={hasPermission(permissions, 'requirements.write') || hasPermission(permissions, 'requirements.distribute')}
      />

      {deciding && (
        <DecideModal
          req={{ id, title: r.title }}
          action={deciding}
          sourcing={mineIsSourcing}
          suppliers={suppliers}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); load() }}
        />
      )}
    </div>
  )
}
