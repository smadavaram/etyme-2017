import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { req, json, prisma, freshWorld } from './harness'
import { RELEASE_PHRASE, WILL_DELETE } from '@/lib/seed-rebuild'
import { POST as rebuild } from '@/app/api/seed-world/rebuild/route'

/**
 * The ties only deleting releases, decided by the founder on 2026-09-30:
 * a row held by a visitor's own demo sandbox is deleted with the release;
 * a row held by anybody else never is.
 *
 * On production six ties were left after the first release, every one a
 * bench listing a visitor's sandbox had written about a demo consultant.
 */

const SECRET = 'demo-release-sandbox'
const call = async (body: unknown) =>
  json(await rebuild(req('POST', '/api/seed-world/rebuild', body, { authorization: `Bearer ${SECRET}` })))

const ids: Record<string, string> = {}

beforeAll(async () => {
  await freshWorld()
  process.env.CRON_SECRET = SECRET
  const profile = await prisma.consultantProfile.findFirstOrThrow({
    where: { person: { primaryEmail: 'helena.marsh@seed.etyme.invalid' } },
    select: { id: true },
  })
  // A visitor's own sandbox, as the demo door makes one.
  const sandbox = await prisma.company.create({
    data: { slug: 'demo-84d952625583', name: 'Norwood Consulting', kind: 'VENDOR', isDemo: true, demoExpiresAt: new Date(Date.now() + 14 * 86_400_000) },
  })
  // A company that is not a sandbox, whose row must survive.
  const acme = await prisma.company.create({
    data: { slug: 'acme-bench', name: 'Acme Bench', kind: 'VENDOR', domain: 'acme-bench.com', domainVerified: true },
  })
  const theirs = await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: sandbox.id, tier: 'MARKETING' } })
  const kept = await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: acme.id, tier: 'MARKETING' } })
  Object.assign(ids, { sandbox: sandbox.id, acme: acme.id, theirs: theirs.id, kept: kept.id })
}, 600_000)

afterAll(() => {
  delete process.env.CRON_SECRET
})

describe('ties held only by deleting a row', () => {
  it('the dry run lists the visitor sandbox’s rows first, as will delete, and a company’s rows as left', async () => {
    const r = await call({ dryRun: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const ties = r.body.data.ties as { table: string; ownerStanding: string; releasable: boolean; release: string }[]
    const mine = ties.filter((t) => t.table === 'BenchListing')
    const sandbox = mine.find((t) => t.ownerStanding === 'VISITOR_SANDBOX')!
    const acme = mine.find((t) => t.ownerStanding === 'OUTSIDE')!
    expect(sandbox, JSON.stringify(mine, null, 2)).toBeDefined()
    expect(sandbox.releasable).toBe(true)
    expect(sandbox.release.startsWith(WILL_DELETE)).toBe(true)
    expect(ties[0].release.startsWith(WILL_DELETE)).toBe(true)
    expect(acme.releasable).toBe(false)
    expect(acme.release).not.toContain(WILL_DELETE)
  })

  it('a tie held only by a visitor’s own sandbox is deleted with the release, and a tie held by anybody else never is', async () => {
    const r = await call({ confirm: RELEASE_PHRASE })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.deleted).toBeGreaterThanOrEqual(1)
    expect(await prisma.benchListing.findUnique({ where: { id: ids.theirs } })).toBeNull()
    expect(await prisma.benchListing.findUnique({ where: { id: ids.kept } })).not.toBeNull()
    // The sandbox itself is not deleted by the release; only the row that tied it.
    expect(await prisma.company.findUnique({ where: { id: ids.sandbox } })).not.toBeNull()
  })

  it('the release is written down with every deleted row’s id, not reversible', async () => {
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'DEMO_TIES_RELEASED' }, orderBy: { at: 'desc' },
      select: { payload: true, reversible: true },
    })
    expect(log.reversible).toBe(false)
    const deleted = (log.payload as { deleted: { table: string; ids: string[] }[] }).deleted
    expect(deleted.flatMap((d) => d.ids)).toContain(ids.theirs)
    expect(deleted.flatMap((d) => d.ids)).not.toContain(ids.kept)
  })
})
