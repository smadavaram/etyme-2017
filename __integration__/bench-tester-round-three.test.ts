import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as bench } from '@/app/api/bench/route'
import { GET as ourBench } from '@/app/api/bench/ours/route'
import { GET as wants, POST as ask } from '@/app/api/bench/wants/route'
import { PATCH as closeWant } from '@/app/api/bench/wants/[id]/route'

/**
 * The tester's walk of 2026-10-03, what was still open on 2026-10-06,
 * read through the routes the Bench page calls on the seeded world. The
 * rules are sentences in __tests__/invariants/bench-tester-round-three.
 */

const D = '@demo.etyme.local'
const PELLWRIGHT = `world-pellwright${D}`
const PELLWRIGHT_RECRUITER = `world-pellwright-recruiter${D}`
const PELLWRIGHT_FINANCE = `world-pellwright-finance${D}`
const SUNDARA = `world-sundara${D}`
const NORTHBEND = `world-nike${D}`
const INGRID = `world-teleworld-delivery-portland${D}`
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const listingsOf = (body: any): any[] => Object.values(body.data?.tiers ?? {}).flat() as any[]

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('Pellwright’s own bench', () => {
  it('names the rate it sells every listed person at, never “Not stated”', async () => {
    as(PELLWRIGHT)
    const r = await json(await bench(req('GET', '/api/bench?scope=company')))
    expect(r.status).toBe(200)
    const rows = listingsOf(r.body)
    expect(rows.length).toBeGreaterThan(0)
    for (const l of rows) {
      expect(l.rateMin, l.consultant.person.name).toBeGreaterThan(0)
      expect(l.rateMax, l.consultant.person.name).toBeGreaterThanOrEqual(l.rateMin)
    }
  })
})

describe('Sundara’s partner bench', () => {
  it('reads Tobias Wren and Noor Abernathy, whom Sundara itself sells, as on a placement through it — not as somebody to ask for', async () => {
    as(SUNDARA)
    const r = await json(await bench(req('GET', '/api/bench?scope=network')))
    expect(r.status).toBe(200)
    for (const name of ['Tobias Wren', 'Noor Abernathy']) {
      const row = listingsOf(r.body).find((l) => l.consultant.person.name === name)
      expect(row, name).toBeDefined()
      expect(row.oursSays, name).toBe('On a placement through you')
      expect(row.free.state, name).toBe('PLACED')
    }
    // Somebody Sundara has never sold may still be asked for.
    const lucia = listingsOf(r.body).find((l) => l.consultant.person.name === 'Lucia Brandvold')
    expect(lucia?.oursSays ?? null).toBeNull()
  })
})

describe('What we need', () => {
  let wantId = ''

  it('Sundara asks its partners for validation engineers, and the answer reads the ask back in one line', async () => {
    as(SUNDARA)
    const r = await json(await ask(req('POST', '/api/bench/wants', {
      skills: ['Cleaning validation', 'GMP documentation'], places: ['Wichita, KS', 'Remote'], rateMinCents: 9_000, rateMaxCents: 12_000,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    wantId = r.body.data.want.id
    expect(r.body.data.want.says).toBe('Cleaning validation, GMP documentation · Wichita, KS or Remote · $90–$120/hr · offers go to whoever reads Partner bench')
    const mine = await json(await wants(req('GET', '/api/bench/wants')))
    expect(mine.body.data.ours.map((w: any) => w.id)).toContain(wantId)
  })

  it('Pellwright, which trades with Sundara, reads it under what partners need, with Sundara’s name', async () => {
    as(PELLWRIGHT_RECRUITER)
    const r = await json(await wants(req('GET', '/api/bench/wants')))
    expect(r.status).toBe(200)
    const theirs = r.body.data.partners.find((w: any) => w.id === wantId)
    expect(theirs?.firm).toBe('Sundara Systems')
  })

  it('a client is refused in a sentence, and reads nobody’s ask', async () => {
    as(NORTHBEND)
    const r = await json(await wants(req('GET', '/api/bench/wants')))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('a client does not browse one')
  })

  it('a desk that reads no people is told whose page it is, never a permission code', async () => {
    as(PELLWRIGHT_FINANCE)
    const r = await json(await ask(req('POST', '/api/bench/wants', { skills: ['GMP'] })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).not.toMatch(/consultants\.(read|write)/)
  })

  it('another firm cannot close Sundara’s ask; Sundara closes it, and partners stop reading it', async () => {
    as(PELLWRIGHT)
    const no = await json(await closeWant(req('PATCH', `/api/bench/wants/${wantId}`, { close: true }), params(wantId)))
    expect(no.status).toBe(404)
    as(SUNDARA)
    const yes = await json(await closeWant(req('PATCH', `/api/bench/wants/${wantId}`, { close: true }), params(wantId)))
    expect(yes.status).toBe(200)
    expect((await prisma.benchWant.findUniqueOrThrow({ where: { id: wantId } })).closedAt).not.toBeNull()
    as(PELLWRIGHT_RECRUITER)
    const r = await json(await wants(req('GET', '/api/bench/wants')))
    expect(r.body.data.partners.map((w: any) => w.id)).not.toContain(wantId)
  })
})

describe('Teleworld’s Our bench', () => {
  it('reads Felix Brenner’s skills from the job he is on, said as the job’s, where his own record names none', async () => {
    as(INGRID)
    const r = await json(await ourBench(req('GET', '/api/bench/ours')))
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200)
    const felix = r.body.data.rows.find((x: any) => x.name === 'Felix Brenner')
    expect(felix?.skillsSay).toBe('ERP finance, General ledger, Retail (from the job they are on)')
  })
})
