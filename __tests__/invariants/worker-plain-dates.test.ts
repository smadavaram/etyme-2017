import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sentOnTo } from '@/lib/holds'
import { raisedSays } from '@/lib/data-request'
import { verdictFor } from '@/lib/retention'
import { HELD } from '@/lib/legal'

/**
 * A worker reads a day as "Jun 1, 2026", never as "2026-06-01". Two
 * sentences still printed the machine's form on 2026-09-30: where a
 * submission went next on /dashboard/my-benches, and "It runs on …" on
 * /dashboard/my-data. A third was found on the way — the reasons the
 * worker's own data page gives for what is kept, which said "kept until
 * 2033-01-01".
 */

const ISO_DAY = /\b\d{4}-\d{2}-\d{2}\b/

describe('no sentence a worker reads carries an ISO date', () => {
  it('where a submission went next reads as a plain date', () => {
    const went = sentOnTo({
      onward: { company: 'Auralis Software', on: new Date('2026-06-01T15:00:00Z') },
      emailed: null,
    })
    expect(went).toBe('Auralis Software on Jun 1, 2026')
    expect(went).not.toMatch(ISO_DAY)
  })

  it('a submission emailed on reads as a plain date, and names the client where no address was kept', () => {
    expect(sentOnTo({ onward: null, emailed: { to: 'hm@client.example', on: new Date('2026-06-01T00:00:00Z') } }))
      .toBe('emailed to hm@client.example on Jun 1, 2026')
    expect(sentOnTo({ onward: null, emailed: { to: null, on: new Date('2026-06-01T00:00:00Z') } }))
      .toBe('emailed to the client on Jun 1, 2026')
  })

  it('a submission still with whoever has it says nothing rather than a made-up date', () => {
    expect(sentOnTo({ onward: null, emailed: null })).toBeNull()
  })

  it('the day is the UTC day the record holds, late at night as much as at noon', () => {
    // 23:30 UTC on the 1st is the 1st, whatever zone printed it.
    expect(sentOnTo({ onward: { company: 'X', on: new Date('2026-06-01T23:30:00Z') }, emailed: null }))
      .toBe('X on Jun 1, 2026')
  })

  it('a person who asked to be forgotten is told the day it runs as a plain date', () => {
    const says = raisedSays('ERASURE', new Date('2026-10-03T00:00:00Z'))
    expect(says).toBe('Nothing has changed yet. It runs on Oct 3, 2026, and you can stop it any time before then.')
    expect(says).not.toMatch(ISO_DAY)
  })

  it('an erasure with no run day recorded says where to look rather than inventing one', () => {
    const says = raisedSays('ERASURE', null)
    expect(says).not.toMatch(ISO_DAY)
    expect(says).not.toContain('undefined')
    expect(says).not.toContain('null')
  })

  it('what the worker\'s own data page says is kept, and until when, carries no ISO date', () => {
    const facts = {
      now: new Date('2026-09-30T00:00:00Z'),
      hiredAt: new Date('2024-01-15T00:00:00Z'),
      employmentEndedAt: new Date('2026-03-31T00:00:00Z'),
      lastPaidAt: new Date('2026-04-15T00:00:00Z'),
      lastWorkedAt: new Date('2026-03-31T00:00:00Z'),
    }
    let dated = 0
    for (const { category } of HELD) {
      const v = verdictFor(category, facts)
      expect(v.says, category).not.toMatch(ISO_DAY)
      if (v.until) dated++
    }
    // The sweep proves something only if some sentences carried a day.
    expect(dated).toBeGreaterThan(0)
  })

  it('the two routes that build these sentences no longer print a day with toISOString', () => {
    const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')
    const inSentence = /\$\{[^}]*toISOString\(\)\.slice\(0, 10\)\}/
    expect(src('app/api/me/data/route.ts')).not.toMatch(inSentence)
    expect(src('lib/holds.ts')).not.toMatch(inSentence)
  })
})
