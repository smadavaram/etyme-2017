import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PRICES, USAGE_SAYS, editionCharge } from '@/lib/money/pricing'
import { COMPANY_PAGES, PRICING, copyOfCompanyPage } from '@/lib/public-site/company'
import { CONSULTING_HOURLY_CENTS, dollars } from '@/lib/public-site/pricing-words'
import { PRICE, homeBodyLines } from '@/lib/public-site/home-page-words'
import { PUBLIC_PAGES } from '@/lib/public-site/pages'
import { check, longSentences, namedCompanies } from '@/lib/positioning'
import { countWords } from '@/lib/public-site/skeleton-words'

const words = () => {
  const c = copyOfCompanyPage(PRICING)
  return [...c.hero, ...c.body]
}
const text = () => words().join(' ')

describe('The rate card page', () => {
  it('the rate card is a public page at /pricing, registered and mounted by a real file', () => {
    const p = PUBLIC_PAGES.find((x) => x.route === '/pricing')
    expect(p).toBeTruthy()
    expect(existsSync(join(process.cwd(), p!.routeFile))).toBe(true)
    expect(COMPANY_PAGES).toContain(PRICING)
  })

  it('every dollar figure on the rate card is a figure money computes, and no other', () => {
    const s15 = editionCharge('STARTER', 15)!
    const s3 = editionCharge('STARTER', 3)!
    const allowed = new Set([
      PRICES.starterUnitCents, PRICES.starterFloorCents, PRICES.starterPlatformFeeCents,
      PRICES.enterpriseUnitCents, PRICES.enterprisePlatformFeeCents,
      s15.monthlyCents, s15.yearlyContractorCents, s15.yearAllInCents,
      PRICES.starterUnitCents * 3, s3.monthlyCents, s3.platformFeeCents,
      CONSULTING_HOURLY_CENTS,
    ].map((c) => dollars(c)))
    const found = text().match(/\$[\d,]+(?:\.\d{2})?/g) ?? []
    expect(found.length).toBeGreaterThan(8)
    for (const f of found) expect(allowed.has(f), `${f} is not a figure money holds`).toBe(true)
  })

  it('Starter at 15 contractors reads $299.85 a month, $3,598.20 a year and exactly $4,598.20 all in', () => {
    const t = text()
    expect(t).toContain('$299.85 a month')
    expect(t).toContain('$3,598.20 a year')
    expect(t).toContain('$4,598.20 with the platform fee')
  })

  it('Starter at 3 contractors reads $59.97, the $199 monthly floor applies, plus $1,000 a year', () => {
    expect(text()).toContain('$59.97, so the $199 monthly floor applies. Plus $1,000 a year.')
  })

  it('Starter says $19.99 per active contractor, a $199 floor, a $1,000 platform fee and a 60-day trial', () => {
    const t = text()
    expect(t).toContain('$19.99 per active contractor a month, never less than $199 a month')
    expect(t).toContain('$1,000 platform fee each year')
    expect(t).toContain('60-day trial')
  })

  it('Enterprise says free for 60 days, then $20 per active contractor a month plus a $12,000 platform fee a year', () => {
    expect(text()).toContain('Free for 60 days. Then $20 per active contractor a month, plus a $12,000 platform fee each year.')
  })

  it('a User is free, and agent actions say rates are published before metered billing begins', () => {
    expect(text()).toContain('User: free')
    expect(text()).toContain(USAGE_SAYS)
    expect(USAGE_SAYS).toBe('Metered per action; rates published before metered billing begins.')
  })

  it('about 15% off usage for paying a year ahead, on usage only, and never a per-action price', () => {
    expect(text()).toContain('About 15% off usage when you pay a year ahead. The discount is on usage only.')
    const usage = PRICING.blocks.find((b) => b.id === 'usage')!.paragraphs!.join(' ')
    expect(usage).not.toContain('$')
  })

  it('consulting is $200 an hour', () => {
    expect(text()).toContain('$200 an hour.')
  })

  it('the rate card says nothing about affiliates or commissions to refer', () => {
    expect(text()).not.toMatch(/affiliate|referr|40%|20%/i)
  })

  it('the rate card fits one screen and no sentence on it runs past twenty-five words', () => {
    expect(countWords(words())).toBeLessThanOrEqual(200)
    expect(words().flatMap((l) => longSentences(l))).toEqual([])
  })

  it('the rate card names the category first, names no company and makes no neutrality or unverifiable claim', () => {
    const c = copyOfCompanyPage(PRICING)
    expect(c.hero.join(' ')).toContain('Enterprise contingent workforce management')
    expect(namedCompanies(text())).toEqual([])
    const bad = check(c).filter((f) => ['neutrality', 'category-first', 'module-not-category', 'claims-no-stake'].includes(f.rule))
    expect(bad).toEqual([])
  })

  it('the home page price section says Enterprise is free for 60 days and links to the rate card', () => {
    expect(PRICE.body).toContain('Enterprise free for 60 days.')
    expect(PRICE.rateCard.href).toBe('/pricing')
    expect(homeBodyLines()).toContain(PRICE.rateCard.t)
  })
})
