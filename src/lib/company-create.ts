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
import { isPlatformDomain } from '@/lib/company-domains'
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
