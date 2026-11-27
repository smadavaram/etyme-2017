import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('next-auth/next', () => ({ getServerSession: async () => null }))
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as progressGet } from '@/app/api/learn/[tenant]/progress/route'
import { POST as pathPost } from '@/app/api/learn/paths/route'
import { POST as adoptPost } from '@/app/api/learn/adopt/route'
import { GET as adoptionsGet } from '@/app/api/learn/adoptions/route'

/**
 * A seat that holds only the reads of its own work (assignments.read and
 * timesheets.read) has no desk. The one door for such a seat
 * (lib/deskless-door) refused every /api/learn route with NO_DESK, so a
 * worker seated at a firm could not open her own learning page. These
 * calls use real /api/learn/... addresses, so the door sees the same path
 * a browser sends.
 */
const WORKER = 'own.work.learner@seed.etyme.invalid'

describe('a seat that holds only the reads of its own work and the learning site', () => {
  let slug = ''
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, slug: true } })
    slug = firm.slug
    await prisma.company.update({ where: { id: firm.id }, data: { pluginsOn: ['WEBSITE', 'TRAIN_TO_BENCH'], siteLiveAt: new Date(), claimedAt: new Date() } })
    const role = await prisma.role.create({ data: { companyId: firm.id, name: 'Own work only', permissions: ['assignments.read', 'timesheets.read'] } })
    const person = await prisma.person.create({ data: { name: 'Ola Learner', primaryEmail: WORKER } })
    await prisma.context.create({ data: { personId: person.id, companyId: firm.id, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Own work only' } })
  }, 240_000)

  it('a seat holding only own-work reads opens her own progress and path at the learning site', async () => {
    as(WORKER)
    const res = json(await progressGet(req('GET', `/api/learn/${slug}/progress?track=non-it`), { params: Promise.resolve({ tenant: slug }) }))
    const r = await res
    expect(JSON.stringify(r.body)).not.toContain('NO_DESK')
    expect(r.status).toBe(200)
  })

  it('a seat holding only own-work reads still cannot propose a path, adopt a course or read adoptions', async () => {
    as(WORKER)
    const a = await json(await pathPost(req('POST', '/api/learn/paths', { personId: 'x', mode: 'SYSTEM' })))
    const b = await json(await adoptPost(req('POST', '/api/learn/adopt', {})))
    const c = await json(await adoptionsGet(req('GET', '/api/learn/adoptions')))
    for (const r of [a, b, c]) expect(r.status).toBe(403)
  })
})
