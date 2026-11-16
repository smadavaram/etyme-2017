import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as access } from '@/app/api/access/route'
import { POST as invite } from '@/app/api/access/invite/route'
import { GET as settings } from '@/app/api/settings/route'
import { GET as grantsList, POST as giveAccess } from '@/app/api/settings/grants/route'
import { readCompanySeats, peopleOf, countSeats, peopleWords } from '@/lib/company-seats'
import { recordSignInLedger } from '@/lib/identity/sign-in'

/**
 * Signed in means signed in at this firm, on every screen that counts a
 * seat (2026-11-16).
 *
 * Users & permissions already read this firm's own record. The one seat
 * reader still read a sign-in anywhere on Etyme, so Settings, Team
 * structure, setup, Compliance and the Give access picker counted a seat
 * invited at an address that signs in elsewhere as with access, and told
 * the firm the address has an account. Here one person who signs in at
 * another firm is invited to Brightmoor, and every screen is read before
 * and after she signs in here.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const ELSEWHERE = 'mara.lindqvist@harborline-tech.example'

const it_: Record<string, string> = {}

const register = async () => {
  as(OWNER)
  const r = await json(await access(req('GET', '/api/access')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
const settingsPeople = async () => {
  as(OWNER)
  const r = await json(await settings(req('GET', '/api/settings')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return String(r.body.data.people)
}
const pickerState = async () => {
  as(OWNER)
  const r = await json(await grantsList(req('GET', '/api/settings/grants')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.people.find((p: any) => p.contextId === it_.seat)?.state
}

beforeAll(async () => {
  await freshWorld()
  const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  const other = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-kestrel' }, select: { id: true } })
  it_.firm = firm.id
  const recruiter = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Recruiter' }, select: { id: true } })

  // She already signs in at another firm: a Google sign-in, a seat there
  // and her own acts on its log.
  const her = await prisma.person.create({ data: { primaryEmail: ELSEWHERE, name: 'Mara Lindqvist' }, select: { id: true } })
  it_.her = her.id
  await prisma.credential.create({ data: { personId: her.id, provider: 'GOOGLE', providerId: `g-${her.id}`, email: ELSEWHERE, lastUsedAt: new Date() } })
  await prisma.context.create({ data: { personId: her.id, companyId: other.id, type: 'EMPLOYEE', grantReason: 'Works there' } })
  await prisma.accessLog.create({ data: { subjectId: her.id, actorPersonId: her.id, actorCompanyId: other.id, action: 'CONTEXT_SWITCH', reason: 'Switched to her seat there' } })

  as(OWNER)
  const r = await json(await invite(req('POST', '/api/access/invite', { email: ELSEWHERE, name: 'Mara Lindqvist', roleId: recruiter.id })))
  expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  it_.seat = (await prisma.context.findFirstOrThrow({
    where: { companyId: firm.id, revokedAt: null, personId: her.id }, select: { id: true },
  })).id
}, 300_000)

describe('every screen that counts a seat as signed in reads this firm’s own record, never a sign-in elsewhere', () => {
  it('the one seat reader reads a seat invited at an address that signs in elsewhere as invited, until she signs in here', async () => {
    const seat = (await readCompanySeats(it_.firm)).find((s) => s.contextId === it_.seat)
    expect(seat?.state).toBe('INVITED')
  })

  it('Users & permissions, Settings and the Give access picker count the same seats as signed in, before she signs in here', async () => {
    const data = await register()
    const counts = countSeats(peopleOf(await readCompanySeats(it_.firm)))
    expect({ withAccess: data.summary.withAccess, invited: data.summary.invited }).toEqual({ withAccess: counts.withAccess, invited: counts.invited })
    expect(await settingsPeople()).toBe(peopleWords(counts))
    expect(data.waitingForAccess.find((w: any) => w.contextId === it_.seat)).toMatchObject({ figure: 'invited', signedIn: false })
    expect(await pickerState()).toBe('INVITED')
  })

  it('a grant to her before she signs in here says it starts once she signs in, the same as for an address Etyme has never seen', async () => {
    as(OWNER)
    const r = await json(await giveAccess(req('POST', '/api/settings/grants', {
      permission: 'utilization.read', contextId: it_.seat, scope: 'COMPANY', reason: 'Plans who goes where while the resource manager is away',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(JSON.stringify(r.body)).toContain(`once they sign in with ${ELSEWHERE}.`)
    expect(JSON.stringify(r.body)).not.toContain('may now')
  })

  it('once she signs in here, the seat reader, Users & permissions, Settings and the picker all move her to with access together', async () => {
    const before = countSeats(peopleOf(await readCompanySeats(it_.firm)))
    await recordSignInLedger({ email: ELSEWHERE, door: 'PASSWORD' })

    const after = countSeats(peopleOf(await readCompanySeats(it_.firm)))
    expect(after).toMatchObject({ withAccess: before.withAccess + 1, invited: before.invited - 1 })
    const data = await register()
    expect({ withAccess: data.summary.withAccess, invited: data.summary.invited }).toEqual({ withAccess: after.withAccess, invited: after.invited })
    expect(await settingsPeople()).toBe(peopleWords(after))
    expect(await pickerState()).toBe('WITH_ACCESS')
  })
})
