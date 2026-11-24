import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  COOLING_OFF_DAYS, becameDormant, coolingOffHolds, outreachCard, outreachLetter,
} from '@/lib/agents/dormant-outreach-rules'
import type { CensusRow } from '@/lib/agents/census-rules'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const row = (key: string, standing: 'ACTIVE' | 'DORMANT', side: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER'): CensusRow =>
  ({ key, name: 'Orchid Foods', side, standing, lastActivity: d('2026-08-20') })
const input = (side: 'CUSTOMER' | 'SUPPLIER', recipient: { name: string; email: string } | null = { name: 'Mina Cho', email: 'mina@orchid.example' }) =>
  ({ side, firmName: 'Win Firm', companyName: 'Orchid Foods', lastActivity: d('2026-08-20'), today: d('2026-11-24'), recipient })

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

describe('the draft letter', () => {
  it('a letter to a customer and a letter to a supplier read differently, and each says why the reader got it', () => {
    const c = outreachLetter(input('CUSTOMER')); const s = outreachLetter(input('SUPPLIER'))
    expect(c.text).not.toEqual(s.text)
    expect(c.text).toMatch(/you are getting this because/i); expect(s.text).toMatch(/you are getting this because/i)
    expect(c.text).toMatch(/jobs/i); expect(s.text).toMatch(/people/i)
  })
  it('the letter carries no rate, no link and no name of anyone who worked there', () => {
    for (const side of ['CUSTOMER', 'SUPPLIER'] as const) {
      const l = outreachLetter(input(side))
      expect(l.text + l.subject).not.toMatch(/https?:|www\.|\$|\brate\b|\bworked\b/i)
    }
  })
})

describe('the card', () => {
  it('the card holds the draft and the recipient and says a person sends it and Etyme sent nothing', () => {
    const c = outreachCard(input('CUSTOMER'))
    expect(c.question).toMatch(/A person sends this; Etyme sent nothing\./)
    expect(c.proof).toMatch(/mina@orchid\.example/); expect(c.proof).toMatch(/Mina Cho/)
    expect(c.proof).toMatch(/Subject:/)
  })
  it('a company with no contact on record gets a card that says so and asks for one to be added', () => {
    const c = outreachCard(input('CUSTOMER', null))
    expect(c.proof).toMatch(/No one with an email is recorded at Orchid Foods/)
  })
  it('the customer card and the supplier card for one company open with different words', () => {
    expect(outreachCard(input('CUSTOMER')).question.slice(0, 30)).not.toEqual(outreachCard(input('SUPPLIER')).question.slice(0, 30))
  })
})

describe('the agent never sends this', () => {
  it('neither file of the dormant outreach, nor the census keeper, reaches the mail door', () => {
    for (const f of ['dormant-outreach-rules.ts', 'dormant-outreach.ts', 'census-keeper.ts']) {
      const src = readFileSync(`${process.cwd()}/src/lib/agents/${f}`, 'utf8')
      expect(src).not.toMatch(/mail-door|sendMail|proposeTask|agentTask/)
    }
  })
})
