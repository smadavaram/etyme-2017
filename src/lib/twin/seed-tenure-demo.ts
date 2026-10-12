/**
 * One Northbend Athletic contractor exactly 60 days from the time limit,
 * on the day the world is born.
 *
 * The founder's brief, 2026-10-12: the twin's demo opens on the time-limit
 * warning, so the seeded desk has to hold one. None of the program's
 * existing people sits there — Lucía Fernández is about 120 days out and
 * Kwame Mensah is past it and away — and moving either would move the
 * dates a dozen tests and the tester's notes already name. So this adds
 * one person, through two suppliers, the case the ledger exists for:
 * Brightmoor Staffing for the first stretch, Pinnacle Resourcing from the
 * next day on, one unbroken stay that neither supplier can add up alone.
 *
 * **The start is computed from the limit, not typed.** Northbend's time
 * limit is its own rule (`PROGRAMMES` in lib/seed-programmes, the row the
 * governance seed writes); the limit is reached on the `daysFor(cap)`-th
 * day on site, so somebody who started `daysFor(cap) - 1 - 60` days before
 * the world was born reaches it 60 days after. Change the limit and the
 * start follows.
 *
 * **Every date is `day(n)` from lib/seed-days**, counted from the world's
 * birthday, so a reseed on a later day finds the same rows and changes
 * nothing. Idempotent by (seller, person, client, job request): a row
 * already there is moved onto the planned dates and state, never
 * duplicated.
 *
 * The architect owns the seed files and wires this in after
 * `seedProgrammes` for the Northbend share; nothing calls it until then.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { daysFor } from '@/lib/tenure-days'
import { PROGRAMMES, type World } from '@/lib/seed-programmes'
import { DEMO_MONTHLY_PAY, writeCyclesFor } from '@/lib/contract-cycles'
import { holidayKeys } from '@/lib/seed-calendar'

/** Days from the world's birthday to the day the demo person reaches the limit. */
export const DAYS_TO_LIMIT = 60

const northbend = PROGRAMMES.find((p) => p.client === 'nike')!

/** Northbend's own time limit, in months, as its governance rule is seeded. */
export const NORTHBEND_LIMIT_MONTHS = northbend.governance.tenureCapMonths

/** The demo's two lines, as data. Read by the seed and by its test. */
export interface DemoLine {
  /** The supplier's slug; the client pays it directly. */
  via: string
  role: string
  skills: string[]
  /** Cents an hour: the bill rate to Northbend, then the supplier's pay. */
  rates: [number, number]
  startedDaysAgo: number
  /** Negative: ended that many days before the world was born. */
  endsInDays: number
  state: 'ENDED' | 'IN_PROGRESS'
}

const STARTED = daysFor(NORTHBEND_LIMIT_MONTHS) - 1 - DAYS_TO_LIMIT
// The handover: the Brightmoor line's last day is the day before Pinnacle's first.
const SWITCH = 200

export const TENURE_DEMO = {
  person: 'Tobias Lindqvist',
  loc: 'Tualatin, OR',
  lines: [
    { via: 'brightmoor', role: 'Merchandise planning analyst', skills: ['Merchandise planning', 'Assortment planning', 'Excel'],
      rates: [9400, 7000], startedDaysAgo: STARTED, endsInDays: -(SWITCH + 1), state: 'ENDED' },
    { via: 'pinnacle', role: 'Merchandise planning lead', skills: ['Merchandise planning', 'Assortment planning', 'Allocation'],
      rates: [10200, 7600], startedDaysAgo: SWITCH, endsInDays: 165, state: 'IN_PROGRESS' },
  ] satisfies DemoLine[],
} as const

const emailOf = (name: string) =>
  `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`

/**
 * Write or move the demo person's two lines at Northbend. Returns how many
 * lines were created (zero on a reseed).
 */
export async function seedTenureDemo(world: World): Promise<{ created: number; moved: number }> {
  const client = world.firmBySlug.get('nike')
  if (!client) return { created: 0, moved: 0 }
  const who = await db.person.upsert({
    where: { primaryEmail: emailOf(TENURE_DEMO.person) },
    update: {},
    create: { name: TENURE_DEMO.person, primaryEmail: emailOf(TENURE_DEMO.person) },
  })

  let created = 0, moved = 0
  for (const l of TENURE_DEMO.lines) {
    const seller = world.firmBySlug.get(l.via)
    if (!seller) continue
    const start = day(-l.startedDaysAgo), end = day(l.endsInDays)

    const requirement =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: l.role } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: l.role, skills: [...l.skills], location: TENURE_DEMO.loc,
          billMin: l.rates[0] - 1500, billMax: l.rates[0] + 500, months: 12, headcount: 1,
          status: l.state === 'ENDED' ? 'CLOSED' : 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL',
          neededBy: start, hoursPerWeek: 40,
        },
      }))

    const existing = await db.sellContract.findFirst({
      where: { companyId: seller.id, personId: who.id, clientCompanyId: client.id, requirementId: requirement.id },
      select: { id: true, startDate: true, endDate: true, state: true },
    })
    if (existing) {
      const same = existing.startDate.getTime() === start.getTime() &&
        existing.endDate?.getTime() === end.getTime() && existing.state === l.state
      if (!same) {
        await db.sellContract.update({ where: { id: existing.id }, data: { startDate: start, endDate: end, state: l.state } })
        await db.buyContract.updateMany({
          where: { companyId: seller.id, sellLinks: { some: { sellContractId: existing.id } } },
          data: { startDate: start, endDate: end, state: l.state },
        })
        moved++
      }
      continue
    }

    const msa = await db.masterAgreement.findFirst({ where: { vendorId: seller.id, clientId: client.id } })
    const sell = await db.sellContract.create({
      data: {
        companyId: seller.id, clientCompanyId: client.id, endClientCompanyId: client.id,
        personId: who.id, requirementId: requirement.id, msaId: msa?.id ?? null,
        billRate: l.rates[0], billCurrency: 'USD', paymentTerms: 45, state: l.state,
        startDate: start, endDate: end,
      },
    })
    const buy = await db.buyContract.create({
      data: {
        companyId: seller.id, vendorCompanyId: null, payCurrency: 'USD', contractType: 'W2',
        state: l.state, startDate: start, endDate: end,
      },
    })
    await db.buyContractCandidate.create({
      data: { buyContractId: buy.id, personId: who.id, payRate: l.rates[1], payCurrency: 'USD', startDate: start, endDate: end },
    })
    await db.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: start, effectiveTo: end } })
    if (l.state !== 'ENDED') {
      await writeCyclesFor(db, { sell, buy, packId: 'US_IT', holidays: holidayKeys(), pay: DEMO_MONTHLY_PAY })
    }
    created++
  }
  return { created, moved }
}
