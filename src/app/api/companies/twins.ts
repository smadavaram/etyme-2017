import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { identityDomain, notedDomain, twinOnOwnList, type OwnRecord, type TwinRead } from '@/lib/counterparty'

/**
 * The companies one firm recorded itself, read by their domain, and the
 * one writer that keeps what was typed for them (2026-11-15).
 *
 * A firm's own record of a company keeps the domain it typed as a note in
 * `website`, never in `domain`: `domain` is the claim a company's own
 * people join by, and a note one firm typed about another must never be
 * one (record 60, call 11). A company made by pasting supplier emails
 * kept its domain only on the invitation (`SupplierInvite.domain`); that
 * is read here at read time, so nothing on production is backfilled and
 * no row is rewritten.
 *
 * Exported for etyme-demand, whose supplier paste and supplier approval
 * doors use the same reader and the same writer.
 */

type Db = Prisma.TransactionClient | typeof prisma

/** Where a recorded company's domain came from: typed on Add a company, or on an invitation. */
export type NoteFrom = 'TYPED' | 'INVITATION'

/**
 * The note a firm's own record holds where the firm cleared the domain on
 * Edit and an invitation it sent carries one: an empty note, which wins
 * over the invitation. Written only by the Edit route.
 */
export const CLEARED_NOTE = ''

/** The domain each of these companies is known by on `me`'s own list, read once for all of them. */
export async function ownDomainsFor(
  me: string,
  companies: readonly { id: string; website: string | null; claimedAt: Date | null; listedById: string | null }[],
  db: Db = prisma,
): Promise<Map<string, { domain: string; from: NoteFrom }>> {
  const out = new Map<string, { domain: string; from: NoteFrom }>()
  const mine = companies.filter((c) => c.claimedAt == null && c.listedById === me)
  const missing: string[] = []
  for (const c of mine) {
    // Cleared by the firm on Edit: no domain, and the invitation is not read.
    if (c.website === CLEARED_NOTE) continue
    const d = notedDomain(c.website)
    if (d) out.set(c.id, { domain: d, from: 'TYPED' })
    else missing.push(c.id)
  }
  if (missing.length > 0) {
    const invites = await db.supplierInvite.findMany({
      where: { byId: me, companyId: { in: missing }, domain: { not: null } },
      orderBy: { sentAt: 'asc' },
      select: { companyId: true, domain: true },
    })
    for (const i of invites) {
      const d = notedDomain(i.domain)
      if (d && !out.has(i.companyId)) out.set(i.companyId, { domain: d, from: 'INVITATION' })
    }
  }
  return out
}

/** Every company `me` recorded and nobody has claimed, with the domain it is known by. */
export async function ownRecordsOf(me: string, db: Db = prisma): Promise<(OwnRecord & { kind: string; claimedAt: Date | null; listedById: string | null })[]> {
  const rows = await db.company.findMany({
    where: { listedById: me, claimedAt: null },
    select: { id: true, name: true, kind: true, website: true, claimedAt: true, listedById: true },
  })
  const domains = await ownDomainsFor(me, rows, db)
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, claimedAt: r.claimedAt, listedById: r.listedById, domain: domains.get(r.id)?.domain ?? null }))
}

/**
 * Whether a company being added is one `me` already recorded, by the twin
 * rule (`twinOnOwnList`). `except` leaves one record out, for a record
 * being corrected. Never reads a firm on Etyme, and never another firm's
 * records.
 */
export async function twinFor(
  me: string,
  typed: { name: string; domain: unknown },
  db: Db = prisma,
  except?: string,
): Promise<TwinRead<OwnRecord & { kind: string; claimedAt: Date | null; listedById: string | null }>> {
  const own = (await ownRecordsOf(me, db)).filter((r) => r.id !== except)
  return twinOnOwnList(typed, own)
}

/**
 * Keep the domain and the entity type typed for a company on `me`'s own
 * record. Writes only where the company is `me`'s own record nobody has
 * claimed, so a firm `findFirm` returned is never written on, and only
 * into an empty box, so nothing anybody typed before is overwritten.
 * Never touches `domain`. Returns what was kept.
 */
export async function keepNote(
  db: Db,
  input: { me: string; companyId: string; domain?: unknown; entityType?: unknown },
): Promise<{ domain: string | null; entityType: string | null }> {
  const domain = identityDomain(input.domain)
  const entityType = typeof input.entityType === 'string' && input.entityType.trim() ? input.entityType.trim().slice(0, 60) : null
  const own = { id: input.companyId, listedById: input.me, claimedAt: null }
  let keptDomain: string | null = null
  let keptType: string | null = null
  if (domain) {
    const r = await db.company.updateMany({ where: { ...own, website: null }, data: { website: domain } })
    if (r.count > 0) keptDomain = domain
  }
  if (entityType) {
    const r = await db.company.updateMany({ where: { ...own, entityType: null }, data: { entityType } })
    if (r.count > 0) keptType = entityType
  }
  return { domain: keptDomain, entityType: keptType }
}
