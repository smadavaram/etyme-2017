import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  requirementLines, pieceKindOf, checkProposal, stateAfterCheck, piecesToAdd, sourceFromRecord, paragraphsFromRules, composeDraft,
  draftProblems, paragraphsOf, reminderLetter, reviewQuestion, type ProposalFacts,
} from '@/lib/proposals/draft-rules'
import { getNavForKind } from '@/lib/nav-table'
import { SKILLS, registryGaps } from '@/lib/skills/registry'
import { planGaps, planOf } from '@/lib/agents/plans'
import '@/lib/agents/proposals-agent'
import { tierIn, defaultContractFor } from '@/lib/twin/role-contract'

const BID = `
Solicitation 24-117, staff augmentation.
1. Provide a certificate of insurance.
2. Provide the hourly rates by labor category.
- Provide resumes of key personnel.
(a) Describe your past performance on similar contracts.
Describe your approach to quality assurance.
ok
`

const facts: ProposalFacts = { firm: 'Quillbrook Staffing', skills: ['SQL', 'Spark', 'Airflow'], people: 4, engagements: 7, clients: 3 }

describe('reading the requirements a person pasted', () => {
  it('a pasted text becomes one line per requirement, with bullets and numbers taken off and short noise left out', () => {
    expect(requirementLines(BID)).toEqual([
      'Provide a certificate of insurance.',
      'Provide the hourly rates by labor category.',
      'Provide resumes of key personnel.',
      'Describe your past performance on similar contracts.',
      'Describe your approach to quality assurance.',
    ])
  })

  it('the same requirement written twice is read once', () => {
    expect(requirementLines('- Provide a rate card for the term.\n- Provide a rate card for the term.')).toHaveLength(1)
  })

  it('a requirement about insurance needs compliance papers, one about rates a rate card, one about resumes key personnel, and one about references past performance', () => {
    expect(pieceKindOf('Provide a certificate of insurance.')).toBe('COMPLIANCE')
    expect(pieceKindOf('Provide the hourly rates by labor category.')).toBe('RATES')
    expect(pieceKindOf('Provide resumes of key personnel.')).toBe('BENCH')
    expect(pieceKindOf('Describe your past performance on similar contracts.')).toBe('PAST_PERFORMANCE')
  })

  it('a requirement no piece answers is a person’s to write and is never filled in', () => {
    expect(pieceKindOf('Describe your approach to quality assurance.')).toBeNull()
  })
})

describe('the checker flags every requirement the record does not answer', () => {
  const lines = requirementLines(BID)

  it('a requirement is in hand only when every piece of its kind is in hand', () => {
    const c = checkProposal(lines, [
      { kind: 'BENCH', label: 'Key personnel', haveIt: true, source: '4 people' },
      { kind: 'COMPLIANCE', label: 'Compliance papers', haveIt: false },
    ])
    expect(c.rows.find((r) => r.kind === 'BENCH')?.status).toBe('IN_HAND')
    expect(c.rows.find((r) => r.kind === 'COMPLIANCE')?.status).toBe('MISSING_PIECE')
    expect(c.rows.find((r) => r.kind === 'RATES')?.status).toBe('MISSING_PIECE')
  })

  it('a requirement with no piece to answer it is flagged for a person to write, and it does not stop an approval', () => {
    const c = checkProposal(lines, [])
    expect(c.toWrite.map((r) => r.text)).toEqual(['Describe your approach to quality assurance.'])
    expect(c.missingPieces).toBe(0)
  })

  it('a proposal waits on pieces while any is missing, and is ready for a person when none is', () => {
    const missing = checkProposal(lines, [{ kind: 'RATES', label: 'Rate card', haveIt: false }])
    const ready = checkProposal(lines, [{ kind: 'RATES', label: 'Rate card', haveIt: true, source: 'Rate sheet, finance drive' }])
    expect(stateAfterCheck(missing)).toBe('NEEDS_PIECES')
    expect(stateAfterCheck(ready)).toBe('READY_FOR_PERSON')
  })

  it('a proposal with nothing pasted and no pieces is not called ready, and says why', () => {
    const c = checkProposal([], [])
    expect(stateAfterCheck(c)).toBe('DRAFT')
    expect(c.nothingToCheck).toMatch(/nothing to check/)
  })

  it('the agent adds a piece only for a kind the requirements name and the proposal does not yet hold', () => {
    expect(piecesToAdd(lines, [{ kind: 'RATES' }])).toEqual(['COMPLIANCE', 'BENCH', 'PAST_PERFORMANCE'])
    expect(piecesToAdd(['Describe your approach to quality assurance.'], [])).toEqual([])
  })
})

describe('what the record may fill in, and what it may not', () => {
  it('key personnel and past performance are read from the record as counts, with no name', () => {
    expect(sourceFromRecord('BENCH', facts)).toBe('4 people on the bench agreed to be listed (counted from the record)')
    expect(sourceFromRecord('PAST_PERFORMANCE', facts)).toBe('7 engagements on the record')
  })

  it('rates and compliance papers are never read from the record: a person says where they are', () => {
    expect(sourceFromRecord('RATES', facts)).toBeNull()
    expect(sourceFromRecord('COMPLIANCE', facts)).toBeNull()
  })

  it('nobody on the bench who agreed to be listed means nothing is claimed for key personnel', () => {
    expect(sourceFromRecord('BENCH', { ...facts, people: 0 })).toBeNull()
  })
})

describe('the draft', () => {
  const draft = composeDraft({ title: 'Solicitation 24-117', buyer: 'County Transit', dueAt: new Date('2027-01-31T00:00:00Z'), facts, ...paragraphsFromRules(facts), check: checkProposal(requirementLines(BID), []) })

  it('states no rate and names nobody, and says nothing has been sent', () => {
    expect(draft).toMatch(/states no rate/)
    expect(draft).toMatch(/No names appear here/)
    expect(draft).toMatch(/Nothing here has been sent/)
    expect(draft).not.toMatch(/\$\s?\d/)
  })

  it('its requirement lines carry no status, because a status goes stale the day a piece arrives', () => {
    const lines = draft.split('## Requirements the buyer set')[1]
    expect(lines).toContain('- Provide a certificate of insurance.')
    expect(lines).not.toMatch(/In hand|Needs |not in the record/)
  })

  it('the two paragraphs a model may write can be found again between their headings', () => {
    expect(paragraphsOf(draft)).toEqual(paragraphsFromRules(facts))
  })

  it('with nothing on the record the rules say a person writes the section instead of making words up', () => {
    const p = paragraphsFromRules({ ...facts, skills: [], engagements: 0, clients: 0 })
    expect(p.capability).toMatch(/a person writes this section/)
    expect(p.pastWork).toMatch(/a person writes this section/)
  })
})

describe('what a model’s words must pass before they are used', () => {
  const ok = { capability: 'Quillbrook Staffing supplies contract staff in SQL, Spark and Airflow.', pastWork: 'The firm has 7 engagements with 3 clients.' }

  it('words drawn from the record pass', () => {
    expect(draftProblems(ok, facts)).toEqual([])
  })

  it('words that state an amount of money do not pass', () => {
    expect(draftProblems({ ...ok, capability: 'Senior engineers at $95 an hour.' }, facts).join(' ')).toMatch(/amount of money/)
  })

  it('words that say the firm is certified, insured or registered do not pass, because only a person writes compliance statements', () => {
    for (const w of ['We are a certified small business.', 'The firm is fully insured.', 'Registered in SAM.']) {
      expect(draftProblems({ ...ok, capability: w }, facts).join(' '), w).toMatch(/compliance statement/)
    }
  })

  it('a number the record does not hold does not pass', () => {
    expect(draftProblems({ ...ok, pastWork: 'The firm has 40 engagements with 3 clients.' }, facts).join(' ')).toMatch(/number the record does not hold: 40/)
  })

  it('an empty paragraph does not pass', () => {
    expect(draftProblems({ ...ok, pastWork: ' ' }, facts)[0]).toMatch(/empty/)
  })
})

describe('the words a person reads', () => {
  it('a reminder names each piece, the due day, and says nothing has gone to the agency', () => {
    const l = reminderLetter({ firm: 'Quillbrook Staffing', seatName: 'Dana', title: 'Solicitation 24-117', dueAt: new Date('2027-01-31T00:00:00Z'), pieces: ['Rate card', 'Compliance papers'], link: 'https://etyme.example/dashboard/proposals' })
    expect(l.text).toContain('- Rate card')
    expect(l.text).toContain('- Compliance papers')
    expect(l.text).toContain('2027-01-31')
    expect(l.text).toMatch(/Nothing has been sent to the agency/)
  })

  it('the card’s question stays at twelve words or fewer however long the title is', () => {
    const q = reviewQuestion('Request for proposals number 24-117 for county wide information technology staff augmentation services')
    expect(q.split(/\s+/).length).toBeLessThanOrEqual(12)
    expect(q).toMatch(/^Approve the proposal for /)
  })
})

describe('the agent’s skills and its limits', () => {
  it('the registry still stands with the four proposal skills, and only the draft calls a model', () => {
    expect(registryGaps()).toEqual([])
    const mine = SKILLS.filter((s) => s.usedBy.includes('proposals-agent') && s.key.startsWith('proposal.'))
    expect(mine.map((s) => [s.key, s.tier])).toEqual([['proposal.draft', 'LOW'], ['proposal.check', 'RULES'], ['proposal.ask', 'RULES'], ['proposal.chase', 'RULES']])
  })

  it('the agent’s plan names its four proposal skills, the portal answers skill and the one letter-sending skill, and stands with no gap', () => {
    expect(planOf('proposals-agent')?.skills).toEqual(['proposal.draft', 'proposal.check', 'proposal.ask', 'proposal.chase', 'registration.draft', 'chase.send'])
    expect(planGaps(planOf('proposals-agent')!)).toEqual([])
  })

  it('the only skill that may send is still the one approved-letter skill, now also under the proposal reminder task', () => {
    expect(SKILLS.filter((s) => s.maySend).map((s) => s.key)).toEqual(['chase.send'])
    expect(SKILLS.find((s) => s.key === 'chase.send')!.taskKinds).toContain('PROPOSAL_CHASE')
  })

  it('submitting, signing and publishing compliance copy stay never-tier, while drafting and asking may be done alone and a reminder asks first', () => {
    const c = defaultContractFor('SUPPLIER')
    for (const a of ['proposal.submit', 'proposal.sign', 'proposal.publish_compliance_copy']) expect(tierIn(c, a)).toBe('NEVER')
    expect(tierIn(c, 'proposal.draft')).toBe('ACTS_ALONE')
    expect(tierIn(c, 'proposal.ask')).toBe('ACTS_ALONE')
    expect(tierIn(c, 'proposal.chase')).toBe('NEEDS_APPROVAL')
  })

  it('a client’s twin does none of the proposal acts', () => {
    const c = defaultContractFor('PROGRAM_MANAGER')
    for (const a of ['proposal.draft', 'proposal.ask', 'proposal.chase']) expect(tierIn(c, a)).toBe('NEVER')
  })

  it('the agent’s own code has no way to approve a proposal or to mark one sent', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/agents/proposals-agent.ts'), 'utf8')
    expect(src).not.toMatch(/approveByPerson|proposals\/approve|moveRefusal\('PERSON'/)
    expect(src).not.toMatch(/state:\s*'(APPROVED|SUBMITTED)'/)
    expect(src).not.toMatch(/submittedAt|approvedAt|submittedById/)
  })
})

describe('the Proposals page under Jobs', () => {
  const labels = (kind: Parameters<typeof getNavForKind>[0], plugins: string[]) => getNavForKind(kind, false, { plugins }).flatMap((s) => s.items.map((i) => i.label))
  const hrefs = (kind: Parameters<typeof getNavForKind>[0], plugins: string[]) => getNavForKind(kind, false, { plugins }).flatMap((s) => s.items.map((i) => i.href))

  it('a supplier and an integrator are offered it where the plugin is on', () => {
    expect(labels('VENDOR', ['PUBLIC_SECTOR'])).toContain('Proposals')
    expect(labels('GSI', ['PUBLIC_SECTOR'])).toContain('Proposals')
  })

  it('it is not drawn while the plugin is off', () => {
    expect(labels('VENDOR', [])).not.toContain('Proposals')
    expect(hrefs('VENDOR', ['PODS'])).not.toContain('/dashboard/proposals')
  })

  it('a client and an MSP are never offered it', () => {
    expect(labels('CLIENT', ['PUBLIC_SECTOR'])).not.toContain('Proposals')
    expect(labels('MSP', ['PUBLIC_SECTOR'])).not.toContain('Proposals')
  })
})
