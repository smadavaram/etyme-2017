/**
 * What a job asks for in a license, read from the two places the start
 * will read it: the job's title and the client's own orders.
 *
 * `asksFrom` is pure and carries every rule; `licenseAsksFor` does the
 * reading. See `./license` for why this is asked at submission at all.
 */
import { prisma } from '@/lib/db'
import { credentialKeys } from '@/lib/contract-clearance'
import { licensedOccupation } from '@/lib/packets'
import { typesFor, type DefinedType } from '@/lib/document-type'
import type { LicenseAsk } from './license'

/** One row of a client order's required set, reduced to what this reads. */
export interface OrderRow {
  documentTypeKey: string
  required: boolean
  blocks: boolean | null
  waivedReason: string | null
  /** The firm the order was issued to. */
  issuedToId: string
}

const PROFESSIONAL_LICENSE = 'PROFESSIONAL_LICENSE'

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/**
 * The licenses this job asks for.
 *
 * Rules, each a way of getting it wrong first:
 *   - Where this supplier already has an order from the client, only
 *     that order's rows count: the line the award writes hangs on it, and
 *     a client insisting on a license on another firm's order has not
 *     insisted on this one's. Where it has none yet — its first placement
 *     here — the client's orders to anybody stand in, because the client's
 *     rules are the client's rules.
 *   - A waived row asks for nothing; a waiver is the client accepting the
 *     absence, in somebody's name, with a reason.
 *   - A row that is listed and not required asks for nothing here — its
 *     absence never stops the work, so warning about it would be noise.
 *   - The title asks for the shipped license where it names a licensed
 *     occupation, and never blocks on its own: only the client's order
 *     can insist at this door.
 */
export function asksFrom(input: {
  title: string
  clientName: string
  supplierCompanyId: string
  /** Whether the client has issued this supplier an order at all. */
  supplierHasOrder: boolean
  rows: OrderRow[]
  /** The client's own document dictionary. */
  documentTypes: DefinedType[]
}): LicenseAsk[] {
  const licenseKeys = credentialKeys(input.documentTypes)
  const labelOf = new Map(typesFor(input.documentTypes).map((t) => [t.key, t.label]))
  const out = new Map<string, LicenseAsk>()

  const relevant = input.rows.filter((r) => licenseKeys.includes(r.documentTypeKey))
  const ordered = input.supplierHasOrder
    ? relevant.filter((r) => r.issuedToId === input.supplierCompanyId)
    : relevant
  const decided = new Set<string>()
  for (const r of ordered) {
    if (decided.has(r.documentTypeKey)) continue
    decided.add(r.documentTypeKey)
    if (r.waivedReason || !r.required) continue
    out.set(r.documentTypeKey, {
      key: r.documentTypeKey,
      said: lowerFirst(labelOf.get(r.documentTypeKey) ?? r.documentTypeKey.toLowerCase().replace(/_/g, ' ')),
      blocks: r.blocks === true,
      because: `${input.clientName}'s orders require one`,
    })
  }

  const occupation = licensedOccupation(input.title)
  if (occupation && !out.has(PROFESSIONAL_LICENSE) && !decided.has(PROFESSIONAL_LICENSE)) {
    out.set(PROFESSIONAL_LICENSE, {
      key: PROFESSIONAL_LICENSE,
      said: occupation.credential,
      blocks: false,
      because: `“${input.title}” is a licensed job`,
    })
  }
  return [...out.values()]
}

/** The same answer, with the reading done. */
export async function licenseAsksFor(input: {
  clientCompanyId: string
  clientName: string
  supplierCompanyId: string
  title: string
}): Promise<{ asks: LicenseAsk[]; documentTypes: DefinedType[] }> {
  const [rows, documentTypes, ownOrders] = await Promise.all([
    prisma.documentRequirement.findMany({
      where: { owedBy: 'WORKER', workOrder: { issuedById: input.clientCompanyId } },
      select: {
        documentTypeKey: true, required: true, blocks: true, waivedReason: true,
        workOrder: { select: { issuedToId: true } },
      },
    }),
    prisma.documentType.findMany({
      where: { companyId: input.clientCompanyId },
      select: {
        key: true, label: true, hint: true, purpose: true, validityShape: true,
        validMonths: true, reissued: true, backedByAnyOf: true, requiresBacking: true,
        signedBy: true, suppliedBy: true, blocks: true, archivedAt: true,
      },
    }),
    prisma.workOrder.count({ where: { issuedById: input.clientCompanyId, issuedToId: input.supplierCompanyId } }),
  ])
  const asks = asksFrom({
    title: input.title,
    clientName: input.clientName,
    supplierCompanyId: input.supplierCompanyId,
    supplierHasOrder: ownOrders > 0,
    rows: rows.map((r) => ({
      documentTypeKey: r.documentTypeKey,
      required: r.required,
      blocks: r.blocks,
      waivedReason: r.waivedReason,
      issuedToId: r.workOrder?.issuedToId ?? '',
    })),
    documentTypes,
  })
  return { asks, documentTypes }
}
