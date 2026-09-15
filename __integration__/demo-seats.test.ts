import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { req, json, resetDatabase, prisma } from './harness'
import { DEMO_COOKIE } from '@/lib/demo-session'

import { POST as demo } from '@/app/api/demo/route'

/**
 * Every door on the home page lands somewhere different.
 *
 * It did not. The demo route resumed whatever workspace the cookie
 * already held regardless of which seat had just been picked, so the
 * first click seated a visitor as Oxford Corp and every later click —
 * MSP, integrator, prime, bench — silently put them back in Oxford
 * Corp's book. The seat picker was a form whose answer was thrown away,
 * and the founder's report was exactly right: "it shows Oxford client
 * for everything".
 *
 * A resume is still correct for a refresh. It is wrong for a different
 * seat, which is an explicit intent and gets a workspace of its own.
 */

/** POST /api/demo carrying whatever cookie the last response set. */
async function enter(seat: string, cookie?: string) {
  const r = req('POST', '/api/demo', { side: seat }, cookie ? { cookie: `${DEMO_COOKIE}=${cookie}` } : {})
  const res = await demo(r as NextRequest)
  const body = (await res.json()).data
  // The set-cookie header carries the signed value; keep it for the next call.
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = new RegExp(`${DEMO_COOKIE}=([^;]+)`).exec(setCookie)
  return { body, cookie: m?.[1] ?? cookie }
}

describe('the seat you pick is the seat you get', () => {
  beforeAll(async () => {
    await resetDatabase()
  }, 120_000)

  it('each of the five company seats lands in a company of its own kind', async () => {
    const expected: Record<string, string> = {
      CLIENT: 'CLIENT', MSP: 'MSP', GSI: 'GSI', PRIME: 'VENDOR', BENCH: 'VENDOR',
    }
    for (const seat of Object.keys(expected)) {
      const { body } = await enter(seat)
      const company = await prisma.company.findUniqueOrThrow({ where: { id: body.companyId } })
      expect(company.kind, `${seat} should be a ${expected[seat]}`).toBe(expected[seat])
      expect(body.resumed).toBe(false)
    }
  }, 120_000)

  it('no two seats are the same firm — an MSP is not named like a buyer', async () => {
    const names = new Set<string>()
    for (const seat of ['CLIENT', 'MSP', 'GSI', 'PRIME', 'BENCH']) {
      const { body } = await enter(seat)
      names.add(body.companyName)
    }
    expect(names.size).toBe(5)
  }, 120_000)

  it('picking the same seat again resumes rather than building a second workspace', async () => {
    const first = await enter('MSP')
    const again = await enter('MSP', first.cookie)
    expect(again.body.resumed).toBe(true)
    expect(again.body.companyId).toBe(first.body.companyId)
  }, 60_000)

  it('picking a different seat builds a new workspace instead of resuming the old one', async () => {
    const asClient = await enter('CLIENT')
    const asMsp = await enter('MSP', asClient.cookie)
    expect(asMsp.body.resumed).toBe(false)
    expect(asMsp.body.companyId).not.toBe(asClient.body.companyId)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: asMsp.body.companyId } })
    expect(company.kind).toBe('MSP')
  }, 60_000)

  it('a prime and a bench vendor are told apart even though both are VENDOR kind', async () => {
    // Kind alone cannot separate them, so the resume must read the seat
    // off the slug. Without that, a prime who clicked "bench" would be
    // resumed into the prime's book.
    const asPrime = await enter('PRIME')
    const asBench = await enter('BENCH', asPrime.cookie)
    expect(asBench.body.resumed).toBe(false)
    expect(asBench.body.companyId).not.toBe(asPrime.body.companyId)
  }, 60_000)

  it('a candidate who then picks a company seat is not handed the agency that lists them', async () => {
    // A candidate's only context is a CONSULTANT one on somebody else's
    // agency. Resuming them into "their company" would put a candidate in
    // charge of the firm that markets them.
    const asCandidate = await enter('CANDIDATE')
    const asClient = await enter('CLIENT', asCandidate.cookie)
    expect(asClient.body.resumed).toBe(false)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: asClient.body.companyId } })
    expect(company.kind).toBe('CLIENT')
  }, 60_000)
})
