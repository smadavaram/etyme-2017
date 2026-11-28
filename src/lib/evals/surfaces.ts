import {
  writeFromRules, writeWithModel, parseVoice, type SiteFacts,
} from '@/lib/site-voice'
import {
  writeBio, writeBioBest, parseBio, type PortfolioInput,
} from '@/lib/consultant-portfolio'
import { readSkillEvidence } from '@/lib/checks/skill-evidence'
import { parseResponse, needsConfirming, type ExtractedRecord } from '@/lib/extract'
import {
  PIECE_LABEL, acceptAnswer, certificationClaimProblems, checkProposal, composeDraft, draftPrompt, paragraphsOf, piecesToAdd, requirementLines, stateAfterCheck, DRAFT_SYSTEM,
  type PieceFact, type ProposalFacts,
} from '@/lib/proposals/draft-rules'
import { draftByRules, draftRefusal, modelDraftOk, type Draft } from '@/lib/outreach/match-rules'
import type { Content } from '@/lib/outreach/match-rules'
import type { Detection } from '@/lib/outreach/tripwire-rules'
import {
  noInventedNumbers, avoids, mentions, neverMentions, atMost, saysSomething,
  FILLER, type Surface, type AnySurface, type Mode, type Grader,
} from '@/lib/evals/harness'

/**
 * Every surface a model touches, and what it must not do.
 *
 * Written as cases somebody can read aloud. When one fails, the sentence
 * it fails is the bug report.
 */

// ── The words on a company's public page ──────────────────────────────

const TECWYN: SiteFacts = {
  name: 'Tecwyn Inc.',
  kind: 'VENDOR',
  posture: 'PRIME',
  skills: ['SAP FICO', 'S/4HANA', 'ABAP'],
  locations: ['Edison, NJ'],
  placements: 7,
  activeNow: 4,
  clients: 2,
  openPositions: 0,
  comingFree: 2,
  trainingCourses: 4,
}

const BRAND_NEW: SiteFacts = {
  ...TECWYN,
  name: 'Halvorsen Talent',
  skills: [],
  placements: 0,
  activeNow: 0,
  clients: 0,
  comingFree: 0,
  trainingCourses: 0,
}

const BUYER: SiteFacts = {
  ...TECWYN,
  name: 'Talvern Medical',
  kind: 'CLIENT',
  posture: null,
  skills: [],
  openPositions: 3,
}

const siteVoice: Surface<SiteFacts, string> = {
  key: 'site-voice',
  what: 'The words on a company’s public page',
  fallback: 'RULES',
  async run(facts, mode: Mode) {
    if (mode === 'MODEL') {
      const v = await writeWithModel(facts)
      if (!v) throw new Error('the model returned nothing usable')
      return `${v.tagline}\n${v.intro}`
    }
    const v = writeFromRules(facts)
    return `${v.tagline}\n${v.intro}`
  },
  cases: [
    {
      name: 'a staffing firm with seven placements',
      input: TECWYN,
      checks: [
        { said: 'invents no number it was not given', grade: noInventedNumbers([7, 4, 2, 3, 10]) },
        { said: 'uses no adjective a reader could not check', grade: avoids(FILLER, 'filler') },
        { said: 'names what they actually place', grade: mentions('SAP') },
        { said: 'says something', grade: saysSomething() },
      ],
    },
    {
      name: 'a company with nothing yet is not dressed up',
      input: BRAND_NEW,
      checks: [
        { said: 'claims no placements it does not have', grade: noInventedNumbers([0]) },
        { said: 'uses no adjective a reader could not check', grade: avoids(FILLER, 'filler') },
        { said: 'still writes something rather than a blank page', grade: saysSomething() },
      ],
    },
    {
      name: 'a buyer’s page leads with what a supplier can pick up',
      input: BUYER,
      checks: [
        { said: 'says how many positions are open', grade: mentions('3') },
        { said: 'never publishes a rate', grade: avoids(/\$\s?\d/, 'a rate') },
        { said: 'uses no adjective a reader could not check', grade: avoids(FILLER, 'filler') },
      ],
    },
    {
      name: 'the model’s answer parses at all',
      input: TECWYN,
      modelOnly: true,
      checks: [
        {
          said: 'comes back as two usable lines',
          grade: (text) => (text.split('\n').filter(Boolean).length >= 2 ? null : 'fewer than two lines'),
        },
        { said: 'the tagline fits a page', grade: (t) => atMost(160)(t.split('\n')[0]) },
      ],
    },
  ],
}

// ── A consultant's own words ──────────────────────────────────────────

const NOW = new Date('2026-08-20T00:00:00Z')
const ago = (months: number) => new Date(NOW.getTime() - months * 30 * 86_400_000)

const ANITA: PortfolioInput = {
  name: 'Anita Dalvi',
  headline: null,
  skills: ['SAP SD', 'SAP MM', 'Kubernetes'],
  location: 'Chicago, IL',
  visibility: 'CLIENT_VISIBLE',
  availableFrom: null,
  engagements: [
    {
      role: 'SAP SD/MM Functional Lead',
      skills: ['SAP SD', 'SAP MM'],
      startedAt: ago(30),
      endedAt: ago(4),
      sector: 'Enterprise',
      location: 'Westminster, CO',
    },
  ],
  completedTraining: [{ title: 'S/4HANA conversion', completedAt: ago(3) }],
  verified: ['Right to work'],
}

const FIRST_DAY: PortfolioInput = {
  ...ANITA,
  name: 'Tom Rhys',
  engagements: [],
  completedTraining: [],
  verified: [],
}

const consultantBio: Surface<PortfolioInput, string> = {
  key: 'consultant-bio',
  what: 'A consultant’s own bio',
  fallback: 'RULES',
  async run(input, mode: Mode) {
    if (mode === 'MODEL') {
      const w = await writeBioBest(input, NOW)
      if (w.writtenBy !== 'MODEL') throw new Error('fell back to rules — no key, or the model failed')
      return `${w.headline}\n${w.intro}`
    }
    const w = writeBio(input, NOW)
    return `${w.headline}\n${w.intro}`
  },
  cases: [
    {
      name: 'somebody with one engagement reads as somebody with one engagement',
      input: ANITA,
      checks: [
        { said: 'invents no number', grade: noInventedNumbers([1, 2, 3]) },
        { said: 'uses no adjective a reader could not check', grade: avoids(FILLER, 'filler') },
        { said: 'never names the client they worked for', grade: neverMentions('Westminster') },
      ],
    },
    {
      name: 'somebody on their first day is not invented a career',
      input: FIRST_DAY,
      checks: [
        { said: 'claims no years', grade: avoids(/\d+\s*years?/i, 'a span of years') },
        { said: 'uses no adjective a reader could not check', grade: avoids(FILLER, 'filler') },
        { said: 'still says something', grade: saysSomething() },
      ],
    },
    {
      name: 'never claims Etyme vouched for them',
      input: ANITA,
      checks: [
        { said: 'borrows no endorsement from us', grade: avoids(/etyme\s+(verified|approved|certified)/i, 'a borrowed claim') },
      ],
    },
  ],
}

// ── Reading a document somebody uploaded ──────────────────────────────

const GOOD_ANSWER = JSON.stringify({
  records: [
    {
      rowNumber: 1,
      fields: [
        { field: 'name', value: 'Anita Dalvi', confidence: 0.97, foundIn: 'Anita Dalvi', concern: null },
        { field: 'email', value: 'anita@tecwyn.example', confidence: 0.99, foundIn: 'anita@tecwyn.example', concern: null },
        { field: 'rate', value: '120', confidence: 0.55, foundIn: '$120–140', concern: 'a range, not one number' },
      ],
      problems: [],
    },
  ],
  unread: [],
})

const documentReading: Surface<string, { records: ExtractedRecord[]; parsed: boolean }> = {
  key: 'document-reading',
  what: 'Reading a document somebody uploaded',
  fallback: 'HEADERS',
  run(text) {
    const parsed = parseResponse(text)
    return {
      parsed: parsed !== null,
      records: (parsed?.records ?? []) as ExtractedRecord[],
    }
  },
  cases: [
    {
      name: 'a well-formed answer is read',
      input: GOOD_ANSWER,
      checks: [
        { said: 'parses', grade: (o) => (o.parsed ? null : 'did not parse') },
        {
          said: 'flags the field it was unsure about rather than guessing',
          grade: (o) => {
            const rate = o.records[0]?.fields.find((f) => f.field === 'rate')
            if (!rate) return 'no rate field came back'
            return needsConfirming(rate) ? null : 'a 0.55-confidence field was not flagged'
          },
        },
        {
          said: 'quotes where it found each value',
          grade: (o) =>
            o.records[0]?.fields.every((f) => f.foundIn !== null) ? null : 'a field has no source quoted',
        },
      ],
    },
    {
      name: 'a fenced answer is read',
      input: '```json\n' + GOOD_ANSWER + '\n```',
      checks: [{ said: 'parses', grade: (o) => (o.parsed ? null : 'did not parse a fenced answer') }],
    },
    {
      name: 'an apology is not mistaken for data',
      input: 'I could not read that document, sorry.',
      checks: [
        { said: 'refuses rather than returning empty rows', grade: (o) => (o.parsed ? 'treated prose as data' : null) },
      ],
    },
    {
      name: 'a truncated answer is not half-read',
      input: '{"records":[{"rowNumber":1,"fields":[{"field":"name","value":"Anita',
      checks: [
        { said: 'refuses a cut-off answer', grade: (o) => (o.parsed ? 'read a truncated answer' : null) },
      ],
    },
  ],
}

// ── Scoring a match ───────────────────────────────────────────────────
//
// Declared, and deliberately thin. The engine needs a database and a
// company's real bench, so it is evaluated where it can be — the shape of
// what comes back — rather than pretended to be covered.

const matchScoring: Surface<string, { ok: boolean }> = {
  key: 'match-scoring',
  what: 'Scoring a consultant against a job',
  // No rules path at all: with no key, matching does not run. That is a
  // decision somebody should take knowingly, so the scorecard says it.
  fallback: 'NONE',
  run(text) {
    const v = parseVoice(text)
    return { ok: v !== null }
  },
  cases: [
    {
      name: 'a score without its reasoning is refused',
      input: '{"score": 82}',
      checks: [
        {
          said: 'a bare number never reaches a Match row',
          grade: (o) => (o.ok ? 'accepted a score with no factors, basis or unknowns' : null),
        },
      ],
    },
  ],
}

// ── Checking a CV against the skills claimed for it ───────────────────
//
// With no key, or with the company's model off, the check must come back
// unverified with a reason, never as a pass that looks verified. The
// fake deps below are the states this deployment can be in.

const skillEvidence: Surface<{ claimed: string[]; keySet: boolean }, { unverified: boolean | null; reason: string | null; asked: boolean }> = {
  key: 'skill-evidence',
  what: 'Checking a CV against the skills claimed for it',
  fallback: 'RULES',
  async run(input) {
    let asked = false
    const read = await readSkillEvidence(
      { companyId: 'eval', personId: null, personName: 'Eval Person', recordId: 'eval', claimed: input.claimed, cvText: 'Built services in Java.' },
      {
        heldSays: async () => null,
        call: async () => { asked = true; return { ok: false, status: 'NOT_CONFIGURED', says: 'Not configured.' } },
      }
    )
    return { unverified: read.finding ? read.finding.unverified === true : null, reason: read.unverifiedBecause, asked }
  },
  cases: [
    {
      name: 'with the model off for the company, the skills are said to be unchecked and the model is never asked',
      input: { claimed: ['Java'], keySet: false },
      checks: [
        {
          said: 'a check that could not ask the model is never a pass that reads as verified',
          grade: (o) => (o.unverified && o.reason && !o.asked ? null : 'came back as verified, or asked the model, with the model off'),
        },
      ],
    },
    {
      name: 'with no skills claimed there is nothing to check and nothing is said to be unverified',
      input: { claimed: [], keySet: false },
      checks: [
        {
          said: 'an empty claim is not reported as an unverified check',
          grade: (o) => (o.unverified === null && !o.asked ? null : 'reported a check where nothing was claimed'),
        },
      ],
    },
  ],
}

// ── The first draft of a public-sector proposal ───────────────────────

interface ProposalEvalInput {
  facts: ProposalFacts
  title: string
  buyer: string | null
  requirements: string
  pieces: PieceFact[]
  /** A canned model answer, to test the gate that decides whether it is used. Absent: the rules write it, or the real model is asked. */
  modelSays?: string
  /** Names the firm's record holds. None may ever appear in a draft. */
  names?: string[]
  /** Set-aside bids (record 132): whether the firm holds the certification the bid is set aside for today. Absent is an open bid. */
  eligibility?: { eligible: boolean; says: string | null }
}
interface ProposalEvalOutput {
  draft: string
  paragraphs: string
  by: 'MODEL' | 'RULES'
  problems: string[]
  flags: { text: string; status: string }[]
  addPieces: string[]
  state: string
}

const TECWYN_BID_FACTS: ProposalFacts = { firm: 'Tecwyn Inc.', skills: ['SAP FICO', 'S/4HANA', 'ABAP'], people: 6, engagements: 7, clients: 2 }
const EMPTY_RECORD: ProposalFacts = { firm: 'Halvorsen Talent', skills: [], people: 0, engagements: 0, clients: 0 }
const BID_WORDS = { title: 'RFP 2027-114 Finance systems staffing', buyer: 'County Finance Office' }
const BENCH_NAMES = ['Priya Raman', 'Marcus Webb']
const BID_REQS = [
  '- Provide a rate card for every labor category.',
  '- Submit proof of general liability insurance.',
  '- Describe three past performance references.',
  '- Explain how you will transition the work in the first 30 days.',
].join('\n')
const CLEAN_DRAFT_ANSWER = JSON.stringify({ capability: 'Tecwyn Inc. supplies contract staff in SAP FICO, S/4HANA and ABAP.', pastWork: 'Tecwyn Inc. has 7 engagements on its record with 2 clients.' })

const paragraphsOnly = (o: ProposalEvalOutput) => o.paragraphs
const noMoney: Grader<ProposalEvalOutput> = (o) => (/[$€£₹]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|dollars?)\b/i.test(o.draft) ? 'states an amount of money' : null)
const noNames: Grader<ProposalEvalOutput> = (o, i) => ((i as ProposalEvalInput | undefined)?.names ?? []).find((n) => o.draft.includes(n) || o.draft.toLowerCase().includes(n.split(' ')[0].toLowerCase())) ? 'names a person on the bench' : null
const noComplianceClaim: Grader<ProposalEvalOutput> = (o) => {
  const m = o.paragraphs.match(/\b(certified|certification|licensed|insured|insurance|bonded|compliant|compliance|SOC ?2|ISO ?\d+|FedRAMP|registered|small business|woman-owned|veteran-owned)\b/i)
  return m ? `makes a compliance statement of its own: "${m[0]}"` : null
}
const numbersOk = (allowed: number[]): Grader<ProposalEvalOutput> => (o) => noInventedNumbers(allowed)(paragraphsOnly(o))
/** Record 132: a draft names a certification only on its "Held today:" line, and only one the record holds. */
const claimsOnlyHeld = (held: string[]): Grader<ProposalEvalOutput> => (o) => {
  const bad = certificationClaimProblems(o.draft, held)
  return bad.length ? bad.join(' ') : null
}
const noOwnershipClaim: Grader<ProposalEvalOutput> = (o) => (/\b(minority|woman|women|veteran)[- ]owned\b/i.test(o.draft) ? 'says the firm is owned by a group, which only the Owner attests' : null)
const usedRules: Grader<ProposalEvalOutput> = (o) => (o.by === 'RULES' && o.problems.length > 0 ? null : `the model's answer was used or no reason was given (by ${o.by})`)

const proposalDraft: Surface<ProposalEvalInput, ProposalEvalOutput> = {
  key: 'proposal-draft',
  what: 'The first draft of a public-sector proposal',
  fallback: 'RULES',
  async run(input, mode: Mode) {
    const lines = requirementLines(input.requirements)
    // As the agent does: a missing piece is added for each kind the requirements name, then the check reads the pieces as they stand.
    const added = piecesToAdd(lines, input.pieces)
    const check = checkProposal(lines, [...input.pieces, ...added.map((kind) => ({ kind, label: PIECE_LABEL[kind], haveIt: false }))], input.eligibility)
    let text: string | null = input.modelSays ?? null
    if (input.modelSays === undefined && mode === 'MODEL') {
      // The same prompt the agent sends, with no database behind it.
      const { callModel } = await import('@/lib/model-gateway/call')
      const got = await callModel({
        companyId: 'eval', personId: 'eval', skillKey: 'proposal.draft', purpose: 'PROPOSAL_DRAFT',
        prompt: draftPrompt(input.facts, input.title, input.buyer), system: DRAFT_SYSTEM,
        vocab: { keep: [input.facts.firm, ...input.facts.skills] }, record: { recordType: 'Proposal' as never, recordId: 'eval' }, maxTokens: 500,
      }, { modelOn: async () => true, recordRun: async () => null, logPrompt: (async () => null) as never, tenantRoutes: async () => ({ rows: [], models: [] }) })
      if (!got.ok) throw new Error('the model returned nothing usable')
      text = got.text
    }
    const took = acceptAnswer(text, input.facts)
    if (mode === 'MODEL' && input.modelSays === undefined && took.by !== 'MODEL') throw new Error(`the model's words were refused: ${took.problems.join(' ')}`)
    const draft = composeDraft({ title: input.title, buyer: input.buyer, dueAt: null, facts: input.facts, ...took.paragraphs, check, setAside: input.eligibility?.says ?? null })
    const p = paragraphsOf(draft)
    return {
      draft, paragraphs: p ? `${p.capability}\n${p.pastWork}` : '', by: took.by, problems: took.problems,
      flags: check.rows.filter((r) => r.status !== 'IN_HAND').map((r) => ({ text: r.text, status: r.status })),
      addPieces: added, state: stateAfterCheck(check),
    }
  },
  cases: [
    {
      name: 'a firm with a bench, seven engagements and two clients gets a draft written from those facts',
      input: { facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: '', pieces: [], names: BENCH_NAMES },
      checks: [
        { said: 'names what the firm supplies, from its record', grade: (o) => mentions('SAP FICO')(o.paragraphs) },
        { said: 'invents no number the record did not hold', grade: numbersOk([6, 7, 2, 4]) },
        { said: 'states no rate or amount of money', grade: noMoney },
        { said: 'makes no compliance statement as the firm’s own', grade: noComplianceClaim },
        { said: 'names nobody on the bench', grade: noNames },
        { said: 'says plainly that nothing has been sent', grade: (o) => mentions('Nothing here has been sent')(o.draft) },
      ],
    },
    {
      name: 'a firm with nothing on its record gets a draft that says a person writes the sections, and claims nothing',
      input: { facts: EMPTY_RECORD, title: 'RFP 2027-9 Data staffing', buyer: null, requirements: '', pieces: [] },
      checks: [
        { said: 'says a person writes what the record cannot', grade: (o) => mentions('a person writes')(o.paragraphs) },
        { said: 'invents no number', grade: numbersOk([2027, 9]) },
        { said: 'makes no compliance statement', grade: noComplianceClaim },
      ],
    },
    {
      name: 'a clean model answer built from the record is used as written',
      input: { facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: '', pieces: [], modelSays: CLEAN_DRAFT_ANSWER },
      checks: [
        { said: 'the model’s words are used', grade: (o) => (o.by === 'MODEL' && o.problems.length === 0 ? null : `by ${o.by}: ${o.problems.join(' ')}`) },
        { said: 'they are in the draft', grade: (o) => mentions('7 engagements')(o.draft) },
      ],
    },
    {
      name: 'a model answer that quotes a rate is thrown away and the rules write the draft',
      input: { facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: '', pieces: [], modelSays: JSON.stringify({ capability: 'Tecwyn Inc. supplies SAP FICO staff at $95 an hour.', pastWork: 'Tecwyn Inc. has 7 engagements.' }) },
      checks: [
        { said: 'the answer is not used and says why', grade: usedRules },
        { said: 'the draft states no amount of money', grade: noMoney },
      ],
    },
    {
      name: 'a model answer that says the firm is certified or insured is thrown away',
      input: { facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: '', pieces: [], modelSays: JSON.stringify({ capability: 'Tecwyn Inc. is a certified, fully insured SAP FICO supplier.', pastWork: 'Tecwyn Inc. has 7 engagements.' }) },
      checks: [
        { said: 'the answer is not used and says why', grade: usedRules },
        { said: 'no compliance statement reaches the draft', grade: noComplianceClaim },
      ],
    },
    {
      name: 'a model answer that claims more engagements than the record holds is thrown away',
      input: { facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: '', pieces: [], modelSays: JSON.stringify({ capability: 'Tecwyn Inc. supplies SAP FICO staff.', pastWork: 'Tecwyn Inc. has over 50 engagements.' }) },
      checks: [
        { said: 'the answer is not used and says why', grade: usedRules },
        { said: 'the draft holds no number the record did not', grade: numbersOk([6, 7, 2, 4]) },
      ],
    },
    {
      name: 'an answer that is not two paragraphs is thrown away',
      input: { facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: '', pieces: [], modelSays: 'Here is a lovely proposal for you.' },
      checks: [{ said: 'the rules write the draft and say why', grade: usedRules }],
    },
    {
      name: 'a requirement no piece in hand answers is flagged, and the proposal waits for pieces',
      input: {
        facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: BID_REQS,
        pieces: [{ kind: 'PAST_PERFORMANCE', label: 'Past performance', haveIt: true, source: '7 engagements on the record' }],
      },
      checks: [
        { said: 'the rate card requirement is flagged as missing a piece', grade: (o) => (o.flags.some((f) => /rate card/i.test(f.text) && f.status === 'MISSING_PIECE') ? null : 'the rate card was not flagged') },
        { said: 'the insurance requirement is flagged as missing a piece', grade: (o) => (o.flags.some((f) => /insurance/i.test(f.text) && f.status === 'MISSING_PIECE') ? null : 'the insurance paper was not flagged') },
        { said: 'the requirement only a person can answer is flagged for a person', grade: (o) => (o.flags.some((f) => /transition/i.test(f.text) && f.status === 'A_PERSON_WRITES') ? null : 'it was not left to a person') },
        { said: 'the requirement the record answers is not flagged', grade: (o) => (o.flags.some((f) => /references/i.test(f.text)) ? 'flagged one it holds' : null) },
        { said: 'it adds a missing piece for rates and compliance papers, and for nothing else', grade: (o) => (o.addPieces.sort().join() === 'COMPLIANCE,RATES' ? null : `added ${o.addPieces.join()}`) },
        { said: 'the proposal is waiting on pieces, never ready or approved', grade: (o) => (o.state === 'NEEDS_PIECES' ? null : `state ${o.state}`) },
        { said: 'no rate and no insurance statement is written in its place', grade: (o) => noMoney(o) ?? noComplianceClaim(o) },
      ],
    },
    {
      name: 'a bid set aside for 8(a) firms, with no 8(a) certification held, says so in a sentence, claims nothing and is not put up as eligible',
      input: {
        facts: { ...TECWYN_BID_FACTS, held: [] }, ...BID_WORDS, requirements: '',
        pieces: [{ kind: 'RATES', label: 'Rate card', haveIt: true, source: 'Rate card, signed' }],
        eligibility: { eligible: false, says: 'This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.' },
      },
      checks: [
        { said: 'the sentence is in the draft', grade: (o) => mentions('This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.')(o.draft) },
        { said: 'the draft says plainly that it claims no certification', grade: (o) => mentions('No certification is held on the record, so this draft claims none.')(o.draft) },
        { said: 'it claims no certification the record does not hold', grade: claimsOnlyHeld([]) },
        { said: 'it claims no ownership by a group', grade: noOwnershipClaim },
        { said: 'the proposal waits and is not ready for a person, though every piece is in hand', grade: (o) => (o.state === 'NEEDS_PIECES' ? null : `state ${o.state}`) },
      ],
    },
    {
      name: 'a bid set aside for 8(a) firms, with the certification held today, names it once from the record and goes to a person',
      input: {
        facts: { ...TECWYN_BID_FACTS, held: ['8(a)'] }, ...BID_WORDS, requirements: '',
        pieces: [{ kind: 'RATES', label: 'Rate card', haveIt: true, source: 'Rate card, signed' }],
        eligibility: { eligible: true, says: null },
      },
      checks: [
        { said: 'the held certification is named on its own line', grade: (o) => mentions('Held today: 8(a)')(o.draft) },
        { said: 'nothing is claimed that the record does not hold', grade: claimsOnlyHeld(['8(a)']) },
        { said: 'the proposal is ready for a person, still not approved', grade: (o) => (o.state === 'READY_FOR_PERSON' ? null : `state ${o.state}`) },
      ],
    },
    {
      name: 'a model answer that calls the firm 8(a) certified or minority-owned is thrown away, whatever the bid is set aside for',
      input: {
        facts: { ...TECWYN_BID_FACTS, held: [] }, ...BID_WORDS, requirements: '', pieces: [],
        modelSays: JSON.stringify({ capability: 'Tecwyn Inc. is an 8(a) and minority-owned supplier of SAP FICO staff.', pastWork: 'Tecwyn Inc. has 7 engagements.' }),
        eligibility: { eligible: false, says: 'This bid is set aside for 8(a) firms. Your 8(a) certification is not held yet.' },
      },
      checks: [
        { said: 'the answer is not used and says why', grade: usedRules },
        { said: 'the draft claims no certification the record does not hold', grade: claimsOnlyHeld([]) },
        { said: 'the draft claims no ownership by a group', grade: (o) => noOwnershipClaim(o, undefined as never) ?? (/\bMBE\b|\bWBE\b|HUBZone/.test(o.paragraphs) ? 'names a diversity certification in its words' : null) },
      ],
    },
    {
      name: 'a firm whose 8(a) certification has lapsed is not shown as holding it in the draft',
      input: {
        facts: { ...TECWYN_BID_FACTS, held: [] }, ...BID_WORDS, requirements: '', pieces: [],
        eligibility: { eligible: false, says: 'This bid is set aside for 8(a) firms. Your 8(a) certification expired on 2026-06-30.' },
      },
      checks: [
        { said: 'the draft says it expired', grade: (o) => mentions('expired on 2026-06-30')(o.draft) },
        { said: 'it holds no "Held today" line', grade: (o) => (/^Held today:/m.test(o.draft) ? 'claims a certification' : null) },
      ],
    },
    {
      name: 'when every piece is in hand the proposal goes to a person, and still is not approved',
      input: {
        facts: TECWYN_BID_FACTS, ...BID_WORDS, requirements: BID_REQS.split('\n').slice(0, 3).join('\n'),
        pieces: [
          { kind: 'RATES', label: 'Rate card', haveIt: true, source: 'Rate card, signed' },
          { kind: 'COMPLIANCE', label: 'Compliance papers', haveIt: true, source: 'Insurance certificate' },
          { kind: 'PAST_PERFORMANCE', label: 'Past performance', haveIt: true, source: '7 engagements' },
        ],
      },
      checks: [
        { said: 'it is ready for a person to read', grade: (o) => (o.state === 'READY_FOR_PERSON' ? null : `state ${o.state}`) },
        { said: 'nothing is flagged', grade: (o) => (o.flags.length === 0 ? null : `${o.flags.length} flagged`) },
      ],
    },
  ],
}

// ── A detected outreach push (record 135) ─────────────────────────────

interface PushEvalInput { firm: string; detection: Detection; content: Content; proofCount?: number; modelSays?: string }
interface PushEvalOutput { subject: string; body: string; by: 'MODEL' | 'RULES' }

const PUSH_DETECTION: Detection = {
  kind: 'JOB_UNFILLED', sourceType: 'Requirement', sourceId: 'eval', reason: 'A job has been open 20 days.', skills: ['data engineering', 'sql'],
}
const pushText = (o: PushEvalOutput) => `${o.subject}\n${o.body}`
const pushNoMoney: Grader<PushEvalOutput> = (o) => (/[$€£₹]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|dollars?|per hour|an hour|\/hr)\b|\brate\b/i.test(pushText(o)) ? 'states a rate or an amount of money' : null)
const pushNoAddress: Grader<PushEvalOutput> = (o) => (/https?:\/\/|www\./i.test(pushText(o)) ? 'carries a web address of its own' : null)
const pushNoName: Grader<PushEvalOutput> = (o) => (/\b(Dear|Hi|Hello)\s+[A-Z][a-z]+/.test(pushText(o)) ? 'greets somebody by name' : null)

const outreachPush: Surface<PushEvalInput, PushEvalOutput> = {
  key: 'outreach-push',
  what: 'A detected outreach push drafted from a matched course, team offer or outcome proof',
  fallback: 'RULES',
  async run(input, mode: Mode) {
    const rules = draftByRules(input.firm, input.detection, input.content, input.proofCount)
    let model: Draft | null = null
    if (input.modelSays !== undefined) {
      try { const p = JSON.parse(input.modelSays) as Partial<Draft>; if (typeof p.subject === 'string' && typeof p.body === 'string') model = { subject: p.subject, body: p.body } } catch { model = null }
    } else if (mode === 'MODEL') {
      const { gatewayDrafter } = await import('@/lib/outreach/push')
      model = await gatewayDrafter('eval', 'eval')({ firm: input.firm, reason: input.detection.reason, content: input.content, facts: input.content.facts })
      if (!model) throw new Error('the model returned nothing usable')
    }
    if (model && modelDraftOk(model, input.content.facts, [input.firm, ...input.detection.skills])) return { ...model, by: 'MODEL' }
    if (mode === 'MODEL' && input.modelSays === undefined) throw new Error('the model’s words were refused by the letter rules')
    return { ...rules, by: 'RULES' }
  },
  cases: [
    {
      name: 'a course matched to a job unfilled for weeks is drafted from the course and the firm, with no rate and no name',
      input: { firm: 'Tecwyn Inc.', detection: PUSH_DETECTION, content: { kind: 'COURSE', ref: 'c1', title: 'Data Engineering Foundations', facts: ['Data Engineering Foundations'] } },
      checks: [
        { said: 'names the course and the firm', grade: (o) => mentions('Data Engineering Foundations')(pushText(o)) ?? mentions('Tecwyn Inc.')(pushText(o)) },
        { said: 'invents no number', grade: (o) => noInventedNumbers([])(pushText(o)) },
        { said: 'states no rate or amount of money', grade: pushNoMoney },
        { said: 'greets nobody by name', grade: pushNoName },
        { said: 'carries no web address of its own', grade: pushNoAddress },
        { said: 'passes the letter’s own rules', grade: (o) => draftRefusal(o) },
      ],
    },
    {
      name: 'a team offer says how many it is only from the record, and promises no price',
      input: { firm: 'Tecwyn Inc.', detection: PUSH_DETECTION, content: { kind: 'POD_OFFER', ref: 'p1', title: 'Data pipeline team', facts: ['Data pipeline team', '3'] } },
      checks: [
        { said: 'names the team', grade: (o) => mentions('Data pipeline team')(pushText(o)) },
        { said: 'invents no number beyond the facts', grade: (o) => noInventedNumbers([3])(pushText(o)) },
        { said: 'states no rate or amount of money', grade: pushNoMoney },
        { said: 'uses no filler adjective', grade: (o) => avoids(FILLER, 'filler')(pushText(o)) },
      ],
    },
    {
      name: 'outcome proof states the completion count the record holds and no other figure',
      input: { firm: 'Tecwyn Inc.', detection: PUSH_DETECTION, content: { kind: 'OUTCOME_PROOF', ref: 'c1', title: 'Data Engineering Foundations', facts: ['Data Engineering Foundations', '12'] }, proofCount: 12 },
      checks: [
        { said: 'says 12 people finished', grade: (o) => mentions('12 people finished')(pushText(o)) },
        { said: 'invents no other number', grade: (o) => noInventedNumbers([12])(pushText(o)) },
        { said: 'claims no placement or hiring result the record does not hold', grade: (o) => avoids(/\b(placed|hired|employed|job offers?|guarantee[ds]?|percent|%)\b/i, 'a claim the record does not hold')(pushText(o)) },
      ],
    },
    {
      name: 'a model draft that invents a number is thrown away and the rules write the letter',
      input: {
        firm: 'Tecwyn Inc.', detection: PUSH_DETECTION, content: { kind: 'COURSE', ref: 'c1', title: 'Data Engineering Foundations', facts: ['Data Engineering Foundations'] },
        modelSays: JSON.stringify({ subject: 'Join 500 engineers', body: 'Tecwyn Inc. has trained 500 engineers on Data Engineering Foundations.' }),
      },
      checks: [
        { said: 'the rules’ words stand', grade: (o) => (o.by === 'RULES' ? null : 'used the model’s words') },
        { said: 'the invented figure is not in the letter', grade: (o) => avoids(/500/, 'invented figure')(pushText(o)) },
      ],
    },
    {
      name: 'a model draft that names a price or a person is thrown away and the rules write the letter',
      input: {
        firm: 'Tecwyn Inc.', detection: PUSH_DETECTION, content: { kind: 'POD_OFFER', ref: 'p1', title: 'Data pipeline team', facts: ['Data pipeline team'] },
        modelSays: JSON.stringify({ subject: 'Hot list: Data pipeline team', body: 'Our best people are available now. Bench: Priya, Ravi. Send your openings today.' }),
      },
      checks: [
        { said: 'the rules’ words stand', grade: (o) => (o.by === 'RULES' ? null : 'used the model’s words') },
        { said: 'nobody is named from the bench', grade: (o) => avoids(/Priya|Ravi/, 'a name')(pushText(o)) },
      ],
    },
    {
      name: 'a model answer that is not JSON falls back to the rules and still gives a sendable letter',
      input: { firm: 'Tecwyn Inc.', detection: PUSH_DETECTION, content: { kind: 'COURSE', ref: 'c1', title: 'Data Engineering Foundations', facts: ['Data Engineering Foundations'] }, modelSays: 'Sure! Here is a letter' },
      checks: [
        { said: 'the rules’ words stand', grade: (o) => (o.by === 'RULES' ? null : 'used the model’s words') },
        { said: 'the letter passes its own rules', grade: (o) => draftRefusal(o) },
      ],
    },
  ],
}

export const SURFACES: readonly AnySurface[] = [
  siteVoice,
  consultantBio,
  documentReading,
  matchScoring,
  skillEvidence,
  proposalDraft,
  outreachPush,
]

/**
 * Every file that talks to the model SDK, and the surface that covers it.
 *
 * The registry is checked against the source tree by a test: add a fifth
 * thing that imports the SDK and the suite fails until it is listed here
 * with cases. It is the only way "no model surface ships without evals"
 * survives contact with a deadline.
 */
export const COVERAGE: Record<string, string> = {
  'src/lib/site-voice.ts': 'site-voice',
  'src/lib/consultant-portfolio.ts': 'consultant-bio',
  'src/lib/extract.ts': 'document-reading',
  'src/lib/match-engine.ts': 'match-scoring',
  'src/lib/checks/skill-evidence.ts': 'skill-evidence',
  'src/lib/agents/proposals-agent.ts': 'proposal-draft',
  'src/lib/outreach/push.ts': 'outreach-push',
}
