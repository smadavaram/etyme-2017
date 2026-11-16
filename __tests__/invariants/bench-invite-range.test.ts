import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inviteRange } from '@/app/api/bench-invite/[token]/terms'

/**
 * Her yes page shows the rate range she is saying yes to (founder,
 * 2026-11-16: "go ahead with your recommendations").
 *
 * Before her yes a firm may save any range on its ask, and her lowest
 * rate is never checked then, so the firm cannot learn it by trying rates.
 * So she reads the range before she says yes, and where it is under the
 * lowest rate on her own record she is told so. Only she: the firm holds
 * the same link (Copy link on Bench). The route is walked in
 * `__integration__/bench-invite-range.test.ts`.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/bench-invite/[token]/page.tsx')
const ROUTE = read('src/app/api/bench-invite/[token]/route.ts')
const FIRM = { name: 'Northwind Staffing', homeCurrency: 'USD' }

describe('the rate range on her yes page', () => {
  it('her yes page shows the rate range the firm saved before she says yes', () => {
    expect(inviteRange({ rateMin: 8_000, rateMax: 9_000 }, FIRM, null)).toEqual({
      says: 'Northwind Staffing will put you forward at $80–$90 an hour.',
      belowFloor: null,
    })
    // On the page, above the yes.
    const range = PAGE.indexOf('ask.range.says')
    const yes = PAGE.indexOf("onClick={() => say('ACCEPT')}")
    expect(range).toBeGreaterThan(0)
    expect(range).toBeLessThan(yes)
    // And the route sends it with the ask.
    expect(ROUTE).toMatch(/range: inviteRange\(/)
  })

  it('a range with one end says that end, and a range of one rate says the one rate', () => {
    expect(inviteRange({ rateMin: 8_000, rateMax: null }, FIRM, null)?.says).toBe('Northwind Staffing will put you forward at $80 an hour or more.')
    expect(inviteRange({ rateMin: null, rateMax: 9_000 }, FIRM, null)?.says).toBe('Northwind Staffing will put you forward at up to $90 an hour.')
    expect(inviteRange({ rateMin: 9_000, rateMax: 9_000 }, FIRM, null)?.says).toBe('Northwind Staffing will put you forward at $90 an hour.')
  })

  it('the range reads in the firm\'s own currency, through the one money formatter', () => {
    const said = inviteRange({ rateMin: 7_000, rateMax: 8_550 }, { name: 'Harborline Tech', homeCurrency: 'EUR' }, null)!.says
    expect(said).toBe('Harborline Tech will put you forward at €70–€85.50 an hour.')
    expect(read('src/app/api/bench-invite/[token]/terms.ts')).toMatch(/import \{ compact \} from '@\/lib\/money-display'/)
  })

  it('where no range was saved, nothing is said about a range', () => {
    expect(inviteRange({ rateMin: null, rateMax: null }, FIRM, 9_700)).toBeNull()
    expect(inviteRange({ rateMin: 0, rateMax: 0 }, FIRM, 9_700)).toBeNull()
  })

  it('where the range is below her own lowest rate, she is told before she says yes, and the firm is told nothing', () => {
    // Read as her: the top is under her lowest rate, so she is told, with the figure.
    expect(inviteRange({ rateMin: 8_000, rateMax: 9_000 }, FIRM, 9_700)?.belowFloor).toBe('This is below the lowest rate on your record, $97 an hour, if that rate is in USD.')
    // At or under the top, nothing.
    expect(inviteRange({ rateMin: 8_000, rateMax: 9_000 }, FIRM, 9_000)?.belowFloor).toBeNull()
    // A range with no top is not under anything.
    expect(inviteRange({ rateMin: 8_000, rateMax: null }, FIRM, 9_700)?.belowFloor).toBeNull()
    // The route passes her floor only where the session is hers, and reads the session for every reader alike.
    expect(ROUTE).toMatch(/\(await readerIsHer\(listing\.consultant\.person\.primaryEmail\)\) \? listing\.consultant\.rateFloor : null/)
    // Her floor reaches nothing the firm reads: not the log, not the notice.
    const post = ROUTE.slice(ROUTE.indexOf('export async function POST('))
    expect(post).not.toMatch(/rateFloor|belowFloor/)
    // On the page, her sentence sits above the yes.
    expect(PAGE.indexOf('ask.range.belowFloor')).toBeLessThan(PAGE.indexOf("onClick={() => say('ACCEPT')}"))
  })

  it('her lowest rate carries no currency, so the sentence that says a range is below it names the currency it read her rate in', () => {
    const euros = inviteRange({ rateMin: 7_000, rateMax: 8_000 }, { name: 'Harborline Tech', homeCurrency: 'EUR' }, 9_500)!
    expect(euros.belowFloor).toBe('This is below the lowest rate on your record, €95 an hour, if that rate is in EUR.')
    // Every way the sentence can be said names the currency it read her rate in.
    expect(read('src/app/api/bench-invite/[token]/terms.ts')).toMatch(/an hour, if that rate is in \$\{currency\}\./)
  })
})
