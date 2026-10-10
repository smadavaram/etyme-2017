import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as myBenches } from '@/app/api/me/benches/route'
import { costCenterCode } from '@/lib/seed-coding'
import { calendarWeeks, karthikWindow } from '@/lib/seed-doors'
import { seedToday } from '@/lib/seed-days'
import { rolesFor } from '@/lib/company-defaults'

/**
 * What testers found on the seeded world on 2026-09-30, each as the
 * sentence the world now satisfies.
 */

const MARISOL = 'marisol.quintero@seed.etyme.invalid'

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('the seeded world reads plainly to somebody walking it for the first time', () => {
  it('no budget at any seeded client carries a retired company’s name, and Northbend Athletic’s read APPS-NORTHBEND-4100', async () => {
    const codes = (await prisma.costCenter.findMany({
      where: { company: { slug: { startsWith: 'world-' } } },
      select: { code: true },
    })).map((c) => c.code)
    expect(codes.length).toBeGreaterThan(10)
    expect(codes.filter((c) => /NIKE|CORN(?!ER)|TERU/.test(c))).toEqual([])
    expect(codes).toContain(costCenterCode('APPS', 'Northbend Athletic'))
  })

  it('Marisol Quintero has one firm’s question waiting on her own page, which she has not answered', async () => {
    as(MARISOL)
    const r = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(r.status).toBe(200)
    expect(r.body.data.invited.map((i: { company: { name: string } | string }) =>
      typeof i.company === 'string' ? i.company : i.company.name)).toEqual(['Brightmoor Staffing'])
    // Asked is not granted: nobody markets her yet.
    expect(r.body.data.benches).toEqual([])
  })

  it('the invitation is a question and never a consent: it is INVITED, answered by nobody', async () => {
    const listing = await prisma.benchListing.findFirstOrThrow({
      where: { consultant: { person: { primaryEmail: MARISOL } } },
      select: { state: true, invitedAt: true, respondedAt: true, company: { select: { slug: true } } },
    })
    expect(listing.state).toBe('INVITED')
    expect(listing.invitedAt).not.toBeNull()
    expect(listing.respondedAt).toBeNull()
    expect(listing.company.slug).toBe('world-brightmoor')
  })

  it('Techpeple, a bench firm, seats a recruiter and a resource manager besides its owner, each on the role’s own permissions', async () => {
    const seats = await prisma.context.findMany({
      where: { company: { slug: 'world-techpeple' }, revokedAt: null, type: 'EMPLOYEE' },
      select: { role: { select: { name: true, permissions: true } } },
    })
    const roles = seats.map((s) => s.role?.name)
    expect(roles).toEqual(expect.arrayContaining(['Owner', 'Recruiter', 'Resource Manager']))
    for (const name of ['Recruiter', 'Resource Manager']) {
      const held = seats.find((s) => s.role?.name === name)!.role!.permissions
      expect([...held].sort(), name).toEqual([...rolesFor('VENDOR').find((r) => r.name === name)!.permissions].sort())
    }
  })

  it('Karthik Menon’s every week of his three months is signed by both sides, as his door now says', async () => {
    const karthik = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'karthik.menon@seed.etyme.invalid' } })
    const { start, end } = karthikWindow(seedToday())
    const sheets = await prisma.timesheet.findMany({
      where: { personId: karthik.id, sellContract: { company: { slug: 'world-teleworld' } } },
      select: { status: true },
    })
    expect(sheets.length).toBe(calendarWeeks(start, end).length)
    expect(sheets.length).toBeGreaterThan(4)
    expect(sheets.every((s) => s.status === 'APPROVED')).toBe(true)
  })

  it('at Northbend Athletic the owner, the approver and the program manager are three plainly different names', async () => {
    const names = (await prisma.context.findMany({
      where: { company: { slug: 'world-nike' }, revokedAt: null, type: 'EMPLOYEE' },
      select: { person: { select: { name: true } } },
    })).map((c) => c.person.name)
    expect(names).toEqual(expect.arrayContaining(['Camille Ostrander', 'Dana Whitfield', 'Lorena Kellerman']))
    expect(names).not.toContain('Dana Whitlock')
    expect(names).not.toContain('Camille Whitford')
  })

  it('Colleen Byrne\u2019s weeks sit on her own company\u2019s line to Halcyon at $92, signed by Harlow Health, then Halcyon, then Byrne', async () => {
    const byrne = await prisma.company.findFirstOrThrow({ where: { slug: 'world-byrne-critical-care' } })
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: byrne.id },
      select: { id: true, billRate: true, clientCompany: { select: { slug: true } }, endClientCompany: { select: { slug: true } } },
    })
    expect(line.billRate).toBe(9_200)
    expect(line.clientCompany.slug).toBe('world-halcyon')
    expect(line.endClientCompany?.slug).toBe('world-harlow-health')
    const sheets = await prisma.timesheet.findMany({
      where: { sellContractId: line.id },
      select: { status: true, assertions: { where: { state: 'LIVE' }, select: { role: true, company: { select: { slug: true } }, at: true } } },
      orderBy: { periodStart: 'asc' },
    })
    expect(sheets.length).toBe(4)
    for (const t of sheets.filter((x) => x.status === 'APPROVED')) {
      const order = [...t.assertions].sort((a, b) => a.at.getTime() - b.at.getTime()).map((a) => `${a.role}:${a.company.slug}`)
      expect(order).toEqual(['CLIENT_APPROVAL:world-harlow-health', 'PASS_THROUGH:world-halcyon', 'EMPLOYER_ACCEPTANCE:world-byrne-critical-care'])
    }
    // Halcyon's buy line says which of Byrne's contracts it buys.
    const buy = await prisma.buyContract.findFirstOrThrow({
      where: { company: { slug: 'world-halcyon' }, vendorCompanyId: byrne.id }, select: { supplierSellContractId: true },
    })
    expect(buy.supplierSellContractId).toBe(line.id)
  })

  it('Byrne Critical Care\u2019s bill to Halcyon holds only weeks Halcyon accepted, at her company\u2019s $92', async () => {
    const lines = await prisma.invoiceLine.findMany({
      where: { sellContract: { company: { slug: 'world-byrne-critical-care' } } },
      select: {
        hours: true, rateCents: true, amountCents: true,
        invoice: { select: { status: true, total: true } },
        timesheet: { select: { assertions: { where: { state: 'LIVE', role: 'PASS_THROUGH', company: { slug: 'world-halcyon' } }, select: { id: true } } } },
      },
    })
    for (const l of lines) {
      expect(l.rateCents).toBe(9_200)
      expect(l.invoice.status).toBe('SUBMITTED')
      expect(l.timesheet?.assertions.length).toBe(1)
    }
    if (lines.length) {
      expect(Number(lines[0].invoice.total) * 100).toBe(lines.reduce((n, l) => n + l.amountCents, 0))
    }
  })

  it('no seeded invoice receipt holds a week its payer has not accepted, or a week already on a bill from the same firm', async () => {
    const receipts = await prisma.vendorBill.findMany({
      where: { company: { slug: { startsWith: 'world-' } }, buyContractId: { not: null }, periodStart: { not: null }, periodEnd: { not: null } },
      select: {
        number: true, companyId: true, vendorCompanyId: true, periodStart: true, periodEnd: true,
        buyContract: { select: { candidates: { select: { personId: true } } } },
      },
    })
    expect(receipts.length).toBeGreaterThan(0)
    const wrong: string[] = []
    for (const r of receipts) {
      const sheets = await prisma.timesheet.findMany({
        where: {
          personId: { in: r.buyContract!.candidates.map((c) => c.personId) },
          periodStart: { lte: r.periodEnd! }, periodEnd: { gte: r.periodStart! },
        },
        select: {
          id: true, periodStart: true,
          assertions: { where: { companyId: r.companyId, state: 'LIVE' }, select: { id: true } },
          invoiceLines: { where: { sellContract: { companyId: r.vendorCompanyId!, clientCompanyId: r.companyId } }, select: { id: true } },
        },
      })
      for (const t of sheets) {
        if (t.assertions.length === 0) wrong.push(`${r.number}: week of ${t.periodStart.toISOString().slice(0, 10)} not accepted by the payer`)
        if (t.invoiceLines.length > 0) wrong.push(`${r.number}: week of ${t.periodStart.toISOString().slice(0, 10)} already on a bill`)
      }
    }
    expect(wrong).toEqual([])
  })
})
