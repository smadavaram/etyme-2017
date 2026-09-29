import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld, WORLD_SLUGS } from '@/lib/seed-world'
import { SECTOR_SUPPLIERS, sectorStart } from '@/lib/seed-sector-suppliers'
import { SUPPLIER_SEATS } from '@/app/demo/seats'
import { requirementsFor } from '@/lib/document-requirements'

import { POST as demo } from '@/app/api/demo/route'
import { GET as myPapers } from '@/app/api/me/papers/route'
import { GET as myWork } from '@/app/api/me/work/route'

/**
 * Two suppliers outside IT, on the seeded world.
 *
 * CLAUDE.md: horizontal, never vertical. Sorrelwood Clinical Staffing
 * sells an occupational health nurse to Talvern Medical; Quarrystone
 * Industrial Staffing sells a forming line maintenance technician to
 * Cavanaugh Glassworks. Each is the firm's own W2, placed through an
 * award, cleared on paper, and working weeks signed top to bottom.
 */

const [NURSE, TECH] = SECTOR_SUPPLIERS

async function lineOf(s: (typeof SECTOR_SUPPLIERS)[number]) {
  const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: s.person.email } })
  const sell = await prisma.sellContract.findFirstOrThrow({
    where: { personId: person.id, company: { slug: `world-${s.slug}` } },
    include: { buyLinks: { include: { buyContract: { include: { candidates: true } } } }, clientCompany: true, workOrder: true },
  })
  return { person, sell, buy: sell.buyLinks[0].buyContract }
}

async function census() {
  const firms = await prisma.company.findMany({ where: { slug: { in: SECTOR_SUPPLIERS.map((s) => `world-${s.slug}`) } } })
  const ids = firms.map((f) => f.id)
  return {
    firms: firms.length,
    seats: await prisma.context.count({ where: { companyId: { in: ids } } }),
    sells: await prisma.sellContract.count({ where: { companyId: { in: ids } } }),
    buys: await prisma.buyContract.count({ where: { companyId: { in: ids } } }),
    timesheets: await prisma.timesheet.count({ where: { sellContract: { companyId: { in: ids } } } }),
    assertions: await prisma.workAssertion.count({ where: { timesheet: { sellContract: { companyId: { in: ids } } } } }),
    verifications: await prisma.verification.count({
      where: { OR: [{ companyId: { in: ids } }, { person: { primaryEmail: { in: SECTOR_SUPPLIERS.map((s) => s.person.email) } } }] },
    }),
    papers: await prisma.docInstance.count({ where: { template: { companyId: { in: ids } } } }),
    submissions: await prisma.submission.count({ where: { fromCompanyId: { in: ids } } }),
    cycles: await prisma.cycle.count({ where: { OR: [{ sellContract: { companyId: { in: ids } } }, { buyContract: { companyId: { in: ids } } }] } }),
  }
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
}, 900_000)

describe('two suppliers outside IT on the seeded world', () => {
  it('a healthcare staffing firm supplies Talvern Medical and an industrial staffing firm supplies Cavanaugh Glassworks', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      expect(WORLD_SLUGS).toContain(`world-${s.slug}`)
      const { sell, buy } = await lineOf(s)
      expect(sell.clientCompany.slug).toBe(`world-${s.client}`)
      expect(sell.state).toBe('IN_PROGRESS')
      expect(sell.billRate).toBe(s.bill)
      expect(buy.contractType).toBe('W2')
      expect(buy.vendorCompanyId).toBeNull()
      expect(buy.candidates[0].payRate).toBe(s.pay)
      // The order-to-cash layer raised the order the line sits on.
      expect(sell.workOrder, `${s.name} has no order`).toBeTruthy()
    }
    expect((await lineOf(NURSE)).sell.clientCompany.name).toBe('Talvern Medical')
    expect((await lineOf(TECH)).sell.clientCompany.name).toBe('Cavanaugh Glassworks')
  })

  it('each firm has one owner seat, and the demo door seats the visitor there', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      const company = await prisma.company.findUniqueOrThrow({ where: { slug: `world-${s.slug}` } })
      expect(company.kind).toBe('VENDOR')
      expect(company.claimedAt).not.toBeNull()
      const staff = await prisma.context.findMany({ where: { companyId: company.id, type: 'EMPLOYEE' }, include: { role: true } })
      expect(staff.map((c) => c.role?.name)).toEqual(['Owner'])
      const res = await demo(req('POST', '/api/demo', { as: `world-${s.slug}` }) as never)
      const body = await res.json()
      expect(res.status, JSON.stringify(body)).toBe(200)
      expect(body.data.companyName).toBe(s.name)
    }
  })

  it('each worker was awarded as the firm’s own employee, with no bench listing behind it', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      const { person, sell } = await lineOf(s)
      const sub = await prisma.submission.findFirstOrThrow({ where: { requirementId: sell.requirementId!, personId: person.id } })
      expect(sub.kind).toBe('INTERNAL')
      expect(sub.status).toBe('PLACED')
      const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: sell.requirementId! } })
      expect(requirement.status).toBe('FILLED')
      expect(await prisma.benchListing.count({ where: { consultant: { personId: person.id } } })).toBe(0)
    }
  })

  it('the nurse’s line requires her state nursing license, and it is on file and in date', async () => {
    const { person, buy } = await lineOf(NURSE)
    const set = await requirementsFor({ buyContractId: buy.id })
    expect(set!.items.map((i) => i.key)).toContain('PROFESSIONAL_LICENSE')
    const license = await prisma.verification.findFirstOrThrow({ where: { personId: person.id, type: 'PROFESSIONAL_LICENSE' } })
    expect(license.status).toBe('CLEAR')
    expect(license.provider).toBe('Colorado Board of Nursing')
    expect(+license.expiresAt!).toBeGreaterThan(+(await lineOf(NURSE)).sell.endDate!)
    // The technician's is not a licensed occupation, and is not asked for one.
    const tech = await requirementsFor({ buyContractId: (await lineOf(TECH)).buy.id })
    expect(tech!.items.map((i) => i.key)).not.toContain('PROFESSIONAL_LICENSE')
  })

  it('every document either worker owes on their line is on file, so neither page chases them for anything', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      as(s.person.email)
      const r = await json(await myPapers(req('GET', '/api/me/papers')))
      expect(r.status).toBe(200)
      const papers: any[] = r.body.data.papers
      // What she holds is listed; nothing is still asked of her.
      expect(papers.filter((p) => p.kind === 'HELD').length, s.person.name).toBeGreaterThanOrEqual(2)
      const owed = papers.filter((p) => p.kind === 'OUTSTANDING' || p.todo)
      expect(owed.map((o) => `${o.name}: ${o.word}`), s.person.name).toEqual([])
    }
  })

  it('each firm’s cover and certificate of good standing are on file and in date', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      const company = await prisma.company.findUniqueOrThrow({ where: { slug: `world-${s.slug}` } })
      for (const type of ['INSURANCE_GL', 'INSURANCE_WC', 'GOOD_STANDING'] as const) {
        const v = await prisma.verification.findFirstOrThrow({ where: { companyId: company.id, type } })
        expect(v.status).toBe('CLEAR')
        expect(+v.validFrom!).toBeLessThan(Date.now())
        expect(+v.expiresAt!).toBeGreaterThan(Date.now())
      }
    }
  })

  it('every week is signed by the client at the bill rate and then accepted by the employer at the pay rate', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      const { sell } = await lineOf(s)
      const sheets = await prisma.timesheet.findMany({
        where: { sellContractId: sell.id }, include: { assertions: true }, orderBy: { periodStart: 'asc' },
      })
      const signed = sheets.filter((t) => t.status === 'APPROVED')
      expect(signed.length, s.name).toBeGreaterThanOrEqual(4)
      expect(+sheets[0].periodStart).toBe(+sectorStart(s))
      for (const t of signed) {
        const client = t.assertions.find((a) => a.role === 'CLIENT_APPROVAL')!
        const employer = t.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE')!
        expect(client.rateCents).toBe(s.bill)
        expect(employer.rateCents).toBe(s.pay)
        expect(+employer.at).toBeGreaterThan(+client.at)
        expect(Object.keys(t.days as object).every((d) => [1, 2, 3, 4, 5].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))).toBe(true)
      }
    }
  })

  it('what each door says is waiting is true of the world behind it', async () => {
    // Sorrelwood: the nurse's latest week is filed and nobody has signed it.
    const nurse = await lineOf(NURSE)
    const latest = await prisma.timesheet.findFirstOrThrow({
      where: { sellContractId: nurse.sell.id }, orderBy: { periodStart: 'desc' }, include: { assertions: true },
    })
    expect(latest.status).toBe('SUBMITTED')
    expect(latest.assertions).toHaveLength(0)
    expect(SUPPLIER_SEATS.find((d) => d.slug === 'world-sorrelwood')!.waiting).toContain('waits for Talvern')

    // Quarrystone: every week is signed by both sides and none is billed.
    const tech = await lineOf(TECH)
    const weeks = await prisma.timesheet.findMany({ where: { sellContractId: tech.sell.id }, include: { assertions: true } })
    expect(weeks.every((w) => w.status === 'APPROVED' && w.assertions.length === 2)).toBe(true)
    expect(await prisma.invoiceLine.count({ where: { timesheetId: { in: weeks.map((w) => w.id) } } })).toBe(0)
    expect(SUPPLIER_SEATS.find((d) => d.slug === 'world-quarrystone')!.waiting).toContain('None of them is billed')
  })

  it('each worker’s own page opens on the placement at the pay rate', async () => {
    for (const s of SECTOR_SUPPLIERS) {
      const { sell } = await lineOf(s)
      as(s.person.email)
      const r = await json(await myWork(req('GET', '/api/me/work')))
      expect(r.status).toBe(200)
      const line = r.body.data.placements.find((p: any) => p.id === sell.id)
      expect(line, JSON.stringify(r.body.data.placements)).toBeTruthy()
      expect(line.payRate).toBe(s.pay)
    }
  })

  it('seeding the world twice writes neither firm’s history again', async () => {
    const first = await census()
    expect(first.firms).toBe(2)
    await seedWorld()
    expect(await census()).toEqual(first)
  }, 900_000)
})
