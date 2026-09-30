/**
 * Take back what earlier seeds wrote outside the demo world.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Until 2026-09-29 several seed steps read the whole database rather than
 * the world's roster, and on production each of them wrote into records
 * that were not the demo's: a file record behind a real person's check, a
 * CV for every visitor who tried the candidate demo, journal entries in a
 * real firm's books, a payment run on the desk of whichever firm had the
 * most approved bills, a credit note and a waived check on the first paid
 * invoice by number, and visa petitions for the first eight H-1B profiles
 * in the database. The seed was fixed (`__integration__/seed-stays-in-
 * its-world`); the rows it had already written stayed. This takes them
 * back, and nothing else.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * A row is deleted only when BOTH hold:
 *
 *   1. it carries the seed's own marker — something the seed wrote and
 *      no product path writes (each kind below says what, and why no
 *      product path can have written it); and
 *   2. it belongs to an owner outside the demo world.
 *
 * Never a person, never a company. A row without the marker is not
 * touched however much it looks like one. A marked row the product has
 * since built on — a CV a submission went out with, a payment run that
 * was paid, a journal entry already exported to somebody's own ledger —
 * is held rather than deleted, and the plan says why, because deleting it
 * would take a real act with it.
 *
 * ── The demo world ───────────────────────────────────────────────────
 *
 * Companies: the seed's roster (`WORLD_SLUGS`), every company
 * `lib/demo-company` calls a demo by its seats or a reserved domain, and
 * every visitor sandbox (`isDemo`). Sandboxes count as demo on purpose:
 * everything in one is made up, it has its own reaper, and treating it as
 * real could only make this delete more. People: everybody at an address
 * nobody can register (`.example`, `.invalid`, `.local`). A visitor who
 * signed in with their own address is a real person, even inside their
 * own sandbox — which is exactly who the seeded CVs landed on.
 *
 * ── Found and not taken back, because no marker stands behind it ────
 *
 * The same audit found four more writes with no marker a deletion could
 * stand on. They are written down so nobody thinks they were missed:
 *
 *   - a passport, green card or visa `Verification` and the
 *     `DocumentBacking` joining it to a real person's I-9, and the form
 *     edition stamped on that I-9. The evidence row carries a real
 *     issuer's name and nothing that says a seed wrote it.
 *   - a hold (`Representation`) with a consent recorded on a real firm's
 *     live submission. The product's own hold writer produces the same
 *     row, key and channel.
 *   - postings a real firm's signed weeks got through `postAssertion`,
 *     which is the product's own writer: an upsert that would have
 *     written the same rows when the week was signed.
 *   - an order number and a remit-to stamped onto a real firm's
 *     invoices. Updates, not rows; there is nothing to delete, and
 *     blanking the columns could erase a value somebody set since.
 *
 * ── How ──────────────────────────────────────────────────────────────
 *
 * `planCleanup()` reads and writes nothing: per kind, the ids it would
 * delete and the ids it holds with a reason. `runCleanup(plan)` deletes
 * exactly the ids in the plan, dependents first, in one transaction, and
 * refuses — deleting nothing — if any delete removes a different number
 * of rows than the plan listed. It writes one `AutomationLog` row, not
 * reversible, in the same transaction.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { WORLD_SLUGS } from '@/lib/seed-world'
import { isDemoCompany } from '@/lib/demo-company'
import { reservedAddress, RESERVED_SUFFIXES } from '@/lib/demo-session'
import { DEFAULT_ACCOUNTS } from '@/lib/gl'

type Db = PrismaClient | Prisma.TransactionClient

/** What the caller has to type. A sentence, so it cannot be sent by accident. */
export const CLEANUP_PHRASE = 'delete seed rows outside the demo world'

// ── The markers, each exactly what a seed wrote ──────────────────────

/** `seed-standing` wrote `seed:<verificationId>` as a stand-in hash. A real upload is a SHA-256. */
export const SEED_FILE_HASH = 'seed:'

/**
 * The CV `seed-pipeline` wrote, whole: name, headline, skills, work
 * authorization, and one line of experience nobody wrote. Matched on the
 * entire text, not a phrase inside it, so a real CV that happens to say
 * "contract assignments delivering" is never taken.
 */
export const SEED_CV_TEXT =
  /^[^\n]*\n[^\n]*\n\nSkills: [^\n]*\nWork authorization: [^\n]*\n\nExperience\nContract assignments delivering [^\n]* work for enterprise clients\.\n$/

/** `seed-order-to-cash` §6, word for word. */
export const SEED_CREDIT_NOTE =
  'Four hours on the Thursday were the client’s own outage. Credited back rather than argued about.'
export const SEED_MATCH_OVERRIDE =
  'Four hours on the Thursday were our own outage and they have credited them back. Paying the invoice against the credit note rather than asking for it to be reissued.'

/** `seed-standing` §10: the first event on every petition it walked, and the three files it attached. */
export const SEED_VISA_FILED_NOTE = 'Filed with premium processing.'
export const SEED_VISA_FILES = ['lca-certified.pdf', 'i797-approval-notice.pdf', 'visa-stamp.jpg'] as const

/** `seed-order-to-cash` §9 raised its run a day before "today" and scheduled it three days after. */
const DAY = 86_400_000
const RUN_LEAD_MS = 4 * DAY

// ── The plan ─────────────────────────────────────────────────────────

export const CLEANUP_KINDS = [
  'verificationFiles',
  'resumes',
  'journalEntries',
  'ledgerAccounts',
  'paymentRuns',
  'creditNotes',
  'matchOverrides',
  'visaPetitions',
] as const
export type CleanupKind = (typeof CLEANUP_KINDS)[number]

export interface KindPlan {
  /** What the rows are, in a sentence. */
  says: string
  /** The rows to delete. */
  ids: string[]
  /** Marked rows outside the world that are kept, and why. */
  held: { id: string; why: string }[]
}

export interface CleanupPlan {
  kinds: Record<CleanupKind, KindPlan>
  /** Rows under the listed ones that go with them, by model. */
  dependents: {
    journalLines: string[]
    paymentRunItems: string[]
    visaEvents: string[]
    visaDocuments: string[]
  }
  /** Rows the plan deletes, dependents included. */
  total: number
  /** One line a person can read. */
  says: string
}

const SAYS: Record<CleanupKind, string> = {
  verificationFiles: 'File records a seed put behind a check that belongs to a real person or firm.',
  resumes: 'CVs a seed wrote for a real person.',
  journalEntries: 'Journal entries a seed posted in a real firm’s books, with their lines.',
  ledgerAccounts: 'Ledger accounts a seed opened for a real firm, left with nothing on them.',
  paymentRuns: 'A payment run a seed raised on a real firm’s desk, with its items.',
  creditNotes: 'A credit note a seed wrote against a real firm’s invoice.',
  matchOverrides: 'A waived match check a seed recorded on a real firm’s invoice.',
  visaPetitions: 'Visa petitions a seed walked for a real person, with their events and files.',
}

/** Which companies and people are the demo world's. */
export async function demoOwners(db: Db = prisma): Promise<{ companies: Set<string>; isDemoPerson: (email: string | null | undefined) => boolean }> {
  const facts = (await db.$queryRawUnsafe(
    `SELECT c."id", c."slug", c."isDemo", c."domain", c."domainVerified",
            count(x."id")::int AS seats,
            count(x."id") FILTER (WHERE NOT (lower(p."primaryEmail") LIKE ANY($1::text[])))::int AS "realSeats"
       FROM "Company" c
       LEFT JOIN "Context" x ON x."companyId" = c."id"
       LEFT JOIN "Person" p ON p."id" = x."personId"
      GROUP BY c."id"`,
    RESERVED_SUFFIXES.map((s) => `%${s}`)
  )) as { id: string; slug: string; isDemo: boolean; domain: string | null; domainVerified: boolean; seats: number; realSeats: number }[]
  const roster = new Set(WORLD_SLUGS)
  const companies = new Set(
    facts
      .filter((c) => roster.has(c.slug) || c.isDemo || isDemoCompany(c))
      .map((c) => c.id)
  )
  return { companies, isDemoPerson: (email) => !!email && reservedAddress(email) }
}

const empty = (kind: CleanupKind): KindPlan => ({ says: SAYS[kind], ids: [], held: [] })

/**
 * What would be deleted, and what is held, per kind. Reads only.
 */
export async function planCleanup(db: Db = prisma): Promise<CleanupPlan> {
  const { companies: demo, isDemoPerson } = await demoOwners(db)
  const realCompany = (id: string | null | undefined) => !!id && !demo.has(id)
  const kinds = Object.fromEntries(CLEANUP_KINDS.map((k) => [k, empty(k)])) as Record<CleanupKind, KindPlan>
  const dependents: CleanupPlan['dependents'] = { journalLines: [], paymentRunItems: [], visaEvents: [], visaDocuments: [] }

  // ── Verification files ────────────────────────────────────────────
  //
  // Real when every owner the check names is real: a real person, and a
  // real firm where one is named. A check a world firm holds on a real
  // person is the world's, and the current seed writes its file on
  // purpose.
  for (const d of await db.verificationDoc.findMany({
    where: { fileHash: { startsWith: SEED_FILE_HASH } },
    select: {
      id: true, fileHash: true, verificationId: true,
      verification: { select: { personId: true, companyId: true, person: { select: { primaryEmail: true } } } },
    },
    orderBy: { id: 'asc' },
  })) {
    const v = d.verification
    const personReal = v.personId ? !isDemoPerson(v.person?.primaryEmail) : true
    const companyReal = v.companyId ? realCompany(v.companyId) : true
    if (!v.personId && !v.companyId) continue
    if (personReal && companyReal) kinds.verificationFiles.ids.push(d.id)
  }

  // ── CVs ───────────────────────────────────────────────────────────
  for (const r of await db.resume.findMany({
    where: { textExtract: { contains: 'Contract assignments delivering ' }, fileName: { endsWith: '-cv.pdf' } },
    select: {
      id: true, textExtract: true,
      person: { select: { primaryEmail: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { id: 'asc' },
  })) {
    if (!r.textExtract || !SEED_CV_TEXT.test(r.textExtract)) continue
    if (isDemoPerson(r.person.primaryEmail)) continue
    if (r._count.submissions > 0) {
      kinds.resumes.held.push({
        id: r.id,
        why: `A submission went out with this CV (${r._count.submissions}), and a client may have read it.`,
      })
    } else kinds.resumes.ids.push(r.id)
  }

  // ── Journal entries ───────────────────────────────────────────────
  //
  // No product path writes a journal entry, a journal line or a ledger
  // account: the seed is the only writer in the codebase, and
  // `__tests__/invariants/seed-cleanup.test.ts` fails the day that stops
  // being true, because on that day "in a real firm's books" stops being
  // a marker. Each entry is also checked against the key the seed wrote
  // it under, so an entry that does not match is held and said.
  const entries = await db.journalEntry.findMany({
    where: { companyId: { notIn: [...demo] } },
    select: { id: true, companyId: true, source: true, sourceId: true, exportedAt: true, exportedTo: true, reverses: { select: { id: true } } },
    orderBy: { id: 'asc' },
  })
  const sourceIds = entries.map((e) => e.sourceId).filter((s): s is string => !!s)
  const [postings, invoices, payments] = await Promise.all([
    db.orderPosting.findMany({ where: { id: { in: sourceIds } }, select: { id: true, source: true } }),
    db.invoice.findMany({ where: { id: { in: sourceIds } }, select: { id: true } }),
    db.payment.findMany({ where: { id: { in: sourceIds } }, select: { id: true } }),
  ])
  const postingSource = new Map(postings.map((p) => [p.id, p.source as string]))
  const invoiceIds = new Set(invoices.map((i) => i.id))
  const paymentIds = new Set(payments.map((p) => p.id))
  const seedKey = (e: { source: string; sourceId: string | null }) => {
    const s = e.sourceId
    if (!s) return false
    if (e.source === 'INVOICE' && invoiceIds.has(s)) return true
    if (e.source === 'MANUAL' && paymentIds.has(s)) return true
    if (e.source === 'REVERSAL' && s.startsWith('credit:')) return true
    return postingSource.get(s) === e.source
  }
  const takenEntries = new Set<string>()
  for (const e of entries) {
    if (!seedKey(e)) {
      kinds.journalEntries.held.push({ id: e.id, why: 'Not keyed the way the seed wrote its entries, so it is not taken as one.' })
      continue
    }
    if (e.exportedAt) {
      kinds.journalEntries.held.push({
        id: e.id,
        why: `Already sent to ${e.exportedTo ?? 'the firm’s own system'}; deleting ours would hide what was sent.`,
      })
      continue
    }
    takenEntries.add(e.id)
  }
  // An entry another entry reverses stays with it: the reversal is a fact
  // about it, and the two go together or not at all.
  for (let moved = true; moved; ) {
    moved = false
    for (const e of entries) {
      if (!takenEntries.has(e.id)) continue
      const rev = e.reverses?.id
      if (rev && !takenEntries.has(rev)) {
        takenEntries.delete(e.id)
        kinds.journalEntries.held.push({ id: e.id, why: 'Another entry that stays reverses it.' })
        moved = true
      }
    }
  }
  kinds.journalEntries.ids = [...takenEntries]
  const lines = takenEntries.size
    ? await db.journalLine.findMany({ where: { entryId: { in: [...takenEntries] } }, select: { id: true } })
    : []
  dependents.journalLines = lines.map((l) => l.id)

  // ── Ledger accounts, once their entries are gone ──────────────────
  //
  // The seed's chart and nothing else: the default code and name, at a
  // real firm, with no line left on it after the entries above go and no
  // mapping to anybody's own system.
  const chart = new Set(DEFAULT_ACCOUNTS.map((a) => `${a.code}:${a.name}`))
  const accounts = await db.ledgerAccount.findMany({
    where: { companyId: { notIn: [...demo] } },
    select: { id: true, code: true, name: true, _count: { select: { mappings: true } } },
    orderBy: { id: 'asc' },
  })
  const going = new Set(dependents.journalLines)
  for (const a of accounts) {
    if (!chart.has(`${a.code}:${a.name}`)) continue
    const staying = await db.journalLine.count({ where: { accountId: a.id, id: { notIn: [...going] } } })
    if (staying > 0) {
      kinds.ledgerAccounts.held.push({ id: a.id, why: `${staying} journal line${staying === 1 ? '' : 's'} still on it.` })
    } else if (a._count.mappings > 0) {
      kinds.ledgerAccounts.held.push({ id: a.id, why: 'Mapped to an account in the firm’s own system.' })
    } else kinds.ledgerAccounts.ids.push(a.id)
  }

  // ── Payment runs ──────────────────────────────────────────────────
  for (const run of await db.paymentRun.findMany({
    where: { companyId: { notIn: [...demo] } },
    select: {
      id: true, status: true, paidAt: true, createdAt: true, scheduledFor: true,
      items: {
        select: { id: true, remittance: true, vendorBill: { select: { number: true, vendorCompany: { select: { name: true } } } } },
      },
    },
    orderBy: { id: 'asc' },
  })) {
    const created = run.createdAt.getTime()
    const marked =
      created % DAY === 0 &&
      run.scheduledFor.getTime() - created === RUN_LEAD_MS &&
      run.items.length > 0 &&
      run.items.every((i) => i.remittance === `${i.vendorBill.number} — ${i.vendorBill.vendorCompany.name}`)
    if (!marked) continue
    if (run.status !== 'APPROVED' || run.paidAt) {
      kinds.paymentRuns.held.push({ id: run.id, why: `Somebody has acted on it since: it is ${run.status.toLowerCase()}.` })
      continue
    }
    kinds.paymentRuns.ids.push(run.id)
    dependents.paymentRunItems.push(...run.items.map((i) => i.id))
  }

  // ── A credit note and a waived check, on the seller's invoice ─────
  const sellerOf = async (invoiceId: string): Promise<string[]> =>
    (await db.invoiceLine.findMany({
      where: { invoiceId, sellContractId: { not: null } },
      select: { sellContract: { select: { companyId: true } } },
    })).map((l) => l.sellContract!.companyId)
  const onRealInvoice = async (invoiceId: string) => {
    const sellers = await sellerOf(invoiceId)
    return sellers.length > 0 && sellers.every((s) => realCompany(s))
  }
  for (const n of await db.creditNote.findMany({
    where: { note: SEED_CREDIT_NOTE, reasonCode: 'HOURS_DISPUTED' },
    select: { id: true, invoiceId: true },
    orderBy: { id: 'asc' },
  })) {
    if (await onRealInvoice(n.invoiceId)) kinds.creditNotes.ids.push(n.id)
  }
  for (const o of await db.invoiceMatchOverride.findMany({
    where: { reason: SEED_MATCH_OVERRIDE, code: 'QUANTITY' },
    select: { id: true, invoiceId: true },
    orderBy: { id: 'asc' },
  })) {
    if (await onRealInvoice(o.invoiceId)) kinds.matchOverrides.ids.push(o.id)
  }

  // ── Visa petitions ────────────────────────────────────────────────
  //
  // All three files at the paths the seed built from the petition's own
  // id, and the filing note — together, never one alone.
  for (const p of await db.visaPetition.findMany({
    where: { events: { some: { notes: SEED_VISA_FILED_NOTE } } },
    select: {
      id: true,
      person: { select: { primaryEmail: true } },
      events: { select: { id: true } },
      documents: { select: { id: true, fileUrl: true } },
    },
    orderBy: { id: 'asc' },
  })) {
    const urls = new Set(p.documents.map((d) => d.fileUrl))
    if (!SEED_VISA_FILES.every((f) => urls.has(`/files/visas/${p.id}/${f}`))) continue
    if (isDemoPerson(p.person.primaryEmail)) continue
    kinds.visaPetitions.ids.push(p.id)
    dependents.visaEvents.push(...p.events.map((e) => e.id))
    dependents.visaDocuments.push(...p.documents.map((d) => d.id))
  }

  const total =
    CLEANUP_KINDS.reduce((n, k) => n + kinds[k].ids.length, 0) +
    dependents.journalLines.length + dependents.paymentRunItems.length +
    dependents.visaEvents.length + dependents.visaDocuments.length
  const held = CLEANUP_KINDS.reduce((n, k) => n + kinds[k].held.length, 0)
  const parts = CLEANUP_KINDS.filter((k) => kinds[k].ids.length > 0).map((k) => `${kinds[k].ids.length} ${LABEL[k]}`)
  const says =
    (total === 0
      ? 'Nothing a seed wrote is left outside the demo world.'
      : `${parts.join(', ')} outside the demo world, ${total} rows in all with what hangs off them.`) +
    (held ? ` ${held} marked row${held === 1 ? ' is' : 's are'} kept, each with the reason.` : '')

  return { kinds, dependents, total, says }
}

const LABEL: Record<CleanupKind, string> = {
  verificationFiles: 'verification files',
  resumes: 'CVs',
  journalEntries: 'journal entries',
  ledgerAccounts: 'ledger accounts',
  paymentRuns: 'payment runs',
  creditNotes: 'credit notes',
  matchOverrides: 'waived checks',
  visaPetitions: 'visa petitions',
}

export class CleanupDrifted extends Error {}

/**
 * Delete exactly what the plan lists, dependents first, in one
 * transaction. If any delete removes a different number of rows than the
 * plan listed — something moved since the plan was read — nothing is
 * deleted at all.
 */
export async function runCleanup(plan: CleanupPlan, opts: { by?: string } = {}): Promise<{ deleted: number; says: string }> {
  if (plan.total === 0) return { deleted: 0, says: plan.says }
  const k = plan.kinds
  const d = plan.dependents
  return prisma.$transaction(
    async (tx) => {
      let deleted = 0
      const step = async (what: string, ids: string[], run: (ids: string[]) => Promise<{ count: number }>) => {
        if (ids.length === 0) return
        const { count } = await run(ids)
        if (count !== ids.length) {
          throw new CleanupDrifted(
            `The plan listed ${ids.length} ${what} and ${count} were there to delete. Something changed since the plan was read; nothing was deleted.`
          )
        }
        deleted += count
      }
      // Children before parents.
      await step('journal lines', d.journalLines, (ids) => tx.journalLine.deleteMany({ where: { id: { in: ids } } }))
      await step('journal entries', k.journalEntries.ids, (ids) => tx.journalEntry.deleteMany({ where: { id: { in: ids } } }))
      await step('ledger accounts', k.ledgerAccounts.ids, (ids) => tx.ledgerAccount.deleteMany({ where: { id: { in: ids } } }))
      await step('payment run items', d.paymentRunItems, (ids) => tx.paymentRunItem.deleteMany({ where: { id: { in: ids } } }))
      await step('payment runs', k.paymentRuns.ids, (ids) => tx.paymentRun.deleteMany({ where: { id: { in: ids } } }))
      await step('visa events', d.visaEvents, (ids) => tx.visaEvent.deleteMany({ where: { id: { in: ids } } }))
      await step('visa files', d.visaDocuments, (ids) => tx.visaDocument.deleteMany({ where: { id: { in: ids } } }))
      await step('visa petitions', k.visaPetitions.ids, (ids) => tx.visaPetition.deleteMany({ where: { id: { in: ids } } }))
      await step('waived checks', k.matchOverrides.ids, (ids) => tx.invoiceMatchOverride.deleteMany({ where: { id: { in: ids } } }))
      await step('credit notes', k.creditNotes.ids, (ids) => tx.creditNote.deleteMany({ where: { id: { in: ids } } }))
      await step('verification files', k.verificationFiles.ids, (ids) => tx.verificationDoc.deleteMany({ where: { id: { in: ids } } }))
      await step('CVs', k.resumes.ids, (ids) => tx.resume.deleteMany({ where: { id: { in: ids } } }))

      await tx.automationLog.create({
        data: {
          companyId: null,
          action: 'SEED_ROWS_CLEANED',
          summary: `Deleted what earlier seeds wrote outside the demo world: ${plan.says}`,
          reason:
            'Earlier versions of the demo seed read the whole database and wrote into records that were not the ' +
            'demo’s. Somebody holding the deployment secret asked for those rows to be deleted and typed the ' +
            'phrase. Only rows carrying the seed’s own marker and belonging to a real person or firm were deleted.',
          payload: {
            by: opts.by ?? null,
            deleted,
            ids: Object.fromEntries(CLEANUP_KINDS.map((kind) => [kind, k[kind].ids])),
            dependents: d,
            held: Object.fromEntries(CLEANUP_KINDS.map((kind) => [kind, k[kind].held])),
          } as unknown as Prisma.InputJsonValue,
          // The rows are gone. Nothing here puts them back.
          reversible: false,
        },
      })
      return { deleted, says: plan.says }
    },
    { maxWait: 10_000, timeout: 30_000 }
  )
}
