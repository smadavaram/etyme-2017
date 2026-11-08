/**
 * Twenty hires through every rung (the founder, 2026-11-08): how the
 * simulation's demand stations choose the four-rung chains, count the
 * rungs each award walked, and read the run's flag. Pure; no database,
 * no server.
 */
import { describe, it, expect } from 'vitest'
import {
  awardsByRungs, bandBelow, chainHiresWanted, chainWords, pickChains, rungsWalked, sellsToFrom,
  type ChainFirmFacts,
} from '../../scripts/simulate/stages/demand/common'
import { emptyWorld, type Ctx } from '../../scripts/simulate/stage'

const firm = (id: string, kind = 'VENDOR'): ChainFirmFacts => ({ id, slug: id, name: id.toUpperCase(), kind })
const firms = new Map<string, ChainFirmFacts>(
  [firm('client', 'CLIENT'), firm('prime'), firm('prime2'), firm('sub'), firm('sub2'), firm('bench'), firm('bench2'), firm('msp', 'MSP')].map((f) => [f.id, f])
)
const tie = (seller: string, buyer: string) => ({ seller, buyer })

describe('A chain is made only of trade ties the world already holds', () => {
  it('a supplier naming the firm above it as its client or its prime is a firm that sells to that one', () => {
    expect(sellsToFrom([
      { companyId: 'prime', otherCompanyId: 'client', relationship: 'CLIENT' },
      { companyId: 'sub', otherCompanyId: 'prime', relationship: 'PRIME' },
    ])).toEqual([tie('prime', 'client'), tie('sub', 'prime')])
  })

  it('a buyer naming a firm as its supplier is the same tie read from the other side, and a pair said both ways is one tie', () => {
    expect(sellsToFrom([
      { companyId: 'sub', otherCompanyId: 'prime', relationship: 'PRIME' },
      { companyId: 'prime', otherCompanyId: 'sub', relationship: 'SUPPLIER' },
    ])).toEqual([tie('sub', 'prime')])
  })

  it('a tie that is no longer active, and an MSP running a program, are not links of a chain', () => {
    expect(sellsToFrom([
      { companyId: 'sub', otherCompanyId: 'prime', relationship: 'PRIME', status: 'ENDED' },
      { companyId: 'msp', otherCompanyId: 'client', relationship: 'RUNS' },
    ])).toEqual([])
  })
})

describe('Which jobs walk four rungs', () => {
  const ties = [tie('sub', 'prime'), tie('bench', 'sub'), tie('sub2', 'prime2'), tie('bench2', 'sub2')]
  const bench = new Map([['bench', [['java', 'spring']]], ['bench2', [['nursing']]]])

  it('a chain runs from a prime the client sent the job to, through a firm selling to that prime, to a bench vendor selling to that firm with somebody free', () => {
    const got = pickChains({
      jobs: [{ id: 'j1', clientId: 'client', skills: ['java'], invited: ['prime'] }],
      ties, firms, benchSkills: bench, want: 5,
    })
    expect(got).toHaveLength(1)
    expect(chainWords(got[0])).toBe('CLIENT ← PRIME ← SUB ← BENCH')
  })

  it('a prime the client never sent the job to is never the top of its chain', () => {
    expect(pickChains({
      jobs: [{ id: 'j1', clientId: 'client', skills: [], invited: ['sub'] }],
      ties, firms, benchSkills: bench, want: 5,
    })).toEqual([])
  })

  it('a bench vendor with nobody free on its bench ends no chain, and no link is invented to make one', () => {
    expect(pickChains({
      jobs: [{ id: 'j1', clientId: 'client', skills: [], invited: ['prime'] }],
      ties, firms, benchSkills: new Map(), want: 5,
    })).toEqual([])
  })

  it('an MSP or the client itself never stands between the person and the client', () => {
    expect(pickChains({
      jobs: [{ id: 'j1', clientId: 'client', skills: [], invited: ['prime'] }],
      ties: [tie('msp', 'prime'), tie('bench', 'msp'), tie('client', 'prime'), tie('bench', 'client')],
      firms, benchSkills: bench, want: 5,
    })).toEqual([])
  })

  it('among the chains a job could take, the bench that fits the job best is chosen', () => {
    const got = pickChains({
      jobs: [{ id: 'j1', clientId: 'client', skills: ['nursing'], invited: ['prime', 'prime2'] }],
      ties, firms, benchSkills: bench, want: 5,
    })
    expect(got[0].bench.id).toBe('bench2')
  })

  it('a job carries one chain at most, the count asked for is never passed, and the firms walked least go first', () => {
    const jobs = ['j1', 'j2', 'j3'].map((id) => ({ id, clientId: 'client', skills: [], invited: ['prime', 'prime2'] }))
    const got = pickChains({ jobs, ties, firms, benchSkills: bench, want: 2 })
    expect(got.map((c) => c.jobId)).toEqual(['j1', 'j2'])
    expect(new Set(got.map((c) => c.prime.id)).size).toBe(2)
  })

  it('the same world picks the same chains every time', () => {
    const jobs = ['j1', 'j2'].map((id) => ({ id, clientId: 'client', skills: ['java'], invited: ['prime2', 'prime'] }))
    const a = pickChains({ jobs, ties, firms, benchSkills: bench, want: 5 })
    const b = pickChains({ jobs, ties, firms, benchSkills: bench, want: 5 })
    expect(a).toEqual(b)
  })
})

describe('Each rung offers the rung below a band of its own', () => {
  it('a rung below is offered a share of the band above, in whole dollars', () => {
    expect(bandBelow(9000, 11000, 0.9)).toEqual({ payMin: 8100, payMax: 9900 })
  })

  it('a band nobody set stays unset rather than becoming a figure', () => {
    expect(bandBelow(null, null, 0.8)).toEqual({ payMin: null, payMax: null })
  })
})

describe('The rungs every award walked', () => {
  it('a supplier’s person put straight in front of the client walked two rungs', () => {
    expect(rungsWalked('top', new Map([['top', null]]))).toBe(2)
  })

  it('a bench vendor’s person through a sub-vendor and a prime to the client walked four rungs', () => {
    const parents = new Map<string, string | null>([['top', 'atPrime'], ['atPrime', 'atSub'], ['atSub', null]])
    expect(rungsWalked('top', parents)).toBe(4)
  })

  it('a chain of submissions that loops on itself is counted once round and stops', () => {
    expect(rungsWalked('a', new Map([['a', 'b'], ['b', 'a']]))).toBe(3)
  })

  it('the report counts awards by rungs walked and names every four-rung award with its chain', () => {
    const world = emptyWorld()
    world.awards.push(
      { id: '1', by: 'x', jobId: 'j', submissionId: 's1', extra: { rungs: 2 } },
      { id: '2', by: 'x', jobId: 'j', submissionId: 's2', extra: { rungs: 4, personName: 'Ravi Kumar', jobTitle: 'Data engineer', chainWords: 'CLIENT ← PRIME ← SUB ← BENCH' } },
      { id: '3', by: 'x', jobId: 'j', submissionId: 's3' },
    )
    const got = awardsByRungs(world)
    expect(got.byRungs).toEqual({ '1': 0, '2': 1, '3': 0, '4+': 1 })
    expect(got.chain).toEqual(['Ravi Kumar for Data engineer (CLIENT ← PRIME ← SUB ← BENCH)'])
  })

  it('an award nobody counted the rungs of is left out, never read as one rung', () => {
    const world = emptyWorld()
    world.awards.push({ id: '3', by: 'x', jobId: 'j', submissionId: 's3' })
    expect(awardsByRungs(world)).toMatchObject({ byRungs: { '1': 0, '2': 0, '3': 0, '4+': 0 }, uncounted: 1 })
  })
})

describe('How many chain hires the run asks for', () => {
  const ctx = (flags?: unknown) => ({ options: { placements: 1, weeks: 1, concurrency: 1, only: [] }, ...(flags ? { flags } : {}) }) as unknown as Ctx

  it('twenty unless the run says otherwise', () => {
    expect(chainHiresWanted(ctx())).toBe(20)
  })

  it('the run’s --chain-hires flag is the count', () => {
    expect(chainHiresWanted(ctx({ chainHires: 35 }))).toBe(35)
  })

  it('a count that is not a whole number above nought is not a count, and twenty stands', () => {
    expect(chainHiresWanted(ctx({ chainHires: 0 }))).toBe(20)
    expect(chainHiresWanted(ctx({ chainHires: 2.5 }))).toBe(20)
  })
})
