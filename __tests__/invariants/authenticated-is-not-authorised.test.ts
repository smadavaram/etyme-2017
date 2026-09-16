import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
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
 *
 * The distribute hole had a second cause worth naming, because it is the
 * one that will happen again: there were two routes that put a role in
 * front of suppliers. One grew the gates as the governance was built and
 * the other was left where it started, and the screen called the one
 * that had been left. Two routes doing one job do not stay in step — the
 * older simply stops being maintained, and nothing says so. There is one
 * now, and the last test here fails if a second appears.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const DISTRIBUTE = read('src/app/api/requisitions/[id]/distribute/route.ts')
const REQUIREMENTS_PAGE = read('src/app/dashboard/requirements/[id]/page.tsx')
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
    expect(DISTRIBUTE).toMatch(/caller\.company\?\.id !== requisition\.companyId/)
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

  it('checks who is calling before it says anything about the requisition', () => {
    // Otherwise a stranger reads another company's approval state off the
    // refusal it gets back.
    const forbidden = DISTRIBUTE.indexOf('caller.company?.id !== requisition.companyId')
    const notApproved = DISTRIBUTE.indexOf("code: 'NOT_APPROVED'")
    expect(forbidden).toBeGreaterThan(-1)
    expect(notApproved).toBeGreaterThan(forbidden)
  })

  it('will not send an invitation that expired before it was read', () => {
    expect(DISTRIBUTE).toContain('expiresAt must be a date in the future')
  })
})

describe('one route puts a role in front of suppliers, not two', () => {
  it('the requirements path no longer has a distribute route of its own', () => {
    // It was the ungoverned twin: same job, none of the gates, and it was
    // the one the screen called.
    expect(existsSync(join(process.cwd(), 'src/app/api/requirements/[id]/distribute/route.ts'))).toBe(false)
  })

  it('the screen that sends a role out calls the governed route', () => {
    expect(REQUIREMENTS_PAGE).toContain('/api/requisitions/${requirementId}/distribute')
    expect(REQUIREMENTS_PAGE).not.toContain('/api/requirements/${requirementId}/distribute')
  })

  it('sends a band per supplier, because each may be offered a different one', () => {
    expect(REQUIREMENTS_PAGE).toContain('vendors:')
    expect(REQUIREMENTS_PAGE).not.toContain('toCompanyIds')
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

// ── The sweep ────────────────────────────────────────────────────────
//
// Six routes of this exact shape have been found by three separate
// audits, one at a time, each after it had been live for weeks. Fixing
// them individually has not stopped a seventh being written, because
// nothing says the shape is wrong — `getSessionEmail` is an ordinary
// export and reaching for it looks like authentication being done.
//
// So the whole API is read here instead. A route may use it only if it
// is named below with a reason. A new one fails this test on the commit
// that adds it, which is the only moment the cost of fixing it is small.

/** About the caller themselves, or before they have a company at all. */
const SELF_SCOPED = [
  'me/route.ts',
  'me/benches/route.ts',
  'me/context/route.ts',
  'me/portfolio/route.ts',
  'me/portfolio/write/route.ts',
  // Claiming a seat from a mailed token, and opening the first company:
  // both happen before there is a company to be scoped to.
  'claim/[token]/route.ts',
  'onboarding/route.ts',
]

/**
 * Some handlers in these files already take the caller's company; at
 * least one does not. Narrower than a hole and wider than correct.
 */
const PART_SCOPED = [
  'companies/route.ts',
  'requirements/route.ts',
  'submissions/route.ts',
]

/**
 * Not yet looked at. Every one of these reads only a session and then
 * works on a record fetched by id, which is the shape that produced all
 * six holes. None is known to be exploited; none is known to be safe.
 * This list may shrink and must never grow.
 */
const TO_REVIEW = [
  'companies/[id]/locations/route.ts',
  'companies/[id]/template-pack/route.ts',
  'imports/route.ts',
  'imports/[id]/commit/route.ts',
  'imports/[id]/mapping/route.ts',
  'imports/[id]/rows/route.ts',
  'imports/[id]/rows/[rowId]/route.ts',
  'market/leads/route.ts',
  'requirements/parse/route.ts',
  'rolloff/[id]/claim/route.ts',
]

function routesUnder(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'route.ts') out.push(full)
    }
  }
  walk(dir)
  return out
}

describe('signing somebody in is not the same as working out what they may do', () => {
  const apiDir = join(process.cwd(), 'src/app/api')
  const usingSessionOnly = routesUnder(apiDir)
    .filter((f) => readFileSync(f, 'utf8').includes('getSessionEmail'))
    .map((f) => relative(apiDir, f).split(sep).join('/'))
    .sort()

  const named = new Set([...SELF_SCOPED, ...PART_SCOPED, ...TO_REVIEW])

  it('no route reads only a session without being named and accounted for', () => {
    const unaccounted = usingSessionOnly.filter((r) => !named.has(r))
    expect(
      unaccounted,
      'These routes identify the caller but never work out what they are allowed to do. ' +
        'Take the company and the permissions from getCallerContext, or add the route to ' +
        'SELF_SCOPED with the reason it does not need them:\n  ' +
        unaccounted.join('\n  ')
    ).toEqual([])
  })

  it('the backlog of unreviewed routes never grows', () => {
    const stillOpen = usingSessionOnly.filter((r) => TO_REVIEW.includes(r))
    expect(stillOpen.length).toBeLessThanOrEqual(TO_REVIEW.length)
  })

  it('a route that has been fixed is struck off the list rather than left on it', () => {
    // A name left behind after the fix makes the backlog read as longer
    // than it is, and the next reader trusts the list less.
    const stale = [...TO_REVIEW, ...PART_SCOPED].filter((r) => !usingSessionOnly.includes(r))
    expect(stale, `Fixed — remove from the list:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('the three money routes an audit found are off the list for good', () => {
    expect(usingSessionOnly).not.toContain('contracts/route.ts')
    expect(usingSessionOnly).not.toContain('contracts/[id]/extend/route.ts')
    expect(usingSessionOnly).not.toContain('contracts/[id]/rolloff/route.ts')
  })
})

describe('writing a contract is the company that bills it, holding the permission', () => {
  const CONTRACTS = read('src/app/api/contracts/route.ts')
  const EXTEND = read('src/app/api/contracts/[id]/extend/route.ts')
  const ROLLOFF = read('src/app/api/contracts/[id]/rolloff/route.ts')

  it('refuses a caller writing a contract for a company that is not theirs', () => {
    expect(CONTRACTS).toMatch(/caller\.company\?\.id !== companyId/)
    expect(CONTRACTS).toContain('cannot write one for another firm')
  })

  it('refuses a seat without assignments.write, naming the permission', () => {
    expect(CONTRACTS).toContain("hasPermission(caller.permissions, 'assignments.write')")
  })

  it('refuses a stranger extending somebody else\'s placement', () => {
    expect(EXTEND).toContain('contractSide')
    expect(EXTEND).toContain("code: 'NOT_A_PARTY'")
    expect(EXTEND).toContain("hasPermission(caller.permissions, 'assignments.write')")
  })

  it('refuses a stranger rolling somebody off, and asks the permission that ends a contract', () => {
    expect(ROLLOFF).toContain('contractSide')
    expect(ROLLOFF).toContain("code: 'NOT_A_PARTY'")
    expect(ROLLOFF).toContain("hasPermission(caller.permissions, 'assignments.terminate')")
  })
})
