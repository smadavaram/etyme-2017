import { describe, it, expect, beforeEach } from 'vitest'
import { signReply, readReplyToken, choicesBlock, CHOICES } from '@/lib/reply-link'

/**
 * The three messages used to go by SMS, where somebody answers by typing
 * "1" and a webhook reads it. Twilio is gone, and email has no webhook on
 * the other end of a reply — so the answer travels outward instead, as one
 * signed link per choice.
 *
 * These links decide whether a person is submitted to a client and
 * whether we ever contact them again. That makes the signature the whole
 * safety story: without it, anybody who can guess an id can consent on
 * somebody else's behalf.
 */

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-signing-reply-links'
  process.env.NEXTAUTH_URL = 'https://etyme.example'
})

describe('a reply link says exactly what was answered', () => {
  it('carries the person, the question and the answer, and reads them all back', () => {
    const token = signReply({ personId: 'ravi', asked: 'CONSENT', reply: 'YES' })
    expect(readReplyToken(token)).toEqual({ personId: 'ravi', asked: 'CONSENT', reply: 'YES' })
  })

  it('cannot be UNCLEAR, which is the point of a link over a typed reply', () => {
    // `readReply` exists because "no im on a contract till march" had to
    // be understood. A link carries the answer itself.
    const token = signReply({ personId: 'ravi', asked: 'FRESHNESS', reply: 'STOP' })
    expect(readReplyToken(token)!.reply).toBe('STOP')
  })

  it('reads an answer against the question it was given, not the latest one', () => {
    // A freshness ping and a consent ask can be outstanding at the same
    // time. Reading "yes" against the wrong one submits somebody who was
    // only saying they are still looking.
    const fresh = readReplyToken(signReply({ personId: 'ravi', asked: 'FRESHNESS', reply: 'SAME' }))
    expect(fresh!.asked).toBe('FRESHNESS')
  })
})

describe('a link nobody signed does nothing', () => {
  it('refuses a token with the answer swapped after signing', () => {
    // The attack worth naming: take your own "no" link and edit it into a
    // "yes" for somebody else.
    const token = signReply({ personId: 'ravi', asked: 'CONSENT', reply: 'NO' })
    const [, sig] = token.split('.')
    const forged = Buffer.from('priya:CONSENT:YES').toString('base64url') + '.' + sig
    expect(readReplyToken(forged)).toBeNull()
  })

  it('refuses a token with no signature at all', () => {
    expect(readReplyToken(Buffer.from('ravi:CONSENT:YES').toString('base64url'))).toBeNull()
  })

  it('refuses nothing, empty string and rubbish without throwing', () => {
    expect(readReplyToken(null)).toBeNull()
    expect(readReplyToken(undefined)).toBeNull()
    expect(readReplyToken('')).toBeNull()
    expect(readReplyToken('not-a-token')).toBeNull()
  })

  it('refuses a token signed with a different secret', () => {
    const token = signReply({ personId: 'ravi', asked: 'CONSENT', reply: 'YES' })
    process.env.NEXTAUTH_SECRET = 'somebody-elses-secret'
    expect(readReplyToken(token)).toBeNull()
  })
})

describe('the answers offered at the foot of a message', () => {
  it('gives the freshness ping its three answers, including a way to stop', () => {
    // Stop has to be one click from every message. It is the obligation
    // that comes with writing to somebody who did not ask to hear from us.
    expect(CHOICES.FRESHNESS.map((c) => c.reply)).toEqual(['SAME', 'CHANGED', 'STOP'])
  })

  it('gives the consent ask a yes and a no, and no third thing to misread', () => {
    expect(CHOICES.CONSENT.map((c) => c.reply)).toEqual(['YES', 'NO'])
  })

  it('offers nothing on an outcome notice, which tells rather than asks', () => {
    expect(choicesBlock('ravi', 'OUTCOME')).toBe('')
  })

  it('writes one absolute link per answer, because it is read in a mail client', () => {
    const block = choicesBlock('ravi', 'FRESHNESS')
    expect(block.split('\n')).toHaveLength(3)
    expect(block).toMatch(/^Yes, all the same: https:\/\/etyme\.example\/reply\//)
    expect(block).toMatch(/Stop emailing me: https:\/\/etyme\.example\/reply\//)
  })

  it('leaves the answers out rather than sending somebody a link to nowhere', () => {
    // Nothing says where this deployment lives. A message with no buttons
    // is worse than one with buttons; one with buttons that 404 is worse
    // than both.
    delete process.env.NEXTAUTH_URL
    delete process.env.VERCEL_URL
    expect(choicesBlock('ravi', 'FRESHNESS')).toBe('')
  })

  it('leaves them out rather than crashing the send when there is no signing secret', () => {
    delete process.env.NEXTAUTH_SECRET
    expect(choicesBlock('ravi', 'FRESHNESS')).toBe('')
  })
})
