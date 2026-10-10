/**
 * Bench that reaches a client's job request through matching — seeded.
 *
 * Decided 2026-09-30: matching brings available bench to a job request,
 * suppliers first, then the other firms the client works with, then —
 * only where the person said yes to it — a suggestion from a firm that is
 * not a supplier yet, shown without the person's name or rate.
 *
 * Northbend Athletic's open HCM integration lead is the job, and four
 * people answer it, one per circle a client can see:
 *
 *   Tamsin Okoro       on Pinnacle Resourcing's bench — a supplier
 *   Jonas Whitaker     on Brightmoor Staffing's bench — a supplier, and a
 *                      person who chose to stay fifteen days
 *   Priscilla Adeyemi  on Halcyon Talent's bench — a firm that holds
 *                      Northbend on its register from a finished statement
 *                      of work, and is not on Northbend's supplier panel
 *   Mateo Villanueva   on Orchid Systems' bench — no tie to Northbend at
 *                      all, and he said yes to being shown in matches
 *
 * Then matching runs as Northbend, so the job request opens with its
 * matches on it. Every date counts from the world's own day
 * (`lib/seed-days`), so a second seeding changes nothing.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { runMatchEngine } from '@/lib/match-engine'
import { stayFields } from '@/lib/bench-stay'
import type { SeedContext } from '@/lib/seed-pipeline'

interface Offered {
  name: string
  firm: string
  skills: string[]
  location: string
  workAuth: string
  rateFloor: number
  rate: [number, number]
  stayDays: number | null
  showInMatches: boolean
  headline: string
}

export const OFFERED: Offered[] = [
  {
    name: 'Tamsin Okoro', firm: 'pinnacle', skills: ['HCM integration', 'Payroll interfaces', 'Integrations', 'Boomi'],
    location: 'Portland, OR', workAuth: 'GC', rateFloor: 9_800, rate: [11_800, 12_900], stayDays: null, showInMatches: false,
    headline: 'HCM integration lead, payroll interfaces',
  },
  {
    name: 'Jonas Whitaker', firm: 'brightmoor', skills: ['HCM integration', 'Integrations', 'REST APIs'],
    location: 'Tualatin, OR', workAuth: 'USC', rateFloor: 10_200, rate: [12_200, 13_400], stayDays: 15, showInMatches: false,
    headline: 'Integration engineer, HR systems',
  },
  {
    name: 'Priscilla Adeyemi', firm: 'halcyon', skills: ['HCM integration', 'Payroll interfaces', 'Workforce data'],
    location: 'Seattle, WA', workAuth: 'USC', rateFloor: 10_500, rate: [12_500, 13_600], stayDays: null, showInMatches: false,
    headline: 'Payroll interfaces and HCM data',
  },
  {
    name: 'Mateo Villanueva', firm: 'orchid', skills: ['HCM integration', 'Payroll interfaces', 'Integrations'],
    location: 'Remote', workAuth: 'GC', rateFloor: 9_900, rate: [11_900, 13_000], stayDays: null, showInMatches: true,
    headline: 'Mateo Villanueva — HCM integrations',
  },
]

export const NORTHBEND_JOB = 'HCM integration lead'

export async function seedBenchMatching(ctx: SeedContext): Promise<{ listings: number; matches: number }> {
  const northbend = ctx.firmBySlug.get('nike')
  const halcyon = ctx.firmBySlug.get('halcyon')
  if (!northbend || !halcyon) return { listings: 0, matches: 0 }

  // Halcyon did a statement of work for Northbend's store systems last
  // year and keeps Northbend on its own register as a client. Northbend
  // never put Halcyon on its supplier panel. So the two trade, and
  // Halcyon's marketed bench reaches Northbend's job — below its suppliers.
  const tie = await db.counterparty.findUnique({
    where: { companyId_otherCompanyId_relationship: { companyId: halcyon.id, otherCompanyId: northbend.id, relationship: 'CLIENT' } },
    select: { id: true },
  })
  if (!tie) {
    await db.counterparty.create({
      data: {
        companyId: halcyon.id, otherCompanyId: northbend.id, relationship: 'CLIENT', status: 'ACTIVE',
        since: day(-420), notes: 'Store systems statement of work, 2025. Closed; kept on the register.',
      },
    })
  }

  let listings = 0
  for (const o of OFFERED) {
    const firm = ctx.firmBySlug.get(o.firm)
    if (!firm) continue
    const email = `${o.name.toLowerCase().replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`
    const person = await db.person.upsert({ where: { primaryEmail: email }, update: {}, create: { name: o.name, primaryEmail: email } })
    const profile =
      (await db.consultantProfile.findUnique({ where: { personId: person.id }, select: { id: true } })) ??
      (await db.consultantProfile.create({
        data: {
          personId: person.id, skills: o.skills, location: o.location, workAuth: o.workAuth,
          rateFloor: o.rateFloor, headline: o.headline, visibility: 'VERIFIED', confirmedAt: day(-3),
        },
        select: { id: true },
      }))
    const held = await db.benchListing.findUnique({
      where: { consultantId_companyId: { consultantId: profile.id, companyId: firm.id } },
      select: { id: true },
    })
    if (!held) {
      await db.benchListing.create({
        data: {
          consultantId: profile.id, companyId: firm.id, tier: 'MARKETING', state: 'GRANTED',
          rateMin: o.rate[0], rateMax: o.rate[1],
          invitedAt: day(-3), respondedAt: day(-2), grantedAt: day(-2),
          ...stayFields(o.stayDays, day(-2)),
          showInMatches: o.showInMatches,
        },
      })
      listings++
    }
  }

  // Matching, as Northbend would run it. Once: a job request that already
  // has matches keeps them, so a second seeding writes nothing.
  const job = await db.requirement.findFirst({
    where: { companyId: northbend.id, title: NORTHBEND_JOB },
    select: { id: true, _count: { select: { matches: true } } },
  })
  let matches = 0
  if (job && job._count.matches === 0) {
    const run = await runMatchEngine(job.id, { limit: 10, viewerCompanyId: northbend.id })
    matches = run.matches.length
  }
  return { listings, matches }
}
