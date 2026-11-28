import { describe, it, expect, beforeAll } from 'vitest'
import { req, prisma, resetDatabase } from './harness'
import { GET as watch } from '@/app/api/cron/watch/route'

/**
 * The nightly watch route passes this firm's own record of seat use into
 * the access watch (accessUseHere, 2026-11-16). Nothing writes the seat's
 * use-date column, so read alone it called everybody granted a month ago
 * a person who "has never used their access". Made-up firm on a reserved
 * domain.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

describe('the nightly watch route reads seat use from this firm’s own record', () => {
  let firmId = ''

  beforeAll(async () => {
    await resetDatabase()
    process.env.CRON_SECRET = 'integration-cron-secret'
    const c = await prisma.company.create({ data: { name: 'Quillmark Staffing', slug: 'watch-use-quillmark', kind: 'VENDOR', domain: 'quillmark.example' } })
    firmId = c.id
    const owner = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'] } })
    const recruiter = await prisma.role.create({ data: { companyId: c.id, name: 'Recruiter', permissions: ['submissions.read'] } })
    const own = await prisma.person.create({ data: { name: 'Lee Park', primaryEmail: 'lee@quillmark.example' } })
    await prisma.context.create({ data: { personId: own.id, companyId: c.id, roleId: owner.id, type: 'EMPLOYEE', grantedAt: daysAgo(90) } })
    // Invited forty days ago; came in here and acted twice since.
    const used = await prisma.person.create({ data: { name: 'Rosa Vance', primaryEmail: 'rosa@quillmark.example' } })
    await prisma.context.create({ data: { personId: used.id, companyId: c.id, roleId: recruiter.id, type: 'EMPLOYEE', grantedAt: daysAgo(40), invitedAt: daysAgo(40) } })
    await prisma.accessLog.create({ data: { subjectId: used.id, actorPersonId: used.id, actorCompanyId: c.id, action: 'INVITE_ACCEPTED', allowed: true, at: daysAgo(39) } as never })
    // Invited forty days ago; never came in here.
    const never = await prisma.person.create({ data: { name: 'Theo Marsh', primaryEmail: 'theo@quillmark.example' } })
    await prisma.context.create({ data: { personId: never.id, companyId: c.id, roleId: recruiter.id, type: 'EMPLOYEE', grantedAt: daysAgo(40), invitedAt: daysAgo(40) } })

    const res = await watch(req('GET', '/api/cron/watch', undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` }) as never)
    expect(res.status).toBe(200)
  }, 180_000)

  it('the nightly watch never says somebody has never used their access when she has signed in here', async () => {
    const told = (await prisma.notification.findMany({ where: { companyId: firmId }, select: { title: true, body: true } })).map((r) => `${r.title}\n${r.body ?? ''}`).join('\n')
    expect(told).not.toMatch(/Rosa Vance has never used/)
    expect(told).toMatch(/Theo Marsh has never used/)
  })
})
