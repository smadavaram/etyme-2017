import { describe, it, expect } from 'vitest'
import { questionLines, answerFor, draftRegistration, registrationProblems, type RegistrationFacts } from '@/lib/diversity/registration-rules'
import {
  checkProposal, stateAfterCheck, composeDraft, paragraphsFromRules, draftProblems, certificationClaimProblems, type ProposalFacts,
} from '@/lib/proposals/draft-rules'

const day = new Date('2027-03-01T00:00:00Z')
const none: RegistrationFacts = { legalName: null, held: [], attested: [] }
const held: RegistrationFacts = { legalName: 'Example Staffing Inc.', held: ['8(a)'], attested: [{ fact: 'MINORITY_OWNED', words: 'Minority-owned', byName: 'Pat Owner', at: new Date('2026-12-01T00:00:00Z') }] }
const facts: ProposalFacts = { firm: 'Example Staffing', skills: ['SQL'], people: 2, engagements: 3, clients: 1, legalName: null, held: [] }

describe('a set-aside bid and what the draft may claim', () => {
  it('a bid set aside for 8(a) firms is not ready for a person while the 8(a) certification is not held', () => {
    const c = checkProposal([], [], { eligible: false, says: 'This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.' })
    expect(c.ineligible).toBe('This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.')
    expect(stateAfterCheck(c)).toBe('NEEDS_PIECES')
  })
  it('an open bid, or a set-aside bid the firm is eligible for, is checked the way it was before', () => {
    expect(checkProposal([], [], { eligible: true, says: null }).ineligible).toBeNull()
    expect(stateAfterCheck(checkProposal([], [{ kind: 'RATES', label: 'Rate card', haveIt: true }], { eligible: true, says: null }))).toBe('READY_FOR_PERSON')
  })
  it('the draft lists only the certifications held today, and says none is held when none is', () => {
    const noneHeld = composeDraft({ title: 'RFP 1', buyer: null, dueAt: null, facts, ...paragraphsFromRules(facts), check: checkProposal([], []) })
    expect(noneHeld).toContain('## Certifications')
    expect(noneHeld).toContain('No certification is held on the record, so this draft claims none.')
    const f2 = { ...facts, held: ['8(a)'] }
    expect(composeDraft({ title: 'RFP 1', buyer: null, dueAt: null, facts: f2, ...paragraphsFromRules(f2), check: checkProposal([], []) })).toContain('Held today: 8(a)')
  })
  it('the draft says so in a sentence when the bid is set aside and the certification is not held, and still claims nothing', () => {
    const says = 'This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.'
    const d = composeDraft({ title: 'RFP 1', buyer: null, dueAt: null, facts, ...paragraphsFromRules(facts), check: checkProposal([], [], { eligible: false, says }), setAside: says })
    expect(d).toContain(says)
    expect(certificationClaimProblems(d, [])).toEqual([])
  })
  it('a draft that says Held today for a certification the record does not hold is a problem', () => {
    expect(certificationClaimProblems('## Certifications\nHeld today: 8(a)\n', [])).toEqual(['The draft claims 8(a), which the record does not hold today.'])
    expect(certificationClaimProblems('## Certifications\nHeld today: 8(a)\n', ['8(a)'])).toEqual([])
  })
  it('a model paragraph that says the firm is 8(a), MBE, WBE or HUBZone certified is refused', () => {
    for (const w of ['The firm is an 8(a) firm.', 'We are an MBE.', 'A WBE supplier.', 'HUBZone based.']) {
      expect(draftProblems({ capability: w, pastWork: 'Example Staffing has 3 engagements.' }, facts).join(' ')).toMatch(/compliance statement/)
    }
  })
  it('the draft names the legal entity the Owner entered, and says where to enter it when it is empty', () => {
    const empty = composeDraft({ title: 'RFP 1', buyer: null, dueAt: null, facts, ...paragraphsFromRules(facts), check: checkProposal([], []) })
    expect(empty).toContain('The legal entity name is not set.')
    const f2 = { ...facts, legalName: 'Entered Entity LLC' }
    expect(composeDraft({ title: 'RFP 1', buyer: null, dueAt: null, facts: f2, ...paragraphsFromRules(f2), check: checkProposal([], []) })).toContain('Entity: Entered Entity LLC')
  })
})

describe('the answers the agent drafts for a diversity portal', () => {
  it('each pasted question becomes a line, with numbers and bullets taken off', () => {
    expect(questionLines('1. What is your legal business name?\n- Are you minority-owned?\nno')).toEqual(['What is your legal business name?', 'Are you minority-owned?'])
  })
  it('the legal name question is answered with the name the Owner entered, and left to a person where none is entered', () => {
    expect(answerFor('What is your legal business name?', held).answer).toBe('Legal entity: Example Staffing Inc.')
    expect(answerFor('What is your legal business name?', none).answer).toMatch(/^A person answers\./)
  })
  it('a question about 8(a) is answered held where it is held, and says not held yet where it is not', () => {
    expect(answerFor('Do you hold an 8(a) certification?', held).answer).toBe('Held today: 8(a)')
    expect(answerFor('Do you hold an 8(a) certification?', none).answer).toMatch(/^Not held yet: 8\(a\)\. This draft claims no certification/)
  })
  it('a question about minority ownership is answered only from the Owner’s attestation, naming who and when', () => {
    expect(answerFor('Is the business minority-owned?', held).answer).toBe('Attested by the Owner: Minority-owned, attested by Pat Owner on 2026-12-01')
    expect(answerFor('Is the business minority-owned?', none).answer).toMatch(/^A person answers\. The Owner has not attested/)
  })
  it('a woman-owned question is not answered by a minority-owned attestation', () => {
    expect(answerFor('Is the business woman-owned?', held).answer).toMatch(/^A person answers\./)
  })
  it('any other question is left to a person', () => {
    expect(answerFor('Describe your approach to quality.', held).answer).toBe('A person answers.')
  })
  it('a certification question with nothing held says none is held and claims none', () => {
    expect(answerFor('List your certifications.', none).answer).toBe('No certification is held on the record yet. This draft claims none. A person answers.')
  })
  it('no questions pasted means nothing is drafted, and the sentence says why', () => {
    expect(draftRegistration('', held).nothing).toMatch(/Paste the portal/)
  })
  it('what the agent drafts reads back clean against the same record', () => {
    const d = draftRegistration('What is your legal business name?\nDo you hold an 8(a) certification?\nIs the business minority-owned?\nHUBZone certified?', held)
    expect(registrationProblems(d.text, held)).toEqual([])
  })
  it('a claim the record no longer supports is a problem: a lapsed certification or a withdrawn attestation', () => {
    const d = draftRegistration('Do you hold an 8(a) certification?\nIs the business minority-owned?', held)
    const now: RegistrationFacts = { ...held, held: [], attested: [] }
    expect(registrationProblems(d.text, now)).toEqual(['It claims 8(a), which the record does not hold today.', 'It says "Minority-owned", which the Owner has not attested.'])
  })
  it('an answer written by hand that says minority-owned with no attestation is a problem', () => {
    expect(registrationProblems('Q1: x\nA: We are a minority-owned firm.', none)).toContain('It states an ownership fact the Owner has not attested.')
  })
})

void day
