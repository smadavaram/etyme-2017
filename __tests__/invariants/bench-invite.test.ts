import { describe, it, expect, beforeEach } from 'vitest'
import { signInvite, readInvite, inviteUrl, inviteText } from '@/lib/bench-invite'
import { signReply, readReplyToken } from '@/lib/reply-link'

/**
 * A consultant on a vendor's bench has no seat — no Context row, no
 * password, nothing to sign in with. That was fine while nobody needed
 * their answer for anything.
 *
 * It stopped being fine when BenchListing.state started at INVITED and
 * only the consultant could move it. Without a way to answer, that is
 * not consent — it is a deadlock, and every new listing would be
 * permanently unsubmittable.
 *
 * So the invitation carries its own authority, the way /packet and
 * /reply already do.
 */

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-signing-invitations'
  process.env.NEXTAUTH_URL = 'https://etyme.example'
})

describe('an invitation link stands in for a login', () => {
  it('carries the listing and reads it back', () => {
    expect(readInvite(signInvite('listing-1'))).toEqual({ listingId: 'listing-1' })
  })

  it('refuses a token with the listing swapped after signing', () => {
    const [, sig] = signInvite('listing-1').split('.')
    const forged = Buffer.from('BENCH_INVITE:listing-2').toString('base64url') + '.' + sig
    expect(readInvite(forged)).toBeNull()
  })

  it('refuses nothing, rubbish and an unsigned payload without throwing', () => {
    expect(readInvite(null)).toBeNull()
    expect(readInvite('')).toBeNull()
    expect(readInvite('not-a-token')).toBeNull()
    expect(readInvite(Buffer.from('BENCH_INVITE:listing-1').toString('base64url'))).toBeNull()
  })

  it('refuses a token signed with a different secret', () => {
    const t = signInvite('listing-1')
    process.env.NEXTAUTH_SECRET = 'somebody-elses'
    expect(readInvite(t)).toBeNull()
  })
})

describe('a link built for one purpose cannot be used for another', () => {
  it('will not accept a freshness reply token as a bench invitation', () => {
    // Same secret, same person, different meaning. Without the purpose
    // prefix the signature would validate and one endpoint would accept
    // the other's link.
    const reply = signReply({ personId: 'p1', asked: 'FRESHNESS', reply: 'SAME' })
    expect(readInvite(reply)).toBeNull()
  })

  it('will not accept a bench invitation as a reply', () => {
    expect(readReplyToken(signInvite('listing-1'))).toBeNull()
  })
})

describe('the link itself', () => {
  it('is absolute, because it is read in a mail client', () => {
    expect(inviteUrl('listing-1')).toMatch(/^https:\/\/etyme\.example\/bench-invite\//)
  })

  it('is empty rather than broken when nothing says where this deployment lives', () => {
    // A message with a link to nowhere is worse than one with no link,
    // because the person tries it.
    delete process.env.NEXTAUTH_URL
    delete process.env.VERCEL_URL
    expect(inviteUrl('listing-1')).toBe('')
  })

  it('is empty rather than throwing when there is no signing secret', () => {
    delete process.env.NEXTAUTH_SECRET
    expect(inviteUrl('listing-1')).toBe('')
  })
})

describe('what the invitation says', () => {
  const msg = inviteText({
    personName: 'Ravi Patel',
    vendorName: 'Cloudepa',
    url: 'https://etyme.example/bench-invite/abc',
  })

  it('promises to ask before every submission, which is the whole offer', () => {
    // Most people asked this have been burned by a vendor submitting
    // them somewhere without asking.
    expect(msg.body).toMatch(/ask you before every single submission/i)
  })

  it('says they can take it back', () => {
    expect(msg.body).toMatch(/take this back whenever you like/i)
  })

  it('makes no as easy as yes, and promises not to ask again', () => {
    expect(msg.body).toMatch(/saying no is the end of it. We will not ask again/i)
  })

  it('says no password and no account', () => {
    expect(msg.body).toMatch(/no password, no account/i)
  })

  it('goes out in the vendor’s name, never ours', () => {
    // The prose, not the link — the URL carries the deployment's own
    // host and always will. What must never appear is us introducing
    // ourselves: a consultant on two benches never learns that from us,
    // and the moment a vendor suspects disintermediation the benches
    // stop being uploaded.
    const prose = msg.body.split('\n').filter((l) => !l.startsWith('http')).join('\n')
    expect(prose).toMatch(/Cloudepa here/)
    expect(msg.subject).toContain('Cloudepa')
    expect(prose).not.toMatch(/Etyme/i)
    expect(msg.subject).not.toMatch(/Etyme/i)
  })
})
