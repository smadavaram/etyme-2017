import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { ensureDefaultRoles } from '@/lib/company-roles'

import { GET as accessRegister, POST as grantSeat } from '@/app/api/access/route'
import { GET as roleCatalog } from '@/app/api/roles/route'
import { GET as doNotReturn, POST as doNotReturnAct } from '@/app/api/blacklist/route'
import { GET as subjects } from '@/app/api/blacklist/subjects/route'

/**
 * Two findings from the release walk of 1,181 screens, as sentences.
 *
 * **F9** — `GET /api/access` answered 200 to a Validation Engineer
 * holding `assignments.read` and `timesheets.read`: the firm's whole
 * staff list, every colleague's work email, the role each holds and how
 * sensitive it is. POST had asked for a permission since the day it was
 * written; the read beside it had never asked for anything.
 *
 * **F15/F16** — the refusals that did exist handed the reader a
 * permission key, and the do-not-return form asked a human being for a
 * "Subject ID". Both are the same fault: the machine's own words put in
 * front of somebody who has done this job for ten years and never seen
 * Etyme.
 *
 * The seats below are built out of the product's own role sets through
 * `ensureDefaultRoles`, never out of a permission list written here, so
 * a role that changes changes the test with it.
 */

const D = '@demo.etyme.local'
const ENGINEER = 'engineer.sundara@seed.etyme.invalid'
const COMPLIANCE = 'compliance.sundara@seed.etyme.invalid'
const NORTHBEND_COMPLIANCE = `world-nike-compliance${D}`
const NORTHBEND_PROGRAM = `world-nike-programme${D}`

const co = { sundara: '', northbend: '' }
let engineerRoleId = ''

async function seat(companyId: string, kind: string, roleName: string, name: string, email: string) {
  await ensureDefaultRoles(companyId, kind)
  const role = await prisma.role.findFirstOrThrow({ where: { companyId, name: roleName } })
  const person = await prisma.person.upsert({
    where: { primaryEmail: email }, update: { name }, create: { name, primaryEmail: email },
  })
  if (!(await prisma.context.findFirst({ where: { personId: person.id, companyId } }))) {
    await prisma.context.create({
      data: {
        personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', side: 'SELL',
        grantReason: `${roleName}, for the refusals walk`,
      },
    })
  }
  return person.id
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()

  co.sundara = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-sundara' } })).id
  co.northbend = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' } })).id

  // The exact seat the walk signed a cookie for: somebody who files a
  // week and reads the contract they are on, and nothing else. Not a
  // shipped role — a delivery firm writes this one itself — so it is
  // built here and named for what it is.
  const role = await prisma.role.create({
    data: {
      companyId: co.sundara,
      name: 'Validation Engineer',
      permissions: ['assignments.read', 'timesheets.read'],
    },
  })
  engineerRoleId = role.id
  const person = await prisma.person.upsert({
    where: { primaryEmail: ENGINEER },
    update: {}, create: { name: 'Aditi Ramaswamy', primaryEmail: ENGINEER },
  })
  await prisma.context.create({
    data: {
      personId: person.id, companyId: co.sundara, roleId: role.id, type: 'EMPLOYEE',
      side: 'SELL', grantReason: 'Validation Engineer, for the refusals walk',
    },
  })

  await seat(co.sundara, 'GSI', 'Compliance Officer', 'Meera Balan', COMPLIANCE)
}, 240_000)

/** No permission key of the shape `word.word` anywhere in a sentence. */
function hasNoKeyIn(says: string) {
  expect(says, `this reads like a code: ${says}`).not.toMatch(/\b[a-z]+\.(read|write|manage|approve|run|issue|record|cost|create|rate|distribute|terminate)\b/)
}

describe('an engineer who files a timesheet cannot read the firm’s staff register', () => {
  it('refuses the access register to a seat that only reads its own work', async () => {
    as(ENGINEER)
    const { status, body } = await json(await accessRegister(req('GET', '/api/access')))
    expect(status).toBe(403)
    expect(body.data).toBeUndefined()
  })

  it('names the desks that do read it, and never the permission', async () => {
    as(ENGINEER)
    const { body } = await json(await accessRegister(req('GET', '/api/access')))
    const says: string = body.error.message
    hasNoKeyIn(says)
    expect(says).toContain('Compliance Officer')
    expect(says).toContain('Sundara')
  })

  it('refuses the catalog of roles to the same seat, for the same reason', async () => {
    as(ENGINEER)
    const { status, body } = await json(await roleCatalog(req('GET', '/api/roles')))
    expect(status).toBe(403)
    hasNoKeyIn(body.error.message)
  })

  it('opens both to the compliance officer, whose job is to know who holds what', async () => {
    as(COMPLIANCE)
    const register = await json(await accessRegister(req('GET', '/api/access')))
    expect(register.status).toBe(200)
    expect(register.body.data.people.length).toBeGreaterThan(0)

    const catalog = await json(await roleCatalog(req('GET', '/api/roles')))
    expect(catalog.status).toBe(200)
    expect(catalog.body.data.roles.map((r: any) => r.name)).toContain('Validation Engineer')
  })

  it('still lets nobody but the account owner hand out a seat', async () => {
    // Reading who holds what opened up; giving somebody a seat did not.
    as(COMPLIANCE)
    const { status, body } = await json(await grantSeat(
      req('POST', '/api/access', { contextId: 'whoever', roleId: engineerRoleId, reason: 'Because I said so.' })
    ))
    expect(status).toBe(403)
    hasNoKeyIn(body.error.message)
    expect(body.error.message).toContain('Owner')
  })
})

describe('the do-not-return list names people, and nobody types a database id', () => {
  it('offers the people this company has actually dealt with, by name', async () => {
    as(NORTHBEND_COMPLIANCE)
    const { status, body } = await json(await subjects(req('GET', '/api/blacklist/subjects?type=PERSON')))
    expect(status).toBe(200)
    expect(body.data.subjects.length).toBeGreaterThan(0)
    for (const s of body.data.subjects) {
      expect(s.name).toBeTruthy()
      expect(s.name).not.toMatch(/^c[a-z0-9]{20,}$/)
      expect(s.note).toBeTruthy()
    }
  })

  it('finds somebody on three letters of their name', async () => {
    as(NORTHBEND_COMPLIANCE)
    const all = await json(await subjects(req('GET', '/api/blacklist/subjects?type=PERSON')))
    const first: string = all.body.data.subjects[0].name
    const bit = first.slice(0, 3).toLowerCase()
    const { body } = await json(await subjects(req('GET', `/api/blacklist/subjects?type=PERSON&q=${bit}`)))
    expect(body.data.subjects.map((s: any) => s.name)).toContain(first)
  })

  it('offers the firms this company has traded with, and never itself', async () => {
    as(NORTHBEND_COMPLIANCE)
    const { body } = await json(await subjects(req('GET', '/api/blacklist/subjects?type=COMPANY')))
    expect(body.data.subjects.length).toBeGreaterThan(0)
    const self = await prisma.company.findUniqueOrThrow({ where: { id: co.northbend }, select: { name: true } })
    expect(body.data.subjects.map((s: any) => s.name)).not.toContain(self.name)
  })

  it('bars somebody this company has dealt with, and puts their name on the row', async () => {
    as(NORTHBEND_PROGRAM)
    const picker = await json(await subjects(req('GET', '/api/blacklist/subjects?type=PERSON')))
    const pick = picker.body.data.subjects[0]

    const added = await json(await doNotReturnAct(req('POST', '/api/blacklist', {
      action: 'ADD', targetType: 'PERSON', targetId: pick.id,
      reason: 'Left a site mid-week without telling anybody.',
    })))
    expect(added.status).toBe(201)

    const list = await json(await doNotReturn(req('GET', '/api/blacklist?includeInactive=true')))
    const row = list.body.data.blacklist.find((b: any) => b.targetId === pick.id)
    expect(row.targetName).toBe(pick.name)
    expect(row.blockedByName).toBeTruthy()
  })

  it('refuses to bar somebody this company has never met, and says why', async () => {
    // Somebody real on Etyme, at a firm Northbend has no dealings with.
    const stranger = await prisma.person.findFirstOrThrow({
      where: { primaryEmail: ENGINEER }, select: { id: true, name: true },
    })
    as(NORTHBEND_PROGRAM)
    const { status, body } = await json(await doNotReturnAct(req('POST', '/api/blacklist', {
      action: 'ADD', targetType: 'PERSON', targetId: stranger.id, reason: 'On a hunch.',
    })))
    expect(status).toBe(403)
    expect(body.error.code).toBe('NOT_OURS')
    expect(body.error.message).toContain(stranger.name)
    expect(body.error.message).toContain('never been put forward')
  })

  it('refuses a made-up id with a sentence, not "Person not found"', async () => {
    as(NORTHBEND_PROGRAM)
    const { status, body } = await json(await doNotReturnAct(req('POST', '/api/blacklist', {
      action: 'ADD', targetType: 'PERSON', targetId: 'not-a-real-person', reason: 'Typed it in.',
    })))
    expect(status).toBe(404)
    expect(body.error.message).toContain('Pick somebody from the list')
  })
})
