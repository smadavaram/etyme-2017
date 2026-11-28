import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as enter } from '@/app/api/onboarding/route'
import { createAffiliate } from '@/lib/money/affiliate-registry'

/**
 * The code on the link a person arrived by is kept on the company the
 * moment sign-up makes it, so the 60 days that start later know who
 * referred the firm (Pax, 2026-11-28). Every name here is made up.
 */

const ENV_STAFF = 'staff@referral-signup.example'
let code: string

beforeAll(async () => {
  await freshWorld()
  process.env.ETYME_DATA_SEAL_KEY ??= 'a'.repeat(64)
  const staff = await prisma.person.create({ data: { name: 'Referral Staff', primaryEmail: ENV_STAFF } })
  const a = await createAffiliate({ kind: 'PERSON', name: 'Signup Referrer', contactEmail: 'referrer@referral-signup.example' }, { personId: staff.id, staff: true })
  if (!a.ok) throw new Error(a.says)
  code = a.code
}, 600_000)

const signUp = async (email: string, name: string, extra: object) => {
  as(email)
  const made = await json(await enter(req('POST', '/api/onboarding', { type: 'prime', name, ...extra })))
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return prisma.company.findUniqueOrThrow({ where: { id: made.body.data.companyId } })
}

describe('sign-up keeps the referral code from the arrival link', () => {
  it('a company made by a signed-in staff address keeps the code it arrived with, in lower case', async () => {
    const c = await signUp(ENV_STAFF, 'Arrived By Link', { referralCode: ` ${code.toUpperCase()} ` })
    expect(c.referredByCode).toBe(code)
    expect(c.activatedAt).toBeNull()
  })

  it('a sign-up with no code on the link keeps nothing', async () => {
    const c = await signUp('plain@plain-signup.example', 'Arrived Plain', {})
    expect(c.referredByCode).toBeNull()
  })

  it('a code nobody issued is kept as typed and writes no attribution, and the sign-up still works', async () => {
    const c = await signUp('odd@odd-signup.example', 'Arrived Odd', { referralCode: 'no-such-code' })
    expect(c.referredByCode).toBe('no-such-code')
    expect(await prisma.affiliateAttribution.count({ where: { tenantCompanyId: c.id } })).toBe(0)
  })
})
