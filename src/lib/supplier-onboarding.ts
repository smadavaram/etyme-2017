/**
 * A supplier is not a paste. Somebody at the client — usually the
 * hiring manager who met them — recommends a firm and says what it
 * supplies. Then it walks three desks, in order, the way a requisition
 * does: the program office confirms the need, HR reads the skill set
 * against what the client hires, and indirect Procurement screens the
 * firm — tax form, insurance, bank details, experience, references,
 * revenue and delivery proofs, the proposal, a D&B report, sanctions —
 * with the vendor supplying its side through a link of its own. Nobody
 * decides their own recommendation, and nobody decides two desks.
 */

export const STAGES = ['LEAD', 'PROCUREMENT', 'HR', 'FINANCE', 'DONE'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_WORD: Record<Stage, string> = {
  LEAD: 'Department lead',
  PROCUREMENT: 'Procurement',
  HR: 'HR',
  FINANCE: 'Finance',
  DONE: 'Done',
}

/** What each desk is deciding, in a sentence. */
export const STAGE_ASKS: Record<Exclude<Stage, 'DONE'>, string> = {
  LEAD: 'Is there a business need for another supplier in this department, and is this the firm?',
  PROCUREMENT: 'Does the firm qualify — its experience, references, revenue and delivery proofs, its proposal, its D&B standing?',
  HR: 'Is the firm compliant and clean to trade with — insured, screened for sanctions and litigation, under an agreement?',
  FINANCE: 'Can the firm be paid — a tax form on file and bank details that check out?',
}

/** The word on the button at each desk. */
export const STAGE_VERB: Record<Exclude<Stage, 'DONE'>, string> = {
  LEAD: 'Confirm the need',
  PROCUREMENT: 'Qualified',
  HR: 'Cleared compliance',
  FINANCE: 'Approve as a supplier',
}

export const REQUEST_STATES = ['RECOMMENDED', 'IN_REVIEW', 'APPROVED', 'DECLINED'] as const
export type RequestState = (typeof REQUEST_STATES)[number]

export const STATE_WORD: Record<RequestState, string> = {
  RECOMMENDED: 'Recommended',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
}

export type ItemState = 'MISSING' | 'PROVIDED' | 'HELD' | 'WAIVED'

export interface ChecklistItem {
  key: string
  label: string
  /** The desk's yes is refused while a required item of its own is not HELD or WAIVED. */
  required: boolean
  /** Who puts it on file: the vendor through its link, or the desk itself. */
  by: 'VENDOR' | 'DESK'
  /** Which desk verifies it. */
  desk: 'PROCUREMENT' | 'HR' | 'FINANCE'
  state: ItemState
  note: string | null
  at: string | null
  fileName?: string | null
}

/** What the desks ask for, in the words they use, and who verifies each. */
export const CHECKLIST: Omit<ChecklistItem, 'state' | 'note' | 'at'>[] = [
  // Procurement qualifies the firm
  { key: 'EXPERIENCE', label: 'Past experience and delivery proofs', required: true, by: 'VENDOR', desk: 'PROCUREMENT' },
  { key: 'REFERENCES', label: 'Two client references', required: true, by: 'VENDOR', desk: 'PROCUREMENT' },
  { key: 'REVENUE', label: 'Revenue proof (last two years)', required: false, by: 'VENDOR', desk: 'PROCUREMENT' },
  { key: 'PROPOSAL', label: 'Proposal or rate card', required: false, by: 'VENDOR', desk: 'PROCUREMENT' },
  { key: 'DNB_REPORT', label: 'Dun & Bradstreet report', required: true, by: 'DESK', desk: 'PROCUREMENT' },
  { key: 'REFERENCE_CHECK', label: 'References contacted', required: false, by: 'DESK', desk: 'PROCUREMENT' },
  // HR: compliance and screening
  { key: 'INSURANCE', label: 'Certificate of insurance (general liability and workers’ comp)', required: true, by: 'VENDOR', desk: 'HR' },
  { key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, litigation)', required: true, by: 'DESK', desk: 'HR' },
  { key: 'AGREEMENT', label: 'Signed agreement', required: false, by: 'DESK', desk: 'HR' },
  // Finance: can the firm be paid
  { key: 'TAX_FORM', label: 'Tax form (W-9, or W-8 for a foreign firm)', required: true, by: 'VENDOR', desk: 'FINANCE' },
  { key: 'BANK', label: 'Bank details for payment', required: true, by: 'VENDOR', desk: 'FINANCE' },
]

export function newChecklist(): ChecklistItem[] {
  return CHECKLIST.map((c) => ({ ...c, state: 'MISSING', note: null, at: null, fileName: null }))
}

/** Anybody who may raise a requirement may recommend a supplier for it. */
export function mayRecommend(permissions: readonly string[]): boolean {
  return permissions.includes('requirements.write') || permissions.includes('vendors.manage')
}

export interface Decision {
  stage: Stage
  outcome: 'APPROVED' | 'DECLINED'
  byId: string
  byName: string
  at: string
  note: string | null
}

export interface Desks {
  /** The recommender's department lead — the nearest value-rule approver up their unit tree — where one is named. */
  leadId: string | null
  /** The HR standing desk, where the company named one. */
  hrId: string | null
  /** The Procurement standing desk, where the company named one. */
  procurementId: string | null
}

export type ActVerdict =
  | { ok: true }
  | { ok: false; code: 'NOT_THIS_DESK' | 'OWN_RECOMMENDATION' | 'ALREADY_DECIDED' | 'DECIDED_BEFORE' | 'DONE' | 'NOBODY_ELSE'; message: string }

/**
 * Who may decide at the desk the request is on now.
 *
 *   LEAD         — the recommender's department lead; the program office (whoever owns the governance rules) where none is named
 *   PROCUREMENT  — the Procurement standing desk, or anybody who manages suppliers
 *   HR           — the HR standing desk, or the program office where none is named
 *   FINANCE      — accounts payable: whoever may record a payment
 *
 * Never the recommender; never somebody who decided an earlier desk.
 * Segregation of duties is a BLOCK, not a warning.
 *
 * ── When the named desk cannot decide it ─────────────────────────────
 *
 * CLAUDE.md, decided 2026-09-13: a desk nobody has named falls back; it
 * never refuses. The same is true of a desk named to somebody who
 * cannot act on this one — the VP who recommended the firm herself, or
 * the HR lead who already cleared it at an earlier desk. Holding the
 * request on a desk whose one holder is barred from it is a deadlock
 * with no words, and the request sits there until somebody notices.
 * The program office stands in, and the screen says so.
 *
 * ── When nobody at the firm can decide it ────────────────────────────
 *
 * A one-person corporation, or a client in its first week with one
 * seat, has no second desk to stand in. The control stays — nobody
 * signs their own — but the refusal has to say what is actually needed
 * rather than "that desk decides it", which names a desk that does not
 * exist. Pass `deskHolders` (everybody who could hold this desk) and
 * the refusal explains; leave it out and the old wording stands.
 */
export function mayActAt(input: {
  stage: Stage
  permissions: readonly string[]
  callerId: string
  recommendedById: string
  decisions: Decision[]
  desks: Desks
  firmName: string
  /** Everybody who could hold this desk, when the caller knows. */
  deskHolders?: readonly string[]
  /** The firm doing the buying, for the sentence. */
  companyName?: string
}): ActVerdict {
  const { stage, permissions, callerId, firmName } = input
  if (stage === 'DONE') return { ok: false, code: 'DONE', message: `${firmName} has already been decided.` }

  /** Barred from this desk, whoever they are: they recommended it, or they decided an earlier one. */
  const barred = (id: string | null): boolean =>
    id === null || id === input.recommendedById || input.decisions.some((d) => d.byId === id)

  if (input.deskHolders && input.deskHolders.every((id) => barred(id))) {
    const here = input.companyName ?? 'this company'
    return {
      ok: false,
      code: 'NOBODY_ELSE',
      message:
        `Nobody else at ${here} can take the ${STAGE_WORD[stage]} desk on ${firmName}. ` +
        'Everybody who could either recommended the firm or has already decided an ' +
        'earlier desk, and nobody signs their own. Invite a second person under Users ' +
        'and permissions, or have somebody else recommend the firm.',
    }
  }

  if (callerId === input.recommendedById) {
    return { ok: false, code: 'OWN_RECOMMENDATION', message: `You recommended ${firmName}, so the desks decide it without you. Nobody signs their own.` }
  }
  if (input.decisions.some((d) => d.byId === callerId)) {
    return { ok: false, code: 'DECIDED_BEFORE', message: `You already decided an earlier desk on ${firmName}. Somebody else takes this one.` }
  }
  const pmo = permissions.includes('governance.write')
  const onDesk =
    stage === 'LEAD' ? (barred(input.desks.leadId) ? pmo : callerId === input.desks.leadId)
    : stage === 'PROCUREMENT' ? callerId === input.desks.procurementId || permissions.includes('vendors.manage')
    : stage === 'HR' ? (barred(input.desks.hrId) ? pmo : callerId === input.desks.hrId)
    : permissions.includes('payments.record')
  if (!onDesk) {
    return { ok: false, code: 'NOT_THIS_DESK', message: `${firmName} is on the ${STAGE_WORD[stage]} desk. That desk decides it; you will be told what they said.` }
  }
  return { ok: true }
}

export function nextStage(stage: Stage): Stage {
  const i = STAGES.indexOf(stage)
  return STAGES[Math.min(i + 1, STAGES.length - 1)]
}

/** The items a desk verifies. */
export function itemsFor(checklist: ChecklistItem[], desk: 'PROCUREMENT' | 'HR' | 'FINANCE'): ChecklistItem[] {
  return checklist.filter((i) => i.desk === desk)
}

export interface Readiness {
  ok: boolean
  held: number
  of: number
  missing: string[]
  /** Provided by the vendor, not yet verified by Procurement. */
  toVerify: string[]
  says: string
}

/** May this desk say yes today, and if not, what is missing of its own. */
export function readiness(firmName: string, checklist: ChecklistItem[], stage: Stage = 'FINANCE'): Readiness {
  const mine = stage === 'PROCUREMENT' || stage === 'HR' || stage === 'FINANCE' ? itemsFor(checklist, stage) : []
  const required = mine.filter((i) => i.required)
  const held = required.filter((i) => i.state === 'HELD' || i.state === 'WAIVED').length
  const missing = required.filter((i) => i.state === 'MISSING').map((i) => shortLabel(i.key))
  const toVerify = required.filter((i) => i.state === 'PROVIDED').map((i) => shortLabel(i.key))
  const verb = stage === 'FINANCE' ? 'be approved' : stage === 'PROCUREMENT' ? 'be qualified' : stage === 'HR' ? 'clear compliance' : 'move on'
  if (missing.length === 0 && toVerify.length === 0) {
    return { ok: true, held, of: required.length, missing, toVerify, says: required.length ? `${firmName} has everything this desk asks for, verified, and can ${verb}.` : `${firmName} can ${verb}.` }
  }
  const parts: string[] = []
  if (missing.length) parts.push(`${list(missing)} ${missing.length === 1 ? 'is' : 'are'} still missing`)
  if (toVerify.length) parts.push(`${list(toVerify)} ${toVerify.length === 1 ? 'was' : 'were'} supplied and ${toVerify.length === 1 ? 'needs' : 'need'} verifying`)
  return {
    ok: false, held, of: required.length, missing, toVerify,
    says: `${firmName} cannot ${verb} yet: ${parts.join('; ')}. Get it on file, verify it, or waive with a reason, then say yes.`,
  }
}

export function shortLabel(key: string): string {
  switch (key) {
    case 'TAX_FORM': return 'the tax form'
    case 'INSURANCE': return 'the certificate of insurance'
    case 'BANK': return 'bank details'
    case 'EXPERIENCE': return 'past experience'
    case 'REFERENCES': return 'references'
    case 'REVENUE': return 'revenue proof'
    case 'PROPOSAL': return 'the proposal'
    case 'DNB_REPORT': return 'the D&B report'
    case 'VENDOR_SCREENING': return 'vendor screening'
    case 'REFERENCE_CHECK': return 'the reference check'
    case 'AGREEMENT': return 'the signed agreement'
    default: return key.toLowerCase()
  }
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** Procurement marks one item. Waiving needs a reason — never silently permit. */
export function markItem(checklist: ChecklistItem[], key: string, state: ItemState, note: string | null, at: Date):
  { ok: true; checklist: ChecklistItem[] } | { ok: false; message: string } {
  const item = checklist.find((i) => i.key === key)
  if (!item) return { ok: false, message: 'That is not on the checklist.' }
  if (state === 'WAIVED' && !note?.trim()) return { ok: false, message: `Waiving ${shortLabel(key)} needs a reason written down.` }
  return {
    ok: true,
    checklist: checklist.map((i) => (i.key === key ? { ...i, state, note: note?.trim() || null, at: state === 'MISSING' ? null : at.toISOString() } : i)),
  }
}

/** The vendor supplies items through its link: they become PROVIDED, never HELD — Procurement verifies. */
export function provideItems(checklist: ChecklistItem[], provided: { key: string; fileName?: string | null }[], at: Date): ChecklistItem[] {
  const byKey = new Map(provided.map((p) => [p.key, p]))
  return checklist.map((i) => {
    const p = byKey.get(i.key)
    if (!p || i.by !== 'VENDOR') return i
    if (i.state === 'HELD' || i.state === 'WAIVED') return i
    return { ...i, state: 'PROVIDED', at: at.toISOString(), fileName: p.fileName ?? i.fileName ?? null }
  })
}

/** What the vendor is asked for, in the order it is asked. */
export function vendorItems(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist.filter((i) => i.by === 'VENDOR')
}

/** The whole walk, in words, for the stepper. */
export function stepsOf(stage: Stage, state: RequestState, decisions: Decision[], leadNamed = true): { stage: Stage; word: string; status: 'done' | 'now' | 'next' | 'declined'; by: string | null; at: string | null; note: string | null }[] {
  const order: Stage[] = [...STAGES]
  const idx = order.indexOf(stage)
  return order.map((s, i) => {
    const d = decisions.find((x) => x.stage === s)
    const status: 'done' | 'now' | 'next' | 'declined' =
      d?.outcome === 'DECLINED' ? 'declined'
      : s === 'DONE' ? (state === 'APPROVED' ? 'done' : 'next')
      : i < idx || state === 'APPROVED' ? 'done'
      : i === idx && state !== 'DECLINED' ? 'now'
      : 'next'
    const word = s === 'DONE' ? 'Supplier' : s === 'LEAD' && !leadNamed ? 'Program office' : STAGE_WORD[s]
    return { stage: s, word, status, by: d?.byName ?? null, at: d?.at ?? null, note: d?.note ?? null }
  })
}
