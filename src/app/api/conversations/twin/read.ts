/**
 * What the twin's conversation reads, for one signed-in seat. Reads only:
 * nothing here creates, updates or deletes a row (the one exception is the
 * agent-run ledger's cost row, which `runAgent` writes about the model
 * call itself, not about the record). Scope is the architect's
 * `feedWhere`, the same query the ledger route uses, so a supplier asking
 * reads only entries about records it is a party to.
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { feedWhere, ledgerFeed } from '@/lib/twin/ledger'
import { TWIN_ACTS } from '@/lib/autonomy'
import { hasPermission, type Permission } from '@/lib/permissions'
import { invoiceVerdict, invoiceRulesFor } from '@/lib/twin/rules/invoice'
import { logBulkAccess } from '@/lib/access-log'
import { runAgent, type RecordType } from '@/lib/agent-run'
import { hrefFor, type Readers, type VarianceReceipt, type WaitingItem, type LedgerLine } from './ask'

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
            // Not in agent-run's vocabulary yet; asked of the architect.
            // The column is a string, so the row is honest about what ran.
            recordType: 'TWIN_LEDGER' as RecordType,
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
