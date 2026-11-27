/**
 * Supplier-diversity portal registrations (record 132, plugin 5). Pure: no
 * database, no clock, no model.
 *
 * A person pastes the questions a buyer's portal asks. The agent drafts an
 * answer to each from what the firm's own record holds, and only that:
 *  - the legal entity name is the Owner's entry on the company;
 *  - a certification is claimed only where it is held today (the one reader,
 *    `certificationHeldOn`);
 *  - an ownership fact is claimed only where the Owner attested it, and the
 *    answer says who and when.
 * Everything else reads "A person answers." A person edits, submits on the
 * portal herself and marks it here. The agent never submits, signs or attests.
 */
import { CERTIFICATION_KINDS, kindName } from '@/lib/attestation/certification-held'

export const REGISTRATION_AGENT_ACT = 'registration.draft'
export const REGISTRATION_RECORD = 'DiversityRegistration'

/** The prefixes a claim carries, so the checker can read every claim back. */
export const HELD_PREFIX = 'Held today: '
export const ATTESTED_PREFIX = 'Attested by the Owner: '
export const ENTITY_PREFIX = 'Legal entity: '
export const NOT_HELD_PREFIX = 'Not held yet: '
export const PERSON_ANSWERS = 'A person answers.'

export interface AttestedFact { fact: string; words: string; byName: string; at: Date }
export interface RegistrationFacts {
  /** Company.legalName, entered by the Owner. Null where nobody has entered it. */
  legalName: string | null
  /** The names of certifications held today, by `claimableNames`. */
  held: readonly string[]
  /** What the Owner stands behind today: the newest row per fact, attested yes. */
  attested: readonly AttestedFact[]
}

/** The questions a person pasted: one per line, numbering and bullets taken off, at most 60, each at most 300 characters. */
export function questionLines(text: string | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•–]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+/i, '').replace(/\s+/g, ' ').trim()
    if (line.length < 6) continue
    const clipped = line.length > 300 ? `${line.slice(0, 297)}...` : line
    const k = clipped.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(clipped)
    if (out.length >= 60) break
  }
  return out
}

const ENTITY_Q = /\b(legal (business )?name|legal entity|business name|company name|name of (the )?(firm|company|business)|registered name)\b/i
const KIND_TOKENS: Array<{ kind: (typeof CERTIFICATION_KINDS)[number]; re: RegExp }> = [
  { kind: 'MBE', re: /(?<![\w])MBE(?![\w])/i },
  { kind: 'WBE', re: /(?<![\w])WBE(?![\w])/i },
  { kind: 'EIGHT_A', re: /(?<![\w])8\s?\(a\)/i },
  { kind: 'HUBZONE', re: /(?<![\w])HUB\s?zone(?![\w])/i },
]
const CERT_Q = /\b(certif\w*|accredit\w*)\b/i
const OWNERSHIP_Q = /\b(minority|women|woman|female|veteran|owned|ownership|diverse|diversity)\b/i
const OWNERSHIP_OF: Array<{ fact: string; re: RegExp }> = [
  { fact: 'MINORITY_OWNED', re: /\bminorit\w*/i },
  { fact: 'WOMAN_OWNED', re: /\b(wom[ae]n|female)\b/i },
  { fact: 'VETERAN_OWNED', re: /\bveterans?\b/i },
]

const day = (d: Date) => d.toISOString().slice(0, 10)

export interface DraftedAnswer { question: string; answer: string; basis: 'RECORD' | 'A_PERSON' }

/** One answer for one question, from the record or left to a person. */
export function answerFor(question: string, f: RegistrationFacts): DraftedAnswer {
  const person = (why?: string): DraftedAnswer => ({ question, answer: why ? `${PERSON_ANSWERS} ${why}` : PERSON_ANSWERS, basis: 'A_PERSON' })

  if (ENTITY_Q.test(question)) {
    return f.legalName?.trim()
      ? { question, answer: `${ENTITY_PREFIX}${f.legalName.trim()}`, basis: 'RECORD' }
      : person('The legal entity name is not set. The Owner enters it on the Certifications panel.')
  }

  const named = KIND_TOKENS.filter((t) => t.re.test(question))
  if (named.length > 0 || CERT_Q.test(question)) {
    if (named.length > 0) {
      const heldHere = named.filter((t) => f.held.includes(kindName(t.kind)))
      const notHere = named.filter((t) => !f.held.includes(kindName(t.kind)))
      if (notHere.length === 0) return { question, answer: `${HELD_PREFIX}${heldHere.map((t) => kindName(t.kind)).join(', ')}`, basis: 'RECORD' }
      return { question, answer: `${NOT_HELD_PREFIX}${notHere.map((t) => kindName(t.kind)).join(', ')}. This draft claims no certification the record does not hold.${heldHere.length ? ` ${HELD_PREFIX}${heldHere.map((t) => kindName(t.kind)).join(', ')}` : ''}`, basis: 'RECORD' }
    }
    return f.held.length > 0
      ? { question, answer: `${HELD_PREFIX}${f.held.join(', ')}`, basis: 'RECORD' }
      : { question, answer: 'No certification is held on the record yet. This draft claims none. A person answers.', basis: 'A_PERSON' }
  }

  if (OWNERSHIP_Q.test(question)) {
    const asked = OWNERSHIP_OF.filter((o) => o.re.test(question)).map((o) => o.fact)
    const mine = f.attested.filter((a) => (asked.length === 0 ? true : asked.includes(a.fact)))
    if (mine.length === 0) return person('The Owner has not attested to this on the record, so the draft does not say it.')
    return { question, answer: `${ATTESTED_PREFIX}${mine.map((a) => `${a.words}, attested by ${a.byName} on ${day(a.at)}`).join('; ')}`, basis: 'RECORD' }
  }

  return person()
}

/** The whole drafted text: each question, then its answer on one line that starts "A: ". */
export function draftRegistration(questions: string | null | undefined, f: RegistrationFacts): { text: string; answers: DraftedAnswer[]; nothing: string | null } {
  const qs = questionLines(questions)
  if (qs.length === 0) return { text: '', answers: [], nothing: 'No questions were pasted, so there is nothing to draft yet. Paste the portal’s questions.' }
  const answers = qs.map((q) => answerFor(q, f))
  return { text: answers.map((a, i) => `Q${i + 1}: ${a.question}\nA: ${a.answer}`).join('\n\n'), answers, nothing: null }
}

/**
 * What is wrong with drafted answers, read back against the record as it
 * stands: a claim of a certification not held, an ownership fact not
 * attested, a name other than the Owner's. Empty means none. Pure; the
 * skill's checker and the tests read this one door.
 */
export function registrationProblems(text: string, f: RegistrationFacts): string[] {
  const problems: string[] = []
  const answerLines = text.split(/\r?\n/).filter((l) => l.startsWith('A: ')).map((l) => l.slice(3))
  const attestedWords = new Set(f.attested.map((a) => a.words))
  for (const a of answerLines) {
    // A "Not held yet" sentence names a kind to say it is NOT held; only what follows "Held today:" is a claim.
    const claimed = [...a.matchAll(/Held today: ([^.]*?)(?:$|\.)/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean))
    for (const c of claimed) if (!f.held.includes(c)) problems.push(`It claims ${c}, which the record does not hold today.`)
    if (a.startsWith(ATTESTED_PREFIX)) {
      for (const part of a.slice(ATTESTED_PREFIX.length).split('; ')) {
        const words = part.split(', attested by')[0]
        if (!attestedWords.has(words)) problems.push(`It says "${words}", which the Owner has not attested.`)
      }
    } else if (/\b(minority|woman|women|veteran)[- ]owned\b/i.test(a)) {
      problems.push('It states an ownership fact the Owner has not attested.')
    }
    if (a.startsWith(ENTITY_PREFIX) && a.slice(ENTITY_PREFIX.length).trim() !== (f.legalName ?? '').trim()) problems.push('It names a legal entity other than the one the Owner entered.')
    // A kind named outside a claim line and outside a "Not held yet" sentence is an unsupported claim.
    if (!a.startsWith(HELD_PREFIX) && !a.startsWith(NOT_HELD_PREFIX) && !a.startsWith(ENTITY_PREFIX) && KIND_TOKENS.some((t) => t.re.test(a))) problems.push('It names a certification outside a held or not-held line.')
  }
  return [...new Set(problems)]
}

/** The ledger names for a person's acts on a registration. Only a person's acts are events. */
export const REGISTRATION_EVENTS = {
  started: 'diversity.registration_started',
  edited: 'diversity.registration_edited',
  submitted: 'diversity.registration_submitted_by_person',
  legalEntitySet: 'diversity.legal_entity_set',
} as const

/** What the status says to somebody who has not seen Etyme before. */
export function registrationSays(status: string): string {
  switch (status) {
    case 'NOT_STARTED': return 'Not started'
    case 'DRAFTED': return 'Drafted, not yet submitted'
    case 'SUBMITTED': return 'Submitted on the portal'
    default: return status
  }
}
