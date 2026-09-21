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
 *
 * ── What the walk asks for, and where the list comes from ────────────
 *
 * Eleven items every firm is asked for, and then whatever this client's
 * own orders require of a supplier — read through
 * `lib/document-requirements`, never from a second hardcoded list here.
 * A client that asks for a hot floor induction on its purchase orders
 * asks the firm for it on the way in, and the item on the checklist says
 * whose order asked. `lib/supplier-desks` does the reading;
 * `withOrderedItems` below is the arithmetic.
 */

import { hasPermission } from '@/lib/permissions'
import { verificationFromChecklistItem } from '@/lib/onboarding-evidence'

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
  HR: 'Is the firm compliant and clean to trade with — insured, in good standing with the state that registered it, screened for sanctions and litigation, under an agreement?',
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
  /**
   * The document types in `lib/document-type` this item already answers.
   *
   * So that a client whose own orders require general liability cover is
   * not asked for insurance twice — once by the standard walk and once
   * by the order. One question, one row, one desk verifying it.
   */
  answers?: string[]
  /**
   * Where this item came from, where it is not the standard walk —
   * "Required by Northbend Athletic's orders." Null on the items every
   * firm is asked for, because saying so on all eleven says nothing.
   */
  says?: string | null
  /**
   * The day the certificate begins, as printed on it. ISO.
   *
   * Asked for at the moment a desk says "verified", because that is the
   * one moment somebody has the document open in front of them — and
   * because without the two dates the verdict cannot become a
   * `Verification`, which is what every gate in the product actually
   * reads. HR clearing a certificate of insurance here and the
   * compliance page going on saying the firm has no cover was one
   * record not speaking to the other; `lib/onboarding-evidence` is the
   * translation and these two fields are what it needs.
   *
   * On the item, in the same JSON the rest of it rides in. No schema.
   */
  validFrom?: string | null
  /** The day it runs out, as printed on it. ISO. */
  validUntil?: string | null
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
  { key: 'INSURANCE', label: 'Certificate of insurance (general liability and workers’ comp)', required: true, by: 'VENDOR', desk: 'HR', answers: ['INSURANCE_GL', 'INSURANCE_WC'] },
  // A firm not in good standing with the state that registered it may not
  // lawfully contract there — its registration is suspended, usually for
  // an unfiled report or unpaid franchise tax. CLAUDE.md's paperwork table
  // puts it beside insurance for that reason, and `lib/document-type`
  // ships it with `blocks: true`. Until 2026-09-21 the one desk that
  // screens a firm before it may trade never asked for it, so the loop
  // cracked at the point a firm came in: the type existed, the watch
  // existed, and nothing anywhere requested the certificate.
  { key: 'GOOD_STANDING', label: 'Certificate of good standing', required: true, by: 'VENDOR', desk: 'HR', answers: ['GOOD_STANDING'] },
  { key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, litigation)', required: true, by: 'DESK', desk: 'HR' },
  { key: 'AGREEMENT', label: 'Signed agreement', required: false, by: 'DESK', desk: 'HR', answers: ['MSA'] },
  // Finance: can the firm be paid
  { key: 'TAX_FORM', label: 'Tax form (W-9, or W-8 for a foreign firm)', required: true, by: 'VENDOR', desk: 'FINANCE', answers: ['W9'] },
  { key: 'BANK', label: 'Bank details for payment', required: true, by: 'VENDOR', desk: 'FINANCE' },
]

export function newChecklist(): ChecklistItem[] {
  return CHECKLIST.map((c) => ({
    ...c, state: 'MISSING' as ItemState, note: null, at: null, fileName: null, says: null,
    validFrom: null, validUntil: null,
  }))
}

/**
 * Whether this item wants the two dates before a desk may call it
 * verified.
 *
 * Asked of `lib/onboarding-evidence` rather than answered from a list
 * here, because that file already decides which items become a
 * `Verification` — a document with a life that gets watched and chased —
 * and which are a desk's own check with nothing to expire. Two lists
 * would be two answers to one question, and the one that went stale
 * would be the one asking for dates.
 *
 * The probe is the item as if it were verified with no dates: the only
 * thing that comes back `needsDates` is an item that would have become a
 * row if it had them.
 */
export function wantsDates(item: Pick<ChecklistItem, 'key' | 'label' | 'answers'>): boolean {
  return verificationFromChecklistItem(
    { ...item, state: 'HELD', validFrom: null, validUntil: null },
    'a-firm-on-the-register',
  ).needsDates
}

/**
 * A stored checklist, read back against the definition the code ships.
 *
 * ── Why a row cannot be trusted about what it asks ───────────────────
 *
 * The checklist is JSON on `SupplierRequest`, written the day the firm
 * was recommended and never rewritten. So a row carries the definition
 * that shipped on that day, forever — and on 2026-09-21 the release walk
 * found what that costs: the certificate of insurance on a firm already
 * on HR's desk had no `answers` on it, because `answers` was added to
 * `CHECKLIST` after that row was written. Two things followed, both
 * silent:
 *
 *   - `wantsDates` asked `lib/onboarding-evidence` about an item with no
 *     answers, got "this is the desk's own check, nothing expires", and
 *     let HR mark a certificate of insurance verified with no start and
 *     no expiry. No `Verification` was written, and the compliance page
 *     went on saying the firm had no cover — the exact crack the two
 *     dates exist to close, reopened by a stale row.
 *   - `withOrderedItems` folds an order's INSURANCE_GL onto whichever
 *     item already answers it. With no `answers` nothing answered it, so
 *     the order's two insurance items were pushed as new rows — and HR
 *     read one green certificate of insurance and two red ones on the
 *     same list, under a footer saying the cover was missing.
 *
 * What a row is actually the record of is its **state**: verified,
 * waived, provided, by whom, when, against which file, with which dates.
 * What it *asks for* — the label, the desk, whether it is required, and
 * which document types it answers — is the code's, and the code is newer
 * than the row every time. So the definition is taken from `CHECKLIST`
 * on every read and the state is taken from the row.
 *
 * Items the walk does not ship — the ones a client's orders added — keep
 * everything they have, and get `answers` defaulted to their own key,
 * which is what `withOrderedItems` writes today and what an order-derived
 * item has always meant.
 *
 * Runs on every read and every mark through `withOrderedItems`, so a row
 * corrects itself the next time anybody opens it, with no migration.
 */
export function refreshed(checklist: ChecklistItem[]): ChecklistItem[] {
  const shipped = new Map(CHECKLIST.map((c) => [c.key, c]))
  return checklist.map((i) => {
    const c = shipped.get(i.key)
    if (!c) return i.answers?.length ? i : { ...i, answers: [i.key] }
    return {
      ...i,
      label: c.label,
      required: c.required,
      by: c.by,
      desk: c.desk,
      answers: c.answers,
    }
  })
}

// ── What the client's own orders ask of a supplier ────────────────────

/**
 * One thing a buyer's order requires of the firm it pays.
 *
 * Read from `DocumentRequirement` through `lib/document-requirements`,
 * never from a list in this file. That is the whole point: the three
 * desks each carried their own hardcoded set, so a client that asked for
 * a site induction on its orders could not have it reach the firm coming
 * in. `lib/supplier-desks` does the reading; everything here is
 * arithmetic over what it found.
 */
export interface OrderedItem {
  /** The key in `lib/document-type`. */
  key: string
  label: string
  /** COMPLIANCE · AGREEMENT · PROOF — what decides which desk verifies it. */
  purpose: string
  /** Whether the order insists on it, or merely lists it. */
  required: boolean
  /** What whoever wrote it on the order said, where they said anything. */
  note?: string | null
}

/**
 * Which desk verifies an item a client's order asked for.
 *
 * Read off the type's purpose rather than off its name, so a document a
 * client invents next week lands on a desk without anybody adding a case
 * here. Compliance and agreements are HR's — that is what HR's own three
 * items already are. Evidence a firm produces about itself is
 * Procurement's, beside the experience and the references it already
 * qualifies on.
 */
export function deskForPurpose(purpose: string): 'PROCUREMENT' | 'HR' {
  return purpose === 'PROOF' ? 'PROCUREMENT' : 'HR'
}

/**
 * The checklist, plus whatever this client's own orders require of a
 * supplier, each saying whose order asked.
 *
 * Three rules, and each was a way of getting it wrong first:
 *
 *   - An item the walk already asks for is not asked twice. The standard
 *     insurance item answers INSURANCE_GL and INSURANCE_WC; an order
 *     requiring either annotates that row rather than adding a second
 *     one, because two rows for one certificate is two desks verifying
 *     the same PDF.
 *   - A state already recorded is never reset. This runs on every read
 *     and every mark, so a verified item that an order also asks for
 *     stays verified.
 *   - An AGREEMENT is asked for and never insisted on at this point in
 *     the walk. The agreement between the two firms is written when the
 *     last desk says yes — requiring it before that is a deadlock, and
 *     the standard "Signed agreement" item has been `required: false`
 *     since the day it was written for exactly that reason. That is a
 *     default and it is the founder's to overrule.
 */
export function withOrderedItems(
  checklist: ChecklistItem[],
  ordered: readonly OrderedItem[],
  clientName: string
): ChecklistItem[] {
  const fresh = refreshed(checklist)
  // A duplicate already written down is taken off the list.
  //
  // A row written before `answers` existed had nothing to fold onto, so
  // the order's INSURANCE_GL and INSURANCE_WC were pushed as rows of
  // their own and saved — and `refreshed` above cannot unsay that,
  // because a saved item is not one of the twelve the walk ships. HR
  // then read one certificate of insurance verified and two more
  // missing, on one list, for one PDF.
  //
  // Only an untouched one goes. A duplicate a desk verified or waived is
  // a decision somebody made in their own name, and dropping it would
  // throw away the record of it; that one stays, and the desk can undo
  // it. Nothing anybody did is ever quietly removed.
  const shipped = new Set(CHECKLIST.map((c) => c.key))
  const answersOf = (i: ChecklistItem) => i.answers ?? []
  const out = fresh
    .filter(
      (i) =>
        shipped.has(i.key) ||
        i.state !== 'MISSING' ||
        !fresh.some((other) => other.key !== i.key && answersOf(other).includes(i.key))
    )
    .map((i) => ({ ...i }))

  if (ordered.length === 0) return out
  const says = `Required by ${clientName}’s orders.`
  const answeredBy = (key: string): ChecklistItem | undefined =>
    out.find((i) => i.key === key || (i.answers ?? []).includes(key))

  for (const item of ordered) {
    const already = answeredBy(item.key)
    if (already) {
      // The walk already asks for it. Say who else is asking, and leave
      // the desk, the state and the verification exactly where they were.
      already.says = already.says && already.says !== says ? already.says : says
      continue
    }
    out.push({
      key: item.key,
      label: item.label,
      required: item.purpose === 'AGREEMENT' ? false : item.required,
      // An agreement is papered by the desk, the way the standard
      // "Signed agreement" item already is; everything else is the firm's
      // to send through its own link.
      by: item.purpose === 'AGREEMENT' ? 'DESK' : 'VENDOR',
      desk: deskForPurpose(item.purpose),
      state: 'MISSING',
      note: item.note ?? null,
      at: null,
      fileName: null,
      answers: [item.key],
      says,
    })
  }
  return out
}

/**
 * Anybody who may raise a requirement may recommend a supplier for it.
 *
 * Through `hasPermission`, never a raw `includes`. A company's owner
 * holds `['*']` — everything — and a literal match on the permission
 * name does not see it, so the one person who set the company up was
 * the one person with no way to recommend a supplier. The page told
 * them it was possible and showed them no button. Every check on this
 * chain had the same hole; they all go through the helper now.
 */
export function mayRecommend(permissions: readonly string[]): boolean {
  return hasPermission(permissions, 'requirements.write') || hasPermission(permissions, 'vendors.manage')
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
  const pmo = hasPermission(permissions, 'governance.write')
  const onDesk =
    stage === 'LEAD' ? (barred(input.desks.leadId) ? pmo : callerId === input.desks.leadId)
    : stage === 'PROCUREMENT' ? callerId === input.desks.procurementId || hasPermission(permissions, 'vendors.manage')
    : stage === 'HR' ? (barred(input.desks.hrId) ? pmo : callerId === input.desks.hrId)
    : hasPermission(permissions, 'payments.record')
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
  const missing = required.filter((i) => i.state === 'MISSING').map((i) => shortLabel(i.key, i.label))
  const toVerify = required.filter((i) => i.state === 'PROVIDED').map((i) => shortLabel(i.key, i.label))
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

/**
 * The item in a sentence, for a refusal a person reads.
 *
 * `label` is the item's own, handed in for the keys this function has
 * never heard of — a document a client invented and asked for on its
 * orders. Without it a hot floor induction read as "hot_floor_induction"
 * in the one sentence telling HR why it cannot say yes.
 */
export function shortLabel(key: string, label?: string | null): string {
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
    case 'GOOD_STANDING': return 'the certificate of good standing'
    default: return label ? label.toLowerCase() : key.toLowerCase()
  }
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * Procurement marks one item. Waiving needs a reason — never silently
 * permit.
 *
 * `dates` is what the desk read off the certificate. They are kept on
 * the item whatever the state, because the firm may be verified before
 * it is a company on the register — the walk's four desks run before
 * Finance writes the supplier row — and the dates are what the approval
 * replays into the compliance record when the id finally exists.
 * Unmarking clears them with the verdict, because a date recorded
 * against a verification nobody stands behind is worse than a blank.
 */
export function markItem(
  checklist: ChecklistItem[],
  key: string,
  state: ItemState,
  note: string | null,
  at: Date,
  dates?: { validFrom?: string | null; validUntil?: string | null }
): { ok: true; checklist: ChecklistItem[] } | { ok: false; message: string } {
  const item = checklist.find((i) => i.key === key)
  if (!item) return { ok: false, message: 'That is not on the checklist.' }
  if (state === 'WAIVED' && !note?.trim()) return { ok: false, message: `Waiving ${shortLabel(key, item.label)} needs a reason written down.` }
  return {
    ok: true,
    checklist: checklist.map((i) =>
      i.key === key
        ? {
            ...i,
            state,
            note: note?.trim() || null,
            at: state === 'MISSING' ? null : at.toISOString(),
            validFrom: state === 'MISSING' ? null : dates?.validFrom ?? i.validFrom ?? null,
            validUntil: state === 'MISSING' ? null : dates?.validUntil ?? i.validUntil ?? null,
          }
        : i
    ),
  }
}

/**
 * The vendor supplies items through its link: they become PROVIDED,
 * never HELD — Procurement verifies.
 *
 * The two dates ride in with the file where the firm typed them off its
 * own certificate. They are not a verdict and they do not make the item
 * held: the desk still verifies, and what the firm typed is what the
 * desk sees in the boxes rather than a blank form to retype. A desk that
 * disagrees with the certificate corrects it before saying yes.
 */
export function provideItems(
  checklist: ChecklistItem[],
  provided: { key: string; fileName?: string | null; validFrom?: string | null; validUntil?: string | null }[],
  at: Date
): ChecklistItem[] {
  const byKey = new Map(provided.map((p) => [p.key, p]))
  return checklist.map((i) => {
    const p = byKey.get(i.key)
    if (!p || i.by !== 'VENDOR') return i
    if (i.state === 'HELD' || i.state === 'WAIVED') return i
    return {
      ...i,
      state: 'PROVIDED',
      at: at.toISOString(),
      fileName: p.fileName ?? i.fileName ?? null,
      validFrom: p.validFrom ?? i.validFrom ?? null,
      validUntil: p.validUntil ?? i.validUntil ?? null,
    }
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
