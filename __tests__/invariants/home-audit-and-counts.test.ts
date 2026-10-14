/**
 * The lead route's audit kind and the public site's first-party counts.
 *
 * The home page's audit form (the founder's feedback, 2026-10-10) was
 * deleted with the audit on 2026-10-14 ("Does anyone need the audit
 * form? I think it's useless."). The route still takes the AUDIT kind
 * until the census closes on November 13, 2026 (KNOWN-LIMITS.md), so
 * its checks stay held here; the tests that read the form's own file
 * were deleted with it. The counts record five kinds of click under a
 * random visit id and nothing personal.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { auditProblems, auditAsk, AUDIT_COPY, CONTRACTOR_RANGES } from '@/lib/public-site/leads'
import { readMarketEvent, summarize, MARKET_EVENTS, type MarketEventRow } from '@/lib/public-site/market-events'
import { sizesTheBuyer, unverifiableClaims, promisesAnAccount } from '@/lib/positioning'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ok = { email: 'dana@cavanaugh.example', name: 'Dana Whitfield', companyName: 'Cavanaugh Glassworks', contractorRange: '' }

describe('The lead route’s audit kind, while it stays, asks four short things and records a real lead', () => {

  it('accepts a business email, a name and a company, with the contractor range left blank', () => {
    expect(auditProblems(ok)).toEqual([])
  })

  it('refuses a personal address and says why, quoting what was typed', () => {
    const p = auditProblems({ ...ok, email: 'dana@gmail.com' })
    expect(p.map((x) => x.field)).toEqual(['email'])
    expect(p[0].says).toContain('"dana@gmail.com" is a personal address')
  })

  it('asks for the name and the company when they are missing, each in its own sentence', () => {
    const p = auditProblems({ ...ok, name: ' ', companyName: '' })
    expect(p.map((x) => x.field)).toEqual(['name', 'companyName'])
  })

  it('takes only a contractor range the form offers, and none at all is fine', () => {
    expect(auditProblems({ ...ok, contractorRange: '50–199' })).toEqual([])
    expect(auditProblems({ ...ok, contractorRange: '7 million' }).map((x) => x.field)).toEqual(['contractorRange'])
    expect(CONTRACTOR_RANGES).toEqual(['1–19', '20–49', '50–199', '200–999', '1,000 or more'])
  })

  it('records only what was typed in the lead’s ask, and says when the range was left blank', () => {
    expect(auditAsk({ ...ok, contractorRange: '50–199' })).toBe('Contractor spend audit, asked for on the home page. Contractors: about 50–199.')
    expect(auditAsk(ok)).toBe('Contractor spend audit, asked for on the home page. Contractors: not said.')
  })

  it('the lead route checks an audit ask the same way and stores it as a lead', () => {
    const route = read('src/app/api/market/leads/route.ts')
    expect(route).toContain("body.kind === 'AUDIT'")
    expect(route).toContain('auditProblems(typed)')
    expect(route).toContain('prisma.marketingLead.upsert')
  })

  it('no public page draws the audit form any more', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/public-site/audit-form.tsx'))).toBe(false)
    for (const f of ['src/app/page.tsx', 'src/lib/public-site/skeleton.tsx', 'src/lib/public-site/sub-page.tsx', 'src/lib/public-site/company-page.tsx']) {
      expect(read(f), f).not.toContain('AuditForm')
    }
  })

  it('says what happens next on screen once the ask is stored, and promises only what the census promises', () => {
    expect(AUDIT_COPY.next).toHaveLength(3)
    expect(AUDIT_COPY.next.join(' ')).toContain('five working days')
    const words = Object.values(AUDIT_COPY).flatMap((v) => (typeof v === 'string' ? [v] : [...v])).join(' ')
    expect(unverifiableClaims(words)).toEqual([])
    expect(sizesTheBuyer(words)).toEqual([])
    expect(promisesAnAccount([AUDIT_COPY.button])).toEqual([])
    expect(words).not.toMatch(/24 hours|same day|within an hour/i)
  })
})

describe('The public site counts its own clicks, first-party and with nothing personal', () => {
  const visit = 'a'.repeat(32)

  it('counts the five things a visitor can do, and nothing else', () => {
    expect([...MARKET_EVENTS]).toEqual(['audit_cta_clicked', 'demo_cta_clicked', 'demo_started', 'audit_form_started', 'audit_form_submitted'])
    expect(readMarketEvent({ event: 'audit_cta_clicked', page: '/', visit }).ok).toBe(true)
    expect(readMarketEvent({ event: 'scrolled', page: '/', visit }).ok).toBe(false)
  })

  it('refuses a page with a query string and a visit id that is not the browser’s random hex, so no address can ride in', () => {
    expect(readMarketEvent({ event: 'demo_started', page: '/?email=dana@x.com', visit }).ok).toBe(false)
    expect(readMarketEvent({ event: 'demo_started', page: '/', visit: 'dana@cavanaugh.example' }).ok).toBe(false)
  })

  it('summarizes visits, each count and the share of started forms that were sent, and gives no rate when nobody started one', () => {
    const rows: MarketEventRow[] = [
      { event: 'audit_cta_clicked', page: '/', visit: 'a'.repeat(32) },
      { event: 'audit_form_started', page: '/', visit: 'a'.repeat(32) },
      { event: 'audit_form_submitted', page: '/', visit: 'a'.repeat(32) },
      { event: 'audit_form_started', page: '/', visit: 'b'.repeat(32) },
      { event: 'demo_cta_clicked', page: '/requisitions', visit: 'c'.repeat(32) },
    ]
    const s = summarize(rows, new Date('2026-09-10T00:00:00Z'))
    expect(s.visits).toBe(3)
    expect(s.formCompletion).toBe(50)
    expect(s.events.find((e) => e.event === 'audit_form_started')).toMatchObject({ times: 2, visits: 2 })
    expect(s.says).toBe('3 visits did something counted since 2026-09-10. 1 sent the audit form, 50% of the 2 who started it.')
    expect(summarize([], new Date('2026-09-10T00:00:00Z')).formCompletion).toBeNull()
  })

  it('stores a count with no company, no address and no browser details, and lets only Etyme staff read the summary', () => {
    const route = read('src/app/api/market/events/route.ts')
    expect(route).toContain('companyId: null')
    expect(route).not.toMatch(/x-forwarded-for|user-agent|headers\.get/i)
    expect(route).toContain('mayReadTheList(email, staff())')
    const helper = read('src/lib/public-site/count.ts')
    expect(helper).toContain('sessionStorage')
    expect(helper).not.toMatch(/document\.cookie|localStorage/)
  })

  it('counts the demo buttons and a seat taken from a demo link, and no audit button is left to count', () => {
    // The audit buttons left the band and the header on 2026-10-14; the
    // three audit events stay in the list because rows already written
    // carry them, and nothing on the site sends them now.
    const page = read('src/app/page.tsx')
    expect(page).toContain('event="demo_cta_clicked"')
    expect(read('src/lib/public-site/close-band.tsx')).toContain('event="demo_cta_clicked"')
    for (const f of ['src/lib/public-site/skeleton.tsx', 'src/lib/public-site/frame.tsx', 'src/lib/public-site/close-band.tsx', 'src/app/page.tsx']) {
      expect(read(f), f).not.toMatch(/audit_cta_clicked|audit_form_/)
    }
    expect(read('src/lib/public-site/demo-link.tsx')).toContain("count('demo_started')")
  })
})
