import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { register, positionsOf, isMine, isNotClassified, lacksPosition, type Position, type PositionWork, type ExtendAs } from '@/lib/counterparty'

export { lacksPosition }

/**
 * Where a company sits with one firm, read and written in one place
 * (founder, 2026-11-12: "two facts, never one").
 *
 * A position is the register row between the two firms, and for a
 * Customer the agreement record beside it. Nothing here reads or writes a
 * company's Kind except `positionsFor`, which hands it to `positionsOf`
 * so a company not classified yet is classified only by its own rows.
 * Every read is scoped to the caller's own register: one firm's positions
 * are never readable by another.
 */

type Db = Prisma.TransactionClient | typeof prisma

export interface PositionsRead {
  positions: Position[]
  /** The caller recorded this company and nobody has claimed it. */
  mine: boolean
  notClassified: boolean
  /**
   * The reader recorded this company as not classified yet, whatever Kind
   * it has been given since: it holds a position only by its own register
   * rows, and a Kind is never a position.
   */
  recorded: boolean
  /** The agreement behind Customer: signed, unsigned, or none on file. */
  customerAgreement: 'SIGNED' | 'UNSIGNED' | null
}

/** The positions each of these companies holds with `me`. Two reads, whatever the count. */
export async function positionsFor(
  me: string,
  companies: readonly { id: string; kind: string; claimedAt: Date | null; listedById: string | null }[],
  db: Db = prisma,
): Promise<Map<string, PositionsRead>> {
  const out = new Map<string, PositionsRead>()
  if (companies.length === 0) return out
  const ids = companies.map((c) => c.id)
  const [stored, msas, recordedSet] = await Promise.all([
    db.counterparty.findMany({ where: { companyId: me, otherCompanyId: { in: ids } }, select: { otherCompanyId: true, relationship: true, status: true } }),
    db.masterAgreement.findMany({
      where: { OR: [{ vendorId: me, clientId: { in: ids } }, { clientId: me, vendorId: { in: ids } }] },
      select: { vendorId: true, clientId: true, signedAt: true },
    }),
    recordedNotClassified(me, db),
  ])
  const derived = register(
    me,
    stored.map((s) => ({ otherCompanyId: s.otherCompanyId, otherCompanyName: '', relationship: s.relationship, status: s.status })),
    msas.map((m) => ({ vendorId: m.vendorId, clientId: m.clientId, otherName: '' })),
  )
  for (const c of companies) {
    const own = stored.filter((s) => s.otherCompanyId === c.id)
    const mine = isMine(c, me)
    // Only while it is still the caller's own unclaimed record: once its
    // real owner has claimed it, it reads like any firm on Etyme.
    const recorded = mine && recordedSet.has(c.id)
    const positions = positionsOf({ kind: c.kind, stored: own, derived: derived.filter((r) => r.otherCompanyId === c.id), recordedUnclassified: recorded })
    const asClient = msas.filter((m) => m.vendorId === me && m.clientId === c.id)
    out.set(c.id, {
      positions,
      mine,
      notClassified: isNotClassified({ mine, positions }),
      recorded,
      customerAgreement: !positions.includes('CUSTOMER') || asClient.length === 0
        ? null
        : asClient.some((m) => m.signedAt != null) ? 'SIGNED' : 'UNSIGNED',
    })
  }
  return out
}

/**
 * Where one company sits with `me`, for a gate that decides whether it may
 * be named, sent a job, put forward to or shared a bench with. Null where
 * the company is not the caller's own unclaimed record and is not of Kind
 * not classified: the existing rules decide those, and nothing is read.
 * One read, so every gate and the Companies badge agree (review,
 * 2026-11-13: a gate keyed on the Kind let a recorded company given a
 * Kind through while the screen said Not classified).
 */
export async function standingWith(
  me: string,
  company: { id: string; kind: string; claimedAt: Date | null; listedById: string | null },
  db: Db = prisma,
): Promise<PositionsRead | null> {
  if (!isMine(company, me) && company.kind !== 'UNCLASSIFIED') return null
  return (await positionsFor(me, [company], db)).get(company.id) ?? null
}

/**
 * The Customer position: the CLIENT register row and the unsigned
 * agreement record beside it, the same record a client listed from
 * /api/clients gets. One function, so the two doors cannot write two
 * shapes. Returns the agreement and whether this call made it.
 */
export async function writeCustomerPosition(
  db: Db,
  input: { me: string; otherId: string; byId: string | null },
): Promise<{ msaId: string; madeAgreement: boolean }> {
  const existing = await db.masterAgreement.findFirst({ where: { vendorId: input.me, clientId: input.otherId }, select: { id: true } })
  const msa = existing ?? (await db.masterAgreement.create({ data: { vendorId: input.me, clientId: input.otherId, paymentTerms: 30 }, select: { id: true } }))
  await db.counterparty.upsert({
    where: { companyId_otherCompanyId_relationship: { companyId: input.me, otherCompanyId: input.otherId, relationship: 'CLIENT' } },
    update: {},
    create: { companyId: input.me, otherCompanyId: input.otherId, relationship: 'CLIENT', status: 'ACTIVE', createdById: input.byId },
  })
  return { msaId: msa.id, madeAgreement: !existing }
}

/** The Supplier position: the SUPPLIER register row, what Add a company writes today. */
export async function writeSupplierPosition(db: Db, input: { me: string; otherId: string; byId: string | null }): Promise<void> {
  await db.counterparty.upsert({
    where: { companyId_otherCompanyId_relationship: { companyId: input.me, otherCompanyId: input.otherId, relationship: 'SUPPLIER' } },
    update: {},
    create: { companyId: input.me, otherCompanyId: input.otherId, relationship: 'SUPPLIER', status: 'ACTIVE', createdById: input.byId },
  })
}

const UNSETTLED = { notIn: ['PAID', 'CANCELLED'] }

/**
 * What real work hangs off one position between `me` and `other`, read
 * in the direction the position runs: a Customer buys from us, a
 * Supplier sells to us.
 */
export async function workOnPosition(me: string, other: string, as: ExtendAs, db: Db = prisma): Promise<PositionWork> {
  const [seller, buyer] = as === 'CUSTOMER' ? [me, other] : [other, me]
  const [orders, sells, buys, invoices, receipts, signed, submissions, invitations, requests] = await Promise.all([
    db.workOrder.count({ where: { issuedById: buyer, issuedToId: seller } }),
    db.sellContract.count({ where: { companyId: seller, clientCompanyId: buyer } }),
    db.buyContract.count({ where: { companyId: buyer, vendorCompanyId: seller } }),
    db.invoice.count({ where: { status: UNSETTLED, engagement: { msa: { vendorId: seller, clientId: buyer } } } }),
    db.vendorBill.count({ where: { status: UNSETTLED, companyId: buyer, vendorCompanyId: seller } }),
    db.masterAgreement.count({ where: { vendorId: seller, clientId: buyer, signedAt: { not: null } } }),
    db.submission.count({ where: { fromCompanyId: seller, toCompanyId: buyer } }),
    db.requirementInvitation.count({ where: { fromCompanyId: buyer, toCompanyId: seller, status: 'SENT' } }),
    as === 'SUPPLIER'
      ? db.supplierRequest.count({ where: { companyId: me, supplierCompanyId: other, state: { not: 'DECLINED' } } })
      : Promise.resolve(0),
  ])
  return {
    orders,
    lines: sells + buys,
    bills: invoices + receipts,
    signedAgreement: signed > 0,
    submissions,
    openInvitations: invitations,
    supplierRequests: requests,
  }
}

/**
 * Take one position off: the register row, and for a Customer the
 * unsigned agreement record extending wrote, where nothing hangs on it.
 * The other position and the Kind are not touched. The caller has
 * already asked `mayRemovePosition`.
 */
export async function removePosition(db: Db, input: { me: string; otherId: string; as: ExtendAs }): Promise<{ agreementRemoved: boolean }> {
  const relationship = input.as === 'CUSTOMER' ? 'CLIENT' : 'SUPPLIER'
  await db.counterparty.deleteMany({ where: { companyId: input.me, otherCompanyId: input.otherId, relationship } })
  if (input.as !== 'CUSTOMER') return { agreementRemoved: false }
  const stubs = await db.masterAgreement.findMany({
    where: {
      vendorId: input.me, clientId: input.otherId, signedAt: null,
      engagements: { none: {} }, sellContracts: { none: {} }, workOrders: { none: {} }, requirements: { none: {} }, signatures: { none: {} },
    },
    select: { id: true },
  })
  if (stubs.length === 0) return { agreementRemoved: false }
  const gone = await db.masterAgreement.deleteMany({ where: { id: { in: stubs.map((s) => s.id) } } })
  return { agreementRemoved: gone.count > 0 }
}

/** The automation-log names a change to a company on one firm's list is written under. */
const HISTORY_ACTIONS = ['COMPANY_CREATED', 'COMPANY_EXTENDED', 'COMPANY_POSITION_REMOVED', 'COMPANY_KIND_SET']

export interface HistoryRow {
  action: string
  summary: string
  reason: string
  /** ISO time. */
  at: string
  byName: string | null
  position: Position | null
  reversible: boolean
}

/** What was done to one company on the caller's own list, newest first. Never another firm's rows. */
export async function historyOf(me: string, otherId: string, db: Db = prisma): Promise<HistoryRow[]> {
  const rows = await db.automationLog.findMany({
    where: { companyId: me, action: { in: HISTORY_ACTIONS }, payload: { path: ['otherCompanyId'], equals: otherId } },
    orderBy: { at: 'desc' },
    take: 50,
    select: { action: true, summary: true, reason: true, at: true, payload: true, reversible: true },
  })
  return rows.map((r) => {
    const p = (r.payload ?? {}) as { byName?: unknown; position?: unknown }
    return {
      action: r.action,
      summary: r.summary,
      reason: r.reason,
      at: r.at.toISOString(),
      byName: typeof p.byName === 'string' ? p.byName : null,
      position: p.position === 'CUSTOMER' || p.position === 'SUPPLIER' ? p.position : null,
      reversible: r.reversible,
    }
  })
}

/**
 * The companies `me` recorded as not classified yet, whatever Kind they
 * have been given since: read off the COMPANY_CREATED row the record wrote.
 * A list that once read every shell a firm listed as its client reads
 * these only through their own register rows (founder, 2026-11-12: a
 * position is never decided from the Kind, nor from who wrote the record).
 */
export async function recordedNotClassified(me: string, db: Db = prisma): Promise<Set<string>> {
  const rows = await db.automationLog.findMany({
    where: { companyId: me, action: 'COMPANY_CREATED', payload: { path: ['kind'], equals: 'UNCLASSIFIED' } },
    select: { payload: true },
  })
  const out = new Set<string>()
  for (const r of rows) {
    const id = (r.payload as { otherCompanyId?: unknown } | null)?.otherCompanyId
    if (typeof id === 'string') out.add(id)
  }
  return out
}
