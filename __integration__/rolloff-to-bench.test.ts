import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { POST as resolve } from '@/app/api/rolloff/[id]/resolve/route'

/**
 * Resolving a rolloff as BENCH, on the seeded world.
 *
 * It used to write a listing with no `state`, so the row took the
 * column's default — GRANTED — and the person was on the bench the
 * moment a delivery manager clicked, while the screen told the manager
 * "they still need to grant it". Both halves were false. It also copied
 * the price the client was billed into the listing's rate range.
 *
 * Now: somebody the firm does not employ is asked, and is not on the
 * bench until they say yes; somebody already on it stays on it; and an
 * integrator's own employee goes back on its roster with no listing at
 * all, because the employment is the consent.
 */

const D = '@demo.etyme.local'
const CLOUDEPA = `world-cloudepa${D}`
const TELEWORLD = `world-teleworld${D}`

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
}, 600_000)

async function companyOf(email: string) {
  const ctx = await prisma.context.findFirstOrThrow({
    where: { person: { primaryEmail: email } },
    select: { companyId: true },
  })
  return ctx.companyId!
}

async function isEmployee(personId: string, companyId: string) {
  return (
    (await prisma.context.findFirst({
      where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null },
      select: { id: true },
    })) !== null
  )
}

/** An unresolved rolloff on this sell line, made if the seed has none. */
async function rolloffOn(sellContractId: string) {
  const had = await prisma.rolloffEvent.findUnique({ where: { sellContractId } })
  if (had) {
    return prisma.rolloffEvent.update({ where: { id: had.id }, data: { outcome: null } })
  }
  return prisma.rolloffEvent.create({
    data: { sellContractId, endDate: new Date(), notified: {}, checklist: {} },
  })
}

/**
 * A sell line at this firm whose person the firm does not employ, and
 * who holds a listing here in the given condition (or none at all).
 */
async function lineFor(
  companyId: string,
  want: (listing: { state: string; revokedAt: Date | null } | null) => boolean,
  skip: Set<string> = new Set()
) {
  const lines = await prisma.sellContract.findMany({
    where: { companyId },
    select: {
      id: true, personId: true, billRate: true,
      person: { select: { name: true, consultant: { select: { id: true } } } },
    },
    orderBy: { id: 'asc' },
  })
  for (const l of lines) {
    if (skip.has(l.personId)) continue
    if (await isEmployee(l.personId, companyId)) continue
    const listing = l.person.consultant
      ? await prisma.benchListing.findUnique({
          where: { consultantId_companyId: { consultantId: l.person.consultant.id, companyId } },
          select: { state: true, revokedAt: true },
        })
      : null
    if (want(listing)) return l
  }
  return null
}

async function listingOf(personId: string, companyId: string) {
  const profile = await prisma.consultantProfile.findUnique({ where: { personId } })
  if (!profile) return null
  return prisma.benchListing.findUnique({
    where: { consultantId_companyId: { consultantId: profile.id, companyId } },
  })
}

describe('benching somebody from rolloff', () => {
  it('benching somebody from rolloff asks them to agree, and they are not on the bench until they do', async () => {
    // Any firm's line for somebody it does not employ and who holds no
    // listing there — the seeded CloudEPA bench is fully consented, so
    // the search runs over every supplying firm.
    const firms = await prisma.company.findMany({
      where: { kind: { not: 'CLIENT' }, slug: { startsWith: 'world-' } },
      select: { id: true },
      orderBy: { slug: 'asc' },
    })
    let companyId = ''
    let line: Awaited<ReturnType<typeof lineFor>> = null
    for (const f of firms) {
      line = await lineFor(f.id, (l) => l === null)
      if (line) { companyId = f.id; break }
    }
    expect(line, 'the seeded world has a supplier line for somebody with no listing there').toBeTruthy()
    const rolloff = await rolloffOn(line!.id)

    // Resolved from a seat at that firm, chosen the way the client does.
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId, type: 'EMPLOYEE', revokedAt: null },
      select: { id: true, person: { select: { primaryEmail: true } } },
      orderBy: { id: 'asc' },
    })
    as(seat.person.primaryEmail)
    const r = await json(await resolve(
      req('POST', `/api/rolloff/${rolloff.id}/resolve`, { outcome: 'BENCH' }, { 'x-context-id': seat.id }),
      { params: Promise.resolve({ id: rolloff.id }) }
    ))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.message).toBe(
      `Asked ${line!.person.name} to agree to be on your bench. Nobody can put them forward until they say yes.`
    )

    const listing = await listingOf(line!.personId, companyId)
    expect(listing).toBeTruthy()
    expect(listing!.state).toBe('INVITED')
    expect(listing!.invitedAt).not.toBeNull()
    expect(listing!.respondedAt).toBeNull()

    // Not on the bench: the company bench reads granted listings only
    // for marketing, and mayMarket refuses an unanswered invitation.
    const { mayMarket } = await import('@/lib/bench-consent')
    expect(mayMarket(listing! as Parameters<typeof mayMarket>[0]).ok).toBe(false)

    // And they were actually asked, the normal way — the invitation is
    // a recorded message about this listing.
    const person = await prisma.person.findUniqueOrThrow({ where: { id: line!.personId } })
    if (person.primaryEmail) {
      const msg = await vi
        .waitFor(
          async () => {
            const row = await prisma.textMessage.findFirst({
              where: { personId: line!.personId, aboutType: 'LISTING', aboutId: listing!.id },
            })
            if (!row) throw new Error('not yet')
            return row
          },
          { timeout: 10_000, interval: 100 }
        )
        .catch(() => null)
      expect(msg, 'no invitation was recorded').toBeTruthy()
    }
  }, 60_000)

  it('somebody already on the bench stays on it and is told nothing new', async () => {
    const companyId = await companyOf(CLOUDEPA)
    const line = await lineFor(companyId, (l) => l !== null && !l.revokedAt && l.state === 'GRANTED')
    expect(line, 'the seeded world has a CloudEPA line for somebody who granted a listing').toBeTruthy()
    const before = await listingOf(line!.personId, companyId)
    const rolloff = await rolloffOn(line!.id)
    const startedAt = new Date()

    as(CLOUDEPA)
    const r = await json(await resolve(req('POST', `/api/rolloff/${rolloff.id}/resolve`, { outcome: 'BENCH' }), {
      params: Promise.resolve({ id: rolloff.id }),
    }))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.message).toBe(`${line!.person.name} is already on your bench. Nothing new was asked.`)

    const after = await listingOf(line!.personId, companyId)
    expect(after!.state).toBe('GRANTED')
    expect(after!.grantedAt.toISOString()).toBe(before!.grantedAt.toISOString())
    expect(after!.rateMin).toBe(before!.rateMin)
    expect(after!.rateMax).toBe(before!.rateMax)

    const asked = await prisma.textMessage.count({
      where: { personId: line!.personId, aboutType: 'LISTING', aboutId: after!.id, at: { gt: startedAt } },
    })
    expect(asked).toBe(0)
  }, 60_000)

  it('an integrator’s own employee rolling off goes on its own roster, not a consent listing', async () => {
    const companyId = await companyOf(TELEWORLD)
    const lines = await prisma.sellContract.findMany({
      where: { companyId },
      select: { id: true, personId: true, person: { select: { name: true } } },
      orderBy: { id: 'asc' },
    })
    let line: (typeof lines)[number] | undefined
    for (const l of lines) {
      if (await isEmployee(l.personId, companyId)) { line = l; break }
    }
    expect(line, 'the seeded world has a Teleworld line for one of its own employees').toBeTruthy()
    const before = await listingOf(line!.personId, companyId)
    const rolloff = await rolloffOn(line!.id)

    as(TELEWORLD)
    const r = await json(await resolve(req('POST', `/api/rolloff/${rolloff.id}/resolve`, { outcome: 'BENCH' }), {
      params: Promise.resolve({ id: rolloff.id }),
    }))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect(r.body.data.message).toBe(
      `${line!.person.name} is back on your own roster, between projects. They are your employee, so there is nothing for them to agree to.`
    )

    // No listing was written or changed: the employment is the consent.
    const after = await listingOf(line!.personId, companyId)
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))

    const resolved = await prisma.rolloffEvent.findUniqueOrThrow({ where: { id: rolloff.id } })
    expect(resolved.outcome).toBe('BENCH')
  }, 60_000)

  it('the rate range on a bench listing is never the price the client was billed', async () => {
    const companyId = await companyOf(CLOUDEPA)
    // A person who once had a listing here and took it back — the path
    // that reopens an old row, which used to write the bill rate in.
    let line = await lineFor(companyId, (l) => l !== null && l.revokedAt !== null)
    if (!line) {
      line = await lineFor(companyId, (l) => l !== null && !l.revokedAt && l.state === 'GRANTED')
      expect(line).toBeTruthy()
      const listing = await listingOf(line!.personId, companyId)
      await prisma.benchListing.update({
        where: { id: listing!.id },
        data: { revokedAt: new Date(), rateMin: 1000, rateMax: line!.billRate },
      })
    }
    const rolloff = await rolloffOn(line!.id)

    as(CLOUDEPA)
    const r = await json(await resolve(req('POST', `/api/rolloff/${rolloff.id}/resolve`, { outcome: 'BENCH' }), {
      params: Promise.resolve({ id: rolloff.id }),
    }))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()

    const listing = await listingOf(line!.personId, companyId)
    // Asked afresh, never quietly re-granted.
    expect(listing!.state).toBe('INVITED')
    expect(listing!.revokedAt).toBeNull()
    expect(listing!.rateMax).not.toBe(line!.billRate)
    expect(listing!.rateMin).toBeNull()
    expect(listing!.rateMax).toBeNull()
  }, 60_000)

  it('a rolloff already resolved cannot be resolved again', async () => {
    const resolved = await prisma.rolloffEvent.findFirstOrThrow({
      where: { outcome: 'BENCH', sellContract: { company: { slug: 'world-teleworld' } } },
    })
    as(TELEWORLD)
    const r = await json(await resolve(req('POST', `/api/rolloff/${resolved.id}/resolve`, { outcome: 'LOST' }), {
      params: Promise.resolve({ id: resolved.id }),
    }))
    expect(r.status).toBe(409)
    expect((await prisma.rolloffEvent.findUniqueOrThrow({ where: { id: resolved.id } })).outcome).toBe('BENCH')
  }, 60_000)

  it('a firm cannot resolve a rolloff on another firm’s contract', async () => {
    const companyId = await companyOf(TELEWORLD)
    const line = await prisma.sellContract.findFirstOrThrow({
      where: { companyId, rolloff: null },
      select: { id: true },
    })
    const rolloff = await rolloffOn(line.id)
    as(CLOUDEPA)
    const r = await json(await resolve(req('POST', `/api/rolloff/${rolloff.id}/resolve`, { outcome: 'BENCH' }), {
      params: Promise.resolve({ id: rolloff.id }),
    }))
    expect(r.status).toBe(403)
    expect((await prisma.rolloffEvent.findUniqueOrThrow({ where: { id: rolloff.id } })).outcome).toBeNull()
  }, 60_000)
})
