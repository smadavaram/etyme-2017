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
  const country = knownCountry(input.country) ?? countryFromDomain(input.domain)
  const currency = knownCurrency(input.currency) ?? currencyFor(country)
  const templatePack = packFor(input.kind, country)
  const payRhythm = payRhythmForPack(templatePack)
  const now = new Date()

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
      name,
      slug: input.slug,
      domain: input.domain,
      // The identity provider proved the work domain. No domain, nothing proved.
      domainVerified: input.domain !== null,
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
      siteLiveAt: now,
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

  if (input.claimDomain && input.domain) {
    const held = await db.companyDomain.findUnique({ where: { domain: input.domain }, select: { id: true } })
    if (!held) {
      await db.companyDomain.create({
        data: {
          companyId: company.id,
          domain: input.domain,
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
          data: { personId: input.byPersonId, type: 'EMPLOYEE', companyId: company.id, roleId: ownerRoleId },
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
    data: { companyId: company.id, name: primaryLocationName(name), country, isPrimary: true },
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
