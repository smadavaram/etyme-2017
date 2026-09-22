/**
 * What a line requires on paper, and who owes it.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * ── The crack this closes ────────────────────────────────────────────
 *
 * Three desks each decided what a placement needed, their own way, in
 * three separately hardcoded lists: `contract-clearance` read the person
 * and the role's start packet, `supplier-onboarding` carried its own
 * CHECKLIST, `outbound-pack` carried its own OUTBOUND_PACKS. Nothing
 * anywhere said what THIS line requires. So a client could not say "this
 * role needs a site induction" and have it reach the placement, and a
 * prime could not pass a client's required set one rung down to the
 * sub-vendor that actually employs the person. A hospital line and a
 * warehouse line under one agreement demanded identical paperwork,
 * because there was nowhere else to put the difference.
 *
 * CLAUDE.md, "Where a document lives — on the line, on the side it
 * protects", decided 2026-09-18, already said where it goes:
 *
 *   sell line   the customer's paper the firm signs as its supplier
 *   buy line    everything about the party the firm pays — the worker
 *               where it employs them, the sub-vendor where it does not
 *
 * ── Three places an answer can come from ─────────────────────────────
 *
 *   DEFAULT   computed from `lib/document-type` for the line's shape.
 *             The floor, not a starting point: nobody orders their way
 *             out of a federal form, so the defaults are merged UNDER
 *             the order's rules rather than replaced by them.
 *   ORDER     the header's set — the buyer's own rules, for every line
 *             under its order.
 *   LINE      this line's own answer: an item the order never asked
 *             for, or an override of one it did, which says so.
 *
 * Nothing is materialized. `seedDefaultsFor` returns the computed set
 * and writes no row, so a default that changes next month is not frozen
 * into ten thousand rows written on a Tuesday.
 *
 * ── The party that owes it is a role, never a person ─────────────────
 *
 * `owedBy` is WORKER · SUPPLIER · CUSTOMER · US, and it is never a
 * `personId`. The founder asked on 2026-09-21 whether a robot or an AI
 * agent could one day be a line paid by the hour with a required set of
 * its own; the answer is later, and neither this file nor the table
 * should have to change for it. A line whose subject is not a person
 * still carries a set, and a name appears beside the role only where the
 * line has one to resolve.
 *
 * ── What this file does NOT do ───────────────────────────────────────
 *
 * It does not rewire clearance, packets, the outbound pack or supplier
 * onboarding to read it. Those are `etyme-regulatory`'s, after this
 * lands. This is the door and the arithmetic behind it; nothing that
 * computes a verdict today changes meaning because it exists.
 */

import { prisma } from '@/lib/db'
import { packetByKey, startPacketFor } from '@/lib/packets'
import {
  typesFor,
  type DefinedType,
  type DocumentTypeSpec,
  type SuppliedBy,
} from '@/lib/document-type'

// ── The words ─────────────────────────────────────────────────────────

/** Which party owes a document. A position in the trade, never a person. */
export type OwedBy = 'WORKER' | 'SUPPLIER' | 'CUSTOMER' | 'US'

export const OWED_BY: OwedBy[] = ['WORKER', 'SUPPLIER', 'CUSTOMER', 'US']

export const OWED_BY_SAYS: Record<OwedBy, string> = {
  WORKER: 'Whoever does the work — their I-9, their license, the visa a government issued them.',
  SUPPLIER: 'The firm being paid — its insurance, its good standing, its tax form.',
  CUSTOMER: 'The firm being billed — its agreement, its own NDA, its site rules.',
  US: 'Ours to produce or to run — a screening somebody here performs, the employer’s half of a form.',
}

/** Which side of the trade the line is on. */
export type LineSide = 'SELL' | 'BUY'

/**
 * What kind of line it is, which is what decides the default set.
 *
 *   CUSTOMER      a sell line: we bill somebody for this person
 *   W2            a buy line where we employ them — no purchase order,
 *                 because nobody raises one to their own employee
 *   CORP_TO_CORP  a buy line where we pay their own corporation
 *   SUB_VENDOR    a buy line where we pay another firm for their person
 */
export type LineShape = 'CUSTOMER' | 'W2' | 'CORP_TO_CORP' | 'SUB_VENDOR'

export const SHAPE_SAYS: Record<LineShape, string> = {
  CUSTOMER: 'the default for a line that bills a customer',
  W2: 'the default for a W2 start',
  CORP_TO_CORP: 'the default for a line paid corp-to-corp',
  SUB_VENDOR: 'the default for a line bought from a supplier',
}

/**
 * The items nobody may waive and no order may drop.
 *
 * The same two keys as `AUTHORISATION_KEYS` in `lib/contract-clearance`,
 * declared here rather than imported so that clearance can read this
 * file when regulatory rewires it without the two importing each other.
 * `document-requirements.test.ts` fails if the two lists ever differ,
 * which is cheaper than a cycle and safer than a copy nobody checks.
 *
 * A client may waive a background check — it is contractual, and
 * Addendum E says WARN, capture a reason, proceed. A client may not
 * waive work authorization: the law says the work stops, no client can
 * agree otherwise, and a waiver on the row is refused rather than
 * honored quietly.
 */
export const CANNOT_BE_WAIVED: readonly string[] = ['I9_EVERIFY', 'RIGHT_TO_WORK']

// ── A row, as it comes out of the database ────────────────────────────

/** Loosely typed so a Prisma row goes straight in. */
export interface RequirementRow {
  id: string
  documentTypeKey: string
  required: boolean
  owedBy: string
  blocks?: boolean | null
  inheritedFromId?: string | null
  note?: string | null
  waivedReason?: string | null
  waivedById?: string | null
  waivedAt?: Date | null
}

/** One item of the effective set, with where it came from in a sentence. */
export interface EffectiveRequirement {
  /** The row id, or null where this is a computed default nobody has written. */
  id: string | null
  key: string
  label: string
  required: boolean
  owedBy: OwedBy
  /**
   * The firm or the person that owes it, where the line names one.
   * Null is a real answer and not a gap — a line whose subject is not a
   * person, or a corp-to-corp line with no vendor company on it, has a
   * role and no name, and inventing one would be worse.
   */
  owedByName: string | null
  /** Whether a lapse stops the work, after the line and any waiver have had their say. */
  blocks: boolean
  /** What the type itself says, before either. */
  typeBlocks: boolean
  from: 'DEFAULT' | 'ORDER' | 'LINE'
  /** Where it came from, in words somebody can read on a screen. */
  says: string
  waived: boolean
  /** Why it was waived and by whom. Null where nobody waived it. */
  waivedSays: string | null
  /** True where a waiver is recorded and cannot be honored. */
  waiverRefused: boolean
  note: string | null
}

// ── Who owes what ─────────────────────────────────────────────────────

/**
 * The party that owes a document of this type on a line of this shape.
 *
 * Two rules, and the order matters. An AGREEMENT is signed with the
 * counterparty of the line, whoever that is — a W2's NDA is the
 * worker's, a sub-vendor's MSA is the supplier's, and a customer's MSA
 * is the customer's — so the side decides, not the dictionary. Anything
 * else is owed by whoever the dictionary says supplies it, with
 * `SuppliedBy`'s five values folded onto the four positions: a candidate,
 * an employee and a government-issued paper are all the worker's to
 * produce, because the worker is who gets chased for it.
 */
export function owedByFor(type: Pick<DocumentTypeSpec, 'purpose' | 'suppliedBy'>, shape: LineShape): OwedBy {
  if (type.purpose === 'AGREEMENT') return counterpartyOf(shape)
  return fromSuppliedBy(type.suppliedBy, shape)
}

function counterpartyOf(shape: LineShape): OwedBy {
  switch (shape) {
    case 'CUSTOMER':
      return 'CUSTOMER'
    case 'W2':
      return 'WORKER'
    case 'CORP_TO_CORP':
    case 'SUB_VENDOR':
      return 'SUPPLIER'
  }
}

function fromSuppliedBy(suppliedBy: SuppliedBy | null, shape: LineShape): OwedBy {
  switch (suppliedBy) {
    case 'CANDIDATE':
    case 'EMPLOYEE':
    case 'GOVERNMENT':
      return 'WORKER'
    case 'SUPPLIER':
      return 'SUPPLIER'
    case 'CLIENT':
      return 'CUSTOMER'
    case 'PROVIDER':
      // A report nobody on the line can produce. The firm on the paying
      // side orders it from a screening company and the report is posted
      // back to them, so the item is ours to get done rather than
      // anybody's to hand over — and a worker is never chased for it.
      return 'US'
    default:
      // Nothing in the dictionary says who supplies it. On a sell line
      // the paper is the customer's to hand us; on a buy line it is ours
      // to produce, which is the honest half of "we do not know".
      return shape === 'CUSTOMER' ? 'CUSTOMER' : 'US'
  }
}

function asOwedBy(v: string, fallback: OwedBy): OwedBy {
  return (OWED_BY as string[]).includes(v) ? (v as OwedBy) : fallback
}

// ── What shape a line is ──────────────────────────────────────────────

export interface LineFacts {
  side: LineSide
  /** W2 · C2C · IND_1099 · C2H_W2 · CDD · FIXED_TERM. Buy lines only. */
  contractType?: string | null
  /** The firm we buy from, where there is one. Buy lines only. */
  vendorCompanyId?: string | null
  /** The role, as a person would say it. Picks the start packet. */
  role?: string | null
}

export function shapeOf(line: LineFacts): LineShape {
  if (line.side === 'SELL') return 'CUSTOMER'
  if (line.vendorCompanyId) return 'SUB_VENDOR'
  // No firm below us and a corp-to-corp or 1099 arrangement: we pay the
  // person's own corporation, not the person. Everything else on the buy
  // side is employment — W2, contract-to-hire, and the two fixed-term
  // kinds, which are employment with an end date on them.
  if (line.contractType === 'C2C' || line.contractType === 'IND_1099') return 'CORP_TO_CORP'
  return 'W2'
}

// ── The defaults, per shape ───────────────────────────────────────────

interface DefaultItem {
  key: string
  required: boolean
  /** Overrides the computed party, where the shape knows better. */
  owedBy?: OwedBy
}

/**
 * What a corp-to-corp line asks for, and the one thing it does not.
 *
 * No I-9. We do not employ this person — their own corporation does, and
 * the I-9 is the employer's form to complete. Asking for one here would
 * be asking the wrong party for the wrong document, and recording it
 * would be worse: a file that looks complete and names us as an employer
 * we are not. What we do ask for is the corporation's standing and its
 * cover, because that is what we are actually paying.
 *
 * This is a default and it is the founder's to overrule: a client that
 * wants work authorization evidenced on every line, however the person
 * is paid, says so on its order and the order wins.
 */
const CORP_TO_CORP_DEFAULTS: DefaultItem[] = [
  { key: 'W9', required: true },
  { key: 'BUSINESS_PARTNER', required: true },
  { key: 'INSURANCE_GL', required: true },
  { key: 'INSURANCE_WC', required: true },
  { key: 'BACKGROUND_CHECK', required: true },
  { key: 'NDA', required: true },
]

/**
 * What a line bought from another firm asks for.
 *
 * All of it about the firm, none of it about the person: the person is
 * the sub-vendor's own W2 and their I-9 sits on the sub-vendor's own buy
 * line, one rung down. Copying it up here would duplicate the person's
 * file at every hop, which is the thing CLAUDE.md's paperwork section
 * exists to stop.
 */
const SUB_VENDOR_DEFAULTS: DefaultItem[] = [
  { key: 'MSA', required: true },
  { key: 'INSURANCE_GL', required: true },
  { key: 'INSURANCE_WC', required: true },
  { key: 'GOOD_STANDING', required: true },
  { key: 'W9', required: true },
  { key: 'BUSINESS_PARTNER', required: true },
]

/** What a line that bills a customer asks of that customer. */
const CUSTOMER_DEFAULTS: DefaultItem[] = [
  { key: 'MSA', required: true },
  { key: 'NDA', required: true },
]

/**
 * The default items for a shape.
 *
 * The W2 set is not a list in this file. It is the start packet
 * `lib/packets` already holds — the one regulatory maintains and
 * `contract-clearance` already resolves against — so the two cannot
 * drift apart. A licensed role gets the licensed packet, which is how a
 * state license reaches the default set of a nurse's line and not an
 * ERP consultant's.
 */
export function defaultItemsFor(shape: LineShape, role?: string | null): DefaultItem[] {
  switch (shape) {
    case 'W2': {
      const packet = packetByKey(startPacketFor(role))
      // No owedBy: the packet says which documents, and the dictionary
      // says who owes each one. Forcing WORKER here overrode every type
      // that says otherwise — which is how a background check, a report
      // posted to the firm that ordered it, came to be chased from the
      // worker on every W2 line in the product.
      return (packet?.items ?? []).map((i) => ({ key: i.key, required: i.required }))
    }
    case 'CORP_TO_CORP':
      return CORP_TO_CORP_DEFAULTS
    case 'SUB_VENDOR':
      return SUB_VENDOR_DEFAULTS
    case 'CUSTOMER':
      return CUSTOMER_DEFAULTS
  }
}

// ── The effective set ─────────────────────────────────────────────────

export interface Names {
  WORKER?: string | null
  SUPPLIER?: string | null
  CUSTOMER?: string | null
  US?: string | null
}

export interface EffectiveInput {
  shape: LineShape
  role?: string | null
  /** Rows written on the line itself. */
  lineRows?: RequirementRow[]
  /** Rows written on the order above it. */
  orderRows?: RequirementRow[]
  /** How to name the order in a sentence — "Northbend Athletic's order PO-2026-1". */
  orderSays?: string | null
  /** The firm or person behind each role, where the line names one. */
  names?: Names
  /** Who waived what, by person id. A waiver with no name still says the reason. */
  waiverNames?: Record<string, string>
  /** The company's own document dictionary, where it has one. */
  documentTypes?: DefinedType[]
}

function onDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/**
 * The set of documents this line actually requires, each saying where it
 * came from.
 *
 * Pure: no database, no clock beyond the dates on the rows handed in.
 * `requirementsFor` is the same answer with the reading done for you.
 */
export function effectiveRequirements(input: EffectiveInput): EffectiveRequirement[] {
  const types = typesFor(input.documentTypes ?? [])
  const byKey = new Map(types.map((t) => [t.key, t]))
  const label = (key: string): string => byKey.get(key)?.label ?? key
  const typeBlocks = (key: string): boolean => byKey.get(key)?.blocks ?? false

  const out = new Map<string, EffectiveRequirement>()

  const partyFor = (key: string, stated?: string): OwedBy => {
    const t = byKey.get(key)
    const computed = t ? owedByFor(t, input.shape) : input.shape === 'CUSTOMER' ? 'CUSTOMER' : 'US'
    return stated ? asOwedBy(stated, computed) : computed
  }

  // 1. The floor: what this shape asks for whatever anybody ordered.
  for (const d of defaultItemsFor(input.shape, input.role)) {
    const owedBy = d.owedBy ?? partyFor(d.key)
    out.set(d.key, {
      id: null,
      key: d.key,
      label: label(d.key),
      required: d.required,
      owedBy,
      owedByName: nameOf(owedBy, input.names),
      blocks: typeBlocks(d.key),
      typeBlocks: typeBlocks(d.key),
      from: 'DEFAULT',
      says: SHAPE_SAYS[input.shape],
      waived: false,
      waivedSays: null,
      waiverRefused: false,
      note: null,
    })
  }

  // 2. The order's own rules, over the top.
  const orderById = new Map<string, RequirementRow>()
  for (const row of input.orderRows ?? []) {
    orderById.set(row.id, row)
    out.set(row.documentTypeKey, fromRow(row, 'ORDER', input.orderSays ?? 'required by the order this line is on'))
  }

  // 3. The line's own answer, last.
  for (const row of input.lineRows ?? []) {
    const parent = row.inheritedFromId ? orderById.get(row.inheritedFromId) : null
    const says = parent
      ? `set on this line, over ${input.orderSays ?? 'the order it is on'}`
      : 'set on this line'
    out.set(row.documentTypeKey, fromRow(row, 'LINE', says))
  }

  return [...out.values()].sort(
    (a, b) => Number(b.blocks) - Number(a.blocks) || Number(b.required) - Number(a.required) || a.label.localeCompare(b.label)
  )

  function fromRow(row: RequirementRow, from: 'ORDER' | 'LINE', says: string): EffectiveRequirement {
    const key = row.documentTypeKey
    const owedBy = partyFor(key, row.owedBy)
    const floorItem = CANNOT_BE_WAIVED.includes(key)
    const waived = !!(row.waivedAt || row.waivedReason)
    const waiverRefused = waived && floorItem

    let waivedSays: string | null = null
    if (waived) {
      const who = row.waivedById ? (input.waiverNames?.[row.waivedById] ?? null) : null
      const when = row.waivedAt ? ` on ${onDay(row.waivedAt)}` : ''
      const why = row.waivedReason ? `: ${row.waivedReason}` : ''
      waivedSays = waiverRefused
        ? `${label(key)} was marked waived${who ? ` by ${who}` : ''}${when}${why} — and it cannot be. ` +
          `Nobody may agree to work without authorization, so it is still required.`
        : `Waived${who ? ` by ${who}` : ''}${when}${why}`
    }

    // A client may decide a background check is not needed on this line.
    // It may not decide that about work authorization, whichever column
    // it writes it in — required, blocks, or a waiver.
    const required = floorItem ? true : row.required
    const declaredBlocks = row.blocks ?? typeBlocks(key)
    const blocks = floorItem ? true : waived ? false : declaredBlocks

    return {
      id: row.id,
      key,
      label: label(key),
      required,
      owedBy,
      owedByName: nameOf(owedBy, input.names),
      blocks,
      typeBlocks: typeBlocks(key),
      from,
      says,
      waived: waived && !waiverRefused,
      waivedSays,
      waiverRefused,
      note: row.note ?? null,
    }
  }
}

function nameOf(owedBy: OwedBy, names?: Names): string | null {
  return names?.[owedBy] ?? null
}

/**
 * The default set for a line, computed and returned — never written.
 *
 * The name says seed and the body writes nothing on purpose. A set
 * materialized when a line is created is a set that cannot learn: change
 * the default next month and every line written before it keeps the old
 * one, silently, with no row saying anybody chose it. A row exists here
 * only where somebody actually decided something.
 */
export function seedDefaultsFor(line: LineFacts, opts?: { names?: Names; documentTypes?: DefinedType[] }): EffectiveRequirement[] {
  return effectiveRequirements({
    shape: shapeOf(line),
    role: line.role,
    names: opts?.names,
    documentTypes: opts?.documentTypes,
  })
}

// ── The one door ──────────────────────────────────────────────────────

export interface LineRequirements {
  side: LineSide
  shape: LineShape
  /** The order the line is on, where it is on one. */
  order: { id: string; number: string; issuedBy: string } | null
  items: EffectiveRequirement[]
  /** One sentence for the top of the list. */
  says: string
}

type Db = typeof prisma

const ROW_SELECT = {
  id: true,
  documentTypeKey: true,
  required: true,
  owedBy: true,
  blocks: true,
  inheritedFromId: true,
  note: true,
  waivedReason: true,
  waivedById: true,
  waivedAt: true,
} as const

/**
 * Everything this line requires, from whichever of the three places has
 * the answer.
 *
 * One line, by id, on one side. Both ids at once is refused rather than
 * guessed at: a requirement belongs to exactly one owner and a caller
 * that does not know which one it is asking about is a caller with a bug.
 */
export async function requirementsFor(
  input: { sellContractId: string; buyContractId?: never } | { buyContractId: string; sellContractId?: never },
  db: Db = prisma
): Promise<LineRequirements | null> {
  if ('sellContractId' in input && input.sellContractId) {
    return sellRequirements(input.sellContractId, db)
  }
  if ('buyContractId' in input && input.buyContractId) {
    return buyRequirements(input.buyContractId, db)
  }
  return null
}

async function sellRequirements(id: string, db: Db): Promise<LineRequirements | null> {
  const line = await db.sellContract.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      company: { select: { name: true } },
      clientCompany: { select: { id: true, name: true } },
      person: { select: { name: true } },
      requirement: { select: { title: true } },
      workOrder: { select: { id: true, number: true, issuedBy: { select: { name: true } } } },
      documentRequirements: { select: ROW_SELECT },
    },
  })
  if (!line) return null

  const shape: LineShape = 'CUSTOMER'
  const { orderRows, orderSays } = await orderSet(line.workOrder, db)

  return assemble({
    side: 'SELL',
    shape,
    role: line.requirement?.title ?? null,
    order: line.workOrder
      ? { id: line.workOrder.id, number: line.workOrder.number, issuedBy: line.workOrder.issuedBy.name }
      : null,
    orderRows,
    orderSays,
    lineRows: line.documentRequirements,
    names: {
      WORKER: line.person?.name ?? null,
      // On a sell line WE are the supplier — the firm the customer holds
      // the insurance and the good standing of.
      SUPPLIER: line.company?.name ?? null,
      CUSTOMER: line.clientCompany?.name ?? null,
      US: line.company?.name ?? null,
    },
    dictionaryFor: [line.companyId, line.clientCompany?.id ?? null],
    db,
  })
}

async function buyRequirements(id: string, db: Db): Promise<LineRequirements | null> {
  const line = await db.buyContract.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      contractType: true,
      vendorCompanyId: true,
      company: { select: { name: true } },
      vendorCompany: { select: { name: true } },
      candidates: { select: { person: { select: { name: true } } }, take: 1 },
      workOrder: { select: { id: true, number: true, issuedBy: { select: { name: true } } } },
      sellLinks: {
        select: { sellContract: { select: { clientCompany: { select: { name: true } }, requirement: { select: { title: true } } } } },
        take: 1,
      },
      documentRequirements: { select: ROW_SELECT },
    },
  })
  if (!line) return null

  const shape = shapeOf({
    side: 'BUY',
    contractType: line.contractType,
    vendorCompanyId: line.vendorCompanyId,
  })
  const { orderRows, orderSays } = await orderSet(line.workOrder, db)
  const sell = line.sellLinks[0]?.sellContract ?? null

  // A corp-to-corp line with no vendor company on it is the person's own
  // corporation, so the supplier's name is theirs. Where nothing names
  // anybody — a line whose subject is not a person at all — the role
  // stands on its own and the name is null.
  const worker = line.candidates[0]?.person?.name ?? null
  const supplier = line.vendorCompany?.name ?? (shape === 'CORP_TO_CORP' ? worker : null)

  return assemble({
    side: 'BUY',
    shape,
    role: sell?.requirement?.title ?? null,
    order: line.workOrder
      ? { id: line.workOrder.id, number: line.workOrder.number, issuedBy: line.workOrder.issuedBy.name }
      : null,
    orderRows,
    orderSays,
    lineRows: line.documentRequirements,
    names: {
      WORKER: worker,
      SUPPLIER: supplier,
      CUSTOMER: sell?.clientCompany?.name ?? null,
      US: line.company?.name ?? null,
    },
    dictionaryFor: [line.companyId, line.vendorCompanyId],
    db,
  })
}

async function orderSet(
  order: { id: string; number: string; issuedBy: { name: string } } | null,
  db: Db
): Promise<{ orderRows: RequirementRow[]; orderSays: string | null }> {
  if (!order) return { orderRows: [], orderSays: null }
  const rows = await db.documentRequirement.findMany({
    where: { workOrderId: order.id },
    select: ROW_SELECT,
  })
  return {
    orderRows: rows,
    orderSays: `required by ${order.issuedBy.name}’s order ${order.number}`,
  }
}

async function assemble(input: {
  side: LineSide
  shape: LineShape
  role: string | null
  order: { id: string; number: string; issuedBy: string } | null
  orderRows: RequirementRow[]
  orderSays: string | null
  lineRows: RequirementRow[]
  names: Names
  /** Whose dictionaries name these types: the line's company, and the firm across from it. */
  dictionaryFor: (string | null)[]
  db: Db
}): Promise<LineRequirements> {
  const companyIds = input.dictionaryFor.filter((v): v is string => !!v)
  const defined = companyIds.length
    ? await input.db.documentType.findMany({
        where: { companyId: { in: companyIds } },
        select: {
          key: true, label: true, hint: true, purpose: true, validityShape: true,
          validMonths: true, reissued: true, backedByAnyOf: true, requiresBacking: true,
          signedBy: true, suppliedBy: true, blocks: true, archivedAt: true,
        },
      })
    : []

  const waiverIds = [...input.orderRows, ...input.lineRows]
    .map((r) => r.waivedById)
    .filter((v): v is string => !!v)
  const waiverNames: Record<string, string> = {}
  if (waiverIds.length) {
    const people = await input.db.person.findMany({
      where: { id: { in: waiverIds } },
      select: { id: true, name: true },
    })
    for (const p of people) waiverNames[p.id] = p.name
  }

  const items = effectiveRequirements({
    shape: input.shape,
    role: input.role,
    lineRows: input.lineRows,
    orderRows: input.orderRows,
    orderSays: input.orderSays,
    names: input.names,
    waiverNames,
    documentTypes: defined,
  })

  return { side: input.side, shape: input.shape, order: input.order, items, says: summarize(items, input.orderSays) }
}

function summarize(items: EffectiveRequirement[], orderSays: string | null): string {
  const required = items.filter((i) => i.required)
  const fromOrder = items.filter((i) => i.from === 'ORDER').length
  const fromLine = items.filter((i) => i.from === 'LINE').length
  const waived = items.filter((i) => i.waived).length

  const parts: string[] = [
    `${plural(required.length, 'document', 'documents')} required on this line`,
  ]
  if (fromOrder > 0 && orderSays) parts.push(`${fromOrder} ${orderSays}`)
  if (fromLine > 0) parts.push(`${fromLine} set on the line itself`)
  if (waived > 0) parts.push(`${plural(waived, 'one', 'of them')} waived, with the reason on the record`)
  return `${parts.join(', ')}.`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// ── Waiving one ───────────────────────────────────────────────────────

export interface WaiverVerdict {
  ok: boolean
  says: string
}

/**
 * Whether this item may be waived at all, and what to say where it may not.
 *
 * Addendum E in one function: BLOCK where legally grounded, WARN and
 * capture a reason everywhere else, never silently permit. The refusal
 * says what is missing and what to do, never a code.
 */
export function mayWaive(documentTypeKey: string, reason: string, labelOf: (k: string) => string = (k) => k): WaiverVerdict {
  if (CANNOT_BE_WAIVED.includes(documentTypeKey)) {
    return {
      ok: false,
      says:
        `${labelOf(documentTypeKey)} cannot be waived. Nobody may agree to work without authorization, ` +
        `however urgent the start is. Get it on file, then activate.`,
    }
  }
  if (!reason.trim()) {
    return {
      ok: false,
      says:
        `Say why this line does not need ${labelOf(documentTypeKey)}. ` +
        `The reason goes on the record with your name, and whoever audits this will read it.`,
    }
  }
  return { ok: true, says: `${labelOf(documentTypeKey)} waived on this line, with your reason on the record.` }
}
