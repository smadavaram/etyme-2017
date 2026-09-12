import { describe, it, expect } from 'vitest'
import { sign, read, addressFor, DEMO_COOKIE } from '@/lib/demo-session'
import { DEMO_DAYS } from '@/lib/demo-seed'

/**
 * A prospect who has to create an account before seeing anything looks at
 * the form and leaves, and we never learn whether the product was any
 * good. So a demo visitor gets an identity the moment they ask for one.
 *
 * Signed, because a cookie naming a person id and nothing else is an
 * invitation to type somebody else's id into it.
 */

process.env.NEXTAUTH_SECRET ??= 'test-secret-for-signing'

describe('a demo identity', () => {
  it('round-trips a demo address', () => {
    const email = addressFor('abc123')
    expect(read(sign(email))).toBe(email)
  })

  it('refuses a cookie somebody edited', () => {
    const good = sign(addressFor('abc123'))
    const [body] = good.split('.')
    expect(read(`${body}.notthesignature`)).toBeNull()
  })

  it('refuses a body swapped under a valid-looking signature', () => {
    const mine = sign(addressFor('mine'))
    const [, mac] = mine.split('.')
    const theirs = Buffer.from(addressFor('theirs')).toString('base64url')
    expect(read(`${theirs}.${mac}`)).toBeNull()
  })

  it('never validates a real address, however well signed', () => {
    // A signature over a customer's email would otherwise be a way in.
    expect(read(sign('founder@a-real-company.com'))).toBeNull()
  })

  it('treats nonsense as signed out rather than throwing', () => {
    for (const junk of ['', 'x', 'a.b.c', '....', 'not base64 at all']) {
      expect(read(junk)).toBeNull()
    }
    expect(read(undefined)).toBeNull()
    expect(read(null)).toBeNull()
  })
})

describe('demo and real are separate universes', () => {
  /**
   * A visitor looking around must never see a customer's name, and a
   * customer must never see a stranger's sandbox. The partition is on a
   * flag rather than on a guess about the name, because "looks like demo
   * data" is exactly the judgement nobody should be making about
   * somebody's real book.
   */

  function directoryFor(company: { id: string; isDemo: boolean; outsideOk: boolean }, dealings: string[]) {
    if (company.isDemo) return { id: { in: [company.id, ...dealings] } }
    return company.outsideOk ? { isDemo: false } : { id: company.id }
  }

  it('shows a real company only real companies, however open its posture', () => {
    expect(directoryFor({ id: 'real', isDemo: false, outsideOk: true }, [])).toEqual({ isDemo: false })
  })

  it('shows a demo only its own sandbox, not other people’s', () => {
    // Somebody looking around should find their own company and the
    // client they bill — not seven copies of a demo client belonging to
    // strangers.
    const scope = directoryFor({ id: 'mine', isDemo: true, outsideOk: true }, ['my-client'])
    expect(scope).toEqual({ id: { in: ['mine', 'my-client'] } })
  })

  it('still shuts a walled real company in to itself', () => {
    expect(directoryFor({ id: 'walled', isDemo: false, outsideOk: false }, [])).toEqual({ id: 'walled' })
  })
})

describe('a demo does not live forever', () => {
  it('is reaped after a fortnight', () => {
    // One still being used has been extended by its owner coming back.
    // One untouched is clutter, and a database of abandoned workspaces
    // makes every query slower.
    expect(DEMO_DAYS).toBe(14)
  })

  it('names its cookie the same everywhere', () => {
    expect(DEMO_COOKIE).toBe('etyme_demo')
  })
})
