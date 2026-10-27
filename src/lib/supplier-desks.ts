import { prisma } from '@/lib/db'
import type { Desks } from '@/lib/supplier-onboarding'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'

/**
 * The desks a supplier walks, as the requisition chain already names
 * them. The department lead is the nearest value-rule approver up the
 * recommender's own unit tree, then a company-wide one; HR and
 * Procurement are the standing desks (an ApprovalRule of kind HR or
 * PROCUREMENT, company-wide first, else the first unit's). Null where
 * nobody is named — the chain still walks, with the program office
 * standing in for the lead and for HR, anybody who manages suppliers
 * for Procurement, and whoever records payments for Finance.
 */
export async function desksFor(companyId: string, recommendedById?: string | null): Promise<Desks> {
  return (await desksForMany(companyId, [recommendedById ?? null])).get(recommendedById ?? null)!
}

/**
 * `desksFor` for several recommenders at once, keyed by recommender: the
 * rules, the recommenders' seats and the company's units read once each,
 * and every unit walk done in memory. The decisions queue asked
 * `desksFor` once per firm in the pipeline — three queries and one more
 * per unit up the tree — and was most of the greeting's time
 * (simulation, 2026-10-20). The same answer, firm for firm.
 */
export async function desksForMany(
  companyId: string,
  recommenderIds: readonly (string | null | undefined)[]
): Promise<Map<string | null, Desks>> {
  const people = [...new Set(recommenderIds.filter((x): x is string => !!x))]
  const [rules, seats, units] = await Promise.all([
    prisma.approvalRule.findMany({
      where: { companyId, isActive: true },
      select: { kind: true, approverId: true, orgUnitId: true, rank: true },
      orderBy: [{ orgUnitId: 'asc' }, { rank: 'asc' }],
    }),
    people.length
      ? prisma.context.findMany({
          where: { companyId, personId: { in: people }, revokedAt: null },
          select: { personId: true, orgUnitId: true },
        })
      : Promise.resolve([] as { personId: string; orgUnitId: string | null }[]),
    people.length
      ? prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, parentId: true } })
      : Promise.resolve([] as { id: string; parentId: string | null }[]),
  ])
  const pick = (kind: string) => {
    const mine = rules.filter((r) => r.kind === kind)
    return (mine.find((r) => r.orgUnitId === null) ?? mine[0])?.approverId ?? null
  }
  const parentOf = new Map(units.map((u) => [u.id, u.parentId]))
  const hrId = pick('HR')
  const procurementId = pick('PROCUREMENT')

  const out = new Map<string | null, Desks>()
  for (const raw of recommenderIds) {
    const recommendedById = raw ?? null
    if (out.has(recommendedById)) continue
    // The lead: walk up from the recommender's unit, nearest value rule
    // wins; then the company-wide value rule with the lowest rank. Never
    // the recommender themselves.
    let leadId: string | null = null
    if (recommendedById) {
      const chain: string[] = []
      let unitId = seats.find((c) => c.personId === recommendedById)?.orgUnitId ?? null
      for (let i = 0; unitId && i < 12; i++) {
        chain.push(unitId)
        unitId = parentOf.get(unitId) ?? null
      }
      const values = rules.filter((r) => r.kind === 'VALUE' && r.approverId !== recommendedById)
      for (const u of chain) {
        const hit = values.filter((r) => r.orgUnitId === u).sort((a, b) => a.rank - b.rank)[0]
        if (hit) { leadId = hit.approverId; break }
      }
      if (!leadId) leadId = values.filter((r) => r.orgUnitId === null).sort((a, b) => a.rank - b.rank)[0]?.approverId ?? null
    }
    out.set(recommendedById, { leadId, hrId, procurementId })
  }
  return out
}

/**
 * Everybody who sits on the desk a request is on now, to be told.
 *
 * `barred` is whoever cannot decide this one — the recommender, and
 * anybody who decided an earlier desk. A named lead or HR holder who is
 * barred stands down and the program office is told instead, which is
 * the same fallback `mayActAt` applies; without it the one email went
 * to the one person who would be refused on arrival.
 */
export async function deskPeople(
  companyId: string,
  stage: 'LEAD' | 'PROCUREMENT' | 'HR' | 'FINANCE',
  desks: Desks,
  barred: readonly string[] = []
): Promise<string[]> {
  const free = (id: string | null): boolean => id !== null && !barred.includes(id)
  if (stage === 'LEAD' && free(desks.leadId)) return [desks.leadId!]
  if (stage === 'HR' && free(desks.hrId)) return [desks.hrId!]
  const permission = STAND_IN_PERMISSION[stage]
  const named = STAND_IN_ROLE[stage]
  const rows = await prisma.context.findMany({
    where: {
      companyId, revokedAt: null,
      OR: [
        { role: { permissions: { hasSome: [permission, '*'] } }, ...NOT_THE_SAMPLE_SEAT },
        ...(named.length ? [{ role: { name: { in: [...named] } }, ...NOT_THE_SAMPLE_SEAT }] : []),
      ],
    },
    select: { personId: true },
  })
  const ids = new Set(rows.map((r) => r.personId))
  if (stage === 'PROCUREMENT' && free(desks.procurementId)) ids.add(desks.procurementId!)
  return [...ids]
}

// ── Who stands in, and whom to invite ─────────────────────────────────

type Step = 'LEAD' | 'PROCUREMENT' | 'HR' | 'FINANCE'

/** The permission that lets a seat stand in at a step nobody is named to. */
export const STAND_IN_PERMISSION: Record<Step, string> = {
  LEAD: 'governance.write',
  PROCUREMENT: 'vendors.manage',
  HR: 'governance.write',
  FINANCE: 'payments.record',
}

/**
 * A role named for the step stands in too, with no rule naming the
 * person. A client's Approver "sits in the approval chain" and an HR
 * Partner "reads the role"; a firm of one that invites either was
 * still refused, because neither holds `governance.write` and nobody
 * had written an approval rule in the first week (release walk,
 * 2026-10-27). CLAUDE.md, 2026-09-13: a desk nobody has named falls
 * back; it never refuses.
 */
export const STAND_IN_ROLE: Record<Step, readonly string[]> = {
  LEAD: ['Approver'],
  PROCUREMENT: [],
  HR: ['HR Partner'],
  FINANCE: [],
}

/**
 * The roles at this firm a newcomer could be given to decide this step,
 * in the firm's own names: those holding the stand-in permission (never
 * the everything role, which is the Owner's) and the role named for the
 * step. Read from the firm's roles, so a renamed role is said as renamed
 * and a role the firm does not have is never suggested.
 */
export async function inviteRolesFor(companyId: string, stage: Step): Promise<string[]> {
  const roles = await prisma.role.findMany({ where: { companyId }, select: { name: true, permissions: true } })
  return inviteRolesFrom(roles, stage)
}

/** `inviteRolesFor` over roles already read. Pure. */
export function inviteRolesFrom(roles: readonly { name: string; permissions: readonly string[] }[], stage: Step): string[] {
  const permission = STAND_IN_PERMISSION[stage]
  // The Owner holds everything (spelled out, or as '*'), and a firm has
  // one: it is never the role somebody is invited to.
  const invitable = roles.filter((r) => r.name !== 'Owner' && !r.permissions.includes('*'))
  const byPermission = invitable.filter((r) => r.permissions.includes(permission)).map((r) => r.name)
  const byName = invitable.filter((r) => STAND_IN_ROLE[stage].includes(r.name)).map((r) => r.name)
  return [...new Set([...byPermission, ...byName])]
}

// ── What this client's own orders ask of a supplier ───────────────────

/**
 * The reading behind `withOrderedItems`.
 *
 * "Ensure the loop of documents never cracks between parties." The crack
 * here was at the door: a client could write on every purchase order that
 * it requires a certificate of good standing and a hot floor induction,
 * and the one desk that screens a firm before it may trade asked for
 * neither — because `lib/supplier-onboarding` carried its own fixed list
 * and nothing joined the two. A firm came in clean against a checklist
 * that did not know what the client had asked for.
 *
 * So this reads `DocumentRequirement` and nothing else. Through
 * `lib/document-requirements` where the firm already has a line, which is
 * the one door and folds in anything set on the line itself; straight off
 * the client's `WorkOrder` headers where it does not, which is every firm
 * still walking the four desks — it has no contract yet, by construction.
 */

import { requirementsFor, type EffectiveRequirement } from '@/lib/document-requirements'
import { typesFor, type DefinedType } from '@/lib/document-type'
import type { OrderedItem } from '@/lib/supplier-onboarding'
import { VerificationType } from '@prisma/client'

/** Rows a company invented for itself, so an order asking for one can be named. */
async function dictionaryOf(companyId: string): Promise<DefinedType[]> {
  return prisma.documentType.findMany({
    where: { companyId },
    select: {
      key: true, label: true, hint: true, purpose: true, validityShape: true,
      validMonths: true, reissued: true, backedByAnyOf: true, requiresBacking: true,
      signedBy: true, suppliedBy: true, blocks: true, archivedAt: true,
    },
  })
}

/**
 * What every order this client has issued requires of the firm it pays.
 *
 * One row per document type, however many orders ask for it. `required`
 * is true where any order insists — a client that insists on cover for
 * its clean rooms and merely lists it elsewhere still insists, and
 * reading the loosest answer would be the permissive wrong one.
 */
export async function orderedOfSuppliers(companyId: string): Promise<OrderedItem[]> {
  const rows = await prisma.documentRequirement.findMany({
    where: { workOrder: { issuedById: companyId }, owedBy: 'SUPPLIER' },
    select: { documentTypeKey: true, required: true, note: true },
  })
  if (rows.length === 0) return []
  return name(companyId, rows)
}

async function name(
  companyId: string,
  rows: { documentTypeKey: string; required: boolean; note: string | null }[]
): Promise<OrderedItem[]> {
  const types = typesFor(await dictionaryOf(companyId))
  const byKey = new Map(types.map((t) => [t.key, t]))
  const out = new Map<string, OrderedItem>()
  for (const r of rows) {
    const t = byKey.get(r.documentTypeKey)
    const had = out.get(r.documentTypeKey)
    out.set(r.documentTypeKey, {
      key: r.documentTypeKey,
      label: t?.label ?? r.documentTypeKey,
      purpose: t?.purpose ?? 'COMPLIANCE',
      required: (had?.required ?? false) || r.required,
      note: had?.note ?? r.note ?? null,
    })
  }
  return [...out.values()]
}

/**
 * What this client's paper asks of one firm it already buys from.
 *
 * Two readings, unioned, and the order matters:
 *
 *   1. Every order this client has issued, because the client's rules are
 *      the client's rules. Reading only the order a particular line
 *      happens to sit under made the register contradict itself — one
 *      supplier owing a certificate of good standing and the next owing
 *      nothing, under the same client, whose every order asks for one,
 *      because that supplier's placement predated the orders.
 *   2. The line, through `lib/document-requirements` — the one door —
 *      which is the only thing that can say an item was added for this
 *      firm alone, or waived for it by a named person with a reason.
 *      A register that named a document a compliance officer already
 *      decided about would be worse than one that named nothing.
 */
export async function orderedOfSupplier(companyId: string, supplierCompanyId: string): Promise<OrderedItem[]> {
  const base = await orderedOfSuppliers(companyId)

  const line = await prisma.sellContract.findFirst({
    where: { clientCompanyId: companyId, companyId: supplierCompanyId },
    orderBy: [{ state: 'asc' }, { startDate: 'desc' }],
    select: { id: true },
  })
  if (!line) return base

  const set = await requirementsFor({ sellContractId: line.id })
  if (!set) return base

  // The purpose comes from the dictionary, not from the key: a client
  // that invents its own agreement type gets it treated as an agreement
  // without anybody adding a case here.
  const byKey = new Map(typesFor(await dictionaryOf(companyId)).map((t) => [t.key, t]))
  const mine = set.items.filter((i: EffectiveRequirement) => i.owedBy === 'SUPPLIER')
  const waived = new Set(mine.filter((i) => i.waived || !i.required).map((i) => i.key))

  const out = new Map<string, OrderedItem>(base.filter((i) => !waived.has(i.key)).map((i) => [i.key, i]))
  for (const i of mine) {
    if (waived.has(i.key)) continue
    out.set(i.key, {
      key: i.key,
      label: i.label,
      purpose: byKey.get(i.key)?.purpose ?? 'COMPLIANCE',
      required: i.required,
      note: i.note,
    })
  }
  return [...out.values()]
}

// ── What a supplier owes on this client's orders and does not hold ────

export interface Owed {
  key: string
  label: string
}

/**
 * The documents each of these firms owes on this client's orders and
 * cannot be shown to hold.
 *
 * ── What "hold" means, and what it cannot mean ───────────────────────
 *
 * Only two things in this system can answer "is it on file for this
 * firm": a `Verification` row, which covers every key that is also a
 * `VerificationType` — the insurance kinds, good standing, business
 * registration — and the `MasterAgreement` itself for an MSA. Anything
 * else a client asks of a supplier is named on the order and evidenced
 * nowhere this can read, so it is left out rather than reported missing.
 * Telling a client that a firm owes a document when nothing here could
 * ever have recorded it is a plausible wrong answer on every row, and
 * `unanswerable` carries the count so the gap is visible rather than
 * silent.
 */
export async function suppliersOwing(
  companyId: string,
  suppliers: readonly { companyId: string; agreementSigned: boolean }[],
  now: Date = new Date()
): Promise<Map<string, { owed: Owed[]; unanswerable: string[] }>> {
  const out = new Map<string, { owed: Owed[]; unanswerable: string[] }>()
  if (suppliers.length === 0) return out

  const ids = suppliers.map((s) => s.companyId)
  const held = await prisma.verification.findMany({
    where: {
      companyId: { in: ids },
      status: { in: ['CLEAR', 'CONDITIONAL'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { companyId: true, type: true, validFrom: true },
  })
  const onFile = new Set(
    held
      // Cover that begins next month does not cover a person starting
      // this week — the same floor `lib/document-type` applies.
      .filter((v) => !v.validFrom || v.validFrom <= now)
      .map((v) => `${v.companyId}:${v.type}`)
  )

  for (const s of suppliers) {
    const ordered = await orderedOfSupplier(companyId, s.companyId)
    const owed: Owed[] = []
    const unanswerable: string[] = []
    for (const item of ordered) {
      if (item.key === 'MSA') {
        if (!s.agreementSigned) owed.push({ key: item.key, label: item.label })
        continue
      }
      if (!(item.key in VerificationType)) {
        unanswerable.push(item.label)
        continue
      }
      if (!onFile.has(`${s.companyId}:${item.key}`)) owed.push({ key: item.key, label: item.label })
    }
    out.set(s.companyId, { owed, unanswerable })
  }
  return out
}

// ── A file on a supplier's onboarding item ────────────────────────────

/**
 * Keep one file for a supplier's onboarding item — sent by the firm
 * through its link, or the signed copy a desk attaches: a paper of the
 * client's for that item,
 * the bytes on it (`DocFile`), and the address of the one file door.
 * One paper per item of one request; a second answer replaces the bytes,
 * the way a sent-back paper is answered again. The paper is the
 * client's, because the client asked for it: its paperwork team opens
 * it, and nobody at another company can.
 */
export async function keepSupplierPaper(clientId: string, requestId: string, key: string, label: string, file: { name: string; type: string; bytes: Buffer }): Promise<string> {
  const name = label.slice(0, 200)
  const template =
    (await prisma.docTemplate.findFirst({ where: { companyId: clientId, name }, select: { id: true } })) ??
    (await prisma.docTemplate.create({ data: { companyId: clientId, name, audience: 'VENDOR', needsSignature: false }, select: { id: true } }))
  const now = new Date()
  const subjectId = `${requestId}:${key}`
  const id = await prisma.$transaction(async (tx) => {
    const paper =
      (await tx.docInstance.findFirst({ where: { subjectType: 'SUPPLIER_REQUEST_ITEM', subjectId }, select: { id: true } })) ??
      (await tx.docInstance.create({
        data: { templateId: template.id, subjectType: 'SUPPLIER_REQUEST_ITEM', subjectId, status: 'UPLOADED', sentAt: now },
        select: { id: true },
      }))
    await tx.docInstance.update({ where: { id: paper.id }, data: { status: 'UPLOADED', signedAt: now, fileName: file.name, signedFileUrl: 'file://on-record' } })
    await tx.docFile.upsert({
      where: { docInstanceId: paper.id },
      create: { docInstanceId: paper.id, fileName: file.name, contentType: file.type, sizeBytes: file.bytes.byteLength, bytes: file.bytes },
      update: { fileName: file.name, contentType: file.type, sizeBytes: file.bytes.byteLength, bytes: file.bytes, uploadedAt: now },
    })
    return paper.id
  })
  return `/api/documents/${id}/file`
}
