import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readBenchPay, PATCH as changeBenchPay } from '@/app/api/settings/bench/route'
import { GET as readSwitches, POST as turnSwitch } from '@/app/api/settings/bench/people/route'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Bench pay on the firm's settings, walked as its desks.
 *
 * The founder, 2026-10-03: holidays on the bench are a company setting,
 * off by default and switched on per person; an integrator pays its
 * people for holidays by default. Nothing wrote the bench pay policy but
 * the seed, and nothing could write the holiday setting at all. Now the
 * owner, the admin and the finance desk set both, every turn is a row with
 * a name on it, and a person's switch is written only by the firm whose
 * bench they are on.
 */

type Seat = { id: string; personId: string; email: string }

let vendorId = ''
let finance: Seat
let recruiter: Seat
let gsiOwner: Seat
let clientOwner: Seat
let ourPerson = ''
let ourPersonName = ''
let theirPerson = ''

async function seatAt(companyId: string, kind: 'VENDOR' | 'GSI' | 'CLIENT', roleName: string, tag: string): Promise<Seat> {
  let role = await prisma.role.findFirst({ where: { companyId, name: roleName } })
  if (!role) {
    const seed = rolesFor(kind).find((r) => r.name === roleName)!
    role = await prisma.role.create({ data: { companyId, name: roleName, permissions: seed.permissions } })
  }
  const p = await prisma.person.create({ data: { name: `${roleName} ${tag}`, primaryEmail: `${tag}@bench-pay.etyme.invalid` } })
  const c = await prisma.context.create({
    data: { personId: p.id, companyId, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Bench pay settings test' },
  })
  return { id: c.id, personId: p.id, email: p.primaryEmail }
}

async function call(seat: Seat, fn: any, method: string, url: string, body?: unknown) {
  as(seat.email)
  return json(await fn(req(method, url, body, { 'x-context-id': seat.id })))
}

describe('bench pay, set from the firm’s settings', () => {
  beforeAll(async () => {
    await freshWorld()

    // A staffing vendor with somebody on its bench by their own consent,
    // and a second firm's bench person who is a stranger to it.
    const listings = await prisma.benchListing.findMany({
      where: { state: 'GRANTED', revokedAt: null, lapsedAt: null, company: { kind: 'VENDOR' } },
      select: { companyId: true, consultant: { select: { personId: true, person: { select: { name: true } } } } },
    })
    const ours = listings[0]
    vendorId = ours.companyId
    ourPerson = ours.consultant.personId
    ourPersonName = ours.consultant.person.name
    const vendorPeople = new Set(listings.filter((l) => l.companyId === vendorId).map((l) => l.consultant.personId))
    const employedHere = new Set(
      (await prisma.context.findMany({ where: { companyId: vendorId, type: 'EMPLOYEE' }, select: { personId: true } })).map((c) => c.personId)
    )
    theirPerson = listings.find((l) => l.companyId !== vendorId && !vendorPeople.has(l.consultant.personId) && !employedHere.has(l.consultant.personId))!
      .consultant.personId

    finance = await seatAt(vendorId, 'VENDOR', 'Finance', 'finance')
    recruiter = await seatAt(vendorId, 'VENDOR', 'Recruiter', 'recruiter')

    const gsi = await prisma.company.findFirstOrThrow({ where: { kind: 'GSI' } })
    gsiOwner = await seatAt(gsi.id, 'GSI', 'Owner', 'gsi-owner')
    const client = await prisma.company.findFirstOrThrow({ where: { kind: 'CLIENT' } })
    clientOwner = await seatAt(client.id, 'CLIENT', 'Owner', 'client-owner')

    // Start from the default: nobody has turned this vendor's holiday setting.
    await prisma.benchHolidaySwitch.deleteMany({ where: { companyId: vendorId } })
  })

  it('a firm nobody has set reads holidays off by default, with nobody named', async () => {
    const r = await call(finance, readBenchPay, 'GET', '/api/settings/bench')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.holidays.paid).toBe(false)
    expect(r.body.data.holidays.turned).toBeNull()
    expect(r.body.data.policy.says).toMatch(/\.$/)
  })

  it('the finance desk turns holiday pay on for the firm, and the page says who and when', async () => {
    const r = await call(finance, changeBenchPay, 'PATCH', '/api/settings/bench', { holidayPay: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.holidays.paid).toBe(true)
    expect(r.body.data.holidays.turned).toMatch(/^Switched on by Finance finance, [A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    expect(r.body.data.message).toBe('Public holidays on the bench are paid.')

    const row = await prisma.benchHolidaySwitch.findFirstOrThrow({ where: { companyId: vendorId, personId: null } })
    expect(row).toMatchObject({ paid: true, setById: finance.personId })
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: vendorId, action: 'BENCH_HOLIDAY_PAY_SWITCHED' } })
    expect(log.summary).toContain('Finance finance switched on')
  })

  it('turning it off adds a row and keeps the turn before it as history', async () => {
    const r = await call(finance, changeBenchPay, 'PATCH', '/api/settings/bench', { holidayPay: false })
    expect(r.status).toBe(200)
    expect(r.body.data.holidays.paid).toBe(false)
    expect(r.body.data.holidays.history).toHaveLength(2)
    expect(await prisma.benchHolidaySwitch.count({ where: { companyId: vendorId, personId: null } })).toBe(2)
    await call(finance, changeBenchPay, 'PATCH', '/api/settings/bench', { holidayPay: true })
  })

  it('the finance desk changes the bench pay policy, and the change is logged with its name', async () => {
    const r = await call(finance, changeBenchPay, 'PATCH', '/api/settings/bench', {
      benchPolicy: 'REDUCED_RATE', benchRateBps: 5_000, benchCarryDays: 90,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.policy.says).toBe('50% of their pay while waiting for a project, for up to 90 days.')
    const firm = await prisma.company.findUniqueOrThrow({ where: { id: vendorId } })
    expect(firm).toMatchObject({ benchPolicy: 'REDUCED_RATE', benchRateBps: 5_000, benchCarryDays: 90 })
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: vendorId, action: 'BENCH_PAY_POLICY_CHANGED' } })
    expect(log.summary).toContain('Finance finance changed the bench pay policy')
    expect(log.reversible).toBe(true)
  })

  it('a policy that could not be paid is refused in a sentence, and nothing is written', async () => {
    const r = await call(finance, changeBenchPay, 'PATCH', '/api/settings/bench', { benchPolicy: 'RESERVE_FUNDED', reserveBps: null })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('needs the share held back')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: vendorId } })).benchPolicy).toBe('REDUCED_RATE')
  })

  it('a recruiter cannot change the bench pay policy, and is told who can', async () => {
    const r = await call(recruiter, changeBenchPay, 'PATCH', '/api/settings/bench', { benchPolicy: 'FULL_PAY' })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('is set by the owner, the admin and the finance desk')
    const read = await call(recruiter, readBenchPay, 'GET', '/api/settings/bench')
    expect(read.status).toBe(403)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: vendorId } })).benchPolicy).toBe('REDUCED_RATE')
  })

  it('a client is refused bench pay, because it carries nobody between projects', async () => {
    const r = await call(clientOwner, readBenchPay, 'GET', '/api/settings/bench')
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('does not carry people between projects')
  })

  it('an integrator reads holiday pay on by default, and is told why', async () => {
    const r = await call(gsiOwner, readBenchPay, 'GET', '/api/settings/bench')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.holidays.paid).toBe(true)
    expect(r.body.data.holidays.integratorNote).toContain('on the bench by default')
  })

  it('a person on the firm’s bench is switched on, read back, and both are on their access trail', async () => {
    const before = await prisma.accessLog.count({ where: { subjectId: ourPerson, actorPersonId: finance.personId } })
    const r = await call(finance, turnSwitch, 'POST', '/api/settings/bench/people', { personId: ourPerson, paid: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.person.paid).toBe(true)
    expect(r.body.data.person.says).toMatch(/^Paid for holidays: switched on by Finance finance, /)
    expect(r.body.data.message).toBe(`Switched on for ${ourPersonName}.`)

    const read = await call(finance, readSwitches, 'GET', `/api/settings/bench/people?personId=${ourPerson}`)
    expect(read.status).toBe(200)
    expect(read.body.data.people).toEqual([expect.objectContaining({ personId: ourPerson, paid: true, source: 'PERSON_ON' })])
    expect(await prisma.accessLog.count({ where: { subjectId: ourPerson, actorPersonId: finance.personId } })).toBe(before + 2)
  })

  it('a person’s holiday switch can only be set by the firm whose bench they are on', async () => {
    const r = await call(finance, turnSwitch, 'POST', '/api/settings/bench/people', { personId: theirPerson, paid: true })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('is not on')
    expect(await prisma.benchHolidaySwitch.count({ where: { personId: theirPerson } })).toBe(0)
    const refusal = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: theirPerson, actorPersonId: finance.personId } })
    expect(refusal.allowed).toBe(false)

    const read = await call(finance, readSwitches, 'GET', `/api/settings/bench/people?personId=${theirPerson}`)
    expect(read.body.data.people).toEqual([])
  })

  it('a recruiter cannot turn a person’s switch, and the refusal is on the person’s access trail', async () => {
    const r = await call(recruiter, turnSwitch, 'POST', '/api/settings/bench/people', { personId: ourPerson, paid: false })
    expect(r.status).toBe(403)
    const refusal = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: ourPerson, actorPersonId: recruiter.personId } })
    expect(refusal.allowed).toBe(false)
  })

  it('switching a person on while the firm pays no holidays says nothing is paid until the firm turns it on', async () => {
    await call(finance, changeBenchPay, 'PATCH', '/api/settings/bench', { holidayPay: false })
    const r = await call(finance, turnSwitch, 'POST', '/api/settings/bench/people', { personId: ourPerson, paid: true })
    expect(r.status).toBe(200)
    expect(r.body.data.person.paid).toBe(false)
    expect(r.body.data.message).toContain('nothing is paid until the firm turns it on in settings')
  })
})
