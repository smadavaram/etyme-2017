import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { GET as compliance } from '@/app/api/compliance/route'

/**
 * A firm's own compliance page opens for the desks that read the firm's
 * own rules, and for nobody else at the firm.
 *
 * Until 2026-09-30 `GET /api/compliance` asked for no permission, so a
 * seat was enough — and every staffer of every firm holds one. On the
 * seeded world that put every colleague's visa, I-9 and background
 * result in front of Karthik Menon, a Teleworld delivery engineer.
 *
 *   Karthik Menon      Teleworld's own W2, a delivery engineer. Refused,
 *                      told which desk to ask.
 *   Teleworld's        seated here out of the product's own role set,
 *   compliance officer because the world seed gives a supplier only its
 *   and HR             owner. Both open the page.
 *   Northbend's        a client desk that signs weeks and does not read
 *   hiring manager     the program's rules. Refused, and the refusal is
 *                      written against every person on site.
 *   Northbend's        the desk the page is for. Opens it.
 *   compliance officer
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const TW_COMPLIANCE = 'compliance.teleworld@seed.etyme.invalid'
const TW_HR = 'hr.teleworld@seed.etyme.invalid'

const co = { teleworld: '', northbend: '' }
const who = { karthik: '', hiringManager: '', hiringManagerEmail: '', officerEmail: '' }

async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, tries = 60): Promise<T> {
  let last = await read()
  for (let i = 0; i < tries && !done(last); i++) {
    await new Promise((r) => setTimeout(r, 50))
    last = await read()
  }
  return last
}

async function seatAt(companyId: string, kind: string, roleName: string, name: string, email: string) {
  await ensureDefaultRoles(companyId, kind)
  const role = await prisma.role.findFirstOrThrow({ where: { companyId, name: roleName } })
  const person = await prisma.person.upsert({
    where: { primaryEmail: email }, update: { name }, create: { name, primaryEmail: email },
  })
  await prisma.context.create({
    data: {
      personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', side: 'SELL',
      grantReason: `${roleName}, for the own-compliance-page walk`,
    },
  })
}

async function deskAt(companyId: string, roleName: string): Promise<{ email: string; personId: string }> {
  const row = await prisma.context.findFirstOrThrow({
    where: { companyId, role: { name: roleName } },
    select: { personId: true, person: { select: { primaryEmail: true } } },
  })
  return { email: row.person.primaryEmail!, personId: row.personId }
}

beforeAll(async () => {
  await freshWorld()
  co.teleworld = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-teleworld' } })).id
  co.northbend = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' } })).id
  who.karthik = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK } })).id
  await seatAt(co.teleworld, 'GSI', 'Compliance Officer', 'Nalini Rao', TW_COMPLIANCE)
  await seatAt(co.teleworld, 'GSI', 'HR', 'Owen Tallis', TW_HR)
  const hm = await deskAt(co.northbend, 'Hiring Manager')
  who.hiringManager = hm.personId
  who.hiringManagerEmail = hm.email
  who.officerEmail = (await deskAt(co.northbend, 'Compliance Officer')).email
}, 300_000)

describe('a firm\'s own compliance page', () => {
  it('Karthik Menon holds a seat at Teleworld whose desk does not read the firm\'s rules', async () => {
    const seat = await prisma.context.findFirstOrThrow({
      where: { personId: who.karthik, companyId: co.teleworld },
      select: { role: { select: { permissions: true } } },
    })
    expect(seat.role?.permissions ?? []).not.toContain('governance.read')
    expect(seat.role?.permissions ?? []).not.toContain('*')
  })

  it('a delivery engineer cannot read his colleagues\' work papers and is told who to ask', async () => {
    as(KARTHIK)
    const { status, body } = await json(await compliance(req('GET', '/api/compliance')))
    expect(status).toBe(403)
    expect(body.data).toBeUndefined()
    const says: string = body.error.message
    expect(says).toContain('visas, I-9s and background results')
    expect(says).toContain('Ask the Compliance Officer, HR')
    expect(says).toContain('Teleworld')
    expect(says).not.toMatch(/governance\.read|FORBIDDEN/)
  })

  it('the compliance officer and HR still open compliance', async () => {
    for (const email of [TW_COMPLIANCE, TW_HR]) {
      as(email)
      const { status, body } = await json(await compliance(req('GET', '/api/compliance')))
      expect(status, email).toBe(200)
      expect(body.data, email).toBeDefined()
    }
  })

  it('a client\'s compliance officer still opens its program\'s compliance page', async () => {
    as(who.officerEmail)
    const { status } = await json(await compliance(req('GET', '/api/compliance')))
    expect(status).toBe(200)
  })

  it('a hiring manager is refused, and the refusal is written against every person the page would have shown', async () => {
    const onSite = await prisma.sellContract.findMany({
      where: {
        OR: [{ endClientCompanyId: co.northbend }, { endClientCompanyId: null, clientCompanyId: co.northbend }, { clientCompanyId: co.northbend }],
        // DRAFT too since 2026-09-30: the page now shows somebody about to
        // start, so a refused read is a refused read of them as well.
        state: { in: ['DRAFT', 'IN_PROGRESS', 'PAUSED', 'PENDING_VERIFICATION', 'VERIFIED'] },
      },
      select: { personId: true },
    })
    const people = [...new Set(onSite.map((c) => c.personId))]
    expect(people.length, 'Northbend has nobody on site in the seeded world').toBeGreaterThan(0)

    const since = new Date()
    as(who.hiringManagerEmail)
    const { status, body } = await json(await compliance(req('GET', '/api/compliance')))
    expect(status).toBe(403)
    expect(body.error.message).toContain('Northbend Athletic')

    const rows = await eventually(
      () => prisma.accessLog.findMany({
        where: { actorPersonId: who.hiringManager, allowed: false, at: { gte: since } },
        select: { subjectId: true, action: true, reason: true },
      }),
      (r) => r.length >= people.length
    )
    expect(new Set(rows.map((r) => r.subjectId))).toEqual(new Set(people))
    expect(rows.every((r) => r.action === 'COMPLIANCE_CHECK')).toBe(true)
    expect(rows[0].reason).toContain('visas, I-9s and background results')
  })

  it('a read that is allowed is still written against every person it shows', async () => {
    const officer = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: who.officerEmail } })
    const since = new Date()
    as(who.officerEmail)
    await compliance(req('GET', '/api/compliance'))
    const rows = await eventually(
      () => prisma.accessLog.findMany({ where: { actorPersonId: officer.id, allowed: true, at: { gte: since } } }),
      (r) => r.length > 0
    )
    expect(rows.length).toBeGreaterThan(0)
  })
})
