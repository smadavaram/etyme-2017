import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Founder report, verbatim: "Gsa have need to see their internal team
 * branch and external vendor bench."
 *
 * The split already existed one layer down — /api/bench has carried
 * scope=company (your own team) and scope=network (a partner's
 * marketing-tier listings, gated on an active counterparty) since
 * before this was asked for. The bench page just never asked for
 * anything but scope=company, so the API's other half was unreachable
 * from any screen. This pins that the page now reaches both, and that
 * the wall between them — a partner's RETAINED bench stays private,
 * a company with no partners sees an honest empty state rather than a
 * wall error — is still enforced where it always was: the API, not
 * the page.
 */

const PAGE = readFileSync(
  join(__dirname, '../../src/app/dashboard/bench/page.tsx'),
  'utf8'
)
const API = readFileSync(
  join(__dirname, '../../src/app/api/bench/route.ts'),
  'utf8'
)

describe('the bench page reaches every scope the API has', () => {
  it('offers three benches, and names the consent behind each', () => {
    // Renamed 2026-09-26 when the payroll scope landed. "Your team" was
    // one label doing two jobs: at a staffing vendor it meant the people
    // who granted a listing, and at an integrator the reader expected the
    // people it employs — who were on no screen at all. Three labels now,
    // one per consent.
    //
    // Renamed again 2026-09-30, in the founder's words: a firm's own
    // people are "Our bench" and a partner's are "Partner bench". The
    // firm's own come by two consents, and each tab still names which.
    expect(PAGE).toContain("label: 'Our bench \\u00b7 listed'")
    expect(PAGE).toContain("label: 'Our bench \\u00b7 employed'")
    expect(PAGE).toContain("label: 'Partner bench'")
    for (const retired of ["'On your bench'", "'On your payroll'", "'Your network'", 'Received bench', 'Bench wanted']) {
      expect(PAGE.includes(`label: ${retired}`), retired).toBe(false)
    }
  })

  it('a firm sees the people it employs even where none of them has agreed to be marketed', () => {
    expect(PAGE).toContain("'payroll'")
    expect(PAGE).toContain('RosterSurface')
    // The roster is its own shape, never a listing with a tier bolted on.
    expect(PAGE).toContain('body.data?.roster')
  })

  it('a roster never offers to put forward somebody who has granted no listing', () => {
    const roster = PAGE.slice(PAGE.indexOf('function RosterSurface'), PAGE.indexOf('// ── Bench burn panel'))
    // No bulk Share and no bulk Submit on a list of people who consented
    // to nothing. The refusal is a sentence, never a dead control.
    expect(roster).not.toContain('bulkActions')
    expect(roster).toContain('marketSays')
    expect(roster).toContain('onNeedsListing')
  })

  it('an integrator opens on its own payroll, because that is where its people are', () => {
    expect(PAGE).toContain("companyKind === 'GSI'")
    expect(PAGE).toContain("? 'payroll'")
  })

  it('actually asks the API for both scopes, not just company', () => {
    // The old bug: fetchBench was hardcoded to scope=company, so no UI
    // control could have reached scope=network even if one existed.
    expect(PAGE).not.toContain("fetch('/api/bench?scope=company')")
    expect(PAGE).toMatch(/fetch\(`\/api\/bench\?scope=\$\{.*\}`\)/)
  })

  it('shows which supplier a network row belongs to', () => {
    expect(PAGE).toContain('companyName')
    expect(PAGE).toContain("label: 'Supplier'")
  })

  it('tells a company with no partners why the network view is empty, not just that it is', () => {
    expect(PAGE).toContain('Add a firm under Your suppliers')
  })

  it('never lets a slower response for the old tab overwrite the tab that\'s open now', () => {
    // Clicking the two tabs in quick succession fires two requests; only
    // the one for whichever tab is open when it resolves is allowed to
    // write state, not whichever happened to answer first.
    expect(PAGE).toContain('requestId')
    expect(PAGE).toContain('thisRequest !== requestId.current')
  })

  it('always returns to your own bench after adding to it, whichever view was open', () => {
    // Adding a listing always adds to your own bench — switching the
    // visible scope back to it is how the new row is somewhere the
    // person who just added it can actually see.
    const created = PAGE.slice(PAGE.indexOf('function handleListingCreated'))
    expect(created).toContain("setScope('company')")
  })
})

describe('the network scope the page now reaches is still the one the API locks down', () => {
  it('only ever returns MARKETING-tier listings for scope=network', () => {
    const networkBlock = API.slice(API.indexOf("scope === 'network'"))
    expect(networkBlock).toContain("where.tier = 'MARKETING'")
  })

  it('requires an active counterparty relationship, not just being on the platform', () => {
    const networkBlock = API.slice(API.indexOf("scope === 'network'"))
    expect(networkBlock).toContain('prisma.counterparty.findMany')
    expect(networkBlock).toContain("status: 'ACTIVE'")
  })

  it('checks the outside-access wall before running the query, not after', () => {
    const networkBlock = API.slice(API.indexOf("scope === 'network'"), API.indexOf('const [mine, theirs]'))
    expect(networkBlock).toContain('maySeeOutside')
  })

  it('logs access to every other company\'s person it returns', () => {
    expect(API).toContain('TALENT_VIEW_ANON')
    expect(API).toContain('logBulkAccess')
  })
})
