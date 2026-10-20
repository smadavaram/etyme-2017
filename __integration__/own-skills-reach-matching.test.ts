import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { PATCH as editPage } from '@/app/api/me/portfolio/route'
import { GET as readMatches, POST as runMatches } from '@/app/api/requirements/[id]/matches/route'

/**
 * An integrator's own engineer between projects reaches matching once he
 * says his own skills (found by the simulation's match station, 2026-10-20).
 *
 * Karthik Menon is Teleworld Solutions' own W2; his placement ended. The
 * DO-178C job at Corveldt Aerospace was sent to Teleworld. Matching weighs
 * only people with skills on record, and nobody lists an employee, so until
 * he could say his skills himself he never appeared — and the firm's own
 * people never went forward as INTERNAL from a match.
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const TELEWORLD_OWNER = 'world-teleworld@demo.etyme.local'
let jobId = ''

const withId = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))

describe('an integrator’s own engineer reaches matching through the skills he states', () => {
  beforeAll(async () => {
    await freshWorld()
    const job = await prisma.requirement.findFirstOrThrow({
      where: { status: 'OPEN', title: 'DO-178C verification engineer', company: { slug: 'world-corveldt' } },
      select: { id: true },
    })
    jobId = job.id
  }, 300_000)

  it('before he says his skills, Teleworld’s matching says its employees have none on record', async () => {
    as(TELEWORLD_OWNER)
    const run = await withId(runMatches, 'POST', `/api/requirements/${jobId}/matches`, jobId, {})
    expect(run.status, JSON.stringify(run.body)).toBe(200)
    const r = await withId(readMatches, 'GET', `/api/requirements/${jobId}/matches`, jobId)
    expect(r.body.data.basis).toContain('have no skills on record')
    expect(r.body.data.matches.some((m: any) => m.consultant.name === 'Karthik Menon')).toBe(false)
  })

  it('Karthik Menon says his own skills on his own page', async () => {
    as(KARTHIK)
    const r = await json(await editPage(req('PATCH', '/api/me/portfolio', { skills: ['DO-178C', 'Embedded C', 'LDRA'] })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toContain('Your skills read: DO-178C, Embedded C, LDRA.')
    const p = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: KARTHIK } }, select: { skills: true } })
    expect(p.skills).toEqual(['DO-178C', 'Embedded C', 'LDRA'])
  })

  it('Teleworld’s matching then offers him as its own employee, to go forward as INTERNAL, with reasons', async () => {
    as(TELEWORLD_OWNER)
    const run = await withId(runMatches, 'POST', `/api/requirements/${jobId}/matches`, jobId, {})
    expect(run.status).toBe(200)
    const r = await withId(readMatches, 'GET', `/api/requirements/${jobId}/matches`, jobId)
    expect(r.status).toBe(200)
    const him = r.body.data.matches.find((m: any) => m.consultant.name === 'Karthik Menon')
    expect(him, JSON.stringify(r.body.data.basis)).toBeDefined()
    expect(him.employee).toBe(true)
    expect(him.reach).toBe('OWN')
    expect(him.action.kind).toBe('SUBMIT')
    expect(him.action.as).toBe('INTERNAL')
    expect(him.factors.length).toBeGreaterThan(0)
    expect(typeof him.basis).toBe('string')
    expect(him.confidence).toBeTruthy()
    expect('unknowns' in him).toBe(true)
  })

  it('nobody else may write his skills: a firm’s seat on that door writes its own page, never his', async () => {
    as(TELEWORLD_OWNER)
    await json(await editPage(req('PATCH', '/api/me/portfolio', { skills: ['Something else'] })))
    const p = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: KARTHIK } }, select: { skills: true } })
    expect(p.skills).toEqual(['DO-178C', 'Embedded C', 'LDRA'])
  })
})
