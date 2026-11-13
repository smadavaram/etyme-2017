/**
 * The audit is gone, and the public site's first-party counts.
 *
 * The home page's audit form (the founder's feedback, 2026-10-10) was
 * deleted with the audit on 2026-10-14 ("Does anyone need the audit
 * form? I think it's useless."), and the census page it led to closed on
 * November 13, 2026. The lead route took the audit kind until then; it
 * takes an ask and nothing else now. The counts record five kinds of
 * click under a random visit id and nothing personal.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as leads from '@/lib/public-site/leads'
import { readMarketEvent, summarize, MARKET_EVENTS, type MarketEventRow } from '@/lib/public-site/market-events'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('The audit is gone from the public site and from the lead route', () => {

  it('the lead route takes an ask and has no audit kind left to check or thank', () => {
    const route = read('src/app/api/market/leads/route.ts')
    expect(route).not.toMatch(/'AUDIT'|auditProblems|auditAsk|AUDIT_COPY/)
    expect(route).toContain('ASK_COPY.thanks')
    expect(route).toContain('prisma.marketingLead.upsert')
  })

  it('the lead words carry no audit form, no audit button and no contractor range', () => {
    for (const gone of ['AUDIT_COPY', 'auditProblems', 'auditAsk', 'CONTRACTOR_RANGES']) {
      expect(gone in leads, gone).toBe(false)
    }
  })

  it('no public page draws the audit form any more', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/public-site/audit-form.tsx'))).toBe(false)
    for (const f of ['src/app/page.tsx', 'src/lib/public-site/skeleton.tsx', 'src/lib/public-site/sub-page.tsx', 'src/lib/public-site/company-page.tsx']) {
      expect(read(f), f).not.toContain('AuditForm')
    }
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

  it('counts the demo buttons and a seat taken from a demo link, and no audit button is left to count; the home page’s own demo counts and posts nothing', () => {
    // The audit buttons left the band and the header on 2026-10-14; the
    // three audit events stay in the list because rows already written
    // carry them, and nothing on the site sends them now. The home page
    // since 2026-11-13 draws its demo in the page and has no demo
    // button, so it counts nothing (its Send and Not now post nothing).
    const page = read('src/app/page.tsx')
    expect(page).not.toContain('CountedLink')
    expect(read('src/lib/public-site/home-parts.tsx')).not.toMatch(/count\(|fetch\(|sendBeacon/)
    expect(read('src/lib/public-site/close-band.tsx')).toContain('event="demo_cta_clicked"')
    for (const f of ['src/lib/public-site/skeleton.tsx', 'src/lib/public-site/frame.tsx', 'src/lib/public-site/close-band.tsx', 'src/app/page.tsx']) {
      expect(read(f), f).not.toMatch(/audit_cta_clicked|audit_form_/)
    }
    expect(read('src/lib/public-site/demo-link.tsx')).toContain("count('demo_started')")
  })
})
