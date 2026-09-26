import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as mayI, POST as seed } from '@/app/api/seed-world/route'

/**
 * Who can press the re-seed button, run against the real route.
 *
 * The source scan in `__tests__/invariants/reseed-button` pins what the
 * code says. This asks the route itself, because a gate is only a gate
 * if it refuses somebody — and this one sits behind a page that is
 * deliberately public and a write that creates twenty companies.
 *
 * The environment is the fixture here: ETYME_STAFF_EMAILS and
 * CRON_SECRET are set and unset around each case, and put back after,
 * so a later file does not inherit a deployment that lets anybody in.
 */

const STAFF = 'founder@etyme.test'
const STRANGER = 'somebody@elsewhere.test'
const before = {
  staff: process.env.ETYME_STAFF_EMAILS,
  secret: process.env.CRON_SECRET,
}
const bearer = (token: string) =>
  req('POST', '/api/seed-world', undefined, { authorization: `Bearer ${token}` })

beforeAll(async () => {
  await resetDatabase()
  for (const email of [STAFF, STRANGER]) {
    await prisma.person.create({ data: { name: email, primaryEmail: email } })
  }
})

afterAll(() => {
  if (before.staff === undefined) delete process.env.ETYME_STAFF_EMAILS
  else process.env.ETYME_STAFF_EMAILS = before.staff
  if (before.secret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = before.secret
})

describe('a deployment where nobody is named as staff', () => {
  beforeAll(() => {
    delete process.env.ETYME_STAFF_EMAILS
    process.env.CRON_SECRET = 'the-real-secret'
  })

  it('refuses everybody from the browser, and names the variable to set', async () => {
    as(STAFF)
    const r = await json(await seed(req('POST', '/api/seed-world')))
    expect(r.status).toBe(401)
    expect(r.body.error.message).toContain('ETYME_STAFF_EMAILS')
  })

  it('draws no button, because the page asks first', async () => {
    as(STAFF)
    const r = await json(await mayI())
    expect(r.body.data.mayReseed).toBe(false)
  })
})

describe('a deployment with staff named', () => {
  beforeAll(() => {
    process.env.ETYME_STAFF_EMAILS = `  ${STAFF} , someone.else@etyme.test `
    process.env.CRON_SECRET = 'the-real-secret'
  })

  it('somebody who is not on the list is refused in a sentence, and gets no button', async () => {
    as(STRANGER)
    const r = await json(await seed(req('POST', '/api/seed-world')))
    expect(r.status).toBe(401)
    expect(r.body.error.message).toMatch(/is for Etyme staff/)
    expect((await json(await mayI())).body.data.mayReseed).toBe(false)
  })

  it('a wrong bearer token is told the secret is wrong — never handed the staff sentence to probe with', async () => {
    as(STRANGER)
    const r = await json(await seed(bearer('not-the-secret')))
    expect(r.status).toBe(401)
    expect(r.body.error.message).toBe('That is not the CRON_SECRET for this deployment.')
  })

  it('a staff address on the list gets the button, whatever spacing the variable was typed with', async () => {
    as(STAFF)
    const r = await json(await mayI())
    expect(r.body.data.mayReseed).toBe(true)
  })

  it('and can actually seed the world, with no secret anywhere near the browser', async () => {
    as(STAFF)
    const r = await json(await seed(req('POST', '/api/seed-world')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.firms).toBeGreaterThan(0)
    expect(await prisma.company.count({ where: { slug: { startsWith: 'world-' } } })).toBeGreaterThan(0)
  }, 240_000)

  it('pressing it twice makes no second copy of anything', async () => {
    const firms = await prisma.company.count({ where: { slug: { startsWith: 'world-' } } })
    as(STAFF)
    const r = await json(await seed(req('POST', '/api/seed-world')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(await prisma.company.count({ where: { slug: { startsWith: 'world-' } } })).toBe(firms)
  }, 240_000)

  it('the machine door still works: the right bearer token gets in without being anybody', async () => {
    as('nobody@nowhere.test')
    const r = await json(await seed(bearer('the-real-secret')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  }, 240_000)
})
