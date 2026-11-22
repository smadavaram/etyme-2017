/**
 * Settings shows the health of the domain email is sent from (record
 * 110, 2026-11-22): SPF, DKIM and DMARC, each "found", "not found" or
 * "could not be checked", with one sentence on what to do.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkSays, dkimSelectors, healthSays, sendingDomain, sendingDomainHealth, spfNames, stateOf, NO_SENDER_SAYS,
  type Looked, type LookUp,
} from '@/lib/notify/sending-domain'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ENV = { RESEND_API_KEY: 're_SECRETSECRETSECRET', NOTIFY_FROM_EMAIL: 'Etyme <notices@mail.etyme.example>' }
const DOMAIN = 'mail.etyme.example'
const absent: Looked = { ok: false, why: 'ABSENT' }
const silent: Looked = { ok: false, why: 'UNANSWERED' }
const txt = (...values: string[]): Looked => ({ ok: true, values })

const dns = (zone: Record<string, Looked>): LookUp => async (name) => zone[name] ?? absent
const ALL_THERE = {
  [`send.${DOMAIN}`]: txt('v=spf1 include:mailer.example ~all'),
  [`resend._domainkey.${DOMAIN}`]: txt('p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCB'),
  [`_dmarc.${DOMAIN}`]: txt('v=DMARC1; p=none;'),
}

describe('Settings shows the health of the domain email is sent from', () => {
  it('the sending domain is read from the configured sender address, with or without a display name', () => {
    expect(sendingDomain(ENV)).toBe(DOMAIN)
    expect(sendingDomain({ NOTIFY_FROM_EMAIL: 'notices@Mail.Etyme.example' })).toBe(DOMAIN)
    expect(sendingDomain({})).toBeNull()
    expect(sendingDomain({ NOTIFY_FROM_EMAIL: 'not an address' })).toBeNull()
  })

  it('with all three records in DNS each reads found, and the panel says nothing is left to do', async () => {
    const h = await sendingDomainHealth(dns(ALL_THERE), ENV)
    expect(h.domain).toBe(DOMAIN)
    expect(h.checks.map((c) => [c.record, c.state])).toEqual([['SPF', 'found'], ['DKIM', 'found'], ['DMARC', 'found']])
    expect(h.says).toBe(`Email is sent from ${DOMAIN}. All three records are in DNS.`)
    expect(h.checks[0].says).toBe(`SPF is in DNS for ${DOMAIN}. Nothing to do.`)
  })

  it('a record that is not in DNS reads not found, with one sentence on what to do', async () => {
    const h = await sendingDomainHealth(dns({ ...ALL_THERE, [`_dmarc.${DOMAIN}`]: absent }), ENV)
    const dmarc = h.checks.find((c) => c.record === 'DMARC')!
    expect(dmarc.state).toBe('not found')
    expect(dmarc.says).toBe(`Ask Etyme support to add the DMARC record, which tells a mailbox what to do with a failed email, to the DNS of ${DOMAIN}.`)
    expect(h.says).toContain('A record is missing')
  })

  it('a lookup that did not answer reads could not be checked, never not found', async () => {
    const h = await sendingDomainHealth(dns({ ...ALL_THERE, [`resend._domainkey.${DOMAIN}`]: silent }), ENV)
    const dkim = h.checks.find((c) => c.record === 'DKIM')!
    expect(dkim.state).toBe('could not be checked')
    expect(dkim.says).toMatch(/^The DNS lookup did not answer, so DKIM is not known\./)
    expect(h.says).toContain('Not every record could be checked')
  })

  it('a lookup that throws is could not be checked, and the page still answers', async () => {
    const h = await sendingDomainHealth(async () => { throw new Error('resolver is down') }, ENV)
    expect(h.checks.map((c) => c.state)).toEqual(['could not be checked', 'could not be checked', 'could not be checked'])
  })

  it('some other text record at the name is not the record', () => {
    expect(stateOf('SPF', [txt('google-site-verification=abc')])).toBe('not found')
    expect(stateOf('DMARC', [txt('v=spf1 -all')])).toBe('not found')
    expect(stateOf('DKIM', [txt('v=spf1 -all')])).toBe('not found')
  })

  it('a record found at one name wins over a lookup of another name that did not answer', () => {
    expect(stateOf('SPF', [silent, txt('v=spf1 -all')])).toBe('found')
  })

  it('SPF is looked for on the domain and on its send name, and DKIM under the email service’s selector', () => {
    expect(spfNames(DOMAIN)).toEqual([DOMAIN, `send.${DOMAIN}`])
    expect(dkimSelectors(ENV)).toEqual(['resend'])
    expect(dkimSelectors({ SENDGRID_API_KEY: 'k' })).toEqual(['s1', 's2'])
    expect(dkimSelectors({ ...ENV, MAIL_DKIM_SELECTORS: 'mx1, mx2' })).toEqual(['mx1', 'mx2'])
  })

  it('with no sender address set the panel says so and looks nothing up', async () => {
    let asked = 0
    const h = await sendingDomainHealth(async () => { asked++; return absent }, {})
    expect(h).toEqual({ domain: null, checks: [], says: NO_SENDER_SAYS })
    expect(asked).toBe(0)
  })

  it('no key and no mailbox name is in what the panel reads, only the domain', async () => {
    const h = JSON.stringify(await sendingDomainHealth(dns(ALL_THERE), ENV))
    expect(h).not.toContain('SECRET')
    expect(h).not.toContain('notices@')
  })

  it('each state is one of the three words, and every sentence is at most twenty-five words', () => {
    for (const record of ['SPF', 'DKIM', 'DMARC'] as const) {
      for (const state of ['found', 'not found', 'could not be checked'] as const) {
        for (const s of checkSays(record, state, DOMAIN).split(/(?<=\.)\s+/)) expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(25)
      }
    }
    for (const s of [healthSays(DOMAIN, [{ state: 'found' }]), healthSays(DOMAIN, [{ state: 'not found' }]), NO_SENDER_SAYS]) {
      for (const one of s.split(/(?<=\.)\s+/)) expect(one.split(/\s+/).length, one).toBeLessThanOrEqual(25)
    }
  })

  it('the Settings page draws the panel, and the panel reads the route that does the lookup', () => {
    expect(read('src/app/dashboard/settings/page.tsx')).toContain('<SendingDomainPanel />')
    expect(read('src/components/settings/sending-domain-panel.tsx')).toContain("fetch('/api/settings/mail-domain')")
    const route = read('src/app/api/settings/mail-domain/route.ts')
    expect(route).toContain('getCallerContext(request)')
    expect(route).toContain('sendingDomainHealth(lookUpTxt)')
  })

  it('the panel, a browser page, never imports the file that reads DNS', () => {
    expect(read('src/components/settings/sending-domain-panel.tsx')).not.toContain('sending-domain-lookup')
    expect(read('src/lib/notify/sending-domain.ts')).not.toContain('node:dns')
  })
})
