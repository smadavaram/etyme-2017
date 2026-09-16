import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { daysOnSite } from '@/lib/tenure-days'

/**
 * Signed in is not the same as allowed.
 *
 * A security and governance audit of every route found three that asked
 * only whether somebody held a session, and then acted on a record they
 * fetched by id with no company on the query. Authentication had been
 * mistaken for authorisation. Each one let any account at any company
 * act on any other company's records:
 *
 *   - distributing a requirement put another firm's role in front of
 *     suppliers of the caller's choosing, and skipped the approval chain
 *     and the supplier panel on the way past
 *   - moving a submission's status placed or rejected anybody's
 *     candidate on anybody's role, and PLACED is the word that writes
 *     contracts and starts the billing
 *   - a rolloff checklist let a stranger mark another firm's access
 *     revoked and its final timesheet in
 *
 * The tell is the same in all three: `getSessionEmail()` where the rest
 * of the app uses `getCallerContext()`, which carries the company and
 * the permissions the refusals are written against. So the rule is
 * stated once here, over the routes themselves, rather than three times
 * in three files nobody reads together.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const DISTRIBUTE = read('src/app/api/requirements/[id]/distribute/route.ts')
const SUBMISSION_STATUS = read('src/app/api/submissions/[id]/status/route.ts')
const ROLLOFF_CHECKLIST = read('src/app/api/rolloff/[id]/checklist/route.ts')
const VISA_WATCH = read('src/app/api/cron/visa-watch/route.ts')
const ASK_BACK = read('src/app/api/alumni/ask-back/route.ts')
const ACCESS_LOG = read('src/lib/access-log.ts')
const RATE_HISTORY = read('src/app/api/rate-history/route.ts')
const SUPPLIER_REQUEST = read('src/app/api/supplier-requests/[id]/route.ts')

const ACTING_ROUTES: Array<[string, string]> = [
  ['a requirement being sent to suppliers', DISTRIBUTE],
  ['a submission being moved on', SUBMISSION_STATUS],
  ['a rolloff checklist being ticked', ROLLOFF_CHECKLIST],
]

describe('a route that acts on a record asks who is calling, not just whether anybody is', () => {
  for (const [what, source] of ACTING_ROUTES) {
    it(`${what} reads the caller's company, not just their session`, () => {
      expect(source).toContain('getCallerContext')
    })

    it(`${what} does not settle for knowing an email address`, () => {
      expect(source).not.toContain('getSessionEmail')
    })

    it(`${what} refuses a caller from another company in words`, () => {
      expect(source).toContain("code: 'FORBIDDEN'")
      // Either shape counts: a direct refusal, or the two parties named
      // and everybody else turned away.
      expect(source).toMatch(/caller\.company\?\.id [!=]==/)
    })
  }
})

describe('only the company that raised a requirement may put it in front of suppliers', () => {
  it('refuses a caller whose company did not raise it', () => {
    expect(DISTRIBUTE).toMatch(/caller\.company\?\.id !== requirement\.companyId/)
  })

  it('refuses a desk that does not hold the supplier panel, naming the program office', () => {
    expect(DISTRIBUTE).toContain("'requirements.distribute'")
    expect(DISTRIBUTE).toContain('program office')
  })

  it('refuses a requirement the approval chain has not cleared', () => {
    expect(DISTRIBUTE).toContain('mayDistribute')
    expect(DISTRIBUTE).toContain("code: 'NOT_APPROVED'")
  })

  it('will not widen the release past the suppliers Procurement cleared', () => {
    expect(DISTRIBUTE).toContain('clearedSupplierIds')
    expect(DISTRIBUTE).toContain("code: 'NOT_CLEARED'")
  })

  it('checks who is calling before it says whether the requirement is open', () => {
    // Otherwise a stranger learns a role exists by reading the refusal.
    const forbidden = DISTRIBUTE.indexOf("caller.company?.id !== requirement.companyId")
    const notOpen = DISTRIBUTE.indexOf("code: 'NOT_OPEN'")
    expect(forbidden).toBeGreaterThan(-1)
    expect(notOpen).toBeGreaterThan(forbidden)
  })
})

describe('a submission belongs to the supplier that sent it and the client deciding', () => {
  it('refuses anybody who is neither', () => {
    expect(SUBMISSION_STATUS).toContain('const isSupplier')
    expect(SUBMISSION_STATUS).toContain('const isClient')
    expect(SUBMISSION_STATUS).toContain('!isSupplier && !isClient')
  })

  it('will not let a supplier place its own candidate', () => {
    expect(SUBMISSION_STATUS).toMatch(/status === 'PLACED' && !isClient/)
    expect(SUBMISSION_STATUS).toContain('Only the client can place a candidate')
  })

  it('records who changed it rather than saying it happened via the UI', () => {
    expect(SUBMISSION_STATUS).not.toContain('Status changed via UI')
    expect(SUBMISSION_STATUS).toContain('caller.person.name')
  })
})

describe('time on site is the union of the periods, never their sum', () => {
  it('asking somebody back counts a day once, however many firms billed it', () => {
    expect(ASK_BACK).toContain('daysOnSite')
    expect(ASK_BACK).not.toMatch(/contracts\.reduce\(\(sum/)
  })

  it('counts a person bought through a prime and a sub for the days they were there, not twice', () => {
    const jan = new Date('2026-01-01')
    const jul = new Date('2026-07-01')
    const through = { startDate: jan, endDate: jul }
    // The same person, the same site, the same days, on two rungs.
    expect(daysOnSite([through, { ...through }], jul)).toBe(daysOnSite([through], jul))
  })

  it('still counts two separate stretches separately, and not the gap between them', () => {
    const first = { startDate: new Date('2024-01-01'), endDate: new Date('2024-03-01') }
    const second = { startDate: new Date('2026-01-01'), endDate: new Date('2026-03-01') }
    const now = new Date('2026-03-01')
    expect(daysOnSite([first, second], now)).toBe(
      daysOnSite([first], now) + daysOnSite([second], now)
    )
  })
})

describe('a visa warning is said once, and is not missed because a job did not run', () => {
  it('no longer fires only on the one night a milestone falls exactly', () => {
    expect(VISA_WATCH).not.toMatch(/daysUntilExpiry > m - 1/)
  })

  it('warns on every milestone the petition is already inside', () => {
    expect(VISA_WATCH).toMatch(/MILESTONES\.filter\(\(m\) => daysUntilExpiry <= m\)/)
  })

  it('says the tightest one, because ninety days is stale news at forty-five', () => {
    expect(VISA_WATCH).toContain('Math.min(...crossed)')
  })

  it('reads back what it has already said, so a nightly job does not repeat itself', () => {
    expect(VISA_WATCH).toContain('alreadySaid')
    expect(VISA_WATCH).toMatch(/type: 'VISA_EXPIRY'/)
  })

  it('writes each company its own line, naming only its own people', () => {
    expect(VISA_WATCH).toContain('byCompany')
    expect(VISA_WATCH).not.toContain('petitions[0].personId')
  })
})

describe('the trail is evidence, so a gap in it is an incident', () => {
  it('reports a failed access-log write instead of printing it to a console nobody reads', () => {
    expect(ACCESS_LOG).toContain('reportError')
    expect(ACCESS_LOG).not.toContain('console.error')
  })

  it('says what was lost in a sentence', () => {
    expect(ACCESS_LOG).toContain('is not in the trail')
  })

  it('names whoever verified or waived a supplier item', () => {
    expect(SUPPLIER_REQUEST).toContain("action: 'SUPPLIER_ITEM_MARKED'")
    expect(SUPPLIER_REQUEST).toContain("action: 'SUPPLIER_DECLINED'")
  })
})

describe('a rate belongs to one side of the trade or the other', () => {
  it('refuses a rate history row that is neither a sell nor a buy', () => {
    expect(RATE_HISTORY).toMatch(/contractType !== 'SELL' && contractType !== 'BUY'/)
  })
})
