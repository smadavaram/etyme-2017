import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma, as, req, json } from './harness'
import { POST as raiseOwnCopy } from '@/app/api/requirements/route'
import { POST as distribute } from '@/app/api/requisitions/[id]/distribute/route'
import { POST as submit } from '@/app/api/submissions/route'

/**
 * The Tapin walk (2026-10-29), demand's half, on the seeded world: a
 * prime sends a client's job down to its sub-vendor, and the sub-vendor
 * puts a bench person forward on it.
 *
 * Brightmoor Staffing is the prime here and Consultis the sub-vendor it
 * buys from (the seeded chain nordway → brightmoor → consultis).
 */

const D = '@demo.etyme.local'
const ACCOUNT_MANAGER = `world-brightmoor-account${D}`   // Marisa Delacroix
const RECRUITER = `world-brightmoor-recruiter${D}`       // Tobias Ferrand
const CONSULTIS = `world-consultis${D}`
const params = (id: string) => ({ params: Promise.resolve({ id }) })

let nike = ''
let consultis = ''
let job = ''

beforeAll(async () => {
  await freshWorld()
  nike = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })).id
  consultis = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-consultis' } })).id
}, 600_000)

describe('a prime sends a job it was sent down to its sub-vendor', () => {
  it('a supplier’s account manager sends a job down to its sub-vendor, and the refusal names the right role', async () => {
    as(ACCOUNT_MANAGER)
    const made = await json(await raiseOwnCopy(req('POST', '/api/requirements', {
      title: 'HCM integration lead', skills: ['Workday', 'Integration'], months: 6, endClientCompanyId: nike,
    })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    job = made.body.data.requirement.id

    // A recruiter finds and submits people; sending a job down is not hers.
    as(RECRUITER)
    const refused = await json(await distribute(req('POST', `/api/requisitions/${job}/distribute`, {
      vendors: [{ companyId: consultis, payMin: 9_000, payMax: 11_000 }],
    }), params(job)))
    expect(refused.status).toBe(403)
    expect(refused.body.error.message).toBe(
      'At Brightmoor Staffing, the account manager or the owner sends a job down to a sub-vendor. Ask one of them to send it out.'
    )
    expect(refused.body.error.message).not.toContain('program manager')

    as(ACCOUNT_MANAGER)
    const sent = await json(await distribute(req('POST', `/api/requisitions/${job}/distribute`, {
      vendors: [{ companyId: consultis, payMin: 9_000, payMax: 11_000 }],
    }), params(job)))
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(sent.body.data.summary.sent).toBe(1)
    const inv = await prisma.requirementInvitation.findFirstOrThrow({ where: { requirementId: job, toCompanyId: consultis } })
    // $90 to $110 an hour, kept in cents.
    expect([inv.payMin, inv.payMax]).toEqual([9_000, 11_000])
  })

  it('a sub-vendor puts a bench person forward from the job it was sent', async () => {
    // Somebody on Consultis's bench by their own yes, never put forward anywhere.
    const listing = await prisma.benchListing.findFirstOrThrow({
      where: {
        companyId: consultis, state: 'GRANTED', revokedAt: null, askFirst: false, staysUntil: null,
        consultant: { person: { submissions: { none: {} }, contexts: { none: { companyId: consultis, type: 'EMPLOYEE' } } } },
      },
      select: { consultant: { select: { personId: true } } },
    })
    const personId = listing.consultant.personId

    as(CONSULTIS)
    const r = await json(await submit(req('POST', '/api/submissions', {
      requirementId: job, personIds: [personId], rate: 10_000, fromCompanyId: consultis,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.results[0].status, JSON.stringify(r.body.data.results[0])).toBe('created')
    const row = await prisma.submission.findFirstOrThrow({ where: { requirementId: job, personId } })
    expect(row.fromCompanyId).toBe(consultis)
    // To the prime that sent the job, never round it to the client.
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })
    expect(row.toCompanyId).toBe(brightmoor.id)
    // Computed from the listing (a marketed one), never taken from the caller.
    expect(['BENCH', 'NETWORK']).toContain(row.kind)
  })
})
