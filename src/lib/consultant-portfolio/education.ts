/**
 * The résumé's own education lines, kept on the person's profile.
 *
 * Decided by the founder, 2026-11-03 ("A degree is read, not just held"):
 * a degree on file is checked against what the person's own résumé says,
 * so the résumé's education has to be data, not text nobody reads. This
 * file is the one reader and writer of `ConsultantProfile.education`'s
 * shape; lib/cv-reader reads the lines off a résumé by rules.
 *
 * Three things it holds to:
 *
 *  - **Null is "never read"; an empty list is "read, names none".** A
 *    résumé with no education section writes `[]`, so a rule reading
 *    this can say "the résumé names no degree" only where that is true.
 *  - **It is what the résumé says, never a verdict.** Every line carries
 *    the quote it came from. A provider verifies a degree; this is the
 *    claim the degree is checked against.
 *  - **The person corrects it; a firm never edits it.** A correction is
 *    kept as source PERSON with the person's own sentence as the quote,
 *    the way setup answers are. A firm reads the lines and has no door
 *    to change them (`mayCorrectEducation`).
 *
 * Pure: no database here. The write is in `education-write`.
 */

import type { EducationLine } from '@/lib/cv-reader'

export type EducationSource = 'RESUME' | 'PERSON'

/** One stored line: the résumé's shape, plus where it came from. */
export interface EducationEntry extends EducationLine {
  /** RESUME where it was read off a résumé; PERSON where the person said it. Absent reads as RESUME. */
  source?: EducationSource
  /** For a PERSON line that corrects a résumé line: the résumé line's quote it stands in for. */
  corrects?: string | null
  /** When the person said it, as an ISO day. */
  saidOn?: string | null
}

const FIELDS = ['institution', 'qualification', 'fieldOfStudy'] as const

/** The earliest graduation year a line may carry, the cv-reader's own floor. */
export const EARLIEST_YEAR = 1940

/**
 * Read the stored column back, safely.
 *
 * Null stays null (never read). Anything that is not a list of lines is
 * read as never read too, rather than as "names none", because a column
 * nobody can read says nothing about the résumé.
 */
export function educationOf(stored: unknown): EducationEntry[] | null {
  if (stored === null || stored === undefined || !Array.isArray(stored)) return null
  const out: EducationEntry[] = []
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.quote !== 'string' || !r.quote.trim()) continue
    out.push({
      institution: str(r.institution),
      qualification: str(r.qualification),
      fieldOfStudy: str(r.fieldOfStudy),
      year: typeof r.year === 'number' && Number.isInteger(r.year) ? r.year : null,
      quote: r.quote,
      source: r.source === 'PERSON' ? 'PERSON' : 'RESUME',
      corrects: str(r.corrects),
      saidOn: str(r.saidOn),
    })
  }
  return out
}

/**
 * What a new résumé leaves on the profile.
 *
 * The résumé's lines are replaced whole by the newer résumé's, because a
 * later résumé is the person's later account of themselves. What the
 * person said themselves is kept: their own words win over anything read
 * for them, the same rule as their headline. Where the person corrected a
 * résumé line and the new résumé still says that same line word for word,
 * the correction stands in its place rather than the old line returning.
 */
export function educationAfterResume(
  stored: unknown,
  read: EducationLine[]
): EducationEntry[] {
  const theirs = (educationOf(stored) ?? []).filter((e) => e.source === 'PERSON')
  const corrected = new Set(theirs.map((e) => e.corrects).filter((q): q is string => !!q))
  const fromResume: EducationEntry[] = read
    .filter((l) => !corrected.has(l.quote))
    .map((l) => ({
      institution: l.institution,
      qualification: l.qualification,
      fieldOfStudy: l.fieldOfStudy,
      year: l.year,
      quote: l.quote,
      source: 'RESUME' as const,
    }))
  return [...fromResume, ...theirs]
}

/** Who may change the lines: the person, and nobody else. */
export function mayCorrectEducation(who: { callerPersonId: string; profilePersonId: string }):
  | { ok: true }
  | { ok: false; says: string } {
  return who.callerPersonId === who.profilePersonId
    ? { ok: true }
    : {
        ok: false,
        says:
          'Education is what the person’s own résumé says, and only they correct it. ' +
          'Ask them to change it on their own page.',
      }
}

export interface EducationCorrection {
  /** The line being corrected, by its place in the list; absent to add a line the résumé missed. */
  index?: number
  institution?: string | null
  qualification?: string | null
  fieldOfStudy?: string | null
  year?: number | null
  /** The person's own sentence. Kept as the quote. */
  sentence: string
}

/** Read a correction off a request body, refusing in a sentence. */
export function readEducationCorrection(body: unknown):
  | { ok: true; correction: EducationCorrection }
  | { ok: false; says: string; field: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, says: 'Say which line and what it should read.', field: 'education' }
  }
  const b = body as Record<string, unknown>
  const sentence = typeof b.sentence === 'string' ? b.sentence.trim() : ''
  if (sentence.length < 4) {
    return {
      ok: false,
      says: 'Say the correction in your own words, for example “I finished in 2013, not 2012.” It is kept beside the line.',
      field: 'sentence',
    }
  }
  if (sentence.length > 300) {
    return { ok: false, says: 'Keep it to a sentence or two.', field: 'sentence' }
  }
  let index: number | undefined
  if (b.index !== undefined && b.index !== null) {
    if (typeof b.index !== 'number' || !Number.isInteger(b.index) || b.index < 0) {
      return { ok: false, says: 'That line is not on your list.', field: 'index' }
    }
    index = b.index
  }
  let year: number | null | undefined
  if (b.year !== undefined) {
    if (b.year === null || b.year === '') year = null
    else {
      const y = Number(b.year)
      if (!Number.isInteger(y)) return { ok: false, says: 'A year is four digits, like 2012.', field: 'year' }
      year = y
    }
  }
  const correction: EducationCorrection = { sentence, ...(index !== undefined ? { index } : {}), ...(year !== undefined ? { year } : {}) }
  for (const f of FIELDS) {
    if (b[f] === undefined) continue
    if (b[f] !== null && typeof b[f] !== 'string') {
      return { ok: false, says: 'Type it as words.', field: f }
    }
    const v = typeof b[f] === 'string' ? (b[f] as string).trim().slice(0, 160) : null
    correction[f] = v ? v : null
  }
  return { ok: true, correction }
}

/**
 * Apply the person's correction.
 *
 * The corrected line becomes source PERSON, quoted in their own sentence,
 * and remembers the résumé line it stands in for. A year after this year
 * or before 1940 is refused: it is a claim about a degree already earned.
 */
export function correctEducation(
  stored: unknown,
  correction: EducationCorrection,
  now: Date
): { ok: true; education: EducationEntry[]; says: string } | { ok: false; says: string; field: string } {
  const list = educationOf(stored) ?? []
  const thisYear = now.getUTCFullYear()
  if (correction.year != null && (correction.year < EARLIEST_YEAR || correction.year > thisYear)) {
    return {
      ok: false,
      says: `A year of graduation reads between ${EARLIEST_YEAR} and ${thisYear}.`,
      field: 'year',
    }
  }

  const base: EducationEntry | null =
    correction.index === undefined ? null : list[correction.index] ?? null
  if (correction.index !== undefined && !base) {
    return { ok: false, says: 'That line is not on your list.', field: 'index' }
  }

  const pick = <K extends 'institution' | 'qualification' | 'fieldOfStudy' | 'year'>(k: K) =>
    (correction[k] !== undefined ? correction[k] : base?.[k] ?? null) as EducationEntry[K]

  const line: EducationEntry = {
    institution: pick('institution'),
    qualification: pick('qualification'),
    fieldOfStudy: pick('fieldOfStudy'),
    year: pick('year'),
    quote: correction.sentence,
    source: 'PERSON',
    // A correction of a correction still stands in for the résumé's line.
    corrects: base ? (base.source === 'PERSON' ? base.corrects ?? null : base.quote) : null,
    saidOn: now.toISOString().slice(0, 10),
  }

  if (!line.institution && !line.qualification && !line.fieldOfStudy && line.year === null) {
    return { ok: false, says: 'Say at least the school, the degree or the year.', field: 'education' }
  }

  const education = base
    ? list.map((e, i) => (i === correction.index ? line : e))
    : [...list, line]
  return { ok: true, education, says: base ? 'Your education line reads as you said it.' : 'Added to your education.' }
}

/** One line as a screen shows it: the words, and where they came from. */
export interface EducationShown {
  says: string
  quote: string
  from: string
  source: EducationSource
  institution: string | null
  qualification: string | null
  fieldOfStudy: string | null
  year: number | null
}

/**
 * The lines as a screen reads them, never as a verdict.
 *
 * `null` from here means the résumé was never read for education, and
 * the screen says so; an empty list means it was read and named none.
 */
export function educationShown(stored: unknown, reader: 'PERSON' | 'FIRM'): EducationShown[] | null {
  const list = educationOf(stored)
  if (list === null) return null
  return list.map((e) => {
    const degree = [e.qualification, e.fieldOfStudy && `in ${e.fieldOfStudy}`].filter(Boolean).join(' ')
    const parts = [degree || null, e.institution, e.year !== null ? String(e.year) : null].filter(Boolean)
    const source = e.source ?? 'RESUME'
    return {
      says: parts.length > 0 ? parts.join(', ') : 'The résumé names this, and it could not be read into parts.',
      quote: e.quote,
      from:
        source === 'PERSON'
          ? reader === 'PERSON' ? 'You said' : 'They said'
          : 'From the résumé',
      source,
      institution: e.institution,
      qualification: e.qualification,
      fieldOfStudy: e.fieldOfStudy,
      year: e.year,
    }
  })
}

/** The sentence under the heading, when there are no lines to show. */
export function educationEmptySays(shown: EducationShown[] | null, reader: 'PERSON' | 'FIRM'): string | null {
  if (shown === null) {
    return reader === 'PERSON'
      ? 'Your résumé has not been read for education yet. Paste it or upload it as plain text and it is read here.'
      : 'Their résumé has not been read for education yet.'
  }
  if (shown.length === 0) {
    return reader === 'PERSON' ? 'Your résumé names no education. Add a line if it should.' : 'Their résumé names no education.'
  }
  return null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
