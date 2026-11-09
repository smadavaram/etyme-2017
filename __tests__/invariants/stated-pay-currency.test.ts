import { describe, it, expect } from 'vitest'
import { termsShown, agreeingTerms, listingTermsFrom, termsCurrency } from '@/lib/bench-filter'
import { addConsultantBody } from '@/lib/consultant-portfolio/forms'
import { inviteTerms } from '@/app/api/bench-invite/[token]/terms'
import { grantFactsFrom } from '@/app/api/me/grants'

/**
 * The pay a firm states on a listing is in the currency it chose for that
 * person (`BenchListing.termsPayCurrency`, 9202fbfc2): its own by default,
 * another where it says so, and a listing stated before the column existed
 * reads in the firm's own.
 */

const US = { name: 'Pellwright Validation Partners', homeCurrency: 'USD' }
const now = new Date('2026-11-09T00:00:00Z')
const who = { personName: 'Priya Nair', firmName: US.name, ownCompany: null, statedById: 'owner', now, firmCurrency: 'USD' }

describe('a firm states pay in the currency it pays the person in', () => {
  it('a US firm stating a rupee pay rate shows rupees on her page', () => {
    const row = { termsEngagementType: 'W2', termsPayRateCents: 150_000, termsPayCurrency: 'INR', termsAgreedAt: null }
    const t = termsShown(row, US)!
    expect(t.rate).toBe('₹1,500/hr')
    expect(t.payCurrency).toBe('INR')
    expect(t.says).toBe('Pellwright Validation Partners says it would pay you ₹1,500/hr, as its employee (W2), when it places you.')
  })

  it('a US firm stating a rupee pay rate shows rupees on the invitation, and her yes agrees rupees', () => {
    const row = { termsEngagementType: 'W2', termsPayRateCents: 150_000, termsPayCurrency: 'INR', termsAgreedAt: null }
    const inv = inviteTerms(row, US)
    expect(inv.says).toContain('₹1,500/hr')
    expect(inv.seen).toEqual({ engagementType: 'W2', payRateCents: 150_000, payCurrency: 'INR' })
    const yes = agreeingTerms(row, inv.seen, US, now)
    expect(yes).toMatchObject({ ok: true, agreed: true })
  })

  it('a yes to the same figure shown in another currency agrees nothing and asks her to read again', () => {
    const row = { termsEngagementType: 'W2', termsPayRateCents: 150_000, termsPayCurrency: 'INR', termsAgreedAt: null }
    const no = agreeingTerms(row, { engagementType: 'W2', payRateCents: 150_000, payCurrency: 'USD' }, US, now)
    expect(no.ok).toBe(false)
  })

  it('a listing with no currency reads the firm’s', () => {
    expect(termsCurrency({ termsPayCurrency: null }, { name: 'Saigon Validation', homeCurrency: 'VND' })).toBe('VND')
    const t = termsShown({ termsEngagementType: 'W2', termsPayRateCents: 170_000, termsPayCurrency: null, termsAgreedAt: null }, { name: 'Saigon Validation', homeCurrency: 'VND' })!
    expect(t.rate).toBe('₫170,000/hr')
  })

  it('stating terms writes the currency chosen, the firm’s own where none was picked, and says the pay in it', () => {
    const inr = listingTermsFrom({ engagementType: 'W2', payRateCents: 150_000, payCurrency: 'inr' }, who)
    expect(inr.ok && inr.fields.termsPayCurrency).toBe('INR')
    expect(inr.ok && inr.says).toContain('₹1,500/hr')
    const own = listingTermsFrom({ engagementType: 'W2', payRateCents: 9000 }, who)
    expect(own.ok && own.fields.termsPayCurrency).toBe('USD')
    const none = listingTermsFrom({ engagementType: null, payRateCents: null }, who)
    expect(none.ok && none.fields.termsPayCurrency).toBeNull()
  })

  it('a currency that is not a three-letter code is refused in a sentence naming the field', () => {
    const bad = listingTermsFrom({ engagementType: 'W2', payRateCents: 9000, payCurrency: 'rupees' }, who)
    expect(bad).toMatchObject({ ok: false, field: 'termsPayCurrency' })
    if (!bad.ok) expect(bad.says).toBe('Say the currency you would pay them in as its three-letter code, like USD or INR.')
  })

  it('Add consultant posts the pay in the currency picked beside it, by that currency’s own exponent', () => {
    const form = {
      name: 'Priya', email: 'priya@example.invalid', headline: '', skills: [], skillDraft: '', location: '', workAuth: '',
      tier: 'MARKETING', termsEngagementType: 'W2', termsPay: '1500', termsPayCurrency: 'INR', notes: '',
    }
    const body = addConsultantBody(form, { rateMin: null, rateMax: null }, 'USD')
    expect(body).toMatchObject({ termsPayRateCents: 150_000, termsPayCurrency: 'INR' })
    expect(addConsultantBody({ ...form, termsPayCurrency: '' }, { rateMin: null, rateMax: null }, 'USD').termsPayCurrency).toBe('USD')
    expect(addConsultantBody({ ...form, termsPay: '' }, { rateMin: null, rateMax: null }, 'USD').termsPayCurrency).toBeNull()
  })
})

describe('/api/me offers the menu what a team grant reaches', () => {
  it('a seat whose only reach is a team grant of jobs is offered Jobs on its menu, while its permissions stay its role’s', () => {
    const seat = { companyId: 'pellwright', roleId: 'recruiter', contextId: 'ctx-ana' }
    const f = grantFactsFrom(seat, ['consultants.read'], [
      { id: 'g', companyId: 'pellwright', permission: 'requirements.read', roleId: null, contextId: 'ctx-ana', scope: 'UNIT', orgUnitId: 'dayton', revokedAt: null },
    ], new Map([['dayton', 'Dayton']]))
    expect(f.menuPermissions).toContain('requirements.read')
    expect(f.menuPermissions).toContain('consultants.read')
  })
})
