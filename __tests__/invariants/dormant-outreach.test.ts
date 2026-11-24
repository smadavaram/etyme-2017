import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  COOLING_OFF_DAYS, OUTREACH_PLAN, UNSUBSCRIBE_PLACEHOLDER, becameDormant, blockedCard, chooseRecipient, coolingOffHolds, outreachCard, outreachLetter, postalLine,
  type RolodexRow,
} from '@/lib/agents/dormant-outreach-rules'
import type { CensusRow } from '@/lib/agents/census-rules'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const row = (key: string, standing: 'ACTIVE' | 'DORMANT', side: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER'): CensusRow =>
  ({ key, name: 'Orchid Foods', side, standing, lastActivity: d('2026-08-20') })
const input = (side: 'CUSTOMER' | 'SUPPLIER', unsubscribeUrl: string | null = 'https://etyme.example/answer/outreach/T.S') =>
  ({ side, firmName: 'Win Firm', postal: '12 Mill Road, Leeds, LS1 4AB, GB', companyName: 'Orchid Foods', lastActivity: d('2026-08-20'), today: d('2026-11-24'), recipient: { name: 'Mina Cho', email: 'mina@orchid.example' }, unsubscribeUrl })
const rows = (...r: Partial<RolodexRow>[]): RolodexRow[] => r.map((x, i) => ({ id: `c${i}`, name: `Person ${i}`, email: `p${i}@orchid.example`, kind: 'OTHER', outreachOptOutAt: null, ...x }))

describe('who is drafted for, and when', () => {
  it('only a company that was active a week ago and is dormant now is drafted for', () => {
    const before = [row('CUSTOMER:a', 'ACTIVE'), row('CUSTOMER:b', 'DORMANT'), row('CUSTOMER:c', 'ACTIVE')]
    const after = [row('CUSTOMER:a', 'DORMANT'), row('CUSTOMER:b', 'DORMANT'), row('CUSTOMER:c', 'ACTIVE'), row('CUSTOMER:d', 'DORMANT')]
    expect(becameDormant(before, after).map((r) => r.key)).toEqual(['CUSTOMER:a'])
  })
  it('the cooling-off is 180 days, a proposal, and a company asked 179 days ago is held while one asked 180 days ago is not', () => {
    expect(COOLING_OFF_DAYS).toBe(180)
    expect(coolingOffHolds(d('2026-05-29'), d('2026-11-24'))).toBe(true)
    expect(coolingOffHolds(d('2026-05-28'), d('2026-11-24'))).toBe(false)
    expect(coolingOffHolds(null, d('2026-11-24'))).toBe(false)
  })
})

describe('the letter', () => {
  it('a letter to a customer and a letter to a supplier read differently, and each says why the reader got it', () => {
    const c = outreachLetter(input('CUSTOMER')); const s = outreachLetter(input('SUPPLIER'))
    expect(c.text).not.toEqual(s.text)
    expect(c.text).toMatch(/you are getting this because/i); expect(s.text).toMatch(/you are getting this because/i)
    expect(c.text).toMatch(/jobs/i); expect(s.text).toMatch(/people/i)
  })
  it('every outreach letter carries the unsubscribe link and the sending firm and its postal address', () => {
    for (const side of ['CUSTOMER', 'SUPPLIER'] as const) {
      const l = outreachLetter(input(side))
      expect(l.text).toContain('https://etyme.example/answer/outreach/T.S')
      expect(l.text).toMatch(/Unsubscribe here, no sign-in needed/)
      expect(l.text).toContain('Win Firm\n12 Mill Road, Leeds, LS1 4AB, GB')
    }
  })
  it('the subject names the sending firm and says it is a check-in, not a bill or a chase', () => {
    expect(outreachLetter(input('CUSTOMER')).subject).toBe('Check-in from Win Firm: any jobs coming up?')
    expect(outreachLetter(input('SUPPLIER')).subject).toBe('Check-in from Win Firm: any people available?')
  })
  it('the letter says the unsubscribe stops check-ins only and never messages about work already agreed', () => {
    expect(outreachLetter(input('CUSTOMER')).text).toMatch(/stops check-in letters only\. Messages about work already agreed, such as timesheets and bills, still reach you/)
  })
  it('the letter carries no rate and no name of anyone who worked there', () => {
    for (const side of ['CUSTOMER', 'SUPPLIER'] as const) {
      const l = outreachLetter(input(side))
      expect(l.text + l.subject).not.toMatch(/\$|\brate\b|\bworked\b/i)
    }
  })
})

describe('who may be written to', () => {
  it('a contact who unsubscribed is never chosen while another with an email is', () => {
    const got = chooseRecipient(rows({ outreachOptOutAt: d('2026-10-01') }, {}), new Set(), 'CUSTOMER')
    expect(got.ok && got.to.id).toBe('c1')
  })
  it('where everyone with an email unsubscribed the answer is that they did, not that nobody is recorded', () => {
    expect(chooseRecipient(rows({ outreachOptOutAt: d('2026-10-01') }), new Set(), 'CUSTOMER')).toEqual({ ok: false, block: 'OPTED_OUT' })
  })
  it('an address whose last outreach letter bounced is never chosen, whatever its case', () => {
    expect(chooseRecipient(rows({ email: 'P0@Orchid.example' }), new Set(['p0@orchid.example']), 'CUSTOMER')).toEqual({ ok: false, block: 'BOUNCED' })
  })
  it('a changed address is not the one that bounced, so the contact may be written to again', () => {
    const got = chooseRecipient(rows({ email: 'new@orchid.example' }), new Set(['p0@orchid.example']), 'CUSTOMER')
    expect(got.ok && got.to.email).toBe('new@orchid.example')
  })
  it('nobody with an email recorded says so', () => {
    expect(chooseRecipient(rows({ email: null }, { email: '  ' }), new Set(), 'CUSTOMER')).toEqual({ ok: false, block: 'NO_CONTACT' })
  })
  it('a hiring manager is preferred for a customer and a recruiter for a supplier, accounts payable last', () => {
    const r = rows({ kind: 'AP' }, { kind: 'RECRUITING' }, { kind: 'HIRING_MANAGER' })
    expect((chooseRecipient(r, new Set(), 'CUSTOMER') as any).to.id).toBe('c2')
    expect((chooseRecipient(r, new Set(), 'SUPPLIER') as any).to.id).toBe('c1')
  })
})

describe('the firm’s postal address', () => {
  it('a street and a city read as one line with the state, post code and country', () => {
    expect(postalLine({ street: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' })).toBe('1 Main St, Austin, TX 78701, US')
  })
  it('no street or no city is no address, so no letter is drafted', () => {
    expect(postalLine({ street: null, city: 'Austin', state: null, postalCode: null, country: 'US' })).toBeNull()
    expect(postalLine({ street: '1 Main St', city: ' ', state: null, postalCode: null, country: 'US' })).toBeNull()
    expect(postalLine(null)).toBeNull()
  })
})

describe('the task and its card', () => {
  it('the outreach is one letter and no retries, so one yes releases exactly one send', () => {
    expect(OUTREACH_PLAN.messages).toHaveLength(1); expect(OUTREACH_PLAN.retries).toBe(0)
  })
  it('the card holds the draft and the recipient and says Etyme sends it only if you say yes', () => {
    const c = outreachCard(input('CUSTOMER', null))
    expect(c.question).toMatch(/sends it only if you say yes/)
    expect(c.detail).toMatch(/mina@orchid\.example/); expect(c.detail).toMatch(/Mina Cho/); expect(c.detail).toMatch(/Subject:/)
  })
  it('the card shows a placeholder where the link goes, so the real link is never written onto a card', () => {
    expect(outreachCard(input('CUSTOMER', null)).detail).toContain(UNSUBSCRIBE_PLACEHOLDER)
  })
  it('each reason no letter was drafted reads as its own sentence naming the fix', () => {
    const q = { side: 'CUSTOMER' as const, firmName: 'Win Firm', companyName: 'Orchid Foods', lastActivity: null }
    expect(blockedCard(q, 'NO_CONTACT').proof).toMatch(/No one with an email is recorded at Orchid Foods/)
    expect(blockedCard(q, 'OPTED_OUT').proof).toMatch(/asked Win Firm for no more check-in letters/)
    expect(blockedCard(q, 'BOUNCED').proof).toMatch(/did not receive the last check-in letter. Record a new address/)
    expect(blockedCard(q, 'NO_ADDRESS').proof).toMatch(/Add the firm's address in Settings/)
  })
  it('the customer card and the supplier card for one company open with different words', () => {
    expect(outreachCard(input('CUSTOMER')).question.slice(0, 30)).not.toEqual(outreachCard(input('SUPPLIER')).question.slice(0, 30))
  })
})

describe('the opt-out and the chases', () => {
  it('the submission chase and the money chase never read the unsubscribe, so an opt-out cannot stop them', () => {
    for (const f of ['src/lib/agents/submission-chase.ts', 'src/lib/agents/submission-chase-rules.ts', 'src/lib/money/money-owed-chase.ts']) {
      expect(readFileSync(`${process.cwd()}/${f}`, 'utf8')).not.toMatch(/outreachOptOutAt|outreach-optout/)
    }
  })
  it('only the dormant outreach reads the unsubscribe, and it reads it before it sends', () => {
    const src = readFileSync(`${process.cwd()}/src/lib/agents/dormant-outreach.ts`, 'utf8')
    expect(src.indexOf('outreachOptOutAt')).toBeGreaterThan(-1)
    expect(src.indexOf('outreachOptOutAt')).toBeLessThan(src.indexOf('await send('))
  })
})
