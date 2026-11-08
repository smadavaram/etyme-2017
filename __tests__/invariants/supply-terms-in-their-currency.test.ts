import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { termsShown, agreeingTerms, firmFacts } from '@/lib/bench-filter'
import { addConsultantBody } from '@/lib/consultant-portfolio/forms'
import { inviteTerms } from '@/app/api/bench-invite/[token]/terms'

/**
 * A bench listing's stated pay, and every rate a supplier's screen types,
 * in the listing firm's own currency (`Company.homeCurrency`): a listing
 * carries no currency of its own.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const listing = { termsEngagementType: 'W2', termsPayRateCents: 170_000, termsAgreedAt: null }

describe('stated bench pay reads in the listing firm’s currency', () => {
  it('a bench rate stated by a dong firm reads in whole dong on the person’s page', () => {
    const t = termsShown(listing, { name: 'Saigon Validation', homeCurrency: 'VND' })!
    expect(t.rate).toBe('₫170,000/hr')
    expect(t.says).toBe('Saigon Validation says it would pay you ₫170,000/hr, as its employee (W2), when it places you.')
  })

  it('a bench rate stated by a dollar firm keeps its cents', () => {
    expect(termsShown({ ...listing, termsPayRateCents: 9050 }, { name: 'Pellwright', homeCurrency: 'USD' })!.rate).toBe('$90.50/hr')
  })

  it('the invitation says the pay in the firm’s own currency, and a yes agrees the same figure', () => {
    const inv = inviteTerms(listing, { name: 'Saigon Validation', homeCurrency: 'VND' })
    expect(inv.says).toContain('₫170,000/hr')
    const yes = agreeingTerms(listing, inv.seen, { name: 'Saigon Validation', homeCurrency: 'VND' }, new Date('2026-11-08T00:00:00Z'))
    expect(yes).toMatchObject({ ok: true, agreed: true })
    if (yes.ok) expect(yes.says).toContain('₫170,000/hr')
  })

  it('a firm named without its currency reads as dollars, as before, and a blank currency is never a second one', () => {
    expect(firmFacts('Pellwright')).toEqual({ name: 'Pellwright', currency: 'USD' })
    expect(firmFacts({ name: 'Pellwright', homeCurrency: null })).toEqual({ name: 'Pellwright', currency: 'USD' })
  })

  it('every door that shows or agrees stated bench pay passes the firm with its currency', () => {
    for (const p of [
      'src/app/api/me/benches/route.ts', 'src/app/api/me/benches/[id]/respond/route.ts', 'src/app/api/bench-invite/[token]/route.ts',
      'src/app/api/bench/listings/[id]/nudge/route.ts', 'src/app/api/bench/listings/[id]/grant/route.ts', 'src/app/api/bench/share/route.ts',
    ]) {
      const s = src(p)
      expect(s, p).toContain('homeCurrency: true')
      expect(s, p).not.toMatch(/(termsShown|agreeingTerms|inviteTerms)\([^)]*company\.name/)
    }
    expect(src('src/app/api/bench/listings/route.ts')).toContain('select: { homeCurrency: true }')
    expect(src('src/lib/consultant-portfolio/bench-ask.ts')).toContain('termsShown(asked.row, { name: firm.name, homeCurrency })')
  })
})

describe('a rate typed on a supplier’s screen is stored in the firm’s currency', () => {
  const form = {
    name: 'Linh', email: 'linh@example.invalid', headline: '', skills: [], skillDraft: '', location: '', workAuth: '',
    tier: 'MARKETING', termsEngagementType: 'W2', termsPay: '170000', notes: '',
  } as any

  it('a pay typed at a dong firm is stored as whole dong, and at a dollar firm as cents', () => {
    expect(addConsultantBody(form, { rateMin: null, rateMax: null }, 'VND').termsPayRateCents).toBe(170_000)
    expect(addConsultantBody({ ...form, termsPay: '90.5' }, { rateMin: null, rateMax: null }).termsPayRateCents).toBe(9050)
  })

  it('Add consultant, Add to bench, What we need and the profile edit type rates in the firm’s currency', () => {
    const consultants = src('src/app/dashboard/consultants/page.tsx')
    expect(consultants).toContain('listingRates({ min: form.rateMin, max: form.rateMax }, null, currency)')
    expect(consultants).toContain('addConsultantBody(form, rates, currency)')
    expect(consultants).toContain('compact(row.payRateCents, firmCurrency)')
    expect(src('src/app/dashboard/bench/page.tsx')).toContain('listingRates({ min: rateMin, max: rateMax }, null, currency)')
    expect(src('src/app/dashboard/bench/what-we-need.tsx')).toContain('listingRates({ min, max }, null, currency)')
    const editor = src('src/app/dashboard/consultants/profile-editor.tsx')
    expect(editor).toContain('profileEditBody(form, mayRate, currency)')
    expect(editor).toContain('wholeFromMinor(rateFloor, currency)')
  })

  it('the firm’s currency is read from /api/me, the seat whose company is in use', () => {
    expect(src('src/app/api/me/route.ts')).toContain('kind: true, homeCurrency: true')
    expect(src('src/app/dashboard/consultants/firm-currency.ts')).toContain('m[companyId]')
  })
})

describe('a rate a candidate negotiates is said in the currency of the firm that pays them', () => {
  it('the candidate’s rate thread reads and writes the figure in the putting-forward firm’s currency', () => {
    const route = src('src/app/api/me/submissions/[id]/rate/route.ts')
    expect(route).toContain('fromCompany: { select: { id: true, name: true, homeCurrency: true } }')
    expect(route).toContain('negotiation(events, currency)')
    expect(route.match(/messageFor\(event, caller\.person\.name, r\.currency\)/g)?.length).toBe(2)
  })
})
