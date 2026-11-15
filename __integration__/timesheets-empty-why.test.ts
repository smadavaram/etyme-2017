import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { GET as list } from '@/app/api/timesheets/route'

/**
 * Timesheets, empty, as the founder's own firm meets it (fix list
 * 2026-11-14, area E, item E1). A small supplier with W-2 people at a
 * client, an Owner, HR, an Account Manager and one AP & Payroll person.
 * Every row is built here on fixed dates; nothing reads the seeded world
 * or the clock.
 *
 *   Northwind Staffing  the supplier (northwind-staffing.example)
 *   Harborline Tech     its client (harborline-tech.example)
 *   Dana Reyes          placed, never signed in
 *   Sam Ortiz           placed, signed in, nothing filed
 *
 * Both placements are first recorded and not started (DRAFT), then
 * started, so the page is read in each state the firm meets.
 */

type Seat = { id: string; email: string }
const seats: Record<string, Seat> = {}
const co = { northwind: '', harborline: '' }
const people = { dana: '', sam: '' }

async function seat(companyId: string, role: string, name: string, email: string): Promise<Seat> {
  const r = await prisma.role.findFirstOrThrow({ where: { companyId, name: role } })
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  const c = await prisma.context.create({ data: { personId: p.id, companyId, roleId: r.id, type: 'EMPLOYEE', grantReason: 'empty timesheets walk' } })
  return { id: c.id, email }
}

async function read(s: Seat, q = '') {
  as(s.email)
  const r = await json(await list(req('GET', `/api/timesheets${q}`, undefined, { 'x-context-id': s.id })))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

async function line(personId: string, state: 'DRAFT' | 'IN_PROGRESS' = 'IN_PROGRESS') {
  return prisma.sellContract.create({
    data: {
      companyId: co.northwind, clientCompanyId: co.harborline, personId,
      billRate: 9_000, startDate: new Date('2026-03-01T00:00:00Z'), state,
    },
  })
}

beforeAll(async () => {
  await resetDatabase()
  const nw = await prisma.company.create({ data: { name: 'Northwind Staffing', slug: 'northwind-staffing-empty', kind: 'VENDOR', currency: 'USD', claimedAt: new Date('2026-01-04T00:00:00Z') } })
  const hb = await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-tech-empty', kind: 'CLIENT', currency: 'USD', claimedAt: new Date('2026-01-04T00:00:00Z') } })
  co.northwind = nw.id
  co.harborline = hb.id
  await ensureDefaultRoles(nw.id, 'VENDOR')
  await ensureDefaultRoles(hb.id, 'CLIENT')
  seats.owner = await seat(nw.id, 'Owner', 'Priya Nair', 'owner@northwind-staffing.example')
  seats.hr = await seat(nw.id, 'HR', 'Lena Brooks', 'hr@northwind-staffing.example')
  seats.am = await seat(nw.id, 'Account Manager', 'Omar Haddad', 'am@northwind-staffing.example')
  seats.ap = await seat(nw.id, 'AP & Payroll', 'Ruth Ellison', 'payroll@northwind-staffing.example')
  seats.hm = await seat(hb.id, 'Hiring Manager', 'Mei Tanaka', 'mei@harborline-tech.example')
  people.dana = (await prisma.person.create({ data: { name: 'Dana Reyes', primaryEmail: 'dana.reyes@reserved.example' } })).id
  people.sam = (await prisma.person.create({ data: { name: 'Sam Ortiz', primaryEmail: 'sam.ortiz@reserved.example' } })).id
  // Sam has signed in once; Dana never has.
  await prisma.credential.create({ data: { personId: people.sam, provider: 'GOOGLE', providerId: 'sam-ortiz-subject', email: 'sam.ortiz@reserved.example' } })
}, 600_000)

describe('an empty Timesheets page says why it is empty, before anybody is placed', () => {
  it('the AP & Payroll person reads that nobody is placed yet, and which role records a placement, with no link', async () => {
    const d = await read(seats.ap)
    expect(d.timesheets).toEqual([])
    expect(d.empty).toMatchObject({ why: 'NOBODY_PLACED', link: null, says: 'Nobody is placed yet, so there are no hours to file.' })
    expect(d.empty.detail).toBe(
      'A placement starts when a client awards a submission. Recording a placement is for the Owner or an Admin here. Ask one of them.'
    )
  })

  it('the Account Manager, who records no placement, is told who does, with no link', async () => {
    const d = await read(seats.am)
    expect(d.empty.link).toBeNull()
    expect(d.empty.detail).toContain('Recording a placement is for the Owner or an Admin here.')
  })

  it('the Owner, who may record a placement, is handed Record a placement on Contracts', async () => {
    const d = await read(seats.owner)
    expect(d.empty.link).toEqual({ label: 'Record a placement', href: '/dashboard/contracts?new=1' })
    expect(d.empty.detail).toBe('A placement starts when a client awards a submission. Work you already run can be recorded now.')
  })

  it('a client’s hiring manager reads that nobody is working at your sites yet, with no placement to record', async () => {
    const d = await read(seats.hm)
    expect(d.empty).toMatchObject({
      why: 'NOBODY_PLACED',
      link: null,
      says: 'Nobody is working at your sites yet, so there are no hours to approve.',
      detail: 'A contract starts when a job request is awarded to a supplier. Its hours show here once the worker files them.',
    })
  })

  it('an empty list narrowed by a tab is not explained as an empty book', async () => {
    const d = await read(seats.ap, '?status=APPROVED')
    expect(d.empty).toBeNull()
  })
})

describe('people placed, and no placement has started yet', () => {
  beforeAll(async () => {
    await line(people.dana, 'DRAFT')
    await line(people.sam, 'DRAFT')
  })

  it('the AP & Payroll person reads that each placement has not started, never that Sam Ortiz signed in or Dana Reyes did not', async () => {
    const d = await read(seats.ap)
    expect(d.empty.why).toBe('NOBODY_FILED')
    expect(d.empty.says).toBe('2 people are placed, and no week can be filed yet.')
    expect(d.empty.people.map((p: any) => p.says)).toEqual([
      'Dana Reyes’s placement has not started yet, so no week can be filed.',
      'Sam Ortiz’s placement has not started yet, so no week can be filed.',
    ])
    expect(JSON.stringify(d.empty)).not.toMatch(/signed in|Sending the invitation again/)
    expect(d.empty.detail).toMatch(/^A placement starts from Contracts\. Recording a placement is for the Owner or an Admin here\./)
    expect(d.empty.link).toBeNull()
  })

  it('the Owner, who may start a placement, is handed Open Contracts', async () => {
    const d = await read(seats.owner)
    expect(d.empty.link).toEqual({ label: 'Open Contracts', href: '/dashboard/contracts' })
    expect(d.empty.detail).toMatch(/^A placement starts from Contracts\. Only the worker files hours/)
  })

  it('HR, who adds people, is not sent to Candidates for a worker who cannot file yet', async () => {
    const d = await read(seats.hr)
    expect(d.empty.people.every((p: any) => p.link === null)).toBe(true)
    expect(JSON.stringify(d.empty)).not.toContain('Open Candidates')
  })

  it('the client’s hiring manager reads that nobody has started at its sites, never that they are working there', async () => {
    const d = await read(seats.hm)
    expect(d.empty.says).toBe('Nobody has started at your sites yet, so there are no hours to approve.')
    expect(d.empty.people.map((p: any) => p.says)).toEqual([
      'Dana Reyes has not started at your sites yet.',
      'Sam Ortiz has not started at your sites yet.',
    ])
  })
})

describe('people placed, and nobody has filed', () => {
  beforeAll(async () => {
    await prisma.sellContract.updateMany({ where: { companyId: co.northwind }, data: { state: 'IN_PROGRESS' } })
  })

  it('the AP & Payroll person reads who is placed, that Dana Reyes has not signed in yet, and that only the worker files', async () => {
    const d = await read(seats.ap)
    expect(d.empty.why).toBe('NOBODY_FILED')
    expect(d.empty.says).toBe('2 people are placed, and no week has been filed yet.')
    expect(d.empty.people.map((p: any) => p.says)).toEqual([
      'Dana Reyes has not signed in to Etyme yet, so no week can be filed.',
      'Sam Ortiz has signed in and has not filed a week yet.',
    ])
    expect(d.empty.detail).toBe(
      'Only the worker files hours, from their own page. Nobody at the firm files for them. ' +
        'Each week’s hours are due the Monday after it ends, by your company’s settings. ' +
        'Sending the invitation again is for the HR here. Ask them.'
    )
  })

  it('nothing on the empty page offers the firm a way to file for the worker or an email door', async () => {
    const d = await read(seats.ap)
    const words = JSON.stringify(d.empty)
    expect(words).not.toMatch(/email|forward|file it for/i)
    expect(d.filing.may).toBe(false)
  })

  it('a seat that adds people is linked to Candidates, where the invitation is; one that does not is told which role does, with no link', async () => {
    const hr = await read(seats.hr)
    expect(hr.empty.people[0].link).toEqual({ label: 'Open Candidates', href: '/dashboard/consultants' })
    expect(hr.empty.detail).not.toContain('Sending the invitation again')
    const ap = await read(seats.ap)
    expect(ap.empty.people.every((p: any) => p.link === null)).toBe(true)
    expect(ap.empty.detail).toContain('Sending the invitation again is for the HR here.')
  })

  it('every person named on the empty page is a logged read of their record', async () => {
    const before = await prisma.accessLog.count({ where: { subjectId: people.dana, action: 'TIMESHEET_VIEW' } })
    await read(seats.ap)
    expect(await prisma.accessLog.count({ where: { subjectId: people.dana, action: 'TIMESHEET_VIEW' } })).toBe(before + 1)
  })

  it('the client’s hiring manager reads who works at its sites and that no week is filed, and nothing about anybody’s sign-in', async () => {
    const d = await read(seats.hm)
    expect(d.empty.says).toBe('2 people are working at your sites, and no week has been filed yet.')
    expect(d.empty.people.map((p: any) => p.says)).toEqual(['Dana Reyes has not filed a week yet.', 'Sam Ortiz has not filed a week yet.'])
    expect(d.empty.detail).toBe('Only the worker files hours, from their own page, once the placement starts. Each week comes here to approve once it is filed.')
  })
})

describe('a filed week the client has not approved', () => {
  let week = ''
  beforeAll(async () => {
    const dana = await prisma.sellContract.findFirstOrThrow({ where: { personId: people.dana } })
    week = (await prisma.timesheet.create({
      data: {
        sellContractId: dana.id, personId: people.dana,
        periodStart: new Date('2026-03-01T00:00:00Z'), periodEnd: new Date('2026-03-07T00:00:00Z'),
        days: { '2026-03-02': 8, '2026-03-03': 8 }, totalHours: 16, status: 'SUBMITTED', submittedAt: new Date('2026-03-09T00:00:00Z'),
      },
    })).id
  })

  it('the supplier is told how many weeks wait for the client’s approval, and the week links to its own page', async () => {
    const d = await read(seats.ap)
    expect(d.empty).toBeNull()
    const row = d.timesheets.find((t: any) => t.id === week)
    expect(row.waitsOnClient).toBe(true)
    expect(row.href).toBe(`/dashboard/weeks/${week}`)
    expect(d.clientApproval.count).toBe(1)
    expect(d.clientApproval.says).toBe('1 week waits for the client’s approval. Open the week to attach the approval the client gave.')
  })

  it('a seat that may not attach the client’s approval is told which role does', async () => {
    const d = await read(seats.am)
    expect(d.clientApproval.says).toMatch(/^1 week waits for the client’s approval\. Attaching the client’s approval is for /)
  })

  it('the line at the top no longer says the firm accepts only once the client has signed', async () => {
    const d = await read(seats.ap)
    expect(d.filing.says).toBe(
      'Hours are filed by the person who worked them, from their own page. ' +
        'The client approves each week in Etyme, or its approval is attached to the week. ' +
        'Northwind Staffing accepts each week it pays for.'
    )
    expect(d.filing.says).not.toContain('once the client has signed')
  })

  it('the client is never told a week waits on its own approval as if it were somebody else’s', async () => {
    const d = await read(seats.hm)
    expect(d.clientApproval.count).toBe(0)
  })
})
