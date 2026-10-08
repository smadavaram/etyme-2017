import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as entry, POST as enter } from '@/app/api/onboarding/route'
import { GET as readSetup, POST as answer } from '@/app/api/onboarding/setup/route'
import { POST as addCompany } from '@/app/api/companies/route'

/**
 * Setup asks five things, then stops (founder, 2026-10-07), walked through
 * the real doors: first sign-in, the steps, the dashboard's line, and a
 * colleague arriving on the same domain.
 */

const FOUNDER = 'dana@setupwalk-hirer.example'
const OTHER = 'lee@setupwalk-addco.example'
const COLLEAGUE = 'priya@setupwalk-hirer.example'

let companyId = ''
let founderId = ''

async function shape(id: string) {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id },
    include: { roles: { select: { name: true } }, locations: true, holidays: { select: { id: true } } },
  })
  return {
    pack: c.templatePack,
    country: c.country,
    currency: c.currency,
    roles: c.roles.map((r) => r.name).sort(),
    locations: c.locations.map((l) => ({ country: l.country, isPrimary: l.isPrimary })),
    holidays: c.holidays.length,
  }
}

describe('a new company walks five steps, then stops', () => {
  beforeAll(async () => {
    await freshWorld()
  })

  it('a new company is created the same way from first sign-in and from Add company: same pack, roles, location and holidays', async () => {
    as(FOUNDER)
    const first = await json(await enter(req('POST', '/api/onboarding', { type: 'client', name: 'Setupwalk Hirer' })))
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    companyId = first.body.data.companyId
    founderId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: FOUNDER } })).id

    as(OTHER)
    const added = await json(await addCompany(req('POST', '/api/companies', { name: 'Setupwalk Addco', kind: 'CLIENT' })))
    expect(added.status, JSON.stringify(added.body)).toBe(200)

    const a = await shape(companyId)
    const b = await shape(added.body.data.company.id)
    expect(a).toEqual(b)
    expect(a.pack).toBe('US_IT')
    expect(a.roles).toContain('Program Manager')
    expect(a.roles).toContain('Member')
    expect(a.roles).not.toContain('Recruiter')
    expect(a.roles).not.toContain('Accountant')
    expect(a.locations).toEqual([{ country: 'US', isPrimary: true }])
    expect(a.holidays).toBeGreaterThan(10)
  })

  it('setup guesses the country from the web address and says it is a guess', async () => {
    as('sam@setupwalk-guess.co.uk')
    const r = await json(await entry(req('GET', '/api/onboarding')))
    expect(r.body.data).toMatchObject({
      action: 'CREATE',
      suggestedCountry: 'GB',
      suggestedCurrency: 'GBP',
      countrySays: 'We guessed United Kingdom from your web address. Change it if that is wrong.',
    })
  })

  it('a company may click through setup in five steps taking every default, and each answer is recorded with who and when', async () => {
    as(FOUNDER)
    let s = await json(await readSetup(req('GET', '/api/onboarding/setup')))
    expect(s.body.data).toMatchObject({ shows: true, next: 'WORK', finishedAt: null })
    expect(s.body.data.record.COMPANY).toMatchObject({ outcome: 'DONE', byId: founderId })

    const before = Date.now()
    for (const [step, outcome] of [['WORK', 'DONE'], ['PEOPLE', 'SKIPPED'], ['TEAM', 'SKIPPED']]) {
      const r = await json(await answer(req('POST', '/api/onboarding/setup', { step, outcome })))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.setupFinishedAt).not.toBeNull()
    const record = row.setupSteps as any
    for (const step of ['WORK', 'PEOPLE', 'TEAM']) {
      expect(record[step].byId, step).toBe(founderId)
      expect(new Date(record[step].at).getTime()).toBeGreaterThanOrEqual(before - 1000)
    }
    // Taking the defaults changed no date: the pay answers still say nobody set them.
    expect(row.paySettingsSetAt).toBeNull()
    expect(row.weekSettingsSetAt).toBeNull()
  })

  it('a company that skips its people and its team is reminded on the dashboard, once, with a link back', async () => {
    as(FOUNDER)
    const s = await json(await readSetup(req('GET', '/api/onboarding/setup')))
    expect(s.body.data.reminder).toEqual({ says: 'Finish setting up: your people, your team.', href: '/start?finish=1' })
  })

  it('a company that finished setup never sees the steps again', async () => {
    as(FOUNDER)
    const plain = await json(await entry(req('GET', '/api/onboarding')))
    expect(plain.body.data.action).toBe('ALREADY_IN')
    expect(plain.body.data.setup.shows).toBe(false)
    // Only by following the reminder back, while something is owed.
    const back = await json(await entry(req('GET', '/api/onboarding?finish=1')))
    expect(back.body.data.setup.shows).toBe(true)

    // A seeded company never began the steps, so it is never asked or reminded.
    const seeded = await prisma.context.findFirstOrThrow({
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR', setupStartedAt: null }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    as(seeded.person.primaryEmail)
    const theirs = await json(await readSetup(req('GET', '/api/onboarding/setup', undefined, { 'x-context-id': seeded.id })))
    expect(theirs.body.data).toMatchObject({ shows: false, reminder: null })
  })

  it('a colleague joining on a claimed domain gets a seat with the Member role and the owner is told', async () => {
    as(COLLEAGUE)
    const r = await json(await enter(req('POST', '/api/onboarding', {})))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ action: 'JOIN', role: 'Member' })
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId, person: { primaryEmail: COLLEAGUE }, revokedAt: null },
      include: { role: true },
    })
    expect(seat.role?.name).toBe('Member')
    // Member holds no permission of its own since round three: it reads its
    // own work and what is addressed to it, and a firm-wide read is a desk.
    expect(seat.role?.permissions).toEqual([])

    // The notice is not awaited by the route; give it a moment to land.
    let told = 0
    for (let i = 0; i < 20 && told === 0; i++) {
      told = await prisma.notification.count({ where: { personId: founderId, companyId, body: { contains: COLLEAGUE } } })
      if (told === 0) await new Promise((res) => setTimeout(res, 100))
    }
    expect(told).toBeGreaterThan(0)

    // The teammate finishes the team step; only the people are still owed.
    as(FOUNDER)
    const s = await json(await readSetup(req('GET', '/api/onboarding/setup')))
    expect(s.body.data.reminder.says).toBe('Finish setting up: your people.')
  })

  it('a colleague with a role lands on their own desk', async () => {
    as(COLLEAGUE)
    const r = await json(await entry(req('GET', '/api/onboarding')))
    expect(r.body.data).toMatchObject({
      action: 'ALREADY_IN',
      seat: { type: 'EMPLOYEE', role: 'Member' },
    })
    // Nobody but the desk that runs setup is shown it.
    expect(r.body.data.setup.shows).toBe(false)
    const refused = await json(await answer(req('POST', '/api/onboarding/setup', { step: 'PEOPLE', outcome: 'DONE' })))
    expect(refused.status).toBe(403)
  })

  it('a one-person firm\'s setup is three steps and never asks for a contractor list or a team', async () => {
    as('ines.rocha@gmail.com')
    const made = await json(await enter(req('POST', '/api/onboarding', { type: 'solo', name: 'Rocha Care LLC' })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const firmId = made.body.data.companyId
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'ines.rocha@gmail.com' } })
    expect((await prisma.consultantProfile.findUnique({ where: { personId: person.id } }))?.ownCompanyId).toBe(firmId)

    const before = (await json(await readSetup(req('GET', '/api/onboarding/setup')))).body.data
    expect(before.owed).toEqual(['WORK'])
    const done = await json(await answer(req('POST', '/api/onboarding/setup', { step: 'WORK', outcome: 'DONE' })))
    expect(done.body.data).toMatchObject({ finished: true, next: null, owed: [], reminder: null })
    const list = await json(await answer(req('POST', '/api/onboarding/setup', { step: 'PEOPLE', outcome: 'SKIPPED' })))
    expect(list.body.error.message).toBe('A one-person firm has no contractor list or team to set up.')
  })

  it('a supplier that took its record from an invitation opens setup at how it works, with its client named', async () => {
    const { rolesFor } = await import('@/lib/company-defaults')
    const client = await prisma.company.create({ data: { name: 'Northbend Athletic Co', slug: 'nb-claim-client', kind: 'CLIENT' } })
    const shell = await prisma.company.create({ data: { name: 'Fenwick Staffing', slug: 'fenwick-claimed', kind: 'VENDOR', claimedAt: new Date() } })
    const owner = await prisma.role.create({ data: { companyId: shell.id, name: 'Owner', permissions: [...rolesFor('VENDOR').find((r) => r.isOwner)!.permissions] } })
    const mara = await prisma.person.create({ data: { primaryEmail: 'mara@fenwick-claimed.example', name: 'Mara Fenwick' } })
    await prisma.context.create({ data: { personId: mara.id, companyId: shell.id, roleId: owner.id, type: 'EMPLOYEE' } })
    await prisma.supplierInvite.create({ data: { companyId: shell.id, byId: client.id, email: mara.primaryEmail, token: 'claimed-setup-1', state: 'ACCEPTED', acceptedAt: new Date(), acceptedById: mara.id } })

    as(mara.primaryEmail)
    const got = (await json(await entry(req('GET', '/api/onboarding')))).body.data
    expect(got.action).toBe('ALREADY_IN')
    expect(got.setup).toMatchObject({ shows: true, next: 'WORK', claimedSays: 'Northbend Athletic Co is your client. Next: your week and payroll.' })
    expect(got.setup.record.COMPANY).toMatchObject({ outcome: 'DONE', byId: mara.id })
    expect(await prisma.automationLog.count({ where: { companyId: shell.id, action: 'SETUP_STARTED' } })).toBe(1)
    // Said in plain words about her own firm, never a log line in the third person (round four, item 18).
    const line = await prisma.automationLog.findFirstOrThrow({ where: { companyId: shell.id, action: 'SETUP_STARTED' } })
    expect(line.summary).toBe("Setup opened at How you work; the company step was filled from the client's invitation")
    // Asked again, it is not begun twice.
    await entry(req('GET', '/api/onboarding'))
    expect(await prisma.automationLog.count({ where: { companyId: shell.id, action: 'SETUP_STARTED' } })).toBe(1)
  })
})
