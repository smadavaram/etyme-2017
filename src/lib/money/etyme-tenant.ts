/**
 * Etyme's own tenant record, tenant #0 (Pax, 2026-11-28: "Etyme is its own
 * first tenant").
 *
 * The affiliate registry, a statement and a payout belong to no referred
 * tenant, and the metering ledger needs a company to hold a row. This is
 * that company. It is made through the one company-creation path
 * (`createCompany`), once, and found again by its reserved slug.
 *
 *  - Billing-exempt: nothing charges it and day 61 never locks it.
 *  - Not a demo, no domain, no seat that is a customer's: it is a record,
 *    not a firm anybody trades with. No register row names it, so it is on
 *    no client list and no supplier list, and nobody can be asked to link
 *    to it. It is never attributed and never earns a trial clock.
 *  - Staff are its seats (`seatStaff`). A seat here is for Etyme's own
 *    ledger and nothing at any other company: it reads this book only.
 *
 * The slug is not `etyme`, which the sign-up door reserves for the brand.
 * No real customer domain is used or held.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { createCompany } from '@/lib/company-create'

type Db = PrismaClient | Prisma.TransactionClient

/** The reserved slug tenant #0 is found by. */
export const ETYME_TENANT_SLUG = 'etyme-platform'
export const ETYME_TENANT_NAME = 'Etyme (platform record)'

/** Tenant #0, made on first use and the same row every time after. */
export async function ensureEtymeTenant(db: Db, byPersonId: string): Promise<{ id: string; created: boolean }> {
  const held = await db.company.findUnique({ where: { slug: ETYME_TENANT_SLUG }, select: { id: true } })
  if (held) return { id: held.id, created: false }
  const made = await createCompany(
    {
      name: ETYME_TENANT_NAME, kind: 'MSP', slug: ETYME_TENANT_SLUG,
      domain: null, country: 'US', currency: 'USD',
      byPersonId, seatAsOwner: false, claimDomain: false, startsSetup: false,
    },
    db,
  )
  // Set by the writer of the platform record only: never by a request.
  await db.company.update({ where: { id: made.company.id }, data: { billingExempt: true } })
  return { id: made.company.id, created: true }
}

/** The id of tenant #0 where it exists. Never makes it. */
export async function etymeTenantId(db: Db): Promise<string | null> {
  return (await db.company.findUnique({ where: { slug: ETYME_TENANT_SLUG }, select: { id: true } }))?.id ?? null
}

/**
 * Seat a member of Etyme's staff at tenant #0. The route proves `staff`
 * (callerIsStaff); this file never guesses it. Seated as Admin: the Owner
 * seat is earned by proof, never handed out, and the payout gate still
 * waits for a verified Owner.
 */
export async function seatStaff(
  personId: string,
  actor: { personId: string; staff: boolean },
  db: Db,
): Promise<{ ok: true; seated: boolean } | { ok: false; says: string }> {
  if (!actor.staff) return { ok: false, says: 'Only Etyme staff are seated at Etyme’s own record.' }
  const tenant = await ensureEtymeTenant(db, actor.personId)
  const role = await db.role.findFirst({ where: { companyId: tenant.id, name: 'Admin' }, select: { id: true } })
  if (!role) return { ok: false, says: 'Etyme’s own record has no Admin role to seat anybody in.' }
  const held = await db.context.findFirst({ where: { personId, companyId: tenant.id }, select: { id: true } })
  if (held) return { ok: true, seated: false }
  await db.context.create({ data: { personId, type: 'EMPLOYEE', companyId: tenant.id, roleId: role.id } })
  return { ok: true, seated: true }
}
