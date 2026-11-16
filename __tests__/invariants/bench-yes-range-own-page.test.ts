import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/app/api/ar/book', () => ({ loadBook: vi.fn() }))

import { rateSavedSays, whenFree, sampleRowSays } from '@/lib/bench-filter'
import { resendListingId } from '@/lib/consultant-portfolio/bench-invites'
import { alreadyKept } from '@/lib/consultant-portfolio/already-kept'
import { benchSpan, type OwnLine } from '@/app/api/today/reads'
import { benchSpell } from '@/lib/bench-profit'

/**
 * Layer four of the fix list, the bench's own share (2026-11-16).
 * The route-level proof is __integration__/bench-yes-range-own-page.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const MY_BENCHES = read('src/app/dashboard/my-benches/page.tsx')
const MY_BENCHES_ROUTE = read('src/app/api/me/benches/route.ts')
const CANDIDATES = read('src/app/dashboard/consultants/page.tsx')

describe('her own My benches page shows the range she is saying yes to', () => {
  it('her own page reads the range through the same reader as the emailed link, never a copy', () => {
    expect(MY_BENCHES_ROUTE).toContain("import { inviteRange } from '@/app/api/bench-invite/[token]/terms'")
    expect(MY_BENCHES_ROUTE).toContain('inviteRange(l, l.company, ownFloor)')
    // Her own lowest rate, read for the person signed in and nobody else.
    expect(MY_BENCHES_ROUTE).toContain('where: { personId: person.id }, select: { rateFloor: true }')
  })

  it('the range and the below-her-lowest-rate sentence are drawn above the yes', () => {
    const range = MY_BENCHES.indexOf('{a.range.says}')
    const below = MY_BENCHES.indexOf('{a.range.belowFloor}')
    const yes = MY_BENCHES.indexOf("'Yes, market me on these terms'")
    expect(range).toBeGreaterThan(0)
    expect(below).toBeGreaterThan(range)
    expect(yes).toBeGreaterThan(below)
  })
})

describe('a rate saved on a listing says what she has said to the firm', () => {
  const said = '$80–$90 an hour'
  it('before her yes, it says she has not answered yet, by the name the firm typed', () => {
    expect(rateSavedSays({ state: 'INVITED', revokedAt: null }, 'M. Quintero', said))
      .toBe('M. Quintero has not answered yet. The rate on your ask is now $80–$90 an hour.')
  })

  it('only somebody who said yes reads as already on your bench', () => {
    expect(rateSavedSays({ state: 'GRANTED', revokedAt: null }, 'Ana Ruiz', said))
      .toBe('Ana Ruiz is already on your bench. Their rate is now $80–$90 an hour.')
    expect(rateSavedSays({ state: 'DECLINED', revokedAt: null }, 'Ana Ruiz', said)).not.toContain('already on your bench')
    expect(rateSavedSays({ state: 'GRANTED', revokedAt: new Date() }, 'Ana Ruiz', said)).not.toContain('already on your bench')
  })
})

describe('Candidates offers nothing to send to a sample person, as Bench does', () => {
  const asked = { standing: 'ASKED', listings: [{ id: 'l1', consent: 'INVITED' }] }
  it('a sample person’s row offers no Resend', () => {
    expect(resendListingId({ ...asked, sample: true }, true)).toBeNull()
    expect(resendListingId({ ...asked, sample: false }, true)).toBe('l1')
  })

  it('the row says why there is nothing to send, in the words Bench uses', () => {
    expect(CANDIDATES).toContain('{sampleRowSays(row.name)}')
    expect(CANDIDATES).toContain("row.standing === 'ASKED' && !offersSend(row)")
  })

  it('Add consultant’s already-here line offers no Resend for a sample person, and says why', () => {
    const row = { id: 'c1', name: 'Mara Quill', email: 'mara@harborline-tech.example', ...asked, sample: true }
    const m = alreadyKept('mara@harborline-tech.example', [row], true)
    expect(m?.act).toBe('OPEN')
    expect(m?.listingId).toBeNull()
    expect(m?.says).toBe(`You already asked Mara Quill. ${sampleRowSays('Mara Quill')}`)
    expect(m?.says).toBe('You already asked Mara Quill. Mara is a sample person. No email can reach them, so there is nothing to send.')
  })
})

describe('an ended placement whose last day is still ahead (an end recorded before the real last day was kept)', () => {
  const DAY = 86_400_000
  const lastDay = new Date(Date.UTC(2031, 4, 20))
  const line: OwnLine = { id: 'ended-ahead', state: 'ENDED', startDate: new Date(Date.UTC(2031, 0, 5)), endDate: lastDay }
  const joined = new Date(Date.UTC(2030, 11, 1))
  const at = (now: Date) => ({
    today: benchSpell({ joinedBench: joined, lines: [benchSpan(line)!], now }).kind === 'NOW',
    bench: whenFree({ lines: [], lastEnded: lastDay, availableFrom: null, onBenchSince: joined, now }),
  })

  it('Bench reads her free from the day after it, the same day Today puts her back on the bench', () => {
    const before = at(new Date(lastDay.getTime() - 3 * DAY + 15 * 3_600_000))
    expect(before.today).toBe(false)
    expect(before.bench.state).toBe('FROM')
    expect(before.bench.on).toBe('2031-05-21')

    const onTheLastDay = at(new Date(lastDay.getTime() + 15 * 3_600_000))
    expect(onTheLastDay.today).toBe(false)
    expect(onTheLastDay.bench.on).toBe('2031-05-21')

    const dayAfter = at(new Date(lastDay.getTime() + DAY + 9 * 3_600_000))
    expect(dayAfter.today).toBe(true)
    expect(dayAfter.bench.state).toBe('NOW')
  })
})
