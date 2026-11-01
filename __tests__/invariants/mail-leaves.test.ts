import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mailLeaves, NO_MAIL_HERE } from '@/lib/notify/mail-leaves'
import { emailSender } from '@/lib/senders'
import { configured } from '@/lib/messages'
import { teamsLinkStanding, teamsEdge, withoutTeams } from '@/lib/notify/teams-link'

/**
 * A sentence never promises a letter that cannot leave (the Tapin walks,
 * 2026-10-29 and 2026-10-30: "a letter is on its way" on a deployment
 * with no email key). One function knows whether email can leave
 * (`mailLeaves`); the sender reads it, the bench invitation's check reads
 * it, and every sentence that says email went or will go reads it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const KEYS = ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
const set = (e: Partial<Record<(typeof KEYS)[number], string>>) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, e) }

describe('one function knows whether an email can leave this deployment', () => {
  it('email leaves only where a provider key and the address it is sent from are both set', () => {
    expect(mailLeaves({})).toBe(false)
    expect(mailLeaves({ RESEND_API_KEY: 'k' })).toBe(false)
    expect(mailLeaves({ NOTIFY_FROM_EMAIL: 'notices@notify.etyme.com' })).toBe(false)
    expect(mailLeaves({ RESEND_API_KEY: 'k', NOTIFY_FROM_EMAIL: 'notices@notify.etyme.com' })).toBe(true)
    expect(mailLeaves({ SENDGRID_API_KEY: 'k', NOTIFY_FROM_EMAIL: 'notices@notify.etyme.com' })).toBe(true)
  })

  it('the email sender exists exactly where that function says email leaves, so a sentence and the send cannot disagree', () => {
    set({})
    expect(mailLeaves()).toBe(false)
    expect(emailSender()).toBeNull()
    expect(configured()).toBe(false)
    set({ RESEND_API_KEY: 'k', NOTIFY_FROM_EMAIL: 'notices@notify.etyme.com' })
    expect(mailLeaves()).toBe(true)
    expect(emailSender()?.channel).toBe('EMAIL')
    expect(configured()).toBe(true)
  })

  it('the bench invitation’s check reads that one function', () => {
    expect(read('src/lib/messages.ts')).toContain('return mailLeaves()')
    expect(read('src/app/api/consultants/ask-by-email.ts')).toContain('mailOn: configured()')
  })
})

describe('a company with no working Teams link is told where its notifications go, and never promised email that cannot leave', () => {
  it('with no Teams channel and email able to leave, notifications go by email', () => {
    expect(teamsLinkStanding(null, true).says).toBe('No Teams channel is set up. Notifications for this company go by email.')
  })

  it('with no Teams channel and no email key, notifications show in Etyme only, and the settings page says so', () => {
    const s = teamsLinkStanding(null, false)
    expect(s.state).toBe('NONE')
    expect(s.says).toBe(`No Teams channel is set up. Notifications for this company show in Etyme only. ${NO_MAIL_HERE}.`)
    expect(s.says).not.toMatch(/go by email/)
  })

  it('a retired Teams link where no email can leave says notifications show in Etyme only until a new link is saved', () => {
    const s = teamsLinkStanding('https://contoso.webhook.office.com/webhookb2/abc', false)
    expect(s.state).toBe('NEEDS_NEW_LINK')
    expect(s.says).toContain('Notifications for this company show in Etyme only until a new link is saved.')
    expect(s.says).not.toMatch(/by email/)
  })

  it('the readiness line for the Teams edge says a company on a retired link is reached in Etyme only where no email can leave', () => {
    const f = { workflowsChannels: 0, retiredChannels: 1, postedByWorkflows: 0 }
    expect(teamsEdge(f, true).says).toContain('reached by email instead')
    expect(teamsEdge(f, false).says).toContain('reached only in Etyme, because no email can be sent from here yet')
    expect(teamsEdge(f, false).says).not.toContain('by email instead')
  })

  it('the sentence follows the deployment when nobody says otherwise', () => {
    set({})
    expect(teamsLinkStanding(null).says).toBe(`No Teams channel is set up. ${withoutTeams(false)}`)
    set({ SENDGRID_API_KEY: 'k', NOTIFY_FROM_EMAIL: 'notices@notify.etyme.com' })
    expect(teamsLinkStanding(null).says).toBe(`No Teams channel is set up. ${withoutTeams(true)}`)
  })
})

describe('a notice about a letter never says it was sent', () => {
  it('the card about a request to be forgotten says the letter is to the person, not that it went', () => {
    const src = read('src/lib/notify/data-rights.ts')
    expect(src).toContain('is in the letter to the person.')
    expect(src).not.toContain('letter sent to the person')
  })
})
