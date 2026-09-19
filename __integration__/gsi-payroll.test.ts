import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma, as, req, json } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as ownPeople } from '@/app/api/submissions/own-people/route'
import { POST as submitCandidates } from '@/app/api/submissions/route'

/**
 * The two integrators have a bench of their own, and it is a payroll.
 *
 * `477b9803` let a prime, a GSI or an MSP put its own W2 employee in
 * front of a client with no bench listing, and gave the submit form an
 * "On our payroll" group to pick from. The world seed then made that
 * door open onto an empty room: each integrator held exactly one
 * EMPLOYEE seat — the delivery manager's own login — so a founder
 * opening the picker as Teleworld saw one name and it was himself.
 *
 * This walks what the seed now builds. Four people on each integrator's
 * payroll, none of them on anybody's bench, and one of them put in front
 * of a client on an open seat that firm was actually invited to.
 *
 * The absence is the point: no `ConsultantProfile` and no
 * `BenchListing`. That is exactly what tells an employee from a
 * marketed consultant, and if the seed ever grows them a profile the
 * INTERNAL path stops being exercised by the demo at all.
 */

const D = '@demo.etyme.local'
const TELEWORLD = `world-teleworld${D}`
const SUNDARA = `world-sundara${D}`

const TELEWORLD_TEAM = ['Karthik Menon', 'Amara Nwosu', 'Felix Brenner', 'Deepa Varma']
const SUNDARA_TEAM = ['Aditi Ramaswamy', 'Olivier Renard', 'Harish Pillai', 'Beatriz Salgado']

let seat = 0

beforeAll(async () => {
  await resetDatabase()
  const first = await seedWorld()
  seat = first.onPayroll
}, 600_000)

describe('each integrator has a delivery team on its own payroll', () => {
  it('offers Teleworld four of its own people, and never the delivery manager alone', async () => {
    as(TELEWORLD)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const names = r.body.data.people.map((p: any) => p.name)
    for (const name of TELEWORLD_TEAM) expect(names).toContain(name)
  })

  it('offers Sundara its own four, and never Teleworld’s', async () => {
    as(SUNDARA)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    const names = r.body.data.people.map((p: any) => p.name)
    for (const name of SUNDARA_TEAM) expect(names).toContain(name)
    for (const name of TELEWORLD_TEAM) expect(names).not.toContain(name)
  })

  it('says what each of them does, so a picker reads as a delivery team rather than a list of names', async () => {
    as(TELEWORLD)
    const r = await json(await ownPeople(req('GET', '/api/submissions/own-people')))
    const disciplines = r.body.data.people
      .filter((p: any) => TELEWORLD_TEAM.includes(p.name))
      .map((p: any) => p.role)
    expect(disciplines).toContain('Validation Engineer')
    expect(disciplines).toContain('Data Engineer')
    expect(disciplines).toContain('SAP Consultant')
  })

  it('counts them in what the seed reports back, so the reseed page can say how many', () => {
    expect(seat).toBe(TELEWORLD_TEAM.length + SUNDARA_TEAM.length)
  })
})

describe('an employee on a payroll is not a consultant on a bench', () => {
  it('gives none of the eight a consultant profile', async () => {
    const profiles = await prisma.consultantProfile.count({
      where: { person: { name: { in: [...TELEWORLD_TEAM, ...SUNDARA_TEAM] } } },
    })
    expect(profiles).toBe(0)
  })

  it('gives none of the eight a bench listing at any firm', async () => {
    const listings = await prisma.benchListing.count({
      where: { consultant: { person: { name: { in: [...TELEWORLD_TEAM, ...SUNDARA_TEAM] } } } },
    })
    expect(listings).toBe(0)
  })

  it('gives each of them one live employee seat at the firm that pays them', async () => {
    for (const [email, team] of [[TELEWORLD, TELEWORLD_TEAM], [SUNDARA, SUNDARA_TEAM]] as const) {
      const firm = await prisma.person.findUniqueOrThrow({
        where: { primaryEmail: email },
        select: { contexts: { select: { companyId: true }, take: 1 } },
      })
      const seats = await prisma.context.count({
        where: {
          companyId: firm.contexts[0].companyId,
          type: 'EMPLOYEE',
          revokedAt: null,
          suspendedAt: null,
          person: { name: { in: [...team] } },
        },
      })
      expect(seats).toBe(team.length)
    }
  })
})

describe('the walk from the picker to a real client seat', () => {
  it('lets Teleworld put its validation engineer in front of Corveldt with no bench listing anywhere', async () => {
    const requirement = await prisma.requirement.findFirstOrThrow({
      where: { title: 'DO-178C verification engineer', company: { slug: 'world-corveldt' } },
      select: { id: true },
    })
    const karthik = await prisma.person.findFirstOrThrow({ where: { name: 'Karthik Menon' } })
    const teleworld = await prisma.company.findFirstOrThrow({ where: { slug: 'world-teleworld' } })

    as(TELEWORLD)
    const r = await json(
      await submitCandidates(
        req('POST', '/api/submissions', {
          requirementId: requirement.id,
          personIds: [karthik.id],
          rate: 14_100,
          fromCompanyId: teleworld.id,
        })
      )
    )
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.results[0].status, JSON.stringify(r.body.data.results[0])).toBe('created')
  })

  it('records it as our own employee rather than as somebody we bought', async () => {
    const submission = await prisma.submission.findFirstOrThrow({
      where: { person: { name: 'Karthik Menon' } },
      select: { kind: true },
    })
    expect(submission.kind).toBe('INTERNAL')
  })
})

describe('pressing the seed button twice', () => {
  it('makes no second copy of anybody on either payroll', async () => {
    const before = await prisma.person.count({
      where: { name: { in: [...TELEWORLD_TEAM, ...SUNDARA_TEAM] } },
    })
    const seats = await prisma.context.count({
      where: { person: { name: { in: [...TELEWORLD_TEAM, ...SUNDARA_TEAM] } } },
    })

    await seedWorld()

    expect(await prisma.person.count({ where: { name: { in: [...TELEWORLD_TEAM, ...SUNDARA_TEAM] } } })).toBe(before)
    expect(await prisma.context.count({ where: { person: { name: { in: [...TELEWORLD_TEAM, ...SUNDARA_TEAM] } } } })).toBe(seats)
  }, 600_000)

  it('makes no second role, no second certificate and no second invitation for either integrator', async () => {
    const firms = await prisma.company.findMany({
      where: { slug: { in: ['world-teleworld', 'world-sundara'] } },
      select: { id: true },
    })
    const ids = firms.map((f) => f.id)
    const avionics = await prisma.requirement.findFirstOrThrow({
      where: { title: 'DO-178C verification engineer', company: { slug: 'world-corveldt' } },
      select: { id: true },
    })
    expect(await prisma.role.count({ where: { companyId: { in: ids }, name: 'Validation Engineer' } })).toBe(2)
    expect(await prisma.verification.count({ where: { companyId: { in: ids }, type: 'INSURANCE_GL' } })).toBe(2)
    expect(
      await prisma.requirementInvitation.count({
        where: { requirementId: avionics.id, toCompanyId: { in: ids } },
      })
    ).toBe(2)
  })
})
