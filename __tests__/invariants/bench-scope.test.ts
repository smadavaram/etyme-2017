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

describe('the bench page reaches both scopes the API has always had', () => {
  it('offers a Your team / Your network toggle', () => {
    expect(PAGE).toContain("label: 'Your team'")
    expect(PAGE).toContain("label: 'Your network'")
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
