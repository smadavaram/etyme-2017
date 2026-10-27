/**
 * One way to make a company.
 *
 * Decided by the founder, 2026-10-07: "Add company" and first sign-in
 * create a company through one function, so both get the same pack, roles,
 * location and holidays. Before this the two doors disagreed: first
 * sign-in wrote a pack, a head office, two years of holidays and the roles
 * for what the company is; "Add company" wrote none of those and seven
 * hard-coded staffing-agency roles, one of them a name the trade had
 * already retired. A client added that way had no cycle calendar, so
 * nothing was ever due, and a Recruiter it had no use for.
 *
 * What stays with each door is what genuinely differs: who is seated as
 * owner, what the automation log says, and the event. Everything a
 * company needs to be able to start is here.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  rolesFor, packFor, countryFromDomain, primaryLocationName, payRhythmForPack, type CompanyKind,
} from '@/lib/company-defaults'
import { holidaysFor } from '@/lib/holidays'
import { isPlatformDomain, isConsumerDomain, domainOfEmail } from '@/lib/company-domains'
import { defaultPostureFor } from '@/lib/walls'
import { writeFromRules } from '@/lib/site-voice'
import { currencyFor, knownCountry, knownCurrency, type SetupRecord } from '@/lib/setup-steps'

type Db = PrismaClient | Prisma.TransactionClient

/** The countries whose public holidays are built in. Elsewhere the company adds its own. */
export const HOLIDAY_COUNTRIES = ['US', 'GB', 'IN'] as const

export interface CreateCompanyInput {
  name: string
  kind: CompanyKind
  slug: string
  /**
   * The verified work domain, or null. A personal address proves nothing
   * about a company, and a counterparty somebody else writes down is not
   * the writer's domain, so both pass null.
   */
  domain: string | null
  /** Two letters. Guessed from the domain when not given. */
  country?: string | null
  /** Three letters. Follows the country when not given. */
  currency?: string | null
  /** Where a supplier sits in the chain; null for a client or MSP. */
  posture?: string | null
  /** Who is making it. Recorded on the domain claim and the setup record. */
  byPersonId: string
  /** Seat that person as Owner. False when recording a counterparty. */
  seatAsOwner: boolean
  /**
   * The firm writing a counterparty down, where that is how it began
   * (`Company.listedById`): the register it is on until somebody there
   * claims it. Null for a firm founded by its own people.
   */
  listedById?: string | null
  /** A demo firm's counterparty is a demo firm, kept to its own world. */
  isDemo?: boolean
  /**
   * Claim the domain so colleagues who sign in on it join this company.
   * Only where the domain is the creator's own verified work domain and
   * nobody holds it yet.
   */
  claimDomain: boolean
  /**
   * Begin the five setup steps. True for somebody founding their own
   * firm; false for a counterparty, which nobody there has seen yet.
   */
  startsSetup: boolean
  /**
   * The company's own id, where the caller derives it. Only the generated
   * world passes one (lib/seed-scale), so a second seeding finds every firm
   * by id and writes nothing; every door a person uses leaves it to the
   * database.
   */
  id?: string
  /**
   * When the company and its owner's seat began, where that is not now.
   * The generated world dates its firms from the day the seeded world was
   * born (lib/seed-days); every other caller leaves it unset.
   */
  createdAt?: Date
  /** The head office's own id, for the same reason as `id`. */
  locationId?: string
}

export interface CreatedCompany {
  company: { id: string; name: string; slug: string; kind: CompanyKind; domain: string | null; siteLiveAt: Date | null; supplierPosture: string | null }
  roles: { id: string; name: string; permissions: string[] }[]
  ownerRoleId: string
  ownerContextId: string | null
  templatePack: string
  country: string
  currency: string
  holidaysSeeded: number
  siteTagline: string
}

/**
 * Make the company and everything it needs to start: pack, country,
 * currency, roles for its kind, a head office, holidays where they are
 * built in, the words on its page, and — for a founder — the owner's seat
 * and the first answered setup step.
 *
 * Pass a transaction client to make it part of a larger write.
 */
export async function createCompany(input: CreateCompanyInput, db: Db = prisma): Promise<CreatedCompany> {
  const name = input.name.trim()
  // The last lock on Etyme's own domain: whatever a caller passes, no
  // company is made holding etyme.com or a name under it, and none claims
  // it (lib/company-domains, isPlatformDomain).
  const domain = isPlatformDomain(input.domain) ? null : input.domain
  const country = knownCountry(input.country) ?? countryFromDomain(domain)
  const currency = knownCurrency(input.currency) ?? currencyFor(country)
  const templatePack = packFor(input.kind, country)
  const payRhythm = payRhythmForPack(templatePack)
  // When it began: now, or the day the generated world dates it from.
  const now = input.createdAt ?? new Date()

  // Words for the public page, written by rule so sign-up never waits on
  // a third party. Editable from settings once there is more to say.
  const voice = writeFromRules({
    name,
    kind: input.kind,
    posture: input.posture ?? null,
    skills: [],
    locations: [],
    placements: 0, activeNow: 0, clients: 0,
    openPositions: 0, comingFree: 0, trainingCourses: 0,
  })

  // The step the founder just answered by creating it: name, type,
  // country and currency.
  const setupSteps: SetupRecord | undefined = input.startsSetup
    ? { COMPANY: { outcome: 'DONE', byId: input.byPersonId, at: now.toISOString() } }
    : undefined

  const company = await db.company.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      name,
      slug: input.slug,
      domain,
      // The identity provider proved the work domain. No domain, nothing proved.
      domainVerified: domain !== null,
      kind: input.kind,
      supplierPosture: input.posture ?? null,
      // Who here may look at the market outside. Open for a staffing firm,
      // named people only for a delivery firm or an enterprise.
      outsideAccess: defaultPostureFor(input.kind),
      // Without a pack a contract generates no due dates at all.
      templatePack,
      country,
      currency,
      homeCurrency: currency,
      ...(payRhythm ?? {}),
      // A public page only for a firm somebody there runs. A counterparty
      // another firm wrote down has none until somebody at it joins.
      siteLiveAt: input.seatAsOwner ? now : null,
      // On Etyme from the moment somebody there signs up: a seat is
      // possession (the rule seed-world states for the seeded firms). A
      // counterparty somebody else writes down stays a shell — not on
      // Etyme — until somebody at it claims it. Until 2026-10-19 this was
      // never set, so every signed-up firm read as a shell: "not on Etyme"
      // on its suppliers' screens, nameable as anybody's client, and its
      // week approvals checked against a supplier's address book.
      claimedAt: input.seatAsOwner ? now : null,
      listedById: input.seatAsOwner ? null : input.listedById ?? null,
      isDemo: input.isDemo === true,
      networkVerifiedAt: null,
      siteTagline: voice.tagline,
      siteIntro: voice.intro,
      siteHeadings: voice.headings as any,
      siteWrittenBy: 'RULES',
      siteWrittenAt: now,
      ...(input.startsSetup ? { setupStartedAt: now, setupSteps: setupSteps as any } : {}),
    },
    select: { id: true, name: true, slug: true, kind: true, domain: true, siteLiveAt: true, supplierPosture: true },
  })

  if (input.claimDomain && domain) {
    const held = await db.companyDomain.findUnique({ where: { domain }, select: { id: true } })
    if (!held) {
      await db.companyDomain.create({
        data: {
          companyId: company.id,
          domain,
          verifiedAt: now,
          verifiedVia: 'OAUTH_TENANT',
          // The founder signing in from their work address is saying
          // everybody on it works there.
          joinPolicy: 'AUTO',
          isPrimary: true,
          addedById: input.byPersonId,
        },
      })
    }
  }

  const roles: CreatedCompany['roles'] = []
  for (const r of rolesFor(input.kind)) {
    roles.push(
      await db.role.create({
        data: { companyId: company.id, name: r.name, permissions: [...r.permissions], isDefault: true },
        select: { id: true, name: true, permissions: true },
      })
    )
  }
  const ownerRoleId = roles.find((r) => r.name === 'Owner')!.id

  const ownerContextId = input.seatAsOwner
    ? (
        await db.context.create({
          data: {
            personId: input.byPersonId, type: 'EMPLOYEE', companyId: company.id, roleId: ownerRoleId,
            ...(input.createdAt ? { grantedAt: input.createdAt } : {}),
          },
          select: { id: true },
        })
      ).id
    : null

  // A one-person firm is its owner's own company. Money's own-company
  // check reads the owner's profile, not the seat, so the profile names
  // the firm from the day it is made, by either door (sign-up walk,
  // round two, item 21). An existing profile — a candidate becoming a
  // firm — keeps everything else it held.
  if (input.seatAsOwner && company.kind === 'CONSULTANT_CORP') {
    await db.consultantProfile.upsert({
      where: { personId: input.byPersonId },
      update: { ownCompanyId: company.id },
      create: { personId: input.byPersonId, skills: [], visibility: 'INTERNAL', ownCompanyId: company.id },
    })
  }

  // Somewhere to work. An assignment with no location cannot be reasoned
  // about for tenure or for tax.
  await db.companyLocation.create({
    data: { ...(input.locationId ? { id: input.locationId } : {}), companyId: company.id, name: primaryLocationName(name), country, isPrimary: true },
  })

  // Public holidays, so business-day shifting has something real to
  // shift against. Elsewhere the company adds its own: seeding another
  // country's dates would look deliberate and nobody would check them.
  let holidaysSeeded = 0
  if ((HOLIDAY_COUNTRIES as readonly string[]).includes(country)) {
    const thisYear = now.getUTCFullYear()
    const dates = [thisYear, thisYear + 1].flatMap((y) => holidaysFor(country, y) ?? [])
    const made = await db.holiday.createMany({
      data: dates.map((h) => ({ companyId: company.id, date: new Date(h.date + 'T00:00:00Z'), name: h.name, country })),
      skipDuplicates: true,
    })
    holidaysSeeded = made.count
  }

  return {
    company: { ...company, kind: company.kind as CompanyKind },
    roles,
    ownerRoleId,
    ownerContextId,
    templatePack,
    country,
    currency,
    holidaysSeeded,
    siteTagline: voice.tagline,
  }
}

/**
 * The firms that signed up before `claimedAt` was written, put right.
 *
 * Until 2026-10-19 `createCompany` never set `claimedAt`, so every firm
 * that signed up read as a shell — "not on Etyme" — however many people
 * worked in it. A seat is possession (seed-world's rule, and now
 * `createCompany`'s): a company where anybody holds a seat with a role
 * took possession of itself, on the day it was made. A shell nobody has
 * joined has no seat and is left alone, which is what the column is for.
 *
 * Idempotent: only rows still null are touched, so a second run finds
 * nothing. `write: false` counts without changing anything.
 * Run once per database: `npx tsx scripts/backfill-claimed-at.ts`
 * (what it would do), then with `--write`.
 */
export async function claimSignedUpFirms(db: Db = prisma, opts: { write: boolean } = { write: true }): Promise<{ found: number; claimed: number }> {
  const found = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "Company" c
    WHERE c."claimedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "Context" x WHERE x."companyId" = c.id AND x."roleId" IS NOT NULL)`
  const n = Number(found[0]?.n ?? 0)
  if (!opts.write || n === 0) return { found: n, claimed: 0 }
  const claimed = await db.$executeRaw`
    UPDATE "Company" c SET "claimedAt" = c."createdAt"
    WHERE c."claimedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "Context" x WHERE x."companyId" = c.id AND x."roleId" IS NOT NULL)`
  return { found: n, claimed }
}

// ═════════════════════════════════════════════════════════════════════
// ONE FIRM, ONE TENANT
// ═════════════════════════════════════════════════════════════════════
//
// The onboarding walk of 2026-10-27 ended with three companies called
// Quarrybrook Staffing: the supplier signed up (`quarrybrook`), a client's
// approval of its application founded a second (`quarrybrook-staffing`)
// and emailed a claim link that seated its owner on both, and a
// sub-vendor's Add company made a third. Each door looked for the firm by
// a verified domain, and a firm made by the password door has none: its
// Etyme address is its tenant until it proves a domain. So every door
// asks one question, here, before it makes anything: is this firm on
// Etyme already?

/** How a firm was found, said so the screen can say it. */
export type FoundBy = 'DOMAIN' | 'ADDRESS' | 'NAME'

export interface FoundFirm {
  id: string
  name: string
  slug: string
  kind: CompanyKind
  how: FoundBy
  /** One sentence a screen can print: who they are and how we know. */
  says: string
}

export interface FirmFacts {
  /** The domain of a work email at the firm, or of the address it gave. */
  emailDomain?: string | null
  /** Its Etyme address, with or without ".etyme.com". */
  etymeAddress?: string | null
  /** The name it trades under, exactly as typed. */
  name?: string | null
  /**
   * Which world to look in. A demo firm finds only demo firms and a real
   * one only real ones; left unset, the real world.
   */
  isDemo?: boolean
}

/** An Etyme address as typed — "Acme", "acme.etyme.com", "https://acme.etyme.com/" — as the slug. */
export function addressOf(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.etyme\.com$/, '')
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(v) ? v : null
}

/** A domain a company can be known by: not a personal mailbox's, not Etyme's own. */
function firmDomain(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '')
  if (!d || !d.includes('.') || isConsumerDomain(d) || isPlatformDomain(d)) return null
  return d
}

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The firm already on Etyme, or null.
 *
 * Asked in this order, and the first answer wins:
 *   1. a **verified domain** — the company's own, or one it claimed;
 *   2. its **Etyme address**;
 *   3. its **exact name**, but only on a firm whose Owner or Admin signs
 *      in from that same email domain. A name alone proves nothing: two
 *      firms may honestly share one, and a name typed by a stranger must
 *      never attach anything to a real firm.
 *
 * Only firms somebody took possession of (`claimedAt`). A shell another
 * firm wrote down is that firm's record of a counterparty, not a firm on
 * Etyme, and is never returned here.
 */
export async function findFirm(facts: FirmFacts, db: Db = prisma): Promise<FoundFirm | null> {
  const isDemo = facts.isDemo === true
  const live = { claimedAt: { not: null }, isDemo } as const
  const pick = { id: true, name: true, slug: true, kind: true } as const
  const domain = firmDomain(facts.emailDomain)

  if (domain) {
    const byDomain =
      (await db.company.findFirst({ where: { ...live, domain, domainVerified: true }, select: pick })) ??
      (await db.company.findFirst({
        where: { ...live, claimedDomains: { some: { domain, verifiedAt: { not: null } } } },
        select: pick,
      }))
    if (byDomain) return found(byDomain, 'DOMAIN', `${byDomain.name} is on Etyme, on ${domain}.`)
  }

  const address = addressOf(facts.etymeAddress)
  if (address) {
    const byAddress = await db.company.findFirst({ where: { ...live, slug: address }, select: pick })
    if (byAddress) return found(byAddress, 'ADDRESS', `${byAddress.name} is on Etyme, at ${address}.etyme.com.`)
  }

  const name = String(facts.name ?? '').trim()
  if (domain && name.length >= 2) {
    const named = await db.company.findMany({
      where: {
        ...live,
        name: { equals: name, mode: 'insensitive' },
        contexts: {
          some: {
            revokedAt: null,
            role: { name: { in: ['Owner', 'Admin'] } },
            person: { primaryEmail: { endsWith: `@${domain}`, mode: 'insensitive' } },
          },
        },
      },
      select: pick,
      take: 2,
    })
    const exact = named.filter((c) => sameName(c.name, name))
    if (exact.length === 1) {
      return found(exact[0], 'NAME', `${exact[0].name} is on Etyme, run by people on ${domain}.`)
    }
  }

  return null
}

function found(c: { id: string; name: string; slug: string; kind: string }, how: FoundBy, says: string): FoundFirm {
  return { id: c.id, name: c.name, slug: c.slug, kind: c.kind as CompanyKind, how, says }
}

export type FirmByWord =
  | { ok: true; firm: FoundFirm }
  | { ok: false; says: string }

/**
 * A firm somebody names in a box — "Palliser MSP" or "palliser" — when
 * the person typing is at a company and knows the firm by name.
 *
 * The Etyme address first, because it is unique. Then the exact name,
 * only where exactly one firm of the asked kinds holds it; two firms with
 * one name is answered by asking for the address, never by a guess. Used
 * where finding the firm changes nothing on its own: a client granting a
 * seat still grants it (`mayGrantSeat`), an MSP asking still only asks.
 */
export async function findFirmByWord(
  word: string,
  opts: { kinds: CompanyKind[]; isDemo?: boolean; kindWord: string },
  db: Db = prisma,
): Promise<FirmByWord> {
  const typed = String(word ?? '').trim()
  if (typed.length < 2) return { ok: false, says: `Type the ${opts.kindWord}\u2019s name or its Etyme address.` }
  const live = { claimedAt: { not: null }, isDemo: opts.isDemo === true, kind: { in: opts.kinds } } as const
  const pick = { id: true, name: true, slug: true, kind: true } as const

  const address = addressOf(typed)
  if (address) {
    const byAddress = await db.company.findFirst({ where: { ...live, slug: address }, select: pick })
    if (byAddress) return { ok: true, firm: found(byAddress, 'ADDRESS', `${byAddress.name}, at ${address}.etyme.com.`) }
  }
  const named = (await db.company.findMany({
    where: { ...live, name: { equals: typed, mode: 'insensitive' } }, select: pick, take: 3,
  })).filter((c) => sameName(c.name, typed))
  if (named.length === 1) return { ok: true, firm: found(named[0], 'NAME', `${named[0].name}, at ${named[0].slug}.etyme.com.`) }
  if (named.length > 1) {
    return { ok: false, says: `More than one ${opts.kindWord} on Etyme is called ${typed}. Type its Etyme address instead, the part before .etyme.com.` }
  }
  return {
    ok: false,
    says: `No ${opts.kindWord} on Etyme is called ${typed}. Check the spelling, or type its Etyme address, the part before .etyme.com.`,
  }
}

// ── A claim link taken by somebody who already runs the firm ─────────

export interface SignedInSeat {
  personId: string
  email: string
}

export type ClaimOrJoin =
  /** Nothing to join: the ordinary claim goes ahead. */
  | { kind: 'CLAIM' }
  /** The record was folded into the firm the person already runs. */
  | { kind: 'JOINED'; companyId: string; company: string; moved: number; says: string }
  /** A join was due and could not be made safely; nothing changed. */
  | { kind: 'REFUSED'; says: string }

/**
 * Tables whose rows belong to the record itself and are not history: the
 * roles, head office and holidays `createCompany` gives every company. A
 * firm that runs itself already has its own, so the record's go with it.
 */
const SCAFFOLDING = new Set(['Role', 'CompanyLocation', 'Holiday'])

/**
 * Where the firm already has the same row, the record's copy is dropped
 * and the firm's kept: the client's supplier register, its address book,
 * a star and a block. Each says the same thing twice.
 */
const DROP_DUPLICATE = new Set(['Counterparty', 'CompanyContact', 'Favorite', 'Blacklist'])

/**
 * Take a supplier invitation, or join the firm the person already runs.
 *
 * The walk's second Quarrybrook: a client approved the firm's application
 * and wrote it down as a new record, then emailed its claim link to the
 * firm's owner, who already ran Quarrybrook on Etyme. Taking the link
 * seated her as owner of the second record too. A firm already on Etyme
 * is found, never founded again — so where the person taking the link
 * holds the Owner or Admin seat at exactly one firm, and that firm's
 * people sign in on the domain the invitation went to, the client's
 * record of them is folded into that firm: everything that pointed at the
 * record points at the firm, and the record is deleted.
 *
 * Only a record nobody took possession of is folded. Where anything in it
 * would collide with the firm's own rows (two orders numbered alike, two
 * agreements of one kind), nothing is changed and the sentence says who
 * settles it; a merge that loses history silently is worse than two
 * records. The caller (the claim route) still checks the token and that
 * the address may take it; this decides only join or claim.
 */
export async function claimOrJoin(token: string, seat: SignedInSeat, db: PrismaClient = prisma): Promise<ClaimOrJoin> {
  const invite = await db.supplierInvite.findUnique({
    where: { token },
    select: {
      id: true, email: true, state: true, byId: true,
      by: { select: { name: true } },
      company: { select: { id: true, name: true, claimedAt: true, isDemo: true } },
    },
  })
  if (!invite || invite.state === 'REVOKED' || invite.company.claimedAt) return { kind: 'CLAIM' }

  const domain = firmDomain(domainOfEmail(seat.email))
  if (!domain || domain !== firmDomain(domainOfEmail(invite.email))) return { kind: 'CLAIM' }

  const runs = await db.context.findMany({
    where: {
      personId: seat.personId, revokedAt: null,
      role: { name: { in: ['Owner', 'Admin'] } },
      company: { claimedAt: { not: null }, isDemo: invite.company.isDemo, id: { not: invite.company.id } },
    },
    select: { company: { select: { id: true, name: true } } },
  })
  const firms = [...new Map(runs.map((r) => [r.company!.id, r.company!])).values()]
  if (firms.length === 0) return { kind: 'CLAIM' }
  if (firms.length > 1) {
    return {
      kind: 'REFUSED',
      says:
        `You run ${firms.map((f) => f.name).join(' and ')} on Etyme, so this invitation is not taken as a new company. ` +
        `Nothing was changed. Ask ${invite.by.name} to send it again to the address of the firm it is for.`,
    }
  }
  const firm = firms[0]
  const shellId = invite.company.id

  try {
    const moved = await db.$transaction(async (tx) => {
      let n = 0
      // The client's register first: where it already names the firm, keep
      // the firm's row and carry the standing the record had earned.
      const onRecord = await tx.counterparty.findMany({ where: { otherCompanyId: shellId } })
      for (const row of onRecord) {
        const twin = await tx.counterparty.findUnique({
          where: { companyId_otherCompanyId_relationship: { companyId: row.companyId, otherCompanyId: firm.id, relationship: row.relationship } },
          select: { id: true },
        })
        if (twin) {
          await tx.counterparty.update({ where: { id: twin.id }, data: { tier: row.tier, status: row.status } })
          await tx.counterparty.delete({ where: { id: row.id } })
          n++
        }
      }

      for (const fk of await companyForeignKeys(tx)) {
        if (SCAFFOLDING.has(fk.table)) continue
        await tx.$executeRawUnsafe('SAVEPOINT fold')
        try {
          n += await tx.$executeRawUnsafe(`UPDATE "${fk.table}" SET "${fk.column}" = $1 WHERE "${fk.column}" = $2`, firm.id, shellId)
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT fold')
        } catch {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT fold')
          if (!DROP_DUPLICATE.has(fk.table)) throw new FoldConflict(fk.table)
          // Move what does not collide, then drop the record's copies of what does.
          const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "${fk.table}" WHERE "${fk.column}" = $1`, shellId)
          for (const r of rows) {
            await tx.$executeRawUnsafe('SAVEPOINT one')
            try {
              n += await tx.$executeRawUnsafe(`UPDATE "${fk.table}" SET "${fk.column}" = $1 WHERE id = $2`, firm.id, r.id)
              await tx.$executeRawUnsafe('RELEASE SAVEPOINT one')
            } catch {
              await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT one')
              await tx.$executeRawUnsafe(`DELETE FROM "${fk.table}" WHERE id = $1`, r.id)
            }
          }
        }
      }

      // The invitation is taken: by the firm, from now on.
      await tx.supplierInvite.update({ where: { id: invite.id }, data: { state: 'ACCEPTED' } })
      // The record itself, and the roles, office and holidays it was given.
      await tx.company.delete({ where: { id: shellId } })
      await tx.automationLog.create({
        data: {
          companyId: firm.id,
          action: 'FIRM_JOINED',
          summary: `${invite.by.name}\u2019s record of ${invite.company.name} now points at ${firm.name}.`,
          reason:
            `The person who took ${invite.by.name}\u2019s invitation already runs ${firm.name} on Etyme, on the same ` +
            `email domain (${domain}). A firm already here is found, never founded again.`,
          payload: { inviteId: invite.id, recordId: shellId, firmId: firm.id, byPersonId: seat.personId, moved: n },
          // The record is deleted, and its rows cannot be told apart from the firm's afterwards.
          reversible: false,
        },
      })
      return n
    }, { timeout: 30_000 })

    return {
      kind: 'JOINED', companyId: firm.id, company: firm.name, moved,
      says: `${invite.by.name} now works with ${firm.name}, the company you already run here. No second company was made.`,
    }
  } catch (err) {
    if (!(err instanceof FoldConflict)) throw err
    return {
      kind: 'REFUSED',
      says:
        `${invite.by.name} already holds records about ${invite.company.name} that would clash with ${firm.name}\u2019s own ` +
        `(${err.table}). Nothing was changed. Ask ${invite.by.name} to settle which is right before this link is taken.`,
    }
  }
}

class FoldConflict extends Error {
  constructor(readonly table: string) { super(`fold conflict in ${table}`) }
}

/** Every column in the database that points at a company, read from the database itself so a new table is never missed. */
async function companyForeignKeys(db: Db): Promise<{ table: string; column: string }[]> {
  return db.$queryRaw<{ table: string; column: string }[]>`
    SELECT kcu.table_name AS "table", kcu.column_name AS "column"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema()
      AND ccu.table_name = 'Company' AND ccu.column_name = 'id'
    ORDER BY 1, 2`
}

/**
 * Whether two firms already work together on Etyme: an agreement, a row on
 * either's register, an order either way, a contract, or a job one sent
 * the other. The same five facts `POST /api/contracts` reads before it lets
 * a firm name another as its client, so linking a register row to a firm
 * on Etyme never opens a door the contract route keeps shut.
 */
export async function workTogether(aId: string, bId: string, db: Db = prisma): Promise<boolean> {
  if (aId === bId) return false
  const either = <T extends string>(x: T, y: T) => [{ [x]: aId, [y]: bId }, { [x]: bId, [y]: aId }]
  const hit =
    (await db.masterAgreement.findFirst({ where: { OR: either('vendorId', 'clientId') }, select: { id: true } })) ??
    (await db.counterparty.findFirst({ where: { OR: either('companyId', 'otherCompanyId') }, select: { id: true } })) ??
    (await db.workOrder.findFirst({ where: { OR: either('issuedById', 'issuedToId') }, select: { id: true } })) ??
    (await db.sellContract.findFirst({ where: { OR: either('companyId', 'clientCompanyId') }, select: { id: true } })) ??
    (await db.requirementInvitation.findFirst({
      where: { OR: [{ toCompanyId: aId, requirement: { companyId: bId } }, { toCompanyId: bId, requirement: { companyId: aId } }] },
      select: { id: true },
    }))
  return hit !== null
}
