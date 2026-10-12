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
import { feedWhere, ledgerFeed, waitingQuestions } from '@/lib/twin/ledger'
import { TWIN_ACTS } from '@/lib/autonomy'
import { hasPermission, hasAnyPermission, askTheDesk, desksHolding, type Permission } from '@/lib/permissions'
import { invoiceVerdict, invoiceRulesFor } from '@/lib/twin/rules/invoice'
import { OWNER_DESKS } from '@/lib/twin/readers'
import { logBulkAccess } from '@/lib/access-log'
import { runAgent } from '@/lib/agent-run'
import { endClientFilter } from '@/lib/resolve-end-client'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { daysWaiting } from '@/lib/auto-approval'
import { partiesOf, directionFrom, invoiceBetween } from '@/lib/money/invoice-parties'
import { fromPrismaDecimal } from '@/lib/money'
import {
  hrefFor, WEEKS_SHOWN,
  type Readers, type VarianceReceipt, type WaitingItem, type LedgerLine,
  type OtherWaiting, type LimitEntry, type SpendReceipt, type WeekRow,
} from './ask'

/** An invoice that was never sent, or was withdrawn, is nobody's spend. */
const NOT_SPEND = ['DRAFT', 'CANCELLED', 'VOID']

const MODEL = 'claude-sonnet-5'

/** Receipts read for one variance answer, at most. Each is a three-way check. */
const MAX_RECEIPTS = 200

function says(action: string): string {
  return TWIN_ACTS[action]?.says ?? action
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
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
          id: true, needsPermission: true,
          twinAction: {
            select: {
              id: true, action: true, entityType: true, entityId: true, ruleCited: true, rationale: true,
              authorityPersonId: true, payload: true,
            },
          },
        },
      })
      // Only what this seat may answer: the desk the act needs, and never
      // something asked on its own authority or that it asked for itself.
      // The approval route checks all of it again; this keeps the list to
      // things the reader can act on.
      const mine = rows.filter((r) => {
        const p = asRecord(r.twinAction.payload)
        return hasPermission(caller.permissions, r.needsPermission as Permission) &&
          r.twinAction.authorityPersonId !== caller.person.id &&
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
        const title = a.entityType === 'Invoice'
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
        }
      })
    },

    async othersWaiting(): Promise<OtherWaiting[]> {
      if (!ownCompany || !caller.company) return []
      const questions = await waitingQuestions(caller)
      return questions
        .filter((q) => !q.mayDecide)
        .map((q) => {
          const own = q.whyNot?.startsWith('The twin asked this on your authority') ?? false
          return {
            title: q.label ?? (q.entityType === 'Invoice' ? 'An invoice receipt' : TWIN_ACTS[q.action]?.says ?? 'A question'),
            noun: q.entityType === 'Invoice' ? 'invoice receipt' : 'question',
            desks: desksHolding(q.needsPermission as Permission, caller.company!.kind),
            own,
            href: hrefFor(q.entityType, q.entityId),
          }
        })
    },

    async limits() {
      const scope = feedWhere(companyId, caller)
      // What the rules found is the program owner's reading; another desk
      // reads the program without it (feedWhere's PROGRAM view).
      if (!scope || scope.view !== 'OWNER') {
        return {
          ok: false as const,
          says: askTheDesk({ doing: 'Reading who is near the time limit', needs: OWNER_DESKS, kind: caller.company?.kind, companyName: caller.company?.name }),
        }
      }
      const rows = await prisma.twinAction.findMany({
        where: { AND: [scope.where, { action: 'tenure.warning.record', outcome: 'PERFORMED', entityType: 'Person' }] },
        orderBy: { ts: 'desc' },
        take: 500,
        select: { entityId: true, ts: true, payload: true },
      })
      const ids = [...new Set(rows.map((r) => r.entityId))]
      const names = ids.length
        ? new Map((await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]))
        : new Map<string, string>()
      if (ids.length) logPeople(ids, 'Read in Ask Etyme: who is near the time limit')
      const entries: LimitEntry[] = []
      for (const r of rows) {
        const p = asRecord(r.payload)
        if (typeof p.limitOn !== 'string') continue
        entries.push({
          personId: r.entityId,
          personName: names.get(r.entityId) ?? null,
          limitOn: p.limitOn,
          capMonths: typeof p.capMonths === 'number' ? p.capMonths : null,
          suppliers: Array.isArray(p.suppliers) ? p.suppliers.filter((x): x is string => typeof x === 'string') : [],
          recordedAt: new Date(r.ts).toISOString(),
        })
      }
      return { ok: true as const, entries }
    },

    async unsignedWeeks() {
      const company = caller.company
      if (!ownCompany || !company) {
        return { ok: false as const, says: 'Unsigned weeks are read at your own company. Choose its seat first.' }
      }
      if (company.kind !== 'CLIENT') {
        return {
          ok: false as const,
          says: 'Unsigned weeks are a client’s question: the weeks waiting for its signature. Your own weeks, and the ones you accept, are on Timesheets.',
          links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }],
        }
      }
      if (!hasAnyPermission(caller.permissions, ['timesheets.read', 'timesheets.approve'])) {
        return { ok: false as const, says: askTheDesk({ doing: 'Reading the weeks waiting for a signature', needs: 'timesheets.approve', kind: company.kind, companyName: company.name }) }
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
      return { ok: true as const, rows, total, company: company.name }
    },

    async spendIn(from, to) {
      const company = caller.company
      if (!ownCompany || !company) {
        return { ok: false as const, says: 'Spend is read at your own company. Choose its seat first.' }
      }
      if (!hasPermission(caller.permissions, 'invoices.read')) {
        return { ok: false as const, says: askTheDesk({ doing: 'Reading what suppliers billed you', needs: 'invoices.read', kind: company.kind, companyName: company.name }) }
      }
      // Invoices this company is a party to and is asked to pay — its
      // invoice receipts — never what it billed upward, because adding the
      // two is how a book shows a balance to somebody who owes money.
      const rows = await prisma.invoice.findMany({
        where: { AND: [invoiceBetween(company.id), { status: { notIn: NOT_SPEND } }] },
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
      const receipts: SpendReceipt[] = []
      let undated = 0
      for (const r of rows) {
        const parties = partiesOf({
          agreement: r.engagement?.msa ?? null,
          order: r.workOrder ?? null,
          lines: r.invoiceLines.map((l) => l.sellContract).filter((x): x is NonNullable<typeof x> => !!x),
        })
        if (directionFrom(parties, company.id) !== 'PAYABLE') continue
        const dated = r.issuedAt ?? r.submittedAt
        if (!dated) { undated++; continue }
        if (dated < from || dated >= to) continue
        receipts.push({
          invoiceId: r.id,
          number: r.number,
          supplier: parties.vendor?.name ?? null,
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

    async receiptsIn(from, to): Promise<VarianceReceipt[]> {
      const scope = feedWhere(companyId, caller)
      if (!scope) return []
      // The receipts the twin recorded a verdict on in the period, in the
      // reader's scope, each read again through the twin's own rule now.
      const recorded = await prisma.twinAction.findMany({
        where: { AND: [scope.where, { action: 'invoice_receipt.record', outcome: 'PERFORMED', entityType: 'Invoice', ts: { gte: from, lt: to } }] },
        orderBy: { ts: 'desc' },
        distinct: ['entityId'],
        take: MAX_RECEIPTS,
        select: { entityId: true },
      })
      if (recorded.length === 0) return []
      const rules = await invoiceRulesFor(companyId)
      const out: VarianceReceipt[] = []
      for (const r of recorded) {
        const v = await invoiceVerdict(r.entityId, rules)
        if (!v) continue
        out.push({
          invoiceId: v.invoiceId,
          number: v.number,
          supplierName: v.supplierName,
          verdict: v.verdict,
          lines: v.lines.map((l) => ({ hoursBilled: l.hoursBilled, hoursAccepted: l.hoursAccepted, isHours: l.on !== 'NONE' })),
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
            const res = await client.messages.create({
              model: MODEL,
              max_tokens: 700,
              system,
              messages: [{ role: 'user', content: `Ledger lines:\n${context}\n\nQuestion: ${question}` }],
            })
            const text = res.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map((b) => b.text)
              .join('')
              .trim()
            return { result: text || null, model: MODEL, usage: res.usage }
          }
        )
        return result
      } catch {
        // Falls back to the rule questions; a slow third party is not a broken panel.
        return null
      }
    },
  }
}
