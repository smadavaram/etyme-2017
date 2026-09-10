/**
 * Whether a contract may start, on paperwork.
 *
 * ── The process this replaces ────────────────────────────────────────
 *
 * The 2017 system had a document-signing service: ordered signers,
 * DocuSign tokens, refresh flows, async callbacks, six document models.
 * Staffing paperwork is almost never "sign in this exact order". It is
 * "these are required before the first day, here is which we hold, the
 * contract cannot go live until the ones the law cares about are in".
 * That is a checklist, not a workflow engine, and a checklist is what
 * this is.
 *
 * ── What it is built from ────────────────────────────────────────────
 *
 * Nothing new. `lib/packets` already knows what starting somebody
 * requires (CONTRACT_START_W2) and resolves it against what is held so
 * nothing already on file is asked for twice. `lib/document-stages`
 * already knows which insurance a supplier must not let lapse. This
 * joins the two at the one moment that matters — activation — and
 * gives the placement thread the same answer so what blocks is visible
 * before anybody presses the button.
 *
 * ── BLOCK where legally grounded, WARN elsewhere ─────────────────────
 *
 * Work authorisation blocks: an I-9, or a right-to-work check, is the
 * one document a start cannot happen without. A lapsed general
 * liability or workers' comp certificate blocks, for the same reason it
 * blocks everywhere else in here — it is insurable exposure, not
 * preference. A missing background check or NDA warns: they are
 * contractual, the client may well waive them, and a system that blocks
 * on a signature page gets worked around by email.
 *
 * A warning captures a reason and proceeds. Never silently.
 */

import { packetByKey, resolveItems, type HeldDocument, type ResolvedItem } from '@/lib/packets'
import { supplierCoverGate, type CoverCertificate, type CoverGate, type DocStanding } from '@/lib/document-stages'

export type Outcome = 'PASS' | 'WARN' | 'BLOCK'

/** The person-side items whose absence is legally grounded. */
export const AUTHORISATION_KEYS = ['I9_EVERIFY', 'RIGHT_TO_WORK'] as const

/**
 * A held I-9 satisfies the right-to-work item.
 *
 * In the United States the I-9 IS the right-to-work document — the packet
 * lists both because other jurisdictions separate them. Asking for a
 * "proof of right to work" from somebody whose I-9 and E-Verify are on
 * file is asking for the same thing twice under a different name.
 */
const SATISFIED_BY: Record<string, readonly string[]> = {
  RIGHT_TO_WORK: ['I9_EVERIFY'],
}

export interface ChecklistItem {
  key: string
  label: string
  required: boolean
  state: ResolvedItem['state']
  note: string
  /** True where the state alone would stop the contract starting. */
  blocks: boolean
}

export interface Clearance {
  outcome: Outcome
  /** What stops it starting today. Empty when outcome is not BLOCK. */
  blocking: ChecklistItem[]
  /** Required and outstanding, but not legally grounded — warn and proceed. */
  chasing: ChecklistItem[]
  /** Every item on the checklist, held or not, so a screen can show all of it. */
  items: ChecklistItem[]
  /** The supplier's own cover, judged the same way it is everywhere else. */
  cover: CoverGate
  says: string
  /** What to do about it, where there is one thing to do. */
  fix: string | null
}

/**
 * A Verification row, as this needs it. Kept narrow so the placement
 * thread and the activate route can both hand rows straight in.
 */
export interface VerificationRow {
  type: string
  status: string
  issuedAt?: Date | null
  expiresAt?: Date | null
  verifiedAt?: Date | null
}

/**
 * What a person's verifications amount to, as documents held.
 *
 * Only a check that actually came back counts. A request still running
 * is not a document, and saying "on file" of it is how somebody gets
 * waved through on paperwork that does not exist.
 */
export function heldFrom(rows: VerificationRow[]): HeldDocument[] {
  const out: HeldDocument[] = []
  for (const r of rows) {
    const accepted = r.status === 'CLEAR' || r.status === 'CONDITIONAL'
    out.push({ key: r.type, expiresAt: r.expiresAt ?? null, accepted })
    // The alias, so the packet's second name for the same thing resolves.
    for (const [alias, sources] of Object.entries(SATISFIED_BY)) {
      if (sources.includes(r.type)) out.push({ key: alias, expiresAt: r.expiresAt ?? null, accepted })
    }
  }
  return out
}

function blocksStart(item: ResolvedItem): boolean {
  if (!item.required) return false
  if (item.state !== 'NEEDED' && item.state !== 'EXPIRED') return false
  return (AUTHORISATION_KEYS as readonly string[]).includes(item.key)
}

function outstandingRequired(item: ResolvedItem): boolean {
  return item.required && (item.state === 'NEEDED' || item.state === 'EXPIRED')
}

/**
 * The verdict, for one contract.
 *
 * `packetKey` defaults to the W-2 start packet, which is the one that
 * exists. A contract type with its own packet passes it here; the shape
 * of the answer does not change.
 */
export function contractClearance(input: {
  personName: string
  personVerifications: VerificationRow[]
  supplierName: string
  supplierCertificates: CoverCertificate[]
  clientName?: string | null
  on: Date
  packetKey?: string
  /**
   * Documents held that are not verifications — a signed NDA, a signed
   * contract. Verification is a check somebody ran; these are things
   * somebody signed. Both count.
   */
  extraHeld?: HeldDocument[]
}): Clearance {
  const spec = packetByKey(input.packetKey ?? 'CONTRACT_START_W2')
  const held = [...heldFrom(input.personVerifications), ...(input.extraHeld ?? [])]
  const resolved = spec ? resolveItems(spec, held, input.on) : []

  const items: ChecklistItem[] = resolved.map((r) => ({
    key: r.key,
    label: r.label,
    required: r.required,
    state: r.state,
    note: r.note,
    blocks: blocksStart(r),
  }))

  const blocking = items.filter((i) => i.blocks)
  const chasing = items.filter((i) => !i.blocks && outstandingRequired(resolved.find((r) => r.key === i.key)!))

  const cover = supplierCoverGate({
    supplierName: input.supplierName,
    certificates: input.supplierCertificates,
    clientName: input.clientName ?? null,
    on: input.on,
  })

  const outcome: Outcome =
    blocking.length > 0 || cover.outcome === 'BLOCK' ? 'BLOCK'
    : chasing.length > 0 || cover.outcome === 'WARN' ? 'WARN'
    : 'PASS'

  return {
    outcome,
    blocking,
    chasing,
    items,
    cover,
    says: sayIt(input.personName, outcome, blocking, chasing, cover),
    fix: fixFor(blocking, chasing, cover),
  }
}

function names(items: { label: string }[]): string {
  const l = items.map((i) => i.label.toLowerCase())
  if (l.length <= 1) return l.join('')
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`
}

function sayIt(
  person: string,
  outcome: Outcome,
  blocking: ChecklistItem[],
  chasing: ChecklistItem[],
  cover: CoverGate
): string {
  if (outcome === 'PASS') return `${person} is cleared to start. Everything required is on file.`
  const parts: string[] = []
  if (blocking.length > 0) parts.push(`${person} cannot start without ${names(blocking)}`)
  if (cover.outcome === 'BLOCK') parts.push(cover.says)
  if (outcome === 'BLOCK') return parts.join('. ') + '.'
  if (chasing.length > 0) parts.push(`still waiting on ${names(chasing)} for ${person}`)
  if (cover.outcome === 'WARN') parts.push(cover.says)
  return `${parts.join('; ')}. The contract can start with a reason recorded.`
}

function fixFor(blocking: ChecklistItem[], chasing: ChecklistItem[], cover: CoverGate): string | null {
  if (blocking.length > 0) return `Get ${names(blocking)} on file, then activate.`
  if (cover.outcome === 'BLOCK') return cover.fix
  if (chasing.length > 0) return `Chase ${names(chasing)}, or activate with a reason.`
  if (cover.outcome === 'WARN') return cover.fix
  return null
}

/** The cover standings, flattened for a screen that lists everything. */
export function coverItems(cover: CoverGate): DocStanding[] {
  return [...cover.blocking, ...cover.chasing]
}
