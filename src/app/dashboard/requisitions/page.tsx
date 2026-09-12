'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState, useCallback } from 'react'
import { STAGES, stageOf, mayEdit, closedBecause, type Stage } from '@/lib/requisition-stage'
import {
  Chain, Chip, DecideModal, EditRequisition, Lbl, PanelField, clearedForSentence, deskOf, myRow, whoFor, whoWillBeAsked,
  type Approval,
} from './chain'

/**
 * Requisitions — the demand side.
 *
 * A hiring manager says what they need; the system either clears it or
 * routes it, and says which and why. CLAUDE.md calls for progressive
 * explanation: "One line by default, reasoning on click."
 *
 * Addendum E: "Most requisitions must clear without human approval.
 * Governance slower than the workaround produces the workaround." So the
 * screen is built for the common case — raise it, watch it clear, get on
 * with the day — with the checks available but folded away.
 *
 * The decision itself lives in src/lib/requisition-approval.ts and is
 * tested there. This page only shows it.
 */

interface Check { code: string; outcome: string; reason: string }


/** Where a requirement has got to. One row's whole life, in four words. */
type Tab = 'ALL' | Stage

const TABS: Array<[Tab, string]> = [['ALL', 'All'], ...STAGES]


interface Requisition {
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
  status: string
  approvalState: string
  raisedBy: { id: string; name: string } | null
  /** Whose need it is. Absent where the read path does not send it yet. */
  owner?: { id: string; name: string } | null
  /** The suppliers Procurement's yes named. Empty = every approved one. */
  clearedSupplierIds?: string[]
  /** The hiring panel — names, not seats. Every interview round starts with them. */
  interviewers?: string[]
  orgUnit: { id: string; name: string } | null
  costCenter: { id: string; code: string; name: string } | null
  archivedAt: string | null
  cancelReason?: string | null
  approvals: Approval[]
  counts: { submissions: number; invitations: number }
  createdAt: string
}

function Stat({ label, value, tone = 'default', sub }: {
  label: string; value: string | number; tone?: 'default' | 'attention' | 'verified'; sub?: string
}) {
  const colour =
    tone === 'attention' ? 'text-etyme-attention'
    : tone === 'verified' ? 'text-etyme-verified'
    : 'text-etyme-ink'
  return (
    <div>
      <Lbl>{label}</Lbl>
      <div className={`font-serif text-3xl mt-1 tabular-nums ${colour}`}>{value}</div>
      {sub && <div className="text-xs text-etyme-muted mt-0.5">{sub}</div>}
    </div>
  )
}

/**
 * The one chip on the card, saying the same thing as the tab it sits under.
 *
 * This read `approvalState` while the tabs read `status`, so a row whose
 * approval had never been started but which was open to suppliers showed
 * a "Draft" chip inside the "Published" tab. Both were true about
 * different columns and together they read as a contradiction. The
 * approval detail did not disappear — it is in Why, where the whole chain
 * is, rather than competing with the stage on the same line.
 */
function stageChip(r: Requisition) {
  switch (stageOf(r)) {
    // Put away, with why: "all 2 seats filled" is the reason, not a tab.
    case 'ARCHIVED':  return <Chip tone={r.status === 'FILLED' ? 'verified' : undefined}>{closedBecause(r)}</Chip>
    case 'CANCELLED': return <Chip tone="attention">Cancelled</Chip>
    case 'AWAITING':  return <Chip tone="attention">Waiting on approval</Chip>
    case 'CHANGES':   return <Chip tone="attention">Needs changes</Chip>
    case 'OPEN':      return <Chip tone="action">Published</Chip>
    default:          return <Chip>Draft</Chip>
  }
}

/**
 * Progressive explanation — the summary line always, the checks on click.
 * A manager whose requisition cleared does not need the arithmetic; one
 * whose requisition routed needs exactly it.
 */
function Why({ approvals, state, desks }: {
  approvals: Approval[]
  state: string
  desks?: { hrPersonId?: string | null; procurementPersonId?: string | null }
}) {
  const [open, setOpen] = useState(false)

  // An empty chain is not an absent answer — it is the answer.
  //
  // This returned null, so the requisitions that matter most to the
  // founder's own claim ("most requisitions clear without a human") were
  // the ones that explained themselves least: a row that sailed through
  // showed no reasoning at all, and looked broken rather than fast.
  if (approvals.length === 0) {
    if (state === 'AUTO_APPROVED') {
      return (
        <p className="mt-3 text-sm text-etyme-muted">
          Cleared the moment it was raised — inside plan, inside budget, inside the
          going rate. No approver was needed.
        </p>
      )
    }
    return (
      <p className="mt-3 text-sm text-etyme-faint">
        Not sent for approval yet. Nobody has been asked to look at this.
      </p>
    )
  }

  const headline = approvals[0]

  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <p className="text-sm text-etyme-muted flex-1">{headline.reason}</p>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs text-etyme-action hover:underline shrink-0 mt-0.5"
        >
          {open ? 'Hide' : 'Why'}
        </button>
      </div>
      {open && <Chain approvals={approvals} desks={desks} />}
    </div>
  )
}

/** The decision the system just made, shown immediately after raising one. */
function DecisionPanel({ decision, onDismiss }: {
  decision: {
    state: string; summary: string; checks: Check[]; route: { name: string }[]
    steps?: { stage: string; rank: number; approverName: string | null; outcome: string; reason: string }[]
  }
  onDismiss: () => void
}) {
  const cleared = decision.state === 'AUTO_APPROVED'
  return (
    <div className={`border rounded-lg p-6 mb-6 ${
      cleared ? 'border-etyme-verified/30 bg-etyme-verified/5' : 'border-etyme-attention/30 bg-etyme-attention/5'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Lbl>{cleared ? 'Open' : 'Sent for approval'}</Lbl>
          <p className="font-serif text-lg text-etyme-ink mt-1 text-balance">
            {decision.summary}
          </p>
        </div>
        <button onClick={onDismiss} className="text-etyme-faint hover:text-etyme-ink text-sm">
          ✕
        </button>
      </div>
      <div className="mt-4 space-y-1.5">
        {decision.checks.map(c => (
          <div key={c.code} className="flex items-baseline gap-3 text-sm">
            <span className={`w-4 shrink-0 ${
              c.outcome === 'PASS' ? 'text-etyme-verified' : 'text-etyme-attention'
            }`}>
              {c.outcome === 'PASS' ? '✓' : '!'}
            </span>
            <span className="text-etyme-muted">{c.reason}</span>
          </div>
        ))}
      </div>

      {/* What each desk said, in the order it was asked. The route sends
          this back on the raise; nothing read it, so somebody was told
          "sent for approval" and had to open the row to find out to whom. */}
      {decision.steps && decision.steps.length > 0 && (
        <Chain
          approvals={decision.steps.map((s, i) => ({
            id: `step-${i}`,
            approver: s.approverName ? { id: `step-${i}`, name: s.approverName } : null,
            rank: s.rank,
            stage: s.stage,
            outcome: s.outcome,
            reason: s.reason,
            decidedAt: null,
          }))}
        />
      )}
    </div>
  )
}

function RaiseModal({ onClose, onRaised, team, me }: {
  onClose: () => void
  onRaised: (decision: any) => void
  team: any | null
  me: { id: string; name: string } | null
}) {
  const [form, setForm] = useState({
    title: '', skills: '', location: '', headcount: '1',
    billMin: '', billMax: '', months: '', neededBy: '', justification: '', description: '', costCenterId: '',
    budget: '', hoursPerWeek: '', ownerId: '',
  })
  const [costCenters, setCostCenters] = useState<{ id: string; code: string; name: string }[]>([])
  /** Who is interviewing. Names, on the requirement, from the start. */
  const [panel, setPanel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Whose need it is, defaulting to you. A coordinator raising four roles
  // for four managers is ordinary; until this existed the only name on
  // the row was the coordinator's.
  const people: { id: string; name: string }[] = (team?.people ?? [])
    .map((p: any) => p.person)
    .filter((p: any) => p?.id)
  const ownerId = form.ownerId || me?.id || ''
  const asked = whoWillBeAsked(form.costCenterId, team)

  useEffect(() => {
    // The budgets themselves. This asked /api/program/org, which returns
    // managers, vendors and spend and has never carried a cost centre —
    // so the list was empty however many existed.
    fetch('/api/settings/cost-centers')
      .then(r => r.json())
      .then(j => {
        const ccs = j?.data?.costCenters ?? []
        setCostCenters(ccs.map((c: any) => ({ id: c.id, code: c.code, name: c.name })))
      })
      .catch(() => {})
  }, [])

  async function submit() {
    if (form.title.trim().length < 3) {
      setError('Give the role a title')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
          location: form.location.trim() || null,
          headcount: parseInt(form.headcount, 10) || 1,
          // Rates are entered in dollars and stored in cents.
          budget: form.budget ? Math.round(parseFloat(form.budget) * 100) : null,
          hoursPerWeek: form.hoursPerWeek ? parseInt(form.hoursPerWeek, 10) : null,
          billMin: form.billMin ? Math.round(parseFloat(form.billMin) * 100) : null,
          billMax: form.billMax ? Math.round(parseFloat(form.billMax) * 100) : null,
          months: form.months ? parseInt(form.months, 10) : null,
          neededBy: form.neededBy || null,
          description: form.description.trim() || null,
          justification: form.justification.trim() || null,
          costCenterId: form.costCenterId || null,
          // Whose need it is, distinct from who typed it. Never ask a
          // question whose answer is thrown away — the route reads this.
          ownerId: ownerId || null,
          // The panel, so the first interview form opens with the room
          // already in it rather than asking again.
          interviewers: panel,
        }),
      })
      const json = await readJson(res)
      onRaised(json.data.decision)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action'

  return (
    <div className="fixed inset-0 bg-etyme-ink/30 flex items-start justify-center p-6 z-50 overflow-y-auto">
      <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-6 max-w-xl w-full my-8">
        <Lbl>New requisition</Lbl>
        <h2 className="font-serif text-2xl text-etyme-ink mt-1 mb-1 tracking-[-0.02em]">
          What do you need?
        </h2>
        <p className="text-sm text-etyme-muted mb-5">
          Most requisitions clear without anyone having to approve them. You will
          see which, and why, as soon as you raise it.
        </p>

        <div className="space-y-4">
          <label className="block">
            <Lbl>Role</Lbl>
            <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="SAP MM Consultant" className={`${field} mt-1`} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <Lbl>How many</Lbl>
              <input type="number" min="1" value={form.headcount}
                onChange={e => setForm({ ...form, headcount: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block">
              <Lbl>For how long (months)</Lbl>
              <input type="number" min="1" value={form.months}
                onChange={e => setForm({ ...form, months: e.target.value })}
                placeholder="6" className={`${field} mt-1`} />
            </label>
          </div>

          {/* A range, not a ceiling.
              Requirement carries billMin and billMax and the form only
              ever sent the max, so every requisition was raised with no
              floor — and a supplier reading one could not tell whether
              $60/hr was welcome or insulting. The floor is also what
              makes the rate check on approval mean anything. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block">
              <Lbl>Rate from ($/hr)</Lbl>
              <input type="number" min="0" step="1" value={form.billMin}
                onChange={e => setForm({ ...form, billMin: e.target.value })}
                placeholder="105" className={`${field} mt-1 tabular-nums`} />
            </label>
            <label className="block">
              <Lbl>Up to ($/hr)</Lbl>
              <input type="number" min="0" step="1" value={form.billMax}
                onChange={e => setForm({ ...form, billMax: e.target.value })}
                placeholder="130" className={`${field} mt-1 tabular-nums`} />
            </label>
            <label className="block">
              <Lbl>Hours a week</Lbl>
              <input type="number" min="1" max="60" step="1" value={form.hoursPerWeek}
                onChange={e => setForm({ ...form, hoursPerWeek: e.target.value })}
                placeholder="40" className={`${field} mt-1 tabular-nums`} />
            </label>
            <label className="block">
              <Lbl>Needed by</Lbl>
              <input type="date" value={form.neededBy}
                onChange={e => setForm({ ...form, neededBy: e.target.value })} className={`${field} mt-1`} />
            </label>
          </div>

          {/* The money, stated rather than inferred.
              The figure that decides who has to approve was derived from
              the rate and a hardcoded 160 hours a month, so nobody typed
              it and nobody could see it. Stated, it wins; left blank, the
              estimate still answers and says that it is one. */}
          <label className="block">
            <Lbl>Budget for it ($, optional)</Lbl>
            <input type="number" min="0" step="1000" value={form.budget}
              onChange={e => setForm({ ...form, budget: e.target.value })}
              placeholder="200000" className={`${field} mt-1 tabular-nums`} />
            <p className="text-xs text-etyme-muted mt-1">
              What has actually been signed off. Left blank, we estimate it
              from the rate and the duration, and say so.
            </p>
          </label>

          <label className="block">
            <Lbl>Which budget pays for it</Lbl>
            <select value={form.costCenterId} onChange={e => setForm({ ...form, costCenterId: e.target.value })}
              className={`${field} mt-1`}>
              <option value="">— not stated —</option>
              {costCenters.map(c => (
                <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
              ))}
            </select>
            <p className="text-xs text-etyme-muted mt-1">
              Without one, nobody owns the spend and it goes for approval.
            </p>
          </label>

          {/* Whose need it is, which is not always who is typing.
              A programme coordinator raising four roles for four managers
              is the ordinary case, and the row used to carry only the
              coordinator's name — so nobody could see whose headcount it
              was, and the lead's yes could not be held off the person it
              was for. */}
          {people.length > 0 && (
            <label className="block">
              <Lbl>Who is this for?</Lbl>
              <select value={ownerId} onChange={e => setForm({ ...form, ownerId: e.target.value })}
                className={`${field} mt-1`}>
                {me && <option value={me.id}>{me.name} (you)</option>}
                {people
                  .filter(p => p.id !== me?.id)
                  .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-etyme-muted mt-1">
                The manager whose need this is. Both names show on the row when
                they are different, and nobody gives the final word on their own.
              </p>
            </label>
          )}

          {/* Who would be asked, before it is raised rather than after.
              The page promised "you will see which, and why, as soon as
              you raise it", which is true and a beat too late: somebody
              deciding whether to round a rate down to stay inside their
              own authority needs to know where the line is first.

              And it listed every rule at the company, including the HR
              and Procurement desks of units this budget has nothing to do
              with. The desks are standing and per business unit, and the
              budget names the unit — so it can say the three actual
              people rather than five rows of rules. */}
          {team && (
            <div className="card">
              <Lbl>Who would be asked</Lbl>
              {asked.unitName && (
                <p className="text-xs text-etyme-muted mt-1">
                  {asked.budgetCode} sits in {asked.unitName}.
                </p>
              )}
              <ul className="mt-2 space-y-1.5">
                <li className="text-[13px] text-etyme-muted">
                  <span className="text-etyme-ink">Role — HR.</span>{' '}
                  {asked.hr
                    ? <>{asked.hr.person.name}{asked.hr.inherited ? ` (named for ${asked.hr.from.name})` : ''} — if it is over the plan.</>
                    : 'Nobody named, so anything over the plan clears with a note instead.'}
                </li>
                <li className="text-[13px] text-etyme-muted">
                  <span className="text-etyme-ink">Sourcing — Procurement.</span>{' '}
                  {asked.procurement
                    ? <>{asked.procurement.person.name}{asked.procurement.inherited ? ` (named for ${asked.procurement.from.name})` : ''} — if the rate is above what you already pay.</>
                    : 'Nobody named, so a rate above the band clears with a note instead.'}
                </li>
                <li className="text-[13px] text-etyme-muted">
                  <span className="text-etyme-ink">The money — the lead.</span>{' '}
                  {asked.lead
                    ? `${asked.lead.name}, who owns this budget — if it is over budget.`
                    : (asked.leadNote ?? 'Pick the budget and this says who would be asked.')}
                </li>
                {asked.money.map(m => (
                  <li key={m.id} className="text-[13px] text-etyme-muted">
                    <span className="text-etyme-ink">{m.name}.</span>{' '}
                    {m.approverName}
                    {m.thresholdDollars != null
                      ? ` — anything over $${Math.round(m.thresholdDollars).toLocaleString()} a year.`
                      : ' — whenever a check routes it.'}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-etyme-faint mt-2">
                Within plan, budget and rate, none of them is asked — it clears
                itself and every desk records why.
              </p>
            </div>
          )}

          <label className="block">
            <Lbl>Skills (comma separated)</Lbl>
            <input value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })}
              placeholder="SAP MM, S/4HANA" className={`${field} mt-1`} />
          </label>

          <label className="block">
            <Lbl>Where</Lbl>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
              placeholder="Lakewood, CO" className={`${field} mt-1`} />
          </label>

          <label className="block">
            <Lbl>The role, in your own words (optional)</Lbl>
            <textarea value={form.description} rows={5}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="What the team does, what this person will actually work on, and what somebody who has done it before would recognise."
              className={`${field} mt-1`} />
          </label>

          <label className="block">
            <Lbl>Why you need it (optional)</Lbl>
            <textarea value={form.justification} rows={2}
              onChange={e => setForm({ ...form, justification: e.target.value })}
              placeholder="Backfill for the Q4 validation programme" className={`${field} mt-1 resize-none`} />
          </label>

          {/* The room, before there is anybody to put in it. The manager
              knows who will interview long before a CV arrives, and every
              round then starts with those names instead of retyping them. */}
          <PanelField names={panel} onChange={setPanel} />
        </div>

        {error && <div className="mt-4 text-sm text-etyme-attention">{error}</div>}

        <div className="mt-6 flex items-center gap-3">
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {busy ? 'Raising…' : 'Raise requisition'}
          </button>
          <button onClick={onClose} className="text-sm text-etyme-muted hover:text-etyme-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RequisitionsPage() {
  const [reqs, setReqs] = useState<Requisition[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Tab>('ALL')
  /**
   * Archived rows are off the working list by default.
   *
   * That is the whole meaning of archiving — it is filed as a date rather
   * than a status precisely so it cannot overwrite what actually happened
   * to a row. Hiding them is what makes the button worth pressing; before
   * this, archiving changed a label and nothing else.
   */
  const [editing, setEditing] = useState<Requisition | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [raising, setRaising] = useState(false)
  const [decision, setDecision] = useState<any>(null)
  /** Who is reading — so only your own row offers you a decision. */
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  /** The programme: the desks per unit, the budgets and their owners. */
  const [team, setTeam] = useState<any | null>(null)
  const [suppliers, setSuppliers] = useState<{ companyId: string; name: string }[]>([])
  const [deciding, setDeciding] = useState<
    { req: Requisition; action: 'approve' | 'reject' | 'changes'; sourcing: boolean } | null
  >(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Archived rows too: they have a tab now.
      const res = await fetch('/api/requisitions?archived=true')
      const json = await readJson(res)
      setReqs(json.data.requisitions)
      setSummary(json.data.summary)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Who is reading, which desks exist, and who this client buys from.
  // All three are read once and are optional: a page that cannot read the
  // programme still lists requisitions, it just offers fewer decisions.
  useEffect(() => {
    fetch('/api/me').then(r => r.json())
      .then(j => { const p = j?.data?.person; if (p?.id) setMe({ id: p.id, name: p.name }) })
      .catch(() => {})
    fetch('/api/program/team').then(r => r.json())
      .then(j => { if (j?.data?.company) setTeam(j.data) })
      .catch(() => {})
    fetch('/api/suppliers').then(r => r.json())
      .then(j => setSuppliers(
        (j?.data?.suppliers ?? []).map((s: any) => ({ companyId: s.companyId, name: s.name }))
      ))
      .catch(() => {})
  }, [])

  /** Supplier names, so a cleared list reads as firms and not as ids. */
  const supplierNames: Record<string, string> = Object.fromEntries(
    suppliers.map(s => [s.companyId, s.name])
  )

  /**
   * The desks for a row's own unit.
   *
   * Used only to place an approval under the right heading where the row
   * does not carry its stage. The desk is a fact about the unit, not
   * about the requisition, so it is read from the programme once.
   */
  function desksFor(r: Requisition) {
    const unitId = r.orgUnit?.id
      ?? (team?.budgets ?? []).find((b: any) => b.id === r.costCenter?.id)?.department?.id
      ?? null
    const d = (team?.desks ?? []).find((x: any) => x.unit.id === unitId)
    return {
      hrPersonId: d?.hr?.person?.id ?? null,
      procurementPersonId: d?.procurement?.person?.id ?? null,
    }
  }

  // The whole life of a requirement, on one screen.
  //
  // This was two nav entries — "Requisitions" for the ones awaiting
  // approval and "Open roles" for the ones released to suppliers —
  // pointing at two screens showing the same rows at two stages. They
  // read as competing entry points, because that is what they looked
  // like. The stage belongs here, as a filter, where somebody can see
  // all of it at once and narrow when they want to.

  /**
   * Calling one off. A reason is required by the route, and rightly:
   * every supplier still working it is stood down, and being stood down
   * without being told why is the part they remember.
   */
  async function cancel(id: string, title: string) {
    const reason = window.prompt(
      `Why is "${title}" being cancelled?\n\nSuppliers sourcing against it will be stood down and shown this.`
    )
    if (reason === null) return
    if (!reason.trim()) {
      setError('Say why — suppliers sourcing against this are owed a reason.')
      return
    }
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/requisitions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: reason.trim() }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(body?.error?.message ?? 'It could not be cancelled.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  /** Off the working list, or back onto it. Changes nothing else. */
  async function putAway(id: string, action: 'archive' | 'unarchive') {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/requisitions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(body?.error?.message ?? 'That did not work.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const term = q.trim().toLowerCase()
  // The working list is everything not put away; Archived is its own
  // tab, so a settled row has a place to be found rather than a
  // checkbox to remember.
  const working = reqs.filter(r => stageOf(r) !== 'ARCHIVED')
  const archived = reqs.filter(r => stageOf(r) === 'ARCHIVED')
  const onTheList = stage === 'ARCHIVED' ? archived : working
  const visible = onTheList.filter(r =>
    (stage === 'ALL' || stageOf(r) === stage)
  ).filter(r =>
    term.length === 0 ||
    r.title.toLowerCase().includes(term) ||
    (r.costCenter?.code ?? '').toLowerCase().includes(term) ||
    (r.location ?? '').toLowerCase().includes(term) ||
    r.skills.some(s => s.toLowerCase().includes(term))
  )

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          {/* The eyebrow and the heading both said something the menu no
              longer says — "Program" for a section now called Workforce,
              "Requisitions" for an entry now called Requirements. A menu
              item and the heading of the page it opens are one promise
              made twice. */}
          <Lbl>Workforce</Lbl>
          <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em] text-balance">
            Requirements
          </h1>
          <p className="text-etyme-muted mt-2 max-w-2xl">
            What your managers need. Most clear the moment they are raised — only
            those over plan, over budget or above the going rate go to a person.
          </p>
        </div>
        <button onClick={() => setRaising(true)}
          className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 shrink-0">
          Raise one
        </button>
      </div>

      {decision && <DecisionPanel decision={decision} onDismiss={() => setDecision(null)} />}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-etyme-rule">
          <Stat label="Open" value={summary.open} />
          <Stat label="Cleared automatically" value={summary.autoCleared} tone="verified"
            sub="no human needed" />
          <Stat label="Waiting on a person" value={summary.awaitingApproval}
            tone={summary.awaitingApproval > 0 ? 'attention' : 'default'} />
          <Stat label="All requisitions" value={summary.total} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => {
          // Counted over the same set the tab will show, or the number lies.
          const n =
            key === 'ALL' ? working.length
            : key === 'ARCHIVED' ? archived.length
            : working.filter(r => stageOf(r) === key).length
          return (
            <button
              key={key}
              onClick={() => setStage(key)}
              className={`filter-tab ${stage === key ? 'filter-tab--active' : 'filter-tab--inactive'}`}
            >
              {label} <span className="tabular-nums opacity-60">{n}</span>
            </button>
          )
        })}
      </div>

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by role, budget code, skill or location…"
        className="w-full px-3 py-2 mb-6 border border-etyme-rule rounded bg-etyme-surface text-sm text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action"
      />

      {loading && <div className="text-etyme-muted py-12 text-center">Loading…</div>}

      {!loading && error && (
        <div className="border border-etyme-attention/30 bg-etyme-attention/5 rounded-lg p-6">
          <div className="text-etyme-attention font-medium">{error}</div>
          <button onClick={load} className="mt-3 text-sm text-etyme-action hover:underline">Try again</button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="border border-etyme-rule rounded-lg p-12 text-center">
          <p className="font-serif text-lg text-etyme-ink">
            {term ? 'Nothing matches that search' : 'No requisitions yet'}
          </p>
          <p className="text-sm text-etyme-muted mt-2 max-w-md mx-auto">
            {term ? 'Try a different role or budget code.'
                  : 'Raise one and it will either open straight away or go to whoever needs to see it.'}
          </p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="space-y-4">
          {visible.map(r => {
            const pending = r.approvals.find(a => a.outcome === 'PENDING')
            // Only your own row, at the rank in play — the same rule the
            // route enforces. A button that returns "this approval is not
            // yours" is a button nobody should have been shown.
            const mine = myRow(r.approvals, me?.id ?? null)
            const mineIsSourcing = mine ? deskOf(mine, desksFor(r)) === 'SOURCING' : false
            const clearedFor = clearedForSentence(r.clearedSupplierIds, supplierNames)
            return (
              <div key={r.id} className="bg-etyme-surface border border-etyme-rule rounded-lg p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <a href={`/dashboard/requisitions/${r.id}`}
                      className="font-serif text-xl text-etyme-ink tracking-[-0.02em] text-balance hover:text-etyme-action">
                      {r.title}
                    </a>
                    <div className="text-sm text-etyme-muted mt-1">
                      {r.headcount} position{r.headcount === 1 ? '' : 's'}
                      {r.location && ` · ${r.location}`}
                      {r.costCenter && ` · ${r.costCenter.code}`}
                      {/* Whose need it is, then who typed it — said twice
                          only when they are two different people. */}
                      {whoFor(r) && ` · ${whoFor(r)}`}
                    </div>
                    {clearedFor && (
                      <div className="text-xs text-etyme-muted mt-1">{clearedFor}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    {stageChip(r)}
                    {r.billMax != null && (
                      <div className="font-serif text-lg text-etyme-ink tabular-nums">
                        ${Math.round(r.billMax / 100)}
                        <span className="text-xs text-etyme-muted font-sans">/hr max</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* The role in the raiser's own words. One line on the
                    list, the rest on the row's own page — a list of two
                    hundred is not the place to read six paragraphs. */}
                {r.description && (
                  <p className="mt-2 text-sm text-etyme-muted line-clamp-2">{r.description}</p>
                )}

                <Why approvals={r.approvals} state={r.approvalState} desks={desksFor(r)} />

                <div className="mt-4 pt-4 border-t border-etyme-rule flex items-center justify-between gap-4">
                  <div className="text-xs text-etyme-muted">
                    {r.counts.invitations} vendor{r.counts.invitations === 1 ? '' : 's'} invited
                    {' · '}{r.counts.submissions} candidate{r.counts.submissions === 1 ? '' : 's'} submitted
                  </div>
                  {/* Change it, call it off, or put it away.
                      Editing used to hide the moment a requisition went
                      out, which forced a cancel-and-re-raise to add a
                      missing skill. It now shows wherever the rule allows
                      a change — a draft, one waiting on a desk, one handed
                      back, and a published one — and the form itself says
                      what saving will do (src/lib/requisition-change.ts).
                      Cancel and Archive stay off a row somebody is
                      deciding, because they are not the editor's to press
                      while a desk holds it. */}
                  {(mayEdit(r) || (!pending && r.status !== 'CANCELLED')) && (
                    <div className="flex items-center gap-2 shrink-0">
                      {mayEdit(r) && (
                        <button
                          onClick={() => setEditing(r)}
                          className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink"
                        >
                          Edit
                        </button>
                      )}
                      {!pending && r.status !== 'CANCELLED' && r.status !== 'FILLED' && (
                        <button
                          onClick={() => cancel(r.id, r.title)}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-attention hover:border-etyme-attention"
                        >
                          Cancel
                        </button>
                      )}
                      {!pending && r.status !== 'CANCELLED' && r.status !== 'OPEN' && (
                        <button
                          onClick={() => putAway(r.id, r.archivedAt ? 'unarchive' : 'archive')}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink"
                        >
                          {r.archivedAt ? 'Put back' : 'Archive'}
                        </button>
                      )}
                    </div>
                  )}
                  {mine && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDeciding({ req: r, action: 'approve', sourcing: mineIsSourcing })}
                        className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">
                        {mineIsSourcing ? 'Approve and name suppliers' : 'Approve'}
                      </button>
                      {/* The middle answer. Without it an approver who
                          only wants the rate moved has to reject the whole
                          thing, which stands the suppliers down and makes
                          somebody raise it again from nothing. */}
                      <button
                        onClick={() => setDeciding({ req: r, action: 'changes', sourcing: mineIsSourcing })}
                        className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-ink">
                        Ask for changes
                      </button>
                      <button
                        onClick={() => setDeciding({ req: r, action: 'reject', sourcing: mineIsSourcing })}
                        className="px-3 py-1.5 border border-etyme-rule text-etyme-muted rounded text-xs hover:text-etyme-attention hover:border-etyme-attention">
                        Reject
                      </button>
                    </div>
                  )}
                  {/* Waiting on somebody else. Said, rather than shown as
                      an empty space where three buttons are for others. */}
                  {pending && !mine && (
                    <div className="text-xs text-etyme-muted shrink-0">
                      {pending.approver
                        ? `Waiting on ${pending.approver.name}`
                        : 'Waiting on a desk nobody is named for'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {raising && (
        <RaiseModal
          team={team}
          me={me}
          onClose={() => setRaising(false)}
          onRaised={d => { setDecision(d); load() }}
        />
      )}

      {deciding && (
        <DecideModal
          req={deciding.req}
          action={deciding.action}
          sourcing={deciding.sourcing}
          suppliers={suppliers}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); load() }}
        />
      )}

      {editing && (
        <EditRequisition
          req={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
