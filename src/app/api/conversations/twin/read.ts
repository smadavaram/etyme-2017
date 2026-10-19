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
import { andAll } from '@/lib/walls'
import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'
import { daysWaiting } from '@/lib/auto-approval'
import { partiesOf, directionFrom, invoiceBetween } from '@/lib/money/invoice-parties'
import { fromPrismaDecimal } from '@/lib/money'
import {
  hrefFor, WEEKS_SHOWN, deskRefusal, LIMIT_IS_THE_CLIENTS, SMALL_MODEL,
  type Readers, type VarianceReceipt, type WaitingItem, type LedgerLine,
  matchPerson, billFromPayload, billItemTitle, BILL_SEND,
  type HeldBill,
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

export function readersFor(caller: CallerContext, companyId: string): Readers {
  const ownCompany = caller.company?.id === companyId
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
      if (company.kind !== 'CLIENT') {
        return {
          ok: false as const,
          says: 'Your client approves those timesheets; the ones you accept are on Timesheets.',
          links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }],
        }
      }
      if (!hasAnyPermission(caller.permissions, ['timesheets.read', 'timesheets.approve'])) {
        return { ok: false as const, says: deskRefusal('reads the timesheets waiting for approval', 'timesheets.approve', company.kind) }
      }
      // The same weeks the program dashboard lists to sign: filed, not yet
      // signed by the client, on a line at this client's sites, inside the
      // accounts this reader belongs to. No supplier is named, because in a
      // chain the week sits on a rung the client may not know by name.
      const wall = await accountFilterFor(caller)
      const where = {
        sellContract: andAll(endClientFilter(company.id), wall.where),
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
          reason: 'Read in Ask Etyme: which weeks are unsigned',
        })
      }
      return { ok: true as const, rows, total, company: company.name, maySign: hasPermission(caller.permissions, 'timesheets.approve') }
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
      for (const r of billed) {
        const v = await invoiceVerdict(r.id, rules)
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
      for (const f of flagged) {
        // Read again now: a receipt corrected, waived or paid since is not told twice.
        const v = await invoiceVerdict(f.entityId, rules)
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
