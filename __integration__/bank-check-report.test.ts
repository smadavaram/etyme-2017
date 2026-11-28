import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma, resetDatabase } from './harness'

const h = vi.hoisted(() => ({ caller: null as any }))
vi.mock('@/lib/api-context', () => ({ getCallerContext: async () => ({ caller: h.caller, error: null }) }))

import { GET } from '@/app/api/superadmin/bank-checks/route'
import { carryOverOldChecks } from '@/lib/vendor-master-read'

/**
 * The staff page for the old bank checks report (2026-11-17). Made-up
 * firms on reserved domains.
 */
const s: Record<string, string> = {}
const ON = new Date('2026-01-05T09:00:00Z')
const STAMP = new Date('2026-02-01T10:00:00Z')
const firm = async (slug: string, kind: 'VENDOR' | 'CLIENT') =>
  (await prisma.company.create({ data: { name: slug, slug, kind, currency: 'USD', domain: `${slug}.example`, claimedAt: ON }, select: { id: true } })).id
const remit = (companyId: string, over: Record<string, unknown> = {}) =>
  prisma.remitTo.create({
    data: { companyId, legalName: 'Supplier LLC', country: 'US', bankName: 'Bellrock Bank', accountLast4: '4821', routingLast4: '0021', verifiedAt: STAMP, ...over },
    select: { id: true },
  })
const person = (id: string, email: string) => ({ id, name: id, primaryEmail: email, timezone: null })
const call = () => GET({} as any)
const counts = async () => ({
  checks: await prisma.bankCheck.count(), remit: await prisma.remitTo.count(),
  auto: await prisma.automationLog.count(), access: await prisma.accessLog.count(),
})

beforeAll(async () => {
  await resetDatabase()
  s.held = await firm('northwind-staffing', 'VENDOR')
  s.named = await firm('eastfield-staffing', 'VENDOR')
  s.client = await firm('harborline-tech', 'CLIENT')
  s.p = (await prisma.person.create({ data: { name: 'Staff', primaryEmail: 'ops@etyme.com' }, select: { id: true } })).id
  await prisma.masterAgreement.create({ data: { vendorId: s.held, clientId: s.client } })
  await remit(s.held, { accountLast4: '4821' })
  await remit(s.named, { verifiedByCompanyId: s.client, accountLast4: '9999' })
})

describe('the old bank check report', () => {
  it('only Etyme’s staff can open the bank check report', async () => {
    h.caller = { person: person(s.p, 'x@harborline-tech.example'), company: { id: s.client, name: 'c' }, permissions: ['settings.manage'], staff: false }
    const before = await prisma.accessLog.count({ where: { allowed: false } })
    const res = await call()
    expect(res.status).toBe(403)
    expect((await res.json()).data).toBeUndefined()
    expect(await prisma.accessLog.count({ where: { allowed: false } })).toBe(before + 1)
  })

  it('the staff bank checks report shows no bank digits', async () => {
    h.caller = { person: person(s.p, 'ops@etyme.com'), company: null, permissions: [], staff: true }
    const text = JSON.stringify((await (await call()).json()).data)
    expect(text).not.toContain('4821')
    expect(text).not.toContain('9999')
    expect(text).not.toMatch(/last4|account/i)
  })

  it('the staff bank checks report names no firm', async () => {
    h.caller = { person: person(s.p, 'ops@etyme.com'), company: null, permissions: [], staff: true }
    const body = await (await call()).json()
    expect(body.data.suppliers).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/northwind|harborline/i)
  })

  it('the staff bank checks report still gives the count of suppliers that would be held', async () => {
    h.caller = { person: person(s.p, 'ops@etyme.com'), company: null, permissions: [], staff: true }
    const body = await (await call()).json()
    expect(body.data.held).toBe(1)
    expect(Object.keys(body.data).sort()).toEqual(['held', 'named', 'says', 'unplaced'])
  })

  it('the report changes nothing', async () => {
    h.caller = { person: person(s.p, 'ops@etyme.com'), company: null, permissions: [], staff: true }
    const before = await counts()
    await call()
    const after = await counts()
    expect({ ...after, access: 0 }).toEqual({ ...before, access: 0 })
    expect(after.access).toBe(before.access + 1)
  })

  it('the report’s counts match the carry-over script’s', async () => {
    h.caller = { person: person(s.p, 'ops@etyme.com'), company: null, permissions: [], staff: true }
    const body = await (await call()).json()
    const script = await carryOverOldChecks(prisma as never, { write: false })
    expect({ named: body.data.named, unplaced: body.data.unplaced }).toEqual({ named: script.named, unplaced: script.unplaced })
    expect(body.data.says).toContain(`${script.named} old checks name their payer`)
    expect(body.data.says).toContain(`${script.unplaced} name no payer`)
  })
})
