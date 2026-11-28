import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as myBenches } from '@/app/api/me/benches/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'

/**
 * The pay a firm states on a listing, in the currency it chose for that
 * person (`BenchListing.termsPayCurrency`): a US firm paying somebody in
 * India in rupees says rupees on her page and agrees rupees with her yes;
 * a listing that names none reads in the firm's own currency.
 */

const OWNER = 'owner@stated-pay-currency.test'
const PRIYA = 'priya.nair@stated-pay-currency.test'
const LINH = 'linh.tran@stated-pay-currency.test'
const SAIGON_OWNER = 'owner@saigon.stated-pay-currency.test'

const listingOf = (email: string) =>
  prisma.benchListing.findFirstOrThrow({ where: { consultant: { person: { primaryEmail: email } } } })

async function firm(name: string, slug: string, currency: string, ownerEmail: string) {
  const company = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency, homeCurrency: currency } })
  const role = await prisma.role.create({ data: { companyId: company.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const owner = await prisma.person.create({ data: { name: `${name} Owner`, primaryEmail: ownerEmail } })
  await prisma.context.create({ data: { personId: owner.id, companyId: company.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'test' } })
  return company
}

beforeAll(async () => {
  await resetDatabase()
  await firm('Pellwright Validation Partners', 'pellwright-spc', 'USD', OWNER)
  await firm('Saigon Validation', 'saigon-spc', 'VND', SAIGON_OWNER)
}, 180_000)

describe('stated pay in the currency the firm chose', () => {
  it('a US firm stating a rupee pay rate shows rupees on her page, and her yes agrees rupees', async () => {
    as(OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Priya Nair', email: PRIYA, skills: ['Process validation'], location: 'Pune, India',
      termsEngagementType: 'W2', termsPayRateCents: 150_000, termsPayCurrency: 'INR',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.listing).toMatchObject({ termsPayRateCents: 150_000, termsPayCurrency: 'INR' })
    expect(r.body.data.message).toContain('₹1,500/hr')
    expect((await listingOf(PRIYA)).termsPayCurrency).toBe('INR')

    as(PRIYA)
    const page = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    const listing = await listingOf(PRIYA)
    const asked = page.body.data.invited.find((i: any) => i.listingId === listing.id)
    expect(asked.terms).toMatchObject({ rate: '₹1,500/hr', payCurrency: 'INR' })
    expect(asked.terms.says).toContain('₹1,500/hr')

    const yes = await json(await respond(
      req('POST', `/api/me/benches/${listing.id}/respond`, { said: 'ACCEPT', termsSeen: { engagementType: 'W2', payRateCents: 150_000, payCurrency: 'INR' } }),
      { params: Promise.resolve({ id: listing.id }) }
    ))
    expect(yes.status, JSON.stringify(yes.body)).toBeLessThan(300)
    expect((await listingOf(PRIYA)).termsAgreedAt).toBeInstanceOf(Date)
  })

  it('a listing that names no currency reads the firm’s own on her page', async () => {
    as(SAIGON_OWNER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', {
      name: 'Linh Tran', email: LINH, skills: ['Cleaning validation'], location: 'Ho Chi Minh City',
      termsEngagementType: 'W2', termsPayRateCents: 170_000,
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    // An older row, stated before the currency was kept.
    const listing = await listingOf(LINH)
    expect(listing.termsPayCurrency).toBe('VND')
    await prisma.benchListing.update({ where: { id: listing.id }, data: { termsPayCurrency: null } })

    as(LINH)
    const page = await json(await myBenches(req('GET', '/api/me/benches')))
    const asked = page.body.data.invited.find((i: any) => i.listingId === listing.id)
    expect(asked.terms).toMatchObject({ rate: '₫170,000/hr', payCurrency: 'VND' })
  })
})
