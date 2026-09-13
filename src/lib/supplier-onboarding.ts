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

export const STAGES = ['TEAM', 'HR', 'PROCUREMENT', 'DONE'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_WORD: Record<Stage, string> = {
  TEAM: 'Program office',
  HR: 'HR',
  PROCUREMENT: 'Procurement',
  DONE: 'Done',
}

/** What each desk is deciding, in a sentence. */
export const STAGE_ASKS: Record<Exclude<Stage, 'DONE'>, string> = {
  TEAM: 'Is there a business need for another supplier here, and is this the firm?',
  HR: 'Does what this firm supplies fit the roles this program hires for?',
  PROCUREMENT: 'Is the firm who it says it is, insured, payable, referenced and clean to trade with?',
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
  /** Approval is refused while a required item is not HELD or WAIVED. */
  required: boolean
  /** Who puts it on file: the vendor through its link, or Procurement itself. */
  by: 'VENDOR' | 'PROCUREMENT'
  state: ItemState
  note: string | null
  at: string | null
  fileName?: string | null
}

/** What Procurement asks for, in the words it uses. */
export const CHECKLIST: Omit<ChecklistItem, 'state' | 'note' | 'at'>[] = [
  { key: 'TAX_FORM', label: 'Tax form (W-9, or W-8 for a foreign firm)', required: true, by: 'VENDOR' },
  { key: 'INSURANCE', label: 'Certificate of insurance (general liability and workers’ comp)', required: true, by: 'VENDOR' },
  { key: 'BANK', label: 'Bank details for payment', required: true, by: 'VENDOR' },
  { key: 'EXPERIENCE', label: 'Past experience and delivery proofs', required: true, by: 'VENDOR' },
  { key: 'REFERENCES', label: 'Two client references', required: true, by: 'VENDOR' },
  { key: 'REVENUE', label: 'Revenue proof (last two years)', required: false, by: 'VENDOR' },
  { key: 'PROPOSAL', label: 'Proposal or rate card', required: false, by: 'VENDOR' },
  { key: 'DNB_REPORT', label: 'Dun & Bradstreet report', required: true, by: 'PROCUREMENT' },
  { key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, litigation)', required: true, by: 'PROCUREMENT' },
  { key: 'REFERENCE_CHECK', label: 'References contacted', required: false, by: 'PROCUREMENT' },
  { key: 'AGREEMENT', label: 'Signed agreement', required: false, by: 'PROCUREMENT' },
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
  /** The HR standing desk, where the company named one. */
  hrId: string | null
  /** The Procurement standing desk, where the company named one. */
  procurementId: string | null
}

export type ActVerdict =
  | { ok: true }
  | { ok: false; code: 'NOT_THIS_DESK' | 'OWN_RECOMMENDATION' | 'ALREADY_DECIDED' | 'DECIDED_BEFORE' | 'DONE'; message: string }

/**
 * Who may decide at the desk the request is on now.
 *
 *   TEAM         — the program office: whoever owns the governance rules here
 *   HR           — the HR standing desk, or the program office where none is named
 *   PROCUREMENT  — the Procurement standing desk, or anybody who manages suppliers
 *
 * Never the recommender; never somebody who decided an earlier desk.
 * Segregation of duties is a BLOCK, not a warning.
 */
export function mayActAt(input: {
  stage: Stage
  permissions: readonly string[]
  callerId: string
  recommendedById: string
  decisions: Decision[]
  desks: Desks
  firmName: string
}): ActVerdict {
  const { stage, permissions, callerId, firmName } = input
  if (stage === 'DONE') return { ok: false, code: 'DONE', message: `${firmName} has already been decided.` }
  if (callerId === input.recommendedById) {
    return { ok: false, code: 'OWN_RECOMMENDATION', message: `You recommended ${firmName}, so the desks decide it without you. Nobody signs their own.` }
  }
  if (input.decisions.some((d) => d.byId === callerId)) {
    return { ok: false, code: 'DECIDED_BEFORE', message: `You already decided an earlier desk on ${firmName}. Somebody else takes this one.` }
  }
  const onDesk =
    stage === 'TEAM' ? permissions.includes('governance.write')
    : stage === 'HR' ? (input.desks.hrId ? callerId === input.desks.hrId : permissions.includes('governance.write'))
    : callerId === input.desks.procurementId || permissions.includes('vendors.manage')
  if (!onDesk) {
    return { ok: false, code: 'NOT_THIS_DESK', message: `${firmName} is on the ${STAGE_WORD[stage]} desk. That desk decides it; you will be told what they said.` }
  }
  return { ok: true }
}

export function nextStage(stage: Stage): Stage {
  return stage === 'TEAM' ? 'HR' : stage === 'HR' ? 'PROCUREMENT' : 'DONE'
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

/** May this firm be approved today, and if not, what is missing. */
export function readiness(firmName: string, checklist: ChecklistItem[]): Readiness {
  const required = checklist.filter((i) => i.required)
  const held = required.filter((i) => i.state === 'HELD' || i.state === 'WAIVED').length
  const missing = required.filter((i) => i.state === 'MISSING').map((i) => shortLabel(i.key))
  const toVerify = required.filter((i) => i.state === 'PROVIDED').map((i) => shortLabel(i.key))
  if (missing.length === 0 && toVerify.length === 0) {
    return { ok: true, held, of: required.length, missing, toVerify, says: `${firmName} has everything on file and verified, and can be approved.` }
  }
  const parts: string[] = []
  if (missing.length) parts.push(`${list(missing)} ${missing.length === 1 ? 'is' : 'are'} still missing`)
  if (toVerify.length) parts.push(`${list(toVerify)} ${toVerify.length === 1 ? 'was' : 'were'} supplied and ${toVerify.length === 1 ? 'needs' : 'need'} verifying`)
  return {
    ok: false, held, of: required.length, missing, toVerify,
    says: `${firmName} cannot be approved yet: ${parts.join('; ')}. Get it on file, verify it, or waive with a reason, then approve.`,
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
export function stepsOf(stage: Stage, state: RequestState, decisions: Decision[]): { stage: Stage; word: string; status: 'done' | 'now' | 'next' | 'declined'; by: string | null; at: string | null; note: string | null }[] {
  const order: Stage[] = ['TEAM', 'HR', 'PROCUREMENT', 'DONE']
  const idx = order.indexOf(stage)
  return order.map((s, i) => {
    const d = decisions.find((x) => x.stage === s)
    const status: 'done' | 'now' | 'next' | 'declined' =
      d?.outcome === 'DECLINED' ? 'declined'
      : s === 'DONE' ? (state === 'APPROVED' ? 'done' : 'next')
      : i < idx || state === 'APPROVED' ? 'done'
      : i === idx && state !== 'DECLINED' ? 'now'
      : 'next'
    return { stage: s, word: s === 'DONE' ? 'Supplier' : STAGE_WORD[s], status, by: d?.byName ?? null, at: d?.at ?? null, note: d?.note ?? null }
  })
}
