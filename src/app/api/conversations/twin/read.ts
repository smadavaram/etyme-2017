/**
 * What Ask Etyme reads, for one signed-in seat. Reads only:
 * nothing here creates, updates or deletes a row (the one exception is the
 * agent-run ledger's cost row, which `runAgent` writes about the model
 * call itself, not about the record). Scope is the architect's
 * `feedWhere`, the same query the ledger route uses, so a supplier asking
 * reads only entries about records it is a party to.
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { feedWhere, ledgerFeed, waitingQuestions, ownerOnlyException } from '@/lib/twin/ledger'
import { TWIN_ACTS } from '@/lib/autonomy'
import { hasPermission, hasAnyPermission, desksHolding, type Permission } from '@/lib/permissions'
import { tenureWarnings } from '@/lib/twin/rules/tenure'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { invoiceVerdict, invoiceRulesFor } from '@/lib/twin/rules/invoice'
import { OWNER_DESKS } from '@/lib/twin/readers'
import { logBulkAccess } from '@/lib/access-log'
import { runAgent } from '@/lib/agent-run'
import { modelOnFor, recordModelPrompt } from '@/lib/model-boundary'
import type { MaskVocabulary } from './mask'
import { endClientFilter } from '@/lib/resolve-end-client'
import { accountFilterFor } from '@/lib/account-walls'
import { actingInSeat, seatTrail, type LiveSeat } from '@/lib/program-seat'
import { andAll } from '@/lib/walls'
import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'
import { daysWaiting } from '@/lib/auto-approval'
import { partiesOf, directionFrom, invoiceBetween } from '@/lib/money/invoice-parties'
import { fromPrismaDecimal } from '@/lib/money'
import { NextRequest } from 'next/server'
import { ENDING_SOON_READERS } from '@/lib/releasing-soon'
import { firmBilling } from './billing'
import { firmTuesday } from '@/lib/money/firm-today'
import { GET as benchRoute } from '@/app/api/bench/route'
import { GET as ourBenchRoute } from '@/app/api/bench/ours/route'
import {
  hrefFor, WEEKS_SHOWN, deskRefusal, LIMIT_IS_THE_CLIENTS, SMALL_MODEL,
  type Readers, type VarianceReceipt, type WaitingItem, type LedgerLine,
  matchPerson, billFromPayload, billItemTitle, BILL_SEND,
  type HeldBill, type Billing, type RollRow, type BenchRow, type UnbilledRow, type UnpaidRow,
  type OtherWaiting, type LimitEntry, type SpendReceipt, type WeekRow, type ToldReceipt, type Named, type Verdict,
} from './ask'

/** An invoice that was never sent, or was withdrawn, is nobody's spend. */
const NOT_SPEND = ['DRAFT', 'CANCELLED', 'VOID']


/** Receipts read for one variance answer, at most. Each is a three-way check. */
const MAX_RECEIPTS = 200

function says(action: string): string {
  return TWIN_ACTS[action]?.says ?? action
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** An invoice this company is asked to pay, with the day it was billed and who billed it. */
interface Payable {
  id: string
  number: string
  currency: string
  total: { toString(): string }
  paid: { toString(): string }
  /** `issuedAt`, else `submittedAt`; null where neither is kept. */
  dated: Date | null
  supplier: string | null
}

/**
 * Invoices this company is a party to and is asked to pay — its invoice
 * receipts — never what it billed upward, because adding the two is how
 * a book shows a balance to somebody who owes money. One read for spend
 * and variance, so both count the same receipts by the same day.
 */
async function payablesOf(companyId: string): Promise<Payable[]> {
  const rows = await prisma.invoice.findMany({
    where: { AND: [invoiceBetween(companyId), { status: { notIn: NOT_SPEND } }] },
    take: 2000,
    select: {
      id: true, number: true, currency: true, total: true, paid: true, issuedAt: true, submittedAt: true,
      engagement: {
        select: {
          msa: {
            select: {
              vendorId: true, clientId: true,
              vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } },
            },
          },
        },
      },
      workOrder: {
        select: {
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } },
        },
      },
      invoiceLines: {
        take: 5,
        select: {
          sellContract: {
            select: {
              companyId: true, clientCompanyId: true,
              company: { select: { id: true, name: true } }, clientCompany: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })
  const out: Payable[] = []
  for (const r of rows) {
    const parties = partiesOf({
      agreement: r.engagement?.msa ?? null,
      order: r.workOrder ?? null,
      lines: r.invoiceLines.map((l) => l.sellContract).filter((x): x is NonNullable<typeof x> => !!x),
    })
    if (directionFrom(parties, companyId) !== 'PAYABLE') continue
    out.push({
      id: r.id, number: r.number, currency: r.currency, total: r.total, paid: r.paid,
      dated: r.issuedAt ?? r.submittedAt, supplier: parties.vendor?.name ?? null,
    })
  }
  return out
}

/** The people seated at a company who hold one permission, by name. Owners holding everything are not listed. */
async function peopleAtDesk(companyId: string, permission: string, take = 3): Promise<string[]> {
  const rows = await prisma.context.findMany({
    where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, role: { permissions: { has: permission } } },
    select: { person: { select: { name: true } } },
    take,
  })
  return [...new Set(rows.map((r) => r.person.name))]
}

/** Invoices a firm sent that are not paid in full: sent, part paid, or held by the firm paying them. */
const OWED_TO_US = ['SUBMITTED', 'ISSUED', 'PARTIALLY_PAID', 'HELD']

/** At most this many checks at once, so one question never takes the whole connection pool. */
async function inBatches<T, R>(xs: readonly T[], size: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < xs.length; i += size) out.push(...await Promise.all(xs.slice(i, i + size).map(f)))
  return out
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The readers for one seat. `request` is the seat's own request, for the
 * two answers read through another route in-process (the bench), so the
 * chat and the page cannot disagree about who is on it.
 */
export function readersFor(
  caller: CallerContext,
  companyId: string,
  request?: NextRequest,
  /** The seat the caller's firm holds in a client's program, where it holds one (lib/program-seat). */
  opts: { seat?: LiveSeat | null } = {},
): Readers {
  const ownCompany = caller.company?.id === companyId
  const seat = opts.seat ?? null
  const logPeople = (ids: string[], reason: string) =>
    logBulkAccess([...new Set(ids)], {
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company?.id,
      action: 'TENURE_VIEW',
      reason,
    })

  return {
    async waiting(): Promise<WaitingItem[]> {
      // The twin asks people at its own company only.
      if (!ownCompany) return []
      const rows = await prisma.twinApproval.findMany({
        where: { companyId, decision: 'PENDING' },
        orderBy: { requestedAt: 'asc' },
        take: 100,
        select: {
          id: true, needsPermission: true, selfApprovalReason: true,
          twinAction: {
            select: {
              id: true, action: true, entityType: true, entityId: true, ruleCited: true, rationale: true,
              authorityPersonId: true, payload: true,
            },
          },
        },
      })
      // The owner-only exception (founder, 2026-10-19, decision 2): a bill
      // put to the owner Ask Etyme acts for, because nobody else at the
      // firm sends bills. Whether it still stands is the ledger's answer
      // (`waitingQuestions`, read the way the approval route reads it),
      // never decided again here; asked only where such a question exists.
      const putToMe = rows.some((r) =>
        !!r.selfApprovalReason && !!ownerOnlyException(r.twinAction.action) && r.twinAction.authorityPersonId === caller.person.id)
      const askedYou = new Map<string, string>()
      if (putToMe) {
        for (const q of await waitingQuestions(caller, { take: 200 })) {
          if (q.mayDecide && q.askedYouBecause) askedYou.set(q.id, q.askedYouBecause)
        }
      }
      // Only what this seat may answer: the desk the act needs, and never
      // something asked on its own authority or that it asked for itself,
      // except the one bill the ledger says is the owner's to send.
      // The approval route checks all of it again; this keeps the list to
      // things the reader can act on.
      const mine = rows.filter((r) => {
        const p = asRecord(r.twinAction.payload)
        if (!hasPermission(caller.permissions, r.needsPermission as Permission)) return false
        if (askedYou.has(r.id)) return true
        return r.twinAction.authorityPersonId !== caller.person.id &&
          p.requestedByPersonId !== caller.person.id
      })
      const personIds = mine.filter((r) => r.twinAction.entityType === 'Person').map((r) => r.twinAction.entityId)
      const names = personIds.length
        ? new Map((await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]))
        : new Map<string, string>()
      if (personIds.length) logPeople(personIds, 'Read in the twin’s conversation: what needs me')

      return mine.map((r, i) => {
        const a = r.twinAction
        const p = asRecord(a.payload)
        // A drafted bill to send is this firm's own bill, never an invoice
        // receipt: the card reads it from the question's own payload.
        const bill = a.action === BILL_SEND ? billFromPayload(p) : null
        const title = bill ? billItemTitle(bill)
          : a.entityType === 'Invoice'
          ? `${typeof p.number === 'string' ? p.number : 'Invoice receipt'}${typeof p.supplierName === 'string' ? ` from ${p.supplierName}` : ''}`
          : typeof p.title === 'string' ? p.title : names.get(a.entityId) ?? a.entityType
        return {
          n: i + 1,
          approvalId: r.id,
          entryId: a.id,
          says: says(a.action),
          title,
          ruleCited: a.ruleCited,
          rationale: a.rationale,
          href: hrefFor(a.entityType, a.entityId, a.id),
          action: a.action,
          ...(bill ? { bill } : {}),
          ...(askedYou.has(r.id) ? { askedYouBecause: askedYou.get(r.id)! } : {}),
        }
      })
    },

    async heldBills(): Promise<HeldBill[]> {
      // The people who send bills answer a hold on one; nobody else at the
      // firm is handed a card for it.
      const company = caller.company
      if (!ownCompany || !company || !hasPermission(caller.permissions, 'invoices.issue')) return []
      const rows = await prisma.invoice.findMany({
        where: { AND: [invoiceBetween(company.id), { status: 'HELD' }] },
        orderBy: { dueAt: 'asc' },
        take: 20,
        select: {
          id: true, number: true,
          engagement: { select: { msa: { select: { vendorId: true, clientId: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } } } },
          workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
          invoiceLines: {
            take: 5,
            select: { sellContract: { select: { companyId: true, clientCompanyId: true, company: { select: { id: true, name: true } }, clientCompany: { select: { id: true, name: true } } } } },
          },
        },
      })
      const ours = rows
        .map((r) => ({
          r,
          parties: partiesOf({
            agreement: r.engagement?.msa ?? null,
            order: r.workOrder ?? null,
            lines: r.invoiceLines.map((l) => l.sellContract).filter((x): x is NonNullable<typeof x> => !!x),
          }),
        }))
        // Only what this firm billed: a receipt it holds itself is its own decision, not a card.
        .filter((x) => directionFrom(x.parties, company.id) === 'RECEIVABLE' && !!x.parties.client)
      if (ours.length === 0) return []
      // The hold itself: the payer's own trail row, written by the hold
      // route with the reason the supplier was told. Read, never written.
      const holds = await prisma.automationLog.findMany({
        where: { action: 'INVOICE_HELD', OR: ours.map((x) => ({ payload: { path: ['invoiceId'], equals: x.r.id } })) },
        orderBy: { at: 'desc' },
        take: 100,
        select: { at: true, payload: true },
      })
      const latest = new Map<string, { at: Date; reason: string | null }>()
      for (const h of holds) {
        const p = asRecord(h.payload)
        const id = typeof p.invoiceId === 'string' ? p.invoiceId : null
        if (!id || latest.has(id)) continue
        latest.set(id, { at: h.at, reason: typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim() : null })
      }
      return ours.map(({ r, parties }) => {
        const hold = latest.get(r.id)
        return {
          invoiceId: r.id,
          number: r.number,
          payerName: parties.client?.name ?? 'The customer',
          reason: hold?.reason ?? null,
          heldOn: hold ? hold.at.toISOString().slice(0, 10) : null,
          href: hrefFor('Invoice', r.id),
        }
      })
    },

    async othersWaiting(): Promise<OtherWaiting[]> {
      if (!ownCompany || !caller.company) return []
      const questions = (await waitingQuestions(caller)).filter((q) => !q.mayDecide)
      const perms = [...new Set(questions.map((q) => q.needsPermission))]
      const holders = new Map(await Promise.all(perms.map(async (p) => [p, await peopleAtDesk(caller.company!.id, p)] as const)))
      return questions
        .map((q) => {
          // The ledger's own fact, so a question taken back from the owner
          // (somebody else sends bills now) still reads as not theirs.
          const own = q.own
          return {
            // A bill this firm drafted to send upward is a bill; only what a
            // supplier sent in is an invoice receipt.
            title: q.label ?? (q.action === BILL_SEND ? 'A drafted bill' : q.entityType === 'Invoice' ? 'An invoice receipt' : TWIN_ACTS[q.action]?.says ?? 'A question'),
            noun: q.action === BILL_SEND ? 'bill' : q.entityType === 'Invoice' ? 'invoice receipt' : 'question',
            desks: desksHolding(q.needsPermission as Permission, caller.company!.kind),
            own,
            href: hrefFor(q.entityType, q.entityId),
            people: (holders.get(q.needsPermission) ?? []).filter((n) => n !== caller.person.name),
          }
        })
    },

    async limits() {
      if (caller.company && caller.company.kind !== 'CLIENT') return { ok: false as const, says: LIMIT_IS_THE_CLIENTS }
      const scope = feedWhere(companyId, caller)
      // What the rules found is the program owner's reading; another desk
      // reads the program without it (feedWhere's PROGRAM view).
      if (!scope || scope.view !== 'OWNER') {
        return { ok: false as const, says: deskRefusal('reads who is near the time limit', OWNER_DESKS, caller.company?.kind) }
      }
      // The rule run now, not last night's entries: the same reading the
      // nightly run records, at the moment of the question.
      const rules = await ruleSetFor(companyId)
      const live = await tenureWarnings(companyId, { warnAtDays: rules.tenureWarnAtDays }, {
        actor: { personId: caller.person.id, companyId: caller.company?.id },
      })
      const now = new Date().toISOString()
      const entries: LimitEntry[] = live.map((w) => ({
        personId: w.personId,
        personName: w.personName,
        limitOn: w.limitOn.toISOString(),
        capMonths: w.capMonths,
        suppliers: w.suppliers,
        recordedAt: now,
      }))
      // Who last night's reading listed that the live check no longer does.
      const recorded = await prisma.twinAction.findMany({
        where: { AND: [scope.where, { action: 'tenure.warning.record', outcome: 'PERFORMED', entityType: 'Person', ts: { gte: new Date(Date.now() - 36 * 3600_000) } }] },
        distinct: ['entityId'],
        select: { entityId: true },
        take: 200,
      })
      const liveIds = new Set(live.map((w) => w.personId))
      const goneIds = recorded.map((r) => r.entityId).filter((id) => !liveIds.has(id))
      const stale = goneIds.length
        ? (await prisma.person.findMany({ where: { id: { in: goneIds } }, select: { name: true } })).map((p) => p.name)
        : []
      if (goneIds.length) logPeople(goneIds, 'Read in Ask Etyme: who is near the time limit')
      return { ok: true as const, entries, stale }
    },

    async unsignedWeeks() {
      const company = caller.company
      if (!ownCompany || !company) {
        return { ok: false as const, says: 'Timesheets are read at your own company; switch to it first.' }
      }
      // A firm seated in a client's program reads that program's weeks,
      // under the seat's permissions and never its own firm's (the
      // founder's walk, 2026-10-22: the chip said "Your client approves
      // those timesheets" above a card asking the seat to approve one).
      const client = company.kind === 'CLIENT' ? { id: company.id, name: company.name } : seat ? seat.clientCompany : null
      const acting = company.kind !== 'CLIENT' && seat ? actingInSeat(caller, seat) : caller
      if (!client) {
        return {
          ok: false as const,
          says: 'Your client approves those timesheets; the ones you accept are on Timesheets.',
          links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }],
        }
      }
      if (!hasAnyPermission(acting.permissions, ['timesheets.read', 'timesheets.approve'])) {
        return { ok: false as const, says: deskRefusal('reads the timesheets waiting for approval', 'timesheets.approve', 'CLIENT') }
      }
      // The same weeks the program dashboard lists to sign: filed, not yet
      // signed by the client, on a line at this client's sites, inside the
      // accounts this reader belongs to. No supplier is named, because in a
      // chain the week sits on a rung the client may not know by name.
      const wall = await accountFilterFor(acting)
      const where = {
        sellContract: andAll(endClientFilter(client.id), wall.where),
        status: 'SUBMITTED',
        clientApprovedAt: null,
      }
      const [total, weeks] = await Promise.all([
        prisma.timesheet.count({ where }),
        prisma.timesheet.findMany({
          where,
          orderBy: [{ submittedAt: 'asc' }, { periodEnd: 'asc' }],
          take: WEEKS_SHOWN,
          select: {
            id: true, periodStart: true, periodEnd: true, totalHours: true, submittedAt: true,
            sellContract: { select: { person: { select: { id: true, name: true } } } },
          },
        }),
      ])
      const now = new Date()
      const rows: WeekRow[] = weeks.map((w) => ({
        timesheetId: w.id,
        personId: w.sellContract.person.id,
        person: w.sellContract.person.name,
        periodStart: w.periodStart.toISOString().slice(0, 10),
        periodEnd: w.periodEnd.toISOString().slice(0, 10),
        hours: Number(w.totalHours),
        waitingDays: daysWaiting({ submittedAt: w.submittedAt, periodEnd: w.periodEnd }, now),
        href: `/dashboard/weeks/${w.id}`,
      }))
      const people = [...new Set(rows.map((r) => r.personId))]
      if (people.length) {
        logBulkAccess(people, {
          actorPersonId: caller.person.id,
          actorCompanyId: company.id,
          action: 'TIMESHEET_VIEW',
          reason: seat && company.kind !== 'CLIENT' ? seatTrail(seat, 'Read in Ask Etyme: which weeks are unsigned') : 'Read in Ask Etyme: which weeks are unsigned',
        })
      }
      return { ok: true as const, rows, total, company: client.name, maySign: hasPermission(acting.permissions, 'timesheets.approve') }
    },

    async spendIn(from, to) {
      const company = caller.company
      if (!ownCompany || !company) {
        return { ok: false as const, says: 'Spend is read at your own company; switch to it first.' }
      }
      if (!hasPermission(caller.permissions, 'invoices.read')) {
        return { ok: false as const, says: deskRefusal('reads what suppliers billed you', 'invoices.read', company.kind) }
      }
      const receipts: SpendReceipt[] = []
      let undated = 0
      for (const r of await payablesOf(company.id)) {
        if (!r.dated) { undated++; continue }
        if (r.dated < from || r.dated >= to) continue
        receipts.push({
          invoiceId: r.id,
          number: r.number,
          supplier: r.supplier,
          currency: r.currency,
          totalMinor: fromPrismaDecimal(r.total, r.currency).minor,
          paidMinor: fromPrismaDecimal(r.paid, r.currency).minor,
        })
      }
      return { ok: true as const, receipts, undated }
    },

    async entry(ref) {
      const scope = feedWhere(companyId, caller)
      if (!scope) return null
      const row = await prisma.twinAction.findFirst({
        where: {
          AND: [
            scope.where,
            {
              OR: [
                { id: ref }, { approvalId: ref }, { entityId: ref },
                { entityType: 'Invoice', payload: { path: ['number'], equals: ref } },
              ],
            },
          ],
        },
        orderBy: { ts: 'desc' },
        select: { id: true, action: true, entityType: true, entityId: true, ruleCited: true, rationale: true },
      })
      if (!row) return null
      if (row.entityType === 'Person') logPeople([row.entityId], 'Read in the twin’s conversation: why')
      return { id: row.id, says: says(row.action), ruleCited: row.ruleCited, rationale: row.rationale, entityType: row.entityType, entityId: row.entityId }
    },

    async receiptsIn(from, to) {
      const company = caller.company
      if (!ownCompany || !company) {
        return { ok: false as const, says: 'Invoice mismatches are read at the company that pays; switch to it first.' }
      }
      if (!hasPermission(caller.permissions, 'invoices.read')) {
        return { ok: false as const, says: deskRefusal('reads invoice mismatches by supplier', 'invoices.read', company.kind) }
      }
      // Every invoice receipt billed in the period, read and checked now —
      // not only the ones the nightly run happened to record — counted by
      // the day each was billed, the same day spend counts by.
      const billed = (await payablesOf(company.id))
        .filter((r) => r.dated && r.dated >= from && r.dated < to)
        .slice(0, MAX_RECEIPTS)
      if (billed.length === 0) return { ok: true as const, receipts: [] }
      // What the nightly run recorded for each, so a verdict the live check
      // overturned can be said.
      const recorded = await prisma.twinAction.findMany({
        where: { companyId, action: 'invoice_receipt.record', outcome: 'PERFORMED', entityType: 'Invoice', entityId: { in: billed.map((b) => b.id) } },
        orderBy: { ts: 'desc' },
        distinct: ['entityId'],
        select: { entityId: true, payload: true },
      })
      const nightly = new Map(recorded.map((r) => {
        const v = asRecord(r.payload).verdict
        return [r.entityId, v === 'CLEAN' || v === 'MISMATCH' || v === 'BLOCKED' ? (v as Verdict) : null] as const
      }))
      const rules = await invoiceRulesFor(companyId)
      const out: VarianceReceipt[] = []
      const verdicts = await inBatches(billed, 10, (r) => invoiceVerdict(r.id, rules))
      for (const [i, r] of billed.entries()) {
        const v = verdicts[i]
        if (!v) continue
        out.push({
          invoiceId: v.invoiceId,
          number: v.number ?? r.number,
          supplierName: v.supplierName ?? r.supplier,
          verdict: v.verdict,
          nightly: nightly.get(r.id) ?? null,
          lines: v.lines.map((l) => ({ hoursBilled: l.hoursBilled, hoursAccepted: l.hoursAccepted, isHours: l.on !== 'NONE' })),
        })
      }
      return { ok: true as const, receipts: out }
    },

    async told(): Promise<{ told: ToldReceipt[]; stale: string[] }> {
      // The twin tells the desk that pays (TWIN_ACTS: approverNeeds
      // payments.record); only that desk, at the twin's own company, is told.
      if (!ownCompany || !hasPermission(caller.permissions, 'payments.record')) return { told: [], stale: [] }
      const flagged = await prisma.twinAction.findMany({
        where: { companyId, action: 'invoice_receipt.flag_mismatch', outcome: 'PERFORMED', entityType: 'Invoice' },
        orderBy: { ts: 'desc' },
        distinct: ['entityId'],
        take: 20,
        select: { entityId: true, ts: true },
      })
      if (flagged.length === 0) return { told: [], stale: [] }
      const rules = await invoiceRulesFor(companyId)
      const out: ToldReceipt[] = []
      const stale: string[] = []
      // A flag from last night that the live check no longer agrees with is
      // said once, the morning after; an older one is not repeated.
      const lastNight = Date.now() - 36 * 3600_000
      // Read again now, all at once: each verdict is its own three-way
      // check, and checked one after another they were the AP clerk's first
      // screen sitting on "Reading the record…" (founder's walk, 2026-10-19).
      const verdicts = await Promise.all(flagged.map((f) => invoiceVerdict(f.entityId, rules)))
      for (const [i, f] of flagged.entries()) {
        // A receipt corrected, waived or paid since is not told twice.
        const v = verdicts[i]
        if (!v) continue
        if (v.verdict === 'CLEAN' || v.payable) {
          if (new Date(f.ts).getTime() >= lastNight && v.number) stale.push(v.number)
          continue
        }
        const hours = v.lines.filter((l) => l.on !== 'NONE' && l.hoursAccepted != null)
        out.push({
          invoiceId: v.invoiceId,
          number: v.number ?? 'An invoice receipt',
          supplier: v.supplierName,
          hoursBilled: hours.length ? hours.reduce((s, l) => s + l.hoursBilled, 0) : null,
          hoursAccepted: hours.length ? hours.reduce((s, l) => s + (l.hoursAccepted ?? 0), 0) : null,
        })
      }
      return { told: out, stale }
    },

    async named(text: string): Promise<Named> {
      const company = caller.company
      if (!ownCompany || !company) return {}
      const out: Named = {}
      // A receipt by its number, among the invoices this company is a party to.
      const numbers = [...new Set(text.match(/\b[A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9]+)+\b/gi) ?? [])].slice(0, 5)
      if (numbers.length) {
        const inv = await prisma.invoice.findFirst({
          where: { AND: [invoiceBetween(company.id), { number: { in: numbers.map((n) => n.toUpperCase()) } }] },
          select: { id: true, number: true },
        })
        if (inv) out.receipt = { number: inv.number, invoiceId: inv.id }
      }
      // A person by name, among the placements at this company's sites or
      // supplied by it, inside the reader's account walls.
      const wall = await accountFilterFor(caller)
      const lines = await prisma.sellContract.findMany({
        where: andAll(
          { OR: [endClientFilter(company.id), { companyId: company.id }] },
          wall.where,
          { state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] } },
        ),
        orderBy: { startDate: 'desc' },
        take: 500,
        select: { id: true, person: { select: { id: true, name: true } } },
      })
      const found = matchPerson(text, lines.map((l) => ({ personId: l.person.id, name: l.person.name, contractId: l.id })))
      if (found.person) out.person = found.person
      if (found.ambiguous) out.ambiguous = found.ambiguous
      // The names read back are people on this company's placements: logged as read.
      const seen = lines
        .filter((l) => found.person?.contractId === l.id || found.ambiguous?.includes(l.person.name))
        .map((l) => l.person.id)
      if (seen.length) {
        logBulkAccess([...new Set(seen)], {
          actorPersonId: caller.person.id,
          actorCompanyId: company.id,
          action: 'CONTRACT_VIEW',
          reason: 'Read in Ask Etyme: a placement named in a question',
        })
      }
      return out
    },

    async ledgerLines(): Promise<LedgerLine[]> {
      const feed = await ledgerFeed(companyId, caller, { take: 60 })
      return (feed?.rows ?? []).map((r) => ({
        id: r.id, ts: new Date(r.ts).toISOString(), says: r.says, outcome: r.outcome,
        entityType: r.entityType, entityId: r.entityId, ruleCited: r.ruleCited, rationale: r.rationale,
      }))
    },

    async modelOn() {
      return caller.company ? modelOnFor(caller.company.id) : false
    },

    async vocabulary(): Promise<MaskVocabulary> {
      // Every name this reader may read and that a ledger line or a
      // question could carry: the people on its company's placements (both
      // sides, inside its account walls), its own colleagues, the firms it
      // trades with and its own name. Read when something is about to
      // leave, or when the rules must tell whether a question with no word
      // of the trade names somebody on the record (./transaction); never
      // sent anywhere itself.
      const company = caller.company
      if (!company) return { people: [], firms: [] }
      const wall = await accountFilterFor(caller)
      const named = { person: { select: { name: true } }, company: { select: { name: true } }, clientCompany: { select: { name: true } } }
      const [own, atSites, seats, payables, terms] = await Promise.all([
        // The lines this company is a party to: it sells them or buys them,
        // so every firm on them is one it trades with by name.
        prisma.sellContract.findMany({
          where: andAll({ OR: [{ companyId: company.id }, { clientCompanyId: company.id }] }, wall.where),
          take: 1000,
          select: { ...named, endClientCompany: { select: { name: true } } },
        }),
        // Every rung at this client's sites, for a client: the people on them,
        // and the firms named as the client may read them (lib/chain-names).
        company.kind === 'CLIENT'
          ? prisma.sellContract.findMany({
            where: andAll(endClientFilter(company.id), wall.where),
            take: 1000,
            select: { id: true, personId: true, companyId: true, clientCompanyId: true, ...named },
          })
          : Promise.resolve([]),
        prisma.context.findMany({ where: { companyId: company.id, revokedAt: null }, take: 1000, select: { person: { select: { name: true } } } }),
        hasPermission(caller.permissions, 'invoices.read') ? payablesOf(company.id) : Promise.resolve([] as Payable[]),
        company.kind === 'CLIENT'
          ? prisma.masterAgreement.findMany({ where: { clientId: company.id }, select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true } })
          : Promise.resolve([]),
      ])
      const people = new Set<string>()
      const firms = new Set<string>([company.name])
      for (const l of own) {
        people.add(l.person.name)
        for (const f of [l.company, l.clientCompany, l.endClientCompany]) if (f?.name) firms.add(f.name)
      }
      // A firm below the rung the client pays is masked like any other on
      // the way out, and comes back only as the client may read it.
      const withheld: { name: string; shownAs: string }[] = []
      const seen = namesForClient(
        atSites.map((r) => ({ id: r.id, personId: r.personId, companyId: r.companyId, companyName: r.company.name, clientCompanyId: r.clientCompanyId })),
        company.id,
        (prime: string) => mayNameSubVendors(terms, company.id, prime),
      )
      for (const r of atSites) {
        people.add(r.person.name)
        const s = seen.get(r.companyId)
        if (s && !s.masked) firms.add(s.name)
        else withheld.push({ name: r.company.name, shownAs: s?.name ?? 'a supplier you do not see by name' })
      }
      for (const c of seats) people.add(c.person.name)
      for (const p of payables) if (p.supplier) firms.add(p.supplier)
      return { people: [...people], firms: [...firms].filter((f) => !withheld.some((w) => w.name === f)), withheld }
    },

    async model(system, question, context) {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) return null
      const client = new Anthropic({ apiKey: key })
      try {
        const { result } = await runAgent(
          {
            companyId: caller.company?.id ?? companyId,
            agent: 'twin.conversation',
            recordType: 'TWIN_LEDGER',
            recordId: companyId,
          },
          async () => {
            // Masked text only: the question and the lines arrive here
            // already tokenized by ask.ts. No per-request no-retention option
            // exists in this client; see KNOWN-LIMITS.md, "Ask Etyme".
            const res = await client.messages.create({
              model: SMALL_MODEL,
              max_tokens: 700,
              system,
              messages: [{ role: 'user', content: `Ledger lines:\n${context}\n\nQuestion: ${question}` }],
            })
            const text = res.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map((b) => b.text)
              .join('')
              .trim()
            return {
              result: text ? { text, model: SMALL_MODEL, tokensIn: res.usage?.input_tokens ?? null, tokensOut: res.usage?.output_tokens ?? null } : null,
              model: SMALL_MODEL,
              usage: res.usage,
            }
          }
        )
        return result
      } catch {
        // Falls back to the rule questions; a slow third party is not a broken panel.
        return null
      }
    },

    async billing(): Promise<Billing | null> {
      // A firm's own lines only, read in ./billing, apart from every read
      // here that is scoped by a site.
      return ownCompany ? firmBilling(caller) : null
    },

    async rollingOff(days: number) {
      const company = caller.company
      if (!ownCompany || !company) return { ok: false as const, says: 'Roll-offs are read at your own company; switch to it first.' }
      if (company.kind === 'CLIENT') {
        return {
          ok: false as const,
          says: 'Your dashboard lists who leaves your sites, under Ending soon.',
          links: [{ label: 'Open the dashboard', href: '/dashboard/program' }],
        }
      }
      if (!hasAnyPermission(caller.permissions, [...ENDING_SOON_READERS])) {
        return { ok: false as const, says: deskRefusal('reads who rolls off', [...ENDING_SOON_READERS], company.kind) }
      }
      const now = new Date()
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const until = new Date(today.getTime() + days * 86_400_000)
      const wall = await accountFilterFor(caller)
      const lines = await prisma.sellContract.findMany({
        where: andAll({ companyId: company.id, state: 'IN_PROGRESS', endDate: { gte: today, lte: until } }, wall.where),
        orderBy: { endDate: 'asc' },
        take: 50,
        select: {
          id: true, endDate: true,
          person: { select: { id: true, name: true } },
          clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
        },
      })
      // One row per person: the line that ends last is the day they come off.
      const byPerson = new Map<string, RollRow>()
      for (const l of lines) {
        const endsOn = isoDay(l.endDate!)
        const row: RollRow = {
          personId: l.person.id, person: l.person.name,
          site: l.endClientCompany?.name ?? l.clientCompany?.name ?? null,
          endsOn, daysLeft: Math.round((l.endDate!.getTime() - today.getTime()) / 86_400_000),
          href: `/dashboard/contracts/${l.id}`,
        }
        const had = byPerson.get(l.person.id)
        if (!had || had.endsOn < endsOn) byPerson.set(l.person.id, row)
      }
      const rows = [...byPerson.values()].sort((a, b) => a.endsOn.localeCompare(b.endsOn) || a.person.localeCompare(b.person))
      if (rows.length) logPeople(rows.map((r) => r.personId), 'Read in Ask Etyme: who rolls off in the next 30 days')
      return { ok: true as const, rows }
    },

    async bench() {
      const company = caller.company
      if (!ownCompany || !company || !request) return { ok: false as const, says: 'The bench is read at your own company; switch to it first.' }
      if (company.kind === 'CLIENT') {
        return { ok: false as const, says: 'A supplier’s bench reaches you through matching on a job request, never as a list.' }
      }
      // The page's own reads, in-process, under this seat: an integrator's
      // bench is its own people between projects (Our bench); any other
      // firm's is the people who agreed to be on it.
      if (company.kind === 'GSI') {
        const res = await ourBenchRoute(request)
        const body = await res.json().catch(() => null)
        if (!res.ok) return { ok: false as const, says: body?.error?.message ?? 'Our bench could not be read just now.' }
        const rows: BenchRow[] = (body?.data?.rows ?? []).map((r: any) => ({
          personId: r.personId, person: r.name, free: r.freeOnSays ?? '—', skills: Array.isArray(r.skills) ? r.skills : [],
        }))
        return { ok: true as const, rows }
      }
      const url = new URL(request.url)
      url.search = '?scope=company'
      const res = await benchRoute(new NextRequest(url, { headers: request.headers }))
      const body = await res.json().catch(() => null)
      if (!res.ok) return { ok: false as const, says: body?.error?.message ?? 'The bench could not be read just now.' }
      const tiers = body?.data?.tiers ?? {}
      const listed: any[] = [...(tiers.MARKETING ?? []), ...(tiers.RETAINED ?? [])]
      const rows: BenchRow[] = listed
        .filter((l) => l.consent === 'GRANTED')
        .map((l) => ({
          personId: l.consultant?.personId, person: l.consultant?.person?.name ?? 'A person on your bench',
          free: l.free?.says ?? '—', skills: Array.isArray(l.consultant?.skills) ? l.consultant.skills : [],
        }))
        .sort((a, b) => a.person.localeCompare(b.person))
      return { ok: true as const, rows }
    },

    async unbilledWeeks() {
      const company = caller.company
      if (!ownCompany || !company) return { ok: false as const, says: 'Bills are read at your own company; switch to it first.' }
      if (company.kind === 'CLIENT') {
        return { ok: false as const, says: 'Your suppliers bill you; what they sent is under Invoice receipts.', links: [{ label: 'Open Invoice receipts', href: '/dashboard/invoices' }] }
      }
      if (!hasAnyPermission(caller.permissions, ['invoices.issue', 'invoices.read'])) {
        return { ok: false as const, says: deskRefusal('reads which signed weeks are not billed', 'invoices.issue', company.kind) }
      }
      // Today's own list (lib/money/firm-today), read whole, so the chat and
      // the Today figure "Signed and not yet billed" can never disagree: a
      // week already on an invoice the payer recorded from this firm is
      // left off by money's rule (lib/money/billed-elsewhere), and a week a
      // draft holds is still counted and named as on that draft. Found by
      // the walk of 2026-10-22: the chat told Techpeple to bill Helena
      // Marsh's Sep 20–26 week that Computer Systems already held as
      // INV-NTB82Y.
      const tuesday = await firmTuesday(company.id)
      let weeks = tuesday?.signedNotBilled.weeks ?? []
      // An account wall narrows what one seat reads; it never adds a week.
      const wall = await accountFilterFor(caller)
      if (Object.keys(wall.where).length > 0 && weeks.length > 0) {
        const mine = await prisma.sellContract.findMany({
          where: andAll({ id: { in: [...new Set(weeks.map((w) => w.sellContractId))] } }, wall.where),
          select: { id: true },
        })
        const ids = new Set(mine.map((m) => m.id))
        weeks = weeks.filter((w) => ids.has(w.sellContractId))
      }
      const signed = weeks.length
        ? await prisma.timesheet.findMany({ where: { id: { in: weeks.map((w) => w.timesheetId) } }, select: { id: true, clientApprovedAt: true } })
        : []
      const signedOn = new Map(signed.map((t) => [t.id, t.clientApprovedAt]))
      const rows: UnbilledRow[] = weeks.map((w) => {
        const at = signedOn.get(w.timesheetId)
        return {
          timesheetId: w.timesheetId, person: w.personName, customer: w.billedToName,
          periodStart: w.week.start, periodEnd: w.week.end, hours: w.signedHours,
          signedOn: at ? isoDay(at) : null,
          href: `/dashboard/weeks/${w.timesheetId}`,
          amountMinor: w.amountMinor, currency: w.currency, draft: w.draft?.number ?? null,
          personId: w.personId,
        }
      })
      rows.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.person.localeCompare(b.person))
      const people = [...new Set(rows.map((r) => r.personId!))]
      if (people.length) {
        logBulkAccess(people, {
          actorPersonId: caller.person.id, actorCompanyId: company.id, action: 'TIMESHEET_VIEW',
          reason: 'Read in Ask Etyme: which signed weeks are not billed',
        })
      }
      return { ok: true as const, rows }
    },

    async unpaidBills() {
      const company = caller.company
      if (!ownCompany || !company) return { ok: false as const, says: 'Bills are read at your own company; switch to it first.' }
      if (company.kind === 'CLIENT') {
        return { ok: false as const, says: 'Your suppliers bill you; what you owe them is under Invoice receipts.', links: [{ label: 'Open Invoice receipts', href: '/dashboard/invoices' }] }
      }
      if (!hasPermission(caller.permissions, 'invoices.read')) {
        return { ok: false as const, says: deskRefusal('reads which bills are unpaid', 'invoices.read', company.kind) }
      }
      const found = await prisma.invoice.findMany({
        where: { AND: [invoiceBetween(company.id), { status: { in: OWED_TO_US } }] },
        orderBy: { dueAt: 'asc' },
        take: 200,
        select: {
          id: true, number: true, currency: true, total: true, paid: true, dueAt: true, status: true,
          engagement: { select: { msa: { select: { vendorId: true, clientId: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } } } },
          workOrder: { select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } } },
          invoiceLines: {
            take: 5,
            select: { sellContract: { select: { companyId: true, clientCompanyId: true, company: { select: { id: true, name: true } }, clientCompany: { select: { id: true, name: true } } } } },
          },
        },
      })
      const rows: UnpaidRow[] = []
      for (const r of found) {
        const parties = partiesOf({
          agreement: r.engagement?.msa ?? null,
          order: r.workOrder ?? null,
          lines: r.invoiceLines.map((l) => l.sellContract).filter((x): x is NonNullable<typeof x> => !!x),
        })
        // Only what this firm billed; what it was billed is an invoice receipt.
        if (directionFrom(parties, company.id) !== 'RECEIVABLE') continue
        const due = fromPrismaDecimal(r.total, r.currency).minor - fromPrismaDecimal(r.paid, r.currency).minor
        if (due <= 0) continue
        rows.push({
          invoiceId: r.id, number: r.number, customer: parties.client?.name ?? null,
          dueMinor: due, currency: r.currency.toUpperCase(), dueOn: r.dueAt ? isoDay(r.dueAt) : null,
          held: r.status === 'HELD', href: hrefFor('Invoice', r.id),
        })
      }
      return { ok: true as const, rows }
    },

    async logPrompt(entry) {
      if (!caller.company) return
      await recordModelPrompt({
        companyId: caller.company.id,
        personId: caller.person.id,
        provider: 'anthropic',
        model: entry.model,
        maskedPrompt: entry.maskedPrompt,
        maskedAnswer: entry.maskedAnswer,
        tokensIn: entry.tokensIn,
        tokensOut: entry.tokensOut,
        // A replaced answer is kept, marked, so the company's log shows what
        // the model wrote and that the person was not shown it.
        purpose: entry.replaced ? 'ASK_ETYME_REPLACED' : 'ASK_ETYME',
        realValues: entry.realValues,
      })
    },
  }
}
