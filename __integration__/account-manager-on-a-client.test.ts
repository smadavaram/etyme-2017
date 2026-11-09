import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET, PATCH } from '@/app/api/counterparties/route'

/**
 * The account manager on a client's record (2026-11-08): who sold the
 * deal, so the award's sales commission has a name where the job names no
 * owner at the selling firm. Brightmoor Staffing sells to Northbend
 * Athletic; Marisa Delacroix is its Account Manager.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const ACCOUNT = 'world-brightmoor-account@demo.etyme.local'
const RECRUITER = 'world-brightmoor-recruiter@demo.etyme.local'

let brightmoor = '', northbend = '', marisa = '', tobias = '', stranger = ''

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  northbend = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })).id
  marisa = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: ACCOUNT }, select: { id: true } })).id
  tobias = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: RECRUITER }, select: { id: true } })).id
  stranger = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'world-techpeple@demo.etyme.local' }, select: { id: true } })).id
}, 600_000)

const read = async (email: string) => {
  as(email)
  return json(await GET(req('GET', `/api/counterparties?accountManagerFor=${northbend}`)))
}
const name = async (email: string, personId: string | null) => {
  as(email)
  return json(await PATCH(req('PATCH', '/api/counterparties', { accountManagerFor: northbend, personId })))
}

describe('the account manager on a client', () => {
  it('the seeded world names Brightmoor’s own Account Manager on its client record, so the award has a name to pay sales commission to', async () => {
    const named = await prisma.counterparty.count({
      where: { companyId: brightmoor, relationship: 'CLIENT', accountManagerId: marisa },
    })
    expect(named).toBeGreaterThan(0)
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, relationship: 'CLIENT', accountManagerId: null } })).toBe(0)
    const r = await read(OWNER)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.colleagues.map((c: { id: string }) => c.id)).toContain(marisa)
  })

  it('the Owner names a colleague seated at the firm, and the client record says so in a sentence', async () => {
    const r = await name(OWNER, tobias)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toMatch(/is the account manager on Northbend Athletic/)
    const row = await prisma.counterparty.findFirstOrThrow({
      where: { companyId: brightmoor, otherCompanyId: northbend, relationship: 'CLIENT' },
      select: { accountManagerId: true, accountManagerSetById: true, accountManagerSetAt: true },
    })
    expect(row.accountManagerId).toBe(tobias)
    // Who named them, and when, are kept with the change and said on the drawer.
    expect(row.accountManagerSetById).toBe((await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })).id)
    expect(row.accountManagerSetAt).toBeInstanceOf(Date)
    const shown = await read(OWNER)
    expect(shown.body.data.setBy).toBeTruthy()
    expect(shown.body.data.setAt).toBeTruthy()
  })

  it('an Account Manager may name one too, and may clear it', async () => {
    const r = await name(ACCOUNT, marisa)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const cleared = await name(ACCOUNT, null)
    expect(cleared.status).toBe(200)
    expect(cleared.body.data.says).toMatch(/Nobody is named/)
    await name(ACCOUNT, marisa)
  })

  it('a recruiter is refused in a sentence naming who names the account manager, and nothing moves', async () => {
    const r = await name(RECRUITER, tobias)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('The Owner, an Admin or an Account Manager names the account manager on a client.')
    const shown = await read(RECRUITER)
    expect(shown.body.data.mayName).toBe(false)
    expect(shown.body.data.colleagues).toEqual([])
  })

  it('a person not seated at the firm is refused as not seated there, by name', async () => {
    const r = await name(OWNER, stranger)
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/is not seated at Brightmoor Staffing, so they cannot be the account manager/)
    const row = await prisma.counterparty.findFirstOrThrow({
      where: { companyId: brightmoor, otherCompanyId: northbend, relationship: 'CLIENT' },
      select: { accountManagerId: true },
    })
    expect(row.accountManagerId).toBe(marisa)
  })

  it('a firm that is not a client on the register is not answered', async () => {
    as(OWNER)
    const r = await json(await GET(req('GET', `/api/counterparties?accountManagerFor=${brightmoor}`)))
    expect(r.status).toBe(404)
  })
})
