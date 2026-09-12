import { describe, it, expect } from 'vitest'
import {
  costMicrosOf, showMicros, costPerSubmission, trend,
  filterRate, worstOffender, firstTimeRate, type Row,
} from '@/lib/agent-run'

/**
 * The build called a model and threw the usage away — `response.usage` was
 * read nowhere in the codebase. So nothing could answer the three
 * questions that decide whether any of the model work is worth doing:
 * what does one submission cost, is it falling, and which agent is the
 * expensive one.
 *
 * This is the ledger that answers them.
 */

function row(over: Partial<Row> = {}): Row {
  return {
    agent: 'match.score',
    verdict: 'PASS',
    attempt: 1,
    costMicros: 40_000,
    ms: 1800,
    consideredCount: null,
    scoredCount: null,
    at: new Date('2026-08-21'),
    ...over,
  }
}

describe('what a call costs', () => {
  it('charges input and output at their own prices', () => {
    // Opus 5 is $5 per million in, $25 per million out. Three thousand in
    // and one thousand out is a cent and a half plus two and a half.
    const micros = costMicrosOf('claude-opus-5', {
      input_tokens: 3000,
      output_tokens: 1000,
    })
    expect(micros).toBe(3000 * 5 + 1000 * 25)
    expect(showMicros(micros)).toBe('$0.04')
  })

  it('charges a cached read at a tenth, which is why the prompt is built stable-first', () => {
    const cold = costMicrosOf('claude-opus-5', { input_tokens: 10_000, output_tokens: 100 })
    const warm = costMicrosOf('claude-opus-5', {
      input_tokens: 0,
      cache_read_input_tokens: 10_000,
      output_tokens: 100,
    })
    expect(warm).toBeLessThan(cold)
    expect(warm - 100 * 25).toBe(Math.ceil(10_000 * 5 * 0.1))
  })

  it('charges writing to the cache a quarter more than reading it cold', () => {
    const write = costMicrosOf('claude-opus-5', { cache_creation_input_tokens: 1000 })
    expect(write).toBe(Math.ceil(1000 * 5 * 1.25))
  })

  it('assumes the dearest price for a model it does not recognise', () => {
    // Under-reporting your own cost is the one direction that lets a bad
    // margin hide, so an unknown model is priced as an expensive one.
    const unknown = costMicrosOf('some-model-shipped-last-tuesday', { input_tokens: 1000 })
    const opus = costMicrosOf('claude-opus-5', { input_tokens: 1000 })
    expect(unknown).toBe(opus)
  })

  it('costs nothing when nothing was sent', () => {
    expect(costMicrosOf('claude-opus-5', {})).toBe(0)
  })

  it('says "free" rather than "$0.00", because a rule check really is free', () => {
    expect(showMicros(0)).toBe('free')
    expect(showMicros(null)).toBe('—')
  })

  it('shows four decimals on a call too cheap for two', () => {
    expect(showMicros(400)).toBe('$0.0004')
  })
})

describe('the number: what one submission costs', () => {
  it('divides everything spent by the submissions that came out', () => {
    const runs = [{ costMicros: 40_000 }, { costMicros: 20_000 }, { costMicros: 0 }]
    expect(costPerSubmission(runs, 3)).toBe(20_000)
  })

  it('counts a free rule check as a zero rather than skipping it', () => {
    // Half the work here is arithmetic. A ledger that only counts the
    // expensive half makes the cheap half invisible, and the cheap half is
    // where the margin comes from.
    expect(costPerSubmission([{ costMicros: 0 }, { costMicros: 100 }], 1)).toBe(100)
  })

  it('says nothing rather than dividing by zero submissions', () => {
    expect(costPerSubmission([{ costMicros: 40_000 }], 0)).toBeNull()
  })
})

describe('is it falling', () => {
  it('says how much cheaper this week was', () => {
    expect(trend(6200, 10_000)).toBe('down 38% on last week')
  })

  it('says when it went the wrong way', () => {
    expect(trend(11_200, 10_000)).toBe('up 12% on last week')
  })

  it('says plainly when nothing moved', () => {
    expect(trend(10_000, 10_000)).toBe('no change on last week')
  })

  it('says nothing at all in the first week, rather than inventing a baseline', () => {
    expect(trend(10_000, null)).toBeNull()
    expect(trend(10_000, 0)).toBeNull()
  })
})

describe('how much the rules threw away before anything was paid for', () => {
  it('reports the share of the bench that never reached the model', () => {
    // Two hundred considered, thirty scored — the rules did 85% of the work
    // for nothing. That gap is the margin.
    const runs = [
      row({ consideredCount: 100, scoredCount: 15 }),
      row({ consideredCount: 100, scoredCount: 15 }),
    ]
    const r = filterRate(runs)
    expect(r.considered).toBe(200)
    expect(r.kept).toBe(30)
    expect(r.percent).toBe(85)
  })

  it('shows a filter that has quietly stopped filtering as a low number', () => {
    // This is the failure it exists to catch: everything gets scored, the
    // bill triples, and nothing else on any screen changes.
    expect(filterRate([row({ consideredCount: 200, scoredCount: 200 })]).percent).toBe(0)
  })

  it('ignores runs that did no filtering, instead of counting them as zero', () => {
    expect(filterRate([row(), row()]).percent).toBeNull()
  })
})

describe('which agent to fix first', () => {
  it('ranks by what it costs, not by how often it fails', () => {
    // An agent that fails cheaply and retries is fine. One that succeeds
    // expensively every time is the bill.
    const runs = [
      row({ agent: 'cheap.but.flaky', verdict: 'FAIL', costMicros: 100 }),
      row({ agent: 'cheap.but.flaky', verdict: 'FAIL', costMicros: 100 }),
      row({ agent: 'cheap.but.flaky', verdict: 'PASS', costMicros: 100 }),
      row({ agent: 'quiet.and.dear', verdict: 'PASS', costMicros: 90_000 }),
    ]
    expect(worstOffender(runs)!.agent).toBe('quiet.and.dear')
  })

  it('names nobody when everything so far was free', () => {
    expect(worstOffender([row({ costMicros: 0 })])).toBeNull()
  })
})

describe('how often an agent gets it right first time', () => {
  it('is a hundred percent when nothing needed a second go', () => {
    expect(firstTimeRate([row({ agent: 'a' }), row({ agent: 'b' })])).toBe(100)
  })

  it('falls when a loop keeps having to fix itself', () => {
    // A loop that habitually takes three attempts is not a loop. It is a
    // prompt that does not work, being paid for three times.
    const runs = [
      row({ agent: 'good' }),
      row({ agent: 'bad', attempt: 1 }),
      row({ agent: 'bad', attempt: 2 }),
      row({ agent: 'bad', attempt: 3 }),
    ]
    expect(firstTimeRate(runs)).toBe(50)
  })

  it('says nothing when nothing has run', () => {
    expect(firstTimeRate([])).toBeNull()
  })
})
