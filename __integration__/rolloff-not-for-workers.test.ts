import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as readDecisions } from '@/app/api/decisions/route'

/**
 * The worker tester opened Karthik Menon's dashboard — Teleworld's own
 * W2 engineer — and read "Rolloff in 18d — Felix Brenner · Northbend
 * Athletic · $132/hr": a colleague's last day and the firm's bill rate
 * for him. The rolloff rows were gated on assignments.read, which every
 * engineer holds to see their own work.
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const OWNER = 'world-teleworld@demo.etyme.local'

const rolloffs = async (email: string) => {
  as(email)
  const r = await json(await readDecisions(req('GET', '/api/decisions')))
  expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
  return (r.body.data.decisions as any[]).filter((d) => d.type === 'ROLLOFF_ACTION')
}

describe('a colleague’s rolloff and rate stay with the desks that run the work', () => {
  beforeAll(async () => {
    await freshWorld()
    // The seeded world has Felix Brenner rolling off Teleworld's book.
    const felix = await prisma.sellContract.findFirst({
      where: { company: { slug: 'world-teleworld' }, person: { name: 'Felix Brenner' }, state: 'IN_PROGRESS' },
    })
    expect(felix, 'the world seeds Felix Brenner on Teleworld’s book').not.toBeNull()
  }, 240_000)

  it('an engineer who reads only his own work sees no colleague’s rolloff and no rate', async () => {
    const rows = await rolloffs(KARTHIK)
    expect(rows).toEqual([])
  })

  it('the firm’s owner, who runs the work, still sees Felix Brenner’s rolloff', async () => {
    const rows = await rolloffs(OWNER)
    expect(rows.some((d) => d.title.includes('Felix Brenner'))).toBe(true)
  })
})
