import { describe, it, expect } from 'vitest'
import { HANDED_TO_EMAIL_SERVICE, TEAMS_POSTED_SAYS } from '@/lib/notify/mail-failure'
import { inviteSays, mailLine, sentAgainSays } from '@/lib/access-grant'
import { resentSays } from '@/lib/notify/resend-words'
import { channelSays, } from '@/lib/notify/bill-delivery'
import { deliverySays } from '@/lib/notify/bill-letter'
import { says as contractorSays } from '@/lib/contractor-invite'

const NEVER = /\bemailed\.|\bhas been sent\b|\bwas delivered\b/i
const words = (s: string) => s.trim().split(/\s+/).length

describe('an email the provider accepted is never said to have arrived', () => {
  it('the shared sentence says the email service took it and delivery is not confirmed', () => {
    expect(HANDED_TO_EMAIL_SERVICE).toBe('Handed to the email service. Delivery is not confirmed yet.')
  })
  it('the Teams sentence says posted to the channel and that Teams does not confirm it arrived', () => {
    expect(TEAMS_POSTED_SAYS).toBe('Posted to the channel. Teams does not confirm it arrived.')
  })
  it('an invitation answer for an email that left says it was handed over, not emailed', () => {
    const t = inviteSays({ personName: 'Mina Okafor', email: 'mina@northwind-staffing.example', roleName: null, mail: 'SENT' } as never)
    expect(t).toContain(HANDED_TO_EMAIL_SERVICE)
    expect(t).not.toMatch(/and emailed/)
  })
  it('the Users and permissions row says handed over, with the moment, for a sent invitation', () => {
    const line = mailLine({ state: 'SENT', at: new Date('2026-11-12T20:00:00Z'), why: null }, 'America/Los_Angeles')!
    expect(line).toMatch(/^Email handed over /)
    expect(line).toContain('Delivery is not confirmed yet.')
    expect(mailLine({ state: 'SENT', at: null, why: null }, null)).toBe(HANDED_TO_EMAIL_SERVICE)
  })
  it('sending an invitation again says handed over and not sent', () => {
    const t = sentAgainSays('mina@northwind-staffing.example', 'SENT', null)
    expect(t).toContain('Delivery is not confirmed yet.')
    expect(t).not.toMatch(/^Sent again/)
  })
  it('sending a document request again says handed over where an email left', () => {
    const t = resentSays({ leaves: true, address: 'mina@northwind-staffing.test', hasAccount: false, waitingOn: 'the I-9', until: 'Dec 3, 2026' })
    expect(t).toContain('Delivery is not confirmed yet.')
    expect(t).not.toMatch(/^Sent again/)
  })
  it('a bill sent by email reads handed over, and a bill sent on Etyme still reads sent', () => {
    const emailed = deliverySays({ at: '2026-11-10T12:00:00Z', resend: false, onEtyme: false, clientName: 'Harborline', to: [{ address: 'ap@harborline-tech.example.com', state: 'SENT', note: null }] } as never, new Date('2026-11-12T12:00:00Z'))
    expect(emailed).toContain('Handed to the email service')
    expect(emailed).toContain('Delivery is not confirmed yet')
  })
  it('a worker link ask says handed over, not that the person has been sent it', () => {
    const t = contractorSays({ name: 'Mina Okafor', state: 'ASKED' } as never, { mail: true }).now
    expect(t).toContain('handed to the email service')
  })
  it('a bill notice on a channel says handed over for email and posted for Teams', () => {
    expect(channelSays('SENT', 'No Teams channel set up, so email instead')).toBe(`Shown in the app. ${HANDED_TO_EMAIL_SERVICE}`)
    expect(channelSays('SENT', 'Posted to the company’s Teams channel')).toBe(`Shown in the app. ${TEAMS_POSTED_SAYS}`)
  })
  it('a sentence about a failed or unset email keeps its honest words', () => {
    expect(channelSays('NOT_CONFIGURED', null)).toMatch(/nothing is set up/)
    expect(mailLine({ state: 'FAILED', at: null, why: null }, null)).toMatch(/^Email not sent/)
  })
  it('every new sentence is under 25 words and claims no arrival', () => {
    for (const s of [HANDED_TO_EMAIL_SERVICE, TEAMS_POSTED_SAYS, sentAgainSays('a@b.example', 'SENT', null)]) {
      expect(words(s)).toBeLessThan(25)
      expect(s).not.toMatch(NEVER)
    }
  })
})
