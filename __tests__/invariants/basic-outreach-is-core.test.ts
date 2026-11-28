/**
 * Basic outreach is core (record 135): an update letter to a candidate and a
 * letter to one contact are the party's own ledger activity and never wait
 * for the Outreach switch; the selling letters still do. Pure rules only.
 */
import { describe, it, expect } from 'vitest'
import { outreachHeld, OUTREACH_TEMPLATES } from '@/lib/plugins'
import { planSellsLetters } from '@/lib/agents/tasks'
import { PLUGIN_REGISTRY } from '@/lib/plugin-registry'
import {
  OUTREACH_BATCH_TEMPLATE, CANDIDATE_UPDATE_TEMPLATE, DIRECT_LETTER_TEMPLATE, batchPlan, buildLetter,
} from '@/lib/outreach/batch-rules'
import { candidatePlan } from '@/lib/outreach/candidate-rules'
import { directPlan, directRefusal, directCard, letterLineSays } from '@/lib/outreach/direct-rules'

const contact = { name: 'Priya Nair', email: 'priya@buyer.example', outreachOptOutAt: null as Date | null }
const fit = { contact, tradesWithCompany: true, bounced: false, subject: 'Our new data team', body: 'We now run a data engineering team.', postal: '12 Mill Road, Leeds', link: true }

describe('basic outreach is core and the Outreach switch holds only the selling letters', () => {
  it('a candidate update letter is not held while Outreach is off', () => {
    expect(outreachHeld([], CANDIDATE_UPDATE_TEMPLATE)).toBe(false)
    expect(planSellsLetters(candidatePlan(3))).toBe(false)
  })
  it('a letter to one contact is not held while Outreach is off', () => {
    expect(outreachHeld([], DIRECT_LETTER_TEMPLATE)).toBe(false)
    expect(planSellsLetters(directPlan())).toBe(false)
  })
  it('a selling batch is still held while Outreach is off', () => {
    expect(outreachHeld([], OUTREACH_BATCH_TEMPLATE)).toBe(true)
    expect(planSellsLetters(batchPlan(4))).toBe(true)
  })
  it('the held list names only the letters that sell, and the open list names both core letters', () => {
    expect([...OUTREACH_TEMPLATES.held]).not.toContain(CANDIDATE_UPDATE_TEMPLATE)
    expect([...OUTREACH_TEMPLATES.held]).not.toContain(DIRECT_LETTER_TEMPLATE)
    expect(OUTREACH_TEMPLATES.open).toEqual(expect.arrayContaining([CANDIDATE_UPDATE_TEMPLATE, DIRECT_LETTER_TEMPLATE]))
  })
  it('the Outreach plugin says in its own words that letters to one person and to candidates are not behind its switch', () => {
    const says = PLUGIN_REGISTRY.find((p) => p.key === 'OUTREACH')!.says
    expect(says).toMatch(/one person/)
    expect(says).toMatch(/candidates/)
  })
})

describe('a letter to one contact', () => {
  it('is one letter, to one person, with no follow-up', () => {
    expect(directPlan()).toMatchObject({ recipients: 1, retries: 0, messages: [{ template: DIRECT_LETTER_TEMPLATE }] })
  })
  it('names the sender and its postal address, has an unsubscribe line and no I’m interested link', () => {
    const l = buildLetter({ firm: 'Win Firm', postal: '12 Mill Road, Leeds', recipientName: 'Priya', companyName: 'Buyer Co', subject: 's', body: 'Hello there.', unsubscribeUrl: 'https://etyme.example/u/1', interestedUrl: null, storefrontUrl: null, direct: true })
    expect(l.text).toContain('Win Firm\n12 Mill Road, Leeds')
    expect(l.text).toContain('Unsubscribe here')
    expect(l.text).not.toMatch(/interested/i)
  })
  it('is allowed to a contact the firm recorded at a company it trades with', () => {
    expect(directRefusal(fit)).toBeNull()
  })
  it('is refused to a company the firm does not trade with, naming Companies', () => {
    expect(directRefusal({ ...fit, tradesWithCompany: false })?.says).toMatch(/does not trade with|not one the firm trades with/)
  })
  it('is refused to a contact who unsubscribed', () => {
    expect(directRefusal({ ...fit, contact: { ...contact, outreachOptOutAt: new Date() } })?.says).toMatch(/asked for no more/)
  })
  it('is refused to a contact with no email address, and to an address that bounced', () => {
    expect(directRefusal({ ...fit, contact: { ...contact, email: ' ' } })?.says).toMatch(/no email address/)
    expect(directRefusal({ ...fit, bounced: true })?.says).toMatch(/did not receive/)
  })
  it('is refused with no postal address on record or no web address for the unsubscribe link', () => {
    expect(directRefusal({ ...fit, postal: null })?.says).toMatch(/postal address/)
    expect(directRefusal({ ...fit, link: false })?.says).toMatch(/unsubscribe link/)
  })
  it('is refused with an empty subject, a web address pasted in the body, or an empty body', () => {
    expect(directRefusal({ ...fit, subject: ' ' })?.field).toBe('subject')
    expect(directRefusal({ ...fit, body: 'See https://x.example' })?.field).toBe('body')
    expect(directRefusal({ ...fit, body: '' })?.field).toBe('body')
  })
  it('asks the one yes on a card that names the person and the company and no address', () => {
    const c = directCard({ firm: 'Win Firm', contactName: 'Priya Nair', companyName: 'Buyer Co', subject: 'Our new data team', letter: 'Dear Priya' })
    expect(c.question).toContain('Priya Nair')
    expect(c.question).toContain('Buyer Co')
    expect(JSON.stringify(c)).not.toContain('@')
  })
})

describe('what a letter reads as on the party’s ledger', () => {
  it('says waiting for a yes, waiting to go, sent, and not sent with the reason', () => {
    expect(letterLineSays({ subject: 'Hi', state: 'READY', taskState: 'PROPOSED', times: 0, stoppedReason: null })).toMatch(/Waiting for a yes/)
    expect(letterLineSays({ subject: 'Hi', state: 'READY', taskState: 'APPROVED', times: 0, stoppedReason: null })).toMatch(/Waiting to go/)
    expect(letterLineSays({ subject: 'Hi', state: 'SENT', taskState: 'DONE', times: 1, stoppedReason: null })).toMatch(/Sent/)
    expect(letterLineSays({ subject: 'Hi', state: 'STOPPED', taskState: 'DONE', times: 0, stoppedReason: 'UNSUBSCRIBED' })).toMatch(/Not sent.*unsubscribed/i)
    expect(letterLineSays({ subject: 'Hi', state: 'READY', taskState: 'REFUSED', times: 0, stoppedReason: null })).toMatch(/Not approved/)
  })
})
