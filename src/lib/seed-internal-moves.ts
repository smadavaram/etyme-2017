/**
 * The founder's own example, seeded: an integrator's people moving
 * between its projects (CLAUDE.md, "How an integrator's people move
 * between its projects", 2026-09-30).
 *
 * Teleworld Solutions runs two client projects in two cities:
 *
 *   Tualatin   Northbend Athletic's retail finance systems, managed by
 *              Ingrid Solberg. Felix Brenner (ERP finance) comes off it in
 *              eighteen days, and Ingrid has flagged him. Amara Nwosu
 *              (data) comes off in twenty-five, and Ingrid is keeping her
 *              until day forty-five — "staying with me until".
 *   San Jose   Harlow Health's ERP finance migration, managed by Rahul
 *              Deshpande. Deepa Varma is on it for eight more months, and
 *              the project runs under Harlow Health's order, which is the
 *              position Rahul holds somebody for.
 *
 * And Farah Haddad at Teleworld's HR desk, who is told of every step and
 * approves none of them. Karthik Menon, already between projects since
 * his Corveldt placement ended, is on Our bench beside them.
 *
 * Nothing is held, confirmed or moved here: those are the acts the demo
 * exists to show. Runs before the order-to-cash layer, which raises the
 * order each running line sits on — Harlow Health's to Teleworld among
 * them — so a second seeding writes nothing. Every date counts from the
 * world's own day (`lib/seed-days`).
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { rolesFor } from '@/lib/company-defaults'
import { writeCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { holidayKeys } from '@/lib/seed-calendar'
import type { SeedContext } from '@/lib/seed-pipeline'

const emailOf = (name: string) =>
  `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.')}@seed.etyme.invalid`

/** The two projects, by the unit that delivers each inside Teleworld. */
// The founder's example said Portland; the project sits at Northbend
// Athletic's one site, in Tualatin, where every other Northbend job is
// seeded. A client read "Portland, OR" on its Ending soon beside
// "Tualatin, OR" everywhere else (client tester, 2026-10-03). The
// constant keeps its name: an identifier is not a word anybody reads.
export const PORTLAND_PROJECT = 'Northbend Athletic — retail finance systems, Tualatin'
export const SAN_JOSE_PROJECT = 'Harlow Health — ERP finance migration, San Jose'

/** Staff seated at Teleworld for this story, and the address each signs in on. */
export const MOVE_DESKS = {
  portland: { name: 'Ingrid Solberg', role: 'Delivery Manager', desk: 'delivery-portland', unit: PORTLAND_PROJECT },
  sanJose: { name: 'Rahul Deshpande', role: 'Delivery Manager', desk: 'delivery-sanjose', unit: SAN_JOSE_PROJECT },
  hr: { name: 'Farah Haddad', role: 'HR', desk: 'hr', unit: null },
} as const

interface Line {
  person: string
  client: string
  site: { name: string; city: string; state: string }
  role: string
  skills: string[]
  unit: string
  bill: number
  pay: number
  start: number
  end: number
  release?: { keepUntil: number | null }
}

const LINES: Line[] = [
  {
    person: 'Felix Brenner', client: 'nike', site: { name: 'Tualatin site', city: 'Tualatin', state: 'OR' },
    role: 'Retail finance systems consultant', skills: ['ERP finance', 'General ledger', 'Retail'],
    unit: PORTLAND_PROJECT, bill: 13_200, pay: 8_600, start: -120, end: 18, release: { keepUntil: null },
  },
  {
    person: 'Amara Nwosu', client: 'nike', site: { name: 'Tualatin site', city: 'Tualatin', state: 'OR' },
    role: 'Retail data engineer', skills: ['Data pipelines', 'SQL', 'Retail analytics'],
    unit: PORTLAND_PROJECT, bill: 12_400, pay: 8_100, start: -90, end: 25, release: { keepUntil: 45 },
  },
  {
    person: 'Deepa Varma', client: 'harlow-health', site: { name: 'San Jose campus', city: 'San Jose', state: 'CA' },
    role: 'ERP finance migration — integration architect', skills: ['Integration architecture', 'ERP finance', 'APIs'],
    unit: SAN_JOSE_PROJECT, bill: 14_800, pay: 9_700, start: -60, end: 240,
  },
]

export async function seedInternalMoves(ctx: SeedContext): Promise<{ lines: number; releases: number }> {
  const teleworld = ctx.firmBySlug.get('teleworld')
  if (!teleworld) return { lines: 0, releases: 0 }
  const out = { lines: 0, releases: 0 }

  // The two projects, each a unit inside Teleworld its manager sits on.
  const unitId = new Map<string, string>()
  for (const name of [PORTLAND_PROJECT, SAN_JOSE_PROJECT]) {
    const u =
      (await db.orgUnit.findFirst({ where: { companyId: teleworld.id, name }, select: { id: true } })) ??
      (await db.orgUnit.create({ data: { companyId: teleworld.id, name, kind: 'PROJECT' }, select: { id: true } }))
    unitId.set(name, u.id)
  }

  // The roles, with the permissions the defaults give them.
  const roleId = new Map<string, string>()
  for (const name of ['Delivery Manager', 'HR']) {
    const seed = rolesFor('GSI').find((r) => r.name === name)!
    const r =
      (await db.role.findFirst({ where: { companyId: teleworld.id, name }, select: { id: true } })) ??
      (await db.role.create({ data: { companyId: teleworld.id, name, permissions: seed.permissions, isDefault: false }, select: { id: true } }))
    roleId.set(name, r.id)
  }

  const staff = new Map<string, string>()
  for (const d of Object.values(MOVE_DESKS)) {
    const email = `${ctx.prefix}teleworld-${d.desk}@${ctx.domain}`
    const p = await db.person.upsert({ where: { primaryEmail: email }, update: { name: d.name }, create: { name: d.name, primaryEmail: email } })
    if (!(await db.context.findFirst({ where: { personId: p.id, companyId: teleworld.id } }))) {
      await db.context.create({
        data: {
          personId: p.id, companyId: teleworld.id, roleId: roleId.get(d.role)!, type: 'EMPLOYEE', persona: d.unit ? 'MANAGER' : 'INDIVIDUAL',
          orgUnitId: d.unit ? unitId.get(d.unit)! : null,
          grantReason: d.unit ? `Delivery manager — ${d.unit}` : 'HR — the firm’s own people',
        },
      })
    }
    staff.set(d.name, p.id)
  }

  for (const l of LINES) {
    const person = await db.person.findUnique({ where: { primaryEmail: emailOf(l.person) }, select: { id: true } })
    const client = ctx.firmBySlug.get(l.client)
    if (!person || !client) continue

    const site =
      (await db.companyLocation.findFirst({ where: { companyId: client.id, name: l.site.name }, select: { id: true } })) ??
      (await db.companyLocation.create({
        data: { companyId: client.id, name: l.site.name, city: l.site.city, state: l.site.state, country: 'US', isPrimary: false },
        select: { id: true },
      }))
    const loc = `${l.site.city}, ${l.site.state}`
    const requirement =
      (await db.requirement.findFirst({ where: { companyId: client.id, title: l.role }, select: { id: true } })) ??
      (await db.requirement.create({
        data: {
          companyId: client.id, title: l.role, skills: l.skills, location: loc,
          billMin: l.bill - 1_000, billMax: l.bill + 600, months: 12, headcount: 1, hoursPerWeek: 40,
          status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL', neededBy: day(l.start),
        },
        select: { id: true },
      }))

    let sell = await db.sellContract.findFirst({
      where: { companyId: teleworld.id, personId: person.id, requirementId: requirement.id },
      select: { id: true, startDate: true, endDate: true },
    })
    if (!sell) {
      sell = await db.sellContract.create({
        data: {
          companyId: teleworld.id, clientCompanyId: client.id, endClientCompanyId: client.id, personId: person.id,
          requirementId: requirement.id, workLocationId: site.id, deliveryUnitId: unitId.get(l.unit)!,
          billRate: l.bill, billCurrency: 'USD', paymentTerms: 45, state: 'IN_PROGRESS',
          startDate: day(l.start), endDate: day(l.end), startConfirmedAt: day(l.start),
        },
        select: { id: true, startDate: true, endDate: true },
      })
      const buy = await db.buyContract.create({
        data: {
          companyId: teleworld.id, vendorCompanyId: null, payCurrency: 'USD', contractType: 'W2', state: 'IN_PROGRESS',
          startDate: day(l.start), endDate: day(l.end), workOrderId: null,
        },
        select: { id: true, contractType: true, vendorCompanyId: true },
      })
      await db.buyContractCandidate.create({
        data: { buyContractId: buy.id, personId: person.id, payRate: l.pay, payCurrency: 'USD', startDate: day(l.start), endDate: day(l.end) },
      })
      await db.contractLink.create({ data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: day(l.start), effectiveTo: day(l.end) } })
      await writeCyclesFor(db, { sell, buy, packId: 'US_IT', holidays: holidayKeys(), pay: DEMO_MONTHLY_PAY })
      out.lines++
    }
    if (!(await db.submission.findFirst({ where: { requirementId: requirement.id, personId: person.id } }))) {
      await db.submission.create({
        data: {
          requirementId: requirement.id, personId: person.id, fromCompanyId: teleworld.id, toCompanyId: client.id,
          // The firm's own employee, so the kind is INTERNAL — computed
          // from ownership everywhere else; this is what that looks like.
          kind: 'INTERNAL', rate: l.bill, status: 'PLACED', checkState: 'SENT',
          submittedAt: day(l.start - 21), decidedAt: day(l.start - 6),
        },
      })
    }

    if (l.release && !(await db.projectRelease.findUnique({ where: { sellContractId: sell.id } }))) {
      await db.projectRelease.create({
        data: {
          companyId: teleworld.id, personId: person.id, sellContractId: sell.id,
          releasedById: staff.get(MOVE_DESKS.portland.name)!,
          rollsOffOn: day(l.end),
          keepUntil: l.release.keepUntil != null ? day(l.release.keepUntil) : null,
          createdAt: day(-2),
        },
      })
      out.releases++
    }
  }
  return out
}
