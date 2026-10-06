/**
 * Delete the demo world and seed it again, so its dates count from today.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * A seeded world keeps the day it was born (lib/seed-days), which is
 * what makes a second seeding a no-op — and is also why a world seeded
 * in March goes on reading as March, and why a fix to how the seed
 * writes something never reaches the live demo. The seed only ever adds.
 * The honest way to carry today's fixes into the demo is to drop the
 * world and seed it again, and until this file there was no way to do
 * that without a database credential leaving its deployment.
 *
 * The same database holds real rows — leads from the site, incidents,
 * the nightly job's runs, and anybody who has signed up. So the delete is
 * scoped, and the scope is the part that has to be right.
 *
 * ── What the demo world is ───────────────────────────────────────────
 *
 * **Companies**, from two answers and never from a slug pattern:
 *
 * - every company on the seed's own roster (`WORLD_SLUGS`), the shell
 *   nobody is seated at included. The roster, not `world-*`: a real firm
 *   named World Wide Technology slugifies to `world-wide-technology`.
 * - every company `lib/demo-company` calls a demo by its seats — at least
 *   one, every one at an address nobody can register — or by a reserved
 *   domain. A visitor's own sandbox (`isDemo`) is not in scope: it is
 *   seated at the visitor's real address, it has its own reaper and its
 *   own reset button, and nothing seedWorld writes replaces it.
 *
 * **People**: everybody at a reserved address (`.example`, `.invalid`,
 * `.local`) — except anybody something outside the demo world still
 * holds. A reserved person seated in a visitor's sandbox is that
 * sandbox's, and is spared rather than refused.
 *
 * **Rows**: everything that points, by a foreign key, at anything above
 * — and at anything that points at that, to the end. The graph is read
 * off the Prisma schema at run time (`Prisma.dmmf`), so a model added
 * tomorrow is followed without anybody remembering to. Columns that name
 * a row without a foreign key are declared one by one in `LOOSE`, and
 * `__tests__/invariants/seed-rebuild.test.ts` fails on one that is not.
 *
 * ── What stops it ────────────────────────────────────────────────────
 *
 * A thread to the real world. If a row about to be deleted points at a
 * real company or a real person — a real firm's contract with a demo
 * supplier, somebody at a gmail address seated at Northbend Athletic —
 * then deleting it deletes a real row, and nothing is deleted at all. The
 * refusal names each thread. Deleting a real row to make a demo tidy is
 * the one mistake here that cannot be put back.
 *
 * Three models are records that outlive what they mention and are never
 * deleted: `JobRun`, `Incident`, `MarketingLead` (`KEPT`).
 *
 * Before anybody asks for the delete, `dryRunRebuild` says what would go
 * and every tie, by whose record it is (lib/seed-owners names the owner,
 * masking a real person's address), and `releaseTies` lets go of the ties
 * that only a reference holds — moving it to a stand-in made-up person,
 * emptying it, or taking one id out of a list — deleting nothing. A tie
 * only deleting a row would release is named and left. See "Whose
 * records, and letting go of them" below.
 *
 * ── How ──────────────────────────────────────────────────────────────
 *
 * One transaction, children before parents, in `DELETE_ORDER` — a
 * literal list of every model, checked against the schema by the same
 * test. Never `TRUNCATE`, never a dropped database.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { WORLD_SLUGS } from '@/lib/seed-world'
import { isDemoCompany } from '@/lib/demo-company'
import { reservedAddress, RESERVED_SUFFIXES } from '@/lib/demo-session'
import { describeCompanies, describePeople, maskEmail, ownerOf, type OwnerWords } from '@/lib/seed-owners'

/** What the caller has to type. A sentence, so it cannot be sent by accident. */
export const CONFIRM_PHRASE = 'delete the demo world'

/**
 * Every model, children before parents.
 *
 * Derived from the schema — a model comes after every model with a
 * foreign key to it — and written out rather than computed so a reader
 * can see the order the rows go in. The invariant test recomputes it
 * from `Prisma.dmmf` and fails when a model is missing or out of order.
 */
export const DELETE_ORDER = [
  'Credential', 'Context', 'ProgramSeat', 'AccessLog', 'Interview', 'IdentityMatch', 'SupplierInvite',
  'Counterparty', 'CompanyContact', 'BenchListing', 'BenchWant', 'BenchHolidaySwitch', 'VisaDocument', 'VisaEvent', 'MasterAgreementVersion',
  'AgreementSignature', 'EarlyPaymentDiscount', 'HeadcountPlan', 'ApprovalRuleVersion', 'RequirementApproval',
  'RequirementInvitation', 'Match', 'Lead', 'Representation', 'DoNotSubmit', 'BuyContractCandidate',
  'ContractLink', 'Cycle', 'TimeOffEntry', 'Payment', 'CustomerCreditLimit', 'DunningSend', 'FxRate',
  'JournalLine', 'ErpAccountMap', 'OrderPosting', 'ContractCostAllocation', 'InvoiceLine',
  'InvoiceMatchOverride', 'IntercompanyPosition', 'RateHistory', 'Blacklist', 'SupplierRequest',
  'ContractorInvitation', 'Favorite', 'Message', 'Notification', 'RolloffEvent', 'JobRun', 'AutomationLog',
  'VerificationDoc', 'DocumentEdition', 'DocumentBacking', 'GovernanceEvaluation', 'Enrollment',
  'DocumentShareItem', 'DocumentShareAccess', 'DocFile', 'WeekApprovalFile', 'WeekApprovalContract', 'DocumentRequirement', 'ImportRow', 'Holiday',
  'PacketItem', 'WebhookDelivery', 'CompanyDomain', 'SubdomainAlias', 'CustomDomain', 'Check', 'TextMessage',
  'CreditNote', 'PaymentRunItem', 'ClassificationCall', 'ExemptAssertion', 'MarketingLead',
  'ReconciliationRun', 'SourcedContact', 'DataRequest', 'LegalHold', 'BreachCompany', 'CensusFile',
  'CensusRead', 'OrderMilestone', 'Role', 'ConsultantProfile', 'VisaPetition', 'ApprovalRule', 'Submission',
  'OvertimeDecision', 'Invoice', 'Expense', 'VendorBill', 'LedgerAccount', 'JournalEntry', 'Conversation',
  'Verification', 'GovernanceRule', 'Course', 'DocumentShare', 'DocInstance', 'Import', 'Event',
  'DocumentPacket', 'WebhookSubscription', 'AgentRun', 'PaymentRun', 'Breach', 'CensusRequest',
  'WeekApproval', 'WorkAssertion', 'Resume', 'BuyContract', 'RemitTo', 'Incident', 'DocumentType', 'GovernancePolicy',
  'DocTemplate', 'ServiceAccount', 'LegalEntity', 'ProjectHold', 'ProjectRelease', 'Timesheet', 'SellContract', 'WorkOrder', 'Requirement',
  'ProjectOrder', 'CompanyLocation', 'Opening', 'Engagement', 'InternalOrder', 'MasterAgreement',
  'CostCenter', 'Person', 'OrgUnit', 'Company',
] as const

/**
 * Records of what happened, kept whatever they mention.
 *
 * None of them has a foreign key to anything, so nothing reaches them —
 * named anyway, so a rule that one day follows a loose column into them
 * stops here. A demo row that points at one of them is not a thread to
 * the real world: deleting the demo row takes nothing real away.
 */
export const KEPT = ['JobRun', 'Incident', 'MarketingLead'] as const

/**
 * Parents with no owner of their own, deleted once the demo world was
 * the only thing using them.
 *
 * An `Engagement` points at nothing but an optional agreement, so one
 * written without an MSA is reached by no foreign key from a company —
 * only its invoices and lines point at it. Left alone it would outlive
 * every row that gave it meaning, and a rebuild a week later would find
 * a second one beside it. One is deleted when a demo row points at it,
 * no surviving row does, and everything it points at is going too.
 */
export const ORPHANED_WITH_THE_WORLD = ['Engagement'] as const

/**
 * Columns that name another row without a foreign key.
 *
 *   OWNED   the row belongs to whatever it names; when that goes, so does
 *           the row (a notification to a demo person, a demo firm's import)
 *   LINK    a surviving row naming a demo one is a thread to the real
 *           world, and stops the rebuild like a foreign key would
 *   RECORD  who did it, or a reference the row keeps as history; left as
 *           it is, whatever it names
 *
 * Every `String` column ending in Id, Ids or By that is not a foreign key
 * is listed. The invariant test fails on one that is not, so a column
 * added tomorrow is decided by whoever adds it.
 */
export type LooseRole = 'OWNED' | 'LINK' | 'RECORD'
export const LOOSE: Record<string, { as: LooseRole; to?: string[] }> = {
  // ── Owned: goes with what it names ──
  'Notification.personId': { as: 'OWNED', to: ['Person'] },
  'Import.companyId': { as: 'OWNED', to: ['Company'] },
  'SourcedContact.heldByCompanyId': { as: 'OWNED', to: ['Company'] },
  'RateHistory.contractId': { as: 'OWNED', to: ['SellContract', 'BuyContract'] },
  'IntercompanyPosition.fromEntityId': { as: 'OWNED', to: ['LegalEntity'] },
  'IntercompanyPosition.toEntityId': { as: 'OWNED', to: ['LegalEntity'] },

  // ── Link: a real row naming a demo one ──
  'Favorite.targetId': { as: 'LINK', to: ['Person', 'Company'] },
  'Blacklist.targetId': { as: 'LINK', to: ['Person', 'Company'] },
  'SupplierRequest.supplierCompanyId': { as: 'LINK', to: ['Company'] },
  // A request opened from a match (2026-09-30): the firm it is about, the
  // prime or MSP it would work under, and the job request it came from.
  'SupplierRequest.firmCompanyId': { as: 'LINK', to: ['Company'] },
  'SupplierRequest.underCompanyId': { as: 'LINK', to: ['Company'] },
  'SupplierRequest.requirementId': { as: 'LINK', to: ['Requirement'] },
  'ContractorInvitation.supplierCompanyId': { as: 'LINK', to: ['Company'] },
  'ContractorInvitation.personId': { as: 'LINK', to: ['Person'] },
  'Requirement.clearedSupplierIds': { as: 'LINK', to: ['Company'] },
  'Context.teamPersonIds': { as: 'LINK', to: ['Person'] },
  'SourcedContact.graduatedPersonId': { as: 'LINK', to: ['Person'] },

  // ── Record: history, kept as written ──
  // Records of their own (KEPT), whatever they mention.
  'Incident.personId': { as: 'RECORD' },
  // The match a supplier request started from. Matches are recomputed;
  // the request keeps which one it was as history.
  'SupplierRequest.matchId': { as: 'RECORD' },
  'Incident.companyId': { as: 'RECORD' },
  'MarketingLead.convertedCompanyId': { as: 'RECORD' },
  'Notification.companyId': { as: 'RECORD' },
  'Notification.entityId': { as: 'RECORD' },
  // Who did it — on a row already owned through a foreign key.
  'Context.grantedById': { as: 'RECORD' },
  'Context.suspendedById': { as: 'RECORD' },
  'Context.revokedById': { as: 'RECORD' },
  'Context.invitedById': { as: 'RECORD' },
  // Who last answered the company's week questions (lib/days-off). A record of a person, never followed.
  'Company.weekSettingsSetById': { as: 'RECORD' },
  'Interview.requestedById': { as: 'RECORD' },
  'Interview.noShowBy': { as: 'RECORD' },
  'Interview.decidedById': { as: 'RECORD' },
  'OrderMilestone.acceptedById': { as: 'RECORD' },
  'OrderMilestone.deliveredById': { as: 'RECORD' },
  'IdentityMatch.decidedById': { as: 'RECORD' },
  'WorkAssertion.byId': { as: 'RECORD' },
  'SupplierInvite.acceptedById': { as: 'RECORD' },
  'ApprovalRuleVersion.approverIds': { as: 'RECORD' },
  'ApprovalRuleVersion.orgUnitId': { as: 'RECORD' },
  'Submission.overriddenById': { as: 'RECORD' },
  'Submission.forwardedById': { as: 'RECORD' },
  'Resume.uploadedById': { as: 'RECORD' },
  'Lead.postedBy': { as: 'RECORD' },
  'Lead.confirmedById': { as: 'RECORD' },
  'Representation.endedBy': { as: 'RECORD' },
  'SellContract.startConfirmedById': { as: 'RECORD' },
  'Timesheet.clientApprovedById': { as: 'RECORD' },
  'Timesheet.employerAcceptedById': { as: 'RECORD' },
  'Timesheet.approvedById': { as: 'RECORD' },
  'Expense.approvedById': { as: 'RECORD' },
  'RateHistory.changedById': { as: 'RECORD' },
  'RateHistory.approvedById': { as: 'RECORD' },
  'Blacklist.blockedById': { as: 'RECORD' },
  'Blacklist.liftedById': { as: 'RECORD' },
  'SupplierRequest.recommendedById': { as: 'RECORD' },
  'SupplierRequest.decidedById': { as: 'RECORD' },
  'ContractorInvitation.invitedById': { as: 'RECORD' },
  'ContractorInvitation.supplierRequestId': { as: 'RECORD' },
  'Favorite.byId': { as: 'RECORD' },
  'Message.authorId': { as: 'RECORD' },
  'RolloffEvent.claimedById': { as: 'RECORD' },
  // An integrator's own people moving between its projects (2026-09-30,
  // lib/internal-moves): who released, who confirmed, who held, what the
  // hold was for and what placing wrote. History, kept as written.
  'ProjectRelease.releasedById': { as: 'RECORD' },
  'ProjectRelease.confirmedById': { as: 'RECORD' },
  'ProjectHold.heldById': { as: 'RECORD' },
  'ProjectHold.forRequirementId': { as: 'RECORD' },
  'ProjectHold.forWorkOrderId': { as: 'RECORD' },
  'ProjectHold.forSellContractId': { as: 'RECORD' },
  'ProjectHold.endedById': { as: 'RECORD' },
  'ProjectHold.placedSellContractId': { as: 'RECORD' },
  'ProjectHold.placedSubmissionId': { as: 'RECORD' },
  'Verification.uploadedById': { as: 'RECORD' },
  'Verification.verifiedById': { as: 'RECORD' },
  'DocumentType.createdById': { as: 'RECORD' },
  'DocumentEdition.recordedById': { as: 'RECORD' },
  'DocumentBacking.recordedById': { as: 'RECORD' },
  'GovernanceEvaluation.overriddenBy': { as: 'RECORD' },
  'DocumentShare.revokedById': { as: 'RECORD' },
  'DocInstance.signedById': { as: 'RECORD' },
  'DocInstance.countersignedById': { as: 'RECORD' },
  'DocFile.uploadedById': { as: 'RECORD' },
  'ServiceAccount.revokedById': { as: 'RECORD' },
  'CompanyDomain.addedById': { as: 'RECORD' },
  'SubdomainAlias.releasedById': { as: 'RECORD' },
  'Check.checkedById': { as: 'RECORD' },
  'CensusRequest.agreementAcceptedBy': { as: 'RECORD' },
  // Which thing the row is about, on a row owned through a foreign key.
  'Expense.invoiceId': { as: 'RECORD' },
  'DunningSend.invoiceIds': { as: 'RECORD' },
  'JournalEntry.sourceId': { as: 'RECORD' },
  'OrderPosting.sourceId': { as: 'RECORD' },
  'Conversation.topicId': { as: 'RECORD' },
  'Conversation.parentId': { as: 'RECORD' },
  'Verification.referenceId': { as: 'RECORD' },
  'GovernanceEvaluation.subjectId': { as: 'RECORD' },
  'DocumentShareItem.refId': { as: 'RECORD' },
  'DocumentShareAccess.itemId': { as: 'RECORD' },
  'DocInstance.subjectId': { as: 'RECORD' },
  'DocInstance.envelopeId': { as: 'RECORD' },
  'ImportRow.createdId': { as: 'RECORD' },
  'Event.subjectId': { as: 'RECORD' },
  'PacketItem.verificationId': { as: 'RECORD' },
  'AgentRun.recordId': { as: 'RECORD' },
  'Check.recordId': { as: 'RECORD' },
  'TextMessage.aboutId': { as: 'RECORD' },
  'CensusRead.fileId': { as: 'RECORD' },
  // Not ids of ours at all: a provider's, a tax authority's, or a word.
  'Credential.providerId': { as: 'RECORD' },
  'Company.taxId': { as: 'RECORD' },
  'RemitTo.taxId': { as: 'RECORD' },
  'Company.siteWrittenBy': { as: 'RECORD' },
  'ConsultantProfile.bioWrittenBy': { as: 'RECORD' },
  'DocumentType.signedBy': { as: 'RECORD' },
  'DocumentType.suppliedBy': { as: 'RECORD' },
}

// ── The graph, read off the schema ─────────────────────────────────────

interface Edge {
  /** The model holding the column. */
  from: string
  column: string
  /** The model the column names. */
  to: string
  /** A foreign key, or an OWNED loose column. */
  fk: boolean
  list: boolean
}

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number]
const MODELS: readonly DmmfModel[] = Prisma.dmmf.datamodel.models
const byName = new Map(MODELS.map((m) => [m.name, m]))
const table = (model: string) => byName.get(model)?.dbName ?? model
const columnOf = (model: string, field: string) =>
  byName.get(model)?.fields.find((f) => f.name === field)?.dbName ?? field

/** Every foreign key in the schema, and every OWNED loose column. */
export function edges(): Edge[] {
  const out: Edge[] = []
  for (const m of MODELS) {
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationFromFields?.length) continue
      // Every relation in this schema is on one column.
      out.push({ from: m.name, column: columnOf(m.name, f.relationFromFields[0]), to: f.type, fk: true, list: false })
    }
  }
  for (const [key, spec] of Object.entries(LOOSE)) {
    if (spec.as !== 'OWNED') continue
    const [from, field] = key.split('.')
    for (const to of spec.to ?? []) out.push({ from, column: columnOf(from, field), to, fk: false, list: false })
  }
  return out
}

/** The loose columns a surviving row may not use to name a demo row. */
function linkColumns(): { from: string; column: string; to: string[]; list: boolean }[] {
  return Object.entries(LOOSE)
    .filter(([, s]) => s.as === 'LINK')
    .map(([key, s]) => {
      const [from, field] = key.split('.')
      const f = byName.get(from)?.fields.find((x) => x.name === field)
      return { from, column: columnOf(from, field), to: s.to ?? [], list: !!f?.isList }
    })
}

// ── Reading ────────────────────────────────────────────────────────────

type Db = Pick<typeof prisma, '$queryRawUnsafe' | '$executeRawUnsafe'>
type Row = Record<string, string | null>

const q = (s: string) => `"${s.replace(/"/g, '""')}"`
const CHUNK = 5_000

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK))
  return out
}

/** The columns of a model this file reads: its id and everything it points with. */
function pointerColumns(model: string, all: Edge[]): string[] {
  return [...new Set(all.filter((e) => e.from === model).map((e) => e.column))]
}

/** Rows of `model` whose `column` is one of `ids`, with their pointers. */
async function rowsPointingAt(db: Db, model: string, column: string, ids: string[], all: Edge[]): Promise<Row[]> {
  const cols = ['id', ...pointerColumns(model, all)].map(q).join(', ')
  const out: Row[] = []
  for (const part of chunks(ids)) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT ${cols} FROM ${q(table(model))} WHERE ${q(column)} = ANY($1::text[])`,
      part
    )) as Row[]
    out.push(...rows)
  }
  return out
}

async function rowsById(db: Db, model: string, ids: string[], all: Edge[]): Promise<Row[]> {
  return rowsPointingAt(db, model, 'id', ids, all)
}

/** The doomed rows, per model, with the pointers each one holds. */
type Store = Map<string, Map<string, Row>>

function has(store: Store, model: string, id: string | null | undefined): boolean {
  return !!id && !!store.get(model)?.has(id)
}
function put(store: Store, model: string, row: Row): boolean {
  let m = store.get(model)
  if (!m) store.set(model, (m = new Map()))
  if (m.has(row.id as string)) return false
  m.set(row.id as string, row)
  return true
}

/**
 * Everything that points at the seed, to the end — and the parents it
 * leaves with nobody else.
 */
async function closure(db: Db, store: Store, seed: Map<string, Row[]>, all: Edge[]): Promise<Store> {
  let fresh = new Map<string, string[]>()
  for (const [model, rows] of seed) {
    fresh.set(model, rows.filter((row) => put(store, model, row)).map((row) => row.id as string))
  }
  const kept = new Set<string>(KEPT)

  for (;;) {
    while (fresh.size) {
      const next = new Map<string, string[]>()
      for (const [target, ids] of fresh) {
        if (!ids.length) continue
        for (const e of all) {
          if (e.to !== target || kept.has(e.from) || e.from === 'Person') continue
          for (const row of await rowsPointingAt(db, e.from, e.column, ids, all)) {
            if (put(store, e.from, row)) {
              const list = next.get(e.from) ?? []
              list.push(row.id as string)
              next.set(e.from, list)
            }
          }
        }
      }
      fresh = next
    }

    // Parents with no owner, once the world was all that used them.
    for (const model of ORPHANED_WITH_THE_WORLD) {
      const named = new Set<string>()
      for (const e of all) {
        if (e.to !== model || !e.fk) continue
        for (const row of store.get(e.from)?.values() ?? []) {
          const v = row[e.column]
          if (v && !has(store, model, v)) named.add(v)
        }
      }
      if (!named.size) continue
      const candidates = [...named]
      // Anything surviving that still points at one keeps it.
      const held = new Set<string>()
      for (const e of all) {
        if (e.to !== model || !e.fk) continue
        for (const row of await rowsPointingAt(db, e.from, e.column, candidates, all)) {
          if (!has(store, e.from, row.id as string)) held.add(row[e.column] as string)
        }
      }
      const outgoing = all.filter((e) => e.from === model && e.fk)
      for (const row of await rowsById(db, model, candidates.filter((id) => !held.has(id)), all)) {
        const allGoing = outgoing.every((e) => !row[e.column] || has(store, e.to, row[e.column]))
        if (allGoing && put(store, model, row)) {
          fresh.set(model, [...(fresh.get(model) ?? []), row.id as string])
        }
      }
    }
    if (!fresh.size) return store
  }
}

// ── The threads to the real world ──────────────────────────────────────

export interface Thread {
  /** The row that holds the pointer. */
  model: string
  id: string
  column: string
  /** What it names. */
  to: string
  value: string
  /** True when the row holding it is a demo row pointing out; false when a real row points in. */
  outward: boolean
}

/** A demo row pointing at something that is staying. */
function outwardThreads(store: Store, all: Edge[]): Thread[] {
  const kept = new Set<string>(KEPT)
  const out: Thread[] = []
  for (const e of all) {
    if (!e.fk || kept.has(e.to)) continue
    for (const row of store.get(e.from)?.values() ?? []) {
      const v = row[e.column]
      if (v && !has(store, e.to, v)) {
        out.push({ model: e.from, id: row.id as string, column: e.column, to: e.to, value: v, outward: true })
      }
    }
  }
  return out
}

/** A surviving row naming a demo one in a loose column. */
async function inwardThreads(db: Db, store: Store): Promise<Thread[]> {
  const out: Thread[] = []
  for (const l of linkColumns()) {
    const doomedHere = [...(store.get(l.from)?.keys() ?? [])]
    for (const to of l.to) {
      const named = [...(store.get(to)?.keys() ?? [])]
      if (!named.length) continue
      for (const part of chunks(named)) {
        const test = l.list ? `${q(l.column)} && $1::text[]` : `${q(l.column)} = ANY($1::text[])`
        const rows = (await db.$queryRawUnsafe(
          `SELECT "id", ${q(l.column)} AS v FROM ${q(table(l.from))} WHERE ${test} AND NOT ("id" = ANY($2::text[]))`,
          part,
          doomedHere
        )) as { id: string; v: string | string[] }[]
        const hit = new Set(part)
        for (const r of rows) {
          for (const v of Array.isArray(r.v) ? r.v : [r.v]) {
            if (hit.has(v)) out.push({ model: l.from, id: r.id, column: l.column, to, value: v, outward: false })
          }
        }
      }
    }
  }
  return out
}

// ── The plan ───────────────────────────────────────────────────────────

export interface RebuildPlan {
  /** The companies at the root, by name. */
  companies: { id: string; slug: string; name: string }[]
  /** How many people at reserved addresses go with them. */
  people: number
  /** Reserved-address people something real still holds, and so kept. */
  spared: { email: string; because: string }[]
  /** Rows per model, in delete order. */
  rows: Record<string, number>
  total: number
  /** Threads to the real world. Any at all and nothing is deleted. */
  threads: Thread[]
  /** The same threads, as sentences. */
  says: string[]
  /** @internal the ids, per model, for the delete. */
  store: Store
  /** @internal the reserved-address people kept, by id. */
  sparedIds: string[]
}

/** The companies at the root: the seed's roster, and demos by their seats. */
async function rootCompanies(db: Db): Promise<Row[]> {
  const facts = (await db.$queryRawUnsafe(
    `SELECT c."id", c."slug", c."name", c."listedById", c."domain", c."domainVerified",
            count(x."id")::int AS seats,
            count(x."id") FILTER (WHERE NOT (lower(p."primaryEmail") LIKE ANY($1::text[])))::int AS "realSeats"
       FROM "Company" c
       LEFT JOIN "Context" x ON x."companyId" = c."id"
       LEFT JOIN "Person" p ON p."id" = x."personId"
      WHERE c."isDemo" = false
      GROUP BY c."id"`,
    RESERVED_SUFFIXES.map((s) => `%${s}`)
  )) as (Row & { domainVerified: boolean; seats: number; realSeats: number })[]
  const roster = new Set(WORLD_SLUGS)
  return facts.filter(
    (c) =>
      roster.has(c.slug as string) ||
      isDemoCompany({
        isDemo: false,
        domain: c.domain,
        domainVerified: c.domainVerified,
        seats: c.seats,
        realSeats: c.realSeats,
      })
  )
}

async function reservedPeople(db: Db): Promise<Row[]> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT "id", "primaryEmail" FROM "Person" WHERE lower("primaryEmail") LIKE ANY($1::text[])`,
    RESERVED_SUFFIXES.map((s) => `%${s}`)
  )) as Row[]
  return rows.filter((r) => reservedAddress(r.primaryEmail as string))
}

/**
 * Which demo people a surviving row holds.
 *
 * Each row reached only through people carries the set of people it was
 * reached from. A row in that set pointing at something that stays means
 * those people belong to something real — a visitor's sandbox, a real
 * firm's shortlist — and they are spared, not deleted.
 */
function rootsOf(store: Store, base: Store, people: Set<string>, all: Edge[]): Map<string, Set<string>> {
  const roots = new Map<string, Set<string>>()
  const key = (m: string, id: string) => `${m}:${id}`
  let moved = true
  while (moved) {
    moved = false
    for (const [model, rows] of store) {
      if (model === 'Person') continue
      for (const [id, row] of rows) {
        if (has(base, model, id)) continue
        const k = key(model, id)
        const mine = roots.get(k) ?? new Set<string>()
        const before = mine.size
        for (const e of all) {
          if (e.from !== model) continue
          const v = row[e.column]
          if (!v) continue
          if (e.to === 'Person' && people.has(v)) mine.add(v)
          for (const r of roots.get(key(e.to, v)) ?? []) mine.add(r)
        }
        if (mine.size !== before || !roots.has(k)) {
          roots.set(k, mine)
          if (mine.size !== before) moved = true
        }
      }
    }
  }
  return roots
}

export async function planDemoRebuild(db: Db = prisma): Promise<RebuildPlan> {
  const all = edges()
  const companies = await rootCompanies(db)

  // The companies first, alone: what they reach is the world's however
  // the people turn out.
  const base = await closure(
    db,
    new Map(),
    new Map([['Company', companies.map((c) => ({ id: c.id, listedById: c.listedById }) as Row)]]),
    all
  )

  // Then the people, sparing anybody something real still holds.
  const candidates = await reservedPeople(db)
  const emailOf = new Map(candidates.map((p) => [p.id as string, p.primaryEmail as string]))
  const people = new Set(candidates.map((p) => p.id as string))
  const spared = new Map<string, string>()
  let store: Store = base
  for (let round = 0; round < 50; round++) {
    const copy: Store = new Map([...base].map(([m, rows]) => [m, new Map(rows)]))
    store = await closure(db, copy, new Map([['Person', [...people].map((id) => ({ id }) as Row)]]), all)
    const roots = rootsOf(store, base, people, all)
    let sparedAny = false
    for (const t of outwardThreads(store, all)) {
      for (const p of roots.get(`${t.model}:${t.id}`) ?? []) {
        if (people.delete(p)) {
          spared.set(p, `${t.model} ${t.id} points at ${t.to} ${t.value}`)
          sparedAny = true
        }
      }
    }
    if (!sparedAny) break
  }

  const threads = [...outwardThreads(store, all), ...(await inwardThreads(db, store))]
  const rows: Record<string, number> = {}
  let total = 0
  for (const model of DELETE_ORDER) {
    const n = store.get(model)?.size ?? 0
    if (n) {
      rows[model] = n
      total += n
    }
  }
  return {
    companies: companies.map((c) => ({ id: c.id as string, slug: c.slug as string, name: c.name as string })),
    people: store.get('Person')?.size ?? 0,
    spared: [...spared].map(([id, because]) => ({ email: emailOf.get(id) ?? id, because })),
    rows,
    total,
    threads,
    says: await describe(db, threads, spared, emailOf),
    store,
    sparedIds: [...spared.keys()],
  }
}

/** Threads as sentences, one per kind of tie, most specific name first. */
async function describe(
  db: Db,
  threads: Thread[],
  spared: Map<string, string>,
  emailOf: Map<string, string>
): Promise<string[]> {
  if (!threads.length) return []
  const name = async (model: string, id: string): Promise<string> => {
    if (model === 'Company') {
      const r = (await db.$queryRawUnsafe(`SELECT "name", "slug" FROM "Company" WHERE "id" = $1`, id)) as Row[]
      return r[0] ? `${r[0].name} (${r[0].slug})` : `company ${id}`
    }
    if (model === 'Person') {
      const r = (await db.$queryRawUnsafe(`SELECT "primaryEmail" FROM "Person" WHERE "id" = $1`, id)) as Row[]
      // Masked: this sentence goes back to whoever holds the secret, and a
      // real person's address is not theirs to read (lib/seed-owners).
      const email = maskEmail(r[0]?.primaryEmail ?? emailOf.get(id) ?? id)
      return spared.has(id) ? `${email} (a made-up address a record outside the demo world still holds)` : email
    }
    return `${model} ${id}`
  }
  const grouped = new Map<string, number>()
  for (const t of threads) {
    const line = t.outward
      ? `a demo ${t.model} points at ${await name(t.to, t.value)} through ${t.column}`
      : `${await name(t.model, t.id)} names ${await name(t.to, t.value)}, which is demo, in ${t.column}`
    grouped.set(line, (grouped.get(line) ?? 0) + 1)
  }
  return [...grouped].map(([line, n]) => (n > 1 ? `${line} (${n} rows)` : line))
}

// ── Doing it ───────────────────────────────────────────────────────────

export type DeleteOutcome =
  | { ok: true; deleted: Record<string, number>; total: number; companies: number; people: number; spared: number; ms: number }
  | { ok: false; says: string; threads: string[] }

/**
 * Delete the demo world, in one transaction, or nothing at all.
 *
 * Refuses in a sentence when anything real is tied to it. Writes an
 * AutomationLog row in the same transaction, so the record exists exactly
 * when the rows are gone.
 */
export async function deleteDemoWorld(opts: { by?: string } = {}): Promise<DeleteOutcome> {
  const started = Date.now()
  return prisma.$transaction(
    async (tx) => {
      // Planned inside the transaction, so what is counted is what goes.
      const plan = await planDemoRebuild(tx)
      if (plan.threads.length) {
        return {
          ok: false as const,
          says:
            `Nothing was deleted. The demo world is tied to real data in ${plan.says.length} ` +
            `${plan.says.length === 1 ? 'place' : 'places'}, and deleting it would delete a real row. ` +
            `End or remove ${plan.says.length === 1 ? 'that link' : 'those links'} first: ` +
            plan.says.slice(0, 10).join('; ') +
            (plan.says.length > 10 ? `; and ${plan.says.length - 10} more.` : '.') +
            ' Send {"dryRun":true} to see whose records these are and what releasing them would change.',
          threads: plan.says,
        }
      }
      const deleted: Record<string, number> = {}
      for (const model of DELETE_ORDER) {
        const ids = [...(plan.store.get(model)?.keys() ?? [])]
        if (!ids.length) continue
        let n = 0
        for (const part of chunks(ids)) {
          n += await tx.$executeRawUnsafe(`DELETE FROM ${q(table(model))} WHERE "id" = ANY($1::text[])`, part)
        }
        deleted[model] = n
      }
      const total = Object.values(deleted).reduce((a, b) => a + b, 0)
      // The markers the old world's seeding left, one per finished step
      // (lib/seed-steps). They describe a world that is now gone; left
      // behind they would match nothing, and a count of them is kept on
      // the row below.
      const stepMarkers = (
        await tx.automationLog.deleteMany({ where: { companyId: null, action: 'DEMO_SEED_STEP' } })
      ).count
      await tx.automationLog.create({
        data: {
          companyId: null,
          action: 'DEMO_WORLD_REBUILT',
          summary:
            `Deleted the demo world — ${plan.companies.length} companies, ${plan.people} people at ` +
            `reserved addresses, ${total} rows in all — so it could be seeded again with today's dates.`,
          reason:
            'Somebody holding the deployment secret asked for the demo world to be rebuilt and typed the ' +
            'confirmation phrase. Only companies on the seed roster or seated entirely at reserved addresses, ' +
            'and the rows that point at them, were deleted; nothing tied to a real company or person was.',
          payload: {
            by: opts.by ?? 'CRON_SECRET',
            companies: plan.companies.map((c) => c.slug),
            people: plan.people,
            spared: plan.spared.map((s) => s.email),
            rows: deleted,
            total,
            stepMarkers,
          },
          reversible: false,
        },
      })
      return {
        ok: true as const,
        deleted,
        total,
        companies: plan.companies.length,
        people: plan.people,
        spared: plan.spared.length,
        ms: Date.now() - started,
      }
    },
    { timeout: 55_000, maxWait: 10_000 }
  )
}

// ── Whose records, and letting go of them ─────────────────────────────
//
// Production refused a rebuild on 2026-09-30 with fourteen threads, most
// of them "a demo Context points at world-computer-systems@demo.etyme.local
// (a demo address something real still holds)". What that means, plainly:
//
//   A made-up person — a demo desk, or a `verify.*@seed.etyme.invalid`
//   address somebody made by hand while checking a deploy — is also named
//   by a row outside the demo world: a seat at a real company or a
//   visitor's sandbox, a contact card, a posting it created. Deleting the
//   person would delete that row, so the plan keeps the person ("spared").
//   But the demo world's own rows still point at the kept person, and the
//   rule counts a demo row pointing at something that stays as a thread.
//
// So two questions, and this section answers both before anything moves:
// whose row holds each kept person (and each other thread), and what the
// smallest change is that lets go of it without deleting it.
//
//   REPOINT  a row outside the world names the made-up person directly.
//            It is moved to a stand-in made-up person of the same name at
//            `released.<id>@released.etyme.invalid`, so the row keeps its
//            meaning, nothing is deleted, and the demo desk stops being
//            seated anywhere real. The only row this writes is the stand-in.
//   NULL     the row names something of the world's through a column that
//            may be empty.
//   REMOVE   the row lists a demo id among others; that one id comes out.
//
// A tie any other change would need — a required column, a star on a demo
// person, a real person's seat at a demo company — is named and left.
// And a kept person is let go of whole or not at all: releasing two of
// its three holds would change rows and still not unblock the rebuild.

/** What the caller has to type to let go of the ties. */
export const RELEASE_PHRASE = 'release the demo world from real records'

/** Where a stand-in lives. Reserved, so it can name nobody. */
export const STAND_IN_DOMAIN = 'released.etyme.invalid'

export type ReleaseOp = 'REPOINT' | 'NULL' | 'REMOVE' | 'DELETE'

/**
 * The one standing whose rows the release may delete: a visitor's own
 * demo sandbox. Decided by the founder, 2026-09-30 ("Demo housekeeping"):
 * a tie only deleting a row would release is deleted where the row is a
 * visitor's sandbox's own, and left, named, for everybody else — a
 * customer, a census, a person — whatever it costs the rebuild.
 */
export const DELETABLE_STANDING = 'VISITOR_SANDBOX'
export const WILL_DELETE = 'Will delete (visitor sandbox)'

export interface ReleaseChange {
  op: ReleaseOp
  table: string
  column: string
  /** The rows it changes. */
  ids: string[]
  /** The value each row holds now, and the only value it is changed from. */
  from: string
  /** One sentence. */
  says: string
}

export interface Tie {
  /** The table of the row that is not only the demo world's. */
  table: string
  column: string
  rows: number
  /** Whose row it is, in words, masked. */
  owner: string
  ownerStanding: string
  /** The demo person or company it is tied to. */
  demo: string
  /** Why it is tied, in a sentence. */
  why: string
  releasable: boolean
  /** What releasing it would change, or why it cannot. */
  release: string
  /** Something true today that matters more than the rebuild. */
  warning?: string
}

export interface TiePlan {
  ties: Tie[]
  changes: ReleaseChange[]
  /** Stand-ins the release would write, one per made-up person let go. */
  standIns: { for: string; name: string; email: string }[]
  /** Ties nothing here will release, as sentences. */
  cannot: string[]
  /** True when, once the changes are made, nothing ties the world. */
  clearsTheWay: boolean
  says: string
}

const cloneStore = (s: Store): Store => new Map([...s].map(([m, rows]) => [m, new Map(rows)]))

/** Whether a column may be empty. */
function mayBeEmpty(model: string, column: string): boolean {
  const f = byName.get(model)?.fields.find((x) => x.kind === 'scalar' && (x.dbName ?? x.name) === column)
  return !!f && !f.isRequired
}
function isListColumn(model: string, column: string): boolean {
  return !!byName.get(model)?.fields.find((x) => (x.dbName ?? x.name) === column)?.isList
}

/** What a row does, in the trade's words, for the tie sentences. */
const VERB: Record<string, string> = {
  Context: 'gave a seat to',
  CompanyContact: 'keeps as a contact',
  Favorite: 'starred',
  Blacklist: 'blocked',
  Enrollment: 'enrolled in a course',
  DoNotSubmit: 'marked do-not-submit',
  OrderPosting: 'has postings made by',
  AgreementSignature: 'has an agreement signature attested by',
  CustomerCreditLimit: 'has a credit limit set by',
}
const verbFor = (model: string, column: string) => VERB[model] ?? `has a ${model} row naming, in ${column},`

/**
 * Every tie between the demo world and a record outside it: whose, why,
 * and what letting go would change. Reads only.
 */
export async function planTies(db: Db, plan: RebuildPlan): Promise<TiePlan> {
  const all = edges()
  const final = plan.store
  const kept = new Set<string>(KEPT)
  const worldCompanies = new Set(plan.companies.map((c) => c.id))

  // What each kept person reaches, and which kept person reaches what.
  const sparedSet = new Set(plan.sparedIds)
  const reach = plan.sparedIds.length
    ? await closure(db, cloneStore(final), new Map([['Person', plan.sparedIds.map((id) => ({ id }) as Row)]]), all)
    : cloneStore(final)
  const roots = rootsOf(reach, final, sparedSet, all)
  const peopleAt = (model: string, id: string): Set<string> =>
    model === 'Person' && sparedSet.has(id) ? new Set([id]) : roots.get(`${model}:${id}`) ?? new Set()

  // ── Owners, in words ──
  const ownerCache = new Map<string, { kind: 'Company' | 'Person'; id: string } | null>()
  const owner = async (model: string, id: string) => {
    const k = `${model}:${id}`
    if (!ownerCache.has(k)) ownerCache.set(k, await ownerOf(db, model, id))
    return ownerCache.get(k)!
  }

  const threads = plan.threads
  const tied = new Set<string>()
  const toKept: Thread[] = []
  const otherOut: Thread[] = []
  const inward: Thread[] = []
  for (const t of threads) {
    if (!t.outward) inward.push(t)
    else {
      const who = peopleAt(t.to, t.value)
      if (who.size) {
        who.forEach((p) => tied.add(p))
        toKept.push(t)
      } else otherOut.push(t)
    }
  }

  // ── What holds each tied kept person ──
  interface Hold { person: string; model: string; id: string; columns: { column: string; to: string; value: string }[]; staying: { to: string; value: string } }
  const holds: Hold[] = []
  for (const e of all) {
    if (!e.fk || kept.has(e.to)) continue
    for (const [id, row] of reach.get(e.from) ?? []) {
      if (has(final, e.from, id)) continue
      const v = row[e.column]
      if (!v || has(reach, e.to, v)) continue
      for (const p of roots.get(`${e.from}:${id}`) ?? []) {
        if (!tied.has(p)) continue
        if (holds.some((h) => h.person === p && h.model === e.from && h.id === id)) continue
        const columns: Hold['columns'] = []
        for (const x of all) {
          if (x.from !== e.from) continue
          const w = row[x.column]
          if (!w || !has(reach, x.to, w) || has(final, x.to, w)) continue
          if (peopleAt(x.to, w).has(p)) columns.push({ column: x.column, to: x.to, value: w })
        }
        holds.push({ person: p, model: e.from, id, columns, staying: { to: e.to, value: v } })
      }
    }
  }

  // ── Words for everybody named ──
  const companyIds = new Set<string>()
  const personIds = new Set<string>(tied)
  const note = (o: { kind: 'Company' | 'Person'; id: string } | null) => {
    if (o?.kind === 'Company') companyIds.add(o.id)
    else if (o) personIds.add(o.id)
  }
  for (const h of holds) note(await owner(h.staying.to, h.staying.value))
  for (const t of otherOut) {
    note(await owner(t.to, t.value))
    note(await owner(t.model, t.id))
  }
  for (const t of inward) {
    note(await owner(t.model, t.id))
    note(await owner(t.to, t.value))
  }
  const words = new Map<string, OwnerWords>([
    ...(await describeCompanies(db, [...companyIds], worldCompanies)),
    ...(await describePeople(db, [...personIds], worldCompanies)),
  ])
  const wordsOf = (o: { id: string } | null): OwnerWords | undefined => (o ? words.get(o.id) : undefined)
  const unknown = { name: 'an owner that could not be traced', standing: 'UNKNOWN', says: 'an owner that could not be traced' }

  // ── Ties and changes, grouped ──
  const ties = new Map<string, Tie>()
  const addTie = (t: Omit<Tie, 'rows'>) => {
    const k = [t.table, t.column, t.owner, t.demo, t.release].join('|')
    const had = ties.get(k)
    if (had) had.rows++
    else ties.set(k, { ...t, rows: 1 })
  }
  const changes = new Map<string, ReleaseChange>()
  const addChange = (op: ReleaseOp, table: string, column: string, id: string, from: string, says: string) => {
    const k = [op, table, column, from].join('|')
    const had = changes.get(k)
    if (had) {
      if (!had.ids.includes(id)) had.ids.push(id)
    } else changes.set(k, { op, table, column, ids: [id], from, says })
  }
  const cannot = new Set<string>()
  const standIns: TiePlan['standIns'] = []

  // 1. Made-up people something outside the world holds.
  const personRows = tied.size
    ? ((await db.$queryRawUnsafe(`SELECT "id", "name", "primaryEmail" FROM "Person" WHERE "id" = ANY($1::text[])`, [...tied])) as Row[])
    : []
  const personRow = new Map(personRows.map((r) => [r.id as string, r]))
  const liveSeats = new Set<string>()
  const seatIds = holds.filter((h) => h.model === 'Context').map((h) => h.id)
  if (seatIds.length) {
    for (const r of (await db.$queryRawUnsafe(
      `SELECT "id" FROM "Context" WHERE "id" = ANY($1::text[]) AND "revokedAt" IS NULL`,
      seatIds
    )) as Row[]) liveSeats.add(r.id as string)
  }
  for (const p of tied) {
    const pr = personRow.get(p)
    const demoName = `${pr?.name ?? 'a demo person'} (${maskEmail(pr?.primaryEmail as string)})`
    const mine = holds.filter((h) => h.person === p)
    const pointing = new Map<string, number>()
    for (const t of toKept) {
      if (!peopleAt(t.to, t.value).has(p)) continue
      const k = `${t.model}.${t.column}`
      pointing.set(k, (pointing.get(k) ?? 0) + 1)
    }
    const demoSide = [...pointing].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join(', ')
    if (!mine.length) {
      cannot.add(
        `${demoName} is kept because it is tied to another kept demo person, not to a record of its own; ` +
          'releasing that person releases this one.'
      )
      continue
    }
    const decided: { h: Hold; c: Hold['columns'][number]; op: ReleaseOp | null }[] = []
    for (const h of mine) {
      const sandbox = (wordsOf(await owner(h.staying.to, h.staying.value)) ?? unknown).standing === DELETABLE_STANDING
      for (const c of h.columns) {
        const op: ReleaseOp | null =
          c.to === 'Person' && c.value === p ? 'REPOINT' : mayBeEmpty(h.model, c.column) ? 'NULL' : sandbox ? 'DELETE' : null
        decided.push({ h, c, op })
      }
    }
    const whole = decided.length > 0 && decided.every((d) => d.op)
    const standIn = { for: (pr?.primaryEmail as string) ?? p, name: (pr?.name as string) ?? 'Released demo person', email: `released.${p}@${STAND_IN_DOMAIN}` }
    if (whole && decided.some((d) => d.op === 'REPOINT')) standIns.push(standIn)
    for (const d of decided) {
      const who = wordsOf(await owner(d.h.staying.to, d.h.staying.value)) ?? unknown
      // A visitor's sandbox row goes whether or not the rest lets go: it
      // is theirs to lose and the founder said so, and leaving it because
      // somebody else's row stays would keep a row nobody wants.
      const goes = whole || d.op === 'DELETE'
      const release = !goes
        ? d.op
          ? `Left as it is: another row holding ${demoName} cannot be let go of without deleting it, so changing this one would not free the rebuild.`
          : `Cannot be released without deleting the ${d.h.model} row: ${d.c.column} must name something, and what it names goes with the demo world.`
        : d.op === 'DELETE'
          ? `${WILL_DELETE}: the ${d.h.model} row, which only deleting releases and which belongs to a visitor\u2019s own demo sandbox.`
          : d.op === 'REPOINT'
            ? `Move ${d.h.model}.${d.c.column} to a stand-in made-up person of the same name, ${standIn.email}. Nothing is deleted.`
            : `Empty ${d.h.model}.${d.c.column}. Nothing is deleted.`
      const warning =
        d.h.model === 'Context' && liveSeats.has(d.h.id) && who.standing !== 'DEMO'
          ? `Today, anybody the demo signs in as ${demoName} can choose a seat at ${who.name}.`
          : undefined
      addTie({
        table: d.h.model,
        column: d.c.column,
        owner: who.says,
        ownerStanding: who.standing,
        demo: demoName,
        why:
          `${who.name} ${verbFor(d.h.model, d.c.column)} the made-up person ${demoName}. ` +
          `Deleting that person would delete this row, so the rebuild keeps the person; ` +
          `and the demo world's own rows still point at it (${demoSide || 'none'}), so the rebuild stops.`,
        releasable: goes,
        release,
        ...(warning ? { warning } : {}),
      })
      if (!goes) {
        if (!d.op) cannot.add(`${who.name} ${verbFor(d.h.model, d.c.column)} ${demoName} (${d.h.model}.${d.c.column}); it must name something, so only deleting it lets go.`)
        continue
      }
      addChange(
        d.op!,
        d.h.model,
        d.op === 'DELETE' ? 'id' : d.c.column,
        d.h.id,
        d.op === 'DELETE' ? d.h.id : d.c.value,
        d.op === 'DELETE'
          ? `${d.h.model} deleted: a visitor\u2019s sandbox row naming ${demoName}`
          : d.op === 'REPOINT'
            ? `${d.h.model}.${d.c.column}: ${demoName} → the stand-in ${standIn.email}`
            : `${d.h.model}.${d.c.column}: emptied where it named ${demoName}'s ${d.c.to}`
      )
    }
  }

  // 2. A demo row naming something outside the world.
  for (const t of otherOut) {
    const who = wordsOf(await owner(t.to, t.value)) ?? unknown
    const empty = mayBeEmpty(t.model, t.column)
    const demoOwner = wordsOf(await owner(t.model, t.id))
    const demo = demoOwner && demoOwner.id !== (await owner(t.to, t.value))?.id ? demoOwner.name : `a demo ${t.model}`
    const why =
      t.model === 'Context' && t.to === 'Person'
        ? `${who.name} holds a seat at the demo company ${demo}; deleting the world would delete that seat.`
        : `A demo ${t.model} names ${who.name} in ${t.column}; deleting it with the world would delete a row that is theirs too.`
    addTie({
      table: t.model,
      column: t.column,
      owner: who.says,
      ownerStanding: who.standing,
      demo,
      why,
      releasable: empty,
      release: empty
        ? `Empty ${t.model}.${t.column} on the demo row, so it no longer names them. Nothing of theirs changes.`
        : `Cannot be released without deleting the row: ${t.column} must name something. End it by hand, or keep the world.`,
    })
    if (empty) addChange('NULL', t.model, t.column, t.id, t.value, `${t.model}.${t.column}: emptied on a demo row where it named ${who.name}`)
    else cannot.add(`${why} (${t.model}.${t.column})`)
  }

  // 3. A row outside the world naming a demo one in a loose column.
  for (const t of inward) {
    const who = wordsOf(await owner(t.model, t.id)) ?? unknown
    const target = wordsOf(await owner(t.to, t.value))
    const demo = target && t.to === target.kind ? target.name : `a demo ${t.to}`
    const op: ReleaseOp | null = isListColumn(t.model, t.column)
      ? 'REMOVE'
      : mayBeEmpty(t.model, t.column)
        ? 'NULL'
        : who.standing === DELETABLE_STANDING
          ? 'DELETE'
          : null
    const why = `${who.name} ${verbFor(t.model, t.column)} ${demo}, which is demo; the ${t.model} row would be left naming nobody.`
    addTie({
      table: t.model,
      column: t.column,
      owner: who.says,
      ownerStanding: who.standing,
      demo,
      why,
      releasable: !!op,
      release:
        op === 'DELETE'
          ? `${WILL_DELETE}: the ${t.model} row, which only deleting releases and which belongs to a visitor\u2019s own demo sandbox.`
          : op === 'REMOVE'
          ? `Take the one demo id out of ${t.model}.${t.column}; the rest of the list stays. Nothing is deleted.`
          : op === 'NULL'
            ? `Empty ${t.model}.${t.column}. Nothing is deleted.`
            : `Cannot be released without deleting the ${t.model} row, which is theirs to decide. Remove it by hand, or keep the world.`,
    })
    if (op === 'DELETE') addChange(op, t.model, 'id', t.id, t.id, `${t.model} deleted: a visitor\u2019s sandbox row naming ${demo}`)
    else if (op) addChange(op, t.model, t.column, t.id, t.value, `${t.model}.${t.column}: ${op === 'REMOVE' ? 'took out' : 'emptied'} ${demo}`)
    else cannot.add(`${why} (${t.model}.${t.column})`)
  }

  // What will be deleted is read first, before anything that only moves.
  const first = (release: string) => (release.startsWith(WILL_DELETE) ? 0 : 1)
  const list = [...ties.values()].sort((a, b) => first(a.release) - first(b.release))
  const changed = [...changes.values()].sort((a, b) => (a.op === 'DELETE' ? 0 : 1) - (b.op === 'DELETE' ? 0 : 1))
  const deleting = changed.filter((c) => c.op === 'DELETE').reduce((n, c) => n + c.ids.length, 0)
  const rows = changed.reduce((n, c) => n + c.ids.length, 0)
  const clearsTheWay = cannot.size === 0
  const says =
    list.length === 0
      ? 'Nothing ties the demo world to a record outside it. The rebuild can run.'
      : `${list.reduce((n, t) => n + t.rows, 0)} rows outside the demo world are tied to it, in ${list.length} ` +
        `${list.length === 1 ? 'way' : 'ways'}. ` +
        (changed.length
          ? `Releasing would change ${rows - deleting} ${rows - deleting === 1 ? 'row' : 'rows'} and delete ` +
            (deleting ? `${deleting} held only by visitors\u2019 own demo sandboxes` : 'none') +
            (standIns.length ? `, writing ${standIns.length} stand-in made-up ${standIns.length === 1 ? 'person' : 'people'}` : '') +
            '. '
          : '') +
        (clearsTheWay
          ? 'After that the rebuild can run.'
          : `${cannot.size} ${cannot.size === 1 ? 'tie' : 'ties'} cannot be released without deleting a row, and ` +
            'the rebuild stays refused until somebody ends them by hand.') +
        ` To release, send {"confirm":"${RELEASE_PHRASE}"}.`
  return { ties: list, changes: changed, standIns, cannot: [...cannot], clearsTheWay, says }
}

/** Everything the rebuild's dry run answers, with nothing written. */
export async function dryRunRebuild(db: Db = prisma) {
  const plan = await planDemoRebuild(db)
  const ties = await planTies(db, plan)
  return {
    dryRun: true as const,
    wouldDelete: {
      companies: plan.companies.map((c) => c.name),
      people: plan.people,
      rows: plan.total,
      byTable: plan.rows,
    },
    keptPeople: plan.spared.map((s) => s.email),
    blocked: plan.threads.length > 0,
    ...ties,
  }
}

export class ReleaseDrifted extends Error {}

export type ReleaseOutcome = { released: number; deleted: number; standIns: number; says: string; remaining: string[] }

/**
 * Make exactly the changes the tie plan lists, in one transaction, and
 * write down what each row held before. Deletes nothing. If any change
 * finds a different number of rows than the plan listed, nothing moves.
 */
export async function releaseTies(opts: { by?: string } = {}): Promise<ReleaseOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const plan = await planDemoRebuild(tx)
      const tp = await planTies(tx, plan)
      if (!tp.changes.length) {
        return { released: 0, deleted: 0, standIns: 0, says: `Nothing was changed. ${tp.says}`, remaining: tp.cannot }
      }
      const standInFor = new Map<string, string>()
      for (const s of tp.standIns) {
        const made = await tx.person.create({ data: { name: s.name, primaryEmail: s.email }, select: { id: true } })
        // The stand-in's address carries the kept person's id.
        standInFor.set(s.email.slice('released.'.length, s.email.indexOf('@')), made.id)
      }
      let released = 0
      let deleted = 0
      // References first, then the visitor-sandbox rows, so a row that is
      // both moved and deleted is moved and then goes.
      const ordered = [...tp.changes.filter((c) => c.op !== 'DELETE'), ...tp.changes.filter((c) => c.op === 'DELETE')]
      for (const c of ordered) {
        const t = q(table(c.table))
        const col = q(c.column)
        let n: number
        if (c.op === 'DELETE') {
          // Only a visitor's own sandbox's rows are ever planned here
          // (DELETABLE_STANDING in planTies); nothing else reaches it.
          n = await tx.$executeRawUnsafe(`DELETE FROM ${t} WHERE "id" = ANY($1::text[])`, c.ids)
          if (n !== c.ids.length) {
            throw new ReleaseDrifted(
              `The plan listed ${c.ids.length} ${c.table} rows to delete and ${n} were there. ` +
                'Something changed since the plan was read; nothing was changed.'
            )
          }
          deleted += n
          continue
        }
        if (c.op === 'REPOINT') {
          const to = standInFor.get(c.from)
          if (!to) throw new ReleaseDrifted(`No stand-in was written for ${c.from}; nothing was changed.`)
          n = await tx.$executeRawUnsafe(`UPDATE ${t} SET ${col} = $1 WHERE "id" = ANY($2::text[]) AND ${col} = $3`, to, c.ids, c.from)
        } else if (c.op === 'NULL') {
          n = await tx.$executeRawUnsafe(`UPDATE ${t} SET ${col} = NULL WHERE "id" = ANY($1::text[]) AND ${col} = $2`, c.ids, c.from)
        } else {
          n = await tx.$executeRawUnsafe(
            `UPDATE ${t} SET ${col} = array_remove(${col}, $2) WHERE "id" = ANY($1::text[]) AND $2 = ANY(${col})`,
            c.ids,
            c.from
          )
        }
        if (n !== c.ids.length) {
          throw new ReleaseDrifted(
            `The plan listed ${c.ids.length} ${c.table} rows to change in ${c.column} and ${n} were there. ` +
              'Something changed since the plan was read; nothing was changed.'
          )
        }
        released += n
      }
      const says =
        `Released ${released} ${released === 1 ? 'row' : 'rows'} outside the demo world from it, deleting ` +
        (deleted ? `${deleted} held only by visitors\u2019 own demo sandboxes` : 'none') +
        (tp.standIns.length ? ` and writing ${tp.standIns.length} stand-in made-up ${tp.standIns.length === 1 ? 'person' : 'people'}` : '') +
        '.' +
        (tp.cannot.length ? ` ${tp.cannot.length} ${tp.cannot.length === 1 ? 'tie is' : 'ties are'} left, because only deleting a row would release ${tp.cannot.length === 1 ? 'it' : 'them'}.` : ' The rebuild can run.')
      await tx.automationLog.create({
        data: {
          companyId: null,
          action: 'DEMO_TIES_RELEASED',
          summary: says,
          reason:
            'Somebody holding the deployment secret asked for the records outside the demo world to be let go of ' +
            'it, and typed the phrase. Each change moved or emptied a reference to a demo person, company or row; ' +
            'the only rows deleted were ties held by a visitor\u2019s own demo sandbox that nothing but deleting ' +
            'releases (founder, 2026-09-30), each listed by id. What every row held before is in the payload.',
          payload: {
            by: opts.by ?? 'CRON_SECRET',
            changes: tp.changes.map((c) => ({ op: c.op, table: c.table, column: c.column, ids: c.ids, from: c.from, to: c.op === 'REPOINT' ? standInFor.get(c.from) : null })),
            deleted: tp.changes.filter((c) => c.op === 'DELETE').map((c) => ({ table: c.table, ids: c.ids, why: c.says })),
            standIns: tp.standIns.map((s) => ({ for: s.for, email: s.email, id: standInFor.get(s.email.slice('released.'.length, s.email.indexOf('@'))) })),
            left: tp.cannot,
          } as unknown as Prisma.InputJsonValue,
          // Nothing here puts the references back; the payload says what they were.
          reversible: false,
        },
      })
      return { released, deleted, standIns: tp.standIns.length, says, remaining: tp.cannot }
    },
    { timeout: 55_000, maxWait: 10_000 }
  )
}
