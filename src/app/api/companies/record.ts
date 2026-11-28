import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { createCompany, findFirm, workTogether, type FoundFirm } from '@/lib/company-create'
import { recordRefusal } from '@/lib/access-log'
import { twinFor, keepNote } from './twins'

/**
 * Recording a company not classified yet on the caller's own list, as one
 * piece both doors run (fix list of 2026-11-14, A2): Add a company, and
 * Add contact when the contact's email names a company that is not on the
 * list yet. One look before the write, one write, so the two doors can
 * never drift: the same twin rule, the same "already on Etyme" answer, the
 * same reserved names, the same activity-log row.
 *
 * Nothing here emails anybody, seats anybody or writes a register row.
 */

type Tx = Prisma.TransactionClient

/** A company not classified yet is asked to link as either one: the two choices the box offers. */
export const EITHER_SIDE = 'supplier or your customer'

export const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'admin',
  'login',
  'signup',
  'dashboard',
  'settings',
  'www',
  'mail',
  'help',
  'support',
  'blog',
  'docs',
  'status',
  'etyme',
])

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/**
 * Generates a unique slug by checking for collisions and appending a number.
 * Mirrors the 2017 create_slug with collision numbering.
 */
export async function uniqueSlug(base: string): Promise<string> {
  const existing = await prisma.company.findUnique({ where: { slug: base } })
  if (!existing) return base
  const collisions = await prisma.company.findMany({
    where: { slug: { startsWith: `${base}-` } },
    select: { slug: true },
  })
  let max = 0
  for (const c of collisions) {
    const n = parseInt(c.slug.slice(base.length + 1), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `${base}-${max + 1}`
}

/** The refusal for a name nobody may hold. */
export const reservedNameSays = (name: string) => `The name "${name}" is reserved. Please choose another.`

/** The refusal when another save took the same address a moment before. */
export const SLUG_RACE_SAYS = 'Another company took that name a moment ago. Press Save again.'

/**
 * The refusal for the caller's own firm. Recording it as not classified
 * asks no position, so it never says "your  too" (fix list A2).
 */
export const ownCompanySays = (name: string, as: string) =>
  as ? `${name} is your own company, so it cannot be your ${as.toLowerCase()} too.` : `${name} is your own company, so it is not added to your Companies list.`

/** The reply where the firm found on Etyme already works with the caller. */
export const onYourListAlreadySays = (name: string) =>
  `${name} is on Etyme and already works with you, so it is on your Companies list already. No copy was made.`

/** What is already there for a company about to be recorded, asked in the order Add a company asks. */
export type BeforeRecording =
  /** On the caller's own list already, by the twin rule. */
  | { found: 'TWIN'; twin: { id: string; name: string; domain: string | null }; by: 'DOMAIN' | 'NAME' }
  /** The caller's own firm. */
  | { found: 'OWN_FIRM'; firm: FoundFirm }
  /** A firm on Etyme; `together` is whether the two already work together. */
  | { found: 'ON_ETYME'; firm: FoundFirm; together: boolean }
  /** No domain and no address were typed, and a firm on Etyme holds the name. */
  | { found: 'SAME_NAME_ON_ETYME'; namesake: { id: string; name: string } }
  /** Nothing in the way. `namesake` is another record of the same name on the caller's list. */
  | { found: 'NOTHING'; namesake: { name: string; domain: string | null } | null }

/**
 * Look before recording: the caller's own list first (the same domain is
 * the same company whatever the name), then Etyme (`findFirm`: a firm
 * already here is found, never written down again), then, where nothing
 * but a name was typed, a firm on Etyme holding that name. Writes nothing.
 */
export async function lookBeforeRecording(
  caller: CallerContext,
  typed: { name: string; domain: string | null | undefined; address?: string | null },
): Promise<BeforeRecording> {
  const mine = caller.company!
  const read = await twinFor(mine.id, { name: typed.name, domain: typed.domain })
  if (read.twin) return { found: 'TWIN', twin: read.twin, by: read.by }
  const firm = await findFirm({
    emailDomain: typed.domain ?? null,
    etymeAddress: typed.address ?? null,
    name: typed.name,
    isDemo: mine.isDemo === true,
  })
  if (firm && firm.id === mine.id) return { found: 'OWN_FIRM', firm }
  if (firm) return { found: 'ON_ETYME', firm, together: await workTogether(mine.id, firm.id) }
  if (!typed.domain && !typed.address) {
    const namesake = await prisma.company.findFirst({
      where: { claimedAt: { not: null }, isDemo: mine.isDemo === true, name: { equals: typed.name.trim(), mode: 'insensitive' }, id: { not: mine.id } },
      select: { id: true, name: true },
    })
    if (namesake) return { found: 'SAME_NAME_ON_ETYME', namesake }
  }
  return { found: 'NOTHING', namesake: read.namesake ? { name: read.namesake.name, domain: read.namesake.domain } : null }
}

/**
 * Write the company: kind UNCLASSIFIED, listed by the caller, with no
 * register row, no agreement, no roles, no seat, no domain claim and
 * nothing on a page. The typed domain is kept as the caller's own note
 * (`keepNote`), never as the claim column. The activity-log row is on the
 * caller's own log, where its Activity log and the company's History read
 * it. Runs inside the caller's transaction, so a door that writes more in
 * the same save (a contact) writes all of it or none of it.
 */
export async function writeRecord(
  tx: Tx,
  caller: CallerContext,
  input: { name: string; slug: string; domain?: unknown; entityType?: unknown; country?: string | null; currency?: string | null },
): Promise<{ company: { id: string; name: string; slug: string; kind: string }; noted: string | null }> {
  const mine = caller.company!
  const created = await createCompany(
    {
      name: input.name,
      kind: 'UNCLASSIFIED',
      slug: input.slug,
      domain: null,
      country: input.country ?? null,
      currency: input.currency ?? null,
      byPersonId: caller.person.id,
      seatAsOwner: false,
      claimDomain: false,
      startsSetup: false,
      listedById: mine.id,
      isDemo: mine.isDemo === true,
    },
    tx
  )
  const kept = await keepNote(tx, { me: mine.id, companyId: created.company.id, domain: input.domain, entityType: input.entityType })
  await tx.automationLog.create({
    data: {
      companyId: mine.id,
      action: 'COMPANY_CREATED',
      summary: `${caller.person.name} recorded ${created.company.name} on ${mine.name}'s Companies list, not classified yet`,
      reason: 'Recorded, not classified: no position, no agreement, nobody seated and nothing sent.',
      payload: { otherCompanyId: created.company.id, byName: caller.person.name, personId: caller.person.id, position: null, kind: 'UNCLASSIFIED' },
      // No control deletes a recorded company, so the flag says so.
      reversible: false,
    },
  })
  const c = created.company
  return { company: { id: c.id, name: c.name, slug: c.slug, kind: c.kind }, noted: kept.domain }
}

/** A refusal while adding a company, written to the access log before the reply. */
export async function refusedFound(caller: CallerContext, otherId: string, says: string): Promise<void> {
  await recordRefusal([{ companyId: otherId }], {
    actorPersonId: caller.isService ? undefined : caller.person.id,
    actorCompanyId: caller.company!.id,
    action: 'CONTRACT_VIEW',
    reason: `Refused adding a company: ${says}`,
  })
}
