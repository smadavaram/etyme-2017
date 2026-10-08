import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mayBrowseBench, benchClosedSays, benchPageClosed, notAtACompany } from '@/lib/bench-filter'
import { notYoursToRead } from '@/lib/releasing-soon'

/**
 * Sign-up walk, round six (docs/results/2026-10-08-signup-round-6.md),
 * supply's parts: 14 (Supplier scorecards said one refusal three times,
 * Consultants drew its toolbar while loading, and the client's Bench page
 * told a seat with no desk to press a button it cannot reach) and 9 (a
 * candidate signed in at no company read system phrases and a firm she
 * does not have).
 *
 * Pages are read at source, in the style of signup-round-5-supply: the
 * behavior lives in client components with no handler to call.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** What ships: comments quote the old words on purpose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('14 · Supplier scorecards says a refusal once', () => {
  const page = code(read('src/app/dashboard/scorecards/page.tsx'))

  it('when all three of its doors refuse the seat, the page draws the one sentence alone, before any Standing, Concentration or Scored heading', () => {
    const gate = page.indexOf('if (refused) {')
    expect(gate).toBeGreaterThan(-1)
    expect(page).toContain('const refused = doors.scored && doors.risk && doors.shape ? doors.scored : null')
    expect(gate).toBeLessThan(page.indexOf('<p className="eyebrow">Standing</p>'))
    expect(gate).toBeLessThan(page.indexOf('<p className="eyebrow">Concentration</p>'))
    expect(gate).toBeLessThan(page.indexOf('<p className="eyebrow">Scored</p>'))
  })

  it('each of the three doors records its own refusal from a 403, so one door refusing never blanks the other two', () => {
    for (const door of ['scored', 'risk', 'shape']) {
      expect(page).toContain(`said('${door}', String(refusal))`)
      expect(page).toContain(`said('${door}', null)`)
    }
  })

  it('nothing but a loading line is drawn until every door has answered', () => {
    const wait = page.indexOf('if (!answered) {')
    expect(wait).toBeGreaterThan(-1)
    expect(wait).toBeLessThan(page.indexOf('if (refused) {'))
    expect(wait).toBeLessThan(page.indexOf('Suppliers, and what they cost you if they stop'))
  })

  it('a door that failed for another reason still counts as answered, so the page is never held on Loading', () => {
    const catches = page.split('} catch (err: any) {').slice(1)
    expect(catches).toHaveLength(3)
    for (const c of catches) expect(c.slice(0, 120)).toMatch(/said\('(scored|risk|shape)', null\)/)
  })
})

describe('14 · Consultants draws nothing until its first read', () => {
  const page = code(read('src/app/dashboard/consultants/page.tsx'))

  it('before the door has answered once, the page is a loading line: no Add consultant and no Feed, Table or Export toolbar', () => {
    const wait = page.indexOf('if (!firstRead) {')
    expect(wait).toBeGreaterThan(-1)
    expect(wait).toBeLessThan(page.lastIndexOf('Add consultant'))
    expect(wait).toBeLessThan(page.indexOf('<ListSurface<Consultant>'))
    expect(page).toContain('setFirstRead(true)')
  })

  it('the first answer is recorded whatever it was, so a refusal or a failure is never stuck behind Loading', () => {
    const fin = page.indexOf('} finally {', page.indexOf("await fetch('/api/consultants')"))
    expect(page.slice(fin, fin + 120)).toContain('setFirstRead(true)')
  })
})

describe('14 · a client seat with no desk is refused the bench, not given an instruction it cannot follow', () => {
  it('a client seat that opens no job request reads that job requests are not part of its seat, and nothing about Find matches', () => {
    const v = mayBrowseBench({ companyKind: 'CLIENT', scope: 'company', opensJobRequests: false, companyName: 'Northbend Athletic' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.says).toBe(
      'A bench is a supplier’s own people, and a client does not browse one. Bench reaches Northbend Athletic ' +
        'through matching on its job requests, and job requests are not part of your seat. Ask your company’s owner if you need them.'
    )
    expect(v.says).not.toMatch(/Find matches|press|open a job request/)
  })

  it('a client desk that does open job requests is still sent to Find matches on one', () => {
    const v = mayBrowseBench({ companyKind: 'CLIENT', scope: 'company', opensJobRequests: true })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('press Find matches')
  })

  it('the Bench page asks whether the reader opens job requests, once the session has answered', () => {
    const page = code(read('src/app/dashboard/bench/page.tsx'))
    expect(page).toContain("opensJobRequests: session.loading ? undefined : hasPermission(session.permissions, 'requirements.read'),")
  })

  it('the client’s Bench header no longer repeats a promise above the refusal', () => {
    const page = code(read('src/app/dashboard/bench/page.tsx'))
    expect(page).not.toContain('Bench reaches you through matching on your job requests.')
  })
})

describe('9 · somebody signed in at no company reads whose page it is, in a sentence', () => {
  it('the sentence says it is a company’s, that she is not signed in at one, and where her own work is', () => {
    expect(notAtACompany('bench')).toBe(
      'This is a company’s bench, and you are not signed in at a company. Your own work is under Your work.'
    )
  })

  it('the bench refusal names no firm she does not have: no "the bench at your firm", no "Your seat is not one of them"', () => {
    const says = benchClosedSays(null)
    expect(says).toBe(notAtACompany('bench'))
    expect(says).not.toMatch(/your firm|Your seat/)
    expect(benchClosedSays('Pellwright Validation Partners')).toContain('The bench at Pellwright Validation Partners')
  })

  it('a page read by a firm’s desks tells her it is a company’s page rather than naming "your firm"', () => {
    const says = notYoursToRead('Supplier scorecards', null)
    expect(says).toBe('Supplier scorecards is a company’s page, and you are not signed in at a company. Your own work is under Your work.')
    expect(says).not.toContain('your firm')
  })

  it('no supply route answers a caller with no company in a system phrase or a fragment', () => {
    const routes = [
      'src/app/api/consultants/route.ts',
      'src/app/api/consultants/[id]/route.ts',
      'src/app/api/bench/route.ts',
      'src/app/api/bench/share/route.ts',
      'src/app/api/bench/burn/route.ts',
      'src/app/api/bench/listings/route.ts',
      'src/app/api/bench/listings/[id]/route.ts',
      'src/app/api/bench/wants/route.ts',
      'src/app/api/rolloff/route.ts',
      'src/app/api/releasing-soon/route.ts',
    ]
    for (const f of routes) {
      const src = code(read(f))
      expect(src, f).not.toContain('Active context must be associated with a company')
      expect(src, f).not.toContain("'No company context'")
      expect(src, f).not.toContain('This is a company’s view of the market\'')
      expect(src, f).not.toContain('belongs to a company')
      expect(src, f).not.toContain('belongs to a firm')
      expect(src, f).not.toContain("?? 'your firm')")
    }
  })

  it('the Bench page draws the no-company sentence alone, with no "People who granted you a listing" over it', () => {
    // Since round seven the page asks benchPageClosed, which answers the
    // no-company sentence first; the sentence is drawn alone above the header.
    const page = code(read('src/app/dashboard/bench/page.tsx'))
    const gate = page.indexOf('if (closed) {')
    expect(gate).toBeGreaterThan(-1)
    expect(page).toContain('company: session.company ?? null,')
    expect(gate).toBeLessThan(page.indexOf('People who granted you a listing'))
    expect(benchPageClosed({ loading: false, company: null, client: { ok: true }, readsBench: true, readsProfit: true }))
      .toBe(benchClosedSays(null))
  })
})
