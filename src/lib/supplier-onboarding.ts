/**
 * A supplier is not a paste. Somebody at the client — usually the
 * hiring manager who met them — recommends a firm; Procurement gets it
 * on the desk; the paperwork the trade actually asks for goes on file;
 * somebody other than the recommender approves it. Then the firm can be
 * sent a role. The paste box that used to sit at the top of the page
 * did all of that in one keystroke, which is exactly what indirect
 * procurement exists to stop.
 */

export const REQUEST_STATES = ['RECOMMENDED', 'IN_REVIEW', 'APPROVED', 'DECLINED'] as const
export type RequestState = (typeof REQUEST_STATES)[number]

export const STATE_WORD: Record<RequestState, string> = {
  RECOMMENDED: 'Recommended',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
}

export type ItemState = 'MISSING' | 'HELD' | 'WAIVED'

export interface ChecklistItem {
  key: string
  label: string
  /** Approval is refused while a required item is MISSING. */
  required: boolean
  state: ItemState
  note: string | null
  at: string | null
}

/** What Procurement asks for, in the words it uses. */
export const CHECKLIST: Omit<ChecklistItem, 'state' | 'note' | 'at'>[] = [
  { key: 'INSURANCE', label: 'Certificate of insurance (general liability and workers’ comp)', required: true },
  { key: 'TAX_FORM', label: 'Tax form (W-9, or W-8 for a foreign firm)', required: true },
  { key: 'DNB_REPORT', label: 'Dun & Bradstreet report', required: true },
  { key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, references, litigation)', required: true },
  { key: 'AGREEMENT', label: 'Signed agreement', required: false },
]

export function newChecklist(): ChecklistItem[] {
  return CHECKLIST.map((c) => ({ ...c, state: 'MISSING', note: null, at: null }))
}

/** Anybody who may raise a requirement may recommend a supplier for it. */
export function mayRecommend(permissions: readonly string[]): boolean {
  return permissions.includes('requirements.write') || permissions.includes('vendors.manage')
}

export type DecideVerdict = { ok: true } | { ok: false; code: 'NOT_PROCUREMENT' | 'OWN_RECOMMENDATION'; message: string }

/**
 * Who may mark the paperwork and say yes or no. Procurement — and never
 * the person who recommended the firm, whatever else they hold.
 * Segregation of duties is a BLOCK, not a warning.
 */
export function mayDecide(input: { permissions: readonly string[]; callerId: string; recommendedById: string; firmName: string }): DecideVerdict {
  if (!input.permissions.includes('vendors.manage')) {
    return { ok: false, code: 'NOT_PROCUREMENT', message: `Approving ${input.firmName} is Procurement’s call. Recommend, and they will take it from here.` }
  }
  if (input.callerId === input.recommendedById) {
    return { ok: false, code: 'OWN_RECOMMENDATION', message: `You recommended ${input.firmName}, so somebody else in Procurement has to approve it. Nobody signs their own.` }
  }
  return { ok: true }
}

export interface Readiness {
  ok: boolean
  held: number
  of: number
  missing: string[]
  says: string
}

/** May this firm be approved today, and if not, what is missing. */
export function readiness(firmName: string, checklist: ChecklistItem[]): Readiness {
  const required = checklist.filter((i) => i.required)
  const held = required.filter((i) => i.state !== 'MISSING').length
  const missing = required.filter((i) => i.state === 'MISSING').map((i) => shortLabel(i.key))
  if (missing.length === 0) {
    return { ok: true, held, of: required.length, missing, says: `${firmName} has everything on file and can be approved.` }
  }
  return {
    ok: false, held, of: required.length, missing,
    says: `${firmName} cannot be approved without ${list(missing)}. Get ${missing.length === 1 ? 'it' : 'them'} on file, or waive with a reason, then approve.`,
  }
}

export function shortLabel(key: string): string {
  switch (key) {
    case 'INSURANCE': return 'a certificate of insurance'
    case 'TAX_FORM': return 'a tax form'
    case 'DNB_REPORT': return 'a D&B report'
    case 'VENDOR_SCREENING': return 'vendor screening'
    case 'AGREEMENT': return 'a signed agreement'
    default: return key.toLowerCase()
  }
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** Mark one item. Waiving needs a reason — never silently permit. */
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
