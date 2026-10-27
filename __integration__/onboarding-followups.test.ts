import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { issueSetPassword, resetPassword } from '@/lib/password-door'
import { lookAtCredentials } from '@/lib/credential-chase'

/**
 * Two follow-ups from the onboarding walk of 2026-10-27 that need the
 * database to be believed: an invitation's link ends signed in, and a
 * license its holder filed herself is chased like one a firm examined.
 */

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('an invited colleague', () => {
  it('a colleague who sets her password from the invitation lands signed in', async () => {
    const her = await prisma.person.create({ data: { name: 'Rosa Ibarra', primaryEmail: 'rosa.ibarra@ibarra-staffing.com' } })
    const url = await issueSetPassword(her.id, 72)
    const token = url.split('/reset/')[1]
    const r = await resetPassword(token, 'a long and quiet harbor at dawn')
    expect(r.ok).toBe(true)
    expect(r.invitation).toBe(true)
    expect(r.ok && r.says).toBe('Your password is set. Signing you in.')
  })

  it('a reset she asked for herself still asks her to sign in', async () => {
    const him = await prisma.person.create({ data: { name: 'Tariq Osei', primaryEmail: 'tariq.osei@osei-staffing.com' } })
    const { newToken } = await import('@/lib/password')
    const { token, tokenHash } = newToken()
    await prisma.emailToken.create({ data: { personId: him.id, purpose: 'RESET', tokenHash, expiresAt: new Date(Date.now() + 3_600_000) } })
    const r = await resetPassword(token, 'a long and quiet harbor at dawn')
    expect(r.invitation).toBeUndefined()
    expect(r.ok && r.says).toBe('Your password is set. Sign in with it now.')
  })
})

describe('the renewal chase', () => {
  it('a license a worker filed herself is chased for renewal like one a firm examined', async () => {
    const helena = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'helena.marsh@seed.etyme.invalid' } })
    const now = new Date()
    await prisma.verification.create({
      data: {
        personId: helena.id, type: 'PROFESSIONAL_LICENSE', status: 'PENDING', provider: 'Oregon Board of Nursing',
        referenceId: 'RN-55120', expiresAt: new Date(now.getTime() + 10 * 86_400_000), uploadedById: helena.id,
        result: { selfFiled: true, license: 'RN-55120', state: 'OR' },
      },
    })
    const found = await lookAtCredentials(now)
    const hers = found.filter((f) => f.headline.startsWith('Helena Marsh'))
    expect(hers.length, JSON.stringify(found.map((f) => f.headline).slice(0, 5))).toBeGreaterThan(0)
  })
})
