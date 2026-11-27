/**
 * Update letters to candidates (record 117, the lead's ruling of 2026-11-27):
 * the rules, with no database. A candidate is written to only on her own
 * standing yes, and the letter says how to take it back.
 */
import { describe, it, expect } from 'vitest'
import { buildCandidateAudience, buildCandidateLetter, candidateCard, candidatePlan, candidateHeldSays, STOP_UPDATES_PLACEHOLDER, type CandidateFact } from '@/lib/outreach/candidate-rules'
import { candidateOutreachNotYours } from '@/lib/outreach/candidate-batch'

const d = (s: string) => new Date(`${s}T12:00:00Z`)
const TODAY = d('2026-11-27')
const fact = (name: string, o: Partial<CandidateFact> = {}): CandidateFact => ({
  personId: `p-${name}`, name, email: `${name.toLowerCase()}@example.invalid`, updatesYesAt: d('2026-11-01'), updatesRevokedAt: null,
  bouncedAddress: false, lastWrittenOn: null, ...o,
})

describe('who an update letter goes to', () => {
  it('a candidate with a recorded yes to updates is written to and one with no yes is not', () => {
    const out = buildCandidateAudience([fact('Asha'), fact('Ben', { updatesYesAt: null })], TODAY)
    expect(out.to.map((t) => t.name)).toEqual(['Asha'])
  })
  it('a candidate who took her yes back is not written to, and one who said yes again after taking it back is', () => {
    const out = buildCandidateAudience([
      fact('Cora', { updatesRevokedAt: d('2026-11-10') }),
      fact('Dev', { updatesYesAt: d('2026-11-01'), updatesRevokedAt: d('2026-11-05') }),
      fact('Eli', { updatesYesAt: d('2026-11-20'), updatesRevokedAt: d('2026-11-05') }),
    ], TODAY)
    expect(out.to.map((t) => t.name)).toEqual(['Eli'])
  })
  it('a candidate with no yes is counted and never named, on the list or among the held', () => {
    const out = buildCandidateAudience([fact('Fay', { updatesYesAt: null }), fact('Gus', { updatesYesAt: null, email: null })], TODAY)
    expect(out.withoutYes).toBe(2)
    expect(out.to).toEqual([]); expect(out.held).toEqual([])
  })
  it('a candidate who said yes but has no email address is held with a sentence saying nothing can go', () => {
    const out = buildCandidateAudience([fact('Hana', { email: ' ' })], TODAY)
    expect(out.held).toHaveLength(1)
    expect(out.held[0]).toMatchObject({ reason: 'NO_ADDRESS' })
    expect(out.held[0].says).toContain('no email address')
  })
  it('a candidate whose last update letter bounced is held until she changes her address', () => {
    const out = buildCandidateAudience([fact('Ivy', { bouncedAddress: true })], TODAY)
    expect(out.to).toEqual([]); expect(out.held[0].reason).toBe('BOUNCED')
  })
  it('a candidate written to 179 days ago is held with the date, and one written to 180 days ago is not', () => {
    const out = buildCandidateAudience([fact('Jo', { lastWrittenOn: d('2026-06-01') }), fact('Kai', { lastWrittenOn: d('2026-05-31') })], TODAY)
    expect(out.held.map((h) => h.name)).toEqual(['Jo'])
    expect(out.held[0].says).toContain('180 days')
    expect(out.to.map((t) => t.name)).toEqual(['Kai'])
  })
  it('a candidate listed twice gets one letter', () => {
    expect(buildCandidateAudience([fact('Lia'), fact('Lia')], TODAY).to).toHaveLength(1)
  })
  it('a held sentence never carries an email address', () => {
    for (const r of ['NO_ADDRESS', 'BOUNCED', 'COOLING_OFF'] as const) expect(candidateHeldSays(r, 'Max', d('2026-06-01'))).not.toMatch(/@/)
  })
})

describe('the update letter and its card', () => {
  const letter = buildCandidateLetter({ firm: 'Win Firm', postal: '12 Mill Road, Leeds', recipientName: 'Asha', subject: 'Two data jobs', body: 'We have two data jobs open.', stopUrl: 'https://etyme.example/answer/updates/abc.def', storefrontUrl: null })
  it('the letter says who sends it and where, why she got it, and carries a link that stops updates with no sign-in', () => {
    expect(letter.text).toContain('Win Firm\n12 Mill Road, Leeds')
    expect(letter.text).toContain('you said yes to updates')
    expect(letter.text).toContain('Stop them here, no sign-in needed: https://etyme.example/answer/updates/abc.def')
    expect(letter.text).toContain('ends updates from every firm')
  })
  it('the letter has no interested link and no tracking', () => {
    expect(letter.text).not.toMatch(/interested/i)
    expect((letter.text.match(/https?:\/\//g) ?? []).length).toBe(1)
  })
  it('the card shows a placeholder where the stop link goes, never a live link', () => {
    const card = buildCandidateLetter({ firm: 'Win Firm', postal: 'x', recipientName: 'A', subject: 's', body: 'b', stopUrl: null, storefrontUrl: null })
    expect(card.text).toContain(STOP_UPDATES_PLACEHOLDER)
  })
  it('the plan is one letter to each candidate, never sent again', () => {
    const p = candidatePlan(3)
    expect(p).toMatchObject({ retries: 0, recipients: 3, letterRecordType: 'OutreachLetter' })
    expect(p.messages).toHaveLength(1)
  })
  it('the card names the people, counts the candidates who have not said yes without naming them, and carries no address', () => {
    const card = candidateCard({ firm: 'Win Firm', subject: 'Two data jobs', letter: letter.text, to: [{ name: 'Asha' }], held: [], withoutYes: 4 })
    expect(card.question).toContain('1 candidate?')
    expect(card.detail).toContain('Asha')
    expect(card.detail).toContain('4 candidates have not said yes to updates and are not written to.')
    expect(card.detail).not.toMatch(/@example/)
  })
})

describe('who may write to candidates', () => {
  it('a client buys and sends no update letters, whatever its seat holds', () => {
    expect(candidateOutreachNotYours({ permissions: ['*'], company: { kind: 'CLIENT' } })).toMatch(/client buys/)
  })
  it('a seat that does not read the firm’s candidates is refused in a sentence', () => {
    expect(candidateOutreachNotYours({ permissions: ['vendors.read'], company: { kind: 'VENDOR' } })).toMatch(/see the firm’s candidates/)
  })
  it('a seat that reads candidates at a firm that sells may write', () => {
    expect(candidateOutreachNotYours({ permissions: ['consultants.read'], company: { kind: 'VENDOR' } })).toBeNull()
  })
})
