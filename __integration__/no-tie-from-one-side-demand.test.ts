import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { newChecklist, type Decision } from '@/lib/supplier-onboarding'
import { NO_COMPANY_BY_THAT_ID } from '@/lib/supplier-list'

/**
 * A firm on Etyme is never tied to you from your side alone (review,
 * 2026-11-13), read from the demand side: pasting a supplier list, a job
 * ticked before its last approval, the supplier list itself, a job sent
 * down by id, a person sent up, and Finance's bank check. The one sender
 * is faked and counted, so "emails nobody" is a count. A firm on Etyme
 * with no dealing is answered as if it were not there, nothing is written
 * on it, it is told nothing, and the refusal is logged before the reply.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }),
  }
})

const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const suppliers = await import('@/app/api/suppliers/route')
const join = await import('@/app/api/suppliers/join/route')
const { sendTickedOnClearing } = await import('@/app/api/requisitions/send')
const { createCompany } = await import('@/lib/company-create')
const distribute = await import('@/app/api/requisitions/[id]/distribute/route')
const forward = await import('@/app/api/submissions/[id]/forward/route')
const review = await import('@/app/api/supplier-requests/[id]/route')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const HIRING = `world-nike-hiring${D}`
const LEAD = `world-nike-vp${D}`
const AP = `world-nike-ap${D}`
const HR = `world-nike-hr${D}`
const PROCUREMENT = `world-nike-procurement${D}`

let brightmoor = ''
let isDemo = false
let techpeple = ''
let stranger = ''
let jobId = ''

const send = async (vendors: { companyId: string }[]) =>
  json(await distribute.POST(req('POST', `/api/requisitions/${jobId}/distribute`, { vendors }), { params: Promise.resolve({ id: jobId }) } as any))

const refusalsAbout = (companyId: string) => prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: companyId } })

/** A firm that signed up on its own: its domain verified, its owner seated, nothing to do with Brightmoor. */
const firmOnEtyme = async (name: string, slug: string, domain: string) => {
  const owner = await prisma.person.upsert({ where: { primaryEmail: `owner@${domain}` }, update: {}, create: { primaryEmail: `owner@${domain}`, name: `${name} Owner` } })
  const made = await createCompany({ name, kind: 'VENDOR', slug, domain, byPersonId: owner.id, seatAsOwner: true, claimDomain: true, startsSetup: true })
  await prisma.company.update({ where: { id: made.company.id }, data: { claimedAt: new Date(), isDemo } })
  return { id: made.company.id, slug: made.company.slug }
}
const record = async (name: string) =>
  (await json(await companies.POST(req('POST', '/api/companies', { name, kind: 'UNCLASSIFIED' })))).body.data.company.id as string
const supplierIds = async () =>
  ((await json(await suppliers.GET(req('GET', '/api/suppliers')))).body.data.suppliers as any[]).map((s) => s.companyId)

beforeAll(async () => {
  await freshWorld()
  const b = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, isDemo: true } })
  brightmoor = b.id
  isDemo = b.isDemo
  techpeple = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } })).id
  // A firm that signed up on its own and has never dealt with Brightmoor or Northbend.
  stranger = (await prisma.company.create({
    data: { name: 'Hollowell Talent', slug: `hollowell-talent-${Date.now()}`, kind: 'VENDOR', currency: 'USD', claimedAt: new Date(), isDemo } as any,
    select: { id: true },
  })).id
  await prisma.remitTo.create({ data: { companyId: stranger, legalName: 'Hollowell Talent LLC', addressLines: ['9 Quay St'], country: 'US', bankName: 'Quay Federal', accountLast4: '3392', isDefault: true } })
  jobId = (await prisma.requirement.create({
    data: { companyId: brightmoor, title: 'Payroll analyst (no-tie walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED' },
    select: { id: true },
  })).id
  as(OWNER)
}, 600_000)

describe('pasting a supplier list', () => {
  it('a pasted domain of a firm on Etyme that does not work with you writes nothing, emails nobody, and says to ask them to link, logged before the reply', async () => {
    as(OWNER)
    const firm = await firmOnEtyme('Harrowgate Staffing', 'harrowgate-staffing-walk', 'harrowgate.example')
    const refusalsBefore = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })
    const r = await json(
      await suppliers.POST(req('POST', '/api/suppliers', { rows: [{ company: 'Harrowgate', email: 'desk@harrowgate.example', contactName: 'Mira Holt', domain: 'harrowgate.example' }] })),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(r.body.error.message).toBe(
      'That company is on Etyme already, so no copy of it was made. Ask them to link, as your supplier: they are asked, and nothing is on either list until they say yes.',
    )
    expect(r.body.error.refused).toEqual([
      {
        name: 'Harrowgate', email: 'desk@harrowgate.example', code: 'ALREADY_ON_ETYME',
        says: r.body.error.message, askToLink: { name: 'Harrowgate', domain: 'harrowgate.example' },
      },
    ])
    const said = JSON.stringify(r.body)
    expect(said).not.toContain(firm.id)
    expect(said).not.toContain(firm.slug)
    expect(said).not.toContain('Harrowgate Staffing')
    expect(said).not.toContain('alreadyHere')
    expect(await prisma.masterAgreement.count({ where: { OR: [{ vendorId: firm.id, clientId: brightmoor }, { vendorId: brightmoor, clientId: firm.id }] } })).toBe(0)
    expect(await prisma.counterparty.count({ where: { OR: [{ companyId: brightmoor, otherCompanyId: firm.id }, { companyId: firm.id, otherCompanyId: brightmoor }] } })).toBe(0)
    expect(await prisma.companyContact.count({ where: { companyId: brightmoor, atCompanyId: firm.id } })).toBe(0)
    expect(await prisma.supplierInvite.count({ where: { byId: brightmoor, companyId: firm.id } })).toBe(0)
    expect(sent.filter((to) => to.includes('harrowgate'))).toEqual([])
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })).toBe(refusalsBefore + 1)
  })

  it('a pasted domain of a firm on Etyme that already works with you is added to that firm as before', async () => {
    as(OWNER)
    const firm = await firmOnEtyme('Wexcombe Talent', 'wexcombe-talent-walk', 'wexcombe.example')
    await prisma.masterAgreement.create({ data: { vendorId: firm.id, clientId: brightmoor, paymentTerms: 30 } })
    const r = await json(
      await suppliers.POST(req('POST', '/api/suppliers', { rows: [{ company: 'Wexcombe Talent', email: 'desk@wexcombe.example', domain: 'wexcombe.example' }] })),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.added[0]).toMatchObject({ companyId: firm.id, alreadyHere: true })
    expect(await prisma.counterparty.count({ where: { companyId: brightmoor, otherCompanyId: firm.id, relationship: 'SUPPLIER' } })).toBe(1)
    expect(await prisma.company.count({ where: { name: 'Wexcombe Talent' } })).toBe(1)
  })
})

describe('a job ticked before its last approval', () => {
  it('a company whose Supplier position was taken off after it was ticked is not sent the job, the skip is logged, and the send says who was left off and why', async () => {
    as(OWNER)
    const id = await record('Lanyard Hill Recruiting')
    const e = await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'SUPPLIER' }), { params: { id } } as any))
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    const job = await prisma.requirement.create({
      data: { companyId: brightmoor, title: 'Benefits analyst (ticked walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED', sendToSupplierIds: [id] },
      select: { id: true },
    })
    // The position comes off while the job waits for its last yes.
    await prisma.counterparty.deleteMany({ where: { companyId: brightmoor, otherCompanyId: id, relationship: 'SUPPLIER' } })
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true, name: true } })
    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: id } })
    const out = await sendTickedOnClearing({ requirementId: job.id, caller: { person: owner }, when: 'it was approved' })
    expect(out).toEqual([])
    expect(await prisma.requirementInvitation.count({ where: { requirementId: job.id, toCompanyId: id } })).toBe(0)
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: id } })).toBe(before + 1)
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: brightmoor, action: 'REQUISITION_DISTRIBUTED', payload: { path: ['requirementId'], equals: job.id } },
      orderBy: { at: 'desc' },
    })
    expect(log.reason).toContain('Left out, no longer a supplier on your list: Lanyard Hill Recruiting')
  })

  it('a company still holding its Supplier position is sent the ticked job as before', async () => {
    as(OWNER)
    const id = await record('Corbel Street Staffing')
    await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'SUPPLIER' }), { params: { id } } as any))
    const job = await prisma.requirement.create({
      data: { companyId: brightmoor, title: 'Payroll lead (ticked walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED', sendToSupplierIds: [id] },
      select: { id: true },
    })
    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER }, select: { id: true, name: true } })
    const out = await sendTickedOnClearing({ requirementId: job.id, caller: { person: owner }, when: 'it was approved' })
    expect(out.map((o) => o.status)).toEqual(['sent'])
    expect(await prisma.requirementInvitation.count({ where: { requirementId: job.id, toCompanyId: id } })).toBe(1)
  })
})

describe('the supplier list', () => {
  it('a company invited as a client and extended only to Customer is on no supplier list', async () => {
    as(OWNER)
    const id = await record('Penhallow Foods')
    const e = await json(await extend.POST(req('POST', `/api/companies/${id}/extend`, { as: 'CUSTOMER' }), { params: { id } } as any))
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    // What /api/clients writes when it invites a client: an invitation from this firm.
    await prisma.company.update({ where: { id }, data: { kind: 'CLIENT' } })
    await prisma.supplierInvite.create({ data: { companyId: id, byId: brightmoor, email: 'ap@penhallow.example', token: `penhallow-${Date.now()}` } })
    expect(await supplierIds()).not.toContain(id)
  })
})

describe('joining two records of one supplier', () => {
  it('a firm on Etyme you do not work with is never offered as the other half of a duplicate, and folding your record into it is refused, logged first, and nothing moves', async () => {
    as(OWNER)
    const firm = await firmOnEtyme('Kestle Ridge Staffing', 'kestle-ridge-walk', 'kestleridge.example')
    // A record Brightmoor listed long ago, invited at the firm's domain and sent a job.
    const shell = await prisma.company.create({
      data: { name: 'Kestle Ridge', slug: `kestle-ridge-shell-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo },
      select: { id: true },
    })
    await prisma.supplierInvite.create({ data: { companyId: shell.id, byId: brightmoor, email: 'desk@kestleridge.example', domain: 'kestleridge.example', token: `kestle-${Date.now()}` } })
    await prisma.masterAgreement.create({ data: { vendorId: shell.id, clientId: brightmoor, paymentTerms: 30 } })
    const pairs = await json(await join.GET(req('GET', '/api/suppliers/join')))
    expect(pairs.status).toBe(200)
    expect(JSON.stringify(pairs.body)).not.toContain(firm.id)

    const before = await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })
    const r = await json(await join.POST(req('POST', '/api/suppliers/join', { keepId: firm.id, foldId: shell.id })))
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.message).toBe(
      'That company is on Etyme and does not work with you yet, so nothing was joined. Ask them to link from Add company: nothing is on either list until they say yes.',
    )
    expect(await prisma.accessLog.count({ where: { allowed: false, subjectCompanyId: firm.id } })).toBe(before + 1)
    expect(await prisma.masterAgreement.count({ where: { vendorId: firm.id, clientId: brightmoor } })).toBe(0)
    expect(await prisma.masterAgreement.count({ where: { vendorId: shell.id, clientId: brightmoor } })).toBe(1)
  })

  it('another firm\u2019s record is not yours to join, and nothing moves', async () => {
    as(OWNER)
    const other = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const theirs = await prisma.company.create({
      data: { name: 'Fallowmere Staffing', slug: `fallowmere-a-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: other.id, isDemo },
      select: { id: true },
    })
    const mine = await prisma.company.create({
      data: { name: 'Fallowmere Staffing', slug: `fallowmere-b-${Date.now()}`, kind: 'VENDOR', currency: 'USD', listedById: brightmoor, isDemo },
      select: { id: true },
    })
    const r = await json(await join.POST(req('POST', '/api/suppliers/join', { keepId: mine.id, foldId: theirs.id })))
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe('One of those records is not on your list, so it is not yours to join.')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe('Fallowmere Staffing')
  })
})

describe('a firm on Etyme is never tied to you from your side alone, on the demand side', () => {
  it('a job cannot be sent by id to a firm on Etyme the sender does not deal with: refused as not a supplier, logged first, and no invitation is written', async () => {
    as(OWNER)
    const before = await refusalsAbout(stranger)
    const r = await send([{ companyId: stranger }])
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(r.body.error.message).toBe(
      'One of the firms you picked is not a supplier of Brightmoor Staffing, so this job request cannot be sent to it. ' +
        'Send it to the suppliers you buy from, or add the firm as a supplier of your own first.',
    )
    expect(JSON.stringify(r.body)).not.toContain('Hollowell')
    expect(await refusalsAbout(stranger)).toBe(before + 1)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: stranger } })).toBe(0)
    expect(await prisma.notification.count({ where: { companyId: stranger } })).toBe(0)
  })

  it('an id that is not there is answered in the same words as a firm the sender does not deal with', async () => {
    as(OWNER)
    const r = await send([{ companyId: 'no-such-company-id' }])
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/^One of the firms you picked is not a supplier of Brightmoor Staffing/)
  })

  it('a job the sender sent a firm on its own earlier is not a dealing, so the next job to that firm is refused too', async () => {
    as(OWNER)
    // An invitation written from Brightmoor's side alone, as one could be before this rule.
    const earlier = await prisma.requirement.create({
      data: { companyId: brightmoor, title: 'Earlier job (no-tie walk)', status: 'OPEN', approvalState: 'AUTO_APPROVED' },
      select: { id: true },
    })
    await prisma.requirementInvitation.create({
      data: { requirementId: earlier.id, fromCompanyId: brightmoor, toCompanyId: stranger, expiresAt: new Date(Date.now() + 14 * 86_400_000) },
    })
    const r = await send([{ companyId: stranger }])
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: stranger, requirementId: jobId } })).toBe(0)
    await prisma.requirement.delete({ where: { id: earlier.id } })
  })

  it('a job still goes to a firm the sender already buys from', async () => {
    as(OWNER)
    // A firm Brightmoor buys from on the seeded world: an agreement where it is the client.
    const buys = await prisma.masterAgreement.findFirstOrThrow({ where: { clientId: brightmoor }, select: { vendorId: true } })
    const r = await send([{ companyId: buys.vendorId }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: buys.vendorId, requirementId: jobId } })).toBe(1)
  })

  it('a job cannot be sent to a firm on the seeded world the sender has never traded with', async () => {
    // Techpeple has never traded with Brightmoor on the seeded world.
    as(OWNER)
    const r = await send([{ companyId: techpeple }])
    expect(r.status).toBe(403)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: techpeple, requirementId: jobId } })).toBe(0)
  })

  it('a person cannot be sent on to a firm on Etyme the sender does not deal with: answered as no company by that id, logged first, and nothing lands on that firm’s books', async () => {
    as(OWNER)
    const person = await prisma.person.create({ data: { name: 'Wren Castellane', primaryEmail: 'wren.castellane.walk@example.invalid' } })
    const sub = await prisma.submission.create({
      data: { requirementId: jobId, personId: person.id, fromCompanyId: techpeple, toCompanyId: brightmoor, rate: 9000, status: 'SUBMITTED', kind: 'NETWORK' },
      select: { id: true },
    })
    const before = await refusalsAbout(stranger)
    const r = await json(
      await forward.POST(req('POST', `/api/submissions/${sub.id}/forward`, { via: 'ONWARD', toCompanyId: stranger, rate: 11000 }), { params: Promise.resolve({ id: sub.id }) } as any),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(404)
    expect(r.body.error.message).toBe(NO_COMPANY_BY_THAT_ID)
    expect(await refusalsAbout(stranger)).toBe(before + 1)
    expect(await prisma.requirement.count({ where: { companyId: stranger } })).toBe(0)
    expect(await prisma.submission.count({ where: { toCompanyId: stranger } })).toBe(0)
    expect(await prisma.notification.count({ where: { companyId: stranger } })).toBe(0)
    // And an id that is not there reads the same.
    const none = await json(
      await forward.POST(req('POST', `/api/submissions/${sub.id}/forward`, { via: 'ONWARD', toCompanyId: 'no-such-company-id', rate: 11000 }), { params: Promise.resolve({ id: sub.id }) } as any),
    )
    expect(none.status).toBe(404)
    expect(none.body.error.message).toBe(NO_COMPANY_BY_THAT_ID)
  })

  it('Finance’s bank check on a firm a match named, that has not taken part, neither reads nor marks its own payment details', async () => {
    const client = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const people = await prisma.person.findMany({ where: { primaryEmail: { in: [HIRING, LEAD, PROCUREMENT, HR] } }, select: { id: true, primaryEmail: true, name: true } })
    const by = (e: string) => people.find((p) => p.primaryEmail === e)!
    const at = new Date().toISOString()
    const decisions: Decision[] = (['LEAD', 'PROCUREMENT', 'HR'] as const).map((stage, i) => {
      const p = by([LEAD, PROCUREMENT, HR][i])
      return { stage, outcome: 'APPROVED', byId: p.id, byName: p.name, at, note: null }
    })
    const checklist = newChecklist().map((i) =>
      i.desk === 'FINANCE' ? { ...i, state: 'PROVIDED' as const, fileName: i.key === 'BANK' ? 'Harbor Trust ····6610' : 'w9.pdf' } : { ...i, state: 'HELD' as const, at },
    )
    const row = await prisma.supplierRequest.create({
      data: {
        companyId: client.id, name: 'Hollowell Talent', reason: 'A match suggested them.', recommendedById: by(HIRING).id, state: 'IN_REVIEW', stage: 'FINANCE',
        decisions: decisions as unknown as object, checklist: checklist as unknown as object, token: `no-tie-${Date.now()}`, firmCompanyId: stranger,
      },
      select: { id: true },
    })
    as(AP)
    const r = await json(
      await review.PATCH(req('PATCH', `/api/supplier-requests/${row.id}`, { action: 'mark', key: 'BANK', state: 'HELD' }), { params: Promise.resolve({ id: row.id }) } as any),
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain(
      'Checked against what Hollowell Talent sent through its link. Its own payment details on Etyme are not read or marked until Hollowell Talent links with you.',
    )
    // Nothing from the firm's own record reaches the client.
    expect(JSON.stringify(r.body)).not.toContain('Quay Federal')
    expect(JSON.stringify(r.body)).not.toContain('3392')
    const remit = await prisma.remitTo.findFirstOrThrow({ where: { companyId: stranger } })
    expect(remit).toMatchObject({ verifiedAt: null, verifiedById: null, verifiedByCompanyId: null })
  })
})
