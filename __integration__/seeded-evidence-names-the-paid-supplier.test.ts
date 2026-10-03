import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, prisma, freshWorld } from './harness'

import { GET as openFile } from '@/app/api/week-approvals/[id]/file/route'
import { seedWeekApproval } from '@/lib/seed-week-approval'
import type { World } from '@/lib/seed-programmes'

/**
 * The client tester, s4-4, on e80773ab9: the week page hid CloudEPA, and
 * the evidence it opened to Northbend Athletic read
 * "To: world-cloudepa@demo.etyme.local". Northbend pays Computer Systems
 * and has never heard of CloudEPA; a sub-vendor's name is the prime's to
 * keep (CLAUDE.md, 2026-09-17). Marcus wrote to the firm he pays.
 */

const D = '@demo.etyme.local'
const NIKE = `world-nike-hiring${D}`
const CS = `world-computer-systems${D}`
const CLOUDEPA = `world-cloudepa${D}`
const it_: Record<string, any> = {}

async function open(email: string, id: string) {
  as(email)
  const res = await openFile(req('GET', `/api/week-approvals/${id}/file`), { params: Promise.resolve({ id }) } as any)
  return { status: res.status, text: await res.text() }
}

/** The world as the seed step sees it, rebuilt from the rows. */
async function worldFromRows(): Promise<World> {
  const firmBySlug = new Map<string, { id: string }>()
  const seatBySlug = new Map<string, { personId: string; email: string }>()
  for (const slug of ['nike', 'computer-systems', 'cloudepa']) {
    const c = await prisma.company.findUniqueOrThrow({ where: { slug: `world-${slug}` }, select: { id: true } })
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: `world-${slug}${D}` }, select: { id: true, primaryEmail: true } })
    firmBySlug.set(slug, c)
    seatBySlug.set(slug, { personId: p.id, email: p.primaryEmail })
  }
  return { firmBySlug, seatBySlug, domain: 'demo.etyme.local', prefix: 'world-' }
}

describe('the client reads an approval email addressed to the firm it pays', () => {
  beforeAll(async () => {
    await freshWorld()
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'helena.marsh@seed.etyme.invalid' } })
    const seeded = await prisma.weekApproval.findFirstOrThrow({
      where: { how: 'EVIDENCE', timesheet: { personId: helena.id } },
      select: { id: true, file: { select: { id: true } } },
    })
    it_.approval = seeded.id
    it_.file = seeded.file!.id
  }, 600_000)

  it('Northbend opens the seeded approval email and reads it addressed to Computer Systems, and CloudEPA is named nowhere in it', async () => {
    const r = await open(NIKE, it_.approval)
    expect(r.status).toBe(200)
    expect(r.text).toContain(`To: ${CS}`)
    expect(r.text).not.toMatch(/cloudepa/i)
  })

  it('Computer Systems and CloudEPA open the same email, because it applies to both their contracts', async () => {
    const a = await open(CS, it_.approval)
    const b = await open(CLOUDEPA, it_.approval)
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.text).toBe(b.text)
  })

  it('a world seeded before the fix has its one leaking file readdressed on the next seeding, and nothing else rewritten', async () => {
    const before = await prisma.weekApprovalFile.findUniqueOrThrow({ where: { id: it_.file } })
    const old = Buffer.from(before.bytes).toString('utf8').replace(`To: ${CS}`, `To: ${CLOUDEPA}`)
    await prisma.weekApprovalFile.update({ where: { id: it_.file }, data: { bytes: Buffer.from(old, 'utf8'), sizeBytes: Buffer.byteLength(old) } })
    const approvals = await prisma.weekApproval.count()
    const assertions = await prisma.workAssertion.count()

    expect(await seedWeekApproval(await worldFromRows())).toEqual({ written: true })

    const after = await prisma.weekApprovalFile.findUniqueOrThrow({ where: { id: it_.file } })
    const text = Buffer.from(after.bytes).toString('utf8')
    expect(text).toContain(`To: ${CS}`)
    expect(text).not.toMatch(/cloudepa/i)
    expect(after.sizeBytes).toBe(Buffer.byteLength(text))
    expect(await prisma.weekApproval.count()).toBe(approvals)
    expect(await prisma.workAssertion.count()).toBe(assertions)
  })

  it('seeding again once the file is right changes nothing', async () => {
    expect(await seedWeekApproval(await worldFromRows())).toEqual({ written: false })
  })
})
