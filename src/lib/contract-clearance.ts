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
 * Work authorization blocks: an I-9, or a right-to-work check, is the
 * one document a start cannot happen without. A lapsed general
 * liability or workers' comp certificate blocks, for the same reason it
 * blocks everywhere else in here — it is insurable exposure, not
 * preference. A missing background check or NDA warns: they are
 * contractual, the client may well waive them, and a system that blocks
 * on a signature page gets worked around by email.
 *
 * A professional license blocks, decided 2026-09-17 and argued in full
 * above `licenseGate` in lib/document-stages. A registered nurse working
 * on a lapsed state registration is practicing without a license — the
 * law says the work stops, no client can waive it, and the exposure lands
 * on the worker before it lands on anybody else. It is the same shape as
 * lapsed cover and is enforced by the same arithmetic.
 *
 * Which keys count as a license is not a list in here. It is every type in
 * the company's own document dictionary that says it is compliance, that
 * says it blocks, and that the candidate supplies — so a client whose
 * trade needs a state contractor registration or a site induction adds one
 * type and gets the same refusal, with no code change and no migration.
 *
 * A warning captures a reason and proceeds. Never silently.
 */

import { adverseRecordFrom, orderedNotCollected, readVerdict, recordLabel, withArticle, type AdverseActionRow } from '@/lib/attestation'
import {
  packetByKey,
  resolveItems,
  startPacketFor,
  licenseNaming,
  withRequirements,
  type HeldDocument,
  type RequiredItem,
  type ResolvedItem,
} from '@/lib/packets'
import {
  supplierCoverGate,
  licenseGate,
  COVER_THAT_STOPS_WORK,
  inSentence,
  withoutVoidNonCompete,
  credentialsToChase,
  type CoverCertificate,
  type CoverGate,
  type DocStanding,
  type HeldCredential,
  type LicenseGate,
} from '@/lib/document-stages'
import { prisma } from '@/lib/db'
import { plainDate } from '@/lib/plain-date'
import { requirementsFor } from '@/lib/document-requirements'
import { heldFromDocInstances } from '@/lib/document-request'
import {
  typesFor,
  typeByKey,
  backingFinding,
  editionFinding,
  labelFor,
  humanKey,
  type BackingDocument,
  type BackingFinding,
  type DefinedType,
  type Edition,
  type EditionFinding,
} from '@/lib/document-type'

/** Re-exported for the notices that count and name papers. */
export { withArticle }

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

/**
 * The shipped license item, which is the one a start packet asks for.
 *
 * A company that defines its own blocking credential is enforced by the
 * same gate (see `credentialKeys`); this names only the item the licensed
 * start packet lists, because that is the one the occupation table can
 * put a board's name to.
 */
const LICENSE_KEY = 'PROFESSIONAL_LICENSE'

/**
 * The types this company treats as a license to practice.
 *
 * Read off the dictionary rather than listed here, which is the whole
 * extensibility story: a type is a license if it is COMPLIANCE (it has to
 * be in date), if it says it blocks (a lapse stops work), and if the
 * candidate is the one who supplies it (a regulator issued it to the
 * person, not to the firm). PROFESSIONAL_LICENSE is the shipped default
 * that satisfies all three; a client that adds STATE_CONTRACTOR_REG or
 * SITE_INDUCTION with the same three answers is enforced by this same
 * code on the same day it defines it.
 *
 * Work authorization is excluded because it already has its own path and
 * its own sentence; counting it twice would refuse a start with two
 * different explanations of the same fact.
 *
 * A company that edits its own copy of a type to say it does not block
 * gets a warning instead. That is the company's call and the system still
 * never silently permits: the warning takes a reason and records it.
 */
export function credentialKeys(documentTypes: DefinedType[] = []): string[] {
  return typesFor(documentTypes)
    .filter(
      (t) =>
        t.purpose === 'COMPLIANCE' &&
        t.blocks &&
        t.suppliedBy === 'CANDIDATE' &&
        !(AUTHORISATION_KEYS as readonly string[]).includes(t.key)
    )
    .map((t) => t.key)
}

export interface ChecklistItem {
  key: string
  label: string
  required: boolean
  state: ResolvedItem['state']
  note: string
  /**
   * What the person is actually being asked for, in their words.
   *
   * Carried off the packet spec rather than dropped, because the desk
   * that chases a document and the letter that asks for it must say the
   * same thing — and until 2026-09-17 the checklist threw the hint away
   * and the request had to invent one.
   */
  hint: string
  /** True where the state alone would stop the contract starting. */
  blocks: boolean
  /**
   * The screening company that rendered this one, where a company did.
   *
   * Only ever set on a check somebody else runs — a background check, a
   * drug screening. Null on a passport, because nobody renders a verdict
   * on a passport; null on a background check whose row names nobody,
   * which is the case `renderedSays` exists to put into words.
   */
  renderedBy?: string | null
  /**
   * What the record actually supports, as a sentence with a name and a
   * date in it — "Sterling reported clear on 2026-03-12, reference
   * 4471", or that nobody is named on it and this is the firm's own
   * note. The founder, 2026-09-22: the screening company confirms pass
   * or fail, and the risk is passed there. A row that cannot name one
   * has passed the risk nowhere, and a screen saying "on file" of it is
   * reporting a verdict nobody rendered.
   */
  renderedSays?: string | null
  /**
   * How this item is named inside a refusal, where that differs from the
   * label on the checklist.
   *
   * Only the license uses it today: "a state nursing license (Wisconsin
   * Board of Nursing)" rather than "state license", because the label is
   * the same words for a nurse and a crane operator and the sentence is
   * not. Absent means the label, lowercased, which is what every other
   * item wants.
   */
  said?: string
  /**
   * Where the item came from: the shape's own floor, the order the line
   * is on, or the line itself. Absent where the caller named no line.
   */
  from?: 'DEFAULT' | 'ORDER' | 'LINE'
  /** "required by Cavanaugh Glassworks’ order PO-2026-2", for a screen. */
  asked?: string
  /** Which party owes it — WORKER · SUPPLIER · CUSTOMER · US. */
  owedByRole?: string
  /** The firm or person that owes it, where the line names one. */
  owedByName?: string | null
  /** True where somebody waived it on the record, with a reason. */
  waived?: boolean
  /** Why it was waived and by whom, in a sentence. */
  waivedSays?: string | null
}

export interface Clearance {
  outcome: Outcome
  /** What stops it starting today. Empty when outcome is not BLOCK. */
  blocking: ChecklistItem[]
  /** Required and outstanding, but not legally grounded — warn and proceed. */
  chasing: ChecklistItem[]
  /**
   * Items somebody waived on this line, with the reason and the name.
   *
   * They stay on the list rather than disappearing from it: a checklist
   * that silently drops what was waived is a checklist nobody can audit,
   * and the auditor's question is always who decided and why.
   */
  waived: ChecklistItem[]
  /** Every item on the checklist, held or not, so a screen can show all of it. */
  items: ChecklistItem[]
  /** The supplier's own cover, judged the same way it is everywhere else. */
  cover: CoverGate
  /**
   * The licenses this person practices on. A lapsed one, or one that has
   * not begun, refuses the start; one that runs out inside the assignment
   * warns with the date named.
   */
  license: LicenseGate
  /**
   * Forms held with nothing behind them. An I-9 is a record that somebody
   * looked at a document; a record of looking with no record of what was
   * looked at is not evidence. Warns rather than blocks — see
   * UNSUPPORTED_FORM_STOPS_A_START below.
   */
  unsupported: BackingFinding[]
  /**
   * Forms completed on an edition the issuer had already replaced, or on
   * no recorded edition at all. An audit finding, not a bar to work.
   */
  editions: EditionFinding[]
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
  /**
   * The day the document starts covering. Read as a floor since
   * 2026-09-16: a right-to-work document that comes into force next month
   * does not authorize somebody who starts this week, and until then
   * nothing asked.
   */
  validFrom?: Date | null
  expiresAt?: Date | null
  verifiedAt?: Date | null
  /** Which edition of a reissued form this is, as printed on it. */
  formEdition?: string | null
  /** The day the form was completed, which is what an edition is judged against. */
  completedAt?: Date | null
  /** The type keys of the documents recorded as standing behind this one. */
  backedBy?: BackingDocument[]
  /** Who ran or issued it — a board of nursing, an insurer, a screener. */
  provider?: string | null
  /**
   * The provider's own case number. Read so a compliance officer can go
   * and ask them; nothing in production writes it yet, and a row without
   * one still names the provider where the provider is named.
   */
  referenceId?: string | null
  /**
   * Whatever the check came back with. Read only for the two fields a
   * license refusal has to name — the number and the state — because
   * "your license expired" is not something a compliance officer can
   * check against a register and "RN 154-882, WI expired" is.
   */
  result?: unknown
  /**
   * The firm's steps after an unfavorable report, from the `AdverseAction`
   * table (select `ADVERSE_STEPS`). A reader that does not select them is
   * read off the report's own `result`, where steps taken before
   * 2026-10-21 were written.
   */
  adverseActions?: AdverseActionRow[]
}

/** What a reader of person checks selects so a decision after a flagged report is read: `{ ...yourSelect, ...ADVERSE_STEPS }`. */
export const ADVERSE_STEPS = {
  adverseActions: { select: { step: true, sentAt: true, waitEndsAt: true, waitSays: true, reason: true, noticeDocumentId: true, by: { select: { name: true } } } },
} as const

/** The number and the state off a verification's own result, where recorded. */
export function credentialDetail(row: VerificationRow): { number: string | null; state: string | null } {
  const r = row.result
  if (!r || typeof r !== 'object') return { number: null, state: null }
  const bag = r as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    number: str(bag.license) ?? str(bag.licenseNumber) ?? str(bag.number) ?? null,
    state: str(bag.state) ?? str(bag.jurisdiction) ?? null,
  }
}

/**
 * The renewal chase as it reads today: the same sentence the nightly
 * chase wrote, worked out again from her credentials on the day it is
 * read. A request stores the sentence it was raised with ("runs out in
 * 24 days"), and shown a week later that count is a second, wrong
 * number on a page whose top line counts from today (found by the second
 * production walk, 2026-10-26: Colleen Byrne's page said 13 days at the
 * top and 24 further down). Every count on a page comes from
 * `calendarDaysBetween` on the day it is read, so they agree. Null where
 * nothing is to be chased today. Pure.
 */
export function credentialChaseNow(
  rows: (Pick<VerificationRow, 'type' | 'status' | 'issuedAt' | 'validFrom' | 'expiresAt'> & { verifiedAt?: Date | null; provider?: string | null; result?: unknown })[],
  on: Date,
  /** The firm asking, named in the sentence. */
  askerName?: string | null,
): string | null {
  const keys = credentialKeys()
  const held = rows
    .filter((r) => keys.includes(r.type))
    .map((r) => {
      const detail = credentialDetail(r as VerificationRow)
      return {
        type: r.type, label: labelFor(r.type), status: r.status,
        issuedAt: r.issuedAt ?? null, validFrom: r.validFrom ?? null, expiresAt: r.expiresAt ?? null,
        verifiedAt: r.verifiedAt ?? null, number: detail.number, state: detail.state, issuer: r.provider ?? null,
      }
    })
  if (held.length === 0) return null
  const chases = credentialsToChase(held, [...new Set(held.map((h) => h.type))], on, undefined, askerName)
  return chases[0]?.says ?? null
}

/** The packet key the nightly license chase raises its renewal requests under. */
export const RENEWAL_PACKET_KEY = 'CREDENTIAL_RENEWAL'

/**
 * A request's sentence as it reads today: a renewal request's chase said
 * again from the person's credentials on the day it is read, and any
 * other request's own words as stored. One rule for every screen that
 * lists requests, so the firm's list and the person's page cannot carry
 * two counts of days for one paper. Pure.
 */
export function requestReasonNow(
  packet: { packetKey: string | null; reopenedReason: string | null; subjectPersonId: string | null; askerName?: string | null },
  credentialsOf: (personId: string) => Parameters<typeof credentialChaseNow>[0],
  on: Date,
): string | null {
  if (packet.packetKey !== RENEWAL_PACKET_KEY || !packet.subjectPersonId) return packet.reopenedReason
  return credentialChaseNow(credentialsOf(packet.subjectPersonId), on, packet.askerName) ?? packet.reopenedReason
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
  const newest = newestReports(rows)
  for (const r of rows) {
    // A screening company's report is read as its newest one. An older
    // clear report does not stand beside a newer flagged one: until
    // 2026-10-21 it did, and a flagged re-check read as cleared (found by
    // the document-flow walk).
    if (orderedNotCollected(r.type) && REPORTED.includes(r.status) && newest.get(r.type) !== r) continue
    const accepted = r.status === 'CLEAR' || r.status === 'CONDITIONAL'
    const validFrom = r.validFrom ?? r.issuedAt ?? null
    out.push({ key: r.type, validFrom, expiresAt: r.expiresAt ?? null, accepted })
    // The alias, so the packet's second name for the same thing resolves.
    for (const [alias, sources] of Object.entries(SATISFIED_BY)) {
      if (sources.includes(r.type)) out.push({ key: alias, validFrom, expiresAt: r.expiresAt ?? null, accepted })
    }
  }
  return out
}

/**
 * The editions an issuer published, for every company that has not
 * recorded its own. Rules live in data: a new edition is a new line.
 *
 * The I-9, from USCIS's edition notices: the 10/21/19 edition was
 * accepted until October 31, 2023; the 08/01/23 edition until its printed
 * expiry, July 31, 2026; the 01/20/25 edition is current.
 */
export const PUBLISHED_EDITIONS: Record<string, Edition[]> = {
  I9_EVERIFY: [
    { edition: '10/21/19', effectiveFrom: new Date('2019-10-21T00:00:00Z'), retiredAt: new Date('2023-11-01T00:00:00Z') },
    { edition: '08/01/23', effectiveFrom: new Date('2023-08-01T00:00:00Z'), retiredAt: new Date('2026-08-01T00:00:00Z') },
    { edition: '01/20/25', effectiveFrom: new Date('2025-01-20T00:00:00Z'), retiredAt: null },
  ],
}

/**
 * The published editions to judge one form against. Two editions are
 * often accepted at once (USCIS let the 08/01/23 I-9 be used for months
 * after the 01/20/25 one came out), so a form signed on an edition still
 * accepted that day is judged against that edition alone and reads as
 * current; anything else is judged against the whole list.
 */
export function publishedFor(type: string, recorded: string, completedOn: Date | null): Edition[] {
  const list = PUBLISHED_EDITIONS[type] ?? []
  const on = completedOn ?? new Date()
  const same = list.find(
    (e) => e.edition === recorded.trim() && e.effectiveFrom.getTime() <= on.getTime() && (!e.retiredAt || e.retiredAt.getTime() > on.getTime())
  )
  return same ? [same] : list
}

/**
 * An edition as the issuer prints it: "MM/DD/YY". A form recorded as
 * "08/01/2023" or "8/1/23" is the same edition as "08/01/23", and reading
 * it as a different one put an audit finding on a current I-9 (found by
 * the simulation, 2026-10-26). Anything that is not a date is left as typed.
 */
export function canonicalEdition(edition: string): string {
  const t = edition.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(t)
  if (!m) return t
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3].slice(-2)}`
}

/** Agreements a worker signs from her own page, so their absence is a real gap. */
const WORKER_AGREEMENTS = ['NDA', 'NCA', 'EMPLOYMENT_AGREEMENT']

/** The statuses a screening company's answer can carry. ORDERED (IN_PROGRESS) is not an answer. */
const REPORTED = ['CLEAR', 'CONDITIONAL', 'FLAGGED', 'FAILED']

/** When a report was rendered, as recorded: the provider's date first. */
function reportedOn(r: VerificationRow): number {
  return (r.verifiedAt ?? r.issuedAt ?? r.validFrom ?? new Date(0)).getTime()
}

/**
 * The newest report per kind of screening, among the answers a provider
 * gave. The newest wins whatever it says: a flagged re-check is the
 * provider's latest word and a clear one from last spring is not.
 */
export function newestReports(rows: VerificationRow[]): Map<string, VerificationRow> {
  const out = new Map<string, VerificationRow>()
  for (const r of rows) {
    if (!orderedNotCollected(r.type) || !REPORTED.includes(r.status)) continue
    const had = out.get(r.type)
    if (!had || reportedOn(r) >= reportedOn(had)) out.set(r.type, r)
  }
  return out
}

/**
 * What is said where the newest report is unfavorable. The verdict is the
 * provider's; the steps after it are the firm's that ordered it, and the
 * start warns until they are walked (never blocks: a check is contractual).
 */
export function adverseSays(rows: VerificationRow[], person: string): { key: string; says: string }[] {
  const out: { key: string; says: string }[] = []
  for (const [key, r] of newestReports(rows)) {
    if (r.status !== 'FLAGGED' && r.status !== 'FAILED') continue
    const provider = r.provider ?? 'The screening company'
    const on = r.verifiedAt ?? r.issuedAt ?? null
    const what = labelFor(key).toLowerCase()
    const decided = adverseRecordFrom(r.adverseActions ?? [], r.result).decision ?? null
    if (decided === 'NOT_TAKEN') continue
    out.push({
      key,
      says:
        `${provider} ${r.status === 'FLAGGED' ? 'flagged' : 'did not clear'} the ${what}${on ? ` on ${plainDate(on.toISOString())}` : ''}` +
        `${r.referenceId ? `, reference ${r.referenceId}` : ''}. Before anything is decided on it, the firm that ordered it gives ${person} ` +
        `the pre-adverse action notice with a copy of the report, waits, and only then decides`,
    })
  }
  return out
}

function outstanding(state: ResolvedItem['state']): boolean {
  // NOT_YET_VALID sits with NEEDED and EXPIRED, not with EXPIRING: a
  // document whose period starts after the first day is on file and holds
  // nothing on the first day.
  return state === 'NEEDED' || state === 'EXPIRED' || state === 'NOT_YET_VALID'
}

/**
 * Which outstanding items refuse the start.
 *
 * Work authorization always, because the two keys are the floor and a
 * company cannot edit its way out of a federal form. Everything else by
 * what the dictionary says: a type whose `blocks` is true stops a start
 * when it is required and outstanding. Nothing in the shipped W-2 start
 * packet changes meaning — RIGHT_TO_WORK and I9_EVERIFY blocked before
 * this and block now; background check, drug screening and the NDA say
 * they do not block and still do not.
 */
function blockingKeysFor(documentTypes: DefinedType[] = []): Set<string> {
  return new Set<string>([
    ...AUTHORISATION_KEYS,
    ...typesFor(documentTypes).filter((t) => t.blocks).map((t) => t.key),
  ])
}

function blocksStart(item: ResolvedItem, blockingKeys: Set<string>): boolean {
  if (!item.required) return false
  if (!outstanding(item.state)) return false
  return blockingKeys.has(item.key)
}

/**
 * The items this system can actually hold today: every VerificationType,
 * the right-to-work alias, and whatever a caller hands in as extraHeld.
 *
 * A packet may require a signed NDA, and it should. But nothing here
 * records one yet, so chasing it would put a warning on every activation
 * until the end of time — and a warning that always fires is a click,
 * not a warning. An item with no way to be held is listed as needed and
 * does not move the verdict, until the day something can hold it.
 */
const HOLDABLE = new Set<string>([
  'I9_EVERIFY', 'BACKGROUND_CHECK', 'EDUCATION_EVALUATION', 'DRUG_SCREENING',
  'INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER',
  'BUSINESS_PARTNER', 'REFERENCE_CHECK',
  ...Object.keys(SATISFIED_BY),
])

// ── What the line requires, over the top of the packet ────────────────
//
// "Ensure the loop of documents never cracks between parties."
// — the founder, 2026-09-21.
//
// Until today this file decided what a placement needed on its own: a
// start packet picked off the role, resolved against the person's
// verifications. A client that wanted one more document on one role had
// nowhere to say so, and a prime had no way to pass a client's list one
// rung down to the firm that employs the person.
//
// `lib/document-requirements` is now that place, and this reads it
// rather than recomputing it. Three rules hold the wiring honest:
//
//   **The packet is still the floor.** The line's set is merged over the
//   start packet, never instead of it. A sell line's default set is the
//   customer's paper — an MSA and an NDA — and reading only that would
//   have dropped the I-9 off every placement in the book.
//
//   **A caller that names no line changes nothing.** `requirements` is
//   optional and every branch below is inert without it, so the routes
//   that have not been wired yet give exactly the verdict they gave
//   yesterday.
//
//   **A default is not a decision.** An item that reaches the set from
//   `DEFAULT` keeps the HOLDABLE doctrine above — listed, never moving
//   the verdict, because there is still nowhere to record it. An item
//   somebody actually wrote on an order or a line is holdable: a person
//   decided to ask for it, so its absence is a real gap and it warns.
//   That is the whole reason the NDA on Northbend Athletic's order moves
//   a verdict and the NDA in the shipped start packet does not.

/**
 * One item of the line's required set, as this file needs it.
 *
 * `RequiredItem` itself lives in `lib/packets`, so the packet that asks
 * for a document and the verdict that refuses over it read one shape.
 * The three fields below are the clearance's own: who owes it by name,
 * and what a waiver on it said.
 */
export interface LineRequirement extends RequiredItem {
  /** The firm or person that owes it, where the line names one. */
  owedByName?: string | null
  waivedSays?: string | null
  waiverRefused?: boolean
}

export type { RequiredItem }

/**
 * The supplier's own paperwork, judged by the cover gate rather than by
 * the person's checklist.
 *
 * A certificate of insurance and a certificate of good standing are
 * facts about the firm being paid, and the firm's file is not the
 * person's file. Resolving them against a worker's verifications would
 * report every one of them as missing forever, so they leave the
 * checklist here and arrive at `supplierCoverGate` as `requiredTypes` —
 * which already knows the difference between cover that lapsed and cover
 * nobody ever asked for.
 */
function isSupplierStanding(item: LineRequirement): boolean {
  if (item.owedBy !== 'SUPPLIER') return false
  return item.key.startsWith('INSURANCE_') || item.key === 'GOOD_STANDING'
}

function outstandingRequired(item: ResolvedItem, holdable: Set<string>): boolean {
  if (!item.required) return false
  if (!outstanding(item.state)) return false
  return holdable.has(item.key)
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
  /**
   * The last day of the assignment, where the caller knows it.
   *
   * Only used to say that a license runs out before the work does. Absent
   * means nothing is claimed about the end — which is right: a warning
   * about a date nobody supplied would be invented.
   */
  through?: Date | null
  /**
   * The role, as a person would say it. Picks the start packet: a
   * licensed role asks for the license, everything else asks for what it
   * always asked for. Absent means the W-2 packet, unchanged.
   */
  role?: string | null
  packetKey?: string
  /**
   * The company's own document dictionary, where it has one. Omitted
   * means the shipped defaults, which is the answer for most companies.
   */
  documentTypes?: DefinedType[]
  /**
   * Which edition of each reissued form this company says is current,
   * keyed by document type. Omitted means nothing can be judged, and
   * nothing is claimed.
   */
  editions?: Record<string, Edition[]>
  /**
   * Documents held that are not verifications — a signed NDA, a signed
   * contract. Verification is a check somebody ran; these are things
   * somebody signed. Both count.
   */
  extraHeld?: HeldDocument[]
  /**
   * What this line requires, from `lib/document-requirements`.
   *
   * Omitted means the caller has not named a line, and every branch that
   * reads it is inert — the verdict is the packet's, exactly as before.
   */
  requirements?: LineRequirement[]
}): Clearance {
  const credentials = credentialKeys(input.documentTypes ?? [])
  const basePacket = packetByKey(input.packetKey ?? startPacketFor(input.role))
  const held = [...heldFrom(input.personVerifications), ...(input.extraHeld ?? [])]

  // The line's set, split into the part a person's file answers and the
  // part the firm's file answers.
  // ── A type nobody defined is still said in words ──
  //
  // An item's label falls through to the key where neither the shipped
  // dictionary nor the company's own names it, so a client that added
  // FURNACE_SAFETY_INDUCTION to its order read exactly that back on a
  // placement checklist and inside a refusal a hiring manager was meant
  // to act on. The key is for the machine; the sentence is the product.
  // Nothing is invented — the words inside the key are all we know.
  const required = (input.requirements ?? []).map((r) =>
    r.label === r.key ? { ...r, label: humanKey(r.key) } : r
  )
  const standing = required.filter(isSupplierStanding)
  const personSide = required.filter((r) => !isSupplierStanding(r))
  const byKey = new Map(personSide.map((r) => [r.key, r]))

  const spec = basePacket ? withRequirements(basePacket, personSide) : null
  const resolved = spec ? resolveItems(spec, held, input.on) : []

  const blockingKeys = blockingKeysFor(input.documentTypes ?? [])

  // ── Which license, issued by whom ──
  //
  // The packet says "State license" because one packet starts a nurse, a
  // pharmacist and a crane operator. The refusal knows more than that: the
  // role named the occupation, and the state is on the license already on
  // file where there is one. So the sentence can say "a state nursing
  // license (Wisconsin Board of Nursing)" — which names the register a
  // compliance officer checks — and it says "the state's board of nursing"
  // where nobody recorded a state, because a refusal that names the wrong
  // regulator is worse than one that names none.
  const heldState =
    input.personVerifications
      .filter((v) => credentials.includes(v.type))
      .map((v) => credentialDetail(v).state)
      .find((st) => !!st) ?? null
  const naming = licenseNaming(input.role, heldState)

  // ── Who rendered the verdict on each check somebody else ran ───────
  //
  // The founder, 2026-09-22: "background check companies are the ones
  // that confirm background pass or fail — the risk is passed there to
  // background check companies."
  //
  // `Verification.provider` and `referenceId` have existed since the
  // table did and nothing in production writes either, so a row reading
  // CLEAR could be Sterling's report or a desk that clicked a button. A
  // checklist cannot tell the difference, so it stops claiming it can:
  // where a name is on the row the item says whose report it is, and
  // where none is, the item says so instead of printing "on file".
  //
  // No verdict moves on this. A background check warns when it is
  // missing and warns when it is missing, whoever ran the last one —
  // Addendum E says WARN, capture a reason, proceed. What changes is
  // that nobody reads an unattributed green line as a provider's answer.
  const rendered = new Map<string, ReturnType<typeof readVerdict>>()
  const newestOf = newestReports(input.personVerifications)
  for (const v of input.personVerifications) {
    if (!orderedNotCollected(v.type)) continue
    if (rendered.has(v.type)) continue
    if (newestOf.size && newestOf.has(v.type) && newestOf.get(v.type) !== v) continue
    rendered.set(
      v.type,
      readVerdict({
        key: v.type,
        status: v.status,
        provider: v.provider ?? null,
        reference: v.referenceId ?? null,
        on: v.verifiedAt ?? v.validFrom ?? v.issuedAt ?? null,
      })
    )
  }

  const items: ChecklistItem[] = resolved.map((r) => {
    const asked = byKey.get(r.key)
    const verdict = rendered.get(r.key) ?? null
    // The line's own answer beats the packet's, except where the answer
    // is a waiver of something nobody may waive — `document-requirements`
    // has already refused that one and left `blocks` true.
    const blocks = asked ? asked.required && outstanding(r.state) && asked.blocks : blocksStart(r, blockingKeys)
    return {
      key: r.key,
      label: naming && r.key === LICENSE_KEY ? naming.label : r.label,
      required: r.required,
      state: r.state,
      // A waived item says so where its note would otherwise say "not on
      // file", because "not on file" about something a named person
      // decided this line does not need reads as a gap and is not one.
      // A waiver that was REFUSED says that instead, in the same place:
      // somebody wrote one against a federal form and it is not being
      // honored, and the row they will look at is this one.
      // A held check that names nobody says so on the row a compliance
      // officer actually reads, rather than reading "on file until
      // 2027-06-01" and being believed. A waiver still wins the line:
      // somebody decided that by name, and their reason is the thing to
      // show.
      note: asked?.waivedSays
        ? asked.waivedSays
        : verdict && !outstanding(r.state)
          ? verdict.says
          : r.note,
      hint: r.hint,
      blocks,
      ...(verdict ? { renderedBy: verdict.renderedBy, renderedSays: verdict.says } : {}),
      ...(naming && r.key === LICENSE_KEY ? { said: naming.said } : {}),
      ...(asked
        ? {
            from: asked.from,
            asked: asked.says,
            owedByRole: asked.owedBy,
            owedByName: asked.owedByName ?? null,
            waived: asked.waived,
            waivedSays: asked.waivedSays ?? null,
          }
        : {}),
    }
  })

  const blocking = items.filter((i) => i.blocks)
  const waived = items.filter((i) => i.waived)
  const holdable = new Set<string>([
    ...HOLDABLE,
    // A license is holdable: `Verification` has recorded one since
    // PROFESSIONAL_LICENSE existed, so an outstanding one is a real gap
    // rather than an item with nowhere to live.
    ...credentials,
    ...(input.extraHeld ?? []).map((h) => h.key),
    // Everything somebody actually decided to ask for on this order or
    // this line. A person wrote it down, so its absence is a gap rather
    // than a shipped default with nowhere to be recorded.
    ...personSide.filter((r) => r.from !== 'DEFAULT').map((r) => r.key),
    // An agreement the worker owes on the line that employs her — her NDA
    // — is held the day she signs it on her own page, and her page chases
    // her for it. So the start asks for it too. Until 2026-10-21 her page
    // said she owed it, the clearance list said it was still needed, and
    // the start never asked (found by the document-flow walk).
    ...personSide.filter((r) => r.owedBy === 'WORKER' && WORKER_AGREEMENTS.includes(r.key)).map((r) => r.key),
  ])
  const chasing = items.filter(
    (i) =>
      !i.blocks &&
      !i.waived &&
      outstandingRequired(resolved.find((r) => r.key === i.key)!, holdable)
  )

  // ── Composition: a form with nothing behind it ──
  //
  // Only judged on documents actually held, and only for types that say
  // they are not evidence on their own.
  const unsupported: BackingFinding[] = []
  const editions: EditionFinding[] = []
  for (const row of input.personVerifications) {
    const accepted = row.status === 'CLEAR' || row.status === 'CONDITIONAL'
    if (!accepted) continue
    const type = typeByKey(row.type, input.documentTypes ?? [])
    if (!type) continue

    if (type.requiresBacking) {
      const finding = backingFinding(type, row.backedBy ?? [], (k) =>
        labelFor(k, input.documentTypes ?? [])
      )
      if (finding.standing === 'UNSUPPORTED' || finding.standing === 'BACKING_NOT_IN_FORCE') {
        unsupported.push(finding)
      }
    }


    if (type.reissued) {
      // "08/01/2023" and "08/01/23" are one edition; read in the issuer's
      // own form so a four-digit year is not an audit finding.
      // Matched to the list it is judged against: the company's own entry
      // where it recorded one (in its own spelling), else the issuer's.
      const ownList = input.editions?.[row.type]
      const recordedEdition = !row.formEdition
        ? null
        : ownList?.length
          ? (ownList.find((e) => canonicalEdition(e.edition) === canonicalEdition(row.formEdition!))?.edition ?? row.formEdition)
          : canonicalEdition(row.formEdition)
      const finding = editionFinding(
        type,
        recordedEdition,
        row.completedAt ?? row.issuedAt ?? null,
        // The company's own list where it recorded one; otherwise the
        // editions the issuer published, so an I-9 on an edition the
        // government had retired is judged at every company and not only
        // at the three seeded clients that recorded theirs (found by the
        // document-flow walk, 2026-10-21). Only where the form says which
        // edition it is: a form that names none was left unjudged before
        // and still is, rather than every row in the book becoming a
        // finding on the day this landed.
        input.editions?.[row.type]?.length
          ? input.editions[row.type]
          : recordedEdition ? publishedFor(row.type, recordedEdition, row.completedAt ?? row.issuedAt ?? null) : []
      )
      if (finding.standing === 'SUPERSEDED' || finding.standing === 'UNRECORDED') {
        editions.push(finding)
      }
    }
  }

  // ── The license the person practices on ──
  //
  // Judged on what is held rather than on what a packet asked for, which
  // is the half that needs no configuration: a nurse whose registration
  // is on file and lapsed is refused whether or not anybody set this
  // client up with a licensed-role packet. The packet half catches the
  // other case — a licensed role with no license on file at all.
  const license = licenseGate({
    personName: input.personName,
    credentials: input.personVerifications
      .filter((v) => credentials.includes(v.type))
      .map((v): HeldCredential => {
        const detail = credentialDetail(v)
        return {
          type: v.type,
          label: labelFor(v.type, input.documentTypes ?? []),
          status: v.status,
          issuedAt: v.issuedAt ?? null,
          validFrom: v.validFrom ?? null,
          expiresAt: v.expiresAt ?? null,
          verifiedAt: v.verifiedAt ?? null,
          number: detail.number,
          state: detail.state,
          issuer: v.provider ?? null,
        }
      }),
    keys: credentials,
    on: input.on,
    through: input.through ?? null,
  })

  const rawCover = supplierCoverGate({
    supplierName: input.supplierName,
    certificates: input.supplierCertificates,
    clientName: input.clientName ?? null,
    on: input.on,
    // What this line's own order insists the firm being paid must hold.
    // A waived one is left out rather than passed as required: the point
    // of a waiver is that this client accepted its absence, on the
    // record, in somebody's name.
    requiredTypes: standing.filter((s) => s.required && !s.waived).map((s) => s.key),
  })
  const cover = forActivation(rawCover)

  // ── What moves the verdict, and what only gets said ──
  //
  // A form linked to proof that has expired is a real signal: somebody
  // recorded evidence and the evidence ran out, and that happens to some
  // placements and not all. It warns.
  //
  // A form with nothing recorded behind it at all is reported and does not
  // move the verdict, for the reason already written above HOLDABLE: until
  // 2026-09-16 there was nowhere to record what an I-9 was completed from,
  // so every I-9 in every file is unsupported today. A warning that fires
  // on every row is a click, not a warning, and it would bury the two that
  // matter. It appears on the checklist, with its sentence and its fix,
  // from the first day — and the day a company records backing routinely,
  // flipping UNSUPPORTED_FORM_STOPS_A_START is the whole change.
  //
  // The same line is drawn through the edition check, and for the same
  // reason: a form completed on an edition the issuer had already replaced
  // is a known defect and warns. A form nobody recorded an edition for is
  // an unanswered question — and on the day a company first records its
  // editions, every form filed before then is unanswered. Report it, give
  // the fix, and do not make a hundred percent of rows a warning.
  const adverse = adverseSays(input.personVerifications, input.personName)
  const paperworkWarns =
    unsupported.some((u) => u.standing === 'BACKING_NOT_IN_FORCE') ||
    editions.some((e) => e.standing === 'SUPERSEDED') ||
    adverse.length > 0

  const outcome: Outcome =
    blocking.length > 0 || cover.outcome === 'BLOCK' || license.outcome === 'BLOCK' ? 'BLOCK'
    : chasing.length > 0 || cover.outcome === 'WARN' || license.outcome === 'WARN' || paperworkWarns ? 'WARN'
    : 'PASS'

  return {
    outcome,
    blocking,
    chasing,
    waived,
    items,
    cover,
    license,
    unsupported,
    editions,
    says: oneStop(sayIt(input.personName, outcome, blocking, chasing, cover, license, unsupported, editions, waived, adverse)),
    fix: fixFor(blocking, chasing, cover, license, unsupported, editions),
  }
}

/**
 * Whether an I-9 with nothing behind it refuses the start.
 *
 * It does not, and the choice is worth naming because the opposite is
 * arguable. Work authorization is one of the five Addendum E names as a
 * block, and an I-9 with no evidence recorded means nobody can show the
 * authorization was ever verified.
 *
 * Against that: nothing in this system has ever recorded what an I-9 was
 * completed from, because until 2026-09-16 there was nowhere to put it.
 * Blocking on the absence would refuse every activation on every existing
 * placement on the day this shipped — a control that fires on a hundred
 * percent of rows teaches everybody to route around it, which is the
 * workaround trap Addendum E is explicit about. The block that IS
 * grounded — no I-9 at all — still fires, unchanged.
 *
 * So it warns, loudly, with a sentence and a fix, and it is counted. If
 * the founder decides otherwise once backing is routinely recorded, this
 * constant is the one line to change.
 */
export const UNSUPPORTED_FORM_STOPS_A_START = false

/**
 * Lapsed blocks. Missing warns.
 *
 * The ratified wording is "lapsed supplier insurance" — a certificate
 * that ran out. A supplier that has never uploaded one is not lapsed; it
 * is unknown, and the cover gate treats unknown as blocking because at
 * submission time that is right: you do not put somebody forward under
 * cover you cannot show. At activation of a contract somebody is
 * recording — one that started in August and is being entered in
 * September — a hard stop on a certificate nobody has asked for yet
 * changes nothing about the exposure and everything about whether the
 * firm records the contract at all. So a missing certificate is chased,
 * with a reason recorded on the way through, and an expired one is not.
 */
function forActivation(cover: CoverGate): CoverGate {
  if (cover.outcome !== 'BLOCK') return cover
  // Cover that has not begun is treated as lapsed cover, not as missing
  // cover: the difference that earns a downgrade is "nobody ever asked
  // for it", and a certificate whose period starts next month was asked
  // for, was supplied, and still leaves the person uncovered on day one.
  const lapsed = cover.blocking.filter(
    (b) => b.standing === 'EXPIRED' || b.standing === 'NOT_YET_VALID'
  )
  const neverRecorded = cover.blocking.filter((b) => b.standing === 'MISSING')
  // Said as a start, because this is the start. The cover gate's own
  // sentence is written for the submit button — "Nobody can be submitted
  // through …" — and read on an activation refusal it answered a question
  // nobody had asked (the simulation, 2026-10-20).
  if (lapsed.length > 0) return { ...cover, says: cover.says.replace(/Nobody can be submitted through/g, 'Nobody can start through') }
  return {
    ...cover,
    outcome: 'WARN',
    blocking: [],
    chasing: [...neverRecorded, ...cover.chasing],
    says: cover.says
      .replace(/cannot start|is blocked/i, 'has no cover on file')
      // Never collected is not lapsed, and a start is not a submission:
      // "until it is back in date" about a certificate nobody ever asked
      // for read as a lapse on the simulation of 2026-10-20.
      .replace(/Nobody can be submitted through (.+?) until it is back in date\./g, 'Ask $1 for a current one.'),
  }
}

// ── The right to work, said once ─────────────────────────────────────
//
// Found by a tester on 2026-10-03: "cannot start without proof of right
// to work and I-9 and E-Verify". Two checklist rows and an "and" inside
// a label, joined by another "and", read as three separate papers. To a
// person it is one thing — the right to work, shown on an I-9 and
// checked with E-Verify — so inside a sentence the two rows are said as
// one phrase. The checklist keeps both rows; only the sentence folds.
const RIGHT_TO_WORK_LABEL = 'Proof of right to work'
const I9_LABEL = 'I-9 and E-Verify'
type Named = { key?: string; label: string; said?: string }
const isRightToWork = (i: Named) => i.key === 'RIGHT_TO_WORK' || (!i.key && i.label === RIGHT_TO_WORK_LABEL)
const isI9 = (i: Named) => i.key === 'I9_EVERIFY' || (!i.key && i.label === I9_LABEL)

/** The phrases a list of items is said with, inside a sentence. Exported for its test. */
export function sentencePhrases(items: Named[]): string[] {
  const out: string[] = []
  const both = items.some(isRightToWork) && items.some(isI9)
  let folded = false
  for (const i of items) {
    if (isRightToWork(i) || isI9(i)) {
      if (i.said) { out.push(i.said); continue }
      if (both) {
        if (!folded) out.push('proof of right to work (I-9, checked with E-Verify)')
        folded = true
        continue
      }
      out.push(isI9(i) ? 'an I-9 (checked with E-Verify)' : inSentence(i.label))
      continue
    }
    // `said` where an item names itself more precisely inside a sentence —
    // the license does, because a proper noun cannot be lowercased and a
    // board that is not named is a board nobody can call.
    // `inSentence` rather than `toLowerCase`: a label is a heading on a
    // checklist and a phrase inside a refusal, and the two want different
    // casing — but a form's name keeps its capitals in both. This said
    // "i-9 and e-verify" on two client dashboards.
    out.push(i.said ?? inSentence(i.label))
  }
  return out
}

function names(items: Named[]): string {
  const l = sentencePhrases(items)
  if (l.length <= 1) return l.join('')
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`
}

// ── Papers, counted and named ────────────────────────────────────────
//
// Found by the simulation of 2026-10-20: a worker's notice read "Vertex
// Global needs 3 document(s) before you start". A bracketed plural is a
// form's way of not deciding, and a count with nothing named is a count
// she has to open the email to understand. So a notice says the number
// in a word and names every paper with its article: "three papers before
// you start: an I-9, a background check and a professional license".
// One paper is "one paper". The right to work and the I-9 fold into one
// phrase, as they do in every sentence here, and are counted as one,
// because the count is what she reads, not how many rows the checklist
// keeps.

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** A count as a person says it: "one", "three", "14". */
export function countWord(n: number): string {
  return n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n)
}

/** "one paper", "three papers", "14 papers". */
export function papersCounted(n: number): string {
  return `${countWord(n)} paper${n === 1 ? '' : 's'}`
}

/**
 * The papers a notice asks for, counted in a word and named.
 *
 *   papersAsked([I-9, background check, license])
 *   → { count: 3, counted: 'three papers', named: 'an I-9 (checked with E-Verify), a background check and a professional license' }
 *
 * `counted` and `named` agree by construction: both are read off the
 * same folded phrases.
 */
export function papersAsked(items: { key?: string; label: string; said?: string }[]): {
  count: number
  counted: string
  named: string
} {
  const phrases = sentencePhrases(items).map(withArticle)
  const named =
    phrases.length <= 1 ? phrases.join('') : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
  return { count: phrases.length, counted: papersCounted(phrases.length), named }
}

/**
 * Several findings as prose, ending on exactly one full stop.
 *
 * The findings arrive in two shapes: a clause ("still waiting on the
 * background check for Rosa Delgado") and a finished sentence from
 * another gate ("Brightmoor Staffing: the certificate of insurance ran
 * out on 3 March. Nobody can be submitted through Brightmoor Staffing
 * until it is back in date."). Joining the second with "; " and a
 * closing "." read "until it is back in date.. The contract can start"
 * on Rosa Delgado's placement. So: where every finding is a single
 * clause they share one sentence; where any of them is already more
 * than one sentence, each stands as its own.
 */
export function joinClauses(parts: readonly string[]): string {
  const bare = parts
    .map((p) => p.trim().replace(/[\s.;,]+$/, ''))
    .filter((p) => p.length > 0)
  if (bare.length === 0) return ''
  const cap = (p: string) => p.charAt(0).toUpperCase() + p.slice(1)
  const several = bare.some((p) => /[.!?]\s/.test(p))
  return several ? bare.map((p) => `${cap(p)}.`).join(' ') : `${cap(bare.join('; '))}.`
}

/**
 * The last word on any verdict: no sentence ends twice.
 *
 * A finding carries its own full stop and the sentence around it adds
 * another, or a clause ends in a full stop and is followed by a
 * semicolon. Either reads as a typo on the one line a compliance desk
 * reads before it starts somebody. An ellipsis is never written here, so
 * two stops in a row are always one too many.
 */
export function oneStop(said: string): string {
  return said
    .replace(/\.(\s*\.)+/g, '.')
    .replace(/\.\s*;/g, '.')
    .replace(/;\s*\./g, '.')
    .replace(/\s+([.;,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sayIt(
  person: string,
  outcome: Outcome,
  blocking: ChecklistItem[],
  chasing: ChecklistItem[],
  cover: CoverGate,
  license: LicenseGate,
  unsupported: BackingFinding[] = [],
  editions: EditionFinding[] = [],
  waived: ChecklistItem[] = [],
  adverse: { key: string; says: string }[] = []
): string {
  // What is reported and does not move the verdict still gets said. A
  // clearance that returns PASS and keeps a finding in an array nobody
  // renders is a column with nothing reading it, which is the thing this
  // codebase is least allowed to ship.
  const said = (f: { says: string; fix: string | null }) =>
    f.fix ? `${f.says} ${f.fix}` : f.says
  const reported = [
    ...unsupported.filter((u) => u.standing === 'UNSUPPORTED').map(said),
    ...editions.filter((e) => e.standing === 'UNRECORDED').map(said),
    // Who asked for what, where somebody asked rather than the floor.
    // "Hot floor induction is required by Cavanaugh Glassworks' order
    // PO-2026-2" is the half of a refusal that tells the reader which
    // desk to ring; without it the item is a word nobody recognizes.
    ...[...blocking, ...chasing]
      .filter((i) => i.from && i.from !== 'DEFAULT' && i.asked)
      .map((i) => `${i.label} is ${i.asked}.`),
    // A waiver is said out loud on a green verdict as well as a red one.
    // It is the sentence an auditor is looking for, and a checklist that
    // only mentions what is missing hides the decisions somebody made.
    ...waived.filter((i) => i.waivedSays).map((i) => `${i.label}: ${i.waivedSays}`),
    // And a waiver nobody may make is said loudest of all, beside the
    // refusal it did not prevent.
    ...blocking.filter((i) => i.waivedSays && !i.waived).map((i) => i.waivedSays!),
  ]
  if (outcome === 'PASS') {
    const cleared = `${person} is cleared to start. Everything required is on file.`
    return reported.length === 0 ? cleared : `${cleared} ${reported.join(' ')}`
  }
  const parts: string[] = []
  // The license first when it is what refuses. It is the most specific
  // sentence anybody gets here — it names the number and the state, and
  // it is the one somebody can act on without asking what was meant.
  if (license.outcome === 'BLOCK' && license.says) parts.push(license.says)
  if (blocking.length > 0) parts.push(`${person} cannot start without ${names(blocking)}`)
  if (cover.outcome === 'BLOCK') parts.push(cover.says)
  if (outcome === 'BLOCK') {
    // Joined as sentences, never butted together: "cannot start without
    // an I-9" followed by the cover gate's own sentence read "…(I-9,
    // checked with E-Verify) Halcyon Talent: certificate of good
    // standing expired" on the simulation of 2026-10-20.
    // Each part ends on its own full stop; nothing else about a part is
    // changed, so a masked name keeps the casing every other reader of the
    // same sentence sees.
    const refusal = parts
      .map((p) => p.replace(/\s+/g, ' ').trim().replace(/([^.])$/, '$1.'))
      .join(' ')
    // Who asked travels with the refusal too. A start stopped by a
    // document nobody at the supplier has heard of is a refusal somebody
    // rings us about; one that names the client's own order is a refusal
    // they act on.
    return reported.length === 0 ? refusal : `${refusal} ${reported.join(' ')}`
  }
  if (license.outcome === 'WARN' && license.says) parts.push(license.says)
  // A report that came back flagged is not something being waited on; it
  // is said as what it is, with the steps that follow it.
  const waitingOn = chasing.filter((c) => !adverse.some((a) => a.key === c.key))
  if (waitingOn.length > 0) parts.push(`still waiting on ${names(waitingOn)} for ${person}`)
  for (const a of adverse) parts.push(a.says)
  if (cover.outcome === 'WARN') parts.push(cover.says)
  for (const u of unsupported) {
    if (u.standing === 'BACKING_NOT_IN_FORCE') parts.push(u.says)
  }
  for (const e of editions) {
    if (e.standing === 'SUPERSEDED') parts.push(e.says)
  }
  const warned = `${joinClauses(parts)} The contract can start with a reason recorded.`
  return reported.length === 0 ? warned : `${warned} ${reported.join(' ')}`
}

function fixFor(
  blocking: ChecklistItem[],
  chasing: ChecklistItem[],
  cover: CoverGate,
  license: LicenseGate,
  unsupported: BackingFinding[] = [],
  editions: EditionFinding[] = []
): string | null {
  if (license.outcome === 'BLOCK') return license.fix
  if (blocking.length > 0) return `Get ${names(blocking)} on file, then activate.`
  if (cover.outcome === 'BLOCK') return cover.fix
  if (license.outcome === 'WARN' && license.lapsingInside.length > 0) return license.fix
  if (chasing.length > 0) return `Chase ${names(chasing)}, or activate with a reason.`
  if (cover.outcome === 'WARN') return cover.fix
  if (license.outcome === 'WARN') return license.fix
  const stale = unsupported.find((u) => u.standing === 'BACKING_NOT_IN_FORCE')
  if (stale) return stale.fix
  const superseded = editions.find((e) => e.standing === 'SUPERSEDED')
  if (superseded) return superseded.fix
  // Nothing here is wrong, so there is nothing to fix before activating.
  //
  // What is merely reported — an I-9 with nothing recorded behind it, a
  // form nobody wrote an edition on — carries its own sentence and its own
  // remedy inside `says`. Promoting one of them to `fix` would put
  // "record the document it was completed from" beside a green verdict on
  // every placement in the book, where it reads as a condition of
  // starting. It is not one.
  return null
}

/** The cover standings, flattened for a screen that lists everything. */
export function coverItems(cover: CoverGate): DocStanding[] {
  return [...cover.blocking, ...cover.chasing]
}

// ── Before the start, not on it ───────────────────────────────────────
//
// `contractClearance` above is the verdict activation runs. Until
// 2026-09-17 it was run in exactly one place — inside the activate
// route, at the moment somebody pressed the button — so the first time
// anybody asked whether a person's paperwork was in order was the moment
// they tried to start them, and the answer arrived as a refusal to
// whoever pressed the button rather than as work to the desk that can
// fix it.
//
// The founder walked his own operation and named the gap: the contract
// manager papers the placement, HR clears the person, and nothing told
// HR a start was coming. It is the same shape CLAUDE.md records from the
// client dashboard — the desk that acts is the desk that hears.
//
// So the verdict is read twice, from the same function: once ahead of
// the start, as HR's work, and once at activation, as the refusal. They
// cannot drift, because `says` and `fix` below are the clearance's own
// strings passed through untouched rather than rewritten for a screen.

/**
 * Who has to produce a document.
 *
 * PERSON where a regulator issued it to the worker or the worker holds
 * it — a license, a passport, the I-9 they complete. FIRM where the firm
 * produces it — its own insurance, the NDA it writes. This is CLAUDE.md's
 * "who owes it differs, and that decides who is chased", read off the
 * company's own document dictionary rather than listed here, so a type a
 * client invents on Tuesday is chased from the right party on Wednesday.
 */
export type OwedBy = 'PERSON' | 'FIRM'

const FIRM_SUPPLIES = new Set(['SUPPLIER', 'CLIENT'])

export function owedBy(key: string, documentTypes: DefinedType[] = []): OwedBy {
  const t = typeByKey(key, documentTypes)
  if (!t?.suppliedBy) return 'PERSON'
  return FIRM_SUPPLIES.has(t.suppliedBy) ? 'FIRM' : 'PERSON'
}

/** One outstanding document, and who is being asked for it. */
export interface ClearanceAsk {
  key: string
  label: string
  /** What they are actually being asked for, in their words. */
  hint: string
  required: boolean
  owedBy: OwedBy
  /** How it is named inside a sentence, where that differs from the label (the license). */
  said?: string
  /** The dictionary's own word, for a screen that wants to show it. */
  suppliedBy: string | null
  /** BLOCK where the absence is legally grounded; WARN everywhere else. */
  weight: Outcome
  state: ResolvedItem['state']
}

export interface StartPreview {
  outcome: Outcome
  /** The clearance's own sentence. Identical to what activation refuses with. */
  says: string
  /** The clearance's own remedy. Identical to what activation offers. */
  fix: string | null
  /** The whole verdict, where a caller wants the cover and license detail. */
  clearance: Clearance
  items: ChecklistItem[]
  blocking: ChecklistItem[]
  chasing: ChecklistItem[]
  /** Outstanding and the worker's to produce — this is what is asked for. */
  askOfPerson: ClearanceAsk[]
  /** Outstanding and the firm's own to produce. Nobody emails a firm a link to itself. */
  askOfFirm: ClearanceAsk[]
  /** The supplier's own cover, where it is not in order. */
  coverOutstanding: DocStanding[]
  /** Negative once the start date has passed. Null where nobody set one. */
  daysUntilStart: number | null
  /** The row HR reads, and the title of the notice it gets. */
  headline: string
  /** What is still missing, listed. Null where nothing is. */
  outstanding: string | null
}

/**
 * The start on a placement's header, in a sentence that is true.
 *
 * Found by a tester on 2026-10-03: Ingrid Sørensen's placement header read
 * "started Oct 10, 2026" a week before Oct 10, on a draft contract that
 * cannot start at all — no proof of right to work, no I-9. The header
 * printed the start date as a past event because a date was set; a date
 * set is a plan, not a fact.
 *
 * So "started" is said only of a contract that is running, paused or
 * ended, on or after its first day. Anything else is "due to start", and
 * where the checklist blocks the start the header names what holds it up,
 * in the checklist's own words, so the header and the "Cleared to work"
 * station cannot disagree. A first day that has passed on a contract that
 * never started says so rather than pretending it is still ahead.
 *
 * `blocking` is the labels of the items that stop the start. Where the
 * verdict is BLOCK and none are named — lapsed supplier cover, a license
 * — the header points at the station rather than guessing a reason.
 */
export function startWords(o: {
  startDate: string | null
  state: string
  outcome: Outcome | null
  blocking: { key?: string; label: string; said?: string }[]
  today: Date
}): string | null {
  if (!o.startDate) return null
  const first = new Date(o.startDate)
  const on = plainDate(o.startDate)
  const begun = ['IN_PROGRESS', 'PAUSED', 'ENDED'].includes(o.state)
  if (begun && first.getTime() <= o.today.getTime()) return `started ${on}`
  const due = !begun && first.getTime() < o.today.getTime()
    ? `was due to start ${on} and has not started`
    : `due to start ${on}`
  if (o.outcome !== 'BLOCK') return due
  const reason = o.blocking.length > 0
    ? `waiting on ${names(o.blocking)}`
    : 'see Cleared to work below'
  return `${due}; held up: ${reason}`
}

/** "in 9 days" · "tomorrow" · "today" · "9 days ago". */
export function whenWords(daysUntilStart: number | null): string {
  if (daysUntilStart === null) return ''
  if (daysUntilStart < 0) {
    const n = Math.abs(daysUntilStart)
    return n === 1 ? 'yesterday' : `${n} days ago`
  }
  if (daysUntilStart === 0) return 'today'
  if (daysUntilStart === 1) return 'tomorrow'
  return `in ${daysUntilStart} days`
}

function listed(labels: string[]): string {
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * The verdict, read ahead of the first day, for the desk that can fix it.
 *
 * Takes everything `contractClearance` takes, plus the start date, and
 * answers three questions a checklist does not: how long there is, what
 * is outstanding, and which of the two parties owes each outstanding
 * thing. `says` and `fix` are passed through rather than rewritten —
 * that is the whole point of running one function twice.
 */
export function startPreview(
  input: Parameters<typeof contractClearance>[0] & {
    /** The first day. Null where nobody has set one yet. */
    startDate?: Date | null
    /** The client the person is starting at, for the sentence HR reads. */
    clientName?: string | null
    /**
     * Today, for "due to start in a week". `on` is the day the papers are
     * judged on, which is the first day where that is still ahead — so
     * counting from `on` told HR "due to start today" a week early
     * (found by the document-flow walk, 2026-10-21). Omitted: `on`.
     */
    today?: Date
  }
): StartPreview {
  const clearance = contractClearance(input)
  const types = input.documentTypes ?? []

  const daysUntilStart =
    input.startDate
      ? Math.ceil((startOfDay(input.startDate).getTime() - startOfDay(input.today ?? input.on).getTime()) / 86_400_000)
      : null

  // Required and not in hand: not on file, run out, or not in force yet.
  // Wider than `chasing`, deliberately — `chasing` drops anything this
  // system has nowhere to record, and a packet is exactly the place to
  // record it. An NDA nobody could hold as a verification can be asked
  // for, received and filed against the item that asked.
  const asks: ClearanceAsk[] = clearance.items
    .filter((i) => i.required && outstanding(i.state))
    .map((i) => ({
      key: i.key,
      label: i.label,
      hint: i.hint,
      required: i.required,
      ...(i.said ? { said: i.said } : {}),
      owedBy: owedBy(i.key, types),
      suppliedBy: typeByKey(i.key, types)?.suppliedBy ?? null,
      weight: i.blocks ? ('BLOCK' as Outcome) : ('WARN' as Outcome),
      state: i.state,
    }))

  const askOfPerson = asks.filter((a) => a.owedBy === 'PERSON')
  const askOfFirm = asks.filter((a) => a.owedBy === 'FIRM')
  const coverOutstanding = coverItems(clearance.cover)

  const who = input.personName
  const where = input.clientName ? ` at ${input.clientName}` : ''
  const when = whenWords(daysUntilStart)
  const due = `${who} is due to start${where}${when ? ` ${when}` : ''}`

  const headline =
    clearance.outcome === 'BLOCK'
      ? `${due}, and cannot.`
      : clearance.outcome === 'WARN'
        ? `${due}, with paperwork still outstanding.`
        : `${due}, and everything required is on file.`

  const missingLabels = [...asks.map((a) => a.label), ...coverOutstanding.map((c) => c.label)]

  return {
    outcome: clearance.outcome,
    says: clearance.says,
    fix: clearance.fix,
    clearance,
    items: clearance.items,
    blocking: clearance.blocking,
    chasing: clearance.chasing,
    askOfPerson,
    askOfFirm,
    coverOutstanding,
    daysUntilStart,
    headline,
    outstanding: missingLabels.length > 0 ? `Still needed: ${listed(missingLabels)}.` : null,
  }
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setUTCHours(0, 0, 0, 0)
  return c
}

/**
 * What HR is told, and never told.
 *
 * Null on PASS. A placement whose paperwork is already in order is not
 * work, and a notice that fires on every placement is a click rather
 * than a notice — the same argument this file already makes about a
 * warning that fires on a hundred percent of rows.
 *
 * Everything else says what is missing, what to do about it, and what
 * has already been asked of whom, so the desk does not chase a document
 * the worker was emailed a link for ten seconds ago.
 */
export function hrNotice(
  preview: StartPreview,
  about: {
    personName: string
    roleTitle?: string | null
    /** What was asked of the worker on the way past, by label. */
    askedOfPerson?: string[]
  }
): { title: string; body: string } | null {
  if (preview.outcome === 'PASS') return null

  const parts: string[] = [preview.says]
  if (preview.fix) parts.push(preview.fix)
  if (about.roleTitle) parts.push(`The job is ${about.roleTitle}.`)

  const asked = about.askedOfPerson ?? []
  if (asked.length > 0) {
    parts.push(`${about.personName} has been sent a link and asked for ${listed(asked)}.`)
  }
  if (preview.askOfFirm.length > 0) {
    parts.push(`${listed(preview.askOfFirm.map((a) => a.label))} is ours to produce, not theirs.`)
  }
  if (preview.coverOutstanding.length > 0) {
    parts.push(`Our own cover: ${listed(preview.coverOutstanding.map((c) => c.label))}.`)
  }

  return { title: preview.headline, body: parts.join(' ').replace(/\s+/g, ' ').trim() }
}

// ── The line's own set, read from the record ──────────────────────────
//
// Everything above this point is arithmetic with no database in it, and
// that stays true: `contractClearance` takes the set as an argument and
// cannot go and find one. What follows is the reading, kept in this file
// because it is what every caller of the clearance needs and a second
// file would be a second place for the two to disagree.
//
// The one line a route changes is:
//
//     const papers = contractClearance({ ...as before,
//       ...(await lineExtras({ sellContractId: contract.id })) })
//
// and what it buys is three things the caller would otherwise each fetch
// their own way: what this line requires, the papers signed against it,
// and the whole of the firm's standing rather than its insurance alone.

/**
 * What a line requires, what is signed against it, and the standing of
 * the firm being paid — in the shape `contractClearance` takes.
 *
 * Returns `{}` for a line that does not exist, so a caller spreading it
 * gets exactly the verdict it got before rather than an exception.
 */
/**
 * The firm's own file, as a query.
 *
 * Every caller selected keys beginning INSURANCE_, so the one supplier
 * document the founder named beside them — the certificate of good
 * standing — could be on file, lapsed, and invisible to the arithmetic
 * that was already right about it.
 */
const FIRM_STANDING = [
  'INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER',
  ...COVER_THAT_STOPS_WORK.filter((k) => !k.startsWith('INSURANCE_')),
] as const

type LineDb = typeof prisma

export async function lineExtras(
  input: { sellContractId: string; buyContractId?: never } | { buyContractId: string; sellContractId?: never },
  db: LineDb = prisma,
  now: Date = new Date()
): Promise<{
  requirements?: LineRequirement[]
  extraHeld?: HeldDocument[]
  supplierCertificates?: CoverCertificate[]
  documentTypes?: DefinedType[]
}> {
  const set = await requirementsFor(input as Parameters<typeof requirementsFor>[0], db as never)
  if (!set) return {}

  const sellContractId = 'sellContractId' in input ? input.sellContractId : undefined
  const buyContractId = 'buyContractId' in input ? input.buyContractId : undefined

  // Which firm is being paid on this line, and which firm is paying. The
  // first is whose insurance and good standing the set asks about; the
  // second is who the agreement is with.
  const line = sellContractId
    ? await db.sellContract.findUnique({
        where: { id: sellContractId },
        select: { id: true, companyId: true, personId: true, clientCompanyId: true },
      })
    : await db.buyContract.findUnique({
        where: { id: buyContractId! },
        select: {
          id: true,
          companyId: true,
          vendorCompanyId: true,
          candidates: { select: { personId: true }, take: 1 },
        },
      })
  if (!line) return {}

  const isSell = !!sellContractId
  const supplierCompanyId = isSell
    ? (line as { companyId: string }).companyId
    : ((line as { vendorCompanyId: string | null }).vendorCompanyId ?? (line as { companyId: string }).companyId)
  const customerCompanyId = isSell
    ? ((line as { clientCompanyId: string | null }).clientCompanyId ?? null)
    : (line as { companyId: string }).companyId
  const personId = isSell
    ? (line as { personId: string | null }).personId ?? null
    : ((line as { candidates: { personId: string }[] }).candidates[0]?.personId ?? null)

  const [certificates, types, instances, agreements] = await Promise.all([
    // The firm's whole standing, not only its insurance. `GOOD_STANDING`
    // was invisible to every caller because every caller selected keys
    // beginning INSURANCE_, so a supplier whose registration had been
    // suspended read as fully covered.
    db.verification.findMany({
      where: {
        companyId: supplierCompanyId,
        type: { in: [...FIRM_STANDING] },
      },
      select: {
        type: true, status: true, issuedAt: true, validFrom: true,
        expiresAt: true, verifiedAt: true,
      },
    }),
    db.documentType.findMany({
      where: { companyId: { in: [supplierCompanyId, customerCompanyId].filter((v): v is string => !!v) } },
    }).catch(() => []),
    // Papers signed against this line, or about this person, or about
    // either firm. A signed NDA is a fact about the person and the firm,
    // not about the row it happened to be raised from.
    db.docInstance.findMany({
      where: {
        status: { in: ['SIGNED', 'UPLOADED'] },
        OR: [
          sellContractId ? { sellContractId } : { buyContractId: buyContractId! },
          ...(personId ? [{ subjectType: 'PERSON', subjectId: personId }] : []),
          { subjectType: 'COMPANY', subjectId: supplierCompanyId },
          ...(customerCompanyId ? [{ subjectType: 'COMPANY', subjectId: customerCompanyId }] : []),
        ],
      },
      select: {
        id: true, status: true, validFrom: true, expiresAt: true, signedAt: true,
        countersignedAt: true, template: { select: { name: true, needsSignature: true } },
      },
    }),
    // The agreement between the two firms. An MSA is not a `DocInstance`
    // in this system and never has been — it is its own row, with its own
    // term and its own nightly watch — so a set that asks for one is
    // answered from there rather than reported missing forever.
    customerCompanyId
      ? db.masterAgreement.findMany({
          where: { vendorId: supplierCompanyId, clientId: customerCompanyId },
          select: { status: true, effectiveDate: true, expiresAt: true, signedAt: true },
        })
      : Promise.resolve([]),
  ])

  const known = (types as { key: string; label: string }[]).map((t) => ({ key: t.key, label: t.label }))
  const extraHeld: HeldDocument[] = heldFromDocInstances(instances, known)

  for (const a of agreements) {
    // DRAFT is a paper nobody has executed and EXPIRED is one that ran
    // out; neither is an agreement in force. EXPIRING still is — that is
    // the point of the word.
    if (!['ACTIVE', 'EXPIRING'].includes(a.status)) continue
    extraHeld.push({
      key: 'MSA',
      validFrom: a.effectiveDate ?? a.signedAt ?? null,
      expiresAt: a.expiresAt ?? null,
      accepted: true,
    })
  }

  // The line that employs the person, for what she owes on it. The start
  // is pressed on the sell line, whose own set is the customer's paper;
  // the worker's NDA lives on the buy line that pays her, and her own page
  // reads it there. Read here too, so the two cannot disagree.
  let items = set.items as LineRequirement[]
  if (isSell) {
    const links = await db.contractLink.findMany({ where: { sellContractId: sellContractId! }, select: { buyContractId: true } })
    for (const l of links) {
      const buy = await requirementsFor({ buyContractId: l.buyContractId } as Parameters<typeof requirementsFor>[0], db as never)
      const hers = ((buy?.items ?? []) as LineRequirement[]).filter((i) => i.owedBy === 'WORKER')
      if (hers.length === 0) continue
      const keys = new Set(hers.map((h) => h.key))
      items = [...items.filter((i) => !keys.has(i.key)), ...hers]
    }
  }

  // A non-compete is not asked where the site's state voids it
  // (`NON_COMPETE_VOID` in lib/document-stages): marked, with the law,
  // and nothing in its place.
  const siteOf = sellContractId
    ? await db.sellContract.findUnique({ where: { id: sellContractId }, select: { workLocation: { select: { country: true, state: true } } } })
    : ((await db.buyContract.findUnique({
        where: { id: buyContractId! },
        select: { sellLinks: { select: { sellContract: { select: { workLocation: { select: { country: true, state: true } } } } }, take: 1 } },
      }))?.sellLinks[0]?.sellContract ?? null)
  items = withoutVoidNonCompete(items, siteOf?.workLocation ?? null)

  void now
  return {
    requirements: items,
    extraHeld,
    supplierCertificates: certificates as CoverCertificate[],
    documentTypes: types as DefinedType[],
  }
}

// ── Papers that end before an extension's new end date ────────────────
//
// The founder's documents question, 2026-10-21: an extension checks the
// order and the time limit, and nothing about papers, so a visa, an I-94,
// a work permit or an insurance certificate ending before the new end date
// passed in silence. The same split as every gate here, and the same reason:
// work authorization BLOCKS, because a person cannot be put on a site past
// the day the law lets them work; everything else WARNS and the extension
// goes ahead only with a reason recorded. Never silently permit.
//
// Rules live in data: which papers are read, and which of them block, is
// this table. A new paper is a new line.

/** The papers an extension reads, and whether one ending first stops it. */
export const EXTENSION_PAPERS: Record<string, { about: 'PERSON' | 'FIRM'; blocks: boolean }> = {
  // Work authorization. The I-9's own date is the day it must be completed
  // again, which is the date of the visa or work permit behind it.
  I9_EVERIFY: { about: 'PERSON', blocks: true },
  VISA: { about: 'PERSON', blocks: true },
  I94: { about: 'PERSON', blocks: true },
  WORK_PERMIT: { about: 'PERSON', blocks: true },
  RIGHT_TO_WORK: { about: 'PERSON', blocks: true },
  // Everything else a line leans on, which warns.
  PROFESSIONAL_LICENSE: { about: 'PERSON', blocks: false },
  INSURANCE_GL: { about: 'FIRM', blocks: false },
  INSURANCE_WC: { about: 'FIRM', blocks: false },
  INSURANCE_EO: { about: 'FIRM', blocks: false },
  INSURANCE_CYBER: { about: 'FIRM', blocks: false },
  GOOD_STANDING: { about: 'FIRM', blocks: false },
}

/** Statuses a paper is held in. A flagged or failed one is not something an extension can lean on. */
const HELD_STATUSES = ['CLEAR', 'CONDITIONAL']

export interface ExtensionPaper {
  key: string
  /** The first day not covered: the day after the last day covered. */
  endsOn: Date
  blocks: boolean
  /** Where a later paper picks it up again before the new end: the days nobody is covered. */
  gap: { from: Date; to: Date } | null
  says: string
}

export interface ExtensionPapers {
  outcome: Outcome
  items: ExtensionPaper[]
  /** One sentence per paper, joined. Empty where nothing ends first. */
  says: string
}

type PaperDates = Pick<VerificationRow, 'type' | 'status' | 'expiresAt' | 'validFrom' | 'issuedAt'>

const DAY_MS = 86_400_000
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * The first stretch of days between `from` and `to` (both counted) that
 * no held paper of this kind covers, or null where every day is covered.
 * A paper covers from the day it starts (`validFrom`, else the day it
 * was issued, else always) through the day printed as its end, that day
 * included; one with no end covers every day after its start. Several
 * papers of one kind are read together, so a renewal that starts the day
 * after the old one ends leaves no gap, and one that starts a month later
 * leaves a month.
 */
export function firstGap(rows: readonly PaperDates[], from: Date, to: Date): { from: Date; to: Date; resumes: Date | null; lastCovered: Date | null } | null {
  const spans = rows
    .map((r) => {
      const start = r.validFrom ?? r.issuedAt ?? null
      return { start: start ? dayOf(start) : Number.NEGATIVE_INFINITY, end: r.expiresAt ? dayOf(r.expiresAt) : Number.POSITIVE_INFINITY }
    })
    .filter((x) => x.end >= x.start)
  const last = dayOf(to)
  let cursor = dayOf(from)
  // A paper that ran out before the first day still says when it ran out.
  const before = spans.filter((x) => x.end < cursor).map((x) => x.end)
  let lastCovered: number | null = before.length ? Math.max(...before) : null
  while (cursor <= last) {
    const covering = spans.filter((x) => x.start <= cursor && x.end >= cursor)
    if (covering.length) {
      const reach = Math.max(...covering.map((x) => x.end))
      if (reach === Number.POSITIVE_INFINITY) return null
      lastCovered = reach
      cursor = reach + DAY_MS
      continue
    }
    const next = spans.filter((x) => x.start > cursor && x.start <= last).map((x) => x.start).sort((a, b) => a - b)[0]
    return {
      from: new Date(cursor),
      to: new Date(next !== undefined ? next - DAY_MS : last),
      resumes: next !== undefined ? new Date(next) : null,
      lastCovered: lastCovered !== null ? new Date(lastCovered) : null,
    }
  }
  return null
}

/**
 * Which papers do not cover every day from `from` (today, unless the
 * caller names the first added day) to the new end date. Work
 * authorization must be continuous: a day uncovered refuses the
 * extension, naming the days. A supplier's cover, its good standing or a
 * license with a gap warns with the dates and needs a reason. A kind the
 * person or the firm holds none of is not this check's business — a
 * citizen has no visa.
 */
export function extensionPapers(input: {
  personName: string
  supplierName: string
  newEnd: Date
  /** The first day that has to be covered. Today where not given. */
  from?: Date
  person: PaperDates[]
  supplier: PaperDates[]
}): ExtensionPapers {
  const newEnd = plainDate(input.newEnd.toISOString())
  const from = input.from ?? new Date()
  const items: ExtensionPaper[] = []
  for (const [key, rule] of Object.entries(EXTENSION_PAPERS)) {
    const held = (rule.about === 'PERSON' ? input.person : input.supplier).filter((r) => r.type === key && HELD_STATUSES.includes(r.status))
    if (held.length === 0) continue
    const gap = firstGap(held, from, input.newEnd)
    if (!gap) continue
    const whose = rule.about === 'PERSON' ? input.personName : input.supplierName
    const what = recordLabel(key)
    const d = (x: Date) => plainDate(x.toISOString())
    const span = gap.from.getTime() === gap.to.getTime() ? d(gap.from) : `${d(gap.from)} to ${d(gap.to)}`
    const plural = gap.from.getTime() === gap.to.getTime() ? 'is' : 'are'
    let fact: string
    if (gap.resumes) {
      fact = gap.lastCovered
        ? `${possessive(whose)} ${what} runs out on ${d(gap.lastCovered)} and the next one on file starts on ${d(gap.resumes)}, so ${span} ${plural} not covered, before the new end date of ${newEnd}.`
        : `${possessive(whose)} ${what} on file starts on ${d(gap.resumes)}, so ${span} ${plural} not covered, before the new end date of ${newEnd}.`
    } else {
      fact = gap.lastCovered
        ? `${possessive(whose)} ${what} runs out on ${d(gap.lastCovered)}, before the new end date of ${newEnd}.`
        : `${possessive(whose)} ${what} on file does not cover ${span}, before the new end date of ${newEnd}.`
    }
    items.push({
      key,
      endsOn: gap.from,
      blocks: rule.blocks,
      gap: gap.resumes ? { from: gap.from, to: gap.to } : null,
      says: rule.blocks
        ? gap.resumes
          ? `${fact} Nobody works on a day their authorization does not cover: get one on file that covers those days, then extend.`
          : `${fact} Nobody works past the day their authorization ends: get the new one on file, then extend.`
        : `${fact} Get ${gap.resumes ? 'cover for those days' : 'the renewal'} on file, or say why the extension goes ahead without it.`,
    })
  }
  items.sort((a, b) => Number(b.blocks) - Number(a.blocks) || a.endsOn.getTime() - b.endsOn.getTime())
  const outcome: Outcome = items.some((i) => i.blocks) ? 'BLOCK' : items.length ? 'WARN' : 'PASS'
  return { outcome, items, says: items.map((i) => i.says).join(' ') }
}

/**
 * Whether the extension may go ahead on its papers, given the reason the
 * person extending gave. BLOCK refuses whatever the reason; WARN needs a
 * reason, kept beside the extension; PASS needs nothing.
 */
export function mayExtendOnPapers(
  papers: ExtensionPapers,
  reason: string | null | undefined,
): { ok: true; reason: string | null } | { ok: false; code: 'PAPERS_BLOCK' | 'PAPERS_NEED_A_REASON'; message: string } {
  if (papers.outcome === 'BLOCK') {
    return { ok: false, code: 'PAPERS_BLOCK', message: papers.items.filter((i) => i.blocks).map((i) => i.says).join(' ') }
  }
  if (papers.outcome === 'WARN') {
    const r = reason?.trim()
    if (!r) return { ok: false, code: 'PAPERS_NEED_A_REASON', message: papers.says }
    return { ok: true, reason: r }
  }
  return { ok: true, reason: null }
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}
