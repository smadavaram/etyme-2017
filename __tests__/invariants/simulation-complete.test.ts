/**
 * The run's headline: complete transactions (founder, 2026-11-02: "100000
 * in complete transactions and not per page"), where the chain stops, and
 * what each complete one cost in notices and access-log rows
 * (scripts/simulate/complete.ts). The definition is the coordinator's,
 * reversible by the founder in a sentence.
 */
import { describe, it, expect } from 'vitest'
import { COMPLETE_TARGET, completeLines, countComplete, reached, type PlacementFacts, type RungFacts } from '../../scripts/simulate/complete'
import { reportMarkdown, type RunRecord } from '../../scripts/simulate/report'
import { Ledger } from '../../scripts/simulate/ledger'
import { emptyWorld } from '../../scripts/simulate/stage'

const rung = (over: Partial<RungFacts> = {}): RungFacts => ({ sellContractId: 'sc', sellerKind: 'VENDOR', billed: true, received: true, paid: true, ...over })
const placement = (over: Partial<PlacementFacts> = {}): PlacementFacts => ({ id: 'p', started: true, weeksSigned: 2, rungs: [rung()], payWorkedOut: true, ...over })

describe('What makes a transaction complete', () => {
  it('a placement is complete only when every rung’s invoice receipt is paid and its employer worked out a pay period covering one of its weeks', () => {
    expect(reached(placement(), 'COMPLETE')).toBe(true)
    expect(reached(placement({ payWorkedOut: false }), 'COMPLETE')).toBe(false)
    expect(reached(placement({ rungs: [rung(), rung({ paid: false })] }), 'COMPLETE')).toBe(false)
    expect(reached(placement({ rungs: [] }), 'COMPLETE')).toBe(false)
  })

  it('a person paid through her own corporation is paid by her invoice, so her placement completes with every rung paid and no payroll', () => {
    expect(reached(placement({ payWorkedOut: false, rungs: [rung(), rung({ sellerKind: 'CONSULTANT_CORP' })] }), 'COMPLETE')).toBe(true)
  })

  it('paid at the top rung is not paid at every rung: a firm below still waiting on its payer stops the chain there', () => {
    const p = placement({ rungs: [rung(), rung({ paid: false })] })
    expect([reached(p, 'PAID_AT_TOP'), reached(p, 'PAID_EVERY_RUNG')]).toEqual([true, false])
  })
})

describe('The report says where the chain stops, and what a complete one cost', () => {
  const facts = [
    placement({ id: 'a' }),
    placement({ id: 'b', payWorkedOut: false }),
    placement({ id: 'c', rungs: [rung({ paid: false })] }),
    placement({ id: 'd', rungs: [rung({ billed: false, received: false, paid: false })] }),
    placement({ id: 'e', weeksSigned: 0, rungs: [rung({ billed: false, received: false, paid: false })] }),
    placement({ id: 'f', started: false, weeksSigned: 0, rungs: [rung({ billed: false, received: false, paid: false })] }),
  ]

  it('how far each placement got is counted step by step, so the report shows where the chain stops', () => {
    const c = countComplete(facts, { notices: 0, accessLog: 0 })
    expect([c.placements, c.complete, c.target]).toEqual([6, 1, COMPLETE_TARGET])
    expect(c.reached).toEqual({ STARTED: 5, WEEKS_SIGNED: 4, BILLED: 3, RECEIVED: 3, PAID_AT_TOP: 2, PAID_EVERY_RUNG: 2, COMPLETE: 1 })
  })

  it('the cost is notices and access-log rows written during the run per complete transaction, and with none complete there is no cost per one', () => {
    expect(countComplete([placement(), placement()], { notices: 861, accessLog: 380 }).perComplete).toEqual({ notices: 431, accessLog: 190 })
    const none = countComplete([placement({ payWorkedOut: false })], { notices: 50, accessLog: 20 })
    expect(none.perComplete).toBeNull()
    expect(completeLines(none).join('\n')).toContain('No transaction completed, so there is no cost per one.')
  })

  it('the headline says the count against the hundred thousand asked for, in words a person reads', () => {
    const md = completeLines(countComplete(facts, { notices: 1000, accessLog: 500 })).join('\n')
    expect(md).toContain('1 complete transaction of 6 placements this run worked on')
    expect(md).toContain('against the target of 100,000')
    expect(md).toContain('| paid at every rung | 2 |')
    expect(md).not.toMatch(/\bdesks?\b|program office/i)
  })

  it('the run’s report opens on the count, and a count that could not be read says so rather than nought', () => {
    const base: RunRecord = {
      stamp: 's', startedAt: new Date(0), finishedAt: new Date(1000), options: { placements: 1, weeks: 1, concurrency: 1, only: [] },
      database: { name: 'etyme_sim_1', template: 't', kept: true }, base: 'http://x', build: 'reused', stages: [], world: emptyWorld(),
      ledger: new Ledger(), catalog: { seats: [], unreachable: [] }, opened: 0,
    }
    const counted = reportMarkdown({ ...base, complete: countComplete(facts, { notices: 0, accessLog: 0 }) })
    expect(counted.indexOf('## Complete transactions')).toBeLessThan(counted.indexOf('## What closed at every station'))
    const unread = reportMarkdown({ ...base, complete: { unread: 'connection refused' } })
    expect(unread).toContain('The count could not be read: connection refused')
    expect(unread).not.toMatch(/\b0 complete transactions\b/)
  })
})
