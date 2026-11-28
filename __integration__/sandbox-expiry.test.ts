import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { req, json, prisma, freshWorld } from './harness'
import { GET as reap } from '@/app/api/cron/reap-demos/route'
import { WORLD_SLUGS } from '@/lib/seed-world'

/**
 * The daily job, on the seeded world with sandboxes of every age beside
 * it, and two companies that carry the demo flag and are not a visitor's.
 */

const SECRET = 'sandbox-expiry-secret'
const run = async () => json(await reap(req('GET', '/api/cron/reap-demos', undefined, { authorization: `Bearer ${SECRET}` })))
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
const ids: Record<string, string> = {}

async function sandbox(key: string, slug: string, usedDaysAgo: number, email: string, extra: Partial<{ domain: string; domainVerified: boolean }> = {}) {
  const c = await prisma.company.create({
    data: { slug, name: `Sandbox ${key}`, kind: 'VENDOR', isDemo: true, createdAt: daysAgo(60), ...extra },
  })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: `Visitor ${key}`, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', lastUsedAt: daysAgo(usedDaysAgo) } })
  ids[key] = c.id
  return c
}

beforeAll(async () => {
  await freshWorld()
  process.env.CRON_SECRET = SECRET
  await sandbox('old', 'demo-aaaaaaaaaaaa', 31, 'you-aaaa@demo.etyme.local')
  // A chain's second firm: no seat of its own, removed with its sandbox.
  const sister = await prisma.company.create({
    data: { slug: 'demo-aaaaaaaaaaaa-client', name: 'Sandbox old client', kind: 'CLIENT', isDemo: true, createdAt: daysAgo(60) },
  })
  ids.sister = sister.id
  await sandbox('quiet', 'demo-bbbbbbbbbbbb', 24, 'dana.visitor@yahoo.com')
  await sandbox('fresh', 'demo-cccccccccccc', 2, 'you-cccc@demo.etyme.local')
  // Carries the flag and a verified, registrable domain: a real tenant.
  await sandbox('real', 'demo-dddddddddddd', 90, 'owner@realco.com', { domain: 'realco.com', domainVerified: true })
  // Carries the flag and was not made by the demo door.
  await sandbox('other', 'sandbox-visitor-other', 90, 'you-eeee@demo.etyme.local')
}, 600_000)

afterAll(() => {
  delete process.env.CRON_SECRET
})

describe('a visitor’s sandbox is removed after thirty days unused', () => {
  it('a visitor’s sandbox unused for thirty days is removed, and the demo world and every real company are never touched', async () => {
    const worldBefore = await prisma.company.count({ where: { slug: { in: [...WORLD_SLUGS] } } })
    const r = await run()
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.removed).toBe(1)
    expect(await prisma.company.findUnique({ where: { id: ids.old } })).toBeNull()
    expect(await prisma.company.findUnique({ where: { id: ids.sister } })).toBeNull()
    for (const k of ['quiet', 'fresh', 'real', 'other']) {
      expect(await prisma.company.findUnique({ where: { id: ids[k] } }), k).not.toBeNull()
    }
    expect(await prisma.company.count({ where: { slug: { in: [...WORLD_SLUGS] } } })).toBe(worldBefore)
  })

  it('each removal is written down once, with the reason in words, and is not reversible', async () => {
    const rows = await prisma.automationLog.findMany({ where: { action: 'DEMO_SANDBOX_REMOVED' }, select: { reason: true, reversible: true, payload: true } })
    expect(rows).toHaveLength(1)
    expect(rows[0].reversible).toBe(false)
    expect(rows[0].reason).toMatch(/removed after 30 days nobody used it/)
    expect(JSON.stringify(rows[0].payload)).toContain('demo-aaaaaaaaaaaa-client')
  })

  it('a visitor who left an address is warned a week before', async () => {
    const warned = await prisma.automationLog.findMany({ where: { action: 'DEMO_SANDBOX_EXPIRY_WARNED' }, select: { companyId: true, summary: true } })
    expect(warned.map((w) => w.companyId)).toEqual([ids.quiet])
    expect(warned[0].summary).toMatch(/1 person was told/)
    const msg = await prisma.textMessage.findFirstOrThrow({ where: { companyId: ids.quiet, direction: 'OUT' }, select: { body: true, to: true } })
    expect(msg.to).toBe('dana.visitor@yahoo.com')
    expect(msg.body).toContain('Open it before then to keep it.')
    // The date the visitor is shown is the date the job removes it.
    const shown = await prisma.company.findUniqueOrThrow({ where: { id: ids.quiet }, select: { demoExpiresAt: true } })
    expect(Math.round((shown.demoExpiresAt!.getTime() - daysAgo(24).getTime()) / 86_400_000)).toBe(30)
  })

  it('runs again the next day without warning anybody twice or touching what it kept', async () => {
    const r = await run()
    expect(r.body.data.removed).toBe(0)
    expect(r.body.data.warned).toBe(0)
    expect(await prisma.automationLog.count({ where: { action: 'DEMO_SANDBOX_EXPIRY_WARNED' } })).toBe(1)
  })
})
