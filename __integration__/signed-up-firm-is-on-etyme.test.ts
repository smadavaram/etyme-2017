import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as addCompany } from '@/app/api/companies/route'
import { createCompany, claimSignedUpFirms } from '@/lib/company-create'
import { isShell } from '@/lib/off-system'

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

  it('a client a firm writes down from Add company is a shell on that firm’s register, with no public page, in the same world', async () => {
    as(OWNER)
    const r = await json(await addCompany(req('POST', '/api/companies', { name: 'Ostrander Mills', kind: 'CLIENT', relationship: 'CLIENT' })))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { contexts: { some: { person: { primaryEmail: OWNER } } } } })
    const written = await prisma.company.findUniqueOrThrow({ where: { id: r.body.data.company.id } })
    expect(isShell(written)).toBe(true)
    expect(written.listedById).toBe(brightmoor.id)
    expect(written.siteLiveAt).toBeNull()
    expect(written.isDemo).toBe(brightmoor.isDemo)
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
})
