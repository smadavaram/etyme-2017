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

import { packetByKey, resolveItems, startPacketFor, type HeldDocument, type ResolvedItem } from '@/lib/packets'
import {
  supplierCoverGate,
  licenseGate,
  type CoverCertificate,
  type CoverGate,
  type DocStanding,
  type HeldCredential,
  type LicenseGate,
} from '@/lib/document-stages'
import {
  typesFor,
  typeByKey,
  backingFinding,
  editionFinding,
  labelFor,
  type BackingDocument,
  type BackingFinding,
  type DefinedType,
  type Edition,
  type EditionFinding,
} from '@/lib/document-type'

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
   * Whatever the check came back with. Read only for the two fields a
   * license refusal has to name — the number and the state — because
   * "your license expired" is not something a compliance officer can
   * check against a register and "RN 154-882, WI expired" is.
   */
  result?: unknown
}

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
    const validFrom = r.validFrom ?? r.issuedAt ?? null
    out.push({ key: r.type, validFrom, expiresAt: r.expiresAt ?? null, accepted })
    // The alias, so the packet's second name for the same thing resolves.
    for (const [alias, sources] of Object.entries(SATISFIED_BY)) {
      if (sources.includes(r.type)) out.push({ key: alias, validFrom, expiresAt: r.expiresAt ?? null, accepted })
    }
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
}): Clearance {
  const credentials = credentialKeys(input.documentTypes ?? [])
  const spec = packetByKey(input.packetKey ?? startPacketFor(input.role))
  const held = [...heldFrom(input.personVerifications), ...(input.extraHeld ?? [])]
  const resolved = spec ? resolveItems(spec, held, input.on) : []

  const blockingKeys = blockingKeysFor(input.documentTypes ?? [])
  const items: ChecklistItem[] = resolved.map((r) => ({
    key: r.key,
    label: r.label,
    required: r.required,
    state: r.state,
    note: r.note,
    blocks: blocksStart(r, blockingKeys),
  }))

  const blocking = items.filter((i) => i.blocks)
  const holdable = new Set<string>([
    ...HOLDABLE,
    // A license is holdable: `Verification` has recorded one since
    // PROFESSIONAL_LICENSE existed, so an outstanding one is a real gap
    // rather than an item with nowhere to live.
    ...credentials,
    ...(input.extraHeld ?? []).map((h) => h.key),
  ])
  const chasing = items.filter(
    (i) => !i.blocks && outstandingRequired(resolved.find((r) => r.key === i.key)!, holdable)
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
      const finding = editionFinding(
        type,
        row.formEdition ?? null,
        row.completedAt ?? row.issuedAt ?? null,
        input.editions?.[row.type] ?? []
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
  const paperworkWarns =
    unsupported.some((u) => u.standing === 'BACKING_NOT_IN_FORCE') ||
    editions.some((e) => e.standing === 'SUPERSEDED')

  const outcome: Outcome =
    blocking.length > 0 || cover.outcome === 'BLOCK' || license.outcome === 'BLOCK' ? 'BLOCK'
    : chasing.length > 0 || cover.outcome === 'WARN' || license.outcome === 'WARN' || paperworkWarns ? 'WARN'
    : 'PASS'

  return {
    outcome,
    blocking,
    chasing,
    items,
    cover,
    license,
    unsupported,
    editions,
    says: sayIt(input.personName, outcome, blocking, chasing, cover, license, unsupported, editions),
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
  if (lapsed.length > 0) return cover
  return {
    ...cover,
    outcome: 'WARN',
    blocking: [],
    chasing: [...neverRecorded, ...cover.chasing],
    says: cover.says.replace(/cannot start|is blocked/i, 'has no cover on file'),
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
  cover: CoverGate,
  license: LicenseGate,
  unsupported: BackingFinding[] = [],
  editions: EditionFinding[] = []
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
  if (outcome === 'BLOCK') return parts.join(' ').replace(/\s+/g, ' ').trim().replace(/([^.])$/, '$1.')
  if (license.outcome === 'WARN' && license.says) parts.push(license.says)
  if (chasing.length > 0) parts.push(`still waiting on ${names(chasing)} for ${person}`)
  if (cover.outcome === 'WARN') parts.push(cover.says)
  for (const u of unsupported) {
    if (u.standing === 'BACKING_NOT_IN_FORCE') parts.push(u.says)
  }
  for (const e of editions) {
    if (e.standing === 'SUPERSEDED') parts.push(e.says)
  }
  const warned = `${parts.join('; ')}. The contract can start with a reason recorded.`
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
