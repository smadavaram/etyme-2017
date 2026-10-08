import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { rolesFor } from '@/lib/company-defaults'

import { GET as agreements } from '@/app/api/program/agreements/route'
import { GET as chainOf } from '@/app/api/timesheets/[id]/assert/route'
import { GET as timesheetsList } from '@/app/api/timesheets/route'

/**
 * Karthik Menon is a Teleworld delivery engineer. He reads the work he is
 * on and files his own week; he runs nobody's pay. On the seeded world he
 * could read what Teleworld pays his colleagues on two demand screens.
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const it_: Record<string, any> = {}

beforeAll(async () => {
  await freshWorld()

  const teleworld = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' }, select: { id: true } })
  it_.teleworld = teleworld.id
  const karthik = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK }, select: { id: true } })
  it_.karthik = karthik.id

  // A colleague Teleworld pays, on a week Teleworld sells to a client.
  // Preferably one with a week on file, so both screens are read about
  // the same person.
  const paid = await prisma.buyContractCandidate.findMany({
    where: { buyContract: { companyId: teleworld.id }, personId: { not: karthik.id }, payRate: { gt: 0 } },
    select: { personId: true, payRate: true },
  })
  const withWeeks = await prisma.timesheet.findMany({
    where: { personId: { in: paid.map((p) => p.personId) }, sellContract: { companyId: teleworld.id } },
    select: { personId: true },
  })
  const hasWeek = new Set(withWeeks.map((w) => w.personId))
  const line = paid.find((p) => hasWeek.has(p.personId)) ?? paid[0]
  it_.colleague = line.personId
  it_.colleaguePay = line.payRate

  // A seller-side agreement naming the colleague, so the agreements
  // screen has their line to show — found, or written for the sentence.
  const sell = await prisma.sellContract.findFirst({
    where: { companyId: teleworld.id, personId: line.personId },
    orderBy: { timesheets: { _count: 'desc' } },
    select: { id: true, clientCompanyId: true, msaId: true },
  })
  if (sell && !sell.msaId) {
    const msa = await prisma.masterAgreement.findFirst({ where: { vendorId: teleworld.id, clientId: sell.clientCompanyId }, select: { id: true } })
      ?? await prisma.masterAgreement.create({ data: { vendorId: teleworld.id, clientId: sell.clientCompanyId, paymentTerms: 30 }, select: { id: true } })
    await prisma.sellContract.update({ where: { id: sell.id }, data: { msaId: msa.id } })
  }
  if (sell) {
    await prisma.masterAgreement.updateMany({ where: { vendorId: teleworld.id, clientId: sell.clientCompanyId }, data: { minMarginPct: 20 } })
  }
  it_.sell = sell

  // A week of the colleague's that Teleworld has accepted, so the
  // employer's leg carries the pay rate.
  // None is seeded for Teleworld's colleagues, so one is written here: a
  // week the colleague filed and Teleworld accepted.
  const sheet = sell
    ? (await prisma.timesheet.findFirst({ where: { sellContractId: sell.id }, select: { id: true } }))
      ?? (await prisma.timesheet.create({
        data: {
          sellContractId: sell.id, personId: line.personId,
          periodStart: new Date('2026-01-05T00:00:00Z'), periodEnd: new Date('2026-01-11T00:00:00Z'),
          days: { '2026-01-05': 8, '2026-01-06': 8, '2026-01-07': 8, '2026-01-08': 8, '2026-01-09': 8 },
          totalHours: 40, status: 'SUBMITTED', submittedAt: new Date('2026-01-10T00:00:00Z'),
        },
        select: { id: true },
      }))
    : null
  it_.sheet = sheet?.id ?? null
  if (sheet) {
    const accepted = await prisma.workAssertion.findFirst({
      where: { timesheetId: sheet.id, role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' }, select: { id: true },
    })
    if (!accepted) {
      await prisma.workAssertion.create({
        data: { timesheetId: sheet.id, companyId: teleworld.id, role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: line.payRate, state: 'LIVE', auto: false },
      })
    }
  }
}, 300_000)

const billTrailOf = (actor: string, subject: string, allowed: boolean) =>
  prisma.accessLog.count({ where: { actorPersonId: actor, subjectId: subject, action: 'CONTRACT_VIEW', allowed } })

const payTrail = (actor: string, subject: string, allowed: boolean) =>
  prisma.accessLog.count({ where: { actorPersonId: actor, subjectId: subject, action: 'PAYROLL_VIEW', allowed } })

describe('Karthik Menon at Teleworld cannot read a colleague’s pay', () => {
  it('a week names as its employer the firm that sold the hours, not the first firm that ever paid the person', async () => {
    as(KARTHIK)
    const { body } = await json(await chainOf(req('GET', `/api/timesheets/${it_.sheet}/assert`), { params: Promise.resolve({ id: it_.sheet }) }))
    const employer = body.data.legs.find((l: any) => l.role === 'EMPLOYER_ACCEPTANCE')
    expect(employer.companyId).toBe(it_.teleworld)
  })

  it('the seeded world has a colleague Teleworld pays, on a contract it sells', () => {
    expect(it_.colleague).toBeTruthy()
    expect(it_.sell, 'no Teleworld sell line for a person it pays').toBeTruthy()
  })

  it('on the agreements screen, no colleague’s margin or pay reaches him, the screen says why, and the refusal is on the trail', async () => {
    as(KARTHIK)
    const { status, body } = await json(await agreements(req('GET', '/api/program/agreements')))
    expect(status, JSON.stringify(body)).toBe(200)
    const lines = body.data.agreements.filter((a: any) => a.role === 'VENDOR').flatMap((a: any) => a.contracts)
    const theirs = lines.filter((c: any) => c.person.id === it_.colleague)
    expect(theirs.length).toBeGreaterThan(0)
    for (const c of theirs) {
      expect(c.marginPct).toBeNull()
      expect(c.marginWithheld).toBe(true)
    }
    const said = JSON.stringify(body.data.agreements)
    expect(said).not.toContain('/hr out')
    expect(body.data.payWithheldSays).toContain('desks that run pay')
    expect(await payTrail(it_.karthik, it_.colleague, false)).toBeGreaterThan(0)
  })

  it('the owner at Teleworld, who reads pay, still sees the colleague’s margin, and the read is on the trail', async () => {
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: it_.teleworld, revokedAt: null, role: { permissions: { has: '*' } } },
      select: { personId: true, person: { select: { primaryEmail: true } } },
    })
    as(owner.person.primaryEmail!)
    const { body } = await json(await agreements(req('GET', '/api/program/agreements')))
    const theirs = body.data.agreements.filter((a: any) => a.role === 'VENDOR').flatMap((a: any) => a.contracts)
      .filter((c: any) => c.person.id === it_.colleague)
    expect(theirs.some((c: any) => c.marginPct != null)).toBe(true)
    expect(theirs.every((c: any) => c.marginWithheld === false)).toBe(true)
    expect(await payTrail(owner.personId, it_.colleague, true)).toBeGreaterThan(0)
  })

  it('on the chain of approvals for a colleague’s week, the employer’s leg shows him the hours and not the pay', async () => {
    expect(it_.sheet, 'no week on the colleague’s contract').toBeTruthy()
    as(KARTHIK)
    const { status, body } = await json(await chainOf(req('GET', `/api/timesheets/${it_.sheet}/assert`), { params: Promise.resolve({ id: it_.sheet }) }))
    expect(status, JSON.stringify(body)).toBe(200)
    const employer = body.data.legs.find((l: any) => l.role === 'EMPLOYER_ACCEPTANCE')
    expect(employer.assertion.hours).toBeGreaterThan(0)
    expect(employer.assertion.rateCents).toBeNull()
    expect(employer.rateWithheld).toBe(true)
    expect(body.data.payableCents).toBeNull()
    expect(JSON.stringify(body)).not.toContain(String(it_.colleaguePay * 40))
  })
})

describe('Karthik Menon at Teleworld cannot read what a colleague bills at, and margin is the price desk’s', () => {
  it('on the agreements screen a colleague’s bill rate is withheld from him, the screen says who reads it, and the refusal is on the trail', async () => {
    as(KARTHIK)
    const { body } = await json(await agreements(req('GET', '/api/program/agreements')))
    const theirs = body.data.agreements.filter((a: any) => a.role === 'VENDOR').flatMap((a: any) => a.contracts)
      .filter((c: any) => c.person.id === it_.colleague)
    expect(theirs.length).toBeGreaterThan(0)
    for (const c of theirs) {
      expect(c.billRateCents).toBeNull()
      expect(c.billWithheld).toBe(true)
    }
    expect(body.data.billWithheldSays).toContain('desks that price and bill')
    expect(await billTrailOf(it_.karthik, it_.colleague, false)).toBeGreaterThan(0)
  })

  it('a payroll desk that reads pay but not margin still sees no margin percent on the agreements screen', async () => {
    // The default AP & Payroll desk of an integrator, as lib/company-defaults
    // writes it; the seed does not seat one at Teleworld.
    const seed = rolesFor('GSI').find((r) => r.name === 'AP & Payroll')!
    const role = (await prisma.role.findFirst({ where: { companyId: it_.teleworld, name: 'AP & Payroll' }, select: { id: true, permissions: true } }))
      ?? await prisma.role.create({ data: { companyId: it_.teleworld, name: 'AP & Payroll', permissions: seed.permissions as string[], isDefault: false }, select: { id: true, permissions: true } })
    expect(role.permissions).toContain('consultants.cost')
    expect(role.permissions).not.toContain('margin.read')
    const clerk = await prisma.person.upsert({
      where: { primaryEmail: 'payroll.desk@teleworld-test.invalid' }, update: {},
      create: { name: 'Anika Rao', primaryEmail: 'payroll.desk@teleworld-test.invalid' },
    })
    if (!(await prisma.context.findFirst({ where: { personId: clerk.id, companyId: it_.teleworld } }))) {
      await prisma.context.create({ data: { personId: clerk.id, companyId: it_.teleworld, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Seated for the margin sentence' } })
    }
    as('payroll.desk@teleworld-test.invalid')
    const { status, body } = await json(await agreements(req('GET', '/api/program/agreements')))
    expect(status, JSON.stringify(body)).toBe(200)
    const theirs = body.data.agreements.filter((a: any) => a.role === 'VENDOR').flatMap((a: any) => a.contracts)
      .filter((c: any) => c.person.id === it_.colleague)
    expect(theirs.length).toBeGreaterThan(0)
    for (const c of theirs) {
      expect(c.marginPct).toBeNull()
      expect(c.marginWithheld).toBe(true)
    }
    expect(body.data.marginWithheldSays).toContain('desks that read margin')
  })

  it('on the timesheets list Karthik reads only his own weeks; a colleague’s week is not shown to him at all, and asking for it by name is refused in a sentence', async () => {
    // Decided 2026-10-08 (11cf064f9): a seat with no desk that acts on a
    // week reads only the weeks that name its holder. Before that he saw a
    // colleague’s week with its bill rate withheld; now he does not see it.
    as(KARTHIK)
    const { status, body } = await json(await timesheetsList(req('GET', '/api/timesheets')))
    expect(status, JSON.stringify(body).slice(0, 300)).toBe(200)
    expect(body.data.timesheets.find((t: any) => t.id === it_.sheet)).toBeUndefined()
    for (const t of body.data.timesheets) expect(t.person?.id ?? t.personId).toBe(it_.karthik)

    const colleague = await prisma.person.findUniqueOrThrow({ where: { id: it_.colleague }, select: { name: true } })
    const theirs = await json(await timesheetsList(req('GET', `/api/timesheets?personId=${it_.colleague}`)))
    expect(theirs.status, JSON.stringify(theirs.body).slice(0, 300)).toBe(403)
    expect(theirs.body.error.message).toContain(`${colleague.name}’s timesheet is not part of your seat`)
    expect(theirs.body.error.message).not.toMatch(/[a-z]+\.(read|write|approve)/)
    // The refusal's row is written before the 403 is sent (recordRefusal),
    // so it is there the moment the response is.
    const refusedLogged = await prisma.accessLog.count({
      where: { actorPersonId: it_.karthik, subjectId: it_.colleague, action: 'TIMESHEET_VIEW', allowed: false },
    })
    expect(refusedLogged).toBeGreaterThan(0)
  })

  it('the owner at Teleworld still reads what each line bills at, and the margin', async () => {
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: it_.teleworld, revokedAt: null, role: { permissions: { has: '*' } } },
      select: { person: { select: { primaryEmail: true } } },
    })
    as(owner.person.primaryEmail!)
    const { body } = await json(await agreements(req('GET', '/api/program/agreements')))
    const theirs = body.data.agreements.filter((a: any) => a.role === 'VENDOR').flatMap((a: any) => a.contracts)
      .filter((c: any) => c.person.id === it_.colleague)
    expect(theirs.every((c: any) => c.billRateCents != null)).toBe(true)
    expect(theirs.some((c: any) => c.marginPct != null)).toBe(true)
  })
})
