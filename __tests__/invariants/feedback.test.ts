/**
 * What a tenant asked for, and what should actually happen about it.
 *
 * A pipeline from user request to shipped feature is a machine for
 * building whatever anybody asks for. The 2017 build reached 4,197
 * commits and stalled on adoption rather than engineering, and building
 * is cheaper now than it was then — which makes over-building the primary
 * risk rather than a secondary one.
 *
 * So the tests here are mostly about what does NOT get built.
 */

import { describe, it, expect } from 'vitest'
import { allProcesses } from '@/lib/matrix'
import {
  triage, cluster, rank, forFounder, guessProcess, voiceOf,
  VOICES, ENOUGH_TENANTS, DEMO_WEIGHT, type Request, type Party,
} from '@/lib/feedback'

let n = 0
const req = (over: Partial<Request> = {}): Request => ({
  id: `r${++n}`,
  tenantId: 't1',
  isDemo: false,
  party: 'SUB',
  said: 'we need this',
  l3Code: null,
  at: new Date('2026-06-15T00:00:00Z'),
  ...over,
})

describe('Most requests are not build requests, and saying so is the job', () => {

  it('a request landing on something already built is a findability problem', () => {
    // The most common verdict in any working product, and the one most
    // often misread as a feature request.
    const t = triage(req({ l3Code: 'L3.4.2.1' }))
    expect(t.verdict).toBe('ALREADY_BUILT')
    expect(t.next).toContain('not a build')
  })

  it('says why building it again would be the expensive answer', () => {
    expect(triage(req({ l3Code: 'L3.4.2.1' })).says)
      .toContain('expensive answer to a cheap problem')
  })

  it('whatever a process\u2019s status, the verdict follows it and the owner is named', () => {
    // The first version of this pinned two codes that were PARTIAL and
    // NONE at the time — and failed on the commit that finished them.
    // A fixture that assumes the build stays unfinished is the same
    // disease as a page describing the build. So: every real process,
    // whatever its status today, triages to the verdict its status maps
    // to, with a real agent attached.
    const want = { BUILT: 'ALREADY_BUILT', PARTIAL: 'FINISH_IT', SPEC: 'BUILD_IT', NONE: 'BUILD_IT' } as const
    for (const { l3 } of allProcesses()) {
      const t = triage(req({ l3Code: l3.code }))
      expect(t.verdict, l3.code).toBe(want[l3.status])
      expect(t.agent, l3.code).toMatch(/^etyme-/)
    }
  })

  it('a finish-it or build-it verdict, when one exists, needs no founder', () => {
    // The branch text is exercised whenever the matrix has such a row;
    // when it has none, that is the product being finished, not a gap in
    // the test.
    for (const { l3 } of allProcesses().filter((p) => p.l3.status !== 'BUILT')) {
      const t = triage(req({ l3Code: l3.code }))
      expect(t.needsFounder, l3.code).toBe(false)
      expect(t.next, l3.code).toMatch(/finishes it|L4 tasks already agreed/)
    }
  })

  it('a request that maps to no process is a scope question, not a feature', () => {
    const t = triage(req({ l3Code: null }))
    expect(t.verdict).toBe('NEW_SCOPE')
    expect(t.needsFounder).toBe(true)
    expect(t.says).toContain('request to widen what the product is')
  })

  it('only a scope question needs the founder — the rest already have owners', () => {
    expect(triage(req({ l3Code: 'L3.4.2.1' })).needsFounder).toBe(false)
    expect(triage(req({ l3Code: 'L3.4.2.3' })).needsFounder).toBe(false)
    expect(triage(req({ l3Code: null })).needsFounder).toBe(true)
  })

  it('a code nobody recognises is a typo, not a decision', () => {
    expect(triage(req({ l3Code: 'L3.9.9.9' })).says).toContain('does not exist in the matrix')
  })
})

describe('Distinct tenants are the signal. Message volume is not', () => {

  it('one customer asking ten times is one signal, not ten', () => {
    const many = Array.from({ length: 10 }, () =>
      req({ tenantId: 'loud', l3Code: 'L3.4.2.3' }))
    const [theme] = cluster(many)
    expect(theme.payingTenants).toBe(1)
    expect(theme.requests).toBe(10)
    expect(theme.ready).toBe(false)
  })

  it('says out loud that the messages are not the signal', () => {
    const many = Array.from({ length: 10 }, () =>
      req({ tenantId: 'loud', l3Code: 'L3.4.2.3' }))
    expect(cluster(many)[0].says).toContain('the messages are not the signal')
  })

  it('three separate paying tenants is enough to be worth a decision', () => {
    expect(ENOUGH_TENANTS).toBe(3)
    const spread = ['a', 'b', 'c'].map((t) => req({ tenantId: t, l3Code: 'L3.4.2.3' }))
    expect(cluster(spread)[0].ready).toBe(true)
  })

  it('two is not, however strongly they put it', () => {
    const two = ['a', 'b'].map((t) => req({ tenantId: t, l3Code: 'L3.4.2.3' }))
    expect(cluster(two)[0].ready).toBe(false)
  })

  it('somebody blocked today goes up regardless of how many agree', () => {
    const one = [req({ tenantId: 'a', l3Code: 'L3.4.2.3', blocking: true })]
    const theme = cluster(one)[0]
    expect(theme.ready).toBe(true)
    expect(theme.says).toContain('blocked right now')
  })
})

describe('A demo click is not a customer', () => {

  it('counts a demo tenant, and weighs it at a quarter', () => {
    expect(DEMO_WEIGHT).toBe(0.25)
    const demos = ['d1', 'd2', 'd3', 'd4'].map((t) =>
      req({ tenantId: t, isDemo: true, l3Code: 'L3.4.2.3' }))
    const theme = cluster(demos)[0]
    expect(theme.demoTenants).toBe(4)
    expect(theme.weight).toBe(1)
  })

  it('never lets demo tenants alone reach a decision, however many there are', () => {
    const demos = Array.from({ length: 40 }, (_, i) =>
      req({ tenantId: `d${i}`, isDemo: true, l3Code: 'L3.4.2.3' }))
    expect(cluster(demos)[0].ready).toBe(false)
  })

  it('says why, rather than silently discarding it', () => {
    const demos = ['d1'].map((t) => req({ tenantId: t, isDemo: true, l3Code: 'L3.4.2.3' }))
    expect(cluster(demos)[0].says)
      .toContain('ask for what they would never pay for')
  })
})

describe('The same gap felt by different kinds of firm is the interesting case', () => {

  it('groups by the process, not by the words used', () => {
    // Three vocabularies, one gap. A keyword grouping would miss this.
    const three: Request[] = [
      req({ tenantId: 'a', party: 'CLIENT', said: 'credit notes', l3Code: 'L3.4.2.3' }),
      req({ tenantId: 'b', party: 'SUB', said: 'raising a credit', l3Code: 'L3.4.2.3' }),
      req({ tenantId: 'c', party: 'BENCH_VENDOR', said: 'disputed invoice', l3Code: 'L3.4.2.3' }),
    ]
    const themes = cluster(three)
    expect(themes).toHaveLength(1)
    expect(themes[0].parties).toHaveLength(3)
  })

  it('names the breadth, because that is the part worth noticing', () => {
    const three: Request[] = ['CLIENT', 'SUB', 'BENCH_VENDOR'].map((p, i) =>
      req({ tenantId: `t${i}`, party: p as Party, l3Code: 'L3.4.2.3' }))
    expect(cluster(three)[0].says).toContain('3 different kinds of firm')
  })

  it('ranks blocked first, then breadth of paying tenants, never volume', () => {
    const themes = cluster([
      ...Array.from({ length: 20 }, () => req({ tenantId: 'loud', l3Code: 'L3.4.2.3' })),
      ...['a', 'b', 'c'].map((t) => req({ tenantId: t, l3Code: 'L3.4.3.3' })),
      req({ tenantId: 'z', l3Code: 'L3.5.2.1', blocking: true }),
    ])
    expect(rank(themes).map((t) => t.l3Code)).toEqual(['L3.5.2.1', 'L3.4.3.3', 'L3.4.2.3'])
  })
})

describe('The gate stays shut on almost everything, so it stays real', () => {

  it('raises a scope question, because nobody else may answer one', () => {
    const t = cluster(['a','b','c'].map((x) => req({ tenantId: x, l3Code: null })))
    expect(forFounder(t).themes).toHaveLength(1)
  })

  it('does not raise something already built, at any volume', () => {
    // A gate that opens ten times a day is a gate somebody stops reading.
    const t = cluster(['a','b','c','d','e'].map((x) => req({ tenantId: x, l3Code: 'L3.4.2.1' })))
    expect(forFounder(t).themes).toHaveLength(0)
  })

  it('does not raise a half-built process, because its owner needs no permission', () => {
    const t = cluster(['a','b','c'].map((x) => req({ tenantId: x, l3Code: 'L3.4.2.2' })))
    expect(forFounder(t).themes).toHaveLength(0)
  })

  it('shows how much was handled without him, so the gate can be seen working', () => {
    const t = cluster([
      ...['a','b','c'].map((x) => req({ tenantId: x, l3Code: 'L3.4.2.1' })),
      ...['d','e','f'].map((x) => req({ tenantId: x, l3Code: 'L3.4.2.2' })),
    ])
    const out = forFounder(t)
    expect(out.handled).toBe(2)
    // Nothing was raised, so it says so — and still accounts for the two
    // it dealt with, which is how the gate is seen to be working rather
    // than merely quiet.
    expect(out.says).toContain('2 themes went to the agent that owns the process')
  })

  it('says plainly when nothing needs him at all', () => {
    const t = cluster(['a','b','c'].map((x) => req({ tenantId: x, l3Code: 'L3.4.2.1' })))
    expect(forFounder(t).says).toContain('Nothing needs you')
  })
})

describe('Each party is asked in its own words', () => {

  it('has a voice for every party in a chain', () => {
    expect(VOICES.map((v) => v.party).sort()).toEqual(
      ['BENCH_VENDOR', 'CLIENT', 'CONSULTANT', 'MSP', 'PRIME', 'SUB']
    )
  })

  it('knows a bench vendor says hotlist where the product says bench listing', () => {
    expect(voiceOf('BENCH_VENDOR').vocabulary.hotlist).toBe('bench listing')
  })

  it('knows a consultant only ever means their own timesheet', () => {
    expect(voiceOf('CONSULTANT').vocabulary['my hours']).toBe('timesheet')
    expect(voiceOf('CONSULTANT').usuallyWants).toContain('paid the right amount on time')
  })

  it('translates their words before matching, so a hotlist finds the bench', () => {
    const guesses = guessProcess('our hotlist is not visible to clients', 'BENCH_VENDOR')
    expect(guesses.length).toBeGreaterThan(0)
  })

  it('returns nothing rather than a bad guess, so a model is only asked when rules fail', () => {
    expect(guessProcess('the colours', 'SUB')).toEqual([])
  })

  it('every voice says what that party is usually really after', () => {
    for (const v of VOICES) {
      expect(v.usuallyWants.length, v.party).toBeGreaterThan(60)
    }
  })
})
