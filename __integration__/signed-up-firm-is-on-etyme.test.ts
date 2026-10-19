import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { POST as addCompany, GET as listCompanies } from '@/app/api/companies/route'
import { createCompany, claimSignedUpFirms } from '@/lib/company-create'
import { isShell } from '@/lib/off-system'
import { POST as backfill } from '@/app/api/staff/backfill-claimed-at/route'

/**
 * `Company.claimedAt` is what "on Etyme" means: null is a shell, a firm
 * somebody else wrote down that nobody at it has joined. Until 2026-10-19
 * nothing set it when a firm signed up, so every firm that signed up —
 * Tapin included — read as a shell: "not on Etyme" on its partners'
 * screens, nameable as anybody's client, its week approvals checked
 * against a supplier's address book.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'

describe('a firm that signed up is on Etyme; only a firm somebody else wrote down is not', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 240_000)

  it('a firm that signed up is on Etyme from the moment it is made, and has its public page', async () => {
    const founder = await prisma.person.create({ data: { name: 'Sharath', primaryEmail: 'sharath@tapin-staffing.example' } })
    const made = await createCompany({
      name: 'Tapin', kind: 'VENDOR', slug: 'tapin-signed-up', domain: 'tapin-staffing.example',
      byPersonId: founder.id, seatAsOwner: true, claimDomain: true, startsSetup: true,
    })
    const tapin = await prisma.company.findUniqueOrThrow({ where: { id: made.company.id } })
    expect(isShell(tapin)).toBe(false)
    expect(tapin.listedById).toBeNull()
    expect(tapin.siteLiveAt).not.toBeNull()
  })

  it('a client a firm writes down from Add company is a shell on that firm’s register, with no public page, in the same world, and the Companies list says it is not on Etyme yet rather than print an address that opens nothing', async () => {
    as(OWNER)
    const r = await json(await addCompany(req('POST', '/api/companies', { name: 'Ostrander Mills', kind: 'CLIENT', relationship: 'CLIENT' })))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { person: { primaryEmail: OWNER } } } } })
    const written = await prisma.company.findUniqueOrThrow({ where: { id: r.body.data.company.id } })
    expect(isShell(written)).toBe(true)
    expect(written.listedById).toBe(brightmoor.id)
    expect(written.siteLiveAt).toBeNull()
    expect(written.isDemo).toBe(brightmoor.isDemo)

    const list = await json(await listCompanies(req('GET', '/api/companies')))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(list.body.data.companies.find((c: { id: string }) => c.id === written.id)).toMatchObject({ onEtyme: false, hasPage: false })
    expect(list.body.data.companies.find((c: { id: string }) => c.id === brightmoor.id)).toMatchObject({ onEtyme: true })
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/companies/page.tsx'), 'utf8')
    expect(page).toContain("if (!c.onEtyme) return 'Not on Etyme yet'")
    expect(page).not.toMatch(/\{(row|company)\.slug\}\.etyme\.com/)
  })

  it('the one-off marks every firm somebody has a seat at as on Etyme, leaves a shell nobody joined alone, and finds nothing the second time', async () => {
    const seated = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { roleId: { not: null } } } }, select: { id: true, createdAt: true } })
    await prisma.company.update({ where: { id: seated.id }, data: { claimedAt: null } })
    const shell = await prisma.company.findFirstOrThrow({ where: { name: 'Ostrander Mills' }, select: { id: true } })

    expect((await claimSignedUpFirms(prisma, { write: false })).found).toBeGreaterThanOrEqual(1)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: seated.id } })).claimedAt).toBeNull()

    const first = await claimSignedUpFirms(prisma, { write: true })
    expect(first.claimed).toBe(first.found)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: seated.id } })).claimedAt).toEqual(seated.createdAt)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: shell.id } })).claimedAt).toBeNull()
    expect(await claimSignedUpFirms(prisma, { write: true })).toEqual({ found: 0, claimed: 0 })
  })

  it('the one-off that marks signed-up firms as on Etyme runs behind the cron secret, counts first, writes on request, and finds nothing the second time', async () => {
    const before = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'the-real-secret'
    const call = (token: string | null, body?: unknown) =>
      backfill(req('POST', '/api/staff/backfill-claimed-at', body, token ? { authorization: `Bearer ${token}` } : {}))
    try {
      const seated = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { roleId: { not: null } } } }, select: { id: true, createdAt: true } })
      await prisma.company.update({ where: { id: seated.id }, data: { claimedAt: null } })
      const shell = await prisma.company.findFirstOrThrow({ where: { name: 'Ostrander Mills' }, select: { id: true } })
      const logsBefore = await prisma.automationLog.count({ where: { action: 'SIGNED_UP_FIRMS_CLAIMED' } })

      expect((await call(null, { write: true })).status).toBe(401)
      expect((await call('not-the-secret', { write: true })).status).toBe(401)
      expect((await prisma.company.findUniqueOrThrow({ where: { id: seated.id } })).claimedAt).toBeNull()

      const counted = await json(await call('the-real-secret'))
      expect(counted.status, JSON.stringify(counted.body)).toBe(200)
      expect(counted.body.data.write).toBe(false)
      expect(counted.body.data.found).toBeGreaterThanOrEqual(1)
      expect((await prisma.company.findUniqueOrThrow({ where: { id: seated.id } })).claimedAt).toBeNull()
      expect(await prisma.automationLog.count({ where: { action: 'SIGNED_UP_FIRMS_CLAIMED' } })).toBe(logsBefore)

      const written = await json(await call('the-real-secret', { write: true }))
      expect(written.status, JSON.stringify(written.body)).toBe(200)
      expect(written.body.data.claimed).toBe(written.body.data.found)
      expect(written.body.data.claimed).toBeGreaterThanOrEqual(1)
      expect((await prisma.company.findUniqueOrThrow({ where: { id: seated.id } })).claimedAt).toEqual(seated.createdAt)
      expect((await prisma.company.findUniqueOrThrow({ where: { id: shell.id } })).claimedAt).toBeNull()
      const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'SIGNED_UP_FIRMS_CLAIMED' }, orderBy: { at: 'desc' } })
      expect(log.companyId).toBeNull()
      expect(log.reversible).toBe(false)
      expect(log.payload).toMatchObject({ claimed: written.body.data.claimed, by: 'STAFF', via: 'CRON_SECRET' })

      const again = await json(await call('the-real-secret', { write: true }))
      expect(again.body.data).toMatchObject({ found: 0, claimed: 0 })
      expect(await prisma.automationLog.count({ where: { action: 'SIGNED_UP_FIRMS_CLAIMED' } })).toBe(logsBefore + 1)
    } finally {
      if (before === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = before
    }
  })
})
