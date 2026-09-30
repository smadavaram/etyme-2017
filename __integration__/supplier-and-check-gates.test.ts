import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as suppliers, POST as addSuppliers } from '@/app/api/suppliers/route'
import { GET as queue } from '@/app/api/checks/queue/route'
import { POST as review } from '@/app/api/checks/[id]/review/route'
import { GET as pairsOf, POST as joinRecords } from '@/app/api/suppliers/join/route'

/**
 * Suppliers and the Check queue, on the seeded world, as the desks that
 * use them and as one that does not.
 *
 * Karthik Menon is a Teleworld delivery engineer: he reads the work he is
 * on and files his own week, and nothing else. Both pages were open to
 * him because both routes asked for nothing past being staff.
 */

const D = '@demo.etyme.local'
const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const PROCUREMENT = `world-nike-procurement${D}`
const HIRING = `world-nike-hiring${D}`
const AP = `world-nike-ap${D}`

const it_: Record<string, any> = {}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()

  // A machine's judgment of one submitted person, waiting for a person —
  // written here rather than hoped for from the seed, so the sentence
  // below does not depend on which day the world was born.
  const sub = await prisma.submission.findFirstOrThrow({ select: { id: true, personId: true, toCompanyId: true } })
  it_.check = await prisma.check.create({
    data: {
      companyId: sub.toCompanyId, recordType: 'SUBMISSION', recordId: sub.id,
      checker: 'MODEL', code: 'SKILLS_EVIDENCED', verdict: 'FAIL',
      reason: 'The CV does not evidence the skills the job asks for.', evidence: 'test',
    },
    select: { id: true },
  })
  it_.subject = sub.personId
  const owner = await prisma.context.findFirstOrThrow({
    where: { companyId: sub.toCompanyId, revokedAt: null, role: { permissions: { has: '*' } } },
    select: { person: { select: { primaryEmail: true } } },
  })
  it_.reader = owner.person.primaryEmail
}, 300_000)

describe('who opens the supplier list', () => {
  it('a delivery engineer is refused the supplier list in a sentence that says who to ask', async () => {
    as(KARTHIK)
    const { status, body } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status).toBe(403)
    expect(body.data).toBeUndefined()
    expect(body.error.message).toContain('Ask whoever manages roles at your company')
    expect(body.error.message).not.toMatch(/vendors\.read|requirements\.read|payments\.record/)
  })

  it('the procurement desk still opens its suppliers', async () => {
    as(PROCUREMENT)
    const { status, body } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.suppliers.length).toBeGreaterThan(0)
  })

  it('a hiring manager still opens the supplier list to recommend a new supplier', async () => {
    as(HIRING)
    const { status } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status).toBe(200)
  })

  it('the AP clerk, who checks a new supplier’s bank details, still opens the supplier list', async () => {
    as(AP)
    const { status } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status).toBe(200)
  })
})

describe('who adds suppliers from a pasted list', () => {
  const row = (email: string, company: string) => ({ rows: [{ email, company, domain: email.split('@')[1], contactName: 'Dana Ruiz', line: `${company} <${email}>` }] })

  it('a delivery engineer cannot add a supplier, and nothing is written', async () => {
    as(KARTHIK)
    const before = await prisma.company.count()
    const { status, body } = await json(await addSuppliers(req('POST', '/api/suppliers', row('dana@pellwood.invalid', 'Pellwood Staffing'))))
    expect(status).toBe(403)
    expect(body.error.message).toContain('recommend it from the Suppliers page')
    expect(await prisma.company.count()).toBe(before)
    expect(await prisma.supplierInvite.count({ where: { email: 'dana@pellwood.invalid' } })).toBe(0)
  })

  it('a hiring manager cannot add one by pasting either, and is pointed at the recommendation instead', async () => {
    as(HIRING)
    const { status } = await json(await addSuppliers(req('POST', '/api/suppliers', row('dana@pellwood.invalid', 'Pellwood Staffing'))))
    expect(status).toBe(403)
  })

  it('procurement still adds one', async () => {
    as(PROCUREMENT)
    const { status, body } = await json(await addSuppliers(req('POST', '/api/suppliers', row('lee@quarrybank.invalid', 'Quarrybank Talent'))))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.added.map((a: any) => a.name)).toContain('Quarrybank Talent')
  })
})

describe('who joins two records of one supplier', () => {
  /** Two shells Northbend listed on one domain, each invited to a job. */
  async function twoRecordsOfOneFirm(tag: string) {
    const nike = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    const domain = `${tag}.invalid`
    const [a, b] = await Promise.all([1, 2].map((n) =>
      prisma.company.create({
        data: { name: `${tag} Staffing ${n}`, slug: `${tag}-staffing-${n}`, kind: 'VENDOR', currency: 'USD', listedById: nike.id, isDemo: true },
        select: { id: true },
      })
    ))
    for (const [n, c] of [a, b].entries()) {
      await prisma.supplierInvite.create({
        data: { companyId: c.id, byId: nike.id, email: `desk${n}@${domain}`, domain, token: `${tag}-${n}-token` },
      })
    }
    // One job invitation on each, so whichever the rule keeps, the other
    // has something to move.
    const requirements = await prisma.requirement.findMany({ where: { companyId: nike.id }, select: { id: true }, take: 2 })
    for (const [n, c] of [a, b].entries()) {
      await prisma.requirementInvitation.create({
        data: { requirementId: requirements[n].id, fromCompanyId: nike.id, toCompanyId: c.id, expiresAt: new Date(Date.now() + 7 * 86400000) },
      })
    }
    return { a: a.id, b: b.id }
  }

  it('a hiring manager is shown the duplicate but offered no button to join it', async () => {
    await twoRecordsOfOneFirm('holloway')
    as(HIRING)
    const { status, body } = await json(await pairsOf(req('GET', '/api/suppliers/join')))
    expect(status).toBe(200)
    expect(body.data.pairs.some((p: any) => p.domain === 'holloway.invalid')).toBe(true)
    expect(body.data.mayJoin).toBe(false)
    expect(body.data.mayNotJoinSays).toContain('Procurement')
  })

  it('a delivery engineer cannot merge two supplier records', async () => {
    const { a, b } = await twoRecordsOfOneFirm('brindle')
    as(KARTHIK)
    const { status, body } = await json(await joinRecords(req('POST', '/api/suppliers/join', { keepId: a, foldId: b })))
    expect(status).toBe(403)
    expect(body.error.message).toContain('cannot be undone')
    expect(body.error.message).toContain('ask whoever manages roles at your company')
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: b } })).toBe(1)
  })

  it('procurement still can, and the merge is recorded with who did it, what moved and that it cannot be undone', async () => {
    const { a, b } = await twoRecordsOfOneFirm('corrie')
    as(PROCUREMENT)
    const pairs = await json(await pairsOf(req('GET', '/api/suppliers/join')))
    expect(pairs.body.data.mayJoin).toBe(true)
    const pair = pairs.body.data.pairs.find((p: any) => p.domain === 'corrie.invalid')
    expect(pair.ok, JSON.stringify(pair)).toBe(true)

    const { status, body } = await json(await joinRecords(req('POST', '/api/suppliers/join', { keepId: pair.keep.id, foldId: pair.fold.id })))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(await prisma.requirementInvitation.count({ where: { toCompanyId: pair.fold.id } })).toBe(0)

    const me = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PROCUREMENT }, select: { id: true, name: true } })
    const log = await prisma.automationLog.findFirstOrThrow({
      where: { action: 'SUPPLIER_RECORDS_JOINED', payload: { path: ['foldedId'], equals: pair.fold.id } },
    })
    expect(log.reversible).toBe(false)
    expect(log.summary).toContain(me.name)
    const payload = log.payload as any
    expect(payload.byPersonId).toBe(me.id)
    expect(payload.keptId).toBe(pair.keep.id)
    expect(payload.moved.invitations).toHaveLength(1)
    expect([a, b]).toContain(payload.keptId)
  })
})

describe('who opens the check queue', () => {
  it('a delivery engineer is refused the check queue in a sentence that says who to ask', async () => {
    as(KARTHIK)
    const { status, body } = await json(await queue(req('GET', '/api/checks/queue')))
    expect(status).toBe(403)
    expect(body.data).toBeUndefined()
    expect(body.error.message).toContain('Ask whoever manages roles at your company')
  })

  it('a delivery engineer cannot review a machine check either', async () => {
    as(KARTHIK)
    const res = await review(
      req('POST', `/api/checks/${it_.check.id}/review`, { agreed: true }),
      { params: Promise.resolve({ id: it_.check.id }) }
    )
    expect(res.status).toBe(403)
  })

  it('a desk that reads submissions opens the check queue, and the read of each person behind the sample leaves a trail', async () => {
    as(it_.reader)
    const before = await prisma.accessLog.count({ where: { subjectId: it_.subject, action: 'MATCH_VIEW', allowed: true } })
    const { status, body } = await json(await queue(req('GET', '/api/checks/queue')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.sample.map((c: any) => c.id)).toContain(it_.check.id)

    // The trail is written without holding the response; give it a beat.
    let after = before
    for (let i = 0; i < 20 && after === before; i++) {
      await new Promise((r) => setTimeout(r, 50))
      after = await prisma.accessLog.count({ where: { subjectId: it_.subject, action: 'MATCH_VIEW', allowed: true } })
    }
    expect(after).toBeGreaterThan(before)
  })
})
