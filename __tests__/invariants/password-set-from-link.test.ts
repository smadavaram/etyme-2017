/**
 * A password set from a one-time link tells the person (2026-11-16).
 *
 * Only the account menu told her a password was set. A password set from
 * a link (Forgot your password, an invitation, a firm's sign-in link, a
 * link Etyme's staff issued) was set in silence, so a link that reached
 * the wrong hands left her nothing to notice. Now every password set from
 * a link writes a notice to her own Ask Etyme, sent by email where email
 * can leave, naming the firm whose seat the link was for, and how to
 * reset it if it was not her. Never the link itself.
 *
 * The rules run for real (lib/password-door); only the database, the
 * sender and the notice are stood in for.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const TOKEN = 'a-one-time-token-only-her-mailbox-holds'
let tokenRow: any = null
let firm: { name: string } | null = null

const db: any = {
  emailToken: {
    findUnique: vi.fn(async () => tokenRow),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  person: { update: vi.fn(async () => ({})) },
  company: { findUnique: vi.fn(async () => firm) },
  signInFailure: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  companySignInPolicy: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
  identityProvider: { findMany: vi.fn(async () => []) },
  accessLog: { createMany: vi.fn(async ({ data }: any) => ({ count: data.length })) },
  incident: { create: vi.fn(async () => ({ id: 'i' })) },
  $transaction: vi.fn(async (fn: any) => fn(db)),
}
vi.mock('@/lib/db', () => ({ get prisma() { return db } }))
const notify = vi.hoisted(() => vi.fn(async () => ({ id: 'n' })))
vi.mock('@/lib/notify', () => ({ notify }))
const mail = vi.hoisted(() => ({ leaves: true }))
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return { ...real, emailSender: () => (mail.leaves ? { channel: 'EMAIL', send: async () => {} } : null) }
})

import { resetPassword } from '@/lib/password-door'
import { passwordNoticeSays } from '@/lib/identity/password-notice'
import { hashToken } from '@/lib/password'
import { formatDay } from '@/lib/format-date'

const NOW = new Date('2026-11-16T15:00:00Z')
const PASSWORD = 'copper kettle rides north'

function link(over: { payload?: unknown; passwordHash?: string | null } = {}) {
  tokenRow = {
    id: 't-1', personId: 'p-dana', purpose: 'RESET', tokenHash: hashToken(TOKEN),
    usedAt: null, expiresAt: new Date(NOW.getTime() + 3_600_000), payload: over.payload ?? null,
    person: { id: 'p-dana', primaryEmail: 'dana@etyme.com', emailVerifiedAt: null, passwordHash: over.passwordHash ?? null },
  }
}
const told = () => (notify.mock.calls as any[]).map((c) => c[0])
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

beforeEach(() => {
  vi.clearAllMocks()
  mail.leaves = true
  firm = null
})

describe('a password set from a link always tells the person', () => {
  it('a password set from a link always tells the person, by email where it can leave', async () => {
    firm = { name: 'Northwind Staffing' }
    link({ payload: { invitation: true, firmId: 'co-northwind' } })
    const r = await resetPassword(TOKEN, PASSWORD, NOW)
    expect(r.ok).toBe(true)
    expect(told()).toHaveLength(1)
    expect(told()[0]).toMatchObject({
      personId: 'p-dana', type: 'SYSTEM', channel: 'EMAIL',
      title: 'A password was set on your Etyme account',
      body:
        `A password was set on your Etyme account on ${formatDay(NOW)}, using a one-time link for your seat at Northwind Staffing. ` +
        'If this was not you, choose Forgot your password on the sign-in page to set a new one, and write to support@etyme.com.',
    })
    // A personal notice: no firm's channel hears it.
    expect(told()[0].companyId).toBeUndefined()
  })

  it('the notice never carries the link, its token or the password', async () => {
    firm = { name: 'Northwind Staffing' }
    link({ payload: { invitation: true, firmId: 'co-northwind' } })
    await resetPassword(TOKEN, PASSWORD, NOW)
    const all = JSON.stringify(notify.mock.calls)
    expect(all).not.toContain(TOKEN)
    expect(all).not.toContain('/reset/')
    expect(all).not.toContain(PASSWORD)
  })

  it('where no email can leave, she is still told in her own Ask Etyme, and told to ask support for a reset', async () => {
    mail.leaves = false
    link({ payload: { invitation: true } })
    await resetPassword(TOKEN, PASSWORD, NOW)
    expect(told()).toHaveLength(1)
    expect(told()[0]).toMatchObject({
      channel: 'IN_APP',
      body:
        `A password was set on your Etyme account on ${formatDay(NOW)}, using a one-time link sent to your email. ` +
        'If this was not you, write to support@etyme.com and ask for your password to be reset.',
    })
  })

  it('a password reset from Forgot your password names no firm, and reads changed where she had one', async () => {
    link({ passwordHash: 'the-hash-she-had' })
    await resetPassword(TOKEN, PASSWORD, NOW)
    expect(told()[0]).toMatchObject({ title: 'Your Etyme password was changed', channel: 'EMAIL' })
    expect(told()[0].body).toContain('Your password was changed on your Etyme account')
    expect(told()[0].body).toContain('using a one-time link sent to your email.')
    expect(db.company.findUnique).not.toHaveBeenCalled()
  })

  it('a link whose firm is no longer on the record still tells her, naming no firm', async () => {
    firm = null
    link({ payload: { invitation: true, firmId: 'co-gone' } })
    await resetPassword(TOKEN, PASSWORD, NOW)
    expect(told()[0].body).toContain('using a one-time link sent to your email.')
  })

  it('a link that was refused sets nothing and tells nobody', async () => {
    link()
    tokenRow.usedAt = new Date(NOW.getTime() - 60_000)
    const r = await resetPassword(TOKEN, PASSWORD, NOW)
    expect(r.ok).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('what the notice says', () => {
  it('every sentence of every notice is under twenty-five words', () => {
    for (const changed of [false, true]) {
      for (const mailLeaves of [false, true]) {
        for (const from of [{ by: 'MENU' as const }, { by: 'LINK' as const, firmName: null }, { by: 'LINK' as const, firmName: 'Harborline Technology Partners' }]) {
          const { body } = passwordNoticeSays({ changed, on: NOW, from, mailLeaves })
          for (const s of body.split(/(?<=\.)\s+(?=[A-Z])/)) expect(words(s), s).toBeLessThanOrEqual(25)
        }
      }
    }
  })

  it('a password set from the account menu still reads as it did', () => {
    expect(passwordNoticeSays({ changed: false, on: NOW, from: { by: 'MENU' }, mailLeaves: true }).body).toBe(
      `A password was set on ${formatDay(NOW)} from your account menu. ` +
      'If this was not you, sign in, choose a new password, sign out everywhere, and write to support@etyme.com.',
    )
  })
})
