import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { approvedSuppliersOf } from '@/lib/sites'

/**
 * An agreement recorded from one side (review, 2026-11-13). An agreement
 * where the caller sells puts the caller on the other firm's approved
 * suppliers and its send-a-job ticks, so for a firm on Etyme the buying
 * side has to show on that firm's side, never only on the caller's own
 * register.
 *
 *   Tapin              the caller, a supplier on Etyme.
 *   Northbend Athletic a client on Etyme. Tapin wrote it onto its own list
 *                      as a client; nothing on Northbend's side names Tapin.
 *   Corvane Packaging  on Etyme, with an agreement on file where it sells to
 *                      Tapin: the two trade, and Corvane does not buy from it.
 *   Talvern Medical    a client on Etyme whose own register names Tapin as
 *                      its supplier.
 */

const recordAgreement = (await import('@/app/api/contracts/agreements/route')).POST

const TAPIN = 'owner@tapin.test'
const co = { tapin: '', northbend: '', corvane: '', talvern: '', stranger: '' }

async function company(name: string, slug: string, kind: any, email: string | null) {
  const c = await prisma.company.create({ data: { name, slug, kind, currency: 'USD', claimedAt: new Date('2026-01-04') } })
  if (email) {
    const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    const p = await prisma.person.create({ data: { name: `${name} owner`, primaryEmail: email } })
    await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'one-side walk' } })
  }
  return c.id
}

const agree = async (otherCompanyId: string, callerSells: boolean) =>
  json(await recordAgreement(req('POST', '/api/contracts/agreements', { otherCompanyId, callerSells, paymentTerms: 45 })))
const refusalsAbout = (companyId: string) => prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: companyId } })

beforeAll(async () => {
  await resetDatabase()
  co.tapin = await company('Tapin', 'tapin-one-side', 'VENDOR', TAPIN)
  co.northbend = await company('Northbend Athletic', 'northbend-one-side', 'CLIENT', 'owner@northbend.test')
  co.corvane = await company('Corvane Packaging', 'corvane-one-side', 'CLIENT', 'owner@corvane.test')
  co.talvern = await company('Talvern Medical', 'talvern-one-side', 'CLIENT', 'owner@talvern.test')
  co.stranger = await company('Auralis Software', 'auralis-one-side', 'VENDOR', 'owner@auralis.test')
  for (const [companyId, otherCompanyId, relationship] of [
    [co.tapin, co.northbend, 'CLIENT'],
    [co.tapin, co.corvane, 'CLIENT'],
    [co.tapin, co.talvern, 'CLIENT'],
    [co.talvern, co.tapin, 'SUPPLIER'],
  ] as const) {
    await prisma.counterparty.create({ data: { companyId, otherCompanyId, relationship } })
  }
  await prisma.masterAgreement.create({ data: { vendorId: co.corvane, clientId: co.tapin, paymentTerms: 30 } })
  as(TAPIN)
}, 600_000)

describe('an agreement with a firm on Etyme, recorded from one side', () => {
  it('an agreement recorded from one side never makes you one of a firm on Etyme’s approved suppliers', async () => {
    const before = await refusalsAbout(co.northbend)
    const r = await agree(co.northbend, true)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('do not trade here yet')
    expect(r.body.error.message).toContain('Ask them to link with you from Companies')
    expect(await prisma.masterAgreement.count({ where: { vendorId: co.tapin, clientId: co.northbend } })).toBe(0)
    expect((await approvedSuppliersOf(co.northbend)).map((f) => f.id)).not.toContain(co.tapin)
    // Written to the access log before the refusal went out.
    expect(await refusalsAbout(co.northbend)).toBe(before + 1)
  })

  it('a firm that sells to you, and does not buy from you, cannot be made your client on an agreement from your side', async () => {
    const r = await agree(co.corvane, true)
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(
      'Nothing on Etyme shows Corvane Packaging buying from you yet, so you cannot record yourself as their supplier. ' +
        'Ask them to link with you as their supplier from Companies, then record it.'
    )
    expect(await prisma.masterAgreement.count({ where: { vendorId: co.tapin, clientId: co.corvane } })).toBe(0)
    expect((await approvedSuppliersOf(co.corvane)).map((f) => f.id)).not.toContain(co.tapin)
  })

  it('a firm whose own register names you as its supplier is recorded as your client, as before', async () => {
    const r = await agree(co.talvern, true)
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.status).toBe(201)
    expect(await prisma.masterAgreement.count({ where: { vendorId: co.tapin, clientId: co.talvern } })).toBe(1)
  })

  it('a firm on Etyme you neither trade with nor list is answered as an id nobody has, and never named', async () => {
    const r = await agree(co.stranger, true)
    const nobody = await agree('no-such-company-id', true)
    expect(r.status).toBe(nobody.status)
    expect(r.body.error.message).toBe(nobody.body.error.message)
    expect(JSON.stringify(r.body)).not.toContain('Auralis')
  })
})
