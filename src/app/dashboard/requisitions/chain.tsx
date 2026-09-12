'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { said } from '@/lib/requisition-change'
import { stageOf } from '@/lib/requisition-stage'

/**
 * The approval chain, as a client reads it.
 *
 * ── Why this file exists at all ──────────────────────────────────────
 *
 * It is shared by the requisition list and the requisition's own page,
 * and a page under app/ may export nothing but its default component —
 * Next.js refuses the build otherwise. So the pure parts of the two
 * screens live here, next to the pages that use them, rather than in
 * src/lib (where a new file needs an owner adding in src/lib/domains.ts,
 * which is the architect's call). Everything below is plain JavaScript
 * with no database and no clock, so
 * __tests__/invariants/requisition-chain-screens.test.ts can run it.
 */

export interface Approval {
  id: string
  approver: { id: string; name: string } | null
  rank: number
  /** ROLE · SOURCING · FINAL, when the route says. Derived when it does not. */
  stage?: string | null
  outcome: string
  reason: string
  decidedAt: string | null
}

export function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
      {children}
    </div>
  )
}


export function Chip({ children, tone = 'passive' }: {
  children: React.ReactNode
  tone?: 'attention' | 'verified' | 'action' | 'passive'
}) {
  const tones = {
    attention: 'bg-etyme-attention/10 text-etyme-attention',
    verified: 'bg-etyme-verified/10 text-etyme-verified',
    action: 'bg-etyme-action/10 text-etyme-action',
    passive: 'bg-etyme-rule/50 text-etyme-muted',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}



// ─────────────────────────────────────────────────────────────────────
// THE CHAIN, READ BY DESK
//
// Three desks, each with its own question (src/lib/requisition-approval.ts):
// HR reads the role, Procurement reads the suppliers and the rate, and
// the lead who owns the cost centre gives the one human yes on the money.
// The screen has to read that way too — a flat list of names in rank
// order was the old chain, and it cannot say why two people are being
// asked at once.
//
// These are plain functions with no React in them so they can be lifted
// out and run by __tests__/invariants/requisition-chain-screens.test.ts.
// They live in this page rather than src/lib because every file under
// src/ must be claimed by a domain in src/lib/domains.ts, and adding a
// new lib file is the architect's call. The detail page imports them
// from here so there is one definition, not two that drift.
// ─────────────────────────────────────────────────────────────────────

export type Desk = 'ROLE' | 'SOURCING' | 'FINAL'

/** The desks, in the order they are asked, in the words of the trade. */
export const DESKS: Array<{ key: Desk; heading: string; asks: string }> = [
  { key: 'ROLE', heading: 'Role — HR', asks: 'Is this a role, and is it in the plan?' },
  { key: 'SOURCING', heading: 'Sourcing — Procurement', asks: 'Who may supply it, and at what rate?' },
  { key: 'FINAL', heading: 'The money — the lead', asks: 'The one yes on the spend.' },
]

/**
 * Which desk a row belongs to.
 *
 * `stage` is the answer when the row carries one. Where it does not —
 * rows written before the column existed, and read paths that do not yet
 * send it — it is recovered from facts the engine itself wrote: the rank
 * (FINAL is always the rank above ROLE and SOURCING), who is named on it
 * against the unit's standing desks, and failing both the words of the
 * reason. Nothing here guesses at a desk it cannot place: the last
 * resort is FINAL, which is the column's own default and where a
 * one-row chain from the old shape genuinely belongs.
 */
export function deskOf(
  a: { stage?: string | null; rank: number; approver?: { id: string } | null; reason?: string },
  desks: { hrPersonId?: string | null; procurementPersonId?: string | null } = {}
): Desk {
  const said = String(a.stage ?? '').toUpperCase()
  if (said === 'ROLE' || said === 'SOURCING' || said === 'FINAL') return said as Desk

  if (a.rank >= 2) return 'FINAL'

  const who = a.approver?.id ?? null
  if (who && desks.hrPersonId && who === desks.hrPersonId) return 'ROLE'
  if (who && desks.procurementPersonId && who === desks.procurementPersonId) return 'SOURCING'

  const why = a.reason ?? ''
  if (/procurement|going rate|rate band|supplier|\/hr\b/i.test(why)) return 'SOURCING'
  if (/\bHR\b|the plan|approved heads|headcount/i.test(why)) return 'ROLE'
  return 'FINAL'
}

/** The chain grouped by desk, in the order it is asked. Empty desks drop out. */
export function byDesk<T extends { stage?: string | null; rank: number; approver?: { id: string } | null; reason?: string }>(
  approvals: T[],
  desks: { hrPersonId?: string | null; procurementPersonId?: string | null } = {}
): Array<{ key: Desk; heading: string; asks: string; rows: T[] }> {
  return DESKS.map((d) => ({
    ...d,
    rows: approvals.filter((a) => deskOf(a, desks) === d.key),
  })).filter((d) => d.rows.length > 0)
}

/**
 * What happened at a desk, in a word somebody would say out loud.
 *
 * Never the column's own value. "AUTO_CLEARED" is how the row is stored
 * and "cleared by rule" is what it means, and CLAUDE.md is explicit that
 * a screen says the second.
 */
export function outcomeWords(outcome: string): string {
  switch (String(outcome).toUpperCase()) {
    case 'AUTO_CLEARED': return 'cleared by rule'
    case 'PENDING': return 'waiting'
    case 'APPROVED': return 'yes'
    case 'REJECTED': return 'no'
    case 'CHANGES_REQUESTED': return 'sent back'
    default: return 'waiting'
  }
}

export function outcomeTone(outcome: string): 'attention' | 'verified' | 'action' | 'passive' {
  switch (String(outcome).toUpperCase()) {
    case 'AUTO_CLEARED':
    case 'APPROVED': return 'verified'
    case 'REJECTED':
    case 'CHANGES_REQUESTED': return 'attention'
    default: return 'passive'
  }
}

/** Who a row names on a cleared-by-rule step: a person, or the rule itself. */
export function deciderName(a: { approver?: { name: string } | null }): string {
  return a.approver?.name ?? 'Cleared by rule'
}

/**
 * Whose need it is, and who typed it.
 *
 * A coordinator raising four roles for four managers is ordinary, and
 * until the requirement carried an owner the only name on the row was
 * the coordinator's — so nobody could see whose headcount it was. Said
 * once where they are the same person, twice where they are not.
 */
export function whoFor(r: {
  owner?: { id: string; name: string } | null
  raisedBy?: { id: string; name: string } | null
}): string | null {
  const owner = r.owner ?? null
  const raiser = r.raisedBy ?? null
  if (owner && raiser && owner.id !== raiser.id) return `for ${owner.name} · raised by ${raiser.name}`
  if (raiser) return `raised by ${raiser.name}`
  if (owner) return `for ${owner.name}`
  return null
}

/**
 * Which suppliers Procurement's yes named.
 *
 * An empty list is not "none" — it is "every supplier this client has
 * approved", which is what the release route reads it as. So it says
 * nothing rather than saying something false.
 */
export function clearedForSentence(
  ids: string[] | null | undefined,
  names: Record<string, string>
): string | null {
  const list = (ids ?? []).map((id) => names[id] ?? 'a supplier')
  if (list.length === 0) return null
  return `Cleared for: ${list.join(', ')}`
}

/**
 * The row this caller may decide, if any.
 *
 * The same rule the route enforces (`advanceApprovalChain`): the lowest
 * undecided rank is the one in play, and within it only the caller's own
 * row. A button somebody else's approval can be clicked with is not an
 * approval, and offering it produces a 403 the person cannot read.
 */
export function myRow<T extends { rank: number; outcome: string; approver?: { id: string } | null }>(
  approvals: T[],
  mePersonId: string | null
): T | null {
  if (!mePersonId) return null
  const pending = approvals.filter((a) => a.outcome === 'PENDING').sort((a, b) => a.rank - b.rank)
  if (pending.length === 0) return null
  const lowest = pending[0].rank
  return pending.filter((a) => a.rank === lowest).find((a) => a.approver?.id === mePersonId) ?? null
}

/** Every supplier ticked to start with — the default is the widest list. */
export function allTicked(suppliers: { companyId: string }[]): Record<string, boolean> {
  return Object.fromEntries(suppliers.map((s) => [s.companyId, true]))
}

/** The ones still ticked, in the order they were offered. */
export function tickedIds(
  suppliers: { companyId: string }[],
  picks: Record<string, boolean>
): string[] {
  return suppliers.filter((s) => picks[s.companyId]).map((s) => s.companyId)
}

/**
 * Who will be asked, before it is raised rather than after.
 *
 * The page promised "you will see which, and why, as soon as you raise
 * it", which is true and a beat too late: somebody deciding whether to
 * round a rate down to stay inside their own authority needs to know
 * where the line is first. And the desks are not a mystery — they are
 * standing, per business unit, and the budget names the unit.
 */
export function whoWillBeAsked(
  costCenterId: string,
  team: {
    budgets?: { id: string; code: string; owner: { id: string; name: string } | null; department: { id: string; name: string } | null }[]
    desks?: { unit: { id: string; name: string }; hr: any; procurement: any }[]
    approvers?: { id: string; name: string; kind: string; thresholdDollars: number | null; approver: { id: string; name: string } }[]
  } | null
): {
  budgetCode: string | null
  unitName: string | null
  hr: { person: { id: string; name: string }; from: { name: string }; inherited: boolean } | null
  procurement: { person: { id: string; name: string }; from: { name: string }; inherited: boolean } | null
  lead: { id: string; name: string } | null
  leadNote: string | null
  money: { id: string; name: string; approverName: string; thresholdDollars: number | null }[]
} {
  const budget = (team?.budgets ?? []).find((b) => b.id === costCenterId) ?? null
  const unit = budget?.department ?? null
  const desk = (team?.desks ?? []).find((d) => d.unit.id === unit?.id) ?? null
  return {
    budgetCode: budget?.code ?? null,
    unitName: unit?.name ?? null,
    hr: desk?.hr ?? null,
    procurement: desk?.procurement ?? null,
    lead: budget?.owner ?? null,
    // Never a plausible name where there is none. A budget nobody owns
    // has no lead, and saying so is the whole point of the preview.
    leadNote: budget
      ? budget.owner
        ? null
        : `${budget.code} has nobody answerable for it, so nobody gives the final word on its spend.`
      : 'Pick the budget and this says who would be asked.',
    money: (team?.approvers ?? [])
      .filter((a) => a.kind === 'VALUE')
      .map((a) => ({
        id: a.id, name: a.name, approverName: a.approver.name, thresholdDollars: a.thresholdDollars,
      })),
  }
}

/**
 * Who is interviewing — names, not seats.
 *
 * The panel was asked for once per round, on the interview form, which
 * meant the same four names were typed again for round two and a fifth
 * one appeared by accident. It belongs to the requirement: the hiring
 * manager knows who is in the room before a single CV arrives, and every
 * round starts with them and can drop any of them.
 *
 * The same control as the interview form's own chips, deliberately —
 * somebody who has added a name on one screen has added a name on both.
 */
export function PanelField({ names, onChange }: {
  names: string[]
  onChange: (names: string[]) => void
}) {
  const [typed, setTyped] = useState('')

  function add() {
    const n = typed.trim()
    if (!n) return
    if (!names.includes(n)) onChange([...names, n])
    setTyped('')
  }

  const field = 'w-full h-9 rounded border border-etyme-rule bg-etyme-raised px-3 text-[13px] text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action'

  return (
    <div>
      <label htmlFor="panel-name" className="block text-[10px] uppercase tracking-wider text-etyme-muted mb-1">
        Who is interviewing
      </label>
      <div className="flex gap-2">
        <input
          id="panel-name"
          className={field}
          placeholder="Marcus Oyelaran, People Technology"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <button type="button" onClick={add}
          className="shrink-0 h-9 px-3 border border-etyme-rule rounded text-[13px] text-etyme-muted hover:text-etyme-ink">
          Add
        </button>
      </div>
      {names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {names.map(n => (
            <span key={n} className="inline-flex items-center rounded bg-etyme-rule/50 px-2 py-1 text-[11px] text-etyme-muted">
              {n}
              <button type="button" aria-label={`Remove ${n}`}
                onClick={() => onChange(names.filter(x => x !== n))}
                className="ml-1 text-etyme-faint hover:text-etyme-ink">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-etyme-faint">
        Names are fine — they need no account here. Every interview round starts with them.
      </p>
    </div>
  )
}

/**
 * The chain, by desk, in the order it is asked.
 *
 * It used to be one flat list of names with "rank 1" next to each, which
 * is the engine's own shape and says nothing a person can act on. Two
 * names at rank 1 read as a queue of two; they are HR and Procurement
 * answering two different questions at the same time, and the heading is
 * what makes that legible. Used by this page's Why and by the
 * requisition's own page, so the two never diverge.
 */
export function Chain({ approvals, desks }: {
  approvals: Approval[]
  desks?: { hrPersonId?: string | null; procurementPersonId?: string | null }
}) {
  return (
    <div className="mt-3 space-y-4">
      {byDesk(approvals, desks ?? {}).map(group => (
        <div key={group.key} className="border-l-2 border-etyme-rule pl-4">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-etyme-ink">{group.heading}</span>
            <span className="text-xs text-etyme-faint">{group.asks}</span>
          </div>
          <div className="mt-1.5 space-y-2">
            {group.rows.map(a => (
              <div key={a.id} className="text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-etyme-ink">{deciderName(a)}</span>
                  <Chip tone={outcomeTone(a.outcome)}>{outcomeWords(a.outcome)}</Chip>
                  {a.decidedAt && (
                    <span className="text-xs text-etyme-faint tabular-nums">
                      {new Date(a.decidedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-etyme-muted mt-0.5">{a.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


/**
 * Deciding your own row — and, at the sourcing desk, naming who may see it.
 *
 * This was three window.prompt calls. A prompt cannot offer a list of
 * suppliers, and Procurement's yes is exactly a list of suppliers: the
 * desk that audits who may supply a role is the desk that says which
 * firms it cleared, and the release cannot widen that list afterwards.
 *
 * Everything is ticked to begin with, because the common answer is "all
 * of them" and the point of the control is the exception.
 */
export function DecideModal({ req, action, sourcing, suppliers, onClose, onDone }: {
  req: { id: string; title: string }
  action: 'approve' | 'reject' | 'changes'
  /** True when the row in play is the caller's own Procurement row. */
  sourcing: boolean
  suppliers: { companyId: string; name: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [picks, setPicks] = useState<Record<string, boolean>>(() => allTicked(suppliers))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const asking = action === 'reject' || action === 'changes'
  const offerSuppliers = sourcing && action === 'approve' && suppliers.length > 0
  const chosen = tickedIds(suppliers, picks)

  async function send() {
    if (asking && !reason.trim()) {
      setErr(
        action === 'reject'
          ? 'Say why. Whoever raised it reads this and has nothing else to go on.'
          : 'Say what needs to change — otherwise this is a rejection with a softer name.'
      )
      return
    }
    if (offerSuppliers && chosen.length === 0) {
      setErr('Leave at least one supplier ticked, or this role can be sent to nobody.')
      return
    }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/requisitions/${req.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: reason.trim(),
          // Only the sourcing desk's yes carries a supplier list. Anybody
          // else's is ignored by the route, so it is not sent.
          ...(offerSuppliers ? { suppliers: chosen } : {}),
        }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(body?.error?.message ?? 'That decision did not save.')
      onDone()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const verb = action === 'approve' ? 'Approve' : action === 'reject' ? 'Reject' : 'Ask for changes'
  const field = 'w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-white'

  return (
    <div className="fixed inset-0 bg-etyme-ink/30 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-etyme-surface rounded-lg border border-etyme-rule w-full max-w-lg my-8 p-6"
        onClick={e => e.stopPropagation()}>
        <Lbl>{verb}</Lbl>
        <h2 className="font-serif text-xl text-etyme-ink mt-1 text-balance">{req.title}</h2>

        {offerSuppliers && (
          <div className="mt-5">
            <p className="text-sm text-etyme-ink">Which suppliers may see this?</p>
            <p className="text-xs text-etyme-muted mt-0.5">
              All of them, unless you say otherwise. Whoever releases the role
              afterwards can only go to the ones left ticked.
            </p>
            <div className="mt-3 divide-y divide-etyme-rule border border-etyme-rule rounded">
              {suppliers.map(s => (
                <label key={s.companyId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-etyme-action"
                    checked={picks[s.companyId] ?? false}
                    onChange={e => setPicks({ ...picks, [s.companyId]: e.target.checked })}
                  />
                  <span className="text-sm text-etyme-ink">{s.name}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-etyme-faint">
              {chosen.length} of {suppliers.length} ticked.
            </p>
          </div>
        )}

        <div className="mt-5">
          <Lbl>{asking ? 'What you want to say' : 'Note for the record (optional)'}</Lbl>
          <textarea
            autoFocus rows={3} value={reason} onChange={e => setReason(e.target.value)}
            className={`${field} mt-1`}
            placeholder={
              action === 'reject' ? 'Why this is not going ahead.'
              : action === 'changes' ? 'Bring it to $120 an hour and I will sign.'
              : 'Anything the next desk should know.'
            }
          />
        </div>

        {err && <p className="mt-3 text-sm text-etyme-attention">{err}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-etyme-muted hover:text-etyme-ink">
            Cancel
          </button>
          <button onClick={send} disabled={busy}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {busy ? 'Saving…' : verb}
          </button>
        </div>
      </div>
    </div>
  )
}



/** What the edit form reads and writes — the row, as either page holds it. */
export interface EditableRequisition {
  id: string
  title: string
  skills: string[]
  location: string | null
  headcount: number
  billMin: number | null
  billMax: number | null
  months: number | null
  neededBy: string | null
  description: string | null
  justification: string | null
  approvalState: string
  status: string
  archivedAt: string | Date | null
  interviewers?: string[]
}

/**
 * Changing one, including one that is already out.
 *
 * It used to open only on a draft or one an approver had handed back,
 * because a published requisition was locked — which forced a
 * cancel-and-re-raise to add a skill and lost every submission on it.
 *
 * The rule is src/lib/requisition-change.ts: words change now and every
 * supplier who received it is told; the money goes back through
 * approval and the suppliers are told to hold. The form says which of
 * those is about to happen BEFORE it happens, and afterwards shows the
 * sentence the route wrote rather than closing silently.
 */
export function EditRequisition({
  req,
  onClose,
  onSaved,
}: {
  req: EditableRequisition
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(req.title)
  const [skills, setSkills] = useState(req.skills.join(', '))
  const [location, setLocation] = useState(req.location ?? '')
  const [headcount, setHeadcount] = useState(String(req.headcount))
  const [billMin, setBillMin] = useState(req.billMin != null ? String(req.billMin / 100) : '')
  const [billMax, setBillMax] = useState(req.billMax != null ? String(req.billMax / 100) : '')
  const [months, setMonths] = useState(req.months != null ? String(req.months) : '')
  const [neededBy, setNeededBy] = useState(req.neededBy ? req.neededBy.slice(0, 10) : '')
  const [justification, setJustification] = useState(req.justification ?? '')
  const [description, setDescription] = useState(req.description ?? '')
  const [panel, setPanel] = useState<string[]>(req.interviewers ?? [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** The route's own sentence, once it has saved. */
  const [said, setSaid] = useState<string | null>(null)

  // Out to suppliers, read the same way every other screen reads it.
  const out = stageOf(req) === 'OPEN'

  /** Empty means "no figure", which is not the same as zero. */
  const cents = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100))
  const whole = (v: string) => (v.trim() === '' ? null : Number(v))

  async function save() {
    if (title.trim().length < 3) {
      setErr('Give it a title somebody else would recognise.')
      return
    }
    const min = cents(billMin)
    const max = cents(billMax)
    if (min !== null && max !== null && min > max) {
      setErr('The bottom of the rate band is above the top of it.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          title: title.trim(),
          skills: skills.split(',').map(x => x.trim()).filter(Boolean),
          location: location.trim() || null,
          headcount: Number(headcount) || 1,
          billMin: min,
          billMax: max,
          months: whole(months),
          neededBy: neededBy || null,
          description: description.trim() || null,
          justification: justification.trim() || null,
          // The panel travels with the requirement, so every interview
          // round starts with it. Never a form whose answer is thrown away.
          interviewers: panel,
        }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(body?.error?.message ?? 'That did not save.')
      // What just happened, in the route's own words: whether the
      // suppliers were told, and whether it is back with a desk.
      setSaid(body?.data?.message ?? 'Saved.')
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-white'
  const label = 'block text-[10px] uppercase tracking-wider text-etyme-muted mb-1'

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-etyme-surface rounded-lg border border-etyme-rule w-full max-w-lg my-8 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl text-etyme-ink">Edit requisition</h2>

        {said ? (
          /* What happened, said once, rather than a modal that shuts and
             leaves somebody wondering whether the suppliers heard. */
          <div className="mt-4">
            <p className="text-sm text-etyme-ink">{said}</p>
            <div className="mt-5 flex justify-end">
              <button onClick={onSaved}
                className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
                Done
              </button>
            </div>
          </div>
        ) : (
        <>
        <p className="text-xs text-etyme-muted mt-1">
          {out
            ? 'Words change now and your suppliers are told. Changing the rate, months, headcount or budget sends it back through approval.'
            : req.approvalState === 'CHANGES_REQUESTED'
              ? 'Handed back for changes. Saving sends it round again.'
              : req.approvalState === 'PENDING_APPROVAL'
                ? 'Still with a desk. Nothing has gone to a supplier, so nobody outside is told.'
                : 'Still a draft. Nobody has been asked to look at it yet.'}
        </p>

        {err && (
          <p className="mt-3 text-sm text-etyme-attention border border-etyme-attention rounded px-3 py-2">
            {err}
          </p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className={label}>Role</label>
            <input className={field} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={label}>Skills, comma separated</label>
            <input className={field} value={skills} onChange={e => setSkills(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Where</label>
              <input className={field} value={location} onChange={e => setLocation(e.target.value)} />
            </div>
            <div>
              <label className={label}>Positions</label>
              <input className={field} type="number" min="1" value={headcount}
                onChange={e => setHeadcount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Rate from ($/hr)</label>
              <input className={field} type="number" value={billMin}
                onChange={e => setBillMin(e.target.value)} placeholder="none" />
            </div>
            <div>
              <label className={label}>Rate to ($/hr)</label>
              <input className={field} type="number" value={billMax}
                onChange={e => setBillMax(e.target.value)} placeholder="none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Months</label>
              <input className={field} type="number" value={months}
                onChange={e => setMonths(e.target.value)} placeholder="none" />
            </div>
            <div>
              <label className={label}>Needed by</label>
              <input className={field} type="date" value={neededBy}
                onChange={e => setNeededBy(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>The role, in your own words</label>
            <textarea className={field} rows={6} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What the team does, what the person will actually work on, and what somebody who has done it before would recognise." />
          </div>
          <div>
            <label className={label}>Why this is needed</label>
            <textarea className={field} rows={3} value={justification}
              onChange={e => setJustification(e.target.value)} />
          </div>
          {/* The hiring panel. Names, on the requirement, so every round
              starts with them instead of being retyped per round. */}
          <PanelField names={panel} onChange={setPanel} />
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-etyme-muted hover:text-etyme-ink">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
