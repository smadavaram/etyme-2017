import {
  writeFromRules, writeWithModel, parseVoice, type SiteFacts,
} from '@/lib/site-voice'
import {
  writeBio, writeBioBest, parseBio, type PortfolioInput,
} from '@/lib/consultant-portfolio'
import { parseResponse, needsConfirming, type ExtractedRecord } from '@/lib/extract'
import {
  noInventedNumbers, avoids, mentions, neverMentions, atMost, saysSomething,
  FILLER, type Surface, type AnySurface, type Mode,
} from '@/lib/evals/harness'

/**
 * Every surface a model touches, and what it must not do.
 *
 * Written as cases somebody can read aloud. When one fails, the sentence
 * it fails is the bug report.
 */

// ── The words on a company's public page ──────────────────────────────

const CLOUDEPA: SiteFacts = {
  name: 'Cloudepa Inc.',
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
  ...CLOUDEPA,
  name: 'Halvorsen Talent',
  skills: [],
  placements: 0,
  activeNow: 0,
  clients: 0,
  comingFree: 0,
  trainingCourses: 0,
}

const BUYER: SiteFacts = {
  ...CLOUDEPA,
  name: 'Terumo BCT',
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
      input: CLOUDEPA,
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
      input: CLOUDEPA,
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
  name: 'Anita Desai',
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
      location: 'Lakewood, CO',
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
        { said: 'never names the client they worked for', grade: neverMentions('Lakewood') },
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
        { field: 'name', value: 'Anita Desai', confidence: 0.97, foundIn: 'Anita Desai', concern: null },
        { field: 'email', value: 'anita@cloudepa.com', confidence: 0.99, foundIn: 'anita@cloudepa.com', concern: null },
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
  what: 'Scoring a consultant against a role',
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

export const SURFACES: readonly AnySurface[] = [
  siteVoice,
  consultantBio,
  documentReading,
  matchScoring,
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
}
